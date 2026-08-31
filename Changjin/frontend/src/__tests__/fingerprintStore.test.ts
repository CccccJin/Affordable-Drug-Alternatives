import { jest } from '@jest/globals';
import {
  loadFingerprintCorpus,
  scoreCorpus,
  tanimoto,
  __resetFingerprintCache,
} from '../services/search/fingerprintStore';

/**
 * Morgan fingerprints captured from @rdkit/rdkit 2025.3.4 with
 * `{"radius":2,"nBits":1024}` — the same vectors `tests/test_demo_fingerprints.py`
 * pins on the Python side. Using real fingerprints rather than invented bit
 * patterns is what makes the expected Tanimoto values below meaningful.
 */
const ETHANOL =
  '0000000002000000000001000000000000000000000000000000004000000000' +
  '0000000040000000000000000000000004000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000080000000000000000000000000000000000000000000000000000000';

const ASPIRIN =
  '0008800002000000010000000000000000000000008000000000000000000000' +
  '0000000000000000000000001000000024000000800000100001000000000000' +
  '0000000000000000000001000000000000040000000080000200400000800000' +
  '0000000080000000000002000000002000200000000004008000000000000002';

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));

const BYTES_PER_RECORD = 128;

const metadata = {
  records: 2,
  fingerprints: {
    file: 'fingerprints.bin',
    algorithm: 'Morgan',
    radius: 2,
    n_bits: 1024,
    bytes_per_record: BYTES_PER_RECORD,
    records: 2,
  },
};

/** A two-record corpus: ethanol at row 0, aspirin at row 1. */
const corpusBlob = (): Uint8Array => {
  const blob = new Uint8Array(2 * BYTES_PER_RECORD);
  blob.set(bytes(ETHANOL), 0);
  blob.set(bytes(ASPIRIN), BYTES_PER_RECORD);
  return blob;
};

const mockFetch = (blob: Uint8Array = corpusBlob(), meta: unknown = metadata) => {
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve(
      String(url).endsWith('metadata.json')
        ? { ok: true, json: () => Promise.resolve(meta) }
        : {
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
              ),
          }
    )
  ) as unknown as typeof fetch;
};

describe('tanimoto', () => {
  it('scores a fingerprint against itself as 1', () => {
    const aspirin = bytes(ASPIRIN);
    expect(tanimoto(aspirin, aspirin)).toBe(1);
  });

  it('scores two different molecules below 1 and above 0', () => {
    const score = tanimoto(bytes(ETHANOL), bytes(ASPIRIN));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is symmetric', () => {
    const [ethanol, aspirin] = [bytes(ETHANOL), bytes(ASPIRIN)];
    expect(tanimoto(ethanol, aspirin)).toBeCloseTo(tanimoto(aspirin, ethanol), 12);
  });

  it('computes |A & B| / |A | B| exactly', () => {
    // 0b1100 & 0b1010 = 0b1000 (1 bit); 0b1100 | 0b1010 = 0b1110 (3 bits).
    const left = Uint8Array.from([0b1100]);
    const right = Uint8Array.from([0b1010]);
    expect(tanimoto(left, right)).toBeCloseTo(1 / 3, 12);
  });

  it('returns 0 rather than NaN when neither vector has bits set', () => {
    const empty = new Uint8Array(BYTES_PER_RECORD);
    expect(tanimoto(empty, empty)).toBe(0);
  });

  it('does not score a molecule against an empty fingerprint row', () => {
    expect(tanimoto(bytes(ASPIRIN), new Uint8Array(BYTES_PER_RECORD))).toBe(0);
  });

  it('reads the right row when given an offset into a packed corpus', () => {
    const blob = corpusBlob();
    // Row 1 is aspirin, so an aspirin query must score exactly 1 there.
    expect(tanimoto(bytes(ASPIRIN), blob, BYTES_PER_RECORD, BYTES_PER_RECORD)).toBe(1);
    expect(tanimoto(bytes(ETHANOL), blob, 0, BYTES_PER_RECORD)).toBe(1);
  });
});

describe('loadFingerprintCorpus', () => {
  beforeEach(() => {
    __resetFingerprintCache();
  });

  it('reads its geometry from metadata rather than hard-coding it', async () => {
    mockFetch();
    const corpus = await loadFingerprintCorpus();
    expect(corpus.geometry).toEqual({
      radius: 2,
      nBits: 1024,
      bytesPerRecord: BYTES_PER_RECORD,
      records: 2,
    });
    expect(corpus.bits).toHaveLength(2 * BYTES_PER_RECORD);
  });

  it('rejects a truncated blob instead of mis-scoring the tail', async () => {
    mockFetch(new Uint8Array(BYTES_PER_RECORD + 3));
    await expect(loadFingerprintCorpus()).rejects.toThrow(/expected 256/);
  });

  it('names the fix when the export has never been run', async () => {
    mockFetch(corpusBlob(), { records: 2 });
    await expect(loadFingerprintCorpus()).rejects.toThrow(
      /export_demo_fingerprints\.py/
    );
  });

  it('downloads once even when several searches start at the same time', async () => {
    mockFetch();
    await Promise.all([loadFingerprintCorpus(), loadFingerprintCorpus()]);
    await loadFingerprintCorpus();
    // Two requests for the first load (metadata + blob), none after it caches.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('scoreCorpus', () => {
  beforeEach(() => {
    __resetFingerprintCache();
    mockFetch();
  });

  it('returns one score per record, positionally aligned with compounds.json', async () => {
    const corpus = await loadFingerprintCorpus();
    const scores = scoreCorpus(corpus, bytes(ASPIRIN));

    expect(scores).toHaveLength(2);
    expect(scores[1]).toBe(1); // aspirin is row 1
    expect(scores[0]).toBeLessThan(1); // ethanol is not aspirin
  });

  it('refuses a query fingerprint of the wrong width', async () => {
    const corpus = await loadFingerprintCorpus();
    expect(() => scoreCorpus(corpus, new Uint8Array(64))).toThrow(
      /64 bytes, corpus expects 128/
    );
  });
});
