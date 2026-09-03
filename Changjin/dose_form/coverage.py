"""Vocabulary coverage against the real Orange Book, not the labelled set.

    python -m dose_form.coverage

The evaluation set is written by the same person who wrote the rules, so 100%
there measures self-consistency. This measures something else: of the distinct
dose form strings the Orange Book actually contains, how many does the
vocabulary recognise. It was 86.8% when first run, which is how the 40 missing
forms — enema, pastille, intrauterine device, drug-eluting contact lens — were
found at all.
"""
from __future__ import annotations

import sqlite3
import sys
from collections import Counter
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dose_form.facets import normalize_dose_form

DB = Path(__file__).resolve().parents[1] / "subst_data" / "cache" / "substitutability.sqlite"


def distinct_strings(db: Path | None = None) -> list[str]:
    path = Path(db or DB)
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return [r[0] for r in conn.execute(
            "SELECT DISTINCT df_route FROM ob_product WHERE df_route IS NOT NULL")]
    finally:
        conn.close()


def measure(strings: list[str]) -> dict:
    filled: Counter[str] = Counter()
    unrecognised: list[str] = []
    for raw in strings:
        facets = normalize_dose_form(raw, "orange_book")
        if facets.basic_dose_form is None:
            unrecognised.append(raw)
        for name, value in facets.facet_items():
            if value is not None:
                filled[name] += 1
    return {
        "total": len(strings),
        "filled": dict(filled),
        "unrecognised": sorted(unrecognised),
    }


def main() -> int:
    if not DB.exists():
        print(f"{DB} not present; run the substitutability build first")
        return 1
    strings = distinct_strings()
    result = measure(strings)
    total = result["total"]
    print(f"{total} distinct dose form strings in the Orange Book\n")
    for facet, n in sorted(result["filled"].items(), key=lambda kv: -kv[1]):
        print(f"  {facet:24} {100 * n / total:5.1f}%  ({n})")
    missing = result["unrecognised"]
    print(f"\n  unrecognised basic dose form: {len(missing)}")
    for raw in missing:
        print(f"    {raw}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
