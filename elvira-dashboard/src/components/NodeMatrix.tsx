// src/components/NodeMatrix.tsx
import { Box, Paper, Typography, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider, Grid, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { getCentralMetrics, getFacultyAMetrics } from '../services/api';

type NodeData = {
  eTotal?: number;
  u?: string;
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
  onOpen
}: {
  title: string;
  subtitle?: string;
  data?: NodeData | null;
  onOpen: () => void;
}) {
  const energy = data?.eTotal;
  const u = data?.u !== undefined ? parseFloat(String(data.u)) : undefined;
  const r = data?.r;

  return (
    <Tooltip
      title={
        data
          ? (
            <Box sx={{ fontSize: 12 }}>
              <div>Energy: {energy?.toFixed(6)} kWh</div>
              <div>U: {u !== undefined ? u.toFixed(3) + ' %' : '—'}</div>
              <div>R: {r ?? '—'}</div>
            </Box>
          )
          : 'No data'
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
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>

        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">Energy: {energy !== undefined ? energy.toFixed(6) + ' kWh' : '— kWh'}</Typography>
          <Typography variant="body2">U: {u !== undefined ? u.toFixed(3) + ' %' : '— %'}</Typography>
          <Typography variant="body2">R: {r ?? '—'}</Typography>
        </Box>
      </Paper>
    </Tooltip>
  );
}

export default function NodeMatrix() {
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
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Node stats matrix</Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        gridTemplateRows: { xs: 'repeat(4, 1fr)', md: 'repeat(3, 1fr)' },
        gap: 1,
        height: { xs: 'auto', md: 360 }
      }}>
        {/* Central (2x2 on md, spans top-left) */}
        <Box sx={{ gridColumn: { xs: '1 / span 2', md: '1 / span 2' }, gridRow: { xs: '1', md: '1 / span 2' } }}>
          <NodeCard title="Central (2×2)" subtitle="Central NGINX" data={central} onOpen={() => setOpenNode({ id: 'central', data: central })} />
        </Box>

        {/* Row1 Col3 */}
        <Box sx={{ gridColumn: { xs: '1', md: '3' }, gridRow: { xs: '2', md: '1' } }}>
          <NodeCard title="Faculty C" subtitle="Edge C" onOpen={() => setOpenNode({ id: 'C', data: null })} />
        </Box>

        {/* Row2 Col3 */}
        <Box sx={{ gridColumn: { xs: '2', md: '3' }, gridRow: { xs: '3', md: '2' } }}>
          <NodeCard title="Faculty D" subtitle="Edge D" onOpen={() => setOpenNode({ id: 'D', data: null })} />
        </Box>

        {/* Row3 Col1 - Faculty A */}
        <Box sx={{ gridColumn: { xs: '1', md: '1' }, gridRow: { xs: '4', md: '3' } }}>
          <NodeCard title="Faculty A" subtitle="Edge A" data={facultyA} onOpen={() => setOpenNode({ id: 'facultyA', data: facultyA })} />
        </Box>

        {/* Row3 Col2 */}
        <Box sx={{ gridColumn: { xs: '2', md: '2' }, gridRow: { xs: '4', md: '3' } }}>
          <NodeCard title="Faculty B" subtitle="Edge B" onOpen={() => setOpenNode({ id: 'B', data: null })} />
        </Box>

        {/* Row3 Col3 */}
        <Box sx={{ gridColumn: { xs: '1 / span 2', md: '3' }, gridRow: { xs: '5', md: '3' } }}>
          <NodeCard title="Faculty E" subtitle="Edge E" onOpen={() => setOpenNode({ id: 'E', data: null })} />
        </Box>
      </Box>

      {/* Dialog for details */}
      <Dialog open={!!openNode} onClose={() => setOpenNode(null)} fullWidth maxWidth="sm">
        <DialogTitle>Node details: {openNode?.id}</DialogTitle>
        <DialogContent dividers>
          {openNode?.data ? (
            <Box>
              <Grid container spacing={1}>
                <Grid size={{ xs: 6 }}><Typography variant="caption">Energy</Typography><Typography>{openNode.data.eTotal?.toFixed(6)} kWh</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">U (books)</Typography><Typography>{openNode.data.u}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">Requests (R)</Typography><Typography>{openNode.data.r}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">RPS</Typography><Typography>{openNode.data.rps}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">Lambda</Typography><Typography>{openNode.data.lambda}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">CPU</Typography><Typography>{openNode.data.cpuLoad}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">Mem</Typography><Typography>{openNode.data.memLoad}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption">Transitions</Typography><Typography>{openNode.data.transitions}</Typography></Grid>
                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>

                <Grid size={{ xs: 12 }}>
                  <Typography variant="subtitle2">Quick actions</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="contained">Trigger Prefetch</Button>
                    <Button size="small" variant="outlined">Open Logs</Button>
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
