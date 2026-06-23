import type {
  SearchRequest,
  SearchResponse,
  ResolveRequest,
  ResolveResponse,
  PropertyCalculationRequest,
  CalculatedProperties,
  Compound,
  PostProcessingResult,
  PropertyFilters,
} from '../../types/api';

type StaticCompoundRecord = Omit<Compound, 'similarity'>;

let compoundsCache: StaticCompoundRecord[] | null = null;

const dataUrl = () => `${import.meta.env.BASE_URL}data/compounds.json`;

const simulateDelay = (ms: number = 120): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeSmiles = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '');

const nameAliases: Record<string, string> = {
  paracetamol: 'acetaminophen',
};

const loadCompounds = async (): Promise<StaticCompoundRecord[]> => {
  if (compoundsCache) {
    return compoundsCache;
  }

  const response = await fetch(dataUrl());
  if (!response.ok) {
    throw new Error(`Could not load static compound data (${response.status})`);
  }

  compoundsCache = await response.json() as StaticCompoundRecord[];
  return compoundsCache;
};

const bounded = (value: number): number => Math.max(0, Math.min(1, value));

const bigramSimilarity = (left: string, right: string): number => {
  if (!left || !right) {
    return 0;
  }

  const grams = (value: string) => {
    const normalized = normalizeSmiles(value);
    if (normalized.length <= 2) {
      return new Set([normalized]);
    }

    const result = new Set<string>();
    for (let i = 0; i < normalized.length - 1; i += 1) {
      result.add(normalized.slice(i, i + 2));
    }
    return result;
  };

  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let intersection = 0;
  leftGrams.forEach(gram => {
    if (rightGrams.has(gram)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(leftGrams.size, rightGrams.size);
};

const scoreCompound = (compound: StaticCompoundRecord, query: string, aiMode = false): number => {
  const querySmiles = normalizeSmiles(query);
  const compoundSmiles = normalizeSmiles(compound.smiles);
  const queryName = normalize(query);
  const compoundName = normalize(compound.pref_name || '');
  const compoundId = normalize(compound.chembl_id);

  if (querySmiles && querySmiles === compoundSmiles) {
    return 1;
  }

  if (queryName && (queryName === compoundName || queryName === compoundId)) {
    return 1;
  }

  if (compoundName && compoundName.includes(queryName)) {
    return 0.96;
  }

  if (compoundId.includes(queryName)) {
    return 0.94;
  }

  if (querySmiles && (compoundSmiles.includes(querySmiles) || querySmiles.includes(compoundSmiles))) {
    return 0.9;
  }

  const structureScore = bigramSimilarity(query, compound.smiles);
  const aiBoost = aiMode ? 0.08 : 0;
  return bounded(0.35 + structureScore * 0.55 + aiBoost);
};

const applyFilters = (compound: Compound, filters?: PropertyFilters): boolean => {
  if (!filters) {
    return true;
  }

  const checks: Array<[number | null | undefined, number | undefined, number | undefined]> = [
    [compound.molecular_weight, filters.molWeightMin, filters.molWeightMax],
    [compound.logp, filters.logpMin, filters.logpMax],
    [compound.h_bond_donors, filters.hbdMin, filters.hbdMax],
    [compound.h_bond_acceptors, filters.hbaMin, filters.hbaMax],
    [compound.polar_surface_area, filters.psaMin, filters.psaMax],
    [compound.rotatable_bonds, filters.rtbMin, filters.rtbMax],
  ];

  return checks.every(([value, min, max]) => {
    if (value == null) {
      return true;
    }
    if (min != null && value < min) {
      return false;
    }
    if (max != null && value > max) {
      return false;
    }
    return true;
  });
};

const buildPostProcessing = (results: Compound[]): PostProcessingResult => ({
  ranked_candidates: results.slice(0, 20).map(compound => ({
    ...compound,
    molecular_weight: compound.molecular_weight || 0,
    logp: compound.logp || 0,
    h_bond_donors: compound.h_bond_donors || 0,
    h_bond_acceptors: compound.h_bond_acceptors || 0,
    rotatable_bonds: compound.rotatable_bonds || 0,
    aromatic_rings: compound.aromatic_rings || 0,
  })),
  filtered_out: [],
  clusters: [
    {
      cluster_id: 1,
      centroid: results[0]?.chembl_id || '',
      members: results.slice(0, 10).map(compound => compound.chembl_id),
      similarity_threshold: 0.7,
    },
  ].filter(cluster => cluster.centroid),
  recommendations: results.slice(0, 5).map(compound => ({
    chembl_id: compound.chembl_id,
    reason: 'Highest ranked match in the static processed ChEMBL export',
    score: compound.similarity,
  })),
});

const toProperties = (compound: StaticCompoundRecord): CalculatedProperties => ({
  mw: compound.molecular_weight || 0,
  logp: compound.logp || 0,
  hbd: compound.h_bond_donors || 0,
  hba: compound.h_bond_acceptors || 0,
  psa: compound.polar_surface_area || 0,
  rtb: compound.rotatable_bonds || 0,
  heavy_atoms: compound.heavy_atoms || 0,
  aromatic_rings: compound.aromatic_rings || 0,
});

export class MockSearchApi {
  static async search(request: SearchRequest): Promise<SearchResponse> {
    await simulateDelay();
    const compounds = await loadCompounds();
    const threshold = request.threshold ?? 0.7;
    const maxResults = request.max_results ?? 50;

    const results = compounds
      .map(compound => ({
        ...compound,
        similarity: scoreCompound(compound, request.smiles),
      }))
      .filter(compound => compound.similarity >= threshold)
      .filter(compound => applyFilters(compound, request.filters))
      .sort((left, right) => right.similarity - left.similarity || left.chembl_id.localeCompare(right.chembl_id))
      .slice(0, maxResults);

    return {
      count: results.length,
      results,
      post_processed: request.enable_post_processing ? buildPostProcessing(results) : undefined,
    };
  }

  static async searchAI(request: SearchRequest): Promise<SearchResponse> {
    await simulateDelay(180);
    const compounds = await loadCompounds();
    const threshold = Math.max(0.5, (request.threshold ?? 0.7) - 0.1);
    const maxResults = request.max_results ?? 50;

    const results = compounds
      .map(compound => ({
        ...compound,
        similarity: scoreCompound(compound, request.smiles, true),
      }))
      .filter(compound => compound.similarity >= threshold)
      .filter(compound => applyFilters(compound, request.filters))
      .sort((left, right) => right.similarity - left.similarity || left.chembl_id.localeCompare(right.chembl_id))
      .slice(0, maxResults);

    return {
      count: results.length,
      results,
      post_processed: request.enable_post_processing ? buildPostProcessing(results) : undefined,
    };
  }

  static async resolveName(request: ResolveRequest): Promise<ResolveResponse> {
    await simulateDelay();
    const compounds = await loadCompounds();
    const requestedName = normalize(nameAliases[normalize(request.name)] || request.name);

    const compound = compounds.find(item => normalize(item.pref_name || '') === requestedName)
      || compounds.find(item => normalize(item.pref_name || '').includes(requestedName))
      || compounds.find(item => normalize(item.chembl_id) === requestedName);

    if (!compound) {
      throw new Error(`Could not resolve chemical name from static data: ${request.name}`);
    }

    return {
      name: compound.pref_name || request.name,
      smiles: compound.smiles,
      chembl_id: compound.chembl_id,
    };
  }

  static async calculateProperties(request: PropertyCalculationRequest): Promise<CalculatedProperties> {
    await simulateDelay();
    const compounds = await loadCompounds();
    const compound = compounds.find(item => normalizeSmiles(item.smiles) === normalizeSmiles(request.smiles));

    if (compound) {
      return toProperties(compound);
    }

    return {
      mw: 150 + (request.smiles.length * 2),
      logp: 1,
      hbd: Math.floor(request.smiles.length / 20),
      hba: Math.floor(request.smiles.length / 15) + 1,
      psa: 50,
      rtb: Math.floor(request.smiles.length / 25),
      heavy_atoms: Math.floor(request.smiles.length / 3) + 5,
      aromatic_rings: Math.floor(request.smiles.length / 30),
    };
  }

  static async getFilterableProperties(): Promise<string[]> {
    await simulateDelay();

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
    await simulateDelay();

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
        Static data preview
      </text>
    </svg>`;
  }

  static async healthCheck(): Promise<{ status: string }> {
    await simulateDelay();

    return {
      status: 'healthy',
    };
  }
}
