import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import type { SpreadRow } from './spreadData';
import { SPARSE_BELOW, formatUnitPrice, stackOffsets } from './spreadData';

/**
 * Every surveyed price in an FDA equivalence group, on one shared log axis.
 *
 * The rest of this tab summarises. This shows the evidence the summary is drawn
 * from: if the card above says a pharmacist can substitute and save 99.8%, this
 * is the row of dots that figure came out of, and the reader can see for
 * themselves how many products it rests on.
 *
 * Encodings, and why each channel was chosen:
 *
 * - **Position** carries price, on log₁₀, because the range runs from $0.01 to
 *   four figures and a linear axis would collapse every generic onto the origin.
 * - **Shape** separates the brand from its equivalents — a diamond against
 *   circles. Shape rather than colour alone, so the distinction survives
 *   greyscale, and so it never competes with the theme's error red.
 * - **Line style** carries confidence. Below five surveyed products the range
 *   is drawn dotted. Colour is deliberately *not* used for this: identity and
 *   confidence would then share one channel and neither would read cleanly.
 *
 * BRAND_MARK is the only colour in this file with a meaning. It is not from the
 * MUI semantic palette on purpose: those six are spoken for, and a mark that
 * means "reference product" must not also mean "error".
 */
const BRAND_MARK = '#A8214B';

const LO = 0.005;
const HI = 5000;
const PAD = 10;
const TICKS = [0.01, 0.1, 1, 10, 100, 1000];

const frac = (v: number): number =>
  (Math.log10(Math.min(Math.max(v, LO), HI)) - Math.log10(LO)) /
  (Math.log10(HI) - Math.log10(LO));
const at = (v: number, w: number): number => PAD + frac(v) * (w - 2 * PAD);

const ratioLabel = (r: number): string =>
  r >= 10 ? `${Math.round(r).toLocaleString('en-US')}×` : `${r.toFixed(1)}×`;

/** Shared axis, drawn once and referenced by every row below it. */
const Axis: React.FC<{ width: number }> = ({ width }) => {
  const theme = useTheme();
  return (
    <svg
      width="100%"
      height={22}
      viewBox={`0 0 ${width} 22`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Logarithmic axis, US dollars per dispensing unit"
      style={{ display: 'block' }}
    >
      {TICKS.map(t => {
        const x = at(t, width);
        return (
          <g key={t}>
            <line x1={x} y1={14} x2={x} y2={21} stroke={theme.palette.divider} />
            <text
              x={Math.min(Math.max(x, 18), width - 24)}
              y={10}
              fontSize={10}
              textAnchor="middle"
              fill={theme.palette.text.secondary}
            >
              {t < 1 ? `$${t}` : `$${t.toLocaleString('en-US')}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Plot: React.FC<{ row: SpreadRow; width: number; height: number; r: number }> = ({
  row, width, height, r,
}) => {
  const theme = useTheme();
  const y = height / 2;
  const s = r + 2.2;
  const bx = row.brandPrice == null ? null : at(row.brandPrice, width);
  // Products at the same surveyed price stack instead of hiding one another.
  const xs = row.prices.map(p => at(p, width));
  const dy = stackOffsets(xs, r * 2 + 1, height / 2 - r - 1);
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={
        `${row.ingredient}, ${row.strength}: ${row.n} surveyed products from ` +
        `${formatUnitPrice(row.lowest)} to ${formatUnitPrice(row.highest)} per ${row.unit}` +
        (row.sparse ? `, a small sample` : '')
      }
      style={{ display: 'block' }}
    >
      <line
        x1={at(row.lowest, width)} y1={y} x2={at(row.highest, width)} y2={y}
        stroke={theme.palette.text.primary}
        strokeWidth={1.2}
        strokeOpacity={row.sparse ? 0.8 : 0.28}
        strokeDasharray={row.sparse ? '2 3' : undefined}
      />
      {xs.map((x, i) => (
        <circle
          key={i} cx={x} cy={y + dy[i]} r={r}
          fill={theme.palette.text.primary} fillOpacity={0.6}
        />
      ))}
      {bx !== null && (
        <path
          d={`M ${bx - s} ${y} L ${bx} ${y - s} L ${bx + s} ${y} L ${bx} ${y + s} Z`}
          fill={BRAND_MARK}
        />
      )}
    </svg>
  );
};

/** Measures its box so the axis and every row share one pixel scale. */
const useWidth = (): [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

export const PriceSpread: React.FC<{ rows: SpreadRow[]; nadacWeek: string }> = ({
  rows, nadacWeek,
}) => {
  const theme = useTheme();
  const [ref, width] = useWidth();

  if (rows.length === 0) return null;

  const [specimen, ...rest] = rows;
  const sparseCount = rows.filter(row => row.sparse).length;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" component="h3" gutterBottom>
        Price spread inside each equivalence group
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: '68ch' }}>
        Every dot is one product CMS surveyed. Every row is a set of products FDA
        rates therapeutically equivalent, so a pharmacist may swap between them.
        The axis is logarithmic and shared across rows, and each row uses a single
        pricing unit because a price per tablet and a price per millilitre are not
        comparable quantities.
      </Typography>

      {/* The widest spread, drawn at a size nothing else gets. One protagonist
          per screen: the rest of the list is context for this row. */}
      <Box
        ref={ref}
        sx={{
          p: 2.5, mb: 2, borderRadius: 1,
          bgcolor: theme => alpha(theme.palette.primary.main, 0.05),
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {specimen.ingredient}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 700, color: BRAND_MARK }}>
            {ratioLabel(specimen.ratio)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {specimen.strength}, {specimen.dosageForm.toLowerCase()}, {specimen.n} products
          surveyed{specimen.sparse ? ', a small sample' : ''}
        </Typography>

        {width > 0 && (
          <>
            <Plot row={specimen} width={width} height={64} r={4} />
            <Axis width={width} />
          </>
        )}

        <Typography variant="body2" sx={{ mt: 1.5, maxWidth: '62ch' }}>
          The cheapest equivalent costs{' '}
          <Box component="strong">{formatUnitPrice(specimen.lowest)}</Box> per {specimen.unit}.
          {specimen.brandName
            ? <> {specimen.brandName} costs{' '}
                <Box component="strong" sx={{ color: BRAND_MARK }}>
                  {formatUnitPrice(specimen.brandPrice as number)}
                </Box>.</>
            : <> The dearest is{' '}
                <Box component="strong">{formatUnitPrice(specimen.highest)}</Box>; no product
                in this group is classified as a brand in the NADAC extract.</>}
          {specimen.sparse
            ? ` Only ${specimen.n} products carry a surveyed price, so read this as an indication rather than a rate.`
            : ''}
        </Typography>
      </Box>

      {rest.length > 0 && width > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rest.map(row => (
            <Box
              component="li"
              key={row.key}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '150px 1fr 96px' },
                gap: { xs: 0.5, sm: 2 },
                alignItems: 'center',
                py: 1,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.25 }}>
                  {row.ingredient.split(' ')[0].toLowerCase()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.strength}, n={row.n}{row.sparse ? ', sparse' : ''}
                </Typography>
              </Box>
              <Plot row={row} width={width} height={30} r={2.6} />
              <Typography
                variant="body2"
                sx={{
                  textAlign: { xs: 'left', sm: 'right' },
                  fontWeight: row.sparse ? 400 : 600,
                  color: row.sparse ? 'text.secondary' : 'text.primary',
                }}
              >
                {ratioLabel(row.ratio)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 2, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <svg width="14" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="3" fill={theme.palette.text.primary} fillOpacity={0.6} />
          </svg>
          equivalent product
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <svg width="14" height="10" aria-hidden="true">
            <path d="M1 5 L6 1 L11 5 L6 9 Z" fill={BRAND_MARK} />
          </svg>
          brand
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <svg width="26" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="25" y2="5" stroke={theme.palette.text.primary}
              strokeWidth="1.2" strokeDasharray="2 3" />
          </svg>
          fewer than {SPARSE_BELOW} surveyed products
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block', maxWidth: '78ch' }}>
        {rows.length} group{rows.length === 1 ? '' : 's'} among these results carry two or
        more surveyed prices in one unit
        {sparseCount > 0 && `, of which ${sparseCount} rest${sparseCount === 1 ? 's' : ''} on fewer than ${SPARSE_BELOW} products`}.
        Prices are CMS NADAC pharmacy acquisition costs{nadacWeek ? ` from the survey covering ${nadacWeek}` : ''},
        not copays and not cash prices. US products only.
      </Typography>
    </Box>
  );
};
