"""Strength normalisation and comparison.

A separate module from `facets.py` on purpose. Dose form is a categorical
description; strength is a quantity. They fail in different ways, they are
fixed by different vocabularies, and coupling them is how a concentration ends
up being compared against a total.

Which is exactly what went wrong. The pipeline's DOXIL failure:

    parse_strength("50MG/25ML (2MG/ML)") -> {(2.0,'MG'), (50.0,'MG')}
    parse_strength("20MG/10ML (2MG/ML)") -> {(2.0,'MG'), (20.0,'MG')}
    intersection                         -> {(2.0,'MG')}    -> "same strength"

Both products state a total *and* a concentration; flattening them into one
undifferentiated set and matching on intersection let the shared concentration
speak for the differing total. The representation here keeps the two apart, and
comparison is like-for-like or it does not happen.

Dose form enters only as *context* — it decides whether a per-unit figure is
meaningful — and is never modified here.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from pathlib import Path

from .facets import (Confidence, DoseFormFacets, Equivalence, config,
                     VOCAB)


class StrengthKind(str, Enum):
    TOTAL = "total"
    CONCENTRATION = "concentration"
    RATIO = "ratio"
    PERCENT = "percent"


@dataclass(frozen=True)
class Quantity:
    value: float
    unit: str

    def __str__(self) -> str:
        return f"{self.value:g} {self.unit}"


@dataclass(frozen=True)
class Component:
    """One active component's strength. A combination product has several."""
    total: Quantity | None = None
    concentration: tuple[Quantity, Quantity] | None = None
    ratio: tuple[float, float] | None = None
    percent: float | None = None

    def sort_key(self):
        return (
            self.total.value if self.total else -1,
            self.total.unit if self.total else "",
            self.concentration[0].value if self.concentration else -1,
            self.percent if self.percent is not None else -1,
            self.ratio[1] if self.ratio else -1,
        )


@dataclass(frozen=True)
class NormalizedStrength:
    raw: str
    components: tuple[Component, ...] = ()
    #: Every inference not read straight off the string. `salt_normalized`
    #: means the source said so ("EQ 40MG BASE"); it is never assumed.
    flags: frozenset[str] = frozenset()

    @property
    def parsed(self) -> bool:
        return bool(self.components)


@dataclass(frozen=True)
class StrengthVerdict:
    verdict: Equivalence
    rule: str
    confidence: Confidence
    detail: str = ""
    notes: tuple[str, ...] = ()

    def __str__(self) -> str:
        return f"{self.verdict.value} [{self.rule}, {self.confidence.value}] {self.detail}"


# --- units ----------------------------------------------------------------
@lru_cache(maxsize=None)
def _units() -> dict[str, tuple[str, float]]:
    with (VOCAB / "unit.csv").open(encoding="utf-8") as fh:
        return {r["unit"].strip().upper():
                (r["canonical"].strip().upper(), float(r["factor"]))
                for r in csv.DictReader(fh)}


def _quantity(value: float, unit: str) -> Quantity | None:
    table = _units()
    key = unit.strip().upper()
    if key not in table:
        return None
    canonical, factor = table[key]
    return Quantity(round(value * factor, 9), canonical)


# --- parsing --------------------------------------------------------------
_NUM = r"(\d+(?:\.\d+)?)"
_UNIT = r"([A-Za-z%]+)"

_RATIO = re.compile(rf"{_NUM}\s*:\s*{_NUM}")
_PERCENT = re.compile(rf"{_NUM}\s*%")
#: "50MG/25ML" and "2MG/ML" alike. A bare denominator unit means one of it.
_CONC = re.compile(rf"{_NUM}\s*{_UNIT}\s*/\s*(?:{_NUM}\s*)?{_UNIT}")
_PLAIN = re.compile(rf"{_NUM}\s*{_UNIT}")

#: Orange Book states the basis explicitly when it is the base rather than the
#: salt. That is a statement, not an inference, so it is honoured; when the
#: string is silent the module does not guess.
_BASE = re.compile(r"\bEQ\b.*\bBASE\b")

_UNPARSEABLE = ("N/A", "NA", "SEE PACKAGE INSERT", "SEE LABEL", "-", "")


def _parse_component(text: str) -> Component | None:
    text = text.strip()
    if not text:
        return None

    # Ratio first: "1:1000" would otherwise read as two plain numbers.
    m = _RATIO.search(text)
    if m:
        return Component(ratio=(float(m.group(1)), float(m.group(2))))

    m = _PERCENT.search(text)
    if m:
        return Component(percent=float(m.group(1)))

    total: Quantity | None = None
    concentration: tuple[Quantity, Quantity] | None = None

    # Concentrations, in source order. "50MG/25ML (2MG/ML)" yields both the
    # pack figure and the per-mL figure; the first is a total over a volume,
    # the second is the concentration.
    concs = _CONC.findall(text)
    for num, unit, den_num, den_unit in concs:
        numerator = _quantity(float(num), unit)
        denominator = _quantity(float(den_num) if den_num else 1.0, den_unit)
        if numerator is None or denominator is None:
            continue
        if den_num and float(den_num) != 1.0:
            # "50MG/25ML" states the total in the pack and its volume.
            total = total or numerator
            if concentration is None:
                concentration = (
                    Quantity(round(numerator.value / denominator.value, 9),
                             numerator.unit),
                    Quantity(1.0, denominator.unit))
        else:
            concentration = (numerator, denominator)

    if total is None and concentration is None:
        # A plain amount, with any parenthesised restatement ignored.
        head = text.split("(")[0]
        m = _PLAIN.search(head)
        if m:
            total = _quantity(float(m.group(1)), m.group(2))

    if total is None and concentration is None:
        return None
    return Component(total=total, concentration=concentration)


def normalize_strength(
    raw: str,
    context: DoseFormFacets | None = None,   # noqa: ARG001 — see module docstring
) -> NormalizedStrength:
    """Parse a source strength into structured, comparable quantities.

    `context` is accepted so callers can pass the dose form without a second
    call site, and is used by `compare_strengths`, not here: parsing must not
    depend on the form, or the same string would mean different things in
    different rows.
    """
    if raw is None or raw.strip().upper() in _UNPARSEABLE:
        return NormalizedStrength(raw=raw or "", flags=frozenset({"unparsed_empty"}))

    flags: set[str] = set()
    text = raw.strip()
    if _BASE.search(text.upper()):
        flags.add("salt_normalized")

    # ";" separates the components of a combination product in the Orange Book.
    parts = [p for p in text.split(";") if p.strip()]
    components = tuple(c for c in (_parse_component(p) for p in parts) if c)

    if not components:
        flags.add(f"unparsed_no_quantity:{text[:40]}")
        return NormalizedStrength(raw=raw, flags=frozenset(flags))

    # Component order is a spelling choice; sorting makes comparison
    # order-independent without pretending the components are interchangeable.
    return NormalizedStrength(raw=raw,
                              components=tuple(sorted(components, key=Component.sort_key)),
                              flags=frozenset(flags))


# --- comparison -----------------------------------------------------------
def _close(a: float, b: float) -> bool:
    cfg = config()["strength"]
    return abs(a - b) <= max(cfg["absolute_tolerance_mg"],
                             cfg["relative_tolerance"] * max(abs(a), abs(b)))


def _same_quantity(a: Quantity | None, b: Quantity | None) -> bool | None:
    """True, False, or None when one side is silent."""
    if a is None or b is None:
        return None
    if a.unit != b.unit:
        return False
    return _close(a.value, b.value)


def _kinds(c: Component) -> set[StrengthKind]:
    out = set()
    if c.total is not None:
        out.add(StrengthKind.TOTAL)
    if c.concentration is not None:
        out.add(StrengthKind.CONCENTRATION)
    if c.ratio is not None:
        out.add(StrengthKind.RATIO)
    if c.percent is not None:
        out.add(StrengthKind.PERCENT)
    return out


def _compare_component(
    a: Component, b: Component, *, basis_differs: bool = False
) -> tuple[Equivalence, str, str]:
    """(verdict, rule, detail) for one component pair.

    `basis_differs` is true when one side states its amount as base
    ("EQ 40MG BASE") and the other says nothing about basis. RxNorm's own
    definitions separate these: IN is "a compound or moiety that gives the drug
    its distinctive clinical properties", PIN "a specified form of the
    ingredient ... most precise ingredients are salt or isomer forms". Without
    the active-moiety relation this module cannot convert between them, so
    differing amounts across differing bases are UNKNOWN rather than unequal:
    amlodipine besylate 6.9 mg and amlodipine 5 mg base are the same product.
    """
    kinds_a, kinds_b = _kinds(a), _kinds(b)

    # Different kinds of quantity are not comparable. A ratio is convertible to
    # a concentration in principle; doing it silently is how a tenfold
    # adrenaline error happens, so it is refused instead.
    if not (kinds_a & kinds_b):
        return (Equivalence.UNKNOWN, "S-01",
                f"not comparable: {sorted(k.value for k in kinds_a)} "
                f"vs {sorted(k.value for k in kinds_b)}")

    if StrengthKind.RATIO in kinds_a & kinds_b:
        same = a.ratio == b.ratio
        return ((Equivalence.EQUIVALENT if same else Equivalence.NOT_EQUIVALENT),
                "S-02", f"{a.ratio} vs {b.ratio}")

    if StrengthKind.PERCENT in kinds_a & kinds_b:
        same = _close(a.percent or 0.0, b.percent or 0.0)
        return ((Equivalence.EQUIVALENT if same else Equivalence.NOT_EQUIVALENT),
                "S-03", f"{a.percent}% vs {b.percent}%")

    total = _same_quantity(a.total, b.total)
    conc = None
    if a.concentration and b.concentration:
        num = _same_quantity(a.concentration[0], b.concentration[0])
        den = _same_quantity(a.concentration[1], b.concentration[1])
        conc = bool(num) and bool(den)

    # S-04 — both totals stated. This is the decisive comparison, and it is
    #        checked before the concentration so that a shared concentration
    #        can never speak for a differing total.
    if total is not None:
        if total is False:
            if basis_differs:
                return (Equivalence.UNKNOWN, "S-11",
                        f"total {a.total} vs {b.total}, and only one side states "
                        "its basis; the difference may be the salt factor")
            return (Equivalence.NOT_EQUIVALENT, "S-04",
                    f"total {a.total} vs {b.total}")
        if conc is False:
            return (Equivalence.NOT_EQUIVALENT, "S-05",
                    f"same total, concentration {a.concentration} vs {b.concentration}")
        return (Equivalence.EQUIVALENT, "S-06", f"total {a.total}")

    # S-06b / S-07 — concentrations agree. Whether that settles it depends on
    #                 whether either side also claims a total: two identical
    #                 concentration statements are identical products, while a
    #                 concentration matching one leg of a pack figure is not.
    if conc is True:
        if a.total is None and b.total is None:
            return (Equivalence.EQUIVALENT, "S-06b",
                    f"concentration {a.concentration[0]}/{a.concentration[1]}")
        return (Equivalence.EQUIVALENT_WITH_CAVEAT, "S-07",
                "concentrations agree; the total is stated on one side only")
    if conc is False:
        return (Equivalence.NOT_EQUIVALENT, "S-08",
                f"concentration {a.concentration} vs {b.concentration}")

    return (Equivalence.UNKNOWN, "S-09", "nothing comparable on both sides")


_ORDER = {Equivalence.NOT_EQUIVALENT: 0, Equivalence.UNKNOWN: 1,
          Equivalence.EQUIVALENT_WITH_CAVEAT: 2, Equivalence.EQUIVALENT: 3}


def compare_strengths(
    a: NormalizedStrength,
    b: NormalizedStrength,
    *,
    context: DoseFormFacets | None = None,
) -> StrengthVerdict:
    """Compare two normalised strengths, like for like.

    A combination product is compared component by component and takes the
    weakest verdict any component produced: a two-component product whose
    second component differs is not equivalent, however well the first matches.
    """
    notes: tuple[str, ...] = tuple(sorted(a.flags | b.flags))

    if not a.parsed or not b.parsed:
        return StrengthVerdict(
            Equivalence.UNKNOWN, "S-00", Confidence.NONE,
            "one side could not be parsed", notes)

    if len(a.components) != len(b.components):
        return StrengthVerdict(
            Equivalence.NOT_EQUIVALENT, "S-10", Confidence.HIGH,
            f"{len(a.components)} component(s) vs {len(b.components)}", notes)

    # One side stating "EQ ... BASE" while the other is silent means the two
    # amounts may be on different bases.
    basis_differs = ("salt_normalized" in a.flags) != ("salt_normalized" in b.flags)

    worst = Equivalence.EQUIVALENT
    rule, detail = "S-06", ""
    for left, right in zip(a.components, b.components):
        verdict, r, d = _compare_component(left, right, basis_differs=basis_differs)
        if _ORDER[verdict] < _ORDER[worst]:
            worst, rule, detail = verdict, r, d

    confidence = {
        Equivalence.EQUIVALENT: Confidence.HIGH,
        Equivalence.NOT_EQUIVALENT: Confidence.HIGH,
        Equivalence.EQUIVALENT_WITH_CAVEAT: Confidence.LOW,
        Equivalence.UNKNOWN: Confidence.NONE,
    }[worst]

    # The context is used here, not in parsing: for a countable single-dose
    # form a bare amount is a per-unit strength, which is what makes two
    # tablets comparable at all.
    if context is not None and context.basic_dose_form in ("tablet", "capsule"):
        notes = notes + ("per-unit comparison (countable single-dose form)",)

    return StrengthVerdict(worst, rule, confidence, detail, notes)
