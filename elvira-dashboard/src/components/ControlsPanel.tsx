// src/components/ControlsPanel.tsx
import { useState } from 'react';
import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';
import { resetAllMetrics } from '../services/api';

type Props = {
  runningSim: number | null;
  onStart: (k: number) => void;
  onStop: () => void;
  onReset?: () => void; // still supported if parent wants to override
};

export default function ControlsPanel({ runningSim, onStart, onStop, onReset }: Props) {
  const [loadingReset, setLoadingReset] = useState(false);

  const simulations = [
    { id: 1, label: 'Simulation 1', caption: 'baseline run' },
    { id: 2, label: 'Simulation 2', caption: 'energy-aware' },
    { id: 3, label: 'Simulation 3', caption: 'failover test' },
  ];

  const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

  // local reset handler (prefers onReset prop if provided)
  const handleResetClick = async () => {
    if (onReset) {
      // parent supplied a custom reset handler — call it and return
      onReset();
      return;
    }

    setLoadingReset(true);
    try {
      const { central, faculty } = await resetAllMetrics(runningSim);

      const results: string[] = [];

      // central
      if (central.status === 'fulfilled') {
        const res = central.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Central reset OK');
        } else {
          results.push(`Central reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Central reset failed: ${String(central.reason)}`);
      }

      // faculty
      if (faculty.status === 'fulfilled') {
        const res = faculty.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(faculty.reason)}`);
      }
      console.log('Reset metrics results:', results); //todoooooo later!!!!!!!!!
    } catch (err) {
      console.error('Unexpected reset error:', err);
      alert('Reset failed (see console)');
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Controls
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Start/stop simulations. Only one simulation can run at a time. When a simulation runs other buttons are disabled.
      </Typography>

      <Stack spacing={2}>
        {simulations.map((s) => {
          const isRunning = runningSim === s.id;
          const disabledOther = runningSim !== null && !isRunning;
          return (
            <Box key={s.id}>
              <Tooltip title={lorem} arrow>
                <span>
                  <Button
                    variant={isRunning ? 'outlined' : 'contained'}
                    fullWidth
                    onClick={() => (isRunning ? onStop() : onStart(s.id))}
                    disabled={disabledOther}
                  >
                    {isRunning ? `Stop ${s.label}` : `Start ${s.label}`}
                  </Button>
                </span>
              </Tooltip>

              <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label={isRunning ? 'running' : 'idle'} size="small" color={isRunning ? 'primary' : 'default'} />
                <Typography variant="caption">{`${s.label} — ${s.caption}`}</Typography>
              </Box>
            </Box>
          );
        })}

        <Divider />

        <Button
          variant="outlined"
          fullWidth
          onClick={handleResetClick}
          disabled={runningSim !== null || loadingReset}
        >
          {loadingReset ? 'Resetting…' : 'Reset metrics'}
        </Button>

        <Typography variant="caption" color="text.secondary">
          Buttons are design-only now. Connect your backend later to control simulations and reset metrics.
        </Typography>
      </Stack>
    </Paper>
  );
}
