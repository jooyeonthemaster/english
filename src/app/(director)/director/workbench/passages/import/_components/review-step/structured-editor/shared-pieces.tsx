"use client";

// ============================================================================
// Shared editor pieces — BlockHeader, TypeSwitcher, BlockActions, ActionBtn,
// EmptyEditor. Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { CheckCircle2, Merge, Scissors, Trash2 } from "lucide-react";
import {
  BLOCK_TYPE_LIST,
  type BlockType,
} from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { toneForConfidence } from "../confidence";

export function BlockHeader({
  item,
  onChangeTitle,
}: {
  item: ExtractionItemSnapshot;
  onChangeTitle: (t: string) => void;
}) {
  const tone = toneForConfidence(item.confidence);
  return (
    <div className="border-b border-slate-200 px-5 py-3">
      <input
        value={item.title ?? ""}
        onChange={(e) => onChangeTitle(e.target.value)}
        className="w-full border-none bg-transparent text-[14px] font-bold text-slate-800 outline-none placeholder:text-slate-300"
        placeholder="블록 제목 (선택)"
        aria-label="블록 제목"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>
          원본 페이지 {item.sourcePageIndex.map((i) => `p.${i + 1}`).join(", ")}
        </span>
        <span>·</span>
        <span>{item.content.trim().length.toLocaleString("ko-KR")}자</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone.bg} ${tone.text}`}
        >
          신뢰도 {tone.label}
        </span>
        {item.needsReview ? (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            검토 필요
          </span>
        ) : null}
        {(item.passageMeta as { markerDetected?: boolean } | null)
          ?.markerDetected ? (
          <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            <CheckCircle2 className="size-3" /> 마커 탐지
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TypeSwitcher({
  selected,
  onChange,
}: {
  selected: BlockType;
  onChange: (t: BlockType) => void;
}) {
  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as BlockType);
  };
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-5 py-2">
      <span className="text-[11px] font-semibold text-slate-500">
        블록 타입
      </span>
      <select
        value={selected}
        onChange={onSelect}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label="블록 타입 변경"
      >
        {BLOCK_TYPE_LIST.map((cfg) => (
          <option key={cfg.id} value={cfg.id}>
            {cfg.label} (Alt+{cfg.keyboardShortcut})
          </option>
        ))}
      </select>
      <span className="text-[10px] text-slate-400">
        단축키 Alt+1~9, Alt+0으로 즉시 변경
      </span>
    </div>
  );
}

export function BlockActions({
  onSplit,
  canSplit,
  onMergeWithNext,
  onSkipToggle,
  isSkipped,
}: {
  onSplit: () => void;
  canSplit: boolean;
  onMergeWithNext: () => void;
  onSkipToggle: () => void;
  isSkipped: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
      <ActionBtn
        onClick={onMergeWithNext}
        icon={Merge}
        label="다음과 병합"
      />
      <ActionBtn
        onClick={onSplit}
        disabled={!canSplit}
        icon={Scissors}
        label="커서에서 분할"
      />
      <div className="flex-1" />
      <ActionBtn
        onClick={onSkipToggle}
        icon={Trash2}
        label={isSkipped ? "복구" : "무시"}
        tone={isSkipped ? "default" : "danger"}
      />
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon: Icon,
  label,
  tone = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: "default" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 " +
        cls
      }
    >
      <Icon className="size-3.5" strokeWidth={1.8} />
      {label}
    </button>
  );
}

export function EmptyEditor({ hint }: { hint: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-slate-400">
      {hint}
    </div>
  );
}
