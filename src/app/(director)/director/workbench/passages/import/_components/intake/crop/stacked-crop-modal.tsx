"use client";

// ============================================================================
// StackedCropModal — 업로드한 N장을 하나의 "연속 캔버스"로 세로 스택해 보여주고,
// 그 위에서 영역을 드래그해 잘라 지문으로 정의한다. 같은 "지문 번호"를 가진 영역들은
// (이미지 경계를 넘어서라도) 순서대로 이어붙여 한 지문이 된다.
//
// 기존의 (a) 이미지별 CropModal + (b) 별도 "여러 장 합치기"(MergeConfirmModal)를
// 하나로 통합한다 → "합치기"라는 개념/버튼이 사라지고, 연속 캔버스에서 크롭+번호만
// 매기면 곧 지문이 된다. (사용자 확정: 영역+번호 그룹핑)
//
// 재사용: CropCanvas(이미지 1장 박스 드로잉) × N, cropImageToBlob(영역→blob),
// stitchSlotsToBlob(여러 crop blob→1지문). 백엔드 계약(1슬롯=1지문) 불변.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crop, Loader2, X } from "lucide-react";

import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";
import { CropCanvas } from "./crop-canvas";
import { cropBoxLabel, cropImageToBlob, stitchSlotsToBlob } from "./crop-utils";

/** 그룹 배열을 첫 등장 순서대로 1..K 연속 번호로 정규화. */
function renumber(groups: number[]): number[] {
  const map = new Map<number, number>();
  let next = 1;
  return groups.map((g) => {
    if (!map.has(g)) map.set(g, next++);
    return map.get(g)!;
  });
}

interface FlatEntry {
  imageIndex: number;
  boxIndex: number;
  box: CropBox;
  group: number;
}

export function StackedCropModal({
  images,
  maxPassages,
  onCancel,
  onConfirm,
}: {
  /** 추출 대상 원본 이미지 슬롯들(연속 스택으로 렌더). */
  images: ClientPageSlot[];
  /** 최종 지문 수 상한(잡당 페이지 한도). 초과 시 모달 안에서 막는다. */
  maxPassages: number;
  onCancel: () => void;
  /** 잘라낸 지문 슬롯 배열. pageIndex는 호출부에서 재계산. */
  onConfirm: (passageSlots: ClientPageSlot[]) => void;
}) {
  // 이미지별 박스 + 박스별 지문 그룹(전역 번호 공유).
  const [boxesByImage, setBoxesByImage] = useState<CropBox[][]>(() =>
    images.map(() => []),
  );
  const [groupsByImage, setGroupsByImage] = useState<number[][]>(() =>
    images.map(() => []),
  );
  // 활성 박스 (imageIndex, boxIndex).
  const [active, setActive] = useState<{ i: number; j: number } | null>(null);
  // 체크된 영역 — "한 지문으로 묶기 / 따로 떼기" 대상 (flat key `i:j`).
  const [regionSel, setRegionSel] = useState<string[]>([]);
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

  // 모든 이미지의 박스를 (이미지순, 박스순) 평탄화. 그룹 정규화의 기준 순서.
  const flat = useMemo<FlatEntry[]>(() => {
    const out: FlatEntry[] = [];
    for (let i = 0; i < boxesByImage.length; i += 1) {
      const bs = boxesByImage[i] ?? [];
      for (let j = 0; j < bs.length; j += 1) {
        out.push({
          imageIndex: i,
          boxIndex: j,
          box: bs[j],
          group: groupsByImage[i]?.[j] ?? 0,
        });
      }
    }
    return out;
  }, [boxesByImage, groupsByImage]);

  const maxGroup = useMemo(
    () => flat.reduce((m, e) => Math.max(m, e.group), 0),
    [flat],
  );
  const passageCount = useMemo(
    () => new Set(flat.map((e) => e.group)).size,
    [flat],
  );

  // 전역 그룹 재정규화: flat 순서대로 1..K. 이미지별 구조로 되돌려 set.
  const applyRenumber = useCallback(
    (entries: FlatEntry[]) => {
      const renumbered = renumber(entries.map((e) => e.group));
      const next: number[][] = images.map(() => []);
      entries.forEach((e, idx) => {
        next[e.imageIndex][e.boxIndex] = renumbered[idx];
      });
      setGroupsByImage(next);
    },
    [images],
  );

  // CropCanvas(이미지 i)의 박스 변경 동기화 — 추가=새 지문(전역 maxGroup+1), 삭제=그룹 제거.
  const handleImageBoxesChange = useCallback(
    (i: number, nextBoxes: CropBox[]) => {
      const prev = boxesByImage[i] ?? [];
      const prevGroups = groupsByImage[i] ?? [];
      let nextGroups: number[];
      if (nextBoxes.length > prev.length) {
        nextGroups = [...prevGroups, maxGroup + 1]; // 새 영역 = 새 지문
        setRegionSel([]);
      } else if (nextBoxes.length < prev.length) {
        const removedIdx = prev.findIndex((b) => !nextBoxes.includes(b));
        nextGroups =
          removedIdx >= 0
            ? prevGroups.filter((_, k) => k !== removedIdx)
            : prevGroups.slice(0, nextBoxes.length);
        setRegionSel([]);
      } else {
        nextGroups = prevGroups; // 이동/리사이즈 — 그룹 불변
      }
      setBoxesByImage((cur) => cur.map((b, k) => (k === i ? nextBoxes : b)));
      setGroupsByImage((cur) => cur.map((g, k) => (k === i ? nextGroups : g)));
    },
    [boxesByImage, groupsByImage, maxGroup],
  );

  const toggleRegionSel = useCallback((key: string) => {
    setRegionSel((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const removeEntry = useCallback((i: number, j: number) => {
    setRegionSel([]);
    setActive(null);
    setBoxesByImage((cur) =>
      cur.map((b, k) => (k === i ? b.filter((_, idx) => idx !== j) : b)),
    );
    // 전역 그룹 번호이므로 이 이미지 그룹만 renumber하면 다른 이미지의 번호와
    // 충돌(의도치 않은 병합)할 수 있다 → 해당 항목만 제거하고 번호는 보존
    // (빈 번호는 생길 수 있으나 confirm은 그룹 집합 기준이라 무해).
    setGroupsByImage((cur) =>
      cur.map((g, k) => (k === i ? g.filter((_, idx) => idx !== j) : g)),
    );
  }, []);

  // 선택 영역들을 한 지문(첫 선택 영역 번호)으로 통합 — 이미지 경계 무관.
  const mergeSelected = useCallback(() => {
    if (regionSel.length < 2) return;
    const selSet = new Set(regionSel);
    const firstKey = flat.find((e) => selSet.has(`${e.imageIndex}:${e.boxIndex}`));
    if (!firstKey) return;
    const target = firstKey.group;
    applyRenumber(
      flat.map((e) =>
        selSet.has(`${e.imageIndex}:${e.boxIndex}`) ? { ...e, group: target } : e,
      ),
    );
    setRegionSel([]);
  }, [regionSel, flat, applyRenumber]);

  // 선택 영역들을 각각 별개 지문으로 분리.
  const splitSelected = useCallback(() => {
    if (regionSel.length === 0) return;
    const selSet = new Set(regionSel);
    let nextId = maxGroup;
    applyRenumber(
      flat.map((e) =>
        selSet.has(`${e.imageIndex}:${e.boxIndex}`)
          ? { ...e, group: ++nextId }
          : e,
      ),
    );
    setRegionSel([]);
  }, [regionSel, flat, maxGroup, applyRenumber]);

  // 박스가 하나도 없는 이미지(=크롭 안 한 장). confirm 시 통째로 1지문 포함해
  // 무경고 손실을 막는다.
  const uncroppedImageIdx = useMemo(() => {
    const used = new Set(flat.map((e) => e.imageIndex));
    return images.map((_, i) => i).filter((i) => !used.has(i));
  }, [flat, images]);
  const totalPassages = passageCount + uncroppedImageIdx.length;

  const handleConfirm = useCallback(async () => {
    if (totalPassages === 0 || busy) return;
    if (totalPassages > maxPassages) {
      setError(
        `지문이 너무 많습니다 (${totalPassages}개). 한 작업에는 최대 ${maxPassages}개까지 넣을 수 있습니다.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const slots: ClientPageSlot[] = [];
      const groupIds = Array.from(new Set(flat.map((e) => e.group))).sort(
        (a, b) => a - b,
      );
      for (const g of groupIds) {
        const items = flat
          .filter((e) => e.group === g)
          // 이어붙임 순서 = 읽기 순서: 이미지순 → 같은 이미지면 위→아래(y)→좌→우(x).
          // (그린 순서가 아니라 공간 순서로 정렬해 거꾸로 붙는 것 방지)
          .sort(
            (a, b) =>
              a.imageIndex - b.imageIndex ||
              a.box.y - b.box.y ||
              a.box.x - b.box.x,
          );
        if (items.length === 0) continue;
        // 각 영역을 해당 원본 이미지에서 잘라낸다(병렬). 경계 넘는 그룹도 OK —
        // 각 조각을 따로 자른 뒤 이어붙이므로.
        const crops = await Promise.all(
          items.map((it) =>
            cropImageToBlob(images[it.imageIndex].blob, it.box),
          ),
        );
        if (crops.length === 1) {
          const c = crops[0];
          createdUrls.current.push(c.previewUrl);
          slots.push({
            pageIndex: 0,
            blob: c.blob,
            previewUrl: c.previewUrl,
            bytes: c.blob.size,
            width: c.width,
            height: c.height,
            sourceFileName: `지문 ${g}`,
            kind: "crop",
            regionIndex: g,
          });
        } else {
          // 여러 조각(여러 이미지 가능)을 순서대로 이어붙여 1지문.
          const stitched = await stitchSlotsToBlob(
            crops.map((c) => c.blob),
            { maxWidth: 2480 },
          );
          // 중간 crop 미리보기 URL 정리.
          crops.forEach((c) => URL.revokeObjectURL(c.previewUrl));
          createdUrls.current.push(stitched.previewUrl);
          slots.push({
            pageIndex: 0,
            blob: stitched.blob,
            previewUrl: stitched.previewUrl,
            bytes: stitched.blob.size,
            width: stitched.width,
            height: stitched.height,
            sourceFileName: `지문 ${g} (${crops.length}조각 이어붙임)`,
            kind: "merged",
            regionCount: crops.length,
          });
        }
      }
      // 박스 없는 이미지는 통째로 1지문(무경고 손실 방지). 원본 슬롯을 그대로
      // 재사용 — previewUrl은 부모 소유라 여기서 revoke하지 않는다.
      for (const i of uncroppedImageIdx) {
        slots.push({
          ...images[i],
          pageIndex: 0,
          kind: "original",
          excludedFromExtraction: false,
        });
      }
      createdUrls.current = [];
      onConfirm(slots);
    } catch (err) {
      // 실패 시 이번 시도에서 만든 crop/stitch previewUrl 정리(누수 방지).
      createdUrls.current.forEach((u) => URL.revokeObjectURL(u));
      createdUrls.current = [];
      setError(
        err instanceof Error ? err.message : "영역을 잘라내지 못했습니다.",
      );
      setBusy(false);
    }
  }, [totalPassages, maxPassages, busy, flat, images, uncroppedImageIdx, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="연속 캔버스 영역 자르기"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Crop className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[13px] font-bold text-slate-950">
                지문 영역 나누기
              </h2>
              <p className="text-[11px] text-slate-500">
                올린 {images.length}장이 이어져 있습니다. 지문 부분을 드래그해
                선택하고, 한 지문이 여러 조각/장에 걸치면{" "}
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

        {/* 본문: 연속 캔버스(스크롤) + 영역 목록 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-0 space-y-2 overflow-y-auto border-b border-slate-100 bg-slate-50 p-2 md:border-b-0 md:border-r">
            {images.map((img, i) => (
              <div key={img.slotId ?? i} className="relative">
                <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {i + 1}장
                </div>
                <CropCanvas
                  imageUrl={img.previewUrl}
                  boxes={boxesByImage[i] ?? []}
                  onChange={(next) => handleImageBoxesChange(i, next)}
                  activeIndex={active?.i === i ? active.j : null}
                  onActiveIndexChange={(j) =>
                    setActive(j === null ? null : { i, j })
                  }
                  disabled={busy}
                  regionLabels={(groupsByImage[i] ?? []).map(String)}
                />
              </div>
            ))}
          </div>

          <aside className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-700">
                영역 {flat.length}개 · 지문 {passageCount}개
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
              {flat.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    이미지 위에서 드래그하면
                    <br />
                    영역이 추가됩니다.
                  </p>
                </div>
              ) : (
                flat.map((e) => {
                  const key = `${e.imageIndex}:${e.boxIndex}`;
                  const isActive =
                    active?.i === e.imageIndex && active.j === e.boxIndex;
                  const checked = regionSel.includes(key);
                  return (
                    <div
                      key={key}
                      className={
                        "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors " +
                        (checked
                          ? "border-blue-500 bg-blue-50/60"
                          : isActive
                            ? "border-blue-300 bg-blue-50/30"
                            : "border-slate-200 bg-white hover:bg-slate-50")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRegionSel(key)}
                        aria-label={`${e.imageIndex + 1}장 영역 선택`}
                        className="size-3.5 shrink-0 cursor-pointer accent-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setActive({ i: e.imageIndex, j: e.boxIndex })}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                      >
                        <span className="flex shrink-0 items-center justify-center rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-600">
                          {e.imageIndex + 1}장
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500">
                          {cropBoxLabel(e.box)}
                        </span>
                      </button>
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                        지문 {e.group}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(e.imageIndex, e.boxIndex)}
                        aria-label="영역 삭제"
                        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-slate-100 px-3 py-2 text-[10.5px] leading-relaxed text-slate-400">
              드래그=영역 · 안쪽 드래그=이동 · 핸들=크기조절
              <br />
              여러 조각/장이 한 지문이면{" "}
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
              {totalPassages === 0
                ? "선택한 영역이 없습니다."
                : `지문 ${totalPassages}개로 추출합니다.` +
                  (uncroppedImageIdx.length > 0
                    ? ` (크롭 안 한 ${uncroppedImageIdx.length}장은 통째로 포함)`
                    : "")}
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
              disabled={busy || totalPassages === 0}
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
                  지문 {totalPassages}개로 확정
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
