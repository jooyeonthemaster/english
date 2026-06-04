"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronRight, ClipboardList, Pencil } from "lucide-react";

export function GroupSection({
  label,
  derivedLabel,
  count,
  tone,
  expanded,
  allChecked,
  someChecked,
  onToggle,
  onToggleAllInGroup,
  sourceMaterialId,
  dragIds,
  onRenameSourceMaterial,
  children,
}: {
  label: string;
  /** Auto-derived label used when there is no teacher-set title. Shown as
   *  the input placeholder so the teacher can see what the default would
   *  revert to if they clear the field. */
  derivedLabel: string;
  count: number;
  tone: "blue" | "amber";
  expanded: boolean;
  allChecked: boolean;
  someChecked: boolean;
  onToggle: () => void;
  onToggleAllInGroup: (select: boolean) => void;
  sourceMaterialId: string | null;
  dragIds: string[];
  onRenameSourceMaterial: (id: string, title: string) => void;
  children: React.ReactNode;
}) {
  const dragRef = useRef<HTMLElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el || dragIds.length === 0) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "draft-bulk", draftIds: dragIds }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [dragIds]);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  const editable = sourceMaterialId !== null;
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(label);

  const commit = useCallback(() => {
    if (!sourceMaterialId) {
      setEditing(false);
      return;
    }
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0 || trimmed === label) {
      setEditing(false);
      setTitleDraft(label);
      return;
    }
    onRenameSourceMaterial(sourceMaterialId, trimmed);
    setEditing(false);
  }, [sourceMaterialId, titleDraft, label, onRenameSourceMaterial]);

  const cancel = useCallback(() => {
    setTitleDraft(label);
    setEditing(false);
  }, [label]);

  const accent =
    tone === "blue"
      ? "border-blue-500 bg-blue-50/50"
      : "border-amber-500 bg-amber-50/50";
  const iconBg =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-amber-100 text-amber-700";
  const badgeBg =
    tone === "blue"
      ? "bg-white text-blue-700 ring-blue-200"
      : "bg-white text-amber-700 ring-amber-200";

  return (
    <section
      ref={dragRef}
      className={
        "overflow-hidden rounded-xl border-l-4 motion-safe:transition-opacity " +
        (isDragging
          ? "cursor-grabbing opacity-60 "
          : "cursor-grab active:cursor-grabbing ") +
        accent
      }
    >
      <header className="flex w-full items-start gap-2.5 border-b border-slate-100/70 bg-white px-4">
        <div
          className="-m-1 mt-3 flex shrink-0 cursor-pointer items-center p-1"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAllInGroup(!allChecked);
          }}
          title={allChecked ? "시험지 선택 해제" : "시험지 전체 선택"}
        >
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allChecked}
            readOnly
            tabIndex={-1}
            className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`${label} 전체 선택`}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-2.5 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "그룹 접기" : "그룹 펼치기"}
            className="mt-1.5 flex shrink-0 cursor-pointer items-center"
          >
            <ChevronRight
              className={
                "size-4 text-slate-400 motion-safe:transition-transform motion-safe:duration-150 " +
                (expanded ? "rotate-90" : "")
              }
              aria-hidden="true"
            />
          </button>
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconBg}`}
          >
            <ClipboardList className="size-4" aria-hidden="true" />
          </span>
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              maxLength={200}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={derivedLabel}
              className="min-w-0 flex-1 max-w-md rounded-md border border-blue-300 bg-white px-2 py-0.5 text-sm font-bold text-slate-900 outline-none ring-2 ring-blue-100"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-left transition-colors hover:opacity-90"
            >
              <h4 className="min-w-0 break-all text-sm font-bold tracking-tight text-slate-900">
                {label}
              </h4>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${badgeBg}`}
              >
                {count}개
              </span>
              {editable ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTitleDraft(label);
                    setEditing(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setTitleDraft(label);
                      setEditing(true);
                    }
                  }}
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="시험지 이름 편집"
                  title="이름 편집"
                >
                  <Pencil className="size-3.5" />
                </span>
              ) : null}
              {!expanded ? (
                <span className="ml-auto shrink-0 text-[11px] font-medium text-slate-400">
                  클릭해서 펼치기
                </span>
              ) : null}
            </button>
          )}
        </div>
      </header>
      {expanded ? <div className="px-3 py-3">{children}</div> : null}
    </section>
  );
}
