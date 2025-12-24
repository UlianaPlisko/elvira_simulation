// components/EcoIndexCard.tsx
import { Card, CardContent, Typography, LinearProgress } from '@mui/material';
import { useEffect, useState, useRef } from 'react';
import { 
  getCentralMetrics, 
  getFacultyAMetrics, 
  getFacultyBMetrics,
  getFacultyCMetrics,
  getFacultyDMetrics,
  getFacultyEMetrics 
} from '../services/api';

type Props = {
  dnsMode: 'edge' | 'central';
  isSimulationRunning: boolean;
  onSimulationStoppedWithData: (data: any[]) => void;
};

export default function EcoIndexCard({ 
  dnsMode, 
  isSimulationRunning, 
  onSimulationStoppedWithData 
}: Props) {
  const [totalEI, setTotalEI] = useState<number>(0);
  const [totalCO2, setTotalCO2] = useState<number>(0);
  const [summary, setSummary] = useState({
    totalEnergy: 0,
    avgU: 0,
    avgCPU: 0,
    activeCount: 0,  
    totalR: 0,
    t: 0,
    central_mb: 0,
    faculties_mb: 0
  });

  // Recording state
  const recordedData = useRef<any[]>([]);
  const wasRunning = useRef<boolean>(false);
  const lastRecordTime = useRef<number>(0); // Timestamp of last recorded point
  const RECORD_INTERVAL_MS = 10000; // Record every 10 seconds

  useEffect(() => {
    let mounted = true;
    const ACTIVE_CPU_THRESHOLD = 4;
    const CARBON_INTENSITY = 0.44;

    const fetchAndCompute = async () => {
      if (!mounted) return;

      try {
        let centralRes, facultyARes, facultyBRes, facultyCRes, facultyDRes, facultyERes;

        if (dnsMode === 'central') {
          centralRes = await getCentralMetrics();
          // Faculties are inactive in central mode
          facultyARes = facultyBRes = facultyCRes = facultyDRes = facultyERes = { data: {} };
        } else {
          // Edge mode: fetch all nodes in parallel
          [centralRes, facultyARes, facultyBRes, facultyCRes, facultyDRes, facultyERes] = await Promise.all([
            getCentralMetrics(),
            getFacultyAMetrics(),
            getFacultyBMetrics(),
            getFacultyCMetrics(),
            getFacultyDMetrics(),
            getFacultyEMetrics()
          ]);
        }

        const central = centralRes.data || {};
        const facultyA = facultyARes.data || {};
        const facultyB = facultyBRes.data || {};
        const facultyC = facultyCRes.data || {};
        const facultyD = facultyDRes.data || {};
        const facultyE = facultyERes.data || {};

        // Total energy consumed across all nodes
        const totalE = 
          Number(central.eTotal ?? 0) +
          Number(facultyA.eTotal ?? 0) +
          Number(facultyB.eTotal ?? 0) +
          Number(facultyC.eTotal ?? 0) +
          Number(facultyD.eTotal ?? 0) +
          Number(facultyE.eTotal ?? 0);

        // Calculate total requests (fixed: sum across nodes)
        const reqOf = (node: any) => Number(node.requestsSinceReset ?? node.requestsTotal ?? node.nginxRequestsTotal ?? 0);
        const totalR = Math.max(1, reqOf(central) + reqOf(facultyA) + reqOf(facultyB) + reqOf(facultyC) + reqOf(facultyD) + reqOf(facultyE));

        // Determine active nodes
        const isActive = (node: any) => 
          Number(node.containerCpuPercent ?? 0) > ACTIVE_CPU_THRESHOLD || 
          Number(node.requestsSinceReset ?? node.requestsTotal ?? 0) > 0;

        const activeNodes = [
          { u: Number(central.booksUtilPercent ?? 0), cpu: Number(central.containerCpuPercent ?? 0), active: isActive(central) || dnsMode === 'central' },
          { u: Number(facultyA.booksUtilPercent ?? 0), cpu: Number(facultyA.containerCpuPercent ?? 0), active: isActive(facultyA) && dnsMode !== 'central' },
          { u: Number(facultyB.booksUtilPercent ?? 0), cpu: Number(facultyB.containerCpuPercent ?? 0), active: isActive(facultyB) && dnsMode !== 'central' },
          { u: Number(facultyC.booksUtilPercent ?? 0), cpu: Number(facultyC.containerCpuPercent ?? 0), active: isActive(facultyC) && dnsMode !== 'central' },
          { u: Number(facultyD.booksUtilPercent ?? 0), cpu: Number(facultyD.containerCpuPercent ?? 0), active: isActive(facultyD) && dnsMode !== 'central' },
          { u: Number(facultyE.booksUtilPercent ?? 0), cpu: Number(facultyE.containerCpuPercent ?? 0), active: isActive(facultyE) && dnsMode !== 'central' }
        ].filter(node => node.active);

        const activeCount = activeNodes.length;
        const avgU = activeCount > 0 ? activeNodes.reduce((sum, n) => sum + n.u, 0) / activeCount : 0;
        const avgCPU = activeCount > 0 ? activeNodes.reduce((sum, n) => sum + n.cpu, 0) / activeCount : 0;

        // Current simulation time (from any node)
        const t = Number(
          central.simulationHours ?? 
          facultyA.simulationHours ?? 
          facultyB.simulationHours ?? 
          facultyC.simulationHours ?? 
          facultyD.simulationHours ?? 
          facultyE.simulationHours ?? 0
        );

        // Eco Index formula (amplified CPU impact: non-linear to penalize high CPU more)
        const cpuFactor = Math.pow(1 + avgCPU / 100, 1.5);
        const ei = totalE * (1 - avgU / 100) * cpuFactor;
        const co2 = totalE * CARBON_INTENSITY;

        // Update UI
        setTotalEI(ei);
        setTotalCO2(co2);
        setSummary({
          totalEnergy: totalE,
          avgU,
          avgCPU,
          activeCount,
          totalR,
          t,
          central_mb: Number(central.booksUsedMb ?? 0),
          faculties_mb: 
            Number(facultyA.booksUsedMb ?? 0) +
            Number(facultyB.booksUsedMb ?? 0) +
            Number(facultyC.booksUsedMb ?? 0) +
            Number(facultyD.booksUsedMb ?? 0) +
            Number(facultyE.booksUsedMb ?? 0)
        });

        // === DATA RECORDING: Fixed 10-second intervals ===
        if (isSimulationRunning) {
          const now = Date.now();

          // Record first point immediately, then every 10 seconds
          const shouldRecord = recordedData.current.length === 0 ||
                               now - lastRecordTime.current >= RECORD_INTERVAL_MS;

          if (shouldRecord) {
            recordedData.current.push({
              timestamp: new Date().toISOString(),
              ecoIndex: ei,
              avgCPU: parseFloat(avgCPU.toFixed(4)),
              totalEnergy: totalE,
              avgU: avgU
            });
            lastRecordTime.current = now;
          }
        }

      } catch (err) {
        console.error('EcoIndex fetch error:', err);
      }
    };

    // Initial fetch
    fetchAndCompute();
    // Poll every 5 seconds for fresh data
    const interval = setInterval(fetchAndCompute, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [dnsMode, isSimulationRunning]);

  // Detect when simulation stops → trigger download once
  useEffect(() => {
    if (wasRunning.current && !isSimulationRunning) {
      if (recordedData.current.length > 0) {
        onSimulationStoppedWithData([...recordedData.current]);
      }
      // Reset for next simulation
      recordedData.current = [];
      lastRecordTime.current = 0;
    }
    wasRunning.current = isSimulationRunning;
  }, [isSimulationRunning, onSimulationStoppedWithData]);

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
          Avg CPU Utilization: <strong>{summary.avgCPU.toFixed(2)}%</strong><br />
          Active Servers: <strong>{summary.activeCount}</strong><br />  
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