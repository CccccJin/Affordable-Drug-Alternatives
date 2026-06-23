export interface SearchRequest {
  smiles: string;
  threshold?: number;
  metric?: string;
  enable_post_processing?: boolean;
  filters?: PropertyFilters;
  max_results?: number;
}

export interface SearchResponse {
  count: number;
  results: Compound[];
  post_processed?: PostProcessingResult;
}

export interface ResolveRequest {
  name: string;
}

export interface ResolveResponse {
  name: string;
  smiles: string;
  chembl_id: string;
}

export interface PropertyCalculationRequest {
  smiles: string;
}

export interface CalculatedProperties {
  mw: number;           // Molecular weight
  logp: number;         // LogP (octanol-water partition coefficient)
  hbd: number;          // Hydrogen bond donors
  hba: number;          // Hydrogen bond acceptors
  psa: number;          // Polar surface area
  rtb: number;          // Rotatable bonds
  heavy_atoms: number;  // Number of heavy atoms
  aromatic_rings: number; // Number of aromatic rings
}

export interface Compound {
  chembl_id: string;
  smiles: string;
  similarity: number;
}

export interface PostProcessingResult {
  ranked_candidates: Array<Compound & {
    molecular_weight: number;
    logp: number;
    h_bond_donors: number;
    h_bond_acceptors: number;
    rotatable_bonds: number;
    aromatic_rings: number;
  }>;
  filtered_out: Array<{
    chembl_id: string;
    smiles: string;
    reason: string;
  }>;
  clusters: Array<{
    cluster_id: number;
    centroid: string;
    members: string[];
    similarity_threshold: number;
  }>;
  recommendations: Array<{
    chembl_id: string;
    reason: string;
    score: number;
  }>;
}

export interface PropertyFilters {
  molWeightMin?: number;
  molWeightMax?: number;
  logpMin?: number;
  logpMax?: number;
  hbdMin?: number;
  hbdMax?: number;
  hbaMin?: number;
  hbaMax?: number;
  psaMin?: number;
  psaMax?: number;
  rtbMin?: number;
  rtbMax?: number;
}
