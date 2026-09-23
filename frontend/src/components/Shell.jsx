import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Gauge, ListChecks, ShieldAlert, UserRound, GraduationCap, Box, History, GitCompareArrows, BarChart3,
  Languages, Zap, Clock,
} from 'lucide-react';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import { useClock } from '../hooks/useTelemetry.js';
import { cx } from './ui/index.jsx';
import { LEVEL_COLOR } from '../lib/risk.js';

export const ROUTES = [
  { id: 'overview', key: 'nav.overview', icon: LayoutDashboard },
  { id: 'machine', key: 'nav.machine', icon: Gauge },
  { id: 'tasks', key: 'nav.tasks', icon: ListChecks },
  { id: 'safety', key: 'nav.safety', icon: ShieldAlert, stage: 'PREDICT · EXPLAIN' },
  { id: 'twin', key: 'nav.twin', icon: UserRound },
  { id: 'training', key: 'nav.training', icon: GraduationCap, stage: 'LEARN' },
  { id: 'simulator', key: 'nav.sim', icon: Box, stage: 'SIMULATE' },
  { id: 'replay', key: 'nav.replay', icon: History },
  { id: 'whatif', key: 'nav.whatif', icon: GitCompareArrows },
  { id: 'analytics', key: 'nav.analytics', icon: BarChart3 },
];

export function Sidebar({ route, onNav, riskLevel }) {
  const { t } = useI18n();
  return (
    <nav aria-label="Primary" className="hidden md:flex flex-col shrink-0 w-[88px] xl:w-[232px] bg-bg1 border-r border-line h-full">
      <div className="h-16 flex items-center gap-3 px-4 xl:px-5 border-b border-line">
        <Logo />
        <div className="hidden xl:block leading-tight">
          <div className="font-display font-semibold tracking-[0.14em] text-[15px] whitespace-nowrap">OPERATOR ASSIST</div>
          <div className="text-[9px] tracking-[0.12em] text-ink3 font-semibold whitespace-nowrap">PREDICT → EXPLAIN → SIMULATE → LEARN</div>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto py-3 px-2 xl:px-3 space-y-1">
        {ROUTES.map((r) => {
          const on = route === r.id;
          const Icon = r.icon;
          return (
            <li key={r.id}>
              <button onClick={() => onNav(r.id)} aria-current={on ? 'page' : undefined}
                className={cx('relative w-full min-h-[48px] flex flex-col xl:flex-row items-center gap-1 xl:gap-3 px-2 xl:px-3 py-2 rounded-md text-left transition-colors',
                  on ? 'bg-bg3 text-ink' : 'text-ink2 hover:bg-bg3/60 hover:text-ink')}>
                {on && <motion.span layoutId="navbar" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-ink" />}
                <Icon size={20} strokeWidth={1.75} />
                <span className="text-[10px] xl:text-[15px] font-medium text-center xl:text-left leading-tight flex-1">{t(r.key)}</span>
                {r.id === 'safety' && (
                  <span className={cx('absolute xl:static top-2 right-3 w-2 h-2 rounded-full', riskLevel !== 'low' && 'zone-pulse')} style={{ background: LEVEL_COLOR[riskLevel] }} aria-label={`risk ${riskLevel}`} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line p-3 xl:p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-bg3 border border-line flex items-center justify-center font-display font-semibold text-sm shrink-0">07</div>
        <div className="hidden xl:block leading-tight">
          <div className="num text-sm">OP1007</div>
          <div className="text-xs text-ink3">{t('op.role')}</div>
          <div className="text-xs text-safe flex items-center gap-1 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-safe" />{t('op.onduty')}</div>
        </div>
      </div>
    </nav>
  );
}

/** Bottom nav for narrow tablets / phones */
export function MobileNav({ route, onNav }) {
  const { t } = useI18n();
  return (
    <nav aria-label="Primary" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-bg1/95 backdrop-blur border-t border-line overflow-x-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <ul className="flex">
        {ROUTES.map((r) => {
          const Icon = r.icon; const on = route === r.id;
          return (
            <li key={r.id} className="shrink-0">
              <button onClick={() => onNav(r.id)} className={cx('w-[76px] h-16 flex flex-col items-center justify-center gap-1', on ? 'text-ink' : 'text-ink3')}>
                <Icon size={20} strokeWidth={1.75} />
                <span className="text-[10px] leading-tight text-center px-1">{t(r.key)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Header({ route, onDemo, phase }) {
  const { t, lang, setLang } = useI18n();
  const now = useClock();
  const [open, setOpen] = useState(false);
  const r = ROUTES.find((x) => x.id === route);
  return (
    <header className="h-16 shrink-0 flex items-center gap-3 px-4 lg:px-6 border-b border-line bg-bg1/80 backdrop-blur sticky top-0 z-20">
      <div className="md:hidden"><Logo /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] tracking-[0.16em] font-semibold text-ink3 truncate">EXC-204 · EXCAVATOR · RIVERSIDE INTERCHANGE</div>
        <div className="font-display text-lg font-semibold tracking-[0.06em] uppercase truncate">{t(r.key)}</div>
      </div>
      <div className="hidden lg:flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-bg2 border border-line">
          <span className="w-2 h-2 rounded-full bg-safe" /> <span className="font-semibold tracking-wider text-xs uppercase">{t('hdr.online')}</span>
        </span>
        <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-bg2 border border-line">
          <Clock size={14} className="text-ink3" />
          <span className="num">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span className="text-ink3 text-xs">· {t('hdr.shift')}</span>
        </span>
      </div>
      <div className="relative">
        <button className="btn h-10 px-3" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
          <Languages size={16} /> <span className="normal-case tracking-normal">{LANGS.find((l) => l.id === lang).label}</span>
        </button>
        {open && (
          <ul role="listbox" className="absolute right-0 mt-2 w-44 panel p-1 z-40">
            {LANGS.map((l) => (
              <li key={l.id}>
                <button role="option" aria-selected={lang === l.id} onClick={() => { setLang(l.id); setOpen(false); }}
                  className={cx('w-full h-11 px-3 rounded-md text-left flex items-center justify-between hover:bg-bg3', lang === l.id && 'bg-bg3')}>
                  <span>{l.label}</span>{(l.id === 'hi' || l.id === 'te') && <span className="text-[10px] text-ink3 tracking-wider">PARTIAL</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn h-10 px-3 border-caution/70 text-caution hover:bg-caution/10" onClick={onDemo} disabled={phase === 'approach' || phase === 'alert'}
        title="Simulate a worker entering the restricted zone">
        <Zap size={16} /> <span className="hidden sm:inline">{t('hdr.demo')}</span>
      </button>
    </header>
  );
}

function Logo() {
  // Abstract mark: machine footprint inside a zone ring (original, not a manufacturer logo)
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="#1d2228" stroke="#2a3139" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#56c7db" strokeWidth="1.5" strokeDasharray="2 2.2" />
      <rect x="12" y="11" width="8" height="10" rx="1.5" fill="#e9edf0" />
      <rect x="15" y="5" width="2" height="7" rx="1" fill="#e9edf0" />
    </svg>
  );
}
