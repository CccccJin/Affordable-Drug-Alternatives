/**
 * How old the FDA/CMS extract is, and whether that is a problem yet.
 *
 * The pages printed the generation date and left the reader to do the
 * arithmetic. A price that is quietly two years old is more dangerous than no
 * price: it looks current, it is cited to an authoritative source, and nothing
 * on the page contradicts it. Upstream moves on a known cadence — CMS
 * republishes NADAC weekly and FDA revises the Orange Book monthly — so the
 * extract's age is a fact the page can state rather than imply.
 */

/** Weeks after which the extract is worth flagging, then worth distrusting. */
const STALE_DAYS = 90;
const VERY_STALE_DAYS = 270;

export type Freshness = 'fresh' | 'stale' | 'very-stale';

export interface DataAge {
  days: number;
  freshness: Freshness;
  /** Human phrasing of the age, e.g. "4 months old". */
  label: string;
}

const describe = (days: number): string => {
  if (days <= 1) return 'generated today';
  if (days < 14) return `${days} days old`;
  if (days < 60) return `${Math.round(days / 7)} weeks old`;
  if (days < 730) return `${Math.round(days / 30)} months old`;
  return `${(days / 365).toFixed(1)} years old`;
};

/**
 * Age of an ISO date against today.
 *
 * A date that cannot be parsed returns `very-stale` rather than `fresh`: an
 * unreadable provenance stamp is not evidence of currency, and defaulting to
 * "fine" is the failure mode this exists to prevent.
 */
export const dataAge = (generated: string, now: Date = new Date()): DataAge => {
  const parsed = Date.parse(generated);
  if (Number.isNaN(parsed)) {
    return { days: Infinity, freshness: 'very-stale', label: 'of unknown age' };
  }

  const days = Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000));
  const freshness: Freshness =
    days >= VERY_STALE_DAYS ? 'very-stale' : days >= STALE_DAYS ? 'stale' : 'fresh';

  return { days, freshness, label: describe(days) };
};

/** What to tell the reader, or null while the extract is still current. */
export const stalenessWarning = (age: DataAge): string | null => {
  if (age.freshness === 'fresh') return null;
  const severity =
    age.freshness === 'very-stale'
      ? 'Prices and ratings here should not be relied on until it is rebuilt.'
      : 'Prices in particular may have moved.';
  return (
    `This extract is ${age.label}. CMS republishes NADAC weekly and FDA revises ` +
    `the Orange Book monthly, so it no longer reflects either. ${severity}`
  );
};
