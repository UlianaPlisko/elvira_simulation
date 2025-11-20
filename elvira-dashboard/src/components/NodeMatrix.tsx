// src/components/NodeMatrix.tsx
import { Box, Paper, Typography } from '@mui/material';

function NodeCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Paper sx={{ p: 1, height: '100%' }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="caption" color="text.secondary">{subtitle}</Typography>

      {/* placeholder stats */}
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2">Energy: — kWh</Typography>
        <Typography variant="body2">U: — %</Typography>
        <Typography variant="body2">R: —</Typography>
      </Box>
    </Paper>
  );
}

export default function NodeMatrix() {
  // Grid: 3x3. Central (Central Server) spans 2 rows x 2 cols in top-left corner
  return (
    <Box>
      <Typography variant="h6" gutterBottom>Node stats matrix</Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: 1,
          height: 360, // match height to left container visually
        }}
      >
        {/* Row1 Col1..2 & Row2 Col1..2 = central (span 2x2) */}
        <Box sx={{ gridColumn: '1 / span 2', gridRow: '1 / span 2' }}>
          <NodeCard title="Central (2×2)" subtitle="Central NGINX" />
        </Box>

        {/* Row1 Col3 */}
        <Box sx={{ gridColumn: '3', gridRow: '1' }}>
          <NodeCard title="Faculty C" subtitle="Edge C" />
        </Box>

        {/* Row2 Col3 */}
        <Box sx={{ gridColumn: '3', gridRow: '2' }}>
          <NodeCard title="Faculty D" subtitle="Edge D" />
        </Box>

        {/* Row3 Col1 */}
        <Box sx={{ gridColumn: '1', gridRow: '3' }}>
          <NodeCard title="Faculty A" subtitle="Edge A" />
        </Box>

        {/* Row3 Col2 */}
        <Box sx={{ gridColumn: '2', gridRow: '3' }}>
          <NodeCard title="Faculty B" subtitle="Edge B" />
        </Box>

        {/* Row3 Col3 */}
        <Box sx={{ gridColumn: '3', gridRow: '3' }}>
          <NodeCard title="Faculty E" subtitle="Edge E" />
        </Box>
      </Box>
    </Box>
  );
}
