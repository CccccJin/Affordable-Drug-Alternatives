/* ---------------------------------------------------------------------------
   Research data
   Every figure below is extracted directly from the project README
   ("Affordable Drug Alternatives: A Comparative Analysis"). Where the README
   publishes a cost RANGE, we keep the exact low/high bounds and derive a
   midpoint for charting; charts state that they use midpoints of published
   ranges. No numbers are invented.
--------------------------------------------------------------------------- */

export type CostBasis = 'annual' | 'course';

export interface CostComparison {
  /** Short therapy-area label for chart axes */
  area: string;
  /** Full condition name */
  condition: string;
  originator: { name: string; low: number; high: number };
  alternative: { name: string; low: number; high: number };
  basis: CostBasis;
  /** Region the headline figures refer to */
  region: string;
}

const mid = (low: number, high: number) => (low + high) / 2;

/** Midpoint originator cost for a comparison */
export const originatorMid = (c: CostComparison) => mid(c.originator.low, c.originator.high);
/** Midpoint alternative cost for a comparison */
export const alternativeMid = (c: CostComparison) => mid(c.alternative.low, c.alternative.high);
/** Cost reduction (%) based on midpoints, rounded to a whole number */
export const savingsPct = (c: CostComparison) =>
  Math.round((1 - alternativeMid(c) / originatorMid(c)) * 100);

/**
 * Head-to-head cost comparisons. All USD, sourced from README tables.
 * Ranges expressed as "~$X – $Y" in the README are captured as low/high.
 */
export const COST_COMPARISONS: CostComparison[] = [
  {
    area: 'Depression (TRD)',
    condition: 'Treatment-Resistant Depression',
    originator: { name: 'Esketamine (Spravato®)', low: 20000, high: 30000 },
    alternative: { name: 'Ketamine (IV infusion)', low: 5600, high: 16000 },
    basis: 'annual',
    region: 'United States',
  },
  {
    area: 'Multiple Sclerosis',
    condition: 'Relapsing-Remitting MS',
    originator: { name: 'Ocrelizumab (Ocrevus®)', low: 69949, high: 69949 },
    alternative: { name: 'Rituximab (biosimilar)', low: 11759, high: 11759 },
    basis: 'annual',
    region: 'US (Medicare, ASP)',
  },
  {
    area: "Cushing's Disease",
    condition: "Cushing's Disease (hyperglycemia)",
    originator: { name: 'Korlym® (mifepristone)', low: 200000, high: 500000 },
    alternative: { name: 'Generic mifepristone', low: 3000, high: 10000 },
    basis: 'annual',
    region: 'United States',
  },
  {
    area: 'Cystinosis',
    condition: 'Nephropathic Cystinosis',
    originator: { name: 'Procysbi® (cysteamine DR)', low: 300000, high: 900000 },
    alternative: { name: 'Cystagon® (cysteamine IR)', low: 50000, high: 150000 },
    basis: 'annual',
    region: 'United States',
  },
  {
    area: 'Urea Cycle Disorders',
    condition: 'Urea Cycle Disorders',
    originator: { name: 'Ravicti® (glycerol PB)', low: 500000, high: 800000 },
    alternative: { name: 'Sodium phenylbutyrate', low: 100000, high: 250000 },
    basis: 'annual',
    region: 'United States',
  },
  {
    area: 'NSCLC',
    condition: 'Non-Small Cell Lung Cancer',
    originator: { name: 'Pembrolizumab (standard 400mg)', low: 191000, high: 205000 },
    alternative: { name: 'Pembrolizumab (low-dose 200mg)', low: 95500, high: 102500 },
    basis: 'annual',
    region: 'United States',
  },
  {
    area: 'COVID-19',
    condition: 'Mild-to-moderate COVID-19',
    originator: { name: 'Molnupiravir (Lagevrio®)', low: 700, high: 700 },
    alternative: { name: 'Fluvoxamine (generic)', low: 10, high: 30 },
    basis: 'course',
    region: 'United States',
  },
  {
    area: 'MS / Rheumatic flare',
    condition: 'MS & rheumatic disorder flares',
    originator: { name: 'H.P. Acthar® Gel (ACTH)', low: 45000, high: 200000 },
    alternative: { name: 'Generic corticosteroids', low: 500, high: 2000 },
    basis: 'course',
    region: 'United States',
  },
  {
    area: 'Blood Cancers',
    condition: 'CAR-T for blood cancers',
    originator: { name: 'Standard CAR-T (Kymriah®/Yescarta®)', low: 370000, high: 530000 },
    alternative: { name: 'In-house CAR-T (NexCAR19, India)', low: 30000, high: 40000 },
    basis: 'course',
    region: 'US vs. India',
  },
];

/* --------------------------------------------------------------------------
   Regional price variation (README multi-region tables)
-------------------------------------------------------------------------- */

export interface RegionalSeries {
  key: string;
  label: string;
  basis: string;
  originatorLabel: string;
  alternativeLabel: string;
  rows: { region: string; originator: number; alternative: number }[];
}

export const REGIONAL_SERIES: RegionalSeries[] = [
  {
    key: 'ms',
    label: 'Ocrelizumab vs. Rituximab',
    basis: 'Annual cost (USD)',
    originatorLabel: 'Ocrelizumab',
    alternativeLabel: 'Rituximab biosimilar',
    rows: [
      { region: 'US (Medicare)', originator: 69949, alternative: 11759 },
      { region: 'US (Medicaid net)', originator: 47671, alternative: 5893 },
      { region: 'Sweden', originator: 12400, alternative: 2400 },
      { region: 'United Kingdom', originator: 12700, alternative: 3500 },
    ],
  },
  {
    key: 'pembro',
    label: 'Pembrolizumab: standard vs. low-dose',
    basis: 'Annual cost (USD)',
    originatorLabel: 'Standard dose (400 mg)',
    alternativeLabel: 'Low dose (200 mg)',
    rows: [
      { region: 'United States', originator: 198000, alternative: 99000 },
      { region: 'United Kingdom', originator: 115000, alternative: 57500 },
      { region: 'Canada', originator: 112000, alternative: 56000 },
      { region: 'Germany', originator: 89000, alternative: 44500 },
      { region: 'Japan', originator: 44000, alternative: 22000 },
    ],
  },
];

/* --------------------------------------------------------------------------
   Derived headline metrics for the Key Findings panel
-------------------------------------------------------------------------- */

const savingsValues = COST_COMPARISONS.map(savingsPct);

export const HEADLINE = {
  areas: COST_COMPARISONS.length,
  avgSavings: Math.round(savingsValues.reduce((a, b) => a + b, 0) / savingsValues.length),
  maxSavings: Math.max(...savingsValues),
  maxSavingsArea: COST_COMPARISONS[savingsValues.indexOf(Math.max(...savingsValues))].area,
  /** Full ChEMBL 35 export record count (Changjin/frontend/public/data metadata) */
  compounds: 42231,
};

/* --------------------------------------------------------------------------
   Methodology & data-source trust signals (from Changjin API README + sources)
-------------------------------------------------------------------------- */

export const METHODOLOGY = [
  'RDKit Morgan fingerprints',
  'Tanimoto similarity',
  'ChemBERTa embeddings',
  'Butina clustering',
  'CNS MPO drug-likeness',
  'ChEMBL 35 · DuckDB',
];

export const DATA_SOURCES = [
  'OECD Mental Health',
  'WHO COVID-19 Dashboard',
  'IARC GLOBOCAN 2022',
  'Atlas of MS',
  'DelveInsight',
  'Amgen / Mallinckrodt filings',
];

/* --------------------------------------------------------------------------
   Formatting helpers
-------------------------------------------------------------------------- */

export const formatUSD = (value: number): string => {
  if (value >= 1000) {
    const k = value / 1000;
    return `$${k >= 100 ? Math.round(k) : k.toFixed(k % 1 === 0 ? 0 : 1)}K`;
  }
  return `$${value}`;
};
