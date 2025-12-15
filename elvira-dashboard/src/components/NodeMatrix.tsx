// src/components/NodeMatrix.tsx — ФИНАЛЬНАЯ ВЕРСИЯ (декабрь 2025)
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
  Chip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import { useEffect, useState, useCallback } from 'react';
import { getCentralMetrics, getFacultyAMetrics, getFacultyBMetrics, getFacultyCMetrics, getFacultyDMetrics, getFacultyEMetrics } from '../services/api';
import MemoryIcon from '@mui/icons-material/Memory';
import CpuIcon from '@mui/icons-material/Computer';
import PowerIcon from '@mui/icons-material/Power';
import SpeedIcon from '@mui/icons-material/Speed';
import RefreshIcon from '@mui/icons-material/Refresh';

interface FullNodeMetrics {
  eTotal: number;
  powerWatts: number;
  lambda: number;
  hostCpuPercent: number;
  containerCpuPercent: number;
  memUsageBytes: number;
  memUsageMb: number;
  memPercent: number;
  netRxKiBps: number;
  netTxKiBps: number;
  diskReadKiBps: number;
  diskWriteKiBps: number;
  pids: number;
  nginxConnectionsActive: number;
  requestsTotal: number;
  requestsSinceReset: number;
  rps: number;
  booksUsedBytes: number;
  booksUsedMb: number;
  booksUtilPercent: number;
  transitions: number;
  simulationHours: number;
  timestamp: string;
}

// Упрощённая карточка Edge — без кнопки Prefetch
function EdgeNodeCard({
  letter,
  data,
  onOpen,
}: {
  letter: string;
  data: FullNodeMetrics | null;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const cpu = data?.containerCpuPercent ?? 0;
  const energy = data?.eTotal ?? 0;
  const requests = data?.requestsSinceReset ?? 0;
  const powerWatts = data?.powerWatts ?? 0;
  const cpuColor = cpu > 80 ? 'error' : cpu > 50 ? 'warning' : 'success';

  return (
    <Tooltip title={data ? `Click for details • ${requests} req • ${powerWatts.toFixed(0)} W` : 'No data'} arrow>
      <Paper
        onClick={onOpen}
        sx={{
          p: 2,
          height: '100%',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': { transform: 'translateY(-6px)', boxShadow: theme.shadows[10] },
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight="bold" align="center">
            Edge {letter}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PowerIcon fontSize="small" color="primary" />
            <Box>
              <Typography variant="body2">{energy.toFixed(6)} kWh</Typography>
              <Typography variant="caption" color="text.secondary">{powerWatts.toFixed(0)} W</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CpuIcon fontSize="small" sx={{ color: theme.palette[cpuColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">CPU {cpu.toFixed(1)}%</Typography>
              <LinearProgress variant="determinate" value={cpu} color={cpuColor} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon fontSize="small" color="info" />
            <Typography variant="body2">{requests} req</Typography>
          </Box>
        </Stack>
      </Paper>
    </Tooltip>
  );
}

// Центральная карточка — тоже без Prefetch кнопки
function CentralNodeCard({
  data,
  onOpen,
}: {
  data: FullNodeMetrics | null;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const cpu = data?.containerCpuPercent ?? 0;
  const mem = data?.memPercent ?? 0;
  const energy = data?.eTotal ?? 0;
  const requests = data?.requestsSinceReset ?? 0;
  const powerWatts = data?.powerWatts ?? 0;

  const cpuColor = cpu > 80 ? 'error' : cpu > 50 ? 'warning' : 'success';
  const memColor = mem > 80 ? 'error' : mem > 60 ? 'warning' : 'success';

  return (
    <Tooltip title={data ? `Click • ${requests} req • ${powerWatts.toFixed(0)} W` : 'No data'} arrow>
      <Paper
        onClick={onOpen}
        sx={{
          p: 3,
          height: '100%',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': { transform: 'translateY(-8px)', boxShadow: theme.shadows[16] },
          border: '2px solid',
          borderColor: 'primary.main',
        }}
      >
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Central Server
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Main NGINX + Manager + Storage
        </Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PowerIcon color="primary" />
            <Box>
              <Typography variant="body1" fontWeight="bold">{energy.toFixed(6)} kWh</Typography>
              <Typography variant="caption">{powerWatts.toFixed(0)} W</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CpuIcon sx={{ color: theme.palette[cpuColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1">{cpu.toFixed(1)}% CPU</Typography>
              <LinearProgress variant="determinate" value={cpu} color={cpuColor} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <MemoryIcon sx={{ color: theme.palette[memColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1">{mem.toFixed(1)}% • {(data?.memUsageMb ?? 0).toFixed(0)} MB</Typography>
              <LinearProgress variant="determinate" value={mem} color={memColor} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SpeedIcon color="info" />
            <Typography variant="body1">{requests} requests</Typography>
          </Box>
        </Stack>
      </Paper>
    </Tooltip>
  );
}

export default function NodeMatrix({ fullHeight }: { fullHeight?: boolean }) {
  const [central, setCentral] = useState<FullNodeMetrics | null>(null);
  const [edges, setEdges] = useState<Record<string, FullNodeMetrics | null>>({
    A: null, B: null, C: null, D: null, E: null,
  });
  const [openNode, setOpenNode] = useState<{ id: string; type: 'central' | 'edge'; letter?: string } | null>(null);

  const triggerPrefetch = useCallback((nodeId: string) => {
    console.log(`[PREFETCH] Triggered for ${nodeId}`);
    // Позже: await api.triggerPrefetch(nodeId);
  }, []);

  // Единый фетч всех данных
  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        // fetch central, faculty A and faculty B
        const [cent, a, b, c, d, e] = await Promise.all([getCentralMetrics(), getFacultyAMetrics(), getFacultyBMetrics(), getFacultyCMetrics(), getFacultyDMetrics(), getFacultyEMetrics()]);
        if (!mounted) return;
        if (cent.data) setCentral(cent.data);
        if (a.data) setEdges(prev => ({ ...prev, A: a.data }));
        if (b.data) setEdges(prev => ({ ...prev, B: b.data })); 
        if (c.data) setEdges(prev => ({ ...prev, C: c.data }));
        if (d.data) setEdges(prev => ({ ...prev, D: d.data }));
        if (e.data) setEdges(prev => ({ ...prev, E: e.data }));
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

  // Получение актуальных данных для открытого узла
  const getCurrentData = () => {
    if (!openNode) return null;
    if (openNode.type === 'central') return central;
    if (openNode.letter) return edges[openNode.letter];
    return null;
  };

  return (
    <Box sx={{ height: fullHeight ? '100%' : 'auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" gutterBottom fontWeight="bold">
        Eco-CDN Node Matrix • Live Monitoring
      </Typography>

      <Box
      sx={{
        flex: 1,
        display: 'grid',
        gap: 3,
        gridTemplateColumns: 'repeat(4, 1fr)',
        // make top row larger than bottom row so B-E are visibly smaller:
        gridTemplateRows: '2fr 1fr',
        gridTemplateAreas: `
          "central central central edgeA"
          "edgeB   edgeC   edgeD   edgeE"
        `,
        mt: 2,
        minHeight: 0, // allow parent flex sizing to work properly
      }}
    >
      <Box sx={{ gridArea: 'central', height: '100%' }}>
        <CentralNodeCard
          data={central}
          onOpen={() => setOpenNode({ id: 'Central Server', type: 'central' })}
        />
      </Box>

      {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => (
        <Box
          key={letter}
          sx={{
            gridArea:
              letter === 'A'
                ? 'edgeA'
                : letter === 'B'
                ? 'edgeB'
                : letter === 'C'
                ? 'edgeC'
                : letter === 'D'
                ? 'edgeD'
                : 'edgeE',
            height: '100%', // ensure edge cards fill their grid cell
          }}
        >
          <EdgeNodeCard
            letter={letter}
            data={edges[letter]}
            onOpen={() => setOpenNode({ id: `Edge ${letter}`, type: 'edge', letter })}
          />
        </Box>
      ))}

    </Box>
      {/* ДЕТАЛЬНЫЙ ДИАЛОГ — обновляется в реальном времени + кнопка Prefetch */}
      <Dialog open={!!openNode} onClose={() => setOpenNode(null)} maxWidth="md" fullWidth>
        <DialogTitle>Node Details — {openNode?.id}</DialogTitle>
        <DialogContent dividers>
          {(() => {
            const data = getCurrentData();
            if (!data) return <Typography color="text.secondary">Loading...</Typography>;

            return (
              <Grid container spacing={2}>
                <Grid size={12}><Typography variant="h6">Live Metrics • {openNode!.id}</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Energy consumed</Typography><Typography fontWeight="bold">{data.eTotal.toFixed(8)} kWh</Typography></Grid>
                <Grid size={6}><Typography variant="caption">Power</Typography><Typography fontWeight="bold">{data.powerWatts.toFixed(1)} W</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Host CPU</Typography><Typography>{data.hostCpuPercent.toFixed(2)}%</Typography></Grid>
                <Grid size={6}><Typography variant="caption">Container CPU</Typography><Typography fontWeight="bold">{data.containerCpuPercent.toFixed(2)}%</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Memory</Typography><Typography>{data.memUsageMb.toFixed(1)} MB ({data.memPercent.toFixed(1)}%)</Typography></Grid>
                <Grid size={6}><Typography variant="caption">Connections</Typography><Typography>{data.nginxConnectionsActive}</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Requests</Typography><Typography fontWeight="bold">{data.requestsSinceReset}</Typography></Grid>
                <Grid size={6}><Typography variant="caption">RPS</Typography><Typography>{data.rps.toFixed(2)}</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Network</Typography><Typography>{data.netRxKiBps.toFixed(1)} / {data.netTxKiBps.toFixed(1)} KiB/s</Typography></Grid>
                <Grid size={6}><Typography variant="caption">Disk I/O</Typography><Typography>{data.diskReadKiBps.toFixed(1)} / {data.diskWriteKiBps.toFixed(1)} KiB/s</Typography></Grid>

                <Grid size={6}><Typography variant="caption">Books Storage</Typography><Typography>{data.booksUsedMb.toFixed(1)} MB ({data.booksUtilPercent.toFixed(1)}%)</Typography></Grid>
                <Grid size={6}><Typography variant="caption">PIDs</Typography><Typography>{data.pids}</Typography></Grid>

                <Grid size={12}><Divider sx={{ my: 2 }} /></Grid>
                <Grid size={12}>
                  <Chip label={`λ(t) = ${data.lambda.toFixed(3)}`} color={data.lambda > 0.7 ? 'error' : data.lambda > 0.4 ? 'warning' : 'success'} />
                  {data.transitions > 0 && <Chip label={`${data.transitions} transitions`} color="secondary" sx={{ ml: 1 }} />}
                </Grid>

                <Grid size={12} sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<RefreshIcon />}
                    onClick={() => triggerPrefetch(openNode!.id)}
                    fullWidth
                  >
                    Trigger Prefetch — {openNode!.id}
                  </Button>
                </Grid>
              </Grid>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNode(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}