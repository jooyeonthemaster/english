"use client";

// ============================================================================
// 학생 응시(배포) 탭 공용 표시 헬퍼 — V4 소유 (26-07-09 시험지 배포·OMR 대개편)
//
// 상태칩 메타·선지 토큰 관대 정규화·점수 요약 포맷·정오 아이콘. 전부 순수 표시
// 유틸(서버 의존 0). 색 계약: Toss 블루 #3182F6 + 슬레이트, 주황/앰버 금지 —
// 주의 환기는 rose 축(/a 답안입력 관례 미러).
// ============================================================================

import { Check, Circle, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoreSummaryBrief } from "@/actions/exams/assignments";

/** 문항 본문·선지 글리프 전용 폰트 — UI 크롬은 기본(Pretendard) 유지(계약). */
export const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

/** 원형 숫자 라벨 폴백 — AnswerUiSpec.optionLabels 결손 시(최대 12지 가변). */
export const CIRCLED_LABELS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫",
];

/**
 * 선지 토큰(라벨 원문 "③" | "(c)" | "3")의 0-기반 인덱스 — 표시·선택상태 판정용
 * 관대 정규화. 채점 정본은 서버 normalizeChoiceToken — 여기서는 UI 대조만.
 */
export function choiceIndexOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const token = raw.trim();
  if (!token) return null;
  const circled = CIRCLED_LABELS.indexOf(token);
  if (circled >= 0) return circled;
  const paren = /^\(?([a-l])\)?$/i.exec(token);
  if (paren) return paren[1].toLowerCase().charCodeAt(0) - 97;
  const num = /^(1[0-2]|[1-9])$/.exec(token);
  if (num) return Number(num[1]) - 1;
  return null;
}

/** 토큰 → 표시 라벨(선지 라벨 원문 우선, 원형숫자 폴백, 최후엔 토큰 원문). */
export function choiceLabelOf(
  labels: string[] | undefined,
  token: string,
): string {
  const index = choiceIndexOf(token);
  if (index == null) return token;
  return labels?.[index] ?? CIRCLED_LABELS[index] ?? token;
}

// ── 할당 상태칩(테이블·드로어 공용) ──────────────────────────────────────────

export const MODE_LABELS: Record<string, string> = {
  TABLET: "태블릿",
  OMR: "OMR",
};

interface StatusChipMeta {
  label: string;
  className: string;
}

const ASSIGNMENT_STATUS_META: Record<string, StatusChipMeta> = {
  ASSIGNED: {
    label: "미응시",
    className: "border-slate-200 bg-slate-50 text-slate-500",
  },
  IN_PROGRESS: {
    label: "응시중",
    className: "border-blue-200 bg-blue-50 text-blue-600",
  },
  SUBMITTED: {
    label: "검토 대기",
    className: "border-rose-200 bg-rose-50 text-rose-600",
  },
  GRADED: {
    label: "채점완료",
    className: "border-transparent bg-[#3182F6] text-white",
  },
};

export function AssignmentStatusChip({ status }: { status: string }) {
  const meta = ASSIGNMENT_STATUS_META[status] ?? {
    label: status,
    className: "border-slate-200 bg-slate-50 text-slate-500",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

// ── 점수 요약 포맷 ───────────────────────────────────────────────────────────

function trimNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);
}

/** "82.5 / 100 (정답 18·오답 3·부분 1)" — 형태가 어긋나면 null(추정 금지). */
export function formatScoreBrief(brief: ScoreSummaryBrief | null): string | null {
  if (!brief) return null;
  const counts = [`정답 ${brief.correctCount}`, `오답 ${brief.wrongCount}`];
  if (brief.partialCount > 0) counts.push(`부분 ${brief.partialCount}`);
  if (brief.unknownCount > 0) counts.push(`미확정 ${brief.unknownCount}`);
  if (brief.totalScore != null && brief.maxScore != null) {
    return `${trimNumber(brief.totalScore)} / ${trimNumber(brief.maxScore)} (${counts.join("·")})`;
  }
  return counts.join("·");
}

// ── 문항 정오(effectiveStatus) 표시 축 ───────────────────────────────────────

/** submission-review SubmissionReviewQuestion["effectiveStatus"] 와 동형 유니언 —
 *  서버 코어 모듈(prisma 의존)을 클라이언트로 끌어오지 않기 위한 로컬 정의. */
export type EffectiveStatusKind =
  | "CORRECT"
  | "WRONG"
  | "PARTIAL"
  | "NEEDS_REVIEW"
  | "UNKNOWN";

export const EFFECTIVE_STATUS_META: Record<EffectiveStatusKind, StatusChipMeta> = {
  CORRECT: { label: "정답", className: "border-blue-200 bg-blue-50 text-blue-600" },
  WRONG: { label: "오답", className: "border-slate-200 bg-slate-50 text-slate-500" },
  PARTIAL: { label: "부분점수", className: "border-blue-200 bg-white text-blue-600" },
  NEEDS_REVIEW: {
    label: "검토 대기",
    className: "border-rose-200 bg-rose-50 text-rose-600",
  },
  UNKNOWN: { label: "미입력", className: "border-slate-200 bg-white text-slate-400" },
};

export function EffectiveStatusChip({ status }: { status: EffectiveStatusKind }) {
  const meta = EFFECTIVE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

/**
 * 정오 아이콘(계약 §V4-c): 정답 blue-600 체크 / 오답 slate X / 부분 반원 /
 * 검토대기 링 / 미입력 dash.
 */
export function EffectiveStatusIcon({
  status,
  className,
}: {
  status: EffectiveStatusKind;
  className?: string;
}) {
  if (status === "CORRECT") {
    return <Check className={cn("size-3.5 text-blue-600", className)} strokeWidth={3} />;
  }
  if (status === "WRONG") {
    return <X className={cn("size-3.5 text-slate-400", className)} strokeWidth={2.5} />;
  }
  if (status === "PARTIAL") {
    // 반원 — 왼쪽 절반만 채운 원(부분점수).
    return (
      <span
        aria-hidden
        className={cn(
          "relative inline-block size-3.5 overflow-hidden rounded-full border-[1.5px] border-blue-600",
          className,
        )}
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-blue-600" />
      </span>
    );
  }
  if (status === "NEEDS_REVIEW") {
    return <Circle className={cn("size-3.5 text-rose-500", className)} strokeWidth={2.5} />;
  }
  return <Minus className={cn("size-3.5 text-slate-300", className)} strokeWidth={2.5} />;
}
