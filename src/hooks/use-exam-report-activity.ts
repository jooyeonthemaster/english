"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import type {
  ExamAnalysisProgress,
  ExamAnalysisStatus,
  ExamType,
} from "@/lib/exam-report/types";

// ─────────────────────────────────────────────────────────────────────────────
// 학생 시험 리포트 — 최근 분석 요약 폴링 훅
//
// 허브·라이브러리의 "분석 현황 보드"가 다른 탭에서 시작된 분석의 상태 변화를
// 새로고침 없이 반영하도록 요약 GET 을 어댑티브 폴링한다. ANALYZING 이 하나라도
// 있으면 5초 주기를 유지하고(서명에 시각 혼입으로 백오프 차단), 전부 안정
// 상태면 30초까지 백오프한다. loading/error 는 "첫 응답" 기준의 실제 상태 —
// 가짜 타이머 스켈레톤을 대체한다.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/exam-report/analyses?view=summary 응답 행 */
export interface ExamReportSummaryRow {
  id: string;
  title: string;
  status: ExamAnalysisStatus;
  schoolName: string | null;
  grade: string | null;
  examType: ExamType;
  studentCount: number;
  /** 리포트 생성 완료(GENERATED) 학생 수 */
  reportCount?: number;
  /**
   * 시험지 sourceFiles 가 하나라도 있는지. 등록 도중 실패한 "고아 DRAFT"
   * (sourceFiles 없는 DRAFT·학생 0명) 판별에 쓴다. 구버전 API 는 미포함이므로
   * undefined 는 "미상(고아 아님)"으로 취급한다.
   */
  hasSourceFiles?: boolean;
  /**
   * 분석 진행률(aiMeta.progress). 서버(W1)가 배치 커밋마다 기록한다.
   * 구버전 API/진행 기록 전에는 미포함이므로 optional 로 안전 소비한다.
   */
  progress?: ExamAnalysisProgress | null;
  /** 분석 실패(미분석) 문항 수 — aiMeta.failedNumbers 길이 */
  failedCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface SummaryResponse {
  analyses?: ExamReportSummaryRow[];
}

const ACTIVE_STATUSES = new Set<ExamAnalysisStatus>(["ANALYZING"]);

export interface UseExamReportActivityResult {
  analyses: ExamReportSummaryRow[];
  /** 첫 응답 도착 전 — 스켈레톤 판정(고정 타이머 아님) */
  loading: boolean;
  /** 데이터 없이 첫 페치가 실패한 상태 — 재시도 배너 판정 */
  error: boolean;
  refresh: () => void;
}

export function useExamReportActivity(): UseExamReportActivityResult {
  const [analyses, setAnalyses] = useState<ExamReportSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 한 번이라도 성공 응답을 받았는지 — 이후의 일시 실패는 조용히 무시(폴이 재시도).
  const loadedRef = useRef(false);
  // refresh(): nonce 를 올려 effect 를 재실행 → 기존 폴 teardown 후 즉시 재폴링.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => {
    setError(false);
    if (!loadedRef.current) setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 30_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            "/api/exam-report/analyses?view=summary",
            { credentials: "include", cache: "no-store", signal },
          );
          if (!res.ok) {
            if (!loadedRef.current) {
              setLoading(false);
              setError(true);
            }
            return null;
          }
          const data = (await res.json()) as SummaryResponse;
          if (signal.aborted) return null;
          const rows = data.analyses ?? [];
          loadedRef.current = true;
          setAnalyses(rows);
          setLoading(false);
          setError(false);

          const hasActive = rows.some((r) => ACTIVE_STATUSES.has(r.status));
          // 서명에 progress.completed 를 포함해 진행률 갱신만으로도 변화로 감지.
          const sig = rows
            .map(
              (r) =>
                `${r.id}:${r.status}:${r.progress?.completed ?? ""}:${r.studentCount}`,
            )
            .join("|");
          // 진행 중이면 서명에 시각을 섞어 백오프를 막아 상태 변화를 빠르게 감지.
          return hasActive ? `${sig}|t${Date.now()}` : sig || "empty";
        } catch {
          if (signal.aborted) return null;
          if (!loadedRef.current) {
            setLoading(false);
            setError(true);
          }
          return null;
        }
      },
    });
  }, [nonce]);

  return { analyses, loading, error, refresh };
}
