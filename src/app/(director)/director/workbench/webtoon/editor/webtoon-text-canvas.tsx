"use client";

import Konva from "konva";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type { WebtoonTextBox } from "@/lib/webtoon-text/types";

export interface WebtoonTextCanvasHandle {
  exportDataUrl: () => string | null;
}

interface WebtoonTextCanvasProps {
  image: HTMLImageElement;
  nativeWidth: number;
  nativeHeight: number;
  scale: number; // display = native * scale
  boxes: WebtoonTextBox[];
  selectedId: string | null;
  hoverId: string | null;
  /** Bumped whenever a webfont finishes loading → forces auto-fit to re-measure. */
  fontEpoch: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onMoveBox: (id: string, x: number, y: number) => void;
  onResizeBox: (id: string, geom: { x: number; y: number; w: number; h: number }) => void;
  /**
   * Reports the natural (wrapped) text height for a manually-sized box so the editor can
   * grow the box to contain it. Fired only for boxes with autoFit OFF.
   */
  onAutoHeight: (id: string, h: number) => void;
  exportApiRef: MutableRefObject<WebtoonTextCanvasHandle | null>;
}

const SELECT_STROKE = "#2563eb";
const HOVER_STROKE = "#60a5fa";
const MIN_BOX = 16;

const fontStyleOf = (b: WebtoonTextBox) => ((b.fontWeight ?? 400) >= 700 ? "bold" : "normal");

let measureNode: Konva.Text | null = null;
function getMeasureNode(): Konva.Text {
  if (!measureNode) measureNode = new Konva.Text({});
  return measureNode;
}

function fitFontSize(box: WebtoonTextBox): number {
  const node = getMeasureNode();
  node.text(box.text || " ");
  node.fontFamily(box.fontFamily);
  node.fontStyle(fontStyleOf(box));
  node.letterSpacing(box.letterSpacing ?? 0);
  node.lineHeight(box.lineHeight);
  node.width(box.w);
  node.padding(box.bgPadding);
  node.align(box.align);
  node.wrap("word");
  const innerH = Math.max(8, box.h - box.bgPadding * 2);
  const measure = (fs: number) => {
    node.fontSize(fs);
    return node.height() - box.bgPadding * 2;
  };
  let lo = 8;
  let hi = Math.min(160, Math.max(8, Math.round(box.h)));
  let best = 8;
  for (let i = 0; i < 12 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (measure(mid) <= innerH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(8, best);
}

/**
 * Natural height (native px) needed to render the box's text wrapped at its current width
 * with the given font size — INCLUDING top+bottom padding so the patch fully contains it.
 * Uses the same Konva.Text config as the render path, so it matches the wrapping exactly.
 * The shared measure node never sets `height`, so `.height()` returns the auto content size.
 */
function fitBoxHeight(box: WebtoonTextBox, fontSize: number): number {
  const node = getMeasureNode();
  node.text(box.text || " ");
  node.fontFamily(box.fontFamily);
  node.fontStyle(fontStyleOf(box));
  node.fontSize(fontSize);
  node.letterSpacing(box.letterSpacing ?? 0);
  node.lineHeight(box.lineHeight);
  node.width(box.w);
  node.padding(box.bgPadding);
  node.align(box.align);
  node.wrap("word");
  return Math.max(MIN_BOX, Math.ceil(node.height()));
}

export function WebtoonTextCanvas(props: WebtoonTextCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const selectedRectRef = useRef<Konva.Rect>(null);
  const fitCacheRef = useRef<Map<string, number>>(new Map());

  const boxesSignature = props.boxes
    .map(
      (b) =>
        `${b.id}:${b.text}:${b.w}:${b.h}:${b.fontSizePx}:${b.autoFit}:${b.align}:${b.lineHeight}:${b.bgPadding}:${b.fontFamily}:${b.fontWeight ?? 400}:${b.letterSpacing ?? 0}`,
    )
    .join("|");
  const renderFontSizes = useMemo(() => {
    const cache = fitCacheRef.current;
    const map = new Map<string, number>();
    for (const box of props.boxes) {
      if (!box.autoFit) {
        map.set(box.id, box.fontSizePx);
        continue;
      }
      const key = `${props.fontEpoch}|${box.text}|${box.w}|${box.h}|${box.align}|${box.lineHeight}|${box.bgPadding}|${box.fontFamily}|${box.fontWeight ?? 400}|${box.letterSpacing ?? 0}`;
      let size = cache.get(key);
      if (size === undefined) {
        size = fitFontSize(box);
        cache.set(key, size);
      }
      map.set(box.id, size);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fontEpoch, boxesSignature]);

  // Grow manually-sized boxes (autoFit OFF) so the box height always contains the wrapped
  // text. Without this, raising the font size overflows the fixed box height — the text
  // spills out and the background patch no longer covers it. Converges in one pass: the new
  // height feeds back into boxesSignature, the next measure matches, and it stops firing.
  useEffect(() => {
    for (const box of props.boxes) {
      if (!box.editable || !box.edited || box.autoFit) continue;
      const fs = renderFontSizes.get(box.id) ?? box.fontSizePx;
      const h = fitBoxHeight(box, fs);
      if (Math.abs(h - box.h) > 1) props.onAutoHeight(box.id, h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxesSignature, props.fontEpoch, renderFontSizes]);

  useEffect(() => {
    props.exportApiRef.current = {
      exportDataUrl: () => {
        const stage = stageRef.current;
        if (!stage) return null;
        const hideNodes = stage.find(".export-hide");
        hideNodes.forEach((n) => n.visible(false));
        stage.draw();
        let url: string | null = null;
        try {
          url = stage.toDataURL({ pixelRatio: 1 / props.scale, mimeType: "image/png" });
        } finally {
          hideNodes.forEach((n) => n.visible(true));
          stage.draw();
        }
        return url;
      },
    };
  });

  // attach the transformer to the selected box's interactive rect
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (props.selectedId && selectedRectRef.current) {
      tr.nodes([selectedRectRef.current]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [props.selectedId, boxesSignature]);

  const { boxes, selectedId, hoverId } = props;
  const editedBoxes = boxes.filter((b) => b.editable && b.edited);
  const selectedBox = selectedId ? boxes.find((b) => b.id === selectedId) : undefined;
  // When the font size is manual (autoFit OFF) the height is driven by the text, so the
  // vertical-only handles are hidden — width handles still control wrapping.
  const heightIsAuto = selectedBox ? selectedBox.autoFit === false : false;

  return (
    <Stage
      ref={stageRef}
      width={props.nativeWidth * props.scale}
      height={props.nativeHeight * props.scale}
      scaleX={props.scale}
      scaleY={props.scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage() || e.target.name() === "bg") {
          props.onSelect(null);
        }
      }}
    >
      <Layer>
        <KonvaImage
          image={props.image}
          width={props.nativeWidth}
          height={props.nativeHeight}
          name="bg"
          listening
        />

        {/* erase the ORIGINAL detected location of every edited box (kept put on drag) */}
        {editedBoxes.map((box) => (
          <Rect
            key={`cover-${box.id}`}
            x={box.srcX - box.bgPadding}
            y={box.srcY - box.bgPadding}
            width={box.srcW + box.bgPadding * 2}
            height={box.srcH + box.bgPadding * 2}
            cornerRadius={box.bgRadius}
            fill={box.bgColor}
            listening={false}
          />
        ))}

        {/* content (patch + re-typeset text) — part of export */}
        {boxes.map((box) => {
          if (!box.editable || !box.edited) return null;
          const fs = renderFontSizes.get(box.id) ?? box.fontSizePx;
          const strokeW = box.strokeWidth ?? 0;
          return (
            <Group key={`content-${box.id}`} listening={false}>
              <Rect
                x={box.x - box.bgPadding}
                y={box.y - box.bgPadding}
                width={box.w + box.bgPadding * 2}
                height={box.h + box.bgPadding * 2}
                cornerRadius={box.bgRadius}
                fill={box.bgColor}
              />
              <Text
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                padding={box.bgPadding}
                text={box.text}
                fontFamily={box.fontFamily}
                fontStyle={fontStyleOf(box)}
                fontSize={fs}
                letterSpacing={box.letterSpacing ?? 0}
                lineHeight={box.lineHeight}
                fill={box.color}
                stroke={strokeW > 0 ? box.strokeColor ?? "#ffffff" : undefined}
                strokeWidth={strokeW}
                fillAfterStrokeEnabled={strokeW > 0}
                align={box.align}
                verticalAlign="middle"
                wrap="word"
              />
            </Group>
          );
        })}

        {/* interactive layer (hidden on export): hit/drag/resize rect + hover outline */}
        {boxes.map((box) => {
          if (!box.editable) return null;
          const isSelected = box.id === selectedId;
          const isHover = box.id === hoverId;
          return (
            <Rect
              key={`hit-${box.id}`}
              ref={isSelected ? selectedRectRef : undefined}
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              cornerRadius={box.bgRadius}
              fill="#000000"
              opacity={0.001}
              stroke={isSelected ? undefined : isHover ? HOVER_STROKE : undefined}
              strokeWidth={!isSelected && isHover ? 2 : 0}
              dash={!isSelected && isHover ? [8, 6] : undefined}
              strokeScaleEnabled={false}
              name="export-hide"
              draggable={isSelected}
              onMouseEnter={(e) => {
                props.onHover(box.id);
                const c = e.target.getStage()?.container();
                if (c) c.style.cursor = isSelected ? "move" : "pointer";
              }}
              onMouseLeave={(e) => {
                props.onHover(null);
                const c = e.target.getStage()?.container();
                if (c) c.style.cursor = "default";
              }}
              onMouseDown={() => props.onSelect(box.id)}
              onTap={() => props.onSelect(box.id)}
              onDragMove={(e) => {
                props.onMoveBox(box.id, Math.round(e.target.x()), Math.round(e.target.y()));
              }}
              onTransformEnd={(e) => {
                const node = e.target as Konva.Rect;
                const newW = Math.max(MIN_BOX, Math.round(node.width() * node.scaleX()));
                const newH = Math.max(MIN_BOX, Math.round(node.height() * node.scaleY()));
                node.scaleX(1);
                node.scaleY(1);
                props.onResizeBox(box.id, {
                  x: Math.round(node.x()),
                  y: Math.round(node.y()),
                  w: newW,
                  h: newH,
                });
              }}
            />
          );
        })}

        {/* edited marker dots (hidden on export) */}
        {editedBoxes.map((box) => (
          <Rect
            key={`dot-${box.id}`}
            x={box.x + box.w - 14 / props.scale}
            y={box.y - 6 / props.scale}
            width={12 / props.scale}
            height={12 / props.scale}
            cornerRadius={6 / props.scale}
            fill="#16a34a"
            listening={false}
            name="export-hide"
          />
        ))}

        <Transformer
          ref={trRef}
          name="export-hide"
          rotateEnabled={false}
          keepRatio={false}
          ignoreStroke
          // Transformer decorations are drawn in SCREEN pixels (not affected by the stage
          // scale), so these are fixed — dividing by scale made the handles huge.
          anchorSize={9}
          anchorCornerRadius={2}
          borderStroke={SELECT_STROKE}
          anchorStroke={SELECT_STROKE}
          anchorFill="#ffffff"
          borderStrokeWidth={1.5}
          anchorStrokeWidth={1.5}
          enabledAnchors={
            heightIsAuto
              ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
              : [
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                  "middle-left",
                  "middle-right",
                  "top-center",
                  "bottom-center",
                ]
          }
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < MIN_BOX || newBox.height < MIN_BOX ? oldBox : newBox
          }
        />
      </Layer>
    </Stage>
  );
}
