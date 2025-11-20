// src/components/TopologyDiagram.tsx
import { Box, Typography, Paper } from '@mui/material';

type Node = { id: string; label: string; ip?: string; color?: string };

const edges: Node[] = [
  { id: 'A', label: 'Faculty A', color: '#4caf50', ip: '192.168.10.1' },
  { id: 'B', label: 'Faculty B', color: '#2196f3', ip: '192.168.10.2' },
  { id: 'C', label: 'Faculty C', color: '#ff9800', ip: '192.168.10.3' },
  { id: 'D', label: 'Faculty D', color: '#9c27b0', ip: '192.168.10.4' },
  { id: 'E', label: 'Faculty E', color: '#607d8b', ip: '192.168.10.5' },
];

export default function TopologyDiagram() {
  // positions for five points around center (percent x,y)
  const positions = [
    { left: '50%', top: '6%' },   // top
    { left: '85%', top: '35%' },  // right-top
    { left: '70%', top: '78%' },  // right-bottom
    { left: '30%', top: '78%' },  // left-bottom
    { left: '15%', top: '35%' },  // left-top
  ];

  return (
    <Paper sx={{ p: 3, position: 'relative', overflow: 'visible' }}>
      <Typography variant="h6" gutterBottom>Топология (Central + Edge nodes)</Typography>

      <Box sx={{ position: 'relative', width: '100%', height: { xs: 320, md: 360 }, bgcolor: '#fafafa', borderRadius: 2 }}>
        {/* central node */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 110,
            height: 110,
            borderRadius: '50%',
            bgcolor: '#f44336',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '700',
            boxShadow: 3,
            textAlign: 'center',
          }}
        >
          Central<br />NGINX
        </Box>

        {/* edges */}
        {edges.map((n, i) => (
          <Box key={n.id} sx={{ position: 'absolute', ...positions[i], transform: 'translate(-50%, -50%)' }}>
            {/* connector line: using an absolute pseudo-line is tricky, instead show small arrow-ish dot */}
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: n.color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                boxShadow: 2,
                fontSize: '0.9rem',
                textAlign: 'center',
              }}
            >
              {n.label}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>{n.ip}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
