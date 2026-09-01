# Biologic Sanity Check — Purple Book

Generated 2026-09-01 by `python price_compare.py biologic-sanity`.

> **This is not the stratified evaluation the Orange Book path has, and does not stand in for one.** Interchangeability is not a hidden concept to predict: FDA states it in the Purple Book and this module reads it, so there is no held-out label to score against. What is checked here is the plumbing — that every exported grade matches `grade.py`, that rule B5 is flagged wherever it applies, and that no saving compares prices across pricing units.

> **NADAC is what pharmacies pay to acquire a drug. It is not a copay, not a cash price, and not a reimbursement rate.**

## Automated checks

- families exported: **20**
- products: **128**
- families with a computable switch: **7**
- disagreements with `grade.py`: **0**

Every exported grade agrees with `grade.py`, every B5 family is flagged, and every saving compares one pricing unit.

## Priced switches

Each row is the dearest reference product against the cheapest follow-on in the same pricing unit. `Grade` is the *cheapest follow-on's* relationship to the reference — never to the other follow-ons.

| Molecule | Reference | $/unit | Cheapest follow-on | $/unit | Unit | Saving | Grade | B5 applies |
|---|---|---:|---|---:|---|---:|:-:|:-:|
| USTEKINUMAB | Stelara | 29,792.79 | Yesintek | 2,855.57 | ML | 90.4% | A | yes |
| INSULIN GLARGINE | Toujeo | 27.01 | Semglee | 2.90 | ML | 89.3% | A | yes |
| ADALIMUMAB | Humira | 3,366.12 | Simlandi | 478.65 | EA | 85.8% | A | yes |
| DENOSUMAB | Prolia | 1,863.72 | Bildyos | 812.84 | ML | 56.4% | A | yes |
| TOCILIZUMAB | Actemra | 1,279.06 | Tyenne | 821.00 | ML | 35.8% | B | yes |
| EPOETIN ALFA | Epogen/Procrit | 32.27 | Retacrit | 22.52 | ML | 30.2% | B | no |
| INSULIN ASPART | Novolog | 6.94 | Merilog | 6.82 | ML | 1.7% | B | yes |

## What 'B5 applies' means

The family holds more than one 351(k) follow-on. Each is rated against the reference product and against nothing else, so two follow-ons are **not** interchangeable with one another — however interchangeable each is with the reference. `grade.py` returns grade B, rule B5, for any such pair, and the frontend states it beneath the member table.

## What this does not establish

1. **No held-out evaluation.** Every grade is read from the Purple Book, not predicted, so agreement with `grade.py` measures the identifier chain and nothing about clinical equivalence.
2. **Prices are sparse.** CMS surveys retail pharmacy acquisition cost and most biologics are clinician-administered, so only a handful of families have a price on both sides.
3. **Single point in time.** The Purple Book and NADAC both move; the generation date above identifies the extract these figures came from.
