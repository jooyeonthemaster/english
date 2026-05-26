"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface ReviewDrawerState {
  isOpen: boolean;
  width: number;
}

interface ReviewDrawerContextValue extends ReviewDrawerState {
  setOpen: (next: { isOpen: boolean; width?: number }) => void;
}

const ReviewDrawerContext = createContext<ReviewDrawerContextValue | null>(
  null,
);

export function ReviewDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ReviewDrawerState>({
    isOpen: false,
    width: 0,
  });

  const setOpen = useCallback<ReviewDrawerContextValue["setOpen"]>((next) => {
    setState((prev) => ({
      isOpen: next.isOpen,
      width: next.isOpen ? (next.width ?? prev.width) : 0,
    }));
  }, []);

  const value = useMemo<ReviewDrawerContextValue>(
    () => ({ ...state, setOpen }),
    [state, setOpen],
  );

  return (
    <ReviewDrawerContext.Provider value={value}>
      {children}
    </ReviewDrawerContext.Provider>
  );
}

export function useReviewDrawer(): ReviewDrawerContextValue {
  const ctx = useContext(ReviewDrawerContext);
  if (!ctx) {
    return { isOpen: false, width: 0, setOpen: () => {} };
  }
  return ctx;
}
