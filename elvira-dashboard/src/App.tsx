// src/App.tsx
import { Container, Grid, Typography, AppBar, Toolbar } from '@mui/material';
import TopologyDiagram from './components/TopologyDiagram';
import EcoIndexCard from './components/EcoIndexCard';
import GrafanaIframe from './components/GrafanaIframe';

function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Elvira CDN Simulator</Typography>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <TopologyDiagram />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <EcoIndexCard />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Typography variant="h6">Живые графики (Grafana)</Typography>
            <GrafanaIframe />
          </Grid>
        </Grid>
      </Container>
    </>
  );
}

export default App;
