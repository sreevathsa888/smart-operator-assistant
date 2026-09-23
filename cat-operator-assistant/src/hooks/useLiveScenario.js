import { useCallback, useEffect, useRef, useState } from 'react';
import { computeRisk, radarAxes } from '../lib/risk.js';

// Drives the site situation shared by Overview, Live Machine and Safety Center.
// phase: 'normal' → 'approach' (worker walks in, speed rises) → 'alert' → 'resolved' → 'normal'
const NORMAL = { speed: 4.2, distance: 4.8, load: 72, slope: 7, visibility: 88, worker: { x: -3.4, y: -4.7 } };
const ALERT = { speed: 6.8, distance: 1.7, load: 85, slope: 11, visibility: 80, worker: { x: -2.4, y: 2.2 } };
const SAFE = { speed: 0.0, distance: 2.6, load: 85, slope: 11, visibility: 80, worker: { x: -3.2, y: 2.9 } };

const lerp = (a, b, t) => a + (b - a) * t;
function mix(a, b, t) {
  return {
    speed: +lerp(a.speed, b.speed, t).toFixed(1), distance: +lerp(a.distance, b.distance, t).toFixed(1),
    load: Math.round(lerp(a.load, b.load, t)), slope: Math.round(lerp(a.slope, b.slope, t)),
    visibility: Math.round(lerp(a.visibility, b.visibility, t)),
    worker: { x: lerp(a.worker.x, b.worker.x, t), y: lerp(a.worker.y, b.worker.y, t) },
  };
}

export function useLiveScenario() {
  const [phase, setPhase] = useState('normal');
  const [state, setState] = useState(NORMAL);
  const [prevAxes, setPrevAxes] = useState(() => radarAxes(NORMAL));
  const timer = useRef();
  const cur = useRef(NORMAL);
  cur.current = state;

  const tween = useCallback((from, to, ms, done) => {
    clearInterval(timer.current);
    const t0 = performance.now();
    timer.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 2);
      setState(mix(from, to, e));
      if (k >= 1) { clearInterval(timer.current); done?.(); }
    }, 60);
  }, []);

  const trigger = useCallback(() => {
    setPrevAxes(radarAxes(NORMAL));
    setPhase('approach');
    tween(NORMAL, ALERT, 2600, () => setPhase('alert'));
  }, [tween]);

  const resolve = useCallback(() => {
    setPhase('resolved');
    setPrevAxes(radarAxes(ALERT));
    tween(cur.current, SAFE, 1400, () => setTimeout(() => {
      tween(SAFE, NORMAL, 2200, () => setPhase('normal'));
    }, 2500));
  }, [tween]);

  const dismiss = useCallback(() => {
    // Dismissed alerts don't reset reality: conditions ease back only as the worker walks away.
    setPhase('dismissed');
    tween(cur.current, NORMAL, 5000, () => setPhase('normal'));
  }, [tween]);

  useEffect(() => () => clearInterval(timer.current), []);

  const risk = computeRisk(state);
  return { phase, state, risk, axes: radarAxes(state), prevAxes, trigger, resolve, dismiss, ALERT };
}
