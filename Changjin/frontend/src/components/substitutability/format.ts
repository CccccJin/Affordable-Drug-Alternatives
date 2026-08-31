/** Shared presentation rules for priced equivalence data. */

/**
 * Price precision tracks magnitude.
 *
 * NADAC publishes five decimals, and generics routinely cost fractions of a
 * cent per unit — rounding those to two would print "0.00" for most of the
 * Orange Book corpus. Biologics run the other way: "$3366.12300" for a Humira
 * syringe is five digits of noise after the only two that matter. Thousands
 * separators go in above 1,000, where the difference between $2,855 and
 * $29,792 is the whole point.
 */
export const formatPrice = (value: number | null): string => {
  if (value === null) return '—';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(5);
};

/** Right-aligned, tabular figures, so columns of prices compare by eye. */
export const numberCell = {
  textAlign: 'right' as const,
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums',
};

export const monoCell = { fontFamily: 'ui-monospace, Menlo, monospace' };
