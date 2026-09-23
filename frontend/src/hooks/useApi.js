import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data from the API with loading / error state. `reload()` refetches; `setData` allows optimistic updates. */
export function useApi(fetcher, deps = [], { enabled = true, interval } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const alive = useRef(true);
  const run = useCallback(async (quiet = false) => {
    if (!enabled) return;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current) setState((s) => ({ ...s, error, loading: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false; }; }, [run]);
  useEffect(() => {
    if (!interval || !enabled) return undefined;
    const id = setInterval(() => run(true), interval);
    return () => clearInterval(id);
  }, [interval, enabled, run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Debounced async call – used for sliders that query the model. Keeps the last good result while loading. */
export function useDebouncedModel(fn, deps, delay = 160) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const id = setTimeout(async () => {
      try {
        const data = await fn();
        if (my === seq.current) setState({ data, error: null, loading: false });
      } catch (error) {
        if (my === seq.current) setState((s) => ({ ...s, error, loading: false }));
      }
    }, delay);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Throttled model call for continuously changing inputs (e.g. a walking worker): at most one request per
 *  `ms`, always with the latest inputs, never overlapping. Returns the last result. */
export function useThrottledModel(fn, key, ms = 250) {
  const [state, setState] = useState({ data: null, error: null });
  const latest = useRef({ fn, key });
  latest.current = { fn, key };
  const inflight = useRef(false);
  const sentKey = useRef(null);
  useEffect(() => {
    const tick = async () => {
      const { fn: f, key: k } = latest.current;
      if (inflight.current || k === sentKey.current) return;
      inflight.current = true; sentKey.current = k;
      try { const data = await f(); setState({ data, error: null }); } catch (error) { setState((s) => ({ ...s, error })); }
      finally { inflight.current = false; }
    };
    tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms]);
  return state;
}
