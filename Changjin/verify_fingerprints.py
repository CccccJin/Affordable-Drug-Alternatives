#!/usr/bin/env python3
"""Prove the packed fingerprint column agrees with the hex one before switching.

The migration replaces `compound_structures.fingerprint_hex` (1024 ASCII '0'/'1'
characters, hex-encoded) with `fingerprint_bin` (128 packed bytes). The two must
describe the same molecule bit for bit, or every similarity score the API
returns changes silently — which is the one outcome a storage optimisation must
not produce.

This checks three things over a sample, and reports rather than assumes:

1. **Bit equality.** The vector rebuilt from each column is identical.
2. **Score equality.** Tanimoto against a query agrees to floating-point
   precision, by both the old per-row path and `BulkTanimotoSimilarity`.
3. **Ranking equality.** The ordering the API would return is unchanged — the
   property a user would actually notice.

    python verify_fingerprints.py                 # 5,000-row sample
    python verify_fingerprints.py --sample 50000
    python verify_fingerprints.py --all           # every fingerprinted row
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import duckdb
from rdkit import DataStructs, RDLogger
from rdkit.DataStructs import CreateFromBinaryText, CreateFromBitString

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chem import smiles_to_fingerprint  # noqa: E402

DB_FILE = os.getenv(
    "CHEMBL_DUCKDB_PATH",
    str(Path(__file__).resolve().parent / "chembl_35" / "chembl_35.duckdb"),
)
TABLE_NAME = "compound_structures"
QUERY_SMILES = "CC(=O)Oc1ccccc1C(=O)O"  # aspirin


def from_hex(value: str):
    """Rebuild a vector the way `main.py` does today."""
    return CreateFromBitString(bytes.fromhex(value).decode("utf-8"))


def verify(db_file: str | Path = DB_FILE, sample: int | None = 5000,
           query_smiles: str = QUERY_SMILES) -> dict:
    RDLogger.DisableLog("rdApp.*")
    con = duckdb.connect(str(db_file), read_only=True)

    limit = "" if sample is None else f"USING SAMPLE {sample} ROWS"
    rows = con.execute(
        f"SELECT molregno, canonical_smiles, fingerprint_hex, fingerprint_bin "
        f"FROM {TABLE_NAME} "
        f"WHERE fingerprint_hex IS NOT NULL AND fingerprint_bin IS NOT NULL {limit}"
    ).fetchall()
    con.close()

    query_fp = smiles_to_fingerprint(query_smiles)
    report = {"rows": len(rows), "bit_mismatches": [], "score_mismatches": [],
              "rank_mismatch": False, "max_score_delta": 0.0}

    hex_scores, bin_scores, ids = [], [], []
    for molregno, smiles, hex_value, bin_value in rows:
        old_fp = from_hex(hex_value)
        new_fp = CreateFromBinaryText(bin_value)

        if old_fp.ToBitString() != new_fp.ToBitString():
            report["bit_mismatches"].append(molregno)
            continue

        old_score = DataStructs.TanimotoSimilarity(query_fp, old_fp)
        new_score = DataStructs.TanimotoSimilarity(query_fp, new_fp)
        delta = abs(old_score - new_score)
        report["max_score_delta"] = max(report["max_score_delta"], delta)
        if delta > 1e-12:
            report["score_mismatches"].append((molregno, old_score, new_score))

        hex_scores.append(old_score)
        bin_scores.append(new_score)
        ids.append(molregno)

    # Bulk is how the new read path will actually score; it must agree too.
    bulk = DataStructs.BulkTanimotoSimilarity(
        query_fp, [CreateFromBinaryText(r[3]) for r in rows
                   if r[0] not in set(report["bit_mismatches"])])
    report["bulk_matches_per_row"] = all(
        abs(a - b) <= 1e-12 for a, b in zip(bin_scores, bulk))

    # Ranking is the property a user would notice.
    old_order = [i for _, i in sorted(zip(hex_scores, ids), key=lambda p: (-p[0], p[1]))]
    new_order = [i for _, i in sorted(zip(bin_scores, ids), key=lambda p: (-p[0], p[1]))]
    report["rank_mismatch"] = old_order != new_order

    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--sample", type=int, default=5000)
    parser.add_argument("--all", action="store_true", help="check every row")
    parser.add_argument("--db", default=DB_FILE)
    args = parser.parse_args(argv)

    report = verify(args.db, sample=None if args.all else args.sample)

    print(f"Compared {report['rows']:,} rows carrying both columns.\n")
    if not report["rows"]:
        print("Nothing to compare — run preprocess_database.py first.")
        return 1

    ok = True
    for label, bad in (("bit-identical", report["bit_mismatches"]),
                       ("score-identical", report["score_mismatches"])):
        if bad:
            ok = False
            print(f"  FAIL  {label}: {len(bad):,} mismatch(es), e.g. {bad[:3]}")
        else:
            print(f"  pass  {label}")

    print(f"  {'pass' if report['bulk_matches_per_row'] else 'FAIL'}  "
          f"BulkTanimotoSimilarity agrees with the per-row path")
    print(f"  {'FAIL' if report['rank_mismatch'] else 'pass'}  ranking unchanged")
    print(f"\n  largest score delta: {report['max_score_delta']:.3e}")

    ok = ok and report["bulk_matches_per_row"] and not report["rank_mismatch"]
    print("\nSafe to switch main.py over." if ok else "\nDO NOT switch — investigate above.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
