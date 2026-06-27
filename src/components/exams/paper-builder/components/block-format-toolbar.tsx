import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  clampBlockFontPt,
  effectiveBlockFontPt,
  type PaperItem,
} from "../types";

/**
 * 시험지 미리보기에서 텍스트/섹션 블록을 직접 편집할 때 그 블록 위에 떠오르는 서식 툴바.
 * 분석리포트 에디터의 떠다니는 툴바와 같은 UX 지만, 시험지는 인라인 선택 서식이 아니라
 * "블록 단위" 서식이라 글자 크기(pt)·굵게·기울임·정렬을 모두 PaperItem 필드로 적용한다.
 * - `.editable-paper-field`(EditableText) 에 포커스가 들어오면 그 블록을 대상으로 잡는다.
 * - 위치는 RAF 로 편집 필드를 추종(스크롤·줌·리페이지네이션에도 따라감).
 * - 바깥 클릭 또는 ESC 로 닫힌다(다른 블록 클릭은 focusin 이 대상만 갱신).
 */
export function BlockFormatToolbar({
  items,
  onUpdateItem,
}: {
  items: PaperItem[];
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
}) {
  const [blockId, setBlockId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLElement | null>(null);

  // 편집 필드 포커스 → 그 필드가 속한 블록을 서식 대상으로 잡는다.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const field = target?.closest<HTMLElement>(".editable-paper-field");
      const block = field?.closest<HTMLElement>("[data-paper-item-id]");
      if (!field || !block) return;
      fieldRef.current = field;
      setBlockId(block.getAttribute("data-paper-item-id"));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // 바깥 클릭 또는 ESC 로 닫기(편집 필드 클릭은 유지 — focusin 이 대상 갱신).
  useEffect(() => {
    if (!blockId) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as HTMLElement;
      if (toolbarRef.current?.contains(node)) return;
      if (node.closest?.(".editable-paper-field")) return;
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

  // 위치: 편집 중인 필드 바로 위·왼쪽에 고정. RAF 로 매 프레임 추종(상태 변경 없이 DOM 갱신).
  useEffect(() => {
    if (!blockId) return;
    let raf = 0;
    const tick = () => {
      const bar = toolbarRef.current;
      let field = fieldRef.current;
      if (!field || !field.isConnected) {
        field =
          document.querySelector<HTMLElement>(
            `[data-paper-item-id="${CSS.escape(blockId)}"] .editable-paper-field`,
          ) ?? null;
        fieldRef.current = field;
      }
      if (bar && field) {
        // 기준 rect = 현재 커서(선택) 지점을 우선 추종해 캐럿을 따라다닌다.
        // 선택이 이 필드 안에 없으면 필드 상단으로 폴백.
        let r = field.getBoundingClientRect();
        const sel = window.getSelection();
        if (
          sel &&
          sel.rangeCount > 0 &&
          sel.anchorNode &&
          field.contains(sel.anchorNode)
        ) {
          const range = sel.getRangeAt(0);
          let cr = range.getBoundingClientRect();
          // collapsed caret 가 0,0,0,0 rect 를 주는 브라우저 대비 — client rects 폴백.
          if (cr.top === 0 && cr.left === 0 && cr.width === 0 && cr.height === 0) {
            const rects = range.getClientRects();
            if (rects.length) cr = rects[0];
          }
          if (cr.height > 0 || cr.width > 0 || cr.top > 0) r = cr;
        }
        const top = Math.max(8, r.top - bar.offsetHeight - 8);
        const left = Math.min(
          Math.max(8, r.left),
          window.innerWidth - bar.offsetWidth - 8,
        );
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
  const item = items.find((it) => it.localId === blockId);
  // 텍스트·섹션·문항 블록이 서식 대상(이미지·구분선·여백은 제외). 잠긴 블록도 제외.
  if (!item || item.locked) return null;
  if (
    item.blockType !== "text" &&
    item.blockType !== "section" &&
    item.blockType !== "question"
  ) {
    return null;
  }

  const pt = effectiveBlockFontPt(item);
  const stepFontPt = (delta: number) =>
    onUpdateItem(blockId, { blockFontPt: clampBlockFontPt(pt + delta) });
  const btnCls = (active: boolean) =>
    cn(
      "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 transition-colors",
      active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100",
    );

  return createPortal(
    <div
      ref={toolbarRef}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="no-print z-[70] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
      // 필드 포커스를 잃지 않도록(클릭 시 blur 방지) — 버튼 onClick 은 그대로 동작.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(-1)} title="글자 작게">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-500">
        {pt}pt
      </span>
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(1)} title="글자 크게">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button
        type="button"
        className={btnCls(item.blockBold)}
        onClick={() => onUpdateItem(blockId, { blockBold: !item.blockBold })}
        title="굵게"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btnCls(item.blockItalic)}
        onClick={() => onUpdateItem(blockId, { blockItalic: !item.blockItalic })}
        title="기울임"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button
        type="button"
        className={btnCls(item.blockAlign === "left")}
        onClick={() => onUpdateItem(blockId, { blockAlign: "left" })}
        title="왼쪽 정렬"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btnCls(item.blockAlign === "center")}
        onClick={() => onUpdateItem(blockId, { blockAlign: "center" })}
        title="가운데 정렬"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btnCls(item.blockAlign === "right")}
        onClick={() => onUpdateItem(blockId, { blockAlign: "right" })}
        title="오른쪽 정렬"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body,
  );
}
