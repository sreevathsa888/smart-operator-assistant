import React, { useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, CircleDot, Circle, ChevronDown, Timer, CalendarClock, Sparkles } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ScreenTitle, cx } from '../components/ui/index.jsx';
import { EtaRange } from './Overview.jsx';

const fmt = (m) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)}m`);
const ST = {
  completed: { icon: CheckCircle2, cls: 'text-safe', pill: 'safe', label: 'Completed ✓' },
  in_progress: { icon: CircleDot, cls: 'text-assist', pill: 'assist', label: 'In progress' },
  pending: { icon: Circle, cls: 'text-ink3', pill: 'neutral', label: 'Pending' },
};

export default function Tasks({ operatorId, machineId, dataVersion, refresh }) {
  const q = useApi(() => api.tasks(operatorId), [operatorId, dataVersion], { interval: 10000 });
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  if (!q.data) return <ApiState loading={q.loading} error={q.error} data={q.data} onRetry={q.reload} rows={4} label="Loading tasks" />;
  const { tasks, current, drivers } = q.data;
  const openId = open ?? current?.id;
  const act = async (fn, id) => { setBusy(id); try { await fn(id); await q.reload(true); refresh?.(); } catch (e) { alert(e.message); } finally { setBusy(null); } };
  const next = tasks.find((x) => x.status === 'pending' && x.id !== current?.id);
  return (
    <div>
      <ScreenTitle eyebrow={`${tasks[0]?.gantt?.start ?? ''} shift · ${tasks.length} tasks · ${machineId}`} title="Today's tasks" />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 space-y-3">
          {tasks.map((task, i) => {
            const st = ST[task.status];
            const isOpen = openId === task.id;
            return (
              <motion.div key={task.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={cx('panel overflow-hidden', task.status === 'in_progress' && 'border-assist/50')}>
                <button onClick={() => setOpen(isOpen ? '' : task.id)} aria-expanded={isOpen}
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
                        <Cell k="Predicted total" v={`${fmt(task.estMin)}`} />
                        <Cell k="Actual" v={task.status === 'in_progress' ? `${fmt(task.actualMin)} so far` : fmt(task.actualMin)}
                          tone={task.actualMin && task.status === 'completed' ? (task.actualMin > task.estRange[1] ? 'text-caution' : 'text-safe') : ''} />
                        <Cell k="Typical risk" v={<StatusPill level={task.risk}>{task.risk}</StatusPill>} />
                        <Cell k="Target" v={`${Math.round(task.target_t)} t`} />
                        <Cell k="Planned start" v={task.start} />
                      </div>
                      {(task.status === 'pending' || task.status === 'in_progress') && (
                        <div className="px-5 pb-5 flex gap-2">
                          {task.status === 'pending' && <button className="btn btn-primary" disabled={busy === task.id || tasks.some((x) => x.status === 'in_progress')} onClick={() => act(api.startTask, task.id)}>Start task</button>}
                          {task.status === 'in_progress' && <button className="btn" disabled={busy === task.id} onClick={() => act(api.completeTask, task.id)}>Mark complete</button>}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <div className="xl:col-span-5 space-y-4">
          {current ? (
            <Panel>
              <PanelHeader title={current.status === 'in_progress' ? 'Estimated completion' : 'Predicted duration'} icon={Timer}
                sub={`${current.name} — ${current.zone} · task-time model (${current.eta.kind === 'remaining' ? 'minutes remaining' : 'total minutes'})`} />
              <div className="flex items-end gap-4">
                <div className="font-display text-[72px] leading-none font-semibold">{current.eta.display}</div>
                <div className="pb-2 text-sm"><div className="label">Expected range</div><div className="num text-ink2 mt-1">{current.eta.range_display}</div></div>
              </div>
              <Distribution low={current.eta.lowMin} point={current.eta.pointMin} high={current.eta.highMin} />
              <EtaRange low={current.eta.lowMin} point={current.eta.pointMin} high={current.eta.highMin} className="mt-2" />
              {drivers && (
                <>
                  <div className="label mt-5">What moves this estimate (vs {drivers.reference})</div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {drivers.drivers.map((d) => <Driver key={d.key} k={d.key} v={d.value} d={`${d.delta_min > 0 ? '+' : '−'}${Math.abs(d.delta_min).toFixed(0)} min`} good={d.delta_min <= 0} />)}
                  </div>
                </>
              )}
            </Panel>
          ) : <Panel><p className="text-ink2">All tasks for today are complete.</p></Panel>}
          <Panel>
            <PanelHeader title="Shift timeline" icon={CalendarClock} sub="Completed = recorded · current and pending = predicted" />
            <Gantt tasks={tasks} />
          </Panel>
          {next && (
            <div className="rounded-lg border border-assist/40 bg-assist/10 p-4 flex gap-3 text-sm">
              <Sparkles size={18} className="text-assist shrink-0" />
              <span>{next.name} ({next.zone}) is predicted to start at <span className="num">{next.gantt.start}</span> and take <span className="num">{fmt(next.estMin)}</span> ({fmt(next.estRange[0])}–{fmt(next.estRange[1])}).</span>
            </div>
          )}
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

/** Approximate density of the finish time implied by the model's 80 % range (P10–P90), shaded between them. */
function Distribution({ low, point, high }) {
  const W = 400, H = 90;
  const sd = Math.max(1, (high - low) / 2.563);
  const min = Math.max(0, point - 3.2 * sd), max = point + 3.2 * sd;
  const x = (m) => ((m - min) / (max - min)) * W;
  const pdf = (m) => Math.exp(-0.5 * ((m - point) / sd) ** 2);
  const pts = Array.from({ length: 81 }, (_, i) => min + ((max - min) * i) / 80);
  const line = pts.map((m, i) => `${i ? 'L' : 'M'}${x(m)} ${H - 4 - pdf(m) * (H - 14)}`).join(' ');
  const band = pts.filter((m) => m >= low && m <= high);
  const area = `M${x(low)} ${H - 4} ` + band.map((m) => `L${x(m)} ${H - 4 - pdf(m) * (H - 14)}`).join(' ') + ` L${x(high)} ${H - 4} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="mt-4" aria-label="Completion time distribution (approximate)">
      <motion.path d={area} fill="#56c7db" fillOpacity=".18" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
      <path d={line} fill="none" stroke="#56c7db" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <line x1={x(point)} x2={x(point)} y1="6" y2={H - 4} stroke="#e9edf0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="#2a3139" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Gantt({ tasks }) {
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const starts = tasks.map((t) => toMin(t.gantt.start)), ends = tasks.map((t) => toMin(t.gantt.end) + (toMin(t.gantt.end) < toMin(t.gantt.start) ? 1440 : 0));
  const start = Math.floor(Math.min(...starts) / 60) * 60, end = Math.ceil(Math.max(...ends) / 60) * 60;
  const p = (m) => ((m - start) / (end - start)) * 100;
  const now = new Date(); const nowM = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  return (
    <div>
      <div className="relative space-y-2">
        {tasks.map((t, i) => {
          const k = t.status === 'completed' ? 'safe' : t.status === 'in_progress' ? 'assist' : 'pending';
          return (
            <div key={t.id} className="grid grid-cols-[96px_1fr] items-center gap-2">
              <span className="text-xs text-ink2 truncate">{t.zone}{t.status !== 'completed' ? ' (pred.)' : ''}</span>
              <div className="relative h-6 bg-bg3/50 rounded-sm">
                <div className={cx('absolute inset-y-0 rounded-sm', k === 'safe' && 'bg-safe/60', k === 'assist' && 'bg-assist/70', k === 'pending' && 'border border-dashed border-assist bg-assist/10')}
                  style={{ left: `${p(starts[i])}%`, width: `${Math.max(1, p(ends[i]) - p(starts[i]))}%` }} title={`${t.gantt.start}–${t.gantt.end}`} />
              </div>
            </div>
          );
        })}
        {nowM >= start && nowM <= end && <div className="absolute top-0 bottom-0 w-px bg-ink pointer-events-none" style={{ left: `calc(96px + 0.5rem + (100% - 96px - 0.5rem) * ${p(nowM) / 100})` }} />}
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-2 mt-2">
        <span />
        <div className="flex justify-between num text-[11px] text-ink3">{hours.map((m) => <span key={m}>{String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</span>)}</div>
      </div>
    </div>
  );
}
