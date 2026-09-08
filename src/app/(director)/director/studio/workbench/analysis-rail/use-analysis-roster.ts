"use client";

// ============================================================================
// 레일 [학생] 탭 — **클래스 로스터** 슬라이스 (26-09-04)
// 정본: docs/exam-analysis-v4-spec.md §10
//
// 사용자 지시: "당연히 저 학생 목록에는 해당 클래스의 모든 학생이 보여야지. 그리고
// 그 학생들에게 해당 시험지 링크를 보낼 수 있도록 해줘야 하는 거라고."
//
// 종전 [학생] 탭은 ExamReportStudent(응시·등록된 학생)만 그렸다. 자체 시험지는
// 응시가 곧 등록이라 **아직 안 본 학생은 화면에 존재하지 않았고**, 그래서 링크를
// 보낼 대상조차 고를 수 없었다. 이 훅이 선택된 클래스의 로스터 전원을 가져와
// 「미응시」 축을 만든다.
//
// 페치 계약(use-analysis-source·use-studio-students 관례 답습):
// · **셸 1인스턴스**가 소유한다 — 레일은 aside·드로어 두 트리에 동시 마운트되므로
//   컴포넌트 로컬 effect 페치는 2중 발사된다.
// · 키 = `${analysisId}::${classId}`. 같은 키는 1회만 요청한다(실패도 자동 재시도
//   금지 — 무한 GET 루프 차단). [다시 시도]가 force=true 로만 연다.
// · **리셋 effect 없음**: 적재분에 키를 새겨 두고 **노출 산식**이 현재 분석과
//   대조해 거른다(교차 오염 0). effect 로 상태를 지우면 1렌더 지연 + 캐스케이드가
//   되고 레일 관례(react-hooks/set-state-in-effect)에도 걸린다.
// · reloadRoster() 는 변이(링크 발급 = 로스터 행이 등록됨으로 이동) 후 수렴용.
// ============================================================================

import { useCallback, useMemo, useRef, useState } from "react";
import {
  listExamClassRoster,
  listExamClassRosterByExam,
  type ExamRosterEntry,
} from "@/actions/exam-report";

/**
 * 로스터 스코프(26-09-04 §14) — 분석 행이 있으면 그 행, 아직 없는 **후보**면
 * 시험지(examId). 후보 레일도 클래스 학생을 보여주고 링크를 보낼 수 있어야 한다.
 */
export type RosterTarget =
  | { kind: "analysis"; id: string }
  | { kind: "exam"; id: string };

export type RosterPhase = "idle" | "loading" | "ready" | "error";

export interface AnalysisRosterSlice {
  /** 선택 클래스의 로스터 전원(등록 여부 포함). 미요청·실패·타분석 적재분이면 null. */
  roster: ExamRosterEntry[] | null;
  rosterPhase: RosterPhase;
  /** 첫 요청(analysisId × classId 당 1회). force=true 는 실패 잠금까지 푼다. */
  ensureRoster: (classId: string, force?: boolean) => void;
  /** 변이 후 재조회(현재 키 그대로) */
  reloadRoster: () => void;
}

interface RosterState {
  /** `${analysisId}::${classId}` — 노출 산식의 대조 기준 */
  key: string;
  rows: ExamRosterEntry[] | null;
  phase: RosterPhase;
}

const keyOf = (scopeId: string, classId: string) => `${scopeId}::${classId}`;

export function useAnalysisRoster(target: RosterTarget | null): AnalysisRosterSlice {
  const scopeId = target ? `${target.kind}:${target.id}` : null;
  const [state, setState] = useState<RosterState | null>(null);
  /** 마지막으로 **요청한** 키 — dedup 판정 + 스테일 응답 폐기(이벤트 경로에서만 변이). */
  const requestedRef = useRef<string | null>(null);

  const load = useCallback(
    (key: string, t: RosterTarget, classId: string) => {
    requestedRef.current = key;
    setState({ key, rows: null, phase: "loading" });
    void (t.kind === "analysis"
      ? listExamClassRoster(t.id, classId)
      : listExamClassRosterByExam(t.id, classId))
      .then((rows) => {
        if (requestedRef.current !== key) return; // 늦게 온 옛 요청 폐기
        setState({ key, rows, phase: "ready" });
      })
      .catch(() => {
        if (requestedRef.current !== key) return;
        setState({ key, rows: null, phase: "error" });
      });
    },
    [],
  );

  const ensureRoster = useCallback(
    (classId: string, force = false) => {
      if (!target || !scopeId || !classId) return;
      const key = keyOf(scopeId, classId);
      if (!force && requestedRef.current === key) return;
      load(key, target, classId);
    },
    [target, scopeId, load],
  );

  const reloadRoster = useCallback(() => {
    const key = requestedRef.current;
    if (!key || !target || !scopeId) return;
    const sep = key.indexOf("::");
    const classId = sep >= 0 ? key.slice(sep + 2) : "";
    if (classId) load(keyOf(scopeId, classId), target, classId);
  }, [target, scopeId, load]);

  // 노출 산식 — 현재 분석의 적재분만 내보낸다(다른 분석을 선택하면 즉시 비워진다).
  const visible = useMemo<{ roster: ExamRosterEntry[] | null; phase: RosterPhase }>(() => {
    if (!scopeId || !state) return { roster: null, phase: "idle" };
    if (!state.key.startsWith(`${scopeId}::`)) return { roster: null, phase: "idle" };
    return { roster: state.rows, phase: state.phase };
  }, [scopeId, state]);

  return {
    roster: visible.roster,
    rosterPhase: visible.phase,
    ensureRoster,
    reloadRoster,
  };
}
