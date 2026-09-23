import { useEffect, useRef, useState } from 'react';
import { telemetryBase } from '../data/mock.js';

// Simulated 1 Hz telemetry stream with bounded random walk + 60-point history per channel.
const HIST = 60;
const jitter = (v, amt, lo, hi) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * amt));

function seedHistory(v, amt) {
  // random walk that ends exactly at v (built backwards) so there is no jump at "now"
  const out = [v];
  let x = v;
  for (let i = 1; i < HIST; i++) { x = x + (Math.random() - 0.5) * amt; out.unshift(+x.toFixed(2)); }
  return out;
}

export function useTelemetry(paused = false) {
  const [t, setT] = useState(() => ({
    ...telemetryBase,
    engineHours: 1523.8,
    hist: {
      engineTemp: seedHistory(82, 0.6), hydraulicTemp: seedHistory(76, 0.5),
      fuelRate: seedHistory(14.2, 0.5), load: seedHistory(72, 3),
    },
  }));
  const ref = useRef(paused);
  ref.current = paused;
  useEffect(() => {
    const id = setInterval(() => {
      if (ref.current) return;
      setT((p) => {
        const n = {
          ...p,
          engineTemp: +jitter(p.engineTemp, 0.6, 79, 86).toFixed(1),
          hydraulicTemp: +jitter(p.hydraulicTemp, 0.5, 73, 80).toFixed(1),
          fuelRate: +jitter(p.fuelRate, 0.5, 12, 16.5).toFixed(1),
          load: Math.round(jitter(p.load, 4, 62, 82)),
          speed: +jitter(p.speed, 0.4, 3.4, 5).toFixed(1),
          rpm: Math.round(jitter(p.rpm, 60, 1550, 1750)),
          heading: Math.round(jitter(p.heading, 4, 20, 45)),
          fuel: +(p.fuel - 0.01).toFixed(2),
          engineHours: +(p.engineHours + 1 / 3600).toFixed(4),
        };
        n.hist = {
          engineTemp: [...p.hist.engineTemp.slice(1), n.engineTemp],
          hydraulicTemp: [...p.hist.hydraulicTemp.slice(1), n.hydraulicTemp],
          fuelRate: [...p.hist.fuelRate.slice(1), n.fuelRate],
          load: [...p.hist.load.slice(1), n.load],
        };
        return n;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}
