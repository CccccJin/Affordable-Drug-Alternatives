#!/usr/bin/env python3
"""Choose the compounds the static site ships, and compute their descriptors.

The previous subset was "the 5,000 lowest-numbered ChEMBL IDs", which is an
arbitrary slice of a database that is overwhelmingly unnamed research
compounds. It left 489 of 5,000 reachable by the substitutability layer and
made a search for most real drugs come back empty.

The boundary here is a property of the data rather than a round number: **every
compound ChEMBL carries a synonym for**. Of 2.47M rows, 2.39M have no name at
all — they are screening entries, not drugs, and nobody searches for them by
name. The ~85k that are named are the ones a person might plausibly type.

Within that, ordering puts anything the FDA layers can adjudicate first, so a
size cap (if one is ever wanted) trims research chemicals rather than drugs.

    python select_demo_compounds.py                    # every named compound
    python select_demo_compounds.py --limit 50000      # cap the total

Writes compounds.json (short wire keys — see `staticSearchApi.ts`) and
metadata.json. Run `export_demo_fingerprints.py` afterwards to rebuild
fingerprints.bin against the new selection; the two files are indexed together
and `tests/test_demo_fingerprints.py` fails if they drift apart.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, Lipinski, rdMolDescriptors

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "chembl_export.csv"
DATA = ROOT / "frontend" / "public" / "data"

#: Short keys, matching the convention substitutability.json already uses: at
#: ~85k records the field names alone would be about 10 MB of the payload.
WIRE = {
    "chembl_id": "id", "pref_name": "n", "smiles": "s",
    "molecular_weight": "mw", "logp": "lp", "polar_surface_area": "psa",
    "h_bond_donors": "hbd", "h_bond_acceptors": "hba",
    "rotatable_bonds": "rtb", "aromatic_rings": "ar",
    "heavy_atoms": "ha", "cns_mpo": "cns",
}


def normalise(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().upper())


def adjudicable_names() -> set[str]:
    """Every name the Orange Book or Purple Book exports can answer for."""
    names: set[str] = set()
    for filename in ("substitutability.json", "biologics.json"):
        path = DATA / filename
        if path.exists():
            names |= set(json.loads(path.read_text(encoding="utf-8"))["name_index"])
    return names


def descriptors(mol) -> dict:
    """The properties the frontend filters and charts on."""
    return {
        "molecular_weight": round(Descriptors.MolWt(mol), 3),
        "logp": round(Crippen.MolLogP(mol), 3),
        "polar_surface_area": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "h_bond_donors": Lipinski.NumHDonors(mol),
        "h_bond_acceptors": Lipinski.NumHAcceptors(mol),
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
    }


def select(limit: int | None = None, source: Path = SOURCE) -> list[dict]:
    RDLogger.DisableLog("rdApp.*")
    csv.field_size_limit(sys.maxsize)
    adjudicable = adjudicable_names()

    tier1, tier2 = [], []
    with source.open() as handle:
        for row in csv.DictReader(handle):
            smiles = (row["canonical_smiles"] or "").strip()
            if not smiles:
                continue
            synonyms = [s.strip() for s in (row["molecule_synonyms"] or "").split(";")
                        if s.strip()]
            if not synonyms:
                continue  # unnamed screening entry

            # Dedupe while keeping order: ChEMBL repeats synonyms freely.
            seen, unique = set(), []
            for synonym in synonyms:
                key = normalise(synonym)
                if key not in seen:
                    seen.add(key)
                    unique.append(key)

            # Prefer a synonym the FDA layers can adjudicate as the display
            # name. ChEMBL's synonym order is arbitrary and often puts a
            # development code first ("SB-203580"), and the frontend matches
            # substitutability on this one field — so choosing the wrong
            # synonym selects a compound for its coverage and then hides it.
            matches = [name for name in unique if name in adjudicable]
            record = {"chembl_id": row["molecule_chembl_id"],
                      "pref_name": matches[0] if matches else unique[0],
                      "smiles": smiles}
            (tier1 if matches else tier2).append(record)

    selected = tier1 + tier2
    if limit is not None:
        selected = selected[:limit]

    out = []
    rejected = 0
    for record in selected:
        mol = Chem.MolFromSmiles(record["smiles"])
        if mol is None:
            rejected += 1
            continue
        record.update(descriptors(mol))
        # cns_mpo needs data this export does not carry; the frontend treats it
        # as optional, so it is omitted rather than invented.
        out.append(record)

    print(f"  named compounds: {len(tier1) + len(tier2):,} "
          f"({len(tier1):,} reach an FDA equivalence group)")
    print(f"  selected {len(out):,}, {rejected:,} unparseable")
    return out


#: Identity, and the only fields a search or a result card reads.
CORE_KEYS = ("chembl_id", "pref_name", "smiles")

#: RDKit descriptors. Split into their own file because they are 43% of the
#: payload and the search path never touches them: they are read by the
#: property filters, the Analytics charts and the details dialog, none of which
#: a visitor reaches before their first result. Written row-aligned with
#: compounds.json — index i in one is index i in the other — because repeating
#: nine key names across 84,818 records costs 0.26 MB gzipped on its own.
DESCRIPTOR_KEYS = ("molecular_weight", "logp", "polar_surface_area",
                   "h_bond_donors", "h_bond_acceptors", "rotatable_bonds",
                   "aromatic_rings", "heavy_atoms", "cns_mpo")


def write(compounds: list[dict]) -> None:
    core = [{WIRE[k]: c.get(k) for k in CORE_KEYS} for c in compounds]
    out = DATA / "compounds.json"
    out.write_text(json.dumps(core, separators=(",", ":")), encoding="utf-8")

    rows = [[c.get(k) for k in DESCRIPTOR_KEYS] for c in compounds]
    desc_out = DATA / "descriptors.json"
    desc_out.write_text(
        json.dumps({"fields": [WIRE[k] for k in DESCRIPTOR_KEYS], "rows": rows},
                   separators=(",", ":")),
        encoding="utf-8")

    metadata = json.loads((DATA / "metadata.json").read_text(encoding="utf-8"))
    metadata["source"] = "ChEMBL 35 export (chembl_export.csv)"
    metadata["records"] = len(compounds)
    metadata["fields"] = [WIRE[k] for k in CORE_KEYS]
    metadata["field_names"] = WIRE
    metadata["descriptors"] = {
        "file": "descriptors.json",
        "fields": [WIRE[k] for k in DESCRIPTOR_KEYS],
        "records": len(compounds),
        "note": ("Row-aligned with compounds.json: rows[i] describes "
                 "compounds[i]. Loaded only when something needs a descriptor."),
    }
    metadata["selection"] = (
        "Every ChEMBL compound carrying a synonym, ordered so that anything the "
        "FDA Orange/Purple Book exports can adjudicate comes first. The 2.39M "
        "unnamed screening entries are excluded: nobody searches for them by name."
    )
    metadata["generated"] = date.today().isoformat()
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n",
                                        encoding="utf-8")

    import gzip
    for path in (out, desc_out):
        raw = path.stat().st_size
        gz = len(gzip.compress(path.read_bytes(), 6))
        print(f"  wrote {path.name}: {raw / 1e6:.1f} MB raw, {gz / 1e6:.1f} MB gzipped")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--limit", type=int, default=None,
                        help="cap the number of compounds (default: all named)")
    parser.add_argument("--source", type=Path, default=SOURCE)
    args = parser.parse_args(argv)

    if not args.source.exists():
        print(f"Source not found: {args.source}", file=sys.stderr)
        return 1

    write(select(args.limit, args.source))
    print("\nNow run: python export_demo_fingerprints.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
