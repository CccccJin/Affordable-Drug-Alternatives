// RDKit Service - Improved CDN loading with multiple fallbacks
declare global {
  interface Window {
    RDKit: RDKitInstance;
  }
}

// Define proper interfaces for RDKit objects
interface RDKitInstance {
  get_mol(smiles: string): RDKitMolecule | null;
  delete(): void;
}

interface RDKitMolecule {
  get_svg_with_highlights(options: string): string;
  get_prop(propName: string): string | null;
  delete(): void;
}

export interface RDKitService {
  isLoaded(): boolean;
  getMolecule(smiles: string): Promise<RDKitMolecule>;
  getSVG(molecule: RDKitMolecule, options?: RDKitSVGOptions): string;
  getProperties(molecule: RDKitMolecule): MoleculeProperties;
  cleanup(): void;
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
}

class RDKitServiceImpl implements RDKitService {
  private rdkit: RDKitInstance | null = null;
  private isLoading = false;
  private loadPromise: Promise<RDKitInstance> | null = null;

  async loadRDKit(): Promise<RDKitInstance> {
    if (this.rdkit) {
      return this.rdkit;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;

    this.loadPromise = new Promise<RDKitInstance>((resolve, reject) => {
      // Check if RDKit is already available globally
      if (window.RDKit && typeof window.RDKit.get_mol === 'function') {
        this.rdkit = window.RDKit;
        console.log('RDKit already loaded globally');
        resolve(window.RDKit);
        return;
      }

      // Try multiple CDN URLs with fallbacks
      this.loadRDKitWithFallbacks().then((rdkitInstance: RDKitInstance) => {
        this.rdkit = rdkitInstance;
        window.RDKit = rdkitInstance;
        console.log('RDKit loaded from CDN successfully');
        resolve(rdkitInstance);
      }).catch((error: unknown) => {
        console.error('Failed to load RDKit from all CDN sources:', error);
        this.isLoading = false;
        this.loadPromise = null;
        reject(error);
      });
    });

    return this.loadPromise;
  }

  private async loadRDKitWithFallbacks(): Promise<RDKitInstance> {
    // Try multiple CDN URLs in order of preference
    const cdnUrls = [
      'https://unpkg.com/@rdkit/rdkit@2024.3.5/dist/RDKit_minimal.js',
      'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5/dist/RDKit_minimal.js',
      'https://unpkg.com/@rdkit/rdkit@latest/dist/RDKit_minimal.js',
      'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@latest/dist/RDKit_minimal.js'
    ];

    for (const url of cdnUrls) {
      try {
        console.log(`Trying to load RDKit from: ${url}`);
        const result = await this.loadScript(url);
        console.log(`Successfully loaded RDKit from: ${url}`);
        return result;
      } catch (error) {
        console.warn(`Failed to load RDKit from ${url}:`, error);
        // Continue to next URL
      }
    }

    throw new Error('Failed to load RDKit from all CDN sources');
  }

  private async loadScript(url: string): Promise<RDKitInstance> {
    return new Promise<RDKitInstance>((resolve, reject) => {
      // Check if already loaded
      if (window.RDKit && typeof window.RDKit.get_mol === 'function') {
        resolve(window.RDKit);
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      
      script.onload = () => {
        console.log(`Script loaded successfully: ${url}`);
        // Wait for RDKit to be available globally
        const checkRDKit = () => {
          if (window.RDKit && typeof window.RDKit.get_mol === 'function') {
            console.log('RDKit instance found in global scope');
            resolve(window.RDKit);
          } else if (window.RDKit) {
            console.log('RDKit found but get_mol method not available yet, waiting...');
            setTimeout(checkRDKit, 200);
          } else {
            console.log('RDKit not found in global scope yet, waiting...');
            setTimeout(checkRDKit, 200);
          }
        };
        
        // Start checking immediately and then with longer intervals
        setTimeout(checkRDKit, 100);
      };
      
      script.onerror = (event) => {
        console.error(`Script failed to load: ${url}`, event);
        reject(new Error(`Failed to load RDKit from ${url}`));
      };
      
      document.head.appendChild(script);
    });
  }

  isLoaded(): boolean {
    return this.rdkit !== null && typeof this.rdkit.get_mol === 'function';
  }

  async getMolecule(smiles: string): Promise<RDKitMolecule> {
    if (!this.rdkit) {
      await this.loadRDKit();
    }

    if (!this.rdkit) {
      throw new Error('RDKit not loaded');
    }

    try {
      const molecule = this.rdkit.get_mol(smiles);
      if (!molecule) {
        throw new Error(`Invalid SMILES: ${smiles}`);
      }
      return molecule;
    } catch (error) {
      console.error('Error creating molecule:', error);
      throw error;
    }
  }

  getSVG(molecule: RDKitMolecule, options: RDKitSVGOptions = {}): string {
    if (!this.rdkit) {
      throw new Error('RDKit not loaded');
    }

    const {
      width = 250,
      height = 200,
      bondLength = 30,
      atomColor = '#000000',
      bondColor = '#000000',
      backgroundColor = 'transparent',
    } = options;

    try {
      if (typeof molecule.get_svg_with_highlights === 'function') {
        const svg = molecule.get_svg_with_highlights(JSON.stringify({
          width,
          height,
          bondLength,
          atomColor,
          bondColor,
          backgroundColor,
        }));
        return svg;
      } else {
        throw new Error('get_svg_with_highlights method not available');
      }
    } catch (error) {
      console.error('Error generating SVG:', error);
      return this.getFallbackSVG(options);
    }
  }

  getProperties(molecule: RDKitMolecule): MoleculeProperties {
    if (!this.rdkit) {
      throw new Error('RDKit not loaded');
    }

    try {
      if (typeof molecule.get_prop === 'function') {
        return {
          molecularWeight: parseFloat(molecule.get_prop('_Name') || '0'),
          logP: parseFloat(molecule.get_prop('logP') || '0'),
          hBondDonors: parseInt(molecule.get_prop('hbd') || '0'),
          hBondAcceptors: parseInt(molecule.get_prop('hba') || '0'),
          rotatableBonds: parseInt(molecule.get_prop('rtb') || '0'),
          ringCount: parseInt(molecule.get_prop('ring_count') || '0'),
          aromaticRingCount: parseInt(molecule.get_prop('aromatic_ring_count') || '0'),
        };
      } else {
        return {
          molecularWeight: 0,
          logP: 0,
          hBondDonors: 0,
          hBondAcceptors: 0,
          rotatableBonds: 0,
          ringCount: 0,
          aromaticRingCount: 0,
        };
      }
    } catch (error) {
      console.error('Error getting properties:', error);
      return {
        molecularWeight: 0,
        logP: 0,
        hBondDonors: 0,
        hBondAcceptors: 0,
        rotatableBonds: 0,
        ringCount: 0,
        aromaticRingCount: 0,
      };
    }
  }

  cleanup(): void {
    if (this.rdkit && typeof this.rdkit.delete === 'function') {
      this.rdkit.delete();
    }
    this.rdkit = null;
    this.isLoading = false;
    this.loadPromise = null;
  }

  private getFallbackSVG(options: RDKitSVGOptions): string {
    const { width = 250, height = 200 } = options;

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>
      <circle cx="${width/2}" cy="${height/2 - 20}" r="20" fill="#6c757d"/>
      <text x="${width/2}" y="${height/2 + 15}" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">
        Structure Preview
      </text>
      <text x="${width/2}" y="${height/2 + 35}" text-anchor="middle" font-family="Arial" font-size="10" fill="#adb5bd">
        (RDKit not available)
      </text>
    </svg>`;
  }
}

// Singleton instance
export const rdkitService = new RDKitServiceImpl();
