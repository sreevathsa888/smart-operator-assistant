import React from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, UserRound, Timer, ArrowUpRight, TrendingUp, Cog, Droplets, Weight, Gauge } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ArcGauge, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useClock } from '../hooks/useTelemetry.js';
import { twin, tasks } from '../data/mock.js';

export default function Overview({ live, telemetry, nav }) {
  const { t } = useI18n();
  const now = useClock();
  const h = now.getHours();
  const greet = h < 12 ? 'greet.morning' : h < 17 ? 'greet.afternoon' : 'greet.evening';
  const safety = 100 - live.risk.score;
  const lvl = live.risk.level;
  const s = live.state;
  const task = tasks.find((x) => x.status === 'in_progress');

  return (
    <div className="space-y-4">
      {/* Greeting strip */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <div className="label text-assist">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · 06:00 – 14:00</div>
          <h1 className="font-display text-[32px] sm:text-[40px] leading-none font-semibold tracking-[0.03em] uppercase mt-2">{t(greet)}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="num text-2xl">EXC-204</div>
            <div className="label">Excavator</div>
          </div>
          <div className="h-12 w-px bg-line" />
          <div>
            <StatusPill level="safe">{t('hdr.online')}</StatusPill>
            <div className="num text-ink2 text-sm mt-1.5">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {t('hdr.shift')}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        {/* Today's operation */}
        <Panel className="md:col-span-3 xl:col-span-4 flex flex-col">
          <PanelHeader title={t('ov.today')} icon={Activity} right={<button onClick={() => nav('tasks')} className="text-ink3 hover:text-ink" aria-label="Open tasks"><ArrowUpRight size={18} /></button>} />
          <div className="label">{t('ov.current')}</div>
          <div className="font-display text-2xl font-semibold uppercase tracking-wide mt-1">{task.name} — {task.zone}</div>
          <div className="flex items-center gap-5 mt-5">
            <ProgressRing value={task.progress} />
            <div className="min-w-0 flex-1">
              <div className="label">{t('ov.eta')}</div>
              <div className="font-display text-[44px] leading-none font-semibold mt-1">2h <span className="text-ink2">18m</span></div>
              <div className="label mt-3">{t('ov.range')}</div>
              <div className="num text-sm text-ink2 mt-1">2h 05m – 2h 35m</div>
            </div>
          </div>
          <EtaRange low={125} point={138} high={155} className="mt-6" />
          <div className="mt-auto pt-5 grid grid-cols-3 gap-2 text-center">
            {tasks.map((x, i) => i < 3 && (
              <div key={x.id} className="rounded-md bg-bg3/60 border border-line py-2">
                <div className="label">{x.zone}</div>
                <div className={cx('text-xs font-semibold mt-1', x.status === 'completed' ? 'text-safe' : 'text-assist')}>{x.status === 'completed' ? 'DONE ✓' : `${x.progress}%`}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Live machine plan */}
        <Panel className="md:col-span-3 xl:col-span-5 !p-0 overflow-hidden flex flex-col">
          <div className="p-5 pb-0"><PanelHeader title={t('ov.machine')} icon={Gauge} right={<StatusPill level={lvl} pulse={lvl !== 'low'}>{t('lvl.short.' + lvl)}</StatusPill>} /></div>
          <div className="relative flex-1 min-h-[300px] tech-grid">
            <MachinePlan worker={s.worker} distance={s.distance} level={lvl} speed={s.speed} load={s.load} className="absolute inset-0 h-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4 border-t border-line [&>*]:border-line [&>*:not(:last-child)]:border-r">
            <Mini icon={Gauge} k={t('f.speed')} v={<><AnimatedNumber value={s.speed} decimals={1} /> <small className="text-ink3">km/h</small></>} />
            <Mini icon={Weight} k={t('f.load')} v={<><AnimatedNumber value={s.load} />%</>} />
            <Mini icon={Cog} k="Engine" v={<span className="text-safe">{t('s.normal')}</span>} />
            <Mini icon={Droplets} k="Hydraulic" v={<span className="text-safe">{t('s.normal')}</span>} />
          </div>
        </Panel>

        {/* Safety status */}
        <Panel className="md:col-span-6 xl:col-span-3 flex flex-col">
          <PanelHeader title={t('ov.safety')} icon={ShieldCheck} right={<button onClick={() => nav('safety')} className="text-ink3 hover:text-ink" aria-label="Open safety center"><ArrowUpRight size={18} /></button>} />
          <div className="flex justify-center -mt-2"><ArcGauge value={safety} level={lvl} size={210} sub="/100" label={t('lvl.' + lvl)} /></div>
          <div className="mt-1 space-y-0">
            <Row k={t('f.proximity')} v={s.distance < 3 ? `${s.distance} m` : t('s.safe')} level={s.distance < 3 ? 'high' : s.distance < 4 ? 'medium' : 'safe'} />
            <Row k={t('f.seatbelt')} v={t('s.fastened')} level="safe" />
            <Row k={t('f.terrain')} v={s.slope > 9 ? `${s.slope}°` : t('s.moderate')} level={s.slope > 9 ? 'medium' : 'assist'} />
            <Row k={t('f.control')} v={t('s.stable')} level="safe" />
            <Row k={t('f.load')} v={s.load > 80 ? 'HIGH' : t('s.normal')} level={s.load > 80 ? 'medium' : 'safe'} />
          </div>
        </Panel>

        {/* Operator digital twin */}
        <Panel className="md:col-span-6 xl:col-span-7">
          <PanelHeader title={t('ov.twin')} icon={UserRound} sub="Compared with OP1007's own last 30 shifts — not a fleet average."
            right={<button onClick={() => nav('twin')} className="text-ink3 hover:text-ink" aria-label="Open operator twin"><ArrowUpRight size={18} /></button>} />
          <div className="grid sm:grid-cols-[1fr_220px] gap-6">
            <ul className="space-y-3">
              {[['Safety', twin.scores.safety, twin.lastWeek.safety], ['Efficiency', twin.scores.efficiency, twin.lastWeek.efficiency], ['Control', twin.scores.control, twin.lastWeek.control], ['Awareness', twin.scores.awareness, twin.lastWeek.awareness], ['Fuel usage', twin.scores.fuel, twin.lastWeek.fuel]].map(([k, v, prev], i) => (
                <li key={k} className="grid grid-cols-[92px_1fr_64px] items-center gap-3">
                  <span className="text-sm text-ink2">{k}</span>
                  <div className="relative h-2.5 rounded-sm bg-bg3">
                    <motion.div className="absolute inset-y-0 left-0 rounded-sm bg-ink" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.8, delay: i * 0.06 }} />
                    <div className="absolute -inset-y-1 w-0.5 bg-assist" style={{ left: `${prev}%` }} title={`Last week ${prev}`} />
                  </div>
                  <span className="num text-right text-lg">{v}<small className={cx('text-xs ml-1', v >= prev ? 'text-safe' : 'text-elevated')}>{v >= prev ? '▲' : '▼'}</small></span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs text-ink3 pt-1"><span className="w-3 h-0.5 bg-assist inline-block" /> last week</li>
            </ul>
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-2">
              <TwinFact k="Current behavior" v="NORMAL" level="safe" />
              <TwinFact k="Personal baseline" v="STABLE" level="assist" />
              <TwinFact k="Behavior trend" v={<span className="inline-flex items-center gap-1"><TrendingUp size={16} />IMPROVING</span>} level="safe" />
            </div>
          </div>
        </Panel>

        {/* Telemetry + next */}
        <Panel className="md:col-span-6 xl:col-span-5">
          <PanelHeader title="Machine health" icon={Timer} right={<button onClick={() => nav('machine')} className="text-ink3 hover:text-ink" aria-label="Open live machine"><ArrowUpRight size={18} /></button>} />
          <div className="grid grid-cols-2 gap-3">
            <Stat k="Engine temp" v={telemetry.engineTemp} u="°C" d={1} />
            <Stat k="Hydraulic temp" v={telemetry.hydraulicTemp} u="°C" d={1} />
            <Stat k="Fuel" v={telemetry.fuel} u="%" d={0} />
            <Stat k="Engine hours" v={telemetry.engineHours} u="h" d={1} />
          </div>
          <div className="mt-4 rounded-md border border-assist/40 bg-assist/10 p-3 text-sm flex gap-3">
            <span className="label text-assist shrink-0 pt-0.5">Predict</span>
            <span className="text-ink">Fuel reaches 20% around <span className="num">13:05</span> — before Material Transfer (Zone D) ends. Refuel during the 12:30 break.</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProgressRing({ value }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative w-[132px] h-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#1d2228" strokeWidth="10" />
        {Array.from({ length: 40 }, (_, i) => (
          <line key={i} x1="66" y1="4" x2="66" y2="8" stroke="#2a3139" transform={`rotate(${i * 9} 66 66)`} />
        ))}
        <motion.circle cx="66" cy="66" r={r} fill="none" stroke="#e9edf0" strokeWidth="10" strokeLinecap="butt"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[40px] font-semibold leading-none">{value}<span className="text-xl text-ink2">%</span></span>
        <span className="label mt-1">done</span>
      </div>
    </div>
  );
}

export function EtaRange({ low, point, high, className, min = 100, max = 180 }) {
  const p = (v) => `${((v - min) / (max - min)) * 100}%`;
  const fmt = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return (
    <div className={className}>
      <div className="flex justify-between label"><span>Prediction range</span><span className="text-assist">80% confidence</span></div>
      <div className="relative h-9 mt-2">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {[100, 120, 140, 160, 180].map((m) => <div key={m} className="absolute top-1/2 h-2 w-px bg-ctl -translate-y-1/2" style={{ left: p(m) }} />)}
        <motion.div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-sm bg-assist/25 border border-assist/70"
          initial={{ left: p(point), width: 0 }} animate={{ left: p(low), width: `calc(${p(high)} - ${p(low)})` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-1 h-7 rounded-full bg-assist" style={{ left: `calc(${p(point)} - 2px)` }} />
      </div>
      <div className="relative h-4 num text-[11px] text-ink3">
        {[100, 140, 180].map((m, i) => <span key={m} className={cx('absolute whitespace-nowrap', i === 0 ? '' : i === 2 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: p(m) }}>{fmt(m)}</span>)}
      </div>
    </div>
  );
}

function Mini({ icon: Icon, k, v }) {
  return (
    <div className="px-3 py-3 min-w-0">
      <div className="flex items-center gap-1.5 label truncate"><Icon size={12} />{k}</div>
      <div className="num text-[15px] mt-1 truncate">{v}</div>
    </div>
  );
}
function Row({ k, v, level }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink2">{k}</span>
      <StatusPill level={level}>{v}</StatusPill>
    </div>
  );
}
function TwinFact({ k, v, level }) {
  const col = { safe: 'text-safe', assist: 'text-assist', elevated: 'text-elevated' }[level];
  return (
    <div className="rounded-md bg-bg3/60 border border-line p-3">
      <div className="label">{k}</div>
      <div className={cx('font-display text-lg font-semibold tracking-wider mt-1', col)}>{v}</div>
    </div>
  );
}
function Stat({ k, v, u, d }) {
  return (
    <div className="rounded-md bg-bg3/50 border border-line p-3">
      <div className="label">{k}</div>
      <div className="num text-[22px] mt-1"><AnimatedNumber value={v} decimals={d} /><span className="text-sm text-ink3 ml-1">{u}</span></div>
    </div>
  );
}
