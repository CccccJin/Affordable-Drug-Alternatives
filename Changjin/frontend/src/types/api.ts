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
  pref_name?: string | null;
  smiles: string;
  similarity: number;
  molecular_weight?: number | null;
  logp?: number | null;
  polar_surface_area?: number | null;
  h_bond_donors?: number | null;
  h_bond_acceptors?: number | null;
  rotatable_bonds?: number | null;
  aromatic_rings?: number | null;
  heavy_atoms?: number | null;
  cns_mpo?: number | null;
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

// --- Substitutability (FDA Orange Book + CMS NADAC) -------------------------
// The wire format in public/data/substitutability.json uses short keys because
// they are roughly a third of the payload. They are expanded at the parse
// boundary in substitutabilityApi.ts, so components never see them.

export interface PricedMember {
  applicationNumber: string;   // e.g. "NDA020702"
  tradeName: string;
  applicant: string;
  teCode: string;              // Orange Book therapeutic-equivalence code
  isBrand: boolean;            // from NADAC's own classification, not appl_type
  pricePerUnit: number | null; // null when CMS does not survey this product
  pricingUnit: string | null;  // "EA" | "ML" | "GM"
}

export interface EquivalenceGroup {
  ingredient: string;
  dosageForm: string;
  route: string;
  strength: string;
  memberCount: number;
  savingPercent: number | null; // null when no priced brand exists
  members: PricedMember[];
}

export interface SubstitutabilityMeta {
  orangeBook: string;
  nadacWeek: string;
  openFdaNdc: string;
  generated: string;
  priceBasis: string;          // the acquisition-cost disclaimer
  coverage: { groups: number; withSavings: number; members: number };
}

export interface SubstitutabilityData {
  meta: SubstitutabilityMeta;
  groups: EquivalenceGroup[];
  nameIndex: Record<string, number[]>;
}

export type SubstitutabilityResult =
  | { status: 'loading' }
  | { status: 'found'; groups: EquivalenceGroup[]; meta: SubstitutabilityMeta }
  | { status: 'no-coverage'; reason: string }
  | { status: 'error'; message: string };
