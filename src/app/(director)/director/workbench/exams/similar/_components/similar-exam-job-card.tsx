"use client";

import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSearch,
  Loader2,
  Pencil,
  Printer,
  Save,
  Trash2,
} from "lucide-react";

import { cn, formatDate } from "@/lib/utils";
import { DetailActionButton } from "@/components/ui/detail-action-button";

export interface SimilarExamJobCardData {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  stage: string;
  title: string;
  originalFileName: string | null;
  totalPages: number;
  generatedExamId: string | null;
  errorMessage: string | null;
  result: {
    questionCount?: number;
    patternQuestionCount?: number;
    selectedPassageIds?: string[];
  } | null;
  createdAt: string;
  completedAt: string | null;
  generatedExam: {
    editCount: number;
    printCount: number;
    saveCount: number;
    examDate: string | null;
    updatedAt: string;
    type: string;
    status: string;
    questionCount: number;
  } | null;
}

const STAGE_LABELS: Record<string, string> = {
  UPLOADING: "업로드 대기",
  OCR: "텍스트 추출 중",
  ANALYZING_PATTERN: "시험지 패턴 분석 중",
  ASSIGNING_PASSAGES: "선택 지문 배정 중",
  GENERATING_QUESTIONS: "문항 생성 중",
  SAVING: "시험지 저장 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

function stageLabel(stage: string) {
  const apMatch = stage.match(/^ANALYZING_PATTERN_(\d+)_OF_(\d+)$/);
  if (apMatch) return `패턴 분석 중 ${apMatch[1]}/${apMatch[2]}`;
  return STAGE_LABELS[stage] ?? stage;
}

function stagePercent(status: string, stage: string) {
  if (status === "COMPLETED" || status === "FAILED") return 100;
  const apMatch = stage.match(/^ANALYZING_PATTERN_(\d+)_OF_(\d+)$/);
  if (apMatch) {
    const current = Number(apMatch[1]);
    const total = Number(apMatch[2]);
    return 15 + Math.round((Math.min(current, total) / Math.max(total, 1)) * 30);
  }
  switch (stage) {
    case "UPLOADING":
      return 5;
    case "OCR":
      return 18;
    case "ANALYZING_PATTERN":
      return 45;
    case "ASSIGNING_PASSAGES":
      return 58;
    case "GENERATING_QUESTIONS":
      return 82;
    case "SAVING":
      return 94;
    default:
      return status === "PROCESSING" ? 24 : 8;
  }
}

const COUNTER_ENABLED =
  "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-blue-100 bg-blue-50/60 px-2 text-[11px] font-semibold tabular-nums text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/70 hover:text-blue-800";
const COUNTER_DISABLED =
  "flex h-7 min-w-0 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold tabular-nums text-slate-400 opacity-70";
const COUNTER_DISPLAY =
  "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold tabular-nums text-slate-500";

export function SimilarExamJobCard({
  job,
  onShowAnalysis,
  onDelete,
}: {
  job: SimilarExamJobCardData;
  onShowAnalysis: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}) {
  const router = useRouter();
  const examId = job.generatedExamId;
  const hasExam = Boolean(examId);
  const isActive = job.status === "PENDING" || job.status === "PROCESSING";
  const isTerminal = !isActive;

  const title = job.originalFileName || job.title || "패턴 기반 시험지";
  const questionCount =
    job.generatedExam?.questionCount ?? job.result?.questionCount ?? null;
  const dateValue = job.generatedExam?.updatedAt || job.completedAt || job.createdAt;

  const edit = job.generatedExam?.editCount ?? 0;
  const print = job.generatedExam?.printCount ?? 0;
  const save = job.generatedExam?.saveCount ?? 0;

  const percent = stagePercent(job.status, job.stage);

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-slate-300 hover:shadow-md">
      {/* 삭제 (종료된 작업) */}
      {isTerminal ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(job.id);
          }}
          title="작업 삭제"
          aria-label="작업 삭제"
          className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}

      {/* 제목 + 문항수/날짜 */}
      <div className="min-w-0 pr-6">
        <h4 className="truncate text-[13px] font-semibold text-slate-800">
          {title}
        </h4>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <ClipboardList className="size-3 text-slate-400" />
            {questionCount != null ? `${questionCount}문항` : `${job.totalPages}p`}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Calendar className="size-3 text-slate-400" />
            {formatDate(dateValue)}
          </span>
        </div>
      </div>

      {/* 수정 / 인쇄 / 저장 회수 — 시험지 관리 카드와 동일 */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!hasExam}
          onClick={() =>
            examId && router.push(`/director/workbench/exams/${examId}/edit`)
          }
          title="시험지 수정 (수정 횟수)"
          aria-label="시험지 수정"
          className={hasExam ? COUNTER_ENABLED : COUNTER_DISABLED}
        >
          <Pencil className="h-3 w-3 shrink-0" />
          <span className="truncate">수정 {edit}회</span>
        </button>
        <button
          type="button"
          disabled={!hasExam}
          onClick={() =>
            examId &&
            window.open(
              `/director/exams/${examId}?print=1`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          title="바로 인쇄 (인쇄 횟수)"
          aria-label="시험지 인쇄"
          className={hasExam ? COUNTER_ENABLED : COUNTER_DISABLED}
        >
          <Printer className="h-3 w-3 shrink-0" />
          <span className="truncate">인쇄 {print}회</span>
        </button>
        <span title="저장한 횟수" className={COUNTER_DISPLAY}>
          <Save className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="truncate">저장 {save}회</span>
        </span>
      </div>

      {/* 상태 표시 줄 (작업 큐 — 생성 진행/완료/실패) */}
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold",
              job.status === "COMPLETED" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700",
              job.status === "PROCESSING" &&
                "border-blue-200 bg-blue-50 text-blue-700",
              job.status === "PENDING" &&
                "border-slate-200 bg-slate-50 text-slate-500",
              job.status === "FAILED" &&
                "border-red-200 bg-red-50 text-red-700",
              job.status === "CANCELLED" &&
                "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            {job.status === "COMPLETED" ? (
              <CheckCircle2 className="size-3" />
            ) : job.status === "FAILED" || job.status === "CANCELLED" ? (
              <AlertCircle className="size-3" />
            ) : (
              <Loader2 className="size-3 animate-spin" />
            )}
            {stageLabel(job.stage)}
          </span>
          {isActive ? (
            <span className="text-[10.5px] font-medium tabular-nums text-slate-400">
              {percent}%
            </span>
          ) : null}
        </div>
        {isActive ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        {job.status === "FAILED" && job.errorMessage ? (
          <p className="mt-1.5 line-clamp-2 rounded-md bg-red-50 px-2 py-1 text-[10.5px] leading-relaxed text-red-600">
            {job.errorMessage}
          </p>
        ) : null}
      </div>

      {/* 상세보기 + 분석 정보 · 날짜 */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <DetailActionButton
            title="시험지 상세 보기"
            aria-label="시험지 상세 보기"
            disabled={!hasExam}
            className={!hasExam ? "cursor-not-allowed opacity-50" : undefined}
            onClick={() => examId && router.push(`/director/exams/${examId}`)}
          />
          {isTerminal ? (
            <button
              type="button"
              onClick={() => onShowAnalysis(job.id)}
              title="분석 정보"
              aria-label="분석 정보"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <FileSearch className="h-3 w-3 shrink-0" />
              분석 정보
            </button>
          ) : null}
        </div>
        <span
          title="시각"
          className="inline-flex items-center gap-1 truncate text-[10px] text-slate-400"
        >
          <Clock className="size-3 shrink-0 text-slate-300" />
          {formatDate(dateValue)}
        </span>
      </div>
    </div>
  );
}
