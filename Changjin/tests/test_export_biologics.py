"""Tests for the Purple Book biologic export.

The three rules that separate a biologic group from an Orange Book one all get a
case: grade rides on the member rather than the group, savings are computed only
within a pricing unit, and a family with no follow-on is not a substitution
opportunity at all.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data.export_biologics import build_payload  # noqa: E402

SCHEMA = """
CREATE TABLE pb_product (
    bla_no TEXT, product_no TEXT, appl_no TEXT, applicant TEXT,
    proprietary_name TEXT, proper_name TEXT, proper_name_key TEXT,
    license_type TEXT, is_interchangeable INTEGER, is_biosimilar INTEGER,
    strength TEXT, dosage_form TEXT, route TEXT, marketing_status TEXT,
    approval_date TEXT, inter_approval_date TEXT,
    ref_proper_name TEXT, ref_proper_name_key TEXT, ref_proprietary_name TEXT
);
CREATE TABLE ndc_product (ndc9 TEXT, appl_no TEXT, active_ingredients TEXT);
CREATE TABLE nadac_price (
    ndc9 TEXT, price_per_unit REAL, pricing_unit TEXT, classification TEXT
);
"""


def product(appl_no, name, license_type, *, inter=0, biosim=0, ref=None,
            proper="ADALIMUMAB", status="Rx"):
    return (
        appl_no[-6:], "001", appl_no, "APPLICANT", name, proper, proper,
        license_type, inter, biosim, "40MG/0.8ML", "INJECTION", "SUBCUTANEOUS",
        status, "2020-01-01", None,
        "ADALIMUMAB" if ref else None, "ADALIMUMAB" if ref else None, ref,
    )


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)

    connection.executemany(
        "INSERT INTO pb_product VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            product("BLA125057", "Humira", "351(a)"),
            product("BLA761024", "Simlandi", "351(k) Interchangeable",
                    inter=1, ref="Humira"),
            product("BLA761058", "Idacio", "351(k) Biosimilar",
                    biosim=1, ref="Humira"),
            # Priced in ML, so it must not be compared against the EA prices.
            product("BLA761071", "Hyrimoz", "351(k) Interchangeable",
                    inter=1, ref="Humira"),
            # Discontinued: excluded before anything else looks at it.
            product("BLA999999", "Withdrawn", "351(k) Biosimilar",
                    biosim=1, ref="Humira", status="Disc"),
            # An originator with no follow-on: nothing to substitute.
            product("BLA103000", "Solobio", "351(a)", proper="SOLOKINASE"),
        ],
    )
    connection.executemany(
        "INSERT INTO ndc_product VALUES (?,?,?)",
        [("000010001", "BLA125057", "[]"), ("000020001", "BLA761024", "[]"),
         ("000030001", "BLA761058", "[]"), ("000040001", "BLA761071", "[]"),
         ("000050001", "BLA103000", "[]")],
    )
    connection.executemany(
        "INSERT INTO nadac_price VALUES (?,?,?,?)",
        [("000010001", 3366.12, "EA", "B-BIO"),
         ("000020001", 478.65, "EA", "B-BIO"),
         ("000030001", 872.80, "EA", "B-BIO"),
         ("000040001", 1586.73, "ML", "B-BIO"),   # different unit
         ("000050001", 100.00, "EA", "B-BIO")],
    )
    yield connection
    connection.close()


def only_group(payload) -> dict:
    groups = [g for g in payload["groups"] if g["i"] == "ADALIMUMAB"]
    assert len(groups) == 1
    return groups[0]


def test_grade_rides_on_the_member_not_the_group(conn):
    """Unlike an AB group, one biologic family holds both A and B members."""
    members = {m["t"]: m for m in only_group(build_payload(conn))["mem"]}

    assert members["Humira"]["g"] == "reference"
    assert members["Simlandi"]["g"] == "A"   # interchangeable, rule A3
    assert members["Idacio"]["g"] == "B"     # biosimilar, rule B4


def test_saving_is_computed_within_a_pricing_unit(conn):
    saving = only_group(build_payload(conn))["sav"]

    # Only the EA prices are comparable; Hyrimoz is priced per ML.
    assert [s["u"] for s in saving] == ["EA"]
    assert saving[0]["from"] == "Humira"
    assert saving[0]["to"] == "Simlandi"
    assert saving[0]["sv"] == 85.8


def test_a_price_in_another_unit_is_not_folded_into_the_comparison(conn):
    group = only_group(build_payload(conn))
    hyrimoz = next(m for m in group["mem"] if m["t"] == "Hyrimoz")

    # It is still listed, with its own unit — just not compared.
    assert hyrimoz["p"] == 1586.73
    assert hyrimoz["u"] == "ML"
    assert all(s["to"] != "Hyrimoz" for s in group["sav"])


def test_the_cheapest_followon_carries_its_own_grade(conn):
    saving = only_group(build_payload(conn))["sav"][0]

    # Simlandi is interchangeable, so this switch is a pharmacy-level one.
    assert saving["g"] == "A"


def test_a_family_with_no_followon_is_not_a_substitution(conn):
    names = {g["i"] for g in build_payload(conn)["groups"]}
    assert "SOLOKINASE" not in names


def test_discontinued_products_are_excluded(conn):
    members = {m["t"] for m in only_group(build_payload(conn))["mem"]}
    assert "Withdrawn" not in members


def test_the_index_opens_on_a_brand_name(conn):
    """A patient starts from "Humira", not from "ADALIMUMAB"."""
    payload = build_payload(conn)
    index = payload["name_index"]

    for name in ("HUMIRA", "SIMLANDI", "ADALIMUMAB"):
        assert name in index, f"{name} is not indexed"
        assert payload["groups"][index[name][0]]["i"] == "ADALIMUMAB"


def test_members_are_ordered_reference_first_then_cheapest(conn):
    members = only_group(build_payload(conn))["mem"]

    assert members[0]["t"] == "Humira"
    followon_prices = [m["p"] for m in members[1:] if m["p"] is not None]
    assert followon_prices == sorted(followon_prices)


def test_meta_declares_the_cost_basis_and_the_qualified_coverage_name(conn):
    """Expand step: the old key stays until every caller has moved."""
    meta = build_payload(conn)["meta"]
    assert meta["cost_basis"] == "acquisition_cost"
    cov = meta["coverage"]
    assert cov["with_savings"] == cov["with_acquisition_cost_saving"]
