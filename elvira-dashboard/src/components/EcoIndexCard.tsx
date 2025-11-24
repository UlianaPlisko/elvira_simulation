// src/components/EcoIndexCard.tsx
import { Card, CardContent, Typography, LinearProgress} from '@mui/material';
import { useEffect, useState } from 'react';
import { getCentralMetrics, getFacultyAMetrics } from '../services/api';

export default function EcoIndexCard() {
  const [totalEI, setTotalEI] = useState<number>(0);
  const [totalCO2, setTotalCO2] = useState<number>(0);
  const [summary, setSummary] = useState({
    totalEnergy: 0,
    avgU: 0,
    totalR: 0,
    t: 0,
    central_mb: 0,
    faculty_mb: 0
  });

  useEffect(() => {
    let mounted = true;

    const fetchAndCompute = async () => {
      try {
        const [centralRes, facultyRes] = await Promise.all([
          getCentralMetrics(),
          getFacultyAMetrics()
        ]);

        const central = centralRes.data ?? {};
        const faculty = facultyRes.data ?? {};

        const totalE = (central.eTotal || 0) + (faculty.eTotal || 0);
        const totalR = (central.r || 0) + (faculty.r || 0);
        const uCentral = parseFloat(central.u || '0'); // percent
        const uFaculty = parseFloat(faculty.u || '0'); // percent
        const avgU = ( (isNaN(uCentral) ? 0 : uCentral) + (isNaN(uFaculty) ? 0 : uFaculty) ) / 2;

        // MB values (new)
        const uCentralMb = parseFloat(central.u_mb ?? '0');
        const uFacultyMb = parseFloat(faculty.u_mb ?? '0');

        const t = central.t || faculty.t || 0;
        const denom = (totalR * t) || 1;
        const ei = (totalE * (1 - avgU / 100)) / denom;
        const carbonFactor = 0.5;
        const co2 = ei * carbonFactor;

        if (!mounted) return;

        setTotalEI(ei);
        setTotalCO2(co2);
        setSummary({ totalEnergy: totalE, avgU, totalR, t, central_mb: uCentralMb, faculty_mb: uFacultyMb });
      } catch (err) {
        console.error('EcoIndex fetch error:', err);
      }
    };

    fetchAndCompute();
    const id = setInterval(fetchAndCompute, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <Card sx={{ boxShadow: 3, borderRadius: 2 }}>
      <CardContent>
        {/* header unchanged */}
        <Typography variant="h3" color="primary" sx={{ mt: 1 }}>
          {Number(totalEI).toFixed(6)}
        </Typography>

        <Typography variant="body2" sx={{ mt: 1 }}>
          Total Energy: <strong>{Number(summary.totalEnergy).toFixed(6)} kWh</strong><br />
          Total CO₂: <strong>{Number(totalCO2).toFixed(6)} kg</strong><br />
          Avg U (Books %): <strong>{Number(summary.avgU).toFixed(3)}%</strong> | Central: <strong>{Number(summary.central_mb).toFixed(3)} MB</strong> | Faculty: <strong>{Number(summary.faculty_mb).toFixed(3)} MB</strong><br/>
          Total R: <strong>{summary.totalR}</strong> | T: <strong>{summary.t}</strong>h
        </Typography>

        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, Number(summary.avgU)))}
          sx={{ mt: 2, height: 10, borderRadius: 2 }}
        />
      </CardContent>
    </Card>
  );
}