import { useState, useEffect, useCallback } from 'react';
import { rdkitService, type MoleculeProperties } from '../services/rdkit/rdkitService';

export interface UseRDKitReturn {
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  loadRDKit: () => Promise<void>;
  getMoleculeSVG: (smiles: string, options?: RDKitSVGOptions) => Promise<string>;
  getMoleculeProperties: (smiles: string) => Promise<MoleculeProperties>;
}

export interface RDKitSVGOptions {
  width?: number;
  height?: number;
  bondLength?: number;
  atomColor?: string;
  bondColor?: string;
  backgroundColor?: string;
}

export const useRDKit = (): UseRDKitReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(rdkitService.isLoaded());
  const [error, setError] = useState<string | null>(null);

  const loadRDKit = useCallback(async () => {
    if (isLoaded || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await rdkitService.loadRDKit();
      setIsLoaded(true);
      console.log('RDKit loaded successfully in hook');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load RDKit';
      setError(errorMessage);
      console.error('RDKit loading failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const getMoleculeSVG = useCallback(async (
    smiles: string,
    options?: RDKitSVGOptions
  ): Promise<string> => {
    if (!isLoaded) {
      await loadRDKit();
    }

    try {
      const molecule = await rdkitService.getMolecule(smiles);
      const svg = rdkitService.getSVG(molecule, options);

      // Clean up molecule object
      if (molecule && molecule.delete) {
        molecule.delete();
      }

      return svg;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate SVG';
      setError(errorMessage);
      throw new Error(`SVG generation failed: ${errorMessage}`);
    }
  }, [isLoaded, loadRDKit]);

  const getMoleculeProperties = useCallback(async (smiles: string): Promise<MoleculeProperties> => {
    if (!isLoaded) {
      await loadRDKit();
    }

    try {
      const molecule = await rdkitService.getMolecule(smiles);
      const properties = rdkitService.getProperties(molecule);

      // Clean up molecule object
      if (molecule && molecule.delete) {
        molecule.delete();
      }

      return properties;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get properties';
      setError(errorMessage);
      throw new Error(`Property calculation failed: ${errorMessage}`);
    }
  }, [isLoaded, loadRDKit]);

  // Auto-load RDKit when hook is first used
  useEffect(() => {
    if (!isLoaded && !isLoading) {
      loadRDKit();
    }
  }, [isLoaded, isLoading, loadRDKit]);

  return {
    isLoading,
    isLoaded,
    error,
    loadRDKit,
    getMoleculeSVG,
    getMoleculeProperties,
  };
};
