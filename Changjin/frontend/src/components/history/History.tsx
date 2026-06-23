import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Alert,
  Divider,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  History as HistoryIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store/store';
import { clearHistory } from '../../store/slices/searchSlice';
import { useCompoundSearch } from '../../hooks/useSearch';

export const History: React.FC = () => {
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

  const handleHistoryItemClick = async (entry: typeof searchHistory[0]) => {
    setSearchingItem(entry.id);

    try {
      if (entry.type === 'smiles') {
        await searchBySMILES(entry.query, false); // Use regular search for history
      } else {
        await searchByName(entry.query, false); // Use regular search for history
      }

      // Navigate to results page with query parameters
      const params = new URLSearchParams({
        query: entry.query,
        type: entry.type,
        ai: 'false',
      });

      navigate(`/results?${params.toString()}`);

    } catch (error) {
      console.error('Error rerunning historical search:', error);
      // Could add error handling here - show a toast or alert
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

  const getSearchTypeColor = (type: 'smiles' | 'name') => {
    return type === 'smiles' ? 'primary' : 'secondary';
  };

  const getSearchTypeLabel = (type: 'smiles' | 'name') => {
    return type === 'smiles' ? 'SMILES' : 'Name';
  };

  if (searchHistory.length === 0) {
    return (
      <Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Search History
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Your recent searches will appear here
          </Typography>
        </Box>

        <Card elevation={2}>
          <CardContent>
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              textAlign: 'center',
            }}>
              <HistoryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Search History
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start searching for compounds to see your history here. Click on any previous search to rerun it!
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 3
      }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Search History
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {searchHistory.length} recent {searchHistory.length === 1 ? 'search' : 'searches'}
          </Typography>
        </Box>

        {searchHistory.length > 0 && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<ClearIcon />}
            onClick={handleClearHistory}
            size="small"
          >
            Clear History
          </Button>
        )}
      </Box>

      <Card elevation={2}>
        <CardContent sx={{ p: 0 }}>
          <List>
            {searchHistory.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleHistoryItemClick(entry)}
                    disabled={searchingItem === entry.id}
                    sx={{
                      px: 3,
                      py: 2,
                      cursor: searchingItem === entry.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ListItemIcon>
                      {searchingItem === entry.id ? (
                        <CircularProgress size={20} color="primary" />
                      ) : (
                        <SearchIcon color="primary" />
                      )}
                    </ListItemIcon>

                  <ListItemText
                    primary={
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5
                      }}>
                        <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                          "{entry.query}"
                        </Typography>
                        <Chip
                          label={getSearchTypeLabel(entry.type)}
                          color={getSearchTypeColor(entry.type)}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(entry.timestamp)}
                      </Typography>
                    }
                  />

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyQuery(entry.query);
                    }}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'primary.main',
                        backgroundColor: 'primary.main',
                        opacity: 0.1,
                      },
                    }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
                </ListItem>
                {index < searchHistory.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ mt: 3, textAlign: 'left' }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            Tips:
          </Typography>
          <Box component="ul" sx={{
            mt: 0,
            mb: 0,
            pl: 2,
            '& li': {
              mb: 0.5,
              lineHeight: 1.4,
              fontSize: '0.875rem'
            },
            '& li:last-child': {
              mb: 0
            }
          }}>
            <li>Click on any search to rerun it and see results</li>
            <li>Click the copy icon to copy queries for reuse</li>
            <li>History is automatically saved and limited to your 10 most recent searches</li>
          </Box>
        </Box>
      </Alert>
    </Box>
  );
};
