import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { axesFrom, uiRisk, ui } from '../lib/risk.js';

// Live machine situation shared by Overview, Live Machine, Safety Center and the alert overlay.
// Everything comes from GET /api/telemetry/{machine}: synthetic sensor feed (server-side script) +
// safety-model prediction, 5 s forecast and the model-driven phase:
//   normal → approach → alert → resolving/resolved (after TAKE ACTION) or dismissed → normal
const POLL_MS = 500;
const HIST = 60;

export function useLiveScenario(machineId, operatorId) {
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState(null);
  const [prevAxes, setPrevAxes] = useState(null);
  const [hist, setHist] = useState(null);
  const [riskHist, setRiskHist] = useState([]);
  const lastPhase = useRef('normal');
  const busy = useRef(false);

  const poll = useCallback(async (withHistory = false) => {
    if (busy.current || !machineId || !operatorId) return;
    busy.current = true;
    try {
      const s = await api.telemetry(machineId, operatorId, withHistory);
      setError(null);
      setSnap(s);
      setRiskHist((h) => [...h.slice(-(HIST - 1)), s.risk.score]);
      if (s.history) setHist(s.history);
      else setHist((h) => (h ? Object.fromEntries(Object.entries(h).map(([k, arr]) => [k, [...arr.slice(1), s.telemetry[k]]])) : h));
      if (s.phase === 'normal') setPrevAxes(axesFrom(s.risk.contributions));   // ghost = last normal reading
      lastPhase.current = s.phase;
    } catch (e) {
      setError(e);
    } finally {
      busy.current = false;
    }
  }, [machineId, operatorId]);

  useEffect(() => {
    poll(true);
    const id = setInterval(() => poll(false), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const act = useCallback(async (action) => {
    try { await api.telemetryEvent(machineId, action, operatorId); } catch (e) { setError(e); }
    poll(false);
  }, [machineId, operatorId, poll]);

  const risk = snap ? uiRisk(snap.risk) : null;
  return {
    ready: !!snap, error, retry: () => poll(true),
    phase: snap?.phase ?? 'normal',
    eventId: snap?.event_id ?? null,
    state: snap?.state ?? null,
    risk,
    predicted: snap ? { ...snap.predicted, level: ui(snap.predicted.level) } : null,
    etaRestricted: snap?.eta_restricted_s ?? null,
    alert: snap?.alert ?? null,
    axes: risk ? axesFrom(risk.contributions) : [],
    prevAxes: prevAxes ?? (risk ? axesFrom(risk.contributions) : []),
    riskHist,
    telemetry: snap ? { ...snap.telemetry, hist: hist ?? { engineTemp: [], hydraulicTemp: [], fuelRate: [], load: [] } } : null,
    trigger: () => act('start'),
    resolve: () => act('stop'),
    dismiss: () => act('dismiss'),
  };
}
