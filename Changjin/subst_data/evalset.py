"""Build the labelled evaluation set, and split it before any index is built.

Ground truth comes from the Orange Book's own therapeutic-equivalence codes.

**What this can and cannot measure.** The adjudicator *reads* TE codes rather
than predicting them, so a positive pair is not a hidden label the system has to
infer. What the layer-2 metrics actually test is the identifier chain --
RXCUI to NDC to application number to TE code -- together with the strength
matching and the ``AB<n>`` subgroup logic. Those are the real failure modes, and
they are what a wrong answer here would come from. The numbers should be read as
plumbing correctness, never as classification skill on an unseen concept.

Four strata, reported separately because they are not equally hard:

============  ==========================================================
positive      same RLD group, intersecting ``AB*`` codes, NDA vs ANDA
hard neg      same WHO ATC level-4 subgroup, different active ingredient
medium neg    Morgan/Tanimoto >= 0.7, not therapeutically equivalent
easy neg      random pairing
============  ==========================================================

The dev/test split is by **active moiety**, assigned from a hash of the
ingredient name, so no ingredient can appear on both sides and a pair can never
straddle the split. It is written to disk with a manifest hash before the
retrieval index is constructed.
"""
from __future__ import annotations

import hashlib
import json
import pickle
import random
import sqlite3
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"
EVALSET_JSON = CACHE / "evalset.json"

TANIMOTO_MEDIUM = 0.70          # the brief's threshold for "structurally similar"
TARGET_POSITIVES = 500
TEST_FRACTION = 0.70            # ingredients held out for reporting
SPLIT_SALT = "substitutability-eval-v1"


@dataclass
class Pair:
    stratum: str                # positive | hard_negative | medium_negative | easy_negative
    label: int                  # 1 substitutable (grade A expected), 0 not
    rxcui_a: str
    rxcui_b: str
    appl_a: str
    appl_b: str
    ingredient_a: str
    ingredient_b: str
    split: str = ""
    strength_a: str = ""
    strength_b: str = ""
    te_a: str = ""
    te_b: str = ""
    tanimoto: float | None = None
    shared_atc4: str | None = None
    note: str = ""


def split_for(ingredient_key: str) -> str:
    """Deterministic per-ingredient assignment; no pair can straddle the split."""
    h = hashlib.sha256((SPLIT_SALT + "|" + ingredient_key).encode()).hexdigest()
    return "test" if (int(h[:8], 16) / 0xFFFFFFFF) < TEST_FRACTION else "dev"


class Builder:
    def __init__(self, db_path: Path | None = None, seed: int = 20260829):
        self.conn = sqlite3.connect(f"file:{db_path or DB_PATH}?mode=ro", uri=True)
        self.conn.row_factory = sqlite3.Row
        self.rng = random.Random(seed)
        self.seed = seed
        self._rx_cache: dict[tuple, list[str]] = {}
        self._strength_cache: dict[str, frozenset | None] = {}
        self._df_cache: dict[str, tuple] = {}
        from . import rxnav
        self.backend = rxnav.get_backend()
        self.attrition: dict[str, int] = {}

    # -- helpers -----------------------------------------------------------
    def rxcuis(self, appl_no: str, strength_key: str,
               dosage_form: str | None = None) -> list[str]:
        """RXCUIs for one application whose own strength matches ``strength_key``.

        Two filters, and both are needed. The NDC listing is a cheap prefilter,
        but ``openfda.rxcui`` is an SPL-level annotation: one label covering a
        15 MG and a 30 MG presentation lists both concepts against both NDCs, so
        an NDC-derived match alone will happily return the 15 MG concept for a
        30 MG product. RxNorm's own ``SCDC`` is authoritative for what a concept
        actually is, so it confirms every candidate. This is the same rule the
        adjudicator uses to pin strength.
        """
        key = (appl_no, strength_key, dosage_form)
        if key in self._rx_cache:
            return self._rx_cache[key]
        from .grade import parse_strength
        want = parse_strength(strength_key)
        rows = self.conn.execute(
            "SELECT DISTINCT m.rxcui, p.active_ingredients FROM map_rxcui_appl m "
            "JOIN ndc_product p ON p.ndc9 = m.ndc9 "
            "WHERE m.appl_no = ? AND m.in_orange_book = 1", (appl_no,)).fetchall()
        exact = []
        for r in rows:
            ings = json.loads(r["active_ingredients"] or "[]")
            got = frozenset().union(
                *(parse_strength(i.get("strength")) for i in ings)) if ings else frozenset()
            if want and got and (got & want):
                exact.append(r["rxcui"])
        # No fallback to "any RXCUI for this application". An application covers
        # every strength it was approved for, so an unmatched fallback labels a
        # 30 MG product with the 15 MG concept -- the adjudicator then correctly
        # answers about 15 MG and the pair scores as a failure. That is label
        # noise masquerading as a pipeline bug, so an unmatchable product is
        # dropped from the evaluation set instead.
        confirmed = []
        for rxcui in sorted(set(exact)):
            got = self._rxnorm_strength(rxcui)
            if got is None:            # RxNorm silent: cannot confirm, so exclude
                continue
            if not (want and got and (got & want)):
                continue
            # Same argument as strength: one RXCUI's NDC set can span several
            # applications, and lansoprazole 30 MG spans a delayed-release
            # capsule and an orally disintegrating tablet. Confirm the form too.
            if dosage_form is not None:
                from .grade import dose_form_compatible
                if not dose_form_compatible(self._rxnorm_dose_forms(rxcui), dosage_form):
                    continue
            confirmed.append(rxcui)
        self._rx_cache[key] = confirmed
        return confirmed

    def _rxnorm_dose_forms(self, rxcui: str):
        if rxcui in self._df_cache:
            return self._df_cache[rxcui]
        payload = self.backend._get(f"rxcui/{rxcui}/related.json", tty="DF")
        names = tuple(c["name"]
                      for g in ((payload.get("relatedGroup") or {}).get("conceptGroup") or [])
                      if g.get("tty") == "DF"
                      for c in (g.get("conceptProperties") or []))
        self._df_cache[rxcui] = names
        return names

    def _rxnorm_strength(self, rxcui: str):
        """Parsed strength from RxNorm's SCDC, or None when RxNorm is silent."""
        if rxcui in self._strength_cache:
            return self._strength_cache[rxcui]
        from .grade import parse_strength
        # Only the SCDC relation is needed here. Going through concept() would
        # additionally fetch NDCs and ATC codes for every candidate, which is
        # several times the network cost for information this check ignores.
        payload = self.backend._get(f"rxcui/{rxcui}/related.json", tty="SCDC")
        names = [c["name"]
                 for g in ((payload.get("relatedGroup") or {}).get("conceptGroup") or [])
                 if g.get("tty") == "SCDC"
                 for c in (g.get("conceptProperties") or [])]
        out = frozenset().union(*(parse_strength(n) for n in names)) if names else None
        self._strength_cache[rxcui] = out
        return out

    def products(self, where: str, args=()) -> list[sqlite3.Row]:
        return self.conn.execute(
            f"SELECT * FROM ob_product WHERE {where}", args).fetchall()

    # -- positives ---------------------------------------------------------
    def positives(self, target: int = TARGET_POSITIVES) -> list[Pair]:
        """AB-equivalent NDA/ANDA pairs, at most one per equivalence group."""
        from .grade import te_subgroups
        groups = self.conn.execute("""
            SELECT ingredient_key, dosage_form, route, strength_key
            FROM ob_product WHERE mkt_type = 'RX' AND te_code LIKE 'AB%'
            GROUP BY ingredient_key, dosage_form, route, strength_key
            HAVING SUM(appl_type = 'N') >= 1 AND SUM(appl_type = 'A') >= 1
        """).fetchall()
        groups = list(groups)
        self.rng.shuffle(groups)

        pairs, seen_ing, dropped = [], {}, 0
        for g in groups:
            if len(pairs) >= target:
                break
            rows = self.products(
                "ingredient_key=? AND dosage_form=? AND route=? AND strength_key=? "
                "AND mkt_type='RX'",
                (g["ingredient_key"], g["dosage_form"], g["route"], g["strength_key"]))
            brands = [r for r in rows if r["appl_type"] == "N" and te_subgroups(r["te_code"])]
            gens = [r for r in rows if r["appl_type"] == "A" and te_subgroups(r["te_code"])]
            if not brands or not gens:
                continue
            # Cap per ingredient so one heavily-genericised molecule cannot
            # dominate the positives.
            if seen_ing.get(g["ingredient_key"], 0) >= 3:
                continue
            made = False
            for b in brands:
                if made:
                    break
                for gen in gens:
                    if not (te_subgroups(b["te_code"]) & te_subgroups(gen["te_code"])):
                        continue
                    ra = self.rxcuis(b["appl_no"], b["strength_key"], b["dosage_form"])
                    rb = self.rxcuis(gen["appl_no"], gen["strength_key"], gen["dosage_form"])
                    if not ra or not rb:
                        self.attrition["pairs_dropped_no_strength_matched_rxcui"] = \
                            self.attrition.get("pairs_dropped_no_strength_matched_rxcui", 0) + 1
                    ra = [x for x in ra if x not in rb]
                    rb = [x for x in rb if x not in ra]
                    if not ra or not rb:
                        dropped += 1
                        continue
                    pairs.append(Pair(
                        stratum="positive", label=1,
                        rxcui_a=ra[0], rxcui_b=rb[0],
                        appl_a=b["appl_no"], appl_b=gen["appl_no"],
                        ingredient_a=g["ingredient_key"], ingredient_b=g["ingredient_key"],
                        strength_a=b["strength"], strength_b=gen["strength"],
                        te_a=b["te_code"], te_b=gen["te_code"],
                        tanimoto=1.0,
                        note=f"{b['trade_name']} vs {gen['trade_name']}"))
                    seen_ing[g["ingredient_key"]] = seen_ing.get(g["ingredient_key"], 0) + 1
                    made = True
                    break
        self.attrition["positive_groups_dropped_no_rxcui"] = dropped
        return pairs

    # -- negatives ---------------------------------------------------------
    def _marketed_by_ingredient(self) -> dict[str, list[sqlite3.Row]]:
        out: dict[str, list[sqlite3.Row]] = {}
        for r in self.products("mkt_type='RX'"):
            out.setdefault(r["ingredient_key"], []).append(r)
        return out

    def _pick(self, rows):
        r = self.rng.choice(rows)
        rx = self.rxcuis(r["appl_no"], r["strength_key"], r["dosage_form"])
        return (r, rx[0]) if rx else (None, None)

    def hard_negatives(self, atc: dict, target: int) -> list[Pair]:
        """Different active ingredient, same WHO ATC level-4 chemical subgroup."""
        by_ing = self._marketed_by_ingredient()
        by_atc4: dict[str, list[str]] = {}
        for key, info in atc.items():
            if key not in by_ing:
                continue
            for g in info.get("atc4") or []:
                by_atc4.setdefault(g, []).append(key)
        usable = {g: v for g, v in by_atc4.items() if len(v) > 1}
        pairs, guard = [], 0
        keys = list(usable)
        while len(pairs) < target and guard < target * 60 and keys:
            guard += 1
            g = self.rng.choice(keys)
            a_key, b_key = self.rng.sample(usable[g], 2)
            ra, rxa = self._pick(by_ing[a_key])
            rb, rxb = self._pick(by_ing[b_key])
            if not (rxa and rxb) or rxa == rxb:
                continue
            pairs.append(Pair(
                stratum="hard_negative", label=0, rxcui_a=rxa, rxcui_b=rxb,
                appl_a=ra["appl_no"], appl_b=rb["appl_no"],
                ingredient_a=a_key, ingredient_b=b_key,
                strength_a=ra["strength"], strength_b=rb["strength"],
                te_a=ra["te_code"], te_b=rb["te_code"], shared_atc4=g,
                note=f"both in ATC {g}"))
        return pairs

    def medium_negatives(self, struct: dict, target: int) -> list[Pair]:
        """Structurally similar (Tanimoto >= 0.7) but not therapeutically equivalent."""
        from rdkit import DataStructs
        by_ing = self._marketed_by_ingredient()
        fps = {k: v for k, v in struct["fps"].items() if k in by_ing}
        keys = sorted(fps)
        # All-pairs Tanimoto over marketed ingredients; cheap at this scale.
        similar: list[tuple[str, str, float]] = []
        for i, ka in enumerate(keys):
            sims = DataStructs.BulkTanimotoSimilarity(
                fps[ka], [fps[k] for k in keys[i + 1:]])
            for off, s in enumerate(sims):
                if s >= TANIMOTO_MEDIUM:
                    similar.append((ka, keys[i + 1 + off], float(s)))
        self.attrition["tanimoto_pairs_found"] = len(similar)
        self.rng.shuffle(similar)

        pairs = []
        for ka, kb, s in similar:
            if len(pairs) >= target:
                break
            ra, rxa = self._pick(by_ing[ka])
            rb, rxb = self._pick(by_ing[kb])
            if not (rxa and rxb) or rxa == rxb:
                continue
            pairs.append(Pair(
                stratum="medium_negative", label=0, rxcui_a=rxa, rxcui_b=rxb,
                appl_a=ra["appl_no"], appl_b=rb["appl_no"],
                ingredient_a=ka, ingredient_b=kb,
                strength_a=ra["strength"], strength_b=rb["strength"],
                te_a=ra["te_code"], te_b=rb["te_code"], tanimoto=round(s, 4),
                note=f"Tanimoto {s:.3f}, different ingredients"))
        return pairs

    def easy_negatives(self, target: int) -> list[Pair]:
        """Random pairs of marketed products from different ingredients."""
        by_ing = self._marketed_by_ingredient()
        keys = list(by_ing)
        pairs, guard = [], 0
        while len(pairs) < target and guard < target * 40:
            guard += 1
            ka, kb = self.rng.sample(keys, 2)
            ra, rxa = self._pick(by_ing[ka])
            rb, rxb = self._pick(by_ing[kb])
            if not (rxa and rxb) or rxa == rxb:
                continue
            pairs.append(Pair(
                stratum="easy_negative", label=0, rxcui_a=rxa, rxcui_b=rxb,
                appl_a=ra["appl_no"], appl_b=rb["appl_no"],
                ingredient_a=ka, ingredient_b=kb,
                strength_a=ra["strength"], strength_b=rb["strength"],
                te_a=ra["te_code"], te_b=rb["te_code"], note="random pairing"))
        return pairs

    # -- assembly ----------------------------------------------------------
    def build(self) -> dict:
        from .structures import build as build_struct
        from .ingredient_atc import build as build_atc

        struct = build_struct()
        atc = build_atc()

        print("  sampling positives ...", flush=True)
        pos = self.positives()
        n = len(pos)
        print(f"    {n} positive pairs", flush=True)
        print("  sampling hard negatives (same ATC level 4) ...", flush=True)
        hard = self.hard_negatives(atc, n)
        print(f"    {len(hard)}", flush=True)
        print("  sampling medium negatives (Tanimoto >= 0.7) ...", flush=True)
        med = self.medium_negatives(struct, n)
        print(f"    {len(med)}", flush=True)
        print("  sampling easy negatives (random) ...", flush=True)
        easy = self.easy_negatives(n)
        print(f"    {len(easy)}", flush=True)

        pairs = pos + hard + med + easy
        for p in pairs:
            sa, sb = split_for(p.ingredient_a), split_for(p.ingredient_b)
            p.split = sa if sa == sb else "cross"

        kept = [p for p in pairs if p.split != "cross"]
        dropped = len(pairs) - len(kept)
        self.attrition["cross_split_pairs_dropped"] = dropped

        payload = {
            "meta": {
                "seed": self.seed,
                "split_salt": SPLIT_SALT,
                "test_fraction": TEST_FRACTION,
                "tanimoto_threshold": TANIMOTO_MEDIUM,
                "attrition": self.attrition,
            },
            "pairs": [asdict(p) for p in kept],
        }
        blob = json.dumps(payload["pairs"], sort_keys=True).encode()
        payload["meta"]["manifest_sha256"] = hashlib.sha256(blob).hexdigest()
        return payload


def build(force: bool = False) -> dict:
    if EVALSET_JSON.exists() and not force:
        return json.loads(EVALSET_JSON.read_text())
    payload = Builder().build()
    EVALSET_JSON.write_text(json.dumps(payload, indent=1))
    return payload


def summarise(payload: dict) -> str:
    import collections
    c = collections.Counter((p["stratum"], p["split"]) for p in payload["pairs"])
    strata = ["positive", "hard_negative", "medium_negative", "easy_negative"]
    lines = [f"{'STRATUM':<18}{'dev':>7}{'test':>7}{'total':>8}"]
    for s in strata:
        d, t = c[(s, "dev")], c[(s, "test")]
        lines.append(f"{s:<18}{d:>7}{t:>7}{d + t:>8}")
    lines.append(f"{'TOTAL':<18}{sum(v for (s, sp), v in c.items() if sp == 'dev'):>7}"
                 f"{sum(v for (s, sp), v in c.items() if sp == 'test'):>7}"
                 f"{len(payload['pairs']):>8}")
    lines.append("")
    lines.append(f"manifest sha256: {payload['meta']['manifest_sha256'][:16]}...")
    lines.append(f"attrition: {payload['meta']['attrition']}")
    return "\n".join(lines)


if __name__ == "__main__":
    p = build(force="--force" in sys.argv)
    print(summarise(p))
    print(f"\nwritten to {EVALSET_JSON}")
