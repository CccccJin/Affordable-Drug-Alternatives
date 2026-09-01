#!/usr/bin/env python3
"""Fill `compound_structures.fingerprint_bin` with packed Morgan fingerprints.

Writes a **new** column rather than replacing `fingerprint_hex`, so the old and
new paths coexist while the migration is verified. `verify_fingerprints.py`
compares them; only once that passes is it safe to switch `main.py` over and
drop the old column.

What changes, and why it matters at ChEMBL scale:

*Storage.* `fingerprint_hex` holds ``fp.ToBitString().encode().hex()`` — 1024
ASCII '0'/'1' characters, hex-encoded again, so 2048 stored characters for 1024
bits of information. `fingerprint_bin` holds RDKit's own ``BitVectToBinaryText``:
128 bytes. Measured over 5,000 real molecules that is 10,240,000 bytes against
640,000 — **16x** — which extrapolates to 4.92 GB against 0.31 GB across
ChEMBL 35.

*Read cost.* Rebuilding a vector from the hex form costs a hex decode, a UTF-8
decode and a parse of a 1024-character string. Scanning 5,000 rows and scoring
them takes 27.2 ms from the hex column against 9.3 ms from the packed one —
**2.9x**, both figures including the decode.

An earlier estimate of 63x for this was wrong: it timed
``BulkTanimotoSimilarity`` over vectors that had already been decoded, so the
cost the packed format actually removes was excluded from one side of the
comparison. Profiling the endpoint also showed the scan was never where the time
went — see `post_processing.normalize_scores`, which was O(n^2) and accounted
for 89% of a request. The storage change is worth making for the 16x on disk;
it is not a latency fix.

*Write cost.* The previous version issued one ``UPDATE ... WHERE molregno = ?``
per molecule. DuckDB is columnar and rewrites a row group per statement, so 2.4M
point updates is not a slow version of this job, it is a different and far worse
one. Fingerprints are now staged into a temporary table and merged one chunk at
a time.

    python preprocess_database.py              # resume where it left off
    python preprocess_database.py --rebuild    # recompute every row
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import duckdb
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator
from rdkit.DataStructs import BitVectToBinaryText

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chem import N_BITS, RADIUS  # noqa: E402  (one definition of the parameters)

DB_FILE = os.getenv(
    "CHEMBL_DUCKDB_PATH",
    str(Path(__file__).resolve().parent / "chembl_35" / "chembl_35.duckdb"),
)
TABLE_NAME = "compound_structures"
CHUNK = 50_000


def packed_fingerprint(smiles: str, generator=None) -> bytes | None:
    """Morgan fingerprint as packed bytes, or None when RDKit rejects the SMILES.

    This is the same layout `export_demo_fingerprints.py` writes and the frontend
    reads, so one molecule has one fingerprint everywhere in the project.
    """
    if not smiles:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    gen = generator or rdFingerprintGenerator.GetMorganGenerator(
        radius=RADIUS, fpSize=N_BITS)
    return BitVectToBinaryText(gen.GetFingerprint(mol))


def ensure_column(con) -> None:
    columns = {row[0] for row in con.execute(
        f"SELECT column_name FROM information_schema.columns "
        f"WHERE table_name = '{TABLE_NAME}'").fetchall()}
    if "fingerprint_bin" not in columns:
        con.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN fingerprint_bin BLOB")
        print("Added column 'fingerprint_bin'.")


def run_preprocessing(db_file: str | Path = DB_FILE, rebuild: bool = False) -> int:
    RDLogger.DisableLog("rdApp.*")
    con = duckdb.connect(str(db_file))
    ensure_column(con)

    if rebuild:
        con.execute(f"UPDATE {TABLE_NAME} SET fingerprint_bin = NULL")

    pending = con.execute(
        f"SELECT COUNT(*) FROM {TABLE_NAME} "
        f"WHERE canonical_smiles IS NOT NULL AND fingerprint_bin IS NULL"
    ).fetchone()[0]
    print(f"{pending:,} molecules to fingerprint.")
    if not pending:
        con.close()
        return 0

    generator = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=N_BITS)
    done = rejected = 0
    started = time.perf_counter()

    while True:
        # Re-query rather than paginating with OFFSET: rows leave the set as
        # they are filled, so an offset would skip over the ones behind it.
        rows = con.execute(
            f"SELECT molregno, canonical_smiles FROM {TABLE_NAME} "
            f"WHERE canonical_smiles IS NOT NULL AND fingerprint_bin IS NULL "
            f"LIMIT {CHUNK}"
        ).fetchall()
        if not rows:
            break

        batch = []
        for molregno, smiles in rows:
            packed = packed_fingerprint(smiles, generator)
            if packed is None:
                rejected += 1
                continue
            batch.append((molregno, packed))

        if batch:
            # One merge per chunk instead of one UPDATE per molecule.
            con.execute("CREATE OR REPLACE TEMP TABLE fp_batch (molregno BIGINT, fp BLOB)")
            con.executemany("INSERT INTO fp_batch VALUES (?, ?)", batch)
            con.execute(
                f"UPDATE {TABLE_NAME} SET fingerprint_bin = fp_batch.fp "
                f"FROM fp_batch WHERE {TABLE_NAME}.molregno = fp_batch.molregno"
            )
        done += len(batch)

        if rejected and not batch:
            # Every remaining row is unparseable; another pass would loop forever.
            break

        rate = done / max(time.perf_counter() - started, 1e-9)
        print(f"  {done:,}/{pending:,} ({rate:,.0f}/s)")

    con.close()
    elapsed = time.perf_counter() - started
    print(f"Done: {done:,} fingerprints in {elapsed:.1f}s "
          f"({done / max(elapsed, 1e-9):,.0f}/s), {rejected:,} unparseable.")
    return done


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--rebuild", action="store_true",
                        help="recompute every row instead of resuming")
    parser.add_argument("--db", default=DB_FILE, help="path to the DuckDB file")
    args = parser.parse_args(argv)

    print(f"Database: {args.db}")
    run_preprocessing(args.db, rebuild=args.rebuild)
    return 0


if __name__ == "__main__":
    sys.exit(main())
