import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useSearchParams } from 'react-router-dom';
import type { BiologicFamily, EquivalenceGroup } from '../../types/api';
import { useAlternatives } from '../../hooks/useAlternatives';
import { EquivalenceGroupCard } from '../substitutability/EquivalenceGroupCard';
import { groupKey, switchPair } from '../substitutability/groups';
import { ClinicalDisclaimer } from '../substitutability/ClinicalDisclaimer';
import { NadacDisclaimer } from '../substitutability/NadacDisclaimer';
import { formatPrice, numberCell } from '../substitutability/format';
import { BiologicFamilyCard } from '../substitutability/BiologicFamilyCard';
import { SwitchSummary } from './SwitchSummary';
import { serifStack } from '../../styles/theme';

/** Brands with a large, verifiable saving — a starting point that is not empty. */
const EXAMPLES = ['Lipitor', 'Zestril', 'Tenormin', 'Nexium', 'Singulair'];

const HighlightTable: React.FC<{ groups: EquivalenceGroup[]; onPick: (name: string) => void }> = ({
  groups,
  onPick,
}) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Brand</TableCell>
          <TableCell>Lowest-cost rated equivalent</TableCell>
          <TableCell sx={numberCell}>Brand $/unit</TableCell>
          <TableCell sx={numberCell}>Generic $/unit</TableCell>
          <TableCell sx={numberCell}>Saving</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {groups.map(group => {
          const pair = switchPair(group);
          if (!pair) return null;
          return (
            <TableRow
              key={groupKey(group)}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => onPick(pair.brand.tradeName)}
            >
              <TableCell sx={{ fontWeight: 600 }}>{pair.brand.tradeName}</TableCell>
              <TableCell>{pair.generic.tradeName}</TableCell>
              <TableCell sx={numberCell}>{formatPrice(pair.brand.pricePerUnit)}</TableCell>
              <TableCell sx={numberCell}>{formatPrice(pair.generic.pricePerUnit)}</TableCell>
              <TableCell sx={{ ...numberCell, fontWeight: 700, color: 'success.dark' }}>
                {group.savingPercent!.toFixed(1)}%
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

const BiologicHighlightTable: React.FC<{
  families: BiologicFamily[];
  onPick: (name: string) => void;
}> = ({ families, onPick }) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Reference biologic</TableCell>
          <TableCell>Cheapest follow-on</TableCell>
          <TableCell sx={numberCell}>Reference $/unit</TableCell>
          <TableCell sx={numberCell}>Follow-on $/unit</TableCell>
          <TableCell sx={numberCell}>Saving</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {families.map(family => {
          const saving = family.savings[0];
          return (
            <TableRow
              key={family.molecule}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => onPick(saving.fromName)}
            >
              <TableCell sx={{ fontWeight: 600 }}>{saving.fromName}</TableCell>
              <TableCell>
                {saving.toName}{' '}
                <Chip
                  label={saving.grade === 'A' ? 'interchangeable' : 'biosimilar'}
                  size="small"
                  variant="outlined"
                  color={saving.grade === 'A' ? 'success' : 'warning'}
                  sx={{ ml: 0.5 }}
                />
              </TableCell>
              <TableCell sx={numberCell}>{formatPrice(saving.fromPrice)}</TableCell>
              <TableCell sx={numberCell}>{formatPrice(saving.toPrice)}</TableCell>
              <TableCell sx={{ ...numberCell, fontWeight: 700, color: 'success.dark' }}>
                {saving.savingPercent.toFixed(1)}%
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

export const CheaperAlternatives: React.FC = () => {
  // The query lives in the URL so a result is a link someone can send.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('drug') ?? '';
  const [draft, setDraft] = useState(query);

  const result = useAlternatives(query);
  // The disclaimer sits above the results and so outlives them; only the states
  // that carry meta can date the extract, and the rest simply omit the age
  // rather than assuming it is current.
  const generatedDate =
    result.status === 'idle' || result.status === 'found'
      ? result.meta.generated
      : undefined;

  const submit = (value: string) => {
    setDraft(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set('drug', value.trim());
    else next.delete('drug');
    setSearchParams(next);
  };

  return (
    <Box>
      <Box className="anim-fade-up" sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 0.5 }}>
          Substitutability
        </Typography>
        <Typography variant="h2" component="h1" sx={{ mb: 1.5, fontFamily: serifStack }}>
          Therapeutic equivalence lookup
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 660 }}>
          Enter a brand or generic name to see how FDA has rated other products
          containing the same active ingredient, alongside CMS NADAC acquisition
          costs where they are published. This is a reference view of public FDA and
          CMS records — not medical advice, and not a recommendation to substitute.
        </Typography>
      </Box>

      <ClinicalDisclaimer generated={generatedDate} />

      <Paper variant="outlined" sx={{ p: 2.5, mb: 4 }}>
        <Box
          component="form"
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Brand or generic name"
              placeholder="e.g. Lipitor"
              value={draft}
              onChange={event => setDraft(event.target.value)}
            />
            <Button type="submit" variant="contained" startIcon={<SearchIcon />}>
              Find
            </Button>
          </Stack>
        </Box>

        {/* Outside the form on purpose: a clickable MUI Chip renders a <button>,
            which inside a form defaults to type="submit" and would re-submit the
            stale draft, undoing the value the chip just set. */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Try:
          </Typography>
          {EXAMPLES.map(name => (
            <Chip key={name} label={name} size="small" onClick={() => submit(name)} />
          ))}
        </Stack>
      </Paper>

      {result.status === 'loading' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading FDA equivalence and price data&hellip;
          </Typography>
        </Box>
      )}

      {result.status === 'error' && <Alert severity="error">{result.message}</Alert>}

      {/* A miss is a next step, not a dead end. */}
      {result.status === 'no-match' && (
        <Alert severity="info" variant="outlined">
          <Typography variant="body2" sx={{ mb: result.suggestions.length ? 1 : 0 }}>
            No FDA therapeutic-equivalence group for <strong>{result.query}</strong>. Only
            multi-source products carry an equivalence rating, so a drug still under
            patent, a biologic (licensed through the Purple Book instead), or a name
            spelled differently from the Orange Book will not appear.
          </Typography>
          {result.suggestions.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {result.suggestions.map(name => (
                <Chip key={name} label={name} size="small" onClick={() => submit(name)} />
              ))}
            </Stack>
          )}
        </Alert>
      )}

      {result.status === 'idle' && (
        <>
          <Typography variant="h6" gutterBottom>
            Largest published price differences
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {result.meta.coverage.groups.toLocaleString()} equivalence groups,{' '}
            {result.meta.coverage.withSavings.toLocaleString()} of which have both a priced
            brand and a priced generic. Select a row to open it.
          </Typography>
          <HighlightTable groups={result.highlights} onPick={submit} />

          {result.biologicHighlights.length > 0 && (
            <>
              <Typography variant="h6" sx={{ mt: 4 }} gutterBottom>
                Biologics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Licensed under the Purple Book rather than the Orange Book. Far fewer
                have a published acquisition cost — CMS surveys retail pharmacies and
                most biologics are clinician-administered — but the ones that do carry
                the largest absolute differences in this dataset.
              </Typography>
              <BiologicHighlightTable families={result.biologicHighlights} onPick={submit} />
            </>
          )}

          <NadacDisclaimer />
        </>
      )}

      {result.status === 'found' && (
        <>
          <Typography variant="h6" gutterBottom>
            {[
              result.groups.length > 0 &&
                `${result.groups.length} equivalence group${result.groups.length === 1 ? '' : 's'}`,
              result.biologics.length > 0 &&
                `${result.biologics.length} biologic famil${result.biologics.length === 1 ? 'y' : 'ies'}`,
            ]
              .filter(Boolean)
              .join(' and ')}{' '}
            for {result.query}
          </Typography>

          {result.groups.map(group => (
            <Box key={groupKey(group)} sx={{ mb: 4 }}>
              <SwitchSummary group={group} />
              <EquivalenceGroupCard group={group} />
            </Box>
          ))}

          {result.biologics.map(family => (
            <BiologicFamilyCard key={family.molecule} family={family} />
          ))}

          <NadacDisclaimer />

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
