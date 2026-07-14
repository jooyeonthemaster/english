"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 탭 · 취약점 분해 버킷 행 (analysis-breakdown 에서 분리)
//
// 접힘 = 헤더(정답률·스택바) + 정오색 문항 칩 한 줄(개요).
// 펼침 = (지문별이면 지문 발췌) + 문항별 답안 미니 행(정오·학생답→정답·배점).
// 모든 문항 칩/행은 원본 문항 상세보기 모달로 점프한다. AI 0콜.
// ============================================================================

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_STYLE } from "./grading-shared";
import type { WeaknessBucket } from "./grading-weakness";

/** 버킷 펼침 행 재료 — 문항 1개의 답안·배점 요약(analysis-step 이 조립). */
export interface BucketQuestionInfo {
  number: string;
  typeLabel: string;
  kind: "MC" | "SHORT" | "ESSAY";
  points: number | null;
  status: ResponseStatus;
  /** 학생답 표시 텍스트(MC=①~⑤, 서답=원문). 미입력이면 null. */
  studentText: string | null;
  /** 정답 표시 텍스트(MC=①~⑤, 서답=모범답 요약). 부재 시 "—". */
  correctText: string;
  /** 획득 점수(CORRECT=배점, PARTIAL=부분, WRONG=0, 미상=null). */
  earnedPoints: number | null;
}

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** 문항 칩 상태색 — STATUS_STYLE 4색 계약의 칩 변주. */
const CHIP_STYLE: Record<ResponseStatus, string> = {
  CORRECT: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  WRONG: "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100",
  PARTIAL: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  UNKNOWN: "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
};

export function BucketRow({
  bucket,
  statusByNumber,
  questionInfo,
  passageExcerpt,
  chipStatuses,
  onSelectQuestion,
}: {
  bucket: WeaknessBucket;
  statusByNumber: Map<string, ResponseStatus>;
  questionInfo: Map<string, BucketQuestionInfo>;
  /** 지문별 차원에서 이 버킷(지문)의 발췌 — 그 외 차원은 null. */
  passageExcerpt: string | null;
  /** 문항 칩 정오 표시 필터(빈 배열 = 전체). 버킷 통계·스택바는 불변. */
  chipStatuses: ResponseStatus[];
  onSelectQuestion: (number: string) => void;
}) {
  // 펼침 — 접힘=정오색 칩 한 줄(개요), 펼침=문항별 답안 미니 행(+지문 발췌).
  const [open, setOpen] = useState(false);
  const weak = bucket.graded >= 2 && (bucket.accuracy ?? 1) < 0.5;
  // 정오 표시 필터가 걸리면 해당 상태의 문항만 남긴다(통계는 그대로).
  const numbers =
    chipStatuses.length === 0
      ? bucket.numbers
      : bucket.numbers.filter((n) =>
          chipStatuses.includes(statusByNumber.get(n) ?? "UNKNOWN"),
        );

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/40 px-3.5 py-3">
      {/* 헤더 = 펼침 토글(행 어디를 눌러도 열림) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate text-[13px] font-bold text-slate-800"
            title={bucket.sublabel ? `${bucket.label} ${bucket.sublabel}` : bucket.label}
          >
            {bucket.label}
          </span>
          {bucket.sublabel && (
            <span className="shrink-0 whitespace-nowrap text-[10.5px] font-semibold text-slate-400">
              {bucket.sublabel}
            </span>
          )}
          {weak && (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
              주의
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-baseline gap-2 text-[12px] tabular-nums">
            <span className={cn("font-bold", weak ? "text-rose-600" : "text-slate-700")}>
              {pct(bucket.accuracy)}
            </span>
            <span className="font-semibold text-slate-400">
              {bucket.correct}/{bucket.graded}
              <span className="ml-1 font-medium">
                · {bucket.total}문항 {bucket.maxPoints > 0 ? `${bucket.maxPoints}점` : ""}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {/* 스택바 — 정답 emerald / 부분 blue / 오답 rose / 미상 slate */}
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
        <Segment n={bucket.correct} total={bucket.total} className="bg-emerald-500" />
        <Segment n={bucket.partial} total={bucket.total} className="bg-blue-500" />
        <Segment n={bucket.wrong} total={bucket.total} className="bg-rose-500" />
        <Segment n={bucket.unknown} total={bucket.total} className="bg-slate-300" />
      </div>

      {open ? (
        /* ── 펼침: (지문 발췌) + 문항별 답안 미니 행 ── */
        <div className="mt-2.5 flex flex-col gap-1.5">
          {passageExcerpt && (
            <p
              className="line-clamp-4 rounded-md bg-white px-3 py-2 font-mono text-[11.5px] leading-relaxed text-slate-500 ring-1 ring-slate-100"
              title="지문 발췌 — 전문은 문항 상세보기에서 확인"
            >
              {passageExcerpt}
            </p>
          )}
          {numbers.length === 0 ? (
            <p className="py-2 text-center text-[11.5px] text-slate-400 break-keep">
              문항 표시 필터에 해당하는 문항이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {numbers.map((num) => {
                const info = questionInfo.get(num);
                const status = STATUS_STYLE[statusByNumber.get(num) ?? "UNKNOWN"];
                return (
                  <li key={num}>
                    <button
                      type="button"
                      onClick={() => onSelectQuestion(num)}
                      title={`${num}번 문항 상세보기`}
                      className="flex w-full items-center gap-2.5 rounded-md bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-100 transition-colors hover:bg-blue-50/30 hover:ring-blue-200"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold",
                          status.bg,
                          status.text,
                        )}
                      >
                        {status.symbol}
                      </span>
                      <span className="w-7 shrink-0 text-[12.5px] font-extrabold tabular-nums text-slate-800">
                        {num}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-500"
                        title={info?.typeLabel}
                      >
                        {info?.typeLabel ?? ""}
                      </span>
                      {/* 학생답 → 정답 */}
                      <span className="flex min-w-0 shrink items-baseline gap-1 text-[12px] font-semibold tabular-nums">
                        {info?.studentText ? (
                          <span
                            className={cn("max-w-[10rem] truncate", status.text)}
                            title={info.studentText}
                          >
                            {info.studentText}
                          </span>
                        ) : (
                          <span className="text-slate-300">미입력</span>
                        )}
                        <span className="shrink-0 text-slate-300">→</span>
                        <span
                          className="max-w-[10rem] truncate text-emerald-700"
                          title={info?.correctText}
                        >
                          {info?.correctText ?? "—"}
                        </span>
                      </span>
                      {info?.points != null && (
                        <span className="w-14 shrink-0 whitespace-nowrap text-right text-[11.5px] font-semibold tabular-nums text-slate-400">
                          {info.earnedPoints != null ? info.earnedPoints : "—"}/
                          {info.points}점
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        /* ── 접힘: 정오색 칩 개요 한 줄 ── */
        numbers.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[10.5px] font-semibold text-slate-400">문항</span>
            {numbers.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onSelectQuestion(num)}
                title={`${num}번 문항 상세보기`}
                className={cn(
                  "inline-flex h-5 min-w-[1.625rem] items-center justify-center rounded border px-1 text-[11px] font-bold tabular-nums transition-colors",
                  CHIP_STYLE[statusByNumber.get(num) ?? "UNKNOWN"],
                )}
              >
                {num}
              </button>
            ))}
          </div>
        )
      )}
    </li>
  );
}

function Segment({
  n,
  total,
  className,
}: {
  n: number;
  total: number;
  className: string;
}) {
  if (n <= 0 || total <= 0) return null;
  return <div className={className} style={{ width: `${(n / total) * 100}%` }} />;
}
