import * as React from "react";
import { useEffect, useRef, useState } from "react";
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
  style,
  children,
  editingChildren,
  placeholder = "",
  readOnly = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  // 칸/쪽 경계에서 쪼개진 본문 전용: 평소엔 이 칸에 배치된 조각(children)만 서식 그대로
  // 보이다가, 클릭(편집 시작)하면 본문 "전체"(editingChildren)로 펼쳐 통째로 편집한다.
  // (조각만 편집하면 직렬화 시 나머지 본문이 날아가므로.) 미지정이면 기존 동작 그대로.
  editingChildren?: React.ReactNode;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const isEmpty = !value.trim();

  // editingChildren 으로 펼친 직후 캐럿을 끝에 둔다(내용이 조각→전체로 바뀌어 캐럿이
  // 유효하지 않을 수 있으므로). 일반(펼침 없음) 편집은 브라우저 기본 캐럿을 그대로 둔다.
  useEffect(() => {
    if (!editing || editingChildren === undefined || !ref.current) return;
    const el = ref.current;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing, editingChildren]);

  if (readOnly) {
    return (
      <span className={className} style={style}>
        {isEmpty ? placeholder : children ?? value}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      onFocus={() => setEditing(true)}
      onBlur={(event) => {
        const next = normalizeEditableText(serializeEditableDom(event.currentTarget));
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      className={cn(
        // cursor-text + caret-color 로 클릭 시 I-빔 커서와 깜빡이는 캐럿이 또렷이 보이게 한다.
        "editable-paper-field cursor-text caret-blue-600 rounded-[3px] outline-none transition-colors hover:bg-blue-50/70 focus:bg-blue-50 focus:ring-2 focus:ring-blue-300/60",
        isEmpty && "text-slate-300",
        className,
      )}
    >
      {/* 평소엔 서식 렌더를 그대로 유지(클릭 시 재배치/점프 방지). 쪼개진 본문만 편집 중
          editingChildren(전체)로 펼친다. */}
      {isEmpty
        ? editing
          ? null
          : placeholder
        : editing && editingChildren !== undefined
          ? editingChildren
          : children ?? value}
    </span>
  );
}
