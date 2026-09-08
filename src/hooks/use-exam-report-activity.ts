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
   * 분석 원천 — "INTERNAL" = 자체 생성 시험지 합성 분석(sourceExamId 보유).
   * 구버전 API 는 미포함이므로 optional 로 안전 소비한다("MANUAL" 동치).
   */
  sourceType?: string;
  /** sourceType==="INTERNAL" 일 때 원본 시험지(Exam) id — "시험지 열기" 딥링크용 */
  sourceExamId?: string | null;
  /**
   * 시험지 sourceFiles 가 하나라도 있는지. 등록 도중 실패한 "고아 DRAFT"
   * (sourceFiles 없는 DRAFT·학생 0명) 판별에 쓴다. 구버전 API 는 미포함이므로
   * undefined 는 "미상(고아 아님)"으로 취급한다.
   */
  hasSourceFiles?: boolean;
  /**
   * 카드 좌측 썸네일용 1쪽 스토리지 경로(page 오름차순 첫 장). 서명 URL 이
   * 아니라 경로이며, 카드가 source-urls 라우트로 지연 서명해 표시한다.
   * INTERNAL(사진 없음)·고아 DRAFT·구버전 API 에서는 null/undefined.
   */
  thumbnailPath?: string | null;
  /**
   * 분석 진행률(aiMeta.progress). 서버(W1)가 배치 커밋마다 기록한다.
   * 구버전 API/진행 기록 전에는 미포함이므로 optional 로 안전 소비한다.
   */
  progress?: ExamAnalysisProgress | null;
  /** 분석 실패(미분석) 문항 수 — aiMeta.failedNumbers 길이 */
  failedCount?: number;
  /** v4 퍼널 스칼라(서버 계산) — 구버전 API 는 미포함이므로 optional 소비. */
  funnel?: ExamReportFunnel;
  createdAt: string;
  updatedAt: string;
}

/**
 * 퍼널 학생 집계(v4, docs/exam-analysis-v4-spec.md §2.1) — 서버(목록 API)와 클라
 * (detail)가 **같은 함수** summarizeFunnelStudents(next-step.ts)로 만든다.
 * need* 는 「지금 이 단계가 필요한 학생 수」(학생 단위 정밀 판정 — 집계만으로는
 * 교집합을 표현할 수 없어 서버가 행 단위로 센다).
 */
export interface ExamReportFunnelStudents {
  total: number;
  answerIssued: number;
  answerSubmitted: number;
  graded: number;
  reportGenerated: number;
  reportGenerating: number;
  reportFailed: number;
  shared: number;
  /** 미채점 + 미제출 + 답안 링크 미발급(비INTERNAL) */
  needLink: number;
  /** 미채점 + 미제출 + 링크 발급됨 */
  awaitingAnswer: number;
  /** 미채점 + 제출됨(INTERNAL 은 미채점 전부) */
  needGrading: number;
  /** 채점 확정 + 리포트 NONE|FAILED */
  needReport: number;
  /** 리포트 GENERATED + 공유 꺼짐 */
  needShare: number;
}

export interface ExamReportBoostSnapshot {
  status: "RUNNING" | "DONE" | "FAILED";
  startedAt: number;
  completed: number;
  total: number;
  /**
   * DONE 인데 총평(examLevel) 합성만 실패 — 문항 분석은 저장돼 있다. 다음 단계는
   * 「총평 다시 생성」(synthOnly, 무과금)이지 전액 재과금이 아니다. 키는 true 일 때만.
   */
  synthFailed?: boolean;
  /**
   * RUNNING 좀비(BOOST_STALE_MS 초과)를 FAILED 로 강등한 스냅샷 — 라우트가 종료
   * 기록을 못 남겼으므로 환불 여부를 알 수 없다(레일 자구가 「환불」을 단언하지
   * 않게 하는 근거). 키는 true 일 때만.
   */
  stale?: boolean;
  /** aiMeta.boost.error 원문(CHARGE_FAILED·ALL_BATCHES_FAILED·예외 메시지 절단본). */
  error?: string;
}

/** 서버 계산 퍼널 스칼라 묶음(v4) — raw JSON 은 여전히 목록 응답에 싣지 않는다. */
export interface ExamReportFunnel {
  questionCount: number;
  confirmedCount: number;
  gateOpen: boolean;
  grandfathered: boolean;
  hasExamLevel: boolean;
  /** INTERNAL: SHALLOW=합성만 / DEEP=examLevel 有. 비INTERNAL: ANALYZED&&examLevel→DEEP */
  depth: "NONE" | "SHALLOW" | "DEEP";
  boost: ExamReportBoostSnapshot | null;
  students: ExamReportFunnelStudents;
}

/** `?include=candidates` — INTERNAL 분석 행이 아직 없는 자체 시험지(분석 전 후보). */
export interface ExamCandidateRow {
  examId: string;
  title: string;
  questionCount: number;
  classId: string | null;
  examType: string | null;
  updatedAt: string;
}

interface SummaryResponse {
  analyses?: ExamReportSummaryRow[];
  candidates?: ExamCandidateRow[];
}

const ACTIVE_STATUSES = new Set<ExamAnalysisStatus>(["ANALYZING"]);

export interface UseExamReportActivityResult {
  analyses: ExamReportSummaryRow[];
  /** includeCandidates 일 때만 채워진다(아니면 빈 배열). */
  candidates: ExamCandidateRow[];
  /** 첫 응답 도착 전 — 스켈레톤 판정(고정 타이머 아님) */
  loading: boolean;
  /** 데이터 없이 첫 페치가 실패한 상태 — 재시도 배너 판정 */
  error: boolean;
  refresh: () => void;
  /**
   * 성공 응답마다 1 증가(첫 응답 = 1). 스튜디오 판이 「새 응답이 왔는가」와
   * 「목록이 그대로인가」를 구분하는 데 쓴다(U4 focus 순서 — 같은 배열 참조가
   * 다시 내려와도 seq 로 구분). 실패·중단 응답에는 오르지 않는다.
   */
  responseSeq: number;
}

/**
 * 즉시 재조회 이벤트 — board-shared 의 fire 헬퍼가 POST 를 발사한 직후와 응답이
 * 돌아온 직후 dispatch 한다. 유휴 폴은 30초까지 백오프해 있어, 이 신호가 없으면
 * 「AI 심층 분석」을 눌러도 카드가 최대 30초 「분석 전」으로 남고 재클릭은 409 를
 * 맞는다(레일의 8초 요청 잠금이 먼저 풀린다). 훅은 enabled 일 때만 듣는다.
 */
export const EXAM_REPORT_REFRESH_EVENT = "exam-report:refresh";

export interface UseExamReportActivityOptions {
  /**
   * false 면 폴을 아예 돌리지 않는다(effect 미기동 — 기존 폴은 teardown).
   * 스튜디오 「시험 분석」 뷰(26-09-01)가 hidden 유지 마운트 상태에서 폴링하지
   * 않기 위한 게이트 — 「신규 폴링은 뷰 가시일 때만」 규칙의 이행부다.
   * 미전달(허브)은 true — 기존 호출부 무회귀.
   */
  enabled?: boolean;
  /**
   * v4 — 미분석 자체 시험지 후보를 함께 받는다(`?include=candidates`). 스튜디오
   * 「자체 시험지」 그룹 전용. 미전달(허브)은 false — 응답·서명 무회귀.
   */
  includeCandidates?: boolean;
}

export function useExamReportActivity(
  options?: UseExamReportActivityOptions,
): UseExamReportActivityResult {
  const enabled = options?.enabled ?? true;
  const includeCandidates = options?.includeCandidates ?? false;
  const [analyses, setAnalyses] = useState<ExamReportSummaryRow[]>([]);
  const [candidates, setCandidates] = useState<ExamCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [responseSeq, setResponseSeq] = useState(0);
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
    if (!enabled) return;
    // 발사 헬퍼의 즉시 재조회 신호 — refresh() 는 nonce 를 올려 이 effect 를 재실행
    // (기존 폴 teardown → 새 폴이 activeMs 부터 즉시 1회). 리스너는 effect 와 수명을
    // 같이 해 hidden 뷰(enabled=false)에서는 듣지 않는다.
    const onRefresh = () => refresh();
    window.addEventListener(EXAM_REPORT_REFRESH_EVENT, onRefresh);
    const stopPoll = startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 30_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            includeCandidates
              ? "/api/exam-report/analyses?view=summary&include=candidates"
              : "/api/exam-report/analyses?view=summary",
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
          const cands = includeCandidates ? (data.candidates ?? []) : [];
          loadedRef.current = true;
          setAnalyses(rows);
          setCandidates(cands);
          setLoading(false);
          setError(false);
          setResponseSeq((n) => n + 1);

          // v4: 심층 분석(boost) RUNNING 도 활성 — 5초 주기 유지(카드 글로우 실황).
          const hasActive = rows.some(
            (r) =>
              ACTIVE_STATUSES.has(r.status) ||
              r.funnel?.boost?.status === "RUNNING",
          );
          // 서명에 progress.completed 를 포함해 진행률 갱신만으로도 변화로 감지.
          // v4: boost 상태·진행, 퍼널 need* 합, 후보 id 목록도 서명에 섞는다 —
          // 카드 힌트·레일 다음 단계가 폴 틱마다 수렴해야 한다.
          const sig = rows
            .map((r) => {
              const f = r.funnel;
              const funnelSig = f
                ? `${f.depth}:${f.boost?.status ?? ""}:${f.boost?.completed ?? ""}:${f.gateOpen ? 1 : 0}:${f.confirmedCount}:${f.students.needLink}:${f.students.needGrading}:${f.students.needReport}:${f.students.needShare}:${f.students.reportGenerating}`
                : "";
              return `${r.id}:${r.status}:${r.progress?.completed ?? ""}:${r.studentCount}:${funnelSig}`;
            })
            .concat(cands.map((c) => `c:${c.examId}:${c.questionCount}`))
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
    return () => {
      window.removeEventListener(EXAM_REPORT_REFRESH_EVENT, onRefresh);
      stopPoll();
    };
  }, [nonce, enabled, includeCandidates, refresh]);

  return { analyses, candidates, loading, error, refresh, responseSeq };
}
