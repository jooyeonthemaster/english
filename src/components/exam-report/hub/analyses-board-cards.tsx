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
  CircleCheck,
  FileClock,
  FileText,
  Play,
  RotateCw,
  Trash2,
  TriangleAlert,
  Upload,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn, formatDateTime } from "@/lib/utils";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import { AnalysisSourceThumbnail } from "./analysis-source-thumbnail";
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
      {/* 상대시간("N시간 전") 대신 절대 타임스탬프(KST 연월일 시:분) — 시험지
          관리 카드와 동일 규격(tabular-nums 로 자릿수 흔들림 방지). */}
      <span
        title="마지막 수정일"
        className="whitespace-nowrap tabular-nums"
      >
        {formatDateTime(row.updatedAt)}
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

// ── 액션 버튼(카드 내부 — 클릭 버블 차단) ────────────────────────────────────
function ActionButton({
  tone,
  disabled,
  onClick,
  className,
  children,
}: {
  tone: "primary" | "outline" | "rose" | "ghost";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
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
        className,
      )}
    >
      {children}
    </button>
  );
}

// ── 좌측 열(시험지 관리 카드의 썸네일 열 자리) ────────────────────────────────
// 업로드한 시험지 사진이 있으면 그 1쪽 썸네일을 채우고, 없으면(자체 시험지·고아
// DRAFT) 상태 아이콘 패널이 그대로 드러난다. 썸네일이 덮은 경우 상태는 하단
// 오버레이 칩으로 유지한다.

/** 상태별 아이콘/색/라벨 — 패널과 오버레이 칩이 공유하는 단일 소스. */
function statusVisual(status: ExamReportSummaryRow["status"], orphan: boolean) {
  if (orphan) {
    return {
      Icon: Upload as LucideIcon,
      tint: "text-slate-400",
      bg: "bg-slate-100/70",
      label: "등록 미완료",
    };
  }
  if (status === "FAILED") {
    return {
      Icon: TriangleAlert as LucideIcon,
      tint: "text-rose-400",
      bg: "bg-rose-50",
      label: STATUS_BADGE.FAILED.label,
    };
  }
  if (status === "ANALYZED") {
    return {
      Icon: CircleCheck as LucideIcon,
      tint: "text-emerald-500",
      bg: "bg-emerald-50",
      label: STATUS_BADGE.ANALYZED.label,
    };
  }
  return {
    Icon: FileClock as LucideIcon,
    tint: "text-blue-400",
    bg: "bg-blue-50/60",
    label: STATUS_BADGE.DRAFT.label,
  };
}

function SourceColumn({
  row,
  orphan,
}: {
  row: ExamReportSummaryRow;
  orphan: boolean;
}) {
  const { Icon, tint, bg, label } = statusVisual(row.status, orphan);
  // 사진이 있는 분석만 썸네일 시도(자체 시험지 합성/고아 DRAFT 는 사진 자체가 없음).
  const thumbPath = row.thumbnailPath ?? null;
  return (
    // 바깥 열: 카드 높이만큼 늘어나며 상태 색을 깐다(A4 박스가 카드보다 짧을 때
    // 남는 아래 여백이 상태 색으로 자연스럽게 이어지도록).
    <div
      className={cn(
        "relative flex w-[24%] min-w-[74px] max-w-[96px] shrink-0 items-start justify-center self-stretch overflow-hidden border-r border-slate-100 md:w-[164px] md:min-w-[118px] md:max-w-[164px]",
        bg,
      )}
    >
      {/* A4(210:297) 비율 박스 — 시험지가 대개 A4 라 썸네일/상태를 같은 규격에
          맞춘다. 폭이 정해지면 높이가 비율로 따라오므로 반응형에서도 유지된다.
          카드 min-h 는 이 박스가 잘리지 않도록 맞춰 둔다(열 최대폭×297/210). */}
      <div className="relative aspect-[210/297] w-full">
        {/* 베이스: 상태 패널 — 썸네일이 없거나 실패하면 이게 그대로 보인다 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
          <Icon
            className={cn("h-7 w-7 md:h-9 md:w-9", tint)}
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-center text-[10px] font-semibold md:text-[11px]",
              tint,
            )}
          >
            {label}
          </span>
        </div>

        {/* 업로드 사진 썸네일(지연 로드) — 성공 시 위 패널을 덮는다 */}
        {thumbPath && (
          <AnalysisSourceThumbnail
            analysisId={row.id}
            path={thumbPath}
            alt={`${row.title} 시험지 사진`}
          />
        )}

        {/* 썸네일이 덮은 경우에도 상태는 하단 칩으로 유지 */}
        {thumbPath && (
          <span
            className={cn(
              "absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm",
              tint,
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </span>
        )}
      </div>
    </div>
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
        // 시험지 관리 카드와 동일한 가로 분할 레이아웃 + 동일 치수(표준 규약).
        // 좌측 열 md 164px × A4(297/210) = 232px 라 md:min-h-[232px] 에서 A4 박스가
        // 열을 정확히 채운다(시험지 카드가 232 를 쓰는 이유와 동일).
        "group relative flex min-h-[128px] w-full min-w-0 max-w-full cursor-pointer flex-row overflow-hidden rounded-xl border bg-white text-left transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:min-h-[232px]",
        failed
          ? "border-rose-200 hover:border-rose-300"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      {/* 좌측: 업로드 사진 썸네일(없으면 상태 패널) */}
      <SourceColumn row={row} orphan={orphan} />

      {/* 우측: 본문 */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
        {/* 제목 + 삭제(우측 상단 아이콘 — 시험지 관리 카드와 동일 규격) */}
        <div className="flex items-start gap-1.5 min-w-0">
          <h4
            className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-800 line-clamp-2 break-words transition-colors group-hover:text-blue-600"
            title={row.title}
          >
            {row.title}
          </h4>
          <button
            type="button"
            aria-label="삭제"
            title="삭제"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(row);
            }}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-300 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 시험 종류 + 자체 시험지 태그 */}
        {(meta || internalExam) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {meta && (
              <span
                className="min-w-0 truncate text-[11px] text-slate-500"
                title={meta}
              >
                {meta}
              </span>
            )}
            {internalExam && (
              <span className="shrink-0 whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                자체 시험지
              </span>
            )}
          </div>
        )}

        {/* 고아 DRAFT 안내 */}
        {orphan && (
          <p className="mt-1 text-[11px] text-slate-400">
            시험지 사진이 업로드되지 않았습니다. 이어서 등록하거나 삭제해 주세요.
          </p>
        )}

        {/* 집계 + 상대시간 (분석 중 카드와 공용 칩 줄) */}
        <MetaChipsRow row={row} className="mt-2" />

        {/* 하단 액션 — 상태별 CTA + 상세보기(시험지 관리 카드 파리티) */}
        <div className="mt-auto flex items-center gap-1.5 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {/* 분석 완료 — 최우선 CTA "학생 추가"(딥링크로 다이얼로그 즉시 오픈).
                학생 0명이면 프라이머리로 다음 행동을 못박고, 이미 있으면 아웃라인. */}
            {row.status === "ANALYZED" && (
              <ActionButton
                tone={row.studentCount === 0 ? "primary" : "outline"}
                className="min-w-0 flex-1 justify-center"
                onClick={() => onAddStudent(row)}
              >
                <UserRoundPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">학생 추가</span>
              </ActionButton>
            )}
            {failed && (
              <ActionButton
                tone="rose"
                className="min-w-0 flex-1 justify-center"
                disabled={restarting}
                onClick={() => onRestart(row)}
              >
                <RotateCw
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    restarting && "animate-spin",
                  )}
                />
                <span className="truncate">
                  {restarting ? "재시작 중" : "다시 분석"}
                </span>
              </ActionButton>
            )}
            {resumableDraft && (
              <ActionButton
                tone="primary"
                className="min-w-0 flex-1 justify-center"
                disabled={restarting}
                onClick={() => onRestart(row)}
              >
                <Play className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {restarting ? "시작 중" : "이어서 분석"}
                </span>
              </ActionButton>
            )}
            {orphan && (
              <ActionButton
                tone="primary"
                className="min-w-0 flex-1 justify-center"
                onClick={() => onResumeDraft(row)}
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">이어서 등록</span>
              </ActionButton>
            )}
            {/* INTERNAL — 원본 시험지 배포 탭 보조 링크. 카드 자체가 role=button
                이므로 click/keydown 버블을 끊어 카드 열기와 충돌하지 않게 한다. */}
            {sourceExamHref && (
              <Link
                href={sourceExamHref}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                시험지 열기
              </Link>
            )}
          </div>

          {/* 상세보기 — 카드 열기(orphan 은 이어서 등록으로 진입) */}
          <CardDetailIconButton
            className="size-7 shrink-0 rounded-md shadow-none"
            iconClassName="size-3.5"
            onClick={(e) => {
              e.stopPropagation();
              if (orphan) onResumeDraft(row);
              else onOpen(row);
            }}
          />
        </div>
      </div>
    </div>
  );
}
