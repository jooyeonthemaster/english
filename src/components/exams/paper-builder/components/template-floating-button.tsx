import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateFloatingButtonProps {
  hostRef: React.RefObject<HTMLDivElement | null>;
  offset: { x: number; y: number };
  panelOpen: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  panel: React.ReactNode;
}

export function TemplateFloatingButton({
  hostRef,
  offset,
  panelOpen,
  onPointerDown,
  onClick,
  panel,
}: TemplateFloatingButtonProps) {
  return (
    <div
      ref={hostRef}
      className="no-print fixed bottom-[152px] right-8 z-50 flex touch-none select-none flex-col-reverse items-end gap-3"
      style={{
        backfaceVisibility: "hidden",
        contain: "layout style",
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        willChange: "transform",
      }}
    >
      <button
        id="exam-template-floating-button"
        type="button"
        aria-pressed={panelOpen}
        onPointerDown={onPointerDown}
        onClick={onClick}
        className={cn(
          "inline-flex h-11 cursor-grab touch-none select-none items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg transition-colors duration-150 active:cursor-grabbing",
          panelOpen
            ? "border-blue-300 bg-blue-600 text-white shadow-blue-500/20"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
        )}
      >
        <LayoutTemplate className="h-4 w-4" />
        시험지 편집
      </button>

      {panelOpen && (
        <div
          id="exam-template-floating-panel"
          className="w-[340px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/15"
          style={{
            maxHeight: "min(560px, calc(100dvh - 232px))",
          }}
        >
          {panel}
        </div>
      )}
    </div>
  );
}
