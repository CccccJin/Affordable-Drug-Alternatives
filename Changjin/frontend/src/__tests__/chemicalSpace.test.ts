import {
  butinaCluster,
  classicalMDS,
  similarityMatrix,
  buildChemicalSpace,
} from '../services/search/chemicalSpace';

/**
 * The projection replaced a plot whose coordinates were `sin(hash(smiles))`
 * plus `Math.random()`. These assert the two properties that makes it worth
 * looking at: the numbers come from the fingerprints, and the same input always
 * produces the same picture.
 */

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));

/** Four 8-bit fingerprints with hand-checkable overlaps. */
const A = bytes('ff'); // 8 bits
const B = bytes('f0'); // 4 bits, all shared with A
const C = bytes('0f'); // 4 bits, all shared with A, none with B
const D = bytes('00'); // empty

const fromMatrix = (rows: number[][]): Float64Array =>
  Float64Array.from(rows.flat());

describe('similarityMatrix', () => {
  it('puts 1 on the diagonal and is symmetric', () => {
    const m = similarityMatrix([A, B, C]);
    expect(m[0]).toBe(1);
    expect(m[4]).toBe(1);
    expect(m[8]).toBe(1);
    expect(m[1]).toBe(m[3]);
    expect(m[2]).toBe(m[6]);
  });

  it('computes Tanimoto, not something Tanimoto-shaped', () => {
    const m = similarityMatrix([A, B, C]);
    // A&B = 4 bits, A|B = 8 bits -> 0.5
    expect(m[1]).toBeCloseTo(0.5, 12);
    // B&C = 0, B|C = 8 -> 0
    expect(m[5]).toBe(0);
  });
});

describe('butinaCluster', () => {
  it('groups points inside the cutoff and separates those outside', () => {
    // 0 and 1 are close; 2 is far from both.
    const similarity = fromMatrix([
      [1.0, 0.9, 0.1],
      [0.9, 1.0, 0.1],
      [0.1, 0.1, 1.0],
    ]);
    const clusters = butinaCluster(similarity, 3, 0.6);

    expect(clusters[0]).toBe(clusters[1]);
    expect(clusters[2]).not.toBe(clusters[0]);
  });

  it('picks the densest point as the cluster centre', () => {
    // Point 1 neighbours both 0 and 2; 0 and 2 do not neighbour each other.
    const similarity = fromMatrix([
      [1.0, 0.9, 0.1],
      [0.9, 1.0, 0.9],
      [0.1, 0.9, 1.0],
    ]);
    const clusters = butinaCluster(similarity, 3, 0.6);

    // Centre 1 claims both, so all three land together.
    expect(new Set(clusters).size).toBe(1);
  });

  it('leaves an isolated point as its own cluster', () => {
    const similarity = fromMatrix([
      [1.0, 0.1],
      [0.1, 1.0],
    ]);
    expect(new Set(butinaCluster(similarity, 2, 0.6)).size).toBe(2);
  });

  it('is deterministic across runs', () => {
    const similarity = fromMatrix([
      [1.0, 0.7, 0.7, 0.1],
      [0.7, 1.0, 0.7, 0.1],
      [0.7, 0.7, 1.0, 0.1],
      [0.1, 0.1, 0.1, 1.0],
    ]);
    const first = butinaCluster(similarity, 4, 0.6);
    for (let i = 0; i < 5; i += 1) {
      expect(butinaCluster(similarity, 4, 0.6)).toEqual(first);
    }
  });
});

/**
 * Eight real benzodiazepines from the demo corpus, with the clustering
 * `rdkit.ML.Cluster.Butina` produces for them at a 0.4 distance cutoff.
 *
 * Regenerate with:
 *   Butina.ClusterData(dists, n, 0.4, isDistData=True)
 *
 * The pair at the front is the case that exposed an off-by-one: RDKit's
 * neighbour lists include the point itself, so ALPRAZOLAM — whose only other
 * neighbour is TRIAZOLAM — still qualifies as a cluster centre. Reading its
 * rule as "more than one neighbour" literally left the two as singletons.
 */
const RDKIT_NAMES = ['ALPRAZOLAM', 'TRIAZOLAM', 'DIAZEPAM', 'FLUDIAZEPAM', 'NIMETAZEPAM', 'MIDAZOLAM', 'CLOBAZAM', 'TEMAZEPAM'];
const RDKIT_SIMILARITY = fromMatrix([
  [1.000000, 0.765957, 0.580000, 0.421053, 0.383333, 0.500000, 0.310345, 0.446429],
  [0.765957, 1.000000, 0.428571, 0.464286, 0.272727, 0.545455, 0.262295, 0.344262],
  [0.580000, 0.428571, 1.000000, 0.733333, 0.666667, 0.421053, 0.489796, 0.591837],
  [0.421053, 0.464286, 0.733333, 1.000000, 0.490909, 0.596154, 0.415094, 0.454545],
  [0.383333, 0.272727, 0.666667, 0.490909, 1.000000, 0.268657, 0.327586, 0.389831],
  [0.500000, 0.545455, 0.421053, 0.596154, 0.268657, 1.000000, 0.258065, 0.338710],
  [0.310345, 0.262295, 0.489796, 0.415094, 0.327586, 0.258065, 1.000000, 0.388889],
  [0.446429, 0.344262, 0.591837, 0.454545, 0.389831, 0.338710, 0.388889, 1.000000],
]);
const RDKIT_ASSIGNMENT = [1, 1, 0, 0, 0, 4, 3, 2];

/** Two labellings are the same clustering if they agree on every pair. */
const samePartition = (a: number[], b: number[]): boolean =>
  a.every((_, i) => a.every((__, j) => (a[i] === a[j]) === (b[i] === b[j])));

describe('butinaCluster against the RDKit reference', () => {
  it('reproduces rdkit.ML.Cluster.Butina exactly on real fingerprints', () => {
    const mine = butinaCluster(RDKIT_SIMILARITY, RDKIT_NAMES.length, 0.6);
    expect(samePartition(mine, RDKIT_ASSIGNMENT)).toBe(true);
  });

  it('keeps a mutually-isolated pair together rather than splitting it', () => {
    const mine = butinaCluster(RDKIT_SIMILARITY, RDKIT_NAMES.length, 0.6);
    const alprazolam = RDKIT_NAMES.indexOf('ALPRAZOLAM');
    const triazolam = RDKIT_NAMES.indexOf('TRIAZOLAM');

    expect(mine[alprazolam]).toBe(mine[triazolam]);
  });

  it('recovers the 1,4-benzodiazepine core as one cluster', () => {
    const mine = butinaCluster(RDKIT_SIMILARITY, RDKIT_NAMES.length, 0.6);
    const of = (name: string) => mine[RDKIT_NAMES.indexOf(name)];

    expect(of('FLUDIAZEPAM')).toBe(of('DIAZEPAM'));
    expect(of('NIMETAZEPAM')).toBe(of('DIAZEPAM'));
    // A different scaffold does not join them.
    expect(of('CLOBAZAM')).not.toBe(of('DIAZEPAM'));
  });
});

describe('classicalMDS', () => {
  it('reproduces a distance it can embed exactly', () => {
    // Three points on a line at 0, 1, 2 — embeddable in one dimension, so the
    // recovered pairwise distances should match to numerical precision.
    const distance = fromMatrix([
      [0, 1, 2],
      [1, 0, 1],
      [2, 1, 0],
    ]);
    const points = classicalMDS(distance, 3);

    const between = (i: number, j: number) =>
      Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);

    expect(between(0, 1)).toBeCloseTo(1, 6);
    expect(between(1, 2)).toBeCloseTo(1, 6);
    expect(between(0, 2)).toBeCloseTo(2, 6);
  });

  it('recovers a square', () => {
    const s2 = Math.SQRT2;
    const distance = fromMatrix([
      [0, 1, s2, 1],
      [1, 0, 1, s2],
      [s2, 1, 0, 1],
      [1, s2, 1, 0],
    ]);
    const points = classicalMDS(distance, 4);
    const between = (i: number, j: number) =>
      Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);

    expect(between(0, 1)).toBeCloseTo(1, 5);
    expect(between(0, 2)).toBeCloseTo(s2, 5);
  });

  it('is deterministic — no Math.random anywhere in the layout', () => {
    const distance = fromMatrix([
      [0, 0.4, 0.9],
      [0.4, 0, 0.7],
      [0.9, 0.7, 0],
    ]);
    const first = classicalMDS(distance, 3);
    for (let i = 0; i < 5; i += 1) {
      expect(classicalMDS(distance, 3)).toEqual(first);
    }
  });

  it('handles degenerate sizes without throwing', () => {
    expect(classicalMDS(new Float64Array(), 0)).toEqual([]);
    expect(classicalMDS(Float64Array.from([0]), 1)).toEqual([{ x: 0, y: 0 }]);
  });

  it('collapses identical points onto each other', () => {
    const distance = fromMatrix([
      [0, 0, 1],
      [0, 0, 1],
      [1, 1, 0],
    ]);
    const points = classicalMDS(distance, 3);
    expect(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)).toBeCloseTo(0, 6);
  });
});

describe('buildChemicalSpace', () => {
  it('places structurally identical fingerprints together', () => {
    const space = buildChemicalSpace([A, A, C]);
    const [p0, p1, p2] = space.points;

    expect(Math.hypot(p0.x - p1.x, p0.y - p1.y)).toBeCloseTo(0, 6);
    expect(p0.cluster).toBe(p1.cluster);
    expect(Math.hypot(p0.x - p2.x, p0.y - p2.y)).toBeGreaterThan(0.1);
  });

  it('reports stress so the plot can qualify itself', () => {
    const space = buildChemicalSpace([A, B, C, D]);
    expect(space.stress).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(space.stress)).toBe(true);
  });

  it('returns one point per input, in input order', () => {
    const space = buildChemicalSpace([A, B, C, D]);
    expect(space.points).toHaveLength(4);
    expect(space.clusterCount).toBeGreaterThan(0);
  });

  it('is deterministic end to end', () => {
    const first = buildChemicalSpace([A, B, C, D]);
    expect(buildChemicalSpace([A, B, C, D])).toEqual(first);
  });

  it('survives an empty result set', () => {
    expect(buildChemicalSpace([])).toEqual({ points: [], clusterCount: 0, stress: 0 });
  });
});
