"""Precompute the Purple Book biologic groups the frontend needs.

The Orange Book export (`export_frontend.py`) covers small molecules rated
``AB*``. It leaves out the entire biologics side, which `grade.py` already
adjudicates -- rule ``A3`` for a 351(k) *interchangeable* biologic against its
reference product, ``B4`` for a biosimilar that is not interchangeable -- and
which `COVERAGE_REPORT.md` already documents. That omission hides the largest
figures in the dataset by roughly two orders of magnitude: the biggest absolute
saving in the Orange Book export is about $84 per unit, while Stelara against
Yesintek is about $26,900 per mL.

Two things make a biologic group different from an Orange Book group, and both
shape the payload:

*Grade varies within a group.* Every member of an ``AB*`` group is grade A. A
biologic family holds the reference product, interchangeable follow-ons (grade
A, pharmacy substitution) and biosimilars that are not interchangeable (grade
B, prescriber authorisation). The grade therefore rides on the member, not the
group.

*Prices are only comparable within a pricing unit.* NADAC prices Humira per
syringe (``EA``) and Hyrimoz per millilitre (``ML``); those numbers cannot be
subtracted from one another. Savings are computed per unit and a member priced
in a different unit is listed without one, rather than being folded into a
comparison it does not belong in.

    python price_compare.py export-biologics
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"
OUT_PATH = (Path(__file__).resolve().parents[1]
            / "frontend" / "public" / "data" / "biologics.json")


def _prices(conn) -> dict[str, list[tuple[float, str]]]:
    """Cheapest NADAC price per application, per pricing unit."""
    out: dict[str, list[tuple[float, str]]] = defaultdict(list)
    rows = conn.execute(
        "SELECT np.appl_no, MIN(n.price_per_unit) p, n.pricing_unit u "
        "FROM ndc_product np JOIN nadac_price n ON n.ndc9 = np.ndc9 "
        "WHERE np.appl_no IS NOT NULL "
        "GROUP BY np.appl_no, n.pricing_unit"
    )
    for row in rows:
        out[row["appl_no"]].append((row["p"], row["u"]))
    return out


def _grade(row) -> str:
    """The grade `grade.py` assigns this product against its reference."""
    if row["license_type"] == "351(a)":
        return "reference"
    if row["is_interchangeable"]:
        return "A"        # rule A3
    if row["is_biosimilar"]:
        return "B"        # rule B4
    return "B"


def build_payload(conn) -> dict:
    prices = _prices(conn)

    # A family is a reference product plus everything licensed against it.
    # Keyed on the reference proper name, which is what a 351(k) filing names.
    families: dict[str, list[dict]] = defaultdict(list)
    for row in conn.execute(
        "SELECT bla_no, appl_no, applicant, proprietary_name, proper_name, "
        "       proper_name_key, license_type, is_interchangeable, is_biosimilar, "
        "       strength, dosage_form, route, marketing_status, ref_proper_name, "
        "       ref_proper_name_key, ref_proprietary_name "
        "FROM pb_product WHERE marketing_status = 'Rx'"
    ):
        key = row["ref_proper_name_key"] or row["proper_name_key"]
        if not key:
            continue
        entries = prices.get(row["appl_no"], [(None, None)])
        for price, unit in entries:
            families[key].append({
                "b": row["bla_no"], "a": row["appl_no"],
                "t": row["proprietary_name"], "m": row["applicant"],
                "lt": row["license_type"],
                "g": _grade(row),
                "r": row["route"], "df": row["dosage_form"], "s": row["strength"],
                "p": round(price, 5) if price is not None else None,
                "u": unit,
                "ref": row["ref_proprietary_name"] or None,
            })

    groups = []
    for key, members in sorted(families.items()):
        # A family with no follow-on is just an originator; there is nothing to
        # substitute and nothing to say about it.
        if not any(m["lt"].startswith("351(k)") for m in members):
            continue

        # Savings are per pricing unit, because $/EA and $/ML do not compare.
        savings = []
        by_unit: dict[str, list[dict]] = defaultdict(list)
        for member in members:
            if member["p"] is not None and member["u"]:
                by_unit[member["u"]].append(member)
        for unit, priced in by_unit.items():
            originators = [m for m in priced if m["lt"] == "351(a)"]
            followons = [m for m in priced if m["lt"].startswith("351(k)")]
            if not originators or not followons:
                continue
            # Dearest originator against cheapest follow-on, matching the
            # Orange Book export's choice of baseline.
            baseline = max(originators, key=lambda m: m["p"])
            cheapest = min(followons, key=lambda m: m["p"])
            if baseline["p"] <= cheapest["p"]:
                continue
            savings.append({
                "u": unit,
                "from": baseline["t"], "fp": baseline["p"],
                "to": cheapest["t"], "tp": cheapest["p"],
                "g": cheapest["g"],
                "sv": round((baseline["p"] - cheapest["p"]) / baseline["p"] * 100, 1),
            })

        # The Purple Book lists one row per presentation — strength, package,
        # device — so a single product appears dozens of times. A reader wants
        # one row per product per pricing unit; the cheapest presentation is the
        # one a price comparison is about anyway.
        collapsed: dict[tuple, dict] = {}
        for member in members:
            k = (member["t"], member["u"])
            best = collapsed.get(k)
            if best is None or (member["p"] is not None
                                and (best["p"] is None or member["p"] < best["p"])):
                collapsed[k] = member
        members = list(collapsed.values())

        members.sort(key=lambda m: (m["lt"] != "351(a)", m["p"] is None, m["p"] or 0.0))
        groups.append({
            "i": key,
            "n": len(members),
            "sav": sorted(savings, key=lambda s: -s["sv"]),
            "mem": members,
        })

    # Index the molecule and every brand in it, the same front door the Orange
    # Book export opens: someone starts from "Humira", not from "ADALIMUMAB".
    name_index: dict[str, list[int]] = {}
    for idx, group in enumerate(groups):
        keys = {group["i"]}
        keys.update(m["t"].upper() for m in group["mem"] if m["t"])
        keys.update(m["ref"].upper() for m in group["mem"] if m["ref"])
        for key in keys:
            if key:
                name_index.setdefault(key, []).append(idx)

    return {
        "meta": {
            "purple_book": "purplebook.csv",
            "generated": date.today().isoformat(),
            "coverage": {
                "families": len(groups),
                "members": sum(g["n"] for g in groups),
                "with_savings": sum(1 for g in groups if g["sav"]),
            },
        },
        "groups": groups,
        "name_index": name_index,
    }


def export(out_path: Path | None = None, db_path: Path | None = None) -> Path:
    out = Path(out_path or OUT_PATH)
    conn = sqlite3.connect(f"file:{db_path or DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    payload = build_payload(conn)
    conn.close()

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return out


def main() -> Path:
    import gzip
    out = export()
    payload = json.loads(out.read_text())
    cov = payload["meta"]["coverage"]
    gz = len(gzip.compress(out.read_bytes(), 6))
    print(f"Wrote {out}")
    print(f"  families {cov['families']} · members {cov['members']} · "
          f"with a saving {cov['with_savings']}")
    print(f"  {out.stat().st_size / 1024:.0f} KB raw, {gz / 1024:.0f} KB gzipped")
    for group in payload["groups"]:
        for saving in group["sav"]:
            print(f"    {group['i'][:22]:24} {saving['from'][:14]:16} ${saving['fp']:>10.2f}"
                  f" -> {saving['to'][:14]:14} ${saving['tp']:>9.2f}/{saving['u']:2}"
                  f" {saving['sv']:>6.1f}%  grade {saving['g']}")
    return out


if __name__ == "__main__":
    main()
