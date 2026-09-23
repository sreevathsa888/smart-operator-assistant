import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, UserRound, Timer, ArrowUpRight, TrendingUp, TrendingDown, Cog, Droplets, Weight, Gauge } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ArcGauge, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useClock } from '../hooks/useTelemetry.js';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';

export default function Overview({ live, telemetry, nav, operatorId, machineId, session, dataVersion, refresh }) {
  const { t } = useI18n();
  const now = useClock();
  const dash = useApi(() => api.dashboard(operatorId), [operatorId, dataVersion], { interval: 15000 });
  const [starting, setStarting] = useState(false);
  const h = now.getHours();
  const greet = h < 12 ? 'greet.morning' : h < 17 ? 'greet.afternoon' : 'greet.evening';
  if (!live.ready || !dash.data) return <ApiState loading={dash.loading || !live.ready} error={dash.error} data={dash.data} onRetry={dash.reload} rows={4} label="Loading dashboard" />;

  const d = dash.data;
  const safety = Math.round(100 - live.risk.score);
  const lvl = live.risk.level;
  const s = live.state;
  const task = d.current_task;
  const tw = d.twin;
  const byKey = Object.fromEntries(live.risk.contributions.map((c) => [c.key, c]));
  const factorLevel = (k) => (byKey[k]?.points > 8 ? 'high' : byKey[k]?.points > 3 ? 'medium' : 'safe');
  const startTask = async () => { setStarting(true); try { await api.startTask(task.id); await dash.reload(true); refresh?.(); } finally { setStarting(false); } };

  return (
    <div className="space-y-4">
      {/* Greeting strip */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <div className="label text-assist">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {d.operator.shift_window}</div>
          <h1 className="font-display text-[32px] sm:text-[40px] leading-none font-semibold tracking-[0.03em] uppercase mt-2">{t(greet)}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="num text-2xl">{machineId}</div>
            <div className="label">{d.machine.machine_type}</div>
          </div>
          <div className="h-12 w-px bg-line" />
          <div>
            <StatusPill level="safe">{t('hdr.online')}</StatusPill>
            <div className="num text-ink2 text-sm mt-1.5">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {d.operator.operating_shift}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        {/* Today's operation */}
        <Panel className="md:col-span-3 xl:col-span-4 flex flex-col">
          <PanelHeader title={t('ov.today')} icon={Activity} right={<button onClick={() => nav('tasks')} className="text-ink3 hover:text-ink" aria-label="Open tasks"><ArrowUpRight size={18} /></button>} />
          {task ? (
            <>
              <div className="label">{task.status === 'in_progress' ? t('ov.current') : 'Next task'}</div>
              <div className="font-display text-2xl font-semibold uppercase tracking-wide mt-1">{task.name} — {task.zone}</div>
              <div className="flex items-center gap-5 mt-5">
                <ProgressRing value={task.progress} />
                <div className="min-w-0 flex-1">
                  <div className="label">{task.status === 'in_progress' ? t('ov.eta') : 'Predicted duration'}</div>
                  <div className="font-display text-[44px] leading-none font-semibold mt-1">{hm(task.eta.pointMin)}</div>
                  <div className="label mt-3">{t('ov.range')}</div>
                  <div className="num text-sm text-ink2 mt-1">{task.eta.range_display}</div>
                </div>
              </div>
              <EtaRange low={task.eta.lowMin} point={task.eta.pointMin} high={task.eta.highMin} className="mt-6" />
              {task.status === 'pending' && <button className="btn btn-primary w-full mt-4" onClick={startTask} disabled={starting}>Start task</button>}
            </>
          ) : <p className="text-ink2">All tasks for today are complete.</p>}
          <div className="mt-auto pt-5 grid grid-cols-4 gap-2 text-center">
            {d.tasks.map((x) => (
              <div key={x.id} className="rounded-md bg-bg3/60 border border-line py-2">
                <div className="label">{x.zone}</div>
                <div className={cx('text-xs font-semibold mt-1', x.status === 'completed' ? 'text-safe' : x.status === 'in_progress' ? 'text-assist' : 'text-ink3')}>{x.status === 'completed' ? 'DONE ✓' : x.status === 'in_progress' ? `${x.progress}%` : 'NEXT'}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Live machine plan */}
        <Panel className="md:col-span-3 xl:col-span-5 !p-0 overflow-hidden flex flex-col">
          <div className="p-5 pb-0"><PanelHeader title={t('ov.machine')} icon={Gauge} right={<StatusPill level={lvl} pulse={lvl !== 'low'}>{t('lvl.short.' + lvl)}</StatusPill>} /></div>
          <div className="relative flex-1 min-h-[300px] tech-grid">
            <MachinePlan worker={s.worker} distance={s.distance} level={lvl} speed={s.speed} load={s.load} label={machineId} className="absolute inset-0 h-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4 border-t border-line [&>*]:border-line [&>*:not(:last-child)]:border-r">
            <Mini icon={Gauge} k={t('f.speed')} v={<><AnimatedNumber value={s.speed} decimals={1} /> <small className="text-ink3">km/h</small></>} />
            <Mini icon={Weight} k={t('f.load')} v={<><AnimatedNumber value={s.load} />%</>} />
            <Mini icon={Cog} k="Engine" v={<span className={telemetry.engineTemp > 100 ? 'text-caution' : 'text-safe'}>{telemetry.engineTemp > 100 ? 'HOT' : t('s.normal')}</span>} />
            <Mini icon={Droplets} k="Hydraulic" v={<span className={telemetry.hydraulicTemp > 90 ? 'text-caution' : 'text-safe'}>{telemetry.hydraulicTemp > 90 ? 'HOT' : t('s.normal')}</span>} />
          </div>
        </Panel>

        {/* Safety status */}
        <Panel className="md:col-span-6 xl:col-span-3 flex flex-col">
          <PanelHeader title={t('ov.safety')} icon={ShieldCheck} right={<button onClick={() => nav('safety')} className="text-ink3 hover:text-ink" aria-label="Open safety center"><ArrowUpRight size={18} /></button>} />
          <div className="flex justify-center -mt-2"><ArcGauge value={safety} level={lvl} size={210} sub="/100" label={t('lvl.' + lvl)} /></div>
          <div className="text-center text-[11px] text-ink3 -mt-1 mb-1">safety = 100 − predicted risk</div>
          <div className="mt-1 space-y-0">
            <Row k={t('f.proximity')} v={s.distance < 6 ? `${s.distance.toFixed(1)} m` : t('s.safe')} level={factorLevel('proximity')} />
            <Row k={t('f.seatbelt')} v={s.seatbelt === 'Fastened' ? t('s.fastened') : 'UNFASTENED'} level={s.seatbelt === 'Fastened' ? 'safe' : 'critical'} />
            <Row k={t('f.terrain')} v={`${s.slope}°`} level={factorLevel('terrain')} />
            <Row k={t('f.control')} v={factorLevel('control') === 'safe' ? t('s.stable') : 'CHECK'} level={factorLevel('control')} />
            <Row k={t('f.load')} v={s.load > 80 ? 'HIGH' : t('s.normal')} level={factorLevel('load')} />
          </div>
        </Panel>

        {/* Operator digital twin */}
        <Panel className="md:col-span-6 xl:col-span-7">
          <PanelHeader title={t('ov.twin')} icon={UserRound} sub={`Scores for the last ${tw.period_days} recorded days · marker = previous ${tw.period_days} days.`}
            right={<button onClick={() => nav('twin')} className="text-ink3 hover:text-ink" aria-label="Open operator twin"><ArrowUpRight size={18} /></button>} />
          <div className="grid sm:grid-cols-[1fr_220px] gap-6">
            <ul className="space-y-3">
              {[['Safety', 'safety'], ['Efficiency', 'efficiency'], ['Control', 'control'], ['Awareness', 'awareness'], ['Fuel usage', 'fuel']].map(([k, key], i) => {
                const v = tw.scores[key], prev = tw.lastPeriod[key];
                return (
                  <li key={k} className="grid grid-cols-[92px_1fr_64px] items-center gap-3">
                    <span className="text-sm text-ink2">{k}</span>
                    <div className="relative h-2.5 rounded-sm bg-bg3">
                      <motion.div className="absolute inset-y-0 left-0 rounded-sm bg-ink" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.8, delay: i * 0.06 }} />
                      <div className="absolute -inset-y-1 w-0.5 bg-assist" style={{ left: `${prev}%` }} title={`Previous period ${prev}`} />
                    </div>
                    <span className="num text-right text-lg">{v}<small className={cx('text-xs ml-1', v >= prev ? 'text-safe' : 'text-elevated')}>{v >= prev ? '▲' : '▼'}</small></span>
                  </li>
                );
              })}
              <li className="flex items-center gap-2 text-xs text-ink3 pt-1"><span className="w-3 h-0.5 bg-assist inline-block" /> previous period</li>
            </ul>
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-2">
              <TwinFact k="Current behavior" v={tw.current_status} level={tw.current_status === 'UNUSUAL' ? 'elevated' : 'safe'} />
              <TwinFact k="Personal baseline" v={tw.baseline.toUpperCase()} level={tw.baseline === 'stable' ? 'assist' : 'elevated'} />
              <TwinFact k="Behavior trend" v={<span className="inline-flex items-center gap-1">{tw.trend === 'declining' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}{tw.trend.toUpperCase()}</span>} level={tw.trend === 'declining' ? 'elevated' : 'safe'} />
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
            <span className="label text-assist shrink-0 pt-0.5">Project</span>
            <span className="text-ink">At the current burn of <span className="num">{telemetry.fuelRate} L/h</span>, fuel reaches 20% around <span className="num">{telemetry.fuelProjection.at}</span> ({telemetry.fuelProjection.method}).</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const hm = (m) => (m >= 60 ? <>{Math.floor(m / 60)}h <span className="text-ink2">{String(Math.round(m % 60)).padStart(2, '0')}m</span></> : <>{Math.round(m)}<span className="text-ink2">m</span></>);

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

export function EtaRange({ low, point, high, className }) {
  const span = Math.max(20, high - low);
  const min = Math.max(0, Math.floor((low - span * 0.35) / 10) * 10), max = Math.ceil((high + span * 0.35) / 10) * 10;
  const p = (v) => `${((v - min) / (max - min)) * 100}%`;
  const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)}m`);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  return (
    <div className={className}>
      <div className="flex justify-between label"><span>Prediction range</span><span className="text-assist">80% range · coverage checked on test data</span></div>
      <div className="relative h-9 mt-2">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {ticks.map((m) => <div key={m} className="absolute top-1/2 h-2 w-px bg-ctl -translate-y-1/2" style={{ left: p(m) }} />)}
        <motion.div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-sm bg-assist/25 border border-assist/70"
          initial={false} animate={{ left: p(low), width: `calc(${p(high)} - ${p(low)})` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        <motion.div className="absolute top-1/2 -translate-y-1/2 w-1 h-7 rounded-full bg-assist" initial={false} animate={{ left: `calc(${p(point)} - 2px)` }} transition={{ duration: 0.8 }} />
      </div>
      <div className="relative h-4 num text-[11px] text-ink3">
        {[ticks[0], ticks[2], ticks[4]].map((m, i) => <span key={i} className={cx('absolute whitespace-nowrap', i === 0 ? '' : i === 2 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: p(m) }}>{fmt(m)}</span>)}
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
  const col = { safe: 'text-safe', assist: 'text-assist', elevated: 'text-elevated', critical: 'text-critical' }[level];
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
