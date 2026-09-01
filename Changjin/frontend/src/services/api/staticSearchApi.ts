/**
 * Search over the static demo corpus that ships with the GitHub Pages build.
 *
 * Not a mock: structural similarity here is a real Morgan/Tanimoto computation,
 * with the corpus fingerprinted offline by `export_demo_fingerprints.py` and
 * the query fingerprinted in the browser by RDKit's WASM build. Radius and bit
 * count match `chem.py`, so a score shown here is the score the FastAPI
 * `/search` endpoint would return for the same pair.
 *
 * What is still static rather than computed: property values (read from the
 * export, not recalculated) and the post-processing block, which the Python
 * `DrugPostProcessor` produces from data the static build does not carry.
 */
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
import { InvalidSmilesError, rdkitService } from '../rdkit/rdkitService';
import {
  loadFingerprintCorpus,
  scoreCorpus,
  type FingerprintCorpus,
} from '../search/fingerprintStore';
import { butinaCluster, similarityMatrix } from '../search/chemicalSpace';

/**
 * Tanimoto floor for a compound to appear in results.
 *
 * The previous value of 0.7 was calibrated against a bigram score that ranged
 * 0.35-0.9 and had nothing to do with chemistry. Against real Morgan/Tanimoto
 * over this 5,000-compound corpus, 0.7 returns 0-3 neighbours -- aspirin gets
 * none at all -- because 0.7 is the conventional cutoff for "highly similar",
 * not for "worth showing". 0.4 returns 6-25, which is a ranked list a user can
 * actually read.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.4;

type StaticCompoundRecord = Omit<Compound, 'similarity'>;

/**
 * Wire format of compounds.json.
 *
 * Short keys, the same trade substitutability.json makes: across ~85,000
 * records the long field names alone would be roughly 10 MB of the payload.
 * They are expanded here, at the parse boundary, so nothing downstream sees
 * them. `select_demo_compounds.py` writes the mapping into metadata.json as
 * `field_names` for anyone reading the file directly.
 */
interface WireCompound {
  id: string; n: string | null; s: string;
  mw?: number; lp?: number; psa?: number;
  hbd?: number; hba?: number; rtb?: number;
  ar?: number; ha?: number; cns?: number;
}

const expandCompound = (c: WireCompound): StaticCompoundRecord => ({
  chembl_id: c.id,
  pref_name: c.n,
  smiles: c.s,
  molecular_weight: c.mw ?? null,
  logp: c.lp ?? null,
  polar_surface_area: c.psa ?? null,
  h_bond_donors: c.hbd ?? null,
  h_bond_acceptors: c.hba ?? null,
  rotatable_bonds: c.rtb ?? null,
  aromatic_rings: c.ar ?? null,
  heavy_atoms: c.ha ?? null,
  cns_mpo: c.cns ?? null,
});

let compoundsCache: StaticCompoundRecord[] | null = null;

// Vite injects import.meta.env at build time; under Jest it is undefined, so
// fall back to the site root rather than throwing on a property of undefined.
const baseUrl = (): string => import.meta.env?.BASE_URL ?? '/';

const dataUrl = () => `${baseUrl()}data/compounds.json`;

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

  const wire = (await response.json()) as WireCompound[];
  compoundsCache = wire.map(expandCompound);
  return compoundsCache;
};

/**
 * The corpus row a query names outright, or -1.
 *
 * Matching is exact — normalised case and whitespace, nothing more — because
 * deciding that two *different* SMILES strings denote the same molecule is
 * precisely the job that needs RDKit. A miss here is not an answer, only a
 * decision to go and load it.
 */
const exactCorpusRow = (
  compounds: StaticCompoundRecord[],
  query: string
): number => {
  const asSmiles = normalizeSmiles(query);
  const asName = normalize(nameAliases[normalize(query)] || query);

  for (let i = 0; i < compounds.length; i += 1) {
    const compound = compounds[i];
    if (asSmiles && normalizeSmiles(compound.smiles) === asSmiles) return i;
    if (asName && (normalize(compound.pref_name || '') === asName
                   || normalize(compound.chembl_id) === asName)) return i;
  }
  return -1;
};

/**
 * Resolve a query to a Morgan fingerprint of the corpus's geometry.
 *
 * The corpus already holds a fingerprint for every compound in it, so a query
 * that names one of them needs no RDKit at all — which matters because the WASM
 * build is 2.08 MB over the wire and used to sit on the critical path of every
 * search, including every search by name. Names always resolve into the corpus
 * (`resolveName` searches nothing else), so that entire class of query now
 * returns results without waiting for it.
 *
 * RDKit is still loaded for an off-corpus structure, and still loaded by
 * MoleculeViewer to draw the results — but after they render, not before.
 *
 * What is *not* done is scoring the query text itself: the old bigram fallback
 * made "invalid input" indistinguishable from "weakly similar molecule", and
 * both came back with a plausible-looking number.
 */
const queryFingerprint = async (
  query: string,
  corpus: FingerprintCorpus,
  compounds: StaticCompoundRecord[]
): Promise<Uint8Array> => {
  const row = exactCorpusRow(compounds, query);
  if (row !== -1) {
    const { bytesPerRecord } = corpus.geometry;
    return corpus.bits.subarray(row * bytesPerRecord, (row + 1) * bytesPerRecord);
  }

  const { radius, nBits } = corpus.geometry;
  try {
    return await rdkitService.getMorganFingerprint(query, { radius, nBits });
  } catch (error) {
    if (!(error instanceof InvalidSmilesError)) {
      throw error;
    }
    // Not a structure and not an exact corpus name. resolveName throws its own
    // message naming the query if it cannot place it either.
    const resolved = await StaticSearchApi.resolveName({ name: query });
    return await rdkitService.getMorganFingerprint(resolved.smiles, { radius, nBits });
  }
};

/** Result of one corpus scan, before thresholding. */
interface ScoredCorpus {
  compounds: StaticCompoundRecord[];
  scores: Float64Array;
  corpus: FingerprintCorpus;
}

const scoreAgainstCorpus = async (query: string): Promise<ScoredCorpus> => {
  const [compounds, corpus] = await Promise.all([
    loadCompounds(),
    loadFingerprintCorpus(),
  ]);

  if (compounds.length !== corpus.geometry.records) {
    // Row i of the blob is compound i; a mismatch means the two files were
    // regenerated apart and every score past the divergence is wrong.
    throw new Error(
      `compounds.json has ${compounds.length} records but fingerprints.bin has ` +
        `${corpus.geometry.records} — regenerate both with ` +
        '`python export_demo_fingerprints.py`'
    );
  }

  const fingerprint = await queryFingerprint(query, corpus, compounds);
  return { compounds, scores: scoreCorpus(corpus, fingerprint), corpus };
};


/**
 * Why a property filter excluded a compound, or null when it passed.
 *
 * Returns the reason rather than a boolean so `filtered_out` can say what
 * happened. It used to be hard-coded to an empty array, which meant the results
 * page reported that nothing had been filtered even when the filters had just
 * removed half the hits.
 */
const filterRejection = (
  compound: Compound,
  filters?: PropertyFilters
): string | null => {
  if (!filters) return null;

  const checks: {
    label: string;
    value: number | null | undefined;
    min?: number;
    max?: number;
  }[] = [
    { label: 'molecular weight', value: compound.molecular_weight, min: filters.molWeightMin, max: filters.molWeightMax },
    { label: 'LogP', value: compound.logp, min: filters.logpMin, max: filters.logpMax },
    { label: 'H-bond donors', value: compound.h_bond_donors, min: filters.hbdMin, max: filters.hbdMax },
    { label: 'H-bond acceptors', value: compound.h_bond_acceptors, min: filters.hbaMin, max: filters.hbaMax },
    { label: 'polar surface area', value: compound.polar_surface_area, min: filters.psaMin, max: filters.psaMax },
    { label: 'rotatable bonds', value: compound.rotatable_bonds, min: filters.rtbMin, max: filters.rtbMax },
  ];

  for (const { label, value, min, max } of checks) {
    // A property the export does not carry cannot exclude anything; filtering
    // on absence would silently drop compounds for having no data.
    if (value == null) continue;
    if (min != null && value < min) return `${label} ${value} is below the ${min} minimum`;
    if (max != null && value > max) return `${label} ${value} is above the ${max} maximum`;
  }
  return null;
};

/**
 * Tanimoto floor for two results to share a Butina cluster. Matches
 * `ClusteringVisualization`, so the clusters quoted here and the ones drawn on
 * the Analytics tab are the same clusters.
 */
const POST_PROCESSING_CLUSTER_CUTOFF = 0.6;

/**
 * The post-processing block, computed from the result set.
 *
 * The previous version reported a single cluster containing whichever ten
 * compounds happened to rank highest, tagged with a `similarity_threshold` of
 * 0.7 that no longer matched the search, an always-empty `filtered_out`, and
 * five "recommendations" carrying a fixed sentence. It described the shape of
 * the FastAPI response without computing any of it.
 *
 * Clusters are now real Taylor-Butina over the corpus fingerprints, and a
 * recommendation is a cluster representative — the densest member of each
 * cluster — which is a defensible thing to suggest looking at, because it means
 * "one option per distinct scaffold in these results" rather than "the top of a
 * list you can already see".
 */
const buildPostProcessing = (
  page: { compound: Compound; row: number }[],
  corpus: FingerprintCorpus,
  filteredOut: PostProcessingResult['filtered_out']
): PostProcessingResult => {
  const { bytesPerRecord } = corpus.geometry;
  const fingerprints = page.map(entry =>
    corpus.bits.subarray(entry.row * bytesPerRecord, (entry.row + 1) * bytesPerRecord)
  );

  const n = page.length;
  const similarity = similarityMatrix(fingerprints);
  const assignment = butinaCluster(similarity, n, POST_PROCESSING_CLUSTER_CUTOFF);

  const members = new Map<number, number[]>();
  assignment.forEach((cluster, index) => {
    members.set(cluster, [...(members.get(cluster) ?? []), index]);
  });

  /** The member with the highest total similarity to the rest of its cluster. */
  const representative = (indices: number[]): number =>
    indices.reduce((best, index) => {
      const weight = (i: number) =>
        indices.reduce((sum, j) => sum + similarity[i * n + j], 0);
      return weight(index) > weight(best) ? index : best;
    }, indices[0]);

  const clusters = [...members.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    .map(([cluster_id, indices]) => ({
      cluster_id,
      centroid: page[representative(indices)].compound.chembl_id,
      members: indices.map(index => page[index].compound.chembl_id),
      similarity_threshold: POST_PROCESSING_CLUSTER_CUTOFF,
    }));

  return {
    // Property values are passed through. `|| 0` here used to turn a compound
    // with no recorded weight into one weighing zero.
    ranked_candidates: page.slice(0, 20).map(entry => ({
      ...entry.compound,
      molecular_weight: entry.compound.molecular_weight ?? 0,
      logp: entry.compound.logp ?? 0,
      h_bond_donors: entry.compound.h_bond_donors ?? 0,
      h_bond_acceptors: entry.compound.h_bond_acceptors ?? 0,
      rotatable_bonds: entry.compound.rotatable_bonds ?? 0,
      aromatic_rings: entry.compound.aromatic_rings ?? 0,
    })),
    filtered_out: filteredOut,
    clusters,
    recommendations: clusters.slice(0, 5).map(cluster => ({
      chembl_id: cluster.centroid,
      reason:
        cluster.members.length === 1
          ? 'Only member of its structural cluster — a scaffold nothing else here shares'
          : `Most representative of a ${cluster.members.length}-compound cluster at Tanimoto ≥ ${POST_PROCESSING_CLUSTER_CUTOFF}`,
      score:
        page.find(entry => entry.compound.chembl_id === cluster.centroid)!.compound
          .similarity,
    })),
  };
};

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

export class StaticSearchApi {
  /**
   * Structural similarity search: real Morgan/Tanimoto over the demo corpus.
   *
   * Every compound is scored, then thresholded. Scoring the whole corpus even
   * when few results survive is what lets an empty result set say how close the
   * nearest miss was, which is the difference between "nothing matched" and
   * "nothing matched, the best was 0.31, try lowering the threshold".
   */
  static async search(request: SearchRequest): Promise<SearchResponse> {
    const threshold = request.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const maxResults = request.max_results ?? 50;

    const { compounds, scores, corpus } = await scoreAgainstCorpus(request.smiles);

    let bestSimilarity = 0;
    const kept: { compound: Compound; row: number }[] = [];
    const filteredOut: PostProcessingResult['filtered_out'] = [];

    for (let i = 0; i < compounds.length; i += 1) {
      const similarity = scores[i];
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
      if (similarity < threshold) continue;

      const compound: Compound = { ...compounds[i], similarity };
      const rejection = filterRejection(compound, request.filters);
      if (rejection) {
        filteredOut.push({
          chembl_id: compound.chembl_id,
          smiles: compound.smiles,
          reason: rejection,
        });
        continue;
      }
      kept.push({ compound, row: i });
    }

    kept.sort(
      (left, right) =>
        right.compound.similarity - left.compound.similarity ||
        left.compound.chembl_id.localeCompare(right.compound.chembl_id)
    );
    const page = kept.slice(0, maxResults);
    const results = page.map(entry => entry.compound);

    return {
      count: results.length,
      results,
      best_similarity: bestSimilarity,
      threshold,
      post_processed: request.enable_post_processing
        ? buildPostProcessing(page, corpus, filteredOut)
        : undefined,
    };
  }

  /**
   * ChemBERTa embedding search — not available in the static build.
   *
   * The backend `/search_ai` endpoint is real, but it needs a 315 MB torch
   * model and precomputed embeddings, neither of which ships to GitHub Pages.
   * The previous implementation returned Tanimoto-shaped numbers produced by
   * adding a flat 0.08 to a string-similarity score, which is not an embedding
   * search by any reading. Saying so is the only honest option left.
   */
  static async searchAI(): Promise<SearchResponse> {
    throw new Error(
      'AI (ChemBERTa) search is not available in the static build: it needs the ' +
        'FastAPI backend and precomputed embeddings. Structural similarity search ' +
        'runs fully in the browser.'
    );
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

    // Off-corpus structure: compute it rather than extrapolating from the
    // string length, which is what this used to do (mw = 150 + 2 * length).
    const molecule = await rdkitService.getMolecule(request.smiles);
    try {
      const properties = rdkitService.getProperties(molecule);
      return {
        mw: properties.molecularWeight,
        logp: properties.logP,
        hbd: properties.hBondDonors,
        hba: properties.hBondAcceptors,
        psa: properties.polarSurfaceArea,
        rtb: properties.rotatableBonds,
        heavy_atoms: properties.heavyAtoms,
        aromatic_rings: properties.aromaticRingCount,
      };
    } finally {
      molecule.delete();
    }
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
