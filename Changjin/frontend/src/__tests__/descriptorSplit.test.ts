/**
 * The two-file corpus, and the two ways it can go wrong.
 *
 * Descriptors moved out of compounds.json because they were 43% of it — 1.0 MB
 * gzipped of 3.6 — and no search path reads one. A first search downloads
 * 5.65 MB instead of 7.18 MB.
 *
 * The split introduces two failure modes that did not exist when one file
 * carried everything, and both are silent:
 *
 * 1. **Misalignment.** `descriptors.rows[i]` describes `compounds[i]` and
 *    nothing enforces that but the export. A file with the wrong number of
 *    rows would describe every compound with another compound's properties.
 * 2. **Filtering before the descriptors arrive.** An unloaded descriptor is
 *    null, and `filterRejection` treats null as "cannot judge, so keep", so a
 *    filtered search would return everything and report that nothing was
 *    filtered.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  StaticSearchApi,
  loadDescriptors,
  hasDescriptors,
  __resetCompoundsCache,
} from '../services/api/staticSearchApi';
import { __resetFingerprintCache } from '../services/search/fingerprintStore';

const BYTES_PER_RECORD = 128;
const COMPOUNDS = [
  { id: 'CHEMBL545', n: 'ETHANOL', s: 'CCO' },
  { id: 'CHEMBL25', n: 'ASPIRIN', s: 'CC(=O)Oc1ccccc1C(=O)O' },
];
const DESCRIPTORS = {
  fields: ['mw', 'lp', 'psa', 'hbd', 'hba', 'rtb', 'ar', 'ha', 'cns'],
  rows: [
    [46.07, -0.0014, 20.23, 1, 1, 0, 0, 3, 4],
    [180.16, 1.31, 63.6, 1, 3, 2, 1, 13, 4],
  ],
};
const metadata = {
  fingerprints: {
    file: 'fingerprints.bin', algorithm: 'Morgan', radius: 2, n_bits: 1024,
    bytes_per_record: BYTES_PER_RECORD, records: COMPOUNDS.length,
  },
};

const blob = () => {
  const bits = new Uint8Array(COMPOUNDS.length * BYTES_PER_RECORD);
  bits[0] = 0b1010_1010;
  bits[BYTES_PER_RECORD] = 0b0101_0101;
  return bits;
};

let descriptorFetches = 0;

const install = (descriptors: unknown = DESCRIPTORS) => {
  descriptorFetches = 0;
  const packed = blob();
  global.fetch = jest.fn((url: unknown) => {
    const href = String(url);
    if (href.endsWith('metadata.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(metadata) });
    }
    if (href.endsWith('compounds.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COMPOUNDS) });
    }
    if (href.endsWith('descriptors.json')) {
      descriptorFetches += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(descriptors) });
    }
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(
        packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)),
    });
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  __resetFingerprintCache();
  __resetCompoundsCache();
  install();
});

describe('descriptors stay off the search path', () => {
  it('does not fetch them for an unfiltered search', async () => {
    await StaticSearchApi.search({ smiles: 'CCO' });
    expect(descriptorFetches).toBe(0);
    expect(hasDescriptors()).toBe(false);
  });

  it('leaves descriptor fields null until they are asked for', async () => {
    const response = await StaticSearchApi.search({ smiles: 'CCO' });
    expect(response.results[0].molecular_weight).toBeNull();
  });

  it('fetches them once, however many callers ask', async () => {
    await Promise.all([loadDescriptors(), loadDescriptors(), loadDescriptors()]);
    expect(descriptorFetches).toBe(1);
    expect(hasDescriptors()).toBe(true);
  });
});

describe('descriptors merge into the corpus already in memory', () => {
  it('attaches each row to the compound it describes', async () => {
    /* Queried one at a time: the two fixture fingerprints share no bits, so
       they score 0 against each other and never appear in one result set. Each
       search returns its own exact match, which is what the alignment claim
       needs — row 0 on compound 0, row 1 on compound 1, not merely "some
       numbers arrived". */
    await loadDescriptors();

    const ethanol = (await StaticSearchApi.search({ smiles: 'CCO' })).results[0];
    expect(ethanol.chembl_id).toBe('CHEMBL545');
    expect(ethanol.molecular_weight).toBeCloseTo(46.07, 2);
    expect(ethanol.h_bond_acceptors).toBe(1);
    expect(ethanol.heavy_atoms).toBe(3);

    const aspirin = (await StaticSearchApi.search({
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    })).results[0];
    expect(aspirin.chembl_id).toBe('CHEMBL25');
    expect(aspirin.molecular_weight).toBeCloseTo(180.16, 2);
    expect(aspirin.h_bond_acceptors).toBe(3);
    expect(aspirin.heavy_atoms).toBe(13);
  });

  it('refuses a file whose rows do not line up with the compounds', async () => {
    // Row alignment is the only contract between the two files. Merging a
    // short file would describe every compound past the gap with the wrong
    // properties, and nothing downstream could tell.
    install({ fields: DESCRIPTORS.fields, rows: [DESCRIPTORS.rows[0]] });
    await expect(loadDescriptors()).rejects.toThrow(/1 rows but compounds.json has 2/);
  });
});

describe('filtering waits for what it filters on', () => {
  it('loads descriptors before applying a property filter', async () => {
    // Aspirin weighs 180 and is its own exact match, so a 100 ceiling must
    // remove it. Without the wait its weight would be null, which the filter
    // treats as "cannot judge, so keep", and it would survive.
    const response = await StaticSearchApi.search({
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      filters: { molWeightMax: 100 },
    });
    expect(descriptorFetches).toBe(1);
    expect(response.results).toHaveLength(0);
  });

  /* "reports what the property filters removed, and why" already lives in
     staticSearchApi.test.ts and passes against the split files. Repeating it
     here needed a scenario where the filter empties the result set, and an
     empty set carries no post-processing block at all — so the duplicate
     tested the absence of a section rather than the reason inside it. */

  it('skips the wait when a filter object carries no actual bound', async () => {
    await StaticSearchApi.search({ smiles: 'CCO', filters: {} });
    expect(descriptorFetches).toBe(0);
  });
});

describe('nobody pulls the descriptors back onto the search path', () => {
  /* The split works only if the callers ask at the right moment.
     `CompoundDetails` is mounted behind every results page with `open={false}`,
     so an unconditional `useDescriptors()` there fetched the file on every
     search and undid the whole change — invisible to the tests above, which
     drive the API directly, and caught by watching the deployed page's network
     requests. Asserting on the call sites is what holds it. */
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), ...parts), 'utf8');

  it('asks only while the details dialog is open', () => {
    const source = read('src', 'components', 'results', 'CompoundDetails.tsx');
    expect(source).toMatch(/useDescriptors\(open\)/);
    expect(source).not.toMatch(/useDescriptors\(\s*\)/);
  });

  it('has no unconditional caller outside the Analytics tab', () => {
    /* AnalyticsDashboard may ask unconditionally: it is rendered only when the
       tab is selected, and every chart in it plots a descriptor. */
    const allowed = new Set(['AnalyticsDashboard.tsx']);
    const roots = [
      ['src', 'components', 'results'],
      ['src', 'components', 'search'],
      ['src', 'components', 'alternatives'],
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      const dir = join(process.cwd(), ...root);
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.tsx') || allowed.has(name)) continue;
        const src = readFileSync(join(dir, name), 'utf8');
        if (/useDescriptors\(\s*\)/.test(src)) offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
