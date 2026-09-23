import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserRound, Fingerprint, AlertTriangle, TrendingUp, Sparkles, GraduationCap, Brain } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Panel, PanelHeader, StatusPill, BaselineBand, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import { twin, operator } from '../data/mock.js';

const METRICS = [
  { k: 'safety', label: 'Safety' }, { k: 'efficiency', label: 'Efficiency' },
  { k: 'control', label: 'Control' }, { k: 'awareness', label: 'Awareness' },
];

export default function OperatorTwin({ nav }) {
  const [hover, setHover] = useState(null);
  const radar = [
    { k: 'Safety', now: twin.scores.safety, base: 86 }, { k: 'Efficiency', now: twin.scores.efficiency, base: 77 },
    { k: 'Control', now: twin.scores.control, base: 85 }, { k: 'Awareness', now: twin.scores.awareness, base: 80 },
    { k: 'Fuel', now: twin.scores.fuel, base: 79 },
  ];
  const out = twin.baselineBands.filter((b) => b.current < b.min || b.current > b.max);

  return (
    <div>
      <ScreenTitle eyebrow="Understands the operator, not just the machine" title="Operator Digital Twin" />

      {/* Identity strip */}
      <Panel className="!p-0 overflow-hidden mb-4">
        <div className="grid md:grid-cols-[auto_1fr_auto]">
          <div className="p-5 flex items-center gap-4 border-b md:border-b-0 md:border-r border-line">
            <TwinAvatar />
            <div>
              <div className="num text-2xl">{operator.id}</div>
              <div className="text-ink2 text-sm">{operator.role} · <span className="text-safe">● On Duty</span></div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Fact k="Experience" v={operator.experience} />
            <Fact k="Current shift" v={`${operator.shift} · 06–14`} />
            <Fact k="Hours modelled" v={<span className="num">1,843 h</span>} />
            <Fact k="Shifts in baseline" v={<span className="num">146</span>} />
          </div>
          <div className="p-5 border-t md:border-t-0 md:border-l border-line bg-elevated/[0.06] min-w-[220px]">
            <div className="label">Behavior · last 30 min</div>
            <div className="font-display text-3xl font-bold tracking-wider text-elevated mt-1 flex items-center gap-2"><AlertTriangle size={24} />UNUSUAL</div>
            <div className="text-xs text-ink2 mt-1">{out.length} of {twin.baselineBands.length} behaviors outside your normal range</div>
          </div>
        </div>
      </Panel>

      {/* Big metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {METRICS.map((m, i) => {
          const v = twin.scores[m.k], prev = twin.lastWeek[m.k];
          return (
            <motion.div key={m.k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="panel p-5 relative overflow-hidden" onMouseEnter={() => setHover(m.label)} onMouseLeave={() => setHover(null)}>
              <div className="label">{m.label}</div>
              <div className="flex items-end justify-between gap-2 mt-1">
                <AnimatedNumber value={v} className="font-display font-semibold leading-none" style={{ fontSize: 'clamp(48px,5vw,72px)' }} />
                <div className="text-right pb-1.5">
                  <div className={cx('num text-sm', v >= prev ? 'text-safe' : 'text-elevated')}>{v >= prev ? '+' : ''}{v - prev}</div>
                  <div className="text-[11px] text-ink3">vs last week</div>
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
          <PanelHeader title="Skill profile" icon={Fingerprint} sub="Today vs your own 30-shift baseline" />
          <div className="h-[320px]">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#2a3139" />
                <PolarAngleAxis dataKey="k" tick={{ fill: '#a9b2bc', fontSize: 12, fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600 }} />
                <Radar name="Baseline" dataKey="base" stroke="#838e99" strokeDasharray="4 4" fill="#838e99" fillOpacity={0.05} isAnimationActive={false} />
                <Radar name="Today" dataKey="now" stroke="#56c7db" strokeWidth={2} fill="#56c7db" fillOpacity={0.18} />
                <Tooltip contentStyle={{ background: '#101317', border: '1px solid #2a3139', borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-5 text-xs text-ink2 justify-center">
            <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-assist" />Today</span>
            <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-ink3" />Personal baseline</span>
          </div>
        </Panel>

        {/* Baseline vs current */}
        <Panel className="xl:col-span-7">
          <PanelHeader title="Personal baseline vs current behavior" icon={Brain}
            right={<StatusPill level="elevated">Anomaly</StatusPill>} />
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <BaseFact k="Typical idle time" base="18–25 min" now="42 min" bad />
            <BaseFact k="Typical speed" base="3.5–5 km/h" now="6.8 km/h" bad />
            <BaseFact k="Typical fuel efficiency" base="82%" now="Normal" />
          </div>
          <div className="space-y-5">
            {twin.baselineBands.map((b) => <BaselineBand key={b.key} {...b} />)}
          </div>
          <div className="mt-5 rounded-md border border-assist/40 bg-assist/10 p-4 flex gap-3">
            <Sparkles size={18} className="text-assist shrink-0 mt-0.5" />
            <p className="text-sm text-ink">Anomaly detection compares <b>OP1007 against OP1007</b> — the green band is your own normal range learned from 146 shifts. A new operator and a 20-year veteran each get their own band, so alerts reflect a change in <i>your</i> behavior, not a fleet rule.</p>
          </div>
        </Panel>

        {/* Trend */}
        <Panel className="xl:col-span-7">
          <PanelHeader title="14-day trend" icon={TrendingUp} right={<StatusPill level="safe">↑ Improving</StatusPill>} />
          <div className="h-[220px]">
            <ResponsiveContainer>
              <AreaChart data={twin.history} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gs" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e9edf0" stopOpacity={0.2} /><stop offset="100%" stopColor="#e9edf0" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#2a3139" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} />
                <YAxis domain={[60, 100]} tick={{ fill: '#838e99', fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#101317', border: '1px solid #2a3139', borderRadius: 8, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12 }} />
                <ReferenceLine y={85} stroke="#838e99" strokeDasharray="4 4" label={{ value: 'baseline', fill: '#838e99', fontSize: 10, position: 'insideTopLeft' }} />
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
            {[
              ['Idle time rises after 10:30 on loading days — usually waiting for trucks.', 'Reducing Excessive Idling', 'elevated'],
              ['Travel speed climbs on the return leg after a completed dump cycle.', 'Blind-Zone Awareness', 'elevated'],
              ['Your slope control is 12% smoother than 30 days ago.', null, 'safe'],
            ].map(([text, mod, l]) => (
              <li key={text} className="rounded-md bg-bg3/60 border border-line p-3">
                <div className="flex gap-2"><span className={cx('w-1.5 h-1.5 rounded-full mt-2 shrink-0', l === 'safe' ? 'bg-safe' : 'bg-elevated')} /><p className="text-sm">{text}</p></div>
                {mod && <button onClick={() => nav('training')} className="mt-2 ml-3.5 inline-flex items-center gap-1.5 text-sm text-assist hover:underline"><GraduationCap size={14} />Recommended: {mod}</button>}
              </li>
            ))}
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
