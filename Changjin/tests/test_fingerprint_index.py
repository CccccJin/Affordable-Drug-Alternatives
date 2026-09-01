"""Tests for the in-memory fingerprint index.

The index is what makes `/search` viable at ChEMBL scale — vectors are decoded
once per process instead of once per request. It is also a cache, and the first
version of it was keyed on nothing at all, so it served whichever database it
happened to see first to every caller afterwards. That case is pinned below.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

duckdb = pytest.importorskip("duckdb")

from fingerprint_index import (  # noqa: E402
    build_index, fingerprint_column, get_index, reset_index,
)

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
SALICYLIC = "O=C(O)c1ccccc1O"
ETHANOL = "CCO"


def _fp(smiles):
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator

    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    return gen.GetFingerprint(Chem.MolFromSmiles(smiles))


def make_db(path: Path, smiles_list, *, packed: bool = False) -> Path:
    from rdkit.DataStructs import BitVectToBinaryText

    conn = duckdb.connect(str(path))
    column = "fingerprint_bin BLOB" if packed else "fingerprint_hex VARCHAR"
    conn.execute(
        f"CREATE TABLE compound_structures "
        f"(molregno BIGINT, canonical_smiles VARCHAR, {column})")
    conn.execute("CREATE TABLE molecule_dictionary (molregno BIGINT, chembl_id VARCHAR, pref_name VARCHAR)")
    conn.execute(
        "CREATE TABLE compound_properties (molregno BIGINT, mw_freebase VARCHAR,"
        " alogp VARCHAR, hba BIGINT, hbd BIGINT, psa VARCHAR, rtb BIGINT,"
        " heavy_atoms BIGINT, aromatic_rings BIGINT)")
    for i, smiles in enumerate(smiles_list, start=1):
        fp = _fp(smiles)
        value = (BitVectToBinaryText(fp) if packed
                 else fp.ToBitString().encode("utf-8").hex())
        conn.execute("INSERT INTO compound_structures VALUES (?,?,?)", [i, smiles, value])
        conn.execute("INSERT INTO molecule_dictionary VALUES (?,?,?)",
                     [i, f"CHEMBL{i}", f"MOL{i}"])
        conn.execute("INSERT INTO compound_properties VALUES (?,?,?,?,?,?,?,?,?)",
                     [i, "180.16", "1.31", 3, 1, "63.6", 2, 13, 1])
    conn.close()
    return path


@pytest.fixture(autouse=True)
def clean_cache():
    reset_index()
    yield
    reset_index()


class TestBuildIndex:
    def test_decodes_every_fingerprinted_row(self, tmp_path):
        db = make_db(tmp_path / "a.duckdb", [ASPIRIN, SALICYLIC, ETHANOL])
        conn = duckdb.connect(str(db), read_only=True)
        index = build_index(conn)
        conn.close()

        assert len(index) == 3
        assert len(index.rows) == 3
        assert index.column == "fingerprint_hex"

    def test_prefers_the_packed_column_when_it_is_populated(self, tmp_path):
        db = make_db(tmp_path / "b.duckdb", [ASPIRIN], packed=True)
        conn = duckdb.connect(str(db), read_only=True)
        assert fingerprint_column(conn) == "fingerprint_bin"
        assert build_index(conn).column == "fingerprint_bin"
        conn.close()

    def test_scores_a_molecule_against_itself_as_one(self, tmp_path):
        db = make_db(tmp_path / "c.duckdb", [ASPIRIN, ETHANOL])
        conn = duckdb.connect(str(db), read_only=True)
        index = build_index(conn)
        conn.close()

        scores = list(index.similarities(_fp(ASPIRIN)))
        assert scores[0] == pytest.approx(1.0)
        assert scores[1] < 0.2

    def test_both_storage_formats_produce_identical_scores(self, tmp_path):
        molecules = [ASPIRIN, SALICYLIC, ETHANOL]
        hex_db = make_db(tmp_path / "hex.duckdb", molecules)
        bin_db = make_db(tmp_path / "bin.duckdb", molecules, packed=True)

        scores = []
        for db in (hex_db, bin_db):
            conn = duckdb.connect(str(db), read_only=True)
            scores.append(list(build_index(conn).similarities(_fp(ASPIRIN))))
            conn.close()

        assert scores[0] == pytest.approx(scores[1], abs=1e-12)

    def test_the_cosine_metric_is_available(self, tmp_path):
        db = make_db(tmp_path / "d.duckdb", [ASPIRIN])
        conn = duckdb.connect(str(db), read_only=True)
        index = build_index(conn)
        conn.close()
        assert list(index.similarities(_fp(ASPIRIN), "cosine"))[0] == pytest.approx(1.0)

    def test_an_empty_table_scores_nothing_rather_than_raising(self, tmp_path):
        db = make_db(tmp_path / "e.duckdb", [])
        conn = duckdb.connect(str(db), read_only=True)
        index = build_index(conn)
        conn.close()

        assert len(index) == 0
        assert list(index.similarities(_fp(ASPIRIN))) == []


class TestCache:
    def test_builds_once_and_reuses(self, tmp_path):
        db = make_db(tmp_path / "f.duckdb", [ASPIRIN, ETHANOL])
        calls = {"n": 0}

        def connect():
            calls["n"] += 1
            return duckdb.connect(str(db), read_only=True)

        first = get_index(connect, key=str(db))
        second = get_index(connect, key=str(db))

        assert first is second
        assert calls["n"] == 1

    def test_the_index_follows_the_database(self, tmp_path):
        """The regression: a cache keyed on nothing served the first DB forever.

        Two databases with different contents must not share an index. The
        endpoint tests would not catch this on their own — both their fixtures
        hold the same molecules, so a stale index still gives the right answer.
        """
        small = make_db(tmp_path / "small.duckdb", [ETHANOL])
        large = make_db(tmp_path / "large.duckdb", [ETHANOL, ASPIRIN, SALICYLIC])

        small_index = get_index(lambda: duckdb.connect(str(small), read_only=True),
                                key=str(small))
        large_index = get_index(lambda: duckdb.connect(str(large), read_only=True),
                                key=str(large))

        assert len(small_index) == 1
        assert len(large_index) == 3

    def test_reset_forces_a_rebuild(self, tmp_path):
        db = make_db(tmp_path / "g.duckdb", [ASPIRIN])
        connect = lambda: duckdb.connect(str(db), read_only=True)  # noqa: E731

        first = get_index(connect, key=str(db))
        reset_index()
        second = get_index(connect, key=str(db))

        assert first is not second
        assert len(first) == len(second) == 1
