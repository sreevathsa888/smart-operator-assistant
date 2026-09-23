import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, PlayCircle, Clock, BarChart2, Target, CheckCircle2, Sparkles, ArrowRight, Award } from 'lucide-react';
import { Panel, ScreenTitle, StatusPill, cx } from '../components/ui/index.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';
import Microlearning from './Microlearning.jsx';

const CATS = ['All', 'Safety', 'Efficiency', 'Emergency', 'Machine Operation', 'Fuel Management'];

export default function TrainingHub({ nav, operatorId, dataVersion, refresh }) {
  const { t, lang } = useI18n();
  const [cat, setCat] = useState('All');
  const [playing, setPlaying] = useState(null);
  const q = useApi(() => api.training(operatorId), [operatorId, dataVersion]);
  const title = (m) => (m.titleKey ? t(m.titleKey) : m.title_i18n?.[lang] ?? m.title);
  const start = (m) => (m.kind === 'sim' && m.id !== 'blind' ? nav('simulator') : setPlaying(m));

  if (playing) return <Microlearning module={playing} title={title(playing)} operatorId={operatorId}
    onExit={() => { setPlaying(null); q.reload(true); }} onCompleted={() => { refresh?.(); }} />;
  if (!q.data) return <ApiState loading={q.loading} error={q.error} data={q.data} onRetry={q.reload} rows={3} label="Loading training" />;

  const trainingModules = q.data.modules;
  const rec = trainingModules.filter((m) => m.status === 'recommended');
  const all = trainingModules.filter((m) => cat === 'All' || m.cat === cat);
  const done = trainingModules.filter((m) => m.status === 'completed').length;

  return (
    <div>
      <ScreenTitle eyebrow="Learn" title={t('train.title')} sub={t('train.sub')}
        right={<div className="flex items-center gap-4 panel px-4 py-3">
          <Award size={28} className="text-assist" />
          <div><div className="label">Safety academy</div><div className="num">{done}/{trainingModules.length} modules</div></div>
          <div className="w-24 h-1.5 bg-bg3 rounded-sm"><div className="h-full bg-assist rounded-sm" style={{ width: `${(done / trainingModules.length) * 100}%` }} /></div>
        </div>} />

      <section aria-labelledby="rec">
        <div className="flex items-end justify-between mb-3">
          <div><h2 id="rec" className="ptitle">{t('train.rec')}</h2><p className="text-sm text-ink2 mt-1">{t('train.based')}: {q.data.summary.length ? q.data.summary.join(' · ') : 'no triggers — nothing urgent.'}</p></div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {rec.map((m, i) => (
            <motion.article key={m.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="panel overflow-hidden flex flex-col group">
              <div className="relative aspect-[16/9] bg-bg0 overflow-hidden">
                <Thumb id={m.id} />
                <div className="absolute top-3 left-3 flex gap-2">
                  <StatusPill level="assist">{m.kind === 'sim' ? 'Simulation' : 'Micro-video'}</StatusPill>
                </div>
                <div className="absolute bottom-3 right-3 num text-xs bg-bg1/90 border border-line rounded-sm px-2 py-1">{m.dur}</div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-caution text-xs font-semibold tracking-[0.12em] uppercase"><Sparkles size={14} />Recommended</div>
                <h3 className="font-display text-2xl font-semibold uppercase tracking-wide mt-1">{title(m)}</h3>
                <p className="text-sm text-ink2 mt-1">Because: {m.reason}</p>
                <Meta m={m} />
                {m.progress > 0 && <div className="mt-3 h-1.5 bg-bg3 rounded-sm"><div className="h-full bg-assist rounded-sm" style={{ width: `${m.progress}%` }} /></div>}
                <div className="mt-auto pt-5 grid gap-2">
                  {m.id === 'blind' ? (
                    <>
                      <button onClick={() => setPlaying(m)} className="btn btn-primary w-full"><PlayCircle size={18} />Watch · {m.dur}</button>
                      <button onClick={() => nav('simulator')} className="btn btn-assist w-full"><Gamepad2 size={18} />Practice in 3D simulator</button>
                    </>
                  ) : (
                    <button onClick={() => start(m)} className="btn btn-primary w-full">
                      {m.kind === 'sim' ? <Gamepad2 size={18} /> : <PlayCircle size={18} />}{m.progress > 0 ? 'Resume' : m.kind === 'sim' ? 'Start simulation' : `Watch · ${m.dur}`}
                    </button>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section aria-labelledby="all" className="mt-8">
        <h2 id="all" className="ptitle mb-3">All training</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={cx('chip shrink-0', cat === c && 'chip-on')}>{c}</button>)}
        </div>
        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 mt-3">
          <AnimatePresence>
            {all.map((m) => (
              <motion.button layout key={m.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                onClick={() => start(m)} className="panel text-left p-4 flex gap-4 items-center hover:border-ctl transition-colors min-h-[96px]">
                <div className="w-20 h-20 rounded-md bg-bg0 border border-line overflow-hidden shrink-0 relative"><Thumb id={m.id} small /></div>
                <div className="min-w-0 flex-1">
                  <div className="label">{m.cat}</div>
                  <div className="font-semibold leading-snug mt-0.5">{title(m)}</div>
                  <div className="flex items-center gap-3 text-xs text-ink3 mt-1.5">
                    <span className="flex items-center gap-1">{m.kind === 'sim' ? <Gamepad2 size={12} /> : <PlayCircle size={12} />}{m.dur}</span>
                    <span>{m.difficulty}</span>
                  </div>
                </div>
                <StatusBadge m={m} />
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>
    </div>
  );
}

function Meta({ m }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
      <div><div className="label flex items-center gap-1"><Clock size={11} />Duration</div><div className="num mt-0.5">{m.dur}</div></div>
      <div><div className="label flex items-center gap-1"><BarChart2 size={11} />Level</div><div className="mt-0.5">{m.difficulty}</div></div>
      <div><div className="label flex items-center gap-1"><Target size={11} />Skill</div><div className="mt-0.5">{m.skill}</div></div>
    </div>
  );
}

function StatusBadge({ m }) {
  if (m.status === 'completed') return <CheckCircle2 size={22} className="text-safe shrink-0" aria-label="Completed" />;
  if (m.status === 'recommended') return <Sparkles size={20} className="text-caution shrink-0" aria-label="Recommended" />;
  if (m.progress > 0) return <span className="num text-xs text-assist shrink-0">{m.progress}%</span>;
  return <ArrowRight size={18} className="text-ink3 shrink-0" />;
}

/** Animated SVG thumbnails — each tells its module's story in a 4-second loop. */
function Thumb({ id, small }) {
  const common = 'absolute inset-0 w-full h-full';
  if (id === 'blind') return (
    <svg viewBox="0 0 160 90" className={common} aria-hidden>
      <rect width="160" height="90" fill="#0f1317" />
      <g transform="translate(80 48)">
        <path d="M0 0 L-44 30 A53 53 0 0 1 -53 -4 Z" fill="#ff5a52" opacity=".16" />
        <circle r="26" fill="none" stroke="#ff5a52" strokeOpacity=".6" strokeDasharray="3 3" />
        <circle r="44" fill="none" stroke="#46505b" strokeDasharray="2 3" />
        <rect x="-8" y="-10" width="16" height="20" rx="3" fill="#c99a2e" />
        <rect x="-2" y="-30" width="4" height="22" fill="#b98c2a" />
        <g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" /><path d="M0 0 L0 -44 A44 44 0 0 1 22 -38 Z" fill="#56c7db" opacity=".2" /></g>
        <circle r="3.5" fill="#f2b53a"><animate attributeName="cx" values="-58;-24;-58" dur="4s" repeatCount="indefinite" /><animate attributeName="cy" values="22;14;22" dur="4s" repeatCount="indefinite" /></circle>
      </g>
    </svg>
  );
  if (id === 'idle' || id === 'eco' || id === 'refuel') return (
    <svg viewBox="0 0 160 90" className={common} aria-hidden>
      <rect width="160" height="90" fill="#0f1317" />
      <g transform="translate(80 58)">
        <path d="M-34 0 A34 34 0 0 1 34 0" fill="none" stroke="#1d2228" strokeWidth="8" />
        <path d="M-34 0 A34 34 0 0 1 34 0" fill="none" stroke="#56c7db" strokeWidth="8" pathLength="100" strokeDasharray="100 100">
          <animate attributeName="stroke-dashoffset" values="0;60;0" dur="4s" repeatCount="indefinite" />
        </path>
        <line x1="0" y1="0" x2="0" y2="-28" stroke="#e9edf0" strokeWidth="2.5"><animateTransform attributeName="transform" type="rotate" values="-70;30;-70" dur="4s" repeatCount="indefinite" /></line>
        <circle r="4" fill="#e9edf0" />
      </g>
    </svg>
  );
  if (id === 'slope' || id === 'rollover' || id === 'trench') return (
    <svg viewBox="0 0 160 90" className={common} aria-hidden>
      <rect width="160" height="90" fill="#0f1317" />
      <path d="M0 80 L160 46 L160 90 L0 90 Z" fill="#2b2620" />
      <g><animateTransform attributeName="transform" type="translate" values="30 62; 90 50; 30 62" dur="4s" repeatCount="indefinite" />
        <g transform="rotate(-12)">
          <rect x="-18" y="-6" width="36" height="8" rx="4" fill="#23282e" stroke="#46505b" />
          <rect x="-14" y="-20" width="24" height="14" rx="2" fill="#c99a2e" />
          <rect x="4" y="-30" width="4" height="14" fill="#b98c2a" transform="rotate(40 6 -20)" />
        </g>
      </g>
      <text x="126" y="24" fill="#f2b53a" style={{ font: '500 10px "JetBrains Mono", ui-monospace, monospace' }}>12°</text>
    </svg>
  );
  // generic: pulsing ring + machine
  return (
    <svg viewBox="0 0 160 90" className={common} aria-hidden>
      <rect width="160" height="90" fill="#0f1317" />
      <circle cx="80" cy="45" r="18" fill="none" stroke="#56c7db" strokeOpacity=".5"><animate attributeName="r" values="12;34;12" dur="4s" repeatCount="indefinite" /><animate attributeName="stroke-opacity" values=".7;0;.7" dur="4s" repeatCount="indefinite" /></circle>
      <rect x="72" y="36" width="16" height="18" rx="3" fill="#c99a2e" />
      <rect x="78" y="20" width="4" height="18" fill="#b98c2a" />
    </svg>
  );
}
