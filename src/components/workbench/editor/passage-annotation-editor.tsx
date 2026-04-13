"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  BookOpen, PenTool, Braces, MessageSquare, Target,
  X, Trash2, MousePointerClick,
} from "lucide-react";
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
    min-height: 100%; padding: 48px 20px 20px 20px;
  }
  .ProseMirror p { margin: 0 0 0.75em 0; }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder); float: left; color: #94a3b8; pointer-events: none; height: 0;
  }
  .ann-vocab { background: linear-gradient(to top, #dbeafe 35%, transparent 35%); border-bottom: 2px solid #3b82f6; cursor: pointer; transition: all 0.15s; border-radius: 1px; padding: 0 1px; }
  .ann-vocab:hover { background: linear-gradient(to top, #bfdbfe 45%, transparent 45%); }
  .ann-grammar { text-decoration: underline wavy #8b5cf6; text-decoration-skip-ink: none; text-underline-offset: 3px; cursor: pointer; transition: all 0.15s; padding: 0 1px; }
  .ann-grammar:hover { background-color: #ede9fe; border-radius: 2px; }
  .ann-syntax { border-bottom: 2px dashed #0891b2; cursor: pointer; transition: all 0.15s; padding: 0 1px; }
  .ann-syntax:hover { background-color: #ecfeff; border-radius: 2px; }
  .ann-sentence { background: linear-gradient(to right, #22c55e 3px, #f0fdf4 3px); padding: 2px 6px 2px 8px; cursor: pointer; transition: all 0.15s; border-radius: 2px; }
  .ann-sentence:hover { background: linear-gradient(to right, #16a34a 3px, #dcfce7 3px); }
  .ann-exam { background: linear-gradient(to top, #fef08a 40%, transparent 40%); cursor: pointer; transition: all 0.15s; padding: 0 2px; border-radius: 1px; }
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
  grammar: { label: "문법/어법", shortLabel: "문법", icon: PenTool, color: "text-violet-600", dotColor: "bg-violet-500", description: "어법 출제 포인트, 오답 함정, 변형 가능 방향" },
  syntax: { label: "구문 분석", shortLabel: "구문", icon: Braces, color: "text-cyan-600", dotColor: "bg-cyan-500", description: "S/V/O/C 구조, 끊어읽기, 복잡 구문" },
  sentence: { label: "핵심 문장", shortLabel: "문장", icon: MessageSquare, color: "text-green-600", dotColor: "bg-green-500", description: "논리 흐름, 주제문, 빈칸 출제 적합 위치" },
  examPoint: { label: "출제 포인트", shortLabel: "출제", icon: Target, color: "text-yellow-600", dotColor: "bg-yellow-500", description: "패러프레이징, 문장 전환, 서술형 조건 설정" },
};
const ANNOTATION_TYPES = Object.keys(ANNOTATION_CONFIG) as AnnotationType[];

// ─── Props ───────────────────────────────────────────────
interface PassageAnnotationEditorProps {
  content: string;
  onContentChange?: (text: string) => void;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  editable?: boolean;
  placeholder?: string;
}

// ─── Floating popup state ────────────────────────────────
type PopupState =
  | { mode: "toolbar" }
  | { mode: "memo"; type: AnnotationType; id: string; text: string }
  | { mode: "edit"; annotation: Annotation };

// ─── Component ───────────────────────────────────────────
export function PassageAnnotationEditor({
  content, onContentChange, annotations, onAnnotationsChange,
  editable = true, placeholder = "영어 지문을 붙여넣으세요...",
}: PassageAnnotationEditorProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0, below: false });
  const [memoInput, setMemoInput] = useState("");

  const styleRef = useRef<HTMLStyleElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);
  const justMarkedRef = useRef(false);
  const popupLockRef = useRef(false); // prevents handleMouseDown from closing popup right after doMark

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
    onUpdate: ({ editor: ed }) => onContentChange?.(ed.getText()),
    editorProps: {
      handleClick(view, pos) {
        // Check if clicked on an annotation mark
        const marks = view.state.doc.resolve(pos).marks();
        for (const mark of marks) {
          const type = Object.entries(MARK_NAME_MAP).find(([, v]) => v === mark.type.name)?.[0] as AnnotationType | undefined;
          if (type) {
            const ann = annotations.find((a) => a.id === mark.attrs.id);
            if (ann) {
              const domSel = window.getSelection();
              const cRect = containerRef.current?.getBoundingClientRect();
              if (domSel && domSel.rangeCount > 0 && cRect) {
                const rect = domSel.getRangeAt(0).getBoundingClientRect();
                setPopupPos({
                  x: rect.left + rect.width / 2 - cRect.left,
                  y: rect.bottom - cRect.top + 8,
                  below: true,
                });
              }
              setMemoInput(ann.memo);
              setPopup({ mode: "edit", annotation: ann });
              return true;
            }
          }
        }
        // Plain text clicked — close toolbar, but NOT memo/edit
        if (popup?.mode === "toolbar") setPopup(null);
        return false;
      },
    },
  });

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
          const domSel = window.getSelection();
          const cRect = containerRef.current?.getBoundingClientRect();
          if (domSel && domSel.rangeCount > 0 && cRect) {
            const rect = domSel.getRangeAt(0).getBoundingClientRect();
            setPopupPos({
              x: rect.left + rect.width / 2 - cRect.left,
              y: rect.bottom - cRect.top + 8,
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

    // Close ONLY toolbar mode on outside tap/click
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("[data-popup]")) return;
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
    editor.chain().focus().setTextSelection({ from, to }).setMark(MARK_NAME_MAP[type], { memo: "", id }).run();
    onAnnotationsChange([...annotations, { id, type, text, memo: "", from, to }]);

    // Switch popup to memo mode — keep same position
    setMemoInput("");
    setPopup({ mode: "memo", type, id, text });

    // Release lock after popup is fully rendered and user can interact with it
    setTimeout(() => { popupLockRef.current = false; }, 500);
  }, [editor, annotations, onAnnotationsChange]);

  // ─── Save memo ─────────────────────────────────────────
  const saveMemo = useCallback((id: string, memo: string) => {
    if (memo.trim()) {
      onAnnotationsChange(annotations.map((a) => (a.id === id ? { ...a, memo: memo.trim() } : a)));
    }
    setPopup(null);
  }, [annotations, onAnnotationsChange]);

  // ─── Remove annotation ────────────────────────────────
  const removeAnnotation = useCallback((id: string) => {
    if (!editor) return;
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    const markName = MARK_NAME_MAP[ann.type];
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.find((m) => m.type.name === markName && m.attrs.id === id)) {
        editor.chain().focus().setTextSelection({ from: pos, to: pos + node.nodeSize }).unsetMark(markName).run();
      }
    });
    onAnnotationsChange(annotations.filter((a) => a.id !== id));
    setPopup(null);
  }, [editor, annotations, onAnnotationsChange]);

  if (!editor) return null;

  const hasText = editor.getText().trim().length > 0;
  const counts = ANNOTATION_TYPES.reduce((acc, t) => { acc[t] = annotations.filter((a) => a.type === t).length; return acc; }, {} as Record<AnnotationType, number>);

  // Popup positioning
  const containerWidth = containerRef.current?.offsetWidth || 600;
  const popupWidth = popup?.mode === "toolbar" ? 340 : 300;
  const halfPopup = popupWidth / 2;
  const clampedLeft = Math.max(8, Math.min(popupPos.x - halfPopup, containerWidth - popupWidth - 8));
  const arrowLeft = Math.max(12, Math.min(popupPos.x - clampedLeft, popupWidth - 12));

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
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
      <div className="flex-1 relative min-h-0 overflow-y-auto">
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
                className="flex items-center gap-0.5 rounded-xl p-1 shadow-2xl"
                style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)", boxShadow: "0 8px 32px rgba(37,99,235,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset" }}
              >
                {ANNOTATION_TYPES.map((type) => {
                  const config = ANNOTATION_CONFIG[type];
                  const Icon = config.icon;
                  return (
                    <button key={type} onPointerDown={(e) => { e.preventDefault(); doMark(type); }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-white hover:bg-white/15 active:bg-white/25 transition-colors whitespace-nowrap touch-manipulation"
                      title={config.description}
                    >
                      <Icon className="w-3.5 h-3.5" />{config.shortLabel}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Memo mode (just marked) ── */}
            {popup.mode === "memo" && (
              <div className="w-[300px] bg-white rounded-lg border border-slate-200 shadow-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  {(() => { const c = ANNOTATION_CONFIG[popup.type]; const Icon = c.icon; return <Icon className={`w-3 h-3 ${c.color}`} />; })()}
                  <span className={`text-[11px] font-semibold ${ANNOTATION_CONFIG[popup.type].color}`}>{ANNOTATION_CONFIG[popup.type].label}</span>
                  <span className="text-[10px] text-slate-400">마킹 완료</span>
                </div>
                <div className="flex gap-1.5">
                  <input autoFocus value={memoInput} onChange={(e) => setMemoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveMemo(popup.id, memoInput); } if (e.key === "Escape") setPopup(null); }}
                    placeholder="메모 (Enter 저장, Esc 건너뛰기)"
                    className="flex-1 h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                  />
                  <button onClick={() => saveMemo(popup.id, memoInput)} className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition-colors shrink-0">저장</button>
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
                    className="flex-1 h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                  />
                  <button onClick={() => saveMemo(popup.annotation.id, memoInput)} className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition-colors shrink-0">저장</button>
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
      {hasText && annotations.length === 0 && !popup && (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-t border-blue-100 bg-blue-50/40">
          <MousePointerClick className="w-4 h-4 text-blue-400 shrink-0" />
          <p className="text-[12px] text-blue-600/80">
            텍스트를 <span className="font-semibold text-blue-700">드래그(터치 길게 누르기)</span>하면 핵심 어휘, 문법 포인트, 출제 포인트 등을 마킹할 수 있습니다
          </p>
        </div>
      )}
    </div>
  );
}

export type { Annotation, AnnotationType };
