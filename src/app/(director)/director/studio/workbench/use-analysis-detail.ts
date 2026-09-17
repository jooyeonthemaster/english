"use client";

// ============================================================================
// 시험 분석 우측 레일 — 선택 분석 상세 페치 훅 (스튜디오 셸 단독 소유)
//
// **셸에서 정확히 1회 호출**한다(정본 §3.10.28 — A17 계열): 레일 본문은 aside
// (≥xl 표시)와 <xl 드로어 두 트리에 같은 엘리먼트로 들어가는데, 페치를 레일
// 컴포넌트 안에 두면 CSS 숨김 마운트 조합에서 2중 페치가 된다. 훅을 셸로
// 끌어올려 데이터 1벌을 두 렌더가 나눠 쓴다.
//
// **keep-previous(26-09-01 레일 콘솔 개편 — 적대검수 C-1)**: 같은 analysisId 의
// 재조회(refreshKey bump — 인라인 변이 성공·복귀 수렴·수동 새로고침)에서는
// 이전 detail 을 유지한 채 조용히 갈아끼운다. 구현 초안처럼 매 재조회마다
// detail 을 null 로 비우면 레일 전체가 스켈레톤으로 붕괴(백지 플래시)한다 —
// 워크스페이스 B4(workspace-client 의 fetch→setDetail)와 같은 비파괴 계약.
// 재조회 실패도 기존 detail 이 있으면 그대로 둔다(스테일 > 백지).
//
// **patchDetail**: 레일 인라인 변이(공유 토글·학생 삭제 등)의 낙관 갱신 채널
// (적대검수 C-2 — setter 없이는 students-tab 낙관 관례를 미러할 수 없다).
//
// 폴링하지 않는다 — B-10(상세 캐시·카드별 폴링 금지) 준수. 재조회 트리거는
// (id 변경, refreshKey 변경)뿐. ANALYZING 실황은 요약 폴(row.progress)이 담당
// 하고, 이 훅은 ANALYZING 인 동안 페치를 쉰다(터미널 전이 시 자동 재조회).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamAnalysisDetail } from "@/components/exam-report/ui-contracts";

export interface AnalysisDetailState {
  detail: ExamAnalysisDetail | null;
  loading: boolean;
  /** 404 포함 — 레일이 "찾을 수 없음"으로 강등(삭제 직후 선택 잔존 케이스) */
  error: boolean;
  /** 낙관 갱신 — detail 이 있을 때만 적용된다(없으면 무시). */
  patchDetail: (
    updater: (current: ExamAnalysisDetail) => ExamAnalysisDetail,
  ) => void;
}

export function useAnalysisDetail(
  analysisId: string | null,
  /** ANALYZING 동안 true — 페치를 쉰다(터미널 전이에 dep 변화로 자동 재조회) */
  analyzing: boolean,
  refreshKey: number,
): AnalysisDetailState {
  const [state, setState] = useState<{
    detail: ExamAnalysisDetail | null;
    loading: boolean;
    error: boolean;
  }>({ detail: null, loading: false, error: false });
  // 마지막으로 성공 로드한 id — 같은 id 재조회(keep-previous) 판정 기준.
  const loadedIdRef = useRef<string | null>(null);

  const patchDetail = useCallback(
    (updater: (current: ExamAnalysisDetail) => ExamAnalysisDetail) => {
      setState((s) => (s.detail ? { ...s, detail: updater(s.detail) } : s));
    },
    [],
  );

  useEffect(() => {
    if (!analysisId || analyzing) {
      loadedIdRef.current = null;
      setState({ detail: null, loading: false, error: false });
      return;
    }
    const keep = loadedIdRef.current === analysisId;
    const ac = new AbortController();
    setState((prev) => ({
      detail: keep ? prev.detail : null,
      // keep-previous 재조회는 기존 화면을 유지한 채 조용히 — 스피너는 첫 로드만.
      loading: keep ? prev.detail == null : true,
      error: false,
    }));
    void (async () => {
      try {
        const res = await fetch(`/api/exam-report/analyses/${analysisId}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) {
          if (!ac.signal.aborted)
            setState((prev) =>
              keep && prev.detail
                ? { ...prev, loading: false }
                : { detail: null, loading: false, error: true },
            );
          return;
        }
        const data = (await res.json()) as { analysis?: ExamAnalysisDetail };
        if (ac.signal.aborted) return;
        if (data.analysis) loadedIdRef.current = analysisId;
        setState((prev) => ({
          detail: data.analysis ?? (keep ? prev.detail : null),
          loading: false,
          error: !data.analysis && !(keep && prev.detail),
        }));
      } catch {
        if (!ac.signal.aborted)
          setState((prev) =>
            keep && prev.detail
              ? { ...prev, loading: false }
              : { detail: null, loading: false, error: true },
          );
      }
    })();
    return () => ac.abort();
  }, [analysisId, analyzing, refreshKey]);

  return { ...state, patchDetail };
}
