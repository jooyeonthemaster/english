"use client";

import { useMemo, useState } from "react";
import { FileUp, RotateCcw, Scissors, Trash2 } from "lucide-react";

import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";

import { CropCanvas } from "../../passages/import/_components/intake/crop/crop-canvas";
import {
  cropImageToBlob,
  stitchSlotsToBlob,
} from "../../passages/import/_components/intake/crop/crop-utils";

interface ManualQuestionCropBoardProps {
  slot: ClientPageSlot;
  boxes: CropBox[];
  busy: boolean;
  error: string | null;
  onBoxesChange: (boxes: CropBox[]) => void;
  onPickFiles: (files: FileList | File[]) => void;
  onRequestFileDialog: () => void;
}

function columnOf(box: CropBox): number {
  return box.x + box.w / 2 < 0.5 ? 0 : 1;
}

function sortBoxesForReading(boxes: CropBox[]): CropBox[] {
  return boxes
    .map((box, index) => ({ box, index }))
    .sort(
      (a, b) =>
        columnOf(a.box) - columnOf(b.box) ||
        a.box.y - b.box.y ||
        a.box.x - b.box.x ||
        a.index - b.index,
    )
    .map((entry) => entry.box);
}

export async function buildManualCropReferenceSlot(
  source: ClientPageSlot,
  boxes: CropBox[],
): Promise<ClientPageSlot> {
  const ordered = sortBoxesForReading(boxes);
  if (ordered.length === 0) {
    throw new Error("문항 영역을 먼저 크롭해 주세요.");
  }

  const createdUrls: string[] = [];
  try {
    const crops = await Promise.all(
      ordered.map((box) => cropImageToBlob(source.blob, box)),
    );
    crops.forEach((crop) => createdUrls.push(crop.previewUrl));

    const result =
      crops.length === 1
        ? crops[0]
        : await stitchSlotsToBlob(
            crops.map((crop) => crop.blob),
            { gap: 18, maxWidth: 2480 },
          );
    if (crops.length > 1) createdUrls.push(result.previewUrl);

    return {
      pageIndex: 0,
      blob: result.blob,
      previewUrl: "",
      bytes: result.blob.size,
      width: result.width,
      height: result.height,
      sourceFileName:
        ordered.length === 1
          ? `${source.sourceFileName ?? "reference"} - manual crop`
          : `${source.sourceFileName ?? "reference"} - ${ordered.length} manual crops`,
      kind: ordered.length === 1 ? "crop" : "merged",
      sourceSlotId: source.slotId,
      regionCount: ordered.length,
    };
  } finally {
    createdUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}

export function ManualQuestionCropBoard({
  slot,
  boxes,
  busy,
  error,
  onBoxesChange,
  onPickFiles,
  onRequestFileDialog,
}: ManualQuestionCropBoardProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labels = useMemo(() => boxes.map((_, index) => String(index + 1)), [boxes]);

  const clearBoxes = () => {
    setActiveIndex(null);
    onBoxesChange([]);
  };

  const removeActive = () => {
    if (activeIndex == null) return;
    const next = boxes.filter((_, index) => index !== activeIndex);
    onBoxesChange(next);
    setActiveIndex(next.length === 0 ? null : Math.min(activeIndex, next.length - 1));
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/70">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[12px] font-bold text-blue-700 ring-1 ring-blue-100">
          <Scissors className="size-3.5" aria-hidden="true" />
          수동 크롭 {boxes.length}개
        </span>
        <button
          type="button"
          onClick={removeActive}
          disabled={busy || activeIndex == null}
          title="선택 영역 삭제"
          aria-label="선택 영역 삭제"
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={clearBoxes}
          disabled={busy || boxes.length === 0}
          title="크롭 초기화"
          aria-label="크롭 초기화"
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRequestFileDialog}
          disabled={busy}
          title="참조 이미지 교체"
          aria-label="참조 이미지 교체"
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <FileUp className="size-3.5" aria-hidden="true" />
          교체
        </button>
      </div>

      {error ? (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) onPickFiles(event.dataTransfer.files);
        }}
        className="min-h-0 flex-1 overflow-auto px-5 py-5 [scrollbar-gutter:stable]"
      >
        <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <CropCanvas
            fit="width"
            imageUrl={slot.previewUrl}
            boxes={boxes}
            onChange={(next) => onBoxesChange(next)}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            disabled={busy}
            regionLabels={labels}
          />
        </div>
      </div>
    </section>
  );
}
