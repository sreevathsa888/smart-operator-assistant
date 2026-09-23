import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Header, MobileNav, ROUTES } from './components/Shell.jsx';
import { InterventionAlert } from './components/InterventionAlert.jsx';
import { ErrorBox } from './components/ApiState.jsx';
import { useLiveScenario } from './hooks/useLiveScenario.js';
import Login from './screens/Login.jsx';
import Overview from './screens/Overview.jsx';
import LiveMachine from './screens/LiveMachine.jsx';
import Tasks from './screens/Tasks.jsx';
import SafetyCenter from './screens/SafetyCenter.jsx';
import OperatorTwin from './screens/OperatorTwin.jsx';
import TrainingHub from './screens/TrainingHub.jsx';
import SafetyReplay from './screens/SafetyReplay.jsx';
import WhatIf from './screens/WhatIf.jsx';
import Analytics from './screens/Analytics.jsx';

const Simulator = lazy(() => import('./screens/Simulator.jsx'));

const readHash = () => {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  return ROUTES.some((r) => r.id === h) ? h : 'overview';
};

export default function App() {
  const [session, setSession] = useState(null);
  if (!session) return <Login onLogin={setSession} />;
  return <Main session={session} onLogout={() => setSession(null)} />;
}

function Main({ session, onLogout }) {
  const { operatorId, machineId } = session;
  const [route, setRoute] = useState(readHash);
  const [whatIfPreset, setWhatIfPreset] = useState(null);
  const [hideOverlay, setHideOverlay] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);          // bump → screens refetch (e.g. after training)
  const live = useLiveScenario(machineId, operatorId);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // a new alert always shows the overlay again; a finished event refreshes event-dependent screens
  useEffect(() => { if (live.phase === 'alert') setHideOverlay(false); if (live.phase === 'normal') setDataVersion((v) => v + 1); }, [live.phase]);

  const nav = (id) => {
    setRoute(id);
    try { history.replaceState(null, '', `#${id}`); } catch { /* sandboxed */ }
    document.getElementById('main')?.scrollTo({ top: 0 });
  };
  const takeAction = () => live.resolve();
  const simulateSafer = () => {
    if (live.state) setWhatIfPreset({ ...live.state, eventId: live.eventId });
    live.dismiss();
    nav('whatif');
  };

  const showOverlay = route !== 'safety' && !hideOverlay && live.ready && ['alert', 'resolving', 'resolved'].includes(live.phase);
  const openWhatIf = (preset) => { setWhatIfPreset(preset); nav('whatif'); };
  const ctx = { live, telemetry: live.telemetry, nav, takeAction, simulateSafer, whatIfPreset, openWhatIf, operatorId, machineId,
    session, dataVersion, refresh: () => setDataVersion((v) => v + 1) };
  const screens = {
    overview: <Overview {...ctx} />, machine: <LiveMachine {...ctx} />, tasks: <Tasks {...ctx} />, safety: <SafetyCenter {...ctx} />,
    twin: <OperatorTwin {...ctx} />, training: <TrainingHub {...ctx} />,
    simulator: <Suspense fallback={<div className="p-10 text-ink3">Loading 3D scene…</div>}><Simulator {...ctx} /></Suspense>,
    replay: <SafetyReplay {...ctx} />, whatif: <WhatIf {...ctx} />, analytics: <Analytics {...ctx} />,
  };

  return (
    <div className="app-ground flex h-full overflow-hidden">
      <Sidebar route={route} onNav={nav} riskLevel={live.risk?.level ?? 'low'} operatorId={operatorId} onLogout={onLogout} />
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <Header route={route} onDemo={live.trigger} phase={live.phase} machine={session.operator} machineId={machineId} connected={!live.error} />
        <main id="main" className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
              className="px-4 lg:px-6 py-6 pb-28 md:pb-10 max-w-[1600px] mx-auto">
              {live.error && !live.ready ? <ErrorBox error={live.error} onRetry={live.retry} /> : screens[route]}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav route={route} onNav={nav} />
      <AnimatePresence>
        {showOverlay && (
          <InterventionAlert key="alert" scenario={live.state} risk={live.risk} predicted={live.predicted} alert={live.alert} phase={live.phase}
            onTake={takeAction} onDismiss={() => { if (live.phase === 'alert') live.dismiss(); setHideOverlay(true); }} onSimulate={simulateSafer} />
        )}
      </AnimatePresence>
    </div>
  );
}
