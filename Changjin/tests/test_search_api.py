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


def _fingerprint(smiles: str):
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator

    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    return generator.GetFingerprint(Chem.MolFromSmiles(smiles))


def _fingerprint_hex(smiles: str) -> str:
    """The legacy format: 1024 ASCII '0'/'1' characters, hex-encoded again.

    Spelled out here rather than imported, because these tests exist to prove
    the endpoint behaves identically whichever column it reads — so they must
    not move when the production encoder does.
    """
    return _fingerprint(smiles).ToBitString().encode("utf-8").hex()


def _fingerprint_bin(smiles: str) -> bytes:
    """The packed format: 128 bytes, RDKit's own serialisation."""
    from rdkit.DataStructs import BitVectToBinaryText

    return BitVectToBinaryText(_fingerprint(smiles))


@pytest.fixture(scope="session", params=["hex", "bin"], ids=["legacy-hex", "packed-bin"])
def fixture_db(request, tmp_path_factory) -> Path:
    """One database per storage format.

    Every assertion below runs twice — once against the legacy hex column and
    once against the packed binary one. Identical results are what makes the
    migration safe; a difference in either direction fails here rather than in
    production.
    """
    layout = request.param
    path = tmp_path_factory.mktemp(f"chembl-{layout}") / "fixture.duckdb"
    conn = duckdb.connect(str(path))
    column = ("fingerprint_hex VARCHAR" if layout == "hex"
              else "fingerprint_hex VARCHAR, fingerprint_bin BLOB")
    conn.execute(
        f"CREATE TABLE compound_structures ("
        f"  molregno BIGINT, canonical_smiles VARCHAR, {column})"
    )
    conn.execute("CREATE TABLE molecule_dictionary (molregno BIGINT, chembl_id VARCHAR, pref_name VARCHAR)")
    conn.execute(
        "CREATE TABLE compound_properties ("
        "  molregno BIGINT, mw_freebase VARCHAR, alogp VARCHAR, hba BIGINT, hbd BIGINT,"
        "  psa VARCHAR, rtb BIGINT, heavy_atoms BIGINT, aromatic_rings BIGINT)"
    )
    for i, (chembl_id, smiles, mw, logp) in enumerate(CORPUS, start=1):
        if layout == "hex":
            conn.execute("INSERT INTO compound_structures VALUES (?,?,?)",
                         [i, smiles, _fingerprint_hex(smiles)])
        else:
            conn.execute("INSERT INTO compound_structures VALUES (?,?,?,?)",
                         [i, smiles, _fingerprint_hex(smiles), _fingerprint_bin(smiles)])
        conn.execute("INSERT INTO molecule_dictionary VALUES (?,?,?)",
                     [i, chembl_id, chembl_id.replace("CHEMBL", "NAME")])
        conn.execute("INSERT INTO compound_properties VALUES (?,?,?,?,?,?,?,?,?)",
                     [i, str(mw), str(logp), 3, 1, "63.6", 2, 13, 1])
    conn.close()
    return path


@pytest.fixture(scope="session")
def client(fixture_db):  # noqa: D401
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


class TestPostProcessing:
    """Two faults profiling the endpoint turned up."""

    def test_the_enable_flag_is_actually_honoured(self, client):
        """It was declared, documented, and never read."""
        on = client.post("/search", json={
            "smiles": ASPIRIN, "threshold": MIN_THRESHOLD,
            "enable_post_processing": True})
        off = client.post("/search", json={
            "smiles": ASPIRIN, "threshold": MIN_THRESHOLD,
            "enable_post_processing": False})

        assert on.json()["post_processed"] is not None
        assert off.json()["post_processed"] is None
        # Skipping the work must not change which compounds come back.
        assert ([r["chembl_id"] for r in on.json()["results"]]
                == [r["chembl_id"] for r in off.json()["results"]])

    def test_normalizing_scores_is_linear_in_the_candidate_count(self):
        """`normalize_scores` recomputed a whole-set maximum per candidate.

        Timing is a poor assertion, so this counts the work instead: the cost
        denominator must be derived once, not once per candidate.
        """
        import sys as _sys
        from pathlib import Path as _Path

        _sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))
        from post_processing import DrugPostProcessor, CandidateMolecule

        calls = {"n": 0}

        class CountingCost(float):
            """Counts how often the cost of a candidate is read."""

        def candidate(i: int) -> CandidateMolecule:
            return CandidateMolecule(
                smiles="CCO", similarity_tanimoto=0.5, similarity_embedding=0.5,
                mw=100.0 + i, cns_mpo=4.0, cost=10.0 + i, toxicity_flag=False,
                indications=[], name=f"C{i}", num_rotatable_bonds=1,
            )

        processor = DrugPostProcessor()
        small = [candidate(i) for i in range(10)]
        large = [candidate(i) for i in range(200)]

        import builtins
        real_max = builtins.max
        for batch, label in ((small, "10"), (large, "200")):
            calls["n"] = 0
            builtins.max = lambda *a, **k: (calls.__setitem__("n", calls["n"] + 1),
                                            real_max(*a, **k))[1]
            try:
                processor.normalize_scores(batch)
            finally:
                builtins.max = real_max
            # One max() for the denominator, not one per candidate.
            assert calls["n"] <= 2, (
                f"{label} candidates triggered {calls['n']} max() calls — "
                "the whole-set denominator is being recomputed in the loop"
            )
