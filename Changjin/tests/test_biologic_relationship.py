"""The biologic decision has one implementation, and this holds it to that.

`export_biologics.py` used to restate the rules `grade.py` already encoded, and
dropped B5 doing so — the export marked eight Humira follow-ons interchangeable
with nothing recording that FDA has made no finding *between* them. The rules
now live in `grade.biologic_relationship` and both callers use it; these cases
fail if a rule is added to one path and not the other.

The keys matter and are easy to get wrong: FDA gives a follow-on its own proper
name with a four-letter suffix (ADALIMUMAB-AFZB), while its `ref_proper_name_key`
names the reference (ADALIMUMAB). Two follow-ons therefore differ in
`proper_name_key` and agree in `ref_proper_name_key`, which is exactly what
separates B5 from A3.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from subst_data.grade import biologic_relationship  # noqa: E402
from subst_data.export_biologics import _grade_against_reference  # noqa: E402


def product(proper_name_key, *, ref=None, interchangeable=False, biosimilar=False,
            license_type=None, name="X"):
    return {
        "proper_name_key": proper_name_key,
        "ref_proper_name_key": ref,
        "is_interchangeable": int(interchangeable),
        "is_biosimilar": int(biosimilar),
        "license_type": license_type or ("351(a)" if ref is None else "351(k)"),
        "proprietary_name": name,
    }


HUMIRA = product("ADALIMUMAB", name="Humira")
SIMLANDI = product("ADALIMUMAB-RYAA", ref="ADALIMUMAB", interchangeable=True,
                   license_type="351(k) Interchangeable", name="Simlandi")
CYLTEZO = product("ADALIMUMAB-ADBM", ref="ADALIMUMAB", interchangeable=True,
                  license_type="351(k) Interchangeable", name="Cyltezo")
IDACIO = product("ADALIMUMAB-AACF", ref="ADALIMUMAB", biosimilar=True,
                 license_type="351(k) Biosimilar", name="Idacio")
LIPITOR = product("ATORVASTATIN", name="Lipitor")


class TestBiologicRelationship:
    def test_interchangeable_followon_against_its_reference_is_A3(self):
        assert biologic_relationship(HUMIRA, SIMLANDI) == ("A", "A3")
        assert biologic_relationship(SIMLANDI, HUMIRA) == ("A", "A3")

    def test_biosimilar_against_its_reference_is_B4(self):
        assert biologic_relationship(HUMIRA, IDACIO) == ("B", "B4")

    def test_two_followons_of_one_reference_are_B5(self):
        """The rule the export dropped.

        Both are individually interchangeable with Humira. FDA has made no
        determination between them, so this is B, not A.
        """
        assert biologic_relationship(SIMLANDI, CYLTEZO) == ("B", "B5")

    def test_an_interchangeable_and_a_biosimilar_followon_are_also_B5(self):
        assert biologic_relationship(SIMLANDI, IDACIO) == ("B", "B5")

    def test_same_proper_name_under_separate_licences_is_B6(self):
        other = product("ADALIMUMAB", name="Another originator")
        assert biologic_relationship(HUMIRA, other) == ("B", "B6")

    def test_unrelated_products_have_no_relationship(self):
        assert biologic_relationship(HUMIRA, LIPITOR) is None

    def test_the_suffix_is_what_separates_B5_from_A3(self):
        """Guards the key structure the rules depend on.

        Give two follow-ons the same proper_name_key — as a naive fixture
        would — and the reference test matches between them, collapsing B5 into
        A3. Real Purple Book rows never look like that.
        """
        naive_a = product("ADALIMUMAB", ref="ADALIMUMAB", interchangeable=True)
        naive_b = product("ADALIMUMAB", ref="ADALIMUMAB", biosimilar=True)
        assert biologic_relationship(naive_a, naive_b) == ("A", "A3")
        # …whereas with the suffixes FDA actually assigns:
        assert biologic_relationship(SIMLANDI, IDACIO) == ("B", "B5")


class TestExportUsesTheSameRules:
    """The export must not have its own opinion."""

    def test_the_reference_product_grades_as_the_reference(self):
        assert _grade_against_reference(HUMIRA, HUMIRA)[0] == "reference"

    @pytest.mark.parametrize("member,expected", [
        (SIMLANDI, ("A", "A3")),
        (CYLTEZO, ("A", "A3")),
        (IDACIO, ("B", "B4")),
    ])
    def test_each_followon_is_graded_against_the_reference(self, member, expected):
        assert _grade_against_reference(member, HUMIRA) == expected

    def test_agrees_with_grade_py_for_every_member(self):
        for member in (SIMLANDI, CYLTEZO, IDACIO):
            assert _grade_against_reference(member, HUMIRA) == \
                biologic_relationship(HUMIRA, member)

    def test_a_followon_with_no_marketed_reference_still_reports_its_licence(self):
        """No pair to grade, so the licence is all there is to go on."""
        assert _grade_against_reference(SIMLANDI, None) == ("A", "")
        assert _grade_against_reference(IDACIO, None) == ("B", "")


def test_the_exported_payload_records_where_B5_applies():
    """A family with two follow-ons must carry the flag the UI warns from."""
    import json

    path = ROOT / "frontend" / "public" / "data" / "biologics.json"
    if not path.exists():
        pytest.skip("run `python price_compare.py export-biologics`")

    payload = json.loads(path.read_text(encoding="utf-8"))
    for group in payload["groups"]:
        followons = [m for m in group["mem"] if m["lt"].startswith("351(k)")]
        assert group["b5"] == (len(followons) > 1), (
            f"{group['i']} has {len(followons)} follow-ons but b5={group['b5']}"
        )
        if group["ref"] is not None:
            assert any(m["g"] == "reference" for m in group["mem"])


class TestBiologicSanityCheck:
    """The sanity check must fail when the export and grade.py disagree.

    A check that passes unconditionally is worse than no check: it reports
    agreement it never looked for.
    """

    def test_the_committed_export_agrees_with_grade_py(self):
        from subst_data.biologic_sanity import check

        export = ROOT / "frontend" / "public" / "data" / "biologics.json"
        db = ROOT / "subst_data" / "cache" / "substitutability.sqlite"
        if not (export.exists() and db.exists()):
            pytest.skip("run `python price_compare.py export-biologics`")

        findings = check()["findings"]
        assert findings == [], f"{len(findings)} disagreement(s): {findings[:3]}"

    def test_it_notices_a_grade_the_rules_do_not_support(self, tmp_path):
        """Corrupt one grade and the check must say so."""
        import json

        from subst_data.biologic_sanity import check

        export = ROOT / "frontend" / "public" / "data" / "biologics.json"
        db = ROOT / "subst_data" / "cache" / "substitutability.sqlite"
        if not (export.exists() and db.exists()):
            pytest.skip("run `python price_compare.py export-biologics`")

        payload = json.loads(export.read_text(encoding="utf-8"))
        family = next(g for g in payload["groups"]
                      if any(m["g"] == "B" for m in g["mem"]))
        member = next(m for m in family["mem"] if m["g"] == "B")
        member["g"] = "A"          # claim a biosimilar is interchangeable
        member["rule"] = "A3"

        tampered = tmp_path / "biologics.json"
        tampered.write_text(json.dumps(payload), encoding="utf-8")

        findings = check(export_path=tampered)["findings"]
        assert any(member["t"] in f for f in findings), (
            "the check passed an export that contradicts grade.py"
        )

    def test_it_notices_an_unflagged_B5_family(self, tmp_path):
        import json

        from subst_data.biologic_sanity import check

        export = ROOT / "frontend" / "public" / "data" / "biologics.json"
        if not export.exists():
            pytest.skip("run `python price_compare.py export-biologics`")

        payload = json.loads(export.read_text(encoding="utf-8"))
        family = next(g for g in payload["groups"] if g["b5"])
        family["b5"] = False

        tampered = tmp_path / "biologics.json"
        tampered.write_text(json.dumps(payload), encoding="utf-8")

        findings = check(export_path=tampered)["findings"]
        assert any("b5=False" in f for f in findings)
