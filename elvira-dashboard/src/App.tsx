// src/App.tsx
import './styles.css';
import { Container, Grid, Typography, AppBar, Toolbar } from '@mui/material';
import TopologyDiagram from './components/TopologyDiagram';
import ControlsPanel from './components/ControlsPanel';
import EcoIndexCard from './components/EcoIndexCard';
import NodeMatrix from './components/NodeMatrix';

export default function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Elvira CDN Simulator</Typography>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        {/* Topology row: left big area, right small controls */}
        <Grid container spacing={3} alignItems="flex-start">
          
          <Grid size={{ xs: 12, md: 9 }}>
            <TopologyDiagram />
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <ControlsPanel />
          </Grid>

        </Grid>

        {/* Stats row: left EI (big), right node matrix (same width) */}
        <Grid container spacing={3} sx={{ mt: 1 }}>
          
          <Grid size={{ xs: 12, md: 6 }}>
            <EcoIndexCard />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <NodeMatrix />
          </Grid>

        </Grid>
      </Container>
    </>
  );
}