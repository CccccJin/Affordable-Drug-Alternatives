"""Tests for the substitutability adjudication module.

The integration tests are pinned to real RXCUIs and assert the *grade and rule*
the authoritative data should produce.  They need `substitutability.sqlite` to
have been built; they skip cleanly when it has not.

    python substitutability.py fetch && python substitutability.py build
    python -m pytest tests/test_substitutability.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data.ndcutil import (  # noqa: E402
    normalize_appl_no, normalize_ndc9, normalize_ndc11, orange_book_appl_no,
)
from subst_data.grade import DB_PATH, parse_strength, te_subgroups  # noqa: E402

needs_db = pytest.mark.skipif(
    not DB_PATH.exists(),
    reason="run `python substitutability.py fetch && python substitutability.py build`",
)


# --------------------------------------------------------------- identifiers
@pytest.mark.parametrize("raw,expected", [
    ("0093-5058", "000935058"),        # openFDA, 4-digit labeler
    ("00093505810", "000935058"),      # RxNav, 11-digit 5-4-2
    ("50090-5208", "500905208"),       # openFDA, 5-digit labeler
    ("12345-678", "123450678"),        # 5-3 segments
    ("0002-3227-30", "000023227"),     # package form, package digits dropped
    ("", None),
    (None, None),
    ("garbage", None),
])
def test_normalize_ndc9(raw, expected):
    assert normalize_ndc9(raw) == expected


def test_ndc9_reconciles_openfda_and_rxnav_spellings():
    """The whole mapping table rests on these two spellings agreeing."""
    assert normalize_ndc9("0093-5058") == normalize_ndc9("00093505810")


def test_normalize_ndc11():
    assert normalize_ndc11("0002-3227-30") == "00002322730"
    assert normalize_ndc11("00002322730") == "00002322730"
    assert normalize_ndc11("0002-3227") is None


@pytest.mark.parametrize("raw,expected", [
    ("ANDA209288", "ANDA209288"),
    ("NDA021436", "NDA021436"),
    ("ANDA 9288", "ANDA009288"),
    ("BLA125057", "BLA125057"),
    ("BN761088", "BLA761088"),
    ("OTC MONOGRAPH", None),
    (None, None),
])
def test_normalize_appl_no(raw, expected):
    assert normalize_appl_no(raw) == expected


def test_orange_book_appl_no_matches_openfda_spelling():
    assert orange_book_appl_no("A", "209288") == normalize_appl_no("ANDA209288")
    assert orange_book_appl_no("N", "020702") == normalize_appl_no("NDA020702")
    assert orange_book_appl_no("X", "1") is None


# ----------------------------------------------------------------- strengths
def test_parse_strength_folds_units_to_mg():
    assert parse_strength("EQ 40MG BASE") == parse_strength("40 mg/1")
    assert parse_strength("atorvastatin 40 MG") == parse_strength("EQ 40MG BASE")
    assert parse_strength("1 G") == parse_strength("1000 MG")


def test_parse_strength_distinguishes_different_strengths():
    assert parse_strength("EQ 10MG BASE") != parse_strength("EQ 40MG BASE")


def test_parse_strength_handles_combinations_and_blanks():
    assert parse_strength("10MG;12.5MG") == frozenset({(10.0, "MG"), (12.5, "MG")})
    assert parse_strength("") == frozenset()
    assert parse_strength(None) == frozenset()


# ------------------------------------------------------------------ TE codes
def test_te_subgroups_splits_multi_codes():
    assert te_subgroups("AB1,AB2,AB3,AB4") == {"AB1", "AB2", "AB3", "AB4"}
    assert te_subgroups("AB") == {"AB"}
    assert te_subgroups("") == set()
    assert te_subgroups(None) == set()


def test_ab_subgroups_do_not_intersect():
    """AB1 and AB2 mark different reference drugs and must NOT be equivalent."""
    assert not (te_subgroups("AB1") & te_subgroups("AB2"))
    assert te_subgroups("AB1,AB2,AB3") & te_subgroups("AB2")


# --------------------------------------------------------------- adjudication
@pytest.fixture(scope="module")
def adj():
    from subst_data.grade import Adjudicator
    return Adjudicator()


#: (rxcui_a, rxcui_b, expected grade, expected rule, description)
CASES = [
    ("617311", "617320", "A", "A1",
     "atorvastatin 40 MG generic vs Lipitor -- Orange Book AB"),
    ("2563977", "285018", "A", "A3",
     "Semglee vs Lantus -- Purple Book 351(k) Interchangeable"),
    ("2273517", "1657864", "B", "B4",
     "Ruxience vs Rituxan -- 351(k) Biosimilar, not interchangeable"),
    ("2105831", "2273517", "B", "B5",
     "Truxima vs Ruxience -- two follow-ons of one reference product"),
    ("1801289", "993518", "B", "B3",
     "bupropion ER 150 MG -- different AB subgroups, different RLDs"),
    ("866514", "866436", "C", "C1",
     "metoprolol tartrate vs succinate -- same ATC5, different salt"),
    ("617311", "198211", "C", "C2",
     "atorvastatin vs simvastatin -- same ATC4 statin subgroup"),
    ("617311", "308191", "D", "D1",
     "atorvastatin vs amoxicillin -- unrelated"),
]


@needs_db
@pytest.mark.parametrize("a,b,grade,rule,desc", CASES, ids=[c[4][:40] for c in CASES])
def test_grade(adj, a, b, grade, rule, desc):
    v = adj.judge(a, b)
    assert v.grade == grade, f"{desc}: got {v.grade}{v.rule_id} -- {v.label}"
    assert v.rule_id == rule, f"{desc}: got rule {v.rule_id} -- {v.label}"


@needs_db
@pytest.mark.parametrize("a,b,grade,rule,desc", CASES, ids=[c[4][:40] for c in CASES])
def test_every_verdict_carries_traceable_evidence(adj, a, b, grade, rule, desc):
    """Requirement: every verdict must be checkable by hand against a source field."""
    v = adj.judge(a, b)
    assert v.evidence, f"{desc}: no evidence chain"
    for e in v.evidence:
        assert e.source and e.file and e.field, f"{desc}: incomplete evidence {e}"
    assert v.action and v.confidence in ("high", "medium", "low")
    assert v.to_dict()["grade"] == v.grade
    assert v.explain()


@needs_db
def test_symmetry(adj):
    """Substitutability is a symmetric relation; the grade must not depend on order."""
    for a, b, grade, _rule, desc in CASES:
        assert adj.judge(b, a).grade == grade, f"asymmetric: {desc}"


@needs_db
def test_identical_rxcui_is_grade_a(adj):
    v = adj.judge("617311", "617311")
    assert (v.grade, v.rule_id) == ("A", "A0")


@needs_db
def test_ab_verdict_cites_matching_strength_and_te_code(adj):
    """Guards the bug where a 40 MG query was answered with 10 MG Orange Book rows."""
    v = adj.judge("617311", "617320")
    assert v.details["a_te_code"].startswith("AB")
    assert v.details["b_te_code"].startswith("AB")
    strengths = [e.value for e in v.evidence if e.field == "Strength"]
    assert strengths, "no strength cited"
    assert len({frozenset(parse_strength(s)) for s in strengths}) == 1, \
        f"cited mismatched strengths: {strengths}"
    # The branded side must resolve to its own NDA, not to the generic's ANDA.
    assert v.details["a_appl_no"] != v.details["b_appl_no"]


@needs_db
def test_unknown_rxcui_is_grade_d_not_an_exception(adj):
    v = adj.judge("999999999", "617311")
    assert v.grade == "D" and v.rule_id == "D0"
    assert v.caveats


@needs_db
def test_biologic_vs_small_molecule_is_not_substitutable(adj):
    v = adj.judge("1657864", "617311")      # Rituxan vs atorvastatin
    assert v.grade == "D"
