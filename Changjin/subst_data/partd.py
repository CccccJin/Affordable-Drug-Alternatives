"""Medicare Part D Spending by Drug — an independent macro cross-check.

NADAC is a survey of what pharmacies *pay*. Part D reports what Medicare and its
beneficiaries actually *spent*, per dosage unit, on the same drugs. The two are
measured by different agencies from different populations, so agreement between
them is real corroboration rather than a tautology.

The gap between them is itself the finding this layer needs: for brands the two
figures land within roughly ±20%, but for cheap generics Part D runs several
times higher, because a dispensing fee and pharmacy margin dwarf a four-cent
acquisition cost. That is the clearest available evidence that a NADAC figure
must not be read as what a patient pays.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
PARTD_DIR = CACHE / "partd"
CMS_INDEX = "https://data.cms.gov/data.json"

SCHEMA = """
DROP TABLE IF EXISTS partd_spending;
CREATE TABLE partd_spending (
    brnd_name TEXT, gnrc_name TEXT, brnd_key TEXT, gnrc_key TEXT,
    year TEXT, avg_spend_per_dsg_unit REAL,
    tot_spending REAL, tot_claims REAL, tot_dsg_units REAL
);
CREATE INDEX partd_brnd ON partd_spending(brnd_key);
CREATE INDEX partd_gnrc ON partd_spending(gnrc_key);
"""


def _key(name: str | None) -> str:
    if not name:
        return ""
    return " ".join(re.sub(r"[^A-Z0-9 ]", " ", name.upper()).split())


def latest_partd_url() -> str:
    """Resolve the newest 'Medicare Part D Spending by Drug' CSV from data.cms.gov."""
    import json
    req = urllib.request.Request(
        CMS_INDEX, headers={"User-Agent": "substitutability/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    datasets = payload.get("dataset", payload) if isinstance(payload, dict) else payload
    best, best_mod = None, ""
    for item in datasets:
        title = (item.get("title") or "").lower()
        if title != "medicare part d spending by drug":
            continue
        if (item.get("modified") or "") < best_mod:
            continue
        for dist in item.get("distribution") or []:
            url = dist.get("downloadURL") or ""
            if url.endswith(".csv"):
                best, best_mod = url, item.get("modified") or ""
                break
    if not best:
        raise RuntimeError("Medicare Part D Spending by Drug CSV not found")
    return best


def fetch(force: bool = False) -> Path:
    PARTD_DIR.mkdir(parents=True, exist_ok=True)
    target = PARTD_DIR / "partd_spending.csv"
    if target.exists() and not force:
        print(f"  Part D: cached ({target.name})")
        return target
    url = latest_partd_url()
    print(f"  Part D: downloading {url.rsplit('/', 1)[-1]} ...")
    req = urllib.request.Request(
        url, headers={"User-Agent": "substitutability/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        target.write_bytes(resp.read())
    print(f"  Part D: saved to {target}")
    return target


def latest_year(header: list[str]) -> str | None:
    """Part D widens each release with a new year column; use the newest."""
    years = sorted({m.group(1) for c in header
                    if (m := re.match(r"Avg_Spnd_Per_Dsg_Unt_Wghtd_(\d{4})$", c))})
    return years[-1] if years else None


def load(conn: sqlite3.Connection, path: Path | None = None) -> list[tuple]:
    path = path or (PARTD_DIR / "partd_spending.csv")
    if not path.exists():
        return [("partd", "rows_loaded", 0.0, None, "file absent")]
    conn.executescript(SCHEMA)

    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        year = latest_year(reader.fieldnames or [])
        if not year:
            return [("partd", "rows_loaded", 0.0, None, "no spending columns found")]

        def num(row, col):
            try:
                return float(row.get(col) or "")
            except ValueError:
                return None

        rows = []
        for r in reader:
            unit = num(r, f"Avg_Spnd_Per_Dsg_Unt_Wghtd_{year}")
            if unit is None:
                continue
            brnd = (r.get("Brnd_Name") or "").strip()
            gnrc = (r.get("Gnrc_Name") or "").strip()
            rows.append((brnd, gnrc, _key(brnd), _key(gnrc), year, unit,
                         num(r, f"Tot_Spndng_{year}"), num(r, f"Tot_Clms_{year}"),
                         num(r, f"Tot_Dsg_Unts_{year}")))

    conn.executemany(
        "INSERT INTO partd_spending VALUES (?,?,?,?,?,?,?,?,?)", rows)
    return [
        ("partd", "rows_loaded", float(len(rows)), None, f"spending year {year}"),
        ("partd", "distinct_brands", float(len({r[2] for r in rows})), None, ""),
        ("partd", "spending_year", 0.0, None, year),
    ]


def lookup(conn: sqlite3.Connection, name: str) -> float | None:
    """Median Part D spend per dosage unit for a brand or generic name."""
    key = _key(name)
    if not key:
        return None
    for column in ("brnd_key", "gnrc_key"):
        vals = [r[0] for r in conn.execute(
            f"SELECT avg_spend_per_dsg_unit FROM partd_spending WHERE {column} = ?",
            (key,))]
        if vals:
            vals.sort()
            return vals[len(vals) // 2]
    return None


def available(conn: sqlite3.Connection) -> bool:
    return bool(conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='partd_spending'"
    ).fetchone())


def build(db_path: Path | None = None) -> list[tuple]:
    db_path = db_path or (CACHE / "substitutability.sqlite")
    conn = sqlite3.connect(str(db_path))
    print("  loading Medicare Part D spending ...", flush=True)
    stats = load(conn)
    conn.execute("DELETE FROM build_stat WHERE section = 'partd'")
    conn.executemany("INSERT INTO build_stat VALUES (?,?,?,?,?)", stats)
    conn.commit()
    conn.close()
    return stats


if __name__ == "__main__":
    fetch()
    for sec, metric, value, denom, note in build():
        print(f"  [{sec}] {metric:<24} {int(value):>10,}  {note}")
