// Thin data layer. Today every call resolves mock data; set VITE_USE_MOCK=false and
// VITE_API_URL=http://localhost:8000 to hit the FastAPI backend with the same shapes.
import * as mock from '../data/mock.js';
import { computeRisk } from '../lib/risk.js';

const BASE = import.meta.env?.VITE_API_URL || 'http://localhost:8000';
const USE_MOCK = (import.meta.env?.VITE_USE_MOCK ?? 'true') !== 'false';

async function get(path, fallback) {
  if (USE_MOCK) return structuredClone(fallback);
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}
async function post(path, body, fallback) {
  if (USE_MOCK) return fallback(body);
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  operator: () => get('/operators/OP1007', mock.operator),
  machine: () => get('/machines/EXC-204', mock.machine),
  tasks: () => get('/tasks/today?operator=OP1007', mock.tasks),
  twin: () => get('/operators/OP1007/twin', mock.twin),
  training: () => get('/training/modules?operator=OP1007', mock.trainingModules),
  replay: (id = 'EVT-0917-1432') => get(`/events/${id}/replay`, mock.replayEvent),
  analytics: () => get('/analytics/summary?range=30d', mock.analytics),
  /** POST /risk/predict { speed, distance, load, slope, visibility } → { score, level, contributions } */
  predictRisk: (state) => post('/risk/predict', state, computeRisk),
};
