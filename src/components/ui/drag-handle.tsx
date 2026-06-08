"use client";

import { forwardRef, type RefObject } from "react";
import { GripVertical } from "lucide-react";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { cn } from "@/lib/utils";

/**
 * 손잡이(작은 그립)에 draggable 을 등록하면 기본 드래그 미리보기가 "그립 아이콘"이
 * 되어 보기 안 좋다. 이 헬퍼는 드래그 시작 시 카드 루트(`sourceRef`)를 복제해 카드
 * 모양 그대로의 미리보기를 띄운다. pragmatic-dnd `draggable({ onGenerateDragPreview })`
 * 에 그대로 넘겨 쓴다.
 */
export function makeCardDragPreview(sourceRef: RefObject<HTMLElement | null>) {
  return ({
    nativeSetDragImage,
  }: {
    nativeSetDragImage: ((image: Element, x: number, y: number) => void) | null;
  }) => {
    setCustomNativeDragPreview({
      nativeSetDragImage,
      getOffset: () => ({ x: 16, y: 16 }),
      render: ({ container }) => {
        const src = sourceRef.current;
        if (!src) return;
        const rect = src.getBoundingClientRect();
        const clone = src.cloneNode(true) as HTMLElement;
        clone.style.width = `${rect.width}px`;
        clone.style.margin = "0";
        clone.style.opacity = "1";
        clone.style.transform = "none";
        clone.style.background = "white";
        clone.style.boxShadow = "0 8px 24px rgba(0,0,0,0.16)";
        container.appendChild(clone);
      },
    });
  };
}

/**
 * DragHandle — 카드를 폴더 등으로 끌어 정리할 때 잡는 손잡이.
 *
 * 영역 선택(마키)과 폴더 드래그를 깔끔히 분리하기 위해, 네이티브 드래그는 이 손잡이
 * 엘리먼트에만 등록한다(카드 본문은 draggable 이 아니므로 본문 위에서는 영역 선택이
 * 동작한다). 카드 컴포넌트에서 `ref` 를 받아 `draggable({ element: handleRef.current })`
 * 로 등록하면 된다.
 *
 * 카드 루트는 `relative` 여야 하며, 보통 우상단 모서리에 절대 배치한다.
 */
export const DragHandle = forwardRef<
  HTMLDivElement,
  { className?: string; title?: string }
>(function DragHandle({ className, title = "드래그하여 폴더로 이동" }, ref) {
  return (
    <div
      ref={ref}
      data-drag-select-ignore
      title={title}
      aria-label="드래그 핸들"
      // pointer 이벤트를 받아야 드래그 시작 가능. 카드 클릭(선택)과 충돌하지 않도록
      // mousedown 전파를 막는다(마키/카드 onClick 모두로 번지지 않게).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex cursor-grab items-center justify-center rounded text-slate-300 opacity-50 transition-all hover:bg-slate-100 hover:text-slate-500 hover:opacity-100 active:cursor-grabbing group-hover:opacity-90",
        className,
      )}
    >
      <GripVertical className="h-4 w-4" />
    </div>
  );
});
