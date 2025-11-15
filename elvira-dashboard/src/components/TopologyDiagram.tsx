// src/components/TopologyDiagram.tsx
import React from 'react';
import { Box, Typography} from '@mui/material';

const nodes = [
  { id: 'client', label: 'Студент (Faculty A)', ip: '192.168.1.50', color: '#4caf50' },
  { id: 'main-dns', label: 'Main DNS', ip: '172.20.0.3', color: '#2196f3' },
  { id: 'sec-dns', label: 'Secondary DNS', ip: '172.20.0.4', color: '#ff9800' },
  { id: 'edge', label: 'Edge Node A', ip: '172.20.0.10', color: '#9c27b0' },
  { id: 'central', label: 'Central Server', ip: '172.20.0.2', color: '#f44336' },
];

export default function TopologyDiagram() {
  return (
    <Box sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom>Топология сети</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <Box sx={{ textAlign: 'center' }}>
              <Box
                sx={{
                  width: 80, height: 80, borderRadius: '50%',
                  bgcolor: node.color, color: 'white',
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center', alignItems: 'center',
                  fontWeight: 'bold', fontSize: '0.8rem'
                }}
              >
                {node.label.split(' ')[0]}<br />
                {node.label.split(' ').slice(1).join(' ')}
              </Box>
              <Typography variant="caption">{node.ip}</Typography>
            </Box>
            {i < nodes.length - 1 && <Box>→</Box>}
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
}