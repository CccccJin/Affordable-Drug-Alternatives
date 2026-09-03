"""Dose form facet extraction and comparison.

The hub in a hub-and-spoke design: RxNorm dose forms and Orange Book dose form
strings are each decomposed into the same facets, and equivalence is decided
facet by facet. There is deliberately no RxNorm-to-Orange-Book mapping table.

The reason is measured, not aesthetic. Ahnfelt et al. (2025) report one-to-one
match rates between EDQM dose forms and other terminologies of 16% (Health
Canada), 20% (CDISC), 22% (US FDA) and 45% (SNOMED). At a 22% match rate, four
out of five FDA terms have no single counterpart, so a pairwise table is not a
table with gaps — it is mostly gaps. OHDSI's RxNorm Extension reached the same
conclusion independently across twelve source vocabularies in ten countries
(Ostropolets et al. 2025).

Facets follow EDQM Standard Terms (ISO 11239): basic dose form, transformation,
release characteristics, intended site, administration method. One extension,
`carrier`, is documented in design.md §2.2.

Vocabularies live in `vocab/*.csv` and are data. Updating one must never
require touching this file.
"""
from __future__ import annotations

import csv
import re
import tomllib
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Literal

HERE = Path(__file__).resolve().parent
VOCAB = HERE / "vocab"
CONFIG = HERE / "config.toml"

Source = Literal["rxnorm", "orange_book", "openfda"]


class Equivalence(str, Enum):
    EQUIVALENT = "EQUIVALENT"
    EQUIVALENT_WITH_CAVEAT = "EQUIVALENT_WITH_CAVEAT"
    NOT_EQUIVALENT = "NOT_EQUIVALENT"
    UNKNOWN = "UNKNOWN"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


#: A facet the extractor could not fill. Distinct from a facet that is
#: genuinely absent: "conventional release" is a value, "we could not tell" is
#: not, and collapsing the two is how the coarse source silently licences an
#: equivalence.
UNKNOWN = None


@dataclass(frozen=True)
class DoseFormFacets:
    raw: str
    source: Source
    basic_dose_form: str | None = None
    transformation: str | None = None
    release: str | None = None
    intended_site: str | None = None
    administration_method: str | None = None
    carrier: str | None = None
    #: Every inference this extractor made that was not a direct lookup.
    #: Nothing is allowed to be assumed silently.
    notes: tuple[str, ...] = ()

    def facet_items(self):
        yield "basic_dose_form", self.basic_dose_form
        yield "transformation", self.transformation
        yield "release", self.release
        yield "intended_site", self.intended_site
        yield "administration_method", self.administration_method
        yield "carrier", self.carrier


@dataclass(frozen=True)
class FacetDiff:
    facet: str
    left: str | None
    right: str | None


@dataclass(frozen=True)
class DoseFormVerdict:
    verdict: Equivalence
    rule: str
    confidence: Confidence
    diff: tuple[FacetDiff, ...] = ()
    notes: tuple[str, ...] = ()

    def __str__(self) -> str:
        parts = [f"{self.verdict.value} [{self.rule}, {self.confidence.value}]"]
        for d in self.diff:
            parts.append(f"{d.facet}: {d.left!r} vs {d.right!r}")
        return " · ".join(parts)


# --- vocabulary loading ---------------------------------------------------
@lru_cache(maxsize=None)
def _table(name: str) -> tuple[tuple[str, str], ...]:
    """(pattern, value) rows, longest pattern first.

    Longest first matters: "DELAYED RELEASE" must win over "DELAYED REL", and
    "EXTENDED RELEASE" over a hypothetical "RELEASE". Sorting here means the
    CSV author does not have to think about ordering.
    """
    path = VOCAB / name
    with path.open(encoding="utf-8") as fh:
        rows = [(r["pattern"].strip().upper(), r["value"].strip())
                for r in csv.DictReader(fh)]
    return tuple(sorted(rows, key=lambda r: -len(r[0])))


@lru_cache(maxsize=None)
def _moiety_patterns() -> tuple[str, ...]:
    with (VOCAB / "moiety_release.csv").open(encoding="utf-8") as fh:
        return tuple(r["pattern"].strip().upper() for r in csv.DictReader(fh))


@lru_cache(maxsize=None)
def config() -> dict:
    with CONFIG.open("rb") as fh:
        return tomllib.load(fh)


# --- extraction -----------------------------------------------------------
_SPLIT = re.compile(r"\s*;\s*")
_NORMALISE = re.compile(r"[^A-Z0-9]+")


def _canon(text: str) -> str:
    """Upper-case, punctuation folded to single spaces.

    "ENTERIC-COATED", "ENTERIC COATED" and "enteric  coated" become one string,
    so the vocabulary carries the term once rather than once per hyphenation.
    """
    return _NORMALISE.sub(" ", text.upper()).strip()


def _lookup(text: str, table: str) -> str | None:
    canon = _canon(text)
    for pattern, value in _table(table):
        if _canon(pattern) in canon:
            return value
    return None


#: RxNorm dose form *groups* (TTY=DFG) name a family, not a form: "Oral Tablet"
#: covers plain and delayed-release tablets alike, "Oral Liquid" covers
#: solutions and suspensions. Treating a DFG as though it stated the release
#: characteristic is precisely the bug this module exists to fix, so these are
#: recognised and their unstated facets left UNKNOWN.
_DFG_LIKE = {
    "ORAL TABLET": ("tablet", "oral"),
    "ORAL CAPSULE": ("capsule", "oral"),
    "ORAL LIQUID": (None, "oral"),
    "ORAL PRODUCT": (None, "oral"),
    "INJECTABLE PRODUCT": ("injection", None),
    "TOPICAL PRODUCT": (None, "topical"),
    "OPHTHALMIC PRODUCT": (None, "ophthalmic"),
}

#: Orange Book writes some forms as an unsplittable whole. "KIT" has no single
#: basic dose form by definition, so it must not resolve to one.
_NO_SINGLE_FORM = {"KIT", "COMBINATION"}


def normalize_dose_form(
    raw: str,
    source: Source = "orange_book",
    *,
    ingredient: str | None = None,
) -> DoseFormFacets:
    """Decompose one source string into EDQM facets.

    `ingredient` is consulted only for the moiety-derived-release rule: SNOMED's
    EDQM mapping guide states that prolonged release is "achieved by a special
    formulation design and/or manufacturing method", and that products whose
    long action comes from the substance — haloperidol decanoate, insulin
    isophane, insulin zinc suspension are the named examples — must not be given
    a prolonged-release dose form. Without this, every depot injection is
    mis-faceted.
    """
    notes: list[str] = []
    if not raw or not raw.strip():
        return DoseFormFacets(raw=raw, source=source,
                              notes=("empty input; every facet UNKNOWN",))

    head, _, tail = raw.partition(";")
    form_part, route_part = head.strip(), tail.strip()
    canon_form = _canon(form_part)

    # A DFG-level term names a family. Fill only what it actually states.
    dfg = _DFG_LIKE.get(canon_form)
    if dfg is not None:
        basic, site = dfg
        notes.append(f"dose form group '{form_part}': unstated facets left UNKNOWN")
        return DoseFormFacets(
            raw=raw, source=source, basic_dose_form=basic,
            intended_site=site or _lookup(route_part, "intended_site.csv"),
            administration_method=_lookup(route_part, "administration_method.csv"),
            notes=tuple(notes))

    if canon_form in _NO_SINGLE_FORM:
        notes.append(f"'{form_part}' has no single basic dose form")
        return DoseFormFacets(raw=raw, source=source, notes=tuple(notes))

    basic = _lookup(form_part, "basic_dose_form.csv")
    if basic is None:
        notes.append(f"no basic dose form recognised in '{form_part}'")

    release = _lookup(form_part, "release.csv")
    transformation = _lookup(form_part, "transformation.csv")
    carrier = _lookup(form_part, "carrier.csv")

    # The moiety-derived-release rule. Applied after lookup, because the string
    # may well say "extended release" — the point is that for these substances
    # the label describes the molecule, not the formulation.
    if release == "prolonged" and ingredient:
        moiety = _canon(ingredient)
        for pattern in _moiety_patterns():
            if _canon(pattern) in moiety:
                notes.append(
                    f"release suppressed: '{pattern}' in the ingredient means the "
                    "long action comes from the substance, not the dose form "
                    "(SNOMED EDQM Dose Form Map Guide 4.1)")
                release = None
                break

    # An Orange Book string that names a form and no release qualifier is
    # stating conventional release. A *group* term is not, which is why the DFG
    # branch above returns before reaching here.
    if release is None and basic is not None and source != "rxnorm":
        release = "conventional"

    site = _lookup(route_part, "intended_site.csv") if route_part else None
    # Administration method can be stated by either half. "TABLET, CHEWABLE;ORAL"
    # and "TABLET;ORAL" share a site and differ in method, which the route alone
    # cannot express.
    method = (_lookup(form_part, "administration_method.csv")
              or (_lookup(route_part, "administration_method.csv") if route_part else None))
    if route_part and site is None:
        notes.append(f"route '{route_part}' not in the vocabulary")

    return DoseFormFacets(
        raw=raw, source=source, basic_dose_form=basic,
        transformation=transformation, release=release,
        intended_site=site, administration_method=method, carrier=carrier,
        notes=tuple(notes))


# --- comparison -----------------------------------------------------------
def _diff(a: DoseFormFacets, b: DoseFormFacets, facet: str) -> FacetDiff:
    return FacetDiff(facet, getattr(a, facet), getattr(b, facet))


def _both_known(a: DoseFormFacets, b: DoseFormFacets, facet: str) -> bool:
    return getattr(a, facet) is not None and getattr(b, facet) is not None


def compare_dose_forms(a: DoseFormFacets, b: DoseFormFacets) -> DoseFormVerdict:
    """Facet-by-facet, rules in order, first match wins.

    Order encodes priority, and every rule that can return NOT_EQUIVALENT is
    evaluated before every rule that can return EQUIVALENT. The cost function
    is asymmetric — calling two products equivalent when they are not is worse
    than declining to answer — so the negative rules get first refusal.

    Facet inequality on its own does not imply concept inequality: SNOMED's
    guide notes that EDQM attributes are "NOT definitional" for the concept.
    Rules R-02, R-03 and R-06 return NOT_EQUIVALENT because each has its own
    regulatory or pharmacological grounding, not because a facet differs.
    """
    notes = tuple(a.notes) + tuple(b.notes)
    cfg = config()["dose_form"]
    downgrade_pairs = {frozenset(p) for p in cfg["downgrade_pairs"]}

    # R-01 — no basic dose form on one side: nothing to compare.
    if a.basic_dose_form is None or b.basic_dose_form is None:
        return DoseFormVerdict(
            Equivalence.UNKNOWN, "R-01", Confidence.NONE,
            (_diff(a, b, "basic_dose_form"),), notes)

    # R-02 — intended site.
    if _both_known(a, b, "intended_site") and a.intended_site != b.intended_site:
        return DoseFormVerdict(
            Equivalence.NOT_EQUIVALENT, "R-02", Confidence.HIGH,
            (_diff(a, b, "intended_site"),), notes)

    # R-03 — release characteristics, both stated and different.
    if _both_known(a, b, "release") and a.release != b.release:
        return DoseFormVerdict(
            Equivalence.NOT_EQUIVALENT, "R-03", Confidence.HIGH,
            (_diff(a, b, "release"),), notes)

    # R-04 — release unknown on one side while the other is not conventional.
    #        The coarse source may not licence an equivalence.
    if not _both_known(a, b, "release"):
        stated = a.release if a.release is not None else b.release
        if stated is not None and stated != "conventional":
            return DoseFormVerdict(
                Equivalence.UNKNOWN, "R-04", Confidence.NONE,
                (_diff(a, b, "release"),),
                notes + ("one side does not state release characteristics and the "
                         "other is not conventional",))

    # R-06 — carrier. Checked before basic dose form because a liposomal and a
    #        conventional injection share every other facet.
    if a.carrier != b.carrier:
        return DoseFormVerdict(
            Equivalence.NOT_EQUIVALENT, "R-06", Confidence.HIGH,
            (_diff(a, b, "carrier"),), notes)

    # R-05 — transformation differs: a human must look.
    if a.transformation != b.transformation:
        return DoseFormVerdict(
            Equivalence.EQUIVALENT_WITH_CAVEAT, "R-05", Confidence.LOW,
            (_diff(a, b, "transformation"),),
            notes + ("one side transforms before administration; confirm the "
                     "reconstitution or dispersion instructions",))

    # R-07 / R-08 — basic dose form.
    if a.basic_dose_form != b.basic_dose_form:
        pair = frozenset((a.basic_dose_form, b.basic_dose_form))
        if pair in downgrade_pairs:
            return DoseFormVerdict(
                Equivalence.EQUIVALENT_WITH_CAVEAT, "R-08", Confidence.MEDIUM,
                (_diff(a, b, "basic_dose_form"),),
                notes + ("interchange between these forms is plausible but is "
                         "not an FDA finding",))
        return DoseFormVerdict(
            Equivalence.NOT_EQUIVALENT, "R-07", Confidence.HIGH,
            (_diff(a, b, "basic_dose_form"),), notes)

    # R-09 — administration method alone only downgrades. EDQM attributes are
    #        not definitional, and this facet has no independent grounding.
    if (_both_known(a, b, "administration_method")
            and a.administration_method != b.administration_method):
        return DoseFormVerdict(
            Equivalence.EQUIVALENT_WITH_CAVEAT, "R-09", Confidence.LOW,
            (_diff(a, b, "administration_method"),), notes)

    # R-10 — every known facet agrees.
    if all(getattr(a, f) == getattr(b, f) for f, _ in a.facet_items()
           if _both_known(a, b, f)):
        return DoseFormVerdict(Equivalence.EQUIVALENT, "R-10", Confidence.HIGH,
                               (), notes)

    # R-11 — explicit fallback, marked as such. Never silent.
    return DoseFormVerdict(
        Equivalence.UNKNOWN, "R-11", Confidence.NONE, (),
        notes + ("no rule matched; this is an explicit fallback, not a default",))
