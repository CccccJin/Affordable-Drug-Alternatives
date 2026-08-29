"""Chemical structures for Orange Book ingredients, and the retrieval index.

Two things live here because they share one resource:

* **Structure resolution** — Orange Book ingredient names carry salt forms
  ("ATORVASTATIN CALCIUM"), while ChEMBL synonyms usually name the base moiety
  ("atorvastatin"). Matching needs an explicit salt-stripping step.
* **Morgan fingerprints** — used both to *build* the Tanimoto-similar negative
  tier and to serve as the layer-1 retrieval index.

Neither is fitted to anything, so building this before or after the evaluation
split cannot leak labels. The split still precedes index construction, because
the instruction is worth honouring literally.
"""
from __future__ import annotations

import csv
import pickle
import re
import sqlite3
import sys
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"
CHEMBL_CSV = Path(__file__).resolve().parents[2] / "chembl_export.csv"
STRUCT_PKL = CACHE / "structures.pkl"

#: Salt / ester / hydrate words appended to an active moiety in the Orange Book.
#: Stripping these is what lets "ATORVASTATIN CALCIUM" meet ChEMBL's "atorvastatin".
SALT_WORDS = {
    "HYDROCHLORIDE", "HCL", "SODIUM", "POTASSIUM", "CALCIUM", "MAGNESIUM",
    "SULFATE", "SULPHATE", "PHOSPHATE", "MALEATE", "TARTRATE", "BITARTRATE",
    "SUCCINATE", "FUMARATE", "CITRATE", "ACETATE", "MESYLATE", "MESILATE",
    "BESYLATE", "BESILATE", "TOSYLATE", "NITRATE", "BROMIDE", "CHLORIDE",
    "IODIDE", "LACTATE", "GLUCONATE", "STEARATE", "PALMITATE", "PAMOATE",
    "DIHYDRATE", "MONOHYDRATE", "TRIHYDRATE", "HYDRATE", "ANHYDROUS",
    "MONOHYDROCHLORIDE", "DIHYDROCHLORIDE", "HYDROBROMIDE", "OXALATE",
    "TRIFLUTATE", "XINAFOATE", "PROPIONATE", "VALERATE", "DIPROPIONATE",
    "FUROATE", "MEDOXOMIL", "AXETIL", "ETEXILATE", "ARGININE", "MEGLUMINE",
    "TROMETHAMINE", "OLAMINE", "DISODIUM", "MONOSODIUM", "DIPOTASSIUM",
    "HEMIHYDRATE", "SESQUIHYDRATE", "MALATE", "ADIPATE", "BENZOATE",
    "SALICYLATE", "ASPARTATE", "SACCHARATE", "EDISYLATE", "NAPSYLATE",
    "EMBONATE", "ISETHIONATE", "LAURYL", "DIFUMARATE", "HEMIFUMARATE",
    "BISULFATE", "TRISODIUM", "CARBONATE", "DIPHOSPHATE", "DIMEGLUMINE",
    "METHYLSULFATE", "CAMSYLATE", "GLUCEPTATE", "HYDROIODIDE", "SULFOSALICYLATE",
}

#: Deliberately NOT stripped. These are covalent esters and ketals, not
#: counterions: haloperidol decanoate and triamcinolone acetonide are distinct
#: molecular entities with their own pharmacokinetics, and collapsing them onto
#: the parent would assert a chemical identity that does not hold.
KEPT_ESTERS = {"DECANOATE", "CYPIONATE", "PIVALATE", "ACETONIDE", "DIACETATE",
               "PHENYLBUTYRATE", "ENANTHATE", "UNDECYLENATE"}
_NOISE = re.compile(r"[^A-Z0-9 ]+")


def norm_name(name: str | None) -> str:
    if not name:
        return ""
    return " ".join(_NOISE.sub(" ", name.upper()).split())


def base_moiety(name: str | None) -> str:
    """Drop trailing salt/hydrate words to reach the active moiety."""
    tokens = norm_name(name).split()
    while len(tokens) > 1 and tokens[-1] in SALT_WORDS:
        tokens.pop()
    return " ".join(tokens)


def orange_book_ingredients(conn) -> dict[str, dict]:
    """Distinct single-ingredient Orange Book actives, with their product counts."""
    out: dict[str, dict] = {}
    for r in conn.execute(
        "SELECT ingredient, ingredient_key, COUNT(*) n FROM ob_product "
        "GROUP BY ingredient_key"
    ):
        name = r["ingredient"]
        if ";" in name:
            continue                       # combination product: handled separately
        out[r["ingredient_key"]] = {
            "ingredient": name,
            "ingredient_key": r["ingredient_key"],
            "base": base_moiety(name),
            "n_products": r["n"],
        }
    return out


def resolve_smiles(ingredients: dict[str, dict], csv_path: Path | None = None) -> dict[str, str]:
    """Match ingredient names to ChEMBL canonical SMILES through synonyms.

    Two passes, most specific first: the full Orange Book name, then the base
    moiety with salt words removed. Where several ChEMBL entries share a
    synonym the shortest SMILES wins, which reliably prefers the parent
    molecule over a salt or a formulated complex.
    """
    csv_path = csv_path or CHEMBL_CSV
    wanted_full = {v["ingredient_key"]: k for k, v in
                   ((v["ingredient_key"], v) for v in ingredients.values())}
    by_full = {norm_name(v["ingredient"]): k for k, v in ingredients.items()}
    by_base = {}
    for k, v in ingredients.items():
        by_base.setdefault(v["base"], k)

    hits_full: dict[str, str] = {}
    hits_base: dict[str, str] = {}
    csv.field_size_limit(10 ** 7)
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            syns = row["molecule_synonyms"]
            if not syns:
                continue
            smiles = row["canonical_smiles"]
            if not smiles or "." in smiles and len(smiles) > 250:
                continue
            for syn in syns.split(";"):
                n = norm_name(syn)
                if not n:
                    continue
                key = by_full.get(n)
                if key and (key not in hits_full or len(smiles) < len(hits_full[key])):
                    hits_full[key] = smiles
                key = by_base.get(n)
                if key and (key not in hits_base or len(smiles) < len(hits_base[key])):
                    hits_base[key] = smiles
    resolved = dict(hits_base)
    resolved.update(hits_full)            # full-name match overrides base match
    return resolved


def active_moiety(smiles: str):
    """Reduce a SMILES to its active moiety by discarding counterions.

    ChEMBL stores "ATORVASTATIN CALCIUM" as the 2:1 calcium salt and
    "METOPROLOL SUCCINATE" with its succinate counterion. Fingerprinting those
    verbatim lets the counterion contribute bits, so metoprolol succinate and
    metoprolol tartrate score 0.83 against each other instead of 1.0 despite
    sharing an identical active moiety. Keeping only the largest organic
    fragment is what makes a Tanimoto comparison mean what it should.
    """
    from rdkit import Chem
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    frags = Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=False)
    if len(frags) > 1:
        # Largest by heavy-atom count, preferring fragments containing carbon.
        organic = [f for f in frags if any(a.GetSymbol() == "C" for a in f.GetAtoms())]
        mol = max(organic or frags, key=lambda f: f.GetNumHeavyAtoms())
    return mol


def build_fingerprints(smiles_by_key: dict[str, str]):
    """Morgan fingerprints (radius 2, 2048 bits) over active moieties."""
    from rdkit import Chem, RDLogger
    from rdkit.Chem import rdFingerprintGenerator
    RDLogger.DisableLog("rdApp.*")

    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    fps, parents, failed = {}, {}, []
    for key, smi in smiles_by_key.items():
        mol = active_moiety(smi)
        if mol is None:
            failed.append(key)
            continue
        try:
            Chem.SanitizeMol(mol)
            parents[key] = Chem.MolToSmiles(mol)
            fps[key] = gen.GetFingerprint(mol)
        except Exception:
            failed.append(key)
    return fps, parents, failed


def build(force: bool = False):
    """Resolve structures and fingerprints; cache to disk."""
    if STRUCT_PKL.exists() and not force:
        with STRUCT_PKL.open("rb") as fh:
            return pickle.load(fh)

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    ing = orange_book_ingredients(conn)
    print(f"  {len(ing):,} single-ingredient Orange Book actives", flush=True)
    print("  scanning ChEMBL export for synonym matches (~40s) ...", flush=True)
    smiles = resolve_smiles(ing)
    print(f"  resolved SMILES for {len(smiles):,} "
          f"({len(smiles) / len(ing) * 100:.1f}%)", flush=True)
    fps, parents, failed = build_fingerprints(smiles)
    print(f"  fingerprints for {len(fps):,} active moieties "
          f"({len(failed)} unparseable)", flush=True)

    payload = {"ingredients": ing, "smiles": smiles, "parents": parents,
               "fps": fps, "failed": failed}
    STRUCT_PKL.parent.mkdir(parents=True, exist_ok=True)
    with STRUCT_PKL.open("wb") as fh:
        pickle.dump(payload, fh)
    return payload


def tanimoto(fp_a, fp_b) -> float:
    from rdkit import DataStructs
    return DataStructs.TanimotoSimilarity(fp_a, fp_b)


if __name__ == "__main__":
    p = build(force="--force" in sys.argv)
    print(f"\ncached to {STRUCT_PKL}")
