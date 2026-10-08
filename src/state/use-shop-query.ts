import { useEffect, useRef, useState } from "react";

export function useShopQuery<T>(
  load: () => Promise<T>,
  key: string,
  enabled = true,
) {
  const loader = useRef(load);
  useEffect(() => { loader.current = load; });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    value: T | null;
    loading: boolean;
    error: string;
  }>({ key: "", value: null, loading: true, error: "" });
  useEffect(() => {
    let alive = true;
    if (!enabled) return;
    void loader.current().then(
      (value) => {
        if (alive) setState({ key, value, loading: false, error: "" });
      },
      (error) => {
        if (alive)
          setState({
            key,
            value: null,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, enabled, attempt]);
  return {
    value: enabled && state.key === key ? state.value : null,
    loading: enabled && (state.key !== key || state.loading),
    error: state.key === key ? state.error : "",
    retry: () => {
      setState({ key, value: null, loading: true, error: "" });
      setAttempt((v) => v + 1);
    },
  };
}
