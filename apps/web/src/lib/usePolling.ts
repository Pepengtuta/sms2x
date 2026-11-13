import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Re-runs a loader on an interval so the dashboard reflects live device state.
 *
 * - Fires immediately, then every `intervalMs`.
 * - Pauses while the tab is hidden and catches up when it becomes visible.
 * - Serialises calls, so a poll can never race a mutation's reload and paint
 *   stale data over a fresh result.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs = 15000) {
  const [refreshedAt, setRefreshedAt] = useState(0);
  const saved = useRef(fn);
  const inFlight = useRef(false);

  useEffect(() => {
    saved.current = fn;
  });

  const run = useCallback(async (force = false) => {
    // A background tab must not hit the API.
    if (!force && document.hidden) return;
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await saved.current();
    } catch {
      // A failed poll is not fatal; the next tick retries.
    } finally {
      inFlight.current = false;
      setRefreshedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    run(true);
    const timer = window.setInterval(() => run(), intervalMs);
    const onVisibility = () => {
      if (!document.hidden) run(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run, intervalMs]);

  return { refreshedAt, refresh: () => run(true) };
}
