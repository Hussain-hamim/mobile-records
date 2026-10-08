import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../data/shop-queries";

/** Each filter/scope change aborts the old request; late results never enter the new list. */
export function useServerPage<T extends { id: string }, C>(
  load: (cursor: C | null, signal: AbortSignal) => Promise<Page<T, C>>,
  key: string,
  enabled = true,
  debounceMs = 250,
) {
  const loader = useRef(load);
  useEffect(() => { loader.current = load; });
  const active = useRef<{
    key: string;
    controller: AbortController;
    busy: boolean;
    next: C | null;
    started: boolean;
  } | null>(null);
  const [state, setState] = useState<{
    key: string;
    items: T[];
    next: C | null;
    loading: boolean;
    error: string;
  }>({ key: "", items: [], next: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const request = useCallback(
    async (session: NonNullable<typeof active.current>, more: boolean) => {
      if (
        session.busy ||
        session.controller.signal.aborted ||
        (more && !session.next)
      )
        return;
      session.busy = true;
      setState((s) => ({ ...s, key: session.key, loading: true, error: "" }));
      try {
        const result = await loader.current(
          more ? session.next : null,
          session.controller.signal,
        );
        if (active.current !== session || session.controller.signal.aborted)
          return;
        session.next = result.next;
        session.started = true;
        setState((s) => ({
          key: session.key,
          items: more
            ? [
                ...new Map(
                  [...s.items, ...result.items].map((item) => [item.id, item]),
                ).values(),
              ]
            : result.items,
          next: result.next,
          loading: false,
          error: "",
        }));
      } catch (e) {
        if (active.current === session && !session.controller.signal.aborted)
          setState((s) => ({
            ...s,
            key: session.key,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          }));
      } finally {
        session.busy = false;
      }
    },
    [],
  );
  useEffect(() => {
    const session = {
      key,
      controller: new AbortController(),
      busy: false,
      next: null as C | null,
      started: false,
    };
    active.current = session;
    if (!enabled) return () => session.controller.abort();
    const timer = setTimeout(() => {
      setState({ key, items: [], next: null, loading: true, error: "" });
      void request(session, false);
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      session.controller.abort();
    };
  }, [key, enabled, attempt, debounceMs, request]);
  const current = state.key === key;
  return {
    items: current && enabled ? state.items : [],
    loading: enabled && (!current || state.loading),
    error: current ? state.error : "",
    hasMore: current && state.next !== null,
    loadMore: () => {
      const session = active.current;
      if (session && session.key === key && !state.error)
        void request(session, true);
    },
    retry: () => {
      const session = active.current;
      if (session && session.started) void request(session, true);
      else setAttempt((n) => n + 1);
    },
    reload: () => setAttempt((n) => n + 1),
  };
}
