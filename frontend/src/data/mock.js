// Synthetic data shaped like the future FastAPI responses (see src/api/client.js).
// Every object here maps 1:1 to a planned endpoint so the UI can switch to live data
// by flipping VITE_USE_MOCK=false.

export const operator = {
  id: 'OP1007',
  role: 'Operator',
  experience: 'Intermediate',
  shift: 'Morning',
  shiftWindow: '06:00 – 14:00',
  status: 'on_duty',
  hoursOnMachine: 1843,
};

export const machine = {
  id: 'EXC-204',
  type: 'Excavator',
  model: '320 hydraulic excavator (class)',
  status: 'online',
  engineHours: 1523.8,
  site: 'Riverside Interchange — Zone B',
};

// GET /telemetry/live  → initial snapshot; WS /telemetry/stream → deltas
export const telemetryBase = {
  engineTemp: 82, hydraulicTemp: 76, fuel: 64, load: 72, speed: 4.2, idleMin: 12,
  rpm: 1650, fuelRate: 14.2, heading: 32, pitch: 6,
};

// GET /tasks/today
export const tasks = [
  { id: 'T-01', name: 'Excavation', zone: 'Zone A', status: 'completed', progress: 100, machine: 'EXC-204', start: '06:10', estMin: 95, actualMin: 102, risk: 'low' },
  { id: 'T-02', name: 'Loading', zone: 'Zone B', status: 'completed', progress: 100, machine: 'EXC-204', start: '07:55', estMin: 70, actualMin: 64, risk: 'low' },
  { id: 'T-03', name: 'Excavation', zone: 'Zone C', status: 'in_progress', progress: 68, machine: 'EXC-204', start: '09:10', estMin: 205, actualMin: 139, risk: 'medium',
    eta: { pointMin: 138, lowMin: 125, highMin: 155, confidence: 0.8 } },
  { id: 'T-04', name: 'Material Transfer', zone: 'Zone D', status: 'pending', progress: 0, machine: 'EXC-204', start: '12:40', estMin: 80, actualMin: null, risk: 'low' },
];

// GET /operators/{id}/twin
export const twin = {
  scores: { safety: 91, efficiency: 78, control: 89, awareness: 84, fuel: 73 },
  lastWeek: { safety: 87, efficiency: 76, control: 86, awareness: 79, fuel: 75 },
  behavior: 'normal', baseline: 'stable', trend: 'improving',
  baselineBands: [
    { key: 'idle', label: 'Idle time', unit: 'min', min: 18, max: 25, current: 42, domain: [0, 60] },
    { key: 'speed', label: 'Travel speed', unit: 'km/h', min: 3.5, max: 5, current: 6.8, domain: [0, 10] },
    { key: 'fuel', label: 'Fuel efficiency', unit: '%', min: 78, max: 86, current: 82, domain: [50, 100] },
    { key: 'swing', label: 'Swing rate', unit: '°/s', min: 22, max: 30, current: 27, domain: [0, 45] },
    { key: 'brake', label: 'Hard stops / h', unit: '', min: 0, max: 2, current: 1, domain: [0, 8] },
  ],
  history: Array.from({ length: 14 }, (_, i) => ({
    day: `D-${13 - i}`,
    safety: Math.round(82 + i * 0.7 + Math.sin(i) * 2),
    efficiency: Math.round(72 + i * 0.45 + Math.cos(i * 1.3) * 2.5),
    baseline: 85,
  })),
};

// GET /training/modules
export const trainingModules = [
  { id: 'blind', titleKey: 'mod.blind', kind: 'sim', cat: 'Safety', dur: '06:30', difficulty: 'Intermediate', skill: 'Awareness', status: 'recommended', reason: 'Proximity events ↑ 2 this week', progress: 0 },
  { id: 'idle', titleKey: 'mod.idle', kind: 'video', cat: 'Fuel Management', dur: '01:42', difficulty: 'Beginner', skill: 'Efficiency', status: 'recommended', reason: 'Idle 42 min vs 18–25 baseline', progress: 0 },
  { id: 'slope', titleKey: 'mod.slope', kind: 'sim', cat: 'Machine Operation', dur: '08:10', difficulty: 'Advanced', skill: 'Control', status: 'recommended', reason: 'Worked on 11° slope at high load', progress: 30 },
  { id: 'lockout', title: 'Lockout / Tagout Basics', kind: 'video', cat: 'Safety', dur: '03:05', difficulty: 'Beginner', skill: 'Procedure', status: 'completed', progress: 100 },
  { id: 'rollover', title: 'Rollover Emergency Response', kind: 'sim', cat: 'Emergency', dur: '05:20', difficulty: 'Advanced', skill: 'Emergency', status: 'available', progress: 0 },
  { id: 'fire', title: 'Engine Fire Evacuation', kind: 'video', cat: 'Emergency', dur: '02:15', difficulty: 'Beginner', skill: 'Emergency', status: 'completed', progress: 100 },
  { id: 'trench', title: 'Trenching Near Utilities', kind: 'sim', cat: 'Machine Operation', dur: '07:40', difficulty: 'Intermediate', skill: 'Precision', status: 'in_progress', progress: 55 },
  { id: 'eco', title: 'Eco-Mode & Throttle Discipline', kind: 'video', cat: 'Efficiency', dur: '02:50', difficulty: 'Beginner', skill: 'Efficiency', status: 'available', progress: 0 },
  { id: 'cycle', title: 'Efficient Dig-Swing-Dump Cycles', kind: 'video', cat: 'Efficiency', dur: '04:05', difficulty: 'Intermediate', skill: 'Efficiency', status: 'available', progress: 0 },
  { id: 'refuel', title: 'Refuelling Without Spills', kind: 'video', cat: 'Fuel Management', dur: '01:55', difficulty: 'Beginner', skill: 'Procedure', status: 'available', progress: 0 },
];

// GET /events/{id}/replay
export const replayEvent = {
  id: 'EVT-0917-1432',
  date: '17 Sep 2026',
  machine: 'EXC-204',
  summary: 'Worker approached rear-left blind zone while machine reversed on a 10° slope.',
  // t = seconds from 14:32:05
  keyframes: [
    { t: 0, clock: '14:32:05', label: 'NORMAL', kind: 'safe', dist: 7.5, speed: 3.8, slope: 8, risk: 9, wx: -5.8, wy: 4.8, heading: 0 },
    { t: 3, clock: '14:32:08', label: 'PROXIMITY ↓', kind: 'medium', dist: 4.6, speed: 4.4, slope: 9, risk: 24, wx: -3.8, wy: 3.0, heading: 8 },
    { t: 6, clock: '14:32:11', label: 'SPEED ↑', kind: 'medium', dist: 3.1, speed: 7.2, slope: 10, risk: 52, wx: -2.6, wy: 2.0, heading: 16 },
    { t: 8, clock: '14:32:13', label: 'RISK ↑', kind: 'high', dist: 2.2, speed: 8.0, slope: 10, risk: 76, wx: -1.9, wy: 1.3, heading: 20 },
    { t: 9, clock: '14:32:14', label: 'ALERT', kind: 'high', dist: 1.9, speed: 7.6, slope: 10, risk: 81, wx: -1.6, wy: 1.2, heading: 22 },
    { t: 12, clock: '14:32:17', label: 'STOPPED', kind: 'safe', dist: 2.4, speed: 0, slope: 10, risk: 18, wx: -2.1, wy: 1.4, heading: 22 },
  ],
};

// GET /analytics/summary?range=30d
const days = Array.from({ length: 30 }, (_, i) => i);
export const analytics = {
  safety: days.map((i) => ({ d: i + 1, score: Math.round(80 + i * 0.35 + Math.sin(i / 2) * 3), fleet: 82 })),
  fuel: days.map((i) => ({ d: i + 1, lph: +(15.8 - i * 0.05 + Math.cos(i / 3) * 0.7).toFixed(1) })),
  idle: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({ d, idle: [24, 31, 19, 42, 22, 17][i], baseline: 22 })),
  taskCompletion: ['W1', 'W2', 'W3', 'W4'].map((w, i) => ({ w, ontime: [11, 13, 12, 15][i], late: [4, 3, 3, 1][i] })),
  radar: [
    { k: 'Safety', you: 91, fleet: 84 }, { k: 'Efficiency', you: 78, fleet: 80 }, { k: 'Control', you: 89, fleet: 82 },
    { k: 'Awareness', you: 84, fleet: 79 }, { k: 'Fuel', you: 73, fleet: 77 },
  ],
  // incidents per zone × hour-block
  heat: {
    rows: ['Zone A', 'Zone B', 'Zone C', 'Zone D'],
    cols: ['06', '07', '08', '09', '10', '11', '12', '13'],
    v: [
      [0, 1, 0, 0, 1, 0, 0, 0],
      [1, 0, 2, 1, 0, 1, 3, 1],
      [0, 0, 1, 3, 4, 2, 1, 0],
      [0, 0, 0, 1, 0, 0, 2, 1],
    ],
  },
  anomalies: [
    { when: 'Today 10:42', what: 'Idle 42 min', vs: 'baseline 18–25 min', sev: 'elevated' },
    { when: 'Today 10:51', what: 'Travel speed 6.8 km/h', vs: 'baseline 3.5–5 km/h', sev: 'elevated' },
    { when: '17 Sep 14:32', what: 'Proximity alert — 1.9 m', vs: 'restricted zone 3 m', sev: 'high' },
  ],
};
