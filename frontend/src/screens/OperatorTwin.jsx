import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserRound, Fingerprint, AlertTriangle, TrendingUp, Sparkles, GraduationCap, Brain } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Panel, PanelHeader, StatusPill, BaselineBand, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';
import { useI18n } from '../lib/i18n.jsx';

const METRICS = [
  { k: 'safety', label: 'Safety' }, { k: 'efficiency', label: 'Efficiency' },
  { k: 'control', label: 'Control' }, { k: 'awareness', label: 'Awareness' },
];

const MODULE_TITLE = { blind: 'mod.blind', idle: 'mod.idle', slope: 'mod.slope', eco: 'Eco-Mode & Throttle Discipline', harsh: 'Smooth Controls, Fewer Shocks' };

export default function OperatorTwin({ nav, operatorId, session, dataVersion }) {
  const { t } = useI18n();
  const [hover, setHover] = useState(null);
  const q = useApi(() => api.twin(operatorId), [operatorId, dataVersion]);
  if (!q.data) return <ApiState loading={q.loading} error={q.error} data={q.data} onRetry={q.reload} rows={4} label="Loading digital twin" />;
  const twin = q.data;
  const operator = session.operator;
  const radar = ['safety', 'efficiency', 'control', 'awareness', 'fuel'].map((k) => ({ k: k[0].toUpperCase() + k.slice(1), now: twin.scores[k], base: twin.lastPeriod[k] }));
  const out = twin.baselineBands.filter((b) => b.outside);
  const unusual = twin.behavior === 'unusual';
  const top3 = [...twin.baselineBands].sort((a, b) => b.z - a.z).slice(0, 3);
  const modTitle = (id) => { const k = MODULE_TITLE[id]; return k?.startsWith('mod.') ? t(k) : k ?? id; };

  return (
    <div>
      <ScreenTitle eyebrow="Understands the operator, not just the machine" title="Operator Digital Twin" />

      {/* Identity strip */}
      <Panel className="!p-0 overflow-hidden mb-4">
        <div className="grid md:grid-cols-[auto_1fr_auto]">
          <div className="p-5 flex items-center gap-4 border-b md:border-b-0 md:border-r border-line">
            <TwinAvatar />
            <div>
              <div className="num text-2xl">{operator.operator_id}</div>
              <div className="text-ink2 text-sm">Operator · <span className="text-safe">● On Duty</span></div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Fact k={`${operator.experience_level} · years`} v={<span className="num">{operator.years_experience}</span>} />
            <Fact k={`${operator.operating_shift} shift`} v={<span className="num whitespace-nowrap">{operator.shift_window.replace(/ /g, '')}</span>} />
            <Fact k="Hours modelled" v={<span className="num">{twin.hours_modelled.toLocaleString()} h</span>} />
            <Fact k="Sessions in baseline" v={<span className="num">{twin.sessions_in_baseline}</span>} />
          </div>
          <div className={cx('p-5 border-t md:border-t-0 md:border-l border-line min-w-[220px]', unusual ? 'bg-elevated/[0.06]' : 'bg-safe/[0.05]')}>
            <div className="label">Behavior · current shift</div>
            <div className={cx('font-display text-3xl font-bold tracking-wider mt-1 flex items-center gap-2', unusual ? 'text-elevated' : 'text-safe')}>{unusual && <AlertTriangle size={24} />}{unusual ? 'UNUSUAL' : 'NORMAL'}</div>
            <div className="text-xs text-ink2 mt-1">{out.length} of {twin.baselineBands.length} behaviors outside your normal range · anomaly score {twin.current.anomaly_score}</div>
          </div>
        </div>
      </Panel>

      {/* Big metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {METRICS.map((m, i) => {
          const v = twin.scores[m.k], prev = twin.lastPeriod[m.k];
          return (
            <motion.div key={m.k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="panel p-5 relative overflow-hidden" onMouseEnter={() => setHover(m.label)} onMouseLeave={() => setHover(null)}>
              <div className="label">{m.label}</div>
              <div className="flex items-end justify-between gap-2 mt-1">
                <AnimatedNumber value={v} className="font-display font-semibold leading-none" style={{ fontSize: 'clamp(48px,5vw,72px)' }} />
                <div className="text-right pb-1.5">
                  <div className={cx('num text-sm', v >= prev ? 'text-safe' : 'text-elevated')}>{v >= prev ? '+' : ''}{v - prev}</div>
                  <div className="text-[11px] text-ink3">vs previous {twin.period_days} days</div>
                </div>
              </div>
              <div className="mt-4 h-1.5 bg-bg3 rounded-sm overflow-hidden">
                <motion.div className="h-full bg-ink" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.06 }} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Skill radar */}
        <Panel className="xl:col-span-5">
          <PanelHeader title="Skill profile" icon={Fingerprint} sub={`Last ${twin.period_days} days vs the ${twin.period_days} days before`} />
          <div className="h-[320px]">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#2a3139" />
                <PolarAngleAxis dataKey="k" tick={{ fill: '#a9b2bc', fontSize: 12, fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600 }} />
                <Radar name="Previous period" dataKey="base" stroke="#838e99" strokeDasharray="4 4" fill="#838e99" fillOpacity={0.05} isAnimationActive={false} />
                <Radar name="Current period" dataKey="now" stroke="#56c7db" strokeWidth={2} fill="#56c7db" fillOpacity={0.18} />
                <Tooltip contentStyle={{ background: '#101317', border: '1px solid #2a3139', borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-5 text-xs text-ink2 justify-center">
            <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-assist" />Current period</span>
            <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-ink3" />Previous period</span>
          </div>
        </Panel>

        {/* Baseline vs current */}
        <Panel className="xl:col-span-7">
          <PanelHeader title="Personal baseline vs current behavior" icon={Brain}
            right={<StatusPill level={unusual ? 'elevated' : 'safe'}>{unusual ? 'Anomaly' : 'Normal'}</StatusPill>} />
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            {top3.map((b) => <BaseFact key={b.key} k={`Typical ${b.label.toLowerCase()}`} base={`${b.min}–${b.max} ${b.unit}`} now={`${b.current} ${b.unit}`} bad={b.outside} />)}
          </div>
          <div className="space-y-5">
            {twin.baselineBands.map((b) => <BaselineBand key={b.key} label={b.label} unit={b.unit} min={b.min} max={b.max} current={b.current} domain={b.domain} />)}
          </div>
          <div className="mt-5 rounded-md border border-assist/40 bg-assist/10 p-4 flex gap-3">
            <Sparkles size={18} className="text-assist shrink-0 mt-0.5" />
            <p className="text-sm text-ink">Anomaly detection compares <b>{operator.operator_id} against {operator.operator_id}</b> — the green band is your own typical range (10th–90th percentile) learned from {twin.sessions_in_baseline} sessions ({twin.baseline_source} baseline). {twin.current.reason} A new operator and a 20-year veteran each get their own band, so alerts reflect a change in <i>your</i> behavior, not a fleet rule.</p>
          </div>
        </Panel>

        {/* Trend */}
        <Panel className="xl:col-span-7">
          <PanelHeader title={`${twin.period_days}-day trend`} icon={TrendingUp} right={<StatusPill level={twin.trend === 'declining' ? 'elevated' : twin.trend === 'improving' ? 'safe' : 'neutral'}>{twin.trend === 'improving' ? '↑ Improving' : twin.trend === 'declining' ? '↓ Declining' : '→ Stable'}</StatusPill>} />
          <div className="h-[220px]">
            <ResponsiveContainer>
              <AreaChart data={twin.history} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gs" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e9edf0" stopOpacity={0.2} /><stop offset="100%" stopColor="#e9edf0" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} />
                <YAxis domain={[(dataMin) => Math.max(0, Math.floor((dataMin - 5) / 5) * 5), 100]} tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#101317', border: '1px solid #2a3139', borderRadius: 8, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12 }} />
                <ReferenceLine y={twin.history[0]?.baseline} stroke="#838e99" strokeDasharray="4 4" label={{ value: '60-day avg', fill: '#838e99', fontSize: 10, position: 'insideTopLeft' }} />
                <Area type="monotone" dataKey="safety" name="Safety" stroke="#e9edf0" strokeWidth={2} fill="url(#gs)" />
                <Area type="monotone" dataKey="efficiency" name="Efficiency" stroke="#56c7db" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Learned insights */}
        <Panel className="xl:col-span-5">
          <PanelHeader title="What the twin has learned" icon={Sparkles} />
          <ul className="space-y-3">
            {twin.insights.length === 0 && <li className="text-sm text-ink2">No notable patterns in the last 60 days.</li>}
            {twin.insights.map(({ text, module: mod, level: l }) => (
              <li key={text} className="rounded-md bg-bg3/60 border border-line p-3">
                <div className="flex gap-2"><span className={cx('w-1.5 h-1.5 rounded-full mt-2 shrink-0', l === 'safe' ? 'bg-safe' : 'bg-elevated')} /><p className="text-sm">{text}</p></div>
                {mod && <button onClick={() => nav('training')} className="mt-2 ml-3.5 inline-flex items-center gap-1.5 text-sm text-assist hover:underline"><GraduationCap size={14} />Recommended: {modTitle(mod)}</button>}
              </li>
            ))}
            <li className="rounded-md border border-line p-3 flex items-center justify-between text-sm">
              <span className="text-ink2">Training score</span><span className="num text-lg">{twin.training.score}</span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function TwinAvatar() {
  // Abstract "twin" mark: two offset silhouettes — the operator and their model
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="12" fill="#1d2228" />
      <g fill="none" strokeWidth="2">
        <g stroke="#56c7db" strokeDasharray="3 3" transform="translate(6 0)"><circle cx="32" cy="24" r="9" /><path d="M16 52c2-10 8-14 16-14s14 4 16 14" /></g>
        <g stroke="#e9edf0"><circle cx="28" cy="24" r="9" /><path d="M12 52c2-10 8-14 16-14s14 4 16 14" /></g>
      </g>
    </svg>
  );
}
function Fact({ k, v }) { return <div><div className="label">{k}</div><div className="text-[17px] mt-1">{v}</div></div>; }
function BaseFact({ k, base, now, bad }) {
  return (
    <div className="rounded-md bg-bg3/60 border border-line p-3">
      <div className="label">{k}</div>
      <div className="num text-sm text-ink2 mt-1">{base}</div>
      <div className={cx('num text-lg mt-0.5', bad ? 'text-elevated' : 'text-safe')}>{now}{bad && ' ⚠'}</div>
    </div>
  );
}
