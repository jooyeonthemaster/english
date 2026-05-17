"use client";

import { useEffect, useRef } from "react";
import { PencilLine, Sparkles } from "lucide-react";

import {
  describeEvidenceType,
  type InlineRestorationChange,
} from "../utils/restoration-changes";

interface RestorationChangesPanelProps {
  changes: InlineRestorationChange[];
  /** Change ids whose `after` text can't be located in the current
   *  teacherText — usually because the teacher overrode the AI output. */
  orphanChangeIds: Set<string>;
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}

export function RestorationChangesPanel({
  changes,
  orphanChangeIds,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: RestorationChangesPanelProps) {
  const orphanCount = orphanChangeIds.size;
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-900">복원 근거</span>
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">
            {changes.length}건
          </span>
          {orphanCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700"
              title="강사 수정으로 본문에서 위치를 찾을 수 없는 항목 수"
            >
              <PencilLine className="size-3" aria-hidden="true" />
              수정됨 {orphanCount}
            </span>
          ) : null}
        </div>
        <span className="text-[10.5px] text-slate-400">
          본문의 형광펜과 동기화됩니다
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {changes.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="flex flex-col gap-2 px-3 py-3">
            {changes.map((change, index) => (
              <ChangeCard
                key={change.id}
                change={change}
                index={index}
                hovered={hoveredChangeId === change.id}
                active={activeChangeId === change.id}
                orphan={orphanChangeIds.has(change.id)}
                onHover={onHoverChange}
                onSelect={onSelectChange}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Sparkles className="size-5 text-slate-300" aria-hidden="true" />
      <p className="text-[12px] font-semibold text-slate-500">
        개별 복원 근거가 없습니다
      </p>
      <p className="text-[11px] leading-5 text-slate-400">
        이 자료는 전체 본문 단위로만 복원되었거나
        <br />
        AI 가 세부 변경 사유를 남기지 않았습니다.
      </p>
    </div>
  );
}

function ChangeCard({
  change,
  index,
  hovered,
  active,
  orphan,
  onHover,
  onSelect,
}: {
  change: InlineRestorationChange;
  index: number;
  hovered: boolean;
  active: boolean;
  orphan: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { label, className } = describeEvidenceType(change.changeType);

  // When the corresponding text mark is the one driving the selection
  // (active = clicked in the passage), scroll the matching card into view.
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);

  const confidencePct =
    typeof change.confidence === "number"
      ? Math.round(change.confidence * 100)
      : null;

  const containerClass = (() => {
    if (active) {
      return "border-violet-400 bg-violet-50/60 ring-2 ring-violet-300/40";
    }
    if (hovered) {
      return "border-amber-300 bg-amber-50/40 ring-1 ring-amber-200";
    }
    if (orphan) {
      return "border-dashed border-amber-300 bg-amber-50/30 hover:border-amber-400";
    }
    return "border-slate-200 bg-white hover:border-slate-300";
  })();

  return (
    <li
      ref={ref}
      onMouseEnter={() => onHover(change.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(active ? null : change.id)}
      className={
        "cursor-pointer rounded-lg border p-3 transition-colors " + containerClass
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tabular-nums text-slate-400">
            #{index + 1}
          </span>
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 " +
              className
            }
          >
            {label}
          </span>
          {change.sentenceOrder ? (
            <span className="text-[10px] font-semibold text-slate-500">
              문장 {change.sentenceOrder}
            </span>
          ) : null}
          {orphan ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800"
              title="강사가 복원문을 수정해서 본문에서 이 변경의 위치를 찾을 수 없습니다"
            >
              <PencilLine className="size-2.5" aria-hidden="true" />
              강사 수정됨
            </span>
          ) : null}
        </div>
        {confidencePct !== null ? (
          <span className="text-[10px] font-bold tabular-nums text-slate-400">
            신뢰도 {confidencePct}%
          </span>
        ) : null}
      </div>

      <div
        className={
          "mt-2 flex flex-col gap-1.5 text-[12px] leading-5 " +
          (orphan ? "opacity-70" : "")
        }
      >
        <DiffLine kind="before" text={change.before} />
        <DiffLine kind="after" text={change.after} />
      </div>

      {change.reason ? (
        <p
          className={
            "mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11.5px] leading-5 text-slate-600 " +
            (orphan ? "opacity-80" : "")
          }
        >
          {change.reason}
        </p>
      ) : (
        <p className="mt-2 text-[11px] italic text-slate-400">
          AI 가 별도 사유를 남기지 않았습니다.
        </p>
      )}

      {orphan ? (
        <p className="mt-2 text-[10.5px] leading-4 text-amber-700">
          본문에서 위치 매칭 안 됨 · AI 가 원래 적용했던 복원입니다
        </p>
      ) : null}
    </li>
  );
}

function DiffLine({ kind, text }: { kind: "before" | "after"; text: string }) {
  const isBefore = kind === "before";
  const display = text.trim().length > 0 ? text : "(빈 텍스트)";
  return (
    <div className="flex items-start gap-2">
      <span
        className={
          "mt-0.5 inline-flex h-4 shrink-0 items-center rounded px-1 text-[9.5px] font-bold " +
          (isBefore
            ? "bg-rose-100 text-rose-700"
            : "bg-emerald-100 text-emerald-700")
        }
      >
        {isBefore ? "원문" : "복원"}
      </span>
      <span
        className={
          "min-w-0 flex-1 whitespace-pre-wrap break-words " +
          (isBefore
            ? "text-rose-900 line-through decoration-rose-300/70"
            : "text-emerald-900")
        }
      >
        {display}
      </span>
    </div>
  );
}
