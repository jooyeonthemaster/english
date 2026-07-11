"use client";

import { PreviewZoomControls } from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import type { useDemoZoom } from "./use-demo-zoom";

// 랜딩 데모 공용 줌 컨트롤 오버레이 — useDemoZoom 반환값을 그대로 워크벤치의
// PreviewZoomControls(순수 UI)에 배선한다. 부모는 relative 여야 한다.
export function DemoZoomControls({
  ctl,
}: {
  ctl: ReturnType<typeof useDemoZoom>;
}) {
  return (
    <PreviewZoomControls
      zoom={ctl.zoom}
      position={ctl.controlsPos}
      onZoomIn={ctl.zoomIn}
      onZoomOut={ctl.zoomOut}
      onReset={ctl.reset}
      onFit={ctl.fitToScreen}
      onDragStart={ctl.handleControlsDragStart}
    />
  );
}
