/** Shared presentation rules for priced equivalence data. */

/**
 * Prices are quoted to five decimals because that is the precision NADAC
 * publishes, and generics routinely cost fractions of a cent per unit --
 * rounding to two would print "0.00" for most of the corpus.
 */
export const formatPrice = (value: number | null): string =>
  value === null ? '—' : value.toFixed(5);

/** Right-aligned, tabular figures, so columns of prices compare by eye. */
export const numberCell = {
  textAlign: 'right' as const,
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums',
};

export const monoCell = { fontFamily: 'ui-monospace, Menlo, monospace' };
