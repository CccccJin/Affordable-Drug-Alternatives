import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Divider,
  IconButton,
  CircularProgress,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  HistoryOutlined as HistoryIcon,
  Search as SearchIcon,
  DeleteOutline as ClearIcon,
  ContentCopyOutlined as CopyIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store/store';
import { clearHistory } from '../../store/slices/searchSlice';
import { useCompoundSearch } from '../../hooks/useSearch';
import { monoStack } from '../../styles/theme';

export const History: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const searchHistory = useSelector((state: RootState) => state.search.history);
  const [searchingItem, setSearchingItem] = useState<string | null>(null);

  const { searchBySMILES, searchByName } = useCompoundSearch();

  const handleClearHistory = () => {
    dispatch(clearHistory());
  };

  const handleCopyQuery = (query: string) => {
    navigator.clipboard.writeText(query);
  };

  const handleHistoryItemClick = async (entry: (typeof searchHistory)[0]) => {
    setSearchingItem(entry.id);

    try {
      if (entry.type === 'smiles') {
        await searchBySMILES(entry.query, false); // Use regular search for history
      } else {
        await searchByName(entry.query, false); // Use regular search for history
      }

      const params = new URLSearchParams({
        query: entry.query,
        type: entry.type,
        ai: 'false',
      });

      navigate(`/results?${params.toString()}`);
    } catch (error) {
      console.error('Error rerunning historical search:', error);
    } finally {
      setSearchingItem(null);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const pageHeader = (
    <Box
      className="anim-fade-up"
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 2,
        mb: 4,
      }}
    >
      <Box>
        <Typography
          variant="overline"
          sx={{ color: 'primary.main', display: 'block', mb: 0.5 }}
        >
          Activity
        </Typography>
        <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
          Search history
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {searchHistory.length === 0
            ? 'Your recent searches will appear here'
            : `${searchHistory.length} recent ${searchHistory.length === 1 ? 'search' : 'searches'} — click any entry to rerun it`}
        </Typography>
      </Box>

      {searchHistory.length > 0 && (
        <Button
          variant="outlined"
          color="error"
          startIcon={<ClearIcon />}
          onClick={handleClearHistory}
        >
          Clear history
        </Button>
      )}
    </Box>
  );

  if (searchHistory.length === 0) {
    return (
      <Box sx={{ maxWidth: 880, mx: 'auto' }}>
        {pageHeader}

        <Card elevation={0} className="anim-fade-up anim-delay-1">
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 10,
              px: 3,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
                backgroundColor: alpha(theme.palette.primary.main, 0.07),
                color: 'primary.main',
              }}
            >
              <HistoryIcon sx={{ fontSize: 34 }} />
            </Box>
            <Typography variant="h5" gutterBottom>
              No searches yet
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 380, mb: 3 }}
            >
              Start searching for compounds and your ten most recent queries will
              be saved here, ready to rerun with a single click.
            </Typography>
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={() => navigate('/search')}
            >
              Start searching
            </Button>
          </Box>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto' }}>
      {pageHeader}

      <Card elevation={0} className="anim-fade-up anim-delay-1">
        <List disablePadding>
          {searchHistory.map((entry, index) => (
            <React.Fragment key={entry.id}>
              <ListItem
                disablePadding
                secondaryAction={
                  <Tooltip title="Copy query">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label="Copy query"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyQuery(entry.query);
                      }}
                      sx={{
                        color: 'text.disabled',
                        '&:hover': {
                          color: 'primary.main',
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton
                  onClick={() => handleHistoryItemClick(entry)}
                  disabled={searchingItem === entry.id}
                  sx={{
                    px: 3,
                    py: 2,
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.04),
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 44 }}>
                    {searchingItem === entry.id ? (
                      <CircularProgress size={20} color="primary" />
                    ) : (
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          color: 'primary.main',
                        }}
                      >
                        <SearchIcon sx={{ fontSize: 18 }} />
                      </Box>
                    )}
                  </ListItemIcon>

                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.25,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: entry.type === 'smiles' ? monoStack : 'inherit',
                            fontWeight: 600,
                            wordBreak: 'break-all',
                          }}
                        >
                          {entry.query}
                        </Typography>
                        <Chip
                          label={entry.type === 'smiles' ? 'SMILES' : 'Name'}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(entry.timestamp)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
              {index < searchHistory.length - 1 && <Divider component="li" />}
            </React.Fragment>
          ))}
        </List>
      </Card>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 2.5, textAlign: 'center' }}
        className="anim-fade-up anim-delay-2"
      >
        History is saved locally and limited to your 10 most recent searches.
      </Typography>
    </Box>
  );
};
