"use client";

import { useCallback, useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal client-side data hook with loading / error / retry states.
 * Fetches once per dependency change.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((e: unknown) =>
        active &&
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : "Failed to load data" })
      );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, retry };
}
