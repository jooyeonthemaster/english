"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// 작업 영역(예: 시험지 생성)이 "지금은 공간이 필요하니 사이드바를 접어달라"고
// 요청할 수 있게 해주는 컨텍스트. AdminShell 이 이 요청을 읽어 사이드바를 강제로
// 접고, 요청이 풀리면 사용자가 직접 설정해 둔 상태로 복원한다(review-drawer 와 동일 패턴).
interface SidebarFocusContextValue {
  collapseRequested: boolean;
  setCollapseRequested: (next: boolean) => void;
}

const SidebarFocusContext = createContext<SidebarFocusContextValue | null>(null);

export function SidebarFocusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapseRequested, setCollapseRequestedState] = useState(false);

  const setCollapseRequested = useCallback((next: boolean) => {
    setCollapseRequestedState(next);
  }, []);

  const value = useMemo<SidebarFocusContextValue>(
    () => ({ collapseRequested, setCollapseRequested }),
    [collapseRequested, setCollapseRequested],
  );

  return (
    <SidebarFocusContext.Provider value={value}>
      {children}
    </SidebarFocusContext.Provider>
  );
}

export function useSidebarFocus(): SidebarFocusContextValue {
  const ctx = useContext(SidebarFocusContext);
  if (!ctx) {
    return { collapseRequested: false, setCollapseRequested: () => {} };
  }
  return ctx;
}
