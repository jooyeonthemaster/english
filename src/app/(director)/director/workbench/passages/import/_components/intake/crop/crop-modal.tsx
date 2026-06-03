"use client";

// ============================================================================
// CropModal — 한 페이지(슬롯)에서 영역을 잘라 N개의 새 슬롯을 만드는 오버레이.
// 설계 §3.0 와이어프레임: 좌측 크롭 캔버스 + 우측 영역 목록 + 푸터 확정.
// 각 크롭 영역 = 지문 1개로 추출(새 ClientPageSlot). (adaptive-intake G2/C8)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2, Plus, Trash2, X } from "lucide-react";

import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";
import { CropCanvas } from "./crop-canvas";
import { cropBoxLabel, cropImageToBlob, stitchCropsToBlob } from "./crop-utils";

export function CropModal({
  slot,
  initialBoxes,
  onCancel,
  onConfirm,
}: {
  slot: ClientPageSlot;
  /** 재편집 시 기존 크롭 영역을 프리로드. */
  initialBoxes?: CropBox[];
  onCancel: () => void;
  /** 잘라낸 새 슬롯 배열 + 확정 영역들. pageIndex는 호출부에서 재계산. */
  onConfirm: (croppedSlots: ClientPageSlot[], boxes: CropBox[]) => void;
}) {
  const [boxes, setBoxes] = useState<CropBox[]>(initialBoxes ?? []);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // true면 모든 영역을 순서대로 이어붙여 1개 지문으로 추출 (여러 칼럼/페이지에 걸친 한 지문).
  const [mergeIntoOne, setMergeIntoOne] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createdUrls = useRef<string[]>([]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  // 모달이 닫힐 때, 확정되지 않은 미리보기 URL 정리(확정 시엔 호출부로 넘어감).
  useEffect(() => {
    return () => {
      createdUrls.current.forEach((u) => URL.revokeObjectURL(u));
      createdUrls.current = [];
    };
  }, []);

  const removeBox = useCallback(
    (index: number) => {
      setBoxes((prev) => prev.filter((_, i) => i !== index));
      setActiveIndex((prev) =>
        prev === null ? null : prev === index ? null : prev > index ? prev - 1 : prev,
      );
    },
    [],
  );

  const merge = mergeIntoOne && boxes.length >= 2;

  const handleConfirm = useCallback(async () => {
    if (boxes.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const slots: ClientPageSlot[] = [];
      if (merge) {
        // 모든 영역을 순서대로 이어붙여 1개 지문(=1 슬롯)으로.
        const { blob, width, height, previewUrl } = await stitchCropsToBlob(
          slot.blob,
          boxes,
        );
        createdUrls.current.push(previewUrl);
        slots.push({
          pageIndex: 0,
          blob,
          previewUrl,
          bytes: blob.size,
          width,
          height,
          sourceFileName: `${slot.sourceFileName ?? "이미지"} · 이어붙인 지문`,
          kind: "merged",
          regionCount: boxes.length,
        });
      } else {
        for (let i = 0; i < boxes.length; i += 1) {
          const { blob, width, height, previewUrl } = await cropImageToBlob(
            slot.blob,
            boxes[i],
          );
          createdUrls.current.push(previewUrl);
          slots.push({
            pageIndex: 0, // 호출부에서 재계산
            blob,
            previewUrl,
            bytes: blob.size,
            width,
            height,
            sourceFileName: `${slot.sourceFileName ?? "이미지"} · 영역 ${i + 1}`,
            kind: "crop",
            regionIndex: i + 1,
          });
        }
      }
      // 확정된 URL은 호출부 소유로 넘긴다(여기서 revoke하지 않음).
      createdUrls.current = [];
      onConfirm(slots, boxes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "영역을 잘라내지 못했습니다.",
      );
      setBusy(false);
    }
  }, [boxes, busy, merge, onConfirm, slot]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 영역 자르기"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Crop className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[13px] font-bold text-slate-950">영역 자르기</h2>
              <p className="text-[11px] text-slate-500">
                지문이 있는 부분을 드래그해 선택하세요. 영역 하나당 지문 1개로 추출됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="닫기 (Esc)"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* 본문: 캔버스 + 영역 목록 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-h-0 border-b border-slate-100 p-2 md:border-b-0 md:border-r">
            <CropCanvas
              imageUrl={slot.previewUrl}
              boxes={boxes}
              onChange={setBoxes}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              disabled={busy}
            />
          </div>

          <aside className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">
                  선택 영역
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
                  {boxes.length}개
                </span>
              </div>
            </div>

            {boxes.length >= 2 ? (
              <label className="flex cursor-pointer items-start gap-2 border-b border-slate-100 bg-blue-50/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={mergeIntoOne}
                  onChange={(e) => setMergeIntoOne(e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-blue-600"
                />
                <span className="text-[11px] leading-relaxed">
                  <span className="font-bold text-slate-800">
                    한 지문으로 이어붙이기
                  </span>
                  <span className="mt-0.5 block text-slate-500">
                    여러 칼럼·페이지에 걸친 한 지문일 때 켜세요. 순서(1→2…)대로
                    이어 <b className="font-bold text-blue-700">1개 지문</b>으로
                    추출합니다.
                  </span>
                </span>
              </label>
            ) : null}
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {boxes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                  <span className="flex size-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-100">
                    <Plus className="size-4" aria-hidden="true" />
                  </span>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    이미지 위에서 드래그하면
                    <br />첫 영역이 추가됩니다.
                  </p>
                </div>
              ) : (
                boxes.map((box, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={
                        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                        (active
                          ? "border-blue-500 bg-blue-50/60"
                          : "border-slate-200 bg-white hover:bg-slate-50")
                      }
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-600">
                        {cropBoxLabel(box)}
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBox(index);
                        }}
                        aria-label={`영역 ${index + 1} 삭제`}
                        className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-slate-100 px-3 py-2 text-[10.5px] leading-relaxed text-slate-400">
              드래그=영역 · 안쪽 드래그=이동 · 핸들=크기조절
              <br />
              화살표=미세이동 · Del=삭제 · Esc=닫기
            </div>
          </aside>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          {error ? (
            <span className="text-[11.5px] font-medium text-red-600">{error}</span>
          ) : (
            <span className="text-[11.5px] text-slate-500">
              {boxes.length === 0
                ? "선택한 영역이 없습니다."
                : merge
                  ? `${boxes.length}개 영역을 이어붙여 1개 지문으로 추가합니다.`
                  : `${boxes.length}개 영역을 각각 1개씩, 총 ${boxes.length}개 지문으로 추가합니다.`}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 px-3.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || boxes.length === 0}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  자르는 중
                </>
              ) : (
                <>
                  <Crop className="size-4" aria-hidden="true" />
                  이 영역들로 확정
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
