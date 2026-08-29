"""Tests for the evaluation set and the stratified metrics.

The evaluation code is the thing that tells us whether the pipeline works, so
its own correctness matters more than usual: a leaky split or an inverted
metric would produce confident, wrong numbers.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data import evalset as ES  # noqa: E402
from subst_data.structures import base_moiety, norm_name  # noqa: E402

EVALSET = ES.EVALSET_JSON
needs_evalset = pytest.mark.skipif(
    not EVALSET.exists(), reason="run `python evaluate.py build` first")


# ------------------------------------------------------------- name handling
@pytest.mark.parametrize("raw,expected", [
    ("ATORVASTATIN CALCIUM", "ATORVASTATIN"),
    ("METOPROLOL SUCCINATE", "METOPROLOL"),
    ("SERTRALINE HYDROCHLORIDE", "SERTRALINE"),
    ("CLOPIDOGREL BISULFATE", "CLOPIDOGREL"),
    ("ESOMEPRAZOLE MAGNESIUM", "ESOMEPRAZOLE"),
    ("AMOXICILLIN", "AMOXICILLIN"),
    ("LEVOTHYROXINE SODIUM", "LEVOTHYROXINE"),
])
def test_base_moiety_strips_salts(raw, expected):
    assert base_moiety(raw) == expected


@pytest.mark.parametrize("raw", [
    "HALOPERIDOL DECANOATE",       # depot ester, not a counterion
    "TRIAMCINOLONE ACETONIDE",     # ketal, a distinct molecular entity
    "TESTOSTERONE CYPIONATE",
])
def test_base_moiety_keeps_covalent_esters(raw):
    """Stripping these would assert a chemical identity that does not hold."""
    assert base_moiety(raw) == raw


def test_base_moiety_keeps_single_token_names():
    """A salt word that IS the drug must not be stripped to nothing."""
    assert base_moiety("SODIUM") == "SODIUM"
    assert base_moiety("") == ""


def test_norm_name_is_punctuation_insensitive():
    assert norm_name("Amoxicillin/Clavulanate") == norm_name("AMOXICILLIN CLAVULANATE")


# -------------------------------------------------------------------- split
def test_split_is_deterministic():
    for key in ("ATORVASTATIN", "METOPROLOL", "AMOXICILLIN", "ZZZ"):
        assert ES.split_for(key) == ES.split_for(key)


def test_split_assigns_both_sides():
    keys = [f"INGREDIENT{i}" for i in range(400)]
    got = {ES.split_for(k) for k in keys}
    assert got == {"dev", "test"}


def test_split_fraction_is_approximately_honoured():
    keys = [f"INGREDIENT{i}" for i in range(4000)]
    test = sum(1 for k in keys if ES.split_for(k) == "test")
    assert abs(test / len(keys) - ES.TEST_FRACTION) < 0.03


# --------------------------------------------------------------- the dataset
@pytest.fixture(scope="module")
def payload():
    return json.loads(EVALSET.read_text())


@needs_evalset
def test_no_pair_straddles_the_split(payload):
    """The whole point of splitting by moiety: no leakage across dev/test."""
    for p in payload["pairs"]:
        assert p["split"] in ("dev", "test")
        assert ES.split_for(p["ingredient_a"]) == p["split"]
        assert ES.split_for(p["ingredient_b"]) == p["split"]


@needs_evalset
def test_no_ingredient_appears_in_both_splits(payload):
    seen = {}
    for p in payload["pairs"]:
        for key in (p["ingredient_a"], p["ingredient_b"]):
            if key in seen:
                assert seen[key] == p["split"], f"{key} leaked across splits"
            seen[key] = p["split"]


@needs_evalset
def test_positive_count_is_in_the_requested_range(payload):
    pos = [p for p in payload["pairs"] if p["stratum"] == "positive"]
    assert 300 <= len(pos) <= 500


@needs_evalset
def test_labels_match_strata(payload):
    for p in payload["pairs"]:
        assert p["label"] == (1 if p["stratum"] == "positive" else 0)


@needs_evalset
def test_positives_share_an_ingredient_and_negatives_do_not(payload):
    for p in payload["pairs"]:
        if p["stratum"] == "positive":
            assert p["ingredient_a"] == p["ingredient_b"]
        else:
            assert p["ingredient_a"] != p["ingredient_b"], \
                f"{p['stratum']} pair shares an ingredient: {p}"


@needs_evalset
def test_no_pair_compares_a_concept_with_itself(payload):
    for p in payload["pairs"]:
        assert p["rxcui_a"] != p["rxcui_b"]


@needs_evalset
def test_medium_negatives_meet_the_similarity_threshold(payload):
    med = [p for p in payload["pairs"] if p["stratum"] == "medium_negative"]
    assert med, "no medium negatives built"
    for p in med:
        assert p["tanimoto"] is not None
        assert p["tanimoto"] >= ES.TANIMOTO_MEDIUM


@needs_evalset
def test_hard_negatives_share_an_atc4_subgroup(payload):
    hard = [p for p in payload["pairs"] if p["stratum"] == "hard_negative"]
    assert hard
    for p in hard:
        assert p["shared_atc4"]
        assert len(p["shared_atc4"]) == 5      # e.g. C10AA


@needs_evalset
def test_all_four_strata_are_present_in_test(payload):
    strata = {p["stratum"] for p in payload["pairs"] if p["split"] == "test"}
    assert strata == {"positive", "hard_negative", "medium_negative", "easy_negative"}


@needs_evalset
def test_every_rxcui_denotes_the_strength_it_is_labelled_with(payload):
    """Regression: the pair's RXCUI must BE the strength the pair claims.

    Two bugs lived here. First, falling back to "any RXCUI for this application"
    labelled a 30 MG Prevacid pair with the 15 MG concept. Then the NDC-based
    fix proved insufficient: ``openfda.rxcui`` is an SPL-level annotation, so a
    label covering 15 MG and 30 MG lists both concepts against both NDCs and an
    NDC-derived check passes anyway. RxNorm's own SCDC is the authority, and it
    is what this test uses.
    """
    from subst_data.evalset import Builder
    from subst_data.grade import parse_strength

    b = Builder()
    checked = mismatched = 0
    bad = []
    for p in payload["pairs"][:150]:
        for rxcui, strength in ((p["rxcui_a"], p["strength_a"]),
                                (p["rxcui_b"], p["strength_b"])):
            want = parse_strength(strength)
            got = b._rxnorm_strength(rxcui)
            if not want or got is None:
                continue
            checked += 1
            if not (got & want):
                mismatched += 1
                bad.append((rxcui, strength, sorted(got)))
    assert checked, "no pairs were checkable"
    assert mismatched == 0, f"{mismatched}/{checked} mislabelled, e.g. {bad[:3]}"


@needs_evalset
def test_manifest_hash_matches_the_pairs(payload):
    import hashlib
    blob = json.dumps(payload["pairs"], sort_keys=True).encode()
    assert hashlib.sha256(blob).hexdigest() == payload["meta"]["manifest_sha256"]


# --------------------------------------------------------------- dose forms
@pytest.mark.parametrize("rx,ob,expected", [
    (("Delayed Release Oral Capsule",), "CAPSULE, DELAYED REL PELLETS", True),
    (("Delayed Release Oral Capsule",),
     "TABLET, ORALLY DISINTEGRATING, DELAYED RELEASE", False),
    (("Oral Tablet",), "TABLET", True),
    (("Oral Tablet",), "CAPSULE", False),
    (("Disintegrating Oral Tablet",), "TABLET, ORALLY DISINTEGRATING", True),
    (("Oral Tablet",), "TABLET, ORALLY DISINTEGRATING", False),
    (("24 HR Extended Release Oral Tablet",), "TABLET, EXTENDED RELEASE", True),
    (("Oral Tablet",), "TABLET, EXT REL", False),
    (("Injectable Solution",), "INJECTABLE, LIPOSOMAL", True),
    ((), "TABLET", True),
    (("Oral Tablet",), None, True),
])
def test_dose_form_compatibility(rx, ob, expected):
    """Regression: lansoprazole 30 MG is both a DR capsule and an ODT.

    Both are AB-rated at 30 mg and the NDC-to-application mapping returns both
    for one RXCUI, so without this check the pipeline offered a capsule as an
    equivalent for an orally disintegrating tablet.
    """
    from subst_data.grade import dose_form_compatible
    assert dose_form_compatible(rx, ob) is expected


@needs_evalset
def test_a_grade_groups_are_single_dosage_form():
    """Every member of a grade-A group must share the query's dosage form."""
    from subst_data.grade import Adjudicator
    adj = Adjudicator()
    for rxcui in ("206205", "206206", "617320"):
        side, members = adj.a_grade_group(rxcui)
        if not members:
            continue
        forms = {m["dosage_form"] for m in members}
        strengths = {m["strength_key"] for m in members}
        assert len(forms) == 1, f"{rxcui} mixes dosage forms: {forms}"
        assert len(strengths) == 1, f"{rxcui} mixes strengths: {strengths}"


# ------------------------------------------------------------------ metrics
def test_metrics_arithmetic():
    from evaluate import Metrics
    m = Metrics(tp=90, fp=10, fn=10, tn=90)
    assert m.precision == pytest.approx(0.9)
    assert m.recall == pytest.approx(0.9)
    assert m.f1 == pytest.approx(0.9)


def test_metrics_handle_empty_denominators():
    from evaluate import Metrics
    assert Metrics().precision is None
    assert Metrics().recall is None
    assert Metrics(tp=0, fp=5, fn=5).f1 == 0.0


def test_ab_equivalence_ground_truth_rules():
    from evaluate import is_ab_equivalent

    def row(**kw):
        base = dict(ingredient_key="ATORVASTATIN CALCIUM", dosage_form="TABLET",
                    route="ORAL", strength_key="EQ 40MG BASE", te_code="AB")
        base.update(kw)
        return base

    assert is_ab_equivalent(row(), row())
    assert not is_ab_equivalent(row(), row(strength_key="EQ 10MG BASE"))
    assert not is_ab_equivalent(row(), row(ingredient_key="SIMVASTATIN"))
    assert not is_ab_equivalent(row(), row(dosage_form="CAPSULE"))
    # AB1 and AB2 mark different reference drugs: never equivalent.
    assert not is_ab_equivalent(row(te_code="AB1"), row(te_code="AB2"))
    assert is_ab_equivalent(row(te_code="AB1,AB2"), row(te_code="AB2"))
    # A non-AB rating never yields ground-truth equivalence.
    assert not is_ab_equivalent(row(te_code="BX"), row(te_code="BX"))
    assert not is_ab_equivalent(row(te_code=""), row(te_code=""))
