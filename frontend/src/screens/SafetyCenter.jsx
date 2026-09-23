import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Radar, Map, Zap, Eye, History, CheckCircle2 } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, RiskRadar, ScreenTitle, AnimatedNumber, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { InterventionAlert, WhyPanel } from '../components/InterventionAlert.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LEVEL_COLOR, isHigh, ui } from '../lib/risk.js';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';

export default function SafetyCenter({ live, takeAction, simulateSafer, nav, operatorId, dataVersion }) {
  const { t } = useI18n();
  const meta = useApi(() => api.meta(), []);
  const events = useApi(() => api.events(operatorId, 5), [operatorId, dataVersion, live.eventId]);
  if (!live.ready) return <ApiState loading error={live.error} onRetry={live.retry} rows={3} />;
  const lvl = live.risk.level;
  const col = LEVEL_COLOR[lvl];
  const s = live.state;
  const cuts = meta.data?.alert_cuts ?? [27, 52, 72];
  const active = live.phase !== 'normal';
  const showAlert = ['alert', 'resolving', 'resolved'].includes(live.phase);
  const axisLabels = ['f.proximity', 'f.terrain', 'f.speed', 'f.load', 'f.machine', 'f.environment'].map(t);

  return (
    <div>
      <ScreenTitle eyebrow="Predict · Explain" title="Smart Safety Center"
        sub="Risk is predicted every 500 ms by the trained safety model from proximity, terrain, speed, load, machine state and environment."
        right={<button className="btn border-caution/70 text-caution hover:bg-caution/10" onClick={live.trigger} disabled={live.phase !== 'normal'}><Zap size={16} />Run proximity event</button>} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
        {/* Current risk */}
        <Panel className={cx('xl:col-span-4 relative overflow-hidden transition-shadow', isHigh(lvl) && 'border-critical/60')}>
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
              <span className="text-ink3 num">/100 current risk</span>
            </div>
            <div className="num text-sm mt-1" style={{ color: LEVEL_COLOR[live.predicted.level] }}>{t('alert.predicted')}: {Math.round(live.predicted.score)} · {t('lvl.short.' + live.predicted.level)}</div>
            <RiskScale score={live.risk.score} cuts={cuts} t={t} />
            <div className="label mt-6 mb-1 flex justify-between"><span>Risk trajectory · last 30 s</span><span className="text-assist">- - model forecast +5 s</span></div>
            <Trajectory hist={live.riskHist} predicted={live.predicted.score} col={col} cuts={cuts} />
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
            {showAlert ? (
              <motion.div key="alert" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                <InterventionAlert variant="inline" scenario={s} risk={live.risk} predicted={live.predicted} alert={live.alert} phase={live.phase} onTake={takeAction} onSimulate={simulateSafer} onDismiss={live.dismiss} />
              </motion.div>
            ) : (
              <motion.div key="calm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Panel className="h-full">
                  <PanelHeader title="Intervention" icon={Eye} right={<StatusPill level={active ? 'medium' : 'safe'} pulse={active}>{active ? 'Risk rising' : 'No action needed'}</StatusPill>} />
                  {active ? (
                    <p className="text-lg">A worker is approaching the machine ({s.distance.toFixed(1)} m).{' '}
                      {live.etaRestricted != null && <span className="text-caution">At the current closing rate they reach the 3 m restricted zone in ~{live.etaRestricted} s. </span>}
                      <span className="text-ink2">Forecast in 5 s: {Math.round(live.predicted.score)}/100.</span></p>
                  ) : (
                    <>
                      <p className="text-lg text-ink">Conditions are within safe limits.</p>
                      <p className="text-ink2 mt-1">The assistant intervenes here — with the model's reasons and a recommended action — when current risk reaches HIGH, or when the 5 s forecast reaches HIGH while current risk is already MEDIUM. Try <button onClick={live.trigger} className="text-caution underline underline-offset-4">Run proximity event</button>.</p>
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
            <ApiState loading={events.loading} error={events.error} data={events.data} onRetry={events.reload} empty="No interventions recorded yet." rows={2}>
              {(list) => (
                <ul className="divide-y divide-line">
                  {list.map((e) => (
                    <li key={e.event_id} className="py-2.5 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LEVEL_COLOR[ui(e.peak_level)] }} title={e.peak_level} />
                      <div className="min-w-0 flex-1"><div className="text-sm truncate">{e.summary}</div><div className="num text-xs text-ink3">{e.ts} · peak {Math.round(e.peak_score)} {e.peak_level}</div></div>
                      <Outcome e={e} />
                    </li>
                  ))}
                </ul>
              )}
            </ApiState>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Outcome({ e }) {
  if (e.action === 'stopped') return <span className="text-xs text-safe flex items-center gap-1 shrink-0"><CheckCircle2 size={14} />Stopped {e.response_s != null ? `in ${e.response_s} s` : ''}</span>;
  if (e.action === 'open') return <span className="text-xs text-caution shrink-0">Live</span>;
  if (e.action === 'dismissed') return <span className="text-xs text-caution shrink-0">Dismissed</span>;
  return <span className="text-xs text-critical shrink-0">{(e.incident_type || '').replace(/_/g, ' ')}</span>;
}

function Guard({ k, v }) {
  return <div className="rounded-md bg-bg3/60 border border-line p-3"><div className="label">{k}</div><div className="num text-lg mt-1">{v}</div></div>;
}

function RiskScale({ score, cuts, t }) {
  const [a, b, c] = cuts;
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-sm overflow-hidden flex">
        <div className="bg-safe/70" style={{ width: `${a}%` }} /><div className="bg-caution/70" style={{ width: `${b - a}%` }} />
        <div className="bg-elevated/70" style={{ width: `${c - b}%` }} /><div className="bg-critical/70" style={{ width: `${100 - c}%` }} />
      </div>
      <div className="relative h-3">
        <motion.div className="absolute -top-3.5 w-1 h-5 rounded-full bg-ink shadow" initial={false} animate={{ left: `calc(${score}% - 2px)` }} transition={{ duration: 0.6 }} />
      </div>
      <div className="relative h-4 label -mt-1">
        {[['low', 0], ['medium', a], ['high', b], ['critical', c]].map(([k, x]) => <span key={k} className="absolute" style={{ left: `${x}%` }}>{t('lvl.short.' + k)}</span>)}
      </div>
    </div>
  );
}

function Trajectory({ hist, predicted, col, cuts }) {
  const W = 320, H = 90, fN = 10;
  const data = hist.length ? hist : [0];
  const n = data.length, N = Math.max(n, 60);
  const x = (i) => (i / (N + fN - 1)) * W;
  const y = (v) => H - 6 - (v / 100) * (H - 12);
  const off = N - n;
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = data[n - 1];
  const fd = `M${x(N - 1)} ${y(last)} L${x(N - 1 + fN)} ${y(predicted ?? last)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Risk trajectory with model forecast">
      {cuts.map((th, i) => <line key={th} x1="0" x2={W} y1={y(th)} y2={y(th)} stroke={['#f2b53a', '#ff8a3d', '#ff5a52'][i]} strokeOpacity=".35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
      <path d={`${d} L${x(N - 1)} ${H} L${x(off)} ${H} Z`} fill={col} fillOpacity=".1" />
      <path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={fd} fill="none" stroke="#56c7db" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <line x1={x(N - 1)} x2={x(N - 1)} y1="0" y2={H} stroke="#46505b" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
