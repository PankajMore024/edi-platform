import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> { data?: T; loading: boolean; error?: string; reload: () => void; }

/** Minimal data-fetching hook: runs `fn` on mount (and when `deps` change), tracks loading/error. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true });
  const [nonce, setNonce] = useState(0);

  const run = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e: Error) => live && setState({ loading: false, error: e.message || String(e) }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  useEffect(run, [run]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
