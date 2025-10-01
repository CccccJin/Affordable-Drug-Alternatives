import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
} from '@mui/material';
import {
  History as HistoryIcon,
} from '@mui/icons-material';

export const History: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Search History
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View your recent searches and saved compounds
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          🔄 <strong>Feature Coming Soon:</strong> Search history and favorites functionality will be implemented in a future update.
        </Typography>
      </Alert>

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
              No History Yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your search history will appear here once you start searching for compounds.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
