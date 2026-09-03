"""Dose form and strength semantic alignment.

Public surface:

    normalize_dose_form(raw, source, *, ingredient=None) -> DoseFormFacets
    compare_dose_forms(a, b)                             -> DoseFormVerdict
    normalize_strength(raw, context=None)                -> NormalizedStrength
    compare_strengths(a, b, *, context=None)             -> StrengthVerdict

See design.md for the facet schema and the rule table, lit-review.md for the
literature the rules rest on, and LIMITATIONS.md for where this fails.
"""
from .facets import (Confidence, DoseFormFacets, DoseFormVerdict, Equivalence,
                     FacetDiff, compare_dose_forms, normalize_dose_form)
from .strength import (Component, NormalizedStrength, Quantity, StrengthVerdict,
                       compare_strengths, normalize_strength)

__all__ = [
    "normalize_dose_form", "compare_dose_forms",
    "normalize_strength", "compare_strengths",
    "DoseFormFacets", "DoseFormVerdict", "FacetDiff",
    "NormalizedStrength", "StrengthVerdict", "Component", "Quantity",
    "Equivalence", "Confidence",
]
