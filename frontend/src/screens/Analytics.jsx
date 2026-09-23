import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend } from 'recharts';
import { ShieldCheck, Fuel, Timer, ListChecks, Grid3x3, Fingerprint, AlertTriangle } from 'lucide-react';
import { Panel, PanelHeader, ScreenTitle, StatusPill, cx } from '../components/ui/index.jsx';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';

const tick = { fill: '#838e99', fontSize: 11, fontFamily: '"JetBrains Mono", ui-monospace, monospace' };
const tip = { contentStyle: { background: '#101317', border: '1px solid #2a3139', borderRadius: 8, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12 }, labelStyle: { color: '#838e99' }, cursor: { fill: '#ffffff08' } };

export default function Analytics({ operatorId, machineId, dataVersion }) {
  const [range, setRange] = useState('30d');
  const q = useApi(() => api.analytics(operatorId), [operatorId, dataVersion]);
  if (!q.data) return <ApiState loading={q.loading} error={q.error} data={q.data} onRetry={q.reload} rows={4} label="Loading analytics" />;
  const D = q.data;
  const cut = range === '7d' ? 23 : 0;
  const A = { ...D, safety: D.safety.slice(cut), fuel: D.fuel.slice(cut) };
  const mean = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const s7 = mean(D.safety.slice(23), 'score'), s7p = mean(D.safety.slice(16, 23), 'score');
  const f7 = mean(D.fuel.slice(23), 'lph'), f7p = mean(D.fuel.slice(16, 23), 'lph');
  const idleNow = mean(D.idle, 'idle'), idleBase = D.idle[0]?.baseline;
  const onTime = D.taskCompletion.reduce((a, w) => a + w.ontime, 0), total = D.taskCompletion.reduce((a, w) => a + w.ontime + w.late, 0);
  const sign = (x, d = 0) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`);
  return (
    <div>
      <ScreenTitle eyebrow={`${operatorId} · ${machineId} · recorded sessions to ${D.period_end}`} title="Analytics"
        right={<div className="flex gap-2">{['7d', '30d'].map((r) => <button key={r} onClick={() => setRange(r)} className={cx('chip num', range === r && 'chip-on')}>{r}</button>)}</div>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Kpi k="Safety score (7 d)" v={s7 == null ? '—' : Math.round(s7)} d={sign(s7 != null && s7p != null ? s7 - s7p : null)} good={s7 >= s7p} />
        <Kpi k="Fuel use (7 d)" v={f7 == null ? '—' : `${f7.toFixed(1)} L/h`} d={sign(f7 != null && f7p != null ? f7 - f7p : null, 1)} good={f7 <= f7p} />
        <Kpi k="Idle / 2 h (8 wk)" v={idleNow == null ? '—' : `${Math.round(idleNow)} min`} d={idleBase ? `base ${Math.round(idleBase)}` : ''} good={idleNow <= idleBase} />
        <Kpi k="On-time tasks (4 wk)" v={`${onTime} / ${total}`} d={total ? `${Math.round((onTime / total) * 100)}%` : '—'} good={onTime / Math.max(1, total) >= 0.8} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel className="xl:col-span-8">
          <PanelHeader title="Safety trend" icon={ShieldCheck} right={<Legendish items={[['#e9edf0', operatorId], ['#838e99', 'Fleet avg', true]]} />} />
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={A.safety} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="d" tick={tick} tickLine={false} axisLine={false} interval={4} tickFormatter={(d) => `D${d}`} />
                <YAxis domain={[70, 100]} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip {...tip} />
                <Line dataKey="fleet" stroke="#838e99" strokeDasharray="4 4" dot={false} strokeWidth={1.5} name="Fleet avg" />
                <Line dataKey="score" stroke="#e9edf0" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="OP1007" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <PanelHeader title="Skills vs fleet" icon={Fingerprint} right={<Legendish items={[['#56c7db', 'You'], ['#838e99', 'Fleet', true]]} />} />
          <div className="h-[240px]">
            <ResponsiveContainer>
              <RadarChart data={A.radar} outerRadius="72%">
                <PolarGrid stroke="#2a3139" />
                <PolarAngleAxis dataKey="k" tick={{ fill: '#a9b2bc', fontSize: 11, fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600 }} />
                <Radar dataKey="fleet" stroke="#838e99" strokeDasharray="4 4" fill="none" />
                <Radar dataKey="you" stroke="#56c7db" strokeWidth={2} fill="#56c7db" fillOpacity={0.18} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <PanelHeader title="Fuel efficiency" icon={Fuel} sub="Litres per engine hour" />
          <div className="h-[200px]">
            <ResponsiveContainer>
              <AreaChart data={A.fuel} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <defs><linearGradient id="fa" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#56c7db" stopOpacity={0.3} /><stop offset="1" stopColor="#56c7db" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="d" tick={tick} tickLine={false} axisLine={false} interval={6} tickFormatter={(d) => `D${d}`} />
                <YAxis domain={[12, 18]} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip {...tip} />
                <Area dataKey="lph" stroke="#56c7db" strokeWidth={2} fill="url(#fa)" name="L/h" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <PanelHeader title="Idle time" icon={Timer} sub="Minutes per shift vs personal baseline" />
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={A.idle} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="d" tick={tick} tickLine={false} axisLine={false} />
                <YAxis tick={tick} tickLine={false} axisLine={false} />
                <Tooltip {...tip} />
                <ReferenceLine y={25} stroke="#ff8a3d" strokeDasharray="4 4" label={{ value: 'baseline max', fill: '#ff8a3d', fontSize: 10, position: 'insideTopRight' }} />
                <Bar dataKey="idle" radius={[4, 4, 0, 0]} name="Idle min"
                  shape={(p) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={4} fill={p.payload.idle > 25 ? '#ff8a3d' : '#a9b2bc'} />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <PanelHeader title="Task completion" icon={ListChecks} sub="On time vs late, by week" />
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={A.taskCompletion} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="w" tick={tick} tickLine={false} axisLine={false} />
                <YAxis tick={tick} tickLine={false} axisLine={false} />
                <Tooltip {...tip} />
                <Bar dataKey="ontime" stackId="a" fill="#3fd08a" name="On time" />
                <Bar dataKey="late" stackId="a" fill="#f2b53a" radius={[4, 4, 0, 0]} name="Late" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-7">
          <PanelHeader title="Risk hotspots" icon={Grid3x3} sub="Sessions the model scored HIGH/CRITICAL, by zone and start hour — last 90 days" />
          <Heatmap heat={D.heat} />
        </Panel>

        <Panel className="xl:col-span-5">
          <PanelHeader title="Operator anomalies" icon={AlertTriangle} sub={`Deviations from ${operatorId}'s own baseline (anomaly model)`} />
          {A.anomalies.length === 0 && <p className="text-sm text-ink2">No unusual sessions recently.</p>}
          <ul className="divide-y divide-line">
            {A.anomalies.map((a) => (
              <li key={a.when + a.what} className="py-3 flex items-center gap-3">
                <StatusPill level={a.sev}>{a.sev === 'high' ? 'Strong' : 'Unusual'}</StatusPill>
                <div className="min-w-0 flex-1"><div className="text-sm">{a.what}</div><div className="text-xs text-ink3">{a.vs}</div></div>
                <span className="num text-xs text-ink3 shrink-0">{a.when}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ k, v, d, good }) {
  return (
    <div className="panel p-4">
      <div className="label">{k}</div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <span className="font-display text-3xl font-semibold">{v}</span>
        <span className={cx('num text-sm', good ? 'text-safe' : 'text-elevated')}>{d}</span>
      </div>
    </div>
  );
}

function Legendish({ items }) {
  return (
    <div className="flex gap-3 text-xs text-ink2">
      {items.map(([c, l, dash]) => <span key={l} className="flex items-center gap-1.5"><span className="w-4" style={{ borderTop: `2px ${dash ? 'dashed' : 'solid'} ${c}` }} />{l}</span>)}
    </div>
  );
}

function Heatmap({ heat }) {
  const { rows, cols, v } = heat;
  const color = (n) => (n === 0 ? '#1d2228' : n === 1 ? '#3fd08a55' : n === 2 ? '#f2b53a99' : n === 3 ? '#ff8a3dcc' : '#ff5a52');
  let best = [0, 0, -1];
  v.forEach((row, i) => row.forEach((n, j) => { if (n > best[2]) best = [i, j, n]; }));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[440px]">
        <div className="grid gap-1" style={{ gridTemplateColumns: `72px repeat(${cols.length}, 1fr)` }}>
          <span />
          {cols.map((c) => <span key={c} className="num text-[11px] text-ink3 text-center">{c}:00</span>)}
          {rows.map((r, i) => (
            <React.Fragment key={r}>
              <span className="text-sm text-ink2 self-center">{r}</span>
              {v[i].map((n, j) => (
                <div key={j} title={`${r} ${cols[j]}:00 — ${n} high-risk sessions`} className="h-11 rounded-sm flex items-center justify-center num text-sm transition-transform hover:scale-105"
                  style={{ background: color(n), color: n >= 3 ? '#15181c' : '#e9edf0' }}>{n || ''}</div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-ink3">
          <span>0</span>{[0, 1, 2, 3, 4].map((n) => <span key={n} className="w-6 h-3 rounded-sm" style={{ background: color(n) }} />)}<span>4+</span>
          {best[2] > 0 && <span className="ml-auto text-ink2">Hotspot: <b className="text-ink">{rows[best[0]]}, {cols[best[1]]}:00</b> — {best[2]} high-risk sessions.</span>}
        </div>
      </div>
    </div>
  );
}
