/**
 * Chemical-space projection and clustering over Morgan fingerprints.
 *
 * What this replaces: the scatter plot used to place each compound at
 * `sin(hash(smiles))`, `cos(hash(smiles))` plus `Math.random()` noise, and
 * "clustered" the result by slicing that cloud into five wedges by polar angle.
 * The axes were labelled PC1/PC2. Nothing in it touched chemistry, the layout
 * changed on every re-render, and a scatter of molecules in two dimensions is a
 * standard enough figure that a reader would infer real structure from it.
 *
 * Everything here is computed from the same Morgan fingerprints the search
 * uses, and is deterministic: the same result set always produces the same
 * picture.
 *
 * Both algorithms are O(n²) in the number of points, which is fine because the
 * plot only ever shows one page of results (<= 50). They are not meant for the
 * 5,000-compound corpus.
 */
import { tanimoto } from './fingerprintStore';

/** Upper-triangular pairwise Tanimoto, stored as a full n x n matrix. */
export const similarityMatrix = (fingerprints: Uint8Array[]): Float64Array => {
  const n = fingerprints.length;
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    matrix[i * n + i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      const value = tanimoto(fingerprints[i], fingerprints[j]);
      matrix[i * n + j] = value;
      matrix[j * n + i] = value;
    }
  }
  return matrix;
};

/**
 * Taylor-Butina clustering — the algorithm `post_processing.py` runs server-side
 * via `rdkit.ML.Cluster.Butina`, reimplemented here because the static build has
 * no server to ask.
 *
 * Repeatedly takes the unassigned molecule with the most neighbours within the
 * cutoff as a cluster centre and claims its unassigned neighbours. Molecules
 * left over become singletons, which is a real answer about a result set, not a
 * failure to cluster.
 *
 * Two details exist to match RDKit's output rather than because the algorithm
 * requires them, and `chemicalSpace.test.ts` checks both against clusterings
 * captured from `rdkit.ML.Cluster.Butina`:
 *
 *  - RDKit sorts `(neighbourCount, index)` descending, so equal counts break
 *    towards the *higher* index.
 *  - A molecule needs at least one neighbour to become a centre. RDKit spells
 *    this as "more than one" because its neighbour lists include the point
 *    itself; the lists here do not, so the same rule is off by one.
 *
 * Returns a cluster id per input index, stable across renders.
 */
export const butinaCluster = (
  similarity: Float64Array,
  n: number,
  cutoff: number
): number[] => {
  const neighbours: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const list: number[] = [];
    for (let j = 0; j < n; j += 1) {
      if (i !== j && similarity[i * n + j] >= cutoff) list.push(j);
    }
    neighbours.push(list);
  }

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => neighbours[b].length - neighbours[a].length || b - a
  );

  const assignment = new Array<number>(n).fill(-1);
  let nextCluster = 0;

  for (const centre of order) {
    // RDKit requires more than one neighbour, but its neighbour lists include
    // the point itself (`np.where(dist_matrix[i] <= threshold)` matches the
    // zero-distance diagonal). Excluding self, that is "at least one".
    if (neighbours[centre].length < 1) break; // list is sorted by count
    if (assignment[centre] !== -1) continue;
    assignment[centre] = nextCluster;
    for (const neighbour of neighbours[centre]) {
      if (assignment[neighbour] === -1) assignment[neighbour] = nextCluster;
    }
    nextCluster += 1;
  }

  // Whatever no centre claimed stands alone.
  for (const index of order) {
    if (assignment[index] === -1) {
      assignment[index] = nextCluster;
      nextCluster += 1;
    }
  }
  return assignment;
};

/**
 * Classical multidimensional scaling of a distance matrix into two dimensions.
 *
 * Chosen over t-SNE or UMAP because it is deterministic, has no perplexity or
 * learning-rate to tune, and — the reason that matters here — the axes mean
 * something: distance on the plot approximates 1 − Tanimoto, so two points
 * close together really are structurally similar.
 *
 * Double-centres the squared-distance matrix and takes its two leading
 * eigenvectors by power iteration with deflation. The starting vector is a
 * fixed deterministic sequence rather than random, so repeated runs agree.
 */
export const classicalMDS = (
  distance: Float64Array,
  n: number
): { x: number; y: number }[] => {
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  // B = -1/2 * J D^2 J, computed via row/column/grand means of D^2.
  const squared = new Float64Array(n * n);
  for (let i = 0; i < n * n; i += 1) squared[i] = distance[i] * distance[i];

  const rowMean = new Float64Array(n);
  let grandMean = 0;
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += squared[i * n + j];
    rowMean[i] = sum / n;
    grandMean += sum;
  }
  grandMean /= n * n;

  const gram = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      gram[i * n + j] = -0.5 * (squared[i * n + j] - rowMean[i] - rowMean[j] + grandMean);
    }
  }

  const multiply = (matrix: Float64Array, vector: Float64Array): Float64Array => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let j = 0; j < n; j += 1) sum += matrix[i * n + j] * vector[j];
      out[i] = sum;
    }
    return out;
  };

  const norm = (v: Float64Array): number => Math.hypot(...Array.from(v));

  /** Leading eigenpair by power iteration. */
  const leadingEigen = (matrix: Float64Array, seed: number) => {
    let vector = new Float64Array(n);
    // Deterministic, non-degenerate start: never the all-ones vector, which is
    // orthogonal to every eigenvector of a double-centred matrix.
    for (let i = 0; i < n; i += 1) vector[i] = Math.sin(i + 1 + seed);
    let length = norm(vector);
    if (length === 0) return { value: 0, vector };
    for (let i = 0; i < n; i += 1) vector[i] /= length;

    let value = 0;
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const next = multiply(matrix, vector);
      length = norm(next);
      if (length < 1e-12) return { value: 0, vector };
      for (let i = 0; i < n; i += 1) next[i] /= length;
      // Rayleigh quotient; the vector is unit-length so it is just v·Av.
      const product = multiply(matrix, next);
      let rayleigh = 0;
      for (let i = 0; i < n; i += 1) rayleigh += next[i] * product[i];
      const converged = Math.abs(rayleigh - value) < 1e-10;
      value = rayleigh;
      vector = next;
      if (converged) break;
    }
    return { value, vector };
  };

  const first = leadingEigen(gram, 0);

  // Deflate: B' = B - lambda * v v^T, so the next power iteration finds the
  // second eigenvector rather than the first again.
  const deflated = new Float64Array(gram);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      deflated[i * n + j] -= first.value * first.vector[i] * first.vector[j];
    }
  }
  const second = leadingEigen(deflated, 1);

  // Coordinates are the eigenvectors scaled by the square root of their
  // eigenvalues. A negative eigenvalue means that axis carries no real variance
  // (classical MDS on a non-Euclidean metric can produce them), so it collapses
  // to zero rather than being given an imaginary scale.
  const scaleX = Math.sqrt(Math.max(first.value, 0));
  const scaleY = Math.sqrt(Math.max(second.value, 0));

  return Array.from({ length: n }, (_, i) => ({
    x: first.vector[i] * scaleX,
    y: second.vector[i] * scaleY,
  }));
};

export interface ChemicalSpace {
  points: { x: number; y: number; cluster: number }[];
  clusterCount: number;
  /** Fraction of pairwise distance the two plotted axes actually account for. */
  stress: number;
}

/**
 * Project fingerprints into 2D and cluster them.
 *
 * `stress` is reported so the plot can say how much of the real distance
 * structure survived the projection. Two dimensions cannot hold the geometry of
 * a 1024-bit space, and a scatter plot that does not admit that invites the
 * reader to over-read it.
 */
export const buildChemicalSpace = (
  fingerprints: Uint8Array[],
  cutoff = 0.6
): ChemicalSpace => {
  const n = fingerprints.length;
  if (n === 0) return { points: [], clusterCount: 0, stress: 0 };

  const similarity = similarityMatrix(fingerprints);
  const distance = new Float64Array(n * n);
  for (let i = 0; i < n * n; i += 1) distance[i] = 1 - similarity[i];

  const coordinates = classicalMDS(distance, n);
  const clusters = butinaCluster(similarity, n, cutoff);

  // Kruskal stress-1 between the plotted distances and the true ones.
  let residual = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const plotted = Math.hypot(
        coordinates[i].x - coordinates[j].x,
        coordinates[i].y - coordinates[j].y
      );
      const actual = distance[i * n + j];
      residual += (plotted - actual) ** 2;
      total += actual ** 2;
    }
  }

  return {
    points: coordinates.map((point, i) => ({ ...point, cluster: clusters[i] })),
    clusterCount: new Set(clusters).size,
    stress: total > 0 ? Math.sqrt(residual / total) : 0,
  };
};
