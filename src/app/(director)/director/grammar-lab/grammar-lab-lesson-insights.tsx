"use client";

// ============================================================================
// 개념 학습(레슨) 인사이트 — 로더 + 목록 셀.
//
// 드릴 숙달도(정답률)와 다른 축이다. 학생이 개념 레슨에서 스스로 남긴 신호
// (완료 여부 · 이해도 자기평가 · 필기)를 본다. 데이터 출처는 신규 서버 액션
// getAcademyLessonInsights 하나이며, 목록 서버 액션(listGrammarLabStudents)의
// 반환 타입과 결합하지 않는다.
//
// 테이블과 취약 개념 랭킹이 같은 페이지에서 동시에 필요로 하므로, 여기서
// 프라미스를 1회로 합친다.
// ============================================================================

import { useEffect, useState } from "react";

import {
  getAcademyLessonInsights,
  type AcademyLessonInsights,
  type StudentLessonSummary,
} from "@/actions/grammar-drill-insights";

/** 짧은 TTL — SPA 재진입 시에는 다시 부른다 */
const INSIGHTS_TTL_MS = 60_000;

let insightsCache: {
  at: number;
  promise: Promise<AcademyLessonInsights>;
} | null = null;

function loadInsights(): Promise<AcademyLessonInsights> {
  const now = Date.now();
  if (!insightsCache || now - insightsCache.at > INSIGHTS_TTL_MS) {
    const promise = getAcademyLessonInsights().catch((e) => {
      insightsCache = null; // 실패는 캐시하지 않는다
      throw e;
    });
    insightsCache = { at: now, promise };
  }
  return insightsCache.promise;
}

/**
 * 학원 레슨 인사이트.
 * 부모가 `provided` 로 내려주면 그대로 쓰고(서버 조회), 생략하면 마운트 시 1회 조회한다.
 *
 * 반환값: `undefined` = 로딩 중, `null` = 데이터 없음/실패(화면은 "—" 로 떨어진다).
 */
export function useAcademyLessonInsights(
  provided?: AcademyLessonInsights | null,
): AcademyLessonInsights | null | undefined {
  const [fetched, setFetched] = useState<
    AcademyLessonInsights | null | undefined
  >(undefined);

  useEffect(() => {
    if (provided !== undefined) return;
    let alive = true;
    loadInsights().then(
      (data) => {
        if (alive) setFetched(data);
      },
      () => {
        if (alive) setFetched(null); // 목록 자체는 죽이지 않는다
      },
    );
    return () => {
      alive = false;
    };
  }, [provided]);

  return provided !== undefined ? provided : fetched;
}

/** 목록 "개념 학습" 셀 — 완료 n/75 진행바 + 필기·자신 없음 보조 신호 */
export function LessonCell({
  summary,
  totalConcepts,
  loading,
  studentName,
}: {
  summary: StudentLessonSummary | undefined;
  /** 커리큘럼 전체 개념 수(분모) */
  totalConcepts: number;
  loading: boolean;
  studentName: string;
}) {
  if (loading) {
    return (
      <span
        className="block h-1.5 w-20 animate-pulse rounded-full bg-slate-100"
        aria-label="개념 학습 지표를 불러오는 중입니다"
      />
    );
  }
  if (!summary || summary.started === 0 || totalConcepts === 0) {
    return <span className="text-slate-300">—</span>;
  }

  const pct = Math.min(
    100,
    Math.round((summary.completed / totalConcepts) * 100),
  );
  const inProgress = summary.started - summary.completed;

  return (
    <div
      className="flex flex-col gap-0.5"
      title={`${studentName} — 개념 레슨 완료 ${summary.completed}개 · 진행 중 ${inProgress}개 · 필기 ${summary.notesWritten}개 · 자신 없음 ${summary.lowConfidence}개`}
    >
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-500"
            style={{ width: `${pct > 0 ? Math.max(2, pct) : 0}%` }}
          />
        </div>
        <span className="text-[12px] tabular-nums text-slate-600">
          <span className="font-semibold text-slate-800">
            {summary.completed}
          </span>
          /{totalConcepts}
        </span>
      </div>
      <span className="whitespace-nowrap text-[11px] text-slate-400">
        {inProgress > 0 ? `진행 중 ${inProgress}개 · ` : ""}
        필기 {summary.notesWritten}개
        {summary.lowConfidence > 0 ? (
          <span className="font-medium text-rose-500">
            {" · 자신 없음 "}
            {summary.lowConfidence}개
          </span>
        ) : null}
      </span>
    </div>
  );
}
