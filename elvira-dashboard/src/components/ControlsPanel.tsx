// src/components/ControlsPanel.tsx
import { useState } from 'react';
import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';
import { resetAllMetrics, startNormalSimulation, startExamSimulation, stopSimulation } from '../services/api';

type Props = {
  runningSim: number | null;
  onStart: (k: number) => void;
  onStop: () => void;
  onReset?: () => void;
};

export default function ControlsPanel({ runningSim, onStart, onStop, onReset }: Props) {
  const [loadingReset, setLoadingReset] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);

  const simulations = [
    { id: 1, label: 'Simulation 1', caption: 'normal mode', details: 'Normal mode — light sessions: 1–3 books per session, small jitter; steady traffic for usual load testing.' },
    { id: 2, label: 'Simulation 2', caption: 'exam mode',   details: 'Exam mode — heavy/bursty sessions: 1–9 books per session, high jitter; used to simulate peak/burst load.' },
  ];

  const handleResetClick = async () => {
    if (onReset) {
      onReset();
      return;
    }

    setLoadingReset(true);
    try {
      await resetAllMetrics(runningSim);
      console.log('Metrics reset completed');
    } catch (err) {
      console.error('Reset error:', err);
      alert('Reset failed');
    } finally {
      setLoadingReset(false);
    }
  };

  const handleStartStop = async (id: number, isRunning: boolean) => {
    if (id !== 1 && id !== 2) return;

    setLoadingSim(true);
    try {
      if (isRunning) {
        await stopSimulation();
        console.log('Simulation stopped');
        onStop();
      } else {
        if (id === 1) {
          await startNormalSimulation();
          console.log('Normal simulation started');
        } else {
          await startExamSimulation();
          console.log('Exam simulation started');
        }
        onStart(id);
      }
    } catch (err) {
      console.error('Simulation control error:', err);
      alert('Failed to control simulation');
      // В случае ошибки не меняем состояние runningSim
    } finally {
      setLoadingSim(false);
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
          const isDisabled = disabledOther || loadingSim;

          return (
            <Box key={s.id}>
              <Tooltip title={s.details} arrow>
                <span>
                  <Button
                    variant={isRunning ? 'outlined' : 'contained'}
                    fullWidth
                    onClick={() => handleStartStop(s.id, isRunning)}
                    disabled={isDisabled}
                  >
                    {loadingSim ? 'Processing...' : isRunning ? `Stop ${s.label}` : `Start ${s.label}`}
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
          Simulations run for exactly 10 minutes. Auto-stop if not stopped manually.
        </Typography>
      </Stack>
    </Paper>
  );
}