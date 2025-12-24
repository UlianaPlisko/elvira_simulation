// src/components/UseCase1.tsx
import './../styles.css';
import { useState, useEffect, useRef } from 'react';
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
import { getDnsStatus, switchToCentral, switchToEdge } from '../services/api';

export default function UseCase1() {
  const [runningSim, setRunningSim] = useState<number | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [dnsMode, setDnsMode] = useState<'edge' | 'central'>('edge');
  const [loadingMode, setLoadingMode] = useState(false);

  const timeoutRef = useRef<number | null>(null);

  const onSimulationStarted = (k: number) => {
    setRunningSim(k);

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(async () => {
      console.log('Auto-stop timer triggered — resetting frontend state');
      setRunningSim(null);
      timeoutRef.current = null;
    }, 615000);
  };

  const handleSimulationStoppedWithData = (data: any[]) => {
    if (data.length === 0) return;

    const mode = dnsMode === 'central' ? 'central' : 'edge';
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `ecoindex_${mode}_${timestamp}.json`;

    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // In the onSimulationStopped callback (already there)
  const onSimulationStopped = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setRunningSim(null);
    // Note: the data download is now handled by EcoIndexCard → handleSimulationStoppedWithData
  };

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  const ROW_MIN_HEIGHT = { xs: 320, md: 360 };

  useEffect(() => {
    const loadMode = async () => {
      try {
        const res = await getDnsStatus();
        setDnsMode(res.data.currentMode);
      } catch (err) {
        console.warn('Could not fetch DNS mode, assuming edge');
        setDnsMode('edge');
      }
    };
    loadMode();
  }, []);

  const handleSwitchMode = async () => {
    setLoadingMode(true);
    try {
      if (dnsMode === 'edge') {
        await switchToCentral();
        setDnsMode('central');
      } else {
        await switchToEdge();
        setDnsMode('edge');
      }
    } catch (err) {
      console.error('Failed to switch DNS mode:', err);
      alert('Failed to switch infrastructure mode');
    } finally {
      setLoadingMode(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Elvira CDN Simulator</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} disableGutters sx={{ mt: 4, px: 2 }}>
        <Grid container spacing={3} alignItems="stretch">
          <Grid size={{ xs: 12, md: 6 }} sx={{ minHeight: ROW_MIN_HEIGHT, height: '100%' }}>
            <TopologyDiagram runningSim={runningSim} dnsMode={dnsMode} onSwitchMode={handleSwitchMode} loading={loadingMode} />
          </Grid>

          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{ minHeight: ROW_MIN_HEIGHT, display: 'flex', flexDirection: 'column' }}
          >
            <EcoIndexCard 
              dnsMode={dnsMode} 
              isSimulationRunning={runningSim !== null}
              onSimulationStoppedWithData={handleSimulationStoppedWithData}
            />

            <Box sx={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' }}>
              <Box sx={{ width: '100%', height: '100%', display: 'flex' }}>
                <NodeMatrix fullHeight dnsMode={dnsMode} />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

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
          <IconButton aria-label="close controls" onClick={() => setControlsOpen(false)} sx={{ p: 0.5 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <ControlsPanel
          runningSim={runningSim}
          onStart={onSimulationStarted}
          onStop={onSimulationStopped}
        />
      </Drawer>
    </>
  );
}