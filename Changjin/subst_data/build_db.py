"""Build the substitutability sqlite database from the raw FDA / RxNorm sources.

Run ``python -m subst_data.build_db`` (or ``python substitutability.py build``).

What it produces
----------------
``cache/substitutability.sqlite`` with:

============================  ==================================================
``ob_product``                Orange Book products.txt, one row per product
``ob_patent`` ``ob_exclusivity``  Orange Book patent.txt / exclusivity.txt
``ndc_product``               openFDA NDC directory, one row per marketed NDC
``ndc_rxcui``                 NDC -> RXCUI edges (openFDA ``openfda.rxcui``)
``pb_product``                Purple Book, one row per licensed biologic product
``map_rxcui_appl``            the joined RXCUI <-> Appl_No <-> NDC mapping
``build_stat``                every mapping-failure counter, for the report
============================  ==================================================

The Orange Book carries no NDC and openFDA carries no TE code, so
``ndc_product`` is the only bridge between an RxNorm concept and a therapeutic
equivalence rating.  Each hop is counted so the loss at every join is reported
rather than hidden.
"""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

try:
    from .ndcutil import normalize_ndc9, normalize_appl_no, orange_book_appl_no
except ImportError:                                   # direct script execution
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from subst_data.ndcutil import normalize_ndc9, normalize_appl_no, orange_book_appl_no

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"

OB_DIR = CACHE / "orangebook"
NDC_JSON = CACHE / "openfda" / "drug-ndc-0001-of-0001.json"
PB_CSV = CACHE / "purplebook" / "purplebook.csv"

SCHEMA = """
DROP TABLE IF EXISTS ob_product;
CREATE TABLE ob_product (
    appl_no TEXT, product_no TEXT, ingredient TEXT, ingredient_key TEXT,
    df_route TEXT, dosage_form TEXT, route TEXT, trade_name TEXT,
    applicant TEXT, applicant_full_name TEXT, strength TEXT, strength_key TEXT,
    appl_type TEXT, te_code TEXT, approval_date TEXT, rld TEXT, rs TEXT,
    mkt_type TEXT,
    PRIMARY KEY (appl_no, product_no)
);
CREATE INDEX ob_ing ON ob_product(ingredient_key);
CREATE INDEX ob_appl ON ob_product(appl_no);

DROP TABLE IF EXISTS ob_patent;
CREATE TABLE ob_patent (
    appl_no TEXT, product_no TEXT, patent_no TEXT, expire_date TEXT,
    drug_substance_flag TEXT, drug_product_flag TEXT, patent_use_code TEXT,
    delist_flag TEXT, submission_date TEXT
);
CREATE INDEX pat_appl ON ob_patent(appl_no, product_no);

DROP TABLE IF EXISTS ob_exclusivity;
CREATE TABLE ob_exclusivity (
    appl_no TEXT, product_no TEXT, exclusivity_code TEXT, exclusivity_date TEXT
);
CREATE INDEX excl_appl ON ob_exclusivity(appl_no, product_no);

DROP TABLE IF EXISTS ndc_product;
CREATE TABLE ndc_product (
    ndc9 TEXT PRIMARY KEY, product_ndc TEXT, appl_no TEXT, raw_appl_no TEXT,
    marketing_category TEXT, generic_name TEXT, brand_name TEXT,
    dosage_form TEXT, route TEXT, active_ingredients TEXT,
    labeler_name TEXT, product_type TEXT
);
CREATE INDEX ndc_appl ON ndc_product(appl_no);

DROP TABLE IF EXISTS ndc_rxcui;
CREATE TABLE ndc_rxcui (ndc9 TEXT, rxcui TEXT, PRIMARY KEY (ndc9, rxcui));
CREATE INDEX nr_rx ON ndc_rxcui(rxcui);

DROP TABLE IF EXISTS pb_product;
CREATE TABLE pb_product (
    bla_no TEXT, product_no TEXT, appl_no TEXT, applicant TEXT,
    proprietary_name TEXT, proper_name TEXT, proper_name_key TEXT,
    license_type TEXT, is_interchangeable INTEGER, is_biosimilar INTEGER,
    strength TEXT, dosage_form TEXT, route TEXT, marketing_status TEXT,
    approval_date TEXT, inter_approval_date TEXT,
    ref_proper_name TEXT, ref_proper_name_key TEXT, ref_proprietary_name TEXT
);
CREATE INDEX pb_appl ON pb_product(appl_no);
CREATE INDEX pb_name ON pb_product(proper_name_key);

DROP TABLE IF EXISTS map_rxcui_appl;
CREATE TABLE map_rxcui_appl (
    rxcui TEXT, ndc9 TEXT, appl_no TEXT, marketing_category TEXT,
    in_orange_book INTEGER, in_purple_book INTEGER,
    PRIMARY KEY (rxcui, ndc9, appl_no)
);
CREATE INDEX map_rx ON map_rxcui_appl(rxcui);
CREATE INDEX map_appl ON map_rxcui_appl(appl_no);

DROP TABLE IF EXISTS build_stat;
CREATE TABLE build_stat (
    section TEXT, metric TEXT, value REAL, denominator REAL, note TEXT
);
"""


def norm_key(text: str | None) -> str:
    """Fold a name to a comparison key (case/space/punctuation insensitive)."""
    if not text:
        return ""
    return " ".join(text.upper().replace(";", " ").replace(",", " ").split())


def split_df_route(df_route: str) -> tuple[str, str]:
    """Orange Book packs dosage form and route into one ``DF;ROUTE`` column."""
    if ";" in df_route:
        df, route = df_route.split(";", 1)
        return df.strip().upper(), route.strip().upper()
    return df_route.strip().upper(), ""


class Builder:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.stats: list[tuple] = []

    def stat(self, section, metric, value, denominator=None, note=""):
        self.stats.append((section, metric, float(value),
                           float(denominator) if denominator is not None else None, note))

    # -- Orange Book -------------------------------------------------------
    def load_orange_book(self, conn):
        path = OB_DIR / "products.txt"
        rows, bad_appl = [], 0
        with path.open(encoding="utf-8-sig", errors="replace") as fh:
            for r in csv.DictReader(fh, delimiter="~"):
                appl = orange_book_appl_no(r["Appl_Type"], r["Appl_No"])
                if not appl:
                    bad_appl += 1
                    continue
                df, route = split_df_route(r["DF;Route"])
                rows.append((
                    appl, r["Product_No"].strip(), r["Ingredient"].strip(),
                    norm_key(r["Ingredient"]), r["DF;Route"].strip(), df, route,
                    r["Trade_Name"].strip(), r["Applicant"].strip(),
                    r["Applicant_Full_Name"].strip(), r["Strength"].strip(),
                    norm_key(r["Strength"]), r["Appl_Type"].strip(),
                    r["TE_Code"].strip(), r["Approval_Date"].strip(),
                    r["RLD"].strip(), r["RS"].strip(), r["Type"].strip(),
                ))
        conn.executemany(
            "INSERT OR REPLACE INTO ob_product VALUES (" + ",".join("?" * 18) + ")", rows
        )
        self.stat("orange_book", "products_loaded", len(rows), note=str(path.name))
        self.stat("orange_book", "products_rejected_bad_appl_no", bad_appl, len(rows) + bad_appl)

        for fname, table, ncols in (
            ("patent.txt", "ob_patent", 9),      # total columns in the target table
            ("exclusivity.txt", "ob_exclusivity", 4),
        ):
            p = OB_DIR / fname
            if not p.exists():
                continue
            recs = []
            with p.open(encoding="utf-8-sig", errors="replace") as fh:
                for r in csv.DictReader(fh, delimiter="~"):
                    appl = orange_book_appl_no(r["Appl_Type"], r["Appl_No"])
                    if not appl:
                        continue
                    vals = [appl, r["Product_No"].strip()] + [
                        (v or "").strip() for k, v in r.items()
                        if k not in ("Appl_Type", "Appl_No", "Product_No")
                    ]
                    recs.append(tuple(vals[:ncols]))
            conn.executemany(
                f"INSERT INTO {table} VALUES ({','.join('?' * ncols)})", recs
            )
            self.stat("orange_book", f"{table}_rows", len(recs), note=fname)

    # -- openFDA NDC directory --------------------------------------------
    def load_ndc(self, conn):
        with NDC_JSON.open(encoding="utf-8") as fh:
            payload = json.load(fh)
        results = payload["results"]
        export_date = (payload.get("meta") or {}).get("last_updated", "")

        prod_rows, rx_rows = {}, set()
        no_ndc9 = no_appl = no_rxcui = 0
        for r in results:
            ndc9 = normalize_ndc9(r.get("product_ndc"))
            if not ndc9:
                no_ndc9 += 1
                continue
            raw_appl = (r.get("application_number") or "").strip()
            appl = normalize_appl_no(raw_appl)
            if not appl:
                no_appl += 1
            rxcuis = (r.get("openfda") or {}).get("rxcui") or []
            if not rxcuis:
                no_rxcui += 1
            prod_rows[ndc9] = (
                ndc9, r.get("product_ndc"), appl, raw_appl or None,
                r.get("marketing_category"), r.get("generic_name"),
                r.get("brand_name"), r.get("dosage_form"),
                "; ".join(r.get("route") or []),
                json.dumps(r.get("active_ingredients") or []),
                r.get("labeler_name"), r.get("product_type"),
            )
            for cui in rxcuis:
                rx_rows.add((ndc9, str(cui)))

        conn.executemany(
            "INSERT OR REPLACE INTO ndc_product VALUES (" + ",".join("?" * 12) + ")",
            list(prod_rows.values()),
        )
        conn.executemany("INSERT OR REPLACE INTO ndc_rxcui VALUES (?,?)", sorted(rx_rows))

        total = len(results)
        self.stat("openfda_ndc", "export_date", 0, note=export_date)
        self.stat("openfda_ndc", "records_read", total)
        self.stat("openfda_ndc", "ndc_normalised", len(prod_rows), total)
        self.stat("openfda_ndc", "unparseable_product_ndc", no_ndc9, total,
                  "dropped: product_ndc could not be canonicalised")
        self.stat("openfda_ndc", "missing_application_number", no_appl, total,
                  "OTC monograph / unapproved / bulk ingredient listings carry no application")
        self.stat("openfda_ndc", "missing_rxcui", no_rxcui, total,
                  "no openfda.rxcui on the SPL listing")
        self.stat("openfda_ndc", "distinct_rxcui", len({c for _, c in rx_rows}))
        self.stat("openfda_ndc", "ndc_rxcui_edges", len(rx_rows))

    # -- Purple Book -------------------------------------------------------
    def load_purple_book(self, conn):
        if not PB_CSV.exists():
            self.stat("purple_book", "products_loaded", 0, note="file absent")
            return
        with PB_CSV.open(encoding="utf-8-sig", errors="replace") as fh:
            raw = list(csv.reader(fh))
        # The monthly download prepends a short "changes" section with its own
        # header; the full cumulative extract follows the LAST header row.
        header_idx = [i for i, r in enumerate(raw) if len(r) > 1 and r[1] == "Applicant"]
        if not header_idx:
            self.stat("purple_book", "products_loaded", 0, note="no header row found")
            return
        start = header_idx[-1]
        header = raw[start]
        rows = []
        for r in raw[start + 1:]:
            if len(r) < len(header) or not (r[2] or "").strip():
                continue
            d = dict(zip(header, r))
            if d.get("Applicant") == "Applicant":
                continue
            lic = (d.get("License Type") or "").strip()
            bla = (d.get("BLA Number") or "").strip()
            rows.append((
                bla, (d.get("Product Number") or "").strip(),
                normalize_appl_no(f"BLA{bla}") if bla else None,
                (d.get("Applicant") or "").strip(),
                (d.get("Proprietary Name") or "").strip(),
                (d.get("Proper Name") or "").strip(),
                norm_key(d.get("Proper Name")),
                lic,
                1 if "interchangeable" in lic.lower() else 0,
                1 if "biosimilar" in lic.lower() else 0,
                (d.get("Strength") or "").strip(),
                (d.get("Dosage Form") or "").strip().upper(),
                (d.get("Route of Administration") or "").strip().upper(),
                (d.get("Marketing Status") or "").strip(),
                (d.get("Approval Date") or "").strip(),
                (d.get("Inter. Approval Date") or "").strip(),
                (d.get("Ref. Product Proper Name") or "").strip(),
                norm_key(d.get("Ref. Product Proper Name")),
                (d.get("Ref. Product Proprietary Name") or "").strip(),
            ))
        conn.executemany(
            "INSERT INTO pb_product VALUES (" + ",".join("?" * 19) + ")", rows
        )
        n_inter = sum(1 for r in rows if r[8])
        n_bios = sum(1 for r in rows if r[9])
        self.stat("purple_book", "products_loaded", len(rows), note=PB_CSV.name)
        self.stat("purple_book", "reference_351a", len(rows) - n_inter - n_bios, len(rows))
        self.stat("purple_book", "biosimilar_351k", n_bios, len(rows))
        self.stat("purple_book", "interchangeable_351k", n_inter, len(rows))
        self.stat("purple_book", "distinct_bla", len({r[0] for r in rows}))

    # -- the join ----------------------------------------------------------
    def build_mapping(self, conn):
        ob_appl = {r[0] for r in conn.execute("SELECT DISTINCT appl_no FROM ob_product")}
        pb_appl = {r[0] for r in conn.execute(
            "SELECT DISTINCT appl_no FROM pb_product WHERE appl_no IS NOT NULL")}

        rows = conn.execute(
            "SELECT nr.rxcui, np.ndc9, np.appl_no, np.marketing_category "
            "FROM ndc_rxcui nr JOIN ndc_product np ON np.ndc9 = nr.ndc9"
        ).fetchall()

        mapped, no_appl, appl_unmatched = [], 0, 0
        for rxcui, ndc9, appl, cat in rows:
            if not appl:
                no_appl += 1
                continue
            in_ob = 1 if appl in ob_appl else 0
            in_pb = 1 if appl in pb_appl else 0
            if not (in_ob or in_pb):
                appl_unmatched += 1
            mapped.append((rxcui, ndc9, appl, cat, in_ob, in_pb))

        conn.executemany(
            "INSERT OR REPLACE INTO map_rxcui_appl VALUES (?,?,?,?,?,?)", mapped)

        all_rx = {r for r, *_ in rows}
        rx_to_appl = {r[0] for r in mapped}
        rx_to_ob = {r[0] for r in mapped if r[4]}
        rx_to_pb = {r[0] for r in mapped if r[5]}

        self.stat("mapping", "rxcui_ndc_pairs", len(rows))
        self.stat("mapping", "pairs_without_application_number", no_appl, len(rows),
                  "NDC has an RXCUI but no FDA application (OTC monograph, unapproved)")
        self.stat("mapping", "pairs_application_not_in_ob_or_pb", appl_unmatched, len(rows),
                  "application number resolves to neither Orange nor Purple Book")
        self.stat("mapping", "distinct_rxcui_with_ndc", len(all_rx))
        self.stat("mapping", "distinct_rxcui_with_application", len(rx_to_appl), len(all_rx))
        self.stat("mapping", "distinct_rxcui_reaching_orange_book", len(rx_to_ob), len(all_rx))
        self.stat("mapping", "distinct_rxcui_reaching_purple_book", len(rx_to_pb), len(all_rx))
        self.stat("mapping", "distinct_rxcui_unmappable", len(all_rx - rx_to_appl), len(all_rx),
                  "RXCUI present in openFDA but no route to an FDA application")

        linked_ob = {r[0] for r in conn.execute(
            "SELECT DISTINCT appl_no FROM map_rxcui_appl WHERE in_orange_book = 1")}
        self.stat("mapping", "orange_book_applications", len(ob_appl))
        self.stat("mapping", "orange_book_applications_with_rxcui", len(linked_ob), len(ob_appl))
        self.stat("mapping", "orange_book_applications_without_rxcui",
                  len(ob_appl - linked_ob), len(ob_appl),
                  "mostly discontinued applications with no current NDC listing")

        linked_pb = {r[0] for r in conn.execute(
            "SELECT DISTINCT appl_no FROM map_rxcui_appl WHERE in_purple_book = 1")}
        self.stat("mapping", "purple_book_applications", len(pb_appl))
        self.stat("mapping", "purple_book_applications_with_rxcui", len(linked_pb), len(pb_appl))

    def run(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path))
        conn.executescript(SCHEMA)
        print("  loading Orange Book ...", flush=True)
        self.load_orange_book(conn)
        print("  loading openFDA NDC directory (large, ~30s) ...", flush=True)
        self.load_ndc(conn)
        print("  loading Purple Book ...", flush=True)
        self.load_purple_book(conn)
        print("  joining RXCUI <-> Appl_No <-> NDC ...", flush=True)
        self.build_mapping(conn)
        conn.executemany(
            "INSERT INTO build_stat VALUES (?,?,?,?,?)", self.stats)
        conn.commit()
        conn.close()
        return self.stats


def main():
    stats = Builder().run()
    print(f"\nBuilt {DB_PATH}")
    width = max(len(m) for _, m, *_ in stats)
    section = None
    for sec, metric, value, denom, note in stats:
        if sec != section:
            print(f"\n[{sec}]")
            section = sec
        pct = f"  ({value / denom * 100:5.1f}%)" if denom else ""
        val = note if (metric == "export_date") else f"{int(value):,}"
        print(f"  {metric:<{width}}  {val:>12}{pct}  {note if metric != 'export_date' else ''}")


if __name__ == "__main__":
    main()
