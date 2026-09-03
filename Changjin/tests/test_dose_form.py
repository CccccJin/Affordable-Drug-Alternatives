"""Dose form and strength alignment.

The labelled set lives in `dose_form/testset.py` and is driven here row by row,
so a case appears both in `pytest` and in the evaluation report rather than
only in one of them.

Three of those rows are the pipeline's real end-to-end failures. They get their
own tests as well, named after the products, because a regression there is a
regression in the thing this module was built for.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dose_form import (  # noqa: E402
    Equivalence, compare_dose_forms, compare_strengths, normalize_dose_form,
    normalize_strength)
from dose_form.testset import DOSE_FORM_CASES, STRENGTH_CASES  # noqa: E402


def _facets(raw: str, ingredient: str | None = None):
    source = "orange_book" if ";" in raw else "rxnorm"
    return normalize_dose_form(raw, source, ingredient=ingredient)


def _dose_form_verdict(case):
    return compare_dose_forms(
        _facets(case.left, case.left_ingredient),
        _facets(case.right, case.right_ingredient),
    ).verdict.value


def _strength_verdict(case):
    ctx = _facets(case.context) if case.context else None
    return compare_strengths(normalize_strength(case.left, ctx),
                             normalize_strength(case.right, ctx),
                             context=ctx).verdict.value


# --- the whole labelled set ----------------------------------------------
@pytest.mark.parametrize(
    "case", DOSE_FORM_CASES,
    ids=[f"{c.group}:{c.left[:22]}|{c.right[:22]}" for c in DOSE_FORM_CASES])
def test_dose_form_case(case):
    assert _dose_form_verdict(case) == case.expected, case.note or ""


@pytest.mark.parametrize(
    "case", STRENGTH_CASES,
    ids=[f"{c.group}:{c.left[:20]}|{c.right[:20]}" for c in STRENGTH_CASES])
def test_strength_case(case):
    assert _strength_verdict(case) == case.expected, case.note or ""


# --- the three real failures, named -------------------------------------
class TestTheEndToEndFailures:
    """The pipeline's three residual misses, from EVALUATION_REPORT.md.

    Each was checked against `subst_data/cache/substitutability.sqlite` before
    being written down, and two of them turned out to have a different cause
    than the report's one-line summary implied.
    """

    def test_azulfidine_en_tabs_is_not_a_plain_tablet(self):
        """Release characteristics, lost because RxNorm collapses them.

        The Orange Book is precise on both sides — `TABLET, DELAYED RELEASE`
        against `TABLET` — and sulfasalazine is marketed as both. RxNorm calls
        each of them `Oral Tablet`, and the old check deferred to RxNorm.
        """
        verdict = compare_dose_forms(_facets("TABLET, DELAYED RELEASE;ORAL"),
                                     _facets("TABLET;ORAL"))
        assert verdict.verdict is Equivalence.NOT_EQUIVALENT
        assert verdict.rule == "R-03"
        assert verdict.diff[0].facet == "release"

    def test_doxil_is_not_conventional_doxorubicin(self):
        """Carrier. Same molecule, same route, different delivery system."""
        verdict = compare_dose_forms(_facets("INJECTABLE, LIPOSOMAL;INJECTION"),
                                     _facets("INJECTABLE;INJECTION"))
        assert verdict.verdict is Equivalence.NOT_EQUIVALENT
        assert verdict.rule == "R-06"

    def test_doxil_strengths_are_not_equal_at_equal_concentration(self):
        """The actual DOXIL failure, which was strength rather than dose form.

        Both products are `INJECTABLE, LIPOSOMAL` and both are 2 mg/mL. The old
        parser flattened `50MG/25ML (2MG/ML)` to {(50,MG),(2,MG)} and
        `20MG/10ML (2MG/ML)` to {(20,MG),(2,MG)}, then matched on the
        intersection — so the shared concentration spoke for the differing
        total.
        """
        ctx = _facets("INJECTABLE, LIPOSOMAL;INJECTION")
        verdict = compare_strengths(normalize_strength("50MG/25ML (2MG/ML)", ctx),
                                    normalize_strength("20MG/10ML (2MG/ML)", ctx),
                                    context=ctx)
        assert verdict.verdict is Equivalence.NOT_EQUIVALENT
        assert "total" in verdict.detail

    def test_afinitor_disperz_is_not_a_plain_tablet(self):
        """Transformation: a tablet for suspension is not a tablet.

        EDQM separates the manufactured dose form from the administrable one;
        `FOR SUSPENSION` says this one is dispersed before use. The Ahnfelt
        2025 global attributes drop `transformation` because they only cover
        administrable forms — the Orange Book records manufactured forms, so
        this project keeps it.
        """
        verdict = compare_dose_forms(_facets("TABLET, FOR SUSPENSION;ORAL"),
                                     _facets("TABLET;ORAL"))
        assert verdict.verdict is Equivalence.EQUIVALENT_WITH_CAVEAT
        assert verdict.rule == "R-05"


# --- the properties the design rests on ----------------------------------
class TestNoSilentFallback:
    """A coarse source may constrain a verdict; it may never licence one."""

    def test_a_dose_form_group_does_not_state_release(self):
        facets = normalize_dose_form("Oral Tablet", "rxnorm")
        assert facets.basic_dose_form == "tablet"
        assert facets.release is None, (
            "'Oral Tablet' covers plain and delayed-release tablets alike; "
            "reading it as conventional is the AZULFIDINE bug")

    def test_the_coarse_side_cannot_licence_an_equivalence(self):
        verdict = compare_dose_forms(_facets("Oral Tablet"),
                                     _facets("TABLET, DELAYED RELEASE;ORAL"))
        assert verdict.verdict is Equivalence.UNKNOWN
        assert verdict.rule == "R-04"

    def test_it_still_answers_when_the_coarse_side_is_enough(self):
        verdict = compare_dose_forms(_facets("Oral Tablet"), _facets("TABLET;ORAL"))
        assert verdict.verdict is Equivalence.EQUIVALENT

    def test_an_empty_input_is_unknown_not_equivalent(self):
        verdict = compare_dose_forms(_facets(""), _facets("TABLET;ORAL"))
        assert verdict.verdict is Equivalence.UNKNOWN

    def test_every_fallback_is_marked_in_the_result(self):
        verdict = compare_dose_forms(_facets(""), _facets("TABLET;ORAL"))
        assert verdict.notes, "a fallback with no note is a silent default"


class TestTheMoietyTrap:
    """Long action from the molecule is not a dose form property.

    SNOMED's EDQM mapping guide: prolonged release is "achieved by a special
    formulation design and/or manufacturing method", and haloperidol
    decanoate, insulin isophane and insulin zinc suspension are named as
    substances whose long action comes from the molecule instead.
    """

    def test_a_decanoate_is_not_given_a_prolonged_release_form(self):
        facets = normalize_dose_form("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR",
                                     ingredient="HALOPERIDOL DECANOATE")
        assert facets.release != "prolonged"
        assert any("SNOMED" in n for n in facets.notes)

    def test_plain_haloperidol_keeps_its_prolonged_release_form(self):
        facets = normalize_dose_form("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR",
                                     ingredient="HALOPERIDOL")
        assert facets.release == "prolonged"

    def test_the_suppression_changes_the_verdict(self):
        depot = normalize_dose_form("INJECTABLE, EXTENDED RELEASE;INTRAMUSCULAR",
                                    ingredient="HALOPERIDOL DECANOATE")
        plain = normalize_dose_form("INJECTABLE;INTRAMUSCULAR",
                                    ingredient="HALOPERIDOL DECANOATE")
        assert compare_dose_forms(depot, plain).verdict is Equivalence.EQUIVALENT


class TestSymmetry:
    """A comparison that depends on argument order is not a comparison."""

    @pytest.mark.parametrize("case", DOSE_FORM_CASES,
                             ids=[f"{c.left[:18]}|{c.right[:18]}" for c in DOSE_FORM_CASES])
    def test_dose_form_verdicts_are_symmetric(self, case):
        forward = compare_dose_forms(_facets(case.left, case.left_ingredient),
                                     _facets(case.right, case.right_ingredient))
        backward = compare_dose_forms(_facets(case.right, case.right_ingredient),
                                      _facets(case.left, case.left_ingredient))
        assert forward.verdict is backward.verdict

    @pytest.mark.parametrize("case", STRENGTH_CASES,
                             ids=[f"{c.left[:16]}|{c.right[:16]}" for c in STRENGTH_CASES])
    def test_strength_verdicts_are_symmetric(self, case):
        ctx = _facets(case.context) if case.context else None
        forward = compare_strengths(normalize_strength(case.left, ctx),
                                    normalize_strength(case.right, ctx), context=ctx)
        backward = compare_strengths(normalize_strength(case.right, ctx),
                                     normalize_strength(case.left, ctx), context=ctx)
        assert forward.verdict is backward.verdict


class TestVocabulariesAreData:
    """Updating a vocabulary must never require touching the code."""

    #: The tables `meta.json` promises. Named rather than globbed, because a
    #: glob over a directory with no CSVs in it iterates nothing and the test
    #: passes vacuously — which is exactly what happened: a blanket `*.csv`
    #: rule in .gitignore shipped the package with an empty vocab directory,
    #: every local test passed, and CI could not load a single table.
    REQUIRED_TABLES = (
        "basic_dose_form.csv", "release.csv", "transformation.csv",
        "intended_site.csv", "administration_method.csv", "carrier.csv",
        "moiety_release.csv", "unit.csv",
    )

    def test_every_promised_table_is_present(self):
        import json

        vocab = ROOT / "dose_form" / "vocab"
        declared = set(json.loads((vocab / "meta.json").read_text())["tables"])
        assert declared == set(self.REQUIRED_TABLES), (
            "meta.json and this test disagree about which tables exist")
        missing = [n for n in self.REQUIRED_TABLES if not (vocab / n).exists()]
        assert missing == [], f"vocabulary tables not shipped: {missing}"

    def test_every_table_carries_its_source_and_snapshot(self):
        import csv

        vocab = ROOT / "dose_form" / "vocab"
        for name in self.REQUIRED_TABLES:
            with (vocab / name).open(encoding="utf-8") as fh:
                rows = list(csv.DictReader(fh))
            assert rows, f"{name} is empty"
            for row in rows:
                assert row.get("source"), f"{name} has a row with no source"
                assert row.get("snapshot_date"), f"{name}: no snapshot_date"

    def test_a_new_synonym_needs_no_code_change(self, tmp_path, monkeypatch):
        """Add a row, get the behaviour; nothing recompiled, nothing edited."""
        import csv
        import shutil

        from dose_form import facets as mod

        staging = tmp_path / "vocab"
        shutil.copytree(ROOT / "dose_form" / "vocab", staging)
        with (staging / "release.csv").open("a", encoding="utf-8") as fh:
            csv.writer(fh).writerow(
                ["MAGISCH VERTRAAGD", "delayed", "invented for this test", "2026-09-03"])

        monkeypatch.setattr(mod, "VOCAB", staging)
        mod._table.cache_clear()
        try:
            facets = mod.normalize_dose_form("TABLET, MAGISCH VERTRAAGD;ORAL")
            assert facets.release == "delayed"
        finally:
            mod._table.cache_clear()

    def test_tolerances_come_from_config_not_from_literals(self):
        from dose_form.facets import config

        assert "relative_tolerance" in config()["strength"]
        source = (ROOT / "dose_form" / "strength.py").read_text(encoding="utf-8")
        assert "1e-6" not in source, "tolerance is duplicated as a literal"


class TestModulesStaySeparate:
    def test_strength_parsing_does_not_depend_on_dose_form(self):
        """The same string must parse the same way in any context.

        Coupling them is how "40MG" comes to mean different things in
        different rows.
        """
        tablet = _facets("TABLET;ORAL")
        liquid = _facets("SOLUTION;ORAL")
        assert (normalize_strength("40MG", tablet).components
                == normalize_strength("40MG", liquid).components)

    def test_comparing_strengths_does_not_mutate_the_dose_form(self):
        ctx = _facets("TABLET;ORAL")
        before = ctx
        compare_strengths(normalize_strength("40MG", ctx),
                          normalize_strength("40MG", ctx), context=ctx)
        assert ctx == before


def test_the_evaluation_runs_and_reports_no_dangerous_error():
    """The one error class that can reach a patient stays at zero."""
    from dose_form.evaluate import run_dose_forms, run_strengths

    for rows, _rules in (run_dose_forms(), run_strengths()):
        dangerous = [(c.left, c.right, got) for c, got, _r, _d in rows
                     if c.expected == "NOT_EQUIVALENT" and got == "EQUIVALENT"]
        assert dangerous == [], f"asserted equivalence where there is none: {dangerous}"


class TestCoverageAgainstRealData:
    """The vocabulary against the Orange Book, not against my own cases.

    The labelled set is written by whoever wrote the rules, so a perfect score
    there is self-consistency. This is the check that found the 40 missing dose
    forms — enema, pastille, intrauterine device, drug-eluting contact lens and
    the rest — by running every distinct string the Orange Book contains.
    """

    @pytest.fixture(scope="class")
    def measured(self):
        from dose_form.coverage import DB, distinct_strings, measure

        if not DB.exists():
            pytest.skip("substitutability.sqlite not built")
        return measure(distinct_strings())

    def test_almost_every_real_dose_form_is_recognised(self, measured):
        rate = measured["filled"]["basic_dose_form"] / measured["total"]
        assert rate > 0.99, (
            f"basic dose form recognised for {rate:.1%} of real strings; "
            f"unrecognised: {measured['unrecognised'][:10]}")

    def test_the_only_unrecognised_string_is_the_one_with_no_content(self, measured):
        # "N/A;N/A" states neither a form nor a route, and UNKNOWN is the
        # correct answer for it rather than a coverage gap.
        assert measured["unrecognised"] in ([], ["N/A;N/A"])

    def test_routes_resolve_for_almost_every_string(self, measured):
        rate = measured["filled"]["intended_site"] / measured["total"]
        assert rate > 0.98, f"intended site resolved for only {rate:.1%}"
