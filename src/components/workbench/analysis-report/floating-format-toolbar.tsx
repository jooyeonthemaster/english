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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blockId]);

  if (!blockId) return null;
  const meta = blockMeta?.[blockId] ?? {};
  // 글자 크기 = 블록 전체 배율(fontScale). 우측 편집 패널 '서식'과 동일한 상태를 편집해
  // 둘이 항상 일치한다(0.7~1.4, 1=10pt 기준). 한쪽을 바꾸면 다른 쪽도 즉시 갱신.
  const fontScale = meta.fontScale ?? 1;
  const stepFontScale = (delta: number) => {
    const next =
      delta < 0
        ? Math.max(0.7, Math.round((fontScale - 0.1) * 10) / 10)
        : Math.min(1.4, Math.round((fontScale + 0.1) * 10) / 10);
    if (next !== fontScale) onBlockMeta(blockId, { fontScale: next });
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
      <button type="button" className={btnCls(false)} onClick={() => stepFontScale(-1)} title="글자 작게">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-500">{Math.round(fontScale * 10)}pt</span>
      <button type="button" className={btnCls(false)} onClick={() => stepFontScale(1)} title="글자 크게">
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
