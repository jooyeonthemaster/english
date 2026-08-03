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
import type { AnnotationType } from "./annotation-marks";
import { formatRemoved, ghostRemoved, type EditSpan } from "@/lib/passage-edit-diff";

// ============================================================================
// 지문 마킹 무대 — 문제 생성의 WorkspaceSelectStage(포인트 짚어주기 제스처)를
// 학습지 마킹(어휘·어법·읽기·문장·출제)으로 이식한 읽기 전용 표면. 거의 그대로
// 복사하되 하이라이트를 '5종 주석'으로, 하이라이트 클릭을 '주석 편집'으로 바꿨다.
// - 단어 hover 틴트(CSS 전용) · 클릭 = 단어 선택 · 더블클릭 = 문장 선택 ·
//   드래그 = 단어 경계 스냅 구간(문장 경계를 넘는 멀티 문장 드래그 허용).
// - 이미 마킹된 단어를 클릭하면 그 주석의 편집 팝오버를 연다.
// - 드래그 프리뷰는 재렌더 없이 classList 로만 칠한다(픽커의 60fps 규율 그대로).
// - 본문 타이핑은 부모의 '직접 편집' 모드(textarea)가 담당한다.
// ============================================================================

export interface StageSelection {
  start: number;
  end: number;
  text: string;
}

/** 팝오버 배치용 — 스크롤 콘텐츠(패딩 박스) 기준 px 좌표. */
export interface StageAnchor {
  x: number;
  topY: number;
  bottomY: number;
  contentW: number;
  contentH: number;
}

/** 스테이지에 넘기는 주석의 최소 형태 — content 기준 문자 오프셋 [from, to). */
export interface StageAnnotation {
  id: string;
  type: AnnotationType;
  from: number;
  to: number;
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

interface PassageMarkStageProps {
  content: string;
  annotations: StageAnnotation[];
  /** 미리보기/생성 중 — 제스처만 차단. */
  locked: boolean;
  /** 본문 폰트 크기 — "13px" | "10px"(모바일). */
  fontSize: string;
  selection: StageSelection | null;
  /**
   * 선택 커밋/해제. 문장 클릭·드래그 스냅 결과를 anchor(콘텐츠 좌표)와 함께
   * 올린다. 빈 곳 클릭·동일 선택 재클릭은 (null, null) — 부모가 해제한다.
   */
  onSelect: (sel: StageSelection | null, anchor: StageAnchor | null) => void;
  /** 이미 마킹된 단어 클릭 — 그 주석 편집 팝오버를 부모가 anchor 로 배치한다. */
  onAnnotationClick: (id: string, anchor: StageAnchor | null) => void;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  /** 선택/편집 팝오버 — 부모가 anchor 로 배치한 절대요소. 본문과 함께 스크롤된다. */
  popover?: ReactNode;
  /**
   * 본문 위쪽 여백(px) — 우상단 컨트롤(직접 편집·되돌리기)이 첫 줄을 가리지 않게
   * 비운다. '직접 편집' textarea 는 float 를 흉내 낼 수 없으므로 두 표면이 같은
   * 방식(위 패딩)으로 자리를 비워야 모드 전환 시 줄바꿈 모양이 유지된다.
   */
  topPad?: number;
  /** 직전 '직접 편집'으로 바뀐 자리 — 형광펜(change)·빨간 마커(delete). */
  editSpans?: EditSpan[];
}

export function PassageMarkStage({
  content,
  annotations,
  locked,
  fontSize,
  selection,
  onSelect,
  onAnnotationClick,
  onMouseMove,
  onMouseLeave,
  onScroll,
  popover,
  topPad,
  editSpans,
}: PassageMarkStageProps) {
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
    for (const el of d.els) el.classList.remove("pms-drag", "pms-drag-a", "pms-drag-b");
    d.els = [];
  };

  const applyDragPreview = (start: number, end: number) => {
    const d = dragRef.current;
    if (!d) return;
    clearDragPreview();
    const els = coveredSegEls(start, end);
    els.forEach((el, i) => {
      el.classList.add("pms-drag");
      if (i === 0) el.classList.add("pms-drag-a");
      if (i === els.length - 1) el.classList.add("pms-drag-b");
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

  // 문자 오프셋을 덮는 주석(문서 순 첫 번째). 클릭 편집·렌더 공용.
  const annotationAt = (start: number, end: number) =>
    annotations.find((a) => a.from < end && start < a.to);

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

  // ── 포인터 제스처 (마우스/펜 드래그 · 터치는 탭 = 선택) ────────────────────
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    // 팝오버 위 클릭은 무대 제스처가 아니다 — 여기서 선택을 지우면 버튼 click 이
    // 발화되기 전에 selection 이 사라져 액션이 무시된다.
    if (t.closest("[data-pms-pop]")) return;
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
      // 이미 마킹된 단어 클릭 = 그 주석 편집 (드래그로 재선택하려면 드래그해야 함).
      const ann = annotationAt(tok.start, tok.end);
      if (ann) {
        lastTapRef.current = null;
        hideHint();
        onAnnotationClick(ann.id, measureAnchor(ann.from, ann.to));
        return;
      }
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

  // ── 렌더 파생: 세그먼트별 선택/주석/편집 클래스 ───────────────────────────
  const inSelection = (start: number, end: number) =>
    selection !== null && start >= selection.start && end <= selection.end;

  // 편집 diff — 변경 구간은 겹치는 세그먼트를 형광펜으로, 삭제는 사라진 자리를
  // 품은 세그먼트(대개 공백) 왼쪽 모서리에 빨간 마커로.
  const changedAt = (start: number, end: number) =>
    editSpans?.some((s) => s.kind === "change" && s.from < end && start < s.to) ??
    false;
  // 삭제 지점을 조각 단위로 나눠 갖는다 — [start, end) 반열린 구간이라 여백·
  // 세그먼트·본문 끝이 서로 겹치지 않는다(같은 유령이 두 번 그려지지 않게).
  const deleteSpansAt = (start: number, end: number) =>
    editSpans?.filter(
      (s) => s.kind === "delete" && s.from >= start && s.from < end,
    ) ?? [];
  /**
   * 지운 자리에 되살릴 유령 텍스트 — 이 조각 '앞'에 렌더한다. 사라진 문장을
   * 빨간 취소선으로 그 자리에 다시 그려야 "어디를 지웠는지"가 보인다.
   */
  const deleteGhost = (start: number, end: number): ReactNode => {
    const hits = deleteSpansAt(start, end);
    if (hits.length === 0) return null;
    const text = hits.map((s) => ghostRemoved(s.removed)).filter(Boolean).join(" ");
    if (!text) return <span className="pms-diff-del" aria-hidden="true" />;
    return (
      <span className="pms-del-ghost" title="여기서 지운 내용이에요 (본문에는 없어요)">
        {text}
      </span>
    );
  };
  /** 문장 안에서 지워진 내용 — 문장 전체를 옅게 표시하고 툴팁으로 알려준다. */
  const removedInSentence = (start: number, end: number) =>
    editSpans
      ?.filter((s) => s.kind === "delete" && s.from >= start && s.from <= end)
      .map((s) => formatRemoved(s.removed))
      .filter(Boolean)
      .join(" / ") || undefined;

  const lastSentence = tokenized.sentences[tokenized.sentences.length - 1];
  const trailingStart = lastSentence ? lastSentence.end : 0;
  const trailingText = content.slice(trailingStart);

  /** 문장 사이/끝 여백 — 토큰이 아니라 편집 표시만 얹는다. */
  const gapCls = (start: number, end: number) =>
    cn("pms-between", changedAt(start, end) && "pms-diff");

  return (
    <div
      className="pms-stage relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
        style={{ fontSize, lineHeight: 1.625, paddingTop: topPad }}
        className={cn(
          "relative select-none whitespace-pre-wrap break-words py-2 pl-3 pr-16 text-slate-800",
          locked && "text-slate-500",
        )}
      >
        {tokenized.sentences.map((sent, si) => {
          const betweenStart = si === 0 ? 0 : tokenized.sentences[si - 1].end;
          const between = content.slice(betweenStart, sent.start);
          const sentRemoved = removedInSentence(sent.start, sent.end);
          return (
            <Fragment key={sent.start}>
              {deleteGhost(betweenStart, sent.start)}
              {between ? (
                <span className={gapCls(betweenStart, sent.start)}>{between}</span>
              ) : null}
              <span
                className={cn(
                  "pms-sent",
                  sentRemoved && "pms-sent-del",
                )}
                title={sentRemoved ? `지운 내용: ${sentRemoved}` : undefined}
              >
                <sup className="pms-sup" aria-hidden="true">
                  {si + 1}
                </sup>
                {sent.segments.map((seg) => {
                  const ann = annotationAt(seg.start, seg.end);
                  const sel = inSelection(seg.start, seg.end);
                  const cls = cn(
                    seg.kind === "word" && "pms-tok",
                    seg.kind === "gap" && "pms-gap",
                    sel && "pms-sel",
                    sel && selection !== null && seg.start === selection.start && "pms-sel-a",
                    sel && selection !== null && seg.end === selection.end && "pms-sel-b",
                    !sel && ann && `pms-ann pms-ann-${ann.type}`,
                    !sel && !ann && changedAt(seg.start, seg.end) && "pms-diff",
                  );
                  const ghost = deleteGhost(seg.start, seg.end);
                  const dataI =
                    seg.kind === "word"
                      ? sentenceTokenBase[si] + seg.wordIndex
                      : undefined;
                  // 마킹된 구간은 mark 로 렌더 — 클릭 히트테스트(주석 편집)가 그대로
                  // 동작한다. 선택 프리뷰가 있으면 선택이 시각적으로 우선한다.
                  if (ann && !sel) {
                    return (
                      <Fragment key={seg.start}>
                        {ghost}
                        <mark
                          ref={registerSeg(seg.start)}
                          className={cls}
                          data-i={dataI}
                          data-ann-id={ann.id}
                        >
                          {seg.text}
                        </mark>
                      </Fragment>
                    );
                  }
                  return (
                    <Fragment key={seg.start}>
                      {ghost}
                      <span
                        ref={registerSeg(seg.start)}
                        className={cls}
                        data-i={dataI}
                      >
                        {seg.text}
                      </span>
                    </Fragment>
                  );
                })}
              </span>
            </Fragment>
          );
        })}
        {deleteGhost(trailingStart, content.length)}
        {trailingText ? (
          <span className={gapCls(trailingStart, content.length)}>{trailingText}</span>
        ) : null}
        {/* 본문 맨 끝에서 지운 경우 — 뒤에 남은 조각이 없으므로 여기서 받는다. */}
        {deleteGhost(content.length, content.length + 1)}
        {popover}
      </div>

      {/* "더블클릭 = 문장 선택" 안내 칩 — showHint/hideHint 가 DOM 으로만 이동 */}
      <div ref={hintRef} aria-hidden="true" style={{ display: "none" }} className="pms-hint">
        더블클릭 = 문장 전체 · 그냥 타이핑하면 바로 수정돼요
      </div>
    </div>
  );
}
