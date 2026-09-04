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
  n: number; sv: number | null; su: string | null; mem: WireMember[];
}
interface WirePayload {
  meta: {
    orange_book: string; nadac_week: string; openfda_ndc: string;
    generated: string; price_basis: string; cost_basis: string;
    coverage: {
      groups: number; with_savings: number;
      with_acquisition_cost_saving: number; members: number;
    };
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
  acquisitionCost: m.p,
  pricingUnit: m.u,
});

const expandGroup = (g: WireGroup): EquivalenceGroup => ({
  ingredient: g.i,
  dosageForm: g.df,
  route: g.r,
  strength: g.s,
  memberCount: g.n,
  savingPercent: g.sv,
  savingPricingUnit: g.su,
  members: g.mem.map(expandMember),
});

const expandMeta = (m: WirePayload['meta']): SubstitutabilityMeta => ({
  orangeBook: m.orange_book,
  nadacWeek: m.nadac_week,
  openFdaNdc: m.openfda_ndc,
  generated: m.generated,
  priceBasis: m.price_basis,
  costBasis: m.cost_basis,
  coverage: {
    groups: m.coverage.groups,
    withSavings: m.coverage.with_savings,
    withAcquisitionCostSaving: m.coverage.with_acquisition_cost_saving,
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

const indexKey = (name: string): string =>
  name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Orange Book ingredient names carry the salt ("ATORVASTATIN CALCIUM") while a
 * ChEMBL preferred name usually does not ("ATORVASTATIN"). The export indexes
 * both spellings plus every member's trade name ("LIPITOR"), so an exact lookup
 * on the upper-cased name finds any of the three.
 */
export const lookupGroups = (
  data: SubstitutabilityData,
  prefName: string | null | undefined,
): EquivalenceGroup[] => {
  if (!prefName) return [];
  const indices = data.nameIndex[indexKey(prefName)];
  if (!indices) return [];
  return indices.map(i => data.groups[i]).filter(Boolean);
};

/**
 * Index keys containing the query, for a search box where the user is typing.
 *
 * The index is an exact-match map, which is the right shape for looking up a
 * compound's own name but useless to someone half-way through spelling
 * "levothyroxine". Prefix matches rank above interior ones so "atorva" leads
 * with ATORVASTATIN rather than a product that merely contains the substring.
 */
export const suggestNames = (
  data: SubstitutabilityData,
  query: string,
  limit = 8,
): string[] => {
  const key = indexKey(query);
  if (key.length < 2) return [];

  const prefix: string[] = [];
  const interior: string[] = [];
  for (const name of Object.keys(data.nameIndex)) {
    if (name.startsWith(key)) prefix.push(name);
    else if (name.includes(key)) interior.push(name);
    // Stop scanning once both buckets can fill the quota on their own.
    if (prefix.length >= limit) break;
  }

  prefix.sort((a, b) => a.length - b.length || a.localeCompare(b));
  interior.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return [...prefix, ...interior].slice(0, limit);
};

/**
 * The largest brand-to-generic savings in the export, one per ingredient.
 *
 * Gives the search page something true to show before anyone types. Deduped by
 * ingredient because the same drug appears once per strength -- without that,
 * the list is ten rows of atorvastatin and demonstrates nothing about breadth.
 */
export const topSavings = (
  data: SubstitutabilityData,
  limit = 12,
): EquivalenceGroup[] => {
  const best = new Map<string, EquivalenceGroup>();
  for (const group of data.groups) {
    if (group.savingPercent === null) continue;
    const seen = best.get(group.ingredient);
    if (!seen || group.savingPercent > seen.savingPercent!) {
      best.set(group.ingredient, group);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.savingPercent! - a.savingPercent!)
    .slice(0, limit);
};
