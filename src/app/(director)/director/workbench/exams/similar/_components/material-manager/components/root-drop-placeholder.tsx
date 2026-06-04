"use client";

import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

const DRAG_TYPE = "draft" as const;
const BULK_DRAG_TYPE = "draft-bulk" as const;

interface RootDropPlaceholderProps {
  onDrop: (itemId: string | string[], copy: boolean) => void;
}

export function RootDropPlaceholder({ onDrop }: RootDropPlaceholderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) =>
        source.data.type === DRAG_TYPE || source.data.type === BULK_DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId =
          source.data.type === BULK_DRAG_TYPE
            ? (source.data.draftIds as string[])
            : (source.data.draftId as string);
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onDrop(itemId, isCopy);
      },
    });
  }, [onDrop]);

  return (
    <div
      ref={ref}
      className={
        "flex min-h-0 flex-1 items-center justify-center px-4 transition-colors " +
        (isDragOver
          ? "bg-blue-50/60 ring-2 ring-inset ring-blue-300"
          : "bg-slate-50/40")
      }
    >
      <p
        className={
          "text-[13px] transition-colors " +
          (isDragOver ? "font-semibold text-blue-600" : "text-slate-400")
        }
      >
        {isDragOver ? "여기에 놓기" : "파일을 선택해 주세요"}
      </p>
    </div>
  );
}
