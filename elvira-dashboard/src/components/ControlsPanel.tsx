// src/components/ControlsPanel.tsx
import { useState } from 'react';
import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';
import { resetAllMetrics, startNormalSimulation, startExamSimulation, stopSimulation } from '../services/api';  // added startExamSimulation

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
    { id: 1, label: 'Simulation 1', caption: 'normal mode', details: 'Normal mode — light sessions: 1–3 books per session, small jitter; steady traffic for usual load testing.' },
    { id: 2, label: 'Simulation 2', caption: 'exam mode',   details: 'Exam mode — heavy/bursty sessions: 1–9 books per session, high jitter; used to simulate peak/burst load.' },
  ];

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
          results.push('Faculty B reset OK');
        } else {
          results.push(`Faculty B reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty B reset failed: ${String(facultyB.reason)}`);
      }
      if (facultyC.status === 'fulfilled') {
        const res = facultyC.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty C reset OK');
        } else {
          results.push(`Faculty C reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty C reset failed: ${String(facultyC.reason)}`);
      }
      if (facultyD.status === 'fulfilled') {
        const res = facultyD.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty D reset OK');
        } else {
          results.push(`Faculty D reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty D reset failed: ${String(facultyD.reason)}`);
      }
      if (facultyE.status === 'fulfilled') {
        const res = facultyE.value;
        if (res && res.status >= 200 && res.status < 300) {
          results.push('Faculty E reset OK');
        } else {
          results.push(`Faculty E reset HTTP ${res?.status ?? 'unknown'}`);
        }
      } else {
        results.push(`Faculty E reset failed: ${String(facultyE.reason)}`);
      }
      console.log('Reset metrics results:', results);
    } catch (err) {
      console.error('Unexpected reset error:', err);
      alert('Reset failed (see console)');
    } finally {
      setLoadingReset(false);
    }
  };

  // handler for start/stop simulation (supports id=1 and id=2)
  const handleStartStop = async (id: number, isRunning: boolean) => {
    if (id !== 1 && id !== 2) {
      console.log(`Simulation ${id} not implemented yet (design-only).`);
      return;
    }

    setLoadingSim(true);
    try {
      if (isRunning) {
        await stopSimulation();
        console.log('Simulation stopped');
        onStop();  // Вызов пропса для обновления состояния в parent
      } else {
        if (id === 1) {
          await startNormalSimulation();
          console.log('Normal simulation started');
        } else {
          await startExamSimulation();
          console.log('Exam simulation started');
        }
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
          const isDisabled = disabledOther || loadingSim;  // allow both id 1 and 2 to start/stop
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
          Buttons: Simulation 1 = normal mode (works). Simulation 2 = exam mode (also triggers backend start).
        </Typography>
      </Stack>
    </Paper>
  );
}
