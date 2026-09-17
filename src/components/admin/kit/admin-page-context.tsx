"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// 페이지가 자기 제목·경로를 셸에 알려 상단 바가 브레드크럼을 그리게 한다.
// PageHeader 가 등록하고, 등록이 없으면 셸이 사이드바 메뉴에서 유추한다.

export type AdminCrumb = { label: string; href?: string };
export type AdminPageInfo = { title: string; crumbs?: AdminCrumb[] };

const Ctx = createContext<{
  page: AdminPageInfo | null;
  setPage: (page: AdminPageInfo | null) => void;
} | null>(null);

export function AdminPageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<AdminPageInfo | null>(null);
  const value = useMemo(() => ({ page, setPage }), [page]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminPage(): AdminPageInfo | null {
  return useContext(Ctx)?.page ?? null;
}

/** PageHeader 전용 — 마운트 시 등록, 언마운트 시 해제. */
export function useRegisterAdminPage(info: AdminPageInfo) {
  const ctx = useContext(Ctx);
  const setPage = ctx?.setPage;
  const key = JSON.stringify(info);
  useEffect(() => {
    if (!setPage) return;
    setPage(JSON.parse(key) as AdminPageInfo);
    return () => setPage(null);
  }, [setPage, key]);
}
