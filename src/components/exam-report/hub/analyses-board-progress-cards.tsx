"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 「진행 중」 카드 (v4, 26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §3 U4-2 · §4 글로우
//
// 진행 중 카드는 전부 학습지/문항 생성 큐와 같은 공용 WorkbenchLoadingCard
// (variant="analyzing" — orbit+sheen 어휘)로 그린다. 두 종류:
//   · AnalyzingBoardCard — vision 경로(status ANALYZING). analyses-board-cards
//     에서 자구 그대로 이사(파일 500줄 상한 — 동작 무변경).
//   · BoostRunningBoardCard — INTERNAL 심층 분석(funnel.boost RUNNING, v4).
//     진행률은 boost.completed/total 실측, 상태 라벨 「AI 분석 중」.
// MetaChipsRow(학생·리포트·미분석 + 타임스탬프)는 진행 카드·터미널 카드 공용이라
// 여기서 export 한다. 페치·필터·삭제 상태는 analyses-board(컨테이너) 소유.
// ============================================================================

import { FileText, Trash2 } from "lucide-react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { cn, formatDateTime } from "@/lib/utils";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import {
  EXAM_TYPE_LABEL,
  STATUS_BADGE,
  formatAnalysisEta,
  progressPercent,
} from "./board-shared";

/** 학교 · 학년 · 시험 종류 한 줄(카드 공용). */
export function metaLine(row: ExamReportSummaryRow): string {
  return [row.schoolName, row.grade, EXAM_TYPE_LABEL[row.examType]]
    .filter(Boolean)
    .join(" · ");
}

// ── 집계 칩 줄(학생·리포트·미분석 + 절대 타임스탬프) — 진행/터미널 카드 공용 ──
export function MetaChipsRow({
  row,
  className,
  showTimestamp = true,
}: {
  row: ExamReportSummaryRow;
  className?: string;
  /**
   * 우측 절대 타임스탬프 표시(additive, 26-09-05). 터미널 카드(BoardCard)는 날짜를
   * 제목 줄 우측으로 올렸으므로 false 를 넘긴다 — 좁은 열에서 이 줄이 줄바꿈되며
   * 날짜만 한 줄을 차지하던 문제의 수리. 진행 카드(WorkbenchLoadingCard metaSlot)
   * 는 제목 줄이 자기 크롬이라 여기 그대로 둔다(기본 true).
   */
  showTimestamp?: boolean;
}) {
  const failedCount = row.failedCount ?? 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400",
        className,
      )}
    >
      {/* 「학생 N명」 칩 폐기(26-09-05 사용자 지시 "굳이 셀 필요 없어. 그냥 숫자
          자체를 없애줘") — 카드는 이 시험의 행 수(다른 반 포함)를, 레일 [학생] 탭은
          우리 반만 세어 같은 시험이 3 과 2 로 갈렸다. 세는 자리를 하나(레일)로 줄인다. */}
      <span className="inline-flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <FileText className="h-3.5 w-3.5" />
          리포트 {row.reportCount ?? 0}건
        </span>
        {row.status === "ANALYZED" && failedCount > 0 && (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
            미분석 {failedCount}
          </span>
        )}
      </span>
      {/* 상대시간("N시간 전") 대신 절대 타임스탬프(KST 연월일 시:분) — 시험지
          관리 카드와 동일 규격(tabular-nums 로 자릿수 흔들림 방지). */}
      {showTimestamp && (
        <span
          title="마지막 수정일"
          className="whitespace-nowrap tabular-nums"
        >
          {formatDateTime(row.updatedAt)}
        </span>
      )}
    </div>
  );
}

// ── 진행 카드 공용 조각 ──────────────────────────────────────────────────────

/** 진행 카드 우상단 삭제 아이콘 — 두 진행 카드가 같은 버튼을 쓴다. */
function DeleteIconAction({
  row,
  onRequestDelete,
}: {
  row: ExamReportSummaryRow;
  onRequestDelete: (row: ExamReportSummaryRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRequestDelete(row);
      }}
      // 카드가 role=button 이라 Enter 키가 버블되면 레일까지 열린다 — 키도 끊는다.
      onKeyDown={(e) => e.stopPropagation()}
      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-rose-50"
      aria-label="분석 삭제"
      title="삭제"
    >
      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
    </button>
  );
}

interface ProgressCardProps {
  row: ExamReportSummaryRow;
  onOpen: (row: ExamReportSummaryRow) => void;
  onRequestDelete: (row: ExamReportSummaryRow) => void;
  /** 우측 레일에 열린 분석 하이라이트(additive) — 로딩 카드는 ring 문법. */
  active?: boolean;
  /**
   * 삭제 아이콘 숨김(additive) — 스튜디오(hideCardActions)에서 AI 분석 중 삭제는
   * 과금은 남고 시험지가 후보로 재등재돼 2차 과금으로 이어진다. 진행 중엔 숨긴다.
   */
  hideDelete?: boolean;
}

// ── 분석 중 카드(vision 경로) — 학습지/문제 생성 큐와 동일한 공용 로딩 카드 ────
export function AnalyzingBoardCard({
  row,
  onOpen,
  onRequestDelete,
  active = false,
}: ProgressCardProps) {
  const progress = row.progress ?? null;
  // progress 미기록 = 문항 인식 단계(허브 낙관 행 포함) — 장식 바 그대로.
  const hasProgress = !!progress && progress.total > 0;
  const eta = hasProgress ? formatAnalysisEta(progress) : null;
  const statusLabel = hasProgress
    ? STATUS_BADGE.ANALYZING.label
    : "문항 인식 중";
  const progressLabel = hasProgress
    ? `${progress.completed}/${progress.total} 문항 분석 중${eta ? ` · ${eta}` : ""}`
    : "문항을 인식하는 중입니다...";
  return (
    <WorkbenchLoadingCard
      title={row.title}
      contentPreview={metaLine(row)}
      statusLabel={statusLabel}
      progressLabel={progressLabel}
      variant="analyzing"
      showCheckbox={false}
      selected={active}
      // 실측 %가 있을 때만 진행바를 실제 폭으로(없으면 장식 바 유지).
      progressPercent={hasProgress ? progressPercent(progress) : undefined}
      metaSlot={<MetaChipsRow row={row} className="mt-2.5" />}
      rightActions={
        <DeleteIconAction row={row} onRequestDelete={onRequestDelete} />
      }
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      ariaLabel={`${row.title} - ${statusLabel}`}
    />
  );
}

// ── AI 분석 중 카드(INTERNAL boost RUNNING, v4) ───────────────────────────────
// 상태 라벨·진행 라벨 자구는 스펙 §3 U4-2 고정. 진행률은 boost.completed/total
// 실측(총 0 이면 장식 바). 카드 자체는 선택 가능(레일이 헤더 진행 바로 이어받음).
export function BoostRunningBoardCard({
  row,
  onOpen,
  onRequestDelete,
  active = false,
  hideDelete = false,
}: ProgressCardProps) {
  const boost = row.funnel?.boost ?? null;
  const total = boost?.total ?? 0;
  const completed = boost?.completed ?? 0;
  const hasProgress = total > 0;
  const statusLabel = "AI 분석 중";
  // total 0 = 배치 시작 전(진행 기록 없음) — "0/0" 대신 준비 문구.
  const progressLabel = hasProgress
    ? `${completed}/${total} 문항 분석 중`
    : "분석을 준비하는 중입니다…";
  return (
    <WorkbenchLoadingCard
      title={row.title}
      contentPreview={metaLine(row)}
      statusLabel={statusLabel}
      progressLabel={progressLabel}
      variant="analyzing"
      showCheckbox={false}
      selected={active}
      progressPercent={
        hasProgress ? progressPercent({ completed, total }) : undefined
      }
      metaSlot={<MetaChipsRow row={row} className="mt-2.5" />}
      rightActions={
        hideDelete ? undefined : (
          <DeleteIconAction row={row} onRequestDelete={onRequestDelete} />
        )
      }
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      ariaLabel={`${row.title} - ${statusLabel}`}
    />
  );
}
