# Price Sanity Check — originator vs AB-rated generic

Generated 2026-08-29 by `python price_compare.py sanity`.

> **NADAC is a pharmacy ACQUISITION cost, not a patient price.**
> NADAC is the average price pharmacies PAY to acquire a drug (a CMS survey of invoice costs). It is NOT the patient's out-of-pocket cost, NOT an insurance copay, and NOT a reimbursement rate. Actual patient cost depends on insurance design, deductibles, rebates and dispensing fees, none of which appear in this data.

## What this checks

Twenty-plus well-known brands are priced against the cheapest generic FDA has rated therapeutically equivalent to them (grade **A**). The only automated assertion is directional — a brand must not be cheaper than its own AB-rated generic. The numbers are printed so a reader who knows the US market can judge plausibility directly.

**23 pass · 0 flagged · 0 without price data · 23 total.**

## Results

| Verdict | Brand | Generic molecule | Brand $/unit | Generic $/unit | Saving | Group | Priced |
|---|---|---|---:|---:|---:|---:|---:|
| PASS | Viagra 50 MG | sildenafil | 84.5695 | 0.1058 | 99.9% | 17 | 12 |
| PASS | Ambien 5 MG | zolpidem | 20.6203 | 0.0343 | 99.8% | 6 | 6 |
| PASS | Lipitor 40 MG | atorvastatin | 19.1138 | 0.0370 | 99.8% | 25 | 18 |
| PASS | Lamictal 25 MG | lamotrigine | 12.8173 | 0.0271 | 99.8% | 29 | 22 |
| PASS | Zoloft 50 MG | sertraline | 14.9220 | 0.0345 | 99.8% | 13 | 8 |
| PASS | Lexapro 5 MG | escitalopram | 14.7432 | 0.0419 | 99.7% | 14 | 9 |
| PASS | Crestor 5 MG | rosuvastatin | 8.8113 | 0.0333 | 99.6% | 20 | 14 |
| PASS | Lyrica 25 MG | pregabalin | 9.6834 | 0.0406 | 99.6% | 22 | 14 |
| PASS | Singulair 10 MG | montelukast | 9.2124 | 0.0415 | 99.5% | 17 | 9 |
| PASS | Neurontin 600 MG | gabapentin | 14.0840 | 0.0638 | 99.5% | 14 | 12 |
| PASS | Zyprexa 5 MG | olanzapine | 16.6230 | 0.0867 | 99.5% | 27 | 14 |
| PASS | Abilify 5 MG | aripiprazole | 18.7122 | 0.1041 | 99.4% | 15 | 12 |
| PASS | Plavix 75 MG | clopidogrel | 8.2243 | 0.0470 | 99.4% | 17 | 11 |
| PASS | Imitrex 100 MG | sumatriptan | 72.4045 | 0.4309 | 99.4% | 9 | 5 |
| PASS | Seroquel 25 MG | quetiapine | 3.7108 | 0.0229 | 99.4% | 13 | 9 |
| PASS | Cozaar 25 MG | losartan | 3.3500 | 0.0212 | 99.4% | 18 | 13 |
| PASS | Fosamax 70 MG | alendronate | 38.7041 | 0.2579 | 99.3% | 7 | 3 |
| PASS | Diovan 80 MG | valsartan | 9.3334 | 0.0891 | 99.0% | 17 | 12 |
| PASS | Celebrex 50 MG | celecoxib | 4.4540 | 0.0883 | 98.0% | 18 | 12 |
| PASS | Concerta 18 MG ER | methylphenidate ER | 12.3294 | 0.5758 | 95.3% | 8 | 4 |
| PASS | Aricept 23 MG | donepezil | 14.3864 | 0.7291 | 94.9% | 6 | 5 |
| PASS | Synthroid 0.3 MG | levothyroxine | 1.6563 | 0.0999 | 94.0% | 10 | 6 |
| PASS | Nexium 5 MG susp. | esomeprazole | 9.1596 | 5.4665 | 40.3% | 4 | 4 |

## Distribution of savings

| Statistic | Value |
|---|---:|
| pairs with both prices | 23 |
| median saving | 99.4% |
| minimum saving | 40.3% |
| maximum saving | 99.9% |

A spread rather than a constant is the point: the low end (40.3%) and the high end (99.9%) both come from the same code path, which is evidence the pipeline is reading per-product prices rather than emitting a fixed ratio.

## Macro cross-check: Medicare Part D

NADAC (what pharmacies pay) and Part D (what Medicare and its beneficiaries spent per dosage unit) are collected by different programmes from different populations. Agreement between them is genuine corroboration; the *disagreement* is just as informative.

| Drug | NADAC $/unit | Part D $/unit | Part D ÷ NADAC |
|---|---:|---:|---:|
| Lipitor 40 MG (brand) | 19.1138 | 15.7092 | 0.82× |
| Viagra 50 MG (brand) | 84.5695 | 82.0953 | 0.97× |
| Zoloft 50 MG (brand) | 14.9220 | 13.8124 | 0.93× |
| Ambien 5 MG (brand) | 20.6203 | 20.6822 | 1.00× |
| Lamictal 25 MG (brand) | 12.8173 | 11.4257 | 0.89× |
| Lexapro 5 MG (brand) | 14.7432 | 14.0436 | 0.95× |
| Crestor 5 MG (brand) | 8.8113 | 8.7928 | 1.00× |
| Zyprexa 5 MG (brand) | 16.6230 | 29.0272 | 1.75× |
| Lyrica 25 MG (brand) | 9.6834 | 9.6691 | 1.00× |
| Neurontin 600 MG (brand) | 14.0840 | 8.8755 | 0.63× |
| Singulair 10 MG (brand) | 9.2124 | 8.3437 | 0.91× |
| Abilify 5 MG (brand) | 18.7122 | 22.5266 | 1.20× |
| Plavix 75 MG (brand) | 8.2243 | 7.8697 | 0.96× |
| Imitrex 100 MG (brand) | 72.4045 | 169.5642 | 2.34× |
| Seroquel 25 MG (brand) | 3.7108 | 10.2772 | 2.77× |
| Cozaar 25 MG (brand) | 3.3500 | 4.5280 | 1.35× |
| Fosamax 70 MG (brand) | 38.7041 | 34.2201 | 0.88× |
| Diovan 80 MG (brand) | 9.3334 | 9.7221 | 1.04× |
| Celebrex 50 MG (brand) | 4.4540 | 14.3882 | 3.23× |
| Synthroid 0.3 MG (brand) | 1.6563 | 0.9878 | 0.60× |
| Concerta 18 MG ER (brand) | 12.3294 | 13.5338 | 1.10× |
| Aricept 23 MG (brand) | 14.3864 | 15.6749 | 1.09× |
| Nexium 5 MG susp. (brand) | 9.1596 | 8.8478 | 0.97× |
| atorvastatin (generic) | 0.0370 | 0.1463 | 3.95× |
| sildenafil (generic) | 0.1058 | 1.5634 | 14.78× |
| zolpidem (generic) | 0.0343 | 0.1790 | 5.22× |
| lamotrigine (generic) | 0.0271 | 0.1711 | 6.33× |
| escitalopram (generic) | 0.0419 | 0.1926 | 4.60× |
| rosuvastatin (generic) | 0.0333 | 0.1877 | 5.64× |
| olanzapine (generic) | 0.0867 | 0.6689 | 7.71× |
| pregabalin (generic) | 0.0406 | 0.3073 | 7.58× |

**Brands: median Part D ÷ NADAC = 1.00×.** Two independent federal sources landing this close is the strongest available evidence that the brand prices are being read correctly.

**Generics: median Part D ÷ NADAC = 5.22×.** This divergence is not an error, and it is the single most important caveat in this report. A dispensing fee and pharmacy margin are roughly fixed per prescription, so against a four-cent acquisition cost they dominate completely. 

> A 99% saving in NADAC acquisition cost therefore does **not** become a 99% saving for a patient or a payer. Part D shows the realised per-unit cost of a cheap generic running about 5× its acquisition cost.

## How to verify a row by hand

1. `python price_compare.py compare <rxcui>` prints every group member, its application number and its NADAC price.
2. `python substitutability.py judge <rxcui_a> <rxcui_b>` shows why two of them are grade A, citing the Orange Book `TE_Code` field.
3. Look the price up at <https://data.medicaid.gov/dataset/dfa2ab14-06c2-457a-9e36-5cb6d80f8d93> using the NDC printed by step 1.

## Known limitations

1. **Acquisition cost only.** NADAC excludes rebates, 340B pricing, dispensing fees and every insurance-side adjustment. A 99% acquisition-cost saving does not translate into a 99% saving for a specific patient.
2. **Brand baseline selection.** The originator is the Orange Book reference-listed drug where one is flagged, otherwise the highest-priced NADAC brand-classified product in the group. Regulatory status alone is not used: LEVO-T holds its own NDA but is priced as a generic, so keying on `Appl_Type = N` would pick it as the Synthroid baseline and report a 0% saving.
3. **Strength-matched, not course-matched.** Prices compare like strengths. A true cost-per-course would need dosing frequency and duration, which are not in NADAC or the Orange Book.
4. **Single point in time.** NADAC is a weekly survey; the prices here are the most recent row per NDC at build time.
5. **Part D comparison is name-matched, not NDC-matched.** Part D reports by brand and generic name aggregated over all strengths, so the ratio is a magnitude check, not a like-for-like price.
