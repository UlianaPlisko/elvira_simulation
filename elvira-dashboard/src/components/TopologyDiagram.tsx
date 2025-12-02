// src/components/TopologyDiagram.tsx
import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, Tooltip } from '@mui/material';

type NodeInfo = { id: string; label: string; ip?: string; color?: string };

const edges: NodeInfo[] = [
  { id: 'A', label: 'Faculty A', color: '#4caf50', ip: '192.168.10.1' },
  { id: 'B', label: 'Faculty B', color: '#2196f3', ip: '192.168.10.2' },
  { id: 'C', label: 'Faculty C', color: '#ff9800', ip: '192.168.10.3' },
  { id: 'D', label: 'Faculty D', color: '#9c27b0', ip: '192.168.10.4' },
  { id: 'E', label: 'Faculty E', color: '#607d8b', ip: '192.168.10.5' },
];

// positions in percentages (left%, top%)
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
};

export default function TopologyDiagram({ runningSim }: Props) {
  // phases: 0..4 (0=center, 1=1/4, 2=1/2, 3=3/4, 4=edge)
  const TOTAL_PHASES = 5;
  const [phase, setPhase] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (runningSim != null) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      // update every 300ms (tweak as you like)
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
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runningSim]);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // synchronized t for all packets
  const t = phase / (TOTAL_PHASES - 1); // 0..1 inclusive

  // compute packet positions (same t for all nodes -> synchronous)
  const packetPositions = edges.map((_, i) => ({
    left: `${lerp(central.x, positions[i].x, t)}%`,
    top: `${lerp(central.y, positions[i].y, t)}%`,
    visible: runningSim !== null,
  }));

  // shorten factor for lines so arrowhead is outside node circle (0..1, closer to 1 means nearly full length)
  const SHORTEN_FACTOR = 0.92;

  // compute shortened endpoint for an edge position
  const shortenedEndpoint = (p: { x: number; y: number }) => ({
    x: central.x + (p.x - central.x) * SHORTEN_FACTOR,
    y: central.y + (p.y - central.y) * SHORTEN_FACTOR,
  });

  return (
    <Paper sx={{ p: 3, position: 'relative', overflow: 'visible' }}>
      <Typography variant="h6" gutterBottom>
        Topology Diagram (Central + Edge nodes)
      </Typography>

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
        {/* svg lines (0..100 coordinate system) */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <defs>
            {/* smaller arrowhead marker */}
            <marker
              id="arrowhead-small"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
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
                opacity={0.85}
              />
            );
          })}
        </svg>

        {/* central node */}
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

        {/* edge nodes */}
        {edges.map((n, i) => (
          <Box
            key={n.id}
            sx={{
              position: 'absolute',
              left: `${positions[i].x}%`,
              top: `${positions[i].y}%`,
              transform: 'translate(-50%,-50%)',
              zIndex: 8,
            }}
          >
            <Tooltip title={`${n.label} — ${n.ip}`} arrow>
              <Box
                sx={{
                  width: { xs: 56, md: 68 },
                  height: { xs: 56, md: 68 },
                  borderRadius: '50%',
                  bgcolor: n.color,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  boxShadow: 2,
                  fontSize: { xs: '0.65rem', md: '0.85rem' },
                  textAlign: 'center',
                  px: 1,
                  cursor: 'pointer',
                  transition: 'transform 150ms ease',
                  '&:hover': { transform: 'translateY(-6px)' },
                }}
              >
                {n.label}
              </Box>
            </Tooltip>

            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
              {n.ip}
            </Typography>
          </Box>
        ))}

        {/* animated packets (synchronized) */}
        {packetPositions.map((pp, i) => (
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
              zIndex: 20, // draw above nodes so final stage is visible
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
