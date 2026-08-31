import type {
  BiologicFamily,
  BiologicMember,
  BiologicSaving,
  BiologicsData,
  BiologicsMeta,
} from '../../types/api';

/**
 * Purple Book biologic families, precomputed by `subst_data/export_biologics.py`.
 *
 * A separate file from substitutability.json rather than a section inside it:
 * the biologics payload is 6 KB gzipped against that file's 166 KB, and the
 * pages that need one rarely need the other. Same loading contract otherwise.
 */

// --- wire format -----------------------------------------------------------
interface WireMember {
  b: string; a: string; t: string; m: string; lt: string;
  g: 'reference' | 'A' | 'B';
  r: string; df: string; s: string;
  p: number | null; u: string | null; ref: string | null;
}
interface WireSaving {
  u: string; from: string; fp: number; to: string; tp: number;
  g: 'A' | 'B'; sv: number;
}
interface WireGroup {
  i: string; n: number; sav: WireSaving[]; mem: WireMember[];
}
interface WirePayload {
  meta: {
    purple_book: string; generated: string;
    coverage: { families: number; members: number; with_savings: number };
  };
  groups: WireGroup[];
  name_index: Record<string, number[]>;
}

const expandMember = (m: WireMember): BiologicMember => ({
  blaNumber: m.b,
  applicationNumber: m.a,
  tradeName: m.t,
  applicant: m.m,
  licenseType: m.lt,
  grade: m.g,
  route: m.r,
  dosageForm: m.df,
  strength: m.s,
  pricePerUnit: m.p,
  pricingUnit: m.u,
  referenceProduct: m.ref,
});

const expandSaving = (s: WireSaving): BiologicSaving => ({
  pricingUnit: s.u,
  fromName: s.from,
  fromPrice: s.fp,
  toName: s.to,
  toPrice: s.tp,
  grade: s.g,
  savingPercent: s.sv,
});

const expandFamily = (g: WireGroup): BiologicFamily => ({
  molecule: g.i,
  memberCount: g.n,
  savings: g.sav.map(expandSaving),
  members: g.mem.map(expandMember),
});

const expandMeta = (m: WirePayload['meta']): BiologicsMeta => ({
  purpleBook: m.purple_book,
  generated: m.generated,
  coverage: {
    families: m.coverage.families,
    members: m.coverage.members,
    withSavings: m.coverage.with_savings,
  },
});

// --- loading ---------------------------------------------------------------
const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

let cache: BiologicsData | null = null;
let inFlight: Promise<BiologicsData> | null = null;

export const loadBiologics = async (): Promise<BiologicsData> => {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await fetch(`${baseUrl()}data/biologics.json`);
    if (!response.ok) {
      throw new Error(`Could not load biologics data (${response.status})`);
    }
    const wire = (await response.json()) as WirePayload;
    cache = {
      meta: expandMeta(wire.meta),
      families: wire.groups.map(expandFamily),
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
export const __resetBiologicsCache = (): void => {
  cache = null;
  inFlight = null;
};

const indexKey = (name: string): string =>
  name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Families reachable from a name.
 *
 * The index carries the molecule ("ADALIMUMAB"), every brand in the family
 * ("Humira", "Simlandi") and the reference product each follow-on names, so a
 * search works from whichever of those the user happens to hold.
 */
export const lookupBiologics = (
  data: BiologicsData,
  name: string | null | undefined
): BiologicFamily[] => {
  if (!name) return [];
  const indices = data.nameIndex[indexKey(name)];
  if (!indices) return [];
  return indices.map(i => data.families[i]).filter(Boolean);
};

/**
 * Families with a computable switch, largest saving first.
 *
 * Only a handful exist — CMS surveys retail acquisition cost and most biologics
 * are clinician-administered — but they carry the largest absolute figures in
 * the dataset, so they are worth showing before anyone searches.
 */
export const biologicHighlights = (data: BiologicsData): BiologicFamily[] =>
  data.families
    .filter(family => family.savings.length > 0)
    .sort((a, b) => b.savings[0].savingPercent - a.savings[0].savingPercent);
