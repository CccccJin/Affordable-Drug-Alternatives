/**
 * The grade C panel, and the claims it must never make.
 *
 * Every other panel on the Alternatives page reports an FDA finding a
 * pharmacist may act on. This one reports a WHO classification nobody may act
 * on alone, and it sits on the same screen, below a green badge reading "a
 * pharmacist can substitute". Most of these tests assert on what is absent,
 * because the absences are the safety property: a future change adding a
 * saving here would look like a feature and would be a treatment
 * recommendation.
 */
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AtcClassPanel } from '../components/substitutability/AtcClassPanel';
import { __resetAtcCache, loadAtcClasses, lookupAtcClasses } from '../services/api/atcApi';
import type { AtcClass } from '../types/api';

const statins: AtcClass = {
  code: 'C10AA',
  className: 'HMG CoA reductase inhibitors',
  pricedMembers: 2,
  members: [
    { ingredient: 'ATORVASTATIN CALCIUM', priceLow: 0.02325, priceHigh: 19.11428, pricingUnit: 'EA', surveyedProducts: 984 },
    { ingredient: 'ROSUVASTATIN CALCIUM', priceLow: 0.0921, priceHigh: 10.4405, pricingUnit: 'EA', surveyedProducts: 78 },
    { ingredient: 'SIMVASTATIN', priceLow: null, priceHigh: null, pricingUnit: null, surveyedProducts: 0 },
  ],
};

describe('the panel leads with what cannot be done', () => {
  it('states the prohibition before naming the class', () => {
    render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    const prohibition = screen.getByText('A pharmacist may not substitute between these.');
    const className = screen.getByText('HMG CoA reductase inhibitors');
    expect(prohibition.compareDocumentPosition(className))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('says this is not an FDA finding, in those words', () => {
    render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    expect(screen.getByText(/not an FDA equivalence finding/)).toBeInTheDocument();
  });

  it('names the prescriber as the only route', () => {
    render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    expect(screen.getByText(/only a prescriber can make/)).toBeInTheDocument();
  });

  it('renders nothing at all when the drug is in no class', () => {
    const { container } = render(<AtcClassPanel classes={[]} queryName="X" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the claims it must not make', () => {
  it('never presents a saving figure', () => {
    /* The word "cheaper" does appear — inside the sentence denying that a
       cheaper member is therefore a reasonable choice. What must not appear is
       a *quantity*: a percentage, or a "save $x" claim. */
    const { container } = render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    const text = container.textContent || '';
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toMatch(/\bsaves?\b|\bsavings?\b/i);
    expect(text).toMatch(/nor?t? that a cheaper one is a reasonable choice|cheaper one is a reasonable choice/i);
  });

  it('never uses the success colour that means "can substitute" elsewhere', () => {
    const { container } = render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    expect(container.querySelector('.MuiAlert-colorSuccess')).toBeNull();
    expect(container.querySelector('.MuiChip-colorSuccess')).toBeNull();
  });

  it('keeps members alphabetical rather than ranking them by price', () => {
    /* Queried through the DOM rather than by role: the class is collapsed by
       default, so its table is present but hidden from the accessibility tree.
       That is the intent, not an accident — see the test below. */
    const { container } = render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    const names = [...container.querySelectorAll('tbody tr')]
      .map(row => row.querySelector('td')?.textContent?.trim())
      .filter((n): n is string => Boolean(n));
    expect(names).toEqual([...names].sort());
    // The cheapest is not first, which a price ranking would have made it.
    expect(names[0]).toBe('ATORVASTATIN CALCIUM');
  });

  it('starts collapsed, so the class is opened rather than offered', () => {
    const { container } = render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    const summary = container.querySelector('.MuiAccordionSummary-root');
    expect(summary?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows an unpriced substance as unpriced, not as free', () => {
    render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    const row = screen.getByText('SIMVASTATIN').closest('tr');
    expect(row?.textContent).toContain('—');
    expect(row?.textContent).not.toMatch(/\$0\b|\$0\.00/);
  });

  it('says the range spans strengths, so a wide range is not a choice', () => {
    render(<AtcClassPanel classes={[statins]} queryName="LIPITOR" />);
    expect(screen.getByText(/across all strengths/)).toBeInTheDocument();
    expect(screen.getByText(/the order carries no recommendation/)).toBeInTheDocument();
  });
});

describe('finding a class from a name', () => {
  const wire = {
    meta: {
      source: 'WHO ATC via RxNorm/RxClass', generated: '2026-09-02',
      relation: 'Shared WHO ATC level-4 chemical subgroup. This is a classification, not an FDA equivalence finding.',
      cost_basis: 'acquisition_cost',
      coverage: {
        classes: 1, named: 1, with_prices: 1, with_acquisition_cost: 1,
      },
    },
    groups: [{ c: 'C10AA', n: 'HMG CoA reductase inhibitors', np: 1,
               mem: [{ i: 'ATORVASTATIN CALCIUM', lo: 0.037, hi: 19.11, u: 'EA', n: 2 }] }],
    name_index: { 'ATORVASTATIN CALCIUM': [0] },
  };

  beforeEach(() => {
    __resetAtcCache();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(wire) }),
    ) as unknown as typeof fetch;
  });

  it('matches the exact Orange Book ingredient spelling', async () => {
    const data = await loadAtcClasses();
    expect(lookupAtcClasses(data, 'ATORVASTATIN CALCIUM')).toHaveLength(1);
  });

  it('reaches the class from the base moiety alone', async () => {
    // The index is keyed on the salt; a visitor types the moiety.
    const data = await loadAtcClasses();
    expect(lookupAtcClasses(data, 'atorvastatin')).toHaveLength(1);
  });

  it('does not match an unrelated name that merely shares a prefix word', async () => {
    const data = await loadAtcClasses();
    expect(lookupAtcClasses(data, 'ATORVA')).toHaveLength(0);
  });

  it('returns nothing for an unknown drug', async () => {
    const data = await loadAtcClasses();
    expect(lookupAtcClasses(data, 'SOMETHING ELSE')).toEqual([]);
  });
});

describe('reaching a class from what the page actually holds', () => {
  /* The Alternatives page is searched by brand. The ATC index is keyed on the
     Orange Book ingredient. Passing the query straight through found nothing
     for every brand-name search — caught only by loading the deployed page and
     seeing the panel missing for LIPITOR. */
  const data = {
    meta: {
      source: 's', generated: '2026-09-02', relation: 'r',
      costBasis: 'acquisition_cost',
      coverage: { classes: 1, named: 1, withPrices: 1, withAcquisitionCost: 1 },
    },
    classes: [statins],
    nameIndex: { 'ATORVASTATIN CALCIUM': [0], 'ROSUVASTATIN CALCIUM': [0] },
  };

  it('finds nothing from a brand name alone', () => {
    expect(lookupAtcClasses(data, 'LIPITOR')).toEqual([]);
  });

  it('finds the class from the ingredient the FDA layer resolved', () => {
    expect(lookupAtcClasses(data, 'ATORVASTATIN CALCIUM')).toHaveLength(1);
  });

  it('returns one entry when two ingredients share a class', () => {
    const seen = new Map<string, typeof statins>();
    for (const name of ['ATORVASTATIN CALCIUM', 'ROSUVASTATIN CALCIUM']) {
      for (const c of lookupAtcClasses(data, name)) if (!seen.has(c.code)) seen.set(c.code, c);
    }
    expect([...seen.values()]).toHaveLength(1);
  });
});

describe('where the panel is mounted', () => {
  /* The component was correct and every test above passed while the panel sat
     in the landing branch instead of the results branch — reachable only when
     no drug has been searched, which is exactly when it has nothing to show.
     Unit tests cannot see this: they render the panel directly. Reading the
     source is what catches it. */
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'alternatives', 'CheaperAlternatives.tsx'),
    'utf8',
  );

  it('is used exactly once', () => {
    expect(source.match(/<AtcClassPanel/g) || []).toHaveLength(1);
  });

  it('sits after the FDA panels, not in the landing branch', () => {
    const idle = source.indexOf("result.status === 'idle'");
    const biologicCards = source.indexOf('<BiologicFamilyCard');
    const panel = source.indexOf('<AtcClassPanel');
    expect(idle).toBeGreaterThan(-1);
    expect(biologicCards).toBeGreaterThan(-1);
    // After the Orange Book and Purple Book cards...
    expect(panel).toBeGreaterThan(biologicCards);
    // ...and the landing branch is earlier in the file than both.
    expect(idle).toBeLessThan(biologicCards);
  });

  it('is fed resolved ingredients rather than the raw query', () => {
    expect(source).toMatch(/useAtcClasses\(ingredients\)/);
    expect(source).not.toMatch(/useAtcClasses\(query\)/);
  });
});
