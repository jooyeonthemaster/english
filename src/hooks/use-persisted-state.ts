"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState backed by localStorage. The stored value is restored on mount and
 * any change is written back, so UI preferences (grid/list view, etc.) survive
 * navigation and reloads.
 *
 * SSR-safe: the initial render uses `defaultValue` (so server and client markup
 * match), then the stored value is applied in an effect after hydration.
 *
 * @param storageKey   localStorage key — use a stable, namespaced string.
 * @param defaultValue value used when nothing valid is stored.
 * @param isValid      optional guard; a stored value that fails it is ignored.
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
  isValid?: (value: unknown) => value is T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  // Restore once, after hydration, to avoid SSR/client markup mismatches.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as unknown;
        if (!isValid || isValid(parsed)) {
          setValue(parsed as T);
        }
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    hydrated.current = true;
    // storageKey is expected to be stable for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist on change, but not before the restore pass has run (so we don't
  // clobber the stored value with the default on first render).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore unavailable storage */
    }
  }, [storageKey, value]);

  return [value, setValue];
}
