/**
 * Presentation helpers.
 *
 * This file was `rdkitUtils.ts` and opened with four RDKit placeholders —
 * `initializeRDKit` logging "RDKit not yet implemented", a `generateMoleculeSVG`
 * that drew a grey box, a regex `validateSMILES`, and a `getMolecularProperties`
 * reporting `numAtoms: smiles.length`. All four were dead, and all four
 * contradicted `services/rdkit/rdkitService.ts`, which loads the real WASM
 * build and has done since the molecule viewer was fixed. Only the formatting
 * helpers were ever imported, so only those remain.
 */

// Formatting utilities
export const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals);
};

export const formatMolecularWeight = (mw: number): string => {
  return `${formatNumber(mw, 2)} g/mol`;
};

export const formatSimilarity = (similarity: number): string => {
  return `${formatNumber(similarity * 100, 1)}%`;
};

export const truncateText = (text: string, maxLength: number = 50): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
};

// Color utilities for similarity scores
export const getSimilarityColor = (similarity: number): string => {
  if (similarity >= 0.8) return '#2e7d32'; // Green
  if (similarity >= 0.6) return '#ed6c02'; // Orange
  if (similarity >= 0.4) return '#dc004e'; // Pink/Red
  return '#757575'; // Gray
};

// Debounce utility for search
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
