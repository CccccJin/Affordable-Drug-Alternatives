/**
 * Honest reporting of the corpus download.
 *
 * Measured against the deployed site: compounds.json and fingerprints.bin
 * total about 7.5 MB gzipped. That is 0.46 s on a fast link, 12 s at 5 Mbps
 * and 40 s at 1.5 Mbps, and throughout it the page said "Searching compounds…
 * this may take a few moments" — understating the wait and blaming the wrong
 * thing, since no search has started until the bytes arrive.
 */
import { jest } from '@jest/globals';
import {
  loadFingerprintCorpus,
  onCorpusProgress,
  __resetFingerprintCache,
} from '../services/search/fingerprintStore';

const RECORDS = 3;
const BYTES = 128;

const metadata = {
  fingerprints: {
    file: 'fingerprints.bin',
    records: RECORDS,
    bytes_per_record: BYTES,
    radius: 2,
    n_bits: 1024,
  },
};

/** A body delivered in chunks, like a real download. */
const streamed = (bytes: Uint8Array, chunks: number, withLength = true) => {
  const size = Math.ceil(bytes.length / chunks);
  let sent = 0;
  return {
    ok: true,
    headers: { get: (h: string) => (withLength && h === 'Content-Length' ? String(bytes.length) : null) },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent >= bytes.length) return { done: true, value: undefined };
          const slice = bytes.slice(sent, sent + size);
          sent += slice.length;
          return { done: false, value: slice };
        },
      }),
    },
    arrayBuffer: async () => bytes.buffer,
  };
};

const install = (blobResponse: unknown) => {
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve(
      String(url).includes('metadata')
        ? { ok: true, json: async () => metadata }
        : blobResponse,
    ),
  ) as unknown as typeof fetch;
};

beforeEach(() => __resetFingerprintCache());

describe('corpus download progress', () => {
  it('reports bytes as they arrive, ending at the total', async () => {
    const bytes = new Uint8Array(RECORDS * BYTES);
    install(streamed(bytes, 4));
    const seen: number[] = [];
    const off = onCorpusProgress(p => seen.push(p.loaded));

    await loadFingerprintCorpus();
    off();

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(bytes.length);
    // Monotonic: a bar that goes backwards is worse than no bar.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('carries the total so a percentage can be shown', async () => {
    const bytes = new Uint8Array(RECORDS * BYTES);
    install(streamed(bytes, 3));
    let last = { loaded: 0, total: -1 };
    const off = onCorpusProgress(p => { last = p; });

    await loadFingerprintCorpus();
    off();

    expect(last.total).toBe(bytes.length);
  });

  it('reports zero total when the server sends no Content-Length', async () => {
    // Then the caller shows bytes rather than inventing a percentage.
    const bytes = new Uint8Array(RECORDS * BYTES);
    install(streamed(bytes, 2, false));
    let last = { loaded: 0, total: -1 };
    const off = onCorpusProgress(p => { last = p; });

    await loadFingerprintCorpus();
    off();

    expect(last.total).toBe(0);
    expect(last.loaded).toBe(bytes.length);
  });

  it('still downloads where streaming is unavailable', async () => {
    const bytes = new Uint8Array(RECORDS * BYTES);
    const noStream = {
      ok: true,
      headers: { get: () => String(bytes.length) },
      body: null,
      arrayBuffer: async () => bytes.buffer,
    };
    install(noStream);

    const corpus = await loadFingerprintCorpus();
    expect(corpus.bits.length).toBe(RECORDS * BYTES);
  });

  it('still refuses a truncated blob', async () => {
    // The streaming path must not weaken the check that a short file would
    // otherwise mis-score every compound past the truncation point.
    install(streamed(new Uint8Array(RECORDS * BYTES - 1), 3));
    await expect(loadFingerprintCorpus()).rejects.toThrow(/expected/);
  });

  it('stops reporting to a listener that unsubscribed', async () => {
    const bytes = new Uint8Array(RECORDS * BYTES);
    install(streamed(bytes, 4));
    let calls = 0;
    const off = onCorpusProgress(() => { calls += 1; });
    off();

    await loadFingerprintCorpus();
    expect(calls).toBe(0);
  });
});

describe('tolerating a response that is not a real Response', () => {
  it('downloads even when the object has no headers at all', async () => {
    /* Adding progress reporting read `response.headers.get(...)` unguarded and
       broke 24 existing tests at once: their fixtures return a plain object
       with `ok`, `json` and `arrayBuffer` and nothing else. A real Response
       always has headers; a stand-in need not, and a missing one should cost
       the progress bar, not the search. */
    const bytes = new Uint8Array(RECORDS * BYTES);
    install({ ok: true, arrayBuffer: async () => bytes.buffer });

    const corpus = await loadFingerprintCorpus();
    expect(corpus.bits.length).toBe(RECORDS * BYTES);
  });
});
