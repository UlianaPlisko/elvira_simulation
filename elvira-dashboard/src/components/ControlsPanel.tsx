// src/components/ControlsPanel.tsx
import { useState } from 'react';
import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';
import { resetAllMetrics, startSimulation, stopSimulation } from '../services/api';  // Добавили import для start/stop

type Props = {
  runningSim: number | null;
  onStart: (k: number) => void;
  onStop: () => void;
  onReset?: () => void; // still supported if parent wants to override
};

export default function ControlsPanel({ runningSim, onStart, onStop, onReset }: Props) {
  const [loadingReset, setLoadingReset] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);  // Новый state для loading во время start/stop

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
      const { central, facultyA, facultyB, facultyC, facultyD, facultyE } = await resetAllMetrics(runningSim);

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
      if (facultyA.status === 'fulfilled') {
        const res = facultyA.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(facultyA.reason)}`);
      }

      if (facultyB.status === 'fulfilled') {
        const res = facultyB.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(facultyB.reason)}`);
      }
      if (facultyC.status === 'fulfilled') {
        const res = facultyC.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(facultyC.reason)}`);
      }
      if (facultyD.status === 'fulfilled') {
        const res = facultyD.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(facultyD.reason)}`);
      }
      if (facultyE.status === 'fulfilled') {
        const res = facultyE.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty A reset OK');
        } else {
          results.push(`Faculty A reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty A reset failed: ${String(facultyE.reason)}`);
      }
      console.log('Reset metrics results:', results); 
    } catch (err) {
      console.error('Unexpected reset error:', err);
      alert('Reset failed (see console)');
    } finally {
      setLoadingReset(false);
    }
  };

  // Новый handler для start/stop симуляции (только для id=1)
  const handleStartStop = async (id: number, isRunning: boolean) => {
    if (id !== 1) {
      console.log(`Simulation ${id} not implemented yet`);
      return;  // Заглушка для 2 и 3
    }

    setLoadingSim(true);
    try {
      if (isRunning) {
        await stopSimulation();
        console.log('Simulation stopped');
        onStop();  // Вызов пропса для обновления состояния в parent
      } else {
        await startSimulation();
        console.log('Simulation started');
        onStart(id);  // Вызов пропса
      }
    } catch (err) {
      console.error('Simulation error:', err);
      alert('Failed to control simulation (see console)');
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
          const isDisabled = disabledOther || loadingSim || (s.id !== 1 && !isRunning);  // Для 2/3 disable start, если не running
          return (
            <Box key={s.id}>
              <Tooltip title={lorem} arrow>
                <span>
                  <Button
                    variant={isRunning ? 'outlined' : 'contained'}
                    fullWidth
                    onClick={() => handleStartStop(s.id, isRunning)}
                    disabled={isDisabled}
                  >
                    {loadingSim && s.id === 1 ? 'Processing...' : (isRunning ? `Stop ${s.label}` : `Start ${s.label}`)}
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
          Buttons are connected to backend for Simulation 1. Others are design-only for now.
        </Typography>
      </Stack>
    </Paper>
  );
}