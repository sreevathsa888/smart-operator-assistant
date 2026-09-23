import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Header, MobileNav, ROUTES } from './components/Shell.jsx';
import { InterventionAlert } from './components/InterventionAlert.jsx';
import { useLiveScenario } from './hooks/useLiveScenario.js';
import { useTelemetry } from './hooks/useTelemetry.js';
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
  const [route, setRoute] = useState(readHash);
  const [whatIfPreset, setWhatIfPreset] = useState(null);
  const [resolvedFlash, setResolvedFlash] = useState(false);
  const live = useLiveScenario();
  const telemetry = useTelemetry();

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const nav = (id) => {
    setRoute(id);
    try { history.replaceState(null, '', `#${id}`); } catch { /* sandboxed */ }
    document.getElementById('main')?.scrollTo({ top: 0 });
  };

  const takeAction = () => {
    live.resolve();
    setResolvedFlash(true);
    setTimeout(() => setResolvedFlash(false), 3200);
  };
  const simulateSafer = () => {
    setWhatIfPreset({ ...live.ALERT });
    live.dismiss();
    nav('whatif');
  };

  const showOverlay = route !== 'safety' && (live.phase === 'alert' || (resolvedFlash && live.phase === 'resolved'));

  const ctx = { live, telemetry, nav, takeAction, simulateSafer, whatIfPreset };
  const screens = {
    overview: <Overview {...ctx} />,
    machine: <LiveMachine {...ctx} />,
    tasks: <Tasks {...ctx} />,
    safety: <SafetyCenter {...ctx} />,
    twin: <OperatorTwin {...ctx} />,
    training: <TrainingHub {...ctx} />,
    simulator: <Suspense fallback={<div className="p-10 text-ink3">Loading 3D scene…</div>}><Simulator {...ctx} /></Suspense>,
    replay: <SafetyReplay {...ctx} />,
    whatif: <WhatIf {...ctx} />,
    analytics: <Analytics {...ctx} />,
  };

  return (
    <div className="app-ground flex h-full overflow-hidden">
      <Sidebar route={route} onNav={nav} riskLevel={live.risk.level} />
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <Header route={route} onDemo={() => { live.trigger(); }} phase={live.phase} />
        <main id="main" className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
              className="px-4 lg:px-6 py-6 pb-28 md:pb-10 max-w-[1600px] mx-auto">
              {screens[route]}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav route={route} onNav={nav} />
      <AnimatePresence>
        {showOverlay && (
          <InterventionAlert key="alert" scenario={live.state} risk={live.risk} resolved={live.phase === 'resolved'}
            onTake={takeAction} onDismiss={() => { live.dismiss(); setResolvedFlash(false); }} onSimulate={simulateSafer} />
        )}
      </AnimatePresence>
    </div>
  );
}
