"use client";

import { useEffect, useRef } from "react";
import { Eraser, PencilLine, Sparkles } from "lucide-react";

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

/** `change.after` is empty (after trim) → AI deliberately removed text from
 *  the body (exam marker, student annotation, etc). Surface as a separate
 *  "AI 제거" amber category rather than misclassifying as a teacher-overridden
 *  orphan. AI-removal entries are always "orphan" by construction (there's no
 *  `after` substring to locate in teacherText), but the intent differs. */
function isAiRemovalChange(change: InlineRestorationChange) {
  return change.after.trim().length === 0;
}

export function RestorationChangesPanel({
  changes,
  orphanChangeIds,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: RestorationChangesPanelProps) {
  let teacherEditedCount = 0;
  let aiRemovalCount = 0;
  for (const change of changes) {
    if (isAiRemovalChange(change)) {
      aiRemovalCount += 1;
    } else if (orphanChangeIds.has(change.id)) {
      teacherEditedCount += 1;
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-slate-900">복원 근거</span>
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">
            {changes.length}건
          </span>
          {aiRemovalCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800"
              title="AI 가 본문에서 의도적으로 제거한 항목 수"
            >
              <Eraser className="size-3" aria-hidden="true" />
              AI 제거 {aiRemovalCount}
            </span>
          ) : null}
          {teacherEditedCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700"
              title="강사 수정으로 본문에서 위치를 찾을 수 없는 항목 수"
            >
              <PencilLine className="size-3" aria-hidden="true" />
              수정됨 {teacherEditedCount}
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
            {changes.map((change, index) => {
              const aiRemoval = isAiRemovalChange(change);
              return (
                <ChangeCard
                  key={change.id}
                  change={change}
                  index={index}
                  hovered={hoveredChangeId === change.id}
                  active={activeChangeId === change.id}
                  aiRemoval={aiRemoval}
                  orphan={!aiRemoval && orphanChangeIds.has(change.id)}
                  onHover={onHoverChange}
                  onSelect={onSelectChange}
                />
              );
            })}
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
  aiRemoval,
  orphan,
  onHover,
  onSelect,
}: {
  change: InlineRestorationChange;
  index: number;
  hovered: boolean;
  active: boolean;
  aiRemoval: boolean;
  orphan: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { label, className } = describeEvidenceType(change.changeType);
  // source-match 카드는 본문 전체 비교 대신 짧은 안내로 표시. 두 본문
  // 전체를 카드에 박으면 panel 이 한 카드로 차서 다른 evidence 카드를
  //못 보게 됨.
  const isSourceMatch = change.changeType === "source-match";

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
    if (isSourceMatch) {
      return "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400";
    }
    if (aiRemoval) {
      return "border-amber-300 bg-amber-50/60 hover:border-amber-400";
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
          {aiRemoval ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-900"
              title="AI 가 본문에서 의도적으로 제거한 부분입니다"
            >
              <Eraser className="size-2.5" aria-hidden="true" />
              AI 제거
            </span>
          ) : orphan ? (
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

      {isSourceMatch ? (
        <>
          <p className="mt-2 rounded-md bg-emerald-50 px-2 py-2 text-[12px] leading-5 text-emerald-900">
            이 자료는 학원 DB 의 동일한 raw 자료와 매칭됐어요. 강사 검수본을
            그대로 가져왔고, 아래 다른 근거 카드는 그 검수본의 원래 변경 내역
            이에요.
          </p>
          {change.reason ? (
            <p className="mt-1 text-[10.5px] leading-4 text-emerald-700">
              {change.reason}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div
            className={
              "mt-2 flex flex-col gap-1.5 text-[12px] leading-5 " +
              (orphan ? "opacity-70" : "")
            }
          >
            <DiffLine kind="before" text={change.before} />
            <DiffLine kind="after" text={change.after} aiRemoval={aiRemoval} />
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

          {aiRemoval ? (
            <p className="mt-2 text-[10.5px] leading-4 text-amber-800">
              AI 가 본문에서 제거 · 강사 검수 본문에서도 보이지 않습니다
            </p>
          ) : orphan ? (
            <p className="mt-2 text-[10.5px] leading-4 text-amber-700">
              본문에서 위치 매칭 안 됨 · AI 가 원래 적용했던 복원입니다
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

function DiffLine({
  kind,
  text,
  aiRemoval,
}: {
  kind: "before" | "after";
  text: string;
  aiRemoval?: boolean;
}) {
  const isBefore = kind === "before";
  const isEmpty = text.trim().length === 0;
  const display = isEmpty
    ? isBefore
      ? "(빈 텍스트)"
      : aiRemoval
        ? "(AI 가 제거함)"
        : "(빈 텍스트)"
    : text;
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
            : isEmpty && aiRemoval
              ? "italic text-amber-700"
              : "text-emerald-900")
        }
      >
        {display}
      </span>
    </div>
  );
}
