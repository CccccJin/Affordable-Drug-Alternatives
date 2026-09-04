"""Export WHO ATC level-4 classes to the frontend.

This is the grade C layer, and it is the one place in this project where the
data does **not** support an action. Everything else exported here rests on an
FDA finding: an AB rating means a pharmacist may substitute, an
interchangeability determination means the same for a biologic. A shared ATC
level-4 code means only that WHO files two substances under one chemical
subgroup. Atorvastatin and rosuvastatin are both C10AA; they are different
drugs at different doses, and no pharmacist may swap one for the other.

`grade.py` already says this — rule C2 carries the caveat "class members differ
in potency and dosing; this is a therapeutic-interchange decision, not a
substitution". The export exists to put that same relation on the page without
letting it read as the FDA layers do.

Three decisions follow from that, and each is a deliberate omission:

1. **No saving is computed.** The obvious move is to price the class and show
   "switch from A to B and save 90%". That sentence is a treatment
   recommendation. Prices appear only as a per-ingredient range, so the reader
   can see the class is expensive without being handed a switch to make.
2. **No pair is ever singled out.** The class is shown whole. Ranking members
   against one another would imply a preferred alternative.
3. **Route is carried by ATC itself.** The first letter is the anatomical
   group, so S01BA (ophthalmic corticosteroids) and H02AB (systemic
   corticosteroids) are already separate classes rather than one pool of
   steroids.

    python price_compare.py export-atc
"""
from __future__ import annotations

import json
import pickle
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
ATC_PKL = CACHE / "ingredient_atc.pkl"
DB_PATH = CACHE / "substitutability.sqlite"
OUT = (Path(__file__).resolve().parents[1]
       / "frontend" / "public" / "data" / "atc_classes.json")

#: A class of one is not a class; there is nothing to relate the member to.
MIN_MEMBERS = 2


def class_names(codes, backend=None) -> dict[str, str]:
    """Human-readable name per ATC level-4 code, via RxClass.

    Codes are meaningless to a reader — "C10AA" says nothing, "HMG CoA
    reductase inhibitors" says what the class is. Requests go through the same
    on-disk HTTP cache the rest of the RxNav work uses, so a re-run is free and
    an offline run degrades to codes rather than failing.
    """
    from . import rxnav

    backend = backend or rxnav.RxNavREST()
    names: dict[str, str] = {}
    for code in sorted(codes):
        try:
            payload = backend._get("rxclass/class/byId.json", classId=code)
            concepts = ((payload or {})
                        .get("rxclassMinConceptList", {})
                        .get("rxclassMinConcept", []))
            if concepts and concepts[0].get("className"):
                names[code] = concepts[0]["className"]
        except Exception:
            # A missing name costs the reader a label, not the relation.
            continue
    return names


def ingredient_prices(conn) -> dict[str, dict]:
    """Surveyed price range per Orange Book ingredient, in one pricing unit.

    Same rule the spread plot uses: a price per tablet and a price per
    millilitre are not comparable, so each ingredient reports the unit carrying
    the most surveyed products.
    """
    by_unit: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    # Same join `export_frontend.py` uses, so the figures on the two pages
    # cannot disagree: an Orange Book application reaches its surveyed price
    # through the NDC directory.
    for row in conn.execute(
        "SELECT ob.ingredient AS ingredient, n.price_per_unit AS p, "
        "       n.pricing_unit AS u "
        "FROM ob_product ob "
        "JOIN ndc_product np ON np.appl_no = ob.appl_no "
        "JOIN nadac_price n ON n.ndc9 = np.ndc9 "
        "WHERE n.price_per_unit IS NOT NULL AND n.pricing_unit IS NOT NULL"
    ):
        by_unit[row["ingredient"]][row["u"]].append(row["p"])

    out: dict[str, dict] = {}
    for ingredient, units in by_unit.items():
        # Most-surveyed unit wins. A tie is broken alphabetically rather than by
        # `max`, which preferred the later name and so picked ML over EA — for
        # an ingredient with one price of each that put a per-millilitre figure
        # in as an oral product's range. The tie-break is arbitrary either way;
        # what matters is that it is fixed and that the two units never pool.
        unit, prices = max(units.items(), key=lambda kv: (len(kv[1]), -ord(kv[0][0])))
        if not prices:
            continue
        out[ingredient] = {
            "lo": round(min(prices), 5),
            "hi": round(max(prices), 5),
            "u": unit,
            "n": len(prices),
        }
    return out


def build(atc_path: Path | None = None, db_path: Path | None = None,
          backend=None) -> dict:
    records = pickle.loads(Path(atc_path or ATC_PKL).read_bytes())

    members: dict[str, set[str]] = defaultdict(set)
    for ingredient, record in records.items():
        for code in record.get("atc4") or []:
            members[code].add(ingredient)
    classes = {c: ings for c, ings in members.items() if len(ings) >= MIN_MEMBERS}

    prices: dict[str, dict] = {}
    db = Path(db_path or DB_PATH)
    if db.exists():
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            prices = ingredient_prices(conn)
        finally:
            conn.close()

    names = class_names(classes.keys(), backend=backend)

    groups = []
    name_index: dict[str, list[int]] = defaultdict(list)
    for code in sorted(classes):
        ingredients = sorted(classes[code])
        mem = []
        for ingredient in ingredients:
            entry = {"i": ingredient}
            priced = prices.get(ingredient)
            if priced:
                entry.update(lo=priced["lo"], hi=priced["hi"],
                             u=priced["u"], n=priced["n"])
            mem.append(entry)
            name_index[ingredient.upper()].append(len(groups))
        groups.append({
            "c": code,
            "n": names.get(code) or code,
            "mem": mem,
            # How many members CMS prices at all. Printed so a reader can see
            # that a class shown without prices is unsurveyed, not free.
            "np": sum(1 for m in mem if "lo" in m),
        })

    return {
        "meta": {
            "source": "WHO ATC via RxNorm/RxClass",
            "generated": date.today().isoformat(),
            "relation": (
                "Shared WHO ATC level-4 chemical subgroup. This is a "
                "classification, not an FDA equivalence finding. Members differ "
                "in potency and dosing and may not be substituted for one "
                "another."
            ),
            # Every figure behind these counts is NADAC. This module computes
            # no saving, so the count below is "has a surveyed cost at all" --
            # a different measure from the other two exports' "a saving could
            # be computed", which is why it keeps a different name.
            "cost_basis": "acquisition_cost",
            "coverage": {
                # An ATC Class is not an Equivalence Group or a Biologic
                # Family; the three counts may not be added together
                # (`CONTEXT.md`).
                "classes": len(groups),
                "named": sum(1 for g in groups if g["n"] != g["c"]),
                "with_prices": sum(1 for g in groups if g["np"] > 0),
                # Expand step: the basis-qualified name beside the old one.
                "with_acquisition_cost":
                    sum(1 for g in groups if g["np"] > 0),
            },
        },
        "groups": groups,
        "name_index": {k: sorted(set(v)) for k, v in name_index.items()},
    }


def main(output: Path | None = None) -> Path:
    payload = build()
    out = Path(output or OUT)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    cov = payload["meta"]["coverage"]
    print(f"Wrote {out}")
    print(f"  {cov['classes']} ATC level-4 classes, {cov['named']} named, "
          f"{cov['with_prices']} with at least one surveyed price")
    return out


if __name__ == "__main__":
    main()
