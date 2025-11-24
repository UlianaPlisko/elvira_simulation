// src/components/NodeMatrix.tsx
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  Grid,
  Stack,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { getCentralMetrics, getFacultyAMetrics } from '../services/api';

type NodeData = {
  eTotal?: number;
  u?: string;
  u_mb?: string;
  r?: number;
  rps?: string;
  lambda?: string;
  cpuLoad?: string;
  memLoad?: string;
  transitions?: number;
  t?: number;
};

function NodeCard({
  title,
  subtitle,
  data,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  data?: NodeData | null;
  onOpen: () => void;
}) {
  const energy = data?.eTotal;
  const u = data?.u !== undefined ? parseFloat(String(data.u)) : undefined;
  const uMb = data?.u_mb !== undefined ? parseFloat(String(data.u_mb)) : undefined;
  const r = data?.r;

  return (
    <Tooltip
      title={
        data ? (
          <Box sx={{ fontSize: 12 }}>
            <div>Energy: {energy !== undefined ? Number(energy).toFixed(6) + ' kWh' : '—'}</div>

            <div>
              U:{' '}
              {u !== undefined ? <span style={{ whiteSpace: 'nowrap' }}>{u.toFixed(3)} %</span> : '—'}
              {uMb !== undefined && <> {' '}(<span style={{ whiteSpace: 'nowrap' }}>{uMb.toFixed(3)} MB</span>)</>}
            </div>

            <div>R: {r ?? '—'}</div>
          </Box>
        ) : (
          'No data'
        )
      }
      arrow
      placement="top"
    >
      <Paper
        onClick={onOpen}
        className="node-card"
        sx={{
          p: 2,
          height: '100%',
          cursor: 'pointer',
          transition: 'transform 160ms ease, box-shadow 160ms ease',
          '&:hover': { transform: 'translateY(-6px)', boxShadow: 6 },
        }}
      >
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>

        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">Energy: {energy !== undefined ? energy.toFixed(6) + ' kWh' : '— kWh'}</Typography>
          <Typography variant="body2">U: {u !== undefined ? u.toFixed(3) + ' %' : '— %'}</Typography>
          <Typography variant="body2">R: {r ?? '—'}</Typography>
        </Box>
      </Paper>
    </Tooltip>
  );
}

export default function NodeMatrix({ fullHeight }: { fullHeight?: boolean }) {
  const [central, setCentral] = useState<NodeData | null>(null);
  const [facultyA, setFacultyA] = useState<NodeData | null>(null);

  const [openNode, setOpenNode] = useState<null | { id: string; data: NodeData | null }>(null);

  useEffect(() => {
    let mounted = true;

    const fetch = async () => {
      try {
        const [cRes, fRes] = await Promise.all([getCentralMetrics(), getFacultyAMetrics()]);
        if (!mounted) return;
        setCentral(cRes.data ?? null);
        setFacultyA(fRes.data ?? null);
      } catch (e) {
        console.error('NodeMatrix fetch error:', e);
      }
    };

    fetch();
    const id = setInterval(fetch, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Box sx={{ height: fullHeight ? '100%' : 'auto', width: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Node stats matrix
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gridTemplateRows: { xs: 'repeat(4, 1fr)', md: 'repeat(2, 1fr)' },
          gridAutoRows: fullHeight ? '1fr' : 'auto',
          height: { xs: 'auto', md: fullHeight ? '100%' : 360 },
        }}
      >
        {/* Row 1: central spans cols 1-3, small node on col4 */}
        <Box sx={{ gridColumn: { xs: '1 / span 2', md: '1 / span 3' }, gridRow: { xs: '1', md: '1' } }}>
          <NodeCard
            title="Central (1×3)"
            subtitle="Central NGINX"
            data={central}
            onOpen={() => setOpenNode({ id: 'central', data: central })}
          />
        </Box>

        <Box sx={{ gridColumn: { xs: '1', md: '4' }, gridRow: { xs: '2', md: '1' } }}>
          <NodeCard title="Faculty C" subtitle="Edge C" onOpen={() => setOpenNode({ id: 'C', data: null })} />
        </Box>

        {/* Row 2: four small nodes across cols 1..4 */}
        <Box sx={{ gridColumn: { xs: '1', md: '1' }, gridRow: { xs: '3', md: '2' } }}>
          <NodeCard title="Faculty A" subtitle="Edge A" data={facultyA} onOpen={() => setOpenNode({ id: 'facultyA', data: facultyA })} />
        </Box>

        <Box sx={{ gridColumn: { xs: '2', md: '2' }, gridRow: { xs: '4', md: '2' } }}>
          <NodeCard title="Faculty B" subtitle="Edge B" onOpen={() => setOpenNode({ id: 'B', data: null })} />
        </Box>

        <Box sx={{ gridColumn: { xs: '1 / span 2', md: '3' }, gridRow: { xs: '5', md: '2' } }}>
          <NodeCard title="Faculty D" subtitle="Edge D" onOpen={() => setOpenNode({ id: 'D', data: null })} />
        </Box>

        <Box sx={{ gridColumn: { xs: '1 / span 2', md: '4' }, gridRow: { xs: '6', md: '2' } }}>
          <NodeCard title="Faculty E" subtitle="Edge E" onOpen={() => setOpenNode({ id: 'E', data: null })} />
        </Box>
      </Box>

      {/* Dialog (unchanged) */}
      <Dialog open={!!openNode} onClose={() => setOpenNode(null)} fullWidth maxWidth="sm">
        <DialogTitle>Node details: {openNode?.id}</DialogTitle>
        <DialogContent dividers>
          {openNode?.data ? (
            <Box>
              <Grid container spacing={1}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">Energy</Typography>
                  <Typography>{openNode.data.eTotal?.toFixed(6)} kWh</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">U (books)</Typography>
                  <Typography>{openNode.data.u}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">Requests (R)</Typography>
                  <Typography>{openNode.data.r}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">RPS</Typography>
                  <Typography>{openNode.data.rps}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">Lambda</Typography>
                  <Typography>{openNode.data.lambda}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">CPU</Typography>
                  <Typography>{openNode.data.cpuLoad}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">Mem</Typography>
                  <Typography>{openNode.data.memLoad}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption">Transitions</Typography>
                  <Typography>{openNode.data.transitions}</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 1 }} />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Typography variant="subtitle2">Quick actions</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="contained">
                      Trigger Prefetch
                    </Button>
                    <Button size="small" variant="outlined">
                      Open Logs
                    </Button>
                    <Button size="small">SSH (stub)</Button>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          ) : (
            <Typography color="text.secondary">No detailed data available for this node.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNode(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
