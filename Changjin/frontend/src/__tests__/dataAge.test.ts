import { dataAge, stalenessWarning } from '../services/api/dataAge';

/**
 * The failure this guards against is silent: an extract that is quietly two
 * years old renders exactly like a current one, cited to an authoritative
 * source, with nothing on the page to contradict it.
 */
const NOW = new Date('2027-06-01T12:00:00Z');
const daysBefore = (n: number): string =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe('dataAge', () => {
  it('counts a fresh extract as fresh', () => {
    expect(dataAge(daysBefore(3), NOW).freshness).toBe('fresh');
    expect(dataAge(daysBefore(89), NOW).freshness).toBe('fresh');
  });

  it('flags one past a quarter', () => {
    expect(dataAge(daysBefore(90), NOW).freshness).toBe('stale');
    expect(dataAge(daysBefore(200), NOW).freshness).toBe('stale');
  });

  it('escalates one past nine months', () => {
    expect(dataAge(daysBefore(270), NOW).freshness).toBe('very-stale');
    expect(dataAge(daysBefore(900), NOW).freshness).toBe('very-stale');
  });

  it('describes the age in units a reader thinks in', () => {
    expect(dataAge(daysBefore(0), NOW).label).toBe('generated today');
    expect(dataAge(daysBefore(5), NOW).label).toBe('5 days old');
    expect(dataAge(daysBefore(21), NOW).label).toBe('3 weeks old');
    expect(dataAge(daysBefore(120), NOW).label).toBe('4 months old');
    expect(dataAge(daysBefore(900), NOW).label).toBe('2.5 years old');
  });

  it('treats an unreadable date as suspect, not as current', () => {
    // Defaulting to "fine" is the exact failure mode this exists to prevent.
    const age = dataAge('not a date', NOW);
    expect(age.freshness).toBe('very-stale');
    expect(age.label).toBe('of unknown age');
  });

  it('never reports a negative age for a date in the future', () => {
    const future = new Date(NOW.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
    expect(dataAge(future, NOW).days).toBe(0);
  });
});

describe('stalenessWarning', () => {
  it('says nothing while the extract is current', () => {
    expect(stalenessWarning(dataAge(daysBefore(10), NOW))).toBeNull();
  });

  it('names the age and the upstream cadence it no longer reflects', () => {
    const warning = stalenessWarning(dataAge(daysBefore(120), NOW))!;
    expect(warning).toContain('4 months old');
    expect(warning).toMatch(/NADAC weekly/);
    expect(warning).toMatch(/Orange Book monthly/);
  });

  it('escalates the advice once the extract is very stale', () => {
    const stale = stalenessWarning(dataAge(daysBefore(120), NOW))!;
    const verystale = stalenessWarning(dataAge(daysBefore(400), NOW))!;

    expect(stale).toMatch(/Prices in particular may have moved/);
    expect(verystale).toMatch(/should not be relied on/);
  });
});
