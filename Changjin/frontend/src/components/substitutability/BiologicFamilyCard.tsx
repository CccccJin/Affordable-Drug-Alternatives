import React from 'react';
import {
  Accordion,
  Alert,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { BiologicFamily, BiologicMember } from '../../types/api';
import { formatPrice, monoCell, numberCell } from './format';

/**
 * One Purple Book family: a reference biologic and everything licensed against
 * it under 351(k).
 *
 * An Orange Book AB group is a clique: any member substitutes for any other.
 * A Purple Book family is a star. Every rating points at the reference product
 * and at nothing else, so two follow-ons that are each interchangeable with the
 * reference are *not* interchangeable with one another — rule B5.
 *
 * Presenting a star with the clique's vocabulary is what made this confusing:
 * eight rows reading "Grade A" invite the reader to pair any two of them. Each
 * badge therefore names the product it is rated against, and a family holding
 * more than one follow-on says outright that nothing has been determined
 * between them.
 */

/**
 * Every badge names the other end of the relationship.
 *
 * A bare "Grade A" on eight rows of one family reads as a property of each
 * product, and therefore as transitive: if these are all Grade A, surely any
 * two of them are interchangeable. They are not — that is rule B5. Saying
 * "Interchangeable with Humira" makes the claim directional, so two such rows
 * assert nothing about each other.
 */
const relationshipChip = (member: BiologicMember, reference: string | null) => {
  const against = reference ?? 'the reference product';

  if (member.grade === 'reference') {
    return <Chip label="Reference product" size="small" variant="outlined" />;
  }
  if (member.grade === 'A') {
    return (
      <Chip
        label={`Interchangeable with ${against}`}
        size="small"
        color="success"
        sx={{ fontWeight: 600 }}
      />
    );
  }
  return (
    <Chip
      label={`Biosimilar to ${against}`}
      size="small"
      color="warning"
      variant="outlined"
    />
  );
};

export const BiologicFamilyCard: React.FC<{ family: BiologicFamily }> = ({ family }) => (
  <Box sx={{ mb: 4 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
      <Chip label="Biologic" size="small" color="primary" sx={{ fontWeight: 600 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {family.molecule}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {family.memberCount} licensed product{family.memberCount === 1 ? '' : 's'}
      </Typography>
    </Box>

    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      Biologics are licensed under the Public Health Service Act and appear in the
      Purple Book, not the Orange Book. A follow-on licensed under 351(k) is a
      <strong> biosimilar</strong>; FDA may additionally find it
      <strong> interchangeable</strong>, which is the only finding that permits
      substitution without contacting the prescriber. Interchangeability is
      determined against the reference product only — never between two follow-ons.
    </Typography>

    {family.savings.map(saving => (
      <Typography key={saving.pricingUnit} variant="body2" sx={{ mb: 1 }}>
        <strong>{saving.fromName}</strong> ${formatPrice(saving.fromPrice)} →{' '}
        <strong>{saving.toName}</strong> ${formatPrice(saving.toPrice)} per{' '}
        {saving.pricingUnit} — <strong>{saving.savingPercent.toFixed(1)}%</strong>{' '}
        lower published acquisition cost.{' '}
        {saving.grade === 'A'
          ? 'The cheaper product is interchangeable.'
          : 'The cheaper product is a biosimilar without an interchangeability determination.'}
      </Typography>
    ))}

    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell>Applicant</TableCell>
            <TableCell>
              {family.referenceProduct
                ? `Relationship to ${family.referenceProduct}`
                : 'Relationship to the reference'}
            </TableCell>
            <TableCell sx={numberCell}>$ / unit</TableCell>
            <TableCell>Unit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {family.members.map(member => (
            <TableRow
              key={`${member.blaNumber}-${member.applicationNumber}-${member.pricingUnit ?? 'x'}`}
              sx={member.grade === 'reference' ? { bgcolor: 'action.hover' } : undefined}
            >
              <TableCell>{member.tradeName}</TableCell>
              <TableCell>{member.applicant}</TableCell>
              <TableCell>{relationshipChip(member, family.referenceProduct)}</TableCell>
              <TableCell sx={numberCell}>{formatPrice(member.pricePerUnit)}</TableCell>
              <TableCell>{member.pricingUnit ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>

    {family.followOnsUndetermined && (
      <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
        <Typography variant="body2">
          Each product above is rated against{' '}
          <strong>{family.referenceProduct ?? 'the reference product'}</strong> only.
          FDA has made <strong>no determination between them</strong>, so swapping one
          follow-on for another is not covered by any rating on this page — however
          interchangeable each is with the reference.
        </Typography>
      </Alert>
    )}

    {/* Same principle as the Orange Book panel: every claim cites the record it
        came from, so a reviewer can open the Purple Book at that BLA number. */}
    <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
        <Typography variant="body2" color="text.secondary">
          Evidence — {family.memberCount} Purple Book records
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        <Box component="ul" sx={{ m: 0, pl: 2.5, ...monoCell, fontSize: 12.5 }}>
          {family.members.map(member => (
            <Box
              component="li"
              key={`${member.blaNumber}-${member.applicationNumber}-${member.pricingUnit ?? 'x'}`}
              sx={{ mb: 0.5 }}
            >
              {`purplebook.csv : BLA${member.blaNumber} · ${member.licenseType}`}
              {member.referenceProduct ? ` · ref ${member.referenceProduct}` : ''}
              {member.rule ? ` · rule ${member.rule}` : ''}
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Verify at the FDA Purple Book using the BLA number above.
        </Typography>
      </AccordionDetails>
    </Accordion>
  </Box>
);
