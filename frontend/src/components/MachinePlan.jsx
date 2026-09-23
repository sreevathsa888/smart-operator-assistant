import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { LEVEL_COLOR } from '../lib/risk.js';

/**
 * Top-down (plan) view of the excavator with safety zones — units are metres.
 * Machine centre at (0,0), tracks pointing up (−y). Restricted zone 3 m, proximity zone 6 m.
 */
export default function MachinePlan({
  worker = { x: -3.2, y: -3.6 },
  distance,
  level = 'low',
  swing = 0,
  restrictedR = 3,
  proximityR = 6,
  showBlind = true,
  obstacles = DEFAULT_OBSTACLES,
  label = 'EXC-204',
  speed,
  load,
  ghostWorker,
  compact = false,
  className,
  extent = 9,
}) {
  const uid = useId().replace(/:/g, '');
  const col = LEVEL_COLOR[level];
  const pulse = level !== 'low';
  const vb = `${-extent} ${-extent} ${extent * 2} ${extent * 2}`;
  const d = distance ?? Math.max(0, Math.hypot(worker.x, worker.y) - 1.6);

  return (
    <svg viewBox={vb} className={className} width="100%" role="img" aria-label={`Machine plan view, worker ${d.toFixed(1)} metres away`}>
      <defs>
        <pattern id={`g${uid}`} width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="0.03" />
        </pattern>
        <pattern id={`h${uid}`} width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="0.5" stroke="#838e99" strokeOpacity="0.25" strokeWidth="0.06" />
        </pattern>
        <radialGradient id={`r${uid}`}>
          <stop offset="0%" stopColor={col} stopOpacity="0.04" />
          <stop offset="100%" stopColor={col} stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <rect x={-extent} y={-extent} width={extent * 2} height={extent * 2} fill={`url(#g${uid})`} />

      {/* obstacles */}
      {obstacles.map((o, i) =>
        o.kind === 'pile' ? (
          <g key={i}>
            <ellipse cx={o.x} cy={o.y} rx={o.r} ry={o.r * 0.8} fill="#2b2620" stroke="#4a4136" strokeWidth="0.06" />
            <ellipse cx={o.x - o.r * 0.2} cy={o.y - o.r * 0.15} rx={o.r * 0.5} ry={o.r * 0.35} fill="#3a342b" />
          </g>
        ) : (
          <g key={i}>
            {Array.from({ length: o.n }, (_, k) => (
              <rect key={k} x={o.x + k * 0.9} y={o.y} width="0.6" height="0.22" rx="0.05" fill={k % 2 ? '#e9edf0' : '#f2b53a'} opacity="0.75" />
            ))}
          </g>
        )
      )}

      {/* proximity zone */}
      <circle r={proximityR} fill="none" stroke="#838e99" strokeOpacity="0.5" strokeWidth="0.05" strokeDasharray="0.25 0.25" />
      {!compact && <text x={0} y={proximityR + 0.75} textAnchor="middle" fill="#838e99" fontSize="0.42" style={{ letterSpacing: '0.08em', fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>PROXIMITY {proximityR} m</text>}

      {/* blind zone wedge (rear-left quadrant, as seen from cab) */}
      {showBlind && (
        <path d={describeWedge(5.2, 115, 205)} fill={`url(#h${uid})`} stroke="#838e99" strokeOpacity="0.25" strokeWidth="0.04" />
      )}
      {showBlind && !compact && <text x={-3.9} y={2.9} fill="#838e99" fontSize="0.38" style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 600, letterSpacing: '0.08em' }}>BLIND ZONE</text>}

      {/* restricted zone */}
      <motion.circle initial={false} animate={{ r: restrictedR }} transition={{ duration: 0.6 }} fill={`url(#r${uid})`} />
      <motion.circle initial={false} animate={{ r: restrictedR, stroke: col }} transition={{ duration: 0.6 }} fill="none" strokeWidth="0.08"
        className={pulse ? 'zone-pulse' : undefined} />
      {!compact && <text x={restrictedR * 0.72 + 0.2} y={restrictedR * 0.72 + 0.6} textAnchor="start" fill={col} fontSize="0.42" style={{ letterSpacing: '0.08em', fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>RESTRICTED {restrictedR} m</text>}

      {/* machine */}
      <Excavator swing={swing} label={compact ? null : label} />

      {/* direction arrow */}
      <g opacity="0.9">
        <path d="M0 -7.4 L0.45 -6.6 L-0.45 -6.6 Z" fill="#56c7db" />
        <line x1="0" y1="-6.6" x2="0" y2="-5.4" stroke="#56c7db" strokeWidth="0.1" />
      </g>

      {/* ghost worker (what-if / previous path) */}
      {ghostWorker && <circle cx={ghostWorker.x} cy={ghostWorker.y} r="0.35" fill="none" stroke="#56c7db" strokeDasharray="0.12 0.12" strokeWidth="0.06" />}

      {/* worker + distance line */}
      <motion.g initial={false} animate={{ x: worker.x, y: worker.y }} transition={{ duration: 0.8, ease: 'easeOut' }}>
        <line x1="0" y1="0" x2={-worker.x * 0.55} y2={-worker.y * 0.55} stroke={col} strokeWidth="0.05" strokeDasharray="0.15 0.12" />
        <circle r="0.75" fill={col} opacity="0.12" />
        <circle r="0.36" fill="#15181c" stroke={col} strokeWidth="0.1" />
        <circle r="0.16" fill={col} />
        <g transform="translate(0.55 -0.55)">
          <rect x="0" y="-0.5" width={compact ? 1.9 : 2.3} height="0.8" rx="0.12" fill="#101317" stroke="#2a3139" strokeWidth="0.04" />
          <text x="0.18" y="0.05" fontSize="0.46" fill="#e9edf0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{d.toFixed(1)} m</text>
        </g>
        {!compact && <text x="0" y="1.05" textAnchor="middle" fontSize="0.36" fill="#a9b2bc" style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 600, letterSpacing: '0.1em' }}>WORKER</text>}
      </motion.g>

      {/* live tags */}
      {(speed != null || load != null) && !compact && (
        <g transform={`translate(${extent - 4.4} ${extent - 2.2})`}>
          <rect width="4" height="1.8" rx="0.15" fill="#101317" stroke="#2a3139" strokeWidth="0.04" />
          {speed != null && <text x="0.25" y="0.72" fontSize="0.42" fill="#838e99" style={{ fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600 }}>SPD <tspan fill="#e9edf0" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{speed} km/h</tspan></text>}
          {load != null && <text x="0.25" y="1.42" fontSize="0.42" fill="#838e99" style={{ fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600 }}>LOAD <tspan fill="#e9edf0" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{load}%</tspan></text>}
        </g>
      )}
    </svg>
  );
}

const DEFAULT_OBSTACLES = [
  { kind: 'pile', x: 5.6, y: -4.8, r: 1.5 },
  { kind: 'pile', x: 6.4, y: 4.6, r: 1.1 },
  { kind: 'barrier', x: -8.2, y: -7.6, n: 5 },
  { kind: 'barrier', x: 3.6, y: 7.8, n: 5 },
];

function describeWedge(r, a0, a1) {
  // angles in degrees, 0 = up (−y), clockwise
  const p = (a) => [r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  // wedge on the LEFT-rear: mirror angles to negative x
  return `M0 0 L${-x0} ${y0} A${r} ${r} 0 0 0 ${-x1} ${y1} Z`;
}

function Excavator({ swing, label }) {
  return (
    <g>
      {/* undercarriage */}
      <rect x="-1.75" y="-2.2" width="0.8" height="4.4" rx="0.25" fill="#23282e" stroke="#46505b" strokeWidth="0.05" />
      <rect x="0.95" y="-2.2" width="0.8" height="4.4" rx="0.25" fill="#23282e" stroke="#46505b" strokeWidth="0.05" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <line x1="-1.75" x2="-0.95" y1={-2 + i * 0.5} y2={-2 + i * 0.5} stroke="#46505b" strokeWidth="0.04" />
          <line x1="0.95" x2="1.75" y1={-2 + i * 0.5} y2={-2 + i * 0.5} stroke="#46505b" strokeWidth="0.04" />
        </g>
      ))}
      <g transform={`rotate(${swing})`}>
        {/* boom + arm + bucket */}
        <rect x="-0.28" y="-5.6" width="0.56" height="4.4" rx="0.12" fill="#b98c2a" stroke="#8a6710" strokeWidth="0.05" />
        <rect x="-0.2" y="-6.4" width="0.4" height="1.2" rx="0.1" fill="#a87e22" />
        <path d="M-0.6 -6.9 H0.6 L0.45 -6.3 H-0.45 Z" fill="#6e7780" stroke="#3a424d" strokeWidth="0.05" />
        {/* house */}
        <rect x="-1.45" y="-1.3" width="2.9" height="2.9" rx="0.35" fill="#c99a2e" stroke="#8a6710" strokeWidth="0.06" />
        <rect x="-1.45" y="1.1" width="2.9" height="0.7" rx="0.3" fill="#3a3f45" />
        {/* cab (left-front) with glass */}
        <rect x="-1.3" y="-1.15" width="1.05" height="1.35" rx="0.15" fill="#1b2530" stroke="#0e1318" strokeWidth="0.05" />
        <rect x="-1.2" y="-1.05" width="0.85" height="0.55" rx="0.08" fill="#56c7db" opacity="0.35" />
        {/* engine grille */}
        {[0, 1, 2].map((i) => <line key={i} x1="0.25" x2="1.2" y1={0.3 + i * 0.22} y2={0.3 + i * 0.22} stroke="#8a6710" strokeWidth="0.06" />)}
      </g>
      {label && (
        <g transform="translate(3.35 -0.2)">
          <rect x="-1.25" y="-0.38" width="2.5" height="0.7" rx="0.12" fill="#101317" stroke="#2a3139" strokeWidth="0.04" />
          <text x="0" y="0.12" textAnchor="middle" fontSize="0.42" fill="#e9edf0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{label}</text>
        </g>
      )}
    </g>
  );
}
