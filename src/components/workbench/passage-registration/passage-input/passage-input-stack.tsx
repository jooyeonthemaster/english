"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Eye, Loader2, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getPassageAnalysisCreditCost,
  PASSAGE_ANALYSIS_BASE_CREDIT_COST,
  PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST,
} from "@/lib/passage-analysis-credit-costs";
import {
  LearningSheetPreviewModal,
  type LearningSheetVariant,
} from "../learning-sheet-preview-modal";
import { PassageInputRow } from "./passage-input-row";
import {
  isPristineEmptyRow,
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow as RowData,
} from "./types";

interface PassageInputStackProps {
  rows: RowData[];
  setRows: Dispatch<SetStateAction<RowData[]>>;
  /** True while the parent is persisting + analyzing. Locks every input. */
  saving: boolean;
  /** Persist + analyze every valid row (each carries its own annotations). */
  onAnalyze: (
    plan: QuestionGenerationPlan,
    options: { includeWorksheet: boolean },
  ) => void;
}

/**
 * Unified multi-passage annotation surface for the 학습지 생성 page. Replaces
 * both the old single-passage center editor AND the separate 직접 입력 paste tab:
 * a numbered stack of passage cards (지문 1·2·N), each with its own tiptap
 * annotation editor + per-row AI 복원, a 지문 추가 button, and a single 분석 시작
 * footer that analyzes them all (marks → per-passage analysis). Drafts checked
 * in 자료 관리 are loaded in as rows by the parent.
 */
export function PassageInputStack({
  rows,
  setRows,
  saving,
  onAnalyze,
}: PassageInputStackProps) {
  const updateRow = (localId: string, patch: Partial<RowData>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );

  const addRow = () =>
    setRows((prev) => [...prev, makeEmptyRow()]);

  const removeRow = (localId: string) =>
    setRows((prev) => {
      // With more than one row, drop it. The LAST remaining row can't be
      // dropped (the stack always keeps one input), so clearing it resets to a
      // blank row — this is the "끄기/비우기" affordance for a single loaded 지문.
      if (prev.length > 1) return prev.filter((r) => r.localId !== localId);
      return [makeEmptyRow()];
    });

  // Replace one row with N rows built from its detected chunks (smart-split).
  const splitRow = (localId: string, chunks: string[]) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.localId === localId);
      if (idx < 0) return prev;
      const built = chunks.map((c, i) => {
        const row = makeEmptyRow(c);
        // Keep the original title on the first chunk only.
        if (i === 0 && prev[idx].title) row.title = prev[idx].title;
        return row;
      });
      return [...prev.slice(0, idx), ...built, ...prev.slice(idx + 1)];
    });

  const validRows = useMemo(
    () => rows.filter((r) => r.content.trim().length >= MIN_CONTENT_CHARS),
    [rows],
  );
  const canAnalyze = validRows.length > 0 && !saving;

  const primaryAnalysisPlan: QuestionGenerationPlan = "STANDARD";
  const primaryUnitCost = PASSAGE_ANALYSIS_BASE_CREDIT_COST;

  // ── 학습지 구성 선택 — 기본 vs 실전 학습지 포함 (선택은 브라우저에 기억) ──
  const [includeWorksheet, setIncludeWorksheet] = usePersistedState<boolean>(
    "smoat:passages-create:include-worksheet",
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  const [previewVariant, setPreviewVariant] =
    useState<LearningSheetVariant | null>(null);

  const worksheetUnitCost = PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST;
  const n = validRows.length;
  const selectedUnitCost = getPassageAnalysisCreditCost({ includeWorksheet });
  const primaryTotal = selectedUnitCost * Math.max(1, n);
  const selectedSheetLabel = includeWorksheet
    ? "실전 학습지 포함"
    : "기본 학습지";

  const countChip =
    n > 1 ? (
      <span className="inline-flex items-center rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
        {n}개
      </span>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Intro */}
      <div className="mb-2 shrink-0">
        <p className="text-[12px] leading-relaxed text-slate-500">
          왼쪽 <b className="text-slate-600">자료 관리</b>에서 지문을 체크해{" "}
          <b className="text-blue-600">불러오거나</b>, 여기에 영어 지문을 직접
          붙여넣으세요. 여러 지문은 <b className="text-blue-600">“지문 추가”</b>로
          늘리고, 텍스트를 드래그해 핵심 어휘·어법·출제 포인트를 마킹하면 분석에
          그대로 반영됩니다.
        </p>
      </div>

      {/* Rows (scrollable). With a single row, it stretches to fill the height. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-1 pr-0.5">
        {rows.map((row, i) => (
          <PassageInputRow
            key={row.localId}
            index={i}
            row={row}
            onChange={(patch) => updateRow(row.localId, patch)}
            onRemove={() => removeRow(row.localId)}
            // Show the X when there's more than one row (delete), OR on the last
            // row once it holds something (clear it back to empty).
            canRemove={rows.length > 1 || !isPristineEmptyRow(row)}
            removeMode={rows.length > 1 ? "delete" : "clear"}
            disabled={saving}
            onSplit={(chunks) => splitRow(row.localId, chunks)}
            grow={rows.length === 1}
          />
        ))}
      </div>

      {/* 지문 추가 — 스크롤 밖, 분석 버튼 바로 위 */}
      <div className="shrink-0 pt-2">
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 py-2.5 text-[13px] font-bold text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100/70 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          지문 추가
        </button>
      </div>

      {/* ── 학습지 구성 선택 — 무엇이 만들어지는지 실물로 보고 고른다 ── */}
      <div className="mt-2.5 shrink-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            학습지 구성
          </span>
          <button
            type="button"
            onClick={() => setPreviewVariant(includeWorksheet ? "practice" : "basic")}
            className="flex items-center gap-1 text-[11.5px] font-bold text-blue-600 transition-colors hover:text-blue-700 hover:underline"
          >
            <Eye className="size-3.5" />
            실제 생성 예시 보기
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="학습지 구성 선택"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {(
            [
              {
                id: "basic" as const,
                selected: !includeWorksheet,
                title: "기본 학습지",
                desc: "원문 필기 캔버스 · 논리 구조 · 요약 · 어법 · 출제 포인트 · 어휘 · 구문 분석",
                unit: primaryUnitCost,
              },
              {
                id: "practice" as const,
                selected: includeWorksheet,
                title: "실전 학습지 포함",
                desc: "기본 구성 + 어법 선택 워크북 · 어휘 빈칸 · 배열 영작 + 수능형 추론 5문항",
                unit: primaryUnitCost + worksheetUnitCost,
              },
            ]
          ).map((option) => (
            <div
              key={option.id}
              role="radio"
              aria-checked={option.selected}
              tabIndex={0}
              onClick={() => !saving && setIncludeWorksheet(option.id === "practice")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!saving) setIncludeWorksheet(option.id === "practice");
                }
              }}
              className={`group flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 transition-all ${
                option.selected
                  ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              } ${saving ? "pointer-events-none opacity-60" : ""}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    option.selected
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 bg-white group-hover:border-slate-400"
                  }`}
                >
                  {option.selected ? (
                    <span className="size-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[12.5px] font-bold ${
                    option.selected ? "text-blue-800" : "text-slate-700"
                  }`}
                >
                  {option.title}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    option.selected
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  지문당 ◈{option.unit}
                </span>
              </div>
              <p className="pl-5 text-[11px] leading-snug text-slate-500">
                {option.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Generate footer */}
      <div className="mt-2 w-full shrink-0">
        <Button
          onClick={() => onAnalyze(primaryAnalysisPlan, { includeWorksheet })}
          disabled={!canAnalyze}
          className="h-10 w-full rounded-lg bg-blue-600 px-3 text-[13px] font-extrabold hover:bg-blue-700"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {selectedSheetLabel} 생성하기
          {countChip}
          <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
            {primaryTotal.toLocaleString("ko-KR")} 크레딧
          </span>
        </Button>
      </div>

      {/* 실제 학습지 미리보기 — 기본/실전 비교는 실제 생성 데이터 그대로 */}
      <LearningSheetPreviewModal
        open={previewVariant !== null}
        initialVariant={previewVariant ?? "basic"}
        basicUnitCost={primaryUnitCost}
        onClose={() => setPreviewVariant(null)}
        onApplyVariant={(variant) => {
          setIncludeWorksheet(variant === "practice");
          setPreviewVariant(null);
        }}
      />
    </div>
  );
}
