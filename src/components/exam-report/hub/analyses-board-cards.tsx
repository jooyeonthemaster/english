"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 카드 렌더러
//
// 분석 중(ANALYZING)은 학습지/문제 생성 큐와 동일한 공용 WorkbenchLoadingCard
// 로 그린다(진행률은 progressPercent 실측 모드). 터미널 상태(완료=학생 추가
// CTA+학생·리포트·미분석 칩, 실패=다시 분석, DRAFT=이어서 분석/이어서 등록)는
// 기존 카드 셸. 완료 카드의 최우선 CTA 는 "학생 추가"(플로우 개편) — 학생 0명
// 이면 프라이머리로 강하게, 이미 있으면 아웃라인으로 유지한다.
// 페치·필터·삭제 상태는 analyses-board(컨테이너)가 소유한다. 칩은 nowrap(§1-3).
// ============================================================================

import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  Play,
  RotateCw,
  Trash2,
  Upload,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn, formatRelativeTime } from "@/lib/utils";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import {
  EXAM_TYPE_LABEL,
  STATUS_BADGE,
  formatAnalysisEta,
  isOrphanDraft,
  progressPercent,
} from "./board-shared";

export interface BoardCardProps {
  row: ExamReportSummaryRow;
  /** 다시 분석/이어서 분석 발사 직후 비활성 표시 */
  restarting: boolean;
  onOpen: (row: ExamReportSummaryRow) => void;
  onRestart: (row: ExamReportSummaryRow) => void;
  onResumeDraft: (row: ExamReportSummaryRow) => void;
  /** 분석 완료 카드 "학생 추가" — 워크스페이스 학생 추가 딥링크로 이동 */
  onAddStudent: (row: ExamReportSummaryRow) => void;
  onRequestDelete: (row: ExamReportSummaryRow) => void;
}

function metaLine(row: ExamReportSummaryRow): string {
  return [row.schoolName, row.grade, EXAM_TYPE_LABEL[row.examType]]
    .filter(Boolean)
    .join(" · ");
}

// ── 집계 칩 줄(학생·리포트·미분석 + 상대시간) — 분석 중/터미널 카드 공용 ──────
function MetaChipsRow({
  row,
  className,
}: {
  row: ExamReportSummaryRow;
  className?: string;
}) {
  const failedCount = row.failedCount ?? 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Users className="h-3.5 w-3.5" />
          학생 {row.studentCount}명
        </span>
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
      <span className="whitespace-nowrap">
        {formatRelativeTime(row.updatedAt)}
      </span>
    </div>
  );
}

// ── 분석 중 카드 — 학습지/문제 생성 큐와 동일한 공용 로딩 카드로 렌더 ─────────
function AnalyzingBoardCard({
  row,
  onOpen,
  onRequestDelete,
}: {
  row: ExamReportSummaryRow;
  onOpen: (row: ExamReportSummaryRow) => void;
  onRequestDelete: (row: ExamReportSummaryRow) => void;
}) {
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
      // 실측 %가 있을 때만 진행바를 실제 폭으로(없으면 장식 바 유지).
      progressPercent={hasProgress ? progressPercent(progress) : undefined}
      metaSlot={<MetaChipsRow row={row} className="mt-2.5" />}
      rightActions={
        <button
          type="button"
          onClick={() => onRequestDelete(row)}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-rose-50"
          aria-label="분석 삭제"
          title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
        </button>
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

// ── 상태 뱃지 ────────────────────────────────────────────────────────────────
function CardBadge({ row }: { row: ExamReportSummaryRow }) {
  // INTERNAL(자체 시험지 합성)은 사진 업로드 자체가 없으므로 "고아 DRAFT
  // (사진 없음=등록 미완료)" 판별에서 제외 — 일반 상태 뱃지로 폴백한다.
  if (row.sourceType !== "INTERNAL" && isOrphanDraft(row)) {
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
        등록 미완료
      </span>
    );
  }
  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.DRAFT;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        badge.className,
      )}
    >
      {badge.pulse && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {badge.label}
    </span>
  );
}

// ── 액션 버튼(카드 내부 — 클릭 버블 차단) ────────────────────────────────────
function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: "primary" | "outline" | "rose" | "ghost";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-50",
        tone === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
        tone === "outline" &&
          "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
        tone === "rose" &&
          "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
        tone === "ghost" &&
          "border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600",
      )}
    >
      {children}
    </button>
  );
}

// ── 카드 본체 ────────────────────────────────────────────────────────────────
export function BoardCard({
  row,
  restarting,
  onOpen,
  onRestart,
  onResumeDraft,
  onAddStudent,
  onRequestDelete,
}: BoardCardProps) {
  // 분석 중 — 생성 페이지들과 동일한 공용 로딩 카드로 조기 분기(UI 통일).
  if (row.status === "ANALYZING") {
    return (
      <AnalyzingBoardCard
        row={row}
        onOpen={onOpen}
        onRequestDelete={onRequestDelete}
      />
    );
  }

  // INTERNAL 은 사진이 원래 없으므로 고아 DRAFT(사진 이어서 등록 유도) 분류에서
  // 제외 — CardBadge 의 동일 가드와 짝(있을 수 없는 상태지만 방어).
  const orphan = row.sourceType !== "INTERNAL" && isOrphanDraft(row);
  const failed = row.status === "FAILED";
  // DRAFT + 사진 있음 = 중단된 분석 — 이어서 분석(무료 재개) 가능.
  const resumableDraft =
    row.status === "DRAFT" && !orphan && row.hasSourceFiles === true;
  const meta = metaLine(row);
  // V7: 자체 시험지 합성 분석(INTERNAL) — 사진 업로드 없이 시험지(Exam)에서
  // 합성된 분석. 배지로 구분하고, sourceExamId 가 있으면 원본 시험지 배포 탭
  // 딥링크를 보조 링크로 노출한다(배포 기능 플래그 게이트).
  const internalExam =
    FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT && row.sourceType === "INTERNAL";
  const sourceExamHref =
    internalExam && row.sourceExamId
      ? `/director/exams/${row.sourceExamId}?tab=deployment`
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (orphan ? onResumeDraft(row) : onOpen(row))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (orphan) onResumeDraft(row);
          else onOpen(row);
        }
      }}
      className={cn(
        // 로딩 카드와 나란히 놓이므로 hover 그림자까지 동일 감각으로 정돈.
        "flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-4 text-left transition duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        failed
          ? "border-rose-200 hover:border-rose-300"
          : orphan
            ? "border-slate-200 bg-slate-50/60 hover:border-blue-300"
            : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30",
      )}
    >
      {/* 제목 + (자체 시험지) + 상태 뱃지 */}
      <div className="flex items-start justify-between gap-2">
        <span
          className="line-clamp-1 min-w-0 text-sm font-medium text-slate-900"
          title={row.title}
        >
          {row.title}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {internalExam && (
            <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
              자체 시험지
            </span>
          )}
          <CardBadge row={row} />
        </span>
      </div>

      {/* 메타 라인 */}
      {meta && (
        <span className="line-clamp-1 text-xs text-slate-500" title={meta}>
          {meta}
        </span>
      )}

      {/* 고아 DRAFT 안내 */}
      {orphan && (
        <p className="text-xs text-slate-400">
          시험지 사진이 업로드되지 않았습니다. 이어서 등록하거나 삭제해 주세요.
        </p>
      )}

      {/* 집계 + 상대시간 (분석 중 카드와 공용 칩 줄) */}
      <MetaChipsRow row={row} className="mt-1" />

      {/* 액션 바 — 상태별 CTA + 삭제(라이브러리 파리티: 전 상태 삭제 가능) */}
      <div className="mt-1 flex items-center gap-2">
        {/* 분석 완료 — 최우선 CTA "학생 추가"(딥링크로 다이얼로그 즉시 오픈).
            학생 0명이면 프라이머리로 다음 행동을 못박고, 이미 있으면 아웃라인. */}
        {row.status === "ANALYZED" && (
          <ActionButton
            tone={row.studentCount === 0 ? "primary" : "outline"}
            onClick={() => onAddStudent(row)}
          >
            <UserRoundPlus className="h-3.5 w-3.5" />
            학생 추가
          </ActionButton>
        )}
        {failed && (
          <ActionButton
            tone="rose"
            disabled={restarting}
            onClick={() => onRestart(row)}
          >
            <RotateCw
              className={cn("h-3.5 w-3.5", restarting && "animate-spin")}
            />
            {restarting ? "재시작 중" : "다시 분석"}
          </ActionButton>
        )}
        {resumableDraft && (
          <ActionButton
            tone="primary"
            disabled={restarting}
            onClick={() => onRestart(row)}
          >
            <Play className="h-3.5 w-3.5" />
            {restarting ? "시작 중" : "이어서 분석"}
          </ActionButton>
        )}
        {orphan && (
          <ActionButton tone="primary" onClick={() => onResumeDraft(row)}>
            <Upload className="h-3.5 w-3.5" />
            이어서 등록
          </ActionButton>
        )}
        {/* INTERNAL — 원본 시험지 배포 탭 보조 링크. 카드 자체가 role=button
            이므로 click/keydown 버블을 끊어 카드 열기와 충돌하지 않게 한다. */}
        {sourceExamHref && (
          <Link
            href={sourceExamHref}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            시험지 열기
          </Link>
        )}
        <ActionButton tone="ghost" onClick={() => onRequestDelete(row)}>
          <Trash2 className="h-3.5 w-3.5" />
          삭제
        </ActionButton>
      </div>
    </div>
  );
}
