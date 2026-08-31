import { jest } from '@jest/globals';

/**
 * Export tests.
 *
 * The point of every case here is that a number in an exported file must come
 * from the compound record. The previous implementation derived properties from
 * `smiles.length` and drew LogP from `Math.random()`, so a file disagreed with
 * itself between exports — and unlike a mis-rendered screen, a file gets kept
 * and shared.
 */

// A real aspirin molblock, captured from @rdkit/rdkit 2025.3.4. Instantiating
// the 6.9 MB WASM build under jsdom is not what these assert.
const ASPIRIN_MOLBLOCK = [
  '',
  '     RDKit          2D',
  '',
  ' 13 13  0  0  0  0  0  0  0  0999 V2000',
  '    5.2500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0',
  'M  END',
  '',
].join('\n');

const getMolecule = jest.fn(async (smiles: string) => {
  if (smiles === 'BAD') throw new Error(`Not a valid SMILES string: ${smiles}`);
  return { get_molblock: () => ASPIRIN_MOLBLOCK, delete: jest.fn() };
});

jest.unstable_mockModule('../services/rdkit/rdkitService', () => ({
  rdkitService: { getMolecule },
  InvalidSmilesError: class extends Error {},
}));

const { ExportService } = await import('../services/export/ExportService');

const ASPIRIN = {
  chembl_id: 'CHEMBL25',
  pref_name: 'ASPIRIN',
  smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  similarity: 1,
  molecular_weight: 180.159,
  logp: 1.31,
  polar_surface_area: 63.6,
  h_bond_donors: 1,
  h_bond_acceptors: 3,
  rotatable_bonds: 2,
  aromatic_rings: 1,
  heavy_atoms: 13,
};

/** A record the static export has no descriptors for. */
const SPARSE = {
  chembl_id: 'CHEMBL999',
  pref_name: null,
  smiles: 'CCO',
  similarity: 0.4,
  molecular_weight: null,
  logp: null,
};

let downloaded: { content: string; filename: string; mimeType: string } | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  downloaded = null;
  global.URL.createObjectURL = jest.fn(() => 'blob:x') as unknown as typeof URL.createObjectURL;
  global.URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
  // Capture the payload instead of driving a real download.
  jest.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => node) as never);
  jest.spyOn(document.body, 'removeChild').mockImplementation(((node: Node) => node) as never);
  jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = { href: '', download: '', click: jest.fn() } as unknown as HTMLElement;
    if (tag === 'a') return element;
    return {} as HTMLElement;
  }) as never);
  global.Blob = class {
    constructor(parts: string[], opts: { type: string }) {
      downloaded = { content: parts.join(''), filename: '', mimeType: opts.type };
    }
  } as unknown as typeof Blob;
});

describe('CSV export', () => {
  it('writes the record’s own property values', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'csv', includeProperties: true });
    const [header, row] = downloaded!.content.split('\n');

    expect(header).toContain('Molecular_Weight');
    expect(row).toContain('180.159');
    expect(row).toContain('1.310'); // real LogP, not a random draw
    expect(row).toContain('63.60');
  });

  it('is deterministic — the same compound exports identically twice', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'csv', includeProperties: true });
    const first = downloaded!.content;
    await ExportService.exportCompounds([ASPIRIN], { format: 'csv', includeProperties: true });

    expect(downloaded!.content).toBe(first);
  });

  it('leaves a missing property empty rather than inventing one', async () => {
    await ExportService.exportCompounds([SPARSE], { format: 'csv', includeProperties: true });
    const row = downloaded!.content.split('\n')[1];

    // ChEMBL999,,CCO,0.4000,,,,,,,, — every property field blank.
    expect(row.endsWith(',,,,,,,,')).toBe(true);
    expect(row).not.toMatch(/\d+\.\d+,\s*$/);
  });

  it('carries the preferred name, which the old export dropped', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'csv' });
    expect(downloaded!.content.split('\n')[0]).toContain('Preferred_Name');
    expect(downloaded!.content.split('\n')[1]).toContain('ASPIRIN');
  });

  it('escapes a field containing a comma', async () => {
    await ExportService.exportCompounds(
      [{ ...ASPIRIN, pref_name: 'ASPIRIN, ACETYL' }],
      { format: 'csv' }
    );
    expect(downloaded!.content).toContain('"ASPIRIN, ACETYL"');
  });
});

describe('SDF export', () => {
  it('writes a real molblock, not the SMILES string', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'sdf', includeProperties: true });

    expect(downloaded!.content).toContain('V2000');
    expect(downloaded!.content).toContain('M  END');
    expect(getMolecule).toHaveBeenCalledWith(ASPIRIN.smiles);
  });

  it('puts the identifier on the molblock title line', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'sdf' });
    expect(downloaded!.content.split('\n')[0]).toBe('CHEMBL25');
  });

  it('terminates every record with $$$$', async () => {
    await ExportService.exportCompounds([ASPIRIN, ASPIRIN], { format: 'sdf' });
    expect(downloaded!.content.match(/^\$\$\$\$$/gm)).toHaveLength(2);
  });

  it('never invents a PubChem identifier', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'sdf', includeProperties: true });
    expect(downloaded!.content).not.toContain('PUBCHEM_COMPOUND_CID');
  });

  it('omits a property tag rather than writing an empty one', async () => {
    await ExportService.exportCompounds([SPARSE], { format: 'sdf', includeProperties: true });
    expect(downloaded!.content).not.toContain('Molecular_Weight');
  });

  it('reports the records it could not build a structure for', async () => {
    const result = await ExportService.exportCompounds(
      [ASPIRIN, { ...SPARSE, smiles: 'BAD' }],
      { format: 'sdf' }
    );

    expect(result.written).toBe(1);
    expect(result.skipped).toEqual([
      { chembl_id: 'CHEMBL999', reason: 'Not a valid SMILES string: BAD' },
    ]);
  });

  it('refuses to write a file when nothing could be built', async () => {
    await expect(
      ExportService.exportCompounds([{ ...SPARSE, smiles: 'BAD' }], { format: 'sdf' })
    ).rejects.toThrow(/nothing to write/);
  });
});

describe('JSON export', () => {
  it('writes the record’s own property values', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'json', includeProperties: true });
    const parsed = JSON.parse(downloaded!.content);

    expect(parsed.compounds[0].properties.molecular_weight).toBe(180.159);
    expect(parsed.compounds[0].properties.logp).toBe(1.31);
    expect(parsed.compounds[0].pref_name).toBe('ASPIRIN');
  });

  it('writes null for a property the export does not carry', async () => {
    await ExportService.exportCompounds([SPARSE], { format: 'json', includeProperties: true });
    const parsed = JSON.parse(downloaded!.content);

    expect(parsed.compounds[0].properties.molecular_weight).toBeNull();
    expect(parsed.compounds[0].properties.logp).toBeNull();
  });

  it('records how similarity was computed', async () => {
    await ExportService.exportCompounds([ASPIRIN], { format: 'json' });
    expect(JSON.parse(downloaded!.content).metadata.source).toMatch(/Morgan\/Tanimoto/);
  });
});
