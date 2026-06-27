import { Bold, Italic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaperBlockFontSize, PaperItem } from "../../types";
import { AlignmentControls, NumberStepper, PrecisionPresetButtons } from "./panel-controls";
import { BLOCK_LABELS } from "./panel-storage";

const COLOR_SWATCHES = ["#2563EB", "#0F766E", "#7C3AED", "#DC2626", "#111827"];

const IMAGE_WIDTH_PRESETS = [25, 50, 75, 100];

const SPACER_HEIGHT_PRESETS = [16, 32, 64, 96];

export function CustomBlockInspector({
  item,
  disabled,
  onUpdate,
}: {
  item: PaperItem;
  disabled: boolean;
  onUpdate: (patch: Partial<PaperItem>) => void;
}) {
  // 프리셋(SM/MD/LG)을 고르면 숫자 pt 오버라이드는 해제해 프리셋이 그대로 보이게 한다
  // (미리보기 위 떠다니는 툴바의 ±pt 와 한 값으로 일관 동작).
  const setFontSize = (blockFontSize: PaperBlockFontSize) =>
    onUpdate({ blockFontSize, blockFontPt: null });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
        <p className="text-[11px] font-black text-slate-500">
          {BLOCK_LABELS[item.blockType]} 블록
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] font-bold leading-relaxed text-slate-700">
          {item.blockType === "section"
            ? item.blockTitle || "새 섹션"
            : item.blockType === "image"
              ? item.imageAlt || "이미지"
              : item.blockText || BLOCK_LABELS[item.blockType]}
        </p>
      </div>

      {(item.blockType === "text" || item.blockType === "section") && (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-500">
            {item.blockType === "section" ? "섹션 제목" : "텍스트"}
          </p>
          <textarea
            disabled={disabled}
            value={item.blockType === "section" ? item.blockTitle : item.blockText}
            onChange={(event) => {
              const next = event.target.value;
              onUpdate(
                item.blockType === "section"
                  ? {
                      blockTitle: next,
                      blockText: next,
                      questionText: next,
                      sectionTitle: next,
                    }
                  : { blockText: next, questionText: next },
              );
            }}
            className="min-h-20 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[12px] font-semibold leading-relaxed text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      )}

      {item.blockType === "image" && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
            <NumberStepper
              label="정밀 폭(%)"
              min={20}
              max={100}
              value={item.imageWidth}
              disabled={disabled}
              onChange={(imageWidth) => onUpdate({ imageWidth })}
            />
            <input
              type="range"
              min={20}
              max={100}
              step={2}
              disabled={disabled}
              value={item.imageWidth}
              onChange={(event) => onUpdate({ imageWidth: Number(event.target.value) })}
              className="w-full accent-blue-600"
            />
            <PrecisionPresetButtons
              values={IMAGE_WIDTH_PRESETS}
              suffix="%"
              activeValue={item.imageWidth}
              disabled={disabled}
              onChange={(imageWidth) => onUpdate({ imageWidth })}
            />
          </div>
        </div>
      )}

      {item.blockType === "spacer" && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
          <NumberStepper
            label="정밀 높이(px)"
            min={8}
            max={160}
            value={item.spacerHeight}
            disabled={disabled}
            onChange={(spacerHeight) => onUpdate({ spacerHeight })}
          />
          <input
            type="range"
            min={8}
            max={160}
            step={4}
            disabled={disabled}
            value={item.spacerHeight}
            onChange={(event) => onUpdate({ spacerHeight: Number(event.target.value) })}
            className="w-full accent-blue-600"
          />
          <PrecisionPresetButtons
            values={SPACER_HEIGHT_PRESETS}
            suffix="px"
            activeValue={item.spacerHeight}
            disabled={disabled}
            onChange={(spacerHeight) => onUpdate({ spacerHeight })}
          />
        </div>
      )}

      {item.blockType === "divider" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberStepper
            label="두께"
            min={1}
            max={8}
            value={item.dividerThickness}
            disabled={disabled}
            onChange={(value) => onUpdate({ dividerThickness: value })}
          />
          <div>
            <p className="mb-2 text-[11px] font-bold text-slate-500">스타일</p>
            <select
              disabled={disabled}
              value={item.dividerStyle}
              onChange={(event) =>
                onUpdate({
                  dividerStyle: event.target.value as PaperItem["dividerStyle"],
                })
              }
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-600 outline-none disabled:bg-slate-50"
            >
              <option value="solid">실선</option>
              <option value="dashed">파선</option>
              <option value="dotted">점선</option>
            </select>
          </div>
        </div>
      )}

      {item.blockType !== "spacer" && (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-500">정렬</p>
          <AlignmentControls
            value={item.blockAlign}
            disabled={disabled}
            onChange={(blockAlign) => onUpdate({ blockAlign })}
          />
        </div>
      )}

      {(item.blockType === "text" || item.blockType === "section") && (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-500">서식</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              disabled={disabled}
              title="굵게"
              onClick={() => onUpdate({ blockBold: !item.blockBold })}
              className={cn(
                "flex h-7 items-center justify-center rounded-md transition-colors disabled:opacity-40",
                item.blockBold ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white",
              )}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              title="기울임"
              onClick={() => onUpdate({ blockItalic: !item.blockItalic })}
              className={cn(
                "flex h-7 items-center justify-center rounded-md transition-colors disabled:opacity-40",
                item.blockItalic ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white",
              )}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {(item.blockType === "text" || item.blockType === "section") && (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-500">크기</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["sm", "md", "lg"] as PaperBlockFontSize[]).map((size) => (
              <button
                key={size}
                type="button"
                disabled={disabled}
                onClick={() => setFontSize(size)}
                className={cn(
                  "h-7 rounded-md text-[11px] font-black text-slate-500 transition-colors disabled:opacity-40",
                  item.blockFontSize === size ? "bg-white text-blue-700 shadow-sm" : "hover:bg-white",
                )}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {(item.blockType === "section" || item.blockType === "divider") && (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-500">색상</p>
          <div className="flex items-center gap-2">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                disabled={disabled}
                title={color}
                aria-label={color}
                onClick={() => onUpdate({ blockAccentColor: color })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition disabled:opacity-40",
                  item.blockAccentColor === color ? "border-slate-900" : "border-white shadow-sm ring-1 ring-slate-200",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <input
              type="color"
              disabled={disabled}
              value={item.blockAccentColor}
              onChange={(event) => onUpdate({ blockAccentColor: event.target.value })}
              className="h-7 w-9 rounded border border-slate-200 bg-white p-0.5 disabled:opacity-40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
