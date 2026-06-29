import { type ClipboardEvent, type ElementType, type FocusEvent, type KeyboardEvent, type ReactNode, createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { normalizeEditableText } from "@/components/exams/paper-builder/components/editable-text";
import { type FontRun } from "@/lib/passage-report/analysis-report/schema";
import { normalizeStudentFacingMarkup } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { cn } from "@/lib/utils";
import type { FieldFontContextValue } from "./types";

const FieldFontContext = createContext<FieldFontContextValue | null>(null);

function groupRunsByOrd(runs?: FontRun[]): Map<number, FontRun[]> {
  const map = new Map<number, FontRun[]>();
  for (const r of runs ?? []) {
    const arr = map.get(r.f);
    if (arr) arr.push(r);
    else map.set(r.f, [r]);
  }
  return map;
}

function mergeFontRuns(
  existing: FontRun[] | undefined,
  ord: number,
  next: FontRun[],
): FontRun[] | undefined {
  const kept = (existing ?? []).filter((r) => r.f !== ord);
  const merged = [...kept, ...next];
  return merged.length > 0 ? merged : undefined;
}

function sameRuns(a: FontRun[], b: FontRun[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].s !== b[i].s || a[i].e !== b[i].e || a[i].pt !== b[i].pt) return false;
  }
  return true;
}

/** 블록 단위로 폰트 런 컨텍스트를 제공. onBlockMeta 가 없으면(보기/측정) 적용만 하고 커밋 없음. */
export function BlockFontProvider({
  blockId,
  runs,
  onBlockMeta,
  children,
}: {
  blockId: string;
  runs?: FontRun[];
  onBlockMeta?: (id: string, patch: { fontRuns?: FontRun[] }) => void;
  children: ReactNode;
}) {
  const value = useMemo<FieldFontContextValue>(
    () => ({
      runsByOrd: groupRunsByOrd(runs),
      commit: onBlockMeta
        ? (ord, next) => onBlockMeta(blockId, { fontRuns: mergeFontRuns(runs, ord, next) })
        : () => {},
    }),
    [blockId, runs, onBlockMeta],
  );
  return <FieldFontContext.Provider value={value}>{children}</FieldFontContext.Provider>;
}

/** el 이 속한 블록 안에서 이 편집 필드(.par-field)가 몇 번째인지. 편집/보기 모드에서 동일. */
function computeFieldOrd(el: HTMLElement): number {
  const block = el.closest<HTMLElement>("[data-paper-item-id]");
  if (!block) return 0;
  const logicalId = block.getAttribute("data-paper-item-id");
  const root = block.closest<HTMLElement>(".par-root");
  const all =
    logicalId && root
      ? Array.from(root.querySelectorAll<HTMLElement>("[data-paper-item-id]"))
          .filter((candidate) => candidate.getAttribute("data-paper-item-id") === logicalId)
          .flatMap((candidate) => Array.from(candidate.querySelectorAll<HTMLElement>(".par-field")))
      : Array.from(block.querySelectorAll<HTMLElement>(".par-field"));
  // 섹션 미니 타이틀(par-ws-minihead)·크롬 라벨(par-no-fontrun: 섹션헤더·드릴라벨·표헤더 등) 편집 필드는
  // 폰트 런 ord 공간에서 제외한다 — 편집 모드에서 이들이 .par-field 로 추가돼도 본문 필드의 ord 가 밀리지
  // 않게(저장된 글자크기 런 오귀속/회귀 방지).
  const fields = all.filter((f) => !f.closest(".par-ws-minihead") && !f.classList.contains("par-no-fontrun"));
  const i = fields.indexOf(el);
  return i < 0 ? 0 : i;
}

// ─── 인라인 편집 프리미티브 ──────────────────────────────────────────────────
export function Field({
  editable,
  value,
  onCommit,
  as,
  className,
  placeholder = "—",
  render,
  onEnterNewBlock,
  dataAttrs,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  as?: ElementType;
  className?: string;
  placeholder?: string;
  render?: (v: string) => ReactNode;
  onEnterNewBlock?: () => void;
  dataAttrs?: Record<string, string>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = (as ?? "span") as any;
  const ref = useRef<HTMLElement | null>(null);
  const focusedRef = useRef(false);
  const ordRef = useRef(-1);
  const ctx = useContext(FieldFontContext);
  const runsByOrd = ctx?.runsByOrd;
  // 커스텀 render 가 있는 보기 필드는 ReactNode 로 그리므로 런(HTML) 비적용.
  // 그 외(편집 필드 + 단순 텍스트 보기 필드)는 우리가 innerHTML 을 관리해 런을 입힌다.
  const managedHtml = editable || !render;
  // 섹션 미니 타이틀·크롬 라벨(par-no-fontrun) 편집 필드는 폰트 런(글자 크기 구간)에 참여하지 않는다 —
  // ord 공간에서 제외되고 본문 필드 ord 와 충돌하지 않게(글자크기 오귀속 방지). 타이틀/라벨은 단일 크기로 충분.
  const cls = className ?? "";
  const noFontRun = cls.includes("par-ws-minihead") || cls.includes("par-no-fontrun");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !managedHtml || focusedRef.current) return;
    const ord = noFontRun ? -1 : computeFieldOrd(el);
    ordRef.current = ord;
    el.innerHTML = editableTextHtml(value, noFontRun ? undefined : runsByOrd?.get(ord));
  }, [value, runsByOrd, managedHtml, noFontRun]);

  if (!editable) {
    if (render) return <Tag className={cn(className, "par-field")}>{render(value)}</Tag>;
    return (
      <Tag
        ref={ref}
        className={cn(className, "par-field")}
        dangerouslySetInnerHTML={{ __html: editableTextHtml(value) }}
      />
    );
  }
  const isEmpty = !value.trim();
  return (
    <Tag
      ref={ref}
      className={cn(className, "par-field", "par-edit-field", isEmpty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      {...dataAttrs}
      dangerouslySetInnerHTML={{ __html: editableTextHtml(value) }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        focusedRef.current = false;
        const { text, runs } = readEditableContent(e.currentTarget);
        const next = normalizeEditableText(text);
        if (next !== value) onCommit(next);
        if (ctx && !noFontRun) {
          const ord = ordRef.current >= 0 ? ordRef.current : computeFieldOrd(e.currentTarget);
          const clamped = runs
            .filter((r) => r.s < next.length)
            .map((r) => ({ f: ord, s: r.s, e: Math.min(r.e, next.length), pt: r.pt }))
            .filter((r) => r.e > r.s);
          if (!sameRuns(ctx.runsByOrd.get(ord) ?? [], clamped)) ctx.commit(ord, clamped);
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => handleEditableKeyDown(e, onEnterNewBlock)}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

/** 캐럿이 필드 맨 끝(뒤에 글자 없음)에 있는지. */
function caretAtFieldEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.endContainer)) return false;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setStart(r.endContainer, r.endOffset);
  return probe.toString().length === 0;
}

/**
 * 편집 필드를 '텍스트'처럼 다루기 위한 공통 키 처리.
 * - Enter            → 줄바꿈(soft line break) 삽입. contentEditable 기본 동작이
 *                       <div> 블록을 만들어 지저분해지는 것을 막고 <br> 로 통일한다.
 *                       (readEditablePlainText 가 <br> 을 \n 으로 환산)
 * - 텍스트 블록 끝 Enter → onEnterNewBlock 제공 시, 줄바꿈 대신 아래에 새 텍스트 블록 생성.
 * - Cmd/Ctrl+Enter   → 페이지 넘김. 여기서는 줄바꿈만 막고, 실제 페이지 분할은
 *                       에디터 전역 핸들러가 포커스된 블록의 breakBefore 를 토글한다.
 */
export function handleEditableKeyDown(
  e: KeyboardEvent<HTMLElement>,
  onEnterNewBlock?: () => void,
) {
  if (e.key !== "Enter") return;
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault(); // 페이지 넘김은 전역 핸들러가 처리
    return;
  }
  if (onEnterNewBlock && caretAtFieldEnd(e.currentTarget)) {
    e.preventDefault();
    onEnterNewBlock();
    return;
  }
  e.preventDefault();
  document.execCommand("insertLineBreak");
}

function escapeSeg(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

/** 평문 + (선택) 폰트 런 → 편집 필드 innerHTML. 런 구간만 <span style=font-size>로 감싼다. */
function editableTextHtml(text: string, runs?: FontRun[]): string {
  if (!runs || runs.length === 0) return escapeSeg(text);
  const sorted = [...runs].filter((r) => r.e > r.s).sort((a, b) => a.s - b.s);
  let out = "";
  let cursor = 0;
  for (const r of sorted) {
    const start = Math.max(cursor, Math.min(r.s, text.length));
    const end = Math.max(start, Math.min(r.e, text.length));
    if (start > cursor) out += escapeSeg(text.slice(cursor, start));
    if (end > start) {
      out += `<span data-fs="${r.pt}" style="font-size:${r.pt}pt">${escapeSeg(text.slice(start, end))}</span>`;
    }
    cursor = end;
  }
  if (cursor < text.length) out += escapeSeg(text.slice(cursor));
  return out;
}

/** 편집 필드 DOM 에서 평문과 폰트 런(글자 크기 구간)을 함께 읽는다. */
function readEditableContent(root: HTMLElement): {
  text: string;
  runs: Array<{ s: number; e: number; pt: number }>;
} {
  let text = "";
  const runs: Array<{ s: number; e: number; pt: number }> = [];
  const addNewline = () => {
    if (text && !text.endsWith("\n")) text += "\n";
  };
  const ptOf = (el: HTMLElement): number | null => {
    const d = el.getAttribute("data-fs");
    if (d) {
      const n = parseFloat(d);
      return Number.isFinite(n) ? n : null;
    }
    const fs = el.style?.fontSize ?? "";
    if (fs.endsWith("pt")) {
      const n = parseFloat(fs);
      return Number.isFinite(n) ? n : null;
    }
    if (fs.endsWith("px")) {
      const n = parseFloat(fs);
      return Number.isFinite(n) ? (n * 72) / 96 : null;
    }
    return null;
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === "BR") {
        text += "\n";
        return;
      }
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.tagName === "LI";
      if (isBlock) addNewline();
      const pt = ptOf(el);
      const start = text.length;
      walk(el);
      const end = text.length;
      if (pt != null && end > start) runs.push({ s: start, e: end, pt: Math.round(pt) });
      if (isBlock) addNewline();
    });
  };
  walk(root);
  return { text, runs };
}

export function DelBtn({ onClick, title = "삭제", className }: { onClick: () => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      className={cn("par-edit-del par-edit-chrome", className)}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ×
    </button>
  );
}

export function highlightKeywords(text: string, keywords?: string[]): ReactNode {
  const kws = (keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 1);
  if (kws.length === 0) return text;
  const set = new Set(kws.map((k) => k.toLowerCase()));
  const escaped = kws
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.split(re).map((p, i) =>
    set.has(p.toLowerCase()) ? (
      <mark key={i} className="par-kw">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function renderStudentFacingText(value: string): ReactNode {
  const normalized = normalizeStudentFacingMarkup(value);
  const out: ReactNode[] = [];
  const re = /__(.+?)__/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    if (match.index > cursor) out.push(normalized.slice(cursor, match.index));
    out.push(
      <span key={`u-${match.index}`} className="par-inline-underline">
        {match[1]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < normalized.length) out.push(normalized.slice(cursor));
  return out.length ? out : normalized;
}

export function renderGrammarChoiceText(text: string): ReactNode {
  const re = /\[[^\][]*\]/g;
  const out: ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    out.push(
      <u key={k++} className="par-ws-choice-mark">
        {m[0]}
      </u>,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out.length ? out : text;
}
