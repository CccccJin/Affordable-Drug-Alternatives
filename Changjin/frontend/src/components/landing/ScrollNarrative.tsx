import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Paper,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  ArrowForward,
  BubbleChart,
  Explore,
  Search,
  Speed,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { MoleculeViewer } from '../molecules/MoleculeViewer';
import { WhenVisible } from '../common/WhenVisible';
import { StaticSearchApi, loadDescriptors, withLoadedDescriptors } from '../../services/api/staticSearchApi';
import type { Compound } from '../../types/api';
import { monoStack } from '../../styles/theme';

interface ScrollNarrativeProps {
  onEnterWorkspace: () => void;
}

interface DemoCandidate extends Compound {
  similarity: number;
}

const DRILL_NAME = 'Aspirin';
const DRILL_SMILES = 'CC(=O)OC1=CC=CC=C1C(=O)O';

const SECTION_COUNT = 5;

const formatPercent = (value: number) => `${Math.round((Math.max(0, Math.min(1, value))) * 1000) / 10}%`;

const formatValue = (value: number | null | undefined, unit = '') =>
  value == null
    ? '—'
    : `${Number.isFinite(value) ? value.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }) : '—'}${unit ? ` ${unit}` : ''}`;

const withQueryParam = (query: string, type: 'name' | 'smiles' = 'name') => {
  const next = new URLSearchParams({ query, type });
  return `/results?${next.toString()}`;
};

const SceneShell: React.FC<{
  index: number;
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
  onEnterWorkspace: () => void;
  showSkip: boolean;
}> = ({
  index,
  title,
  subtitle,
  accent,
  children,
  onEnterWorkspace,
  showSkip,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: '100dvh',
        py: { xs: 4, md: 6 },
        display: 'flex',
        alignItems: 'center',
        width: '100vw',
        left: '50%',
        right: '50%',
        ml: 'calc(50% - 50vw)',
        mr: 'calc(50% - 50vw)',
        px: { xs: 2.5, sm: 4, lg: 6 },
        overflow: 'hidden',
        borderTop: index > 0 ? `1px solid ${alpha(theme.palette.divider, 0.5)}` : undefined,
        background: `linear-gradient(180deg, ${alpha(
          accent,
          0.09,
        )} 0%, ${alpha(theme.palette.background.default, 1)} 24%, ${alpha(
          theme.palette.background.paper,
          0.9,
        )} 100%)`,
      }}
    >
      {showSkip && (
        <Button
          size="small"
          onClick={onEnterWorkspace}
          sx={{
            position: 'absolute',
            top: isMobile ? 12 : 16,
            right: isMobile ? 12 : 18,
            borderRadius: 999,
            px: 1.5,
            color: 'text.secondary',
            fontSize: '0.8rem',
            zIndex: 4,
          }}
        >
          Skip intro
        </Button>
      )}

      <Box
        sx={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 1120,
          mx: 'auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <Stack spacing={2.5}>
          <Chip
            label={`Stage ${index + 1} / ${SECTION_COUNT}`}
            size="small"
            sx={{
              width: 'fit-content',
              fontFamily: monoStack,
              backgroundColor: alpha(accent, 0.1),
              color: 'text.primary',
              border: `1px solid ${alpha(accent, 0.22)}`,
            }}
          />
          <Typography variant="overline" color="text.secondary">
            The research workspace is real-time and auditable.
          </Typography>
          <Typography variant="h2" component="h2" sx={{ maxWidth: 900 }}>
            {title}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: 880 }}>
            {subtitle}
          </Typography>
          {children}
        </Stack>
      </Box>
    </Box>
  );
};

export const ScrollNarrative: React.FC<ScrollNarrativeProps> = ({
  onEnterWorkspace,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [activeScene, setActiveScene] = useState(0);
  const [demoRows, setDemoRows] = useState<DemoCandidate[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const sectionsRef = useRef<Array<HTMLElement | null>>([]);

  const sectionCount = useMemo(() => demoRows.slice(0, 6).length, [demoRows]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const hits = entries
          .filter(entry => entry.isIntersecting)
          .map(entry => Number((entry.target as HTMLElement).dataset.scene));
        if (!hits.length) {
          return;
        }

        const latest = Math.min(
          SECTION_COUNT - 1,
          Math.max(...hits.filter(n => !Number.isNaN(n) && Number.isFinite(n))),
        );
        setActiveScene(latest);

        if (latest >= 1 && !demoLoading && demoRows.length === 0 && !demoError) {
          setDemoLoading(true);
        }
      },
      {
        threshold: isReducedMotion ? 0.05 : 0.35,
        rootMargin: isMobile ? '0px 0px -20% 0px' : '0px 0px -32% 0px',
      },
    );

    sectionsRef.current.forEach((section) => {
      if (section) {
        observer.observe(section);
      }
    });

    return () => observer.disconnect();
  }, [demoLoading, demoRows.length, demoError, isMobile, isReducedMotion]);

  useEffect(() => {
    if (!demoLoading) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        await loadDescriptors();
        const query = await StaticSearchApi.resolveName({ name: DRILL_NAME })
          .catch(() => ({ smiles: DRILL_SMILES, chembl_id: 'CHEMBL25', name: DRILL_NAME }));

        const response = await StaticSearchApi.search({
          smiles: query.smiles,
          threshold: 0.2,
          max_results: 10,
          enable_post_processing: false,
        });

        if (!cancelled) {
          const rows = withLoadedDescriptors(response.results.slice(0, 8)) as DemoCandidate[];
          setDemoRows(rows);
        }
      } catch (error) {
        if (!cancelled) {
          setDemoError(error instanceof Error ? error.message : 'Unable to load demonstration compounds.');
        }
      } finally {
        if (!cancelled) {
          setDemoLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [demoLoading]);

  const queryTarget = useMemo(
    () => ({
      id: 'Q',
      pref_name: DRILL_NAME,
      smiles: DRILL_SMILES,
      chembl_id: 'DRILL_QUERY',
      similarity: 1,
    }),
    [],
  );

  const compareRows = useMemo(
    () => demoRows.filter(row => row.chembl_id !== queryTarget.chembl_id).slice(0, 4),
    [demoRows, queryTarget.chembl_id],
  );

  const networkRows = useMemo(() => demoRows.slice(0, Math.min(6, Math.max(1, sectionCount))), [demoRows, sectionCount]);

  return (
    <Box sx={{ position: 'relative', mb: isMobile ? 0 : 2, pb: 2 }}>
      {!isReducedMotion && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            right: isMobile ? 10 : 24,
            transform: 'translateY(-50%)',
            zIndex: 40,
            display: 'grid',
            gap: 0.75,
          }}
          aria-hidden
        >
          {Array.from({ length: SECTION_COUNT }).map((_, index) => (
            <Box
              key={index}
              sx={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor:
                  activeScene >= index ? theme.palette.primary.main : alpha(theme.palette.text.disabled, 0.4),
                transition: 'background-color 220ms ease',
              }}
            />
          ))}
        </Box>
      )}

      <Box
        data-scene="0"
        ref={el => {
          sectionsRef.current[0] = el as HTMLElement | null;
        }}
      >
        <SceneShell
          index={0}
          title="Visualize one molecule before making any clinical inference."
          subtitle="The first scene frames one query as structural representation only. It does not represent efficacy, clinical recommendation, or interchangeability."
          accent="#4A8AA5"
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Stack spacing={2.5}>
            <Stack
              direction={isMobile ? 'column' : 'row'}
              spacing={2}
              alignItems={isMobile ? 'stretch' : 'center'}
            >
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: alpha('#4A8AA5', 0.09),
                  border: `1px solid ${alpha('#4A8AA5', 0.2)}`,
                  flex: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Search target
                </Typography>
                <Typography variant="h5" sx={{ fontFamily: monoStack, letterSpacing: '0.01em' }}>
                  {DRILL_NAME}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Source: ChEMBL 35 static demo export · {DRILL_SMILES}
                </Typography>
              </Paper>

              <Paper
                sx={{
                  p: 0,
                  borderRadius: 3,
                  border: `1px solid ${theme.palette.divider}`,
                  width: isMobile ? '100%' : 320,
                }}
              >
                <WhenVisible minHeight={260} rootMargin="700px">
                  <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    minHeight: 260,
                  }}>
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'radial-gradient(circle at 34% 24%, rgba(74, 138, 165, 0.12), transparent 46%), radial-gradient(circle at 72% 72%, rgba(70, 150, 130, 0.11), transparent 47%)',
                      }}
                    />
                    <MoleculeViewer
                      smiles={DRILL_SMILES}
                      width={isMobile ? 220 : 260}
                      height={isMobile ? 160 : 180}
                      label={DRILL_NAME}
                      className="scroll-structure"
                    />
                  </Box>
                </WhenVisible>
              </Paper>
            </Stack>
          </Stack>
        </SceneShell>
      </Box>

      <Box
        data-scene="1"
        ref={el => {
          sectionsRef.current[1] = el as HTMLElement | null;
        }}
      >
        <SceneShell
          index={1}
          title="From appearance to descriptors: what the pipeline computes."
          subtitle="Morgan fingerprints and RDKit descriptors are computed from real project data. This is the first boundary of the system, not a final recommendation."
          accent="#4C9784"
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Structural signature
                </Typography>
                <Typography variant="body1" gutterBottom>
                  The scene map uses one real query and the ChEMBL 35 corpus rows that are also used by the live search page.
                  Similarity is a candidate-generation signal only.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Query string:
                  <Box component="span" sx={{ fontFamily: monoStack, ml: 0.75 }}>
                    {DRILL_NAME}
                  </Box>
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Discovery-stage summary
                </Typography>
                {demoLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading real neighborhood candidates from the static corpus...
                  </Typography>
                ) : demoError ? (
                  <Typography variant="body2" color="text.secondary">
                    Demo data unavailable in this session. You can still use the workspace below.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={`Corpus size used: 84,818`} size="small" />
                      <Chip
                        label={`Neighbors loaded: ${demoRows.length}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Top-scored neighbors shown are from live local scoring and are still structural candidates.
                    </Typography>
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>
        </SceneShell>
      </Box>

      <Box
        data-scene="2"
        ref={el => {
          sectionsRef.current[2] = el as HTMLElement | null;
        }}
      >
        <SceneShell
          index={2}
          title="Expand to a candidate structure network."
          subtitle="Each node below is a structurally related molecule. The edges are conceptual for exploration and represent score proximity, not clinical substitution."
          accent="#5C8FA5"
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Paper
            sx={{
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              mt: 1,
              minHeight: isMobile ? 260 : 360,
              position: 'relative',
              overflow: 'hidden',
              p: isMobile ? 2 : 3,
            }}
          >
            <WhenVisible minHeight={280}>
              <Box
                sx={{
                  position: 'relative',
                  height: isMobile ? 260 : 360,
                  width: '100%',
                  borderRadius: 2,
                  border: `1px dashed ${alpha(theme.palette.text.secondary, 0.25)}`,
                  background: alpha(theme.palette.background.default, 0.6),
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 1000 420"
                  preserveAspectRatio="none"
                  aria-hidden
                  style={{ position: 'absolute', inset: 0 }}
                >
                  {networkRows.map((candidate, index) => {
                    const angle = (Math.PI * 2 * index) / Math.max(networkRows.length, 1);
                    const radiusX = isMobile ? 300 : 340;
                    const radiusY = isMobile ? 95 : 130;
                    const x = 500 + Math.cos(angle) * radiusX;
                    const y = 210 + Math.sin(angle) * radiusY;
                    return (
                      <line
                        key={`edge-${candidate.chembl_id}`}
                        x1="500"
                        y1="210"
                        x2={x.toFixed(2)}
                        y2={y.toFixed(2)}
                        stroke={theme.palette.text.secondary}
                        strokeOpacity={0.28 + candidate.similarity * 0.45}
                        strokeWidth={Math.max(1.5, Math.min(4, candidate.similarity * 6))}
                      />
                    );
                  })}
                </svg>
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: isMobile ? 120 : 150,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <Paper
                    sx={{
                      px: 1.25,
                      py: 0.6,
                      borderRadius: 999,
                      background: alpha('#4A8AA5', 0.16),
                    }}
                  >
                    <Typography variant="caption" sx={{ fontFamily: monoStack }}>
                      {DRILL_NAME}
                    </Typography>
                  </Paper>
                </Box>
                {networkRows.map((candidate, index) => {
                  const angle = (Math.PI * 2 * index) / Math.max(networkRows.length, 1);
                  const radiusX = isMobile ? 300 : 340;
                  const radiusY = isMobile ? 95 : 130;
                  const left = 500 + Math.cos(angle) * radiusX;
                  const top = 210 + Math.sin(angle) * radiusY;

                  return (
                    <Paper
                      key={candidate.chembl_id}
                      sx={{
                        position: 'absolute',
                        left: `${left / 10}%`,
                        top: `${top / 4.2}%`,
                        transform: 'translate(-50%, -50%)',
                        px: 1,
                        py: 0.6,
                        borderRadius: 999,
                        border: `1px solid ${alpha(theme.palette.divider, 0.65)}`,
                        backgroundColor: 'rgba(255,255,255,0.78)',
                        backdropFilter: 'blur(2px)',
                      }}
                    >
                      <Typography
                        variant="caption"
                        title={candidate.pref_name || candidate.chembl_id}
                        sx={{
                          fontFamily: monoStack,
                          display: 'block',
                          maxWidth: isMobile ? 180 : 210,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {candidate.pref_name || candidate.chembl_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {formatPercent(candidate.similarity)}
                      </Typography>
                    </Paper>
                  );
                })}
              </Box>
            </WhenVisible>
          </Paper>
        </SceneShell>
      </Box>

      <Box
        data-scene="3"
        ref={el => {
          sectionsRef.current[3] = el as HTMLElement | null;
        }}
      >
        <SceneShell
          index={3}
          title="Converge to a sortable comparison panel."
          subtitle="After narrowing candidates, the workspace now supports sorting, filtering, and detailed comparison with the same live dataset and attributes. This is the boundary before therapeutic equivalence."
          accent="#4F9A80"
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Paper
            sx={{
              mt: 1.5,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Comparison summary (live-like example)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Uses the same similarity scoring and property fields shown in the result screen.
              </Typography>
            </Box>

            <Stack spacing={1} sx={{ p: 2 }}>
              {compareRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {demoLoading
                    ? 'Loading live neighborhood candidates for comparison...'
                    : demoError
                      ? 'Demo neighborhood unavailable; run a live query from the workspace below.'
                      : 'No neighbors available for this quick preview.'}
                </Typography>
              ) : (
                compareRows.map(row => (
                  <Paper
                    key={row.chembl_id}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: `1px solid ${theme.palette.divider}`,
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1fr 1fr 1fr',
                      gap: 1,
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontFamily: monoStack, mb: 0.3 }}>
                        {row.pref_name || row.chembl_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.chembl_id}
                      </Typography>
                    </Box>
                    <Typography variant="body2">
                      <Box component="span" sx={{ color: 'text.secondary' }}>Similarity</Box>{' '}
                      <Box component="span" sx={{ fontWeight: 600 }}>{formatPercent(row.similarity)}</Box>
                    </Typography>
                    <Typography variant="body2">
                      <Box component="span" sx={{ color: 'text.secondary' }}>MW</Box>{' '}
                      <Box component="span" sx={{ fontFamily: monoStack }}>
                        {formatValue(row.molecular_weight, 'g/mol')}
                      </Box>
                    </Typography>
                    <Typography variant="body2">
                      <Box component="span" sx={{ color: 'text.secondary' }}>LogP</Box>{' '}
                      <Box component="span" sx={{ fontFamily: monoStack }}>
                        {formatValue(row.logp)}
                      </Box>
                    </Typography>
                  </Paper>
                ))
              )}
            </Stack>
            <Divider sx={{ borderColor: theme.palette.divider }} />
            <Stack
              direction={isMobile ? 'column' : 'row'}
              spacing={1.2}
              sx={{ px: 2.5, py: 2, alignItems: isMobile ? 'stretch' : 'center' }}
            >
              <Button
                component={RouterLink}
                to={withQueryParam(DRILL_NAME)}
                startIcon={<ArrowForward />}
                size="small"
                variant="outlined"
                sx={{ borderRadius: 999 }}
              >
                Open full result list
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 540 }}>
                Comparison remains a research support layer, not a recommendation output.
              </Typography>
            </Stack>
          </Paper>
        </SceneShell>
      </Box>

      <Box
        data-scene="4"
        ref={el => {
          sectionsRef.current[4] = el as HTMLElement | null;
        }}
      >
        <SceneShell
          index={4}
          title="Move into the actual working workspace."
          subtitle="Use the live tools to run your own query, set filters, inspect evidence, and then switch to FDA therapeutic equivalence for substitution assessment."
          accent="#578F9B"
          onEnterWorkspace={onEnterWorkspace}
          showSkip={false}
        >
          <Paper
            sx={{
              mt: 1,
              p: 3,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              background: alpha(theme.palette.background.paper, 0.9),
            }}
          >
            <Typography variant="subtitle1" gutterBottom>
              Research has two workflows
            </Typography>
            <Stack
              direction={isMobile ? 'column' : 'row'}
              spacing={1.5}
              sx={{ mb: 2 }}
            >
              <Button
                size="large"
                variant="contained"
                startIcon={<Search />}
                onClick={onEnterWorkspace}
                sx={{ borderRadius: 999 }}
              >
                Explore Compounds
              </Button>
              <Button
                component={RouterLink}
                to="/alternatives"
                size="large"
                variant="outlined"
                startIcon={<BubbleChart />}
                sx={{ borderRadius: 999 }}
              >
                Therapeutic equivalence lookup
              </Button>
              <Button
                component={RouterLink}
                to="/results"
                size="large"
                variant="outlined"
                startIcon={<Explore />}
                sx={{ borderRadius: 999 }}
              >
                Browse full result explorer
              </Button>
            </Stack>
            <Stack direction={isMobile ? 'column' : 'row'} spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label="Scene 2: Morgan/Tanimoto" size="small" />
                <Link component={RouterLink} to="/alternatives" sx={{ fontSize: '0.88rem' }}>
                  How substitutability works
                </Link>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label="Scene 5: Action" size="small" />
                <Link component={RouterLink} to="/results" sx={{ fontSize: '0.88rem' }}>
                  Enter the result explorer
                </Link>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  icon={<Speed fontSize="small" />}
                  label={isReducedMotion ? 'Reduced motion mode enabled' : 'Parallax-aware mode'}
                  size="small"
                />
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              No price claim is implied by structural similarity. Use the dedicated equivalence layer for FDA status and acquisition-cost evidence.
            </Typography>
          </Paper>
        </SceneShell>
      </Box>
    </Box>
  );
};
