#!/usr/bin/env python3
"""FDA-authoritative drug substitutability adjudication.

Decides whether two RxNorm concepts may be substituted for one another, and
returns a *graded* answer with a traceable evidence chain rather than a bare
boolean.

    >>> from substitutability import judge
    >>> v = judge("617311", "617320")     # atorvastatin 40 MG: generic vs Lipitor
    >>> v.grade
    'A'
    >>> print(v.explain())

Grades
------
==== =========================================================================
 A   FDA-rated therapeutically equivalent (Orange Book ``AB*``), or an
     FDA-designated *interchangeable* biologic (Purple Book ``351(k)
     Interchangeable``).  A pharmacist may substitute without calling the
     prescriber, subject to state substitution law.
 B   Same active ingredient and dosage form, but no FDA equivalence finding:
     a ``B*`` rating, an unrated product, mismatched ``AB<n>`` subgroups, or a
     biosimilar that is not interchangeable.  Prescriber authorisation needed.
 C   Different active ingredient, therapeutically related via WHO ATC --
     level-5 substance class (salt/ester variants) or level-4 chemical
     subgroup.  A prescribing decision, not a substitution.
 D   No substitutability relationship found.
==== =========================================================================

Data sources
------------
=========================  ===============================================
FDA Orange Book            ``products.txt`` / ``patent.txt`` / ``exclusivity.txt``
FDA Purple Book            monthly cumulative CSV extract
openFDA NDC Directory      bridges RXCUI to FDA application number
RxNorm                     local UMLS ``.RRF`` release, else the public RxNav API
WHO ATC                    ATC codes as carried by RxNorm
=========================  ===============================================

Command line
------------
    python substitutability.py fetch                  # download the raw sources
    python substitutability.py build                  # build the sqlite database
    python substitutability.py judge 617311 617320    # adjudicate a pair
    python substitutability.py coverage               # write the coverage report
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from subst_data.grade import (  # noqa: E402
    Adjudicator, Evidence, Verdict, get_adjudicator, parse_strength, te_subgroups,
)

__all__ = [
    "judge", "judge_many", "Adjudicator", "Verdict", "Evidence",
    "parse_strength", "te_subgroups",
]


def judge(rxcui_a: str, rxcui_b: str, *, adjudicator: Adjudicator | None = None,
          offline: bool = False) -> Verdict:
    """Adjudicate substitutability between two RxNorm concepts.

    Parameters
    ----------
    rxcui_a, rxcui_b:
        RxNorm concept identifiers.  Any term type is accepted -- ingredient
        (``IN``), clinical drug (``SCD``) or branded drug (``SBD``) -- and is
        normalised against RxNorm before adjudication.
    adjudicator:
        Reuse an existing :class:`~subst_data.grade.Adjudicator` (keeps the
        sqlite handle and the RxNav cache warm across many calls).
    offline:
        Never issue network calls; answer only from cached RxNav responses.

    Returns
    -------
    Verdict
        ``.grade`` is one of ``A``/``B``/``C``/``D``; ``.evidence`` is the list
        of source-field citations behind it; ``.explain()`` renders it for a
        human reviewer and ``.to_dict()`` for a machine.
    """
    adj = adjudicator or get_adjudicator(offline=offline)
    return adj.judge(rxcui_a, rxcui_b)


def judge_many(pairs, *, offline: bool = False) -> list[Verdict]:
    """Adjudicate many pairs, reusing one database handle and RxNav cache."""
    adj = Adjudicator(offline=offline)
    return [adj.judge(a, b) for a, b in pairs]


# --------------------------------------------------------------------------
def _cmd_fetch(args):
    from subst_data import sources
    sources.fetch_all(force=args.force)


def _cmd_build(args):
    from subst_data.build_db import main as build_main
    build_main()


def _cmd_judge(args):
    verdict = judge(args.rxcui_a, args.rxcui_b, offline=args.offline)
    if args.json:
        print(json.dumps(verdict.to_dict(), indent=2))
    else:
        print(verdict.explain())


#: Worked examples, one per grading rule, used by the ``demo`` subcommand.
DEMO_CASES = [
    ("617311", "617320", "atorvastatin 40 MG generic vs Lipitor"),
    ("2563977", "285018", "Semglee vs Lantus (interchangeable biologic)"),
    ("2273517", "1657864", "Ruxience vs Rituxan (biosimilar)"),
    ("2105831", "2273517", "Truxima vs Ruxience (two follow-ons, one reference)"),
    ("1801289", "993518", "bupropion ER 150 MG x2 (different AB subgroups)"),
    ("866514", "866436", "metoprolol tartrate vs succinate (salt variants)"),
    ("617311", "198211", "atorvastatin vs simvastatin (same statin subgroup)"),
    ("617311", "308191", "atorvastatin vs amoxicillin (unrelated)"),
]


def _cmd_demo(args):
    """Adjudicate one worked example per grading rule."""
    adj = Adjudicator(offline=args.offline)
    print(f"{'GRADE':<7} {'CASE':<52} RULE")
    print("-" * 100)
    for a, b, desc in DEMO_CASES:
        v = adj.judge(a, b)
        print(f"{v.grade + v.rule_id:<7} {desc:<52} {v.label[:44]}")
    print()
    print("Full evidence chain for any pair:")
    print(f"  python substitutability.py judge {DEMO_CASES[4][0]} {DEMO_CASES[4][1]}")


def _cmd_coverage(args):
    from subst_data.coverage import main as coverage_main
    coverage_main(output=args.output)


def main(argv=None):
    p = argparse.ArgumentParser(
        prog="substitutability",
        description=__doc__.split("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    f = sub.add_parser("fetch", help="download the raw FDA / RxNorm sources")
    f.add_argument("--force", action="store_true", help="re-download even if cached")
    f.set_defaults(func=_cmd_fetch)

    b = sub.add_parser("build", help="build the sqlite mapping database")
    b.set_defaults(func=_cmd_build)

    j = sub.add_parser("judge", help="adjudicate one pair of RXCUIs")
    j.add_argument("rxcui_a")
    j.add_argument("rxcui_b")
    j.add_argument("--json", action="store_true", help="emit JSON instead of text")
    j.add_argument("--offline", action="store_true", help="use only cached RxNav data")
    j.set_defaults(func=_cmd_judge)

    d = sub.add_parser("demo", help="adjudicate one worked example per grading rule")
    d.add_argument("--offline", action="store_true", help="use only cached RxNav data")
    d.set_defaults(func=_cmd_demo)

    c = sub.add_parser("coverage", help="write the data coverage report")
    c.add_argument("-o", "--output", default=None, help="output markdown path")
    c.set_defaults(func=_cmd_coverage)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
