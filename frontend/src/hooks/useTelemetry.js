import { useEffect, useState } from 'react';

// Machine telemetry now arrives with the live snapshot (see useLiveScenario). Only the clock lives here.
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}
