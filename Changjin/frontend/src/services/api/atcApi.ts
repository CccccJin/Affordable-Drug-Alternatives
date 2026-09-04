import type { AtcClass, AtcData, AtcMember } from '../../types/api';

/**
 * WHO ATC level-4 classes, precomputed by `subst_data/export_atc_classes.py`.
 *
 * This is the grade C layer and it is unlike the other two. An Orange Book AB
 * rating and a Purple Book interchangeability finding are both statements FDA
 * makes about products, and a pharmacist may act on either. A shared ATC
 * level-4 code is a statement WHO makes about chemistry: atorvastatin and
 * rosuvastatin are both C10AA, they are different drugs at different doses,
 * and nobody may swap one for the other without a prescriber.
 *
 * The payload carries no saving and no ranking, by construction on the Python
 * side. Nothing in this module computes either — a "switch and save" figure
 * derived here would be a treatment recommendation wearing a percentage.
 */

interface WireMember {
  i: string;
  lo?: number; hi?: number; u?: string; n?: number;
}
interface WireGroup { c: string; n: string; np: number; mem: WireMember[] }
interface WirePayload {
  meta: {
    source: string; generated: string; relation: string;
    cost_basis: string;
    coverage: {
      classes: number; named: number;
      with_prices: number; with_acquisition_cost: number;
    };
  };
  groups: WireGroup[];
  name_index: Record<string, number[]>;
}

const expandMember = (m: WireMember): AtcMember => ({
  ingredient: m.i,
  priceLow: m.lo ?? null,
  priceHigh: m.hi ?? null,
  pricingUnit: m.u ?? null,
  surveyedProducts: m.n ?? 0,
});

const expandGroup = (g: WireGroup): AtcClass => ({
  code: g.c,
  className: g.n,
  pricedMembers: g.np,
  members: g.mem.map(expandMember),
});

const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

let cache: AtcData | null = null;
let inFlight: Promise<AtcData> | null = null;

export const loadAtcClasses = async (): Promise<AtcData> => {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await fetch(`${baseUrl()}data/atc_classes.json`);
    if (!response.ok) {
      throw new Error(`Could not load ATC class data (${response.status})`);
    }
    const wire = (await response.json()) as WirePayload;
    cache = {
      meta: {
        source: wire.meta.source,
        generated: wire.meta.generated,
        relation: wire.meta.relation,
        costBasis: wire.meta.cost_basis,
        coverage: {
          classes: wire.meta.coverage.classes,
          named: wire.meta.coverage.named,
          withPrices: wire.meta.coverage.with_prices,
          withAcquisitionCost: wire.meta.coverage.with_acquisition_cost,
        },
      },
      classes: wire.groups.map(expandGroup),
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
export const __resetAtcCache = (): void => {
  cache = null;
  inFlight = null;
};

const indexKey = (name: string): string =>
  name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Classes reachable from an ingredient name.
 *
 * The index is keyed on the Orange Book ingredient spelling, which names the
 * salt ("ATORVASTATIN CALCIUM"). A search for the base moiety alone therefore
 * needs the prefix pass below.
 */
export const lookupAtcClasses = (
  data: AtcData,
  name: string | null | undefined
): AtcClass[] => {
  if (!name) return [];
  const key = indexKey(name);

  const exact = data.nameIndex[key];
  if (exact) return exact.map(i => data.classes[i]).filter(Boolean);

  // "ATORVASTATIN" should still reach "ATORVASTATIN CALCIUM".
  const seen = new Set<number>();
  for (const [indexed, positions] of Object.entries(data.nameIndex)) {
    if (indexed === key || indexed.startsWith(`${key} `)) {
      positions.forEach(p => seen.add(p));
    }
  }
  return [...seen].map(i => data.classes[i]).filter(Boolean);
};
