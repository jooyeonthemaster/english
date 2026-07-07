// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 공용 모듈 (허브·라이브러리 단일 소스)
//
// 기존에 recent-analyses.tsx 와 library-list.tsx 에 복붙돼 있던 상태 뱃지·시험
// 종류 라벨·고아 DRAFT 판별과, 허브/라이브러리가 서로 다르게 계산하던 베이스
// 경로(hubBase)를 여기로 단일화한다. 분석 시작 fire-and-forget 헬퍼도 공용.
// ============================================================================

import { toast } from "sonner";
import type {
  ExamAnalysisProgress,
  ExamAnalysisStatus,
  ExamType,
} from "@/lib/exam-report/types";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";

// ── 베이스 경로 ──────────────────────────────────────────────────────────────

const BASE_MARKER = "/workbench/exam-report";
const BASE_FALLBACK = "/director/workbench/exam-report";

/**
 * 현재 pathname 에서 exam-report 베이스 경로를 계산한다(허브 방식으로 통일).
 * /director|/teacher 프리픽스를 보존하고, 마커가 없으면 director 로 폴백.
 */
export function resolveExamReportBase(
  pathname: string | null | undefined,
): string {
  if (!pathname) return BASE_FALLBACK;
  const idx = pathname.indexOf(BASE_MARKER);
  return idx >= 0 ? pathname.slice(0, idx + BASE_MARKER.length) : BASE_FALLBACK;
}

// ── 표시 메타 ────────────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<
  ExamAnalysisStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  DRAFT: {
    label: "임시저장",
    className: "border border-slate-200 bg-slate-50 text-slate-600",
  },
  ANALYZING: {
    label: "분석 중",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
    pulse: true,
  },
  ANALYZED: {
    label: "분석 완료",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  FAILED: {
    label: "실패",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
  },
};

export const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

// 고아 DRAFT: 등록 도중 실패해 sourceFiles 가 없는 DRAFT(학생 0명). 목록에서
// 숨기지 않고 "등록 미완료" 로 표시해 이어서 등록/삭제로 유도한다(D5).
export function isOrphanDraft(row: ExamReportSummaryRow): boolean {
  return (
    row.status === "DRAFT" &&
    row.hasSourceFiles === false &&
    row.studentCount === 0
  );
}

// ── 분석 시작(fire-and-forget) ────────────────────────────────────────────────

/**
 * E1 분석 시작/재개 요청을 발사한다. **await 금지** — 서버 자가연쇄(W1)가
 * 완주하므로 클라이언트는 폴링으로만 상태를 본다.
 * (중복 발사는 서버 펜스가 202 로 무해 처리)
 *
 * (결함수리) 단, 402(크레딧 부족)만은 무음 삼킴 금지 — 재시작/시작 버튼이
 * 거짓 성공처럼 보인 뒤 폴링으로도 아무 변화가 없어 허브 어디에도 크레딧 부족
 * 신호 없이 무한 재클릭 루프에 빠졌다. 그 외 상태는 기존대로 무시.
 */
export function fireAnalyzeRequest(analysisId: string): void {
  void fetch(`/api/exam-report/analyses/${analysisId}/analyze`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
    .then((res) => {
      if (res.status === 402) {
        toast.error("크레딧이 부족해 분석을 시작하지 못했습니다");
      }
    })
    .catch(() => {
      /* 폴링이 실제 상태를 반영한다 */
    });
}

// ── 진행률 표시 ──────────────────────────────────────────────────────────────

/** ETA 라벨 — msPerQuestion 실측이 있을 때만 "약 N분 남음"(최소 1분). */
export function formatAnalysisEta(
  progress: ExamAnalysisProgress | null | undefined,
): string | null {
  if (!progress) return null;
  const { completed, total, msPerQuestion } = progress;
  if (!msPerQuestion || msPerQuestion <= 0) return null;
  const remaining = total - completed;
  if (remaining <= 0) return null;
  const minutes = Math.max(1, Math.ceil((remaining * msPerQuestion) / 60_000));
  return `약 ${minutes}분 남음`;
}

/** 진행률 % (0~100). total 0/음수 방어. */
export function progressPercent(
  progress: ExamAnalysisProgress | null | undefined,
): number {
  if (!progress || progress.total <= 0) return 0;
  return Math.round(
    Math.min(1, Math.max(0, progress.completed / progress.total)) * 100,
  );
}
