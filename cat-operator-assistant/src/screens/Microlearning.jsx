import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Captions, Languages, Gauge, ArrowLeft, CheckCircle2, XCircle, Award } from 'lucide-react';
import MachinePlan from '../components/MachinePlan.jsx';
import { AnimatedNumber, cx } from '../components/ui/index.jsx';
import { useI18n, LANGS } from '../lib/i18n.jsx';

const DUR = 102; // 01:42
const CHAPTERS = [
  { t: 0, name: 'Blind zones', sub: 'sub.1' },
  { t: 20, name: 'Hidden worker', sub: 'sub.2' },
  { t: 40, name: 'Verify', sub: 'sub.3' },
  { t: 62, name: 'Stop', sub: 'sub.4' },
  { t: 82, name: 'Resume', sub: 'sub.5' },
];
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));

function sceneAt(t) {
  // worker path: from outside (rear-left) → into blind zone → restricted → back out
  let wx, wy;
  if (t < 20) { wx = -7.5; wy = 6.5; }
  else if (t < 40) { const k = (t - 20) / 20; wx = lerp(-7.5, -4.2, k); wy = lerp(6.5, 3.6, k); }
  else if (t < 62) { const k = (t - 40) / 22; wx = lerp(-4.2, -2.6, k); wy = lerp(3.6, 2.0, k); }
  else if (t < 82) { wx = -2.6; wy = 2.0; }
  else { const k = (t - 82) / 20; wx = lerp(-2.6, -7.5, k); wy = lerp(2.0, 6.5, k); }
  const d = Math.max(0, Math.hypot(wx, wy) - 1.6);
  const level = d < 2 ? 'high' : d < 4 ? 'medium' : 'low';
  const stopped = t >= 62 && t < 90;
  return { worker: { x: wx, y: wy }, d, level, stopped, scan: t >= 40 && t < 62 };
}

export default function Microlearning({ title, onExit }) {
  const { t: tr, lang, setLang } = useI18n();
  const [t, setT] = useState(42);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [subs, setSubs] = useState(true);
  const [done, setDone] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf;
    last.current = performance.now();
    const loop = (now) => {
      const dt = (now - last.current) / 1000; last.current = now;
      setT((x) => {
        const n = x + dt * speed;
        if (n >= DUR) { setPlaying(false); setDone(true); return DUR; }
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const sc = sceneAt(t);
  const chap = [...CHAPTERS].reverse().find((c) => t >= c.t);

  return (
    <div>
      <button onClick={onExit} className="btn h-10 px-3 mb-4"><ArrowLeft size={16} />Training hub</button>
      <div className="grid xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          <div className="label text-assist">Training</div>
          <h1 className="font-display text-[28px] font-semibold uppercase tracking-wide">{title}</h1>

          {/* Video area */}
          <div className="relative mt-3 rounded-lg overflow-hidden border border-line bg-[#0c0f12] aspect-video max-w-full">
            <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '900px' }}>
              <div className="w-[70%] aspect-square" style={{ transform: 'rotateX(52deg) rotateZ(-18deg) translateY(4%)', transformStyle: 'preserve-3d' }}>
                <MachinePlan worker={sc.worker} distance={sc.d} level={sc.level} compact extent={9} className="w-full h-full" />
              </div>
            </div>
            {/* scene HUD */}
            <div className="absolute top-3 left-3 flex gap-2">
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase bg-bg1/85 border border-line rounded-sm px-2 py-1">{chap.name}</span>
              {sc.stopped && <span className="text-[11px] font-semibold tracking-[0.14em] uppercase bg-critical text-onsig rounded-sm px-2 py-1">Machine stopped</span>}
              {sc.scan && <span className="text-[11px] font-semibold tracking-[0.14em] uppercase bg-assist/20 text-assist rounded-sm px-2 py-1">Checking mirrors · camera</span>}
            </div>
            <div className="absolute top-3 right-3 num text-xs bg-bg1/85 border border-line rounded-sm px-2 py-1">{sc.d.toFixed(1)} m</div>
            {!playing && !done && (
              <button onClick={() => setPlaying(true)} className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-ink/90 text-bg0 flex items-center justify-center hover:bg-ink" aria-label="Play">
                <Play size={34} className="ml-1" />
              </button>
            )}
            <AnimatePresence>
              {subs && (
                <motion.div key={chap.sub + lang} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none">
                  <p className="bg-black/75 text-ink text-base sm:text-lg px-4 py-2 rounded-md text-center max-w-[90%]">“{tr(chap.sub)}”</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Timeline */}
          <div className="mt-4">
            <div className="relative">
              <input aria-label="Seek" type="range" className="slider" min={0} max={DUR} step={0.1} value={t}
                onChange={(e) => { setT(parseFloat(e.target.value)); setDone(false); }}
                style={{ '--pct': `${(t / DUR) * 100}%`, '--fill': '#56c7db' }} />
              {CHAPTERS.slice(1).map((c) => <span key={c.t} className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-ink3 pointer-events-none" style={{ left: `${(c.t / DUR) * 100}%` }} />)}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button className="btn btn-primary w-14 px-0" onClick={() => { if (done) { setT(0); setDone(false); } setPlaying((p) => !p); }} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button className="btn w-14 px-0" onClick={() => { setT(0); setDone(false); setPlaying(true); }} aria-label="Replay"><RotateCcw size={18} /></button>
              <span className="num text-sm px-2">{mmss(t)} / {mmss(DUR)}</span>
              <div className="flex-1" />
              <button className={cx('btn px-3', subs && 'chip-on')} onClick={() => setSubs((s) => !s)} aria-pressed={subs}><Captions size={18} /><span className="hidden sm:inline">Subtitles</span></button>
              <label className="btn px-3 relative">
                <Languages size={18} />
                <select aria-label="Subtitle language" value={lang} onChange={(e) => setLang(e.target.value)} className="bg-transparent outline-none normal-case tracking-normal cursor-pointer">
                  {LANGS.map((l) => <option key={l.id} value={l.id} className="bg-bg2">{l.label}</option>)}
                </select>
              </label>
              <button className="btn px-3" onClick={() => setSpeed((s) => (s === 2 ? 0.75 : s === 0.75 ? 1 : s === 1 ? 1.5 : 2))} aria-label="Playback speed"><Gauge size={18} /><span className="num">{speed}×</span></button>
            </div>
          </div>
        </div>

        {/* Side: chapters / quick check */}
        <div className="xl:col-span-4 space-y-4">
          <AnimatePresence mode="wait">
            {done ? <QuickCheck key="qc" onReplay={() => { setT(0); setDone(false); }} /> : (
              <motion.div key="ch" className="panel p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="ptitle mb-3">Chapters</h2>
                <ol className="space-y-1">
                  {CHAPTERS.map((c) => (
                    <li key={c.t}>
                      <button onClick={() => { setT(c.t); setDone(false); }} className={cx('w-full min-h-[48px] px-3 rounded-md flex items-center gap-3 text-left hover:bg-bg3', chap.t === c.t && 'bg-bg3')}>
                        <span className="num text-xs text-ink3 w-10">{mmss(c.t)}</span><span className="flex-1">{c.name}</span>
                        {t > c.t + 15 && <CheckCircle2 size={16} className="text-safe" />}
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="btn w-full mt-4" onClick={() => { setT(DUR); setPlaying(false); setDone(true); }}>Skip to quick check</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function QuickCheck({ onReplay }) {
  const { t } = useI18n();
  const [pick, setPick] = useState(null);
  const correct = 'C';
  const opts = [['A', 'qc.a'], ['B', 'qc.b'], ['C', 'qc.c'], ['D', 'qc.d']];
  const right = pick === correct;
  return (
    <motion.div className="panel p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="label text-assist">{t('qc.title')}</div>
      <p className="text-lg font-semibold mt-2 leading-snug">{t('qc.q')}</p>
      <div className="space-y-2 mt-4">
        {opts.map(([k, key]) => {
          const state = pick && (k === correct ? 'right' : k === pick ? 'wrong' : null);
          return (
            <button key={k} disabled={!!pick} onClick={() => setPick(k)}
              className={cx('w-full min-h-[56px] rounded-md border px-4 flex items-center gap-3 text-left transition-colors',
                state === 'right' ? 'border-safe bg-safe/10' : state === 'wrong' ? 'border-critical bg-critical/10' : 'border-ctl hover:bg-bg3')}>
              <span className="font-display text-xl font-semibold w-6">{k}</span><span className="flex-1">{t(key)}</span>
              {state === 'right' && <CheckCircle2 className="text-safe" size={20} />}{state === 'wrong' && <XCircle className="text-critical" size={20} />}
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {pick && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            {right ? (
              <div className="mt-5 rounded-md bg-safe/10 border border-safe/50 p-4 text-center">
                <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="inline-flex">
                  <Award size={44} className="text-safe" />
                </motion.div>
                <div className="font-display text-xl font-semibold uppercase tracking-wide mt-1">Module complete</div>
                <div className="text-sm text-ink2 mt-1">Awareness score updated in your Digital Twin</div>
                <div className="font-display text-4xl font-semibold mt-2"><span className="text-ink3">84 → </span><AnimatedNumber from={84} value={87} className="text-safe" /></div>
              </div>
            ) : (
              <div className="mt-5 rounded-md bg-critical/10 border border-critical/50 p-4 text-sm">
                Not quite. Stopping lets you confirm where the worker is before any movement — reversing may move the machine <i>toward</i> someone you can't see.
                <button className="btn w-full mt-3" onClick={onReplay}>Rewatch the key moment</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
