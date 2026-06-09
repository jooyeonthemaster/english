"use client";

import { useMemo } from "react";
import { CheckCircle2, History, Loader2, XCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { typeLabel, type QueueItem } from "../generate-page-types";

// ============================================================================
// 지문별 생성 이력 팝오버 — 이 지문으로 어떤 유형/난이도의 문제를 생성했는지.
// 세션 큐(5초 폴링되는 DB 잡 목록)와 저장된 문제 수를 그대로 활용한다.
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
  if (item.config?.mode === "auto") return "자동 생성";
  const progressKeys = Object.keys(item.progress || {}).filter(
    (k) => k !== "auto",
  );
  if (progressKeys.length > 0)
    return progressKeys.map((k) => typeLabel(k)).join(" · ");
  return "자동 생성";
}

function formatWhen(createdAt?: string): string {
  if (!createdAt) return "";
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface RowHistoryPopoverProps {
  /** 이 행과 연관된 passage id 들 (원본 + 변형본). */
  passageIds: string[];
  sessionQueue: QueueItem[];
  savedQuestionCount: number;
}

export function RowHistoryPopover({
  passageIds,
  sessionQueue,
  savedQuestionCount,
}: RowHistoryPopoverProps) {
  const idSet = useMemo(() => new Set(passageIds), [passageIds]);
  const jobs = useMemo(
    () => sessionQueue.filter((q) => idSet.has(q.passageId)).slice(0, 12),
    [sessionQueue, idSet],
  );

  const hasAny = savedQuestionCount > 0 || jobs.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="이 지문의 문제 생성 이력"
          className={
            "flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors " +
            (hasAny
              ? "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              : "border-slate-200 bg-white text-slate-300 hover:text-slate-500")
          }
        >
          <History className="h-3 w-3" aria-hidden="true" />
          생성 이력
          {savedQuestionCount > 0 ? (
            <span className="rounded bg-slate-700 px-1 text-[10px] font-bold text-white tabular-nums">
              {savedQuestionCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[340px] p-0 shadow-xl">
        <div className="border-b border-slate-100 px-3.5 py-2.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[12.5px] font-bold text-slate-800">생성 이력</p>
            <p className="text-[11px] text-slate-400">
              저장된 문제{" "}
              <strong className="font-bold text-slate-700">
                {savedQuestionCount}
              </strong>
              개
            </p>
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">
            아래 목록은 최근 생성 작업 기준이에요. 전체 문제는 하단
            ‘생성/검수 결과’에서 확인하세요.
          </p>
        </div>
        {jobs.length === 0 ? (
          <div className="px-3.5 py-5 text-center text-[11.5px] text-slate-400">
            최근 이 지문으로 생성한 기록이 없습니다.
            {savedQuestionCount > 0 ? (
              <span className="mt-1 block">
                (이전에 저장된 문제 {savedQuestionCount}개는 하단 목록에서 확인)
              </span>
            ) : null}
          </div>
        ) : (
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex items-start gap-2 px-3.5 py-2 hover:bg-slate-50"
              >
                <span className="mt-0.5 shrink-0">
                  {job.status === "generating" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  ) : job.status === "error" ? (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-slate-700">
                    {describeJobTypes(job)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                    {job.config?.difficulty ? (
                      <>
                        <span>
                          {DIFFICULTY_LABELS[job.config.difficulty] ||
                            job.config.difficulty}
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    ) : null}
                    <span>{formatWhen(job.createdAt)}</span>
                    {job.status === "error" ? (
                      <span className="font-semibold text-red-400">실패</span>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
