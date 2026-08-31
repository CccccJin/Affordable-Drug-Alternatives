import { jest } from '@jest/globals';

/**
 * Search-path tests.
 *
 * RDKit's WASM build is mocked -- instantiating it under jsdom would download
 * 6.9 MB and is not what these assert. The fingerprints it returns are real
 * vectors captured from that build, so the Tanimoto arithmetic under test runs
 * on genuine chemistry; only the module load is faked.
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

// A query molecule deliberately absent from the corpus below, for the
// nothing-cleared-the-threshold case.
const PRAZOSIN =
  '0000000002040000010204000000000000000800000000000000122000210002' +
  '000000000000000000a00000100000040000a00000000a000001200411001000' +
  '0100000000002000000000000020010010040100000080000000400400000000' +
  '0010080080000080000202000008002840000040804004000000000200000000';

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));

const BYTES_PER_RECORD = 128;

const FINGERPRINTS: Record<string, string> = {
  'CCO': ETHANOL,
  'CC(=O)Oc1ccccc1C(=O)O': ASPIRIN,
  'COc1cc2nc(N3CCN(C(=O)c4ccco4)CC3)nc(N)c2cc1OC': PRAZOSIN,
};

class MockInvalidSmilesError extends Error {
  readonly smiles: string;

  constructor(smiles: string) {
    super(`Not a valid SMILES string: ${smiles}`);
    this.name = 'InvalidSmilesError';
    this.smiles = smiles;
  }
}

const getMorganFingerprint = jest.fn(async (smiles: string) => {
  const hex = FINGERPRINTS[smiles];
  if (!hex) throw new MockInvalidSmilesError(smiles);
  return bytes(hex);
});

jest.unstable_mockModule('../services/rdkit/rdkitService', () => ({
  InvalidSmilesError: MockInvalidSmilesError,
  rdkitService: { getMorganFingerprint, getMolecule: jest.fn(), getProperties: jest.fn() },
}));

const { StaticSearchApi, DEFAULT_SIMILARITY_THRESHOLD } = await import(
  '../services/api/staticSearchApi'
);
const { __resetFingerprintCache } = await import('../services/search/fingerprintStore');

const COMPOUNDS = [
  {
    chembl_id: 'CHEMBL545', pref_name: 'ETHANOL', smiles: 'CCO',
    molecular_weight: 46.07, logp: -0.0014, polar_surface_area: 20.23,
    h_bond_donors: 1, h_bond_acceptors: 1, rotatable_bonds: 0,
    aromatic_rings: 0, heavy_atoms: 3, cns_mpo: 4,
  },
  {
    chembl_id: 'CHEMBL25', pref_name: 'ASPIRIN', smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    molecular_weight: 180.16, logp: 1.31, polar_surface_area: 63.6,
    h_bond_donors: 1, h_bond_acceptors: 3, rotatable_bonds: 2,
    aromatic_rings: 1, heavy_atoms: 13, cns_mpo: 4,
  },
];

const metadata = {
  fingerprints: {
    file: 'fingerprints.bin', algorithm: 'Morgan', radius: 2, n_bits: 1024,
    bytes_per_record: BYTES_PER_RECORD, records: COMPOUNDS.length,
  },
};

const blob = (): Uint8Array => {
  const out = new Uint8Array(COMPOUNDS.length * BYTES_PER_RECORD);
  COMPOUNDS.forEach((compound, i) => {
    out.set(bytes(FINGERPRINTS[compound.smiles]), i * BYTES_PER_RECORD);
  });
  return out;
};

beforeEach(() => {
  __resetFingerprintCache();
  jest.clearAllMocks();
  const packed = blob();
  global.fetch = jest.fn((url: unknown) => {
    const href = String(url);
    if (href.endsWith('metadata.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(metadata) });
    }
    if (href.endsWith('compounds.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COMPOUNDS) });
    }
    return Promise.resolve({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)
        ),
    });
  }) as unknown as typeof fetch;
});

describe('StaticSearchApi.search', () => {
  it('ranks an exact structural match at similarity 1', async () => {
    const response = await StaticSearchApi.search({ smiles: 'CC(=O)Oc1ccccc1C(=O)O' });

    expect(response.results[0].chembl_id).toBe('CHEMBL25');
    expect(response.results[0].similarity).toBe(1);
  });

  it('scores by structure, not by SMILES text overlap', async () => {
    // The two SMILES share the substring "CC" and most of their characters, so
    // a bigram scorer rated them similar. Morgan/Tanimoto does not.
    const response = await StaticSearchApi.search({ smiles: 'CCO', threshold: 0 });

    const aspirin = response.results.find(r => r.chembl_id === 'CHEMBL25')!;
    expect(aspirin.similarity).toBeLessThan(0.2);
  });

  it('reports the nearest miss when nothing clears the threshold', async () => {
    // Prazosin is not in the corpus, so nothing can reach 0.99.
    const response = await StaticSearchApi.search({
      smiles: 'COc1cc2nc(N3CCN(C(=O)c4ccco4)CC3)nc(N)c2cc1OC',
      threshold: 0.99,
    });

    expect(response.count).toBe(0);
    expect(response.results).toHaveLength(0);
    // The empty list still carries how close the best candidate came, which is
    // what separates "no match" from "no match, and here is why".
    expect(response.best_similarity).toBeGreaterThan(0);
    expect(response.best_similarity).toBeLessThan(0.99);
    expect(response.threshold).toBe(0.99);
  });

  it('defaults to a threshold calibrated for real Tanimoto', async () => {
    const response = await StaticSearchApi.search({ smiles: 'CCO' });
    expect(response.threshold).toBe(DEFAULT_SIMILARITY_THRESHOLD);
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBeLessThan(0.7);
  });

  it('falls back to name resolution when the query is not a structure', async () => {
    const response = await StaticSearchApi.search({ smiles: 'aspirin' });

    expect(response.results[0].chembl_id).toBe('CHEMBL25');
    expect(response.results[0].similarity).toBe(1);
    // Once as a structure (rejected), then again on the resolved SMILES.
    expect(getMorganFingerprint).toHaveBeenCalledTimes(2);
  });

  it('reports an unresolvable query instead of scoring its text', async () => {
    await expect(StaticSearchApi.search({ smiles: 'zzzz' })).rejects.toThrow(
      /Could not resolve chemical name/
    );
  });

  it('applies property filters to structurally matching compounds', async () => {
    const response = await StaticSearchApi.search({
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      threshold: 0,
      filters: { molWeightMax: 100 },
    });

    // Aspirin matches structurally at 1.0 but is filtered out by weight.
    expect(response.results.map(r => r.chembl_id)).not.toContain('CHEMBL25');
  });

  it('refuses to score when the corpus and the fingerprint blob disagree', async () => {
    const shortMetadata = {
      fingerprints: { ...metadata.fingerprints, records: 1 },
    };
    const packed = blob().slice(0, BYTES_PER_RECORD);
    global.fetch = jest.fn((url: unknown) => {
      const href = String(url);
      if (href.endsWith('metadata.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(shortMetadata) });
      }
      if (href.endsWith('compounds.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COMPOUNDS) });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(packed.buffer.slice(0, BYTES_PER_RECORD)),
      });
    }) as unknown as typeof fetch;

    await expect(StaticSearchApi.search({ smiles: 'CCO' })).rejects.toThrow(
      /regenerate both/
    );
  });
});

describe('StaticSearchApi.searchAI', () => {
  it('says why it cannot answer rather than returning a lookalike score', async () => {
    await expect(StaticSearchApi.searchAI()).rejects.toThrow(
      /not available in the static build/
    );
  });
});
