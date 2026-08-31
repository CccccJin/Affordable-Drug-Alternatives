"""Tests for the committed-extract staleness check.

The check exists because the failure is silent: a price that is quietly two
years old renders exactly like a current one. These pin the two behaviours that
make it useful — it fires on age alone, and it says what to run.
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from check_data_freshness import STALE_DAYS, check, main  # noqa: E402


def write_extract(directory: Path, filename: str, generated: str) -> None:
    (directory / filename).write_text(
        json.dumps({"meta": {"generated": generated}}), encoding="utf-8"
    )


def build(tmp_path: Path, generated: str = "2027-01-01") -> Path:
    write_extract(tmp_path, "substitutability.json", generated)
    write_extract(tmp_path, "biologics.json", generated)
    return tmp_path


def test_a_current_extract_is_not_flagged(tmp_path):
    build(tmp_path, "2027-01-01")
    report = check(today=date(2027, 2, 1), data_dir=tmp_path)

    assert all(not row["stale"] for row in report)
    assert [row["days"] for row in report] == [31, 31]


def test_the_threshold_is_the_boundary(tmp_path):
    build(tmp_path, "2027-01-01")

    generated = date(2027, 1, 1)
    day_before = check(today=generated + timedelta(days=STALE_DAYS - 1),
                       data_dir=tmp_path)
    on_the_day = check(today=generated + timedelta(days=STALE_DAYS),
                       data_dir=tmp_path)

    assert all(not row["stale"] for row in day_before)
    assert all(row["stale"] for row in on_the_day)


def test_a_missing_extract_counts_as_stale(tmp_path):
    """Absent provenance is not evidence of currency."""
    write_extract(tmp_path, "substitutability.json", "2027-01-01")
    report = check(today=date(2027, 1, 2), data_dir=tmp_path)

    biologics = next(r for r in report if r["file"] == "biologics.json")
    assert biologics["stale"] is True
    assert biologics["note"] == "missing"
    assert biologics["generated"] is None


def test_each_extract_carries_the_command_that_rebuilds_it(tmp_path):
    build(tmp_path)
    report = check(today=date(2027, 1, 2), data_dir=tmp_path)
    by_file = {row["file"]: row["rebuild"] for row in report}

    assert "price_compare.py export" in by_file["substitutability.json"]
    assert "export-biologics" in by_file["biologics.json"]


def test_the_two_extracts_are_checked_independently(tmp_path):
    write_extract(tmp_path, "substitutability.json", "2027-01-01")
    write_extract(tmp_path, "biologics.json", "2026-01-01")
    report = {r["file"]: r for r in check(today=date(2027, 2, 1), data_dir=tmp_path)}

    assert report["substitutability.json"]["stale"] is False
    assert report["biologics.json"]["stale"] is True


def test_the_committed_extracts_are_currently_fresh():
    """Guards the repository itself, not just the function."""
    report = check()
    stale = [r["label"] for r in report if r["stale"]]

    assert not stale, (
        f"{stale} is past {STALE_DAYS} days — rebuild it, or this is exactly the "
        "silent ageing the check exists to catch"
    )


def test_the_cli_exits_zero_only_when_everything_is_current(capsys):
    assert main([]) == 0
    assert "All extracts are under" in capsys.readouterr().out
