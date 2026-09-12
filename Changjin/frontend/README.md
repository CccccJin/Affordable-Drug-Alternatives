# ChemSearch frontend

React/TypeScript application for structural similarity search and a separate
FDA therapeutic-equivalence lookup. The static product is deployed to
https://cccccjin.github.io/Affordable-Drug-Alternatives/ using GitHub Pages.

## Development

Use Node 20.19+ (or a supported newer Node release).

```sh
npm ci
npm run dev
```

## User flows

- Search defaults to a compound name; SMILES input is also available. Example
  buttons fill the query. Property filters remain available in a disclosure.
- Results show up to 50 matches, paginated 20 at a time. Text filtering, sorting,
  compound details and CSV/JSON export are available. Empty filters can be cleared.
- Analytics summarize the filtered result set, independently of pagination.
  The distribution selector switches between similarity and molecular weight;
  exact bin counts and percentages are available in the chart data disclosure.
  Empty bins stay visible. Missing molecular weights are excluded and counted.
- Chemical space uses MDS of Morgan/Tanimoto distances and Butina clusters.
  Select a point or a keyboard-accessible cluster button to highlight a cluster;
  selecting the same cluster button again clears the selection.
- NADAC cost plots compare products inside FDA equivalence groups, with the
  same logarithmic scale and pricing units shown on each row. Costs are pharmacy
  acquisition costs, not patient prices. Similarity is not substitutability.
- Method explanations and the research overview are available on demand.
  The static product has no AI search backend.

## Data

Search runs in the browser using RDKit and the precomputed ECFP4 corpus in
`public/data/compounds.json` and `fingerprints.bin`. Molecular descriptors are
loaded separately from `descriptors.json` when needed. Existing result snapshots
are enriched after that load so charts do not mistake unloaded values for missing
measurements. FDA/CMS loading and failure states are distinct from zero matches.

The app uses hash routes and relative assets to support GitHub Pages project URLs.
Data production and Python API documentation live in the parent README.

## Validation and deployment

```sh
npm test -- --runInBand
npm run lint
npm run type-check
npm run build
```

The repository's `.github/workflows/deploy.yml` runs frontend tests, lint, type
checks, production build and Python pipeline tests before deploying `dist/`.
Deployment is triggered by a push to `main` or a manual workflow run.

When changing charts or interactions, also verify a real name search, Analytics
property switching, cluster selection, empty-filter recovery, and the phone
layout in light and dark mode. Unit tests cannot validate SVG layout.
