import React from 'react';
import { Alert, AlertTitle, Typography } from '@mui/material';

/**
 * Structural, not a footnote — the counterpart to `NadacDisclaimer`.
 *
 * A therapeutic-equivalence rating is a regulatory finding about two products
 * considered in the abstract. Rendered next to a price and a large saving
 * figure, it reads to a lay visitor as a recommendation to switch, which it is
 * not and which this tool is in no position to make. This states the limit
 * before the reader reaches the numbers, and points at the authoritative
 * source rather than positioning the page as one.
 */
export const ClinicalDisclaimer: React.FC = () => (
  <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
    <AlertTitle sx={{ fontWeight: 700 }}>
      Reference information — not medical advice
    </AlertTitle>
    <Typography variant="body2" sx={{ mb: 1 }}>
      Do not start, stop, or change a medication based on this page. An FDA
      therapeutic-equivalence rating describes two products; it is assigned without
      reference to any individual patient and does not account for a diagnosis,
      other medications, allergies, or sensitivity to inactive ingredients.
      Whether a substitution is appropriate in a particular case — and whether
      state law permits it — is a decision for a licensed pharmacist or prescriber.
    </Typography>
    <Typography variant="caption" color="text.secondary">
      Ratings and prices shown here are a point-in-time extract of published FDA and
      CMS data and may be out of date. The FDA Orange Book and Purple Book are the
      authoritative sources; the application number listed for every product lets you
      check any claim on this page against them directly.
    </Typography>
  </Alert>
);
