"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { closeHistory } from "@tiptap/pm/history";
import {
  BookOpen, PenTool, Braces, MessageSquare, Target,
  X, Trash2, MousePointerClick, Undo2, Redo2,
} from "lucide-react";
import { SaveButton } from "@/components/ui/save-button";
import {
  VocabMark, GrammarMark, SyntaxMark, SentenceMark, ExamPointMark,
  generateAnnotationId, MARK_NAME_MAP,
  type Annotation, type AnnotationType,
} from "./annotation-marks";

// ─── Styles ──────────────────────────────────────────────
const EDITOR_STYLES = `
  .ProseMirror {
    outline: none;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 14px; line-height: 1.9; color: #1e293b;
    min-height: 100%; padding: 16px 20px 20px 20px;
  }
  /* 우상단 Undo/Redo 버튼 영역만큼만 첫 줄을 비우는 float 더미 — 좌측은 여백 없이
     본문이 바로 시작하고, 우측 상단 코너만 텍스트가 회피한다(과도한 상단 여백 제거).
     편집 가능할 때(=버튼이 떠 있을 때)만 적용. */
  .ProseMirror[contenteditable="true"]::before {
    content: ""; float: right; width: 4.25rem; height: 2rem;
  }
  .ProseMirror p { margin: 0 0 0.75em 0; }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder); float: left; color: #94a3b8; pointer-events: none; height: 0;
  }
  /* NOTE: transitions are scoped to background / border-radius — NOT "all".
     Safari does not repaint text-decoration on dynamically-inserted inline
     marks while "text-decoration-color" is part of a "transition: all" set,
     so the wavy underline stayed invisible until a hover forced a repaint. */
  .ann-vocab { background: linear-gradient(to top, #dbeafe 35%, transparent 35%); border-bottom: 2px solid #3b82f6; cursor: pointer; transition: background 0.15s; border-radius: 1px; padding: 0 1px; }
  .ann-vocab:hover { background: linear-gradient(to top, #bfdbfe 45%, transparent 45%); }
  .ann-grammar { text-decoration: underline wavy #8b5cf6; -webkit-text-decoration: underline wavy #8b5cf6; text-decoration-skip-ink: none; text-underline-offset: 3px; cursor: pointer; transition: background-color 0.15s, border-radius 0.15s; padding: 0 1px; }
  .ann-grammar:hover { background-color: #ede9fe; border-radius: 2px; }
  .ann-syntax { border-bottom: 2px dashed #0891b2; cursor: pointer; transition: background-color 0.15s, border-radius 0.15s; padding: 0 1px; }
  .ann-syntax:hover { background-color: #ecfeff; border-radius: 2px; }
  .ann-sentence { background: linear-gradient(to right, #22c55e 3px, #f0fdf4 3px); padding: 2px 6px 2px 8px; cursor: pointer; transition: background 0.15s; border-radius: 2px; }
  .ann-sentence:hover { background: linear-gradient(to right, #16a34a 3px, #dcfce7 3px); }
  .ann-exam { background: linear-gradient(to top, #fef08a 40%, transparent 40%); cursor: pointer; transition: background 0.15s; padding: 0 2px; border-radius: 1px; }
  .ann-exam:hover { background: linear-gradient(to top, #fde047 50%, transparent 50%); }
  .ProseMirror { -webkit-user-select: text; user-select: text; -webkit-touch-callout: none; }
  @media (pointer: coarse) {
    .ProseMirror { font-size: 15px; line-height: 2; padding: 48px 16px 20px 16px; }
    .ann-vocab, .ann-grammar, .ann-syntax, .ann-sentence, .ann-exam { padding: 2px 3px; }
  }
`;

// ─── Config ──────────────────────────────────────────────
const ANNOTATION_CONFIG: Record<AnnotationType, { label: string; shortLabel: string; icon: typeof BookOpen; color: string; dotColor: string; description: string }> = {
  vocab: { label: "핵심 어휘", shortLabel: "어휘", icon: BookOpen, color: "text-blue-600", dotColor: "bg-blue-500", description: "동의어·파생어·콜로케이션 등 어휘 심층 분석" },
  grammar: { label: "어법/문법", shortLabel: "어법", icon: PenTool, color: "text-violet-600", dotColor: "bg-violet-500", description: "어법 출제 포인트, 오답 함정, 변형 가능 방향" },
  syntax: { label: "문장별 읽기 포인트", shortLabel: "읽기", icon: Braces, color: "text-cyan-600", dotColor: "bg-cyan-500", description: "긴 문장 끊어읽기, 수식 관계, 읽는 순서" },
  sentence: { label: "핵심 문장", shortLabel: "문장", icon: MessageSquare, color: "text-green-600", dotColor: "bg-green-500", description: "논리 흐름, 주제문, 빈칸 출제 적합 위치" },
  examPoint: { label: "출제 포인트", shortLabel: "출제", icon: Target, color: "text-yellow-600", dotColor: "bg-yellow-500", description: "패러프레이징, 문장 전환, 서술형 조건 설정" },
};
const ANNOTATION_TYPES = Object.keys(ANNOTATION_CONFIG) as AnnotationType[];

// Alt/Option + letter shortcuts (event.code for IME-agnostic matching).
// vocab=Vocabulary, grammar=Grammar, syntax=Phrase, sentence=Sentence, examPoint=Exam.
const SHORTCUT_MAP: Record<AnnotationType, { code: string; letter: string }> = {
  vocab: { code: "KeyV", letter: "V" },
  grammar: { code: "KeyG", letter: "G" },
  syntax: { code: "KeyP", letter: "P" },
  sentence: { code: "KeyS", letter: "S" },
  examPoint: { code: "KeyE", letter: "E" },
};

// ─── Props ───────────────────────────────────────────────
interface PassageAnnotationEditorProps {
  content: string;
  onContentChange?: (text: string) => void;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  editable?: boolean;
  placeholder?: string;
  /** Show the built-in "drag to mark" onboarding banner at the bottom of the
   *  editor. Off when the host renders its own (e.g. a single shared popover
   *  for a multi-passage stack). Defaults to true. */
  showAnnotationHint?: boolean;
  /**
   * Expose the underlying TipTap editor so the host can read the current
   * selection and apply AI transforms (문장 변형·앞 맥락 추가) via editor
   * transactions — keeping existing marks intact. Called with the editor on
   * mount and `null` on unmount.
   */
  onEditorReady?: (editor: Editor | null) => void;
}

// ─── Floating popup state ────────────────────────────────
type PopupState =
  | { mode: "toolbar" }
  | { mode: "memo"; type: AnnotationType; id: string; text: string }
  | { mode: "edit"; annotation: Annotation };

// ─── Derive annotations from the editor document ─────────
// The TipTap doc is the single source of truth for marks, so undo/redo
// (which mutate the doc) stay in sync automatically. Memo text lives outside
// the doc in a per-id map and is re-attached here, so it survives a mark being
// removed and re-added by undo/redo.
function deriveAnnotationsFromDoc(editor: Editor, memoMap: Map<string, string>): Annotation[] {
  const acc = new Map<string, { type: AnnotationType; from: number; to: number }>();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      const entry = Object.entries(MARK_NAME_MAP).find(([, v]) => v === m.type.name);
      if (!entry) continue;
      const type = entry[0] as AnnotationType;
      const id = (m.attrs.id as string) || "";
      if (!id) continue;
      const from = pos;
      const to = pos + node.nodeSize;
      const ex = acc.get(id);
      if (ex) {
        ex.from = Math.min(ex.from, from);
        ex.to = Math.max(ex.to, to);
      } else {
        acc.set(id, { type, from, to });
      }
    }
  });
  return Array.from(acc.entries())
    .map(([id, v]) => ({
      id,
      type: v.type,
      text: editor.state.doc.textBetween(v.from, v.to),
      memo: memoMap.get(id) ?? "",
      from: v.from,
      to: v.to,
    }))
    .sort((a, b) => a.from - b.from);
}

// ─── Component ───────────────────────────────────────────
export function PassageAnnotationEditor({
  content, onContentChange, annotations, onAnnotationsChange,
  editable = true, placeholder = "영어 지문을 붙여넣으세요...",
  showAnnotationHint = true, onEditorReady,
}: PassageAnnotationEditorProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0, below: false });
  const [memoInput, setMemoInput] = useState("");

  const styleRef = useRef<HTMLStyleElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);
  const justMarkedRef = useRef(false);
  const popupLockRef = useRef(false); // prevents handleMouseDown from closing popup right after doMark

  // Memo text is kept here (keyed by mark id), not in the doc, so it survives
  // undo/redo removing & re-adding a mark. pendingMemoRef holds the id of a
  // freshly-marked-but-not-yet-saved annotation (discarded if the popup closes
  // without pressing 저장). hasMarkedRef gates the first derive so we never
  // clobber incoming annotations before the doc has any marks.
  const memoMapRef = useRef<Map<string, string>>(new Map());
  const pendingMemoRef = useRef<{ id: string } | null>(null);
  const hasMarkedRef = useRef(false);
  const seededRef = useRef(false);
  // Bumped on every doc transaction so the undo/redo buttons re-evaluate
  // editor.can().undo()/redo() even when the derived annotations don't change.
  const [, bumpHistory] = useState(0);

  // Rebuild the annotations array from the doc and push it to the parent.
  const deriveAndPush = useCallback((ed: Editor) => {
    const derived = deriveAnnotationsFromDoc(ed, memoMapRef.current);
    // Before the first mark exists, an empty derive must not overwrite
    // annotations the parent supplied (e.g. when re-opening a saved passage).
    if (derived.length === 0 && !hasMarkedRef.current) return;
    onAnnotationsChange(derived);
  }, [onAnnotationsChange]);

  useEffect(() => {
    if (!styleRef.current) {
      const style = document.createElement("style");
      style.textContent = EDITOR_STYLES;
      document.head.appendChild(style);
      styleRef.current = style;
    }
    return () => { styleRef.current?.remove(); styleRef.current = null; };
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false, bold: false, italic: false, strike: false,
        code: false, codeBlock: false, blockquote: false,
        bulletList: false, orderedList: false, listItem: false, horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      VocabMark, GrammarMark, SyntaxMark, SentenceMark, ExamPointMark,
    ],
    content: content ? `<p>${content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>` : "",
    editable,
    onUpdate: ({ editor: ed }) => {
      onContentChange?.(ed.getText());
      deriveAndPush(ed);
      bumpHistory((n) => n + 1);
    },
    editorProps: {
      handleClick(view, pos) {
        // Derive the clicked annotation straight from the doc (not the captured
        // `annotations` prop, which would be stale on this persistent editor).
        const marks = view.state.doc.resolve(pos).marks();
        for (const mark of marks) {
          const entry = Object.entries(MARK_NAME_MAP).find(([, v]) => v === mark.type.name);
          if (!entry) continue;
          const type = entry[0] as AnnotationType;
          const id = (mark.attrs.id as string) || "";
          if (!id) continue;
          // Full range of this mark id (a mark may span several text nodes).
          let from = Infinity;
          let to = -Infinity;
          view.state.doc.descendants((node, p) => {
            if (node.isText && node.marks.some((m) => m.type.name === mark.type.name && m.attrs.id === id)) {
              from = Math.min(from, p);
              to = Math.max(to, p + node.nodeSize);
            }
          });
          if (!Number.isFinite(from)) return false;
          const ann: Annotation = {
            id, type,
            text: view.state.doc.textBetween(from, to),
            memo: memoMapRef.current.get(id) ?? "",
            from, to,
          };
          // ProseMirror coordsAtPos for cross-browser consistency (Safari bug fix)
          const innerRect = innerRef.current?.getBoundingClientRect();
          if (innerRect) {
            const startCoords = view.coordsAtPos(from);
            const endCoords = view.coordsAtPos(to);
            const centerX = (startCoords.left + endCoords.right) / 2;
            const bottomY = Math.max(startCoords.bottom, endCoords.bottom);
            const scrollTop = innerRef.current?.scrollTop ?? 0;
            setPopupPos({
              x: centerX - innerRect.left,
              y: bottomY - innerRect.top + scrollTop + 8,
              below: true,
            });
          }
          setMemoInput(ann.memo);
          setPopup({ mode: "edit", annotation: ann });
          return true;
        }
        // Plain text clicked — close toolbar, but NOT memo/edit
        setPopup((prev) => (prev?.mode === "toolbar" ? null : prev));
        return false;
      },
    },
  });

  // Hand the editor instance to the host (for AI transform transactions).
  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText();
    if (content && content !== currentText) {
      editor.commands.setContent(`<p>${content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`);
    }
    if (!content && currentText) {
      editor.commands.setContent("");
    }
  }, [content, editor]);

  // One-time seed: render incoming saved annotations as marks (so re-opening a
  // passage shows the underlines) and prime the memo map. Applied without
  // history so they can't be undone past the initial state.
  useEffect(() => {
    if (!editor || seededRef.current) return;
    seededRef.current = true;
    if (annotations.length === 0) return;
    const size = editor.state.doc.content.size;
    for (const a of annotations) {
      memoMapRef.current.set(a.id, a.memo);
      if (a.from < 0 || a.to > size || a.from >= a.to) continue;
      try {
        editor
          .chain()
          .command(({ tr }) => { tr.setMeta("addToHistory", false); return true; })
          .setTextSelection({ from: a.from, to: a.to })
          .setMark(MARK_NAME_MAP[a.type], { id: a.id, memo: a.memo })
          .run();
      } catch {
        // skip annotations whose stored offsets no longer map into the doc
      }
    }
    editor.commands.setTextSelection(0);
    hasMarkedRef.current = true;
  }, [editor, annotations]);

  // ─── Show toolbar on selection end (pointer = mouse + touch + pen) ──
  useEffect(() => {
    function showToolbarFromSelection() {
      if (!editor) return;
      requestAnimationFrame(() => {
        if (justMarkedRef.current) { justMarkedRef.current = false; return; }
        if (popupLockRef.current) return;
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to);
        if (text.trim() && from !== to) {
          selectionRef.current = { from, to };
          // Use ProseMirror coordsAtPos for Safari cross-browser consistency.
          // Safari's getBoundingClientRect on a selection range spanning inline marks
          // returns only the first client-rect, producing wildly wrong popup positions.
          const innerRect = innerRef.current?.getBoundingClientRect();
          if (innerRect) {
            const startCoords = editor.view.coordsAtPos(from);
            const endCoords = editor.view.coordsAtPos(to);
            // Same-line selection → midpoint; multi-line → use end position (anchor of user's gesture)
            const sameLine = Math.abs(startCoords.top - endCoords.top) < 4;
            const centerX = sameLine
              ? (startCoords.left + endCoords.right) / 2
              : endCoords.right;
            const bottomY = Math.max(startCoords.bottom, endCoords.bottom);
            const scrollTop = innerRef.current?.scrollTop ?? 0;
            setPopupPos({
              x: centerX - innerRect.left,
              y: bottomY - innerRect.top + scrollTop + 8,
              below: true,
            });
          }
          setPopup({ mode: "toolbar" });
        }
      });
    }

    function handlePointerUp(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".ProseMirror")) return;
      // Touch devices: selection isn't finalized at pointerup, wait a tick
      if (e.pointerType === "touch") {
        setTimeout(showToolbarFromSelection, 80);
      } else {
        showToolbarFromSelection();
      }
    }

    // iOS/Android: also listen for selectionchange to catch OS-level text selection handles
    function handleSelectionChange() {
      if (!editor) return;
      // Only handle touch — mouse is already covered by pointerup
      if (!("ontouchstart" in window)) return;
      const domSel = window.getSelection();
      if (!domSel || domSel.isCollapsed || domSel.rangeCount === 0) return;
      const range = domSel.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) return;
      showToolbarFromSelection();
    }

    // Close toolbar on outside tap/click; discard a still-tentative mark.
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("[data-popup],[data-editor-tools]")) return;
      // The click that triggered doMark fires this listener too; by then the
      // toolbar has re-rendered into the memo popup so the clicked button is
      // detached and the closest() check above misses. popupLockRef (set in
      // doMark) tells us "we just marked" — don't treat it as an outside click.
      if (popupLockRef.current) return;
      // A freshly-marked-but-unsaved annotation is dropped if the user moves on
      // without pressing 저장 (저장 안 누르면 밑줄이 저장되지 않음).
      const pending = pendingMemoRef.current;
      if (pending) {
        pendingMemoRef.current = null;
        setPopup(null);
        memoMapRef.current.delete(pending.id);
        editor?.commands.undo();
        return;
      }
      setPopup((prev) => (prev?.mode === "toolbar" ? null : prev));
    }

    const container = containerRef.current;
    container?.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      container?.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor]);

  // ─── Mark + switch to memo mode ────────────────────────
  const doMark = useCallback((type: AnnotationType) => {
    if (!editor || !selectionRef.current) return;
    const { from, to } = selectionRef.current;
    const text = editor.state.doc.textBetween(from, to).trim();
    if (!text) return;

    const id = generateAnnotationId();
    justMarkedRef.current = true;
    popupLockRef.current = true;
    hasMarkedRef.current = true;
    // Tentative until 저장: this is one clean history step, so closing the memo
    // popup without saving can discard it with a single undo().
    pendingMemoRef.current = { id };
    // closeHistory ensures this mark is its OWN undo step (never merged with
    // preceding keystrokes), so discarding it with undo() can't eat the user's
    // text edits.
    editor
      .chain()
      .focus()
      .command(({ tr }) => { closeHistory(tr); return true; })
      .setTextSelection({ from, to })
      .setMark(MARK_NAME_MAP[type], { memo: "", id })
      .run();
    // onUpdate → deriveAndPush adds it to the annotations list automatically.

    // Safari belt-and-suspenders: even with the transition scoped, WebKit can
    // skip painting text-decoration on a just-inserted inline mark until the
    // surface is repainted. Toggling a no-op transform for one frame forces it.
    const surface = innerRef.current;
    if (surface) {
      surface.style.transform = "translateZ(0)";
      requestAnimationFrame(() => { surface.style.transform = ""; });
    }

    // Switch popup to memo mode — keep same position
    setMemoInput("");
    setPopup({ mode: "memo", type, id, text });

    // Release lock after popup is fully rendered and user can interact with it
    setTimeout(() => { popupLockRef.current = false; }, 500);
  }, [editor]);

  // ─── Keyboard shortcuts (only while toolbar is open) ──
  useEffect(() => {
    if (popup?.mode !== "toolbar") return;
    function handleKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const match = ANNOTATION_TYPES.find((t) => SHORTCUT_MAP[t].code === e.code);
      if (!match) return;
      e.preventDefault();
      doMark(match);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [popup, doMark]);

  // ─── Save memo (commit the mark) ───────────────────────
  // The mark already lives in the doc; we just attach memo text and finalize.
  const saveMemo = useCallback((id: string, memo: string) => {
    memoMapRef.current.set(id, memo.trim());
    pendingMemoRef.current = null;
    if (editor) deriveAndPush(editor); // memo isn't in the doc, so push manually
    setPopup(null);
  }, [editor, deriveAndPush]);

  // ─── Cancel a tentative mark (저장 안 누름) ─────────────
  const cancelMemo = useCallback(() => {
    const pending = pendingMemoRef.current;
    pendingMemoRef.current = null;
    setPopup(null);
    if (pending && editor) {
      memoMapRef.current.delete(pending.id);
      editor.commands.undo(); // remove the just-applied mark (its own history step)
    }
  }, [editor]);

  // ─── Remove annotation ────────────────────────────────
  const removeAnnotation = useCallback((id: string) => {
    if (!editor) return;
    const markEntry = Object.values(MARK_NAME_MAP);
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const mark = node.marks.find((m) => markEntry.includes(m.type.name) && m.attrs.id === id);
      if (mark) {
        editor.chain().focus().setTextSelection({ from: pos, to: pos + node.nodeSize }).unsetMark(mark.type.name).run();
      }
    });
    memoMapRef.current.delete(id);
    // onUpdate → deriveAndPush removes it from the annotations list.
    setPopup(null);
  }, [editor]);

  if (!editor) return null;

  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  const hasText = editor.getText().trim().length > 0;
  const counts = ANNOTATION_TYPES.reduce((acc, t) => { acc[t] = annotations.filter((a) => a.type === t).length; return acc; }, {} as Record<AnnotationType, number>);

  // Popup positioning — measured against the inner (positioning context) container
  const containerWidth = innerRef.current?.offsetWidth || containerRef.current?.offsetWidth || 600;
  const popupWidth = popup?.mode === "toolbar" ? 380 : 300;
  const halfPopup = popupWidth / 2;
  const clampedLeft = Math.max(8, Math.min(popupPos.x - halfPopup, containerWidth - popupWidth - 8));
  const arrowLeft = Math.max(12, Math.min(popupPos.x - clampedLeft, popupWidth - 12));

  return (
    <div className="relative flex flex-col h-full" ref={containerRef}>
      {/* Undo / redo — pinned to the top-right of the input area, arrows only.
          Lives on the (non-scrolling) outer container so it stays put while the
          passage scrolls. The counts bar's right side is empty, so no overlap. */}
      {editable && (
        <div
          data-editor-tools
          className="absolute top-2 right-2 z-30 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/90 px-0.5 py-0.5 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            title="되돌리기 (⌘Z)"
            aria-label="되돌리기"
            disabled={!canUndo}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              if (pendingMemoRef.current) {
                cancelMemo();
              } else {
                editor.commands.undo();
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="다시 실행 (⌘⇧Z)"
            aria-label="다시 실행"
            disabled={!canRedo}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              pendingMemoRef.current = null;
              setPopup(null);
              editor.commands.redo();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Annotation counts */}
      {annotations.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
          {ANNOTATION_TYPES.map((type) => counts[type] > 0 ? (
            <span key={type} className={`flex items-center gap-1 text-[11px] font-medium ${ANNOTATION_CONFIG[type].color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ANNOTATION_CONFIG[type].dotColor}`} />
              {ANNOTATION_CONFIG[type].shortLabel} {counts[type]}
            </span>
          ) : null)}
        </div>
      )}

      {/* Editor + all popups */}
      <div ref={innerRef} className="flex-1 relative min-h-0 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />

        {/* Unified popup — toolbar / memo / edit */}
        {popup && (
          <div
            data-popup
            className="absolute z-30"
            style={{
              left: clampedLeft,
              top: popupPos.y,
              ...(popupPos.below ? {} : { transform: "translateY(-100%)" }),
            }}
          >
            {/* Arrow top (when below text) */}
            {popupPos.below && (
              <div style={{ paddingLeft: arrowLeft - 4 }}>
                <div className="w-2 h-2 rotate-45 -mb-1" style={{ background: popup.mode === "toolbar" ? "#1e3a5f" : "white", boxShadow: popup.mode !== "toolbar" ? "-1px -1px 0 #e2e8f0" : "none" }} />
              </div>
            )}

            {/* ── Toolbar mode ── */}
            {popup.mode === "toolbar" && (
              <div
                className="flex flex-col rounded-xl p-1 shadow-2xl"
                style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)", boxShadow: "0 8px 32px rgba(37,99,235,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset" }}
              >
                <div className="flex items-center gap-0.5">
                  {ANNOTATION_TYPES.map((type) => {
                    const config = ANNOTATION_CONFIG[type];
                    const Icon = config.icon;
                    return (
                      <button key={type} onPointerDown={(e) => { e.preventDefault(); doMark(type); }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-white hover:bg-white/15 active:bg-white/25 transition-colors whitespace-nowrap touch-manipulation"
                        title={`${config.description} (Alt+${SHORTCUT_MAP[type].letter})`}
                      >
                        <Icon className="w-3.5 h-3.5" />{config.shortLabel}
                        <span className="ml-0.5 text-[9px] font-bold leading-none text-white/55 tabular-nums">{SHORTCUT_MAP[type].letter}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="select-none pt-0.5 text-center text-[8.5px] font-medium tracking-wide text-white/45">
                  Alt(⌥) + 단축키
                </div>
              </div>
            )}

            {/* ── Memo mode (just marked) ── */}
            {popup.mode === "memo" && (
              <div className="w-[300px] bg-white rounded-lg border border-slate-200 shadow-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  {(() => { const c = ANNOTATION_CONFIG[popup.type]; const Icon = c.icon; return <Icon className={`w-3 h-3 ${c.color}`} />; })()}
                  <span className={`text-[11px] font-semibold ${ANNOTATION_CONFIG[popup.type].color}`}>{ANNOTATION_CONFIG[popup.type].label}</span>
                  <span className="text-[10px] text-slate-400">저장 시 확정</span>
                </div>
                <div className="flex gap-1.5">
                  <input autoFocus value={memoInput} onChange={(e) => setMemoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveMemo(popup.id, memoInput); } if (e.key === "Escape") { e.preventDefault(); cancelMemo(); } }}
                    placeholder="메모 (Enter 저장 · Esc 취소)"
                    className="flex-1 min-w-0 h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                  />
                  <SaveButton onClick={() => saveMemo(popup.id, memoInput)} className="h-7 min-w-0 shrink-0" />
                </div>
              </div>
            )}

            {/* ── Edit mode (clicked existing) ── */}
            {popup.mode === "edit" && (
              <div className="w-[300px] bg-white rounded-lg border border-slate-200 shadow-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {(() => { const c = ANNOTATION_CONFIG[popup.annotation.type]; const Icon = c.icon; return <Icon className={`w-3 h-3 shrink-0 ${c.color}`} />; })()}
                    <span className={`text-[11px] font-semibold shrink-0 ${ANNOTATION_CONFIG[popup.annotation.type].color}`}>{ANNOTATION_CONFIG[popup.annotation.type].label}</span>
                    <span className="text-[11px] text-slate-400 truncate">&ldquo;{popup.annotation.text}&rdquo;</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => removeAnnotation(popup.annotation.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    <button onClick={() => setPopup(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <input autoFocus value={memoInput} onChange={(e) => setMemoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveMemo(popup.annotation.id, memoInput); } if (e.key === "Escape") setPopup(null); }}
                    placeholder="메모 수정 (Enter 저장)"
                    className="flex-1 min-w-0 h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                  />
                  <SaveButton onClick={() => saveMemo(popup.annotation.id, memoInput)} className="h-7 min-w-0 shrink-0" />
                </div>
              </div>
            )}

            {/* Arrow bottom (when above text) */}
            {!popupPos.below && (
              <div style={{ paddingLeft: arrowLeft - 4 }}>
                <div className="w-2 h-2 rotate-45 -mt-1" style={{ background: popup.mode === "toolbar" ? "#2563eb" : "white", boxShadow: popup.mode !== "toolbar" ? "1px 1px 0 #e2e8f0" : "none" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Onboarding hint */}
      {showAnnotationHint && hasText && annotations.length === 0 && !popup && (
        <div
          className="shrink-0 relative flex items-center gap-2.5 px-4 py-2.5 border-t border-blue-200/80 overflow-hidden"
          style={{
            background:
              "linear-gradient(110deg, rgba(219,234,254,0.55) 0%, rgba(191,219,254,0.7) 35%, rgba(165,180,252,0.55) 70%, rgba(219,234,254,0.55) 100%)",
            backgroundSize: "200% 100%",
            animation: "annotationHintShimmer 3.6s ease-in-out infinite",
            boxShadow:
              "inset 0 0 0 1px rgba(96,165,250,0.25), 0 0 16px rgba(96,165,250,0.35), 0 0 28px rgba(99,102,241,0.18)",
          }}
        >
          <span
            aria-hidden="true"
            className="absolute -left-10 -top-8 w-28 h-28 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(147,197,253,0.55) 0%, rgba(147,197,253,0) 70%)",
              filter: "blur(8px)",
              animation: "annotationHintPulse 2.4s ease-in-out infinite",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(165,180,252,0.5) 0%, rgba(165,180,252,0) 70%)",
              filter: "blur(10px)",
              animation: "annotationHintPulse 2.4s ease-in-out infinite 1.2s",
            }}
          />
          <span
            aria-hidden="true"
            className="relative flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.95) 0%, rgba(99,102,241,0.95) 100%)",
              boxShadow:
                "0 0 12px rgba(59,130,246,0.55), 0 0 22px rgba(99,102,241,0.35)",
            }}
          >
            <MousePointerClick className="w-3.5 h-3.5 text-white" />
          </span>
          <p className="relative text-[12px] text-blue-800 font-medium tracking-tight leading-snug">
            텍스트를{" "}
            <span className="font-bold text-blue-900 px-1 py-0.5 rounded bg-white/70 shadow-[0_0_8px_rgba(59,130,246,0.35)]">
              드래그(터치 길게 누르기)
            </span>
            하면 핵심 어휘, 어법 포인트, 출제 포인트 등을 마킹할 수 있습니다
          </p>
          <style jsx>{`
            @keyframes annotationHintShimmer {
              0% {
                background-position: 0% 50%;
              }
              50% {
                background-position: 100% 50%;
              }
              100% {
                background-position: 0% 50%;
              }
            }
            @keyframes annotationHintPulse {
              0%,
              100% {
                opacity: 0.45;
                transform: scale(1);
              }
              50% {
                opacity: 0.85;
                transform: scale(1.15);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export type { Annotation, AnnotationType };
