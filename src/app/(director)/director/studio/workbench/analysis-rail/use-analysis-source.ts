"use client";

// ============================================================================
// 레일 지연 페치 3종 — 콘솔(use-analysis-console) 종속 모듈(v4, 26-09-02 분리).
//
// · 시험지 원본 서명 URL(비INTERNAL) — 첫 섹션 펼침에만 발급(마운트가 곧 POST 인
//   기존 뷰어 관례를 셸로 승격 — 적대검수 M-1 2중 POST 봉쇄). 경로키 dedup.
//   만료(30분) onError 재발급은 동시 1회 + 상한 2회(source-image-viewer 의 검증된
//   가드 이식).
// · INTERNAL 문항 전문(GET analyses/[id]/questions, AI 0콜) — 분석당 1회 dedup.
//   **실패해도 잠금을 자동으로 풀지 않는다** — 자동 경로(섹션 마운트 effect)가
//   에러 전이마다 재요청하면 무한 GET 루프(적대검수 U5-correctness-1 실측). 재시도는
//   [다시 시도] 가 force=true 로만 연다.
// · **조판된 시험지(INTERNAL [원본] 탭, 26-09-03)** — `getExamPreviewData(examId)`
//   서버 액션 1회. INTERNAL 은 사진을 안 거치므로 sourceFiles 가 null 이고,
//   「원본」의 실체는 스모트에서 조판한 그 시험지다(사용자 지시). 키는 analysisId
//   가 아니라 **examId**(row.sourceExamId) — 실패 시 잠금 유지 규약은 문항 전문과
//   동일하다.
// 분석(analysisId) 변경 시 전체 리셋. 상태 소유는 셸 1인스턴스(콘솔이 1회 호출)
// — aside·드로어 2중 마운트에서도 요청은 1회다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getExamPreviewData } from "@/actions/exams";
import type { ExamDetail } from "@/components/exams/exam-detail-client-parts/types";
import type {
  ExamReviewPayload,
  ExamSourceFile,
} from "@/components/exam-report/ui-contracts";

export type LazyPhase = "idle" | "loading" | "ready" | "error";

export interface AnalysisSourceApi {
  sourceUrls: string[];
  sourcePhase: LazyPhase;
  ensureSourceUrls: (files: ExamSourceFile[]) => void;
  reissueSourceUrls: () => void;
  reviewQuestions: ExamReviewPayload | null;
  reviewPhase: LazyPhase;
  ensureReviewQuestions: (force?: boolean) => void;
  /** 조판된 시험지 원본(INTERNAL) — null = 미조회 또는 문항 0(빈 시험지). */
  examSheet: ExamDetail | null;
  examSheetPhase: LazyPhase;
  ensureExamSheet: (examId: string, force?: boolean) => void;
}

export function useAnalysisSource(analysisId: string | null): AnalysisSourceApi {
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [sourcePhase, setSourcePhase] = useState<LazyPhase>("idle");
  const [reviewQuestions, setReviewQuestions] =
    useState<ExamReviewPayload | null>(null);
  const [reviewPhase, setReviewPhase] = useState<LazyPhase>("idle");
  const [examSheet, setExamSheet] = useState<ExamDetail | null>(null);
  const [examSheetPhase, setExamSheetPhase] = useState<LazyPhase>("idle");

  const sourcePathsRef = useRef<string | null>(null);
  const sourceReissueRef = useRef({ busy: false, count: 0 });
  const reviewLoadedForRef = useRef<string | null>(null);
  const examSheetLoadedForRef = useRef<string | null>(null);

  // ── 분석 변경 = 전체 리셋 ───────────────────────────────────────────────
  useEffect(() => {
    setSourceUrls([]);
    setSourcePhase("idle");
    setReviewQuestions(null);
    setReviewPhase("idle");
    setExamSheet(null);
    setExamSheetPhase("idle");
    sourcePathsRef.current = null;
    sourceReissueRef.current = { busy: false, count: 0 };
    reviewLoadedForRef.current = null;
    examSheetLoadedForRef.current = null;
  }, [analysisId]);

  // ── 시험지 원본 서명 URL(비INTERNAL) ────────────────────────────────────
  const fetchSourceUrls = useCallback(
    async (paths: string[]) => {
      if (!analysisId || paths.length === 0) return;
      setSourcePhase((cur) => (cur === "ready" ? "ready" : "loading"));
      try {
        const res = await fetch(
          `/api/exam-report/analyses/${analysisId}/source-urls`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
          },
        );
        const data = res.ok
          ? ((await res.json()) as { urls?: string[] })
          : null;
        const list = Array.isArray(data?.urls) ? data.urls.filter(Boolean) : [];
        if (list.length > 0) {
          setSourceUrls(list);
          setSourcePhase("ready");
        } else {
          setSourcePhase((cur) => (cur === "ready" ? "ready" : "error"));
        }
      } catch {
        setSourcePhase((cur) => (cur === "ready" ? "ready" : "error"));
      }
    },
    [analysisId],
  );

  const ensureSourceUrls = useCallback(
    (files: ExamSourceFile[]) => {
      const paths = files.map((f) => f.path).filter(Boolean);
      const key = paths.join("\n");
      if (paths.length === 0) return;
      if (sourcePathsRef.current === key) return; // 이미 발급(중복 POST 차단)
      sourcePathsRef.current = key;
      sourceReissueRef.current = { busy: false, count: 0 };
      void fetchSourceUrls(paths);
    },
    [fetchSourceUrls],
  );

  const reissueSourceUrls = useCallback(() => {
    const key = sourcePathsRef.current;
    const guard = sourceReissueRef.current;
    if (!key || guard.busy || guard.count >= 2) return;
    guard.busy = true;
    guard.count += 1;
    void fetchSourceUrls(key.split("\n")).finally(() => {
      sourceReissueRef.current.busy = false;
    });
  }, [fetchSourceUrls]);

  // ── INTERNAL 문항 전문 ──────────────────────────────────────────────────
  const ensureReviewQuestions = useCallback(
    (force = false) => {
      if (!analysisId) return;
      if (force) reviewLoadedForRef.current = null;
      if (reviewLoadedForRef.current === analysisId) return;
      reviewLoadedForRef.current = analysisId;
      setReviewPhase("loading");
      void (async () => {
        try {
          const res = await fetch(
            `/api/exam-report/analyses/${analysisId}/questions`,
            { credentials: "include", cache: "no-store" },
          );
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as ExamReviewPayload;
          setReviewQuestions(data);
          setReviewPhase("ready");
        } catch {
          // ref 는 유지 — 자동 경로(마운트 effect)가 다시 쏘지 못하게 잠근다.
          // 재시도는 [다시 시도] 의 force=true 뿐(무한 재조회 루프 차단).
          setReviewPhase("error");
        }
      })();
    },
    [analysisId],
  );

  // ── 조판된 시험지(INTERNAL [원본]) ──────────────────────────────────────
  // 키가 analysisId 가 아니라 examId 인 이유: 같은 시험지를 원천으로 하는 분석이
  // 둘 이상 있을 수 있고, 리셋은 어차피 analysisId 전이가 위에서 처리한다.
  const ensureExamSheet = useCallback((examId: string, force = false) => {
    if (!examId) return;
    if (force) examSheetLoadedForRef.current = null;
    if (examSheetLoadedForRef.current === examId) return;
    examSheetLoadedForRef.current = examId;
    setExamSheetPhase("loading");
    void (async () => {
      try {
        const data = await getExamPreviewData(examId);
        if (!data) throw new Error("not-found");
        // 문항 0 = 조판할 게 없는 시험지 — 에러가 아니라 「미리보기 없음」이다.
        setExamSheet(data as unknown as ExamDetail);
        setExamSheetPhase("ready");
      } catch {
        // ref 유지 — 자동 경로(섹션 마운트 effect)가 에러 전이마다 재요청하면
        // 무한 루프다(문항 전문과 같은 규약). 재시도는 [다시 시도] force 뿐.
        setExamSheetPhase("error");
      }
    })();
  }, []);

  // 안정 참조 — 콘솔이 useMemo deps 에 이 객체 하나를 건다.
  return useMemo<AnalysisSourceApi>(
    () => ({
      sourceUrls,
      sourcePhase,
      ensureSourceUrls,
      reissueSourceUrls,
      reviewQuestions,
      reviewPhase,
      ensureReviewQuestions,
      examSheet,
      examSheetPhase,
      ensureExamSheet,
    }),
    [
      sourceUrls,
      sourcePhase,
      ensureSourceUrls,
      reissueSourceUrls,
      reviewQuestions,
      reviewPhase,
      ensureReviewQuestions,
      examSheet,
      examSheetPhase,
      ensureExamSheet,
    ],
  );
}
