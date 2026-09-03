"""The evaluation set: 100+ labelled pairs, each with a four-level expectation.

Written before the implementation, and deliberately in a plain data file rather
than inside a test function, because the evaluation report reads the same rows
the tests do. A case that only a test can see cannot appear in a confusion
matrix.

The first three rows are the pipeline's real end-to-end failures, taken from
`EVALUATION_REPORT.md` and checked against `subst_data/cache/substitutability.sqlite`.
They are the reason this module exists, so they lead.

Labels are the *expected verdict*, not a boolean. `EQUIVALENT_WITH_CAVEAT` is a
real answer here, not a hedge: it means the products may be interchangeable but
a human must look, and conflating it with either neighbour would hide the
distinction the whole design rests on.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Case:
    """One labelled pair.

    `left` and `right` are raw source strings, exactly as the sources write
    them — no pre-cleaning, because handling the sources' own spelling is the
    task. `ingredient` matters only for the moiety-derived-release rule.
    """
    left: str
    right: str
    expected: str
    group: str
    note: str = ""
    left_ingredient: str | None = None
    right_ingredient: str | None = None


EQ = "EQUIVALENT"
CAV = "EQUIVALENT_WITH_CAVEAT"
NEQ = "NOT_EQUIVALENT"
UNK = "UNKNOWN"


# --- 1. the three real failures ------------------------------------------
REGRESSIONS = [
    Case("TABLET, DELAYED RELEASE;ORAL", "TABLET;ORAL", NEQ, "regression",
         "AZULFIDINE EN-TABS vs plain sulfasalazine. The pipeline returned the "
         "plain tablet: RxNorm calls both 'Oral Tablet'."),
    Case("INJECTABLE, LIPOSOMAL;INJECTION", "INJECTABLE;INJECTION", NEQ, "regression",
         "DOXIL vs conventional doxorubicin. Same molecule, different carrier."),
    Case("TABLET, FOR SUSPENSION;ORAL", "TABLET;ORAL", CAV, "regression",
         "AFINITOR DISPERZ vs plain everolimus tablet. A manufactured form that "
         "transforms before administration; needs a human, not a silent equate."),
]

# --- 2. release characteristics ------------------------------------------
RELEASE = [
    Case("TABLET, DELAYED RELEASE;ORAL", "TABLET, DELAYED RELEASE;ORAL", EQ, "release"),
    Case("TABLET, EXTENDED RELEASE;ORAL", "TABLET;ORAL", NEQ, "release"),
    Case("TABLET, EXTENDED RELEASE;ORAL", "TABLET, DELAYED RELEASE;ORAL", NEQ, "release"),
    Case("CAPSULE, DELAYED RELEASE;ORAL", "CAPSULE;ORAL", NEQ, "release"),
    Case("CAPSULE, EXTENDED RELEASE;ORAL", "CAPSULE, EXTENDED RELEASE;ORAL", EQ, "release"),
    Case("TABLET, DELAYED REL;ORAL", "TABLET, DELAYED RELEASE;ORAL", EQ, "release",
         "Orange Book abbreviates; the vocabulary carries both spellings."),
    Case("TABLET, ENTERIC COATED;ORAL", "TABLET, DELAYED RELEASE;ORAL", EQ, "release",
         "enteric-coated is delayed release under a different name."),
    Case("TABLET, GASTRO-RESISTANT;ORAL", "TABLET, DELAYED RELEASE;ORAL", EQ, "release",
         "EDQM's own term for the same characteristic."),
    Case("TABLET, ENTERIC COATED;ORAL", "TABLET;ORAL", NEQ, "release"),
    Case("CAPSULE, DELAYED REL PELLETS;ORAL", "CAPSULE, DELAYED RELEASE;ORAL", EQ, "release"),
    Case("TABLET, ORALLY DISINTEGRATING;ORAL", "TABLET;ORAL", EQ, "release",
         "An ODT is immediate release; the difference is administration, not release."),
    Case("TABLET, ORALLY DISINTEGRATING;ORAL", "TABLET, DELAYED RELEASE;ORAL", NEQ, "release"),
    Case("SUSPENSION, EXTENDED RELEASE;ORAL", "SUSPENSION;ORAL", NEQ, "release"),
    Case("TABLET, MULTILAYER, EXTENDED RELEASE;ORAL", "TABLET, EXTENDED RELEASE;ORAL", EQ, "release"),
    Case("TABLET, FILM COATED, EXTENDED RELEASE;ORAL", "TABLET;ORAL", NEQ, "release"),
]

# --- 3. the moiety-derived-release trap ----------------------------------
#     SNOMED EDQM guide 4.1: prolonged release is "achieved by a special
#     formulation design and/or manufacturing method" and therefore not by the
#     substance. Named examples: haloperidol decanoate, insulin isophane,
#     insulin zinc suspension.
MOIETY = [
    Case("INJECTABLE;INTRAMUSCULAR", "INJECTABLE;INTRAMUSCULAR", EQ, "moiety",
         "Both haloperidol decanoate. Long action is the ester, not the form.",
         left_ingredient="HALOPERIDOL DECANOATE",
         right_ingredient="HALOPERIDOL DECANOATE"),
    Case("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR", "INJECTABLE;INTRAMUSCULAR", EQ, "moiety",
         "A decanoate labelled 'extended release' must not be read as a "
         "prolonged-release dose form; the release comes from the molecule.",
         left_ingredient="HALOPERIDOL DECANOATE",
         right_ingredient="HALOPERIDOL DECANOATE"),
    Case("INJECTABLE, SUSPENSION;SUBCUTANEOUS", "INJECTABLE, SUSPENSION;SUBCUTANEOUS", EQ, "moiety",
         "Insulin isophane, named in the guide.",
         left_ingredient="INSULIN ISOPHANE HUMAN",
         right_ingredient="INSULIN ISOPHANE HUMAN"),
    Case("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR", "INJECTABLE;INTRAMUSCULAR", NEQ, "moiety",
         "Plain haloperidol: here 'extended release' IS a dose form property, "
         "so it must still separate the two.",
         left_ingredient="HALOPERIDOL",
         right_ingredient="HALOPERIDOL"),
    Case("INJECTABLE;INTRAMUSCULAR", "INJECTABLE;INTRAMUSCULAR", EQ, "moiety",
         "Testosterone enanthate on both sides.",
         left_ingredient="TESTOSTERONE ENANTHATE",
         right_ingredient="TESTOSTERONE ENANTHATE"),
    Case("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR", "INJECTABLE;INTRAMUSCULAR", EQ, "moiety",
         "Paliperidone palmitate: ester-derived long action.",
         left_ingredient="PALIPERIDONE PALMITATE",
         right_ingredient="PALIPERIDONE PALMITATE"),
]

# --- 4. carrier / delivery system ----------------------------------------
CARRIER = [
    Case("INJECTABLE, LIPOSOMAL;INJECTION", "INJECTABLE, LIPOSOMAL;INJECTION", EQ, "carrier"),
    Case("INJECTABLE, LIPOSOMAL;INTRAVENOUS", "INJECTABLE;INTRAVENOUS", NEQ, "carrier"),
    Case("INJECTABLE, LIPID COMPLEX;INTRAVENOUS", "INJECTABLE, LIPOSOMAL;INTRAVENOUS", NEQ, "carrier",
         "Amphotericin B lipid complex is not liposomal amphotericin B."),
    Case("INJECTABLE, LIPID COMPLEX;INTRAVENOUS", "INJECTABLE;INTRAVENOUS", NEQ, "carrier"),
    Case("INJECTABLE, PROTEIN-BOUND;INTRAVENOUS", "INJECTABLE;INTRAVENOUS", NEQ, "carrier",
         "nab-paclitaxel versus solvent-based paclitaxel."),
    Case("INJECTABLE, LIPOSOMAL;INTRAVENOUS", "INJECTABLE, SUSPENSION;INTRAVENOUS", NEQ, "carrier"),
]

# --- 5. basic dose form --------------------------------------------------
BASIC = [
    Case("TABLET;ORAL", "CAPSULE;ORAL", CAV, "basic",
         "May be interchangeable; must never be equated silently."),
    Case("TABLET, EXTENDED RELEASE;ORAL", "CAPSULE, EXTENDED RELEASE;ORAL", CAV, "basic"),
    Case("TABLET;ORAL", "SOLUTION;ORAL", NEQ, "basic"),
    Case("SOLUTION;ORAL", "SUSPENSION;ORAL", NEQ, "basic",
         "A solution and a suspension differ in more than viscosity."),
    Case("CREAM;TOPICAL", "OINTMENT;TOPICAL", NEQ, "basic"),
    Case("CREAM;TOPICAL", "CREAM;TOPICAL", EQ, "basic"),
    Case("SUPPOSITORY;RECTAL", "SUPPOSITORY;RECTAL", EQ, "basic"),
    Case("TABLET;ORAL", "FILM;ORAL", NEQ, "basic"),
    Case("PATCH;TRANSDERMAL", "PATCH;TRANSDERMAL", EQ, "basic"),
    Case("POWDER;ORAL", "GRANULE;ORAL", NEQ, "basic"),
    Case("SOLUTION;INTRAVENOUS", "SOLUTION;INTRAVENOUS", EQ, "basic"),
    Case("INJECTABLE;INJECTION", "INJECTION;INJECTION", EQ, "basic",
         "The two sources spell the same thing differently."),
]

# --- 6. intended site ----------------------------------------------------
SITE = [
    Case("SOLUTION;OPHTHALMIC", "SOLUTION;OTIC", NEQ, "site",
         "Same solution, different site: never interchangeable."),
    Case("SOLUTION;ORAL", "SOLUTION;INTRAVENOUS", NEQ, "site"),
    Case("TABLET;ORAL", "TABLET;SUBLINGUAL", NEQ, "site"),
    Case("CREAM;TOPICAL", "CREAM;VAGINAL", NEQ, "site"),
    Case("SOLUTION;OPHTHALMIC", "SOLUTION;OPHTHALMIC", EQ, "site"),
    Case("INJECTABLE;INTRAVENOUS", "INJECTABLE;INTRAMUSCULAR", NEQ, "site"),
    Case("AEROSOL, METERED;INHALATION", "AEROSOL, METERED;INHALATION", EQ, "site"),
    Case("SPRAY;NASAL", "SOLUTION;NASAL", NEQ, "site"),
]

# --- 7. transformation ---------------------------------------------------
TRANSFORM = [
    Case("POWDER, FOR SOLUTION;INTRAVENOUS", "SOLUTION;INTRAVENOUS", CAV, "transformation",
         "Reconstituted powder gives the same administrable form; a human "
         "should confirm the reconstitution instructions match."),
    Case("TABLET, FOR SUSPENSION;ORAL", "TABLET, FOR SUSPENSION;ORAL", EQ, "transformation"),
    Case("POWDER, FOR SUSPENSION;ORAL", "SUSPENSION;ORAL", CAV, "transformation"),
    Case("INJECTABLE, POWDER, FOR SOLUTION;INTRAVENOUS", "INJECTABLE;INTRAVENOUS", CAV, "transformation"),
    Case("POWDER, FOR SOLUTION;ORAL", "POWDER, FOR SUSPENSION;ORAL", CAV, "transformation",
         "Both transform, but into different administrable forms."),
]

# --- 8. unknown / unparseable -------------------------------------------
UNKNOWNS = [
    Case("", "TABLET;ORAL", UNK, "unknown", "No input is not a licence to guess."),
    Case("KIT;ORAL", "TABLET;ORAL", UNK, "unknown",
         "A kit has no single basic dose form."),
    Case("ZZZ NOT A DOSE FORM;ORAL", "TABLET;ORAL", UNK, "unknown"),
    Case("Oral Tablet", "TABLET, DELAYED RELEASE;ORAL", UNK, "unknown",
         "RxNorm's DFG cannot say whether release is conventional; the coarse "
         "side must not licence an equivalence. This is the exact shape of the "
         "AZULFIDINE failure."),
    Case("Oral Tablet", "TABLET;ORAL", EQ, "unknown",
         "Both conventional as far as either source says."),
    Case("Oral Liquid", "SOLUTION;ORAL", UNK, "unknown",
         "DFG level: solution or suspension is not decidable."),
]

# --- 9. asymmetry and self-consistency ----------------------------------
#     Cheap to state, and they catch a whole class of ordering bugs: a
#     comparison that depends on which argument came first is not a comparison.
SYMMETRY = [
    Case("TABLET;ORAL", "TABLET, DELAYED RELEASE;ORAL", NEQ, "symmetry",
         "The mirror of the AZULFIDINE regression."),
    Case("INJECTABLE;INTRAVENOUS", "INJECTABLE, LIPOSOMAL;INTRAVENOUS", NEQ, "symmetry",
         "The mirror of the DOXIL regression."),
    Case("CAPSULE;ORAL", "TABLET;ORAL", CAV, "symmetry",
         "capsule-tablet must downgrade in both directions."),
    Case("TABLET;ORAL", "Oral Tablet", EQ, "symmetry",
         "Cross-source, and the coarse side is on the right this time."),
    Case("TABLET, DELAYED RELEASE;ORAL", "Oral Tablet", UNK, "symmetry",
         "Coarse side on the right must still block, not licence."),
    Case("TABLET;ORAL", "TABLET;ORAL", EQ, "symmetry", "Reflexive."),
    Case("INJECTABLE, LIPOSOMAL;INTRAVENOUS", "INJECTABLE, LIPOSOMAL;INTRAVENOUS", EQ,
         "symmetry", "Reflexive with a carrier."),
    Case("", "", UNK, "symmetry", "Two blanks are not a match."),
]

# --- 10. administration method ------------------------------------------
#     Same site, same basic form, same release — only how the patient takes it
#     differs. EDQM attributes are not definitional (SNOMED guide 4.1), so this
#     downgrades rather than separating.
METHOD = [
    Case("TABLET, CHEWABLE;ORAL", "TABLET;ORAL", CAV, "method",
         "Chewable versus swallowed: plausible interchange, but the "
         "instructions differ and nobody has ruled on it."),
    Case("TABLET, CHEWABLE;ORAL", "TABLET, CHEWABLE;ORAL", EQ, "method"),
    Case("TABLET, EFFERVESCENT;ORAL", "TABLET;ORAL", CAV, "method"),
    Case("TABLET, CHEWABLE;ORAL", "TABLET, DELAYED RELEASE;ORAL", NEQ, "method",
         "Release still wins: a chewable delayed-release tablet is a "
         "contradiction, and release is the graver difference."),
]

DOSE_FORM_CASES = (REGRESSIONS + RELEASE + MOIETY + CARRIER
                   + BASIC + SITE + TRANSFORM + UNKNOWNS + SYMMETRY + METHOD)


# =========================================================================
# Strength
# =========================================================================
@dataclass(frozen=True)
class StrengthCase:
    left: str
    right: str
    expected: str
    group: str
    note: str = ""
    context: str | None = None       # a dose form string, when it matters


STRENGTH_CASES = [
    # --- the real failure ------------------------------------------------
    StrengthCase("50MG/25ML (2MG/ML)", "20MG/10ML (2MG/ML)", NEQ, "regression",
                 "DOXIL. Identical concentration, different total. The old "
                 "parser flattened both into a set and matched on the shared "
                 "(2, MG).", context="INJECTABLE, LIPOSOMAL;INJECTION"),

    # --- unit normalisation ---------------------------------------------
    StrengthCase("500MG", "0.5G", EQ, "units"),
    StrengthCase("500MG", "500 MG", EQ, "units"),
    StrengthCase("100MCG", "0.1MG", EQ, "units"),
    StrengthCase("1G", "1000MG", EQ, "units"),
    StrengthCase("500MG", "250MG", NEQ, "units"),
    StrengthCase("10 UNITS", "10 IU", EQ, "units"),
    StrengthCase("100 UNITS/ML", "100 IU/ML", EQ, "units"),
    StrengthCase("40MG", "40MCG", NEQ, "units", "Same number, different scale."),

    # --- total versus concentration -------------------------------------
    StrengthCase("2MG/ML", "2MG/ML", EQ, "concentration"),
    StrengthCase("2MG/ML", "4MG/ML", NEQ, "concentration"),
    StrengthCase("20MG/10ML", "2MG/ML", CAV, "concentration",
                 "Same concentration; the total is stated on one side only."),
    StrengthCase("20MG/10ML (2MG/ML)", "20MG/10ML (2MG/ML)", EQ, "concentration"),
    StrengthCase("100MG/50ML", "100MG/100ML", NEQ, "concentration",
                 "Same total, different concentration."),
    StrengthCase("2MG/ML", "10MG/5ML", CAV, "concentration"),

    # --- salt versus base ------------------------------------------------
    StrengthCase("EQ 40MG BASE", "40MG", EQ, "salt",
                 "The Orange Book says outright that it is stating the base."),
    StrengthCase("EQ 40MG BASE", "EQ 40MG BASE", EQ, "salt"),
    StrengthCase("EQ 5MG BASE", "6.9MG", UNK, "salt",
                 "Amlodipine besylate 6.9 mg is 5 mg of base, but nothing in "
                 "either string says so. Resolving it needs the active moiety "
                 "relation, which this module does not have."),
    StrengthCase("EQ 40MG BASE", "50MG", UNK, "salt",
                 "Relabelled during evaluation. One side states the base and "
                 "the other states nothing, so 50 mg of salt could well be "
                 "40 mg of base; asserting NOT_EQUIVALENT here would hide a "
                 "genuine equivalent. Deciding it needs the active moiety "
                 "relation, which this module does not have."),

    # --- per unit --------------------------------------------------------
    StrengthCase("40MG", "40MG", EQ, "per_unit", context="TABLET;ORAL"),
    StrengthCase("40MG", "20MG", NEQ, "per_unit", context="TABLET;ORAL"),

    # --- ratio -----------------------------------------------------------
    StrengthCase("1:1000", "1:1000", EQ, "ratio"),
    StrengthCase("1:1000", "1:10000", NEQ, "ratio"),
    StrengthCase("1:1000", "1MG/ML", UNK, "ratio",
                 "A ratio is convertible in principle; doing it silently is "
                 "how a tenfold epinephrine error happens."),

    # --- multi-component -------------------------------------------------
    StrengthCase("100MG;12.5MG", "100MG;12.5MG", EQ, "combination"),
    StrengthCase("100MG;12.5MG", "100MG;25MG", NEQ, "combination"),
    StrengthCase("100MG;12.5MG", "100MG", NEQ, "combination",
                 "A two-component product is not a one-component product."),
    StrengthCase("50MG;12.5MG", "12.5MG;50MG", EQ, "combination",
                 "Order is a spelling choice, not a difference."),

    # --- percent ---------------------------------------------------------
    StrengthCase("0.5%", "0.5%", EQ, "percent"),
    StrengthCase("0.5%", "1%", NEQ, "percent"),
    StrengthCase("0.5%", "5MG/ML", UNK, "percent",
                 "0.5% w/v is 5 mg/mL only if the basis is w/v, which the "
                 "string does not say."),

    # --- unparseable -----------------------------------------------------
    StrengthCase("", "40MG", UNK, "unknown"),
    StrengthCase("N/A", "40MG", UNK, "unknown"),
    StrengthCase("SEE PACKAGE INSERT", "40MG", UNK, "unknown"),

    # --- symmetry --------------------------------------------------------
    StrengthCase("0.5G", "500MG", EQ, "symmetry"),
    StrengthCase("20MG/10ML (2MG/ML)", "50MG/25ML (2MG/ML)", NEQ, "symmetry",
                 "The DOXIL regression, arguments reversed."),
    StrengthCase("2MG/ML", "20MG/10ML", CAV, "symmetry"),
    StrengthCase("40MG", "EQ 40MG BASE", EQ, "symmetry"),
    StrengthCase("40MG", "", UNK, "symmetry"),
    StrengthCase("40MG", "40MG", EQ, "symmetry", "Reflexive."),
]


def counts() -> dict:
    """Case counts by group, for the evaluation report."""
    out: dict[str, int] = {}
    for case in DOSE_FORM_CASES:
        out[f"dose_form/{case.group}"] = out.get(f"dose_form/{case.group}", 0) + 1
    for case in STRENGTH_CASES:
        out[f"strength/{case.group}"] = out.get(f"strength/{case.group}", 0) + 1
    return out


if __name__ == "__main__":
    total = len(DOSE_FORM_CASES) + len(STRENGTH_CASES)
    print(f"{total} cases ({len(DOSE_FORM_CASES)} dose form, "
          f"{len(STRENGTH_CASES)} strength)")
    for group, n in sorted(counts().items()):
        print(f"  {group:34} {n:3}")
