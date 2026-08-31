"""Tests for the static demo fingerprint export.

The frontend computes the *query* fingerprint with RDKit's WASM build and
compares it against a *corpus* fingerprinted here by RDKit's Python build. That
split is only legal because both emit the same bytes for the same molecule, so
the equality is pinned below against vectors captured from JS rather than
assumed.

Regenerate the JS side with::

    node -e "require('@rdkit/rdkit')().then(R => {
      const m = R.get_mol('CCO');
      console.log(Buffer.from(
        m.get_morgan_fp_as_uint8array('{\\"radius\\":2,\\"nBits\\":1024}')
      ).toString('hex'));
    })"
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from export_demo_fingerprints import (  # noqa: E402
    COMPOUNDS, EMPTY_ROW, FP_BYTES, METADATA, N_BITS, OUT, RADIUS, build,
    fingerprint,
)

# Captured from @rdkit/rdkit 2025.3.4 in Node:
#   mol.get_morgan_fp_as_uint8array('{"radius":2,"nBits":1024}')
# If RDKit changes this layout the frontend silently starts scoring garbage,
# which is exactly the failure this file exists to catch.
JS_VECTORS = {
    'CCO': (
        "0000000002000000000001000000000000000000000000000000004000000000"
        "0000000040000000000000000000000004000000000000000000000000000000"
        "0000000000000000000000000000000000000000000000000000000000000000"
        "0000000080000000000000000000000000000000000000000000000000000000"
    ),
    'CC(=O)Oc1ccccc1C(=O)O': (
        "0008800002000000010000000000000000000000008000000000000000000000"
        "0000000000000000000000001000000024000000800000100001000000000000"
        "0000000000000000000001000000000000040000000080000200400000800000"
        "0000000080000000000002000000002000200000000004008000000000000002"
    ),
    'COc1cc2nc(N3CCN(C(=O)c4ccco4)CC3)nc(N)c2cc1OC': (
        "0000000002040000010204000000000000000800000000000000122000210002"
        "000000000000000000a00000100000040000a00000000a000001200411001000"
        "0100000000002000000000000020010010040100000080000000400400000000"
        "0010080080000080000202000008002840000040804004000000000200000000"
    ),
}


@pytest.mark.parametrize("smiles,expected_hex", sorted(JS_VECTORS.items()))
def test_python_bytes_match_the_wasm_build(smiles, expected_hex):
    """Python and JS RDKit must produce byte-identical fingerprints."""
    assert fingerprint(smiles).hex() == expected_hex


def test_unparseable_smiles_yields_an_empty_row():
    """A rejected structure still occupies a row, or every later index shifts."""
    assert fingerprint("not a molecule") == EMPTY_ROW
    assert len(fingerprint("not a molecule")) == FP_BYTES


def test_build_keeps_one_row_per_compound():
    compounds = [
        {"chembl_id": "CHEMBL1", "smiles": "CCO"},
        {"chembl_id": "CHEMBL2", "smiles": "%%%bad%%%"},
        {"chembl_id": "CHEMBL3", "smiles": "CC(=O)Oc1ccccc1C(=O)O"},
    ]
    blob, rejected = build(compounds)

    assert len(blob) == len(compounds) * FP_BYTES
    assert rejected == ["CHEMBL2"]
    assert blob[FP_BYTES:2 * FP_BYTES] == EMPTY_ROW
    assert blob[:FP_BYTES].hex() == JS_VECTORS["CCO"]


needs_export = pytest.mark.skipif(
    not OUT.exists(), reason="run `python export_demo_fingerprints.py`")


@needs_export
def test_exported_blob_is_aligned_with_compounds_json():
    """Row i of the blob must be compound i -- the frontend indexes on it."""
    compounds = json.loads(COMPOUNDS.read_text(encoding="utf-8"))
    blob = OUT.read_bytes()

    assert len(blob) == len(compounds) * FP_BYTES

    # Spot-check both ends and the middle rather than all 5,000: a desync from
    # a partial regeneration shows up at the tail, a reordering at the middle.
    for i in (0, len(compounds) // 2, len(compounds) - 1):
        row = blob[i * FP_BYTES:(i + 1) * FP_BYTES]
        assert row == fingerprint(compounds[i]["smiles"]), \
            f"row {i} does not match {compounds[i]['chembl_id']}"


@needs_export
def test_metadata_describes_the_geometry_the_frontend_reads():
    meta = json.loads(METADATA.read_text(encoding="utf-8"))["fingerprints"]
    compounds = json.loads(COMPOUNDS.read_text(encoding="utf-8"))

    assert meta["n_bits"] == N_BITS
    assert meta["radius"] == RADIUS
    assert meta["bytes_per_record"] == FP_BYTES
    assert meta["records"] == len(compounds)
    assert meta["file"] == OUT.name


@needs_export
def test_parameters_match_the_backend_search_endpoint():
    """A demo score must equal what FastAPI /search would return for the pair."""
    from chem import smiles_to_fingerprint
    from rdkit.DataStructs import BitVectToBinaryText

    smiles = "COc1cc2nc(N3CCN(C(=O)c4ccco4)CC3)nc(N)c2cc1OC"
    assert BitVectToBinaryText(smiles_to_fingerprint(smiles)) == fingerprint(smiles)
