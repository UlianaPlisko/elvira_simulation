// src/components/EcoIndexCard.tsx
import { Card, CardContent, Typography, LinearProgress, Grid } from '@mui/material';
import { useEffect, useState } from 'react';
import { getCentralMetrics, getFacultyAMetrics} from '../services/api';

export default function EcoIndexCard() {
  const [centralData, setCentralData] = useState<any>(null);
  const [facultyAData, setFacultyAData] = useState<any>(null);
  const [totalEI, setTotalEI] = useState<number>(0);
  const [totalCO2, setTotalCO2] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch per-server metrics
        const centralRes = await getCentralMetrics();
        setCentralData(centralRes.data);

        const facultyARes = await getFacultyAMetrics();
        setFacultyAData(facultyARes.data);

        // Calculate total EI if both servers data available (U now books % per-server, total avg U)
        if (centralRes.data && facultyARes.data) {
          const totalE = centralRes.data.eTotal + facultyARes.data.eTotal;
          const totalR = centralRes.data.r + facultyARes.data.r;
          const totalU = (parseFloat(centralRes.data.u) + parseFloat(facultyARes.data.u)) / 2;  // Avg books U
          const t = centralRes.data.t;  // Assume same T
          const ei = (totalE * (1 - totalU / 100)) / (totalR * t || 1);
          setTotalEI(ei);
          const carbonFactor = 0.5;  // kg CO2e/kWh from article
          setTotalCO2(ei * carbonFactor);
        }
      } catch (e) {
        console.error('Error fetching eco data:', e);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, []);

  const renderServerCard = (serverName: string, serverData: any) => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6">{serverName} Metrics</Typography>
        <Typography variant="body2">
          Energy: {serverData?.eTotal.toFixed(6)} kWh<br />
          U (Books Disk %): {serverData?.u}%<br />
          Requests (R): {serverData?.r}<br />
          RPS: {serverData?.rps}<br />
          Lambda: {serverData?.lambda}<br />
          CPU Load: {serverData?.cpuLoad}<br />
          Mem Load: {serverData?.memLoad}<br />
          Transitions: {serverData?.transitions}<br />
          T: {serverData?.t}h
        </Typography>
        <LinearProgress variant="determinate" value={parseFloat(serverData?.u)} sx={{ mt: 2 }} />
      </CardContent>
    </Card>
  );

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        {centralData ? renderServerCard('Central NGINX', centralData) : <Card><CardContent>Загрузка Central...</CardContent></Card>}
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        {facultyAData ? renderServerCard('Faculty A Edge', facultyAData) : <Card><CardContent>Загрузка Faculty A...</CardContent></Card>}
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="h6">Total Eco Index</Typography>
            <Typography variant="h3" color="primary">{totalEI.toFixed(6)}</Typography>
            <Typography variant="body2">
              Total Energy: {(centralData?.eTotal + (facultyAData?.eTotal || 0)).toFixed(6)} kWh<br />
              Total CO₂: {totalCO2.toFixed(6)} kg<br />
              Avg U (Books %): {((parseFloat(centralData?.u) + parseFloat(facultyAData?.u || 0)) / 2).toFixed(6)}% | Total R: {(centralData?.r + (facultyAData?.r || 0))} | T: {centralData?.t || 0}h
            </Typography>
            <LinearProgress variant="determinate" value={(parseFloat(centralData?.u) + parseFloat(facultyAData?.u || 0)) / 2} sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}