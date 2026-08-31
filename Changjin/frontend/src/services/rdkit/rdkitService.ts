// RDKit Service - loads the RDKit WASM module and renders molecules.
//
// RDKit_minimal.js does NOT expose `window.RDKit` on its own: it defines a
// factory `window.initRDKitModule()` that returns a promise resolving to the
// module. The factory must be called (and awaited) before any molecule can be
// built.
declare global {
  interface Window {
    RDKit?: RDKitInstance;
    initRDKitModule?: (options?: { locateFile?: (file: string) => string }) => Promise<RDKitInstance>;
  }
}

interface RDKitInstance {
  get_mol(smiles: string): RDKitMolecule | null;
  version?: () => string;
}

interface RDKitMolecule {
  is_valid(): boolean;
  get_svg(width: number, height: number): string;
  get_descriptors(): string;
  get_morgan_fp_as_uint8array(details: string): Uint8Array;
  normalize_depiction?: (canonicalize?: number, scaleFactor?: number) => number;
  straighten_depiction?: (minimizeRotation?: boolean) => void;
  delete(): void;
}

export interface RDKitSVGOptions {
  width?: number;
  height?: number;
  bondLength?: number;
  atomColor?: string;
  bondColor?: string;
  backgroundColor?: string;
}

export interface MoleculeProperties {
  molecularWeight: number;
  logP: number;
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  ringCount: number;
  aromaticRingCount: number;
  polarSurfaceArea: number;
  heavyAtoms: number;
}

/** Raw descriptor payload returned by JSMol.get_descriptors(). */
interface RDKitDescriptors {
  amw?: number;
  exactmw?: number;
  CrippenClogP?: number;
  lipinskiHBD?: number;
  NumHBD?: number;
  lipinskiHBA?: number;
  NumHBA?: number;
  NumRotatableBonds?: number;
  NumRings?: number;
  NumAromaticRings?: number;
  tpsa?: number;
  NumHeavyAtoms?: number;
}

/**
 * The query string is not a structure RDKit can parse.
 *
 * Distinguished from every other failure because it is the one the caller can
 * act on: a user who typed a drug name into the SMILES box can still be served
 * by resolving the name first. A load or timeout failure cannot be recovered
 * that way and must surface.
 */
export class InvalidSmilesError extends Error {
  readonly smiles: string;

  constructor(smiles: string) {
    super(`Not a valid SMILES string: ${smiles}`);
    this.name = 'InvalidSmilesError';
    this.smiles = smiles;
  }
}

/** Where to fetch RDKit from: local copy first, CDNs only as a fallback. */
const RDKIT_SOURCES: { js: string; wasmDir: string }[] = [
  {
    js: new URL('rdkit/RDKit_minimal.js', document.baseURI).href,
    wasmDir: new URL('rdkit/', document.baseURI).href,
  },
  {
    js: 'https://unpkg.com/@rdkit/rdkit@2025.3.4-1.0.0/dist/RDKit_minimal.js',
    wasmDir: 'https://unpkg.com/@rdkit/rdkit@2025.3.4-1.0.0/dist/',
  },
  {
    js: 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2025.3.4-1.0.0/dist/RDKit_minimal.js',
    wasmDir: 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2025.3.4-1.0.0/dist/',
  },
];

/** Hard cap per source so a stalled request can never hang the spinner. */
const SCRIPT_TIMEOUT_MS = 20000;
const INIT_TIMEOUT_MS = 45000;

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
};

class RDKitServiceImpl {
  private rdkit: RDKitInstance | null = null;
  private loadPromise: Promise<RDKitInstance> | null = null;

  isLoaded(): boolean {
    return this.rdkit !== null && typeof this.rdkit.get_mol === 'function';
  }

  async loadRDKit(): Promise<RDKitInstance> {
    if (this.rdkit) return this.rdkit;
    // De-duplicate concurrent callers: every MoleculeViewer on the page asks
    // for RDKit at once, but only one download/init should happen.
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadFromSources().catch((error) => {
      // Allow a later retry instead of caching the rejection forever.
      this.loadPromise = null;
      throw error;
    });

    return this.loadPromise;
  }

  private async loadFromSources(): Promise<RDKitInstance> {
    if (window.RDKit && typeof window.RDKit.get_mol === 'function') {
      this.rdkit = window.RDKit;
      return this.rdkit;
    }

    let lastError: unknown = new Error('No RDKit source configured');

    for (const source of RDKIT_SOURCES) {
      try {
        await withTimeout(
          this.loadScript(source.js),
          SCRIPT_TIMEOUT_MS,
          `Timed out loading ${source.js}`
        );

        if (typeof window.initRDKitModule !== 'function') {
          throw new Error('initRDKitModule was not defined by the RDKit script');
        }

        const instance = await withTimeout(
          window.initRDKitModule({ locateFile: (file: string) => `${source.wasmDir}${file}` }),
          INIT_TIMEOUT_MS,
          'Timed out initialising the RDKit WASM module'
        );

        if (!instance || typeof instance.get_mol !== 'function') {
          throw new Error('RDKit module initialised without get_mol()');
        }

        this.rdkit = instance;
        window.RDKit = instance;
        return instance;
      } catch (error) {
        console.warn(`RDKit unavailable from ${source.js}:`, error);
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private loadScript(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (typeof window.initRDKitModule === 'function') {
        resolve();
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(`script[data-rdkit-src="${url}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.rdkitSrc = url;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error(`Failed to load ${url}`));
      };
      document.head.appendChild(script);
    });
  }

  async getMolecule(smiles: string): Promise<RDKitMolecule> {
    const rdkit = this.rdkit ?? (await this.loadRDKit());

    const molecule = rdkit.get_mol(smiles);
    if (!molecule) {
      throw new InvalidSmilesError(smiles);
    }
    if (typeof molecule.is_valid === 'function' && !molecule.is_valid()) {
      molecule.delete();
      throw new InvalidSmilesError(smiles);
    }
    return molecule;
  }

  getSVG(molecule: RDKitMolecule, options: RDKitSVGOptions = {}): string {
    const { width = 250, height = 200 } = options;

    // Tidy the 2D depiction so bonds are evenly scaled inside the viewport.
    try {
      molecule.normalize_depiction?.(1);
      molecule.straighten_depiction?.();
    } catch (error) {
      console.warn('Could not normalise depiction, drawing as-is:', error);
    }

    const svg = molecule.get_svg(width, height);
    if (!svg || !svg.includes('<svg')) {
      throw new Error('RDKit returned an empty drawing');
    }

    return (
      svg
        // The XML prolog is invalid inside an HTML document fragment.
        .replace(/<\?xml[^?]*\?>/, '')
        // Drop RDKit's opaque white backdrop so the card background shows
        // through. Neutralise the fill rather than deleting the element, which
        // would orphan its closing tag.
        .replace("fill:#FFFFFF", 'fill:none')
        .trim()
    );
  }

  /**
   * Morgan fingerprint of a SMILES, as packed bits.
   *
   * The corpus side of the search is fingerprinted offline by Python RDKit
   * (`export_demo_fingerprints.py`); this is the query side. Both builds emit
   * the same `BitVectToBinaryText` layout for the same molecule and the same
   * parameters, which is what lets the two halves be compared at all --
   * `tests/test_demo_fingerprints.py` pins that equality against vectors
   * captured from this WASM build.
   *
   * Geometry is passed in rather than hard-coded so it can come from the
   * export's own metadata, and a regenerated corpus cannot silently disagree
   * with the query.
   */
  async getMorganFingerprint(
    smiles: string,
    { radius, nBits }: { radius: number; nBits: number }
  ): Promise<Uint8Array> {
    const molecule = await this.getMolecule(smiles);
    try {
      return molecule.get_morgan_fp_as_uint8array(JSON.stringify({ radius, nBits }));
    } finally {
      // WASM heap allocation: not reclaimed by the JS garbage collector.
      molecule.delete();
    }
  }

  getProperties(molecule: RDKitMolecule): MoleculeProperties {
    const empty: MoleculeProperties = {
      molecularWeight: 0,
      logP: 0,
      hBondDonors: 0,
      hBondAcceptors: 0,
      rotatableBonds: 0,
      ringCount: 0,
      aromaticRingCount: 0,
      polarSurfaceArea: 0,
      heavyAtoms: 0,
    };

    try {
      const descriptors = JSON.parse(molecule.get_descriptors()) as RDKitDescriptors;
      return {
        molecularWeight: descriptors.amw ?? descriptors.exactmw ?? 0,
        logP: descriptors.CrippenClogP ?? 0,
        hBondDonors: descriptors.lipinskiHBD ?? descriptors.NumHBD ?? 0,
        hBondAcceptors: descriptors.lipinskiHBA ?? descriptors.NumHBA ?? 0,
        rotatableBonds: descriptors.NumRotatableBonds ?? 0,
        ringCount: descriptors.NumRings ?? 0,
        aromaticRingCount: descriptors.NumAromaticRings ?? 0,
        polarSurfaceArea: descriptors.tpsa ?? 0,
        heavyAtoms: descriptors.NumHeavyAtoms ?? 0,
      };
    } catch (error) {
      console.error('Error reading molecule descriptors:', error);
      return empty;
    }
  }

  cleanup(): void {
    this.rdkit = null;
    this.loadPromise = null;
  }
}

export const rdkitService = new RDKitServiceImpl();
