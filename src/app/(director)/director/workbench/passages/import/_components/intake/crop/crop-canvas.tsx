"use client";

// ============================================================================
// CropCanvas — direct-manipulation image crop tool (adaptive-intake G2).
//   • 빈 영역 드래그 = 새 영역 그리기
//   • Shift+빈 영역 드래그 = 활성 지문 그룹에 새 영역 이어붙이기
//   • 영역 내부 드래그 = 이동
//   • 8핸들 드래그 = 리사이즈
//   • 키보드: 화살표 이동(±1%) / Shift+화살표(±5%) / Alt+화살표 리사이즈 / Del 삭제
//   • 좌표계는 항상 정규화 0~1 (해상도/렌더스케일 독립)
// 톤: slate-700 라인 + blue-600 액티브. 주황/Sparkles 금지.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { CropBox } from "@/lib/extraction/types";
import {
  type ResizeHandle,
  RESIZE_HANDLES,
  clampCropBox,
  cropBoxToStyle,
  moveCropBox,
  rectFromPoints,
  resizeCropBox,
  toNormalized,
} from "./crop-utils";

const DRAW_THRESHOLD = 0.01; // 이만큼 끌어야 새 영역 확정 (단순 클릭 무시)
const NUDGE_SMALL = 0.01;
const NUDGE_LARGE = 0.05;

type DragState =
  | {
      mode: "draw";
      originX: number;
      originY: number;
      joinWithActiveGroup: boolean;
    }
  | { mode: "move"; index: number; grabX: number; grabY: number; start: CropBox }
  | { mode: "resize"; index: number; handle: ResizeHandle };

export interface CropCanvasChangeMeta {
  action: "create";
  joinWithActiveGroup: boolean;
}

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

// 핸들의 박스 내 위치(%)
const HANDLE_POS: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

export function CropCanvas({
  imageUrl,
  boxes,
  onChange,
  activeIndex,
  onActiveIndexChange,
  disabled = false,
  regionLabels,
  fit = "contain",
}: {
  imageUrl: string;
  boxes: CropBox[];
  onChange: (next: CropBox[], meta?: CropCanvasChangeMeta) => void;
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
  disabled?: boolean;
  /** 영역 배지에 표시할 라벨(없으면 1-based 순번). 지문 그룹 번호 표시용. */
  regionLabels?: string[];
  /**
   * 이미지 맞춤 방식.
   * - "contain"(기본·모달): 부모 높이에 맞춰 중앙 정렬, 최대 68vh. 좌우 여백 생김.
   * - "width"(인라인 보드): 컬럼 폭을 꽉 채우고 높이는 비율대로. 페이지가 크게 보임.
   */
  fit?: "contain" | "width";
}) {
  const isWidthFit = fit === "width";
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 드로잉 중 임시 박스(아직 boxes에 커밋 안 됨). 그리는 동안엔 부모 onChange를
  // 호출하지 않고 이 컴포넌트 안에서만 미리보기로 렌더한다 → 보드 전체 리렌더·
  // "지문 N" 카운트 깜빡임(release 전) 방지. 커밋은 pointerup 1회.
  const draftRef = useRef<CropBox | null>(null);
  const [draft, setDraft] = useState<CropBox | null>(null);
  const rafRef = useRef(0);

  // 인스턴스마다 고유 mask id — 같은 id를 여러 CropCanvas가 쓰면 url(#id)가
  // 문서 첫 mask(=첫 이미지 박스)로 해석돼 첫 페이지 크롭이 다음 페이지 스크림에
  // 비치는 버그가 난다. useId로 캔버스마다 분리한다.
  const maskId = useId();

  const readRect = useCallback(() => {
    return wrapperRef.current?.getBoundingClientRect() ?? null;
  }, []);

  // 포인터 이동/해제는 window 레벨에서 처리(박스 밖으로 나가도 추적).
  const beginDrag = useCallback(
    (mode: DragState) => {
      if (disabled) return;
      const rect = readRect();
      if (!rect) return;
      dragRef.current = mode;

      const handleMove = (ev: PointerEvent) => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const r = readRect();
          const drag = dragRef.current;
          if (!r || !drag) return;
          const { x: nx, y: ny } = toNormalized(ev.clientX, ev.clientY, r);

          if (drag.mode === "draw") {
            // 미리보기는 로컬 draft로만(onChange 미호출). boxes/groups·카운트 불변.
            const next = rectFromPoints(drag.originX, drag.originY, nx, ny);
            draftRef.current = next;
            setDraft(clampCropBox(next, 0));
          } else if (drag.mode === "move") {
            const dx = nx - drag.grabX;
            const dy = ny - drag.grabY;
            const next = boxes.slice();
            next[drag.index] = moveCropBox(drag.start, dx, dy);
            onChange(next);
          } else if (drag.mode === "resize") {
            const next = boxes.slice();
            const cur = next[drag.index];
            if (cur) next[drag.index] = resizeCropBox(cur, drag.handle, nx, ny);
            onChange(next);
          }
        });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        const drag = dragRef.current;
        if (drag?.mode === "draw") {
          const d = draftRef.current;
          draftRef.current = null;
          setDraft(null);
          // 충분히 큰 영역만 커밋(작으면 단순 클릭 → 아무것도 추가 안 함).
          if (d && d.w >= DRAW_THRESHOLD && d.h >= DRAW_THRESHOLD) {
            const committed = [...boxes, clampCropBox(d)];
            onChange(committed, {
              action: "create",
              joinWithActiveGroup: drag.joinWithActiveGroup,
            });
            onActiveIndexChange(committed.length - 1);
          }
        }
        dragRef.current = null;
        document.body.style.userSelect = "";
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      document.body.style.userSelect = "none";
    },
    [boxes, disabled, onActiveIndexChange, onChange, readRect],
  );

  // 캔버스 빈 곳 pointerdown → 새 영역 그리기
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      const rect = readRect();
      if (!rect) return;
      e.preventDefault();
      const { x, y } = toNormalized(e.clientX, e.clientY, rect);
      if (!e.shiftKey) onActiveIndexChange(null);
      beginDrag({
        mode: "draw",
        originX: x,
        originY: y,
        joinWithActiveGroup: e.shiftKey,
      });
    },
    [beginDrag, disabled, onActiveIndexChange, readRect],
  );

  // 박스 본문 pointerdown → 이동
  const handleBoxPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = readRect();
      if (!rect) return;
      const { x, y } = toNormalized(e.clientX, e.clientY, rect);
      onActiveIndexChange(index);
      beginDrag({ mode: "move", index, grabX: x, grabY: y, start: boxes[index] });
    },
    [beginDrag, boxes, disabled, onActiveIndexChange, readRect],
  );

  // 핸들 pointerdown → 리사이즈
  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent, index: number, handle: ResizeHandle) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onActiveIndexChange(index);
      beginDrag({ mode: "resize", index, handle });
    },
    [beginDrag, disabled, onActiveIndexChange],
  );

  // 키보드: 활성 박스 이동/리사이즈/삭제
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || activeIndex === null) return;
      const box = boxes[activeIndex];
      if (!box) return;
      const step = e.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
      const apply = (next: CropBox) => {
        const arr = boxes.slice();
        arr[activeIndex] = next;
        onChange(arr);
      };
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          apply(
            e.altKey
              ? resizeCropBox(box, "e", box.x + box.w - step, box.y + box.h)
              : moveCropBox(box, -step, 0),
          );
          break;
        case "ArrowRight":
          e.preventDefault();
          apply(
            e.altKey
              ? resizeCropBox(box, "e", box.x + box.w + step, box.y + box.h)
              : moveCropBox(box, step, 0),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          apply(
            e.altKey
              ? resizeCropBox(box, "s", box.x + box.w, box.y + box.h - step)
              : moveCropBox(box, 0, -step),
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          apply(
            e.altKey
              ? resizeCropBox(box, "s", box.x + box.w, box.y + box.h + step)
              : moveCropBox(box, 0, step),
          );
          break;
        case "Delete":
        case "Backspace": {
          e.preventDefault();
          const arr = boxes.filter((_, i) => i !== activeIndex);
          onChange(arr);
          onActiveIndexChange(arr.length > 0 ? Math.max(0, activeIndex - 1) : null);
          break;
        }
        default:
          break;
      }
    },
    [activeIndex, boxes, disabled, onActiveIndexChange, onChange],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className={
        isWidthFit
          ? "relative w-full bg-slate-900/5"
          : "relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-900/5"
      }
      role="application"
      aria-label="이미지 크롭 영역 선택"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={wrapperRef}
        className={
          isWidthFit
            ? "relative block w-full leading-none select-none"
            : "relative inline-block leading-none select-none"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="크롭 대상 이미지"
          className={
            isWidthFit
              ? "block h-auto w-full object-contain"
              : "block max-h-[68vh] max-w-full w-auto object-contain"
          }
          draggable={false}
        />

        {/* 스크림 — 선택영역 밖을 옅게 (SVG mask로 다중 영역 구멍).
            영역이 하나도 없을 땐 이미지·커서가 잘 보이도록 덮지 않는다.
            그리는 중인 draft도 구멍으로 포함해 미리보기를 자연스럽게. */}
        {boxes.length > 0 || draft ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <mask id={maskId}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {boxes.map((b, i) => (
                  <rect
                    key={i}
                    x={`${b.x * 100}%`}
                    y={`${b.y * 100}%`}
                    width={`${b.w * 100}%`}
                    height={`${b.h * 100}%`}
                    fill="black"
                  />
                ))}
                {draft ? (
                  <rect
                    x={`${draft.x * 100}%`}
                    y={`${draft.y * 100}%`}
                    width={`${draft.w * 100}%`}
                    height={`${draft.h * 100}%`}
                    fill="black"
                  />
                ) : null}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(15, 23, 42, 0.42)"
              mask={`url(#${maskId})`}
            />
          </svg>
        ) : null}

        {/* 드로잉 캡처 레이어 (빈 곳 드래그) */}
        <div
          className={
            "absolute inset-0 " +
            (disabled ? "cursor-not-allowed" : "cursor-crosshair")
          }
          onPointerDown={handleCanvasPointerDown}
        />

        {/* 선택 영역들 */}
        {boxes.map((box, index) => {
          const active = index === activeIndex;
          return (
            <div
              key={index}
              role="button"
              tabIndex={active ? 0 : -1}
              aria-label={`크롭 영역 ${index + 1}`}
              onFocus={() => onActiveIndexChange(index)}
              onPointerDown={(e) => handleBoxPointerDown(e, index)}
              style={cropBoxToStyle(box)}
              className={
                "absolute box-border " +
                (disabled ? "cursor-default" : "cursor-move ") +
                (active
                  ? "border-2 border-blue-600 ring-1 ring-blue-300/60"
                  : "border border-blue-400/80 hover:border-blue-500")
              }
            >
              {/* 영역 배지 — 지문 그룹 라벨(없으면 순번) */}
              <span className="absolute -left-px -top-px rounded-br bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {regionLabels?.[index] ?? index + 1}
              </span>

              {/* 8핸들 (활성일 때만) */}
              {active && !disabled
                ? RESIZE_HANDLES.map((h) => (
                    <span
                      key={h}
                      onPointerDown={(e) => handleHandlePointerDown(e, index, h)}
                      style={{
                        left: HANDLE_POS[h].left,
                        top: HANDLE_POS[h].top,
                        cursor: HANDLE_CURSOR[h],
                      }}
                      className="absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-white bg-blue-600 shadow-sm"
                      aria-hidden="true"
                    />
                  ))
                : null}
            </div>
          );
        })}

        {/* 그리는 중인 draft 미리보기(아직 미커밋) — pointerup에 커밋된다. */}
        {draft ? (
          <div
            style={cropBoxToStyle(draft)}
            className="pointer-events-none absolute box-border border-2 border-dashed border-blue-500 bg-blue-400/5"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
