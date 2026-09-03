# Dose Form & Strength Alignment — Evaluation

Generated 2026-09-03 by `python -m dose_form.evaluate`.

> **Read the dangerous-error count first.** Coverage and precision are reported separately and deliberately not combined: an answer this system declines to give costs a human a lookup, and a wrong equivalence does not stop there. A system answering 80% of cases at 99% precision is preferred here to one answering 99% at 90%.

The four-level verdict is evaluated as four levels. `EQUIVALENT_WITH_CAVEAT` is a distinct correct answer, not a near miss for either neighbour.

## Dose form

- cases: **73**
- coverage (answered, not UNKNOWN): **66/73 = 90.4%**
- precision on answered: **66/66 = 100.0%**
- exact match over all four levels: 73/73 = 100.0%
- **dangerous errors (expected NOT_EQUIVALENT, got EQUIVALENT): 0**

| expected \ got | EQ | CAV | NEQ | UNK |
|---|---:|---:|---:|---:|
| EQ | **27** | · | · | · |
| CAV | · | **10** | · | · |
| NEQ | · | · | **29** | · |
| UNK | · | · | · | **7** |

### By group

| group | n | coverage | precision on answered | dangerous |
|---|---:|---:|---:|---:|
| basic | 12 | 100% | 100% | 0 |
| carrier | 6 | 100% | 100% | 0 |
| method | 4 | 100% | 100% | 0 |
| moiety | 6 | 100% | 100% | 0 |
| regression | 3 | 100% | 100% | 0 |
| release | 15 | 100% | 100% | 0 |
| site | 8 | 100% | 100% | 0 |
| symmetry | 8 | 75% | 100% | 0 |
| transformation | 5 | 100% | 100% | 0 |
| unknown | 6 | 17% | 100% | 0 |

### Rule firing counts

| rule | fired | correct |
|---|---:|---:|
| R-01 | 5 | 5 |
| R-02 | 5 | 5 |
| R-03 | 11 | 11 |
| R-04 | 2 | 2 |
| R-05 | 5 | 5 |
| R-06 | 7 | 7 |
| R-07 | 6 | 6 |
| R-08 | 3 | 3 |
| R-09 | 2 | 2 |
| R-10 | 27 | 27 |

## Strength

- cases: **40**
- coverage (answered, not UNKNOWN): **32/40 = 80.0%**
- precision on answered: **32/32 = 100.0%**
- exact match over all four levels: 40/40 = 100.0%
- **dangerous errors (expected NOT_EQUIVALENT, got EQUIVALENT): 0**

| expected \ got | EQ | CAV | NEQ | UNK |
|---|---:|---:|---:|---:|
| EQ | **18** | · | · | · |
| CAV | · | **3** | · | · |
| NEQ | · | · | **11** | · |
| UNK | · | · | · | **8** |

### By group

| group | n | coverage | precision on answered | dangerous |
|---|---:|---:|---:|---:|
| combination | 4 | 100% | 100% | 0 |
| concentration | 6 | 100% | 100% | 0 |
| per_unit | 2 | 100% | 100% | 0 |
| percent | 3 | 67% | 100% | 0 |
| ratio | 3 | 67% | 100% | 0 |
| regression | 1 | 100% | 100% | 0 |
| salt | 4 | 50% | 100% | 0 |
| symmetry | 6 | 83% | 100% | 0 |
| units | 8 | 100% | 100% | 0 |
| unknown | 3 | 0% | 0% | 0 |

### Rule firing counts

| rule | fired | correct |
|---|---:|---:|
| S-00 | 4 | 4 |
| S-01 | 2 | 2 |
| S-02 | 1 | 1 |
| S-03 | 1 | 1 |
| S-04 | 6 | 6 |
| S-05 | 1 | 1 |
| S-06 | 18 | 18 |
| S-07 | 3 | 3 |
| S-08 | 1 | 1 |
| S-10 | 1 | 1 |
| S-11 | 2 | 2 |

## Rule coverage

Every rule fired at least once, except the backstops below.

**Backstops** (`R-11`, `S-09`): unreachable given the rules above them, and kept deliberately. One of them firing would mean an earlier rule had stopped covering its ground, so they are a signal, not dead code.

## Regression cases

The three end-to-end failures this module was built for.

| case | expected | got | rule | correct |
|---|---|---|---|:-:|
| `TABLET, DELAYED RELEASE;ORAL` vs `TABLET;ORAL` | NEQ | NEQ | R-03 | yes |
| `INJECTABLE, LIPOSOMAL;INJECTION` vs `INJECTABLE;INJECTION` | NEQ | NEQ | R-06 | yes |
| `TABLET, FOR SUSPENSION;ORAL` vs `TABLET;ORAL` | CAV | CAV | R-05 | yes |
| `50MG/25ML (2MG/ML)` vs `20MG/10ML (2MG/ML)` | NEQ | NEQ | S-04 | yes |
