"use client";

import { type CSSProperties } from "react";

import { type Page } from "@/lib/passage-report/schema";

import { BlockRenderer } from "./BlockRenderer";

interface PageCanvasProps {
  page: Page;
  zoom?: number;
  mode?: "view" | "edit" | "print";
}

/**
 * A4 페이지 1장 (210×297mm). 배경/마진/패턴 + 절대좌표 블록 레이어.
 *
 * 줌은 transform: scale 로 적용. 좌표 계산은 mm 그대로 유지 (역변환 비용 0).
 */
export function PageCanvas({ page, zoom = 1, mode = "view" }: PageCanvasProps) {
  const bgClass = `report-page-bg-${page.background.pattern}`;
  const style: CSSProperties = {
    background: page.background.color,
    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
    transformOrigin: "top left",
  };
  if (page.background.pattern === "lines" && page.background.patternColor) {
    (style as Record<string, string>)["--bg-pattern-color"] = page.background.patternColor;
  }

  return (
    <div
      className={`report-page-canvas ${bgClass}`}
      data-page-id={page.id}
      data-page-number={page.pageNumber}
      style={style}
    >
      {page.blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} mode={mode} />
      ))}
    </div>
  );
}

/**
 * 줌 적용된 컨테이너 박스 크기 — 부모가 정확한 영역을 잡을 수 있게.
 * (transform: scale 은 layout 영향 안 주므로 wrapper 필요)
 */
export function PageCanvasFrame({
  page,
  zoom = 1,
  mode = "view",
}: PageCanvasProps) {
  return (
    <div
      className="report-page-canvas-frame"
      style={{
        width: `${210 * zoom}mm`,
        height: `${297 * zoom}mm`,
        position: "relative",
      }}
    >
      <PageCanvas page={page} zoom={zoom} mode={mode} />
    </div>
  );
}
