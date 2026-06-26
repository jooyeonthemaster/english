"use client";

import { FileImage, FileText, MousePointer2 } from "lucide-react";
import type { TargetRect, TourStep, VirtualCropSelectionState, VirtualDragGhostState, VirtualCursorState } from "./tour-types";

export function TargetRectOverlay({
  targetRect,
}: {
  targetRect: TargetRect | null;
}) {
  if (!targetRect) return null;
  return (
    <div
      className="absolute rounded-lg border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.08),0_0_0_7px_rgba(37,99,235,0.12)] transition-all duration-200"
      style={{
        left: targetRect.left - 5,
        top: targetRect.top - 5,
        width: targetRect.width + 10,
        height: targetRect.height + 10,
      }}
    />
  );
}

export function ActionGlowOverlay({
  visibleActionGlowRect,
}: {
  visibleActionGlowRect: TargetRect | null;
}) {
  if (!visibleActionGlowRect) return null;
  return (
    <div
      className="smoat-generate-tour-neon-frame absolute rounded-lg"
      style={{
        left: visibleActionGlowRect.left - 7,
        top: visibleActionGlowRect.top - 7,
        width: visibleActionGlowRect.width + 14,
        height: visibleActionGlowRect.height + 14,
      }}
    />
  );
}

export function CropSelectionOverlay({
  showVirtualCropSelection,
  currentStep,
  virtualCropSelection,
}: {
  showVirtualCropSelection: boolean;
  currentStep: TourStep;
  virtualCropSelection: VirtualCropSelectionState;
}) {
  if (!showVirtualCropSelection) return null;
  return (
    <div
      className={
        "smoat-generate-tour-crop-selection absolute z-[2] rounded-md " +
        (virtualCropSelection.active
          ? "smoat-generate-tour-crop-selection-active"
          : "")
      }
      style={{
        left: virtualCropSelection.left,
        top: virtualCropSelection.top,
        width: virtualCropSelection.width,
        height: virtualCropSelection.height,
      }}
    >
      <span className="absolute -top-7 left-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white shadow-lg shadow-blue-500/20">
        {currentStep?.cropDemo === "second-column"
          ? "Shift + 이어붙이기"
          : currentStep?.cropDemo === "workspace-selection"
            ? "문장 드래그"
            : "지문 영역 드래그"}
      </span>
    </div>
  );
}

export function DragGhostOverlay({
  showVirtualDragGhost,
  currentCursorPath,
  virtualDragGhost,
  virtualDragGhostLabel,
}: {
  showVirtualDragGhost: boolean;
  currentCursorPath: TourStep["cursorPath"];
  virtualDragGhost: VirtualDragGhostState;
  virtualDragGhostLabel: string;
}) {
  if (!showVirtualDragGhost) return null;
  return (
    <div
      className={
        "smoat-generate-tour-file-ghost absolute z-[2] flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-[12px] font-black text-blue-700 shadow-xl shadow-blue-500/20 ring-1 ring-blue-100 " +
        (virtualDragGhost.lifted
          ? "smoat-generate-tour-file-ghost-lifted "
          : "") +
        (virtualDragGhost.dropping
          ? "smoat-generate-tour-file-ghost-dropping"
          : "")
      }
      style={{
        left: virtualDragGhost.left,
        top: virtualDragGhost.top,
        width: virtualDragGhost.width,
        height: virtualDragGhost.height,
      }}
    >
      {currentCursorPath?.from === "passage-card-drag-handle" ? (
        <FileText className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <FileImage className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {virtualDragGhostLabel}
      </span>
      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
        놓기
      </span>
    </div>
  );
}

export function VirtualCursorOverlay({
  showVirtualCursor,
  currentCursorPath,
  currentStep,
  virtualCursor,
}: {
  showVirtualCursor: boolean;
  currentCursorPath: TourStep["cursorPath"];
  currentStep: TourStep;
  virtualCursor: VirtualCursorState;
}) {
  if (!showVirtualCursor) return null;
  return (
    <div
      className={
        "smoat-generate-tour-virtual-cursor absolute z-[3] flex items-center gap-1 " +
        (virtualCursor.pressed
          ? "smoat-generate-tour-virtual-cursor-pressed"
          : "")
      }
      style={{
        left: virtualCursor.left,
        top: virtualCursor.top,
      }}
    >
      <MousePointer2
        className="size-6 fill-blue-600 text-white drop-shadow-[0_2px_8px_rgba(37,99,235,0.42)]"
        aria-hidden="true"
      />
      <span className="rounded-full bg-blue-600/95 px-2 py-0.5 text-[10px] font-black text-white shadow-lg shadow-blue-500/20">
        {currentStep?.cropDemo === "second-column"
          ? "Shift+드래그"
          : currentStep?.cropDemo || currentCursorPath
            ? "드래그"
            : "클릭"}
      </span>
    </div>
  );
}
