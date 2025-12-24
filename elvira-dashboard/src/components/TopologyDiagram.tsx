// src/components/TopologyDiagram.tsx
import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, Tooltip, Button, Chip } from '@mui/material';

type NodeInfo = { id: string; label: string; ip?: string; color?: string };

const edges: NodeInfo[] = [
  { id: 'A', label: 'Faculty A', color: '#4caf50', ip: '192.168.1.10' },
  { id: 'B', label: 'Faculty B', color: '#2196f3', ip: '192.168.2.10' },
  { id: 'C', label: 'Faculty C', color: '#ff9800', ip: '192.168.3.10' },
  { id: 'D', label: 'Faculty D', color: '#9c27b0', ip: '192.168.4.10' },
  { id: 'E', label: 'Faculty E', color: '#607d8b', ip: '192.168.5.10' },
];

const positions = [
  { x: 50, y: 12 },
  { x: 86, y: 36 },
  { x: 68, y: 78 },
  { x: 32, y: 78 },
  { x: 14, y: 36 },
];

const central = { x: 50, y: 50 };

type Props = {
  runningSim: number | null;
  dnsMode: 'edge' | 'central';
  onSwitchMode: () => void;
  loading: boolean;
};

export default function TopologyDiagram({ runningSim, dnsMode, onSwitchMode, loading }: Props) {
  const TOTAL_PHASES = 5;
  const [phase, setPhase] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (runningSim != null) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        setPhase((p) => (p + 1) % TOTAL_PHASES);
      }, 300);
    } else {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setPhase(0);
    }

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [runningSim]);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const t = phase / (TOTAL_PHASES - 1);

  const packetPositions = edges.map((_, i) => ({
    left: `${lerp(central.x, positions[i].x, t)}%`,
    top: `${lerp(central.y, positions[i].y, t)}%`,
    visible: runningSim !== null,
  }));

  const SHORTEN_FACTOR = 0.92;
  const shortenedEndpoint = (p: { x: number; y: number }) => ({
    x: central.x + (p.x - central.x) * SHORTEN_FACTOR,
    y: central.y + (p.y - central.y) * SHORTEN_FACTOR,
  });

  const isCentralMode = dnsMode === 'central';

  return (
    <Paper sx={{ p: 3, position: 'relative', overflow: 'visible' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">
          Topology Diagram
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={isCentralMode ? 'Central Only' : 'Edge Active'}
            size="small"
            color={isCentralMode ? 'warning' : 'success'}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={onSwitchMode}
            disabled={runningSim !== null || loading}
          >
            {loading ? 'Switching...' : isCentralMode ? 'Enable Edges' : 'Central Only'}
          </Button>
        </Box>
      </Box>

      {runningSim !== null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Infrastructure switch disabled while simulation is running
        </Typography>
      )}

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          aspectRatio: '1 / 1',
          minHeight: { xs: 260, md: 300 },
          maxHeight: 600,
          bgcolor: '#fafafa',
          borderRadius: 2,
          border: '1px solid rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <marker id="arrowhead-small" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#777" />
            </marker>
          </defs>

          {positions.map((p, i) => {
            const e = shortenedEndpoint(p);
            return (
              <line
                key={i}
                x1={central.x}
                y1={central.y}
                x2={e.x}
                y2={e.y}
                stroke="#9e9e9e"
                strokeWidth={0.5}
                markerEnd="url(#arrowhead-small)"
                opacity={isCentralMode ? 0.3 : 0.85}
              />
            );
          })}
        </svg>

        <Box
          sx={{
            position: 'absolute',
            left: `${central.x}%`,
            top: `${central.y}%`,
            transform: 'translate(-50%,-50%)',
            width: { xs: 84, md: 100 },
            height: { xs: 84, md: 100 },
            borderRadius: '50%',
            bgcolor: '#f44336',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            boxShadow: 3,
            textAlign: 'center',
            px: 1,
            zIndex: 10,
          }}
        >
          Central
          <br />
          NGINX
        </Box>

        {edges.map((n, i) => (
          <Box
            key={n.id}
            sx={{
              position: 'absolute',
              left: `${positions[i].x}%`,
              top: `${positions[i].y}%`,
              transform: 'translate(-50%,-50%)',
              zIndex: 8,
              opacity: isCentralMode ? 0.5 : 1,
            }}
          >
            <Tooltip title={`${n.label} — ${n.ip}`} arrow>
              <Box
                sx={{
                  width: { xs: 56, md: 68 },
                  height: { xs: 56, md: 68 },
                  borderRadius: '50%',
                  bgcolor: isCentralMode ? '#bdbdbd' : n.color,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  boxShadow: isCentralMode ? 1 : 2,
                  fontSize: { xs: '0.65rem', md: '0.85rem' },
                  textAlign: 'center',
                  px: 1,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': { transform: isCentralMode ? 'none' : 'translateY(-6px)' },
                }}
              >
                {n.label}
              </Box>
            </Tooltip>

            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5, color: isCentralMode ? 'text.disabled' : 'text.secondary' }}>
              {n.ip}
            </Typography>
          </Box>
        ))}

        {!isCentralMode &&
          packetPositions.map((pp, i) => (
            <Box
              key={'pkt' + i}
              sx={{
                position: 'absolute',
                left: pp.left,
                top: pp.top,
                transform: 'translate(-50%,-50%)',
                width: { xs: 10, md: 12 },
                height: { xs: 10, md: 12 },
                borderRadius: '50%',
                bgcolor: runningSim ? '#000' : 'transparent',
                opacity: pp.visible ? 1 : 0,
                zIndex: 20,
                boxShadow: 2,
                transition: 'left 250ms linear, top 250ms linear, opacity 150ms linear',
              }}
              aria-hidden
            />
          ))}
      </Box>
    </Paper>
  );
}