"""Endpoint tests for the FastAPI service in `main.py`.

The service had no coverage. It is also the component about to change: the
fingerprint column moves from a hex-encoded string of '0'/'1' characters to a
packed binary vector, and `/search` is the only reader. These tests pin what the
endpoint returns *before* that change, so the migration can be shown not to
alter any score.

A fixture DuckDB is built per session rather than reaching for
`chembl_35/chembl_35.duckdb`, which is gitignored and absent from a clean
checkout. `db.get_db_connection` reads `CHEMBL_DUCKDB_PATH`, so pointing the
service at the fixture needs no production code change.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

duckdb = pytest.importorskip("duckdb")
pytest.importorskip("fastapi")
pytest.importorskip("httpx")

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
SALICYLIC = "O=C(O)c1ccccc1O"
ETHANOL = "CCO"

#: SearchRequest declares threshold as Field(gt=0, le=1), so 0.0 is rejected.
#: This is the smallest value that still admits every fixture molecule.
MIN_THRESHOLD = 0.001

#: (chembl_id, smiles, mw, logp) — three molecules whose pairwise similarities
#: are far enough apart to assert ordering on.
CORPUS = [
    ("CHEMBL25", ASPIRIN, 180.16, 1.31),
    ("CHEMBL424", SALICYLIC, 138.12, 1.19),
    ("CHEMBL545", ETHANOL, 46.07, -0.14),
]


def _fingerprint_hex(smiles: str) -> str:
    """The storage format `preprocess_database.py` writes today.

    Kept spelled out here rather than imported: these tests exist to prove the
    endpoint's behaviour is unchanged when that format is replaced, so they must
    not move with it.
    """
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator

    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    fp = generator.GetFingerprint(Chem.MolFromSmiles(smiles))
    return fp.ToBitString().encode("utf-8").hex()


@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("chembl") / "fixture.duckdb"
    conn = duckdb.connect(str(path))
    conn.execute(
        "CREATE TABLE compound_structures ("
        "  molregno BIGINT, canonical_smiles VARCHAR, fingerprint_hex VARCHAR)"
    )
    conn.execute("CREATE TABLE molecule_dictionary (molregno BIGINT, chembl_id VARCHAR, pref_name VARCHAR)")
    conn.execute(
        "CREATE TABLE compound_properties ("
        "  molregno BIGINT, mw_freebase VARCHAR, alogp VARCHAR, hba BIGINT, hbd BIGINT,"
        "  psa VARCHAR, rtb BIGINT, heavy_atoms BIGINT, aromatic_rings BIGINT)"
    )
    for i, (chembl_id, smiles, mw, logp) in enumerate(CORPUS, start=1):
        conn.execute("INSERT INTO compound_structures VALUES (?,?,?)",
                     [i, smiles, _fingerprint_hex(smiles)])
        conn.execute("INSERT INTO molecule_dictionary VALUES (?,?,?)",
                     [i, chembl_id, chembl_id.replace("CHEMBL", "NAME")])
        conn.execute("INSERT INTO compound_properties VALUES (?,?,?,?,?,?,?,?,?)",
                     [i, str(mw), str(logp), 3, 1, "63.6", 2, 13, 1])
    conn.close()
    return path


@pytest.fixture(scope="session")
def client(fixture_db):
    from fastapi.testclient import TestClient

    os.environ["CHEMBL_DUCKDB_PATH"] = str(fixture_db)
    # db reads the env var at call time, but main may already be imported by
    # another test module, so reload both to pick the fixture up.
    import importlib
    import db
    importlib.reload(db)
    import main
    importlib.reload(main)
    return TestClient(main.app)


class TestHealth:
    def test_reports_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestProperties:
    def test_lists_the_filterable_keys(self, client):
        response = client.get("/properties")
        assert response.status_code == 200
        assert "mw" in response.json()
        assert "logp" in response.json()

    def test_calculates_properties_for_a_smiles(self, client):
        response = client.post("/properties/calculate", json={"smiles": ASPIRIN})
        assert response.status_code == 200

        body = response.json()
        assert body["mw"] == pytest.approx(180.16, abs=0.05)
        assert body["heavy_atoms"] == 13
        assert body["aromatic_rings"] == 1

    def test_rejects_an_unparseable_smiles(self, client):
        response = client.post("/properties/calculate", json={"smiles": "%%%"})
        assert response.status_code == 400


class TestVisualize:
    def test_returns_an_svg(self, client):
        response = client.get("/visualize", params={"smiles": ASPIRIN})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/svg+xml")
        assert "<svg" in response.text

    def test_rejects_an_unparseable_smiles(self, client):
        assert client.get("/visualize", params={"smiles": "%%%"}).status_code == 400


class TestSearch:
    """The endpoint whose storage format is about to change."""

    def test_finds_the_query_molecule_at_similarity_one(self, client):
        response = client.post("/search", json={"smiles": ASPIRIN, "threshold": 0.3})
        assert response.status_code == 200

        results = response.json()["results"]
        top = results[0]
        assert top["similarity"] == pytest.approx(1.0)
        assert top["smiles"] == ASPIRIN

    def test_ranks_by_descending_similarity(self, client):
        response = client.post("/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD})
        scores = [r["similarity"] for r in response.json()["results"]]
        assert scores == sorted(scores, reverse=True)

    def test_scores_a_related_molecule_above_an_unrelated_one(self, client):
        response = client.post("/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD})
        by_smiles = {r["smiles"]: r["similarity"] for r in response.json()["results"]}

        assert by_smiles[SALICYLIC] > by_smiles[ETHANOL]

    def test_the_threshold_excludes_weak_matches(self, client):
        loose = client.post("/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD})
        strict = client.post("/search", json={"smiles": ASPIRIN, "threshold": 0.99})

        assert len(strict.json()["results"]) < len(loose.json()["results"])
        assert len(strict.json()["results"]) == 1

    def test_max_results_caps_the_list_but_not_the_count(self, client):
        response = client.post(
            "/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD, "max_results": 1})
        body = response.json()

        assert len(body["results"]) == 1
        assert body["count"] == len(CORPUS)

    def test_the_cosine_metric_is_accepted(self, client):
        response = client.post(
            "/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD, "metric": "cosine"})
        assert response.status_code == 200
        assert response.json()["results"][0]["similarity"] == pytest.approx(1.0)

    def test_rejects_an_unparseable_smiles(self, client):
        response = client.post("/search", json={"smiles": "%%%", "threshold": 0.5})
        assert response.status_code == 400

    def test_reports_the_preferred_name_rather_than_the_id(self, client):
        response = client.post("/search", json={"smiles": ASPIRIN, "threshold": 0.99})
        assert response.json()["results"][0]["chembl_id"] == "NAME25"


class TestSearchScoresAreStableAcrossTheFormatChange:
    """The migration guard.

    Every score `/search` returns must equal what RDKit computes directly from
    the SMILES. That holds for the hex-string column today and must still hold
    once the column is packed binary — which is what makes it safe to swap.
    """

    def test_every_score_matches_a_direct_rdkit_computation(self, client):
        from rdkit import DataStructs

        from chem import smiles_to_fingerprint

        response = client.post("/search", json={"smiles": ASPIRIN, "threshold": MIN_THRESHOLD})
        query_fp = smiles_to_fingerprint(ASPIRIN)

        for result in response.json()["results"]:
            expected = DataStructs.TanimotoSimilarity(
                query_fp, smiles_to_fingerprint(result["smiles"]))
            assert result["similarity"] == pytest.approx(expected, abs=1e-9), (
                f"{result['smiles']} scored {result['similarity']}, "
                f"RDKit says {expected}"
            )
