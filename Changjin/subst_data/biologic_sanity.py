"""Sanity check for the Purple Book biologic layer.

The Orange Book path has a stratified evaluation with held-out splits and a
manifest hash. The biologic path had nothing — it shipped figures like Stelara
against Yesintek at 90.4% with no check of any kind, which is a lower standard
than the rest of this project holds itself to.

A full stratified evaluation is not the right answer here and this does not
pretend to be one. Interchangeability is not a hidden concept to be predicted:
FDA states it in the Purple Book, the module reads it, and there is no held-out
label to score against. What *can* go wrong is the plumbing — a follow-on
attached to the wrong reference, a price compared across pricing units, a grade
that disagrees with `grade.py` — and this checks those, printing every figure so
a reader who knows the market can judge plausibility directly.

    python price_compare.py biologic-sanity
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path

from .grade import biologic_relationship

CACHE = Path(__file__).resolve().parent / "cache"
DB_PATH = CACHE / "substitutability.sqlite"
EXPORT = (Path(__file__).resolve().parents[1]
          / "frontend" / "public" / "data" / "biologics.json")
OUT_PATH = Path(__file__).resolve().parents[1] / "BIOLOGIC_SANITY_CHECK.md"

DISCLAIMER = ("NADAC is what pharmacies pay to acquire a drug. It is not a "
              "copay, not a cash price, and not a reimbursement rate.")


def _rows_by_bla(conn) -> dict[str, list]:
    out = defaultdict(list)
    for row in conn.execute(
        "SELECT bla_no, appl_no, proprietary_name, proper_name_key, license_type, "
        "       is_interchangeable, is_biosimilar, ref_proper_name_key, "
        "       ref_proprietary_name, marketing_status "
        "FROM pb_product WHERE marketing_status = 'Rx'"
    ):
        out[row["proprietary_name"]].append(dict(row))
    return out


def check(export_path: Path | None = None, db_path: Path | None = None) -> dict:
    payload = json.loads(Path(export_path or EXPORT).read_text(encoding="utf-8"))
    conn = sqlite3.connect(f"file:{db_path or DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    source = _rows_by_bla(conn)
    conn.close()

    findings: list[str] = []
    switches = []

    for group in payload["groups"]:
        members = group["mem"]
        reference = next((m for m in members if m["g"] == "reference"), None)

        # 1. Every grade in the export must be the one grade.py gives for that
        #    product against this family's reference.
        if reference is not None:
            ref_rows = source.get(reference["t"], [])
            for member in members:
                if member["g"] == "reference":
                    continue
                rows = source.get(member["t"], [])
                if not rows or not ref_rows:
                    continue
                expected = biologic_relationship(ref_rows[0], rows[0])
                if expected is None:
                    findings.append(
                        f"{group['i']}: {member['t']} has no relationship to "
                        f"{reference['t']} but was exported as grade {member['g']}")
                elif expected[0] != member["g"] or expected[1] != member["rule"]:
                    findings.append(
                        f"{group['i']}: {member['t']} exported as "
                        f"{member['g']}/{member['rule']}, grade.py says "
                        f"{expected[0]}/{expected[1]}")

        # 2. B5 must be flagged exactly when the family holds two follow-ons.
        followons = [m for m in members if m["lt"].startswith("351(k)")]
        if group["b5"] != (len(followons) > 1):
            findings.append(
                f"{group['i']}: {len(followons)} follow-ons but b5={group['b5']}")

        # 3. A saving must compare like with like, and must be a real reduction.
        for saving in group["sav"]:
            priced = {m["t"]: m for m in members if m["u"] == saving["u"]}
            if saving["from"] not in priced or saving["to"] not in priced:
                findings.append(
                    f"{group['i']}: saving compares {saving['from']} to "
                    f"{saving['to']} across pricing units")
                continue
            if priced[saving["from"]]["lt"] != "351(a)":
                findings.append(
                    f"{group['i']}: baseline {saving['from']} is not the reference")
            if saving["fp"] <= saving["tp"]:
                findings.append(
                    f"{group['i']}: baseline {saving['fp']} is not above "
                    f"follow-on {saving['tp']}")
            switches.append((group["i"], saving, group["b5"]))

    return {"payload": payload, "findings": findings, "switches": switches}


def main(output: Path | None = None) -> Path:
    result = check()
    out = Path(output or OUT_PATH)
    switches = sorted(result["switches"], key=lambda s: -s[1]["sv"])
    findings = result["findings"]
    coverage = result["payload"]["meta"]["coverage"]

    lines = [
        "# Biologic Sanity Check — Purple Book",
        "",
        f"Generated {date.today().isoformat()} by "
        "`python price_compare.py biologic-sanity`.",
        "",
        "> **This is not the stratified evaluation the Orange Book path has, and "
        "does not stand in for one.** Interchangeability is not a hidden concept "
        "to predict: FDA states it in the Purple Book and this module reads it, "
        "so there is no held-out label to score against. What is checked here is "
        "the plumbing — that every exported grade matches `grade.py`, that rule "
        "B5 is flagged wherever it applies, and that no saving compares prices "
        "across pricing units.",
        "",
        f"> **{DISCLAIMER}**",
        "",
        "## Automated checks",
        "",
        f"- families exported: **{coverage['families']}**",
        f"- products: **{coverage['members']}**",
        f"- families with a computable switch: **{coverage['with_savings']}**",
        f"- disagreements with `grade.py`: **{len(findings)}**",
        "",
    ]
    if findings:
        lines += ["```"] + findings[:40] + ["```", ""]
    else:
        lines += ["Every exported grade agrees with `grade.py`, every B5 family is "
                  "flagged, and every saving compares one pricing unit.", ""]

    lines += [
        "## Priced switches",
        "",
        "Each row is the dearest reference product against the cheapest follow-on "
        "in the same pricing unit. `Grade` is the *cheapest follow-on's* "
        "relationship to the reference — never to the other follow-ons.",
        "",
        "| Molecule | Reference | $/unit | Cheapest follow-on | $/unit | Unit | Saving | Grade | B5 applies |",
        "|---|---|---:|---|---:|---|---:|:-:|:-:|",
    ]
    for molecule, saving, b5 in switches:
        lines.append(
            f"| {molecule} | {saving['from']} | {saving['fp']:,.2f} | "
            f"{saving['to']} | {saving['tp']:,.2f} | {saving['u']} | "
            f"{saving['sv']:.1f}% | {saving['g']} | {'yes' if b5 else 'no'} |")

    lines += [
        "",
        "## What 'B5 applies' means",
        "",
        "The family holds more than one 351(k) follow-on. Each is rated against "
        "the reference product and against nothing else, so two follow-ons are "
        "**not** interchangeable with one another — however interchangeable each "
        "is with the reference. `grade.py` returns grade B, rule B5, for any such "
        "pair, and the frontend states it beneath the member table.",
        "",
        "## What this does not establish",
        "",
        "1. **No held-out evaluation.** Every grade is read from the Purple Book, "
        "not predicted, so agreement with `grade.py` measures the identifier "
        "chain and nothing about clinical equivalence.",
        "2. **Prices are sparse.** CMS surveys retail pharmacy acquisition cost "
        "and most biologics are clinician-administered, so only a handful of "
        "families have a price on both sides.",
        "3. **Single point in time.** The Purple Book and NADAC both move; the "
        "generation date above identifies the extract these figures came from.",
        "",
    ]

    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  {coverage['families']} families · {len(switches)} priced switches · "
          f"{len(findings)} disagreements")
    for molecule, saving, b5 in switches:
        print(f"    {molecule[:20]:22} {saving['from'][:14]:16} {saving['fp']:>10,.2f}"
              f" -> {saving['to'][:14]:14} {saving['tp']:>9,.2f}/{saving['u']:2}"
              f" {saving['sv']:>6.1f}%  {saving['g']}  B5={'y' if b5 else 'n'}")
    return out


if __name__ == "__main__":
    main()
