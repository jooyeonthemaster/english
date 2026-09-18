"use client";

// 유입 분석 공용 URL 상태 — 기간(range/from/to)·필터·내부 트래픽 포함 여부.
// 모든 리포트 화면이 같은 쿼리스트링을 공유한다(탭 이동 시 유지).

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const FILTER_KEYS = [
  "channel",
  "source",
  "medium",
  "campaign",
  "device",
  "browser",
  "os",
  "inApp",
  "country",
  "region",
  "entry",
  "page",
  "area",
  "loggedIn",
  "referrerHost",
  "link",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * 탭 이동 시 유지할 공용 파라미터.
 * `model`(귀속 모델)은 유입경로·전환가입 두 탭이 같은 키를 읽는다 — 여기 없으면 탭을 옮길 때
 * 조용히 first 로 되돌아가 두 탭이 서로 다른 수치를 보인다(실측: direct 5 vs 3).
 */
const SHARED_KEYS = ["range", "from", "to", "internal", "model", ...FILTER_KEYS];

/** 히스토리에 쌓을지(뒤로가기로 되돌릴 수 있는 변화인지) */
export type HistoryMode = "push" | "replace" | "auto";

/** 드릴다운처럼 「되돌아갈 수 있어야 하는」 파라미터들 */
const PUSH_KEYS = new Set<string>([...FILTER_KEYS, "session", "flow"]);

export function useAnalyticsParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /** 리포트 API 에 그대로 넘길 공용 쿼리스트링 */
  const sharedQuery = useMemo(() => {
    const out = new URLSearchParams();
    for (const k of SHARED_KEYS) {
      const v = sp.get(k);
      if (v) out.set(k, v);
    }
    return out.toString();
  }, [sp]);

  const filters = useMemo(() => {
    const f: Partial<Record<FilterKey, string>> = {};
    for (const k of FILTER_KEYS) {
      const v = sp.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [sp]);

  const update = useCallback(
    (patch: Record<string, string | null>, opts: { history?: HistoryMode } = {}) => {
      const next = new URLSearchParams(sp.toString());
      let adds = false;
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else {
          if (PUSH_KEYS.has(k) && sp.get(k) !== v) adds = true;
          next.set(k, v);
        }
      }
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      // 필터 추가·드로어 열기는 push(뒤로가기 = 그 변화만 취소). 기간·내부 토글 같은 설정과
      // 필터 해제는 replace — 전부 replace 였을 때는 행을 누르고 뒤로가기하면 /admin 으로 나가버렸다.
      const mode = opts.history ?? "auto";
      const push = mode === "push" || (mode === "auto" && adds);
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [sp, router, pathname],
  );

  const setFilter = useCallback(
    (key: FilterKey, value: string | null) => update({ [key]: value }),
    [update],
  );

  return {
    range: sp.get("range") ?? "7d",
    from: sp.get("from"),
    to: sp.get("to"),
    includeInternal: sp.get("internal") === "include",
    filters,
    sharedQuery,
    update,
    setFilter,
    /** 원시 파라미터(리포트 전용 파라미터 읽기용) */
    get: (key: string) => sp.get(key),
  };
}

/** 공용 파라미터를 유지한 채 다른 탭/리포트 경로로 가는 href */
export function withSharedQuery(href: string, sharedQuery: string): string {
  return sharedQuery ? `${href}?${sharedQuery}` : href;
}
