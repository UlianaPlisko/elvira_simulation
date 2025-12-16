// UseCase2.tsx - New component for /use-case2 route

import { useState } from 'react';
import {
  Container,
  Typography,
  AppBar,
  Toolbar,
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  Slider,
  Grid,
} from '@mui/material';
import { startUseCase2 } from './../services/api'; // Assuming api.ts is in the same directory or adjust import path

export default function UseCase2() {
  const [strategy, setStrategy] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState('book1.pdf');
  const [algo, setAlgo] = useState('gzip'); // Assuming possible algos; adjust if needed (e.g., add 'brotli' if supported)
  const [level, setLevel] = useState(6); // Default compression level (1-9 for gzip)
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Hardcoded book options with sizes (replace with actual sizes if known; assuming placeholders)
  const books = [
    { value: 'book1.pdf', label: 'book1.pdf (1 MB)' },
    { value: 'book2.pdf', label: 'book2.pdf (2 MB)' },
    { value: 'book3.pdf', label: 'book3.pdf (3 MB)' },
    { value: 'book4.pdf', label: 'book4.pdf (4 MB)' },
  ];

  // Possible compression algos (based on common ones; adjust per backend support)
  const algos = [
    { value: 'gzip', label: 'GZIP' },
    { value: 'brotli', label: 'Brotli' },
    { value: 'zstd', label: 'Zstandard' }, // Added Zstandard as mentioned in the notes
  ];

  const handleRun = async () => {
    setLoading(true);
    setStatus(null);
    try {
      await startUseCase2(strategy, file, algo, level);
      setStatus('Simulation started successfully!');
    } catch (error) {
      setStatus(`Error starting simulation: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Elvira CDN Simulator</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, px: 2 }}> {/* Changed to "lg" for wider layout */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {/* Strategy selection - made vertical for better label visibility */}
          <FormControl component="fieldset" fullWidth>
            <Typography variant="subtitle1" gutterBottom sx={{ color: 'rgba(0, 0, 0, 0.87)' }}> {/* Explicit color for visibility */}
              Choose Strategy
            </Typography>
            <RadioGroup value={strategy} onChange={(e) => setStrategy(Number(e.target.value) as 1 | 2 | 3)}>
              <FormControlLabel value={1} control={<Radio />} label="Strategy 1: No compression" sx={{ color: 'rgba(0, 0, 0, 0.87)' }} /> {/* Explicit color */}
              <FormControlLabel value={2} control={<Radio />} label="Strategy 2: Compress on central, decompress on edge" sx={{ color: 'rgba(0, 0, 0, 0.87)' }} />
              <FormControlLabel value={3} control={<Radio />} label="Strategy 3: Compress on central, decompress on client" sx={{ color: 'rgba(0, 0, 0, 0.87)' }} />
            </RadioGroup>
          </FormControl>

          {/* Book selection */}
          <FormControl fullWidth>
            <InputLabel id="book-select-label" sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>Choose Book</InputLabel> {/* Explicit color */}
            <Select
              labelId="book-select-label"
              value={file}
              label="Choose Book"
              onChange={(e) => setFile(e.target.value)}
              sx={{ color: 'rgba(0, 0, 0, 0.87)' }} 
            >
              {books.map((book) => (
                <MenuItem key={book.value} value={book.value}>
                  {book.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Compression algo */}
          <FormControl fullWidth>
            <InputLabel id="algo-select-label" sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>Compression Algorithm</InputLabel>
            <Select
              labelId="algo-select-label"
              value={algo}
              label="Compression Algorithm"
              onChange={(e) => setAlgo(e.target.value)}
              sx={{ color: 'rgba(0, 0, 0, 0.87)' }}
              disabled={strategy === 1}
            >
              {algos.map((a) => (
                <MenuItem key={a.value} value={a.value}>
                  {a.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Compression level (rate) */}
          <Box sx={{ width: '100%', px: 2 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>
              Compression Level: {level}
            </Typography>
            <Slider
              value={level}
              onChange={(_, newValue) => setLevel(newValue as number)}
              aria-labelledby="compression-level-slider"
              valueLabelDisplay="auto"
              step={1}
              marks
              min={1}
              max={9} // Typical range for gzip/brotli levels
              disabled={strategy === 1}
            />
          </Box>

          {/* Run button */}
          <Button variant="contained" color="primary" onClick={handleRun} disabled={loading}>
            {loading ? 'Running...' : 'Run Simulation'}
          </Button>

          {status && <Typography sx={{ color: status.includes('Error') ? 'red' : 'green' }}>{status}</Typography>} {/* Adjusted color for status */}
        </Box>

        {/* Notes section under controls - fixed Grid to use item xs for proper rendering */}
        <Box sx={{ mt: 4, textAlign: 'left' }}>
          <Typography variant="body1" sx={{ mb: 2, color: 'rgba(0, 0, 0, 0.87)' }}>
            In this use case, we're checking out the most eco-friendly way to handle compression and decompression for delivering scientific PDFs. These come in different sizes and types, which are super common in university digital libraries.
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, color: 'rgba(0, 0, 0, 0.87)' }}>
            We're comparing three strategies:
          </Typography>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Typography variant="body1" sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>
                <strong>1. No compression:</strong> Files are stored and served uncompressed on the central server and all edge nodes. The client gets the raw file with no decompression needed.
              </Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="body1" sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>
                <strong>2. Compression on central server – decompression on edge:</strong> Files are pre-compressed once on the central server using your chosen algorithm (like Gzip or Brotli at different levels). Edge nodes store the compressed version and decompress it every time there's a cache hit before sending the raw file to the client.
              </Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="body1" sx={{ color: 'rgba(0, 0, 0, 0.87)' }}>
                <strong>3. Compression on central server – decompression on client browser:</strong> Edge nodes store and serve the compressed file as-is. The client's browser does the decompression when it receives it.
              </Typography>
            </Grid>
          </Grid>
          <Typography variant="body1" sx={{ mt: 2, mb: 2, color: 'rgba(0, 0, 0, 0.87)' }}>
            For each combo of PDF type and strategy, we measure the full end-to-end energy use, including:
          </Typography>
          <ul style={{ color: 'rgba(0, 0, 0, 0.87)' }}> {/* Style for list */}
            <li>One-time compression energy on the central server (spread out over all future requests)</li>
            <li>Edge-side energy for any decompression, re-compression, or just passing through on cache hits</li>
            <li>Network energy for transferring data between central server and edge, and edge to client (based on actual bytes sent)</li>
            <li>Client-side decompression energy in the browser if a compressed file is delivered</li>
          </ul>
          <Typography variant="body2" sx={{ mt: 2, color: 'rgba(0, 0, 0, 0.87)' }}>
            Heads up: Each simulation runs for around 20 seconds. Compression levels go from 1 (fastest, least compression) to 9 (slowest, best compression). File sizes are approximate and might vary.
          </Typography>
        </Box>
      </Container>
    </>
  );
}