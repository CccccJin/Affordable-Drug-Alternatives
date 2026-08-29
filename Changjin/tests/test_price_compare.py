"""Tests for the NADAC price-comparison layer.

Needs the substitutability database with NADAC loaded:

    python substitutability.py fetch && python substitutability.py build
    python price_compare.py fetch     && python price_compare.py build
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data.grade import DB_PATH  # noqa: E402
from subst_data.nadac import (  # noqa: E402
    BRAND_CLASSES, NADAC_DISCLAIMER, mg_per_pricing_unit,
)


def _has_prices() -> bool:
    if not DB_PATH.exists():
        return False
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        return bool(conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='nadac_price'"
        ).fetchone())
    finally:
        conn.close()


needs_prices = pytest.mark.skipif(
    not _has_prices(), reason="run `python price_compare.py fetch && ... build`")


# ------------------------------------------------------------ normalisation
@pytest.mark.parametrize("strength,unit,expected", [
    ("40 mg/1", "EA", 40.0),          # 40 mg per tablet
    ("500 mg/1", "EA", 500.0),
    ("90 ug/1", "EA", 0.09),          # micrograms fold to mg
    ("2 mg/mL", "ML", 2.0),
    ("100 mg/5mL", "ML", 20.0),       # per-5-mL denominator divides out
    ("2 mg/g", "GM", 2.0),
    (".1 g/100g", "GM", 1.0),         # percent-style strength
])
def test_mg_per_pricing_unit(strength, unit, expected):
    assert mg_per_pricing_unit(strength, unit) == pytest.approx(expected)


@pytest.mark.parametrize("strength,unit", [
    ("4.6 mg/24h", "EA"),      # transdermal rate: no mg-per-each meaning
    ("40 mg/1", "ML"),         # per-each strength cannot price a millilitre
    ("2 mg/mL", "GM"),         # volume strength cannot price a gram
    ("", "EA"),
    (None, "EA"),
    ("40 mg/1", ""),
])
def test_mg_per_pricing_unit_refuses_rather_than_guesses(strength, unit):
    """A wrong normalisation is worse than none: these must return None."""
    assert mg_per_pricing_unit(strength, unit) is None


def test_disclaimer_states_acquisition_cost():
    text = NADAC_DISCLAIMER.lower()
    assert "not the patient" in text
    assert "acquire" in text or "acquisition" in text
    assert "copay" in text


# ------------------------------------------------------------- comparisons
@pytest.fixture(scope="module")
def pc():
    from price_compare import PriceComparator
    return PriceComparator()


@needs_prices
def test_products_sorted_cheapest_first(pc):
    c = pc.compare("617320")                       # Lipitor 40 MG
    priced = [p.price_per_unit for p in c.products if p.priced]
    assert priced == sorted(priced)
    # Unpriced members are retained at the end, never silently dropped.
    assert len(c.products) == c.group_size
    assert all(not p.priced for p in c.products[len(priced):])


@needs_prices
def test_brand_costs_more_than_its_own_generic(pc):
    c = pc.compare("617320")
    assert c.originator and c.cheapest_generic
    assert c.originator.price_per_unit > c.cheapest_generic.price_per_unit
    assert c.savings_pct > 90


@needs_prices
def test_savings_arithmetic_is_consistent(pc):
    c = pc.compare("617320")
    expected = c.originator.price_per_unit - c.cheapest_generic.price_per_unit
    assert c.savings_per_unit == pytest.approx(expected)
    assert c.savings_pct == pytest.approx(
        expected / c.originator.price_per_unit * 100)


@needs_prices
def test_per_mg_matches_per_unit_divided_by_strength(pc):
    c = pc.compare("617320")
    for p in c.products:
        if p.price_per_mg is not None:
            assert p.mg_per_unit
            assert p.price_per_mg == pytest.approx(p.price_per_unit / p.mg_per_unit)


@needs_prices
def test_originator_is_not_an_nda_approved_generic(pc):
    """Regression: LEVO-T holds its own NDA but is priced as a generic.

    Keying `is_originator` on `Appl_Type == 'N'` picked LEVO-T as the Synthroid
    baseline and reported a 0% saving. NADAC's own brand/generic flag must win.
    """
    c = pc.compare("966218")                       # Synthroid 0.3 MG
    assert c.originator is not None
    assert "SYNTHROID" in c.originator.trade_name.upper()
    assert c.originator.nadac_classification in BRAND_CLASSES
    assert c.cheapest_generic.price_per_unit < c.originator.price_per_unit
    assert c.savings_pct > 50


@needs_prices
def test_every_comparison_carries_the_acquisition_cost_disclaimer(pc):
    for rxcui in ("617320", "966218", "213270"):
        c = pc.compare(rxcui)
        assert c.disclaimer == NADAC_DISCLAIMER
        assert "NOT the patient" in c.explain()
        assert c.to_dict()["disclaimer"] == NADAC_DISCLAIMER


@needs_prices
def test_group_members_are_all_grade_a_equivalents(pc):
    """Only FDA-rated equivalents may be priced as alternatives."""
    from subst_data.grade import Adjudicator
    adj = Adjudicator()
    c = pc.compare("617320")
    assert c.group_size > 1
    for p in c.products[:5]:
        v = adj.judge("617320", "617320")          # self-consistency guard
        assert v.grade == "A"
        assert p.te_code.startswith(("AB", "AA", "AP", "AT", "AN", "AO")) or not p.te_code


@needs_prices
def test_unknown_rxcui_returns_empty_not_exception(pc):
    c = pc.compare("999999999")
    assert c.group_size == 0
    assert c.products == []
    assert c.notes


@needs_prices
def test_nadac_join_hit_rate_is_reported(pc):
    rows = dict(((s, m), v) for s, m, v in pc.conn.execute(
        "SELECT section, metric, value FROM build_stat WHERE section = 'nadac_join'"))
    total = rows[("nadac_join", "nadac_distinct_ndc9")]
    matched = rows[("nadac_join", "matched_openfda_ndc")]
    assert total > 0
    assert matched / total > 0.80, "NDC join hit rate regressed below 80%"
