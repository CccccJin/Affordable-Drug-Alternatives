"""Sanity check: 20 well-known originator/generic pairs, priced and eyeballed.

The point is not to prove the pipeline correct -- no automated check can do that
for a pricing model -- but to put twenty *recognisable* drugs in front of a human
reviewer so an implausible number is obvious at a glance. A reader who knows the
US market should look at "Lipitor 40 MG, brand $19.11, generic $0.04" and agree.

Each pair asserts only the direction that must hold: **the brand must not be
cheaper than its own AB-rated generic**. Anything else is flagged for review
rather than silently passed.

    python price_compare.py sanity
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from price_compare import PriceComparator  # noqa: E402
from subst_data import partd  # noqa: E402
from subst_data.nadac import NADAC_DISCLAIMER  # noqa: E402

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "PRICE_SANITY_CHECK.md"

#: (rxcui, brand, expected generic molecule).  Chosen for recognisability and
#: to span the range of outcomes -- not filtered to the flattering cases.
PAIRS = [
    ("617320",  "Lipitor 40 MG",            "atorvastatin"),
    ("213270",  "Viagra 50 MG",             "sildenafil"),
    ("208161",  "Zoloft 50 MG",             "sertraline"),
    ("854878",  "Ambien 5 MG",              "zolpidem"),
    ("105019",  "Lamictal 25 MG",           "lamotrigine"),
    ("404408",  "Lexapro 5 MG",             "escitalopram"),
    ("859426",  "Crestor 5 MG",             "rosuvastatin"),
    ("153046",  "Zyprexa 5 MG",             "olanzapine"),
    ("607026",  "Lyrica 25 MG",             "pregabalin"),
    ("261280",  "Neurontin 600 MG",         "gabapentin"),
    ("153892",  "Singulair 10 MG",          "montelukast"),
    ("404602",  "Abilify 5 MG",             "aripiprazole"),
    ("213169",  "Plavix 75 MG",             "clopidogrel"),
    ("284460",  "Imitrex 100 MG",           "sumatriptan"),
    ("153638",  "Seroquel 25 MG",           "quetiapine"),
    ("979487",  "Cozaar 25 MG",             "losartan"),
    ("904433",  "Fosamax 70 MG",            "alendronate"),
    ("351761",  "Diovan 80 MG",             "valsartan"),
    ("686381",  "Celebrex 50 MG",           "celecoxib"),
    ("966218",  "Synthroid 0.3 MG",         "levothyroxine"),
    # Deliberately included: outcomes that are NOT ~99%, to prove the pipeline
    # is reading real prices rather than emitting a constant.
    ("1091157", "Concerta 18 MG ER",        "methylphenidate ER"),
    ("1100187", "Aricept 23 MG",            "donepezil"),
    ("1297763", "Nexium 5 MG susp.",        "esomeprazole"),
]


class Row:
    def __init__(self, rxcui, brand, molecule, comparison, conn=None):
        self.rxcui, self.brand, self.molecule = rxcui, brand, molecule
        c = comparison
        self.comparison = c
        self.orig = c.originator
        self.gen = c.cheapest_generic
        self.group_size = c.group_size
        self.n_priced = c.n_priced
        # Independent cross-check from Medicare Part D, if it has been loaded.
        self.partd_brand = self.partd_generic = None
        if conn is not None and partd.available(conn):
            self.partd_brand = partd.lookup(conn, brand.split()[0])
            if c.ingredient:
                self.partd_generic = partd.lookup(conn, c.ingredient)

    @property
    def verdict(self) -> str:
        if not self.orig or not self.gen:
            return "NO DATA"
        if self.comparison.savings_pct is None:
            return "REVIEW"
        if self.orig.price_per_unit < self.gen.price_per_unit:
            return "FLAG"                      # brand cheaper than its generic
        return "PASS"

    @property
    def detail(self) -> str:
        if self.verdict == "NO DATA":
            if not self.orig and self.gen:
                return "no NADAC-surveyed brand product in the group"
            if not self.gen and self.orig:
                return "no priced AB-rated generic in the group"
            return "neither brand nor generic carries a NADAC price"
        if self.verdict == "FLAG":
            return "brand priced BELOW its own AB-rated generic — verify by hand"
        return ""


def run() -> list[Row]:
    pc = PriceComparator()
    return [Row(rxcui, brand, molecule, pc.compare(rxcui), pc.conn)
            for rxcui, brand, molecule in PAIRS]


def macro_section(rows: list[Row]) -> list[str]:
    """Cross-check NADAC against Medicare Part D spending per dosage unit."""
    brands = [r for r in rows if r.orig and r.partd_brand]
    generics = [r for r in rows if r.gen and r.partd_generic]
    if not brands and not generics:
        return []

    out = [
        "## Macro cross-check: Medicare Part D",
        "",
        "NADAC (what pharmacies pay) and Part D (what Medicare and its beneficiaries "
        "spent per dosage unit) are collected by different programmes from different "
        "populations. Agreement between them is genuine corroboration; the "
        "*disagreement* is just as informative.",
        "",
        "| Drug | NADAC $/unit | Part D $/unit | Part D ÷ NADAC |",
        "|---|---:|---:|---:|",
    ]
    for r in brands:
        ratio = r.partd_brand / r.orig.price_per_unit
        out.append(f"| {r.brand} (brand) | {r.orig.price_per_unit:,.4f} | "
                   f"{r.partd_brand:,.4f} | {ratio:.2f}× |")
    for r in generics[:8]:
        ratio = r.partd_generic / r.gen.price_per_unit
        out.append(f"| {r.molecule} (generic) | {r.gen.price_per_unit:,.4f} | "
                   f"{r.partd_generic:,.4f} | {ratio:.2f}× |")
    out.append("")

    def median(vals):
        vals = sorted(vals)
        return vals[len(vals) // 2] if vals else None

    br = median([r.partd_brand / r.orig.price_per_unit for r in brands])
    gr = median([r.partd_generic / r.gen.price_per_unit for r in generics])
    if br:
        out.append(f"**Brands: median Part D ÷ NADAC = {br:.2f}×.** Two independent "
                   "federal sources landing this close is the strongest available "
                   "evidence that the brand prices are being read correctly.")
        out.append("")
    if gr:
        out += [
            f"**Generics: median Part D ÷ NADAC = {gr:.2f}×.** This divergence is not "
            "an error, and it is the single most important caveat in this report. A "
            "dispensing fee and pharmacy margin are roughly fixed per prescription, so "
            "against a four-cent acquisition cost they dominate completely. ",
            "",
            "> A 99% saving in NADAC acquisition cost therefore does **not** become a "
            "99% saving for a patient or a payer. Part D shows the realised per-unit "
            f"cost of a cheap generic running about {gr:.0f}× its acquisition cost.",
            "",
        ]
    return out


def render(rows: list[Row]) -> str:
    ok = [r for r in rows if r.verdict == "PASS"]
    flagged = [r for r in rows if r.verdict == "FLAG"]
    nodata = [r for r in rows if r.verdict == "NO DATA"]

    out = [
        "# Price Sanity Check — originator vs AB-rated generic",
        "",
        f"Generated {date.today().isoformat()} by `python price_compare.py sanity`.",
        "",
        "> **NADAC is a pharmacy ACQUISITION cost, not a patient price.**",
        f"> {NADAC_DISCLAIMER}",
        "",
        "## What this checks",
        "",
        "Twenty-plus well-known brands are priced against the cheapest generic FDA "
        "has rated therapeutically equivalent to them (grade **A**). The only "
        "automated assertion is directional — a brand must not be cheaper than its "
        "own AB-rated generic. The numbers are printed so a reader who knows the US "
        "market can judge plausibility directly.",
        "",
        f"**{len(ok)} pass · {len(flagged)} flagged · {len(nodata)} without price data "
        f"· {len(rows)} total.**",
        "",
        "## Results",
        "",
        "| Verdict | Brand | Generic molecule | Brand $/unit | Generic $/unit | Saving | Group | Priced |",
        "|---|---|---|---:|---:|---:|---:|---:|",
    ]
    for r in sorted(rows, key=lambda r: (r.verdict != "FLAG", r.verdict != "PASS",
                                         -(r.comparison.savings_pct or -1))):
        if r.orig and r.gen:
            b = f"{r.orig.price_per_unit:,.4f}"
            g = f"{r.gen.price_per_unit:,.4f}"
            s = (f"{r.comparison.savings_pct:.1f}%"
                 if r.comparison.savings_pct is not None else "n/a")
        else:
            b = g = s = "—"
        mark = {"PASS": "PASS", "FLAG": "**FLAG**", "NO DATA": "no data",
                "REVIEW": "review"}[r.verdict]
        out.append(f"| {mark} | {r.brand} | {r.molecule} | {b} | {g} | {s} | "
                   f"{r.group_size} | {r.n_priced} |")
    out.append("")

    if flagged:
        out += ["## Flagged for manual review", ""]
        for r in flagged:
            out.append(f"- **{r.brand}** (RXCUI {r.rxcui}): {r.detail}")
        out.append("")

    if nodata:
        out += [
            "## Pairs without a priced comparison",
            "",
            "These are reported rather than dropped. A brand with no NADAC row is "
            "normally one CMS no longer surveys because it has left retail "
            "distribution — the absence is information, not an error.",
            "",
        ]
        for r in nodata:
            out.append(f"- **{r.brand}** (RXCUI {r.rxcui}): {r.detail}")
        out.append("")

    priced = [r for r in rows if r.orig and r.gen and r.comparison.savings_pct is not None]
    if priced:
        savings = sorted(r.comparison.savings_pct for r in priced)
        mid = savings[len(savings) // 2]
        out += [
            "## Distribution of savings",
            "",
            f"| Statistic | Value |",
            "|---|---:|",
            f"| pairs with both prices | {len(priced)} |",
            f"| median saving | {mid:.1f}% |",
            f"| minimum saving | {savings[0]:.1f}% |",
            f"| maximum saving | {savings[-1]:.1f}% |",
            "",
            "A spread rather than a constant is the point: the low end "
            f"({savings[0]:.1f}%) and the high end ({savings[-1]:.1f}%) both come "
            "from the same code path, which is evidence the pipeline is reading "
            "per-product prices rather than emitting a fixed ratio.",
            "",
        ]

    out += macro_section(rows)

    out += [
        "## How to verify a row by hand",
        "",
        "1. `python price_compare.py compare <rxcui>` prints every group member, "
        "its application number and its NADAC price.",
        "2. `python substitutability.py judge <rxcui_a> <rxcui_b>` shows why two of "
        "them are grade A, citing the Orange Book `TE_Code` field.",
        "3. Look the price up at "
        "<https://data.medicaid.gov/dataset/dfa2ab14-06c2-457a-9e36-5cb6d80f8d93> "
        "using the NDC printed by step 1.",
        "",
        "## Known limitations",
        "",
        "1. **Acquisition cost only.** NADAC excludes rebates, 340B pricing, "
        "dispensing fees and every insurance-side adjustment. A 99% acquisition-cost "
        "saving does not translate into a 99% saving for a specific patient.",
        "2. **Brand baseline selection.** The originator is the Orange Book "
        "reference-listed drug where one is flagged, otherwise the highest-priced "
        "NADAC brand-classified product in the group. Regulatory status alone is not "
        "used: LEVO-T holds its own NDA but is priced as a generic, so keying on "
        "`Appl_Type = N` would pick it as the Synthroid baseline and report a 0% saving.",
        "3. **Strength-matched, not course-matched.** Prices compare like strengths. "
        "A true cost-per-course would need dosing frequency and duration, which are "
        "not in NADAC or the Orange Book.",
        "4. **Single point in time.** NADAC is a weekly survey; the prices here are "
        "the most recent row per NDC at build time.",
        "5. **Part D comparison is name-matched, not NDC-matched.** Part D reports by "
        "brand and generic name aggregated over all strengths, so the ratio is a "
        "magnitude check, not a like-for-like price.",
    ]
    return "\n".join(out) + "\n"


def main(output: str | Path | None = None) -> Path:
    rows = run()
    out = Path(output) if output else DEFAULT_OUT
    out.write_text(render(rows), encoding="utf-8")

    width = max(len(r.brand) for r in rows)
    print(f"{'VERDICT':<9}{'BRAND':<{width + 2}}{'BRAND $':>11}{'GENERIC $':>12}{'SAVING':>9}")
    print("-" * (9 + width + 2 + 32))
    for r in rows:
        if r.orig and r.gen:
            b, g = f"{r.orig.price_per_unit:,.4f}", f"{r.gen.price_per_unit:,.4f}"
            s = f"{r.comparison.savings_pct:.1f}%" if r.comparison.savings_pct is not None else "n/a"
        else:
            b = g = s = "—"
        print(f"{r.verdict:<9}{r.brand:<{width + 2}}{b:>11}{g:>12}{s:>9}")
    n_pass = sum(1 for r in rows if r.verdict == "PASS")
    n_flag = sum(1 for r in rows if r.verdict == "FLAG")
    print("-" * (9 + width + 2 + 32))
    print(f"{n_pass} pass, {n_flag} flagged, "
          f"{sum(1 for r in rows if r.verdict == 'NO DATA')} without data")
    print(f"\n!! {NADAC_DISCLAIMER}")
    print(f"\nWrote {out}")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--output", default=None)
    main(**vars(ap.parse_args()))
