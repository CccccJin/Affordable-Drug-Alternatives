import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
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
import type { Compound, EquivalenceGroup } from '../../types/api';
import { useSubstitutability } from '../../hooks/useSubstitutability';

interface SubstitutabilityPanelProps {
  compound: Compound | null;
}

const numberCell = {
  textAlign: 'right' as const,
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums',
};

const formatPrice = (value: number | null): string =>
  value === null ? '—' : value.toFixed(5);

/**
 * The evidence list is the reason this panel exists. Every claim cites the
 * Orange Book record it came from, so a reviewer can open products.txt at that
 * application number and check it by hand. Do not collapse it into a summary.
 */
const EvidenceList: React.FC<{ group: EquivalenceGroup }> = ({ group }) => (
  <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent' }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
      <Typography variant="body2" color="text.secondary">
        Evidence — {group.memberCount} Orange Book records
      </Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 0, pt: 0 }}>
      <Box
        component="ul"
        sx={{ m: 0, pl: 2.5, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
      >
        {group.members.map(member => (
          <Box component="li" key={member.applicationNumber} sx={{ mb: 0.5 }}>
            {`products.txt : ${member.applicationNumber} \u00b7 TE_Code = ${member.teCode}`}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Verify at the FDA Orange Book using the application number above.
      </Typography>
    </AccordionDetails>
  </Accordion>
);

const GroupCard: React.FC<{ group: EquivalenceGroup }> = ({ group }) => {
  const brand = group.members.find(m => m.isBrand && m.pricePerUnit !== null);
  const cheapest = group.members.find(m => !m.isBrand && m.pricePerUnit !== null);
  const showSaving =
    group.savingPercent !== null && brand && cheapest && brand.pricePerUnit !== null &&
    cheapest.pricePerUnit !== null;

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
        <Chip label="Grade A" color="success" size="small" sx={{ fontWeight: 600 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {group.ingredient}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {group.dosageForm};{group.route} &middot; {group.strength}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        FDA rates these {group.memberCount} products therapeutically equivalent. A
        pharmacist may substitute between them without contacting the prescriber,
        subject to state substitution law.
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Applicant</TableCell>
              <TableCell>TE</TableCell>
              <TableCell sx={numberCell}>$ / unit</TableCell>
              <TableCell>Unit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {group.members.map(member => (
              <TableRow
                key={member.applicationNumber}
                sx={member.isBrand ? { bgcolor: 'action.hover' } : undefined}
              >
                <TableCell>
                  {/* Own element so the name is addressable independently of the chip. */}
                  <Box component="span">{member.tradeName}</Box>
                  {member.isBrand && (
                    <Chip label="brand" size="small" variant="outlined" sx={{ ml: 1 }} />
                  )}
                </TableCell>
                <TableCell>{member.applicant}</TableCell>
                <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {member.teCode}
                </TableCell>
                <TableCell sx={numberCell}>{formatPrice(member.pricePerUnit)}</TableCell>
                <TableCell>{member.pricingUnit ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {showSaving && (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          Switching from <strong>{brand!.tradeName}</strong> ({formatPrice(brand!.pricePerUnit)})
          to <strong>{cheapest!.tradeName}</strong> ({formatPrice(cheapest!.pricePerUnit)}) saves{' '}
          <strong>{(brand!.pricePerUnit! - cheapest!.pricePerUnit!).toFixed(5)}</strong> per{' '}
          {brand!.pricingUnit} — <strong>{group.savingPercent!.toFixed(1)}%</strong> of
          acquisition cost.
        </Typography>
      )}

      <EvidenceList group={group} />
    </Box>
  );
};

export const SubstitutabilityPanel: React.FC<SubstitutabilityPanelProps> = ({ compound }) => {
  const result = useSubstitutability(compound);

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ my: 2 }} />
      <Typography variant="h6" gutterBottom>
        Substitutability &amp; Cost
      </Typography>

      {result.status === 'loading' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading FDA equivalence data&hellip;
          </Typography>
        </Box>
      )}

      {result.status === 'error' && (
        <Alert severity="error">{result.message}</Alert>
      )}

      {/* Absence is information. Say why there is nothing, never show a blank panel. */}
      {result.status === 'no-coverage' && (
        <Alert severity="info" variant="outlined">
          {result.reason}
        </Alert>
      )}

      {result.status === 'found' && (
        <>
          {result.groups.map(group => (
            <GroupCard
              key={`${group.ingredient}|${group.dosageForm}|${group.route}|${group.strength}`}
              group={group}
            />
          ))}

          {/* Structural, not a footnote: a price must never be read as a patient cost. */}
          <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              NADAC is what pharmacies pay to acquire a drug. It is not a copay, not a
              cash price, and not a reimbursement rate.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Medicare Part D puts the realised per-unit cost of a cheap generic at roughly
              5&times; its acquisition cost, because a dispensing fee is fixed per
              prescription. A 99% saving here does not become a 99% saving for a patient.
            </Typography>
          </Alert>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Sources: FDA Orange Book &middot; CMS NADAC week of {result.meta.nadacWeek}
            {' '}&middot; openFDA NDC {result.meta.openFdaNdc} &middot; generated{' '}
            {result.meta.generated}
          </Typography>
        </>
      )}
    </Box>
  );
};
