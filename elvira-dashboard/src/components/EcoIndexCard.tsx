// components/EcoIndexCard.tsx
import { Card, CardContent, Typography, LinearProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { 
  getCentralMetrics, 
  getFacultyAMetrics, 
  getFacultyBMetrics,
  getFacultyCMetrics,
  getFacultyDMetrics,
  getFacultyEMetrics 
} from '../services/api';

export default function EcoIndexCard() {
  const [totalEI, setTotalEI] = useState<number>(0);
  const [totalCO2, setTotalCO2] = useState<number>(0);
  const [summary, setSummary] = useState({
    totalEnergy: 0,
    avgU: 0,
    totalR: 0,
    t: 0,
    central_mb: 0,
    faculties_mb: 0
  });

  useEffect(() => {
    let mounted = true;

    const fetchAndCompute = async () => {
      try {
        const [centralRes, facultyARes, facultyBRes, facultyCRes, facultyDRes, facultyERes] = await Promise.all([
          getCentralMetrics(),
          getFacultyAMetrics(),
          getFacultyBMetrics(),
          getFacultyCMetrics(),
          getFacultyDMetrics(),
          getFacultyEMetrics()
        ]);

        const central = centralRes.data || {};
        const facultyA = facultyARes.data || {};
        const facultyB = facultyBRes.data || {};
        const facultyC = facultyCRes.data || {};
        const facultyD = facultyDRes.data || {};
        const facultyE = facultyERes.data || {};

        // ========== ЭНЕРГИЯ ==========
        const centralE = Number(central.eTotal ?? 0);
        const totalE = centralE 
          + Number(facultyA.eTotal ?? 0)
          + Number(facultyB.eTotal ?? 0)
          + Number(facultyC.eTotal ?? 0)
          + Number(facultyD.eTotal ?? 0)
          + Number(facultyE.eTotal ?? 0);

        // ========== ЗАПРОСЫ ==========
        const centralR = Number(central.requestsSinceReset ?? central.requestsTotal ?? 0);
        const totalR = centralR
          + Number(facultyA.requestsSinceReset ?? facultyA.requestsTotal ?? 0)
          + Number(facultyB.requestsSinceReset ?? facultyB.requestsTotal ?? 0)
          + Number(facultyC.requestsSinceReset ?? facultyC.requestsTotal ?? 0)
          + Number(facultyD.requestsSinceReset ?? facultyD.requestsTotal ?? 0)
          + Number(facultyE.requestsSinceReset ?? facultyE.requestsTotal ?? 0);

        // ========== ИСПОЛЬЗОВАНИЕ КЭША (U %) ==========
        const uCentral = Number(central.booksUtilPercent ?? 0);
        const uA = Number(facultyA.booksUtilPercent ?? 0);
        const uB = Number(facultyB.booksUtilPercent ?? 0);
        const uC = Number(facultyC.booksUtilPercent ?? 0);
        const uD = Number(facultyD.booksUtilPercent ?? 0);
        const uE = Number(facultyE.booksUtilPercent ?? 0);

        const uValues = [uCentral, uA, uB, uC, uD, uE].filter(v => v > 0);
        const avgU = uValues.length ? uValues.reduce((s, v) => s + v, 0) / uValues.length : 0;

        // ========== МБ КЭША ==========
        const centralMb = Number(central.booksUsedMb ?? 0);
        const facultiesMb = 
            Number(facultyA.booksUsedMb ?? 0) +
            Number(facultyB.booksUsedMb ?? 0) +
            Number(facultyC.booksUsedMb ?? 0) +
            Number(facultyD.booksUsedMb ?? 0) +
            Number(facultyE.booksUsedMb ?? 0);

        // ========== ВРЕМЯ СИМУЛЯЦИИ ==========
        const t = Number(
          central.simulationHours ??
          facultyA.simulationHours ??
          facultyB.simulationHours ??
          facultyC.simulationHours ??
          facultyD.simulationHours ??
          facultyE.simulationHours ??
          0
        );

        // ========== ECO-INDEX ==========
        const denom = totalR * t || 1;
        const ei = totalE * (1 - avgU / 100) / denom;
        const co2 = ei * 0.5;

        if (!mounted) return;

        setTotalEI(ei);
        setTotalCO2(co2);
        setSummary({
          totalEnergy: totalE,
          avgU,
          totalR,
          t,
          central_mb: centralMb,
          faculties_mb: facultiesMb
        });

      } catch (err) {
        console.error('EcoIndex fetch error:', err);
      }
    };

    fetchAndCompute();
    const id = setInterval(fetchAndCompute, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Card sx={{ boxShadow: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h3" color="primary" sx={{ mt: 1 }}>
          {totalEI.toFixed(6)}
        </Typography>

        <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.8 }}>
          Total Energy: <strong>{summary.totalEnergy.toFixed(6)} kWh</strong><br />
          Total CO₂: <strong>{totalCO2.toFixed(6)} kg</strong><br />
          Avg Cache Utilization: <strong>{summary.avgU.toFixed(2)}%</strong><br />
          Cache → Central: <strong>{summary.central_mb.toFixed(1)} MB</strong> | 
          Faculties (A+B+C+D+E): <strong>{summary.faculties_mb.toFixed(1)} MB</strong><br />
          Requests since reset: <strong>{summary.totalR.toLocaleString()}</strong> | 
          Simulation time: <strong>{summary.t.toFixed(2)} h</strong>
        </Typography>

        <LinearProgress
          variant="determinate"
          value={Math.min(100, summary.avgU)}
          sx={{ mt: 2, height: 12, borderRadius: 2 }}
        />
      </CardContent>
    </Card>
  );
}