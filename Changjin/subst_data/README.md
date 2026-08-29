# `subst_data` — data layer for the substitutability module

Supports [`../substitutability.py`](../substitutability.py). Nothing here is
hand-maintained: every file in `cache/` is downloaded from a public FDA or NLM
endpoint and is reproducible with `python substitutability.py fetch`.

## Source provenance

| Source | Endpoint | Auth | Refresh | Used for |
|---|---|---|---|---|
| FDA Orange Book | `fda.gov/media/76860/download` (`EOBZIP_*.zip`) | none | monthly | `TE_Code`, `RLD`/`RS`, ingredient, dosage form, strength → grades **A**/**B** |
| FDA Orange Book | `patent.txt`, `exclusivity.txt` (same zip) | none | monthly | explains *why* no equivalent generic exists, attached to **B**/**D** verdicts |
| openFDA NDC Directory | `download.open.fda.gov/drug/ndc/…json.zip` | none | daily | the only public bridge from an RXCUI to an FDA application number |
| FDA Purple Book | `purplebooksearch.fda.gov/downloads` (newest monthly CSV) | none | monthly | `351(a)` / `351(k) Biosimilar` / `351(k) Interchangeable` → biologic branch |
| RxNorm | RxNav REST API, **or** local UMLS `.RRF` | none / UMLS | weekly | concept normalisation, ingredient (IN/PIN), strength (SCDC), NDCs |
| WHO ATC | ATC codes carried inside RxNorm (`SAB='ATC'`) | none | with RxNorm | level-5 / level-4 classes → grades **C1**/**C2** |
| CMS NADAC | `data.medicaid.gov` newest weekly CSV | none | weekly | pharmacy acquisition cost per unit → the price layer |
| ChEMBL export | `chembl_export.csv` in the repo root | none | static | SMILES + synonyms → structure resolution and the retrieval index |
| Medicare Part D | `data.cms.gov` Spending by Drug | none | annual | independent macro cross-check of NADAC |

### Why the Purple Book "monthly changes" file is the full database

The download page labels each file a *Monthly Historical Data Changes Report*.
It is really two CSV sections: a short changes list, then the **full cumulative
extract** under a second header row. `build_db.py` keys off the *last* header
row, which is why it loads ~2,200 products rather than the ~30 changed ones.

### Why RxNorm has two backends

`RXNCONSO.RRF` / `RXNREL.RRF` require a free UMLS account —
`download.nlm.nih.gov` redirects to a UTS login. To keep the module usable
without one, the default backend is the public RxNav REST API, which exposes
the same concepts, relationships and ATC codes. To switch to the authoritative
offline release:

1. register at <https://uts.nlm.nih.gov/uts/signup-login>
2. download `RxNorm_full_current.zip`
3. unzip `rrf/*.RRF` into `cache/rxnorm/`

`rxnav.get_backend()` then picks the local files up automatically. `RXNSAT.RRF`
is optional; it supplies RxNorm's own NDC list in place of the RxNav lookup.

## Modules

| File | Role |
|---|---|
| `sources.py` | downloads and unpacks the raw sources into `cache/` |
| `ndcutil.py` | canonicalises NDC and application-number spellings — the joins depend on it |
| `rxnav.py` | RxNorm access, either local `.RRF` or the RxNav API, with an sqlite HTTP cache |
| `build_db.py` | parses every source into `cache/substitutability.sqlite` and records mapping-failure counters |
| `grade.py` | the A/B/C/D adjudication rules and the evidence chain |
| `coverage.py` | renders `../COVERAGE_REPORT.md` from the build counters |
| `nadac.py` | NADAC download, newest-price-per-NDC load, and unit normalisation |
| `partd.py` | Medicare Part D loader for the macro cross-check |
| `sanity_check.py` | renders `../PRICE_SANITY_CHECK.md` from 20+ known brand/generic pairs |
| `structures.py` | Orange Book ingredient to SMILES, active-moiety extraction, Morgan fingerprints |
| `ingredient_atc.py` | ingredient to RxNorm `IN` concept to WHO ATC codes |
| `evalset.py` | builds the labelled pair set and freezes the dev/test split |
| `tune.py` | selects the retrieval configuration, reading the **dev** split only |
| `eval_report.py` | renders `../EVALUATION_REPORT.md` |

## `cache/` layout

```
cache/
  orangebook/products.txt patent.txt exclusivity.txt
  openfda/drug-ndc-0001-of-0001.json
  purplebook/purplebook.csv
  nadac/nadac_current.csv      # weekly acquisition costs
  partd/partd_spending.csv     # annual Medicare spending
  rxnorm/                      # optional UMLS RRF release
  rxnav_cache.sqlite           # cached RxNav responses
  substitutability.sqlite      # built database (both layers)
```

`cache/` is gitignored (~470 MB). Rebuild it with:

```bash
python substitutability.py fetch && python substitutability.py build   # layer 2
python price_compare.py     fetch && python price_compare.py     build # layer 3
```

The price layer reads `ndc_product` / `ndc_rxcui` / `ob_product` from the layer-2
build, so run them in that order.

## Why NADAC needs a normalisation step

NADAC publishes a price per *unit*, and the unit differs by product (`EA` a
tablet, `ML` a millilitre, `GM` a gram). Comparing raw prices across products
compares a tablet to a millilitre. `nadac.mg_per_pricing_unit` converts an
openFDA strength string into mg of active ingredient per priced unit, and
returns `None` — never a guess — when the two cannot be reconciled, such as a
transdermal patch dosed `4.6 mg/24h` against a per-gram price.

Two further traps the code handles explicitly:

* **The yearly NADAC file is a weekly archive**, so one NDC appears many times.
  Only the newest effective date per NDC is a current price.
* **Regulatory status is not brand status.** LEVO-T holds its own NDA but is
  priced and marketed as a generic, so selecting the brand baseline by
  `Appl_Type = 'N'` picks it over Synthroid and reports a 0% saving. NADAC's own
  `Classification for Rate Setting` (B/G) is the authority instead.

## Refreshing

The Orange Book and Purple Book publish monthly and openFDA daily. Re-running
`fetch --force` then `build` is the whole update path; nothing is incremental,
so a rebuild is always consistent with one set of source files. Re-run
`coverage` afterwards — the report numbers come from the build counters, not
from a separate pass over the data.


## Evaluation

```bash
python evaluate.py build     # sample the pairs, split by active moiety, freeze
python evaluate.py tune      # choose retrieval config -- reads the DEV split only
python evaluate.py run       # evaluate on TEST, write ../EVALUATION_REPORT.md
```

The split is by **active moiety**, assigned from a hash of the ingredient name,
so an ingredient can never appear on both sides and no pair straddles the
boundary. It is frozen with a manifest SHA-256 before the retrieval index is
built. `tune.py` is a separate entry point precisely so the dev/test boundary is
visible in the shell history.

### Two things the structure layer gets right on purpose

**Active moiety, not the salt.** ChEMBL stores "ATORVASTATIN CALCIUM" as the 2:1
calcium salt (MW 1155 against the parent's 558). Fingerprinting that verbatim
lets counterion bits into the comparison, and metoprolol succinate scores 0.83
against metoprolol tartrate despite sharing an identical active moiety.
`active_moiety()` keeps the largest organic fragment, which restores 1.000.

**Covalent esters are not counterions.** `SALT_WORDS` strips ionic partners, but
`KEPT_ESTERS` deliberately preserves decanoate, cypionate, pivalate and
acetonide. Haloperidol decanoate is a distinct molecular entity with its own
pharmacokinetics, and collapsing it onto haloperidol would assert a chemical
identity that does not hold.
