"""In-memory fingerprint index for the similarity endpoint.

`/search` used to open the database, scan `compound_structures` and rebuild every
bit vector from scratch on *every request*. At ChEMBL 35 that is 2.4M decodes per
query, single-threaded, with nothing retained between calls — the scan cost was
paid again by the next user asking the same question, and by every concurrent
request at once.

The vectors do not change between requests, so they are built once at startup
and kept. Memory is the packed representation: 2.4M x 128 bytes is roughly 0.31
GB of fingerprints, plus the row metadata the endpoint returns alongside them.

Loading is lazy and cached rather than done at import, so importing `main` (in a
test, or to read the OpenAPI schema) does not require a database.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Sequence

from rdkit import DataStructs

logger = logging.getLogger(__name__)

#: Columns the endpoint needs beside the fingerprint, in the order it unpacks
#: them. Kept here so the SQL and the tuple layout cannot drift apart.
ROW_COLUMNS = (
    "chembl_id", "canonical_smiles", "mw", "logp", "hba", "hbd",
    "psa", "rtb", "heavy_atoms", "aromatic_rings",
)


@dataclass
class FingerprintIndex:
    """Every fingerprinted compound, decoded once."""

    fingerprints: list = field(default_factory=list)
    rows: list[tuple] = field(default_factory=list)
    column: str = ""
    build_seconds: float = 0.0

    def __len__(self) -> int:
        return len(self.fingerprints)

    def similarities(self, query, metric: str = "tanimoto") -> Sequence[float]:
        """Score the query against the whole index in one call."""
        bulk = (DataStructs.BulkCosineSimilarity if metric == "cosine"
                else DataStructs.BulkTanimotoSimilarity)
        if not self.fingerprints:
            return []
        return bulk(query, self.fingerprints)


def _decode_binary(value):
    return DataStructs.CreateFromBinaryText(value)


def _decode_hex(value):
    return DataStructs.CreateFromBitString(bytes.fromhex(value).decode("utf-8"))


def fingerprint_column(con) -> str:
    """Prefer the packed column, falling back to the legacy hex one."""
    columns = {row[0] for row in con.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'compound_structures'").fetchall()}
    if "fingerprint_bin" in columns and con.execute(
        "SELECT 1 FROM compound_structures WHERE fingerprint_bin IS NOT NULL LIMIT 1"
    ).fetchone():
        return "fingerprint_bin"
    return "fingerprint_hex"


def build_index(con) -> FingerprintIndex:
    """Read and decode every fingerprint. Called once per process."""
    column = fingerprint_column(con)
    decode = _decode_binary if column == "fingerprint_bin" else _decode_hex

    started = time.perf_counter()
    cursor = con.execute(f"""
        SELECT md.chembl_id, cs.canonical_smiles, cs.{column},
               CAST(COALESCE(cp.mw_freebase, '0') AS FLOAT) as mw,
               CAST(COALESCE(cp.alogp, '0') AS FLOAT) as logp,
               COALESCE(cp.hba, 0) as hba, COALESCE(cp.hbd, 0) as hbd,
               CAST(COALESCE(cp.psa, '0') AS FLOAT) as psa, COALESCE(cp.rtb, 0) as rtb,
               COALESCE(cp.heavy_atoms, 0) as heavy_atoms,
               COALESCE(cp.aromatic_rings, 0) as aromatic_rings
        FROM compound_structures cs
        JOIN molecule_dictionary md ON cs.molregno = md.molregno
        LEFT JOIN compound_properties cp ON cs.molregno = cp.molregno
        WHERE cs.{column} IS NOT NULL
    """)

    index = FingerprintIndex(column=column)
    rejected = 0
    while True:
        chunk = cursor.fetchmany(50_000)
        if not chunk:
            break
        for row in chunk:
            try:
                index.fingerprints.append(decode(row[2]))
            except Exception as e:
                rejected += 1
                logger.warning("Undecodable fingerprint for %s: %s", row[0], e)
                continue
            index.rows.append((row[0], row[1]) + tuple(row[3:]))

    index.build_seconds = time.perf_counter() - started
    logger.info("Fingerprint index: %s compounds from %s in %.1fs (%s undecodable)",
                f"{len(index):,}", column, index.build_seconds, f"{rejected:,}")
    return index


# --- cache -----------------------------------------------------------------
#: Keyed on the database it was built from, not merely on the process. A single
#: deployment only ever has one, but a cache keyed on nothing silently serves
#: the first database it ever saw to every caller afterwards -- which is exactly
#: what happened the first time this was written, and what
#: `test_the_index_follows_the_database` now prevents.
_indexes: dict[str, FingerprintIndex] = {}
_lock = threading.Lock()


def get_index(connect, key: str | None = None) -> FingerprintIndex:
    """The index for one database, building it on first use.

    `connect` is a callable returning a connection, so the caller keeps control
    of where the data comes from and this module needs no import-time database.
    `key` identifies that database; it defaults to whatever `db.DB_PATH` names.
    The lock keeps two concurrent first requests from each paying the full build.
    """
    if key is None:
        import db
        key = str(db.DB_PATH)

    cached = _indexes.get(key)
    if cached is not None:
        return cached

    with _lock:
        if key not in _indexes:
            con = connect()
            try:
                _indexes[key] = build_index(con)
            finally:
                con.close()
    return _indexes[key]


def reset_index() -> None:
    """Drop every cached index. For tests, and for a deliberate reload."""
    with _lock:
        _indexes.clear()
