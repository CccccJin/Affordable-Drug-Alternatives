"""The grade C export, and the things it deliberately does not say.

Every other export in this project rests on an FDA finding a pharmacist may
act on. This one rests on a WHO classification nobody may act on without a
prescriber, and the tests that matter most are the ones pinning what is
*absent*: no saving, no ranking, no pair singled out. Those omissions are the
safety property. A future change that adds a "save 90%" figure here would look
like an improvement and would be a treatment recommendation.
"""
from __future__ import annotations

import pickle
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data import export_atc_classes as mod  # noqa: E402


class FakeBackend:
    """Offline stand-in for RxClass."""

    NAMES = {"C10AA": "HMG CoA reductase inhibitors",
             "N06AB": "Selective serotonin reuptake inhibitors"}

    def _get(self, path, **params):
        code = params.get("classId")
        if code not in self.NAMES:
            raise RuntimeError("no such class")
        return {"rxclassMinConceptList":
                {"rxclassMinConcept": [{"className": self.NAMES[code]}]}}


@pytest.fixture
def atc_pkl(tmp_path):
    records = {
        "ATORVASTATIN CALCIUM": {"atc": ["C10AA05"], "atc4": ["C10AA"]},
        "ROSUVASTATIN CALCIUM": {"atc": ["C10AA07"], "atc4": ["C10AA"]},
        "SIMVASTATIN":          {"atc": ["C10AA01"], "atc4": ["C10AA"]},
        "SERTRALINE HYDROCHLORIDE": {"atc": ["N06AB06"], "atc4": ["N06AB"]},
        "FLUOXETINE HYDROCHLORIDE": {"atc": ["N06AB03"], "atc4": ["N06AB"]},
        # A class of one: nothing to relate it to, so it must not be exported.
        "LONELY INGREDIENT":    {"atc": ["Z99ZZ01"], "atc4": ["Z99ZZ"]},
        # No ATC at all.
        "UNCLASSIFIED":         {"atc": [], "atc4": []},
    }
    path = tmp_path / "ingredient_atc.pkl"
    path.write_bytes(pickle.dumps(records))
    return path


@pytest.fixture
def priced_db(tmp_path):
    path = tmp_path / "substitutability.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript(
        "CREATE TABLE ob_product (appl_no TEXT, ingredient TEXT);"
        "CREATE TABLE ndc_product (ndc9 TEXT, appl_no TEXT);"
        "CREATE TABLE nadac_price (ndc9 TEXT, price_per_unit REAL, pricing_unit TEXT);"
    )
    rows = [
        ("ANDA1", "ATORVASTATIN CALCIUM", "N1", 0.03704, "EA"),
        ("ANDA2", "ATORVASTATIN CALCIUM", "N2", 19.11383, "EA"),
        ("ANDA3", "ROSUVASTATIN CALCIUM", "N3", 0.09210, "EA"),
        # A millilitre price for the same ingredient: must not be pooled with EA.
        ("ANDA4", "ROSUVASTATIN CALCIUM", "N4", 880.0, "ML"),
    ]
    for appl, ing, ndc, price, unit in rows:
        conn.execute("INSERT INTO ob_product VALUES (?,?)", (appl, ing))
        conn.execute("INSERT INTO ndc_product VALUES (?,?)", (ndc, appl))
        conn.execute("INSERT INTO nadac_price VALUES (?,?,?)", (ndc, price, unit))
    conn.commit()
    conn.close()
    return path


def build(atc_pkl, priced_db):
    return mod.build(atc_path=atc_pkl, db_path=priced_db, backend=FakeBackend())


class TestWhatIsExported:
    def test_groups_ingredients_by_atc_level_4(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        codes = {g["c"] for g in payload["groups"]}
        assert codes == {"C10AA", "N06AB"}

    def test_drops_a_class_holding_one_ingredient(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        assert "Z99ZZ" not in {g["c"] for g in payload["groups"]}

    def test_names_the_class_so_the_code_is_not_the_label(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        assert statins["n"] == "HMG CoA reductase inhibitors"

    def test_falls_back_to_the_code_when_the_name_lookup_fails(self, atc_pkl, priced_db):
        class Offline:
            def _get(self, path, **params):
                raise RuntimeError("offline")

        payload = mod.build(atc_path=atc_pkl, db_path=priced_db, backend=Offline())
        assert all(g["n"] == g["c"] for g in payload["groups"])

    def test_finds_a_class_from_any_member(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        index = payload["name_index"]
        assert index["SIMVASTATIN"] == index["ATORVASTATIN CALCIUM"]


class TestPrices:
    def test_reports_a_range_per_ingredient(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        atorva = next(m for m in statins["mem"] if m["i"] == "ATORVASTATIN CALCIUM")
        assert atorva["lo"] == pytest.approx(0.03704)
        assert atorva["hi"] == pytest.approx(19.11383)
        assert atorva["u"] == "EA" and atorva["n"] == 2

    def test_never_pools_two_pricing_units(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        rosuva = next(m for m in statins["mem"] if m["i"] == "ROSUVASTATIN CALCIUM")
        # One EA price and one ML price. Whichever unit is chosen, the range
        # must come from that unit alone: a span of 0.09 to 880 would be two
        # incomparable quantities reported as one drug's price range.
        assert rosuva["n"] == 1
        assert rosuva["lo"] == rosuva["hi"]
        expected = {"EA": 0.09210, "ML": 880.0}[rosuva["u"]]
        assert rosuva["lo"] == pytest.approx(expected)

    def test_a_tie_on_count_resolves_to_the_alphabetically_first_unit(
            self, atc_pkl, priced_db):
        """Arbitrary but fixed. `max` on the raw name preferred ML over EA."""
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        rosuva = next(m for m in statins["mem"] if m["i"] == "ROSUVASTATIN CALCIUM")
        assert rosuva["u"] == "EA"

    def test_an_unpriced_member_carries_no_price_keys(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        simva = next(m for m in statins["mem"] if m["i"] == "SIMVASTATIN")
        assert "lo" not in simva and "hi" not in simva

    def test_counts_how_many_members_are_priced_at_all(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        statins = next(g for g in payload["groups"] if g["c"] == "C10AA")
        assert statins["np"] == 2 and len(statins["mem"]) == 3


class TestTheOmissionsThatMakeThisSafe:
    """These assert on absence, and the absence is the point."""

    def test_no_saving_is_computed_anywhere(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        import json

        blob = json.dumps(payload)
        for forbidden in ('"sv"', '"saving"', '"savingPercent"', '"pct"'):
            assert forbidden not in blob, (
                f"{forbidden} present: a saving turns a classification into a "
                "switch the reader is invited to make")

    def test_members_stay_in_a_stable_alphabetical_order(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        for group in payload["groups"]:
            names = [m["i"] for m in group["mem"]]
            assert names == sorted(names), (
                "members are ranked; ordering by price would nominate a "
                "preferred alternative"
            )

    def test_the_relation_is_stated_as_a_classification(self, atc_pkl, priced_db):
        payload = build(atc_pkl, priced_db)
        relation = payload["meta"]["relation"].lower()
        assert "not an fda equivalence finding" in relation
        assert "may not be substituted" in relation


def test_the_committed_export_matches_what_build_produces():
    """The shipped file must be something this module actually generates."""
    import json

    export = ROOT / "frontend" / "public" / "data" / "atc_classes.json"
    if not export.exists():
        pytest.skip("run `python price_compare.py export-atc`")
    payload = json.loads(export.read_text(encoding="utf-8"))
    assert payload["meta"]["coverage"]["classes"] == len(payload["groups"])
    assert all(len(g["mem"]) >= mod.MIN_MEMBERS for g in payload["groups"])
    assert "not an FDA equivalence finding" in payload["meta"]["relation"]


def test_meta_declares_the_cost_basis_and_the_qualified_coverage_name(
        atc_pkl, priced_db):
    """`with_acquisition_cost` counts classes holding a cost, not a saving.

    This module computes no saving, so it keeps a name distinct from the other
    two exports' `with_acquisition_cost_saving`.
    """
    meta = build(atc_pkl, priced_db)["meta"]
    assert meta["cost_basis"] == "acquisition_cost"
    cov = meta["coverage"]
    assert cov["with_prices"] == cov["with_acquisition_cost"]
    assert "with_acquisition_cost_saving" not in cov
