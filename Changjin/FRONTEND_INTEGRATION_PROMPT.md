# Task: surface the substitutability + price layers in the frontend

## Context

Repo root: `prj.internship_202507/`. Frontend lives in `Changjin/frontend/`
(React 19 + TypeScript + Vite + MUI v7 + Redux Toolkit + TanStack Query +
Recharts). It deploys to **static GitHub Pages** via
`.github/workflows/` — there is no backend in production.

Three Python layers already exist and are working:

| Layer | Entry point | What it produces |
|---|---|---|
| Substitutability | `Changjin/substitutability.py` | grade A/B/C/D + evidence chain for an RXCUI pair |
| Price | `Changjin/price_compare.py` | grade-A alternatives sorted by NADAC unit price |
| Evaluation | `Changjin/evaluate.py` | stratified metrics, `EVALUATION_REPORT.md` |

They depend on a 504 MB sqlite database, the RxNav REST API and Python RDKit.
**None of that can ship to GitHub Pages.** The resolution is precomputation:
the output is static given one month's Orange Book and one week's NADAC.

Measured feasibility (already verified, do not re-derive):

- 2,381 marketed AB-equivalence groups, 16,080 member products
- 419 of those groups have a computable brand-to-generic saving
- serialised: 1.78 MB raw, **165 KB gzipped** — smaller than the existing
  `public/data/compounds.json` (1.5 MB)

## Deliverable 1 — `Changjin/subst_data/export_frontend.py`

Write `Changjin/frontend/public/data/substitutability.json`.

Follow the conventions already in `subst_data/`: module docstring explaining
*why*, comments only where a reader would otherwise be puzzled, no defensive
try/except around things that cannot fail.

Read from `subst_data/cache/substitutability.sqlite`. Emit:

```jsonc
{
  "meta": {
    "orange_book": "EOBZIP 2026-07",
    "nadac_week": "2026-08-26",
    "generated": "2026-08-29",
    "price_basis": "NADAC is a pharmacy ACQUISITION cost, not a patient price",
    "coverage": { "groups": 2381, "with_savings": 419, "members": 16080 }
  },
  "groups": [
    {
      "i":  "ATORVASTATIN CALCIUM",      // ingredient_key
      "df": "TABLET", "r": "ORAL", "s": "EQ 40MG BASE",
      "n":  25,                           // member count
      "sv": 99.8,                         // saving %, null when no priced brand
      "mem": [
        { "a": "NDA020702", "t": "LIPITOR", "m": "UPJOHN",
          "te": "AB", "b": 1, "p": 19.11383, "u": "EA" }
        // a=appl_no  t=trade_name  m=applicant  te=TE_Code
        // b=1 when NADAC classifies it brand   p=price/unit  u=EA|ML|GM
      ]
    }
  ],
  "name_index": { "ATORVASTATIN": [0, 12, 44] }   // name -> group indices
}
```

Rules:

- Groups are `mkt_type='RX'`, `te_code LIKE 'AB%'`, grouped by
  `(ingredient_key, dosage_form, route, strength_key)`, member count > 1.
- Member price must be **matched to the group's strength**, not merely to the
  application. An NDA covers every strength it was approved for — Lipitor's
  NDA020702 spans 10/20/40/80 mg — so `MIN(price)` across the application
  returns the cheapest strength and quotes the 10 mg price (13.40611) against a
  40 mg group. Parse `ndc_product.active_ingredients` with
  `subst_data.grade.parse_strength` and intersect it with the group's
  `strength_key`, then take the cheapest match.
- `b` comes from NADAC's `classification` being in `BRAND_CLASSES`
  (`subst_data/nadac.py`) — **not** from `appl_type == 'N'`. LEVO-T holds its
  own NDA but is priced as a generic; keying on regulatory status picks it as
  the Synthroid baseline and reports a 0% saving.
- `name_index` keys on both `ingredient_key` and the salt-stripped base moiety
  (`subst_data/structures.base_moiety`), so "ATORVASTATIN" finds
  "ATORVASTATIN CALCIUM".
- Sort members cheapest-first, unpriced last.
- Short JSON keys are deliberate — they are ~35% of the payload.

Wire it into `price_compare.py` as an `export` subcommand so it refreshes on
the same monthly cadence as NADAC.

## Deliverable 2 — types + data hook

In `src/types/api.ts` add `EquivalenceGroup`, `PricedMember`,
`SubstitutabilityData`. Expand the short JSON keys into readable field names at
the parse boundary — the wire format is an optimisation, it should not leak
into components.

New `src/services/api/substitutabilityApi.ts`, modelled exactly on
`mockSearchApi.ts`: module-level cache, `${import.meta.env.BASE_URL}data/…`
URL, one fetch, throw with the status on failure.

New `src/hooks/useSubstitutability.ts` exposing
`useSubstitutability(compound: Compound)`. Look up by `pref_name` through
`name_index`, normalised the way `mockSearchApi.normalize` does. Return a
discriminated union, not a nullable blob:

```ts
type SubstitutabilityResult =
  | { status: 'found';       groups: EquivalenceGroup[] }
  | { status: 'no-coverage'; reason: string }
  | { status: 'loading' }
  | { status: 'error';       message: string };
```

## Deliverable 3 — `src/components/results/SubstitutabilityPanel.tsx`

Renders inside `CompoundDetails.tsx` (an MUI `Dialog`), below the existing
properties table, separated by the `Divider` already in use there.

For each matching group:

1. **Header** — ingredient, dosage form, route, strength.
2. **Grade chip** — `A` for the group itself. Use MUI `Chip`. Do not invent a
   colour scale for B/C/D; only grade A appears in this export.
3. **Member table** — trade name, applicant, TE code, $/unit. Mark the brand
   row. Right-align and tabular-align every number.
4. **Saving line** — brand vs cheapest generic, absolute and percent. Render
   nothing when `sv` is null.
5. **Evidence** — a collapsed MUI `Accordion` showing, per member,
   `products.txt : <appl_no> · TE_Code = <te>`. **This is the point of the
   panel.** A user must be able to open the Orange Book at that application
   number and check the claim by hand. Do not summarise it away.

### Two things that are not optional

**The NADAC disclaimer is structural, not a footnote.** Every rendering of a
price shows: *"NADAC is what pharmacies pay to acquire a drug. It is not a
copay, not a cash price, and not a reimbursement rate."* Medicare Part D data
puts the realised per-unit cost of a cheap generic at ~5× its acquisition cost,
so a 99% acquisition saving does not become a 99% saving for a patient. There
is a test in `tests/test_price_compare.py` enforcing this string in the Python
layer; mirror that intent here.

**Absence is information — show it, do not hide it.** Only 1,020 of the 5,000
demo compounds (20.5%) match an Orange Book ingredient, and only 419 of 2,381
groups have a computable saving. On `status: 'no-coverage'`, render an explicit
message naming the likely reason (not in the Orange Book / a biologic, which
uses the Purple Book / no generic competition), never an empty panel or a
spinner that never resolves.

## Acceptance criteria

- `npm run lint` and `npm run type-check` clean (`--max-warnings 0` is already
  configured).
- Jest tests for: the name lookup incl. the salt-stripped path
  (`"atorvastatin"` → the `ATORVASTATIN CALCIUM` groups); the `no-coverage`
  branch; and the disclaimer being present whenever a price renders.
- Searching **atorvastatin** shows LIPITOR at 19.11383 and a generic at
  0.03704, saving 99.8%.
- Searching a compound with no Orange Book entry shows the no-coverage state.
- Added payload ≤ 200 KB gzipped.
- No network call to `rxnav.nlm.nih.gov` from the browser. It has no CORS
  headers for this use, it is rate-limited, and it would make the page depend
  on an external service's uptime. Precomputation moves that dependency to
  build time, which is where it belongs.

## Out of scope

Live adjudication of arbitrary RXCUI pairs. That needs `main.py` (FastAPI)
actually deployed, and is over-engineering for a static demo. If it is wanted
later, the hook's discriminated union is the seam to swap.
