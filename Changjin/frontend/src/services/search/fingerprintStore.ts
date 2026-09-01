/**
 * Structural similarity over the static demo corpus.
 *
 * `fingerprints.bin` is a flat blob of Morgan fingerprints written by
 * `export_demo_fingerprints.py`: row *i* is compound *i* of `compounds.json`,
 * `bytesPerRecord` bytes each, no header. The geometry comes from
 * `metadata.json` rather than being hard-coded here, so regenerating the export
 * with different parameters cannot leave the two sides silently disagreeing.
 *
 * This replaces a bigram overlap over SMILES *text*, which is not a chemical
 * measurement at all -- "CCO" and "OCC" are the same molecule and score 0.0,
 * while two unrelated molecules sharing common substrings score high. Tanimoto
 * over Morgan bits is what the FastAPI `/search` endpoint computes, and with
 * the same radius and bit count the demo now returns the same numbers.
 *
 * 5,000 records x 128 bytes is 625 KB (165 KB gzipped) and one scan is ~640k
 * byte-popcounts, well under a frame.
 */

// Population count per byte value. A 256-entry table beats bit-twiddling here
// because the inner loop is byte-wise anyway.
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];
}

export interface FingerprintGeometry {
  radius: number;
  nBits: number;
  bytesPerRecord: number;
  records: number;
}

export interface FingerprintCorpus {
  geometry: FingerprintGeometry;
  bits: Uint8Array;
}

interface MetadataPayload {
  fingerprints?: {
    file: string;
    radius: number;
    n_bits: number;
    bytes_per_record: number;
    records: number;
  };
}

/**
 * Tanimoto coefficient between two packed bit vectors: |A & B| / |A | B|.
 *
 * Returns 0 when either vector has no bits set. That case is not a similarity
 * of zero so much as an absence of evidence -- it means RDKit produced no
 * fingerprint for the structure -- and 0 keeps it out of the results, which is
 * the honest outcome either way.
 */
export const tanimoto = (
  left: Uint8Array,
  right: Uint8Array,
  rightOffset = 0,
  length = left.length
): number => {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < length; i += 1) {
    const a = left[i];
    const b = right[rightOffset + i];
    intersection += POPCOUNT[a & b];
    union += POPCOUNT[a | b];
  }
  return union === 0 ? 0 : intersection / union;
};

// --- loading ---------------------------------------------------------------
const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

let cache: FingerprintCorpus | null = null;
let inFlight: Promise<FingerprintCorpus> | null = null;

/**
 * Conventional blob name, used to start its download without first waiting to
 * be told it. Metadata still names the file and is still checked against this;
 * the constant is an optimistic guess, not the source of truth.
 */
const DEFAULT_BLOB = 'fingerprints.bin';

const fetchCorpus = async (): Promise<FingerprintCorpus> => {
  // Both requests go out together. Fetching metadata first and only then the
  // blob it names cost an extra round trip on the critical path of every
  // search, to learn a filename that has never changed.
  const [metadataResponse, binaryResponse] = await Promise.all([
    fetch(`${baseUrl()}data/metadata.json`),
    fetch(`${baseUrl()}data/${DEFAULT_BLOB}`),
  ]);

  if (!metadataResponse.ok) {
    throw new Error(`Could not load fingerprint metadata (${metadataResponse.status})`);
  }

  const descriptor = ((await metadataResponse.json()) as MetadataPayload).fingerprints;
  if (!descriptor) {
    throw new Error(
      'metadata.json has no "fingerprints" section — run `python export_demo_fingerprints.py`'
    );
  }
  if (descriptor.file !== DEFAULT_BLOB) {
    // The guess was wrong, so the parallel fetch downloaded the wrong file.
    // Say so rather than validating a blob nobody asked for.
    throw new Error(
      `metadata.json names "${descriptor.file}" but this build fetches ` +
        `"${DEFAULT_BLOB}"; update DEFAULT_BLOB in fingerprintStore.ts`
    );
  }
  if (!binaryResponse.ok) {
    throw new Error(`Could not load ${descriptor.file} (${binaryResponse.status})`);
  }

  const bits = new Uint8Array(await binaryResponse.arrayBuffer());
  const expected = descriptor.records * descriptor.bytes_per_record;
  if (bits.length !== expected) {
    // A truncated blob would still "work" and quietly mis-score every compound
    // past the truncation point, so refuse it instead.
    throw new Error(
      `${descriptor.file} is ${bits.length} bytes, expected ${expected} ` +
        `(${descriptor.records} records x ${descriptor.bytes_per_record})`
    );
  }

  return {
    geometry: {
      radius: descriptor.radius,
      nBits: descriptor.n_bits,
      bytesPerRecord: descriptor.bytes_per_record,
      records: descriptor.records,
    },
    bits,
  };
};

export const loadFingerprintCorpus = async (): Promise<FingerprintCorpus> => {
  if (cache) return cache;
  // Several searches can start before the first resolves; share one download.
  if (inFlight) return inFlight;

  inFlight = fetchCorpus().then(corpus => {
    cache = corpus;
    return corpus;
  });

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

/** Exposed for tests; resets the module-level cache. */
export const __resetFingerprintCache = (): void => {
  cache = null;
  inFlight = null;
};

/**
 * Score every compound in the corpus against a query fingerprint.
 *
 * Returns one score per record, positionally aligned with `compounds.json`.
 * Ranking and thresholding are the caller's business -- this stays a pure
 * measurement so the same scores can be reused for filtering and for reporting
 * the nearest miss when nothing clears the threshold.
 */
export const scoreCorpus = (corpus: FingerprintCorpus, query: Uint8Array): Float64Array => {
  const { bytesPerRecord, records } = corpus.geometry;
  if (query.length !== bytesPerRecord) {
    throw new Error(
      `Query fingerprint is ${query.length} bytes, corpus expects ${bytesPerRecord}`
    );
  }

  const scores = new Float64Array(records);
  for (let i = 0; i < records; i += 1) {
    scores[i] = tanimoto(query, corpus.bits, i * bytesPerRecord, bytesPerRecord);
  }
  return scores;
};
