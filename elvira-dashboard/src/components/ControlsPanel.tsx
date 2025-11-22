// src/components/ControlsPanel.tsx
import { useState } from 'react';
import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';

export default function ControlsPanel() {
  const [status, setStatus] = useState({ s1: 'idle', s2: 'idle', s3: 'idle' });

  const start = (k: number) => {
    setStatus(prev => ({ ...prev, [`s${k}`]: 'running' }));
    setTimeout(() => setStatus(prev => ({ ...prev, [`s${k}`]: 'idle' })), 2500);
  };

  const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent ut.';

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom>Controls</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Small panel to start/stop simulations. Wire these buttons to your backend later.
      </Typography>

      <Stack spacing={2}>
        <Box>
          <Tooltip title={lorem} arrow>
            <span>
              <Button variant="contained" fullWidth onClick={() => start(1)}>Start simulation 1</Button>
            </span>
          </Tooltip>
          <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={status.s1} size="small" color={status.s1 === 'running' ? 'primary' : 'default'} />
            <Typography variant="caption">Sim 1 — baseline run</Typography>
          </Box>
        </Box>

        <Box>
          <Tooltip title={lorem} arrow>
            <span>
              <Button variant="contained" fullWidth onClick={() => start(2)}>Start simulation 2</Button>
            </span>
          </Tooltip>
          <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={status.s2} size="small" color={status.s2 === 'running' ? 'primary' : 'default'} />
            <Typography variant="caption">Sim 2 — energy-aware</Typography>
          </Box>
        </Box>

        <Box>
          <Tooltip title={lorem} arrow>
            <span>
              <Button variant="contained" fullWidth onClick={() => start(3)}>Start simulation 3</Button>
            </span>
          </Tooltip>
          <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={status.s3} size="small" color={status.s3 === 'running' ? 'primary' : 'default'} />
            <Typography variant="caption">Sim 3 — failover test</Typography>
          </Box>
        </Box>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Buttons are design-only now. When you connect backend, call the API and update statuses here.
        </Typography>
      </Stack>
    </Paper>
  );
}
