"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 「분석 전」 후보 카드 (v4, 26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §1-1 · §3 U4-3
//
// 후보 = INTERNAL 분석 행이 아직 없는 자체 시험지(`?include=candidates`). 스튜디오
// 「자체 시험지」 그룹 말미에 붙어 "분석이 안 됐으면 분석하라는 안내가 떠야 한다"
// (사용자 지시)를 왼쪽 목록에서 먼저 보여준다. 카드는 순수 선택 행 — 액션 버튼
// 0(「AI 분석 시작」 CTA 는 우측 레일 정본). 힌트 줄(renderHint)은 버튼이 아니라
// 안내 1줄이라 허용 — 호출부가 deriveExamNextStep(candidate).title 을 넣는다.
// 시각 문법은 BoardCard(hideThumbnail) 와 동일 셸·동일 선택 하이라이트라 같은
// 그리드 안에서 이질감이 없다. 메타 줄은 「시험 종류 · 문항 N」 + **상태 칩**
// (ANALYSIS_STATE_CHIP.none — 분석 행 카드의 깊이 칩과 공용 토큰, 26-09-04) +
// 절대 타임스탬프(MetaChipsRow 문법) — 동일 제목 2장이 구분된다.
// self-start: 이웃 분석 카드 높이로 늘어나지 않는다(그리드 stretch 차단).
// 계약 셀렉터 `[data-analysis-candidate="<examId>"]`(§2.5 프로브).
// ============================================================================

import type { ReactNode } from "react";
import { FileClock } from "lucide-react";
import type { ExamCandidateRow } from "@/hooks/use-exam-report-activity";
import type { ExamType } from "@/lib/exam-report/types";
import { cn, formatDateTime } from "@/lib/utils";
import {
  ANALYSIS_STATE_CHIP,
  BOARD_CHIP_CLASS,
  EXAM_TYPE_LABEL,
} from "./board-shared";

export interface CandidateCardProps {
  candidate: ExamCandidateRow;
  /** 우측 레일에 열린 후보 하이라이트 — BoardCard active 와 동일 스타일. */
  active?: boolean;
  onOpen: (candidate: ExamCandidateRow) => void;
  /** 하단 힌트 줄(안내 1줄, 버튼 아님) — BoardCard renderHint 와 같은 슬롯. */
  renderHint?: (candidate: ExamCandidateRow) => ReactNode;
}

function examTypeLabel(examType: string | null): string | null {
  if (!examType) return null;
  return examType in EXAM_TYPE_LABEL
    ? EXAM_TYPE_LABEL[examType as ExamType]
    : null;
}

export function CandidateCard({
  candidate,
  active = false,
  onOpen,
  renderHint,
}: CandidateCardProps) {
  // 26-09-04 ①: 상태(「분석 전」)를 메타 **문자열에서 빼내 칩으로** 올렸다.
  // 사용자 지적("둘 다 심층 분석 전인데 왜 생긴 게 다르지?")의 실체가 이것이다 —
  // 후보는 상태를 텍스트에 박고 분석 행은 칩으로 그려서, 같은 줄이 서로 다른
  // 문법이 됐다. 이제 두 카드가 ANALYSIS_STATE_CHIP 하나를 공유한다.
  // 26-09-04 ②: 그 칩의 자구·색이 SHALLOW 와 **완전히 같아졌다**("그냥 분석 전으로
  // 통일"). 이 카드는 이제 사용자가 후보를 여는 순간 무과금 승격되는 과도 상태의
  // 표시일 뿐이라(analysis-pane promoteCandidate), 행 카드와 구별될 이유가 없다.
  const metaLabel = [
    examTypeLabel(candidate.examType),
    `문항 ${candidate.questionCount}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const stateChip = ANALYSIS_STATE_CHIP.none;
  const hint = renderHint ? renderHint(candidate) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      data-analysis-candidate={candidate.examId}
      onClick={() => onOpen(candidate)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(candidate);
        }
      }}
      className={cn(
        // BoardCard(hideThumbnail) 셸 자구 미러 — 선택 하이라이트도 동일.
        "group relative flex w-full min-w-0 max-w-full cursor-pointer flex-row self-start overflow-hidden rounded-xl border bg-white text-left transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        active
          ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.55)]"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 items-start gap-1.5">
          {/* 상태 아이콘 칩 — FileClock amber. 분석 행 카드의 BASIC_ANALYSIS_VISUAL
              과 **같은 색·같은 자구**다(26-09-04 「그냥 분석 전으로 통일」): 후보와
              SHALLOW 는 사용자에게 같은 상태이므로 카드도 구별되면 안 된다. */}
          <span
            className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600"
            title={stateChip.label}
            aria-label={stateChip.label}
          >
            <FileClock className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h4
            className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-800 line-clamp-2 break-words transition-colors group-hover:text-blue-600"
            title={candidate.title}
          >
            {candidate.title}
          </h4>
        </div>
        {/* 메타 + 상태 칩 + 우측 날짜 — 분석 행 카드(analyses-board-cards)와 동일
            줄 구성(nowrap · 메타만 truncate). */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {metaLabel ? (
            <span
              className="min-w-0 truncate text-[11px] text-slate-500"
              title={metaLabel}
            >
              {metaLabel}
            </span>
          ) : null}
          <span
            data-analysis-depth="NONE"
            className={cn(BOARD_CHIP_CLASS, stateChip.className)}
          >
            {stateChip.label}
          </span>
        </div>
        {/* (구 타임스탬프 전용 줄 폐기 — 후보 카드는 집계가 없으므로 분석 행 카드
            보다 한 줄 낮다. self-start 라 이웃 높이로 늘어나지 않는다.) */}
        {hint ? (
          <div data-analysis-hint className="mt-2 min-w-0">
            {hint}
          </div>
        ) : null}
        {/* 마지막 수정일 — 힌트 아래 **왼쪽 정렬** 한 줄(26-09-05 사용자 지시 "시험지
            이름이 2줄로 나뉘는 게 마음에 안 들어"). 제목 줄 우측에 두면 날짜 폭만큼
            제목이 접혀 2줄이 됐고, 메타 줄 우측도 좁은 열에선 같은 압착이다. 본문
            왼쪽 끝선(메타·집계 줄과 같은 x)에 맞춰 마지막 줄로 내리면 제목·메타가
            폭을 온전히 쓴다. 연월일 시:분 전문(툴팁 불필요). 분석 행(analyses-board-cards) 카드와 동일. */}
        <p
          title="마지막 수정일"
          className="mt-2 whitespace-nowrap text-[10.5px] leading-none tabular-nums text-slate-400"
        >
          {formatDateTime(candidate.updatedAt)}
        </p>
      </div>
    </div>
  );
}
