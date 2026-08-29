# Drug Substitutability — Data Coverage Report

Generated 2026-08-29 by `python substitutability.py coverage`.

This report states what the substitutability module can and cannot adjudicate, and why. Percentages that look alarming in isolation are decomposed against the denominator that actually matters.

## 1. Source inventory

| Source | File | Records | Notes |
|---|---|---:|---|
| FDA Orange Book | `products.txt` | 48,664 | marketed + discontinued drug products |
| FDA Orange Book | `patent.txt` | 22,205 | listed patents, used to explain absent generics |
| FDA Orange Book | `exclusivity.txt` | 2,370 | marketing exclusivity periods |
| openFDA NDC Directory | `drug-ndc-0001-of-0001.json` | 137,590 | export 2026-08-28; the RXCUI↔application bridge |
| FDA Purple Book | `purplebook.csv` | 2,242 | licensed biologics |
| RxNorm | RxNav REST API | on demand | local UMLS `.RRF` release used instead when present |
| WHO ATC | via RxNorm `SAB='ATC'` | on demand | level-5 substance codes |

> **RxNorm caveat.** `RXNCONSO.RRF`/`RXNREL.RRF` sit behind a UMLS/UTS login, so the default backend is the public RxNav REST API, which exposes the same concepts, relationships and ATC codes without an account. Dropping a UMLS release into `subst_data/cache/rxnorm/` switches the module to the offline files automatically — no code change.

## 2. Identifier mapping coverage (RXCUI ↔ Application Number ↔ NDC)

The Orange Book carries **no NDC** and openFDA carries **no TE code**, so every verdict has to cross this bridge:

```
RXCUI --(openFDA openfda.rxcui)--> NDC --(application_number)--> ANDA/NDA/BLA
                                                                    |
                                            Orange Book products.txt / Purple Book
```

### 2.1 Where RXCUIs land

| Step | Count | Share | Meaning |
|---|---:|---:|---|
| RXCUIs reachable from openFDA | 16,660 | 100.0% |  |
| …that carry an FDA application number | 13,252 | 79.5% |  |
| …that reach an Orange Book product | 10,961 | 65.8% |  |
| …that reach a Purple Book product | 2,212 | 13.3% |  |
| **mapping failures** (no route to an application) | 3,408 | 20.5% | RXCUI present in openFDA but no route to an FDA application |

**Mapping failure rate: 20.5%** (3,408 of 16,660 RXCUIs).

Those failures are not random — they are product classes that have no FDA application by definition:

| Marketing category of the unmappable NDC | Distinct RXCUIs |
|---|---:|
| OTC MONOGRAPH DRUG | 2,996 |
| UNAPPROVED DRUG OTHER | 573 |
| DRUG FOR FURTHER PROCESSING | 553 |
| OTC MONOGRAPH FINAL | 92 |
| OTC MONOGRAPH NOT FINAL | 70 |
| UNAPPROVED DRUG FOR USE IN DRUG SHORTAGE | 36 |
| UNAPPROVED MEDICAL GAS | 16 |
| EMERGENCY USE AUTHORIZATION | 5 |

OTC monograph drugs, homeopathic and unapproved listings and bulk ingredients are outside the Orange Book by design. A substitutability verdict is not meaningful for them, and the module returns grade **D** with that reason attached rather than guessing.

### 2.2 Where NDC records lose the join

| Failure mode | Count | Share of NDC records |
|---|---:|---:|
| no `application_number` | 74,330 | 54.0% |
| no `openfda.rxcui` | 53,412 | 38.8% |
| `product_ndc` could not be canonicalised | 0 | 0.0% |
| collapsed to an existing 9-digit NDC | 2,426 | 1.8% |

The last row is deduplication, not loss: several package-level listings share one labeler+product code, which is the level the join runs at.

### 2.3 Coverage seen from the Orange Book side

| Orange Book applications | Count | Share |
|---|---:|---:|
| total distinct applications | 27,333 | 100% |
| linked to at least one RXCUI | 11,758 | 43.0% |
| **not** linked to any RXCUI | 15,575 | 57.0% |
| — of which have no marketed (RX) product at all | 13,483 | 86.6% of unlinked |
| — of which do have a marketed product (**genuine gap**) | 2,092 | 13.4% of unlinked |

So the headline 57.0% unlinked is mostly withdrawn products that no longer have an NDC listing. The genuine gap — applications with a marketed product but no RXCUI edge — is **2,092 applications, 7.7% of the Orange Book**.

Purple Book: 448 of 860 BLAs (52.1%) link to at least one RXCUI.

## 3. Therapeutic-equivalence (TE) code coverage

**This is the section the grading depends on.** A grade **A** verdict requires an `AB*` code on both products; without a TE code the best available answer is grade **B**.

Across all **48,664** Orange Book products: **21,933 carry a TE code (45.1%)** and **26,731 do not (54.9%)**.

That raw number overstates the problem. Broken out:

| Marketing status | Application | Has TE | Missing TE | % missing | Expected? |
|---|---|---:|---:|---:|---|
| RX | ANDA | 19,540 | 472 | 2.4% | **No — this is the real gap** |
| RX | NDA | 2,393 | 2,349 | 49.5% | Yes — a single-source brand with no generic gets no TE code |
| DISCN | ANDA | 0 | 17,212 | 100.0% | Yes — FDA does not rate discontinued products |
| DISCN | NDA | 0 | 5,911 | 100.0% | Yes — FDA does not rate discontinued products |
| OTC | ANDA | 0 | 571 | 100.0% | Yes — TE codes apply to prescription products |
| OTC | NDA | 0 | 216 | 100.0% | Yes — TE codes apply to prescription products |

### 3.1 The denominator that matters

A TE code only means anything where more than one applicant markets the same ingredient, dosage form, route and strength. Restricting to those **active multi-source groups**:

| Metric | Value |
|---|---:|
| active (RX) equivalence groups | 6,115 |
| — single-source (no TE code possible) | 2,571 |
| — multi-source (TE code expected) | 3,544 |
| products inside multi-source groups | 22,160 |
| **of those, missing a TE code** | **326** |
| **effective TE coverage** | **98.5%** |

**Headline: 1.5% of products that should carry a TE code are missing one.** The 54.9% figure above is dominated by discontinued and single-source products, for which FDA assigns no rating by design.

### 3.2 TE code distribution

| Code | Products | Grade it drives |
|---|---:|---|
| `AB` | 14,933 | A (rule A1) |
| `AP` | 3,816 | A (rule A2) |
| `AA` | 1,044 | A (rule A2) |
| `AB1` | 723 | A (rule A1) |
| `AT` | 512 | A (rule A2) |
| `AB2` | 423 | A (rule A1) |
| `AB3` | 250 | A (rule A1) |
| `AN` | 128 | A (rule A2) |
| `AB4` | 102 | A (rule A1) |
| `AO` | 72 | A (rule A2) |
| `AP1` | 67 | A (rule A2) |
| `BX` | 52 | B (rule B1) |
| `AT1` | 44 | A (rule A2) |
| `AP2` | 37 | A (rule A2) |

Equivalence-bearing codes: **22,183**; non-equivalence `B*` codes: **61** (0.3% of rated products).

### 3.3 Reference-listed-drug subgroups (the `AB1`/`AB2` trap)

**65** active multi-source groups are split across more than one numbered `AB<n>` subgroup. Within those groups, two `AB`-rated products are **not** interchangeable unless their subgroup codes intersect — `AB1` and `AB2` denote different reference-listed drugs.

Worked examples from the current data:

| Ingredient | Dosage form / route | Strength | Coexisting codes |
|---|---|---|---|
| ALBUTEROL SULFATE | AEROSOL, METERED;INHALATION | EQ 0.09MG BASE/INH | `AB2,AB1,AB3` |
| AMPHETAMINE ASPARTATE; AMPHETAMINE SULFATE;  | CAPSULE, EXTENDED RELEASE;ORAL | 6.25MG;6.25MG;6.25MG;6.25MG | `AB1,AB2` |
| BUPROPION HYDROCHLORIDE | TABLET, EXTENDED RELEASE;ORAL | 150MG | `AB3,AB2,AB1` |

The module compares TE codes by **set intersection**, so these resolve to grade **B** (rule `B3`), not grade A.

## 4. Biologics coverage (Purple Book)

| Licence type | Products | Share | Grade it drives |
|---|---:|---:|---|
| `351(a)` reference biologic | 2,000 | 89.2% | reference side of the comparison |
| `351(k) Biosimilar` | 104 | 4.6% | **B** (rule `B4`) — prescriber required |
| `351(k) Interchangeable` | 138 | 6.2% | **A** (rule `A3`) — pharmacy substitution |

242 products name a reference product, which is what the 351(k) branch matches on. Interchangeability is determined **only against the reference product**: two follow-on biologics of the same reference get grade **B** (rule `B5`) even when each is individually interchangeable.

## 5. End-to-end adjudicability

| Capability | Distinct RXCUIs | Share of mapped |
|---|---:|---:|
| reach an Orange Book product | 10,961 | 65.8% |
| reach a product carrying **any** TE code | 6,263 | 37.6% |
| reach an `AB*`-rated product (grade **A** possible) | 4,526 | 27.2% |
| reach a Purple Book biologic | 2,212 | 13.3% |

An RXCUI outside these sets is not a silent failure: the module returns grade **D** (or **C** when ATC relates the substances) with the specific reason recorded in the evidence chain.

## 6. Price data coverage (CMS NADAC)

> **NADAC is a pharmacy ACQUISITION cost.** It is what pharmacies pay wholesalers, surveyed by CMS. It is not a patient copay, not a cash price and not a reimbursement rate.

Loaded **1,028,250** weekly price rows covering **32,509** distinct NDCs (2025-01-01 to 2026-08-26). The yearly file is an archive of weekly surveys, so only the newest row per NDC is kept.

| Classification | NDCs | Share |
|---|---:|---:|
| `G` — generic | 29,856 | 91.8% |
| `B` — brand | 2,511 | 7.7% |
| `B-ANDA` — brand marketed under an ANDA | 104 | 0.3% |
| `B-BIO` — biologic | 38 | 0.1% |

### 6.1 Join hit rate against the layer-2 NDC mapping

Prices join to the substitutability data through the same 9-digit NDC key the identifier mapping is built on:

| Join step | NDCs | Hit rate |
|---|---:|---:|
| NADAC NDC found in the openFDA NDC directory | 20,316 | 93.7% |
| …and reaching an RXCUI | 20,004 | 92.2% |
| …and reaching an Orange Book product | 18,149 | 83.7% |
| **no match** in openFDA | 1,370 | 6.3% |

**Join hit rate: 93.7%** into the NDC directory and **83.7%** all the way to a therapeutic-equivalence rating (of 21,686 distinct NADAC NDCs).

Read the other way — the direction that limits what can actually be priced:

| Metric | Count | Share |
|---|---:|---:|
| RXCUIs reaching an Orange Book product | 10,961 | 100% |
| …that also carry a NADAC price | 6,026 | 55.0% |
| …with no price | 4,935 | 45.0% |

CMS surveys **retail-pharmacy** acquisition costs, which shapes where the gap falls. Marketed Orange Book products, by route:

| Route | Marketed products | With a NADAC price | Unpriced |
|---|---:|---:|---:|
| Oral | 17,119 | 11,471 (67.0%) | 33.0% |
| Injection | 2,968 | 615 (20.7%) | 79.3% |
| Intravenous | 1,486 | 57 (3.8%) | 96.2% |
| Topical | 864 | 601 (69.6%) | 30.4% |
| Ophthalmic | 400 | 298 (74.5%) | 25.5% |
| Subcutaneous | 349 | 192 (55.0%) | 45.0% |
| Transdermal | 269 | 242 (90.0%) | 10.0% |

Parenteral products are disproportionately missing — they are clinician-administered and largely bypass the retail channel NADAC surveys. But the largest *absolute* unpriced group is oral, which is not explained by route: those are low-volume, recently launched or withdrawn products CMS has not surveyed. Neither case is a join failure; the price genuinely does not exist in NADAC.

### 6.2 Unit normalisation

NADAC prices a *unit*, and the unit varies by product, so raw prices are not comparable across pack sizes or formulations:

| Pricing unit | NDCs | Meaning |
|---|---:|---|
| `EA` | 26,532 | one tablet, capsule, vial or device |
| `ML` | 4,189 | one millilitre of a liquid |
| `GM` | 1,788 | one gram of a cream, gel or ointment |

`price_compare.py` reports **cost per unit** (comparable within a grade-A group, since group membership already fixes strength and dosage form) and **cost per mg of active ingredient** (needed to compare across strengths). Where a strength cannot be expressed in the priced unit — a patch dosed `4.6 mg/24h` has no mg-per-gram meaning — the per-mg figure is `None` rather than a guess.

## 7. Known limitations

1. **ATC level-5 vs level-4.** The brief asked for grade C on *"same ATC level 5, different ingredient"*. A level-5 ATC code names one chemical substance, so two products sharing it differ only as salts, esters or isomers — that case is implemented as rule `C1`. The broader therapeutic-interchange case (atorvastatin vs simvastatin, both `C10AA`) sits one level up and is implemented as rule `C2`. Both are reported separately so neither is conflated with the other.
2. **NDC join granularity.** Products join at the 9-digit labeler+product code. Package-level distinctions are deliberately discarded; they do not affect therapeutic equivalence.
3. **Strength parsing.** Strengths are compared after folding mass units to milligrams. Where either side's strength text cannot be parsed, the verdict is still returned but marked `confidence: medium` with an explicit caveat rather than silently assuming a match.
4. **State law is out of scope.** Grade A reflects the *federal* determination. Actual pharmacy substitution is governed by state statute, which the module does not model.
5. **openFDA `openfda.rxcui` is SPL-derived.** It is a labelling-level annotation, so a listing can name several RXCUIs. Strength is therefore pinned from RxNorm's `SCDC` rather than from the NDC listing wherever RxNorm provides it.

