import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function normalizeEditableText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function EditableText({
  value,
  onCommit,
  className,
  children,
  placeholder = "",
  readOnly = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const isEmpty = !value.trim();

  if (readOnly) {
    return <span className={className}>{isEmpty ? placeholder : children ?? value}</span>;
  }

  return (
    <span
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => setEditing(true)}
      onBlur={(event) => {
        const next = normalizeEditableText(event.currentTarget.innerText);
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      className={cn(
        "editable-paper-field rounded-[3px] outline-none transition-colors hover:bg-blue-50/70 focus:bg-blue-50 focus:ring-2 focus:ring-blue-300/60",
        isEmpty && "text-slate-300",
        className,
      )}
    >
      {editing ? value : isEmpty ? placeholder : children ?? value}
    </span>
  );
}
