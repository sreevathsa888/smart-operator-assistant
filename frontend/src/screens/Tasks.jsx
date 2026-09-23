import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, CircleDot, Circle, ChevronDown, Timer, CalendarClock, Truck, Sparkles } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ScreenTitle, cx } from '../components/ui/index.jsx';
import { EtaRange } from './Overview.jsx';
import { tasks } from '../data/mock.js';

const fmt = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
const ST = {
  completed: { icon: CheckCircle2, cls: 'text-safe', pill: 'safe', label: 'Completed ✓' },
  in_progress: { icon: CircleDot, cls: 'text-assist', pill: 'assist', label: 'In progress' },
  pending: { icon: Circle, cls: 'text-ink3', pill: 'neutral', label: 'Pending' },
};

export default function Tasks() {
  const [open, setOpen] = useState('T-03');
  return (
    <div>
      <ScreenTitle eyebrow="Morning shift · 4 tasks · EXC-204" title="Today's tasks" />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 space-y-3">
          {tasks.map((task, i) => {
            const st = ST[task.status];
            const isOpen = open === task.id;
            return (
              <motion.div key={task.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={cx('panel overflow-hidden', task.status === 'in_progress' && 'border-assist/50')}>
                <button onClick={() => setOpen(isOpen ? null : task.id)} aria-expanded={isOpen}
                  className="w-full text-left p-5 flex items-center gap-4 min-h-[88px] hover:bg-bg3/40 transition-colors">
                  <span className="num text-ink3 text-sm w-6">{i + 1}.</span>
                  <st.icon size={24} className={cx(st.cls, 'shrink-0')} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-xl font-semibold uppercase tracking-wide truncate">{task.name} — {task.zone}</div>
                    <div className="mt-2 h-1.5 rounded-sm bg-bg3 overflow-hidden max-w-md">
                      <motion.div className={cx('h-full', task.status === 'completed' ? 'bg-safe' : 'bg-assist')} initial={{ width: 0 }} animate={{ width: `${task.progress}%` }} transition={{ duration: 0.8 }} />
                    </div>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1.5">
                    <StatusPill level={st.pill}>{st.label}</StatusPill>
                    <span className="num text-sm text-ink2">{task.progress}%</span>
                  </div>
                  <ChevronDown size={20} className={cx('text-ink3 transition-transform shrink-0', isOpen && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                      <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-line pt-4">
                        <Cell k="Progress" v={`${task.progress}%`} />
                        <Cell k="Estimated total" v={fmt(task.estMin)} />
                        <Cell k="Actual" v={task.status === 'in_progress' ? `${fmt(task.actualMin)} so far` : fmt(task.actualMin)}
                          tone={task.actualMin && task.status === 'completed' ? (task.actualMin > task.estMin ? 'text-caution' : 'text-safe') : ''} />
                        <Cell k="Risk level" v={<StatusPill level={task.risk}>{task.risk}</StatusPill>} />
                        <Cell k="Machine" v={task.machine} />
                        <Cell k="Start time" v={task.start} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <div className="xl:col-span-5 space-y-4">
          <Panel>
            <PanelHeader title="Estimated completion" icon={Timer} sub="Excavation — Zone C · predicted from cycle time, soil and your pace" />
            <div className="flex items-end gap-4">
              <div className="font-display text-[72px] leading-none font-semibold">2h <span className="text-ink2">18m</span></div>
              <div className="pb-2 text-sm"><div className="label">Expected range</div><div className="num text-ink2 mt-1">2h 05m – 2h 35m</div></div>
            </div>
            <Distribution />
            <EtaRange low={125} point={138} high={155} className="mt-2" />
            <div className="grid grid-cols-3 gap-2 mt-5">
              <Driver k="Soil" v="Clay, moist" d="+6 min" />
              <Driver k="Truck wait" v="avg 3.1 min" d="+9 min" />
              <Driver k="Your pace" v="104% of baseline" d="−5 min" good />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Shift timeline" icon={CalendarClock} />
            <Gantt />
          </Panel>
          <div className="rounded-lg border border-assist/40 bg-assist/10 p-4 flex gap-3 text-sm">
            <Sparkles size={18} className="text-assist shrink-0" />
            <span>Material Transfer (Zone D) is predicted to start at <span className="num">12:40</span>. <Truck size={14} className="inline -mt-0.5" /> 2 haul trucks booked.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ k, v, tone }) { return <div><div className="label">{k}</div><div className={cx('num text-[15px] mt-1', tone)}>{v}</div></div>; }
function Driver({ k, v, d, good }) {
  return (
    <div className="rounded-md bg-bg3/60 border border-line p-3">
      <div className="label">{k}</div><div className="text-sm mt-1">{v}</div>
      <div className={cx('num text-xs mt-1', good ? 'text-safe' : 'text-caution')}>{d}</div>
    </div>
  );
}

/** Probability density of finish time (normal-ish), shaded between P10–P90. */
function Distribution() {
  const W = 400, H = 90, min = 100, max = 180, mu = 138, sd = 11;
  const x = (m) => ((m - min) / (max - min)) * W;
  const pdf = (m) => Math.exp(-0.5 * ((m - mu) / sd) ** 2);
  const pts = Array.from({ length: 81 }, (_, i) => min + i);
  const line = pts.map((m, i) => `${i ? 'L' : 'M'}${x(m)} ${H - 4 - pdf(m) * (H - 14)}`).join(' ');
  const band = pts.filter((m) => m >= 125 && m <= 155);
  const area = `M${x(125)} ${H - 4} ` + band.map((m) => `L${x(m)} ${H - 4 - pdf(m) * (H - 14)}`).join(' ') + ` L${x(155)} ${H - 4} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="mt-4" aria-label="Completion time distribution">
      <motion.path d={area} fill="#56c7db" fillOpacity=".18" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
      <path d={line} fill="none" stroke="#56c7db" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <line x1={x(mu)} x2={x(mu)} y1="6" y2={H - 4} stroke="#e9edf0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="#2a3139" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Gantt() {
  const start = 6 * 60, end = 14 * 60;
  const p = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (((h * 60 + m) - start) / (end - start)) * 100; };
  const rows = [
    ['Zone A', '06:10', '07:52', 'safe'], ['Zone B', '07:55', '08:59', 'safe'],
    ['Zone C', '09:10', '11:29', 'assist'], ['Zone C (pred.)', '11:29', '11:48', 'pred'], ['Zone D', '12:40', '14:00', 'pending'],
  ];
  const nowPct = p('11:29');
  return (
    <div>
      <div className="relative space-y-2">
        {rows.map(([z, a, b, k]) => (
          <div key={z} className="grid grid-cols-[96px_1fr] items-center gap-2">
            <span className="text-xs text-ink2 truncate">{z}</span>
            <div className="relative h-6 bg-bg3/50 rounded-sm">
              <div className={cx('absolute inset-y-0 rounded-sm', k === 'safe' && 'bg-safe/60', k === 'assist' && 'bg-assist/70', k === 'pred' && 'border border-dashed border-assist bg-assist/10', k === 'pending' && 'bg-ctl/60')}
                style={{ left: `${p(a)}%`, width: `${p(b) - p(a)}%` }} />
            </div>
          </div>
        ))}
        <div className="absolute top-0 bottom-0 w-px bg-ink pointer-events-none" style={{ left: `calc(96px + 0.5rem + (100% - 96px - 0.5rem) * ${nowPct / 100})` }} />
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-2 mt-2">
        <span />
        <div className="flex justify-between num text-[11px] text-ink3"><span>06:00</span><span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span></div>
      </div>
    </div>
  );
}
