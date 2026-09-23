// The single data layer. Every number the UI shows comes from the FastAPI backend (models + database).
// In development Vite proxies /api → http://localhost:8000. Set VITE_API_BASE to call another host directly.
const BASE = import.meta.env?.VITE_API_BASE || '';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, path, body) {
  let r;
  try {
    r = await fetch(`${BASE}${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the backend. Start it with: uvicorn backend.main:app --port 8000', 0);
  }
  if (!r.ok) {
    let detail = `${r.status}`;
    try { detail = (await r.json()).detail ?? detail; } catch { /* not json */ }
    throw new ApiError(typeof detail === 'string' ? detail : JSON.stringify(detail), r.status);
  }
  return r.json();
}
const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b ?? {});

export const api = {
  health: () => get('/api/health'),
  meta: () => get('/api/meta'),
  operators: () => get('/api/operators'),
  operator: (id) => get(`/api/operator/${id}`),
  machine: (id) => get(`/api/machine/${id}`),
  dashboard: (op) => get(`/api/dashboard/${op}`),
  twin: (op) => get(`/api/twin/${op}`),
  tasks: (op) => get(`/api/tasks/${op}`),
  startTask: (id) => post(`/api/tasks/${id}/start`),
  completeTask: (id) => post(`/api/tasks/${id}/complete`),
  telemetry: (machine, op, history = false) => get(`/api/telemetry/${machine}?operator_id=${op}${history ? '&history=true' : ''}`),
  telemetryEvent: (machine, action, op) => post(`/api/telemetry/${machine}/event`, { action, operator_id: op }),
  predictSafety: (inputs, op) => post('/api/predict/safety', { inputs, operator_id: op }),
  /** batch or single scenario through the trained safety model */
  simulateRisk: (scenarios, op, explain = false) => post('/api/simulation/risk', Array.isArray(scenarios) ? { scenarios, operator_id: op, explain } : { scenario: scenarios, operator_id: op, explain }),
  decision: (state, choice, op) => post('/api/simulation/decision', { state, choice, operator_id: op }),
  anomaly: (op) => post('/api/anomaly/operator', { operator_id: op }),
  events: (op, limit = 20) => get(`/api/safety/events?operator_id=${op}&limit=${limit}`),
  replay: (id) => get(`/api/safety/replay/${id}`),
  training: (op) => get(`/api/training/recommendations/${op}`),
  completeTraining: (op, moduleId, correct, answer) => post('/api/training/complete', { operator_id: op, module_id: moduleId, correct, answer }),
  analytics: (op) => get(`/api/analytics/${op}`),
};
