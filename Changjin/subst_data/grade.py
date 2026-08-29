"""Graded substitutability adjudication with a per-field evidence chain.

Grades
------
``A``  FDA-rated therapeutically equivalent (Orange Book ``AB*``) or FDA-designated
       *interchangeable* biologic (Purple Book ``351(k) Interchangeable``).
       A pharmacist may substitute without contacting the prescriber, subject to
       state substitution law.
``B``  Same active ingredient and dosage form, but FDA has **not** granted
       therapeutic equivalence -- a ``B*`` rating, an unrated product, or two
       products sitting in different ``AB<n>`` subgroups.  Not auto-substitutable.
``C``  Different active ingredient, but therapeutically related through WHO ATC
       (same level-5 substance class, or same level-4 chemical subgroup).
       Requires a prescribing decision.
``D``  No substitutability relationship found in the authoritative sources.

Every verdict carries :class:`Evidence` rows naming the source file, the record
key and the exact field the conclusion was drawn from, so a reviewer can open
``products.txt`` at that application number and check it by hand.
"""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field, asdict
from pathlib import Path

try:
    from .ndcutil import normalize_ndc9
    from . import rxnav
except ImportError:                                   # direct script execution
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from subst_data.ndcutil import normalize_ndc9
    from subst_data import rxnav

DB_PATH = Path(__file__).resolve().parent / "cache" / "substitutability.sqlite"

#: Orange Book codes that mean "FDA considers these therapeutically equivalent".
#: ``AB`` is the code the pharmacy-substitution rule keys on; the others are
#: equally equivalent but apply to specific formulation classes.
TE_EQUIVALENT_PREFIXES = ("AB", "AA", "AN", "AO", "AP", "AT")

#: Meaning of the non-equivalent ``B*`` ratings, quoted for the evidence chain.
TE_B_MEANING = {
    "BC": "extended-release dosage form; bioequivalence not established",
    "BD": "documented bioequivalence problem",
    "BE": "delayed-release oral dosage form; not shown equivalent",
    "BN": "product in an aerosol nebuliser system; not shown equivalent",
    "BP": "potential bioequivalence problem",
    "BR": "suppository/enema for systemic use; not shown equivalent",
    "BS": "product with a standard deficiency",
    "BT": "topical product with bioequivalence issues",
    "BX": "insufficient data to determine therapeutic equivalence",
    "B*": "under FDA review for a potential bioequivalence problem",
}

_GRADE_ACTION = {
    "A": "Pharmacist may substitute directly (subject to state substitution law).",
    "B": "Not automatically substitutable; prescriber authorisation required.",
    "C": "Therapeutically related only; requires a prescribing decision.",
    "D": "No substitutability relationship established.",
}

_UNIT_TO_MG = {"MG": 1.0, "G": 1000.0, "GM": 1000.0, "MCG": 0.001, "UG": 0.001, "NG": 1e-6}
_STRENGTH_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(MG|MCG|UG|NG|GM|G|%|UNIT|UNITS|IU|MEQ|ML)\b")


@dataclass
class Evidence:
    """One traceable assertion: which file, which record, which field."""

    source: str
    file: str
    record: str
    field: str
    value: str
    note: str = ""

    def __str__(self) -> str:
        tail = f"  -- {self.note}" if self.note else ""
        return f"[{self.source}] {self.file}:{self.record} {self.field}={self.value!r}{tail}"


@dataclass
class Verdict:
    grade: str
    rule_id: str
    label: str
    action: str
    confidence: str
    rxcui_a: str
    rxcui_b: str
    name_a: str | None = None
    name_b: str | None = None
    evidence: list[Evidence] = field(default_factory=list)
    caveats: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["evidence"] = [asdict(e) for e in self.evidence]
        return d

    def explain(self) -> str:
        lines = [
            f"Grade {self.grade}  ({self.rule_id}: {self.label})",
            f"  {self.rxcui_a} {self.name_a or '?'}",
            f"  {self.rxcui_b} {self.name_b or '?'}",
            f"  action     : {self.action}",
            f"  confidence : {self.confidence}",
        ]
        if self.caveats:
            lines.append("  caveats    :")
            lines += [f"    ! {c}" for c in self.caveats]
        lines.append("  evidence chain:")
        lines += [f"    {i + 1}. {e}" for i, e in enumerate(self.evidence)]
        return "\n".join(lines)


def parse_strength(text: str | None) -> frozenset:
    """Extract comparable (amount, unit) pairs from a free-text strength.

    Handles the three spellings the sources use for the same thing:
    Orange Book ``"EQ 40MG BASE"``, openFDA ``"40 mg/1"``, RxNorm ``"atorvastatin 40 MG"``.
    Amounts in mass units are folded to milligrams so ``1 G`` == ``1000 MG``.
    """
    if not text:
        return frozenset()
    out = set()
    for amount, unit in _STRENGTH_RE.findall(text.upper()):
        value, unit = float(amount), unit.upper()
        if unit in _UNIT_TO_MG:
            out.add((round(value * _UNIT_TO_MG[unit], 9), "MG"))
        elif unit == "ML":
            continue                    # a volume denominator, not a strength
        else:
            out.add((round(value, 9), "UNITS" if unit in ("UNIT", "UNITS", "IU") else unit))
    return frozenset(out)


#: Orange Book writes "CAPSULE, DELAYED REL PELLETS"; RxNorm writes "Delayed
#: Release Oral Capsule". Only the head noun and a few release qualifiers are
#: reliably comparable, and that is enough to keep the forms that matter apart.
_FORM_WORDS = ("CAPSULE", "TABLET", "SOLUTION", "SUSPENSION", "CREAM", "OINTMENT",
               "GEL", "LOTION", "PATCH", "INJECTABLE", "INJECTION", "AEROSOL",
               "POWDER", "SUPPOSITORY", "FILM", "GRANULE", "SYRUP", "ELIXIR",
               "IMPLANT", "INSERT", "SPRAY", "FOAM", "PASTE", "SHAMPOO")

#: Qualifiers that change how a product is taken and must agree on both sides.
_FORM_QUALIFIERS = ("DISINTEGRATING", "CHEWABLE", "EXTENDED RELEASE",
                    "DELAYED RELEASE", "SUBLINGUAL", "BUCCAL", "EFFERVESCENT")


#: The Orange Book abbreviates release qualifiers ("DELAYED REL PELLETS");
#: RxNorm spells them out. Expand before comparing or every delayed-release
#: capsule looks incompatible with itself.
_OB_ABBREV = (
    ("DELAYED REL", "DELAYED RELEASE"),
    ("EXTENDED REL", "EXTENDED RELEASE"),
    ("EXT REL", "EXTENDED RELEASE"),
)


def _expand_ob_form(ob_dosage_form: str) -> str:
    out = ob_dosage_form.upper()
    for short, long in _OB_ABBREV:
        if long not in out:
            out = out.replace(short, long)
    return out


def dose_form_compatible(rxnorm_forms, ob_dosage_form: str | None) -> bool:
    """Is an Orange Book dosage form consistent with RxNorm's dose form?

    Prevacid 30 MG exists as a delayed-release *capsule* (NDA020406) and as an
    orally disintegrating *tablet* (NDA021428). Both are AB-rated at 30 mg, but
    they are not substitutable for one another, and the NDC-to-application
    mapping happily returns both for one RXCUI. Without this check the pipeline
    offers a capsule as an equivalent for an ODT.

    Returns True when RxNorm is silent -- an unknown form must not silently
    exclude everything.
    """
    if not rxnorm_forms or not ob_dosage_form:
        return True
    ob = _expand_ob_form(ob_dosage_form)
    rx = " ".join(rxnorm_forms).upper()

    ob_head = next((w for w in _FORM_WORDS if w in ob), None)
    if ob_head:
        # "INJECTABLE" and "INJECTION" name the same thing across the sources.
        heads = {ob_head}
        if ob_head in ("INJECTABLE", "INJECTION"):
            heads = {"INJECTABLE", "INJECTION"}
        if not any(h in rx for h in heads):
            return False
    for qualifier in _FORM_QUALIFIERS:
        if (qualifier in ob) != (qualifier in rx):
            return False
    return True


def te_subgroups(te_code: str | None) -> set[str]:
    """Split an Orange Book TE cell into its individual codes.

    A product may hold several (``"AB1,AB2,AB3,AB4"``).  Two products are
    equivalent only if their code sets intersect: ``AB1`` and ``AB2`` mark
    *different* reference-listed-drug groups and are deliberately not
    interchangeable, which is the trap this function exists to avoid.
    """
    if not te_code:
        return set()
    return {c.strip().upper() for c in te_code.split(",") if c.strip()}


def _is_equivalent_code(code: str) -> bool:
    return code.startswith(TE_EQUIVALENT_PREFIXES)


@dataclass
class Side:
    """Everything known about one input RXCUI, resolved across all sources."""

    rxcui: str
    concept: rxnav.Concept
    ndc9: tuple[str, ...] = ()
    ob_rows: list[sqlite3.Row] = field(default_factory=list)
    pb_rows: list[sqlite3.Row] = field(default_factory=list)
    strengths: frozenset = frozenset()
    strength_source: str | None = None
    evidence: list[Evidence] = field(default_factory=list)

    @property
    def is_ingredient_level(self) -> bool:
        """True when the input names a substance rather than a specific product."""
        return self.concept.tty in rxnav.INGREDIENT_TTYS

    @property
    def is_biologic(self) -> bool:
        return bool(self.pb_rows)


class Adjudicator:
    """Resolves two RXCUIs against the FDA sources and grades the pair."""

    def __init__(self, db_path: Path | None = None, backend=None, offline: bool = False):
        self.db_path = Path(db_path or DB_PATH)
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"{self.db_path} not found -- run `python substitutability.py build` first"
            )
        self.conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        self.conn.row_factory = sqlite3.Row
        self.rx = backend or rxnav.get_backend(offline=offline)

    # -- resolution --------------------------------------------------------
    def resolve(self, rxcui: str) -> Side:
        rxcui = str(rxcui).strip()
        concept = self.rx.concept(rxcui)
        side = Side(rxcui=rxcui, concept=concept)

        for p in concept.provenance:
            side.evidence.append(Evidence(
                source=p["source"], file=p["endpoint"], record=rxcui,
                field=p["field"], value=str(p["value"])))

        if not concept.found:
            return side

        # RXCUI -> NDC.  Prefer the local mapping table; fall back to RxNorm's
        # own NDC list for concepts the openFDA directory does not carry.
        cuis = {rxcui, *concept.products}
        placeholders = ",".join("?" * len(cuis))
        rows = self.conn.execute(
            f"SELECT DISTINCT ndc9 FROM ndc_rxcui WHERE rxcui IN ({placeholders})",
            tuple(cuis),
        ).fetchall()
        ndc9 = {r["ndc9"] for r in rows}
        if ndc9:
            side.evidence.append(Evidence(
                source="openFDA NDC Directory", file="drug-ndc-0001-of-0001.json",
                record=f"rxcui={rxcui}", field="openfda.rxcui -> product_ndc",
                value=f"{len(ndc9)} NDC(s)",
                note="RXCUI->NDC edge used to reach the FDA application number"))
        else:
            ndc9 = set(concept.ndc9)
            if ndc9:
                side.evidence.append(Evidence(
                    source="RxNorm", file="rxcui/{}/ndcs".format(rxcui),
                    record=f"rxcui={rxcui}", field="ndcGroup.ndcList.ndc",
                    value=f"{len(ndc9)} NDC(s)",
                    note="openFDA had no edge for this RXCUI; used RxNorm's NDC list"))
        side.ndc9 = tuple(sorted(ndc9))

        # RxNorm's SCDC ("atorvastatin 40 MG") is the authoritative strength for
        # this concept. It must PIN the comparison: an SPL's openfda.rxcui block
        # can name several strengths, so unioning in NDC-derived strengths would
        # let 10 MG Orange Book rows satisfy a 40 MG query.
        side.strengths = frozenset().union(
            *(parse_strength(s) for s in concept.strengths)) if concept.strengths else frozenset()
        side.strength_source = "RxNorm SCDC" if side.strengths else None

        if side.ndc9:
            self._attach_products(side)
        return side

    def _attach_products(self, side: Side) -> None:
        ph = ",".join("?" * len(side.ndc9))
        ndc_rows = self.conn.execute(
            f"SELECT * FROM ndc_product WHERE ndc9 IN ({ph})", side.ndc9
        ).fetchall()

        appl_nos = {r["appl_no"] for r in ndc_rows if r["appl_no"]}
        if not appl_nos:
            return

        # Strength evidence from the NDC listing supplements RxNorm's SCDC text.
        ndc_strengths = set()
        for r in ndc_rows:
            for ing in json.loads(r["active_ingredients"] or "[]"):
                ndc_strengths |= parse_strength(ing.get("strength"))
        if ndc_strengths and not side.strengths:
            # Only when RxNorm gave us nothing to pin against.
            side.strengths = frozenset(ndc_strengths)
            side.strength_source = "openFDA active_ingredients"

        # Cite one concrete NDC record verbatim so a reviewer can look it up,
        # then state the full application set separately rather than pinning the
        # sampled row's marketing_category onto applications it does not cover.
        sample = next((r for r in ndc_rows if r["appl_no"]), next(iter(ndc_rows)))
        side.evidence.append(Evidence(
            source="openFDA NDC Directory", file="drug-ndc-0001-of-0001.json",
            record=sample["product_ndc"], field="application_number",
            value=str(sample["appl_no"]),
            note=f"marketing_category={sample['marketing_category']}"))
        if len(appl_nos) > 1:
            side.evidence.append(Evidence(
                source="openFDA NDC Directory", file="drug-ndc-0001-of-0001.json",
                record=f"rxcui={side.rxcui}", field="application_number (all NDCs)",
                value=", ".join(sorted(appl_nos)[:6]) + ("..." if len(appl_nos) > 6 else ""),
                note=f"{len(appl_nos)} applications reachable from this concept's "
                     f"{len(ndc_rows)} NDC listings"))

        ph = ",".join("?" * len(appl_nos))
        side.ob_rows = self.conn.execute(
            f"SELECT * FROM ob_product WHERE appl_no IN ({ph})", tuple(appl_nos)
        ).fetchall()
        side.pb_rows = self.conn.execute(
            f"SELECT * FROM pb_product WHERE appl_no IN ({ph})", tuple(appl_nos)
        ).fetchall()

        # Narrow Orange Book rows to those matching this concept's strength.
        if side.strengths and side.ob_rows:
            narrowed = [r for r in side.ob_rows
                        if parse_strength(r["strength"]) & side.strengths]
            if narrowed:
                side.ob_rows = narrowed

        # ... and to those whose dosage form RxNorm agrees with. An RXCUI's NDC
        # set can span several applications, and for lansoprazole 30 MG those
        # applications are a delayed-release capsule and an orally
        # disintegrating tablet -- both AB-rated, not interchangeable.
        if side.concept.dose_forms and side.ob_rows:
            narrowed = [r for r in side.ob_rows
                        if dose_form_compatible(side.concept.dose_forms, r["dosage_form"])]
            if narrowed:
                side.ob_rows = narrowed

    # -- grading -----------------------------------------------------------
    def judge(self, rxcui_a: str, rxcui_b: str) -> Verdict:
        a, b = self.resolve(rxcui_a), self.resolve(rxcui_b)
        ev = a.evidence + b.evidence

        ingredient_level = [s.rxcui for s in (a, b) if s.is_ingredient_level]

        def verdict(grade, rule, label, extra=(), caveats=(), confidence="high", details=None):
            caveats = list(caveats)
            if ingredient_level and grade in ("A", "B"):
                caveats.append(
                    f"RXCUI {', '.join(ingredient_level)} is ingredient-level, so this "
                    "verdict is not specific to a strength or dosage form; re-run with "
                    "SCD/SBD concepts before acting on it.")
            return Verdict(
                grade=grade, rule_id=rule, label=label, action=_GRADE_ACTION[grade],
                confidence=confidence, rxcui_a=a.rxcui, rxcui_b=b.rxcui,
                name_a=a.concept.name, name_b=b.concept.name,
                evidence=ev + list(extra), caveats=caveats,
                details=details or {})

        for side in (a, b):
            if not side.concept.found:
                return verdict("D", "D0", f"RXCUI {side.rxcui} not found in RxNorm",
                               caveats=[f"{side.rxcui} did not resolve; cannot adjudicate."],
                               confidence="high")

        for side in (a, b):
            if side.is_ingredient_level:
                ev.append(Evidence(
                    source="RxNorm", file=f"/REST/rxcui/{side.rxcui}/properties.json",
                    record=side.rxcui, field="tty", value=str(side.concept.tty),
                    note="ingredient-level concept: covers every strength and dosage "
                         "form of this substance, not one dispensable product"))

        if a.rxcui == b.rxcui:
            return verdict("A", "A0", "identical RxNorm concept",
                           caveats=["Same RXCUI on both sides -- trivially substitutable."])

        # Biologics are governed by the Purple Book, not the Orange Book.
        if a.is_biologic or b.is_biologic:
            v = self._judge_biologic(a, b, verdict)
            if v:
                return v

        v = self._judge_orange_book(a, b, verdict)
        if v:
            return v

        return self._judge_atc(a, b, verdict)

    # -- Orange Book branch ------------------------------------------------
    def _judge_orange_book(self, a: Side, b: Side, verdict):
        if not (a.ob_rows and b.ob_rows):
            return None

        best = None            # (rank, grade, rule, label, evidence, caveats, confidence)
        for ra in a.ob_rows:
            for rb in b.ob_rows:
                if ra["appl_no"] == rb["appl_no"] and ra["product_no"] == rb["product_no"]:
                    continue
                if ra["ingredient_key"] != rb["ingredient_key"]:
                    continue
                if ra["dosage_form"] != rb["dosage_form"] or ra["route"] != rb["route"]:
                    continue

                sa, sb = parse_strength(ra["strength"]), parse_strength(rb["strength"])
                strength_known = bool(sa and sb)
                if strength_known and sa != sb:
                    continue

                caveats = []
                confidence = "high"
                if not strength_known:
                    confidence = "medium"
                    caveats.append(
                        "Strength text could not be parsed on one side "
                        f"({ra['strength']!r} vs {rb['strength']!r}); "
                        "verify the strengths match before substituting.")

                ta, tb = te_subgroups(ra["te_code"]), te_subgroups(rb["te_code"])
                base_ev = [
                    self._ob_ev(ra, "Ingredient", ra["ingredient"]),
                    self._ob_ev(ra, "DF;Route", ra["df_route"]),
                    self._ob_ev(ra, "Strength", ra["strength"]),
                    self._ob_ev(ra, "TE_Code", ra["te_code"] or "(none)"),
                    self._ob_ev(ra, "RLD/RS", f"RLD={ra['rld']} RS={ra['rs']}"),
                    self._ob_ev(rb, "Ingredient", rb["ingredient"]),
                    self._ob_ev(rb, "DF;Route", rb["df_route"]),
                    self._ob_ev(rb, "Strength", rb["strength"]),
                    self._ob_ev(rb, "TE_Code", rb["te_code"] or "(none)"),
                    self._ob_ev(rb, "RLD/RS", f"RLD={rb['rld']} RS={rb['rs']}"),
                ]
                details = {
                    "a_appl_no": ra["appl_no"], "a_product_no": ra["product_no"],
                    "a_te_code": ra["te_code"], "a_trade_name": ra["trade_name"],
                    "b_appl_no": rb["appl_no"], "b_product_no": rb["product_no"],
                    "b_te_code": rb["te_code"], "b_trade_name": rb["trade_name"],
                    "ingredient": ra["ingredient"], "df_route": ra["df_route"],
                }

                shared = ta & tb
                shared_ab = {c for c in shared if c.startswith("AB")}
                shared_other = {c for c in shared if _is_equivalent_code(c) and c not in shared_ab}

                if shared_ab:
                    cand = (0, "A", "A1",
                            f"Orange Book therapeutic equivalence {sorted(shared_ab)} "
                            f"on the same reference-listed drug",
                            base_ev + [Evidence(
                                "FDA Orange Book", "products.txt",
                                f"{ra['appl_no']}/{ra['product_no']} vs {rb['appl_no']}/{rb['product_no']}",
                                "TE_Code intersection", ", ".join(sorted(shared_ab)),
                                "both products carry the same AB subgroup -> same RLD, "
                                "FDA-rated therapeutically equivalent")],
                            caveats, confidence, details)
                elif shared_other:
                    cand = (1, "A", "A2",
                            f"Orange Book therapeutic equivalence {sorted(shared_other)} "
                            "(non-AB equivalence class)",
                            base_ev + [Evidence(
                                "FDA Orange Book", "products.txt",
                                f"{ra['appl_no']}/{ra['product_no']} vs {rb['appl_no']}/{rb['product_no']}",
                                "TE_Code intersection", ", ".join(sorted(shared_other)),
                                "A-series code other than AB (AA/AN/AO/AP/AT): FDA still "
                                "rates these therapeutically equivalent")],
                            caveats, confidence, details)
                elif (ta and tb and all(_is_equivalent_code(c) for c in ta | tb)):
                    codes = f"{sorted(ta)} vs {sorted(tb)}"
                    cand = (2, "B", "B3",
                            "same ingredient and dosage form, but different TE subgroups "
                            "(different reference-listed drugs)",
                            base_ev + [Evidence(
                                "FDA Orange Book", "products.txt",
                                f"{ra['appl_no']}/{ra['product_no']} vs {rb['appl_no']}/{rb['product_no']}",
                                "TE_Code intersection", f"empty ({codes})",
                                "AB1/AB2/AB3 partition products by reference-listed drug; "
                                "codes from different subgroups are NOT interchangeable")],
                            caveats, confidence, details)
                else:
                    bcodes = {c for c in ta | tb if c.startswith("B")}
                    if bcodes:
                        why = "; ".join(
                            f"{c}: {TE_B_MEANING.get(c, 'not therapeutically equivalent')}"
                            for c in sorted(bcodes))
                        cand = (3, "B", "B1",
                                f"Orange Book non-equivalence rating {sorted(bcodes)}",
                                base_ev + [Evidence(
                                    "FDA Orange Book", "products.txt",
                                    f"{ra['appl_no']}/{ra['product_no']} vs {rb['appl_no']}/{rb['product_no']}",
                                    "TE_Code", ", ".join(sorted(bcodes)), why)],
                                caveats, confidence, details)
                    else:
                        cand = (4, "B", "B2",
                                "same ingredient and dosage form, but at least one product "
                                "carries no TE rating",
                                base_ev + [Evidence(
                                    "FDA Orange Book", "products.txt",
                                    f"{ra['appl_no']}/{ra['product_no']} vs {rb['appl_no']}/{rb['product_no']}",
                                    "TE_Code", f"{ra['te_code'] or '(none)'} / {rb['te_code'] or '(none)'}",
                                    "FDA assigns TE codes only to multi-source products; an "
                                    "unrated product has no equivalence determination")],
                                caveats + [self._unrated_caveat(ra, rb)], confidence, details)

                if best is None or cand[0] < best[0]:
                    best = cand

        if best is None:
            return None
        _, grade, rule, label, evidence, caveats, confidence, details = best
        extra = list(evidence)
        if grade == "B":
            extra += self._blocking_context(a, b)
        return verdict(grade, rule, label, extra=extra, caveats=caveats,
                       confidence=confidence, details=details)

    @staticmethod
    def _unrated_caveat(ra, rb) -> str:
        disc = [r["appl_no"] for r in (ra, rb) if r["mkt_type"] == "DISCN"]
        if disc:
            return (f"{', '.join(disc)} is marked DISCN (discontinued) in the Orange Book; "
                    "FDA does not assign TE codes to discontinued products.")
        return ("At least one product is unrated. This is expected for a single-source "
                "product with no approved generic, and is not a data-quality defect.")

    def _blocking_context(self, a: Side, b: Side) -> list[Evidence]:
        """Explain *why* no equivalent generic exists, from patent/exclusivity."""
        out: list[Evidence] = []
        appl_nos = {r["appl_no"] for r in (a.ob_rows + b.ob_rows) if r["appl_type"] == "N"}
        for appl in sorted(appl_nos)[:3]:
            for row in self.conn.execute(
                "SELECT exclusivity_code, exclusivity_date FROM ob_exclusivity "
                "WHERE appl_no = ? ORDER BY exclusivity_date DESC LIMIT 2", (appl,)):
                out.append(Evidence(
                    "FDA Orange Book", "exclusivity.txt", appl,
                    "Exclusivity_Code/Date",
                    f"{row['exclusivity_code']} until {row['exclusivity_date']}",
                    "marketing exclusivity may be why no equivalent generic is listed"))
            for row in self.conn.execute(
                "SELECT patent_no, expire_date FROM ob_patent "
                "WHERE appl_no = ? AND (delist_flag IS NULL OR delist_flag = '') "
                "ORDER BY expire_date DESC LIMIT 2", (appl,)):
                out.append(Evidence(
                    "FDA Orange Book", "patent.txt", appl,
                    "Patent_No/Expire_Date",
                    f"{row['patent_no']} expires {row['expire_date']}",
                    "listed patent may block generic entry"))
        return out

    @staticmethod
    def _ob_ev(row, fieldname, value) -> Evidence:
        return Evidence(
            source="FDA Orange Book", file="products.txt",
            record=f"{row['appl_no']}/{row['product_no']}",
            field=fieldname, value=str(value),
            note=f"{row['trade_name']} ({row['applicant']}), {row['mkt_type']}")

    # -- equivalence groups (used by the price layer) ----------------------
    def a_grade_group(self, rxcui: str) -> tuple[Side, list[sqlite3.Row]]:
        """Every currently-marketed product that is grade **A** against ``rxcui``.

        :meth:`judge` answers about a *pair*; costing a switch needs the whole
        interchangeable set. Membership is the same rule the pair grader uses:
        identical ingredient, dosage form, route and strength, with intersecting
        ``A*`` therapeutic-equivalence codes.

        Discontinued products are excluded -- they cannot be dispensed, so their
        price is not a real alternative.

        Returns the resolved query side and the member rows (the query's own
        products included).
        """
        side = self.resolve(rxcui)
        if not side.ob_rows:
            return side, []

        query_te: set[str] = set()
        query_is_rld = False
        for r in side.ob_rows:
            query_te |= te_subgroups(r["te_code"])
            if r["rld"] == "Yes":
                query_is_rld = True

        members: dict[tuple[str, str], sqlite3.Row] = {}
        for qr in side.ob_rows:
            rows = self.conn.execute(
                "SELECT * FROM ob_product WHERE ingredient_key = ? AND dosage_form = ? "
                "AND route = ? AND strength_key = ? AND mkt_type <> 'DISCN'",
                (qr["ingredient_key"], qr["dosage_form"], qr["route"], qr["strength_key"]),
            ).fetchall()
            for r in rows:
                codes = te_subgroups(r["te_code"])
                same_product = (r["appl_no"] == qr["appl_no"]
                                and r["product_no"] == qr["product_no"])
                if same_product:
                    members[(r["appl_no"], r["product_no"])] = r
                    continue
                if query_te:
                    # Both rated: they must share an equivalence subgroup.
                    if codes & query_te and any(_is_equivalent_code(c) for c in codes & query_te):
                        members[(r["appl_no"], r["product_no"])] = r
                elif query_is_rld:
                    # The reference drug itself may carry no code; generics are
                    # rated *against* it, so an A* rating implies equivalence.
                    if any(_is_equivalent_code(c) for c in codes):
                        members[(r["appl_no"], r["product_no"])] = r
        return side, list(members.values())

    # -- Purple Book branch ------------------------------------------------
    def _judge_biologic(self, a: Side, b: Side, verdict):
        if not (a.pb_rows and b.pb_rows):
            # One side is a biologic, the other is not: no equivalence pathway.
            other = b if a.is_biologic else a
            bio = a if a.is_biologic else b
            return verdict(
                "D", "D2",
                "one product is a licensed biologic, the other is not",
                extra=[Evidence(
                    "FDA Purple Book", "purplebook.csv",
                    bio.pb_rows[0]["bla_no"], "License Type",
                    bio.pb_rows[0]["license_type"],
                    "biologics and small-molecule drugs have no common "
                    "equivalence pathway")],
                caveats=[f"RXCUI {other.rxcui} has no Purple Book licence; "
                         "no FDA equivalence determination is possible."])

        best = None
        for ra in a.pb_rows:
            for rb in b.pb_rows:
                if ra["appl_no"] == rb["appl_no"]:
                    continue
                cand = self._pb_pair(ra, rb)
                if cand and (best is None or cand[0] < best[0]):
                    best = cand
        if best is None:
            return None
        _, grade, rule, label, evidence, caveats, confidence, details = best
        return verdict(grade, rule, label, extra=evidence, caveats=caveats,
                       confidence=confidence, details=details)

    def _pb_pair(self, ra, rb):
        def ev(row, fieldname, value, note=""):
            return Evidence(
                "FDA Purple Book", "purplebook.csv",
                f"BLA{row['bla_no']}/{row['product_no']}", fieldname, str(value),
                note or f"{row['proprietary_name']} ({row['applicant']})")

        base = [
            ev(ra, "Proper Name", ra["proper_name"]),
            ev(ra, "License Type", ra["license_type"]),
            ev(rb, "Proper Name", rb["proper_name"]),
            ev(rb, "License Type", rb["license_type"]),
        ]
        details = {
            "a_bla": ra["bla_no"], "a_license_type": ra["license_type"],
            "a_ref_product": ra["ref_proprietary_name"],
            "b_bla": rb["bla_no"], "b_license_type": rb["license_type"],
            "b_ref_product": rb["ref_proprietary_name"],
        }

        # Is one the 351(k) follow-on of the other?
        for sub, ref, tag in ((ra, rb, "a"), (rb, ra, "b")):
            if sub["ref_proper_name_key"] and sub["ref_proper_name_key"] == ref["proper_name_key"]:
                if sub["is_interchangeable"]:
                    return (0, "A", "A3",
                            "Purple Book 351(k) INTERCHANGEABLE biologic and its "
                            "reference product",
                            base + [ev(sub, "Ref. Product Proper Name", sub["ref_proper_name"]),
                                    ev(sub, "Inter. Approval Date",
                                       sub["inter_approval_date"] or "(not stated)",
                                       "FDA interchangeability determination date")],
                            ["Interchangeable status permits pharmacy-level substitution, "
                             "but state biologic substitution statutes still govern."],
                            "high", details)
                if sub["is_biosimilar"]:
                    return (1, "B", "B4",
                            "Purple Book 351(k) BIOSIMILAR (not interchangeable) and its "
                            "reference product",
                            base + [ev(sub, "Ref. Product Proper Name", sub["ref_proper_name"]),
                                    ev(sub, "License Type", sub["license_type"],
                                       "biosimilar without an interchangeability "
                                       "determination: substitution requires the prescriber")],
                            [], "high", details)

        # Two 351(k) products sharing one reference product.
        if (ra["ref_proper_name_key"] and
                ra["ref_proper_name_key"] == rb["ref_proper_name_key"]):
            return (2, "B", "B5",
                    "two 351(k) follow-on biologics of the same reference product",
                    base + [Evidence(
                        "FDA Purple Book", "purplebook.csv",
                        f"BLA{ra['bla_no']} vs BLA{rb['bla_no']}",
                        "Ref. Product Proper Name", ra["ref_proper_name"],
                        "interchangeability is determined only against the reference "
                        "product, never between two follow-on biologics")],
                    ["Even where both products are individually interchangeable with the "
                     "reference, FDA has made no determination between them."],
                    "high", details)

        if ra["proper_name_key"] and ra["proper_name_key"] == rb["proper_name_key"]:
            return (3, "B", "B6",
                    "same biologic proper name under separate BLAs, no 351(k) link",
                    base, ["Distinct originator licences of the same proper name are not "
                           "automatically substitutable."], "medium", details)
        return None

    # -- ATC branch --------------------------------------------------------
    def _judge_atc(self, a: Side, b: Side, verdict):
        atc_a, atc_b = set(a.concept.atc), set(b.concept.atc)

        # RxNorm models a salt at two levels: IN is the base moiety
        # ("metoprolol") and PIN is the actual salt ("metoprolol tartrate").
        # Metoprolol tartrate and metoprolol succinate share an IN but are
        # different products with different release profiles, so the
        # "different active ingredient" test has to run at PIN level.
        pin_a, pin_b = set(a.concept.precise_ingredients), set(b.concept.precise_ingredients)
        shares_base = bool(set(a.concept.ingredients) & set(b.concept.ingredients))
        distinct_salt = bool(pin_a and pin_b and not (pin_a & pin_b))
        same_ingredient = shares_base and not distinct_salt

        def atc_ev(side, codes, level):
            return Evidence(
                source="WHO ATC (via RxNorm)",
                file="RXNCONSO.RRF SAB='ATC'" if isinstance(self.rx, rxnav.RxNormRRF)
                     else f"/REST/rxcui/{side.rxcui}/allProperties.json?prop=codes",
                record=side.rxcui, field=f"ATC level {level}",
                value=", ".join(sorted(codes)),
                note=side.concept.name or "")

        shared5 = atc_a & atc_b
        if shared5:
            if same_ingredient:
                return verdict(
                    "B", "B7",
                    "same active ingredient and ATC substance, but no Orange Book "
                    "equivalence rating links these products",
                    extra=[atc_ev(a, shared5, 5), atc_ev(b, shared5, 5)],
                    caveats=["No therapeutic-equivalence rating was found for this pair; "
                             "they may differ in dosage form, strength or route."],
                    confidence="medium")
            salt_ev = []
            if distinct_salt:
                salt_ev = [Evidence(
                    source="RxNorm", file=f"/REST/rxcui/{a.rxcui}/related.json?tty=PIN",
                    record=f"{a.rxcui} vs {b.rxcui}", field="precise ingredient (PIN)",
                    value=f"{sorted(pin_a)} vs {sorted(pin_b)}",
                    note="same base ingredient (IN) but a different salt/ester form")]
            return verdict(
                "C", "C1",
                "same WHO ATC level-5 substance class, different active ingredient "
                "(typically a salt, ester or isomer variant)",
                extra=[atc_ev(a, shared5, 5), atc_ev(b, shared5, 5),
                       Evidence("WHO ATC", "ATC index", ", ".join(sorted(shared5)),
                                "level-5 code", ", ".join(sorted(shared5)),
                                "identical level-5 code with different RxNorm ingredients "
                                "indicates differing salt/ester forms of one substance")] + salt_ev,
                caveats=["Salt and ester forms can differ in bioavailability and release "
                         "profile; a prescriber must confirm the dose conversion."],
                confidence="high")

        shared4 = set(a.concept.atc4()) & set(b.concept.atc4())
        if shared4:
            return verdict(
                "C", "C2",
                "same WHO ATC level-4 chemical subgroup, different substance",
                extra=[atc_ev(a, {c for c in atc_a}, "4 (from 5)"),
                       atc_ev(b, {c for c in atc_b}, "4 (from 5)"),
                       Evidence("WHO ATC", "ATC index", ", ".join(sorted(shared4)),
                                "level-4 chemical subgroup", ", ".join(sorted(shared4)),
                                "therapeutic-class relation only; no bioequivalence implied")],
                caveats=["Class members differ in potency and dosing; "
                         "this is a therapeutic-interchange decision, not a substitution."],
                confidence="high")

        why = []
        if not atc_a:
            why.append(f"no ATC code for RXCUI {a.rxcui}")
        if not atc_b:
            why.append(f"no ATC code for RXCUI {b.rxcui}")
        if not a.ob_rows and not a.pb_rows:
            why.append(f"RXCUI {a.rxcui} maps to no Orange/Purple Book product")
        if not b.ob_rows and not b.pb_rows:
            why.append(f"RXCUI {b.rxcui} maps to no Orange/Purple Book product")
        return verdict(
            "D", "D1", "no equivalence or therapeutic-class relationship found",
            caveats=why or ["Different ingredients and unrelated ATC classes."],
            confidence="high" if (atc_a and atc_b) else "low")


_CACHED: dict[tuple, Adjudicator] = {}


def get_adjudicator(db_path=None, offline: bool = False) -> Adjudicator:
    """Return a process-wide :class:`Adjudicator`, one per (db_path, offline).

    Reusing it matters: it keeps the sqlite handle and the RxNav HTTP cache
    warm, which is the difference between a batch of verdicts taking seconds
    and taking minutes.
    """
    key = (str(db_path) if db_path else None, offline)
    if key not in _CACHED:
        _CACHED[key] = Adjudicator(db_path=db_path, offline=offline)
    return _CACHED[key]
