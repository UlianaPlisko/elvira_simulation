import { Card, CardContent, Typography, LinearProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { getEcoIndex } from '../services/api';

export default function EcoIndexCard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getEcoIndex();
        setData(res.data);
      } catch (e) { console.error(e); }
    };
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <Card><CardContent>Загрузка...</CardContent></Card>;

  return (
    <Card>
      <CardContent>
        <Typography variant="h5">Eco Index</Typography>
        <Typography variant="h3" color="primary">{data.ei}</Typography>
        <Typography variant="body2">
          Energy: {data.eTotal.toFixed(6)} kWh<br />
          CO₂: {(data.eTotal * 0.093).toFixed(3)} g<br />
          U: {data.u}% | R: {data.r} | T: {data.t}h
        </Typography>
        <LinearProgress variant="determinate" value={data.u} sx={{ mt: 2 }} />
      </CardContent>
    </Card>
  );
}