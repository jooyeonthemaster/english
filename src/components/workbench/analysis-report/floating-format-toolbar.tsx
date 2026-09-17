import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  Minus,
  Plus,
  SquareDashedBottom,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { BlockMeta, ReportFonts } from "@/lib/passage-report/analysis-report/schema";
import { computeFieldOrd } from "./report-sections/editable-field";
import type { FontRunPatch } from "./font-runs";
import { WorksheetFontPicker } from "./worksheet-font-picker";
import { worksheetFontLabel } from "./worksheet-fonts";

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
 * 「선택한 글자」 스냅샷.
 *
 * ⚠ **apply 시점에 getSelection() 을 읽으면 안 된다.** 글꼴 피커의 검색 input 이
 *   autoFocus 로 포커스를 가져가는 순간 문서 선택은 사라진다(필드 blur). 그래서
 *   selectionchange 가 살아 있는 동안 미리 offset 으로 굳혀 두고, 적용은 이 스냅샷으로
 *   한다. 툴바 루트의 `onMouseDown preventDefault` 만으로는 부족하다 — 그건 마우스
 *   기인 blur 만 막지 프로그램적 focus() 는 못 막는다.
 */
interface SelectionSnapshot {
  blockId: string;
  /** 블록 안 편집 필드 순서(폰트 런의 f 축). */
  ord: number;
  start: number;
  end: number;
  /** 이 필드가 폰트 런에 참여하는가(미니 타이틀·크롬 라벨은 제외 대상). */
  runnable: boolean;
}

type FontScope = "run" | "block" | "doc";

export interface FloatingFontApi {
  /** 문서 전체 글꼴(현재 값). */
  doc?: ReportFonts;
  /** 문서 전체 글꼴 패치. undefined 를 넣으면 그 축을 비운다(기본 복귀). */
  onDoc: (patch: Partial<ReportFonts>) => void;
  /** 선택 구간 글꼴/크기 패치 — null = 그 축 제거. */
  onRun: (blockId: string, ord: number, start: number, end: number, patch: FontRunPatch) => void;
}

/**
 * 인라인 텍스트 편집용 떠다니는 서식 툴바(버블 메뉴).
 * `.par-edit-field` 에 포커스가 들어오면 그 필드가 속한 블록 위에 떠서,
 * 블록 단위 서식(글자 크기·굵게·이탤릭·정렬)을 blockMeta 로 적용한다.
 * - 위치는 RAF 로 블록을 추종(스크롤·리페이지네이션·줌에도 따라감).
 * - 리포트/툴바 바깥 클릭 또는 ESC 로 닫힌다(필드 재포커스는 focusin 이 갱신).
 *
 * [글꼴] 3단 스코프 — **선택한 글자 / 이 블록 / 문서 전체**.
 * 세 축은 상속 사다리다: 선택 구간(fontRuns.ff) > 블록(blockMeta.fontKo/En) >
 * 문서(report.fonts) > CSS 기본(맑은 고딕 / 세리프). 각 축의 「기본」이 자기 축만
 * 비우므로 어느 단계든 되돌리기가 1클릭이다.
 */
export function FloatingFormatToolbar({
  blockMeta,
  onBlockMeta,
  onClozeBlank,
  fonts,
}: {
  blockMeta?: Record<string, BlockMeta>;
  onBlockMeta: (id: string, patch: Partial<BlockMeta>) => void;
  onClozeBlank?: (blockId: string, itemIndex: number, start: number, end: number) => void;
  /** 미전달 시 글꼴 버튼 자체가 렌더되지 않는다(기존 소비처 바이트 동일). */
  fonts?: FloatingFontApi;
}) {
  // 빈칸형 활동 prompt 안에서 텍스트를 선택하면 '빈칸' 버튼이 뜬다(선택→빈칸).
  const [blankTarget, setBlankTarget] = useState<{ blockId: string; itemIndex: number } | null>(null);
  // 「선택한 글자」 스냅샷 — 위 주석 참조. state 로도 들고 있어야 스코프 버튼 활성이 갱신된다.
  const [sel, setSel] = useState<SelectionSnapshot | null>(null);
  const selRef = useRef<SelectionSnapshot | null>(null);
  // 글꼴 팝오버가 열려 있는 동안에는 스냅샷을 덮어쓰지 않는다(피커 안에서 드래그·클릭으로
  // 선택이 무너져도 적용 대상이 유지되어야 한다).
  const [fontOpen, setFontOpen] = useState(false);
  const fontOpenRef = useRef(false);
  // 스코프는 **파생값**이다 — 사용자가 명시로 고르기 전까지는 선택 상태를 따라간다
  // (글자를 집어 놓고 툴바를 연 사람의 의도는 거의 언제나 그 글자다). 명시 선택은
  // override 로 남고, 팝오버를 닫으면 초기화된다.
  const [scopeOverride, setScopeOverride] = useState<FontScope | null>(null);
  // 미러 ref 는 effect 에서 동기화한다(렌더 중 ref 쓰기 금지). 아래 effect 들보다 **먼저**
  // 선언돼 있어야 같은 커밋에서 최신값을 읽는다 — effect 는 선언 순서대로 실행된다.
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  useEffect(() => {
    fontOpenRef.current = fontOpen;
  }, [fontOpen]);
  // 팝오버 닫기는 **반드시 여기로** — 닫기 경로가 3개(토글·Escape·바깥클릭)라 한 곳이라도
  // override 정리를 빠뜨리면 다음에 열 때 엉뚱한 축이 활성인 채로 뜬다(실측 결함).
  const closeFontPopover = useCallback(() => {
    setFontOpen(false);
    setScopeOverride(null);
  }, []);

  useEffect(() => {
    const onSelChange = () => {
      const selection = window.getSelection();
      const collapsed = !selection || selection.rangeCount === 0 || selection.isCollapsed;
      const node = collapsed ? null : selection!.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;

      // ① 빈칸 버튼 대상(기존 동작 — 활동 prompt 필드 한정)
      const blankField = collapsed
        ? null
        : el?.closest<HTMLElement>(".par-edit-field[data-activity-blankable]");
      const blankBlock = blankField?.closest<HTMLElement>("[data-paper-item-id]");
      const idx = blankField ? parseInt(blankField.getAttribute("data-activity-item") ?? "-1", 10) : -1;
      const blankBlockId = blankBlock?.getAttribute("data-paper-item-id");
      setBlankTarget(
        blankField && blankBlock && blankBlockId && idx >= 0
          ? { blockId: blankBlockId, itemIndex: idx }
          : null,
      );

      // ② 글꼴 적용용 스냅샷 — 편집 필드 전체가 대상.
      // 팝오버가 열려 있는 동안에는 **동결**한다(피커의 검색 input 이 autoFocus 로 포커스를
      // 가져가며 선택을 무너뜨리므로). 닫혀 있을 때는 선택이 풀리면 반드시 **버린다** —
      // 남겨 두면 다음 클릭에서 「선택한 글자」가 활성인 채로 **옛 구간**에 적용된다(실측 결함).
      if (fontOpenRef.current) return;
      if (collapsed) {
        setSel(null);
        return;
      }
      const field = el?.closest<HTMLElement>(".par-edit-field");
      const block = field?.closest<HTMLElement>("[data-paper-item-id]");
      const id = block?.getAttribute("data-paper-item-id");
      if (!field || !block || !id) {
        setSel(null);
        return;
      }
      const off = selectionOffsetsInField(field);
      if (!off) {
        setSel(null);
        return;
      }
      // 미니 타이틀·크롬 라벨 필드는 ord 공간 밖이라 런을 붙일 수 없다(오귀속 방지).
      const runnable =
        !field.closest(".par-ws-minihead") && !field.classList.contains("par-no-fontrun");
      setSel({ blockId: id, ord: computeFieldOrd(field), start: off.start, end: off.end, runnable });
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
      // 글꼴 팝오버 안(검색 input)으로 들어온 포커스는 대상 갱신 트리거가 아니다.
      if (target && toolbarRef.current?.contains(target)) return;
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
      closeFontPopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 글꼴 팝오버가 열려 있으면 그것만 닫는다(툴바까지 함께 사라지면 다시 잡기 번거롭다).
      if (fontOpenRef.current) {
        closeFontPopover();
        return;
      }
      setBlockId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blockId, closeFontPopover]);

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
        const selection = window.getSelection();
        if (field && selection && selection.rangeCount > 0 && selection.anchorNode && field.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
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

  const selRunnable = !!sel && sel.runnable && sel.blockId === blockId;
  const scope: FontScope =
    scopeOverride === "run" && !selRunnable ? "block" : (scopeOverride ?? (selRunnable ? "run" : "block"));
  const setScope = setScopeOverride;

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

  // ── 글꼴 적용 ──
  // 런을 건드리는 **모든** 경로는 먼저 blur 한다. 포커스 중인 필드는 `Field` 의
  // useLayoutEffect 가 innerHTML 재생성을 건너뛰는데(focusedRef 가드), 그 사이 React 가
  // 런 없는 `dangerouslySetInnerHTML` 을 다시 얹으면 **화면에서만** 서식이 통째로
  // 사라진다(상태는 멀쩡한데 눈에는 전멸 — 26-09-12 실측. 적용 경로는 blur 를 했고
  // 지우기 경로만 빠져 있어 「이웃 런까지 지워진 것처럼」 보였다).
  // 빈칸 버튼이 쓰는 것과 동일한 관용구다.
  const commitRun = (patch: FontRunPatch) => {
    const snap = selRef.current;
    if (!fonts || !snap || !snap.runnable) return;
    document
      .querySelectorAll<HTMLElement>(`[data-paper-item-id="${CSS.escape(snap.blockId)}"] .par-edit-field`)
      .forEach((f) => {
        if (document.activeElement === f) f.blur();
      });
    fonts.onRun(snap.blockId, snap.ord, snap.start, snap.end, patch);
  };
  const applyRunFont = (family: string | undefined) => commitRun({ ff: family ?? null });
  const clearRunFormat = () => commitRun({ ff: null, pt: null });

  const scopeFontKo =
    scope === "doc" ? fonts?.doc?.ko : scope === "block" ? meta.fontKo : undefined;
  const scopeFontEn =
    scope === "doc" ? fonts?.doc?.en : scope === "block" ? meta.fontEn : undefined;
  // 「선택한 글자」 현재 값 — 선택 시작 글자를 덮는 런의 ff.
  const runFamily = (() => {
    if (!sel || !sel.runnable) return undefined;
    const hit = (blockMeta?.[sel.blockId]?.fontRuns ?? []).find(
      (r) => r.f === sel.ord && r.s <= sel.start && r.e > sel.start,
    );
    return hit?.ff;
  })();
  const triggerLabel =
    scope === "run"
      ? worksheetFontLabel(runFamily)
      : worksheetFontLabel(scope === "doc" ? fonts?.doc?.ko : meta.fontKo);

  return createPortal(
    <div
      ref={toolbarRef}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="no-print z-[70] rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
      // 필드 포커스를 잃지 않도록(클릭 시 blur 방지) — 버튼 onClick 은 그대로 동작.
      // 단 팝오버 안의 입력 요소는 예외 — 막으면 검색창에 커서가 들어가지 않는다.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea")) return;
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-0.5">
        <button type="button" className={btnCls(false)} onClick={() => stepFontScale(-1)} title="글자 작게">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-500">{Math.round(fontScale * 10)}pt</span>
        <button type="button" className={btnCls(false)} onClick={() => stepFontScale(1)} title="글자 크게">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        {fonts ? (
          <>
            <button
              type="button"
              className={cn(
                "flex h-7 max-w-[128px] items-center gap-1 rounded px-1.5 transition-colors",
                fontOpen ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100",
              )}
              onClick={() => (fontOpen ? closeFontPopover() : setFontOpen(true))}
              title="글꼴 (선택한 글자 / 블록 / 문서 전체)"
            >
              <Type className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[11px] font-semibold">{triggerLabel}</span>
            </button>
            <span className="mx-0.5 h-5 w-px bg-slate-200" />
          </>
        ) : null}
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
      </div>

      {fonts && fontOpen ? (
        <div className="mt-1 w-[268px] border-t border-slate-100 pt-2">
          {/* 스코프 — 이 툴바의 핵심. 세 축이 한 화면에 있어야 "어디에 적용되는지"가 설명된다. */}
          <div className="mb-2 flex gap-1 px-0.5">
            <ScopeButton active={scope === "run"} disabled={!selRunnable} onClick={() => setScope("run")}>
              선택한 글자
            </ScopeButton>
            <ScopeButton active={scope === "block"} onClick={() => setScope("block")}>
              이 블록
            </ScopeButton>
            <ScopeButton active={scope === "doc"} onClick={() => setScope("doc")}>
              문서 전체
            </ScopeButton>
          </div>

          {scope === "run" ? (
            selRunnable ? (
              <div className="space-y-1.5 px-0.5">
                <WorksheetFontPicker
                  lang="both"
                  value={runFamily}
                  onChange={applyRunFont}
                  inheritLabel="블록 따름"
                  compact
                />
                <button
                  type="button"
                  onClick={clearRunFormat}
                  className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  <Eraser className="h-3 w-3" /> 이 구간 글꼴·크기 지우기
                </button>
              </div>
            ) : (
              <p className="px-1 py-2 text-[11.5px] leading-relaxed text-slate-400">
                본문에서 글자를 <b className="text-slate-500">드래그해 선택</b>하면 그 구간에만
                글꼴을 입힐 수 있어요.
              </p>
            )
          ) : (
            <div className="space-y-1.5 px-0.5">
              <WorksheetFontPicker
                lang="ko"
                slotLabel="한글"
                value={scopeFontKo}
                inheritLabel={scope === "block" ? "문서 따름" : "기본"}
                onChange={(family) =>
                  scope === "doc" ? fonts.onDoc({ ko: family }) : onBlockMeta(blockId, { fontKo: family })
                }
              />
              <WorksheetFontPicker
                lang="latin"
                slotLabel="영문"
                value={scopeFontEn}
                inheritLabel={scope === "block" ? "문서 따름" : "기본"}
                onChange={(family) =>
                  scope === "doc" ? fonts.onDoc({ en: family }) : onBlockMeta(blockId, { fontEn: family })
                }
              />
              <p className="px-0.5 pt-0.5 text-[10.5px] leading-relaxed text-slate-400">
                {scope === "doc"
                  ? "조판된 모든 텍스트(부착 문서·문항 포함)에 적용됩니다."
                  : "이 블록과 그 안의 모든 텍스트에 적용됩니다."}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function ScopeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition",
        active
          ? "bg-slate-900 text-white"
          : disabled
            ? "cursor-not-allowed text-slate-300"
            : "text-slate-500 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}
