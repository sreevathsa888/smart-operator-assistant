import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RotateCcw, Eye, Video, GraduationCap, CheckCircle2, XCircle, MinusCircle, TriangleAlert } from 'lucide-react';
import { ScenarioSlider, ArcGauge, Disclaimer, StatusPill, cx } from '../components/ui/index.jsx';
import { LEVEL_COLOR, ui } from '../lib/risk.js';
import { api } from '../api/client.js';
import { useThrottledModel } from '../hooks/useApi.js';
import { useI18n } from '../lib/i18n.jsx';

/* ───────────── Scenario model ─────────────
   Machine at the origin, bucket facing −z. The worker approaches from the rear-left (+z, −x):
   the classic blind zone. Units: metres, seconds. */
const WORKER_START = new THREE.Vector3(-6, 0, 7.5);
const WORKER_TARGET = new THREE.Vector3(-1.3, 0, 3.6);
const HULL = 2.0; // distance from machine centre to hull edge (approx)

// Educational explanation per choice. The IMPACT rating is not stored here: it comes from the safety model
// via POST /api/simulation/decision, which scores the resulting state of every option.
const OPTIONS = [
  { id: 'A', key: 'sim.a', why: 'Continuing at the same speed keeps the machine closing on a worker it cannot see.' },
  { id: 'B', key: 'sim.b', why: 'Reducing speed gives the worker and you more time to react — but the machine is still moving toward an unverified zone.' },
  { id: 'C', key: 'sim.c', why: 'Stopping removes machine motion entirely. The worker clears the zone and you resume only after verifying the surroundings.' },
  { id: 'D', key: 'sim.d', why: 'Reversing moves the machine toward the rear-left blind zone — exactly where the worker is.' },
];

export default function Simulator({ nav, operatorId }) {
  const { t } = useI18n();
  const [ctl, setCtl] = useState({ speed: 3.5, load: 60, slope: 8, visibility: 70 });
  const [phase, setPhase] = useState('ready'); // ready | running | decide | outcome | analysis
  const [choice, setChoice] = useState(null);
  const [dist, setDist] = useState(WORKER_START.distanceTo(new THREE.Vector3()) - HULL);
  const [cam, setCam] = useState('site');
  const [before, setBefore] = useState(null);
  const sim = useRef({ machineZ: 0, worker: WORKER_START.clone(), effSpeed: 0, t: 0 });

  const [decision, setDecision] = useState(null);
  const effSpeed = phase === 'outcome' || phase === 'analysis' ? outcomeSpeed(choice, ctl.speed) : phase === 'running' ? ctl.speed : phase === 'decide' ? ctl.speed : 0;
  // Scene → safety-model inputs. The worker approaches the rear-left (blind side) while the machine reverses.
  const modelState = {
    speed: +(effSpeed || (phase === 'ready' ? ctl.speed : 0)).toFixed(1), distance: +(phase === 'ready' ? 4 : Math.max(0.5, dist)).toFixed(1),
    load: ctl.load, slope: ctl.slope, visibility: ctl.visibility, Obstacle_Type: 'Worker',
    Travel_Direction: effSpeed > 0.05 || phase === 'ready' ? 'Reverse' : 'Stationary',
    Blind_Zone_Entry: phase !== 'ready' && dist < 6 ? 1 : 0,
  };
  const riskQ = useThrottledModel(() => api.simulateRisk(modelState, operatorId, true), JSON.stringify(modelState), 250);
  const risk = riskQ.data ? { ...riskQ.data, level: ui(riskQ.data.level) } : { score: 0, level: 'low', pending: true };
  // Zone radius grows with speed, load, slope and poor visibility (stopping distance + swing envelope)
  const zoneR = 3 + ctl.speed * 0.22 + ctl.load * 0.012 + ctl.slope * 0.05 + (100 - ctl.visibility) * 0.012;

  const start = () => {
    sim.current = { machineZ: 0, worker: WORKER_START.clone(), effSpeed: ctl.speed, t: 0 };
    setChoice(null); setBefore(null); setPhase('running');
  };
  const reset = () => { sim.current = { machineZ: 0, worker: WORKER_START.clone(), effSpeed: 0, t: 0 }; setDist(WORKER_START.length() - HULL); setChoice(null); setPhase('ready'); };
  const decide = (id) => {
    setBefore(risk); setChoice(id); setPhase('outcome'); setDecision(null);
    api.decision(modelState, id, operatorId).then(setDecision).catch((e) => setDecision({ error: e }));
    setTimeout(() => setPhase('analysis'), 3200);
  };

  const onTick = useCallback((d) => setDist(d), []);
  const onReachZone = useCallback(() => setPhase((p) => (p === 'running' ? 'decide' : p)), []);

  const sliderColor = LEVEL_COLOR[risk.level];

  return (
    <div className="-mx-4 lg:-mx-6 -my-6">
      <div className="relative h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden bg-[#0d1114]">
        <Canvas shadows camera={{ position: [9, 8.5, 13], fov: 45 }} dpr={[1, 2]}>
          <color attach="background" args={['#0d1114']} />
          <fog attach="fog" args={['#0d1114', 22, 48 - (100 - ctl.visibility) * 0.25]} />
          <hemisphereLight args={['#c9d3dc', '#3a342b', 1.0]} />
          <directionalLight position={[8, 14, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
          <Scene sim={sim} phase={phase} choice={choice} ctl={ctl} zoneR={zoneR} level={risk.level} onTick={onTick} onReachZone={onReachZone} cam={cam} />
          {cam === 'site' && <OrbitControls target={[-1.5, 1, 2.5]} minPolarAngle={0.5} maxPolarAngle={1.35} minDistance={8} maxDistance={26} enablePan={false} />}
        </Canvas>

        {/* HUD: scenario card */}
        <div className="absolute z-10 top-4 left-4 right-4 sm:right-auto sm:w-[340px] panel p-4 bg-bg1/90 backdrop-blur">
          <div className="label text-assist">Safety simulator · Scenario 03</div>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide mt-1">Worker enters blind zone</h1>
          <p className="text-sm text-ink2 mt-1">EXC-204 is reversing on an {ctl.slope}° grade. A ground worker approaches from the rear-left — outside the mirror and camera view.</p>
          <div className="flex gap-2 mt-3">
            {phase === 'ready' ? (
              <button className="btn btn-primary flex-1" onClick={start}><Play size={18} />Start scenario</button>
            ) : (
              <button className="btn flex-1" onClick={reset}><RotateCcw size={18} />Reset</button>
            )}
            <button className={cx('btn px-3', cam === 'cab' && 'chip-on')} onClick={() => setCam((c) => (c === 'site' ? 'cab' : 'site'))} aria-pressed={cam === 'cab'} title="Toggle operator (cab) view">
              {cam === 'cab' ? <Video size={18} /> : <Eye size={18} />}<span className="text-xs">{cam === 'cab' ? 'Site view' : 'Cab view'}</span>
            </button>
          </div>
          {cam === 'cab' && <p className="mt-3 text-xs text-caution">Operator view — the rear-left blind zone is out of sight from here. This is why the assistant watches it for you.</p>}
        </div>

        {/* HUD: risk */}
        <div className="absolute z-10 top-4 right-4 hidden sm:block panel p-4 bg-bg1/90 backdrop-blur w-[200px] text-center">
          <div className="label text-left">Risk level</div>
          <ArcGauge value={Math.round(risk.score)} level={risk.level} size={168} label={risk.pending ? '…' : t('lvl.short.' + risk.level)} />
          <div className="flex justify-between gap-1.5 text-[9px] font-semibold tracking-[0.08em] -mt-1">
            {['low', 'medium', 'high', 'critical'].map((l) => <span key={l} style={{ color: risk.level === l ? LEVEL_COLOR[l] : '#838e99' }}>{t('lvl.short.' + l)}</span>)}
          </div>
          <div className="num text-xs text-ink2 mt-2">{phase === 'ready' ? 'Model risk if a worker is 4 m away' : `Worker ${Math.max(0, dist).toFixed(1)} m`} · zone {zoneR.toFixed(1)} m</div>
          <div className="text-[10px] text-ink3 mt-1">safety model {riskQ.error ? '· offline' : '· live'}</div>
          {risk.warnings?.length > 0 && <div className="text-[10px] text-caution mt-1 text-left">⚠ {risk.warnings[0]}</div>}
        </div>

        {/* HUD: controls dock */}
        <div className="absolute z-10 bottom-4 left-4 right-4 panel p-4 bg-bg1/90 backdrop-blur">
          <div className="grid grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto] gap-x-6 gap-y-1 items-center">
            <ScenarioSlider id="sim-speed" label="Machine speed" unit="km/h" min={0} max={12} step={0.1} value={ctl.speed} color={sliderColor} onChange={(v) => setCtl((c) => ({ ...c, speed: v }))} format={(v) => v.toFixed(1)} />
            <ScenarioSlider id="sim-load" label="Load" unit="%" min={0} max={100} value={ctl.load} color={sliderColor} onChange={(v) => setCtl((c) => ({ ...c, load: v }))} />
            <ScenarioSlider id="sim-terrain" label="Terrain slope" unit="°" min={0} max={25} value={ctl.slope} color={sliderColor} onChange={(v) => setCtl((c) => ({ ...c, slope: v }))} />
            <ScenarioSlider id="sim-vis" label="Visibility" unit="%" min={0} max={100} value={ctl.visibility} color={sliderColor} onChange={(v) => setCtl((c) => ({ ...c, visibility: v }))} />
            <div className="col-span-2 lg:col-span-1 hidden lg:block"><Disclaimer className="!text-[11px] max-w-[220px]" /></div>
          </div>
        </div>

        {/* Decision overlay */}
        <AnimatePresence>
          {phase === 'decide' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 bg-black/45 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} className="panel p-6 w-full max-w-[560px] border-caution/70">
                <div className="flex items-center gap-2 text-caution label"><TriangleAlert size={16} />Scenario paused</div>
                <p className="text-ink2 mt-2">{t('sim.scenario')}</p>
                <h2 className="font-display text-4xl font-bold uppercase tracking-wide mt-1">{t('sim.q')}</h2>
                <div className="grid sm:grid-cols-2 gap-2 mt-5">
                  {OPTIONS.map((o) => (
                    <button key={o.id} onClick={() => decide(o.id)} className="min-h-[72px] rounded-md border border-ctl hover:border-ink hover:bg-bg3 px-4 flex items-center gap-4 text-left transition-colors">
                      <span className="font-display text-3xl font-bold text-ink3">{o.id}</span><span className="font-semibold">{t(o.key)}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Outcome banner */}
        <AnimatePresence>
          {phase === 'outcome' && (
            <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 panel px-6 py-4 bg-bg1/90 text-center">
              <div className="label text-assist">Simulating outcome</div>
              <div className="font-display text-2xl font-semibold uppercase mt-1">{choice} · {t(OPTIONS.find((o) => o.id === choice).key)}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decision analysis */}
        <AnimatePresence>
          {phase === 'analysis' && (
            <motion.aside initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute z-20 right-4 top-4 bottom-4 sm:top-4 sm:bottom-auto sm:w-[400px] left-4 sm:left-auto panel p-5 bg-bg1/95 backdrop-blur overflow-y-auto">
              <Analysis choice={choice} before={before} after={risk} decision={decision} onRetry={reset} onContinue={() => nav('training')} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function outcomeSpeed(choice, speed) {
  return { A: speed, B: Math.min(speed, 1.5), C: 0, D: Math.max(speed, 7) }[choice] ?? speed;
}

function Analysis({ choice, before, after, decision, onRetry, onContinue }) {
  const { t } = useI18n();
  const o = OPTIONS.find((x) => x.id === choice);
  const IMP = {
    best: { label: 'Positive · best choice', col: 'text-safe', icon: CheckCircle2 },
    positive: { label: 'Positive', col: 'text-safe', icon: CheckCircle2 },
    negative: { label: 'Negative', col: 'text-caution', icon: MinusCircle },
    critical: { label: 'Negative · high risk', col: 'text-critical', icon: XCircle },
  };
  const chosen = decision?.chosen;
  const imp = chosen ? IMP[chosen.impact] : null;
  return (
    <div>
      <div className="label text-assist">Decision analysis</div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="rounded-md bg-bg3/60 border border-line p-3"><div className="label">Your decision</div><div className="font-display text-4xl font-bold mt-1">{o.id}</div><div className="text-sm text-ink2">{t(o.key)}</div></div>
        <div className="rounded-md bg-bg3/60 border border-line p-3"><div className="label">Safety impact</div>
          {imp ? <><imp.icon className={cx('mt-2', imp.col)} size={28} /><div className={cx('font-semibold mt-1', imp.col)}>{imp.label}</div></>
            : <div className="text-sm text-ink3 mt-2">{decision?.error ? 'Model unavailable' : 'Scoring…'}</div>}
        </div>
      </div>
      <div className="rounded-md bg-bg3/60 border border-line p-3 mt-3">
        <div className="label">Simulated risk (safety model)</div>
        <div className="flex items-center gap-3 mt-2 num text-lg">
          <span style={{ color: LEVEL_COLOR[before.level] }}>{Math.round(before.score)}</span><span className="text-ink3">→</span>
          <span style={{ color: LEVEL_COLOR[after.level] }}>{Math.round(after.score)}</span>
          <StatusPill level={after.level}>{t('lvl.short.' + after.level)}</StatusPill>
        </div>
        {decision?.options && (
          <ul className="mt-3 space-y-1 text-sm">
            {decision.options.map((x) => (
              <li key={x.id} className={cx('flex items-center gap-2', x.id === choice && 'font-semibold')}>
                <span className="num w-5">{x.id}</span><span className="flex-1 truncate">{t(OPTIONS.find((y) => y.id === x.id).key)}</span>
                <span className="num" style={{ color: LEVEL_COLOR[ui(x.level)] }}>{Math.round(x.score)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-ink3 mt-2">Each option's resulting state is scored by the same model that drives the live alerts.</p>
      </div>
      <div className="mt-4"><div className="label">Why</div><p className="mt-1 text-[15px] leading-relaxed">{o.why}</p></div>
      <Disclaimer className="mt-4" />
      <div className="grid grid-cols-2 gap-2 mt-5">
        <button className="btn" onClick={onRetry}><RotateCcw size={16} />Try again</button>
        <button className="btn btn-primary" onClick={onContinue}><GraduationCap size={16} />Continue training</button>
      </div>
    </div>
  );
}

/* ───────────── 3D scene ───────────── */
function Scene({ sim, phase, choice, ctl, zoneR, level, onTick, onReachZone, cam }) {
  const machine = useRef();
  const boom = useRef();
  const worker = useRef();
  const legs = useRef([]);
  const ring = useRef();
  const disk = useRef();
  const lastTick = useRef(0);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const col = LEVEL_COLOR[level];

  useFrame((state, dt) => {
    const s = sim.current;
    dt = Math.min(dt, 0.05);
    s.t += dt;
    const running = phase === 'running' || phase === 'outcome';
    const v = phase === 'outcome' ? outcomeSpeed(choice, ctl.speed) : phase === 'running' ? ctl.speed : 0;
    s.effSpeed += (v - s.effSpeed) * Math.min(1, dt * 2.5);

    // machine reverses (+z) — scaled for readability
    if (running) s.machineZ += (s.effSpeed / 3.6) * dt * 0.45;
    if (machine.current) machine.current.position.z = s.machineZ;
    if (boom.current) boom.current.rotation.x = 0.5 + Math.sin(s.t * 1.2) * (s.effSpeed > 0.2 ? 0.08 : 0.01);

    // worker
    let wTarget = WORKER_TARGET;
    let wSpeed = 1.5;
    if (phase === 'outcome') {
      if (choice === 'C') { wTarget = new THREE.Vector3(-7, 0, 1); wSpeed = 1.2; }
      else if (choice === 'B') wSpeed = 0.15;
      else if (choice === 'A' || choice === 'D') wSpeed = 0.35;
    }
    const walking = (phase === 'running' || phase === 'outcome') && s.worker.distanceTo(wTarget) > 0.05;
    if (walking) {
      const dir = wTarget.clone().sub(s.worker).normalize();
      s.worker.addScaledVector(dir, Math.min(wSpeed * dt, s.worker.distanceTo(wTarget)));
      if (worker.current) worker.current.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (worker.current) worker.current.position.copy(s.worker);
    legs.current.forEach((l, i) => { if (l) l.rotation.x = walking ? Math.sin(s.t * 8 + i * Math.PI) * 0.5 : 0; });

    const d = Math.hypot(s.worker.x, s.worker.z - s.machineZ) - HULL;
    if (s.t - lastTick.current > 0.15) { lastTick.current = s.t; onTick(d); }
    if (phase === 'running' && d < 2.6) onReachZone();

    // zone ring follows machine, pulses when risk ≥ medium
    const pulse = level === 'low' ? 1 : 0.75 + Math.sin(s.t * 4) * 0.25;
    if (ring.current) { ring.current.position.z = s.machineZ; ring.current.material.opacity = 0.85 * pulse; }
    if (disk.current) { disk.current.position.z = s.machineZ; disk.current.material.opacity = (level === 'high' || level === 'critical' ? 0.22 : 0.12) * pulse; }

    // camera
    if (cam === 'cab') {
      state.camera.position.set(-0.65, 3.35, s.machineZ - 0.6);
      camTarget.set(-0.3, 1.2, s.machineZ - 9);
      state.camera.lookAt(camTarget);
    }
  });

  return (
    <group>
      {/* ground */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#2a2620" roughness={1} />
      </mesh>
      <Grid position={[0, 0.01, 0]} args={[60, 60]} cellSize={1} cellThickness={0.5} cellColor="#3a342b" sectionSize={5} sectionThickness={1} sectionColor="#4a4136" fadeDistance={40} infiniteGrid />

      {/* danger zone */}
      <mesh ref={disk} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[zoneR, 64]} />
        <meshBasicMaterial color={col} transparent opacity={0.15} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[zoneR - 0.12, zoneR, 96]} />
        <meshBasicMaterial color={col} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* proximity zone */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.025, 0]}>
        <ringGeometry args={[zoneR + 2.8, zoneR + 2.9, 96]} />
        <meshBasicMaterial color="#838e99" transparent opacity={0.35} depthWrite={false} />
      </mesh>

      {/* blind zone wedge (rear-left) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.028, 0]}>
        <circleGeometry args={[6.5, 32, Math.PI, Math.PI * 0.5]} />
        <meshBasicMaterial color="#838e99" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <Excavator ref={machine} boomRef={boom} />

      {/* worker */}
      <group ref={worker} position={WORKER_START.toArray()}>
        <mesh position={[0, 1.15, 0]} castShadow><capsuleGeometry args={[0.26, 0.6, 6, 12]} /><meshStandardMaterial color="#ff8a3d" roughness={0.6} /></mesh>
        <mesh position={[0, 1.15, 0]}><cylinderGeometry args={[0.275, 0.275, 0.08, 16]} /><meshStandardMaterial color="#e9edf0" emissive="#e9edf0" emissiveIntensity={0.4} /></mesh>
        <mesh position={[0, 1.78, 0]} castShadow><sphereGeometry args={[0.18, 16, 16]} /><meshStandardMaterial color="#c89b7b" /></mesh>
        <mesh position={[0, 1.9, 0]}><sphereGeometry args={[0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f5f5f0" /></mesh>
        {[-0.12, 0.12].map((x, i) => (
          <group key={x} position={[x, 0.75, 0]} ref={(el) => (legs.current[i] = el)}>
            <mesh position={[0, -0.37, 0]} castShadow><boxGeometry args={[0.16, 0.74, 0.18]} /><meshStandardMaterial color="#2d3a4a" /></mesh>
          </group>
        ))}
        <Html position={[0, 2.5, 0]} center distanceFactor={14} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="text-[11px] font-semibold tracking-[0.14em] bg-bg1/90 border border-line rounded-sm px-2 py-0.5 whitespace-nowrap">WORKER</div>
        </Html>
      </group>

      <SiteProps />
    </group>
  );
}

const Excavator = React.forwardRef(function Excavator({ boomRef }, ref) {
  const body = '#c99a2e', dark = '#23282e', steel = '#6e7780';
  return (
    <group ref={ref}>
      {/* tracks */}
      {[-1.25, 1.25].map((x) => (
        <group key={x} position={[x, 0.45, 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[0.8, 0.9, 4.4]} /><meshStandardMaterial color={dark} roughness={0.9} /></mesh>
          {[-1.6, -0.8, 0, 0.8, 1.6].map((z) => <mesh key={z} position={[x > 0 ? 0.41 : -0.41, 0, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.28, 0.28, 0.04, 16]} /><meshStandardMaterial color={steel} /></mesh>)}
        </group>
      ))}
      {/* turntable */}
      <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[1.0, 1.0, 0.2, 24]} /><meshStandardMaterial color={dark} /></mesh>
      {/* house */}
      <mesh position={[0.1, 1.55, 0.35]} castShadow><boxGeometry args={[2.6, 0.9, 2.8]} /><meshStandardMaterial color={body} roughness={0.55} metalness={0.2} /></mesh>
      <mesh position={[0.1, 1.45, 1.85]} castShadow><boxGeometry args={[2.6, 0.75, 0.5]} /><meshStandardMaterial color="#3a3f45" /></mesh>
      {/* cab */}
      <mesh position={[-0.65, 2.45, -0.35]} castShadow><boxGeometry args={[1.0, 1.1, 1.3]} /><meshStandardMaterial color="#35404c" metalness={0.3} roughness={0.5} /></mesh>
      <mesh position={[-1.16, 2.5, -0.35]} rotation-y={-Math.PI / 2}><planeGeometry args={[1.1, 0.8]} /><meshStandardMaterial color="#56c7db" transparent opacity={0.3} emissive="#56c7db" emissiveIntensity={0.2} side={THREE.DoubleSide} /></mesh>
      <mesh position={[-0.65, 2.5, -1.01]}><planeGeometry args={[0.85, 0.85]} /><meshStandardMaterial color="#56c7db" transparent opacity={0.35} emissive="#56c7db" emissiveIntensity={0.25} side={THREE.DoubleSide} /></mesh>
      {/* boom → arm → bucket */}
      <group ref={boomRef} position={[0.35, 1.8, -0.9]} rotation-x={0.5}>
        <mesh position={[0, 0, -1.9]} castShadow><boxGeometry args={[0.45, 0.5, 3.9]} /><meshStandardMaterial color={body} roughness={0.55} /></mesh>
        <group position={[0, 0, -3.8]} rotation-x={-1.5}>
          <mesh position={[0, 0, -1.3]} castShadow><boxGeometry args={[0.34, 0.4, 2.7]} /><meshStandardMaterial color="#b98c2a" /></mesh>
          <group position={[0, 0, -2.65]} rotation-x={-0.7}>
            <mesh position={[0, -0.2, -0.3]} castShadow><boxGeometry args={[0.9, 0.55, 0.7]} /><meshStandardMaterial color={steel} metalness={0.5} roughness={0.4} /></mesh>
          </group>
        </group>
      </group>
      <Html position={[0, 3.6, 0.3]} center distanceFactor={14} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="num text-[11px] bg-bg1/90 border border-line rounded-sm px-2 py-0.5">EXC-204</div>
      </Html>
    </group>
  );
});

function SiteProps() {
  const cones = [[-4, 0, -6], [-2, 0, -6.5], [0, 0, -7], [2, 0, -6.5], [4, 0, -6], [7, 0, 2], [7, 0, 4], [7, 0, 6]];
  const piles = [[8, 0, -6, 2.2], [-9, 0, -3, 1.6], [10, 0, 8, 2.8]];
  return (
    <group>
      {cones.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.35, 0]} castShadow><coneGeometry args={[0.22, 0.7, 16]} /><meshStandardMaterial color="#ff8a3d" /></mesh>
          <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.13, 0.16, 0.12, 16]} /><meshStandardMaterial color="#e9edf0" /></mesh>
        </group>
      ))}
      {piles.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, r * 0.35, z]} castShadow receiveShadow><coneGeometry args={[r, r * 0.7, 9]} /><meshStandardMaterial color="#4a4136" roughness={1} flatShading /></mesh>
      ))}
      {/* barrier fence */}
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[-12 + i * 2.1, 0, -10]}>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[2, 0.12, 0.08]} /><meshStandardMaterial color={i % 2 ? '#e9edf0' : '#f2b53a'} /></mesh>
          <mesh position={[-0.95, 0.3, 0]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color="#46505b" /></mesh>
        </group>
      ))}
    </group>
  );
}
