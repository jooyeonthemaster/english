"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ModalContextValue = {
  isOpen: boolean;
  acquire: () => () => void;
};

const TutorModalContext = createContext<ModalContextValue | null>(null);

export function TutorModalProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const acquire = useCallback(() => {
    setCount((value) => value + 1);
    return () => setCount((value) => Math.max(0, value - 1));
  }, []);

  const value = useMemo<ModalContextValue>(
    () => ({ isOpen: count > 0, acquire }),
    [count, acquire],
  );

  return <TutorModalContext.Provider value={value}>{children}</TutorModalContext.Provider>;
}

export function useTutorModalLock(active: boolean) {
  const ctx = useContext(TutorModalContext);
  useEffect(() => {
    if (!ctx || !active) return undefined;
    const release = ctx.acquire();
    return release;
  }, [ctx, active]);
}

export function useTutorModalOpen(): boolean {
  const ctx = useContext(TutorModalContext);
  return ctx?.isOpen ?? false;
}
