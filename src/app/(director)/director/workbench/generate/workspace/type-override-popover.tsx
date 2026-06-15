"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EXAM_TYPE_GROUPS, typeLabel } from "../generate-page-types";
import type { RowOverride } from "./workspace-types";

// ============================================================================
// 지문별 유형 오버라이드 팝오버 — 이 지문에만 적용할 유형 개수/난이도.
// 비워두면(기본) 우측 "유형 설정" 패널의 전체 설정을 따른다.
// ============================================================================

const DIFFICULTY_OPTIONS = [
  { value: null, label: "전체 설정" },
  { value: "BASIC", label: "기본" },
  { value: "INTERMEDIATE", label: "중급" },
  { value: "KILLER", label: "킬러" },
] as const;

interface TypeOverridePopoverProps {
  override: RowOverride | null;
  onChange: (override: RowOverride | null) => void;
  disabled?: boolean;
}

export function overrideSummary(override: RowOverride | null): string {
  if (!override) return "전체 설정 따름";
  const diff = overrideDifficultyLabel(override);
  const types = overrideTypeSummary(override);
  return (
    [types, diff].filter(Boolean).join(" / ") ||
    "전체 설정 따름"
  );
}

/** 난이도 값 → 한글 라벨 (없으면 null). */
export function difficultyLabel(
  value: "BASIC" | "INTERMEDIATE" | "KILLER" | null | undefined,
): string | null {
  return value === "BASIC"
    ? "기본"
    : value === "INTERMEDIATE"
      ? "중급"
      : value === "KILLER"
        ? "킬러"
        : null;
}

/** 오버라이드의 난이도 라벨 (없으면 null) — 별도 뱃지 표기용. */
export function overrideDifficultyLabel(
  override: RowOverride | null,
): string | null {
  return difficultyLabel(override?.difficulty);
}

/** 난이도를 뺀 유형 요약 (유형 + 세부옵션 표시). 유형이 없으면 빈 문자열. */
export function overrideTypeSummary(override: RowOverride | null): string {
  if (!override) return "";
  const parts = Object.entries(override.typeCounts)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${typeLabel(id)} ${n}`);
  const hasDetail =
    !!override.questionTypeSettings &&
    Object.keys(override.questionTypeSettings).length > 0;
  const head = parts.slice(0, 2).join("·");
  const more = parts.length > 2 ? ` 외 ${parts.length - 2}` : "";
  const base = head + more;
  if (!base) return hasDetail ? "세부옵션" : "";
  return hasDetail ? `${base}·세부` : base;
}

export function TypeOverridePopover({
  override,
  onChange,
  disabled,
}: TypeOverridePopoverProps) {
  const [open, setOpen] = useState(false);

  const allTypes = useMemo(
    () =>
      EXAM_TYPE_GROUPS.flatMap((group) =>
        group.items.map((item) => ({ ...item, groupLabel: group.group })),
      ),
    [],
  );

  const counts = override?.typeCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasOverride = override !== null;

  const setCount = (typeId: string, count: number) => {
    const nextCounts = { ...counts };
    if (count <= 0) delete nextCounts[typeId];
    else nextCounts[typeId] = Math.min(10, count);
    const isEmpty =
      Object.keys(nextCounts).length === 0 &&
      (override?.difficulty ?? null) === null;
    onChange(
      isEmpty
        ? null
        : { typeCounts: nextCounts, difficulty: override?.difficulty ?? null },
    );
  };

  const setDifficulty = (
    difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" | null,
  ) => {
    const isEmpty = Object.keys(counts).length === 0 && difficulty === null;
    onChange(isEmpty ? null : { typeCounts: { ...counts }, difficulty });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="이 지문에만 적용할 유형·난이도 지정"
          className={
            "flex h-7 min-w-0 shrink items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
            (hasOverride
              ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600")
          }
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 max-w-[160px] truncate">
            {hasOverride ? overrideSummary(override) : "지문별 유형"}
          </span>
          {total > 0 ? (
            <span className="rounded-sm bg-blue-600 px-1 py-px text-[10px] font-bold leading-none text-white tabular-nums">
              {total}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[330px] p-0 shadow-xl"
      >
        <div className="border-b border-slate-100 px-3.5 py-2.5">
          <p className="text-[12.5px] font-bold text-slate-800">
            이 지문에만 적용할 설정
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            유형을 고르면 오른쪽 ‘유형·생성 설정’ 대신 이 설정으로 생성돼요.
            난이도만 고르면 유형은 오른쪽 설정을 따르고 난이도만 바뀝니다.
            유형별 세부 옵션(빈칸 수 등)은 오른쪽 설정 값을 따라요.
          </p>
        </div>

        {/* 난이도 */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-3.5 py-2.5">
          <span className="mr-1 shrink-0 text-[11px] font-semibold text-slate-500">
            난이도
          </span>
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = (override?.difficulty ?? null) === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDifficulty(opt.value)}
                className={
                  "h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors " +
                  (active
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-400 hover:text-slate-600")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 유형 목록 */}
        <div className="max-h-[300px] overflow-y-auto px-2 py-1.5">
          {allTypes.map((t) => {
            const count = counts[t.id] ?? 0;
            return (
              <div
                key={t.id}
                className={
                  "flex items-center justify-between gap-2 rounded-md px-1.5 py-1 " +
                  (count > 0 ? "bg-blue-50/60" : "hover:bg-slate-50")
                }
              >
                <span
                  className={
                    "min-w-0 truncate text-[12px] " +
                    (count > 0
                      ? "font-semibold text-blue-800"
                      : "text-slate-600")
                  }
                >
                  {t.label}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCount(t.id, count - 1)}
                    disabled={count <= 0}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    aria-label={`${t.label} 감소`}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-[12px] font-bold tabular-nums text-slate-700">
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCount(t.id, count + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                    aria-label={`${t.label} 증가`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2">
          <button
            type="button"
            onClick={() => {
              onChange(null);
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition-colors hover:text-red-500"
          >
            <RotateCcw className="h-3 w-3" />
            전체 설정 따름으로 초기화
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700"
          >
            완료
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
