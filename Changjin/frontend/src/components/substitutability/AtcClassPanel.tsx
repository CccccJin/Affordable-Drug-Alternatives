import React from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AtcClass, RuleEntry } from '../../types/api';

/**
 * Drugs sharing a WHO ATC level-4 chemical subgroup.
 *
 * Everything else on this page reports an FDA finding a pharmacist may act on.
 * This reports a WHO classification nobody may act on alone, and the whole
 * design problem is keeping those two apart on one screen. A reader who has
 * just seen "a pharmacist can substitute" in green will read the next panel
 * the same way unless it is built not to allow that.
 *
 * How it is kept apart:
 *
 * - **The verdict leads and it is negative.** The panel opens with what cannot
 *   be done, before the class is named or a single member is listed.
 * - **No green, and no success/warning colour at all.** Those carry meaning
 *   elsewhere in this app. This panel is neutral, and its one tinted surface is
 *   the caution notice.
 * - **The section is collapsed by default.** The FDA panels above answer the
 *   question; this is background a reader chooses to open.
 * - **No saving and no ranking.** The export computes neither, and neither is
 *   derived here. Members appear alphabetically, each with its own price range,
 *   so the class can be seen to be expensive without a switch being proposed.
 * - **The rule is named, and states itself.** Everything here is one finding
 *   -- C2 -- and both sentences describing it come from the payload:
 *   `meaning` says what the relationship is, `action` says what a reader may
 *   do about it. This file contributes only what the catalogue cannot know:
 *   the drug that was asked about, and that nothing here speaks to whether a
 *   given member suits a given person. Restating the rest is how one sentence
 *   came to live in three files.
 */

const money = (v: number): string =>
  v >= 100 ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : v >= 1 ? `$${v.toFixed(2)}`
  : `$${v.toFixed(5)}`;

const priceCell = (m: AtcClass['members'][number]): string => {
  if (m.priceLow == null || m.priceHigh == null) return '—';
  return m.priceLow === m.priceHigh
    ? money(m.priceLow)
    : `${money(m.priceLow)} – ${money(m.priceHigh)}`;
};

export const AtcClassPanel: React.FC<{
  classes: AtcClass[];
  queryName: string;
  /** The rule this panel reports, as the export names it. */
  rule: string;
  /** Catalogue entries from the payload; empty when it explains none. */
  rules: Record<string, RuleEntry>;
}> = ({ classes, queryName, rule, rules }) => {
  if (classes.length === 0) return null;

  // A cached payload predating the catalogue carries no `rules` at all.
  // Reading through it unguarded threw during render and took the whole
  // results view with it; a stale payload should cost at most this sentence.
  const entry = rules?.[rule];

  return (
    <Box sx={{ mt: 5 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Same drug class
      </Typography>

      {/* The verdict, before anything else on the panel. */}
      <Alert
        severity="info"
        variant="outlined"
        icon={false}
        sx={{ mb: 2, bgcolor: theme => alpha(theme.palette.text.primary, 0.03) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          A pharmacist may not substitute between these.
        </Typography>
        <Typography variant="body2">
          The products below share a WHO chemical subgroup with {queryName}.
          {entry ? ` ${entry.meaning}` : ''} Nothing here says any of them would
          work for a particular person, or that a cheaper one is a reasonable
          choice.
        </Typography>

        {entry && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            <Box
              component="span"
              sx={{ fontFamily: 'monospace', fontWeight: 700, mr: 0.75 }}
            >
              {rule}
            </Box>
            {entry.action}
          </Typography>
        )}
      </Alert>

      {classes.map(atc => (
        <Accordion
          key={atc.code}
          disableGutters
          elevation={0}
          sx={{
            border: theme => `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            mb: 1.5,
            '&::before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip
                label={atc.code}
                size="small"
                variant="outlined"
                sx={{ fontFamily: 'monospace', fontWeight: 600 }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {atc.className}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {atc.members.length} substance{atc.members.length === 1 ? '' : 's'},
                {' '}{atc.pricedMembers} with a surveyed price
              </Typography>
            </Box>
          </AccordionSummary>

          <AccordionDetails sx={{ pt: 0 }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Substance</TableCell>
                    <TableCell align="right">$ / unit, published range</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell align="right">Products surveyed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {atc.members.map(m => (
                    <TableRow key={m.ingredient}>
                      <TableCell>{m.ingredient}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12.5 }}>
                        {priceCell(m)}
                      </TableCell>
                      <TableCell>{m.pricingUnit ?? '—'}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12.5 }}>
                        {m.surveyedProducts || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              Ranges span every surveyed product for that substance in one pricing
              unit, across all strengths, so a wide range usually reflects the
              strengths rather than a choice between two products. Listed
              alphabetically; the order carries no recommendation.
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};
