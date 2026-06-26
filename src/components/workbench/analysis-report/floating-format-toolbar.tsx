import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
  SquareDashedBottom,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { BlockMeta } from "@/lib/passage-report/analysis-report/schema";

// 선택 영역(없으면 필드 전체)에만 글자 크기(pt)를 입힌다. <font size=7> 로 감싼 뒤
// span[data-fs][style=font-size:Npt] 로 변환. blur 시 Field 가 DOM 에서 런을 읽어 저장.
function applyFontPtToSelection(field: HTMLElement, pt: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let range = sel.rangeCount ? sel.getRangeAt(0) : null;
  const inField = !!range && field.contains(range.commonAncestorContainer);
  if (!range || sel.isCollapsed || !inField) {
    range = document.createRange();
    range.selectNodeContents(field);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontSize", false, "7");
  field.querySelectorAll('font[size="7"]').forEach((f) => {
    const span = document.createElement("span");
    span.setAttribute("data-fs", String(pt));
    span.style.fontSize = `${pt}pt`;
    while (f.firstChild) span.appendChild(f.firstChild);
    // 중첩된 이전 크기 span 은 제거(바깥 크기가 우선).
    span.querySelectorAll<HTMLElement>("[data-fs]").forEach((inner) => {
      const parent = inner.parentNode;
      if (!parent) return;
      while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
      parent.removeChild(inner);
    });
    f.replaceWith(span);
  });
}

/** 편집 필드 안 현재 선택 영역의 [start,end) 를 평문(prompt) offset 으로 환산. <br> = \n = 1글자. */
function selectionOffsetsInField(field: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!field.contains(range.commonAncestorContainer)) return null;
  const fragLen = (frag: Node): number => {
    let len = 0;
    const w = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE) len += (n.textContent ?? "").length;
      else if ((n as HTMLElement).tagName === "BR") len += 1;
    }
    return len;
  };
  const pre = document.createRange();
  pre.selectNodeContents(field);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = fragLen(pre.cloneContents());
  const end = start + fragLen(range.cloneContents());
  return start === end ? null : { start, end };
}

/**
 * 인라인 텍스트 편집용 떠다니는 서식 툴바(버블 메뉴).
 * `.par-edit-field` 에 포커스가 들어오면 그 필드가 속한 블록 위에 떠서,
 * 블록 단위 서식(글자 크기·굵게·이탤릭·정렬)을 blockMeta 로 적용한다.
 * - 위치는 RAF 로 블록을 추종(스크롤·리페이지네이션·줌에도 따라감).
 * - 리포트/툴바 바깥 클릭 또는 ESC 로 닫힌다(필드 재포커스는 focusin 이 갱신).
 */
export function FloatingFormatToolbar({
  blockMeta,
  onBlockMeta,
  onClozeBlank,
}: {
  blockMeta?: Record<string, BlockMeta>;
  onBlockMeta: (id: string, patch: Partial<BlockMeta>) => void;
  onClozeBlank?: (blockId: string, itemIndex: number, start: number, end: number) => void;
}) {
  // 빈칸형 활동 prompt 안에서 텍스트를 선택하면 '빈칸' 버튼이 뜬다(선택→빈칸).
  const [blankTarget, setBlankTarget] = useState<{ blockId: string; itemIndex: number } | null>(null);
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setBlankTarget(null);
        return;
      }
      const node = sel.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      const field = el?.closest<HTMLElement>(".par-edit-field[data-activity-blankable]");
      const block = field?.closest<HTMLElement>("[data-paper-item-id]");
      const idx = field ? parseInt(field.getAttribute("data-activity-item") ?? "-1", 10) : -1;
      const blockId = block?.getAttribute("data-paper-item-id");
      setBlankTarget(field && block && blockId && idx >= 0 ? { blockId, itemIndex: idx } : null);
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);
  const [blockId, setBlockId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const fieldRef = useRef<HTMLElement | null>(null);
  const ptLabelRef = useRef<HTMLSpanElement>(null);

  // 편집 필드 포커스 → 해당 블록을 서식 대상으로 잡는다.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const field = target?.closest<HTMLElement>(".par-edit-field");
      const block = field?.closest<HTMLElement>("[data-paper-item-id]");
      if (!block) return;
      anchorRef.current = block;
      fieldRef.current = field ?? block;
      setBlockId(block.getAttribute("data-paper-item-id"));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // 현재 편집 중인 텍스트의 '실제' 글자 크기(pt) — 블록마다 기준 크기가 달라
  // fontScale(배율)만으로는 pt 를 알 수 없으므로 렌더된 px 를 읽어 pt 로 환산한다.
  const readFontPt = (): number | null => {
    let field = fieldRef.current;
    if (!field || !field.isConnected) {
      field = anchorRef.current?.querySelector<HTMLElement>(".par-edit-field") ?? anchorRef.current ?? null;
      fieldRef.current = field;
    }
    if (!field) return null;
    // 선택이 이 필드 안에 있으면 '선택한 글자'의 크기를 우선 표시.
    const sel = window.getSelection();
    if (sel && sel.focusNode && field.contains(sel.focusNode)) {
      const el =
        sel.focusNode.nodeType === Node.ELEMENT_NODE
          ? (sel.focusNode as HTMLElement)
          : sel.focusNode.parentElement;
      if (el) {
        const spx = parseFloat(window.getComputedStyle(el).fontSize);
        if (spx) return (spx * 72) / 96;
      }
    }
    const px = parseFloat(window.getComputedStyle(field).fontSize);
    return px ? (px * 72) / 96 : null; // px → pt
  };

  // 리포트/툴바 바깥 클릭 또는 ESC 로 닫기.
  useEffect(() => {
    if (!blockId) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as HTMLElement;
      if (toolbarRef.current?.contains(node)) return;
      // 편집 필드 클릭은 유지(같은 필드면 그대로, 다른 필드면 focusin 이 대상 갱신).
      // 페이지 여백·페이지 밖·그 외 비편집 영역을 클릭하면 닫는다.
      if (node.closest?.(".par-edit-field")) return;
      setBlockId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlockId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blockId]);

  // 위치: '실제로 수정 중인' 편집 필드(.par-edit-field) 바로 위·왼쪽에 고정.
  // 블록 전체가 아니라 편집 필드를 기준점으로 삼아, 키 큰 블록에서도 툴바가
  // 멀리 떨어진 블록 최상단이 아니라 편집 지점 근처에 뜨도록 한다.
  // RAF 로 매 프레임 추종(상태 변경 없이 DOM 직접 갱신).
  useEffect(() => {
    if (!blockId) return;
    let raf = 0;
    const tick = () => {
      const bar = toolbarRef.current;
      let anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) {
        anchor = document.querySelector<HTMLElement>(`[data-paper-item-id="${CSS.escape(blockId)}"]`);
        anchorRef.current = anchor;
      }
      // 편집 필드를 우선 기준점으로 사용하고, 없으면 블록으로 폴백.
      let field = fieldRef.current;
      if (!field || !field.isConnected) {
        field =
          anchor?.querySelector<HTMLElement>(".par-edit-field") ?? anchor ?? null;
        fieldRef.current = field;
      }
      const target = field ?? anchor;
      if (bar && target) {
        // 기준 rect = '커서/선택 지점' 우선(클릭한 곳을 추종), 없으면 편집 필드 상단으로 폴백.
        // 키 큰 블록(중첩 빈칸 등)에서 툴바가 필드 최상단에 박혀 클릭 위치와 멀어지는 문제를 해결.
        let r = target.getBoundingClientRect();
        const sel = window.getSelection();
        if (field && sel && sel.rangeCount > 0 && sel.anchorNode && field.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          let cr = range.getBoundingClientRect();
          // collapsed caret 가 0,0 rect 를 주는 브라우저 대비 — client rects 폴백.
          if (cr.top === 0 && cr.left === 0 && cr.width === 0 && cr.height === 0) {
            const rects = range.getClientRects();
            if (rects.length) cr = rects[0];
          }
          if (cr.height > 0 || cr.width > 0 || cr.top > 0) r = cr;
        }
        const top = Math.max(8, r.top - bar.offsetHeight - 8);
        const left = Math.min(Math.max(8, r.left), window.innerWidth - bar.offsetWidth - 8);
        bar.style.top = `${top}px`;
        bar.style.left = `${left}px`;
        bar.style.visibility = "visible";
      } else if (bar) {
        bar.style.visibility = "hidden";
      }
      // pt 라벨은 리렌더 없이 매 프레임 직접 갱신(서식 변경·줌에도 즉시 반영).
      const ptEl = ptLabelRef.current;
      if (ptEl) {
        const pt = readFontPt();
        ptEl.textContent = pt ? `${Math.round(pt)}pt` : "—";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blockId]);

  if (!blockId) return null;
  const meta = blockMeta?.[blockId] ?? {};
  // 선택한 글자(없으면 현재 필드 전체)에만 pt 를 1pt 씩 조절. 블록 전체 배율이 아니라
  // 범위 메타로 저장되도록, 선택 영역을 span 으로 감싼다(blur 시 Field 가 읽어 커밋).
  const stepFontPt = (delta: number) => {
    const field =
      fieldRef.current && fieldRef.current.isConnected ? fieldRef.current : null;
    if (!field) return;
    const cur = readFontPt() ?? 12;
    const targetPt = Math.min(60, Math.max(5, Math.round(cur) + delta));
    applyFontPtToSelection(field, targetPt);
  };
  const btnCls = (active: boolean) =>
    cn(
      "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 transition-colors",
      active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100",
    );
  // 선택을 빈칸으로: 현재 선택 영역을 prompt offset 으로 환산해 에디터로 보낸다.
  const doBlank = () => {
    if (!blankTarget) return;
    const field = document.querySelector<HTMLElement>(
      `[data-paper-item-id="${CSS.escape(blankTarget.blockId)}"] .par-edit-field[data-activity-blankable][data-activity-item="${blankTarget.itemIndex}"]`,
    );
    if (!field) return;
    const off = selectionOffsetsInField(field);
    if (!off) return;
    // ★ 포커스를 먼저 푼다(blur). 포커스 중엔 Field 가 innerHTML 을 갱신하지 않아 새 빈칸이 화면에 안 보임.
    // blur 의 onCommit 은 DOM 텍스트=현재 prompt 와 같아 no-op 이다(선택만 했을 뿐 글자는 안 바꿈).
    field.blur();
    window.getSelection()?.removeAllRanges();
    setBlankTarget(null);
    onClozeBlank?.(blankTarget.blockId, blankTarget.itemIndex, off.start, off.end);
  };
  const showBlankBtn = !!onClozeBlank && !!blankTarget && blankTarget.blockId === blockId;

  return createPortal(
    <div
      ref={toolbarRef}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="no-print z-[70] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
      // 필드 포커스를 잃지 않도록(클릭 시 blur 방지) — 버튼 onClick 은 그대로 동작
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(-1)} title="글자 작게">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span ref={ptLabelRef} className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-500">—</span>
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(1)} title="글자 크게">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button type="button" className={btnCls(!!meta.bold)} onClick={() => onBlockMeta(blockId, { bold: !meta.bold })} title="굵게">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(!!meta.italic)} onClick={() => onBlockMeta(blockId, { italic: !meta.italic })} title="이탤릭">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button type="button" className={btnCls(!meta.align || meta.align === "left")} onClick={() => onBlockMeta(blockId, { align: "left" })} title="왼쪽 정렬">
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(meta.align === "center")} onClick={() => onBlockMeta(blockId, { align: "center" })} title="가운데 정렬">
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(meta.align === "right")} onClick={() => onBlockMeta(blockId, { align: "right" })} title="오른쪽 정렬">
        <AlignRight className="h-3.5 w-3.5" />
      </button>
      {showBlankBtn ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-slate-200" />
          <button
            type="button"
            className="flex h-7 items-center justify-center gap-1 rounded bg-emerald-50 px-2 text-[11.5px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
            onClick={doBlank}
            title="선택한 단어/구를 빈칸으로 만들기"
          >
            <SquareDashedBottom className="h-3.5 w-3.5" /> 빈칸
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
