"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, XCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QuestionCardItem } from "@/components/workbench/question-card";
import {
  Q_TYPE_LABELS,
  Q_SUBTYPE_LABELS,
  Q_DIFF,
} from "@/components/workbench/passage-detail/constants";
import { typeLabel, type QueueItem } from "../generate-page-types";

// ============================================================================
// 지문별 생성 이력 팝오버 — 이 지문으로 생성/저장된 문제를 그대로 보여준다.
// 저장된 문제(DB) 목록을 1순위로, 진행 중/실패한 세션 잡을 라이브 상태로 함께 노출.
// ============================================================================

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

function describeJobTypes(item: QueueItem): string {
  const counts = item.config?.typeCounts || {};
  const parts = Object.entries(counts)
    .filter(([, n]) => Number(n) > 0)
    .map(([id, n]) => `${typeLabel(id)} ${n}`);
  if (parts.length > 0) return parts.join(" · ");
  const progressKeys = Object.keys(item.progress || {}).filter(
    (k) => k !== "auto",
  );
  if (progressKeys.length > 0)
    return progressKeys.map((k) => typeLabel(k)).join(" · ");
  return "문제 생성";
}

function stripText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[*_`#>]/g, "")
    .trim();
}

/** 저장된 문제 한 행 — 유형·난이도·본문 미리보기, 클릭하면 문제 상세로 이동. */
function SavedQuestionRow({
  q,
  num,
  onOpen,
}: {
  q: QuestionCardItem;
  num: number;
  onOpen: (id: string) => void;
}) {
  const tLabel = Q_TYPE_LABELS[q.type] || q.type;
  const subLabel = q.subType ? Q_SUBTYPE_LABELS[q.subType] || q.subType : null;
  const diff = Q_DIFF[q.difficulty];
  const examLinks = q._count?.examLinks ?? 0;
  const text = stripText(q.questionText || subLabel || tLabel);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(q.id)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onOpen(q.id);
      }}
      className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-100/70"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-bold text-slate-400">{num}.</span>
        <span className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 text-[9.5px] font-medium text-slate-600">
          {tLabel}
        </span>
        {subLabel && (
          <span className="text-[9.5px] text-slate-500">{subLabel}</span>
        )}
        <span
          className={`inline-flex items-center rounded border px-1 py-0.5 text-[9.5px] font-semibold ${
            diff?.cls || "border-slate-200 bg-slate-100 text-slate-500"
          }`}
        >
          {diff?.label || q.difficulty}
        </span>
        {examLinks > 0 && (
          <span className="ml-auto text-[9.5px] font-medium text-slate-400">
            {examLinks}개 시험지
          </span>
        )}
      </div>
      {text && (
        <p className="mt-1 line-clamp-1 text-[10.5px] leading-snug text-slate-600">
          {text}
        </p>
      )}
    </div>
  );
}

interface RowHistoryPopoverProps {
  /** 이 행과 연관된 passage id 들 (원본 + 변형본). */
  passageIds: string[];
  sessionQueue: QueueItem[];
  savedQuestionCount: number;
  /** 이 지문(원본+변형)으로 저장된 문제들 — 팝오버에 실제 목록으로 보여준다. */
  questions: QuestionCardItem[];
}

export function RowHistoryPopover({
  passageIds,
  sessionQueue,
  savedQuestionCount,
  questions,
}: RowHistoryPopoverProps) {
  const router = useRouter();
  const idSet = useMemo(() => new Set(passageIds), [passageIds]);
  // 진행 중/실패한 세션 잡만 라이브 상태로 위에 보여준다(완료분은 저장 목록과 중복).
  const liveJobs = useMemo(
    () =>
      sessionQueue
        .filter(
          (q) =>
            idSet.has(q.passageId) &&
            (q.status === "generating" || q.status === "error"),
        )
        .slice(0, 8),
    [sessionQueue, idSet],
  );

  const count = savedQuestionCount || questions.length;
  const hasAny = count > 0 || liveJobs.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`이 지문의 문제 생성 이력${count > 0 ? ` — 저장된 문제 ${count}개` : ""}`}
          className={
            "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition-colors " +
            (hasAny
              ? "text-slate-500 hover:bg-slate-100 hover:text-blue-700"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600")
          }
        >
          <History className="h-4 w-4" aria-hidden="true" />
          {count > 0 ? (
            <span className="text-[10.5px] font-bold tabular-nums">{count}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[330px] p-0 shadow-xl"
      >
        <div className="border-b border-slate-100 px-3.5 py-2.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[12.5px] font-bold text-slate-800">생성 이력</p>
            <p className="text-[11px] text-slate-400">
              저장된 문제{" "}
              <strong className="font-bold text-slate-700">{count}</strong>개
            </p>
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">
            이 지문으로 생성·저장된 문제예요. 클릭하면 문제 상세로 이동합니다.
          </p>
        </div>
        {!hasAny ? (
          <div className="px-3.5 py-5 text-center text-[11.5px] text-slate-400">
            아직 이 지문으로 생성한 문제가 없습니다.
          </div>
        ) : (
          <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto p-1.5">
            {/* 진행 중/실패 — 라이브 상태 */}
            {liveJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5"
              >
                <span className="mt-0.5 shrink-0">
                  {job.status === "generating" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-semibold text-slate-700">
                    {describeJobTypes(job)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                    {job.config?.difficulty ? (
                      <span>
                        {DIFFICULTY_LABELS[job.config.difficulty] ||
                          job.config.difficulty}
                      </span>
                    ) : null}
                    <span
                      className={
                        job.status === "error"
                          ? "font-semibold text-red-400"
                          : "text-blue-500"
                      }
                    >
                      {job.status === "error" ? "생성 실패" : "생성 중"}
                    </span>
                  </span>
                </span>
              </div>
            ))}
            {/* 저장된 문제 — 실제 목록 */}
            {questions.map((q, idx) => (
              <SavedQuestionRow
                key={q.id}
                q={q}
                num={idx + 1}
                onOpen={(id) => router.push(`/director/questions/${id}`)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
