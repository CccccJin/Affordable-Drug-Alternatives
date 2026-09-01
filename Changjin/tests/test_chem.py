"""Tests for the RDKit helpers in `chem.py`.

Written before the fingerprint storage format changes, because there was no
coverage at all and two of the module's three functions turned out to be broken
in ways only a runtime call would show: `calculate_similarity` returned 0.0 for
every pair, including a molecule against itself, and `get_compound_properties`
raised on every valid molecule. Both were unreachable from the API, so nothing
caught them.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from chem import (  # noqa: E402
    N_BITS, RADIUS, calculate_similarity, get_compound_properties,
    smiles_to_fingerprint,
)

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
SALICYLIC = "O=C(O)c1ccccc1O"
ETHANOL = "CCO"


class TestSmilesToFingerprint:
    def test_returns_a_bit_vector_of_the_requested_width(self):
        fp = smiles_to_fingerprint(ASPIRIN)
        assert len(fp) == N_BITS
        assert fp.GetNumOnBits() > 0

    def test_honours_an_explicit_width(self):
        assert len(smiles_to_fingerprint(ASPIRIN, n_bits=2048)) == 2048

    def test_is_deterministic(self):
        assert (smiles_to_fingerprint(ASPIRIN).ToBitString()
                == smiles_to_fingerprint(ASPIRIN).ToBitString())

    @pytest.mark.parametrize("bad", ["", None, "%%%not a molecule%%%"])
    def test_returns_none_rather_than_raising_on_bad_input(self, bad):
        assert smiles_to_fingerprint(bad) is None

    def test_matches_the_parameters_the_static_export_uses(self):
        """A score from this API must equal one from the deployed page."""
        from rdkit.Chem import rdFingerprintGenerator
        from rdkit import Chem

        generator = rdFingerprintGenerator.GetMorganGenerator(
            radius=RADIUS, fpSize=N_BITS)
        expected = generator.GetFingerprint(Chem.MolFromSmiles(ASPIRIN))
        assert smiles_to_fingerprint(ASPIRIN).ToBitString() == expected.ToBitString()


class TestCalculateSimilarity:
    def test_a_molecule_is_identical_to_itself(self):
        """The regression: this returned 0.0 for every input."""
        fp = smiles_to_fingerprint(ASPIRIN)
        assert calculate_similarity(fp, fp) == pytest.approx(1.0)

    def test_accepts_a_smiles_string_on_the_right(self):
        fp = smiles_to_fingerprint(ASPIRIN)
        assert calculate_similarity(fp, ASPIRIN) == pytest.approx(1.0)

    def test_related_molecules_score_between_zero_and_one(self):
        score = calculate_similarity(smiles_to_fingerprint(ASPIRIN), SALICYLIC)
        assert 0.0 < score < 1.0

    def test_unrelated_molecules_score_low(self):
        score = calculate_similarity(smiles_to_fingerprint(ASPIRIN), ETHANOL)
        assert score < 0.2

    def test_is_symmetric(self):
        a, b = smiles_to_fingerprint(ASPIRIN), smiles_to_fingerprint(SALICYLIC)
        assert calculate_similarity(a, b) == pytest.approx(calculate_similarity(b, a))

    @pytest.mark.parametrize("metric", ["tanimoto", "dice", "cosine"])
    def test_supported_metrics_all_score_identity_as_one(self, metric):
        fp = smiles_to_fingerprint(ASPIRIN)
        assert calculate_similarity(fp, fp, metric=metric) == pytest.approx(1.0)

    def test_dice_and_tanimoto_disagree_on_a_partial_match(self):
        a, b = smiles_to_fingerprint(ASPIRIN), smiles_to_fingerprint(SALICYLIC)
        assert calculate_similarity(a, b, "dice") != calculate_similarity(a, b, "tanimoto")

    def test_an_absent_molecule_is_similar_to_nothing(self):
        fp = smiles_to_fingerprint(ASPIRIN)
        assert calculate_similarity(fp, None) == 0.0
        assert calculate_similarity(None, fp) == 0.0
        assert calculate_similarity(fp, "%%%") == 0.0

    def test_mismatched_widths_score_zero_rather_than_raising(self):
        narrow = smiles_to_fingerprint(ASPIRIN, n_bits=512)
        wide = smiles_to_fingerprint(ASPIRIN, n_bits=1024)
        assert calculate_similarity(narrow, wide) == 0.0

    def test_an_unknown_metric_is_a_caller_mistake_not_a_zero(self):
        """Silently scoring zero would make a typo look like a dissimilar pair."""
        fp = smiles_to_fingerprint(ASPIRIN)
        with pytest.raises(ValueError, match="Unsupported similarity metric"):
            calculate_similarity(fp, fp, metric="jaccardish")


class TestGetCompoundProperties:
    def test_returns_descriptors_for_a_valid_molecule(self):
        """The regression: this raised AttributeError on every valid molecule."""
        props = get_compound_properties(ASPIRIN)

        assert props["mw"] == pytest.approx(180.042, abs=0.01)
        assert props["heavy_atoms"] == 13
        assert props["aromatic_rings"] == 1
        assert props["hbd"] == 1
        assert props["rotatable_bonds"] == 2

    def test_counts_two_aromatic_rings_in_a_fused_system(self):
        props = get_compound_properties("c1ccc2ccccc2c1")  # naphthalene
        assert props["aromatic_rings"] == 2

    def test_counts_no_aromatic_ring_in_an_aliphatic_molecule(self):
        assert get_compound_properties("C1CCCCC1")["aromatic_rings"] == 0

    @pytest.mark.parametrize("bad", ["", None, "%%%"])
    def test_returns_none_rather_than_raising_on_bad_input(self, bad):
        assert get_compound_properties(bad) is None
