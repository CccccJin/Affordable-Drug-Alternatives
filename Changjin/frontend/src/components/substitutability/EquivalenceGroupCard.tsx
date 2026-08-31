import React from 'react';
import {
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
import type { EquivalenceGroup } from '../../types/api';
import { EvidenceList } from './EvidenceList';
import { formatPrice, monoCell, numberCell } from './format';
import { switchPair } from './groups';

export const EquivalenceGroupCard: React.FC<{ group: EquivalenceGroup }> = ({ group }) => {
  const pair = switchPair(group);

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
                <TableCell sx={monoCell}>{member.teCode}</TableCell>
                <TableCell sx={numberCell}>{formatPrice(member.pricePerUnit)}</TableCell>
                <TableCell>{member.pricingUnit ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {pair && (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          Switching from <strong>{pair.brand.tradeName}</strong> (
          {formatPrice(pair.brand.pricePerUnit)}) to{' '}
          <strong>{pair.generic.tradeName}</strong> (
          {formatPrice(pair.generic.pricePerUnit)}) saves{' '}
          <strong>
            {(pair.brand.pricePerUnit! - pair.generic.pricePerUnit!).toFixed(5)}
          </strong>{' '}
          per {pair.brand.pricingUnit} — <strong>{group.savingPercent!.toFixed(1)}%</strong> of
          acquisition cost.
        </Typography>
      )}

      <EvidenceList group={group} />
    </Box>
  );
};
