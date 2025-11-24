import { Box, Paper, Typography, Stack, Button, Divider, Chip, Tooltip } from '@mui/material';

type Props = {
  runningSim: number | null;
  onStart: (k: number) => void;
  onStop: () => void;
  onReset?: () => void;
};

export default function ControlsPanel({ runningSim, onStart, onStop, onReset }: Props) {
  const simulations = [
    { id: 1, label: 'Simulation 1', caption: 'baseline run' },
    { id: 2, label: 'Simulation 2', caption: 'energy-aware' },
    { id: 3, label: 'Simulation 3', caption: 'failover test' },
  ];

  const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

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
          onClick={() => {
            if (onReset) onReset();
          }}
        >
          Reset metrics
        </Button>

        <Typography variant="caption" color="text.secondary">
          Buttons are design-only now. Connect your backend later to control simulations and reset metrics.
        </Typography>
      </Stack>
    </Paper>
  );
}
