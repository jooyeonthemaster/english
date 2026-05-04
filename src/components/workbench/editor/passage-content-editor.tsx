"use client";

// ============================================================================
// PassageContentEditor — TipTap-based rich editor for extracted passage text.
//
// Used in the review step of bulk passage extraction to let the teacher clean
// up OCR output (fix paragraph breaks, add emphasis, highlight key lines).
//
// Data contract:
//   - `content` prop comes from the Zustand store as PLAIN TEXT.
//   - On update we call `onChange` with PLAIN TEXT (via editor.getText()),
//     so the commit API contract is unchanged.
//   - Inline formatting (bold/italic/highlight) is a VIEWING aid — it is not
//     persisted to the server. Paragraph breaks ARE preserved because
//     getText() emits "\n\n" between <p> blocks.
//
// SSR-safe: `immediatelyRender: false` avoids hydration mismatch in Next.js.
// ============================================================================

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Highlighter,
  Undo2,
  Redo2,
  RemoveFormatting,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  /** Plain-text passage content from the store. */
  content: string;
  /** Called on every keystroke with the latest PLAIN TEXT. */
  onChange: (plainText: string) => void;
  /** Shown when the editor is empty. */
  placeholder?: string;
  /** Hook for the parent to display a live char count beneath the editor. */
  onStats?: (stats: { chars: number; words: number }) => void;
  /** Allow forcing read-only (disables all edits + toolbar). */
  readOnly?: boolean;
}

/** Plain text → simple <p><br></p> HTML. Double-newline = paragraph break. */
function plainTextToHtml(text: string): string {
  const trimmed = text ?? "";
  if (!trimmed) return "";
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split(/\n/)
        .map(escapeHtml)
        .join("<br/>"),
    )
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function PassageContentEditor({
  content,
  onChange,
  placeholder,
  onStats,
  readOnly = false,
}: Props) {
  // Capture the first-render plain text so TipTap initialises once. Subsequent
  // external updates to `content` flow through the useEffect below so the
  // editor doesn't fight the user's typing. useState's lazy initializer runs
  // exactly once on mount — exactly the semantics we need, and it's the only
  // "freeze on mount" pattern the React Compiler plugin accepts cleanly.
  const [initialHtml] = useState(() => plainTextToHtml(content));

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // StarterKit includes paragraph, text, bold, italic, strike,
        // bulletList, orderedList, listItem, blockquote, hardBreak, history.
        // Default settings are fine — we only tweak headings.
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "지문 내용을 편집하거나 새로 붙여넣으세요.",
      }),
      Highlight.configure({ multicolor: false }),
      TextStyle,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "passage-editor-surface h-full w-full min-h-full px-5 py-4 focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText();
      onChange(text);
      onStats?.({ chars: text.length, words: countWords(text) });
    },
  });

  // Sync external `content` changes into the editor WITHOUT fighting the user.
  // The parent can swap the selected draft — when that happens we need to
  // reset the editor document. Comparing getText() avoids infinite loops
  // because our own onUpdate pushes getText() upward already.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getText();
    if (current === content) return;
    // emitUpdate:false prevents a bogus onChange → store roundtrip.
    editor.commands.setContent(plainTextToHtml(content), {
      emitUpdate: false,
    });
  }, [content, editor]);

  // Push initial stats once on mount.
  useEffect(() => {
    if (!editor) return;
    const text = editor.getText();
    onStats?.({ chars: text.length, words: countWords(text) });
  }, [editor, onStats]);

  if (!editor) {
    // Fallback skeleton while TipTap initialises on the client.
    return (
      <div className="flex h-full w-full items-center justify-center bg-white text-[12px] text-slate-300">
        에디터 로딩…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      {!readOnly ? <EditorToolbar editor={editor} /> : null}

      {/* ─── Editor surface ──────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <style>{editorSurfaceCss}</style>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Toolbar
// ────────────────────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <ToolButton
        icon={Heading2}
        label="제목"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <Divider />
      <ToolButton
        icon={Bold}
        label="굵게 (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label="기울임 (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label="취소선"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolButton
        icon={Highlighter}
        label="형광펜"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <Divider />
      <ToolButton
        icon={List}
        label="글머리 기호"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="번호 매기기"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        icon={Quote}
        label="인용"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Divider />
      <ToolButton
        icon={RemoveFormatting}
        label="서식 제거"
        active={false}
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      />
      <div className="ml-auto flex items-center gap-0.5">
        <ToolButton
          icon={Undo2}
          label="실행 취소 (Ctrl+Z)"
          active={false}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolButton
          icon={Redo2}
          label="다시 실행 (Ctrl+Y)"
          active={false}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        "inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (active
          ? "bg-sky-100 text-sky-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
      }
    >
      <Icon className="size-[14px]" strokeWidth={1.8} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-slate-200" />;
}

// ────────────────────────────────────────────────────────────────────────────
// Editor surface CSS — scoped to .passage-editor-surface ProseMirror root
// ────────────────────────────────────────────────────────────────────────────

const editorSurfaceCss = `
.passage-editor-surface {
  font-size: 13.5px;
  line-height: 1.75;
  color: rgb(30 41 59);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans KR", sans-serif;
  tab-size: 4;
  caret-color: rgb(14 165 233);
  min-height: 100%;
}
.passage-editor-surface p {
  margin: 0 0 0.75em 0;
}
.passage-editor-surface p:last-child {
  margin-bottom: 0;
}
.passage-editor-surface h2 {
  font-size: 15.5px;
  font-weight: 700;
  margin: 1.25em 0 0.5em;
  color: rgb(15 23 42);
  letter-spacing: -0.01em;
}
.passage-editor-surface h3 {
  font-size: 14px;
  font-weight: 700;
  margin: 1em 0 0.4em;
  color: rgb(15 23 42);
}
.passage-editor-surface strong {
  font-weight: 700;
  color: rgb(15 23 42);
}
.passage-editor-surface em {
  font-style: italic;
}
.passage-editor-surface s {
  text-decoration: line-through;
  color: rgb(100 116 139);
}
.passage-editor-surface mark {
  background-color: rgb(254 240 138);
  color: rgb(15 23 42);
  padding: 0.05em 0.15em;
  border-radius: 2px;
}
.passage-editor-surface ul,
.passage-editor-surface ol {
  padding-left: 1.4em;
  margin: 0.4em 0 0.75em;
}
.passage-editor-surface ul {
  list-style: disc;
}
.passage-editor-surface ol {
  list-style: decimal;
}
.passage-editor-surface li {
  margin: 0.2em 0;
}
.passage-editor-surface li > p {
  margin: 0;
}
.passage-editor-surface blockquote {
  margin: 0.6em 0;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 3px solid rgb(186 230 253);
  color: rgb(71 85 105);
  font-style: italic;
  background: rgb(240 249 255 / 0.3);
}
.passage-editor-surface code {
  background: rgb(241 245 249);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.92em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.passage-editor-surface .is-editor-empty::before {
  content: attr(data-placeholder);
  color: rgb(148 163 184);
  float: left;
  height: 0;
  pointer-events: none;
}
.passage-editor-surface::selection,
.passage-editor-surface ::selection {
  background: rgb(186 230 253);
}
`;
