import React, { useEffect, useRef, useState } from 'react';
import { motion, animate, useReducedMotion } from 'framer-motion';
import { LEVEL_COLOR } from '../../lib/risk.js';
import { useI18n } from '../../lib/i18n.jsx';
import { Info } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Panel({ className, children, as: As = 'section', ...rest }) {
  return <As className={cx('panel p-5', className)} {...rest}>{children}</As>;
}

export function PanelHeader({ title, icon: Icon, right, sub }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} strokeWidth={1.75} className="text-ink3 shrink-0" />}
          <h2 className="ptitle">{title}</h2>
        </div>
        {sub && <p className="text-ink2 text-sm mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const PILL = {
  safe: 'bg-safe/10 text-safe', low: 'bg-safe/10 text-safe',
  caution: 'bg-caution/15 text-caution', medium: 'bg-caution/15 text-caution',
  elevated: 'bg-elevated/15 text-elevated',
  critical: 'bg-critical/15 text-critical', high: 'bg-critical/15 text-critical',
  assist: 'bg-assist/15 text-assist', neutral: 'bg-bg3 text-ink2',
};
export function StatusPill({ level = 'neutral', children, pulse }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-[11px] font-semibold tracking-[0.12em] uppercase whitespace-nowrap', PILL[level])}>
      <span className={cx('w-1.5 h-1.5 rounded-full bg-current', pulse && 'zone-pulse')} />
      {children}
    </span>
  );
}

/** Tweens a number on change (600ms), per the motion principles. */
export function AnimatedNumber({ value, decimals = 0, className, suffix = '', style, from }) {
  const ref = useRef(null);
  const prev = useRef(from ?? value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) { node.textContent = value.toFixed(decimals) + suffix; prev.current = value; return; }
    const c = animate(prev.current, value, {
      duration: 0.6, ease: 'easeOut',
      onUpdate: (v) => { node.textContent = v.toFixed(decimals) + suffix; },
    });
    prev.current = value;
    return () => c.stop();
  }, [value, decimals, suffix, reduce]);
  return <span ref={ref} className={className} style={style}>{(from ?? value).toFixed(decimals) + suffix}</span>;
}

/** 270° arc gauge. `value` 0–100; color from level. */
export function ArcGauge({ value, level = 'low', size = 220, label, sub, invert }) {
  const r = size * 0.4, cxy = size / 2, sw = size * 0.055;
  const start = 135, sweep = 270;
  const pt = (deg) => [cxy + r * Math.cos((deg * Math.PI) / 180), cxy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0, a1) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const color = LEVEL_COLOR[level];
  const ticks = Array.from({ length: 28 }, (_, i) => start + (sweep / 27) * i);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`${label ?? ''} ${value}`}>
      {ticks.map((a, i) => {
        const [x0, y0] = [cxy + (r + sw) * Math.cos((a * Math.PI) / 180), cxy + (r + sw) * Math.sin((a * Math.PI) / 180)];
        const [x1, y1] = [cxy + (r + sw + (i % 3 === 0 ? 8 : 4)) * Math.cos((a * Math.PI) / 180), cxy + (r + sw + (i % 3 === 0 ? 8 : 4)) * Math.sin((a * Math.PI) / 180)];
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#46505b" strokeWidth="1" />;
      })}
      <path d={arc(start, start + sweep)} fill="none" stroke="#1d2228" strokeWidth={sw} strokeLinecap="round" />
      <motion.path d={arc(start, start + sweep)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        initial={false} animate={{ pathLength: Math.max(0.001, value / 100), stroke: color }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      <foreignObject x="0" y={cxy - size * 0.2} width={size} height={size * 0.5}>
        <div className="flex flex-col items-center justify-center h-full leading-none">
          <div className="flex items-baseline gap-1">
            <AnimatedNumber value={value} className="font-display font-semibold text-ink" style={{ fontSize: size * 0.27 }} />
            {sub && <span className="num text-ink3 text-sm">{sub}</span>}
          </div>
          {label && <div className="mt-2 text-xs font-semibold tracking-[0.16em] uppercase" style={{ color }}>{label}</div>}
        </div>
      </foreignObject>
    </svg>
  );
}

/** Hexagonal risk radar. axes: [{axis, value 0-100}] ; ghost: previous reading */
export function RiskRadar({ axes, ghost, level = 'low', size = 300, labels }) {
  const c = size / 2, R = size * 0.32, n = axes.length;
  const pos = (i, v) => { const a = (-90 + (360 / n) * i) * (Math.PI / 180); return [c + R * (v / 100) * Math.cos(a), c + R * (v / 100) * Math.sin(a)]; };
  const poly = (vals) => vals.map((v, i) => pos(i, Math.max(6, v)).join(',')).join(' ');
  const color = LEVEL_COLOR[level];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label="Risk radar">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke={ring === 100 ? '#46505b' : '#2a3139'} strokeWidth="1" />
      ))}
      {axes.map((_, i) => { const [x, y] = pos(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2a3139" />; })}
      {ghost && <polygon points={poly(ghost.map((g) => g.value))} fill="none" stroke="#838e99" strokeDasharray="4 4" strokeWidth="1.25" />}
      <motion.polygon initial={false} animate={{ points: poly(axes.map((a) => a.value)) }} transition={{ duration: 0.7, ease: 'easeOut' }}
        fill={color} fillOpacity="0.16" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = pos(i, Math.max(6, a.value));
        return <motion.circle key={a.axis} initial={false} animate={{ cx: x, cy: y }} transition={{ duration: 0.7 }} r="3.5" fill={color} />;
      })}
      {axes.map((a, i) => {
        const [x, y] = pos(i, 122);
        return (
          <g key={a.axis}>
            <text x={x} y={y - 4} textAnchor="middle" fill="#838e99" style={{ font: '600 10px Barlow, sans-serif', letterSpacing: '.14em' }}>{(labels?.[i] ?? a.axis).toUpperCase()}</text>
            <text x={x} y={y + 10} textAnchor="middle" fill="#e9edf0" style={{ font: '500 11px "JetBrains Mono", monospace' }}>{a.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ data, color = '#a9b2bc', height = 36, fill = true, min, max }) {
  const w = 160;
  const lo = min ?? Math.min(...data), hi = max ?? Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 4 - ((v - lo) / span) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      {fill && <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={color} fillOpacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0] - 2} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

export function ScenarioSlider({ id, label, value, min, max, step = 1, unit, onChange, color = '#56c7db', format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label">{label}</label>
        <span className="num text-sm font-medium" style={{ color }}>{format ? format(value) : value}{unit && <span className="text-ink3"> {unit}</span>}</span>
      </div>
      <input id={id} type="range" className="slider" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--pct': `${pct}%`, '--fill': color }} />
    </div>
  );
}

/** Personal-baseline band with current marker (Operator Twin). */
export function BaselineBand({ label, unit, min, max, current, domain }) {
  const [d0, d1] = domain;
  const p = (v) => `${((v - d0) / (d1 - d0)) * 100}%`;
  const out = current < min || current > max;
  const col = out ? '#ff8a3d' : '#3fd08a';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink2">{label}</span>
        <span className={cx('num text-sm font-medium', out ? 'text-elevated' : 'text-ink')}>
          {current}{unit && ` ${unit}`}{out && ' ⚠'}
        </span>
      </div>
      <div className="relative h-7 mt-2 rounded-sm bg-bg3">
        <div className="absolute inset-y-0 rounded-sm bg-safe/10 border border-safe/70" style={{ left: p(min), width: `calc(${p(max)} - ${p(min)})` }} />
        <motion.div className="absolute -inset-y-1 w-[3px] rounded-full" style={{ background: col, boxShadow: `0 0 10px ${col}` }}
          initial={{ left: p(d0) }} animate={{ left: p(current) }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      </div>
      <div className="flex justify-between num text-[11px] text-ink3 mt-1">
        <span>{d0}</span><span>baseline {min}–{max}</span><span>{d1}</span>
      </div>
    </div>
  );
}

export function Disclaimer({ className }) {
  const { t } = useI18n();
  return (
    <div className={cx('flex items-center gap-2 text-xs text-assist bg-assist/10 border border-assist/30 rounded-md px-3 py-2', className)}>
      <Info size={14} className="shrink-0" /> <span>{t('disclaimer')}</span>
    </div>
  );
}

export function KV({ k, v, level, mono = true }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink2">{k}</span>
      {level ? <StatusPill level={level}>{v}</StatusPill> : <span className={cx('text-sm text-ink', mono && 'num')}>{v}</span>}
    </div>
  );
}

export function useInterval(fn, ms, on = true) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => { if (!on) return; const id = setInterval(() => f.current(), ms); return () => clearInterval(id); }, [ms, on]);
}

export function ScreenTitle({ title, sub, right, eyebrow }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="label text-assist mb-1">{eyebrow}</div>}
        <h1 className="font-display text-[28px] leading-8 font-semibold tracking-[0.04em] uppercase">{title}</h1>
        {sub && <p className="text-ink2 mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function useStepper(len, ms, playing) {
  const [i, setI] = useState(0);
  useInterval(() => setI((x) => (x + 1) % len), ms, playing);
  return [i, setI];
}
