import React from 'react';
import { Alert, Typography } from '@mui/material';

/**
 * Structural, not a footnote: a price must never be read as a patient cost.
 *
 * Rendered wherever a NADAC figure appears. `tests/test_price_compare.py`
 * enforces the same string in the Python layer; this is the frontend half of
 * that contract, and `SubstitutabilityPanel.test.tsx` asserts it renders
 * alongside prices.
 */
export const NadacDisclaimer: React.FC = () => (
  <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
      NADAC is what pharmacies pay to acquire a drug. It is not a copay, not a cash
      price, and not a reimbursement rate.
    </Typography>
    <Typography variant="caption" color="text.secondary">
      Medicare Part D puts the realised per-unit cost of a cheap generic at roughly
      5&times; its acquisition cost, because a dispensing fee is fixed per
      prescription. A 99% saving here does not become a 99% saving for a patient.
    </Typography>
  </Alert>
);
