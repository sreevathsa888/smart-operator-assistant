import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Radar, Map, Zap, Eye, History, CheckCircle2 } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, RiskRadar, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { InterventionAlert, WhyPanel } from '../components/InterventionAlert.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LEVEL_COLOR } from '../lib/risk.js';

export default function SafetyCenter({ live, takeAction, simulateSafer, nav }) {
  const { t } = useI18n();
  const lvl = live.risk.level;
  const col = LEVEL_COLOR[lvl];
  const s = live.state;
  const hist = useRiskHistory(live.risk.score);
  const active = live.phase === 'alert' || live.phase === 'approach' || live.phase === 'resolved';
  const axisLabels = ['f.proximity', 'f.terrain', 'f.speed', 'f.load', 'f.machine', 'f.environment'].map(t);

  return (
    <div>
      <ScreenTitle eyebrow="Predict · Explain" title="Smart Safety Center"
        sub="Risk is predicted every 500 ms from proximity, terrain, speed, load, machine state and environment."
        right={<button className="btn border-caution/70 text-caution hover:bg-caution/10" onClick={live.trigger} disabled={live.phase === 'approach' || live.phase === 'alert'}><Zap size={16} />Run proximity event</button>} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
        {/* Current risk */}
        <Panel className={cx('xl:col-span-4 relative overflow-hidden transition-shadow', lvl === 'high' && 'border-critical/60')}>
          <div className="absolute inset-0 pointer-events-none transition-colors duration-700" style={{ background: `radial-gradient(500px 240px at 0% 0%, ${col}22, transparent 70%)` }} />
          <div className="relative">
            <PanelHeader title="Current risk" icon={ShieldAlert} right={<StatusPill level={active ? 'assist' : 'safe'} pulse={active}>{active ? 'Event live' : 'Monitoring'}</StatusPill>} />
            <AnimatePresence mode="wait">
              <motion.div key={lvl} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
                className="font-display font-bold leading-[0.9] tracking-[0.02em]" style={{ color: col, fontSize: 'clamp(64px, 7vw, 96px)' }}>
                {t('lvl.short.' + lvl)}
              </motion.div>
            </AnimatePresence>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="num text-3xl"><AnimatedNumber value={live.risk.score} /></span>
              <span className="text-ink3 num">/100 predicted risk</span>
            </div>
            <RiskScale score={live.risk.score} />
            <div className="label mt-6 mb-1 flex justify-between"><span>Risk trajectory</span><span className="text-assist">- - forecast 10 s</span></div>
            <Trajectory hist={hist} col={col} />
          </div>
        </Panel>

        {/* Radar */}
        <Panel className="xl:col-span-4 flex flex-col">
          <PanelHeader title="Risk radar" icon={Radar} right={<span className="text-xs text-ink3 flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-ink3" />baseline</span>} />
          <div className="flex-1 flex items-center justify-center">
            <RiskRadar axes={live.axes} ghost={live.prevAxes} level={lvl} size={340} labels={axisLabels} />
          </div>
        </Panel>

        {/* Zone map */}
        <Panel className="md:col-span-2 xl:col-span-4 !p-0 overflow-hidden flex flex-col">
          <div className="p-5 pb-0"><PanelHeader title="Zone map" icon={Map} right={<span className="num text-sm">{s.distance.toFixed(1)} m</span>} /></div>
          <div className="relative flex-1 min-h-[320px] tech-grid">
            <MachinePlan worker={s.worker} distance={s.distance} level={lvl} speed={s.speed} load={s.load} className="absolute inset-0 h-full" />
          </div>
        </Panel>

        {/* Intervention + explanation */}
        <div className="md:col-span-2 xl:col-span-7">
          <AnimatePresence mode="wait">
            {live.phase === 'alert' || live.phase === 'resolved' ? (
              <motion.div key="alert" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                <InterventionAlert variant="inline" scenario={s} risk={live.risk} resolved={live.phase === 'resolved'} onTake={takeAction} onSimulate={simulateSafer} onDismiss={live.dismiss} />
              </motion.div>
            ) : (
              <motion.div key="calm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Panel className="h-full">
                  <PanelHeader title="Intervention" icon={Eye} right={<StatusPill level={live.phase === 'approach' ? 'medium' : 'safe'} pulse={live.phase === 'approach'}>{live.phase === 'approach' ? 'Risk rising' : 'No action needed'}</StatusPill>} />
                  {live.phase === 'approach' ? (
                    <p className="text-lg">A worker is approaching the rear-left blind zone. <span className="text-caution">Predicted to enter the restricted zone in ~2 s.</span></p>
                  ) : (
                    <>
                      <p className="text-lg text-ink">Conditions are within safe limits.</p>
                      <p className="text-ink2 mt-1">The assistant will intervene here — with reasons and a recommended action — when predicted risk crosses MEDIUM. Try <button onClick={live.trigger} className="text-caution underline underline-offset-4">Run proximity event</button>.</p>
                    </>
                  )}
                  <div className="grid sm:grid-cols-3 gap-3 mt-5">
                    <Guard k="Restricted zone" v="3.0 m" />
                    <Guard k="Proximity zone" v="6.0 m" />
                    <Guard k="Max speed near workers" v="3.0 km/h" />
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="md:col-span-2 xl:col-span-5 space-y-4">
          <WhyPanel contributions={live.risk.contributions} />
          <Panel>
            <PanelHeader title="Recent interventions" icon={History} right={<button className="text-sm text-assist" onClick={() => nav('replay')}>Open replay →</button>} />
            <ul className="divide-y divide-line">
              {[
                ['17 Sep · 14:32', 'Proximity — worker 1.9 m, rear-left', 'high', 'Stopped in 3 s'],
                ['15 Sep · 09:11', 'Slope 14° with bucket raised', 'medium', 'Load lowered'],
                ['12 Sep · 11:47', 'Speed 7.4 km/h near barrier line', 'medium', 'Speed reduced'],
              ].map(([when, what, l, out]) => (
                <li key={when} className="py-2.5 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LEVEL_COLOR[l] }} />
                  <div className="min-w-0 flex-1"><div className="text-sm truncate">{what}</div><div className="num text-xs text-ink3">{when}</div></div>
                  <span className="text-xs text-safe flex items-center gap-1 shrink-0"><CheckCircle2 size={14} />{out}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Guard({ k, v }) {
  return <div className="rounded-md bg-bg3/60 border border-line p-3"><div className="label">{k}</div><div className="num text-lg mt-1">{v}</div></div>;
}

function RiskScale({ score }) {
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-sm overflow-hidden flex">
        <div className="bg-safe/70" style={{ width: '35%' }} /><div className="bg-caution/70" style={{ width: '27%' }} /><div className="bg-critical/70" style={{ width: '38%' }} />
      </div>
      <div className="relative h-3">
        <motion.div className="absolute -top-3.5 w-1 h-5 rounded-full bg-ink shadow" initial={false} animate={{ left: `calc(${score}% - 2px)` }} transition={{ duration: 0.6 }} />
      </div>
      <div className="flex justify-between label -mt-1"><span>Low</span><span>Medium</span><span>High</span></div>
    </div>
  );
}

function useRiskHistory(score) {
  const [h, setH] = useState(() => Array.from({ length: 40 }, () => score));
  const ref = useRef(score); ref.current = score;
  useEffect(() => { const id = setInterval(() => setH((p) => [...p.slice(1), ref.current]), 500); return () => clearInterval(id); }, []);
  return h;
}

function Trajectory({ hist, col }) {
  const W = 320, H = 90, n = hist.length, fN = 12;
  const x = (i) => (i / (n + fN - 1)) * W;
  const y = (v) => H - 6 - (v / 100) * (H - 12);
  const d = hist.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const slope = (hist[n - 1] - hist[n - 6]) / 5;
  const f = Array.from({ length: fN }, (_, k) => Math.max(0, Math.min(100, hist[n - 1] + slope * (k + 1) * 0.8)));
  const fd = [`M${x(n - 1)} ${y(hist[n - 1])}`, ...f.map((v, k) => `L${x(n + k)} ${y(v)}`)].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Risk trajectory">
      {[35, 62].map((th) => <line key={th} x1="0" x2={W} y1={y(th)} y2={y(th)} stroke={th === 35 ? '#f2b53a' : '#ff5a52'} strokeOpacity=".35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
      <path d={`${d} L${x(n - 1)} ${H} L0 ${H} Z`} fill={col} fillOpacity=".1" />
      <path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={fd} fill="none" stroke="#56c7db" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <line x1={x(n - 1)} x2={x(n - 1)} y1="0" y2={H} stroke="#46505b" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
