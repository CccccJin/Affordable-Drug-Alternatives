"""Precompute the substitutability + price data the frontend needs.

The frontend deploys to static GitHub Pages, so it cannot reach the 504 MB
sqlite database, the RxNav API or Python RDKit. It does not have to: given one
month's Orange Book and one week's NADAC, every AB-equivalence group and every
price is a fixed fact. Precomputing moves that dependency to build time, which
is where it belongs.

The result is ~1.8 MB raw and ~143 KB gzipped -- smaller than the
``compounds.json`` the frontend already ships.

    python price_compare.py export
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date
from pathlib import Path

from .nadac import BRAND_CLASSES
from .structures import base_moiety

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"
OUT_PATH = (Path(__file__).resolve().parents[1]
            / "frontend" / "public" / "data" / "substitutability.json")

DISCLAIMER = ("NADAC is what pharmacies pay to acquire a drug. It is not a "
              "copay, not a cash price, and not a reimbursement rate.")


def _prices(conn) -> dict[str, list[tuple]]:
    """NADAC prices per application, each tagged with the strength it belongs to.

    Application number alone is not enough to price a product. An NDA covers
    every strength it was approved for -- Lipitor's NDA020702 spans 10, 20, 40
    and 80 mg -- so taking ``MIN(price)`` across the application returns the
    cheapest strength, quoting the 10 mg price against a 40 mg group. Each
    price therefore carries the parsed strength of the NDC it came from, and
    the caller matches it to the group.
    """
    from .grade import parse_strength

    out: dict[str, list[tuple]] = {}
    for r in conn.execute(
        "SELECT np.appl_no, np.active_ingredients, n.price_per_unit AS p, "
        "       n.pricing_unit AS u, n.classification AS cls "
        "FROM ndc_product np JOIN nadac_price n ON n.ndc9 = np.ndc9 "
        "WHERE np.appl_no IS NOT NULL"
    ):
        ingredients = json.loads(r["active_ingredients"] or "[]")
        strength = frozenset().union(
            *(parse_strength(i.get("strength")) for i in ingredients)
        ) if ingredients else frozenset()
        out.setdefault(r["appl_no"], []).append(
            (strength, r["p"], r["u"], r["cls"]))
    return out


def _price_for(entries, want) -> tuple | None:
    """Cheapest price among a product's NDCs that match the group's strength."""
    if not entries:
        return None
    matching = [e for e in entries if want and e[0] and (e[0] & want)]
    if not matching:
        return None
    best = min(matching, key=lambda e: e[1])
    return best[1], best[2], best[3]


def build_payload(conn) -> dict:
    from .grade import parse_strength

    prices = _prices(conn)
    stats = {(r["section"], r["metric"]): r for r in conn.execute("SELECT * FROM build_stat")}

    def note(section, metric):
        row = stats.get((section, metric))
        return row["note"] if row else ""

    groups = []
    for g in conn.execute(
        "SELECT ingredient_key, dosage_form, route, strength_key FROM ob_product "
        "WHERE mkt_type = 'RX' AND te_code LIKE 'AB%' "
        "GROUP BY ingredient_key, dosage_form, route, strength_key "
        "HAVING COUNT(*) > 1"
    ).fetchall():
        rows = conn.execute(
            "SELECT appl_no, trade_name, applicant, te_code FROM ob_product "
            "WHERE ingredient_key = ? AND dosage_form = ? AND route = ? "
            "AND strength_key = ? AND mkt_type = 'RX' AND te_code LIKE 'AB%'",
            (g["ingredient_key"], g["dosage_form"], g["route"], g["strength_key"]),
        ).fetchall()

        want = parse_strength(g["strength_key"])
        members = []
        for r in rows:
            priced = _price_for(prices.get(r["appl_no"]), want)
            members.append({
                "a": r["appl_no"], "t": r["trade_name"], "m": r["applicant"],
                "te": r["te_code"],
                # Regulatory status is a poor proxy for "is this the brand":
                # LEVO-T holds its own NDA but is priced as a generic, so keying
                # on appl_type would pick it as the Synthroid baseline and
                # report a 0% saving. NADAC publishes its own flag for this.
                "b": 1 if (priced and priced[2] in BRAND_CLASSES) else 0,
                "p": round(priced[0], 5) if priced else None,
                "u": priced[1] if priced else None,
            })
        members.sort(key=lambda m: (m["p"] is None, m["p"] or 0.0))

        brands = [m for m in members if m["b"] and m["p"] is not None]
        generics = [m for m in members if not m["b"] and m["p"] is not None]
        saving = None
        if brands and generics and brands[-1]["p"]:
            # The brand baseline is the dearest brand-classified product; taking
            # the cheapest would understate the switch.
            baseline = brands[-1]["p"]
            saving = round((baseline - generics[0]["p"]) / baseline * 100, 1)

        groups.append({
            "i": g["ingredient_key"], "df": g["dosage_form"], "r": g["route"],
            "s": g["strength_key"], "n": len(members), "sv": saving, "mem": members,
        })

    # Index on the Orange Book name and on the salt-stripped moiety, so a search
    # for "atorvastatin" reaches the "ATORVASTATIN CALCIUM" groups.
    name_index: dict[str, list[int]] = {}
    for idx, group in enumerate(groups):
        for key in {group["i"], base_moiety(group["i"])}:
            if key:
                name_index.setdefault(key, []).append(idx)

    return {
        "meta": {
            "orange_book": note("orange_book", "products_loaded") or "products.txt",
            "nadac_week": note("nadac", "price_as_of"),
            "openfda_ndc": note("openfda_ndc", "export_date"),
            "generated": date.today().isoformat(),
            "price_basis": DISCLAIMER,
            "coverage": {
                "groups": len(groups),
                "with_savings": sum(1 for g in groups if g["sv"] is not None),
                "members": sum(g["n"] for g in groups),
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
    # Short keys and no whitespace: together they are about a third of the
    # payload, and the frontend expands them at its parse boundary.
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return out


def main() -> Path:
    import gzip
    out = export()
    raw = out.stat().st_size
    gz = len(gzip.compress(out.read_bytes(), 6))
    payload = json.loads(out.read_text())
    cov = payload["meta"]["coverage"]
    print(f"Wrote {out}")
    print(f"  groups {cov['groups']:,} · members {cov['members']:,} · "
          f"with a saving {cov['with_savings']:,}")
    print(f"  {raw / 1024 / 1024:.2f} MB raw, {gz / 1024:.0f} KB gzipped")
    return out


if __name__ == "__main__":
    main()
