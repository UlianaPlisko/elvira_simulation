import './../styles.css';
import { useState } from 'react';
import {
  Container,
  Grid,
  Typography,
  AppBar,
  Toolbar,
  Drawer,
  IconButton,
  Box,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';

import TopologyDiagram from './TopologyDiagram';
import ControlsPanel from './ControlsPanel';
import EcoIndexCard from './EcoIndexCard';
import NodeMatrix from './NodeMatrix';

export default function UseCase1() {
  const [runningSim, setRunningSim] = useState<number | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);

  const startSim = (k: number) => setRunningSim(k);
  const stopSim = () => setRunningSim(null);

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm')); // phone

  // Tunable minimum row height (topology and right column will match)
  const ROW_MIN_HEIGHT = { xs: 320, md: 360 };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Elvira CDN Simulator</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} disableGutters sx={{ mt: 4, px: 2 }}>
        <Grid container spacing={3} alignItems="stretch">
          {/* LEFT: topology */}
          <Grid size={{ xs: 12, md: 6 }} sx={{ minHeight: ROW_MIN_HEIGHT, height: '100%', }}>
            <TopologyDiagram runningSim={runningSim}  />
          </Grid>

          {/* RIGHT: EcoIndex (top) + NodeMatrix (fills remaining) */}
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{ minHeight: ROW_MIN_HEIGHT, display: 'flex', flexDirection: 'column' }}
          >
            <Box sx={{ mb: 1 }}>
              <EcoIndexCard />
            </Box>

            <Box sx={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' }}>
              {/* NodeMatrix fills right column area; no forced square */}
              <Box sx={{ width: '100%', height: '100%', display: 'flex' }}>
                <NodeMatrix fullHeight />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Floating settings button (only shown when drawer is closed) */}
      {!controlsOpen && (
        <IconButton
          aria-label="open controls"
          onClick={() => setControlsOpen(true)}
          sx={{
            position: 'fixed',
            right: 12,
            top: 12,
            zIndex: 1400,
            bgcolor: 'background.paper',
            boxShadow: 3,
            borderRadius: 1,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { bgcolor: 'background.default' },
          }}
          size="large"
        >
          <SettingsIcon />
        </IconButton>
      )}

      {/* Drawer for controls */}
      <Drawer
        anchor="right"
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: isSmall ? '100%' : 360,
            p: 2,
            borderTopLeftRadius: 8,
            borderBottomLeftRadius: 8,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle1">Controls</Typography>
          {/* simple close icon (no outline, small) */}
          <IconButton aria-label="close controls" onClick={() => setControlsOpen(false)} sx={{ p: 0.5 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <ControlsPanel
          runningSim={runningSim}
          onStart={(k) => {
            startSim(k);
          }}
          onStop={() => stopSim()}
        />
      </Drawer>
    </>
  );
}
