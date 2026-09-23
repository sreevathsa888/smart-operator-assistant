// Presentation helpers ONLY. Risk values, levels and explanations come from the backend safety model
// (POST /api/predict/safety, /api/simulation/risk, GET /api/telemetry). No risk is computed in the browser.

// Four levels on the design system's signal ramp: safe → caution → elevated → critical.
export const LEVEL_COLOR = { low: '#3fd08a', medium: '#f2b53a', high: '#ff8a3d', critical: '#ff5a52', elevated: '#ff8a3d' };
export const LEVEL_TW = {
  low: { text: 'text-safe', bg: 'bg-safe', dim: 'bg-safe/10', border: 'border-safe' },
  medium: { text: 'text-caution', bg: 'bg-caution', dim: 'bg-caution/10', border: 'border-caution' },
  high: { text: 'text-elevated', bg: 'bg-elevated', dim: 'bg-elevated/10', border: 'border-elevated' },
  critical: { text: 'text-critical', bg: 'bg-critical', dim: 'bg-critical/10', border: 'border-critical' },
};
export const LEVELS = ['low', 'medium', 'high', 'critical'];

/** Backend level ('LOW'…'CRITICAL') → UI key ('low'…'critical'). */
export const ui = (level) => (level ? String(level).toLowerCase() : 'low');
export const isHigh = (lvl) => lvl === 'high' || lvl === 'critical';

/** Normalise a backend risk object for components (level → UI key). */
export function uiRisk(r) {
  if (!r) return null;
  return { ...r, level: ui(r.level) };
}

/** Six radar axes from the model's per-factor isolated effects (0–100). */
const AXES = [['proximity', 'proximity'], ['terrain', 'terrain'], ['speed', 'speed'], ['load', 'load'], ['machine', 'machine'], ['environment', 'visibility']];
export function axesFrom(contributions = []) {
  const by = Object.fromEntries(contributions.map((c) => [c.key, c]));
  return AXES.map(([axis, key]) => ({ axis, value: Math.round(by[key]?.isolated ?? 0) }));
}
