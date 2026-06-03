"use client";

// ============================================================================
// CropModal — 한 이미지에서 영역을 드래그해 잘라내고, 각 영역에 "지문 번호"를
// 지정해 N개 지문으로 추출한다. 같은 지문 번호 영역끼리는 순서대로 이어붙여
// 한 지문으로(여러 칼럼/조각에 나뉜 한 지문). (adaptive-intake G2/C3/C8)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2, Plus, Trash2, X } from "lucide-react";

import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";
import { CropCanvas } from "./crop-canvas";
import { cropBoxLabel, cropImageToBlob, stitchCropsToBlob } from "./crop-utils";

/** 그룹 배열을 첫 등장 순서대로 1..K 연속 번호로 정규화. */
function renumber(groups: number[]): number[] {
  const map = new Map<number, number>();
  let next = 1;
  return groups.map((g) => {
    if (!map.has(g)) map.set(g, next++);
    return map.get(g)!;
  });
}

export function CropModal({
  slot,
  initialBoxes,
  initialGroups,
  onCancel,
  onConfirm,
}: {
  slot: ClientPageSlot;
  /** 재편집 시 기존 크롭 영역을 프리로드. */
  initialBoxes?: CropBox[];
  /** 재편집 시 기존 지문 그룹(initialBoxes와 1:1)을 프리로드. */
  initialGroups?: number[];
  onCancel: () => void;
  /** 잘라낸 새 슬롯 배열 + 확정 영역 + 그룹. pageIndex는 호출부에서 재계산. */
  onConfirm: (
    croppedSlots: ClientPageSlot[],
    boxes: CropBox[],
    groups: number[],
  ) => void;
}) {
  const [boxes, setBoxes] = useState<CropBox[]>(initialBoxes ?? []);
  // 영역별 지문 그룹 번호(연속 1..K). 재편집이면 저장된 그룹, 아니면 영역마다 별개.
  const [groups, setGroups] = useState<number[]>(
    initialGroups && initialGroups.length === (initialBoxes ?? []).length
      ? renumber(initialGroups)
      : (initialBoxes ?? []).map((_, i) => i + 1),
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // 체크된 영역 인덱스 — "한 지문으로 묶기 / 따로 떼기" 대상.
  const [regionSel, setRegionSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createdUrls = useRef<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  useEffect(() => {
    return () => {
      createdUrls.current.forEach((u) => URL.revokeObjectURL(u));
      createdUrls.current = [];
    };
  }, []);

  // CropCanvas의 onChange — 영역 추가/삭제 시 groups를 정렬 동기화.
  const handleBoxesChange = useCallback(
    (next: CropBox[]) => {
      if (next.length !== boxes.length) setRegionSel([]); // 인덱스 어긋남 방지
      if (next.length > boxes.length) {
        const maxG = groups.length ? Math.max(...groups) : 0;
        setGroups([...groups, maxG + 1]); // 새 영역 = 새 지문
      } else if (next.length < boxes.length) {
        const removedIdx = boxes.findIndex((b) => !next.includes(b));
        const ng =
          removedIdx >= 0
            ? groups.filter((_, i) => i !== removedIdx)
            : groups.slice(0, next.length);
        setGroups(renumber(ng));
      }
      setBoxes(next);
    },
    [boxes, groups],
  );

  const removeBox = useCallback(
    (index: number) => {
      setRegionSel([]);
      setBoxes((prev) => prev.filter((_, i) => i !== index));
      setGroups((prev) => renumber(prev.filter((_, i) => i !== index)));
      setActiveIndex((prev) =>
        prev === null ? null : prev === index ? null : prev > index ? prev - 1 : prev,
      );
    },
    [],
  );

  const toggleRegionSel = useCallback((index: number) => {
    setRegionSel((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  }, []);

  // 선택한 영역들을 한 지문(첫 선택 영역의 지문 번호)으로 통합.
  const mergeSelected = useCallback(() => {
    if (regionSel.length < 2) return;
    setGroups((prev) => {
      const firstIdx = [...regionSel].sort((a, b) => a - b)[0];
      const target = prev[firstIdx];
      return renumber(prev.map((g, i) => (regionSel.includes(i) ? target : g)));
    });
    setRegionSel([]);
  }, [regionSel]);

  // 선택한 영역들을 각각 별개 지문으로 분리.
  const splitSelected = useCallback(() => {
    if (regionSel.length === 0) return;
    setGroups((prev) => {
      let nextId = prev.length ? Math.max(...prev) : 0;
      return renumber(
        prev.map((g, i) => (regionSel.includes(i) ? ++nextId : g)),
      );
    });
    setRegionSel([]);
  }, [regionSel]);

  const passageCount = new Set(groups).size;

  const handleConfirm = useCallback(async () => {
    if (boxes.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const slots: ClientPageSlot[] = [];
      const groupIds = Array.from(new Set(groups)).sort((a, b) => a - b);
      for (const g of groupIds) {
        const groupBoxes = boxes.filter((_, i) => groups[i] === g);
        if (groupBoxes.length === 0) continue;
        if (groupBoxes.length === 1) {
          const { blob, width, height, previewUrl } = await cropImageToBlob(
            slot.blob,
            groupBoxes[0],
          );
          createdUrls.current.push(previewUrl);
          slots.push({
            pageIndex: 0,
            blob,
            previewUrl,
            bytes: blob.size,
            width,
            height,
            sourceFileName: `${slot.sourceFileName ?? "이미지"} · 지문 ${g}`,
            kind: "crop",
            regionIndex: g,
          });
        } else {
          // 같은 지문 번호 영역들을 순서대로 이어붙여 1개 지문으로.
          const { blob, width, height, previewUrl } = await stitchCropsToBlob(
            slot.blob,
            groupBoxes,
          );
          createdUrls.current.push(previewUrl);
          slots.push({
            pageIndex: 0,
            blob,
            previewUrl,
            bytes: blob.size,
            width,
            height,
            sourceFileName: `${slot.sourceFileName ?? "이미지"} · 지문 ${g} (이어붙임)`,
            kind: "merged",
            regionCount: groupBoxes.length,
          });
        }
      }
      createdUrls.current = [];
      onConfirm(slots, boxes, groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "영역을 잘라내지 못했습니다.");
      setBusy(false);
    }
  }, [boxes, busy, groups, onConfirm, slot]);

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
                지문 부분을 드래그해 선택하세요. 한 지문이 여러 조각이면{" "}
                <b className="font-bold text-blue-700">지문 번호를 같게</b> 맞추면
                이어붙여 추출합니다.
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
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_268px]">
          <div className="min-h-0 border-b border-slate-100 p-2 md:border-b-0 md:border-r">
            <CropCanvas
              imageUrl={slot.previewUrl}
              boxes={boxes}
              onChange={handleBoxesChange}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              disabled={busy}
              regionLabels={groups.map(String)}
            />
          </div>

          <aside className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-700">
                영역 {boxes.length}개 · 지문 {passageCount}개
              </span>
            </div>

            {regionSel.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 bg-blue-50/60 px-3 py-2">
                <span className="text-[10.5px] font-bold text-slate-700">
                  {regionSel.length}개 영역 선택됨
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={mergeSelected}
                    disabled={regionSel.length < 2}
                    className="inline-flex h-6 cursor-pointer items-center rounded bg-blue-600 px-2 text-[10.5px] font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    한 지문으로 묶기
                  </button>
                  <button
                    type="button"
                    onClick={splitSelected}
                    className="inline-flex h-6 cursor-pointer items-center rounded border border-slate-200 bg-white px-2 text-[10.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    따로 떼기
                  </button>
                </div>
              </div>
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
                  const checked = regionSel.includes(index);
                  return (
                    <div
                      key={index}
                      className={
                        "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors " +
                        (checked
                          ? "border-blue-500 bg-blue-50/60"
                          : active
                            ? "border-blue-300 bg-blue-50/30"
                            : "border-slate-200 bg-white hover:bg-slate-50")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRegionSel(index)}
                        aria-label={`영역 ${index + 1} 선택`}
                        className="size-3.5 shrink-0 cursor-pointer accent-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500">
                          {cropBoxLabel(box)}
                        </span>
                      </button>
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                        지문 {groups[index]}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeBox(index)}
                        aria-label={`영역 ${index + 1} 삭제`}
                        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-slate-100 px-3 py-2 text-[10.5px] leading-relaxed text-slate-400">
              드래그=영역 · 안쪽 드래그=이동 · 핸들=크기조절 · Del=삭제
              <br />
              여러 조각이 한 지문이면{" "}
              <b className="font-bold text-blue-600">체크 후 “한 지문으로 묶기”</b>
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
                : `영역 ${boxes.length}개 → 지문 ${passageCount}개로 추가합니다.`}
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
                  지문 {passageCount}개로 확정
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
