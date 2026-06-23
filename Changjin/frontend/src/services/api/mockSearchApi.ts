import type {
  SearchRequest,
  SearchResponse,
  ResolveRequest,
  ResolveResponse,
  PropertyCalculationRequest,
  CalculatedProperties,
  Compound,
  PostProcessingResult,
} from '../../types/api';

// Mock compound database - realistic chemical data with accurate properties
const MOCK_COMPOUNDS: Compound[] = [
  {
    chembl_id: 'CHEMBL25',
    smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
    similarity: 0.95,
  },
  {
    chembl_id: 'CHEMBL50',
    smiles: 'CCOC(=O)C1=CC=CC=C1C(=O)O',
    similarity: 0.87,
  },
  {
    chembl_id: 'CHEMBL100',
    smiles: 'CN1C(=O)CC2=CC=CC=C21',
    similarity: 0.82,
  },
  {
    chembl_id: 'CHEMBL200',
    smiles: 'O=C(O)C1=CC=CC=C1O',
    similarity: 0.78,
  },
  {
    chembl_id: 'CHEMBL300',
    smiles: 'CC(=O)NC1=CC=CC=C1C(=O)O',
    similarity: 0.75,
  },
  {
    chembl_id: 'CHEMBL400',
    smiles: 'OC(=O)C1=CC=CC=C1C(=O)O',
    similarity: 0.71,
  },
  {
    chembl_id: 'CHEMBL500',
    smiles: 'CC1=CC=C(C=C1)S(=O)(=O)NC2=CC=CC=C2',
    similarity: 0.68,
  },
  {
    chembl_id: 'CHEMBL600',
    smiles: 'CN(C)CCCN1C2=CC=CC=C2CCC3=CC=CC=C13',
    similarity: 0.65,
  },
  {
    chembl_id: 'CHEMBL700',
    smiles: 'CC(=O)OC1=CC=C(C=C1)C(=O)O',
    similarity: 0.62,
  },
  {
    chembl_id: 'CHEMBL800',
    smiles: 'O=C(NC1=CC=CC=C1)C2=CC=CC=C2',
    similarity: 0.59,
  },
];

// Realistic properties for each compound (matching typical RDKit calculations)
const COMPOUND_PROPERTIES: Record<string, CalculatedProperties> = {
  'CHEMBL25': {
    mw: 180.16,
    logp: 1.58,
    hbd: 1,
    hba: 4,
    psa: 63.60,
    rtb: 3,
    heavy_atoms: 13,
    aromatic_rings: 1,
  },
  'CHEMBL50': {
    mw: 194.18,
    logp: 1.92,
    hbd: 1,
    hba: 4,
    psa: 63.60,
    rtb: 4,
    heavy_atoms: 14,
    aromatic_rings: 1,
  },
  'CHEMBL100': {
    mw: 146.19,
    logp: 1.25,
    hbd: 0,
    hba: 2,
    psa: 20.23,
    rtb: 0,
    heavy_atoms: 11,
    aromatic_rings: 2,
  },
  'CHEMBL200': {
    mw: 138.12,
    logp: 1.15,
    hbd: 2,
    hba: 3,
    psa: 60.69,
    rtb: 1,
    heavy_atoms: 10,
    aromatic_rings: 1,
  },
  'CHEMBL300': {
    mw: 179.17,
    logp: 1.52,
    hbd: 2,
    hba: 3,
    psa: 66.40,
    rtb: 2,
    heavy_atoms: 13,
    aromatic_rings: 1,
  },
};

// Mock post-processing results
const MOCK_POST_PROCESSING: PostProcessingResult = {
  ranked_candidates: [
    {
      chembl_id: 'CHEMBL25',
      smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      similarity: 0.95,
      molecular_weight: 180.16,
      logp: 1.58,
      h_bond_donors: 1,
      h_bond_acceptors: 4,
      rotatable_bonds: 3,
      aromatic_rings: 1,
    },
    {
      chembl_id: 'CHEMBL50',
      smiles: 'CCOC(=O)C1=CC=CC=C1C(=O)O',
      similarity: 0.87,
      molecular_weight: 194.18,
      logp: 1.92,
      h_bond_donors: 1,
      h_bond_acceptors: 4,
      rotatable_bonds: 4,
      aromatic_rings: 1,
    },
  ],
  filtered_out: [
    {
      chembl_id: 'CHEMBL999',
      smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      reason: 'Molecular weight too high (>500)',
    },
  ],
  clusters: [
    {
      cluster_id: 1,
      centroid: 'CHEMBL25',
      members: ['CHEMBL25', 'CHEMBL50', 'CHEMBL100'],
      similarity_threshold: 0.8,
    },
  ],
  recommendations: [
    {
      chembl_id: 'CHEMBL25',
      reason: 'High structural similarity and optimal drug-like properties',
      score: 0.95,
    },
  ],
};

// Simulate API delay for realistic UX
const simulateDelay = (ms: number = 800): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export class MockSearchApi {
  static async search(request: SearchRequest): Promise<SearchResponse> {
    await simulateDelay();

    // Filter compounds based on similarity threshold
    const filteredCompounds = MOCK_COMPOUNDS
      .filter(compound => compound.similarity >= (request.threshold || 0.7))
      .slice(0, request.max_results || 20);

    // Apply post-processing if requested
    const response: SearchResponse = {
      count: filteredCompounds.length,
      results: filteredCompounds,
    };

    if (request.enable_post_processing) {
      response.post_processed = MOCK_POST_PROCESSING;
    }

    return response;
  }

  static async searchAI(request: SearchRequest): Promise<SearchResponse> {
    await simulateDelay(1200); // AI search takes longer

    // Return similar results but with different similarity scores
    const aiCompounds = MOCK_COMPOUNDS.map(compound => ({
      ...compound,
      similarity: Math.max(0.5, compound.similarity + (Math.random() - 0.5) * 0.3),
    })).slice(0, request.max_results || 20);

    const response: SearchResponse = {
      count: aiCompounds.length,
      results: aiCompounds,
      post_processed: request.enable_post_processing ? MOCK_POST_PROCESSING : undefined,
    };

    return response;
  }

  static async resolveName(request: ResolveRequest): Promise<ResolveResponse> {
    await simulateDelay(300);

    // Mock name to SMILES resolution
    const nameMappings: Record<string, string> = {
      'aspirin': 'CC(=O)OC1=CC=CC=C1C(=O)O',
      'paracetamol': 'CC(=O)NC1=CC=C(O)C=C1',
      'ibuprofen': 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',
      'caffeine': 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
    };

    const smiles = nameMappings[request.name.toLowerCase()];

    if (smiles) {
      return {
        name: request.name,
        smiles,
        chembl_id: `CHEMBL_${Math.floor(Math.random() * 1000)}`,
      };
    }

    throw new Error(`Could not resolve chemical name: ${request.name}`);
  }

  static async calculateProperties(request: PropertyCalculationRequest): Promise<CalculatedProperties> {
    await simulateDelay(500);

    // Return realistic properties for the SMILES
    const compound = MOCK_COMPOUNDS.find(c => c.smiles === request.smiles);
    if (compound && COMPOUND_PROPERTIES[compound.chembl_id]) {
      return COMPOUND_PROPERTIES[compound.chembl_id];
    }

    // Default properties for unknown compounds
    return {
      mw: 150 + (request.smiles.length * 2),
      logp: -1 + (Math.random() * 4),
      hbd: Math.floor(request.smiles.length / 20),
      hba: Math.floor(request.smiles.length / 15) + 1,
      psa: 50 + (Math.random() * 100),
      rtb: Math.floor(request.smiles.length / 25),
      heavy_atoms: Math.floor(request.smiles.length / 3) + 5,
      aromatic_rings: Math.floor(request.smiles.length / 30),
    };
  }

  static async getFilterableProperties(): Promise<string[]> {
    await simulateDelay(200);

    return [
      'molecular_weight',
      'logp',
      'h_bond_donors',
      'h_bond_acceptors',
      'polar_surface_area',
      'rotatable_bonds',
      'aromatic_rings',
    ];
  }

  static async visualizeMolecule(smiles: string): Promise<string> {
    await simulateDelay(400);

    // Return a simple placeholder SVG that looks like a molecule structure
    const width = 250;
    const height = 200;

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>
      <circle cx="60" cy="80" r="20" fill="#007bff" stroke="#0056b3" stroke-width="2"/>
      <circle cx="120" cy="80" r="18" fill="#28a745" stroke="#1e7e34" stroke-width="2"/>
      <circle cx="180" cy="80" r="16" fill="#dc3545" stroke="#bd2130" stroke-width="2"/>
      <line x1="80" y1="80" x2="102" y2="80" stroke="#6c757d" stroke-width="3"/>
      <line x1="138" y1="80" x2="164" y2="80" stroke="#6c757d" stroke-width="3"/>
      <text x="125" y="140" text-anchor="middle" font-family="Arial" font-size="12" fill="#495057">
        ${smiles.length > 20 ? smiles.substring(0, 20) + '...' : smiles}
      </text>
      <text x="125" y="160" text-anchor="middle" font-family="Arial" font-size="10" fill="#6c757d">
        Mock Structure (RDKit pending)
      </text>
    </svg>`;
  }

  static async healthCheck(): Promise<{ status: string }> {
    await simulateDelay(100);

    return {
      status: 'healthy',
    };
  }
}
