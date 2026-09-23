import React, { useEffect, useState } from 'react';
import { Cpu, Thermometer, Fuel, Weight, Gauge, Timer, Droplets, Activity } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Panel, PanelHeader, StatusPill, Sparkline, AnimatedNumber, ScreenTitle, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';

export default function LiveMachine({ telemetry: tm, live }) {
  const [view, setView] = useState('side');
  const tiles = [
    { k: 'Engine hours', v: tm.engineHours, d: 1, u: 'h', icon: Timer, hist: null },
    { k: 'Hydraulic temp', v: tm.hydraulicTemp, d: 1, u: '°C', icon: Droplets, hist: tm.hist.hydraulicTemp, warn: tm.hydraulicTemp > 85 },
    { k: 'Engine temp', v: tm.engineTemp, d: 1, u: '°C', icon: Thermometer, hist: tm.hist.engineTemp, warn: tm.engineTemp > 95 },
    { k: 'Fuel', v: tm.fuel, d: 0, u: '%', icon: Fuel, bar: tm.fuel },
    { k: 'Load', v: tm.load, d: 0, u: '%', icon: Weight, hist: tm.hist.load },
    { k: 'Speed', v: tm.speed, d: 1, u: 'km/h', icon: Gauge },
    { k: 'Idle', v: tm.idleMin, d: 0, u: 'min', icon: Activity, note: 'baseline 18–25 min / shift' },
    { k: 'Engine speed', v: tm.rpm, d: 0, u: 'rpm', icon: Cpu },
  ];
  const chartData = tm.hist.engineTemp.map((_, i) => ({
    t: i - 59, engine: tm.hist.engineTemp[i], hyd: tm.hist.hydraulicTemp[i], fuel: tm.hist.fuelRate[i], load: tm.hist.load[i],
  }));

  return (
    <div>
      <ScreenTitle eyebrow="EXC-204 · streaming 1 Hz" title="Live machine"
        right={<div className="flex gap-2">
          {['side', 'plan'].map((v) => <button key={v} className={cx('chip', view === v && 'chip-on')} onClick={() => setView(v)}>{v === 'side' ? 'Side view' : 'Plan view'}</button>)}
        </div>} />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel className="xl:col-span-7 !p-0 overflow-hidden">
          <div className="p-5 pb-0"><PanelHeader title="Machine state" right={<StatusPill level="safe">All systems normal</StatusPill>} /></div>
          <div className="tech-grid relative aspect-[16/11] max-w-full">
            {view === 'side' ? <SideView tm={tm} /> : <MachinePlan worker={live.state.worker} distance={live.state.distance} level={live.risk.level} speed={live.state.speed} load={live.state.load} className="absolute inset-0 h-full" />}
          </div>
        </Panel>
        <div className="xl:col-span-5 grid grid-cols-2 gap-3 content-start">
          {tiles.map((x) => (
            <div key={x.k} className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="label truncate">{x.k}</span><x.icon size={14} className="text-ink3 shrink-0" /></div>
              <div className={cx('num text-[26px] mt-1 leading-tight', x.warn ? 'text-caution' : 'text-ink')}>
                <AnimatedNumber value={x.v} decimals={x.d} /><span className="text-sm text-ink3 ml-1">{x.u}</span>
              </div>
              {x.hist && <div className="mt-2"><Sparkline data={x.hist} color="#a9b2bc" height={30} /></div>}
              {x.bar != null && <div className="mt-3 h-2 rounded-sm bg-bg3"><div className="h-full rounded-sm bg-ink transition-all" style={{ width: `${x.bar}%` }} /></div>}
              {x.note && <div className="text-xs text-ink3 mt-2">{x.note}</div>}
            </div>
          ))}
        </div>

        <Panel className="xl:col-span-12">
          <PanelHeader title="Real-time telemetry · last 60 s" />
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
            <MiniChart data={chartData} k="engine" name="Engine temp" unit="°C" domain={[76, 90]} warn={95} />
            <MiniChart data={chartData} k="hyd" name="Hydraulic temp" unit="°C" domain={[70, 84]} />
            <MiniChart data={chartData} k="fuel" name="Fuel consumption" unit="L/h" domain={[10, 18]} />
            <MiniChart data={chartData} k="load" name="Load" unit="%" domain={[50, 90]} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MiniChart({ data, k, name, unit, domain }) {
  const last = data[data.length - 1][k];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between"><span className="label">{name}</span><span className="num text-sm">{last}<span className="text-ink3"> {unit}</span></span></div>
      <div className="h-[120px] mt-2">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#2a3139" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} interval={19} tickFormatter={(v) => `${v}s`} />
            <YAxis domain={domain} tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={{ background: '#101317', border: '1px solid #2a3139', borderRadius: 8, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12 }} labelStyle={{ color: '#838e99' }} />
            <Line type="monotone" dataKey={k} stroke="#e9edf0" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Side elevation with animated dig cycle and component callouts. */
function SideView({ tm }) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now();
    const loop = (t) => { setPh(((t - t0) / 1000) % 8); raf = requestAnimationFrame(loop); };
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = Math.sin((ph / 8) * Math.PI * 2);
  const boom = -38 + s * 10; // degrees
  const arm = 62 + s * 18;
  const bucket = 40 + s * 30;
  return (
    <svg viewBox="0 0 800 550" className="absolute inset-0 w-full h-full" role="img" aria-label="Excavator side view with live component status">
      <line x1="0" y1="440" x2="800" y2="440" stroke="#46505b" />
      {Array.from({ length: 40 }, (_, i) => <line key={i} x1={i * 20} y1="440" x2={i * 20 - 12} y2="452" stroke="#2a3139" />)}
      {/* tracks */}
      <rect x="170" y="380" width="330" height="60" rx="30" fill="#23282e" stroke="#46505b" strokeWidth="2" />
      {[205, 260, 315, 370, 425, 465].map((x) => <circle key={x} cx={x} cy="410" r="16" fill="#15181c" stroke="#46505b" strokeWidth="2" />)}
      {/* house */}
      <rect x="200" y="350" width="280" height="30" fill="#3a3f45" />
      <path d="M190 350 L190 270 Q190 255 205 255 L470 255 L490 290 L490 350 Z" fill="#c99a2e" stroke="#8a6710" strokeWidth="2" />
      <rect x="170" y="280" width="40" height="70" rx="6" fill="#3a3f45" />
      {/* cab */}
      <path d="M360 255 L360 170 Q360 160 370 160 L445 160 L470 255 Z" fill="#1b2530" stroke="#0e1318" strokeWidth="2" />
      <path d="M372 172 L438 172 L458 248 L372 248 Z" fill="#56c7db" opacity="0.28" />
      {/* boom chain */}
      <g transform={`translate(465 285) rotate(${boom})`}>
        <rect x="0" y="-16" width="230" height="32" rx="10" fill="#b98c2a" stroke="#8a6710" strokeWidth="2" />
        <rect x="30" y="14" width="120" height="10" rx="5" fill="#9aa3ad" />
        <g transform={`translate(230 0) rotate(${arm})`}>
          <rect x="0" y="-12" width="170" height="24" rx="8" fill="#a87e22" stroke="#8a6710" strokeWidth="2" />
          <g transform={`translate(170 0) rotate(${bucket})`}>
            <path d="M0 -14 L50 -18 Q70 10 45 38 L0 14 Z" fill="#6e7780" stroke="#3a424d" strokeWidth="2" />
            {[0, 1, 2].map((i) => <path key={i} d={`M${46 - i * 4} ${36 - i * 12} l10 4 l-8 4 z`} fill="#46505b" />)}
          </g>
        </g>
      </g>
      {/* callouts */}
      <Callout x={250} y={300} lx={120} ly={120} label="ENGINE" value={`${tm.engineTemp.toFixed(1)} °C`} ok />
      <Callout x={330} y={365} lx={70} ly={505} label="HYDRAULICS" value={`${tm.hydraulicTemp.toFixed(1)} °C`} ok />
      <Callout x={410} y={210} lx={560} ly={80} label="CAB · OP1007" value="Seatbelt fastened" ok />
      <Callout x={540} y={260} lx={640} ly={505} label="LOAD" value={`${tm.load}% · ${(tm.load * 0.018).toFixed(2)} t`} ok />
    </svg>
  );
}

function Callout({ x, y, lx, ly, label, value, ok }) {
  const col = ok ? '#3fd08a' : '#f2b53a';
  const w = 170;
  return (
    <g>
      <line x1={x} y1={y} x2={lx + w / 2} y2={ly + (ly < y ? 44 : 0)} stroke="#838e99" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx={x} cy={y} r="6" fill={col} />
      <circle cx={x} cy={y} r="12" fill="none" stroke={col} opacity=".5" />
      <rect x={lx} y={ly} width={w} height="44" rx="6" fill="#101317" stroke="#2a3139" />
      <text x={lx + 12} y={ly + 18} fill="#838e99" style={{ font: '600 11px Barlow, system-ui, sans-serif', letterSpacing: '.14em' }}>{label}</text>
      <text x={lx + 12} y={ly + 35} fill="#e9edf0" style={{ font: '500 13px "JetBrains Mono", ui-monospace, monospace' }}>{value}</text>
    </g>
  );
}
