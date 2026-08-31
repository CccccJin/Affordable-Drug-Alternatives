#!/usr/bin/env python3
"""Report how old the committed FDA/CMS extracts are.

The frontend warns a *reader* that an extract has aged (`services/api/dataAge.ts`).
This is the other half: it tells the *maintainers*, on a schedule, before anyone
visiting the site has to be told.

It deliberately makes no network call. The upstream cadence is already known --
CMS republishes NADAC weekly, FDA revises the Orange Book monthly and the Purple
Book monthly -- so the age of what is committed is a sufficient trigger on its
own. Checking upstream would add a way for this to fail that has nothing to do
with staleness: a rate limit, a moved endpoint or an FDA outage would either
raise a false alarm or, worse, fail quietly and leave the real staleness
unreported.

    python check_data_freshness.py            # human-readable
    python check_data_freshness.py --github   # emit GitHub Actions outputs

Exits 1 when any extract is past the threshold, so CI can branch on it.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parent / "frontend" / "public" / "data"

#: Thresholds mirror `dataAge.ts`, so the site and the maintainers agree on
#: what counts as stale.
STALE_DAYS = 90

EXTRACTS = [
    ("Orange Book + NADAC", "substitutability.json",
     "python substitutability.py fetch && python substitutability.py build && "
     "python price_compare.py fetch && python price_compare.py build && "
     "python price_compare.py export"),
    ("Purple Book", "biologics.json",
     "python price_compare.py export-biologics"),
]


def age_of(path: Path, today: date) -> tuple[str, int] | None:
    """(generated date, age in days), or None when the file is absent."""
    if not path.exists():
        return None
    generated = json.loads(path.read_text(encoding="utf-8"))["meta"]["generated"]
    return generated, (today - date.fromisoformat(generated)).days


def check(today: date | None = None, data_dir: Path | None = None) -> list[dict]:
    today = today or date.today()
    directory = data_dir or DATA

    report = []
    for label, filename, rebuild in EXTRACTS:
        result = age_of(directory / filename, today)
        if result is None:
            report.append({"label": label, "file": filename, "generated": None,
                           "days": None, "stale": True, "rebuild": rebuild,
                           "note": "missing"})
            continue
        generated, days = result
        report.append({"label": label, "file": filename, "generated": generated,
                       "days": days, "stale": days >= STALE_DAYS,
                       "rebuild": rebuild, "note": ""})
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--github", action="store_true",
                        help="write stale=/summary= to $GITHUB_OUTPUT")
    args = parser.parse_args(argv)

    report = check()
    stale = [row for row in report if row["stale"]]

    for row in report:
        if row["note"] == "missing":
            print(f"MISSING  {row['label']:24} {row['file']}")
        else:
            mark = "STALE " if row["stale"] else "ok    "
            print(f"{mark}   {row['label']:24} generated {row['generated']} "
                  f"({row['days']} days ago)")

    if not stale:
        print(f"\nAll extracts are under {STALE_DAYS} days old.")
        return 0

    lines = [
        f"{len(stale)} extract(s) past the {STALE_DAYS}-day threshold. "
        "CMS republishes NADAC weekly and FDA revises the Orange and Purple "
        "Books monthly, so the site is quoting prices and ratings that no "
        "longer reflect either.",
        "",
        "Rebuild from `Changjin/`:",
        "",
    ]
    for row in stale:
        detail = ("file is missing" if row["note"] == "missing"
                  else f"{row['days']} days old")
        lines.append(f"- **{row['label']}** ({detail})")
        lines.append(f"  ```")
        lines.append(f"  {row['rebuild']}")
        lines.append(f"  ```")
    summary = "\n".join(lines)

    print()
    print(summary)

    if args.github and (out := os.environ.get("GITHUB_OUTPUT")):
        with open(out, "a", encoding="utf-8") as handle:
            handle.write("stale=true\n")
            handle.write("summary<<EOF\n" + summary + "\nEOF\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
