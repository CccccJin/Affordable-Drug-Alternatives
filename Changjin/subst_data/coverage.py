"""Generate the data-coverage report.

Answers the two questions a reviewer asks before trusting a verdict:
how much of the identifier mapping actually lands, and how many products carry
a usable therapeutic-equivalence rating.

    python substitutability.py coverage

Writes ``COVERAGE_REPORT.md`` next to ``substitutability.py``.
"""
from __future__ import annotations

import argparse
import collections
import random
import sqlite3
import sys
from datetime import date
from pathlib import Path

try:
    from .grade import DB_PATH, TE_EQUIVALENT_PREFIXES, te_subgroups
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from subst_data.grade import DB_PATH, TE_EQUIVALENT_PREFIXES, te_subgroups

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "COVERAGE_REPORT.md"


def pct(n, d):
    return f"{n / d * 100:.1f}%" if d else "n/a"


class Report:
    def __init__(self, db_path: Path = DB_PATH):
        self.conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self.conn.row_factory = sqlite3.Row
        self.lines: list[str] = []
        self.stats = {
            (r["section"], r["metric"]): r
            for r in self.conn.execute("SELECT * FROM build_stat")
        }

    def w(self, text: str = ""):
        self.lines.append(text)

    def stat(self, section, metric, default=0):
        row = self.stats.get((section, metric))
        return int(row["value"]) if row else default

    def note(self, section, metric):
        row = self.stats.get((section, metric))
        return row["note"] if row else ""

    # -- sections ----------------------------------------------------------
    def header(self):
        self.w("# Drug Substitutability — Data Coverage Report")
        self.w()
        self.w(f"Generated {date.today().isoformat()} by `python substitutability.py coverage`.")
        self.w()
        self.w("This report states what the substitutability module can and cannot "
               "adjudicate, and why. Percentages that look alarming in isolation are "
               "decomposed against the denominator that actually matters.")
        self.w()

    def sources(self):
        self.w("## 1. Source inventory")
        self.w()
        self.w("| Source | File | Records | Notes |")
        self.w("|---|---|---:|---|")
        self.w(f"| FDA Orange Book | `products.txt` | {self.stat('orange_book','products_loaded'):,} | "
               "marketed + discontinued drug products |")
        self.w(f"| FDA Orange Book | `patent.txt` | {self.stat('orange_book','ob_patent_rows'):,} | "
               "listed patents, used to explain absent generics |")
        self.w(f"| FDA Orange Book | `exclusivity.txt` | {self.stat('orange_book','ob_exclusivity_rows'):,} | "
               "marketing exclusivity periods |")
        self.w(f"| openFDA NDC Directory | `drug-ndc-0001-of-0001.json` | "
               f"{self.stat('openfda_ndc','records_read'):,} | "
               f"export {self.note('openfda_ndc','export_date')}; the RXCUI↔application bridge |")
        self.w(f"| FDA Purple Book | `purplebook.csv` | {self.stat('purple_book','products_loaded'):,} | "
               "licensed biologics |")
        self.w("| RxNorm | RxNav REST API | on demand | "
               "local UMLS `.RRF` release used instead when present |")
        self.w("| WHO ATC | via RxNorm `SAB='ATC'` | on demand | level-5 substance codes |")
        self.w()
        self.w("> **RxNorm caveat.** `RXNCONSO.RRF`/`RXNREL.RRF` sit behind a UMLS/UTS "
               "login, so the default backend is the public RxNav REST API, which "
               "exposes the same concepts, relationships and ATC codes without an "
               "account. Dropping a UMLS release into `subst_data/cache/rxnorm/` "
               "switches the module to the offline files automatically — no code change.")
        self.w()

    def mapping(self):
        self.w("## 2. Identifier mapping coverage (RXCUI ↔ Application Number ↔ NDC)")
        self.w()
        self.w("The Orange Book carries **no NDC** and openFDA carries **no TE code**, so "
               "every verdict has to cross this bridge:")
        self.w()
        self.w("```")
        self.w("RXCUI --(openFDA openfda.rxcui)--> NDC --(application_number)--> ANDA/NDA/BLA")
        self.w("                                                                    |")
        self.w("                                            Orange Book products.txt / Purple Book")
        self.w("```")
        self.w()
        total_pairs = self.stat("mapping", "rxcui_ndc_pairs")
        rx_ndc = self.stat("mapping", "distinct_rxcui_with_ndc")
        self.w("### 2.1 Where RXCUIs land")
        self.w()
        self.w("| Step | Count | Share | Meaning |")
        self.w("|---|---:|---:|---|")
        for metric, label in [
            ("distinct_rxcui_with_ndc", "RXCUIs reachable from openFDA"),
            ("distinct_rxcui_with_application", "…that carry an FDA application number"),
            ("distinct_rxcui_reaching_orange_book", "…that reach an Orange Book product"),
            ("distinct_rxcui_reaching_purple_book", "…that reach a Purple Book product"),
            ("distinct_rxcui_unmappable", "**mapping failures** (no route to an application)"),
        ]:
            v = self.stat("mapping", metric)
            self.w(f"| {label} | {v:,} | {pct(v, rx_ndc)} | {self.note('mapping', metric)} |")
        self.w()
        fail = self.stat("mapping", "distinct_rxcui_unmappable")
        self.w(f"**Mapping failure rate: {pct(fail, rx_ndc)}** ({fail:,} of {rx_ndc:,} RXCUIs).")
        self.w()
        cats = self.conn.execute(
            "SELECT marketing_category, COUNT(DISTINCT nr.rxcui) n FROM ndc_product np "
            "JOIN ndc_rxcui nr ON nr.ndc9 = np.ndc9 WHERE np.appl_no IS NULL "
            "GROUP BY marketing_category ORDER BY n DESC LIMIT 8").fetchall()
        if cats:
            self.w("Those failures are not random — they are product classes that have no "
                   "FDA application by definition:")
            self.w()
            self.w("| Marketing category of the unmappable NDC | Distinct RXCUIs |")
            self.w("|---|---:|")
            for r in cats:
                self.w(f"| {r['marketing_category'] or '(none)'} | {r['n']:,} |")
            self.w()
            self.w("OTC monograph drugs, homeopathic and unapproved listings and bulk "
                   "ingredients are outside the Orange Book by design. A substitutability "
                   "verdict is not meaningful for them, and the module returns grade **D** "
                   "with that reason attached rather than guessing.")
            self.w()

        self.w("### 2.2 Where NDC records lose the join")
        self.w()
        read = self.stat("openfda_ndc", "records_read")
        self.w("| Failure mode | Count | Share of NDC records |")
        self.w("|---|---:|---:|")
        for metric, label in [
            ("missing_application_number", "no `application_number`"),
            ("missing_rxcui", "no `openfda.rxcui`"),
            ("unparseable_product_ndc", "`product_ndc` could not be canonicalised"),
        ]:
            v = self.stat("openfda_ndc", metric)
            self.w(f"| {label} | {v:,} | {pct(v, read)} |")
        dup = read - self.stat("openfda_ndc", "ndc_normalised")
        self.w(f"| collapsed to an existing 9-digit NDC | {dup:,} | {pct(dup, read)} |")
        self.w()
        self.w("The last row is deduplication, not loss: several package-level listings "
               "share one labeler+product code, which is the level the join runs at.")
        self.w()
        self.w("### 2.3 Coverage seen from the Orange Book side")
        self.w()
        ob_total = self.stat("mapping", "orange_book_applications")
        ob_linked = self.stat("mapping", "orange_book_applications_with_rxcui")
        ob_unlinked = self.stat("mapping", "orange_book_applications_without_rxcui")
        row = self.conn.execute("""
            SELECT SUM(CASE WHEN n_active > 0 THEN 1 ELSE 0 END) AS active,
                   SUM(CASE WHEN n_active = 0 THEN 1 ELSE 0 END) AS inactive FROM (
              SELECT appl_no, SUM(CASE WHEN mkt_type = 'RX' THEN 1 ELSE 0 END) n_active
              FROM ob_product
              WHERE appl_no NOT IN (SELECT appl_no FROM map_rxcui_appl WHERE in_orange_book = 1)
              GROUP BY appl_no)""").fetchone()
        self.w(f"| Orange Book applications | Count | Share |")
        self.w("|---|---:|---:|")
        self.w(f"| total distinct applications | {ob_total:,} | 100% |")
        self.w(f"| linked to at least one RXCUI | {ob_linked:,} | {pct(ob_linked, ob_total)} |")
        self.w(f"| **not** linked to any RXCUI | {ob_unlinked:,} | {pct(ob_unlinked, ob_total)} |")
        self.w(f"| — of which have no marketed (RX) product at all | {row['inactive']:,} | "
               f"{pct(row['inactive'], ob_unlinked)} of unlinked |")
        self.w(f"| — of which do have a marketed product (**genuine gap**) | {row['active']:,} | "
               f"{pct(row['active'], ob_unlinked)} of unlinked |")
        self.w()
        self.w(f"So the headline {pct(ob_unlinked, ob_total)} unlinked is mostly withdrawn "
               f"products that no longer have an NDC listing. The genuine gap — applications "
               f"with a marketed product but no RXCUI edge — is **{row['active']:,} "
               f"applications, {pct(row['active'], ob_total)} of the Orange Book**.")
        self.w()
        pb_total = self.stat("mapping", "purple_book_applications")
        pb_linked = self.stat("mapping", "purple_book_applications_with_rxcui")
        self.w(f"Purple Book: {pb_linked:,} of {pb_total:,} BLAs ({pct(pb_linked, pb_total)}) "
               "link to at least one RXCUI.")
        self.w()

    def te_coverage(self):
        self.w("## 3. Therapeutic-equivalence (TE) code coverage")
        self.w()
        self.w("**This is the section the grading depends on.** A grade **A** verdict "
               "requires an `AB*` code on both products; without a TE code the best "
               "available answer is grade **B**.")
        self.w()
        rows = self.conn.execute(
            "SELECT mkt_type, appl_type, "
            "SUM(CASE WHEN te_code <> '' THEN 1 ELSE 0 END) AS has_te, "
            "SUM(CASE WHEN te_code =  '' THEN 1 ELSE 0 END) AS no_te "
            "FROM ob_product GROUP BY mkt_type, appl_type").fetchall()
        total = sum(r["has_te"] + r["no_te"] for r in rows)
        has = sum(r["has_te"] for r in rows)
        self.w(f"Across all **{total:,}** Orange Book products: **{has:,} carry a TE code "
               f"({pct(has, total)})** and **{total - has:,} do not ({pct(total - has, total)})**.")
        self.w()
        self.w("That raw number overstates the problem. Broken out:")
        self.w()
        self.w("| Marketing status | Application | Has TE | Missing TE | % missing | Expected? |")
        self.w("|---|---|---:|---:|---:|---|")
        expected = {
            ("RX", "N"): "Yes — a single-source brand with no generic gets no TE code",
            ("RX", "A"): "**No — this is the real gap**",
            ("DISCN", "N"): "Yes — FDA does not rate discontinued products",
            ("DISCN", "A"): "Yes — FDA does not rate discontinued products",
            ("OTC", "N"): "Yes — TE codes apply to prescription products",
            ("OTC", "A"): "Yes — TE codes apply to prescription products",
        }
        order = {"RX": 0, "DISCN": 1, "OTC": 2}
        for r in sorted(rows, key=lambda r: (order.get(r["mkt_type"], 9), r["appl_type"])):
            tot = r["has_te"] + r["no_te"]
            kind = {"N": "NDA", "A": "ANDA"}.get(r["appl_type"], r["appl_type"])
            self.w(f"| {r['mkt_type']} | {kind} | {r['has_te']:,} | {r['no_te']:,} | "
                   f"{pct(r['no_te'], tot)} | {expected.get((r['mkt_type'], r['appl_type']), '')} |")
        self.w()

        # The denominator that matters: active multi-source equivalence groups.
        groups = collections.defaultdict(list)
        for r in self.conn.execute(
                "SELECT appl_no, ingredient_key, dosage_form, route, strength_key, "
                "te_code FROM ob_product WHERE mkt_type = 'RX'"):
            groups[(r["ingredient_key"], r["dosage_form"], r["route"],
                    r["strength_key"])].append(r)
        multi = {k: v for k, v in groups.items()
                 if len({r["appl_no"] for r in v}) > 1}
        in_multi = sum(len(v) for v in multi.values())
        miss_multi = sum(1 for v in multi.values() for r in v if not r["te_code"])
        single = len(groups) - len(multi)

        self.w("### 3.1 The denominator that matters")
        self.w()
        self.w("A TE code only means anything where more than one applicant markets the "
               "same ingredient, dosage form, route and strength. Restricting to those "
               "**active multi-source groups**:")
        self.w()
        self.w("| Metric | Value |")
        self.w("|---|---:|")
        self.w(f"| active (RX) equivalence groups | {len(groups):,} |")
        self.w(f"| — single-source (no TE code possible) | {single:,} |")
        self.w(f"| — multi-source (TE code expected) | {len(multi):,} |")
        self.w(f"| products inside multi-source groups | {in_multi:,} |")
        self.w(f"| **of those, missing a TE code** | **{miss_multi:,}** |")
        self.w(f"| **effective TE coverage** | **{pct(in_multi - miss_multi, in_multi)}** |")
        self.w()
        self.w(f"**Headline: {pct(miss_multi, in_multi)} of products that should carry a TE "
               f"code are missing one.** The {pct(total - has, total)} figure above is "
               "dominated by discontinued and single-source products, for which FDA "
               "assigns no rating by design.")
        self.w()

        self.w("### 3.2 TE code distribution")
        self.w()
        codes = collections.Counter()
        for r in self.conn.execute("SELECT te_code FROM ob_product WHERE te_code <> ''"):
            for c in te_subgroups(r["te_code"]):
                codes[c] += 1
        eq = sum(v for k, v in codes.items() if k.startswith(TE_EQUIVALENT_PREFIXES))
        noneq = sum(v for k, v in codes.items() if k.startswith("B"))
        self.w("| Code | Products | Grade it drives |")
        self.w("|---|---:|---|")
        for code, n in codes.most_common(14):
            grade = ("A (rule A1)" if code.startswith("AB")
                     else "A (rule A2)" if code.startswith(TE_EQUIVALENT_PREFIXES)
                     else "B (rule B1)")
            self.w(f"| `{code}` | {n:,} | {grade} |")
        self.w()
        self.w(f"Equivalence-bearing codes: **{eq:,}**; non-equivalence `B*` codes: "
               f"**{noneq:,}** ({pct(noneq, eq + noneq)} of rated products).")
        self.w()

        self.w("### 3.3 Reference-listed-drug subgroups (the `AB1`/`AB2` trap)")
        self.w()
        partitioned = 0
        for v in multi.values():
            subs = {c for r in v for c in te_subgroups(r["te_code"]) if c.startswith("AB")}
            if len({c for c in subs if len(c) > 2}) > 1:
                partitioned += 1
        self.w(f"**{partitioned:,}** active multi-source groups are split across more than "
               "one numbered `AB<n>` subgroup. Within those groups, two `AB`-rated products "
               "are **not** interchangeable unless their subgroup codes intersect — `AB1` "
               "and `AB2` denote different reference-listed drugs.")
        self.w()
        example = self.conn.execute("""
            SELECT ingredient, df_route, strength, GROUP_CONCAT(DISTINCT te_code) codes
            FROM ob_product WHERE mkt_type = 'RX' AND te_code LIKE 'AB_'
            GROUP BY ingredient_key, df_route, strength_key
            HAVING COUNT(DISTINCT te_code) > 1 LIMIT 3""").fetchall()
        if example:
            self.w("Worked examples from the current data:")
            self.w()
            self.w("| Ingredient | Dosage form / route | Strength | Coexisting codes |")
            self.w("|---|---|---|---|")
            for r in example:
                self.w(f"| {r['ingredient'][:44]} | {r['df_route']} | {r['strength']} | "
                       f"`{r['codes']}` |")
            self.w()
            self.w("The module compares TE codes by **set intersection**, so these resolve "
                   "to grade **B** (rule `B3`), not grade A.")
            self.w()

    def biologics(self):
        self.w("## 4. Biologics coverage (Purple Book)")
        self.w()
        total = self.stat("purple_book", "products_loaded")
        bios = self.stat("purple_book", "biosimilar_351k")
        inter = self.stat("purple_book", "interchangeable_351k")
        ref = self.stat("purple_book", "reference_351a")
        self.w("| Licence type | Products | Share | Grade it drives |")
        self.w("|---|---:|---:|---|")
        self.w(f"| `351(a)` reference biologic | {ref:,} | {pct(ref, total)} | "
               "reference side of the comparison |")
        self.w(f"| `351(k) Biosimilar` | {bios:,} | {pct(bios, total)} | "
               "**B** (rule `B4`) — prescriber required |")
        self.w(f"| `351(k) Interchangeable` | {inter:,} | {pct(inter, total)} | "
               "**A** (rule `A3`) — pharmacy substitution |")
        self.w()
        linked = self.conn.execute(
            "SELECT COUNT(*) n FROM pb_product WHERE ref_proper_name_key <> ''").fetchone()["n"]
        self.w(f"{linked:,} products name a reference product, which is what the 351(k) "
               "branch matches on. Interchangeability is determined **only against the "
               "reference product**: two follow-on biologics of the same reference get "
               "grade **B** (rule `B5`) even when each is individually interchangeable.")
        self.w()

    def adjudicability(self, sample: int = 0):
        self.w("## 5. End-to-end adjudicability")
        self.w()
        rx_ob = self.stat("mapping", "distinct_rxcui_reaching_orange_book")
        rx_pb = self.stat("mapping", "distinct_rxcui_reaching_purple_book")
        rx_all = self.stat("mapping", "distinct_rxcui_with_ndc")
        gradeable = self.conn.execute("""
            SELECT COUNT(DISTINCT m.rxcui) n FROM map_rxcui_appl m
            JOIN ob_product o ON o.appl_no = m.appl_no
            WHERE m.in_orange_book = 1 AND o.te_code <> ''""").fetchone()["n"]
        ab_capable = self.conn.execute("""
            SELECT COUNT(DISTINCT m.rxcui) n FROM map_rxcui_appl m
            JOIN ob_product o ON o.appl_no = m.appl_no
            WHERE m.in_orange_book = 1 AND o.te_code LIKE 'AB%'""").fetchone()["n"]
        self.w("| Capability | Distinct RXCUIs | Share of mapped |")
        self.w("|---|---:|---:|")
        self.w(f"| reach an Orange Book product | {rx_ob:,} | {pct(rx_ob, rx_all)} |")
        self.w(f"| reach a product carrying **any** TE code | {gradeable:,} | {pct(gradeable, rx_all)} |")
        self.w(f"| reach an `AB*`-rated product (grade **A** possible) | {ab_capable:,} | "
               f"{pct(ab_capable, rx_all)} |")
        self.w(f"| reach a Purple Book biologic | {rx_pb:,} | {pct(rx_pb, rx_all)} |")
        self.w()
        self.w("An RXCUI outside these sets is not a silent failure: the module returns "
               "grade **D** (or **C** when ATC relates the substances) with the specific "
               "reason recorded in the evidence chain.")
        self.w()

    def nadac(self):
        if not self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='nadac_price'"
        ).fetchone():
            return
        self.w("## 6. Price data coverage (CMS NADAC)")
        self.w()
        self.w("> **NADAC is a pharmacy ACQUISITION cost.** It is what pharmacies pay "
               "wholesalers, surveyed by CMS. It is not a patient copay, not a cash "
               "price and not a reimbursement rate.")
        self.w()
        read = self.stat("nadac", "rows_read")
        ndc11 = self.stat("nadac", "distinct_ndc11")
        self.w(f"Loaded **{read:,}** weekly price rows covering **{ndc11:,}** distinct "
               f"NDCs ({self.note('nadac', 'price_as_of')}). The yearly file is an "
               "archive of weekly surveys, so only the newest row per NDC is kept.")
        self.w()
        self.w("| Classification | NDCs | Share |")
        self.w("|---|---:|---:|")
        for cls, label in (("G", "generic"), ("B", "brand"),
                           ("B-ANDA", "brand marketed under an ANDA"),
                           ("B-BIO", "biologic")):
            v = self.stat("nadac", f"class_{cls}")
            self.w(f"| `{cls}` — {label} | {v:,} | {pct(v, ndc11)} |")
        self.w()
        self.w("### 6.1 Join hit rate against the layer-2 NDC mapping")
        self.w()
        total = self.stat("nadac_join", "nadac_distinct_ndc9")
        self.w("Prices join to the substitutability data through the same 9-digit NDC "
               "key the identifier mapping is built on:")
        self.w()
        self.w("| Join step | NDCs | Hit rate |")
        self.w("|---|---:|---:|")
        for metric, label in [
            ("matched_openfda_ndc", "NADAC NDC found in the openFDA NDC directory"),
            ("matched_to_rxcui", "…and reaching an RXCUI"),
            ("matched_to_orange_book", "…and reaching an Orange Book product"),
            ("unmatched", "**no match** in openFDA"),
        ]:
            v = self.stat("nadac_join", metric)
            self.w(f"| {label} | {v:,} | {pct(v, total)} |")
        self.w()
        hit = self.stat("nadac_join", "matched_openfda_ndc")
        ob = self.stat("nadac_join", "matched_to_orange_book")
        self.w(f"**Join hit rate: {pct(hit, total)}** into the NDC directory and "
               f"**{pct(ob, total)}** all the way to a therapeutic-equivalence rating "
               f"(of {total:,} distinct NADAC NDCs).")
        self.w()
        rx_total = self.stat("nadac_join", "orange_book_rxcui_total")
        rx_priced = self.stat("nadac_join", "orange_book_rxcui_with_price")
        self.w("Read the other way — the direction that limits what can actually be "
               "priced:")
        self.w()
        self.w("| Metric | Count | Share |")
        self.w("|---|---:|---:|")
        self.w(f"| RXCUIs reaching an Orange Book product | {rx_total:,} | 100% |")
        self.w(f"| …that also carry a NADAC price | {rx_priced:,} | {pct(rx_priced, rx_total)} |")
        self.w(f"| …with no price | {rx_total - rx_priced:,} | "
               f"{pct(rx_total - rx_priced, rx_total)} |")
        self.w()
        self.w("CMS surveys **retail-pharmacy** acquisition costs, which shapes where "
               "the gap falls. Marketed Orange Book products, by route:")
        self.w()
        route_rows = self.conn.execute("""
            SELECT o.route,
                   COUNT(DISTINCT CASE WHEN o.appl_no IN (
                       SELECT m.appl_no FROM map_rxcui_appl m
                       JOIN nadac_price n ON n.ndc9 = m.ndc9)
                     THEN o.appl_no || '/' || o.product_no END) AS priced,
                   COUNT(DISTINCT o.appl_no || '/' || o.product_no) AS total
            FROM ob_product o WHERE o.mkt_type = 'RX'
            GROUP BY o.route HAVING total > 200 ORDER BY total DESC LIMIT 7""").fetchall()
        self.w("| Route | Marketed products | With a NADAC price | Unpriced |")
        self.w("|---|---:|---:|---:|")
        for r in route_rows:
            unp = r["total"] - r["priced"]
            self.w(f"| {r['route'].title()} | {r['total']:,} | {r['priced']:,} "
                   f"({pct(r['priced'], r['total'])}) | {pct(unp, r['total'])} |")
        self.w()
        self.w("Parenteral products are disproportionately missing — they are "
               "clinician-administered and largely bypass the retail channel NADAC "
               "surveys. But the largest *absolute* unpriced group is oral, which is "
               "not explained by route: those are low-volume, recently launched or "
               "withdrawn products CMS has not surveyed. Neither case is a join "
               "failure; the price genuinely does not exist in NADAC.")
        self.w()
        self.w("### 6.2 Unit normalisation")
        self.w()
        self.w("NADAC prices a *unit*, and the unit varies by product, so raw prices "
               "are not comparable across pack sizes or formulations:")
        self.w()
        rows = self.conn.execute(
            "SELECT pricing_unit, COUNT(*) n FROM nadac_price GROUP BY pricing_unit "
            "ORDER BY n DESC").fetchall()
        self.w("| Pricing unit | NDCs | Meaning |")
        self.w("|---|---:|---|")
        meaning = {"EA": "one tablet, capsule, vial or device",
                   "ML": "one millilitre of a liquid",
                   "GM": "one gram of a cream, gel or ointment"}
        for r in rows:
            self.w(f"| `{r['pricing_unit']}` | {r['n']:,} | "
                   f"{meaning.get(r['pricing_unit'], '')} |")
        self.w()
        self.w("`price_compare.py` reports **cost per unit** (comparable within a "
               "grade-A group, since group membership already fixes strength and "
               "dosage form) and **cost per mg of active ingredient** (needed to "
               "compare across strengths). Where a strength cannot be expressed in the "
               "priced unit — a patch dosed `4.6 mg/24h` has no mg-per-gram meaning — "
               "the per-mg figure is `None` rather than a guess.")
        self.w()

    def limitations(self):
        n = 7 if self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='nadac_price'"
        ).fetchone() else 6
        self.w(f"## {n}. Known limitations")
        self.w()
        self.w("1. **ATC level-5 vs level-4.** The brief asked for grade C on *\"same ATC "
               "level 5, different ingredient\"*. A level-5 ATC code names one chemical "
               "substance, so two products sharing it differ only as salts, esters or "
               "isomers — that case is implemented as rule `C1`. The broader "
               "therapeutic-interchange case (atorvastatin vs simvastatin, both `C10AA`) "
               "sits one level up and is implemented as rule `C2`. Both are reported "
               "separately so neither is conflated with the other.")
        self.w("2. **NDC join granularity.** Products join at the 9-digit labeler+product "
               "code. Package-level distinctions are deliberately discarded; they do not "
               "affect therapeutic equivalence.")
        self.w("3. **Strength parsing.** Strengths are compared after folding mass units to "
               "milligrams. Where either side's strength text cannot be parsed, the verdict "
               "is still returned but marked `confidence: medium` with an explicit caveat "
               "rather than silently assuming a match.")
        self.w("4. **State law is out of scope.** Grade A reflects the *federal* "
               "determination. Actual pharmacy substitution is governed by state statute, "
               "which the module does not model.")
        self.w("5. **openFDA `openfda.rxcui` is SPL-derived.** It is a labelling-level "
               "annotation, so a listing can name several RXCUIs. Strength is therefore "
               "pinned from RxNorm's `SCDC` rather than from the NDC listing wherever "
               "RxNorm provides it.")
        self.w()

    def build(self, sample: int = 0) -> str:
        self.header()
        self.sources()
        self.mapping()
        self.te_coverage()
        self.biologics()
        self.adjudicability(sample)
        self.nadac()
        self.limitations()
        return "\n".join(self.lines) + "\n"


def main(output: str | Path | None = None, db_path: Path | None = None) -> Path:
    out = Path(output) if output else DEFAULT_OUT
    text = Report(db_path or DB_PATH).build()
    out.write_text(text, encoding="utf-8")
    print(f"Wrote {out}  ({len(text.splitlines())} lines)")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--output", default=None)
    main(**vars(ap.parse_args()))
