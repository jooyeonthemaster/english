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

// Serialize the edited DOM back to the raw markup string. We keep the formatted
// render visible while editing (so clicking the text doesn't reflow the
// preview), which means innerText would drop markup like blanks (_____) and
// underlines (__x__). The marker spans produced by renderFormattedInline carry
// data attributes so we can reconstruct the original syntax here.
function serializeEditableDom(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      const mark = el.dataset.mark;
      if (mark === "blank") {
        out += el.dataset.raw ?? "_____";
        return;
      }
      if (mark === "u") {
        out += `__${el.textContent ?? ""}__`;
        return;
      }
      // Block boundaries become newlines: edit-inserted <div>/<p> (Enter key) and
      // the formatted given-block span (data-block). Mirrors innerText's reading.
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.dataset.block === "1";
      if (isBlock && out && !out.endsWith("\n")) out += "\n";
      walk(el);
      if (isBlock && !out.endsWith("\n")) out += "\n";
    });
  };
  walk(root);
  return out;
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
        const next = normalizeEditableText(serializeEditableDom(event.currentTarget));
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      className={cn(
        "editable-paper-field rounded-[3px] outline-none transition-colors hover:bg-blue-50/70 focus:bg-blue-50 focus:ring-2 focus:ring-blue-300/60",
        isEmpty && "text-slate-300",
        className,
      )}
    >
      {/* Keep the formatted view at all times — swapping to the raw string on
          focus is what made the box re-wrap/jump when clicked. */}
      {isEmpty ? (editing ? null : placeholder) : children ?? value}
    </span>
  );
}
