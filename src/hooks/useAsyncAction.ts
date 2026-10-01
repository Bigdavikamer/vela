import { useCallback, useEffect, useRef, useState } from 'react';

import { toVelaError, type VelaError } from '../lib/supabase';

/**
 * Runs a one-shot async action with loading and error state.
 *
 * Two things it guarantees that hand-rolled `useState` pairs usually get wrong:
 * a second tap while the first is in flight is ignored, and state is never set
 * after unmount.
 */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<VelaError | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setLoading(true);
      setError(null);

      try {
        const result = await action(...args);
        return result;
      } catch (caught) {
        const velaError = toVelaError(caught);
        if (mounted.current) setError(velaError);
        return undefined;
      } finally {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, loading, error, reset };
}
