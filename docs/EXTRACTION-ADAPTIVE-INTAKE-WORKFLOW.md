# 구현 워크플로우 — 자료 추출 「적응형 인테이크」

> 실행 정본. 설계 근거는 [EXTRACTION-ADAPTIVE-INTAKE-DESIGN.md](./EXTRACTION-ADAPTIVE-INTAKE-DESIGN.md), 현 구조 분석은 [BULK-PASSAGE-EXTRACTION.md](./BULK-PASSAGE-EXTRACTION.md).
> 확정 결정(4): D1 하이브리드(페이지 코어 보존) · D2 복원=옵트인+크레딧 · D3 자동 사전분석+수정 · D4 인접페이지 묶음 OCR.

## 전략 & 불변식 (Invariants)
- **additive 우선**: 모든 DB 변경은 `NULL`/`DEFAULT`. 신규 컬럼을 읽지 않으면 코어 동작 불변.
- **페이지 코어 불가침**: 3중 멱등성(`idempotencyKey=${jobId}:${pageIndex}`, `@@unique([jobId,pageIndex])`, `creditTxId`), SSE, 환불, `pdf-splitter`, Supabase Storage는 시그니처 변경 금지.
- **신규 상태는 별 스토어**: `useIntakeStore`를 `useExtractionStore`와 분리 — 코어 오염 0.
- **세그멘테이션/묶음 변경은 벤치 그린 후** 머지(W-Bench 게이트).
- **전 구간 feature flag** `EXTRACTION_ADAPTIVE_INTAKE`, off=100% 기존 경로.
- **품질 게이트**: `npx tsc --noEmit` 0에러 · 범위 eslint · DIRECTOR M1/M2/M4 각 1회 완주 스모크 · 멱등성 SQL 검증.

## 의존성 그래프 (실행 웨이브)

```
W0 ─ P0 단일 additive 마이그레이션(§5 전체) ─┬─ (선행, 모든 것)
                                            │
     P-Bench 추출 e2e 하니스 스캐폴드 ───────┘ (W0와 병렬 착수, W3 게이트)

W1 ─ P1 promote 손실 수정  ‖  P2 인테이크 셸 스캐폴드   (병렬, 코어 무영향)
                                   │
W2 ─ P3 Surface UI(크롭·a11y·모바일)  ‖  P4 트리아지 태스크  ‖  P7 복원 과금/UI(D2)
                                   │              │
W3 ─ P5 재정렬 선행+재바인딩 ───────┴──────────────┤
                                                  ▼
     P6 묶음 OCR(D4) ⚠️최고위험  ◀── 게이트: P-Bench 기준선 + P4 트리아지
                                                  ▼
W4 ─ P8 불완전 게이트 + 지문단위 진행률
```

## 단계 명세

| Phase | 산출물 | 핵심 파일 | 도메인 | 선행 | 위험 | 검증 게이트 |
|---|---|---|---|---|---|---|
| **P0** 기반 마이그레이션 | §5 전 컬럼 1개 마이그레이션(`add_adaptive_intake`): `Passage.sourcePageIndex/extractionOutput`, `ExtractionJob.intakePlan/triageConfidence/inputType/estimatedPassageCount`, `ExtractionItem.cropBox/segmentKind/incompleteReason`, `ExtractionPage.bundleKey/spanPageIndices` + `CREDIT_COSTS.PASSAGE_RESTORATION` 키 | `prisma/schema.prisma`, `lib/extraction/{constants,types,zod-schemas}.ts`, `lib/credit-costs.ts`, `lib/feature-flags.ts` | backend-arch · devops | — | 낮음 | `tsc` 0, 마이그레이션 nullable 확인, 기존 추출 1회 동작 불변 |
| **P-Bench** e2e 하니스 | `scripts/extraction-bench/`(fixtures C1~C10 + expected.json + scorers + run-bench) | `scripts/extraction-bench/**` | quality | P0 | 낮음 | 기준선(baseline) 측정 산출 → P6 게이트 |
| **P1** promote 손실 수정 | 2개 사이트에 `sourcePageIndex`/`extractionOutput` 매핑 | `commit/_lib/create-or-reuse-passage.ts:61-78`, `commit/_lib/types.ts`, `review-step/commit/build-payload.ts:74`, `m1-passages/promote/route.ts:103-116` | backend-arch | P0 | 낮음 | 기존 커밋 회귀, promote 후 Passage.sourcePageIndex 채워짐 |
| **P2** 인테이크 셸 | `useIntakeStore`+상태머신(empty→plan-locked)+`routeSurface(plan)`+plan→mode 주입(하드코딩 우회) | `import/_components/bulk-extract-client/**`(신규 intake 하위), `index.tsx:167,389,429` | frontend·backend | P0 | 중(코어 인계 경계) | mode 주입 후 PASSAGE_ONLY 경로 동일, flag off 완전 폴백 |
| **P3** Surface UI | A/B/C/D 공통골격 + 크롭 오버레이(`cropBox` 0~1 정규화·deskew) + 키보드/SR + 모바일 리스트 폴백 | `import/_components/**`(신규 surfaces/crop), 재사용 `ui/drag-select.tsx`·`ImageCarousel`·`original-viewer` | frontend-arch | P2 | 중(a11y·모바일) | Playwright 키보드 경로, 좌표계 0~1 단위 검증 |
| **P4** 트리아지 태스크 | `extraction-triage`(Flash 1콜, JSON+zod) + C1 스킵 + 저신뢰 단일폴백(=기존동작 100%) | `src/trigger/extraction-triage.ts`(신규), `api/extraction/jobs/[jobId]/triage/route.ts`(신규), `lib/extraction/zod-schemas.ts` | backend·AI프롬프트 | P0 | 중(새 실패표면) | 벤치 (a)지문수·(b)경계, 폴백=기존동작 확인 |
| **P5** 재정렬 선행+재바인딩 | `reordering→scanning` 순서 고정, segment `spanPageIndices`/`cropBox.page` slot-id 기준 재매핑 | intake 상태머신, `pageMeta` 활용 | frontend·backend | P2,P4 | 중(순환의존) | 섞인 픽스처 재정렬 후 묶음/크롭 참조 무결성 |
| **P6** 묶음 OCR (D4) ⚠️ | 가상 음수 pageIndex(또는 별 플래그 컬럼·§10.6 결정) + `bundleKey`/`spanPageIndices` + 이미지배열 1콜 분기 + 1과금/1환불/lease + `MAX_PAGES_PER_BUNDLE` 상한 + graceful degrade | `trigger/extraction-page.ts`, `extraction-orchestrator.ts`, `_lib/extraction-page/{ocr-dispatch,charge-credits}.ts`, `structured-groups.ts:161-165`(병합게이트+한글종결) | backend-arch·AI·quality | **P-Bench 기준선 + P4** | **높음(D1↔D4 충돌)** | 벤치 (c)묶음 P/R, 멱등성 재시도·부분실패 degrade, 환불 단위, M2/M4 무회귀 |
| **P7** 복원 과금/UI (D2) | `PASSAGE_RESTORATION` 단가 + restore-select diff(±기호·색맹) + `teacherText` 보존(옵트인 복귀) + 부분채택 과금 | `api/extraction/m1-passages/[draftId]/rerestore`, `review-step` 토글, 재사용 `restoration-changes-panel` | backend·frontend·security | P0 | 중(과금 정확성) | 실패=환불/품질불만=무환불 e2e, 복원 크레딧 1회 차감 SQL, 벤치 (d) |
| **P8** 불완전 게이트+진행률 | 조용한 폐기→`incompleteReason` 보존 + 커밋 게이트 + 지문단위 진행 분모(실측보정) + skew/잘림 2단검출 | `build-payload.ts:35,61`, `stream/route.ts`, `processing-step.tsx` | frontend·backend | P3,P4 | 중(분모 출렁임) | 폐기→보존 회귀, 진행률 분모 안정, 잘린 픽스처 경고 표시 |

## 병렬화 웨이브
- **W0**: P0(단독 선행) ‖ P-Bench(착수)
- **W1**: P1 ‖ P2  (서로 독립, 코어 무영향)
- **W2**: P3 ‖ P4 ‖ P7  (P2/P0 위에서 동시)
- **W3**: P5 → **P6**(P-Bench 기준선·P4 게이트 통과 후에만)
- **W4**: P8

## 단계를 막는 미해결 결정 (착수 전 확정 필요)
- **P4 착수 전**: 트리아지 과금(무료 vs 정액) — 설계 §10.1
- **P6 착수 전**: 묶음 가상 음수 pageIndex vs 별 플래그 컬럼 — §10.6 / `MAX_PAGES_PER_BUNDLE` 값(벤치 후) — §10.3 / 장문+문항세트 라우팅(`project_longpassage_set` 인계) — §10.4
- **P7 착수 전**: 복원 단가 공식 확정(벤치 후) — §10.2
- (P0~P3은 위 결정과 무관하게 즉시 착수 가능)

## 마일스톤
1. **M1 (W0+W1)**: 토대 + promote 버그 수정 + 인테이크 셸 — 사용자 체감 변화 0, 회귀 0. 안전 기반.
2. **M2 (W2)**: 크롭(G2)·트리아지(G5)·복원 옵트인(D2) 가시화 — 핵심 신기능 3종.
3. **M3 (W3)**: 다중페이지 묶음(G3/D4) — 최고난도, 벤치 가드.
4. **M4 (W4)**: 불완전 게이트(G4)·지문단위 진행(G6) — 마감 폴리시.
