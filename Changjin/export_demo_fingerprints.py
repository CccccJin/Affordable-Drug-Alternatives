#!/usr/bin/env python3
"""Precompute Morgan fingerprints for the static demo compound set.

The deployed site is GitHub Pages, so it has no DuckDB and no Python RDKit --
but structural similarity does not need either. A fingerprint is a fixed fact
about a molecule, so the corpus side is precomputed here and the query side is
computed in the browser by the RDKit WASM module the frontend already ships.
That leaves the browser doing one fingerprint and 5,000 popcounts, which is
sub-millisecond work.

Parameters match ``chem.py`` (Morgan, radius 2, 1024 bits) so a score shown by
the static demo is the same number the FastAPI ``/search`` endpoint would
return for the same pair.

Output is a flat binary blob rather than base64-in-JSON: base64 costs 33% and
a parse pass, while ``fetch().arrayBuffer()`` hands the bytes straight to a
``Uint8Array``. Row *i* of the blob is compound *i* of ``compounds.json`` --
the two files are ordered together and must be regenerated together.

    python export_demo_fingerprints.py

Byte layout is RDKit's own ``BitVectToBinaryText``, which is byte-for-byte what
JS ``get_morgan_fp_as_uint8array('{"radius":2,"nBits":1024}')`` produces. This
equality is what makes the split legal, so ``tests/test_demo_fingerprints.py``
asserts it against a stored vector rather than trusting it.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator
from rdkit.DataStructs import BitVectToBinaryText

RADIUS = 2
N_BITS = 1024
FP_BYTES = N_BITS // 8

DATA = Path(__file__).resolve().parent / "frontend" / "public" / "data"
COMPOUNDS = DATA / "compounds.json"
METADATA = DATA / "metadata.json"
OUT = DATA / "fingerprints.bin"

# ChEMBL ships a few structures RDKit rejects (valence errors, mostly). A row
# has to exist for every compound or the index alignment breaks, so an
# unparseable molecule gets an all-zero row; the frontend reads zero on-bits as
# "no fingerprint" and drops the compound from structural results rather than
# scoring it 0.0 against everything.
EMPTY_ROW = bytes(FP_BYTES)


def fingerprint(smiles: str, generator=None) -> bytes:
    """Morgan fingerprint of one SMILES, in RDKit's binary bit-vector layout.

    Returns ``EMPTY_ROW`` for a structure RDKit cannot parse.
    """
    mol = Chem.MolFromSmiles(smiles or "")
    if mol is None:
        return EMPTY_ROW
    gen = generator or rdFingerprintGenerator.GetMorganGenerator(
        radius=RADIUS, fpSize=N_BITS)
    return BitVectToBinaryText(gen.GetFingerprint(mol))


def build(compounds: list[dict]) -> tuple[bytes, list[str]]:
    """Return the concatenated fingerprint blob and the ids RDKit rejected."""
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=N_BITS)
    blob = bytearray()
    rejected: list[str] = []
    for record in compounds:
        row = fingerprint(record["s"], gen)
        if row == EMPTY_ROW:
            rejected.append(record["id"])
        blob += row
    return bytes(blob), rejected


def main() -> Path:
    RDLogger.DisableLog("rdApp.*")

    compounds = json.loads(COMPOUNDS.read_text(encoding="utf-8"))
    blob, rejected = build(compounds)
    OUT.write_bytes(blob)

    # The frontend reads its geometry from metadata rather than hard-coding it,
    # so changing N_BITS here cannot silently desync the two sides.
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))
    metadata["fingerprints"] = {
        "file": OUT.name,
        "algorithm": "Morgan",
        "radius": RADIUS,
        "n_bits": N_BITS,
        "bytes_per_record": FP_BYTES,
        "records": len(compounds),
        "unparseable": len(rejected),
        "note": (
            "Row i corresponds to record i of compounds.json; regenerate both "
            "together. Matches chem.py, so scores equal the FastAPI /search "
            "endpoint's."
        ),
    }
    METADATA.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    gz = len(gzip.compress(blob, 9))
    print(f"Wrote {OUT}")
    print(f"  {len(compounds):,} records · {len(rejected)} unparseable")
    print(f"  {len(blob) / 1024:.0f} KB raw, {gz / 1024:.0f} KB gzipped")
    return OUT


if __name__ == "__main__":
    main()
