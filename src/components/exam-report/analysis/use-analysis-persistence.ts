"use client";

// ============================================================================
// 문항 분석 저장 파이프라인 훅 — analysis-step 에서 분리(파일 500줄 미만 유지).
//
// [저장 재작업] 이전에는 셀 blur 마다 즉시 서버 왕복 + saving 이 표 전체를 잠갔다.
// 그 잠금은 단순 불편이 아니라 **동시 저장 방지 장치**였다 — map/analysis 저장이
// 같은 version CAS 를 공유하므로 두 저장이 겹치면 VERSION_CONFLICT 가 난다.
// 그래서 잠금을 없애려면 직렬화가 먼저다. 구조:
//
//   편집 → workingRef 즉시 반영(낙관) + onChange 로 화면 갱신 → dirty 표시
//        → 500ms 디바운스 → flush(단일 인플라이트, 직렬)
//   저장 중 들어온 편집은 dirty 로 쌓였다가 같은 루프에서 이어 저장(코얼레싱)
//   → 입력은 한 번도 잠기지 않는다.
//
// version 은 **서버 성공 후에만** 올린다. 과거엔 await 전에 낙관적으로 올려서
// 네트워크 오류(catch)가 나면 재페치도 없이 version 만 어긋난 채 남아, 이후 모든
// 저장이 영구히 충돌하는 잠복 버그가 있었다.
//
// 1회성 액션(확인 토글 등)은 runOneShot 으로 큐와 직렬화한다 — 예약된 저장을 먼저
// 흘려 version 정합을 맞춘 뒤 실행해야 reviewState 를 서로 덮어쓰지 않는다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ExamAnalysisDetail } from "../ui-contracts";
import type {
  ExamAnalysisResult,
  ExamMap,
  ExamMapEntry,
  ExamReviewState,
  QuestionAnalysis,
} from "@/lib/exam-report/types";
import {
  confirmExamMap,
  setMapQuestionConfirmed,
  updateAnalysisEdits,
  updateExamMap,
} from "@/actions/exam-report";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** 입력이 멎고 이만큼 지나면 한 번에 저장(핸드오프 스펙: 500ms 디바운스 배치). */
const SAVE_DEBOUNCE_MS = 500;

/** 화면 표시용 저장 상태 — 입력을 막지 않고 상태만 알린다. */
export type SaveState = "idle" | "saving" | "error";

/** 낙관 갱신 기준이 되는 작업 사본 — analysis-step 이 소유·동기화한다. */
export interface WorkingState {
  analysis: ExamAnalysisResult | null;
  reviewState: ExamReviewState;
  examMap: ExamMap | null;
  version: number;
}

/** useRef 반환값 호환 구조 타입(React 19 RefObject 제네릭 의존 회피). */
interface MutableRef<T> {
  current: T;
}

interface UseAnalysisPersistenceOpts {
  id: string;
  detailRef: MutableRef<ExamAnalysisDetail>;
  onChangeRef: MutableRef<(next: ExamAnalysisDetail) => void>;
  workingRef: MutableRef<WorkingState>;
  refreshDetail: () => Promise<void>;
}

export function useAnalysisPersistence({
  id,
  detailRef,
  onChangeRef,
  workingRef,
  refreshDetail,
}: UseAnalysisPersistenceOpts) {
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // 저장 큐 — map/analysis 는 같은 version CAS 를 공유하므로 큐를 하나로 둔다.
  const dirtyRef = useRef({ map: false, analysis: false });
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** examMap 1회 저장 — 성공 시에만 version 을 올린다. false = 중단(재페치됨). */
  const saveMapOnce = useCallback(async (): Promise<boolean> => {
    const snapshot = workingRef.current.examMap;
    if (!snapshot) return true;
    const version = workingRef.current.version;
    const res = await updateExamMap(id, snapshot, version);
    if (res.ok) {
      // 서버가 값 변경 문항의 확인을 해제하므로 그 결과를 권위로 받아 동기화한다
      // (클라 낙관 해제와 서버 판정이 어긋나지 않게).
      const nextReviewState = res.reviewState ?? workingRef.current.reviewState;
      workingRef.current = {
        ...workingRef.current,
        reviewState: nextReviewState,
        version: version + 1,
      };
      onChangeRef.current({
        ...detailRef.current,
        examMap: snapshot,
        reviewState: nextReviewState,
        version: version + 1,
      });
      // 배점/정답 수정은 이미 확정·공유 중인 학생 점수를 재집계한다 — 조용한 변경을
      // 막기 위해 영향 학생 수를 고지한다(청사진 §6).
      if (res.affectedStudents && res.affectedStudents > 0) {
        toast.info(`학생 ${res.affectedStudents}명의 점수가 재집계되었습니다.`);
      }
      return true;
    }
    toast.error(
      res.error === "VERSION_CONFLICT"
        ? "다른 곳에서 수정되었습니다. 최신 내용을 다시 불러왔어요."
        : "저장할 수 없는 형식입니다.",
    );
    await refreshDetail();
    return false;
  }, [id, detailRef, onChangeRef, workingRef, refreshDetail]);

  /** 문항 분석(해설 등) + reviewState 1회 저장. */
  const saveAnalysisOnce = useCallback(async (): Promise<boolean> => {
    const snapshot = workingRef.current.analysis;
    if (!snapshot) return true;
    const reviewState = workingRef.current.reviewState;
    const version = workingRef.current.version;
    const res = await updateAnalysisEdits(id, snapshot, reviewState, version);
    if (res.ok) {
      workingRef.current = { ...workingRef.current, version: version + 1 };
      onChangeRef.current({
        ...detailRef.current,
        analysis: snapshot,
        reviewState,
        version: version + 1,
      });
      return true;
    }
    toast.error(
      res.error === "VERSION_CONFLICT"
        ? "다른 곳에서 수정되었습니다. 최신 내용을 다시 불러왔어요."
        : "저장할 수 없는 형식입니다.",
    );
    await refreshDetail();
    return false;
  }, [id, detailRef, onChangeRef, workingRef, refreshDetail]);

  /**
   * 더티 항목을 직렬로 비운다. 이미 진행 중이면 그 완료를 그대로 기다린다.
   * 저장 중 들어온 편집은 while 루프가 다시 집어가므로 입력을 잠글 필요가 없다.
   */
  const flush = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!dirtyRef.current.map && !dirtyRef.current.analysis) {
      return Promise.resolve();
    }
    const run = (async () => {
      setSaveState("saving");
      try {
        while (dirtyRef.current.map || dirtyRef.current.analysis) {
          if (dirtyRef.current.map) {
            dirtyRef.current.map = false;
            if (!(await saveMapOnce())) {
              // 재페치로 워킹 사본이 갈렸다 — 남은 더티는 버린다(스테일 덮어쓰기 방지).
              dirtyRef.current.analysis = false;
              setSaveState("error");
              return;
            }
          }
          if (dirtyRef.current.analysis) {
            dirtyRef.current.analysis = false;
            if (!(await saveAnalysisOnce())) {
              dirtyRef.current.map = false;
              setSaveState("error");
              return;
            }
          }
        }
        setSaveState("idle");
      } catch {
        // 네트워크 오류 — version 을 올리지 않았으므로 재시도가 안전하다.
        toast.error("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        setSaveState("error");
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [saveMapOnce, saveAnalysisOnce]);

  /** 더티 표시 + 디바운스 예약. 편집 자체는 호출부가 이미 낙관 반영해 둔다. */
  const schedule = useCallback(
    (kind: "map" | "analysis") => {
      dirtyRef.current[kind] = true;
      setSaveState("saving");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  /** 예약분을 즉시 흘리고 끝날 때까지 기다린다(1회성 액션 전 version 정합 확보). */
  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await flush();
  }, [flush]);

  /** 큐와 직렬화되는 1회성 액션(확인 토글 등). */
  const runOneShot = useCallback(
    async (fn: () => Promise<void>) => {
      await flushNow();
      const run = (async () => {
        setSaveState("saving");
        try {
          await fn();
          setSaveState("idle");
        } catch {
          toast.error("저장 중 오류가 발생했습니다.");
          setSaveState("error");
        } finally {
          inFlightRef.current = null;
        }
      })();
      inFlightRef.current = run;
      await run;
    },
    [flushNow],
  );

  // 언마운트 시 예약분을 흘려보낸다(탭 전환으로 마지막 타이핑이 날아가지 않게).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current.map || dirtyRef.current.analysis) void flush();
    },
    [flush],
  );

  // ── 채점 지도 인라인 편집 ─────────────────────────────────────────────────
  const handleEditMapEntry = useCallback(
    (number: string, patch: Partial<ExamMapEntry>) => {
      const cur = workingRef.current.examMap;
      if (!cur) return;
      const key = numberKey(number);
      const before = cur.questions.find((q) => numberKey(q.number) === key);
      const nextQuestions = cur.questions.map((q) =>
        numberKey(q.number) === key ? { ...q, ...patch } : q,
      );
      // B1: totalPoints 파괴 방지 — 전 문항 배점이 non-null 일 때만 합계로 갱신하고,
      // null 이 하나라도 있으면 기존 totalPoints 를 보존한다(부분 입력이 총점을 0 으로
      // 오염시키는 것 차단). grading.ts 는 배점 전량 존재 시에만 합을 만점으로 쓴다.
      // ※ 화면의 "입력분 부분 합계"는 이 저장 총점과 별개인 표시 전용 계산이다.
      const allPointsPresent = nextQuestions.every((q) => q.points != null);
      const totalPoints = allPointsPresent
        ? nextQuestions.reduce((sum, q) => sum + (q.points ?? 0), 0)
        : cur.totalPoints;
      const nextExamMap = { ...cur, questions: nextQuestions, totalPoints };

      // 값이 바뀌면 확인을 즉시 해제해 게이트 카운터가 바로 줄게 한다(낙관).
      // 서버도 같은 규칙으로 판정하며 응답 reviewState 로 최종 동기화된다.
      const after = nextQuestions.find((q) => numberKey(q.number) === key);
      const valueChanged =
        !!before &&
        !!after &&
        (before.points !== after.points ||
          before.correctAnswer !== after.correctAnswer ||
          before.kind !== after.kind);
      const rs = workingRef.current.reviewState;
      const nextReviewState =
        valueChanged && (rs.mapConfirmedNumbers?.length ?? 0) > 0
          ? {
              ...rs,
              mapConfirmedNumbers: (rs.mapConfirmedNumbers ?? []).filter(
                (n) => numberKey(n) !== key,
              ),
            }
          : rs;

      workingRef.current = {
        ...workingRef.current,
        examMap: nextExamMap,
        reviewState: nextReviewState,
      };
      // 낙관 반영 — 타이핑이 즉시 화면에 남는다(저장 완료를 기다리지 않는다).
      onChangeRef.current({
        ...detailRef.current,
        examMap: nextExamMap,
        reviewState: nextReviewState,
      });
      schedule("map");
    },
    [workingRef, detailRef, onChangeRef, schedule],
  );

  // ── 정답·배점 문항별 확인 토글(학생 관리 게이트 근거) ─────────────────────
  const handleToggleMapConfirm = useCallback(
    (numbers: string[], confirmed: boolean) =>
      runOneShot(async () => {
        const version = workingRef.current.version;
        const res = await setMapQuestionConfirmed(id, version, numbers, confirmed);
        if (!res.ok) {
          toast.error("다른 곳에서 수정되었습니다. 최신 내용을 다시 불러왔어요.");
          await refreshDetail();
          return;
        }
        const rs = workingRef.current.reviewState;
        const next = new Set(rs.mapConfirmedNumbers ?? []);
        for (const n of numbers) {
          if (confirmed) next.add(n);
          else next.delete(n);
        }
        const nextReviewState = { ...rs, mapConfirmedNumbers: [...next] };
        workingRef.current = {
          ...workingRef.current,
          reviewState: nextReviewState,
          version: version + 1,
        };
        onChangeRef.current({
          ...detailRef.current,
          reviewState: nextReviewState,
          version: version + 1,
        });
      }),
    [id, runOneShot, workingRef, detailRef, onChangeRef, refreshDetail],
  );

  // ── (레거시) examMap 일괄 확인 — 문항별 확인 UI 도입 후 제거 예정 ──────────
  const handleConfirmMap = useCallback(
    () =>
      runOneShot(async () => {
        const version = workingRef.current.version;
        const res = await confirmExamMap(id, version);
        if (!res.ok) {
          toast.error("다른 곳에서 수정되었습니다. 최신 내용을 다시 불러왔어요.");
          await refreshDetail();
          return;
        }
        const nextReviewState: ExamReviewState = {
          ...workingRef.current.reviewState,
          mapConfirmed: true,
        };
        workingRef.current = {
          ...workingRef.current,
          reviewState: nextReviewState,
          version: version + 1,
        };
        onChangeRef.current({
          ...detailRef.current,
          reviewState: nextReviewState,
          version: version + 1,
        });
      }),
    [id, runOneShot, workingRef, detailRef, onChangeRef, refreshDetail],
  );

  // ── 문항 분석 카드 편집/검수 ──────────────────────────────────────────────
  const handleEditField = useCallback(
    (number: string, patch: Partial<QuestionAnalysis>) => {
      const cur = workingRef.current.analysis;
      if (!cur) return;
      const nextPer = cur.perQuestion.map((q) =>
        numberKey(q.number) === numberKey(number) ? { ...q, ...patch } : q,
      );
      const nextAnalysis = { ...cur, perQuestion: nextPer };
      workingRef.current = { ...workingRef.current, analysis: nextAnalysis };
      onChangeRef.current({ ...detailRef.current, analysis: nextAnalysis });
      schedule("analysis");
    },
    [workingRef, detailRef, onChangeRef, schedule],
  );

  /**
   * 시험지 총평(examLevel) 편집 — 이 페이지의 목적이 "AI 결과 검수"인데 총평만
   * 유일하게 손댈 수 없었다(핸드오프 스펙 지적). examLevel 은 analysis 의 일부라
   * 기존 updateAnalysisEdits 경로를 그대로 탄다.
   */
  const handleEditExamLevel = useCallback(
    (patch: Partial<NonNullable<ExamAnalysisResult["examLevel"]>>) => {
      const cur = workingRef.current.analysis;
      if (!cur?.examLevel) return;
      const nextAnalysis = {
        ...cur,
        examLevel: { ...cur.examLevel, ...patch },
      };
      workingRef.current = { ...workingRef.current, analysis: nextAnalysis };
      onChangeRef.current({ ...detailRef.current, analysis: nextAnalysis });
      schedule("analysis");
    },
    [workingRef, detailRef, onChangeRef, schedule],
  );

  const handleToggleConfirm = useCallback(
    (number: string) => {
      const cur = workingRef.current.analysis;
      if (!cur) return;
      const rs = workingRef.current.reviewState;
      const confirmed = rs.confirmedNumbers ?? [];
      const key = numberKey(number);
      const exists = confirmed.some((n) => numberKey(n) === key);
      const nextConfirmed = exists
        ? confirmed.filter((n) => numberKey(n) !== key)
        : [...confirmed, number];
      const nextReviewState = { ...rs, confirmedNumbers: nextConfirmed };
      workingRef.current = { ...workingRef.current, reviewState: nextReviewState };
      onChangeRef.current({
        ...detailRef.current,
        reviewState: nextReviewState,
      });
      schedule("analysis");
    },
    [workingRef, detailRef, onChangeRef, schedule],
  );

  // ── (레거시) 분석 검수 일괄 완료 — 핸드오프 스펙상 제거 대상(사람 검수 우회) ──
  const handleConfirmAll = useCallback(() => {
    const cur = workingRef.current.analysis;
    if (!cur) return;
    const okNumbers = cur.perQuestion
      .filter((q) => q.analysisStatus === "OK")
      .map((q) => q.number);
    const nextReviewState = {
      ...workingRef.current.reviewState,
      confirmedNumbers: okNumbers,
    };
    workingRef.current = { ...workingRef.current, reviewState: nextReviewState };
    onChangeRef.current({ ...detailRef.current, reviewState: nextReviewState });
    schedule("analysis");
  }, [workingRef, detailRef, onChangeRef, schedule]);

  return {
    saveState,
    /** @deprecated 잠금용 boolean — 저장은 더 이상 입력을 막지 않는다. */
    saving: saveState === "saving",
    flushNow,
    handleEditMapEntry,
    handleToggleMapConfirm,
    handleConfirmMap,
    handleEditField,
    handleEditExamLevel,
    handleToggleConfirm,
    handleConfirmAll,
  };
}
