import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingDown, TrendingUp, Lightbulb, X, CheckCircle2, Sparkles } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { LEVEL_COLOR } from '../lib/risk.js';
import { cx } from './ui/index.jsx';

const FACTOR_KEY = { proximity: 'f.proximity', speed: 'f.speed', terrain: 'f.terrain', load: 'f.load', visibility: 'f.visibility', machine: 'f.machine', control: 'f.control' };

/** Explanation of predicted risk: sorted contribution bars + one-sentence summary. */
/** Model explanation: exact group-Shapley contributions from the backend (share of the risk increase vs typical safe operation). */
export function WhyPanel({ contributions = [], compact }) {
  const { t } = useI18n();
  const shown = contributions.filter((c) => c.pct > 0);
  const top = contributions[0];
  if (!top) return null;
  return (
    <div className={cx('rounded-lg border bg-bg2 p-5', compact ? 'border-assist/60 shadow-assist' : 'border-assist/40')}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-assist" />
        <h3 className="ptitle text-assist">{t('why.title')}</h3>
      </div>
      <ul className="space-y-3">
        {shown.map((c, i) => (
          <li key={c.key} className="grid grid-cols-[110px_1fr_48px] items-center gap-3">
            <span className="text-sm text-ink2 truncate">{t(FACTOR_KEY[c.key])}</span>
            <div className="h-3 rounded-sm bg-bg3 overflow-hidden">
              <motion.div className="h-full rounded-sm" style={{ background: i === 0 ? '#56c7db' : '#56c7db99' }}
                initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} transition={{ duration: 0.7, delay: 0.08 * i, ease: 'easeOut' }} />
            </div>
            <span className="num text-sm text-right">{c.pct}%</span>
          </li>
        ))}
      </ul>
      <p className={cx('mt-4 text-ink', compact ? 'text-sm' : 'text-[15px]')}>
        <span className="font-semibold text-assist">{t(FACTOR_KEY[top.key])}</span> {t('why.top')}
      </p>
    </div>
  );
}

/**
 * The intelligent intervention panel. `variant="overlay"` slides in from the right over any screen;
 * `variant="inline"` sits in the Safety Center grid.
 */
export function InterventionAlert({ scenario, risk, predicted, alert, phase, onTake, onDismiss, onSimulate, variant = 'overlay' }) {
  const { t, lang } = useI18n();
  const [why, setWhy] = useState(false);
  const s = scenario;
  if (!s || !risk) return null;
  const resolved = phase === 'resolving' || phase === 'resolved';
  const col = LEVEL_COLOR[risk.level];
  const top = alert?.top_factor ?? risk.contributions?.[0]?.key ?? 'proximity';
  const byKey = Object.fromEntries((risk.contributions ?? []).map((c) => [c.key, c]));
  const fmtV = (v) => (typeof v === 'number' ? +v.toFixed(1) : String(v).replace(/_/g, ' '));
  // English: the backend's sentence. Other languages: rebuilt from the model's structured value/reference/unit.
  const reasonText = (r) => {
    const c = byKey[r.key];
    if (lang === 'en' || !c || c.value == null) return r.text;
    return `${t(FACTOR_KEY[r.key] ?? r.key)} ${fmtV(c.value)}${c.unit ? ' ' + c.unit : ''} (${t('alert.typical')} ${fmtV(c.reference)}${c.unit ? ' ' + c.unit : ''})`;
  };
  const reasons = (risk.reasons ?? []).slice(0, 3);

  const body = (
    <div className={cx('rounded-lg border bg-bg2 overflow-hidden', resolved ? 'border-safe' : 'border-critical shadow-critical')}
      style={{ backgroundImage: `linear-gradient(${resolved ? '#3fd08a14' : '#ff5a521f'}, transparent 60%)` }}>
      {/* hazard stripe */}
      <div className="h-1.5" style={{ background: resolved ? '#3fd08a' : `repeating-linear-gradient(135deg, ${col} 0 10px, #15181c 10px 20px)` }} />
      <div className="p-5 lg:p-6">
        <div className="flex items-start gap-3">
          <div className={cx('w-11 h-11 rounded-md flex items-center justify-center shrink-0', resolved ? 'bg-safe/15 text-safe' : 'bg-critical/15 text-critical')}>
            {resolved ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} className="zone-pulse" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="label" style={{ color: resolved ? '#3fd08a' : col }}>
              {resolved ? `${t('alert.monitoring')} · ${Math.round(risk.score)}/100 ${t('lvl.short.' + risk.level)}` : `${t('alert.risklabel')} ${Math.round(risk.score)}/100 · ${t('lvl.short.' + risk.level)}`}
            </div>
            <h3 className="font-display text-2xl font-semibold tracking-[0.03em] uppercase mt-0.5 text-balance">
              {resolved ? t('alert.stopped') : t(alert?.title_key ?? 'alert.title.proximity')}
            </h3>
            <p className="text-ink2 mt-1">{resolved
              ? `Speed ${s.speed.toFixed(1)} km/h. Worker at ${s.distance.toFixed(1)} m — the assistant keeps predicting risk until they leave the zone.`
              : top === 'proximity' ? (s.distance < 3 ? t('alert.body') : t('alert.body.approach')) : `The safety model's strongest contributor is ${t(FACTOR_KEY[top]).toLowerCase()}.`}</p>
          </div>
          {variant === 'overlay' && (
            <button onClick={onDismiss} className="w-11 h-11 rounded-md hover:bg-bg3 flex items-center justify-center text-ink3 shrink-0" aria-label="Close">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="label mt-5">{t('alert.conditions')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Cond k={t('f.distance')} v={`${s.distance.toFixed(1)}`} u="m" warn={s.distance < 3} />
          <Cond k={t('f.speed')} v={`${s.speed.toFixed(1)}`} u="km/h" warn={s.speed > 5} />
          <Cond k={t('f.slope')} v={`${s.slope}`} u="°" warn={s.slope > 9} />
          <Cond k={t('f.load')} v={s.load > 80 ? 'HIGH' : s.load > 60 ? 'NORMAL' : 'LOW'} u={`${s.load}%`} warn={s.load > 80} />
        </div>

        {!resolved && (
          <>
            <div className="grid sm:grid-cols-2 gap-5 mt-5">
              <div>
                <div className="label">{t('alert.why')}</div>
                <ul className="mt-2 space-y-2 text-[15px]">
                  {reasons.map((r, i) => (
                    <li key={r.key} className="flex items-start gap-2">{r.key === 'proximity' || r.key === 'visibility'
                      ? <TrendingDown size={16} className={cx('shrink-0 mt-1', i === 0 ? 'text-critical' : 'text-caution')} />
                      : <TrendingUp size={16} className={cx('shrink-0 mt-1', i === 0 ? 'text-critical' : 'text-caution')} />}
                      <span>{reasonText(r)} <span className="num text-xs text-ink3">+{Math.round(r.points)}</span></span></li>
                  ))}
                  {predicted && <li className="flex items-center gap-2 text-sm text-ink2"><Sparkles size={14} className="text-assist shrink-0" />{t('alert.predicted')}: <b className="num" style={{ color: LEVEL_COLOR[predicted.level] }}>{Math.round(predicted.score)}</b></li>}
                </ul>
              </div>
              <div>
                <div className="label">{t('alert.action')}</div>
                <p className="mt-2 flex gap-2 font-semibold text-[17px] leading-snug"><Lightbulb size={18} className="text-assist shrink-0 mt-0.5" />{t(alert?.recommendation_key ?? 'rec.proximity')}</p>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {why && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                  <div className="pt-5"><WhyPanel contributions={risk.contributions} compact /></div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button className="btn btn-danger col-span-2" onClick={onTake}>{t('btn.take')}</button>
              <button className="btn btn-assist" onClick={() => setWhy((w) => !w)} aria-expanded={why}>{t('btn.why')}</button>
              <button className="btn btn-assist" onClick={onSimulate}>{t('btn.simulate')}</button>
              {variant === 'overlay' && <button className="btn col-span-2" onClick={onDismiss}>{t('btn.dismiss')}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (variant === 'inline') return body;
  return (
    <motion.aside role="alertdialog" aria-label={t('alert.title')}
      initial={{ x: 480, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="fixed z-50 right-3 left-3 sm:left-auto top-20 sm:w-[520px] max-h-[calc(100%-6rem)] overflow-y-auto">
      {body}
    </motion.aside>
  );
}

function Cond({ k, v, u, warn }) {
  return (
    <div className="rounded-md bg-bg3/70 border border-line px-3 py-2.5">
      <div className="label">{k}</div>
      <div className={cx('num text-xl mt-1', warn ? 'text-caution' : 'text-ink')}>{v}<span className="text-xs text-ink3 ml-1">{u}</span></div>
    </div>
  );
}
