Confirmed: `use-extraction-upload.ts` sends `slot.bytes` with no size re-validation. The merged blob (which can exceed 5MB `MAX_PAGE_IMAGE_BYTES`) is never validated client-side before upload — only the original image files are checked at `handleFiles` (index.tsx:372-374). This is a genuine, verified gap. The server-side zod schema would reject it, producing a confusing post-confirm failure.

I now have all ground truth verified. Writing the report.

---

## 1. 한줄 결론 (정직하게)

크롭/합치기/미리보기 **프론트엔드 코어(R1~R4, R6~R9)는 실제로 동작하는 수준으로 구현되어 있고, 사용자 지적 9건 중 7건은 충족**된다. 다만 **R5(원문 vs AI복원 사용자 선택)는 미구현이 명백**하고(P7 예정으로 정직하게 표시됨), **반드시 고쳐야 할 실버그는 단 2건(합친 이미지 5MB 미검증 → 추출 직전 서버 거부 / merged 배지·언머지 kind 비일관)**뿐이다. 중요: **제출된 5개 감사 중 1개(#5)는 "Prisma 칼럼·크레딧 단가·types가 전부 없다"고 다수의 high 버그를 보고했으나, 실제 코드에는 전부 존재한다 — 이 감사의 high 항목 다수는 오탐(false positive)이다.** 따라서 "스키마부터 새로 깔아야 한다"는 결론은 사실과 다르다.

## 2. 사용자 지적 9건(R1~R9) 충족 현황

| ID | 요구 | 판정 | 근거 (검증한 file:line) |
|----|------|------|------|
| R1 | 친절한 안내(배지/그룹/출처) | **partial** | `slot-meta.ts:14-38`(kind별 배지 텍스트+톤), `upload-panel.tsx:461-470`(배지 렌더), `slot-preview-modal.tsx:109-113`(원본 안내문). 배지·안내문은 있으나 hover tooltip/contextual 도움말은 없음 |
| R2 | 클릭 확대 미리보기 + 크롭 오버레이 | **satisfied** | `slot-preview-modal.tsx:85-106`(max-h-[72vh] 큰 이미지 + cropRegions 읽기전용 오버레이), `upload-panel.tsx:484-490`(썸네일 클릭→onPreviewSlot) |
| R3 | 크롭 원본 제외+그룹화 | **satisfied** | `crop-modal.tsx:125-154`(crop/merged 생성), `index.tsx:517-532`(소스 kind='source'+excludedFromExtraction=true, 자식 바로 뒤 삽입), `index.tsx:416`+`slot-meta.ts:46-48`(isExtractable로 추출 제외) |
| R4 | 이미지1장/여러장/PDF 크롭 | **satisfied** | `index.tsx:301-388`(PDF split/이미지/검증), `crop-utils.ts:135-284`(단일·다영역·다blob 모두 EXIF 보정 포함) |
| R5 | OCR만 vs AI복원 사용자 선택 | **missing** | `index.tsx:187,428`(mode 'PASSAGE_ONLY' 하드코딩), 토글 UI 없음. 단 `types.ts:316,378-397`(ExtractionOutputMode·IntakePlan.outputMode 정의 완료) + `credit-costs.ts:26`(PASSAGE_RESTORATION=2 단가 존재) — **타입·과금 골격은 이미 깔려 있고 UI 배선만 빠짐**. P7로 정직 표시됨 |
| R6 | 페이지 걸친 한 지문 잇기 | **satisfied** | `index.tsx:544-615`(선택→stitch→MergeConfirmModal→삽입 풀체인 확인됨), `merge-confirm-modal.tsx:65-96`(▲▼ 순서교정 re-stitch). 감사 #5가 "호출부 미확인"이라 한 부분은 실제로 전부 배선됨 |
| R7 | 한 이미지 내 여러 지문 그룹 | **satisfied** | `crop-modal.tsx:40-117`(groups[] + setRegionGroup + 그룹별 stitch/crop 분기) |
| R8 | 합치기 체크박스 동작 | **satisfied (시각 라벨만 모호)** | `upload-panel.tsx:504-532`(체크박스 동작·aria-pressed 정상), `merge-confirm-modal.tsx:240`(2장 미만 confirm 비활성). 버그 아님 — 다만 선택순서 숫자가 토글 의미와 혼동 가능 |
| R9 | 추출영역 크게+세로그리드+패널높이 | **satisfied** | `index.tsx:98-176`(uploadHeight 리사이저 360~1400px+localStorage), `upload-panel.tsx:372`(auto-fill minmax(200px) 세로그리드), `slot-preview-modal.tsx:91`(max-h-[72vh]) |

요약: **satisfied 7 / partial 1(R1) / missing 1(R5)**. 감사들이 R1·R6·R9를 partial로 깎거나 R8을 buggy로 본 것은 과도 — 실코드는 동작한다.

## 3. 반드시 고쳐야 할 버그 (검증 완료, 중복 제거)

진짜 고쳐야 할 것은 **2건**이다. 감사가 high로 올린 나머지 다수는 오탐이거나 이론적 엣지케이스다.

**[HIGH-1] 합친(stitch) 이미지가 5MB(MAX_PAGE_IMAGE_BYTES) 검증을 우회 → 사용자 확정 후 서버에서 거부**
- 근거: `crop-utils.ts:237-284`(stitchSlotsToBlob은 maxWidth만 가드, 최종 byte 미검증) → `index.tsx:593-607`(merged 슬롯 bytes=finalBlob.size로 그냥 저장) → `use-extraction-upload.ts:100`(size: slot.bytes 그대로 전송, 재검증 없음). 원본 파일은 `index.tsx:372-374`에서만 5MB 체크됨.
- 영향: 2480×8000px 합본 JPEG은 5MB 초과 가능 → "이 순서로 합치기" 누른 뒤 추출 시작 시점에 서버 zod가 거부, 사용자는 이유를 모름.
- 수정안: `handleOpenMergePreview`/`handleConfirmMerge`(index.tsx:559,593) 또는 `MergeConfirmModal.restitch`(merge-confirm-modal.tsx:65)에서 `finalBlob.size > MAX_PAGE_IMAGE_BYTES`면 confirm 비활성+경고. `startExtraction`(index.tsx:410)에도 업로드 전 사전 체크 1줄 추가.

**[HIGH-2] merged 슬롯의 배지/언머지 kind 비일관 (idempotency 깨짐)**
- 근거 (2개 감사 중복 → 1건으로 통합):
  - 배지: `slot-meta.ts:28-32`는 `mergedFromSlotIds`를 먼저 보고 "N장", 없으면 `regionCount`로 "N영역". 크롭모달 merged(`crop-modal.tsx:152`)는 `regionCount`만 세팅→"N영역", 트레이 merged(`index.tsx:603-606`)는 둘 다 세팅→"N장". **같은 'merged' 종류가 출처에 따라 다른 배지** 표시.
  - 언머지 복원: `index.tsx:284,627`은 재료를 항상 `kind:'original'`로 복원. 원래 업로드 원본은 `kind:null`(appendSlots:235-239 default)이라, 합치기 전엔 배지가 없던 슬롯이 합치기 되돌린 뒤 '원본' 배지가 생김 → 비대칭.
- 수정안: 크롭모달 merged에도 의미 일관 필드 사용하거나 배지 분기를 명시 분리. 언머지 복원은 `kind:'original'` 대신 merged 메타에 `originalKind` 스냅샷 보관 후 정확 복원(또는 단순히 `kind: undefined`로).

**고치면 좋지만 차단 아님 (참고):**
- `merge-confirm-modal.tsx:22` TOO_TALL_PX=5000은 벤치 없는 추정값 — 경고만 하고 막지 않음(P-Bench로 보정). maxHeight 강제 가드 없음.
- 재편집 시 지문 그룹화 복원 불가: `cropRegions`(좌표)는 저장되나 group 매핑은 저장 안 됨(`index.tsx:834`는 initialBoxes만 전달, groups는 `crop-modal.tsx:41-43`에서 "영역마다 별개 지문"으로 초기화). `ClientPageSlot`에 `initialGroups?: number[]` 필드 추가 필요. **(이 1건은 감사 #1 지적이 정확함)**

**감사가 high로 보고했으나 실제로는 버그가 아닌 것 (오탐 정정 — 정직성):**
- "Passage.sourcePageIndex 칼럼 부재" → **거짓**. `schema.prisma:671`에 `sourcePageIndex Int[] @default([])` 존재(추가로 2422,2460 등).
- "bundleKey/spanPageIndices 칼럼 없음" → **거짓**. `schema.prisma:2383,2386` 존재.
- "incompleteReason 칼럼 미정의" → **거짓**. `schema.prisma:2493` 존재 + `types.ts:319-324` IncompleteReason 유니온 존재.
- "CREDIT_COSTS.PASSAGE_RESTORATION 단가 미추가" → **거짓**. `credit-costs.ts:26`에 값 2로 존재.
- "handleBoxesChange 삭제 감지 실패(===비교)" → **이론상 엣지, 실증 안 됨**. 리스트 삭제는 index 기반 `removeBox`(crop-modal.tsx:83-92), 캔버스 Del은 `boxes.filter`(crop-canvas.tsx:245)로 동일 객체참조를 유지해 `next.includes(b)`가 정상 동작. resize/move도 새 객체로 state를 갱신하므로 후속 삭제 시 참조 일치. 재현 시나리오 미확인 → high로 볼 근거 없음.

## 4. 검증의 한계 (정직 고지)

- 이 보고서는 **정적 코드 판독만** 수행했다. dev 서버 기동·브라우저 클릭·실제 OCR 호출은 하지 않았다.
- **런타임 미검증**: stitch가 실제로 5MB를 넘는지, 서버 zod가 정확히 어떤 메시지로 거부하는지(HIGH-1의 사용자 체감)는 실파일 합치기로 재현해야 확정된다.
- **시각/픽셀 미검증**: 세로 그리드·패널 리사이저·배지 톤·미리보기 비율(R9, R1)이 의도대로 보이는지는 스크린샷으로 확인하지 않았다.
- **OCR 충실도 전면 미검증(P-Bench 미실시)**: maxWidth=2480 다운스케일 + TOO_TALL_PX=5000이 긴 합본에서 Gemini 글자 인식을 얼마나 떨어뜨리는지 실측 데이터가 0이다. 이 값들은 전부 추정이다.
- **상태 동시성**: 합치기 도중 슬롯 삭제 같은 concurrent 시나리오는 코드상 가드가 약하나(감사 med 지적), 실제 발생 빈도/영향은 미측정.
- 감사 #5의 오탐을 정정했으나, **트리아지 태스크(`src/trigger/extraction-triage.ts`)와 `useIntakeStore`(`src/lib/intake/store.ts`)는 실제로 파일이 존재하지 않음을 확인**했다(Glob 0건) — 이 두 미구현은 사실이다.

## 5. 남은 계획(P7~P8) 개선 방향 + 우선순위

전제 재정립: **DB 스키마·types·크레딧 단가는 이미 D2/D4/G4까지 선반영되어 있다.** 즉 P7/P8은 "스키마부터"가 아니라 "이미 깔린 타입에 UI/태스크를 배선"하는 단계다. 이게 가장 중요한 정정이다.

- **P7 복원 구분(D2) — 우선순위 1.** `types.ts:392 outputMode`·`credit-costs.ts:26`이 이미 있으므로, 필요한 건 (a) UploadPanel 또는 추출 전 헤더에 `[● 원문 그대로(무료) ○ AI복원(◈2)]` 라디오, (b) `startUpload`에 `outputMode` 인자 전달(현재 `index.tsx:428` mode 하드코딩 제거), (c) finalize의 자동 휴리스틱 복원을 사용자 선택으로 분기. diff 모달(restore-select)은 후속.
- **P8 불완전 게이트 + 지문단위 진행률 — 우선순위 2.** `schema.prisma:2493 incompleteReason`·`types.ts:319` 이미 존재 → build-payload에서 40자 미만을 폐기 대신 `incompleteReason='LENGTH'`로 저장하고 reviewing UI에 "불완전 N개" 배너만 추가하면 됨. 진행률은 현재 SSE가 페이지 단위(`useExtractionStream`)라 지문 단위 분모 매핑 작업 필요.
- **P4 트리아지 + P3b Surface UI — 우선순위 3.** `extraction-triage.ts` 파일·`useIntakeStore` 부재가 사실상 적응형 라우팅의 유일한 진짜 공백. 상수(TRIAGE_SAMPLE_PAGES/TIMEOUT)는 이미 있음. 타임아웃 초과 시 1:1 세그먼트 저신뢰 폴백을 명시 구현.
- **P-Bench — P6보다 먼저.** merge/stitch가 이미 출시 가능 상태이므로, 정확도 미검증 리스크를 줄이려면 출시 초기엔 합치기 UI에 "2~3장 권장" tooltip을 걸고, 벤치 통과 후 상한·TOO_TALL_PX를 실데이터로 보정. P6 백엔드 묶음 OCR은 벤치가 stitch 충실도 미달일 때만 조건부 승격.

부차 개선(저비용): R1 배지 hover tooltip("이 영역은 지문 그룹 N"), 재편집 그룹복원용 `initialGroups`, 체크박스 라벨에 "읽는 순서" tooltip, MergeConfirmModal maxHeight 강제.

## 6. 지금 즉시 수정 권고 Top 3 (실행 순서)

1. **HIGH-1 합본 5MB 가드.** `merge-confirm-modal.tsx`(또는 `index.tsx:559/593`)에서 `finalBlob.size > MAX_PAGE_IMAGE_BYTES`면 confirm 비활성+안내, `startExtraction`(index.tsx:410)에 업로드 전 사전 체크 추가. → 사용자가 합친 뒤 추출 단계에서 영문 모를 거부당하는 동선 차단.
2. **HIGH-2 merged 배지/언머지 kind 통일.** `slot-meta.ts:26-34` 배지 분기 명시화 + 언머지 복원(`index.tsx:284,627`)에서 원래 kind 보존. → 같은 종류가 다르게 표시되고 합치기 되돌리면 상태가 달라지는 비일관 제거.
3. **재편집 그룹 복원 `initialGroups` 추가.** `ClientPageSlot`에 `initialGroups?: number[]`, `handleCropConfirm`에서 groups 저장, `index.tsx:834`에서 전달, `crop-modal.tsx:41-43` 초기화에 사용. → 한 이미지 다지문(R7)을 재편집할 때 그룹이 매번 초기화되는 실사용 손실 방지.

(주의: 감사 #5가 권고한 "Prisma 칼럼 추가/크레딧 단가 추가/types 신설"은 **이미 존재하므로 실행하지 말 것** — 중복·충돌만 유발한다.)

**Please test this** — 특히 HIGH-1은 실제로 큰 이미지 여러 장을 합쳐 추출을 눌러 서버 거부가 재현되는지, 그리고 P-Bench(긴 합본 OCR 충실도)는 코드 수정과 별개로 실데이터 측정이 필요합니다.
