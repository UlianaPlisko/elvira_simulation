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
  Chip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import { useEffect, useState, useCallback } from 'react';
import { getCentralMetrics, getFacultyAMetrics, getFacultyBMetrics, getFacultyCMetrics, getFacultyDMetrics, getFacultyEMetrics } from '../services/api';
import MemoryIcon from '@mui/icons-material/Memory';
import CpuIcon from '@mui/icons-material/Computer';
import StorageIcon from '@mui/icons-material/Storage';
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

const zeroMetrics: FullNodeMetrics = {
  eTotal: 0,
  powerWatts: 0,
  lambda: 0,
  hostCpuPercent: 0,
  containerCpuPercent: 0,
  memUsageBytes: 0,
  memUsageMb: 0,
  memPercent: 0,
  netRxKiBps: 0,
  netTxKiBps: 0,
  diskReadKiBps: 0,
  diskWriteKiBps: 0,
  pids: 0,
  nginxConnectionsActive: 0,
  requestsTotal: 0,
  requestsSinceReset: 0,
  rps: 0,
  booksUsedBytes: 0,
  booksUsedMb: 0,
  booksUtilPercent: 0,
  transitions: 0,
  simulationHours: 0,
  timestamp: '',
};

function EdgeNodeCard({
  letter,
  data,
  onOpen,
  disabled = false,
}: {
  letter: string;
  data: FullNodeMetrics | null;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const cpu = data?.containerCpuPercent ?? 0;
  const energy = data?.eTotal ?? 0;
  const requests = data?.requestsSinceReset ?? 0;
  const powerWatts = data?.powerWatts ?? 0;
  const cpuColor = cpu > 80 ? 'error' : cpu > 50 ? 'warning' : 'success';

  return (
    <Tooltip title={disabled ? 'Offline in central mode' : data ? `Click for details • ${requests} req • ${powerWatts.toFixed(0)} W` : 'No data'} arrow>
      <Paper
        onClick={() => !disabled && onOpen()}
        sx={{
          p: 1.5,
          height: '100%',
          cursor: disabled ? 'default' : 'pointer',
          transition: disabled ? 'none' : 'all 0.2s ease',
          '&:hover': disabled ? {} : { transform: 'translateY(-4px)', boxShadow: theme.shadows[8] },
          border: '1px solid',
          borderColor: disabled ? 'grey.300' : 'divider',
          opacity: disabled ? 0.6 : 1,
          bgcolor: disabled ? 'grey.100' : 'background.paper',
        }}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight="bold" align="center" sx={{ color: disabled ? 'text.disabled' : 'text.primary' }}>
            Edge {letter}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PowerIcon fontSize="small" color={disabled ? 'disabled' : 'primary'} />
            <Box>
              <Typography variant="body2" sx={{ color: disabled ? 'text.disabled' : 'text.primary' }}>
                {energy.toFixed(6)} kWh
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {powerWatts.toFixed(0)} W
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CpuIcon fontSize="small" sx={{ color: disabled ? theme.palette.grey[500] : theme.palette[cpuColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ color: disabled ? 'text.disabled' : 'text.primary' }}>
                CPU {cpu.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={cpu}
                color={disabled ? 'inherit' : cpuColor}
                sx={{ height: 5, borderRadius: 2 }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon fontSize="small" color={disabled ? 'disabled' : 'info'} />
            <Typography variant="body2" sx={{ color: disabled ? 'text.disabled' : 'text.primary' }}>
              {requests} req
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Tooltip>
  );
}

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
  const u = data?.booksUtilPercent ?? 0;
  const powerWatts = data?.powerWatts ?? 0;

  const cpuColor = cpu > 80 ? 'error' : cpu > 50 ? 'warning' : 'success';
  const memColor = mem > 80 ? 'error' : mem > 60 ? 'warning' : 'success';

  return (
    <Tooltip title={data ? `Click • ${requests} req • ${powerWatts.toFixed(0)} W` : 'No data'} arrow>
      <Paper
        onClick={onOpen}
        sx={{
          p: 2,
          height: '100%',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': { transform: 'translateY(-6px)', boxShadow: theme.shadows[12] },
          border: '2px solid',
          borderColor: 'primary.main',
        }}
      >
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Central Server
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Main NGINX + Manager + Storage
        </Typography>

        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PowerIcon fontSize="small" color="primary" />
            <Box>
              <Typography variant="body2" fontWeight="bold">{energy.toFixed(6)} kWh</Typography>
              <Typography variant="caption">{powerWatts.toFixed(0)} W</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CpuIcon fontSize="small" sx={{ color: theme.palette[cpuColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">{cpu.toFixed(1)}% CPU</Typography>
              <LinearProgress variant="determinate" value={cpu} color={cpuColor} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MemoryIcon fontSize="small" sx={{ color: theme.palette[memColor].main }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">{mem.toFixed(1)}% • {(data?.memUsageMb ?? 0).toFixed(0)} MB</Typography>
              <LinearProgress variant="determinate" value={mem} color={memColor} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon fontSize="small" color="info" />
            <Typography variant="body2">{requests} requests</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <StorageIcon color="action" />
            <Typography variant="body1">{u.toFixed(1)}% storage used</Typography>
          </Box>
        </Stack>
      </Paper>
    </Tooltip>
  );
}

export default function NodeMatrix({ fullHeight, dnsMode }: { fullHeight?: boolean; dnsMode: 'edge' | 'central' }) {
  const [central, setCentral] = useState<FullNodeMetrics | null>(null);
  const [edges, setEdges] = useState<Record<string, FullNodeMetrics | null>>({
    A: null, B: null, C: null, D: null, E: null,
  });
  const [openNode, setOpenNode] = useState<{ id: string; type: 'central' | 'edge'; letter?: string } | null>(null);

  const triggerPrefetch = useCallback((nodeId: string) => {
    console.log(`[PREFETCH] Triggered for ${nodeId}`);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        if (dnsMode === 'central') {
          const cent = await getCentralMetrics();
          if (!mounted) return;
          if (cent.data) setCentral(cent.data);
          setEdges({
            A: zeroMetrics,
            B: zeroMetrics,
            C: zeroMetrics,
            D: zeroMetrics,
            E: zeroMetrics,
          });
        } else {
          const [cent, a, b, c, d, e] = await Promise.all([
            getCentralMetrics(),
            getFacultyAMetrics(),
            getFacultyBMetrics(),
            getFacultyCMetrics(),
            getFacultyDMetrics(),
            getFacultyEMetrics()
          ]);
          if (!mounted) return;
          if (cent.data) setCentral(cent.data);
          setEdges(prev => ({
            ...prev,
            A: a.data ?? null,
            B: b.data ?? null,
            C: c.data ?? null,
            D: d.data ?? null,
            E: e.data ?? null,
          }));
        }
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
  }, [dnsMode]);

  const getCurrentData = () => {
    if (!openNode) return null;
    if (openNode.type === 'central') return central;
    if (openNode.letter) return edges[openNode.letter];
    return null;
  };

  return (
    <Box sx={{ height: fullHeight ? '100%' : 'auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Eco-CDN Node Matrix • Live Monitoring
      </Typography>

      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: '1.8fr 1fr',
          gridTemplateAreas: `
            "central central central edgeA"
            "edgeB   edgeC   edgeD   edgeE"
          `,
          mt: 1,
          minHeight: 0,
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
              height: '100%',
            }}
          >
            <EdgeNodeCard
              letter={letter}
              data={edges[letter]}
              onOpen={() => setOpenNode({ id: `Edge ${letter}`, type: 'edge', letter })}
              disabled={dnsMode === 'central'}
            />
          </Box>
        ))}
      </Box>

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