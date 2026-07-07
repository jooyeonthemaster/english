"use client";

// ============================================================================
// 문항 분석 저장 파이프라인 훅 — analysis-step 에서 로직 불변으로 분리(파일 500줄
// 미만 유지). version CAS + 낙관 갱신(workingRef 선반영) + 충돌 시 재페치라는
// 기존 계약을 그대로 유지한다. 프레젠테이션은 analysis-step 이 담당.
// ============================================================================

import { useCallback, useState } from "react";
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
  updateAnalysisEdits,
  updateExamMap,
} from "@/actions/exam-report";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

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
  const [saving, setSaving] = useState(false);

  // ── 문항 분석 편집 저장(updateAnalysisEdits, version CAS) ─────────────────
  const persistAnalysis = useCallback(
    async (nextAnalysis: ExamAnalysisResult, nextReviewState: ExamReviewState) => {
      const version = workingRef.current.version;
      workingRef.current = {
        ...workingRef.current,
        analysis: nextAnalysis,
        reviewState: nextReviewState,
        version: version + 1,
      };
      setSaving(true);
      try {
        const res = await updateAnalysisEdits(id, nextAnalysis, nextReviewState, version);
        if (res.ok) {
          onChangeRef.current({
            ...detailRef.current,
            analysis: nextAnalysis,
            reviewState: nextReviewState,
            version: version + 1,
          });
        } else if (res.error === "VERSION_CONFLICT") {
          toast.error("다른 곳에서 수정되었습니다. 새로고침 해주세요");
          await refreshDetail();
        } else {
          toast.error("저장할 수 없는 형식입니다.");
          await refreshDetail();
        }
      } catch {
        toast.error("저장 중 오류가 발생했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [id, detailRef, onChangeRef, workingRef, refreshDetail],
  );

  // ── 채점 지도 편집 저장(updateExamMap, version CAS) ───────────────────────
  const persistExamMap = useCallback(
    async (nextExamMap: ExamMap) => {
      const version = workingRef.current.version;
      workingRef.current = {
        ...workingRef.current,
        examMap: nextExamMap,
        version: version + 1,
      };
      setSaving(true);
      try {
        const res = await updateExamMap(id, nextExamMap, version);
        if (res.ok) {
          onChangeRef.current({
            ...detailRef.current,
            examMap: nextExamMap,
            version: version + 1,
          });
          // 배점/정답 수정은 이미 확정·공유 중인 학생 점수를 재집계한다 — 조용한 변경을
          // 막기 위해 영향 학생 수를 고지한다(청사진 §6).
          if (res.affectedStudents && res.affectedStudents > 0) {
            toast.info(`학생 ${res.affectedStudents}명의 점수가 재집계되었습니다.`);
          }
        } else if (res.error === "VERSION_CONFLICT") {
          toast.error("다른 곳에서 수정되었습니다. 새로고침 해주세요");
          await refreshDetail();
        } else {
          toast.error("저장할 수 없는 형식입니다.");
          await refreshDetail();
        }
      } catch {
        toast.error("저장 중 오류가 발생했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [id, detailRef, onChangeRef, workingRef, refreshDetail],
  );

  const handleEditMapEntry = useCallback(
    (number: string, patch: Partial<ExamMapEntry>) => {
      const cur = workingRef.current.examMap;
      if (!cur) return;
      const key = numberKey(number);
      const nextQuestions = cur.questions.map((q) =>
        numberKey(q.number) === key ? { ...q, ...patch } : q,
      );
      // B1: totalPoints 파괴 방지 — 전 문항 배점이 non-null 일 때만 합계로 갱신하고,
      // null 이 하나라도 있으면 기존 totalPoints 를 보존한다(부분 입력이 총점을 0 으로
      // 오염시키는 것 차단). grading.ts 는 배점 전량 존재 시에만 합을 만점으로 쓴다.
      const allPointsPresent = nextQuestions.every((q) => q.points != null);
      const totalPoints = allPointsPresent
        ? nextQuestions.reduce((sum, q) => sum + (q.points ?? 0), 0)
        : cur.totalPoints;
      void persistExamMap({ ...cur, questions: nextQuestions, totalPoints });
    },
    [workingRef, persistExamMap],
  );

  // ── examMap 확인 완료(confirmExamMap) ─────────────────────────────────────
  const handleConfirmMap = useCallback(async () => {
    const version = workingRef.current.version;
    const nextReviewState: ExamReviewState = {
      ...workingRef.current.reviewState,
      mapConfirmed: true,
    };
    workingRef.current = {
      ...workingRef.current,
      reviewState: nextReviewState,
      version: version + 1,
    };
    setSaving(true);
    try {
      const res = await confirmExamMap(id, version);
      if (res.ok) {
        onChangeRef.current({
          ...detailRef.current,
          reviewState: nextReviewState,
          version: version + 1,
        });
      } else {
        toast.error("다른 곳에서 수정되었습니다. 새로고침 해주세요");
        await refreshDetail();
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [id, detailRef, onChangeRef, workingRef, refreshDetail]);

  // ── 문항 분석 카드 편집/검수 ──────────────────────────────────────────────
  const handleEditField = useCallback(
    (number: string, patch: Partial<QuestionAnalysis>) => {
      const cur = workingRef.current.analysis;
      if (!cur) return;
      const nextPer = cur.perQuestion.map((q) =>
        numberKey(q.number) === numberKey(number) ? { ...q, ...patch } : q,
      );
      void persistAnalysis({ ...cur, perQuestion: nextPer }, workingRef.current.reviewState);
    },
    [workingRef, persistAnalysis],
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
      void persistAnalysis(cur, { ...rs, confirmedNumbers: nextConfirmed });
    },
    [workingRef, persistAnalysis],
  );

  const handleConfirmAll = useCallback(() => {
    const cur = workingRef.current.analysis;
    if (!cur) return;
    const okNumbers = cur.perQuestion
      .filter((q) => q.analysisStatus === "OK")
      .map((q) => q.number);
    void persistAnalysis(cur, {
      ...workingRef.current.reviewState,
      confirmedNumbers: okNumbers,
    });
  }, [workingRef, persistAnalysis]);

  return {
    saving,
    handleEditMapEntry,
    handleConfirmMap,
    handleEditField,
    handleToggleConfirm,
    handleConfirmAll,
  };
}
