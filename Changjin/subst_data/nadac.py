"""CMS NADAC (National Average Drug Acquisition Cost) loader and unit normaliser.

NADAC is what **pharmacies pay to acquire** a drug -- a survey of invoice costs.
It is *not* what a patient pays at the counter, and it is not a reimbursement
rate. Every figure this module produces carries that caveat; see
:data:`NADAC_DISCLAIMER`.

Two things make a naive price comparison wrong, and both are handled here:

1. **NADAC is a per-unit price** (per tablet, per mL, per gram), and the unit
   differs by product. Comparing "price" across products without fixing the
   unit compares a tablet to a millilitre.
2. **The yearly file is a weekly archive**, so one NDC appears many times with
   different effective dates. Only the most recent row is a current price.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import urllib.request
from datetime import datetime
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
NADAC_DIR = CACHE / "nadac"
DATASET_INDEX = "https://data.medicaid.gov/api/1/metastore/schemas/dataset/items"

NADAC_DISCLAIMER = (
    "NADAC is the average price pharmacies PAY to acquire a drug (a CMS survey "
    "of invoice costs). It is NOT the patient's out-of-pocket cost, NOT an "
    "insurance copay, and NOT a reimbursement rate. Actual patient cost depends "
    "on insurance design, deductibles, rebates and dispensing fees, none of "
    "which appear in this data."
)

SCHEMA = """
DROP TABLE IF EXISTS nadac_price;
CREATE TABLE nadac_price (
    ndc11 TEXT PRIMARY KEY,
    ndc9 TEXT,
    description TEXT,
    price_per_unit REAL,
    pricing_unit TEXT,
    effective_date TEXT,
    classification TEXT,
    is_otc INTEGER,
    explanation_code TEXT,
    corresponding_generic_price REAL
);
CREATE INDEX nadac_ndc9 ON nadac_price(ndc9);
CREATE INDEX nadac_class ON nadac_price(classification);
"""

#: NADAC's brand/generic flag. B = brand, G = generic, B-ANDA = brand marketed
#: under an ANDA, B-BIO = biologic.
BRAND_CLASSES = ("B", "B-ANDA", "B-BIO")

_STRENGTH_RE = re.compile(
    r"^\s*(?P<amount>\.?\d+(?:\.\d+)?)\s*(?P<unit>[a-zA-Z%]+)\s*"
    r"(?:/\s*(?P<den_amount>\d+(?:\.\d+)?)?\s*(?P<den_unit>[a-zA-Z%]+)?)?\s*$"
)

_TO_MG = {"MG": 1.0, "G": 1000.0, "GM": 1000.0, "MCG": 0.001, "UG": 0.001,
          "NG": 1e-6, "KG": 1e6}

#: Denominator units that correspond to each NADAC pricing unit.
_DENOM_FOR_PRICING_UNIT = {
    "EA": {"1", "", "EACH"},
    "ML": {"ML", "L"},
    "GM": {"G", "GM", "MG"},
}


def latest_nadac_url() -> str:
    """Resolve the newest weekly NADAC file from the data.medicaid.gov index."""
    import json
    req = urllib.request.Request(
        DATASET_INDEX, headers={"User-Agent": "substitutability/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        items = json.loads(resp.read().decode("utf-8"))
    best, best_mod = None, ""
    for item in items:
        title = item.get("title", "")
        if not title.startswith("NADAC (National Average Drug Acquisition Cost)"):
            continue
        if item.get("modified", "") <= best_mod:
            continue
        for dist in item.get("distribution") or []:
            url = (dist.get("data") or {}).get("downloadURL") or dist.get("downloadURL")
            if url and url.endswith(".csv"):
                best, best_mod = url, item.get("modified", "")
                break
    if not best:
        raise RuntimeError("no NADAC CSV found in the data.medicaid.gov index")
    return best


def fetch(force: bool = False) -> Path:
    """Download the newest weekly NADAC file."""
    NADAC_DIR.mkdir(parents=True, exist_ok=True)
    target = NADAC_DIR / "nadac_current.csv"
    legacy = NADAC_DIR / "nadac_2026.csv"
    if not force and target.exists():
        print(f"  NADAC: cached ({target.name})")
        return target
    if not force and legacy.exists():
        legacy.rename(target)
        print(f"  NADAC: cached ({target.name})")
        return target
    url = latest_nadac_url()
    print(f"  NADAC: downloading {url.rsplit('/', 1)[-1]} (~90 MB) ...")
    req = urllib.request.Request(
        url, headers={"User-Agent": "substitutability/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=900) as resp, target.open("wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    print(f"  NADAC: saved to {target}")
    return target


def mg_per_pricing_unit(strength: str | None, pricing_unit: str) -> float | None:
    """Convert an openFDA strength string into mg of active ingredient per NADAC unit.

    NADAC prices a tablet (``EA``), a millilitre (``ML``) or a gram (``GM``).
    openFDA writes strength as ``amount unit / denominator``:

    >>> mg_per_pricing_unit("40 mg/1", "EA")        # 40 mg per tablet
    40.0
    >>> mg_per_pricing_unit("100 mg/5mL", "ML")     # 20 mg per mL
    20.0
    >>> mg_per_pricing_unit(".1 g/100g", "GM")      # 1 mg per gram
    1.0
    >>> mg_per_pricing_unit("90 ug/1", "EA")        # micrograms fold to mg
    0.09

    Returns ``None`` when the strength cannot be expressed in the priced unit --
    a transdermal patch dosed ``4.6 mg/24h`` has no mg-per-gram meaning. The
    caller must then fall back to the per-unit price rather than invent a value.
    """
    if not strength or not pricing_unit:
        return None
    m = _STRENGTH_RE.match(strength.strip())
    if not m:
        return None
    unit = (m.group("unit") or "").upper()
    if unit not in _TO_MG:
        return None
    try:
        amount_mg = float(m.group("amount")) * _TO_MG[unit]
    except ValueError:
        return None

    den_unit = (m.group("den_unit") or "").upper()
    den_amount = float(m.group("den_amount") or 1)
    if den_amount == 0:
        return None

    allowed = _DENOM_FOR_PRICING_UNIT.get(pricing_unit.upper())
    if allowed is None:
        return None
    # "40 mg/1" -> denominator unit is empty, meaning "per each".
    key = den_unit or "1"
    if key not in allowed:
        return None

    if pricing_unit.upper() == "GM" and key == "MG":
        den_amount /= 1000.0            # e.g. "1 mg/100mg" -> per 0.1 g
    elif pricing_unit.upper() == "ML" and key == "L":
        den_amount *= 1000.0
    return amount_mg / den_amount


def load(conn: sqlite3.Connection, path: Path | None = None) -> list[tuple]:
    """Load the newest price per NDC into ``nadac_price``; return build stats."""
    from .ndcutil import normalize_ndc9

    path = path or (NADAC_DIR / "nadac_current.csv")
    conn.executescript(SCHEMA)

    latest: dict[str, tuple] = {}
    rows_read = 0
    bad_price = bad_ndc = 0
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            rows_read += 1
            ndc11 = (r.get("NDC") or "").strip()
            if not ndc11.isdigit() or len(ndc11) != 11:
                bad_ndc += 1
                continue
            try:
                price = float(r["NADAC Per Unit"])
                eff = datetime.strptime(r["Effective Date"].strip(), "%m/%d/%Y")
            except (ValueError, KeyError, AttributeError):
                bad_price += 1
                continue
            prev = latest.get(ndc11)
            if prev is not None and prev[0] >= eff:
                continue
            try:
                gen_price = float(r.get("Corresponding Generic Drug NADAC Per Unit") or "")
            except ValueError:
                gen_price = None
            latest[ndc11] = (
                eff, ndc11, normalize_ndc9(ndc11), (r.get("NDC Description") or "").strip(),
                price, (r.get("Pricing Unit") or "").strip().upper(),
                eff.date().isoformat(),
                (r.get("Classification for Rate Setting") or "").strip().upper(),
                1 if (r.get("OTC") or "").strip().upper() == "Y" else 0,
                (r.get("Explanation Code") or "").strip(), gen_price,
            )

    conn.executemany(
        "INSERT OR REPLACE INTO nadac_price VALUES (?,?,?,?,?,?,?,?,?,?)",
        [v[1:] for v in latest.values()])

    dates = [v[0] for v in latest.values()]
    stats = [
        ("nadac", "rows_read", float(rows_read), None, path.name),
        ("nadac", "distinct_ndc11", float(len(latest)), float(rows_read),
         "newest effective date kept per NDC"),
        ("nadac", "rows_rejected_bad_ndc", float(bad_ndc), float(rows_read), ""),
        ("nadac", "rows_rejected_bad_price", float(bad_price), float(rows_read), ""),
        ("nadac", "price_as_of", 0.0, None,
         f"{min(dates).date()} to {max(dates).date()}" if dates else "n/a"),
    ]
    for cls, label in (("G", "generic"), ("B", "brand"),
                       ("B-ANDA", "brand under ANDA"), ("B-BIO", "biologic")):
        n = conn.execute("SELECT COUNT(*) FROM nadac_price WHERE classification = ?",
                         (cls,)).fetchone()[0]
        stats.append(("nadac", f"class_{cls}", float(n), float(len(latest)), label))
    return stats


def join_stats(conn: sqlite3.Connection) -> list[tuple]:
    """Measure how much of NADAC the layer-2 NDC mapping actually reaches."""
    out = []
    total = conn.execute("SELECT COUNT(DISTINCT ndc9) FROM nadac_price").fetchone()[0]

    matched = conn.execute(
        "SELECT COUNT(DISTINCT n.ndc9) FROM nadac_price n "
        "JOIN ndc_product p ON p.ndc9 = n.ndc9").fetchone()[0]
    with_rx = conn.execute(
        "SELECT COUNT(DISTINCT n.ndc9) FROM nadac_price n "
        "JOIN ndc_rxcui r ON r.ndc9 = n.ndc9").fetchone()[0]
    with_ob = conn.execute(
        "SELECT COUNT(DISTINCT n.ndc9) FROM nadac_price n "
        "JOIN map_rxcui_appl m ON m.ndc9 = n.ndc9 AND m.in_orange_book = 1").fetchone()[0]

    out += [
        ("nadac_join", "nadac_distinct_ndc9", float(total), None, ""),
        ("nadac_join", "matched_openfda_ndc", float(matched), float(total),
         "NADAC NDC present in the openFDA NDC directory"),
        ("nadac_join", "matched_to_rxcui", float(with_rx), float(total),
         "NADAC NDC that reaches an RXCUI"),
        ("nadac_join", "matched_to_orange_book", float(with_ob), float(total),
         "NADAC NDC that reaches an Orange Book product"),
        ("nadac_join", "unmatched", float(total - matched), float(total),
         "no openFDA listing: delisted packages, or NDCs newer/older than the directory"),
    ]

    # The reverse direction is what actually limits price comparison.
    rx_total = conn.execute(
        "SELECT COUNT(DISTINCT rxcui) FROM map_rxcui_appl WHERE in_orange_book = 1"
    ).fetchone()[0]
    rx_priced = conn.execute(
        "SELECT COUNT(DISTINCT m.rxcui) FROM map_rxcui_appl m "
        "JOIN nadac_price n ON n.ndc9 = m.ndc9 WHERE m.in_orange_book = 1").fetchone()[0]
    out += [
        ("nadac_join", "orange_book_rxcui_total", float(rx_total), None, ""),
        ("nadac_join", "orange_book_rxcui_with_price", float(rx_priced), float(rx_total),
         "RXCUIs reaching the Orange Book that also carry a NADAC price"),
    ]
    return out


def build(db_path: Path | None = None) -> list[tuple]:
    """Load NADAC into the existing substitutability database."""
    db_path = db_path or (CACHE / "substitutability.sqlite")
    conn = sqlite3.connect(str(db_path))
    print("  loading NADAC (1M+ rows, ~20s) ...", flush=True)
    stats = load(conn)
    print("  measuring the NDC join ...", flush=True)
    stats += join_stats(conn)
    conn.execute("DELETE FROM build_stat WHERE section IN ('nadac', 'nadac_join')")
    conn.executemany("INSERT INTO build_stat VALUES (?,?,?,?,?)", stats)
    conn.commit()
    conn.close()
    return stats


if __name__ == "__main__":
    fetch()
    for sec, metric, value, denom, note in build():
        pct = f"  ({value / denom * 100:5.1f}%)" if denom else ""
        val = note if metric == "price_as_of" else f"{int(value):,}"
        print(f"  [{sec}] {metric:<32} {val:>14}{pct}  "
              f"{note if metric != 'price_as_of' else ''}")
