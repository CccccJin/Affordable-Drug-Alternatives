#!/usr/bin/env python3
"""Cost comparison across a confirmed-substitutable drug group.

Builds on `substitutability.py`: that module decides *whether* two products may
be swapped, this one prices the swap. Only grade **A** members are priced --
products FDA has rated therapeutically equivalent -- because those are the only
switches a pharmacy can make without a prescribing decision.

    >>> from price_compare import compare
    >>> c = compare("617320")            # Lipitor 40 MG
    >>> c.savings_pct
    98.6
    >>> print(c.explain())

!!  NADAC IS AN ACQUISITION COST, NOT A PATIENT PRICE.  !!
It is what pharmacies pay wholesalers, surveyed by CMS. It is not a copay, not
a cash price and not a reimbursement rate. Every rendering of a result carries
this warning; see `subst_data.nadac.NADAC_DISCLAIMER`.

Unit normalisation
------------------
NADAC prices a *unit*, and the unit differs by product (``EA`` a tablet, ``ML``
a millilitre, ``GM`` a gram), so raw prices are not comparable across pack sizes
or formulations. Two normalised figures are produced:

``price_per_unit``
    Cost per tablet / mL / gram. Directly comparable **within** a grade-A group,
    because group membership already fixes strength and dosage form.
``price_per_mg``
    Cost per mg of active ingredient. Needed to compare **across** strengths.
    ``None`` where the strength cannot be expressed in the priced unit (a patch
    dosed "4.6 mg/24h" has no mg-per-gram meaning) -- never guessed.

Command line
------------
    python price_compare.py fetch                 # download NADAC
    python price_compare.py build                 # load prices into the database
    python price_compare.py compare 617320        # price one drug's alternatives
    python price_compare.py sanity                # 20 brand/generic pairs
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from subst_data.grade import Adjudicator, parse_strength  # noqa: E402
from subst_data.nadac import (  # noqa: E402
    BRAND_CLASSES, NADAC_DISCLAIMER, mg_per_pricing_unit,
)

__all__ = ["compare", "PriceComparator", "PriceComparison", "PricedProduct",
           "NADAC_DISCLAIMER"]

#: A NADAC row older than this is reported but flagged: CMS stops surveying
#: products that leave the market, so the price may no longer be obtainable.
STALE_AFTER_DAYS = 180


@dataclass
class PricedProduct:
    """One Orange Book product in the group, with its NADAC price attached."""

    appl_no: str
    product_no: str
    trade_name: str
    applicant: str
    appl_type: str                    # "N" (NDA) or "A" (ANDA)
    te_code: str
    strength: str
    is_originator: bool
    is_rld: bool
    price_per_unit: float | None = None
    price_min: float | None = None
    price_max: float | None = None
    pricing_unit: str | None = None
    price_per_mg: float | None = None
    mg_per_unit: float | None = None
    nadac_classification: str | None = None
    effective_date: str | None = None
    is_stale: bool = False
    n_ndcs_priced: int = 0
    ndc_examples: list[str] = field(default_factory=list)
    unpriced_reason: str | None = None

    @property
    def priced(self) -> bool:
        return self.price_per_unit is not None

    @property
    def label(self) -> str:
        kind = "NDA" if self.appl_type == "N" else "ANDA"
        return f"{self.trade_name} ({self.applicant}) {kind} {self.appl_no}"


@dataclass
class PriceComparison:
    rxcui: str
    name: str | None
    ingredient: str | None = None
    dosage_form: str | None = None
    route: str | None = None
    strength: str | None = None
    products: list[PricedProduct] = field(default_factory=list)
    originator: PricedProduct | None = None
    cheapest_generic: PricedProduct | None = None
    savings_per_unit: float | None = None
    savings_pct: float | None = None
    savings_per_mg: float | None = None
    group_size: int = 0
    n_priced: int = 0
    originator_basis: str | None = None
    notes: list[str] = field(default_factory=list)
    price_basis: str = "CMS NADAC (pharmacy acquisition cost)"
    disclaimer: str = NADAC_DISCLAIMER

    def to_dict(self) -> dict:
        d = asdict(self)
        d["disclaimer"] = self.disclaimer
        return d

    def explain(self) -> str:
        w = 78
        out = [
            "=" * w,
            f"Price comparison — grade A equivalents of RXCUI {self.rxcui}",
            f"  {self.name or '?'}",
        ]
        if self.ingredient:
            out.append(f"  {self.ingredient} · {self.dosage_form};{self.route} · {self.strength}")
        out += [
            "-" * w,
            f"  price basis : {self.price_basis}",
            f"  group       : {self.group_size} grade-A products, {self.n_priced} with a price",
            "-" * w,
        ]
        if not self.products:
            out.append("  No grade-A equivalents with NADAC pricing were found.")
        else:
            out.append(f"  {'#':<3}{'$/unit':>10} {'unit':<5}{'$/mg':>11}  {'cls':<6}{'product'}")
            for i, p in enumerate(self.products, 1):
                if p.priced:
                    per_mg = f"{p.price_per_mg:.5f}" if p.price_per_mg is not None else "n/a"
                    flag = " *stale" if p.is_stale else ""
                    tag = "ORIG" if p.is_originator else p.nadac_classification or ""
                    out.append(f"  {i:<3}{p.price_per_unit:>10.5f} {p.pricing_unit or '':<5}"
                               f"{per_mg:>11}  {tag:<6}{p.label[:34]}{flag}")
                else:
                    out.append(f"  {i:<3}{'—':>10} {'':<5}{'—':>11}  {'':<6}"
                               f"{p.label[:34]}  ({p.unpriced_reason})")
        if self.originator and self.cheapest_generic and self.savings_pct is not None:
            out += [
                "-" * w,
                f"  originator      : {self.originator.price_per_unit:.5f} "
                f"per {self.originator.pricing_unit}  — {self.originator.label[:40]}",
                f"  cheapest generic: {self.cheapest_generic.price_per_unit:.5f} "
                f"per {self.cheapest_generic.pricing_unit}  — {self.cheapest_generic.label[:40]}",
                f"  saving          : {self.savings_per_unit:.5f} per unit "
                f"({self.savings_pct:.1f}%)",
            ]
        if self.notes:
            out.append("-" * w)
            out += [f"  note: {n}" for n in self.notes]
        out += ["=" * w, "  !! " + NADAC_DISCLAIMER.replace(". ", ".\n     "), "=" * w]
        return "\n".join(out)


class PriceComparator:
    """Prices the grade-A equivalence group around an RxNorm concept."""

    def __init__(self, adjudicator: Adjudicator | None = None, offline: bool = False):
        self.adj = adjudicator or Adjudicator(offline=offline)
        self.conn = self.adj.conn
        if not self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='nadac_price'"
        ).fetchone():
            raise RuntimeError(
                "nadac_price table missing — run `python price_compare.py build` first")

    def compare(self, rxcui: str) -> PriceComparison:
        side, members = self.adj.a_grade_group(rxcui)
        result = PriceComparison(
            rxcui=str(rxcui), name=side.concept.name, group_size=len(members))

        if not side.concept.found:
            result.notes.append(f"RXCUI {rxcui} did not resolve in RxNorm.")
            return result
        if not members:
            result.notes.append(
                "No grade-A equivalence group found: the concept reaches no "
                "currently-marketed Orange Book product with an A-rated peer.")
            return result

        first = members[0]
        result.ingredient = first["ingredient"]
        result.dosage_form = first["dosage_form"]
        result.route = first["route"]
        result.strength = first["strength"]

        priced = [self._price_product(m) for m in members]
        result.n_priced = sum(1 for p in priced if p.priced)

        # Sort by unit price; unpriced products sink to the bottom.
        priced.sort(key=lambda p: (p.price_per_unit is None,
                                   p.price_per_unit if p.price_per_unit is not None else 0.0))
        result.products = priced

        originators = [p for p in priced if p.is_originator and p.priced]
        generics = [p for p in priced if not p.is_originator and p.priced]
        if originators:
            # The reference-listed drug is the meaningful baseline. Taking the
            # cheapest brand instead would understate the switch saving.
            originators.sort(key=lambda p: (not p.is_rld, -p.price_per_unit))
            result.originator = originators[0]
            result.originator_basis = (
                "reference-listed drug (Orange Book RLD=Yes)" if result.originator.is_rld
                else "highest-priced NADAC brand-classified product; no RLD flag in group")
            if len(originators) > 1:
                result.notes.append(
                    f"{len(originators)} brand-classified products in this group; "
                    f"baseline chosen as {result.originator.trade_name} "
                    f"({result.originator_basis}).")
        if generics:
            result.cheapest_generic = generics[0]

        o, g = result.originator, result.cheapest_generic
        if o and g:
            if o.pricing_unit == g.pricing_unit:
                result.savings_per_unit = o.price_per_unit - g.price_per_unit
                result.savings_pct = (result.savings_per_unit / o.price_per_unit * 100
                                      if o.price_per_unit else None)
            else:
                result.notes.append(
                    f"Originator priced per {o.pricing_unit} but generic per "
                    f"{g.pricing_unit}; per-unit saving not comparable.")
            if o.price_per_mg and g.price_per_mg:
                result.savings_per_mg = o.price_per_mg - g.price_per_mg
        elif not originators:
            result.notes.append(
                "No priced originator (NDA) product in this group — the brand may be "
                "discontinued or no longer surveyed by CMS. Savings cannot be computed "
                "against a brand baseline.")
        elif not generics:
            result.notes.append("No priced generic alternative in this group.")

        stale = [p for p in priced if p.is_stale]
        if stale:
            result.notes.append(
                f"{len(stale)} product(s) carry a NADAC price older than "
                f"{STALE_AFTER_DAYS} days; CMS stops surveying withdrawn products.")
        unpriced = result.group_size - result.n_priced
        if unpriced:
            result.notes.append(
                f"{unpriced} of {result.group_size} grade-A products have no NADAC "
                "price and are listed without a figure rather than dropped.")
        return result

    # -- pricing -----------------------------------------------------------
    def _price_product(self, row) -> PricedProduct:
        out = PricedProduct(
            appl_no=row["appl_no"], product_no=row["product_no"],
            trade_name=row["trade_name"], applicant=row["applicant"],
            appl_type=row["appl_type"], te_code=row["te_code"] or "",
            strength=row["strength"],
            # Provisional: overwritten once NADAC's own classification is known.
            is_originator=(row["appl_type"] == "N" and row["rld"] == "Yes"),
            is_rld=(row["rld"] == "Yes"))

        ob_strength = parse_strength(row["strength"])
        ndc_rows = self.conn.execute(
            "SELECT p.ndc9, p.active_ingredients, p.dosage_form, n.price_per_unit, "
            "       n.pricing_unit, n.effective_date, n.classification, n.description "
            "FROM ndc_product p JOIN nadac_price n ON n.ndc9 = p.ndc9 "
            "WHERE p.appl_no = ?", (row["appl_no"],)).fetchall()

        if not ndc_rows:
            out.unpriced_reason = "no NADAC price for this application"
            return out

        # An application covers every strength it was approved for, so keep only
        # the NDCs whose strength matches this Orange Book product line.
        matching = []
        for r in ndc_rows:
            ings = json.loads(r["active_ingredients"] or "[]")
            ndc_strength = frozenset().union(
                *(parse_strength(i.get("strength")) for i in ings)) if ings else frozenset()
            if ob_strength and ndc_strength and not (ndc_strength & ob_strength):
                continue
            matching.append((r, ings))
        if not matching:
            out.unpriced_reason = "NADAC prices exist for this application but not this strength"
            return out

        prices = [r["price_per_unit"] for r, _ in matching]
        out.price_per_unit = statistics.median(prices)
        out.price_min, out.price_max = min(prices), max(prices)
        out.n_ndcs_priced = len(matching)
        out.ndc_examples = [r["ndc9"] for r, _ in matching[:3]]
        out.pricing_unit = matching[0][0]["pricing_unit"]
        out.nadac_classification = matching[0][0]["classification"]
        out.effective_date = max(r["effective_date"] for r, _ in matching)
        out.is_stale = self._is_stale(out.effective_date)

        # Regulatory status is a poor proxy for "is this the brand". Levothyroxine
        # is the standard counter-example: LEVO-T is approved under its OWN NDA
        # but is priced and marketed as a generic, so keying on appl_type=='N'
        # picks it as the brand baseline and reports a 0% saving against
        # Synthroid. NADAC publishes its own brand/generic flag for exactly this
        # purpose, so that is the authority whenever it is present.
        if out.nadac_classification in BRAND_CLASSES:
            out.is_originator = True
        elif out.nadac_classification == "G":
            out.is_originator = False

        # Per-mg normalisation, using the strength as openFDA states it.
        for r, ings in matching:
            total_mg = 0.0
            ok = bool(ings)
            for ing in ings:
                mg = mg_per_pricing_unit(ing.get("strength"), r["pricing_unit"])
                if mg is None:
                    ok = False
                    break
                total_mg += mg
            if ok and total_mg > 0:
                out.mg_per_unit = total_mg
                out.price_per_mg = out.price_per_unit / total_mg
                break
        return out

    @staticmethod
    def _is_stale(effective_date: str | None) -> bool:
        if not effective_date:
            return False
        from datetime import date
        try:
            y, m, d = (int(x) for x in effective_date.split("-"))
        except ValueError:
            return False
        return (date.today() - date(y, m, d)).days > STALE_AFTER_DAYS


_COMPARATOR: PriceComparator | None = None


def compare(rxcui: str, *, comparator: PriceComparator | None = None) -> PriceComparison:
    """Price every grade-A alternative to ``rxcui``, cheapest first.

    Returns a :class:`PriceComparison`; ``.products`` is sorted by unit price,
    ``.savings_pct`` is the originator-to-cheapest-generic saving, and
    ``.disclaimer`` states that NADAC is an acquisition cost, not a patient price.
    """
    global _COMPARATOR
    if comparator is None:
        if _COMPARATOR is None:
            _COMPARATOR = PriceComparator()
        comparator = _COMPARATOR
    return comparator.compare(rxcui)


# --------------------------------------------------------------------------
def _cmd_fetch(args):
    from subst_data import nadac, partd
    nadac.fetch(force=args.force)
    if not args.no_partd:
        partd.fetch(force=args.force)


def _cmd_build(args):
    from subst_data import nadac, partd
    stats = nadac.build()
    if not args.no_partd:
        stats += partd.build()
    for sec, metric, value, denom, note in stats:
        pct = f"  ({value / denom * 100:5.1f}%)" if denom else ""
        val = note if metric in ("price_as_of", "spending_year") else f"{int(value):,}"
        print(f"  [{sec}] {metric:<32} {val:>14}{pct}")


#: Worked examples for the ``demo`` subcommand, spanning the range of outcomes.
DEMO_CASES = [
    ("617320", "Lipitor 40 MG vs generic atorvastatin"),
    ("213270", "Viagra 50 MG vs generic sildenafil"),
    ("966218", "Synthroid 0.3 MG — brand baseline is NOT the cheapest NDA"),
    ("1297763", "Nexium 5 MG suspension — a low-saving case"),
]


def _cmd_demo(args):
    pc = PriceComparator()
    print(f"{'RXCUI':<10}{'BRAND $':>10}{'GENERIC $':>11}{'SAVING':>9}  CASE")
    print("-" * 88)
    for rxcui, desc in DEMO_CASES:
        c = pc.compare(rxcui)
        b = f"{c.originator.price_per_unit:,.4f}" if c.originator else "—"
        g = f"{c.cheapest_generic.price_per_unit:,.4f}" if c.cheapest_generic else "—"
        s = f"{c.savings_pct:.1f}%" if c.savings_pct is not None else "n/a"
        print(f"{rxcui:<10}{b:>10}{g:>11}{s:>9}  {desc}")
    print("-" * 88)
    print("Full breakdown:  python price_compare.py compare 617320")
    print(f"\n!! {NADAC_DISCLAIMER}")


def _cmd_compare(args):
    c = compare(args.rxcui)
    print(json.dumps(c.to_dict(), indent=2) if args.json else c.explain())


def _cmd_export(args):
    from subst_data.export_frontend import main as export_main
    export_main()


def _cmd_sanity(args):
    from subst_data.sanity_check import main as sanity_main
    sanity_main(output=args.output)


def main(argv=None):
    p = argparse.ArgumentParser(prog="price_compare",
                                description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="command", required=True)

    f = sub.add_parser("fetch", help="download NADAC and Medicare Part D")
    f.add_argument("--force", action="store_true")
    f.add_argument("--no-partd", action="store_true",
                   help="skip the optional Part D macro cross-check source")
    f.set_defaults(func=_cmd_fetch)

    b = sub.add_parser("build", help="load prices into the database")
    b.add_argument("--no-partd", action="store_true")
    b.set_defaults(func=_cmd_build)

    d = sub.add_parser("demo", help="price four worked examples")
    d.set_defaults(func=_cmd_demo)

    c = sub.add_parser("compare", help="price the grade-A alternatives to one RXCUI")
    c.add_argument("rxcui")
    c.add_argument("--json", action="store_true")
    c.set_defaults(func=_cmd_compare)

    x = sub.add_parser("export", help="write the frontend's static JSON export")
    x.set_defaults(func=_cmd_export)

    s = sub.add_parser("sanity", help="run the 20-pair brand/generic sanity check")
    s.add_argument("-o", "--output", default=None)
    s.set_defaults(func=_cmd_sanity)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
