"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { ViewModeCycleButton } from "@/components/workbench/shared/view-mode-cycle-button";
import type { GridViewMode } from "./task-queue-inline-list-types";
import { VIEW_MODE_OPTIONS } from "./task-queue-inline-list-helpers";
export function TaskCheckbox({
  state,
  onToggle,
}: {
  state: boolean | "indeterminate";
  onToggle: () => void;
}) {
  const indeterminate = state === "indeterminate";
  const checked = state === true;
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }
      }}
      className={
        "flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-slate-300 bg-white hover:border-blue-300")
      }
    >
      {indeterminate ? (
        <span className="block h-[2px] w-[10px] rounded bg-white" />
      ) : checked ? (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3.5 3.5L13 5" />
        </svg>
      ) : null}
    </button>
  );
}

export function EditableTaskTitle({
  title,
  onRename,
  className,
  size = "card",
}: {
  title: string;
  onRename: (next: string) => void | Promise<void>;
  className: string;
  size?: "card" | "row";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  const commit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === title.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [onRename, title, value]);

  const cancel = useCallback(() => {
    setValue(title);
    setEditing(false);
  }, [title]);

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={200}
        placeholder="작업 이름"
        className={
          (size === "row"
            ? "h-6 rounded border border-blue-300 px-1.5 text-[13px] "
            : "h-7 rounded-md border border-blue-300 px-2 text-[13px] ") +
          "w-full min-w-0 bg-white font-semibold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
        }
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setValue(title);
        setEditing(true);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title="작업 이름 편집"
      className={
        "group/edit inline-flex min-w-0 max-w-full cursor-text items-center gap-1 rounded text-left " +
        className
      }
    >
      <span className="min-w-0 truncate">{title}</span>
      <Pencil
        className="size-3 shrink-0 text-slate-300 transition-colors group-hover/edit:text-blue-500"
        aria-hidden="true"
      />
    </button>
  );
}

export function ViewModeToggle({
  value,
  onChange,
  grid3Disabled = false,
}: {
  value: GridViewMode;
  onChange: (mode: GridViewMode) => void;
  grid3Disabled?: boolean;
}) {
  const options = VIEW_MODE_OPTIONS.map((option) =>
    option.value === "grid-3"
      ? {
          ...option,
          disabled: grid3Disabled,
          disabledTitle:
            "드로어가 열려 있는 동안 3열 보기는 사용할 수 없습니다",
        }
      : option,
  );

  return (
    <ViewModeCycleButton value={value} options={options} onChange={onChange} />
  );
}
