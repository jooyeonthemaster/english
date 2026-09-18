"use client";

// 리포트 API 조회 훅 — GET /api/admin/analytics/<report>?<공용 쿼리>&<추가 파라미터>
// 서버 액션 금지(I7): 라우트 핸들러를 react-query 로 병렬 조회한다.

import { useQuery } from "@tanstack/react-query";
import { useAnalyticsParams } from "./use-analytics-params";

export class ReportError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function fetchReport<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ReportError(body?.error ?? `요청 실패 (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export interface UseReportOptions {
  /** 추가 쿼리 파라미터(리포트 전용) */
  params?: Record<string, string | number | null | undefined>;
  /** 폴링 주기(ms). 탭이 숨겨지면 react-query 가 멈춘다. */
  refetchInterval?: number;
  enabled?: boolean;
}

export function useReport<T>(report: string, opts: UseReportOptions = {}) {
  const { sharedQuery } = useAnalyticsParams();
  const extra = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== null && v !== undefined && v !== "") extra.set(k, String(v));
  }
  const qs = [sharedQuery, extra.toString()].filter(Boolean).join("&");
  const url = `/api/admin/analytics/${report}${qs ? `?${qs}` : ""}`;

  return useQuery<T, ReportError>({
    queryKey: ["admin-analytics", url],
    queryFn: () => fetchReport<T>(url),
    staleTime: opts.refetchInterval ? 0 : 60_000,
    refetchInterval: opts.refetchInterval,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    enabled: opts.enabled ?? true,
    retry: (count, err) => err.status !== 401 && count < 1,
  });
}
