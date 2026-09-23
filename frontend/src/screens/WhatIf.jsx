import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GitCompareArrows, RotateCcw, ArrowDown, Wand2 } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ArcGauge, ScenarioSlider, Disclaimer, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { LEVEL_COLOR, ui } from '../lib/risk.js';
import { api } from '../api/client.js';
import { useApi, useDebouncedModel } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';
import { useI18n } from '../lib/i18n.jsx';

const workerAt = (d) => ({ x: -Math.cos(0.8) * (d + 1.7), y: Math.sin(0.8) * (d + 1.7) });
const LEVERS = ['speed', 'distance', 'load', 'slope'];
const SPEEDS = Array.from({ length: 25 }, (_, i) => i * 0.5);
/** UI state → model inputs (context the what-if does not change is carried over from the actual event). */
const toModel = (s, ctx) => ({ speed: s.speed, distance: s.distance, load: s.load, slope: s.slope, visibility: ctx.visibility ?? 85,
  Travel_Direction: ctx.direction ?? 'Reverse', Blind_Zone_Entry: ctx.blind_zone ?? 0, Obstacle_Type: 'Worker' });

export default function WhatIf({ whatIfPreset, operatorId }) {
  const { t } = useI18n();
  // Without a preset, start from the most recent recorded event's alert moment.
  const latest = useApi(async () => {
    const ev = (await api.events(operatorId, 20)).find((e) => e.replayable);
    return ev ? { ...(await api.replay(ev.event_id)).alert_frame, eventId: ev.event_id } : null;
  }, [operatorId], { enabled: !whatIfPreset });
  const preset = whatIfPreset ?? latest.data;
  const r1 = (x) => Math.round(x * 2) / 2;
  // actual = exactly what was recorded (1 decimal); only the editable safer scenario snaps to the slider grid
  const actual = useMemo(() => (preset ? { speed: +preset.speed.toFixed(1), distance: +preset.distance.toFixed(1), slope: +preset.slope.toFixed(1), load: Math.round(preset.load) } : null), [preset]);
  const ctx = useMemo(() => ({ visibility: preset?.visibility, direction: preset?.direction, blind_zone: preset?.blind_zone }), [preset]);
  const [safer, setSafer] = useState(null);
  const sv = safer ?? (actual ? { speed: Math.min(r1(actual.speed), 1.5), distance: Math.max(r1(actual.distance), 5), slope: Math.round(actual.slope), load: actual.load } : null);

  const model = useDebouncedModel(async () => {
    if (!actual) return null;
    const scen = [actual, sv, ...LEVERS.map((k) => ({ ...actual, [k]: sv[k] })), ...SPEEDS.map((v) => ({ ...actual, speed: v })), ...SPEEDS.map((v) => ({ ...sv, speed: v }))];
    const [batch, saferExplained] = await Promise.all([
      api.simulateRisk(scen.map((x) => toModel(x, ctx)), operatorId, false),
      api.simulateRisk(toModel(sv, ctx), operatorId, true),
    ]);
    const R = batch.results;
    return { rA: R[0], rS: R[1], lev: R.slice(2, 6), curveA: R.slice(6, 31), curveS: R.slice(31, 56), warnings: saferExplained.warnings ?? [] };
  }, [actual, sv?.speed, sv?.distance, sv?.load, sv?.slope, ctx], 150);

  if (!actual) return <ApiState loading={latest.loading} error={latest.error} data={null} onRetry={latest.reload} empty="No recorded event to start from — run a proximity event first." />;
  if (!model.data) return <ApiState loading error={model.error} data={null} rows={3} label="Running the safety model" />;
  const { rA: A, rS: S, lev, curveA, curveS, warnings } = model.data;
  const rA = { score: A.score, level: ui(A.level) }, rS = { score: S.score, level: ui(S.level) };
  const delta = Math.round(rA.score - rS.score);
  const lever = LEVERS.map((k, i) => ({ k, gain: Math.round(rA.score - lev[i].score) })).sort((a, b) => b.gain - a.gain)[0];
  const suggest = () => setSafer({ ...sv, speed: 1.0, distance: Math.max(r1(actual.distance), 6) });

  return (
    <div>
      <ScreenTitle eyebrow="Simulate · scenario-based counterfactual" title="What-if safety analysis"
        sub={`Starting from ${whatIfPreset?.eventId || preset.eventId ? `event ${whatIfPreset?.eventId ?? preset.eventId}` : 'the live situation'}. Every value below is re-scored by the trained safety model.`}
        right={<Disclaimer />} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        <Side title="Actual" tone="actual" s={actual} r={rA} t={t} />
        <div className="flex lg:flex-col items-center justify-center gap-3 py-2">
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-line" />
          <div className="font-display text-sm font-semibold tracking-[0.2em] text-ink3">VERSUS</div>
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-line" />
        </div>
        <Side title="Safer scenario" tone="safer" s={sv} r={rS} t={t} loading={model.loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mt-4">
        <Panel className="xl:col-span-7">
          <PanelHeader title="Adjust the safer scenario" icon={GitCompareArrows}
            right={<div className="flex gap-2">
              <button className="btn btn-assist h-10 px-3" onClick={suggest}><Wand2 size={16} />Suggest</button>
              <button className="btn h-10 px-3" onClick={() => setSafer(null)} aria-label="Reset"><RotateCcw size={16} /></button>
            </div>} />
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
            <ScenarioSlider id="wi-speed" label={t('f.speed')} unit="km/h" min={0} max={12} step={0.5} value={sv.speed} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer({ ...sv, speed: v })} />
            <ScenarioSlider id="wi-dist" label={t('f.distance')} unit="m" min={0.5} max={10} step={0.5} value={sv.distance} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer({ ...sv, distance: v })} />
            <ScenarioSlider id="wi-load" label={t('f.load')} unit="%" min={0} max={100} step={1} value={sv.load} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer({ ...sv, load: v })} />
            <ScenarioSlider id="wi-slope" label={t('f.slope')} unit="°" min={0} max={25} step={1} value={sv.slope} color={LEVEL_COLOR[rS.level]} onChange={(v) => setSafer({ ...sv, slope: v })} />
          </div>
          {warnings.length > 0 && <div className="mt-3 rounded-md border border-caution/50 bg-caution/10 p-3 text-sm text-caution">{warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>}
        </Panel>
        <Panel className="xl:col-span-5">
          <PanelHeader title="Simulated difference" />
          <div className="flex items-end gap-3">
            <div className={cx('font-display text-[64px] leading-none font-semibold', delta > 0 ? 'text-safe' : delta < 0 ? 'text-critical' : 'text-ink')}>
              {delta > 0 ? '−' : delta < 0 ? '+' : ''}<AnimatedNumber value={Math.abs(delta)} />
            </div>
            <div className="pb-2 text-ink2">risk points<br /><span className="text-xs text-ink3">{Math.round(rA.score)} → {Math.round(rS.score)}</span></div>
          </div>
          {delta > 0 && lever.gain > 0 && (
            <p className="mt-4 flex gap-2 text-[15px]"><ArrowDown size={18} className="text-assist shrink-0 mt-0.5" />
              <span>The biggest single lever is <b className="text-assist">{t(lever.k === 'slope' ? 'f.slope' : `f.${lever.k}`)}</b> — changing only that removes {lever.gain} points.</span>
            </p>
          )}
          <SpeedCurve actual={actual} safer={sv} curveA={curveA} curveS={curveS} rA={rA} rS={rS} />
        </Panel>
      </div>
    </div>
  );
}

function Side({ title, tone, s, r, t, loading }) {
  const isActual = tone === 'actual';
  return (
    <motion.div layout className={cx('panel overflow-hidden', isActual ? '' : 'border-assist/50')}>
      <div className="p-5 pb-3 flex items-center justify-between">
        <h2 className={cx('font-display text-2xl font-semibold tracking-[0.08em] uppercase', !isActual && 'text-assist')}>{title}</h2>
        <StatusPill level={isActual ? 'neutral' : 'assist'} pulse={loading}>{isActual ? 'Recorded' : loading ? 'Scoring…' : 'Simulated'}</StatusPill>
      </div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)] gap-3 px-5 pb-5">
        <div className="relative tech-grid rounded-md border border-line aspect-square max-w-full">
          <MachinePlan worker={workerAt(s.distance)} distance={s.distance} level={r.level} compact className="absolute inset-0 w-full h-full" extent={9} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex justify-center"><ArcGauge value={Math.round(r.score)} level={r.level} size={160} label={t('lvl.short.' + r.level)} /></div>
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

/** Risk as a function of speed (model scores at 0.5 km/h steps), holding each scenario's other inputs. */
function SpeedCurve({ actual, safer, curveA, curveS, rA, rS }) {
  const W = 400, H = 120;
  const x = (v) => 30 + (v / 12) * (W - 40);
  const y = (r) => H - 18 - (r / 100) * (H - 30);
  const curve = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(SPEEDS[i])} ${y(p.score)}`).join(' ');
  return (
    <div className="mt-5">
      <div className="label mb-1">Risk vs speed (safety model)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Risk versus speed for both scenarios">
        {[0, 50, 100].map((r) => <g key={r}><line x1="30" x2={W - 10} y1={y(r)} y2={y(r)} stroke="#2a3139" /><text x="24" y={y(r) + 3} textAnchor="end" fill="#838e99" style={{ font: '10px "JetBrains Mono", ui-monospace, monospace' }}>{r}</text></g>)}
        {[0, 4, 8, 12].map((v) => <text key={v} x={x(v)} y={H - 4} textAnchor="middle" fill="#838e99" style={{ font: '10px "JetBrains Mono", ui-monospace, monospace' }}>{v}</text>)}
        <rect x={x(4.3)} y={y(100)} width={x(12) - x(4.3)} height={y(0) - y(100)} fill="#f2b53a" opacity=".05" />
        <text x={x(4.4)} y={y(96)} fill="#f2b53a" style={{ font: '9px "JetBrains Mono", ui-monospace, monospace' }}>outside training range (excavator)</text>
        <path d={curve(curveA)} fill="none" stroke="#a9b2bc" strokeWidth="1.5" />
        <path d={curve(curveS)} fill="none" stroke="#56c7db" strokeWidth="2" strokeDasharray="5 4" />
        <circle cx={x(actual.speed)} cy={y(rA.score)} r="5" fill="#e9edf0" />
        <circle cx={x(safer.speed)} cy={y(rS.score)} r="5" fill="#56c7db" />
      </svg>
      <div className="flex gap-4 text-xs text-ink2"><span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-ink2" />Actual conditions</span><span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-assist" />Safer scenario</span><span className="text-ink3">km/h →</span></div>
    </div>
  );
}
