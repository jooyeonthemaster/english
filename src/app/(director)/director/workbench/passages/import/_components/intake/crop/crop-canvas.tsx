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
import { Trash2 } from "lucide-react";

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
  | {
      mode: "move";
      index: number;
      grabX: number;
      grabY: number;
      start: CropBox;
    }
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
  touchDraw = false,
  showDeleteButton = false,
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
  /**
   * 터치 드래그로 영역을 그리는 모드(<lg 전용). true면 드래그 표면에
   * touch-action:none 을 걸어 브라우저가 손가락 드래그를 스크롤로 가로채지
   * 못하게 한다(그래야 크롭이 그려진다). false면 touch-action 기본값이라
   * 손가락 드래그가 페이지 스크롤로 동작한다. 마우스(PC)에는 무관.
   */
  touchDraw?: boolean;
  /**
   * 활성 영역 우상단에 삭제(휴지통) 버튼을 노출한다. 키보드가 없는 터치/모바일에서
   * 영역을 지우는 유일한 수단 — 그 자리의 'ne' 리사이즈 핸들은 삭제 버튼으로 대체된다.
   * 마우스(PC)에는 false로 둬 기존 8핸들 + 키보드 Delete 동작을 유지한다.
   */
  showDeleteButton?: boolean;
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
  // rAF 스로틀 중 유입되는 포인터 좌표는 이 ref에만 갱신하고, 프레임에서
  // 최신값을 읽는다 — 프레임을 예약한 첫 이벤트의 (오래된) 좌표를 쓰면
  // 손가락을 따라오지 못해 드래그가 끊겨 보인다(특히 터치).
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // 인스턴스마다 고유 mask id — 같은 id를 여러 CropCanvas가 쓰면 url(#id)가
  // 문서 첫 mask(=첫 이미지 박스)로 해석돼 첫 페이지 크롭이 다음 페이지 스크림에
  // 비치는 버그가 난다. useId로 캔버스마다 분리한다.
  const maskId = useId();

  const readRect = useCallback(() => {
    return wrapperRef.current?.getBoundingClientRect() ?? null;
  }, []);

  // 포인터 이동/해제는 window 레벨에서 처리(박스 밖으로 나가도 추적).
  // 주의: 드래그 중 매 프레임 onChange(boxes) 디스패치는 유지한다 — 부모
  // 보드의 검수 카드 미리보기(cropBgStyle)가 드래그 중 실시간으로 따라
  // 그려지는 것이 현재 동작이라, 커밋을 pointerup 으로 미루면 회귀다.
  const beginDrag = useCallback(
    (mode: DragState, event: React.PointerEvent) => {
      if (disabled) return;
      const rect = readRect();
      if (!rect) return;
      dragRef.current = mode;

      // 포인터 캡처 — 커서/손가락이 캔버스를 벗어나도 드래그가 끊기지 않는다.
      // 좌표 계산은 window 리스너 + clientX/Y 그대로라 동작 불변.
      const captureEl = event.currentTarget as HTMLElement | null;
      const pointerId = event.pointerId;
      try {
        captureEl?.setPointerCapture(pointerId);
      } catch {
        // 캡처 미지원 브라우저는 window 리스너로 폴백
      }

      // body 스타일은 저장·복원 방식으로 — 드래그 중 hover 재평가를 차단하고
      // (pointerEvents), 커서는 드래그 모드에 맞게 고정한다. 이 캔버스는
      // elementFromPoint 히트테스트를 쓰지 않아 pointerEvents:'none' 이 안전.
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;

      const handleMove = (ev: PointerEvent) => {
        lastPointRef.current = { x: ev.clientX, y: ev.clientY };
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const r = readRect();
          const drag = dragRef.current;
          const pt = lastPointRef.current;
          if (!r || !drag || !pt) return;
          const { x: nx, y: ny } = toNormalized(pt.x, pt.y, r);

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
        window.removeEventListener("pointercancel", handleUp);
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
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          captureEl?.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      // 터치 제스처가 OS 에 의해 취소돼도(pointercancel) 리스너·body 스타일이
      // 새지 않게 동일 핸들러로 정리한다.
      window.addEventListener("pointercancel", handleUp);
      document.body.style.userSelect = "none";
      // 드래그 중 커서를 모드에 맞게 고정 + hover 스타일 재평가 차단.
      document.body.style.cursor =
        mode.mode === "move"
          ? "move"
          : mode.mode === "resize"
            ? HANDLE_CURSOR[mode.handle]
            : "crosshair";
      document.body.style.pointerEvents = "none";
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
      beginDrag(
        {
          mode: "draw",
          originX: x,
          originY: y,
          joinWithActiveGroup: e.shiftKey,
        },
        e,
      );
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
      beginDrag(
        {
          mode: "move",
          index,
          grabX: x,
          grabY: y,
          start: boxes[index],
        },
        e,
      );
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
      beginDrag({ mode: "resize", index, handle }, e);
    },
    [beginDrag, disabled, onActiveIndexChange],
  );

  // 영역 삭제 — 키보드 Delete와 터치 삭제 버튼이 공유한다. 삭제 후 활성 지문을
  // 하나 앞으로 옮긴다(없으면 해제).
  const deleteBox = useCallback(
    (index: number) => {
      if (disabled) return;
      const arr = boxes.filter((_, i) => i !== index);
      onChange(arr);
      onActiveIndexChange(arr.length > 0 ? Math.max(0, index - 1) : null);
    },
    [boxes, disabled, onChange, onActiveIndexChange],
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
          deleteBox(activeIndex);
          break;
        }
        default:
          break;
      }
    },
    [activeIndex, boxes, disabled, deleteBox, onChange],
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
        data-generate-tour="file-crop-page"
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
            (touchDraw ? "touch-none " : "") +
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
                (touchDraw ? "touch-none " : "") +
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

              {/* 8핸들 (활성일 때만) — ne 코너 포함 전부 유지. 삭제 버튼은
                  코너에서 안쪽으로 들여 겹치지 않게 한다. */}
              {active && !disabled
                ? RESIZE_HANDLES.map((h) => (
                    <span
                      key={h}
                      onPointerDown={(e) =>
                        handleHandlePointerDown(e, index, h)
                      }
                      style={{
                        left: HANDLE_POS[h].left,
                        top: HANDLE_POS[h].top,
                        cursor: HANDLE_CURSOR[h],
                      }}
                      className={
                        "absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-white bg-blue-600 shadow-sm " +
                        // 터치 그리기 모드에선 핸들도 더 크게(터치 타깃 확보).
                        (touchDraw ? "touch-none max-lg:!size-4 " : "")
                      }
                      aria-hidden="true"
                    />
                  ))
                : null}

              {/* 삭제 버튼 — 활성 영역 우상단(터치/모바일). 키보드 없는 환경에서
                  영역을 지우는 수단. 코너의 ne 리사이즈 핸들과 겹치지 않게 안쪽
                  (중앙쪽)으로 들여 배치한다. 박스 이동(부모 pointerdown)으로
                  번지지 않게 pointerdown을 여기서 멈춘다. */}
              {showDeleteButton && active && !disabled ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBox(index);
                  }}
                  title="이 영역 삭제"
                  aria-label={`크롭 영역 ${index + 1} 삭제`}
                  className="absolute right-3 top-3 z-20 inline-flex size-7 cursor-pointer touch-none items-center justify-center rounded-md border border-white bg-red-600 text-white shadow-md transition-colors hover:bg-red-700"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
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
