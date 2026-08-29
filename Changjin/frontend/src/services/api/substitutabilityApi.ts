import type {
  EquivalenceGroup,
  PricedMember,
  SubstitutabilityData,
  SubstitutabilityMeta,
} from '../../types/api';

/**
 * Static substitutability + price data, precomputed from the FDA Orange Book
 * and CMS NADAC.
 *
 * The deployed site is static GitHub Pages, so nothing here talks to a
 * backend. It deliberately does not call rxnav.nlm.nih.gov either: that API
 * sends no CORS headers for this use, it is rate-limited, and depending on it
 * at runtime would make the page fail whenever NLM is down. The dependency
 * belongs at build time, and that is where the export puts it.
 */

// --- wire format -----------------------------------------------------------
// Short keys are an payload optimisation and must not leak past this module.
interface WireMember {
  a: string; t: string; m: string; te: string;
  b: 0 | 1; p: number | null; u: string | null;
}
interface WireGroup {
  i: string; df: string; r: string; s: string;
  n: number; sv: number | null; mem: WireMember[];
}
interface WirePayload {
  meta: {
    orange_book: string; nadac_week: string; openfda_ndc: string;
    generated: string; price_basis: string;
    coverage: { groups: number; with_savings: number; members: number };
  };
  groups: WireGroup[];
  name_index: Record<string, number[]>;
}

const expandMember = (m: WireMember): PricedMember => ({
  applicationNumber: m.a,
  tradeName: m.t,
  applicant: m.m,
  teCode: m.te,
  isBrand: m.b === 1,
  pricePerUnit: m.p,
  pricingUnit: m.u,
});

const expandGroup = (g: WireGroup): EquivalenceGroup => ({
  ingredient: g.i,
  dosageForm: g.df,
  route: g.r,
  strength: g.s,
  memberCount: g.n,
  savingPercent: g.sv,
  members: g.mem.map(expandMember),
});

const expandMeta = (m: WirePayload['meta']): SubstitutabilityMeta => ({
  orangeBook: m.orange_book,
  nadacWeek: m.nadac_week,
  openFdaNdc: m.openfda_ndc,
  generated: m.generated,
  priceBasis: m.price_basis,
  coverage: {
    groups: m.coverage.groups,
    withSavings: m.coverage.with_savings,
    members: m.coverage.members,
  },
});

// --- loading ---------------------------------------------------------------
let cache: SubstitutabilityData | null = null;
let inFlight: Promise<SubstitutabilityData> | null = null;

// Vite injects import.meta.env at build time; under Jest it is undefined, so
// fall back to the site root rather than throwing on a property of undefined.
const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

const dataUrl = (): string => `${baseUrl()}data/substitutability.json`;

export const loadSubstitutability = async (): Promise<SubstitutabilityData> => {
  if (cache) return cache;
  // Several compound cards can mount at once; share one request between them.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await fetch(dataUrl());
    if (!response.ok) {
      throw new Error(`Could not load substitutability data (${response.status})`);
    }
    const wire = (await response.json()) as WirePayload;
    cache = {
      meta: expandMeta(wire.meta),
      groups: wire.groups.map(expandGroup),
      nameIndex: wire.name_index,
    };
    return cache;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

/** Exposed for tests; resets the module-level cache. */
export const __resetSubstitutabilityCache = (): void => {
  cache = null;
  inFlight = null;
};

/**
 * Orange Book ingredient names carry the salt ("ATORVASTATIN CALCIUM") while a
 * ChEMBL preferred name usually does not ("ATORVASTATIN"). The export indexes
 * both spellings, so an exact lookup on the upper-cased name finds either.
 */
export const lookupGroups = (
  data: SubstitutabilityData,
  prefName: string | null | undefined,
): EquivalenceGroup[] => {
  if (!prefName) return [];
  const key = prefName.trim().toUpperCase().replace(/\s+/g, ' ');
  const indices = data.nameIndex[key];
  if (!indices) return [];
  return indices.map(i => data.groups[i]).filter(Boolean);
};
