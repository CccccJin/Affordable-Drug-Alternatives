"""Tests for the static frontend export.

`build_payload` reads four tables and encodes four rules that the module
docstring and `FRONTEND_INTEGRATION_PROMPT.md` both state but nothing checked:
strength-matched pricing, NADAC-classified brand detection, the dearest-brand
baseline, and what the name index is keyed on. Each gets a case below, against
a fixture small enough to reason about by hand.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data.export_frontend import build_payload  # noqa: E402

SCHEMA = """
CREATE TABLE ob_product (
    appl_no TEXT, trade_name TEXT, applicant TEXT, te_code TEXT,
    ingredient_key TEXT, dosage_form TEXT, route TEXT, strength_key TEXT,
    mkt_type TEXT
);
CREATE TABLE ndc_product (ndc9 TEXT, appl_no TEXT, active_ingredients TEXT);
CREATE TABLE nadac_price (
    ndc9 TEXT, price_per_unit REAL, pricing_unit TEXT, classification TEXT
);
CREATE TABLE build_stat (section TEXT, metric TEXT, note TEXT);
"""


def ingredients(strength: str) -> str:
    return json.dumps([{"name": "ATORVASTATIN CALCIUM", "strength": strength}])


@pytest.fixture
def conn():
    """Two Lipitor strengths under one NDA, plus a generic at 40 mg only.

    The 10 mg price is far cheaper than the 40 mg one, which is what makes the
    strength-matching rule observable: an application-wide MIN(price) would
    quote 1.00 against the 40 mg group.
    """
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)

    connection.executemany(
        "INSERT INTO ob_product VALUES (?,?,?,?,?,?,?,?,?)",
        [
            ("NDA020702", "LIPITOR", "UPJOHN", "AB",
             "ATORVASTATIN CALCIUM", "TABLET", "ORAL", "EQ 40MG BASE", "RX"),
            ("ANDA090548", "ATORVASTATIN CALCIUM", "APOTEX", "AB",
             "ATORVASTATIN CALCIUM", "TABLET", "ORAL", "EQ 40MG BASE", "RX"),
            # Single-member group: excluded by the HAVING COUNT(*) > 1 clause.
            ("NDA111111", "SOLO", "X", "AB",
             "SOLOSTATIN", "TABLET", "ORAL", "5MG", "RX"),
            # Discontinued: excluded by mkt_type = 'RX'.
            ("NDA222222", "OLD", "Y", "AB",
             "ATORVASTATIN CALCIUM", "TABLET", "ORAL", "EQ 40MG BASE", "DISCN"),
        ],
    )
    connection.executemany(
        "INSERT INTO ndc_product VALUES (?,?,?)",
        [
            ("000010001", "NDA020702", ingredients("EQ 40MG BASE")),
            ("000010002", "NDA020702", ingredients("EQ 10MG BASE")),
            ("000020001", "ANDA090548", ingredients("EQ 40MG BASE")),
        ],
    )
    connection.executemany(
        "INSERT INTO nadac_price VALUES (?,?,?,?)",
        [
            ("000010001", 20.00, "EA", "B"),
            ("000010002", 1.00, "EA", "B"),  # the 10 mg trap
            ("000020001", 0.20, "EA", "G"),
        ],
    )
    connection.executemany(
        "INSERT INTO build_stat VALUES (?,?,?)",
        [("nadac", "price_as_of", "2026-08-26"),
         ("openfda_ndc", "export_date", "2026-08-28")],
    )
    yield connection
    connection.close()


def only_group(payload) -> dict:
    groups = [g for g in payload["groups"] if g["i"] == "ATORVASTATIN CALCIUM"]
    assert len(groups) == 1
    return groups[0]


def test_price_is_matched_to_the_group_strength(conn):
    """An NDA spans every approved strength; the 10 mg price is not the answer."""
    group = only_group(build_payload(conn))
    lipitor = next(m for m in group["mem"] if m["t"] == "LIPITOR")

    assert lipitor["p"] == 20.0, "quoted the 10 mg price against the 40 mg group"


def test_brand_comes_from_the_nadac_classification(conn):
    group = only_group(build_payload(conn))
    by_name = {m["t"]: m for m in group["mem"]}

    assert by_name["LIPITOR"]["b"] == 1
    assert by_name["ATORVASTATIN CALCIUM"]["b"] == 0


def test_saving_uses_the_strength_matched_brand_price(conn):
    group = only_group(build_payload(conn))
    # (20.00 - 0.20) / 20.00 = 99.0%. Off the 10 mg price it would be 80.0%.
    assert group["sv"] == 99.0


def test_members_are_sorted_cheapest_first(conn):
    group = only_group(build_payload(conn))
    prices = [m["p"] for m in group["mem"]]

    assert prices == sorted(prices, key=lambda p: (p is None, p or 0.0))


def test_single_source_and_discontinued_groups_are_excluded(conn):
    payload = build_payload(conn)
    ingredients_seen = {g["i"] for g in payload["groups"]}

    assert "SOLOSTATIN" not in ingredients_seen, "single-member group was kept"
    # The DISCN row must not inflate the surviving group either.
    assert only_group(payload)["n"] == 2


def test_name_index_reaches_a_group_by_brand(conn):
    """The front door: a user starts from the brand, not the ingredient."""
    payload = build_payload(conn)
    index = payload["name_index"]

    assert "LIPITOR" in index, "brand names are not indexed"
    group = payload["groups"][index["LIPITOR"][0]]
    assert group["i"] == "ATORVASTATIN CALCIUM"


def test_name_index_reaches_a_group_by_ingredient_and_by_moiety(conn):
    index = build_payload(conn)["name_index"]

    assert "ATORVASTATIN CALCIUM" in index
    assert "ATORVASTATIN" in index, "salt-stripped moiety is not indexed"


def test_meta_carries_the_price_basis_disclaimer(conn):
    """NADAC is an acquisition cost; the payload must say so, not the UI alone."""
    meta = build_payload(conn)["meta"]

    assert "not a copay" in meta["price_basis"]
    assert meta["coverage"]["groups"] == len(build_payload(conn)["groups"])
