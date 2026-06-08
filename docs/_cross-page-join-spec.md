I now have every load-bearing detail verified against the actual code. Key confirmations:

- `setSlots` (store L187-194) auto-revokes URLs of dropped slots via `previewUrl` set-diff — design A's revoke claim is correct.
- `handleCropConfirm` L472-513 uses the exact source-exclude + position-insert pattern; the store is `useExtractionStore` (not `useIntakeStore` — that's `intake/store.ts`, currently unused for this flow).
- `stitchCropsToBlob(source: Blob, boxes)` takes ONE blob; a multi-blob variant is genuinely new.
- `slotKindLabel`/`isExtractable`/`isCroppable`/`isCropChild` are the shared helpers.
- `ClientPageSlot` has no `mergedFromSlotIds`/`crossPage`/`bundleKey` yet.
- `MAX_PAGES_PER_BUNDLE=4`, `BUNDLE_VIRTUAL_PAGE_BASE=-1000` exist as constants only.
- `startExtraction` filters `isExtractable` and reindexes (L393/398) — backend untouched by any client-stitch approach.

Now I'll write the architecture document.

---

# 여러 페이지/장에 걸친 "한 지문" 잇기 — 채택안 + 구현 스펙

대상: nara 리드 아키텍트 결정 문서. 강사(비개발자) 사용. 브랜치 `feature/extraction-adaptive-intake`. 플래그 `EXTRACTION_ADAPTIVE_INTAKE` 뒤.

---

## 1. 채택 결론

**1차 채택 = 접근 A(트레이 다중선택 → 클라 스티치) + 접근 C의 "교차 페이지 영역 정밀 크롭"을 흡수한 하이브리드.** B(백엔드 묶음 OCR)는 **2차로 보류**.

### 왜 A를 1차로

근거는 코드에서 직접 확인했다. `startExtraction`(index.tsx L393, L398)이 `slots.filter(isExtractable)` 후 `0..N-1`로 재인덱싱해 `startUpload`에 넘기고, 그 뒤(Supabase 업로드 → 페이지 코어 → Gemini)는 슬롯이 어떻게 만들어졌는지 전혀 모른다. 즉 **클라에서 N장을 1 blob으로 합쳐 `kind:"merged"` 슬롯 하나로 만들면, 백엔드는 그냥 "이미지 1장 = 1 page = OCR 1회 = 지문 1개"만 본다.** D1 제약(멱등성 `jobId:pageIndex`, `@@unique[jobId,pageIndex]`, `creditTxId`, SSE, 환불, pdf-splitter)을 **0줄 수정으로** 충족한다. 세 설계가 공통으로 도달한 결론이고, 코드가 이를 뒷받침한다.

- A·C 모두 백엔드 무변경·즉시 구현 가능. B는 `runOcrForPage` 단일→배열 확장 + job 카운터(`successPages`/`pendingPages`/`maybe-finalize`/reaper)의 "page=단위" 가정 보정이 필요해 3~5일 + 회귀 위험 최고. B 자신의 자기비판(약점1)이 "시그니처는 안 바꿔도 의미론적으로 코어를 침범한다"고 인정.
- **강사 대상**에는 "합치기 결과를 눈으로 보고 확정"하는 가시성이 중요하다. A·C는 stitch 이미지를 확인 모달에서 미리 본다. B는 합성이 Gemini 블랙박스 안에서 일어나 사후 검증 불가(B 약점2).

### 왜 A와 C를 합치는가 (단순 A 단독이 아닌 이유)

A(트레이 다중선택)와 C(교차 페이지 크롭 세션)는 **경쟁이 아니라 입력 정밀도 차이**다. 둘 다 종착점이 `stitch...ToBlob` → `kind:"merged"` 슬롯 1개로 동일하다.

- **A 경로(통짜 합치기)**: 페이지 경계가 깔끔할 때 — 트레이에서 슬롯 통째로 2장 골라 합치기. 제스처 1회.
- **C 경로(영역 정밀 합치기)**: 1p에 "지문 꼬리 + 다른 지문 머리"가 섞였을 때 — 먼저 각 페이지에서 필요한 영역만 크롭해두고(기존 크롭 라이프사이클), 그 crop 슬롯들을 A의 다중선택으로 합치면 된다.

즉 **C의 가치(영역 정밀도)는 "기존 크롭 → A 다중선택 합치기" 조합으로 이미 달성된다.** crop-modal을 "다중 페이지 세션"으로 개조(C의 핵심 작업, crop-modal.tsx를 300줄→400줄로 키우고 단일 `slot`→`slots[]` prop 시그니처 변경)하는 큰 리팩터는 1차에서 **하지 않는다**. A의 `stitchSlotsToBlob`은 입력이 blob 배열이라 crop/merged/original/source-아닌-것을 다 섞어 합칠 수 있으므로(crop-utils의 `createImageBitmap` 경로 동일), C가 풀려는 케이스를 모달 개조 없이 흡수한다.

### 단계 구성

| 단계 | 범위 | 백엔드 | 기간감 |
|---|---|---|---|
| **1차 (지금)** | A: 트레이 다중선택 + `stitchSlotsToBlob` + merged 치환 + 확인/순서/되돌리기. C는 "기존 크롭 후 합치기" 조합으로 흡수 | 0줄 | 소 |
| **2차 (조건부)** | B: 백엔드 묶음 OCR(D4) — 긴 이미지 OCR 충실도가 벤치에서 무너질 때만 | `runOcrForPage` 배열화 + 카운터 보정 | 중 |

핵심 위험은 세 설계가 만장일치로 지목: **매우 긴 stitched 이미지 1장의 verbatim 충실도가 Gemini 입력 다운스케일에 인질로 잡힌다(제약에 "미검증" 명시).** 1차는 `stitchSlotsToBlob`에 `maxWidth` 가드 + 장수 상한 + 경고로 완화하고, 벤치 결과가 나쁘면 그때 B로 승격(§4).

---

## 2. 1차 구현 스펙 (지금 바로)

신규 파일 1개 + 기존 파일 5개 수정. 모두 `adaptiveIntake`(= `onCropSlot != null` 패턴) 플래그 뒤. 백엔드 0줄.

### 2.0 변경 파일 목록

| 파일 | 작업 |
|---|---|
| `intake/crop/crop-utils.ts` | `stitchSlotsToBlob(blobs, opts)` 신규 (기존 `stitchCropsToBlob` 사촌) |
| `lib/extraction/types.ts` | `ClientPageSlot`에 `mergedFromSlotIds?: string[]` 1필드 추가(되돌리기용) |
| `bulk-extract-client/index.tsx` | 선택 상태 3개 + `handleMergeSelected`/`handleUnmerge` + 콜백 배선 + 확인 모달 렌더 |
| `bulk-extract-client/components/upload-panel.tsx` | 선택 모드 토글 + 체크박스 오버레이 + 합치기 액션바 + merged 되돌리기 버튼 |
| `intake/crop/slot-meta.ts` | `merged` 배지에 "이어붙인 지문 · N장" 분기, `source` 배지 맥락 분기 |
| `intake/crop/merge-confirm-modal.tsx` | **신규** — stitch 프리뷰 + 순서 재정렬 + 확정 |

### 2.1 `crop-utils.ts` — `stitchSlotsToBlob` 신규

기존 `stitchCropsToBlob`(L181)은 `source: Blob` 한 장의 박스들을 잇는다. 신규는 **N개 독립 blob**을 받는다. 나머지(EXIF 보정 `imageOrientation:"from-image"`, 최대폭 캔버스, 흰 배경, 세로 누적)는 동일.

```ts
/**
 * 여러 독립 이미지(blob)를 순서대로 세로로 이어붙여 단일 이미지(=한 지문)로 만든다.
 * 페이지 경계를 넘는 "한 지문"을 1개 슬롯=1 OCR로 추출하기 위함 (접근 A).
 * blob 순서 = 읽기 순서(1→2→…). 폭이 다르면 좌측 정렬, 최대 폭 기준 캔버스.
 * maxWidth 초과 시 비율 유지 다운스케일(긴 이미지 OCR 다운스케일 가드).
 */
export async function stitchSlotsToBlob(
  blobs: Blob[],
  opts?: { quality?: number; mime?: string; gap?: number; maxWidth?: number },
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  if (blobs.length === 0) throw new Error("이어붙일 이미지가 없습니다.");
  const gap = Math.max(0, opts?.gap ?? 0);
  const bitmaps = await Promise.all(
    blobs.map((b) => createImageBitmap(b, { imageOrientation: "from-image" })),
  );
  try {
    const rawWidth = Math.max(1, ...bitmaps.map((b) => b.width));
    // maxWidth 가드: A4 300dpi 폭(2480) 권장. 본문 글자 뭉개짐 방지 상한.
    const scale =
      opts?.maxWidth && rawWidth > opts.maxWidth ? opts.maxWidth / rawWidth : 1;
    const width = Math.round(rawWidth * scale);
    const heights = bitmaps.map((b) => Math.round(b.height * scale));
    const height =
      heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, bitmaps.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 사용할 수 없습니다.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    bitmaps.forEach((b, i) => {
      const w = Math.round(b.width * scale);
      const h = heights[i];
      ctx.drawImage(b, 0, 0, b.width, b.height, 0, y, w, h); // 좌측 정렬
      y += h + gap;
    });

    const mime = opts?.mime ?? "image/jpeg";
    const quality = opts?.quality ?? 0.92;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이어붙이기에 실패했습니다."))),
        mime,
        quality,
      );
    });
    return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
  } finally {
    bitmaps.forEach((b) => b.close?.());
  }
}
```

> `maxWidth` 기본값은 호출부(확인 모달)에서 `2480`(A4 300dpi 폭) 전달 권장. 근거 수치가 아닌 보수적 가드값이며, §4의 벤치로 조정.

### 2.2 `types.ts` — `ClientPageSlot` 필드 1개 추가 (additive)

되돌리기를 "merged 삭제 + 재료 원복"으로 정확히 하려면 재료 slotId 배열이 필요하다. 기존 단수 `sourceSlotId`로는 N개 부모를 못 가리킨다. 서버 무시 필드(L74 주석대로 "서버 업로드 시 무시됨").

```ts
  /** merged(트레이 합치기): 이어붙인 재료 슬롯들의 slotId[] (읽기순). 되돌리기·중복방지용. */
  mergedFromSlotIds?: string[];
```

이 1필드만 추가하면 깨끗한 undo가 된다. (필드 없이 가려면 "merged 삭제 + 재료 수동 복구"로 타협 가능하나, 강사 대상이라 자동 undo를 권장.)

### 2.3 `index.tsx` — 상태 + 핸들러 + 배선

선택 식별은 **slotId 기준**(치환·재정렬로 인덱스가 흔들리므로). 모든 슬롯에 `slotId`가 부여됨(appendSlots L226, crop L496-497).

상태 3개 추가:
```ts
const [selectMode, setSelectMode] = useState(false);
const [mergeSelection, setMergeSelection] = useState<string[]>([]); // slotId, 클릭 순서
const [mergePreview, setMergePreview] = useState<{
  blob: Blob; url: string; width: number; height: number;
  materials: ClientPageSlot[]; // 클릭 순서 정렬된 재료
} | null>(null);
```

선택 토글/모드 콜백:
```ts
const toggleSelectMode = useCallback(() => {
  setSelectMode((p) => !p);
  setMergeSelection([]);
}, []);

const toggleSlotSelect = useCallback((slotId: string) => {
  setMergeSelection((prev) =>
    prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
  );
}, []);
```

합치기 실행(확인 모달 오픈 — 클릭 순서대로 stitch 미리 생성):
```ts
const handleOpenMergePreview = useCallback(async () => {
  // 클릭 순서 = 읽기 순서. slotId → slot 매핑(추출 가능한 것만).
  const materials = mergeSelection
    .map((id) => slots.find((s) => s.slotId === id))
    .filter((s): s is ClientPageSlot => !!s && isExtractable(s));
  if (materials.length < 2) return;
  try {
    const { blob, width, height, previewUrl } = await stitchSlotsToBlob(
      materials.map((s) => s.blob),
      { maxWidth: 2480 },
    );
    setMergePreview({ blob, url: previewUrl, width, height, materials });
  } catch (err) {
    setError(err instanceof Error ? err.message : "이어붙이기에 실패했습니다.");
  }
}, [mergeSelection, slots, setError]);
```

확인 모달의 "이 순서로 합치기" 확정(순서는 모달이 reorder한 최종 materials를 다시 넘김 → re-stitch):
```ts
const handleConfirmMerge = useCallback(
  (orderedMaterials: ClientPageSlot[], finalBlob: Blob, finalUrl: string,
   width: number, height: number) => {
    const matIds = new Set(orderedMaterials.map((s) => s.slotId));
    // 재료들을 source+excluded로, 첫 재료 위치에 merged 1개 삽입.
    const firstIdx = slots.findIndex((s) => matIds.has(s.slotId));
    const next = slots.map((s) =>
      matIds.has(s.slotId)
        ? { ...s, kind: "source" as const, excludedFromExtraction: true }
        : s,
    );
    const merged: ClientPageSlot = {
      pageIndex: 0, // 재인덱싱으로 덮임
      blob: finalBlob,
      previewUrl: finalUrl,
      bytes: finalBlob.size,
      width, height,
      sourceFileName: `이어붙인 지문 · ${orderedMaterials.length}장`,
      slotId: crypto.randomUUID(),
      kind: "merged",
      regionCount: orderedMaterials.length, // = 합친 장수
      mergedFromSlotIds: orderedMaterials.map((s) => s.slotId!),
    };
    next.splice(firstIdx + 1, 0, merged); // 첫 재료 바로 뒤(크롭 패턴 동일)
    setSlots(next.map((s, i) => ({ ...s, pageIndex: i })));
    setMergePreview(null);
    setSelectMode(false);
    setMergeSelection([]);
  },
  [slots, setSlots],
);
```

> **revoke 주의**: 확인 모달 취소 시 `mergePreview.url`은 모달이 소유·revoke(crop-modal 패턴). 확정 시엔 호출부 소유로 넘어가고, 이후 merged 슬롯이 `setSlots`의 revoke-diff(store L187-194)로 자동 관리. 단 `handleOpenMergePreview`에서 만든 url을 확정 시 그대로 `finalUrl`로 쓰면 모달 내 re-stitch와 충돌하니, **모달 내부 reorder 시 새 stitch를 만들고 이전 preview url은 모달이 revoke**(아래 2.6).

되돌리기:
```ts
const handleUnmerge = useCallback((mergedSlotId: string) => {
  const merged = slots.find((s) => s.slotId === mergedSlotId);
  if (!merged || merged.kind !== "merged") return;
  const restoreIds = new Set(merged.mergedFromSlotIds ?? []);
  const next = slots
    .filter((s) => s.slotId !== mergedSlotId) // merged 제거(setSlots가 url revoke)
    .map((s) =>
      restoreIds.has(s.slotId!)
        ? { ...s, kind: "original" as const, excludedFromExtraction: false }
        : s,
    );
  setSlots(next.map((s, i) => ({ ...s, pageIndex: i })));
}, [slots, setSlots]);
```

> **주의**: 재료가 원래 `crop` 슬롯이었으면 `kind:"original"`로 되돌리는 건 부정확하다. 정확히 하려면 merged 슬롯에 재료의 원래 `kind`도 보관해야 한다. 1차 타협: 재료는 "통짜 페이지(original) 또는 source"로만 합치도록 유도하고(crop 슬롯 합치기는 허용하되 되돌릴 때 `original`로 복귀 — crop은 이미 자식이라 약간의 메타 손실 감수), 또는 `mergedFromSlotIds` 대신 **재료 슬롯 스냅샷 배열**을 보관. 1차에서는 §6 결정사항으로 둔다.

배선(UploadPanel props 추가, CropModal/SlotPreviewModal 렌더 뒤에 MergeConfirmModal 추가):
```tsx
<UploadPanel
  /* ...기존... */
  selectMode={adaptiveIntake ? selectMode : undefined}
  mergeSelection={adaptiveIntake ? mergeSelection : undefined}
  onToggleSelectMode={adaptiveIntake ? toggleSelectMode : undefined}
  onToggleSlotSelect={adaptiveIntake ? toggleSlotSelect : undefined}
  onOpenMergePreview={adaptiveIntake ? handleOpenMergePreview : undefined}
  onUnmerge={adaptiveIntake ? handleUnmerge : undefined}
/>
{adaptiveIntake && mergePreview ? (
  <MergeConfirmModal
    initial={mergePreview}
    onCancel={() => { URL.revokeObjectURL(mergePreview.url); setMergePreview(null); }}
    onConfirm={handleConfirmMerge}
  />
) : null}
```

### 2.4 `upload-panel.tsx` — 선택 모드 / 체크박스 / 액션바

기존 dragReorder와 **상호배제**가 가장 까다로운 지점(A 자기비판이 지목). `selectMode`일 때:
- 썸네일 `draggable={false}` (드래그 순서변경 차단)
- 크롭/삭제 버튼 숨김 (`!selectMode &&`로 감쌈)
- 체크박스 오버레이 표시 + 클릭 순서 배지(①②…)
- `isExtractable(slot) === false`인 재료/excluded 슬롯은 체크박스 비활성(선택 후보 제외 — `stitchSlotsToBlob` 가드와 일치)

헤더에 토글 추가(비우기 버튼 옆, slots≥2일 때만):
```tsx
{onToggleSelectMode != null && slots.length >= 2 ? (
  <button type="button" onClick={onToggleSelectMode}
    className={"...slate/blue 톤..." + (selectMode ? "bg-blue-50 text-blue-700 ring-blue-200" : "...")}>
    <Layers className="size-3.5" /> {/* 또는 Combine 아이콘. Sparkles/주황 금지 */}
    여러 장 합치기
  </button>
) : null}
```

체크박스 오버레이(썸네일 좌상단, `selectMode` 시):
```tsx
{selectMode ? (
  <button type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation();
      if (isExtractable(slot) && slot.slotId) onToggleSlotSelect?.(slot.slotId); }}
    disabled={!isExtractable(slot)}
    className="absolute left-1 top-1 z-10 inline-flex size-5 items-center justify-center rounded ...">
    {selectionOrder >= 0
      ? <span className="...bg-blue-600 text-white...">{selectionOrder + 1}</span>
      : <span className="...border-slate-300 bg-white/90..." />}
  </button>
) : null}
```
`selectionOrder = mergeSelection.indexOf(slot.slotId)`.

merged 슬롯엔 "되돌리기" 버튼(크롭 버튼 자리, `slot.kind === "merged"`일 때):
```tsx
{onUnmerge && slot.kind === "merged" && !selectMode ? (
  <button onClick={() => onUnmerge(slot.slotId!)} className="...slate 톤...">
    <Undo2 className="size-3.5" /> 합치기 되돌리기
  </button>
) : null}
```

하단 합치기 액션바(`selectMode` 시, 기존 추출요약 위에):
```tsx
{selectMode ? (
  <div className="flex shrink-0 items-center justify-between rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px]">
    <span className="font-bold text-slate-700">
      {mergeSelection.length}장 선택됨{mergeSelection.length >= 2 ? " · 클릭 순서대로 이어붙입니다" : " · 2장 이상 고르세요"}
    </span>
    <div className="flex items-center gap-2">
      <button onClick={() => onToggleSlotSelect && setMergeSelection를비움} ...>선택 해제</button>
      <button disabled={mergeSelection.length < 2} onClick={onOpenMergePreview}
        className="...bg-blue-600 text-white disabled:bg-blue-300">
        선택한 {mergeSelection.length}장을 한 지문으로 합치기
      </button>
    </div>
  </div>
) : null}
```

> 톤은 기존 crop merge 패널 그대로 `accent-blue-600`/`bg-blue-50`/slate·blue. 주황·Sparkles 없음(MEMORY 규칙).

### 2.5 `slot-meta.ts` — 배지 분기

`merged` 케이스에 "장 합치기"와 "영역 이어붙이기"를 구분. 현재는 `regionCount`만 본다. `mergedFromSlotIds` 유무로 분기:
```ts
case "merged":
  return {
    text: slot.mergedFromSlotIds?.length
      ? `이어붙인 지문 · ${slot.mergedFromSlotIds.length}장`   // 트레이 합치기(A)
      : slot.regionCount
        ? `이어붙인 지문 · ${slot.regionCount}영역`            // 크롭 모달 합치기(기존)
        : "이어붙인 지문",
    className: "bg-blue-50 text-blue-700 ring-blue-100",
  };
```
`source` 배지는 맥락 분기 가능하나(크롭 떠낸 원본 vs 합치기 재료), 1차에선 기존 "잘라낸 원본 · 추출 제외"를 "이어붙임 재료 · 추출 제외"로 일반화하거나 현행 유지. **현행 유지 권장**(추가 메타 없이 구분 불가하고, 둘 다 "추출 제외"라 사용자 영향 동일).

### 2.6 `merge-confirm-modal.tsx` — 신규 (crop-modal 축소판)

stitch 프리뷰(세로 1장) + 순서 리스트(▲▼ 재정렬) + 긴 이미지 경고 + 확정. 순서 변경 시 re-stitch.

```tsx
"use client";
export function MergeConfirmModal({
  initial, onCancel, onConfirm,
}: {
  initial: { blob: Blob; url: string; width: number; height: number; materials: ClientPageSlot[] };
  onCancel: () => void;
  onConfirm: (ordered: ClientPageSlot[], blob: Blob, url: string, w: number, h: number) => void;
}) {
  const [ordered, setOrdered] = useState(initial.materials);
  const [preview, setPreview] = useState(initial); // {blob,url,width,height}
  const [busy, setBusy] = useState(false);
  // 순서 바꾸면 re-stitch + 이전 url revoke.
  const restitch = useCallback(async (next: ClientPageSlot[]) => {
    setBusy(true);
    const res = await stitchSlotsToBlob(next.map((s) => s.blob), { maxWidth: 2480 });
    setPreview((prev) => { URL.revokeObjectURL(prev.url); return res; });
    setOrdered(next); setBusy(false);
  }, []);
  const move = (i: number, dir: -1 | 1) => { /* swap i, i+dir → restitch */ };
  // height 임계 경고 (가드값; 벤치 전 보수치)
  const tooTall = preview.height > 5000;
  return (/* 헤더 "여러 장을 한 지문으로 합치기" + 좌:프리뷰 img + 우:순서리스트 ▲▼ +
            tooTall이면 경고 배너 "글자가 작아져 정확도가 떨어질 수 있습니다 —
            장수를 줄이거나 영역만 잘라 합치세요" +
            푸터 [취소][이 순서로 합치기] → onConfirm(ordered, preview.blob, preview.url, w, h) */);
}
```

> 확정 시 `preview.url`을 그대로 넘기므로 모달은 그 url을 revoke하지 않는다(호출부 소유). 취소·언마운트 시에만 revoke.

---

## 3. 엣지케이스 처리

**순서 보장.** 진실 = 클릭 순서(`mergeSelection` 배열). 확인 모달 ▲▼로 최종 교정. 트레이 물리 순서와 무관 → "3페이지 먼저, 1페이지 나중" 역순도 자연 지원. stitch는 항상 `ordered` 배열 순.

**크롭 + 페이지 혼합.** `stitchSlotsToBlob`은 blob만 받으므로 crop/merged/original/source-아닌-것 다 섞어 합쳐도 동작(이게 C를 모달 개조 없이 흡수하는 지점). **단 `isExtractable === false`(이미 재료로 소비된 source, excluded)는 선택 후보에서 제외**(체크박스 비활성). 이미 만든 merged를 또 다른 merge의 재료로 쓰는 **중첩은 1차에서 막는다**(merged도 isExtractable=true지만, 중첩 추적 복잡도 회피 위해 선택 후보에서 `kind==="merged"` 제외 권장). → §6 결정.

**3장 이상.** N개 그대로 세로 누적. 가드: `MAX_PAGES_PER_BUNDLE=4`를 **클라 합치기 권장 상한**으로 재활용(이 상수의 의도된 용도와 일치 — 주석 L114). 5장+ 선택 시 액션바에 경고 "한 번에 4장까지 권장 — 더 많으면 글자가 작아질 수 있습니다"(하드 차단 아닌 soft). `MAX_PAGES_PER_JOB=30`은 `isExtractable` 카운트만 세므로(`startExtraction` L393) 합치기는 한도를 **줄인다** — 재료가 excluded라 30 한도 미소비.

**긴 이미지 OCR 한도 → 언제 백엔드 묶음(B)으로 승격.** A의 급소. 통짜 A4 2장 세로 합치면 raw ~5000px+, Gemini 입력 리사이저(긴 변 기준 다운스케일)에서 본문 글자 뭉개짐 위험. 1차 완화:
1. `stitchSlotsToBlob`의 `maxWidth:2480`로 폭 제어(높이는 비율 유지).
2. 확인 모달의 `height > 5000` 경고(보수적 가드값, 벤치로 확정).
3. 추출 후 finalize의 **기존 길이 휴리스틱**(`IncompleteReason.LENGTH`, types.ts L317) 재활용 — "이어붙인 지문이 비정상적으로 짧게 나옴" 감지 시 리뷰 플래그. 신규 백엔드 코드 0.

승격 조건(→ §4): **벤치에서 "통짜 2장 합치기" verbatim 정확도가 페이지별 따로 OCR 대비 유의하게 떨어지면**, 또는 사용자 리뷰에서 `LENGTH` 플래그 빈도가 높으면 B로 전환. 그때 A의 "통짜 합치기"만 B로 라우팅하고(영역 정밀 합치기는 stitch 유지), UI는 "합치기" 한 단어로 통일 노출.

**잘못 합침 풀기.** 추출 전: merged 슬롯 "합치기 되돌리기" 버튼(`handleUnmerge`) → 재료 원복 + merged url revoke. 1차 게이트는 확인 모달(합치기 전 프리뷰). 추출 후 발견 시엔 재추출 필요(A 약점2 — provenance가 OCR 경계에서 소실, B 대비 구조적 한계). merged 슬롯 직접 삭제(`removeSlot`) 시 **재료가 excluded인 채 고아가 됨** → `removeSlot`에 "merged 삭제 시 `mergedFromSlotIds` 원복" 로직 추가 필요(누락하면 재료가 영영 추출 제외). 이건 C 설계도 동일하게 경고한 함정.

```ts
// removeSlot 보강: merged 삭제면 재료 원복 후 제거.
const removeSlot = useCallback((index: number) => {
  const target = slots[index];
  let working = slots;
  if (target?.kind === "merged" && target.mergedFromSlotIds?.length) {
    const restore = new Set(target.mergedFromSlotIds);
    working = slots.map((s) =>
      restore.has(s.slotId!) ? { ...s, kind: "original" as const, excludedFromExtraction: false } : s);
  }
  const next = working.filter((_, i) => i !== index).map((s, i) => ({ ...s, pageIndex: i }));
  setSlots(next);
  if (next.length === 0) { setSourceName(null); setSourceType(null); setError(null); }
}, [slots, setSlots, setError]);
```

**메모리/OOM.** 다장 고해상 stitch는 캔버스 OOM 위험(저사양 노트북). `maxWidth` + 장수 상한으로 방어. merged blob url은 `setSlots` revoke-diff(store L187-194)가 자동 회수 — 확인됨.

---

## 4. 2차: 백엔드 묶음 OCR(D4)로 승격 — 조건과 인터페이스

### 승격 트리거 (둘 중 하나)
1. **벤치 실패**: "통짜 페이지 2~4장 stitch 1콜" verbatim 정확도가 "페이지별 따로 OCR" 대비 유의하게 낮음(경계 누락/후반 요약). 벤치 스크립트는 기존 `scripts/bench-*.ts` 패턴 재사용.
2. **운영 신호**: merged 결과의 `IncompleteReason.LENGTH` 플래그 빈도가 임계 초과.

### 인터페이스 (B 설계 채택, 단 음수 가상 pageIndex는 **불채택**)

B 설계의 가장 중요한 통찰: **음수 가상 pageIndex(`BUNDLE_VIRTUAL_PAGE_BASE=-1000`)를 쓰지 말고, "lead 행 = 실제 page 겸 묶음 대표, member 행 = 디스패치 제외"로 설계**하면 `idempotencyKey=jobId:pageIndex`와 `@@unique[jobId,pageIndex]`를 글자 그대로 보존한다(`@@unique`가 `pageIndex>=0` 암묵 가정에 의존할 수 있으므로 음수는 위험). 이건 설계 문서 §10-6 우려를 회피하는 안전한 변형이다. **따라서 `BUNDLE_VIRTUAL_PAGE_BASE` 상수는 2차에서도 미사용 권고.**

스키마(additive, 전부 NULL/DEFAULT — D1 준수):
- `ExtractionPage.bundleKey String?` — 묶음 멤버 공통키 (null=기존 단일 경로)
- `ExtractionPage.bundleRole String?` — `"lead" | "member"` (lead만 OCR 콜)
- `ExtractionPage.spanPageIndices Int[] @default([])` — lead 행: 함께 보낼 실제 pageIndex들(읽기순)
- `ExtractionResult/Item.sourcePageIndex Int[]` — **이미 존재**(types.ts L133, L150). 묶음 결과는 `[0,1]`로 채움. 무변경.

클라(`ClientPageSlot`)에 2필드 추가(서버가 읽음 — 1차의 `mergedFromSlotIds`와 달리 전송됨):
- `bundleKey?: string | null` — 같은 키 슬롯이 1콜 1지문
- `bundleOrder?: number` — 묶음 내 읽기 순서(OCR 이어붙임 정렬키)

코어 변경 지점(실측 파일):
- `extraction-orchestrator.ts` (L68 items): `bundleRole !== "member"`만 디스패치(filter 1줄).
- `extraction-page.ts` (L56 Input): `spanPageIndices?: number[]` 추가.
- `ocr-dispatch.ts` (`runOcrForPage`, 단일 `imageUrl` → `imageUrls: string[]`): N장 다운로드 → 멀티이미지 inlineData. **여기가 실작업 핵심.**
- createJob(`create-job.ts` createMany + 예약 산식): bundle 필드 저장 + lead 결정(`bundleOrder` 최솟값=lead) + 예약을 `(lead+solo)×3`로 조정.
- **카운터 보정(가장 미묘, B 약점1)**: `successPages`/`pendingPages`/`maybe-finalize`/reaper가 "page 행 개수"를 센다 → member 행을 `SKIPPED`로 빼는 보정을 **4곳 일관 적용**. 한 곳만 빠져도 job이 PROCESSING에 영영 갇힘. 1차를 A로 가는 가장 큰 이유.

승격 시 마이그레이션 비용: **A의 클라 자산은 그대로 재사용.** 트레이 다중선택 UI(`selectMode`/체크박스/액션바)는 동일하고, "합치기 실행"의 종착만 `stitchSlotsToBlob`(클라 합성) → `bundleKey` 부여(메타 표식)로 분기. 즉 A를 먼저 만들어도 B로 갈 때 UI를 버리지 않는다.

---

## 5. 사용자에게 보일 안내 문구 (강사용, 친절)

선택 모드 진입 시 트레이 상단:
> **합칠 장을 순서대로 클릭하세요.** 클릭한 순서대로 위→아래로 이어붙여 한 개 지문으로 만듭니다.

액션바(2장 미만):
> 2장 이상 골라 주세요.

액션바(2장 이상):
> **{N}장 선택됨** · 클릭 순서대로 이어붙입니다

확인 모달 헤더/본문:
> **여러 장을 한 지문으로 합치기**
> 선택한 {N}장을 위→아래 순서로 이어 한 개 지문으로 추출합니다. 추출 비용도 한 개로 계산됩니다.

긴 이미지 경고(`tooTall`):
> 합친 이미지가 길어 글자가 작아질 수 있습니다. 정확도가 떨어지면 **장수를 줄이거나, 페이지에서 필요한 부분만 잘라 합쳐** 보세요.

합치기 후 merged 배지:
> 이어붙인 지문 · {N}장

재료(source) 배지:
> 잘라낸 원본 · 추출 제외 *(현행 유지)*

되돌리기 버튼:
> 합치기 되돌리기

추출 요약(기존 패널 재사용):
> 추출 대상 지문 {extractableCount}개 · 잘라낸 원본 {excludedCount}개 제외

빈/1장 선택 시 합치기 버튼: 비활성(2장 미만).

> 모든 문구 slate-700/blue-600 톤. 주황·Sparkles·이모지 없음(MEMORY 규칙 준수).

---

## 6. 미해결 / 결정 필요

**(1) 되돌리기 시 재료의 원래 `kind` 복원 정확도.** `handleUnmerge`/`removeSlot`이 재료를 `kind:"original"`로 되돌리는데, 재료가 원래 `crop`(크롭 자식) 또는 `source`였으면 부정확하다(crop 슬롯을 합치면 그 부모 source와의 관계가 끊김). **결정 필요**: (a) 1차에선 "통짜 페이지/원본만 합치기 권장"으로 UX 유도하고 crop 합치기는 되돌릴 때 `original`로 복귀(메타 손실 감수), 또는 (b) `mergedFromSlotIds` 대신 **재료 슬롯 전체 스냅샷 배열**을 merged에 보관해 정확 복원. (b)가 정확하나 메모리·복잡도 증가. **권장: 1차는 (a) + "이미 합친 지문은 다시 합치지 않기"(중첩 금지)로 단순화**, 강사 인지부하 최소화. 정확 복원이 필요하단 피드백이 오면 (b).

**(2) 긴 이미지 OCR 충실도 임계 — 벤치 없이 가드값이 추측.** `maxWidth:2480`, `height>5000` 경고는 **근거 수치가 아닌 보수적 가드**다(A4 300dpi 폭에서 유도했을 뿐, Gemini Flash의 실제 다운스케일 임계는 제약에 "미검증"으로 명시). **결정 필요**: 1차 출시 전 최소 벤치 1회 — "통짜 A4 2장 stitch 1콜" vs "2장 따로 OCR 후 텍스트 결합"의 verbatim 일치율을 실제 모의고사 지문으로 측정해 `maxWidth`/경고 임계를 확정하고, 결과가 나쁘면 §4 B 승격을 1차에 포함할지 재판단. 이 벤치 결과가 A 단독으로 충분한지 vs B가 즉시 필요한지를 가르는 유일한 객관 신호다.

---

### 관련 파일 (절대경로)
- `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\intake\crop\crop-utils.ts` — `stitchSlotsToBlob` 신규(L181 `stitchCropsToBlob` 사촌)
- `c:\Users\jooye\Desktop\2026project\nara\src\lib\extraction\types.ts` — `ClientPageSlot.mergedFromSlotIds?: string[]` 추가(L90 부근)
- `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\bulk-extract-client\index.tsx` — 상태 3개 + `handleOpenMergePreview`/`handleConfirmMerge`/`handleUnmerge` + `removeSlot` 보강 + MergeConfirmModal 배선(크롭 패턴 L472-513 차용)
- `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\bulk-extract-client\components\upload-panel.tsx` — 선택 모드/체크박스/액션바/되돌리기 버튼(드래그와 상호배제)
- `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\intake\crop\slot-meta.ts` — merged 배지 "N장" 분기
- `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\intake\crop\merge-confirm-modal.tsx` — **신규**(crop-modal.tsx 축소판)
- (2차) `c:\Users\jooye\Desktop\2026project\nara\src\trigger\_lib\extraction-page\ocr-dispatch.ts` · `src\trigger\extraction-orchestrator.ts` · `src\trigger\extraction-page.ts` · `src\app\api\extraction\jobs\_lib\create-job.ts` — D4 묶음 OCR
- 상수: `c:\Users\jooye\Desktop\2026project\nara\src\lib\extraction\constants.ts` — `MAX_PAGES_PER_BUNDLE=4`(클라 합치기 권장 상한으로 재활용), `BUNDLE_VIRTUAL_PAGE_BASE`(1·2차 모두 미사용 권고)

**검증 결론**: 1차(A)는 `startExtraction`(index.tsx L393/398)의 `isExtractable` 필터 + 0..N-1 재인덱싱 덕에 merged 슬롯이 평범한 1 page로 업로드되어, 페이지 코어·멱등성·과금·SSE·환불·pdf-splitter를 **0줄 수정**으로 충족한다(D1 무위배). 합치기는 `startUpload` 이전 클라 단계에서 종결된다.
