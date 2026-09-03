"""Run the labelled set and write the evaluation report.

    python -m dose_form.evaluate

Two reporting decisions that matter more than the headline number:

**Coverage and precision are reported apart.** A system that answers
everything at 90% precision is worse here than one that answers 80% at 99%,
because the unanswered 20% goes to a human and the wrong 10% does not.
Averaging them into one figure hides exactly the trade this design makes.

**Dangerous errors are counted on their own.** Calling two products equivalent
when they are not is the only error that can reach a patient; the rest cost
someone a lookup. It gets its own line, and it is the number to read first.
"""
from __future__ import annotations

import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dose_form.facets import (Equivalence, compare_dose_forms,
                              normalize_dose_form)
from dose_form.strength import compare_strengths, normalize_strength
from dose_form.testset import DOSE_FORM_CASES, STRENGTH_CASES

LEVELS = ["EQUIVALENT", "EQUIVALENT_WITH_CAVEAT", "NOT_EQUIVALENT", "UNKNOWN"]
SHORT = {"EQUIVALENT": "EQ", "EQUIVALENT_WITH_CAVEAT": "CAV",
         "NOT_EQUIVALENT": "NEQ", "UNKNOWN": "UNK"}

#: An answer that is not UNKNOWN. Coverage is the share of cases the system is
#: willing to answer at all.
def _answered(v: str) -> bool:
    return v != "UNKNOWN"


#: The only error that can reach a patient: the truth is "do not substitute"
#: and the system said "substitute".
def _dangerous(expected: str, got: str) -> bool:
    return expected == "NOT_EQUIVALENT" and got == "EQUIVALENT"


def run_dose_forms():
    rows, rule_hits = [], Counter()
    for case in DOSE_FORM_CASES:
        a = normalize_dose_form(case.left, "rxnorm" if ";" not in case.left else "orange_book",
                                ingredient=case.left_ingredient)
        b = normalize_dose_form(case.right, "rxnorm" if ";" not in case.right else "orange_book",
                                ingredient=case.right_ingredient)
        verdict = compare_dose_forms(a, b)
        rule_hits[verdict.rule] += 1
        rows.append((case, verdict.verdict.value, verdict.rule, str(verdict)))
    return rows, rule_hits


def run_strengths():
    rows, rule_hits = [], Counter()
    for case in STRENGTH_CASES:
        ctx = normalize_dose_form(case.context) if case.context else None
        a = normalize_strength(case.left, ctx)
        b = normalize_strength(case.right, ctx)
        verdict = compare_strengths(a, b, context=ctx)
        rule_hits[verdict.rule] += 1
        rows.append((case, verdict.verdict.value, verdict.rule, str(verdict)))
    return rows, rule_hits


def matrix(rows) -> dict:
    m: dict[tuple[str, str], int] = defaultdict(int)
    for case, got, _rule, _s in rows:
        m[(case.expected, got)] += 1
    return m


def render_matrix(m, out):
    out.append("| expected \\ got | " + " | ".join(SHORT[c] for c in LEVELS) + " |")
    out.append("|---|" + "---:|" * len(LEVELS))
    for exp in LEVELS:
        cells = []
        for got in LEVELS:
            n = m.get((exp, got), 0)
            cells.append(f"**{n}**" if n and exp == got else (str(n) if n else "·"))
        out.append(f"| {SHORT[exp]} | " + " | ".join(cells) + " |")


def section(name, rows, rule_hits, out):
    total = len(rows)
    answered = [r for r in rows if _answered(r[1])]
    correct = [r for r in rows if r[0].expected == r[1]]
    correct_answered = [r for r in answered if r[0].expected == r[1]]
    dangerous = [r for r in rows if _dangerous(r[0].expected, r[1])]

    out.append(f"\n## {name}\n")
    out.append(f"- cases: **{total}**")
    out.append(f"- coverage (answered, not UNKNOWN): **{len(answered)}/{total} "
               f"= {100*len(answered)/total:.1f}%**")
    out.append(f"- precision on answered: **{len(correct_answered)}/{len(answered)} "
               f"= {100*len(correct_answered)/max(1,len(answered)):.1f}%**")
    out.append(f"- exact match over all four levels: {len(correct)}/{total} "
               f"= {100*len(correct)/total:.1f}%")
    out.append(f"- **dangerous errors (expected NOT_EQUIVALENT, got EQUIVALENT): "
               f"{len(dangerous)}**")
    out.append("")
    render_matrix(matrix(rows), out)

    if dangerous:
        out.append("\n### Dangerous errors\n")
        for case, got, rule, detail in dangerous:
            out.append(f"- `{case.left}` vs `{case.right}` — expected "
                       f"{case.expected}, got {got} via {rule}")

    wrong = [r for r in rows if r[0].expected != r[1] and not _dangerous(r[0].expected, r[1])]
    if wrong:
        out.append(f"\n### Other mismatches ({len(wrong)})\n")
        out.append("| left | right | expected | got | rule |")
        out.append("|---|---|---|---|---|")
        for case, got, rule, _d in wrong:
            out.append(f"| `{case.left or '(empty)'}` | `{case.right or '(empty)'}` | "
                       f"{SHORT[case.expected]} | {SHORT[got]} | {rule} |")

    out.append("\n### By group\n")
    out.append("| group | n | coverage | precision on answered | dangerous |")
    out.append("|---|---:|---:|---:|---:|")
    groups = sorted({c.group for c, _g, _r, _d in rows})
    for g in groups:
        gr = [r for r in rows if r[0].group == g]
        ga = [r for r in gr if _answered(r[1])]
        gc = [r for r in ga if r[0].expected == r[1]]
        gd = [r for r in gr if _dangerous(r[0].expected, r[1])]
        out.append(f"| {g} | {len(gr)} | {100*len(ga)/len(gr):.0f}% | "
                   f"{100*len(gc)/max(1,len(ga)):.0f}% | {len(gd)} |")

    out.append("\n### Rule firing counts\n")
    out.append("| rule | fired | correct |")
    out.append("|---|---:|---:|")
    for rule in sorted(rule_hits):
        fired = [r for r in rows if r[2] == rule]
        ok = [r for r in fired if r[0].expected == r[1]]
        out.append(f"| {rule} | {len(fired)} | {len(ok)} |")
    return len(dangerous)


def main(output: Path | None = None) -> Path:
    df_rows, df_rules = run_dose_forms()
    st_rows, st_rules = run_strengths()

    out = [
        "# Dose Form & Strength Alignment — Evaluation",
        "",
        f"Generated {date.today().isoformat()} by `python -m dose_form.evaluate`.",
        "",
        "> **Read the dangerous-error count first.** Coverage and precision are "
        "reported separately and deliberately not combined: an answer this "
        "system declines to give costs a human a lookup, and a wrong "
        "equivalence does not stop there. A system answering 80% of cases at "
        "99% precision is preferred here to one answering 99% at 90%.",
        "",
        "The four-level verdict is evaluated as four levels. "
        "`EQUIVALENT_WITH_CAVEAT` is a distinct correct answer, not a near "
        "miss for either neighbour.",
    ]

    d1 = section("Dose form", df_rows, df_rules, out)
    d2 = section("Strength", st_rows, st_rules, out)

    # R-11 and S-09 are backstops: given the rules above them they cannot be
    # reached, and that is the intent. A backstop that fires means an earlier
    # rule stopped covering its ground, so they are kept and listed apart
    # rather than deleted for tidiness.
    backstops = {"R-11", "S-09"}
    unfired_df = {f"R-{i:02d}" for i in range(1, 12)} - set(df_rules)
    unfired_st = {f"S-{i:02d}" for i in range(0, 12)} - set(st_rules)
    unfired = (unfired_df | unfired_st) - backstops
    fired_backstops = backstops & (set(df_rules) | set(st_rules))

    out.append("\n## Rule coverage\n")
    if unfired:
        out.append("A rule with no case behind it is either dead or untested. "
                   "Each of these needs a case added or the rule removed.\n")
        for r in sorted(unfired):
            out.append(f"- `{r}`")
    else:
        out.append("Every rule fired at least once, except the backstops below.")
    out.append("")
    out.append("**Backstops** (`R-11`, `S-09`): unreachable given the rules "
               "above them, and kept deliberately. One of them firing would "
               "mean an earlier rule had stopped covering its ground, so they "
               "are a signal, not dead code.")
    if fired_backstops:
        out.append("")
        out.append(f"> A backstop fired this run: {sorted(fired_backstops)}. "
                   "Something above it stopped matching — investigate before "
                   "trusting the rest of this report.")

    out.append("\n## Regression cases\n")
    out.append("The three end-to-end failures this module was built for.\n")
    out.append("| case | expected | got | rule | correct |")
    out.append("|---|---|---|---|:-:|")
    for case, got, rule, _d in df_rows + st_rows:
        if case.group != "regression":
            continue
        left = getattr(case, "left")
        right = getattr(case, "right")
        ok = "yes" if case.expected == got else "**NO**"
        out.append(f"| `{left}` vs `{right}` | {SHORT[case.expected]} | "
                   f"{SHORT[got]} | {rule} | {ok} |")

    path = Path(output or Path(__file__).resolve().parent / "EVALUATION.md")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {path}")
    print(f"  dose form: {len(df_rows)} cases, {d1} dangerous")
    print(f"  strength:  {len(st_rows)} cases, {d2} dangerous")
    return path


if __name__ == "__main__":
    main()
