import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GitCompareArrows, RotateCcw, ArrowDown, Wand2 } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ArcGauge, ScenarioSlider, Disclaimer, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { computeRisk, LEVEL_COLOR } from '../lib/risk.js';
import { useI18n } from '../lib/i18n.jsx';

const DEFAULT_ACTUAL = { speed: 8, distance: 2, slope: 10, load: 72 };
const DEFAULT_SAFER = { speed: 4, distance: 4, slope: 10, load: 72 };
const workerAt = (d) => ({ x: -Math.cos(0.8) * (d + 1.7), y: Math.sin(0.8) * (d + 1.7) });

export default function WhatIf({ whatIfPreset }) {
  const { t } = useI18n();
  const actual = whatIfPreset
    ? { speed: whatIfPreset.speed, distance: whatIfPreset.distance, slope: whatIfPreset.slope, load: whatIfPreset.load }
    : DEFAULT_ACTUAL;
  const [safer, setSafer] = useState(DEFAULT_SAFER);
  const rA = computeRisk(actual);
  const rS = computeRisk(safer);
  const delta = rA.score - rS.score;

  // which single lever contributes most to the reduction?
  const lever = useMemo(() => {
    const keys = ['speed', 'distance', 'load', 'slope'];
    return keys.map((k) => ({ k, gain: rA.score - computeRisk({ ...actual, [k]: safer[k] }).score })).sort((a, b) => b.gain - a.gain)[0];
  }, [actual, safer, rA.score]);

  const suggest = () => setSafer({ ...actual, speed: 3, distance: Math.max(actual.distance, 5) });

  return (
    <div>
      <ScreenTitle eyebrow="Simulate · counterfactual" title="What-if safety analysis"
        sub={whatIfPreset ? 'Starting from the live proximity event you just saw.' : 'Starting from event EVT-0917-1432 (17 Sep, 14:32).'}
        right={<Disclaimer />} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        <Side title="Actual" tone="actual" s={actual} r={rA} t={t} />
        <div className="flex lg:flex-col items-center justify-center gap-3 py-2">
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-line" />
          <div className="font-display text-sm font-semibold tracking-[0.2em] text-ink3">VERSUS</div>
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-line" />
        </div>
        <Side title="Safer scenario" tone="safer" s={safer} r={rS} t={t} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mt-4">
        <Panel className="xl:col-span-7">
          <PanelHeader title="Adjust the safer scenario" icon={GitCompareArrows}
            right={<div className="flex gap-2">
              <button className="btn btn-assist h-10 px-3" onClick={suggest}><Wand2 size={16} />Suggest</button>
              <button className="btn h-10 px-3" onClick={() => setSafer(DEFAULT_SAFER)} aria-label="Reset"><RotateCcw size={16} /></button>
            </div>} />
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
            <ScenarioSlider id="wi-speed" label={t('f.speed')} unit="km/h" min={0} max={12} step={0.5} value={safer.speed} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer((s) => ({ ...s, speed: v }))} />
            <ScenarioSlider id="wi-dist" label={t('f.distance')} unit="m" min={0.5} max={10} step={0.5} value={safer.distance} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer((s) => ({ ...s, distance: v }))} />
            <ScenarioSlider id="wi-load" label={t('f.load')} unit="%" min={0} max={100} step={1} value={safer.load} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer((s) => ({ ...s, load: v }))} />
            <ScenarioSlider id="wi-slope" label={t('f.slope')} unit="°" min={0} max={25} step={1} value={safer.slope} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer((s) => ({ ...s, slope: v }))} />
          </div>
        </Panel>
        <Panel className="xl:col-span-5">
          <PanelHeader title="Simulated difference" />
          <div className="flex items-end gap-3">
            <div className={cx('font-display text-[64px] leading-none font-semibold', delta > 0 ? 'text-safe' : delta < 0 ? 'text-critical' : 'text-ink')}>
              {delta > 0 ? '−' : delta < 0 ? '+' : ''}<AnimatedNumber value={Math.abs(delta)} />
            </div>
            <div className="pb-2 text-ink2">risk points<br /><span className="text-xs text-ink3">{rA.score} → {rS.score}</span></div>
          </div>
          {delta > 0 && (
            <p className="mt-4 flex gap-2 text-[15px]"><ArrowDown size={18} className="text-assist shrink-0 mt-0.5" />
              <span>The biggest single lever is <b className="text-assist">{t(lever.k === 'slope' ? 'f.slope' : `f.${lever.k}`)}</b> — changing only that removes {lever.gain} points.</span>
            </p>
          )}
          <SpeedCurve actual={actual} safer={safer} />
        </Panel>
      </div>
    </div>
  );
}

function Side({ title, tone, s, r, t }) {
  const isActual = tone === 'actual';
  return (
    <motion.div layout className={cx('panel overflow-hidden', isActual ? '' : 'border-assist/50')}>
      <div className="p-5 pb-3 flex items-center justify-between">
        <h2 className={cx('font-display text-2xl font-semibold tracking-[0.08em] uppercase', !isActual && 'text-assist')}>{title}</h2>
        <StatusPill level={isActual ? 'neutral' : 'assist'}>{isActual ? 'Recorded' : 'Simulated'}</StatusPill>
      </div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)] gap-3 px-5 pb-5">
        <div className="relative tech-grid rounded-md border border-line aspect-square max-w-full">
          <MachinePlan worker={workerAt(s.distance)} distance={s.distance} level={r.level} compact className="absolute inset-0 w-full h-full" extent={9} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex justify-center"><ArcGauge value={r.score} level={r.level} size={160} label={t('lvl.short.' + r.level)} /></div>
          <dl className="mt-1 divide-y divide-line">
            {[[t('f.speed'), `${s.speed} km/h`], [t('f.distance'), `${s.distance} m`], [t('f.slope'), `${s.slope}°`], [t('f.load'), `${s.load}%`]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5"><dt className="text-sm text-ink2">{k}</dt><dd className="num text-sm">{v}</dd></div>
            ))}
            <div className="flex justify-between py-1.5"><dt className="text-sm text-ink2">Risk</dt><dd className="text-sm font-semibold" style={{ color: LEVEL_COLOR[r.level] }}>{t('lvl.short.' + r.level)}</dd></div>
          </dl>
        </div>
      </div>
    </motion.div>
  );
}

/** Risk as a function of speed, holding the safer scenario's other inputs. */
function SpeedCurve({ actual, safer }) {
  const W = 400, H = 120;
  const xs = Array.from({ length: 49 }, (_, i) => i * 0.25);
  const x = (v) => 30 + (v / 12) * (W - 40);
  const y = (r) => H - 18 - (r / 100) * (H - 30);
  const curve = (base) => xs.map((v, i) => `${i ? 'L' : 'M'}${x(v)} ${y(computeRisk({ ...base, speed: v }).score)}`).join(' ');
  return (
    <div className="mt-5">
      <div className="label mb-1">Risk vs speed</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Risk versus speed for both scenarios">
        {[0, 50, 100].map((r) => <g key={r}><line x1="30" x2={W - 10} y1={y(r)} y2={y(r)} stroke="#2a3139" /><text x="24" y={y(r) + 3} textAnchor="end" fill="#838e99" style={{ font: '10px "JetBrains Mono", ui-monospace, monospace' }}>{r}</text></g>)}
        {[0, 4, 8, 12].map((v) => <text key={v} x={x(v)} y={H - 4} textAnchor="middle" fill="#838e99" style={{ font: '10px "JetBrains Mono", ui-monospace, monospace' }}>{v}</text>)}
        <path d={curve(actual)} fill="none" stroke="#a9b2bc" strokeWidth="1.5" />
        <path d={curve(safer)} fill="none" stroke="#56c7db" strokeWidth="2" strokeDasharray="5 4" />
        <circle cx={x(actual.speed)} cy={y(computeRisk(actual).score)} r="5" fill="#e9edf0" />
        <circle cx={x(safer.speed)} cy={y(computeRisk(safer).score)} r="5" fill="#56c7db" />
      </svg>
      <div className="flex gap-4 text-xs text-ink2"><span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-ink2" />Actual conditions</span><span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-assist" />Safer scenario</span><span className="text-ink3">km/h →</span></div>
    </div>
  );
}
