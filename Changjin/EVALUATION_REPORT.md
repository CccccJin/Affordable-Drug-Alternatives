# Stratified Evaluation — Substitutability Pipeline

Generated 2026-09-01 by `python evaluate.py run`. Reported on the **TEST** split.

## How to read these numbers

> **The adjudicator reads FDA's therapeutic-equivalence codes; it does not predict them.** The labels come from those same codes, so layer-2 metrics do not measure classification skill on a hidden concept. What they measure is the identifier chain — RXCUI to NDC to application number to TE code — together with strength matching and `AB<n>` subgroup logic. A wrong answer here is a plumbing fault, and that is exactly what these strata are built to expose.

The three negative strata are reported separately throughout. Merging them would let the random pairs, which are trivially separable, mask the hard ones that share a therapeutic class.

## 1. Evaluation set

Split by **active moiety** — no ingredient appears on both sides, so no pair can straddle the split. Assignment is a hash of the ingredient name (salt `substitutability-eval-v1`), fixed before the retrieval index was built.

- Test fraction: **70.0%** of ingredients
- Sampling seed: `20260829`
- Tanimoto threshold for the medium tier: **0.7**
- Manifest SHA-256: `d2c89def18eb008d4b658e32cf1f27a4…`

Attrition during construction:

| Cause | Pairs |
|---|---:|
| pairs dropped no strength matched rxcui | 1,152 |
| positive groups dropped no rxcui | 1,436 |
| tanimoto pairs found | 312 |
| cross split pairs dropped | 508 |

## 2. Layer 1 — retrieval (recall@k)

Candidate generation by Morgan/Tanimoto similarity over active moieties. The query is the originator product; a hit means a genuine AB-equivalent reached the candidate list.

Queries evaluated: **294** of 342 positive pairs in the split.

> 48 positives (14.0%) are excluded from layer 1 because their active moiety has no resolved structure — the ChEMBL synonym match covers most Orange Book ingredients but not all, and a retriever cannot rank a molecule it has no fingerprint for. They remain in the layer-2 and end-to-end numbers, which do not depend on structure.

| k | recall@k (any true equivalent) | recall@k (the specific paired product) |
|---:|---:|---:|
| 10 | **77.9%** | 36.7% |
| 50 | **98.0%** | 84.7% |
| 100 | **99.0%** | 97.3% |

- Median rank of the first true equivalent: **3**
- Median number of marketed products sharing the query's active moiety: **34.0** (max 204)

> **What limits this number.** A structure-only retriever scores every product of the same active moiety *identically* — Tanimoto 1.0 — because fingerprints cannot see strength or dosage form. AB equivalence requires matching strength, so the retriever cannot rank the right product above the wrong strength of the same drug; ordering inside that tie is arbitrary. The 'any true equivalent' column is therefore the operationally meaningful one: the downstream adjudicator filters the tie group, and it only needs one genuine equivalent to survive into the candidate list.

## 3. Layer 2 — adjudication, by negative difficulty

Positives: **342** pairs, **342** graded A (recall **100.0%**), 0 missed.

Grade distribution on positives: `A` 342

Precision is computed against **one stratum at a time**, holding the same positive set:

| Negative stratum | Definition | n | False positives | Specificity | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| **Hard** | same WHO ATC level-4 subgroup, different active ingredient | 230 | 0 | 100.0% | 1.000 | 1.000 | 1.000 |
| **Medium** | Morgan/Tanimoto >= 0.70, not therapeutically equivalent | 36 | 0 | 100.0% | 1.000 | 1.000 | 1.000 |
| **Easy** | random pairing | 223 | 0 | 100.0% | 1.000 | 1.000 | 1.000 |

- **Hard** grade distribution: `B` 8, `C` 219, `D` 3
- **Medium** grade distribution: `B` 8, `C` 18, `D` 10
- **Easy** grade distribution: `D` 223

### What the medium tier actually contains

A similarity threshold is only as meaningful as the pairs it admits:

| Tanimoto band | Pairs |
|---|---:|
| identical moiety (1.00) | 10 |
| 0.90-0.99 | 0 |
| 0.80-0.89 | 11 |
| 0.70-0.79 | 15 |

The 10 pairs at 1.00 are the hardest negatives available: an identical active moiety in a different salt or ester form, which no fingerprint can separate. Examples:

- `1.000` HALOPERIDOL vs HALOPERIDOL LACTATE
- `1.000` PROCHLORPERAZINE vs PROCHLORPERAZINE MALEATE
- `1.000` PROCHLORPERAZINE EDISYLATE vs PROCHLORPERAZINE MALEATE
- `1.000` ACALABRUTINIB vs ACALABRUTINIB MALEATE
- `1.000` LEVOMILNACIPRAN HYDROCHLORIDE vs MILNACIPRAN HYDROCHLORIDE

## 4. End-to-end — top-1 recommendation

Given an originator, the pipeline retrieves candidates, filters them with the adjudicator's own `a_grade_group` (the same call `price_compare` makes, not the ground-truth function), ranks by NADAC unit price, and returns the cheapest. A recommendation counts as correct only if the Orange Book independently rates it AB-equivalent to the query.

| Metric | Value |
|---|---:|
| Originators evaluated | 293 |
| Top-1 is a true AB-equivalent | 290 |
| **Top-1 accuracy** | **99.0%** |
| No recommendation returned | 0 |

Failures, for inspection:

| Query | Query strength | Top-1 returned | Top-1 strength |
|---|---|---|---|
| AFINITOR DISPERZ | 5MG | EVEROLIMUS | 5MG |
| DOXIL (LIPOSOMAL) | 50MG/25ML (2MG/ML) | DOXORUBICIN HYDROCHLORIDE (LIPOSOMAL) | 20MG/10ML (2MG/ML) |
| AZULFIDINE EN-TABS | 500MG | SULFASALAZINE | 500MG |

<details><summary>Sample recommendations</summary>

| Query | Top-1 | Correct |
|---|---|---|
| RELPAX | ELETRIPTAN HYDROBROMIDE | yes |
| BYSTOLIC | NEBIVOLOL HYDROCHLORIDE | yes |
| COREG | CARVEDILOL | yes |
| REGLAN | METOCLOPRAMIDE HYDROCHLORIDE | yes |
| AFINITOR DISPERZ | EVEROLIMUS | yes |
| ARAVA | LEFLUNOMIDE | yes |
| LATUDA | LURASIDONE HYDROCHLORIDE | yes |
| NEURONTIN | GABAPENTIN | yes |
| COREG CR | CARVEDILOL PHOSPHATE | yes |
| CARDIZEM CD | CARTIA XT | yes |
| LEXAPRO | ESCITALOPRAM OXALATE | yes |
| FOSAMAX | ALENDRONATE SODIUM | yes |

</details>

## 5. What this evaluation does not establish

1. **Not a prediction task.** Ground truth and the adjudicator both derive from Orange Book TE codes. High layer-2 scores mean the identifier chain resolves correctly, not that the system discovered equivalence.
2. **Positives are restricted to mappable pairs.** A pair is only usable when both products reach an RXCUI, so products outside the mapping are absent from the numerator and the denominator alike. Section 1 reports that attrition.
3. **The dose-form filter is coarser than the Orange Book's own field.** Dosage form is pinned from RxNorm's `DF` relation, which separates a capsule from an orally disintegrating tablet but not `TABLET, FOR SUSPENSION` from `TABLET`, nor an enteric-coated `EN-TABS` from a plain tablet — RxNorm calls both of those 'Oral Tablet'. Every residual end-to-end miss is this one category. Closing it needs a mapping from RxNorm dose forms onto Orange Book dosage-form strings, which does not exist in either source.
4. **Retrieval is structure-only.** No strength or dosage-form signal is available to it, which caps recall@10 whenever a molecule has many marketed products. That is a property of the retriever, not a bug.
5. **The medium tier depends on a similarity threshold.** Tanimoto >= 0.70 on Morgan radius-2 fingerprints; a different radius or threshold would change the tier's membership and therefore its difficulty.
6. **Single point in time.** Orange Book, NDC directory and NADAC all move; the manifest hash identifies the exact pair set these numbers came from.
