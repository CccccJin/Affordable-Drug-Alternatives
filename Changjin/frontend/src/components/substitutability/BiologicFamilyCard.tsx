import React from 'react';
import {
  Accordion,
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
 * Unlike an Orange Book AB group, the grade is a property of the member, not of
 * the group — an interchangeable follow-on is grade A and may be substituted at
 * the pharmacy, while a biosimilar that carries no interchangeability
 * determination is grade B and needs the prescriber. Showing one badge for the
 * whole family would erase exactly the distinction a reader needs.
 */

const gradeChip = (member: BiologicMember) => {
  if (member.grade === 'reference') {
    return <Chip label="Reference" size="small" variant="outlined" />;
  }
  if (member.grade === 'A') {
    return (
      <Chip
        label="Grade A · interchangeable"
        size="small"
        color="success"
        sx={{ fontWeight: 600 }}
      />
    );
  }
  return (
    <Chip
      label="Grade B · prescriber required"
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
            <TableCell>Status</TableCell>
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
              <TableCell>{gradeChip(member)}</TableCell>
              <TableCell sx={numberCell}>{formatPrice(member.pricePerUnit)}</TableCell>
              <TableCell>{member.pricingUnit ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>

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
