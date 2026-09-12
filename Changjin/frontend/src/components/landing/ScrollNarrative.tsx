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
  ArrowDownward,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { WhenVisible } from '../common/WhenVisible';
import { StaticSearchApi, loadDescriptors, withLoadedDescriptors } from '../../services/api/staticSearchApi';
import type { Compound } from '../../types/api';
import { brand, monoStack } from '../../styles/theme';

interface ScrollNarrativeProps {
  onEnterWorkspace: () => void;
}

interface DemoCandidate extends Compound {
  similarity: number;
}

const DRILL_NAME = 'Aspirin';
const DRILL_SMILES = 'CC(=O)OC1=CC=CC=C1C(=O)O';
const SECTION_COUNT = 5;

function Capsule3D() {
  return (
    <Box
      aria-label="Rotating 3D capsule"
      role="img"
      sx={{
        position: 'relative',
        zIndex: 2,
        display: 'grid',
        placeItems: 'center',
        minHeight: { xs: 210, md: 300 },
        perspective: '1100px',
        overflow: 'hidden',
        borderRadius: 4,
        background:
          'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95), rgba(225,239,237,0.66) 38%, rgba(210,225,224,0.18) 72%, transparent 74%)',
        '&::after': {
          content: '""',
          position: 'absolute',
          width: '42%',
          height: 24,
          borderRadius: '50%',
          background: 'rgba(34, 71, 73, 0.16)',
          filter: 'blur(14px)',
          transform: 'translateY(86px)',
        },
        '@keyframes capsuleRoll': {
          from: { transform: 'rotateX(16deg) rotateY(-28deg) rotateZ(-10deg)' },
          to: { transform: 'rotateX(16deg) rotateY(332deg) rotateZ(-10deg)' },
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: { xs: 190, md: 250 },
          height: { xs: 86, md: 112 },
          transformStyle: 'preserve-3d',
          animation: 'capsuleRoll 1ms linear both',
          animationTimeline: 'view(block 12% 88%)',
          willChange: 'transform',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            transform: 'rotateX(16deg) rotateY(-22deg) rotateZ(-10deg)',
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '999px 0 0 999px',
            background: 'linear-gradient(145deg, #f7fbfa 0%, #d9ebe8 48%, #86aaa7 100%)',
            boxShadow: 'inset 12px 10px 18px rgba(255,255,255,0.82), inset -12px -8px 18px rgba(45,90,91,0.22)',
            transform: 'translateZ(18px)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            left: '50%',
            borderRadius: '0 999px 999px 0',
            background: 'linear-gradient(145deg, #78aaa8 0%, #3d7779 55%, #205457 100%)',
            boxShadow: 'inset 12px 8px 16px rgba(255,255,255,0.28), inset -14px -10px 20px rgba(11,40,44,0.34)',
            transform: 'translateZ(18px)',
          }}
        />
        <Box sx={{ position: 'absolute', inset: '49% 0 auto', height: 2, background: 'rgba(25, 66, 68, 0.3)', transform: 'translateZ(20px)' }} />
      </Box>
    </Box>
  );
}

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

interface SceneShellProps {
  index: number;
  title: string;
  subtitle: string;
  badge: string;
  accent: string;
  progress: number;
  children: React.ReactNode;
  onEnterWorkspace: () => void;
  showSkip: boolean;
}

const SceneShell: React.FC<SceneShellProps> = ({
  index,
  title,
  subtitle,
  badge,
  accent,
  progress,
  children,
  onEnterWorkspace,
  showSkip,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const clamped = Math.max(0, Math.min(1, progress));
  const isReduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: '100dvh',
        py: { xs: 4, md: 7 },
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100vw',
        left: '50%',
        right: '50%',
        ml: 'calc(50% - 50vw)',
        mr: 'calc(50% - 50vw)',
        px: { xs: 2.5, sm: 4, lg: 6 },
        borderTop: index > 0 ? `1px solid ${alpha(theme.palette.divider, 0.55)}` : undefined,
        background:
          isReduced
            ? theme.palette.background.default
            : `radial-gradient(circle at 15% 12%, ${alpha(accent, 0.14)} 0%, transparent 38%),
             radial-gradient(circle at 85% 85%, ${alpha('#2F8F9E', 0.09)} 0%, transparent 42%),
             ${theme.palette.background.default}`,
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
          maxWidth: isMobile ? '100%' : 1160,
          mx: 'auto',
          position: 'relative',
          zIndex: 2,
          opacity: isReduced ? 1 : 0.4 + clamped * 0.6,
          transform: isReduced ? 'none' : `translateY(${(1 - clamped) * 22}px)`,
          transition: 'opacity 260ms ease, transform 260ms ease',
        }}
      >
        <Stack spacing={1.8} sx={{ maxWidth: 980 }}>
          <Chip
            label={`Scene ${index + 1} · ${badge}`}
            size="small"
            sx={{
              width: 'fit-content',
              fontFamily: monoStack,
              backgroundColor: alpha(accent, 0.11),
              color: 'text.primary',
              border: `1px solid ${alpha(accent, 0.25)}`,
              fontSize: { xs: '0.7rem', sm: '0.74rem' },
            }}
          />
          <Typography variant="h2" component="h2" sx={{ maxWidth: 980 }}>
            {title}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: 920 }}>
            {subtitle}
          </Typography>
        </Stack>

        <Box
          sx={{
            mt: { xs: 3, md: 4 },
            position: 'relative',
            borderRadius: 4,
            backgroundColor: alpha(theme.palette.background.paper, isReduced ? 0.95 : 0.86),
            border: `1px solid ${alpha(theme.palette.divider, 0.72)}`,
            backdropFilter: 'blur(16px)',
            boxShadow: '0 24px 80px rgba(18, 28, 34, 0.08)',
            overflow: 'hidden',
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              background:
                isReduced
                  ? 'none'
                  : `linear-gradient(120deg, ${alpha(accent, 0.12)} 0%, ${alpha(accent, 0) } 44%, ${alpha('#2F8F9E', 0.08)} 100%)`,
              opacity: 0.55,
            }}
          />
          <Box sx={{ position: 'relative', zIndex: 1, p: { xs: 2.2, sm: 3.2, md: 3.8 } }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
};

const sceneRail: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  right: 22,
  transform: 'translateY(-50%)',
  zIndex: 30,
  display: 'grid',
  gap: 8,
};

export const ScrollNarrative: React.FC<ScrollNarrativeProps> = ({
  onEnterWorkspace,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [activeScene, setActiveScene] = useState(0);
  const [sceneRatios, setSceneRatios] = useState<number[]>(new Array(SECTION_COUNT).fill(0));
  const [demoRows, setDemoRows] = useState<DemoCandidate[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const sectionsRef = useRef<Array<HTMLElement | null>>([]);

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

  const networkRows = useMemo(
    () => demoRows.slice(0, 7),
    [demoRows],
  );

  const compareRows = useMemo(
    () => demoRows.filter(row => row.chembl_id !== queryTarget.chembl_id).slice(0, 5),
    [demoRows, queryTarget.chembl_id],
  );

  useEffect(() => {
    const thresholds = Array.from({ length: isReducedMotion ? 2 : 20 }, (_, i) =>
      isReducedMotion ? i / 1 : i / 19,
    );
    const observer = new IntersectionObserver(
      entries => {
        setSceneRatios(previous => {
          const next = [...previous];

          entries.forEach(entry => {
            const scene = Number((entry.target as HTMLElement).dataset.scene);
            if (Number.isNaN(scene) || scene < 0 || scene >= SECTION_COUNT) {
              return;
            }

            next[scene] = entry.isIntersecting ? entry.intersectionRatio : 0;
          });

          const visible = next
            .map((ratio, idx) => ({ ratio, idx }))
            .filter(({ ratio }) => ratio > 0)
            .sort((a, b) => b.ratio - a.ratio);

          if (visible.length) {
            setActiveScene(visible[0].idx);
          }

          return next;
        });
      },
      {
        threshold: thresholds,
        rootMargin: isReducedMotion ? '0px 0px -10% 0px' : '0px 0px -38% 0px',
      },
    );

    sectionsRef.current.forEach(section => {
      if (section) {
        observer.observe(section);
      }
    });

    return () => observer.disconnect();
  }, [isReducedMotion]);

  useEffect(() => {
    const sceneForData = sceneRatios.findIndex(ratio => ratio > 0);
    if (sceneForData >= 2 && !demoLoading && demoRows.length === 0 && !demoError) {
      setDemoLoading(true);
    }
  }, [demoError, demoLoading, demoRows.length, sceneRatios]);

  useEffect(() => {
    if (!demoLoading) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        await loadDescriptors();
        const query = await StaticSearchApi.resolveName({ name: DRILL_NAME }).catch(() => ({
          smiles: DRILL_SMILES,
          chembl_id: 'CHEMBL25',
          name: DRILL_NAME,
        }));

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

  const activeDescriptor = demoRows[0];

  const sectionStyle = {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  } as const;

  return (
    <Box sx={{ position: 'relative', mb: isMobile ? 0 : 2, pb: 2 }}>
      {!isReducedMotion && (
        <Box sx={{ ...sceneRail }} aria-hidden>
          {Array.from({ length: SECTION_COUNT }).map((_, index) => {
            const progress = sceneRatios[index] || 0;
            const active = activeScene >= index;
            return (
              <Box
                key={index}
                sx={{
                  width: 8,
                  height: active ? 38 : 14,
                  borderRadius: 999,
                  transition: 'all 220ms ease',
                  background: active
                    ? `linear-gradient(180deg, ${brand.indigo} 0%, ${brand.violet} 100%)`
                    : alpha(theme.palette.text.disabled, 0.28),
                  opacity: progress > 0 ? 1 : 0.45,
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 999,
                    opacity: progress,
                    background: active ? alpha('#fff', 0.25) : 'transparent',
                    boxShadow: active ? `0 0 0 1px ${alpha(brand.indigo, 0.35)}` : undefined,
                  }}
                />
              </Box>
            );
          })}
        </Box>
      )}

      <Box
        data-scene="0"
        ref={el => {
          sectionsRef.current[0] = el as HTMLElement | null;
        }}
        sx={sectionStyle}
      >
        <SceneShell
          index={0}
          title="A floating capsule starts the story"
          subtitle="A realistic product micro-view leads the workflow, then the research layer opens."
          badge="Visual probe"
          accent="#5a98a9"
          progress={sceneRatios[0]}
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch">
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.8, md: 2.2 },
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
                  background: alpha('#ffffff', 0.66),
                  minHeight: isMobile ? 240 : 340,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Entry cue
                  </Typography>
                  <Typography variant="h5" sx={{ mb: 0.8 }}>
                    {DRILL_NAME}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This is a research surface, not clinical advice. Structural similarity is used for
                    candidate recall.
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip label="ChEMBL 35 source" size="small" />
                  <Chip label="Morgan + Tanimoto" size="small" color="primary" variant="outlined" />
                  <Chip
                    label="No substitution implied"
                    size="small"
                    color="default"
                    variant="outlined"
                  />
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={0}
                sx={{
                  minHeight: isMobile ? 230 : 340,
                  p: isMobile ? 1.8 : 2.3,
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
                  background:
                    'radial-gradient(circle at 28% 16%, rgba(47, 143, 158, 0.12), transparent 46%), radial-gradient(circle at 82% 76%, rgba(75, 149, 138, 0.1), transparent 48%)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  sx={{
                    width: isMobile ? 180 : 260,
                    height: isMobile ? 150 : 220,
                    borderRadius: 8,
                    border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    background: alpha(theme.palette.background.paper, 0.72),
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 30px rgba(17, 24, 28, 0.14)',
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: -12,
                      borderRadius: 999,
                      filter: 'blur(26px)',
                      background: 'radial-gradient(circle at 50% 42%, rgba(47,143,158,0.2), transparent 70%)',
                    }}
                  />
                  <Capsule3D />
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 2.8, color: 'text.secondary' }}
          >
            <ArrowDownward sx={{ fontSize: 18 }} />
            <Typography variant="caption">
              Scroll to map molecular descriptors and move into candidate space.
            </Typography>
          </Stack>
        </SceneShell>
      </Box>

      <Box
        data-scene="1"
        ref={el => {
          sectionsRef.current[1] = el as HTMLElement | null;
        }}
        sx={sectionStyle}
      >
        <SceneShell
          index={1}
          title="From appearance to molecular signature"
          subtitle="The system converts structure into machine-readable descriptors: fingerprints, MW, logP, and atom-level features."
          badge="Feature extraction"
          accent="#3f8f89"
          progress={sceneRatios[1]}
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Grid container spacing={2} alignItems="stretch">
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={0}
                sx={{ p: 2.4, borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.75)}` }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Source query
                </Typography>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {DRILL_NAME}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  SMILES: <Box component="span" sx={{ fontFamily: monoStack }}>{DRILL_SMILES}</Box>
                </Typography>

                <Divider sx={{ borderColor: theme.palette.divider, mb: 2 }} />

                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip label="Tanimoto threshold set: 0.2" size="small" />
                    <Chip label="Max neighborhood size: 10" size="small" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    These settings are defaults for this demonstration; workspace values are fully adjustable.
                  </Typography>
                </Stack>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                elevation={0}
                sx={{ p: 2.2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.75)}` }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Property snapshot from real payload
                </Typography>

                {demoLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading real neighborhood descriptors from the static corpus...
                  </Typography>
                ) : demoError ? (
                  <Typography variant="body2" color="text.secondary">
                    Demo data unavailable in this session. You can still use the workspace below.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    <Grid container spacing={1}>
                      <Grid size={{ xs: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.7)}` }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Molecular weight
                          </Typography>
                          <Typography variant="subtitle2">{formatValue(activeDescriptor?.molecular_weight, 'g/mol')}</Typography>
                        </Paper>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.7)}` }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            logP
                          </Typography>
                          <Typography variant="subtitle2">{formatValue(activeDescriptor?.logp)}</Typography>
                        </Paper>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.7)}` }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            HBA / HBD
                          </Typography>
                          <Typography variant="subtitle2">
                            {formatValue(activeDescriptor?.h_bond_acceptors, '')} /{' '}
                            {formatValue(activeDescriptor?.h_bond_donors, '')}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.7)}` }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Heavy atoms
                          </Typography>
                          <Typography variant="subtitle2">{formatValue(activeDescriptor?.heavy_atoms)}</Typography>
                        </Paper>
                      </Grid>
                    </Grid>
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
        sx={sectionStyle}
      >
        <SceneShell
          index={2}
          title="A structured candidate network forms"
          subtitle="Each node is a near neighbor from existing data. Edges indicate score proximity and are for exploration only."
          badge="Similarity graph"
          accent="#5ca08e"
          progress={sceneRatios[2]}
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
              mt: 1,
              minHeight: isMobile ? 320 : 420,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <WhenVisible minHeight={300}>
              <Box
                sx={{
                  position: 'relative',
                  height: isMobile ? 320 : 420,
                  width: '100%',
                  px: { xs: 1.5, md: 2 },
                  py: { xs: 1.5, md: 2 },
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 1000 460"
                  preserveAspectRatio="none"
                  aria-hidden
                  style={{ position: 'absolute', inset: 0 }}
                >
                  {networkRows.map((candidate, index) => {
                    const angle = (Math.PI * 2 * index) / Math.max(networkRows.length, 1);
                    const radiusX = isMobile ? 280 : 350;
                    const radiusY = isMobile ? 120 : 160;
                    const x = 500 + Math.cos(angle) * radiusX;
                    const y = 230 + Math.sin(angle) * radiusY;
                    return (
                      <line
                        key={`edge-${candidate.chembl_id}`}
                        x1="500"
                        y1="230"
                        x2={x.toFixed(2)}
                        y2={y.toFixed(2)}
                        stroke={theme.palette.text.secondary}
                        strokeOpacity={0.35 + candidate.similarity * 0.4}
                        strokeWidth={Math.max(1.3, Math.min(3.8, candidate.similarity * 5.2))}
                        strokeDasharray={isReducedMotion ? 'none' : '4 4'}
                      />
                    );
                  })}
                </svg>
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      px: 1.4,
                      py: 0.6,
                      borderRadius: 999,
                      border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
                      background: alpha('#fff', 0.9),
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontFamily: monoStack }}>
                      {DRILL_NAME}
                    </Typography>
                  </Paper>
                </Box>
                {networkRows.map((candidate, index) => {
                  const angle = (Math.PI * 2 * index) / Math.max(networkRows.length, 1);
                  const radiusX = isMobile ? 280 : 350;
                  const radiusY = isMobile ? 120 : 160;
                  const left = 500 + Math.cos(angle) * radiusX;
                  const top = 230 + Math.sin(angle) * radiusY;

                  return (
                    <Paper
                      key={candidate.chembl_id}
                      elevation={0}
                      sx={{
                        position: 'absolute',
                        left: `${left / 10}%`,
                        top: `${top / 4.6}%`,
                        transform: 'translate(-50%, -50%)',
                        px: 1,
                        py: 0.6,
                        borderRadius: 999,
                        border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
                        background: alpha(theme.palette.background.paper, 0.78),
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      <Typography
                        variant="caption"
                        title={candidate.pref_name || candidate.chembl_id}
                        sx={{
                          fontFamily: monoStack,
                          display: 'block',
                          maxWidth: isMobile ? 165 : 205,
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

                <Box
                  sx={{
                    position: 'absolute',
                    left: 12,
                    right: 12,
                    bottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Network is a retrieval map built from actual project similarity scoring.
                  </Typography>
                  <Chip label="Exploratory scaffold" size="small" />
                </Box>
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
        sx={sectionStyle}
      >
        <SceneShell
          index={3}
          title="The candidate map collapses into comparison controls"
          subtitle="You can now sort, filter, and inspect property summaries before opening the dedicated result workspace."
          badge="Candidate triage"
          accent="#6a9e93"
          progress={sceneRatios[3]}
          onEnterWorkspace={onEnterWorkspace}
          showSkip
        >
          <Paper
            elevation={0}
            sx={{
              mt: 1,
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: { xs: 2.2, md: 2.8 }, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="subtitle2" sx={{ mb: 0.3 }}>
                Live-style comparison preview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Data points are sourced from loaded candidates; this is a structural triage view, not a clinical conclusion.
              </Typography>
            </Box>
            <Stack spacing={1} sx={{ p: { xs: 1.5, md: 2 } }}>
              {compareRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {demoLoading
                    ? 'Loading live neighborhood candidates for comparison...'
                    : demoError
                      ? 'Demo neighborhood unavailable; run a live query from the workspace below.'
                      : 'No neighbors available for this quick preview.'}
                </Typography>
              ) : (
                compareRows.map((row) => (
                  <Paper
                    key={row.chembl_id}
                    elevation={0}
                    sx={{
                      p: 1.35,
                      borderRadius: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr 1fr 1fr',
                      columnGap: 1,
                      rowGap: 0.8,
                      alignItems: 'center',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: monoStack,
                        pr: isMobile ? 0 : 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.pref_name || row.chembl_id}
                    </Typography>
                    <Typography variant="body2">
                      <Box component="span" sx={{ color: 'text.secondary' }}>Similarity</Box>{' '}
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {formatPercent(row.similarity)}
                      </Box>
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
                In the workspace, this panel expands into full filtering, sorting, export, and traceability views.
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
        sx={sectionStyle}
      >
        <SceneShell
          index={4}
          title="Enter the actual toolset"
          subtitle="Use the live interface below for your own query, property filters, FDA equivalence checks, and data export."
          badge="Research workspace"
          accent="#568a95"
          progress={sceneRatios[4]}
          onEnterWorkspace={onEnterWorkspace}
          showSkip={false}
        >
          <Paper
            elevation={0}
            sx={{
              mt: 1,
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.divider, 0.75)}`,
              p: { xs: 2.2, md: 2.8 },
              background: isReducedMotion
                ? alpha(theme.palette.background.paper, 0.95)
                : alpha(theme.palette.background.paper, 0.86),
            }}
          >
            <Typography variant="h6" gutterBottom>
              Research workflow entry points
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Button
                  size="large"
                  fullWidth
                  variant="contained"
                  startIcon={<Search />}
                  onClick={onEnterWorkspace}
                  sx={{ borderRadius: 999 }}
                >
                  Explore Compounds
                </Button>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Button
                  component={RouterLink}
                  to="/alternatives"
                  fullWidth
                  size="large"
                  variant="outlined"
                  startIcon={<BubbleChart />}
                  sx={{ borderRadius: 999 }}
                >
                  Therapeutic equivalence lookup
                </Button>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Button
                  component={RouterLink}
                  to="/results"
                  fullWidth
                  size="large"
                  variant="outlined"
                  startIcon={<Explore />}
                  sx={{ borderRadius: 999 }}
                >
                  Browse all results
                </Button>
              </Grid>
            </Grid>

            <Stack
              direction={isMobile ? 'column' : 'row'}
              spacing={1}
              sx={{ mt: 2, flexWrap: 'wrap' }}
              useFlexGap
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Speed fontSize="small" />
                <Chip
                  label={isReducedMotion ? 'Reduced motion mode' : 'Scroll-linked transitions enabled'}
                  size="small"
                />
              </Stack>
              <Link
                component={RouterLink}
                to="/alternatives"
                sx={{ fontSize: '0.88rem', alignSelf: 'center' }}
              >
                See how similarity and substitution are separated in analysis
              </Link>
              <Link
                component={RouterLink}
                to="/results"
                sx={{ fontSize: '0.88rem', alignSelf: 'center' }}
              >
                Open the full result explorer
              </Link>
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Structural resemblance does not imply clinical interchangeability. Use the equivalence layer and clinician
              judgment for treatment decisions.
            </Typography>
          </Paper>
        </SceneShell>
      </Box>
    </Box>
  );
};
