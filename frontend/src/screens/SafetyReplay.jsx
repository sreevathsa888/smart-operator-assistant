import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, GitCompareArrows, History, FileText } from 'lucide-react';
import { Panel, PanelHeader, StatusPill, ArcGauge, ScreenTitle, cx } from '../components/ui/index.jsx';
import MachinePlan from '../components/MachinePlan.jsx';
import { LEVEL_COLOR, ui } from '../lib/risk.js';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState } from '../components/ApiState.jsx';

const KIND_COL = { safe: '#3fd08a', medium: '#f2b53a', high: '#ff8a3d', critical: '#ff5a52' };

function makeAt(F) {
  return (t) => {
    const i = F.findIndex((k) => k.t > t);
    if (i === -1) return { ...F[F.length - 1], idx: F.length - 1 };
    if (i === 0) return { ...F[0], idx: 0 };
    const a = F[i - 1], b = F[i], k = (t - a.t) / (b.t - a.t);
    const l = (x, y) => x + (y - x) * k;
    return { ...a, dist: l(a.dist, b.dist), speed: l(a.speed, b.speed), slope: l(a.slope, b.slope), score: l(a.score, b.score), wx: l(a.wx, b.wx), wy: l(a.wy, b.wy), idx: i - 1 };
  };
}

export default function SafetyReplay({ nav, operatorId, dataVersion, openWhatIf }) {
  const [sel, setSel] = useState(null);
  const events = useApi(() => api.events(operatorId, 50), [operatorId, dataVersion]);
  const replayable = (events.data ?? []).filter((e) => e.replayable);
  const eventId = sel ?? replayable[0]?.event_id;
  const ev = useApi(() => api.replay(eventId), [eventId], { enabled: !!eventId });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const last = useRef(0);
  const F = ev.data?.frames ?? [];
  const END = Math.max(1, F.length ? F[F.length - 1].t : 1);

  useEffect(() => { setT(0); setPlaying(false); }, [eventId]);
  useEffect(() => {
    if (!playing) return;
    let raf; last.current = performance.now();
    const loop = (now) => {
      const dt = (now - last.current) / 1000; last.current = now;
      setT((x) => { const n = x + dt * rate; if (n >= END) { setPlaying(false); return END; } return n; });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, END]);

  if (events.data && !replayable.length) return <ApiState empty="No recorded events yet — run a proximity event from the Safety Center." data={[]} />;
  if (!ev.data) return <ApiState loading={events.loading || ev.loading} error={events.error || ev.error} data={ev.data} onRetry={() => { events.reload(); ev.reload(); }} rows={3} label="Loading replay" />;

  const E = ev.data;
  const KF = E.keyframes;
  const at = makeAt(F);
  const f = at(t);
  const lvl = ui(f.level);
  const alertK = KF.find((k) => k.label.includes('ALERT'));
  const alerted = alertK && t >= alertK.t;
  const curK = [...KF].reverse().find((k) => k.t <= t) ?? KF[0];

  return (
    <div>
      <ScreenTitle eyebrow={`${E.id} · ${E.date} · ${E.machine} · ${E.source === 'live' ? 'recorded live' : 'recorded'}`} title="Safety replay" sub={E.summary}
        right={<div className="flex flex-wrap gap-2">
          <select aria-label="Choose event" value={eventId} onChange={(e) => setSel(e.target.value)} className="h-12 rounded-md bg-bg2 border border-ctl px-3 num text-sm">
            {replayable.map((e) => <option key={e.event_id} value={e.event_id}>{e.ts} · peak {Math.round(e.peak_score)}</option>)}
          </select>
          <button className="btn btn-assist" onClick={() => openWhatIf({ ...E.alert_frame, eventId: E.id })}><GitCompareArrows size={18} />What if I had…?</button>
        </div>} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel className="xl:col-span-8 !p-0 overflow-hidden">
          <div className="p-5 pb-0 flex items-center justify-between gap-3">
            <PanelHeader title="Reconstructed scene" icon={History} />
            <div className="flex items-center gap-2 -mt-4">
              <span className="num text-2xl">{f.clock}</span>
              <StatusPill level={curK.kind}>{curK.label}</StatusPill>
            </div>
          </div>
          <div className="relative tech-grid aspect-[16/10] max-w-full">
            <MachinePlan worker={{ x: f.wx, y: f.wy }} distance={f.dist} level={lvl} speed={+f.speed.toFixed(1)} load={Math.round(f.load)} label={E.machine}
              className="absolute inset-0 h-full" extent={10.5} />
            {alerted && t < alertK.t + 2.5 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute top-4 left-1/2 -translate-x-1/2 bg-critical text-onsig font-semibold tracking-[0.12em] text-sm px-4 py-2 rounded-md">
                ALERT ISSUED · {alertK.clock}
              </motion.div>
            )}
          </div>
        </Panel>

        <div className="xl:col-span-4 grid sm:grid-cols-2 xl:grid-cols-1 gap-4 content-start">
          <Panel>
            <div className="flex items-center gap-4">
              <div className="w-[150px] shrink-0"><ArcGauge value={Math.round(f.score)} level={lvl} size={150} label={f.level} /></div>
              <div className="space-y-3 flex-1">
                <Read k="Distance" v={`${f.dist.toFixed(1)} m`} warn={f.dist < 3} />
                <Read k="Speed" v={`${f.speed.toFixed(1)} km/h`} warn={f.speed > 3} />
                <Read k="Slope" v={`${Math.round(f.slope)}°`} warn={f.slope > 9} />
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Assistant findings" icon={FileText} />
            <ol className="space-y-2.5 text-sm">
              {E.findings.map((x, i) => <li key={i} className="flex gap-2"><span className="num text-ink3">{i + 1}</span><span>{x}</span></li>)}
            </ol>
            <p className="text-[11px] text-ink3 mt-3">Risk values in this replay were produced by the safety model on each recorded 0.5 s frame.</p>
          </Panel>
        </div>

        {/* Timeline */}
        <Panel className="xl:col-span-12">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button className="btn btn-primary" onClick={() => { if (t >= END) setT(0); setPlaying((p) => !p); }}>
              {playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pause' : 'Play replay'}
            </button>
            <button className="btn w-12 px-0" onClick={() => { setT(0); setPlaying(false); }} aria-label="Restart"><RotateCcw size={18} /></button>
            {[0.5, 1, 2].map((r) => <button key={r} onClick={() => setRate(r)} className={cx('chip num', rate === r && 'chip-on')}>{r}×</button>)}
            <div className="flex-1" />
            <span className="num text-sm text-ink2">{t.toFixed(1)} s / {END.toFixed(1)} s</span>
          </div>
          <Timeline t={t} END={END} KF={KF} at={at} onSeek={(x) => { setT(x); setPlaying(false); }} />
        </Panel>
      </div>
    </div>
  );
}

function Read({ k, v, warn }) {
  return <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2 last:border-0"><span className="label">{k}</span><span className={cx('num text-lg', warn ? 'text-caution' : 'text-ink')}>{v}</span></div>;
}

function Timeline({ t, END, KF, at, onSeek }) {
  const W = 1000, H = 90;
  const x = (s) => 20 + (s / END) * (W - 40);
  const y = (r) => H - 8 - (r / 100) * (H - 20);
  const pts = Array.from({ length: 121 }, (_, i) => (i / 120) * END).map((s) => [x(s), y(at(s).score)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const ref = useRef();
  const seek = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    onSeek(Math.max(0, Math.min(END, ((px - 20) / (W - 40)) * END)));
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" onClick={seek} className="cursor-pointer" aria-label="Risk over the event">
          <defs><linearGradient id="rg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff5a52" stopOpacity=".35" /><stop offset=".5" stopColor="#f2b53a" stopOpacity=".15" /><stop offset="1" stopColor="#3fd08a" stopOpacity=".05" /></linearGradient></defs>
          {[27, 52, 72].map((th) => <line key={th} x1="20" x2={W - 20} y1={y(th)} y2={y(th)} stroke={th === 27 ? '#f2b53a' : th === 52 ? '#ff8a3d' : '#ff5a52'} strokeOpacity=".35" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />)}
          <path d={`${d} L${x(END)} ${H} L${x(0)} ${H} Z`} fill="url(#rg)" />
          <path d={d} fill="none" stroke="#e9edf0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <rect x="20" y="0" width={Math.max(0, x(t) - 20)} height={H} fill="#56c7db" opacity=".06" />
          <line x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="#56c7db" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative h-[92px] mt-1">
          <div className="absolute left-[2%] right-[2%] top-[14px] h-0.5 bg-line" />
          {KF.map((k) => {
            const pass = t >= k.t;
            return (
              <button key={k.t} onClick={() => onSeek(k.t)} className="absolute -translate-x-1/2 flex flex-col items-center gap-1.5 group" style={{ left: `${(x(k.t) / W) * 100}%` }}>
                <motion.span animate={{ scale: pass ? 1 : 0.75, backgroundColor: pass ? KIND_COL[k.kind] : '#1d2228' }} className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center" style={{ borderColor: KIND_COL[k.kind] }}>
                  {pass && <span className="w-2 h-2 rounded-full bg-onsig" />}
                </motion.span>
                <span className="num text-xs text-ink2">{k.clock}</span>
                <span className="text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap" style={{ color: pass ? KIND_COL[k.kind] : '#838e99' }}>{k.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
