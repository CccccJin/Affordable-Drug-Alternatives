import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { EquivalenceGroup } from '../../types/api';

/**
 * The evidence list is the reason these panels exist. Every claim cites the
 * Orange Book record it came from, so a reviewer can open products.txt at that
 * application number and check it by hand. Do not collapse it into a summary.
 */
export const EvidenceList: React.FC<{ group: EquivalenceGroup }> = ({ group }) => (
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
            {`products.txt : ${member.applicationNumber} · TE_Code = ${member.teCode}`}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Verify at the FDA Orange Book using the application number above.
      </Typography>
    </AccordionDetails>
  </Accordion>
);
