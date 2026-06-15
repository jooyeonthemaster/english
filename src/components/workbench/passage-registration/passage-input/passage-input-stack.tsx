"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
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
  onAnalyze: (plan: QuestionGenerationPlan) => void;
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

  const primaryAnalysisPlan: QuestionGenerationPlan =
    FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? "PREMIUM" : "STANDARD";
  const standardUnitCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.PASSAGE_ANALYSIS,
    "STANDARD",
  );
  const primaryUnitCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.PASSAGE_ANALYSIS,
    primaryAnalysisPlan,
  );
  const n = validRows.length;
  const standardTotal = standardUnitCost * Math.max(1, n);
  const primaryTotal = primaryUnitCost * Math.max(1, n);

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

      {/* Analyze footer */}
      <div
        className={
          FEATURE_FLAGS.SHOW_MODEL_SELECTOR
            ? "mt-2 grid w-full shrink-0 grid-cols-1 gap-2 2xl:grid-cols-2"
            : "mt-2 w-full shrink-0"
        }
      >
        {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
          <Button
            variant="outline"
            onClick={() => onAnalyze("STANDARD")}
            disabled={!canAnalyze}
            className="h-9 w-full rounded-lg border-blue-200 px-3 text-[12.5px] font-bold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            일반 분석 시작
            {countChip}
            <CreditCostChip
              amount={standardTotal}
              className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700"
            />
          </Button>
        )}
        <Button
          onClick={() => onAnalyze(primaryAnalysisPlan)}
          disabled={!canAnalyze}
          className="h-9 w-full rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold hover:bg-blue-700"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          분석 시작
          {countChip}
          <CreditCostChip
            amount={primaryTotal}
            className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]"
          />
        </Button>
      </div>
    </div>
  );
}
