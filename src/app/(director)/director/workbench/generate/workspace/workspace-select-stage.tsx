"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";
import { tokenizePassage } from "@/lib/passage-point-tokenizer";
import type { RowHighlight, RowRange } from "./workspace-types";

// ============================================================================
// 워크스페이스 지문 선택 무대 — "포인트 짚어주기"(passage-point-picker)와 동일한
// 제스처 문법을 지문 카드에 이식한 읽기 전용 표면.
// - 단어 hover 틴트(CSS 전용) · 클릭 = 문장 선택 · 드래그 = 단어 경계 스냅 구간
//   (포인트 픽커와 달리 문장 경계를 넘는 멀티 문장 드래그 허용 — 출제 범위용).
// - 드래그 프리뷰는 재렌더 없이 classList 로만 칠한다(픽커의 60fps 규율 그대로).
// - 텍스트가 실제 글자라(투명 백드롭 아님) AI 하이라이트·출제 범위가 문자
//   오프셋 그대로 보인다 — textarea 백드롭의 스크롤바 폭 줄바꿈 어긋남이 없다.
// - 본문 타이핑은 부모의 '직접 편집' 모드(textarea)가 담당한다.
// ============================================================================

export interface StageSelection {
  start: number;
  end: number;
  text: string;
}

/** 선택 액션 팝오버 배치용 — 스크롤 콘텐츠(패딩 박스) 기준 px 좌표. */
export interface StageAnchor {
  x: number;
  topY: number;
  bottomY: number;
  contentW: number;
  contentH: number;
}

interface DragState {
  pointerId: number;
  anchorIdx: number;
  x: number;
  y: number;
  moved: boolean;
  lastIdx: number;
  last: { start: number; end: number } | null;
  els: HTMLElement[];
}

interface WorkspaceSelectStageProps {
  content: string;
  highlights: RowHighlight[];
  range: RowRange | null;
  /** 미리보기/생성 중 — 제스처만 차단(hover 액션 메뉴·툴팁은 부모가 계속 처리). */
  locked: boolean;
  /** 에디터(textarea 모드)와 동일한 본문 폰트 크기 — "13px" | "10px"(모바일). */
  fontSize: string;
  selection: StageSelection | null;
  /**
   * 선택 커밋/해제. 문장 클릭·드래그 스냅 결과를 anchor(콘텐츠 좌표)와 함께
   * 올린다. 빈 곳 클릭·동일 문장 재클릭은 (null, null) — 부모가 해제한다.
   */
  onSelect: (sel: StageSelection | null, anchor: StageAnchor | null) => void;
  /** 하이라이트 mark 히트테스트(원문 툴팁·삭제 메뉴)는 부모 위임 그대로 쓴다. */
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  /** 선택 직후 띄우는 액션 팝오버 — 부모가 anchor 로 배치한 절대요소.
      콘텐츠 래퍼 안에 렌더되어 본문과 함께 스크롤된다. */
  selectionPopover?: ReactNode;
}

export function WorkspaceSelectStage({
  content,
  highlights,
  range,
  locked,
  fontSize,
  selection,
  onSelect,
  onMouseMove,
  onMouseLeave,
  onScroll,
  selectionPopover,
}: WorkspaceSelectStageProps) {
  const tokenized = useMemo(() => tokenizePassage(content), [content]);
  const allTokens = useMemo(
    () => tokenized.sentences.flatMap((s) => s.tokens),
    [tokenized],
  );
  const sentenceTokenBase = useMemo(() => {
    const base: number[] = [];
    let acc = 0;
    for (const s of tokenized.sentences) {
      base.push(acc);
      acc += s.tokens.length;
    }
    return base;
  }, [tokenized]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const segEls = useRef(new Map<number, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  // 더블클릭 판정 — 같은 문장 안에서 450ms 내 두 번째 클릭이면 문장 전체 선택.
  const lastTapRef = useRef<{ si: number; t: number } | null>(null);
  // "더블클릭 = 문장 선택" 안내 칩 — 단어 선택 직후 커서 옆에 잠깐 떠 있다
  // 사라진다. 단일 fixed 요소를 DOM 으로만 이동(재렌더 0).
  const hintRef = useRef<HTMLDivElement>(null);
  const hintTimerRef = useRef<number | null>(null);

  const hideHint = () => {
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    const el = hintRef.current;
    if (el) el.style.display = "none";
  };

  const showHint = (x: number, y: number) => {
    const el = hintRef.current;
    if (!el) return;
    el.style.display = "block";
    el.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${y + 20}px`;
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      hintTimerRef.current = null;
      hideHint();
    }, 1800);
  };

  // 지문 교체 시 진행 중이던 드래그·탭 추적을 버린다.
  useEffect(() => {
    dragRef.current = null;
    lastTapRef.current = null;
  }, [tokenized]);
  // 언마운트 시 안내 칩 타이머 정리.
  useEffect(
    () => () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const registerSeg = (start: number) => (el: HTMLElement | null) => {
    if (el) segEls.current.set(start, el);
    else segEls.current.delete(start);
  };

  // ── 스냅: 토큰 인덱스 구간 → 단어 경계 문자 구간 (멀티 문장 허용) ──────────
  const snapTokens = (aIdx: number, bIdx: number) => {
    const lo = allTokens[Math.min(aIdx, bIdx)];
    const hi = allTokens[Math.max(aIdx, bIdx)];
    if (!lo || !hi) return null;
    return { start: lo.start, end: hi.end };
  };

  /** 구간을 덮는 세그먼트 요소들(문서 순) — 프리뷰 칠하기·앵커 측정 공용. */
  const coveredSegEls = (start: number, end: number) => {
    const els: HTMLElement[] = [];
    for (const seg of tokenized.segments) {
      if (seg.start >= start && seg.end <= end) {
        const el = segEls.current.get(seg.start);
        if (el) els.push(el);
      }
    }
    return els;
  };

  // ── 드래그 프리뷰 — 재렌더 0, classList 만 ──────────────────────────────────
  const clearDragPreview = () => {
    const d = dragRef.current;
    if (!d) return;
    for (const el of d.els) el.classList.remove("wss-drag", "wss-drag-a", "wss-drag-b");
    d.els = [];
  };

  const applyDragPreview = (start: number, end: number) => {
    const d = dragRef.current;
    if (!d) return;
    clearDragPreview();
    const els = coveredSegEls(start, end);
    els.forEach((el, i) => {
      el.classList.add("wss-drag");
      if (i === 0) el.classList.add("wss-drag-a");
      if (i === els.length - 1) el.classList.add("wss-drag-b");
    });
    d.els = els;
  };

  // ── 앵커 측정 — 콘텐츠 래퍼(패딩 박스) 기준. 팝오버가 본문과 함께 스크롤된다.
  const measureAnchor = (start: number, end: number): StageAnchor | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const els = coveredSegEls(start, end);
    if (els.length === 0) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const first = els[0].getBoundingClientRect();
    const last = els[els.length - 1].getBoundingClientRect();
    const sameLine = Math.abs(first.top - last.top) < 4;
    return {
      x: (sameLine ? (first.left + last.right) / 2 : last.right) - wrapRect.left,
      topY: first.top - wrapRect.top,
      bottomY: last.bottom - wrapRect.top,
      contentW: wrap.clientWidth,
      contentH: wrap.clientHeight,
    };
  };

  const commit = (start: number, end: number) => {
    // 동일 구간 재선택 = 해제 토글.
    if (selection && selection.start === start && selection.end === end) {
      onSelect(null, null);
      return;
    }
    onSelect(
      { start, end, text: content.slice(start, end) },
      measureAnchor(start, end),
    );
  };

  // ── 포인터 제스처 (마우스/펜 드래그 · 터치는 탭 = 문장 선택) ────────────────
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    // 선택 액션 팝오버 위 클릭은 무대 제스처가 아니다 — 여기서 선택을 지우면
    // 버튼 click 이 발화되기 전에 selection 이 사라져 액션이 무시된다.
    if (t.closest("[data-wss-pop]")) return;
    const el = t.closest("[data-i]");
    if (!(el instanceof HTMLElement)) {
      // 여백/공백 클릭 = 선택 해제.
      hideHint();
      if (selection) onSelect(null, null);
      return;
    }
    const idx = Number(el.dataset.i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= allTokens.length) return;
    dragRef.current = {
      pointerId: e.pointerId,
      anchorIdx: idx,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      lastIdx: idx,
      last: null,
      els: [],
    };
    if (e.pointerType !== "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault(); // 네이티브 텍스트 선택 차단
    }
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (e.pointerType === "touch") {
      // 터치 드래그는 스크롤에 양보 — 10px 넘게 움직이면 탭 취소만 한다.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) d.moved = true;
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-i]");
    if (hit instanceof HTMLElement) {
      const j = Number(hit.dataset.i);
      if (Number.isInteger(j) && j >= 0 && j < allTokens.length) d.lastIdx = j;
    }
    const snapped = snapTokens(d.anchorIdx, d.lastIdx);
    if (!snapped) return;
    if (d.last && d.last.start === snapped.start && d.last.end === snapped.end) return;
    d.last = snapped;
    applyDragPreview(snapped.start, snapped.end);
  };

  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    clearDragPreview();
    dragRef.current = null;
    if (locked) return;
    if (d.moved && e.pointerType === "touch") return; // 터치 스크롤이었음
    if (!d.moved) {
      const tok = allTokens[d.anchorIdx];
      if (!tok) return;
      const last = lastTapRef.current;
      // 더블클릭(같은 문장 450ms 내 재클릭) = 문장 전체 선택.
      if (last && last.si === tok.sentenceIndex && e.timeStamp - last.t < 450) {
        lastTapRef.current = null;
        hideHint();
        const sent = tokenized.sentences[tok.sentenceIndex];
        if (sent) {
          // commit() 의 동일 구간 토글을 타지 않고 곧장 문장으로 확장 커밋한다.
          onSelect(
            {
              start: sent.start,
              end: sent.end,
              text: content.slice(sent.start, sent.end),
            },
            measureAnchor(sent.start, sent.end),
          );
        }
        return;
      }
      // 단일 클릭 = 그 단어만 선택 + 커서 옆에 더블클릭 안내.
      lastTapRef.current = { si: tok.sentenceIndex, t: e.timeStamp };
      const wasSelected =
        selection !== null &&
        selection.start === tok.start &&
        selection.end === tok.end;
      commit(tok.start, tok.end);
      if (wasSelected) hideHint(); // 같은 단어 재클릭(느린) = 해제 — 안내 불필요
      else showHint(e.clientX, e.clientY);
      return;
    }
    hideHint();
    if (d.last) commit(d.last.start, d.last.end);
  };

  const onStagePointerCancel = () => {
    clearDragPreview();
    dragRef.current = null;
  };

  // ── 렌더 파생: 세그먼트별 선택/하이라이트/범위 클래스 ──────────────────────
  const findHighlight = (start: number, end: number) =>
    highlights.find((h) => h.start < end && start < h.end);
  const inRange = (start: number, end: number) =>
    range !== null && range.start < end && start < range.end;
  const inSelection = (start: number, end: number) =>
    selection !== null && start >= selection.start && end <= selection.end;

  const lastSentence = tokenized.sentences[tokenized.sentences.length - 1];
  const trailingText = lastSentence ? content.slice(lastSentence.end) : content;

  return (
    <div
      className="wss-stage relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      onScroll={(e) => {
        hideHint();
        onScroll?.(e);
      }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerCancel}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div
        ref={wrapRef}
        style={{ fontSize, lineHeight: 1.625 }}
        className={cn(
          "relative select-none whitespace-pre-wrap break-words py-2 pl-3 pr-16 text-slate-800",
          locked && "text-slate-500",
        )}
      >
        {tokenized.sentences.map((sent, si) => {
          const between =
            si === 0
              ? content.slice(0, sent.start)
              : content.slice(tokenized.sentences[si - 1].end, sent.start);
          return (
            <Fragment key={sent.start}>
              {between ? <span className="wss-between">{between}</span> : null}
              <span className="wss-sent">
                <sup className="wss-sup" aria-hidden="true">
                  {si + 1}
                </sup>
                {sent.segments.map((seg) => {
                  const hl = findHighlight(seg.start, seg.end);
                  const rangeOn = !hl && inRange(seg.start, seg.end);
                  const sel = inSelection(seg.start, seg.end);
                  const cls = cn(
                    seg.kind === "word" && "wss-tok",
                    seg.kind === "gap" && "wss-gap",
                    sel && "wss-sel",
                    sel && selection !== null && seg.start === selection.start && "wss-sel-a",
                    sel && selection !== null && seg.end === selection.end && "wss-sel-b",
                    !sel && hl?.kind === "paraphrase" && "wss-hl-para",
                    !sel && hl?.kind === "prepend" && "wss-hl-prep",
                    !sel && rangeOn && "wss-hl-range",
                  );
                  const dataI =
                    seg.kind === "word"
                      ? sentenceTokenBase[si] + seg.wordIndex
                      : undefined;
                  // 하이라이트/범위 구간은 mark 로 렌더 — 부모의 기존 히트테스트
                  // (mark[data-hl-kind] 원문 툴팁·삭제/해제 메뉴)가 그대로 동작한다.
                  if (hl || rangeOn) {
                    const kind = hl ? hl.kind : "range";
                    const hlStart = hl ? hl.start : range!.start;
                    const hlEnd = hl ? hl.end : range!.end;
                    return (
                      <mark
                        key={seg.start}
                        ref={registerSeg(seg.start)}
                        className={cls}
                        data-i={dataI}
                        data-hl-kind={kind}
                        data-hl-start={Math.max(0, hlStart)}
                        data-hl-end={Math.min(hlEnd, content.length)}
                        data-hl-original={
                          hl?.kind === "paraphrase" ? hl.original : undefined
                        }
                      >
                        {seg.text}
                      </mark>
                    );
                  }
                  return (
                    <span
                      key={seg.start}
                      ref={registerSeg(seg.start)}
                      className={cls}
                      data-i={dataI}
                    >
                      {seg.text}
                    </span>
                  );
                })}
              </span>
            </Fragment>
          );
        })}
        {trailingText ? <span className="wss-between">{trailingText}</span> : null}
        {selectionPopover}
      </div>

      {/* "더블클릭 = 문장 선택" 안내 칩 — showHint/hideHint 가 DOM 으로만 이동 */}
      <div ref={hintRef} aria-hidden="true" style={{ display: "none" }} className="wss-hint">
        더블클릭하면 문장 전체가 선택돼요
      </div>

      {/* wss- 접두 전용 스타일 — 포인트 픽커(ppk-)와 동일한 시각 문법, 전역 무수정 */}
      <style jsx global>{`
        .wss-stage {
          -webkit-tap-highlight-color: transparent;
        }
        .wss-sup {
          margin-right: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #cbd5e1;
          vertical-align: super;
          user-select: none;
          transition: color 0.12s ease;
        }
        .wss-sent:hover > .wss-sup {
          color: #60a5fa;
        }
        .wss-between {
          color: #94a3b8;
        }
        .wss-tok {
          display: inline-block;
          padding: 0 1px;
          margin: 0 -1px;
          border-radius: 2px;
          cursor: pointer;
          transition: background-color 0.12s ease;
        }
        .wss-tok:not(.wss-sel):not(.wss-drag):hover {
          background-color: #dbeafe;
          border-radius: 6px;
        }
        /* 선택 pill — 픽커의 커밋 선택과 동일 문법 (연속 배경 + 하단 스트로크) */
        .wss-sel {
          background-color: #bfdbfe;
          box-shadow: inset 0 -2px 0 0 #3b82f6;
          border-radius: 0;
        }
        .wss-sel-a {
          border-top-left-radius: 6px;
          border-bottom-left-radius: 6px;
        }
        .wss-sel-b {
          border-top-right-radius: 6px;
          border-bottom-right-radius: 6px;
        }
        /* 드래그 프리뷰 pill */
        .wss-drag {
          background-color: rgba(191, 219, 254, 0.55);
          box-shadow: inset 0 -2px 0 0 #93c5fd;
          border-radius: 0;
        }
        .wss-drag-a {
          border-top-left-radius: 6px;
          border-bottom-left-radius: 6px;
        }
        .wss-drag-b {
          border-top-right-radius: 6px;
          border-bottom-right-radius: 6px;
        }
        /* 범위 내 공백도 토큰과 같은 박스로 — 배경·스트로크 연속 */
        .wss-gap.wss-sel,
        .wss-gap.wss-drag {
          display: inline-block;
        }
        /* AI 하이라이트·출제 범위 — 기존 백드롭과 같은 색 문법 */
        mark.wss-hl-para,
        mark.wss-hl-prep,
        mark.wss-hl-range {
          color: inherit;
          border-radius: 2px;
          cursor: default;
        }
        mark.wss-hl-para {
          background-color: rgba(254, 215, 170, 0.8);
        }
        mark.wss-hl-prep {
          background-color: #dbeafe;
        }
        mark.wss-hl-range {
          background-color: #fef3c7;
        }
        /* 단어 선택 직후 커서 옆 안내 칩 */
        .wss-hint {
          position: fixed;
          z-index: 60;
          padding: 4px 9px;
          border-radius: 7px;
          background: #0f172a;
          color: #f8fafc;
          font-size: 10.5px;
          font-weight: 600;
          line-height: 1.4;
          white-space: nowrap;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.22);
          pointer-events: none;
        }
        @media (prefers-reduced-motion: no-preference) {
          .wss-hint {
            animation: wssHintIn 0.18s ease-out;
          }
        }
        @keyframes wssHintIn {
          from {
            opacity: 0;
            transform: translateY(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
