import { useState, useEffect, useCallback, useRef } from 'react';
import { rdkitService, type MoleculeProperties, type RDKitSVGOptions } from '../services/rdkit/rdkitService';

export type { RDKitSVGOptions };

export interface UseRDKitReturn {
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  loadRDKit: () => Promise<void>;
  getMoleculeSVG: (smiles: string, options?: RDKitSVGOptions) => Promise<string>;
  getMoleculeProperties: (smiles: string) => Promise<MoleculeProperties>;
}

export const useRDKit = (): UseRDKitReturn => {
  const [isLoaded, setIsLoaded] = useState(rdkitService.isLoaded());
  const [isLoading, setIsLoading] = useState(!rdkitService.isLoaded());
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadRDKit = useCallback(async () => {
    if (rdkitService.isLoaded()) {
      if (mountedRef.current) {
        setIsLoaded(true);
        setIsLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await rdkitService.loadRDKit();
      if (mountedRef.current) {
        setIsLoaded(true);
        setError(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load RDKit';
      console.error('RDKit loading failed:', err);
      if (mountedRef.current) setError(message);
    } finally {
      // Always clear the spinner, success or failure — otherwise the molecule
      // viewer spins forever.
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const getMoleculeSVG = useCallback(
    async (smiles: string, options?: RDKitSVGOptions): Promise<string> => {
      await rdkitService.loadRDKit();

      const molecule = await rdkitService.getMolecule(smiles);
      try {
        return rdkitService.getSVG(molecule, options);
      } finally {
        molecule.delete();
      }
    },
    []
  );

  const getMoleculeProperties = useCallback(async (smiles: string): Promise<MoleculeProperties> => {
    await rdkitService.loadRDKit();

    const molecule = await rdkitService.getMolecule(smiles);
    try {
      return rdkitService.getProperties(molecule);
    } finally {
      molecule.delete();
    }
  }, []);

  // Kick off the (shared, de-duplicated) module load on first use.
  useEffect(() => {
    if (!rdkitService.isLoaded()) {
      loadRDKit();
    }
  }, [loadRDKit]);

  return {
    isLoading,
    isLoaded,
    error,
    loadRDKit,
    getMoleculeSVG,
    getMoleculeProperties,
  };
};
