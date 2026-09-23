// Transparent, explainable risk model used by the Safety Center, Simulator and What-if screens.
// In production this is replaced by the FastAPI /risk/predict endpoint, which returns the
// same shape: { score, level, contributions: [{ key, value, pct }] }.

const K_MID = 0.78;
const K_SLOPE = 6.9;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/**
 * @param {{speed:number, distance:number, load:number, slope:number, visibility?:number}} s
 *   speed km/h (0–12), distance to nearest worker m (0.5–10), load % (0–100), slope ° (0–25), visibility % (0–100)
 */
export function computeRisk({ speed, distance, load, slope, visibility = 85 }) {
  const prox = clamp((7 - distance) / 6);
  const spd = clamp(speed / 12);
  const terr = clamp(slope / 25);
  const ld = clamp(load / 100);
  const vis = clamp(1 - visibility / 100);

  const parts = {
    proximity: 0.5 * prox * (0.55 + 0.7 * spd),
    speed: 0.44 * Math.pow(spd, 1.1) * (0.45 + 0.55 * prox),
    terrain: 0.36 * terr,
    load: 0.12 * ld,
    visibility: 0.22 * vis * (0.4 + 0.6 * prox),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  // logistic squash: calm at rest, rising steeply once several factors stack up
  const score = Math.round(clamp(100 / (1 + Math.exp(-(total - K_MID) * K_SLOPE)), 2, 99));
  const contributions = Object.entries(parts)
    .map(([key, value]) => ({ key, value, pct: Math.round((value / (total || 1)) * 100) }))
    .sort((a, b) => b.value - a.value);
  return { score, level: levelOf(score), contributions };
}

export function levelOf(score) {
  if (score < 35) return 'low';
  if (score < 62) return 'medium';
  return 'high';
}

export const LEVEL_COLOR = { low: '#3fd08a', medium: '#f2b53a', elevated: '#ff8a3d', high: '#ff5a52' };
export const LEVEL_TW = {
  low: { text: 'text-safe', bg: 'bg-safe', dim: 'bg-safe/10', border: 'border-safe' },
  medium: { text: 'text-caution', bg: 'bg-caution', dim: 'bg-caution/10', border: 'border-caution' },
  elevated: { text: 'text-elevated', bg: 'bg-elevated', dim: 'bg-elevated/10', border: 'border-elevated' },
  high: { text: 'text-critical', bg: 'bg-critical', dim: 'bg-critical/10', border: 'border-critical' },
};

/** Six-axis radar values (0–100) for the Safety Center. */
export function radarAxes({ speed, distance, load, slope, visibility = 85, machine = 18 }) {
  return [
    { axis: 'proximity', value: Math.round(clamp((7 - distance) / 6) * 100) },
    { axis: 'terrain', value: Math.round(clamp(slope / 25) * 100) },
    { axis: 'speed', value: Math.round(clamp(speed / 12) * 100) },
    { axis: 'load', value: Math.round(clamp(load / 100) * 100) },
    { axis: 'machine', value: machine },
    { axis: 'environment', value: Math.round(clamp(1 - visibility / 100) * 100 + 10) },
  ];
}
