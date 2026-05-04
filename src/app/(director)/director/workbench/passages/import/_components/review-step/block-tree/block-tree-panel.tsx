"use client";

// ============================================================================
// BlockTreePanel — left column of review surface. Extracted from
// review-step.tsx during mechanical split.
// ============================================================================

import { EyeOff, FileText, Filter, Layers } from "lucide-react";
import { PageTreeGroup } from "./block-tree-node";
import type { Stats, Tree } from "../types";

interface BlockTreePanelProps {
  tree: Tree;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
  suspectOnly: boolean;
  onToggleSuspect: () => void;
  totals: Stats;
}

export function BlockTreePanel({
  tree,
  selectedId,
  onSelect,
  onHoverPage,
  suspectOnly,
  onToggleSuspect,
  totals,
}: BlockTreePanelProps) {
  return (
    <aside
      className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white"
      aria-label="블록 트리 패널"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
          <Layers className="size-4 text-slate-500" strokeWidth={1.8} />
          블록 트리
        </div>
        <button
          onClick={onToggleSuspect}
          aria-pressed={suspectOnly}
          className={
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
            (suspectOnly
              ? "bg-sky-100 text-sky-700"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200")
          }
        >
          {suspectOnly ? (
            <EyeOff className="size-3" strokeWidth={1.8} />
          ) : (
            <Filter className="size-3" strokeWidth={1.8} />
          )}
          {suspectOnly ? "의심만 보기" : "모두 보기"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tree.pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <FileText className="size-8 text-slate-300" strokeWidth={1.5} />
            <div className="text-[12px] text-slate-500">
              표시할 블록이 없습니다.
            </div>
          </div>
        ) : (
          tree.pages.map((pg) => (
            <PageTreeGroup
              key={pg.pageIndex}
              pageGroup={pg}
              selectedId={selectedId}
              onSelect={onSelect}
              onHoverPage={onHoverPage}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          합계
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
          <TotalRow label="지문" value={totals.passages} />
          <TotalRow label="문제" value={totals.questions} />
          <TotalRow label="선지" value={totals.choices} />
          <TotalRow label="해설" value={totals.explanations} />
          <TotalRow label="메타" value={totals.meta} />
          <TotalRow label="의심" value={totals.suspects} tone="sky" />
        </dl>
      </div>
    </aside>
  );
}

function TotalRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "sky";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd
        className={
          "font-bold tabular-nums " +
          (tone === "sky" ? "text-sky-700" : "text-slate-800")
        }
      >
        {value}
      </dd>
    </div>
  );
}
