# Grounded Restoration / Source Matching — Archived Behavior

이 디렉터리는 M1 추출 파이프라인의 **2차 호출 (grounded restoration)** 흐름이 비활성화된 시점의 백업 / 복원 가이드입니다.

## 비활성화 사유 (2026-05-16)

운영 데이터 (잡 3개, 113 drafts) 정량 분석 결과:

| 지표 | 값 |
|---|---|
| `google_search` 가 web source 를 실제로 찾은 drafts | ~78% (~64건) |
| source 데이터로 본문이 **patch 된** drafts | **~14%** (GROUNDED_MIXED 12 + GROUNDED_SOURCE_MATCH 2) |
| AI 단독으로 복원 — source 무관 / no patch | **~83%** (AI_RESTORE_FROM_EVIDENCE 67) |
| 학원 Local DB (Stage 1) exact match hit | **0%** (DB 4 passages 뿐, 0.9 threshold 미달) |
| RECITATION 으로 차단된 drafts | 잡별 0~10% (랜덤) |
| Gemini grounding fee | 잡당 ₩228 — **전체 비용의 44%** |

판단:
- Source matching 의 실 활용도 14% (patch 적용률)
- 그마저도 patch 가 검증 안 된 web source 에서 가져옴 (Gemini grounded search 가 정확한 시험지 출처를 찾는다는 보장 없음)
- 비용 부담 + RECITATION 위험 vs 작은 효익 → 트레이드오프 마이너스

## 변경 내역 (active code)

### `src/trigger/_lib/m1-passage-restoration.ts`

3 곳 변경:

1. **import**: `generateGroundedStructuredTextWithTriggerFetch` → `generateStructuredTextWithTriggerFetch` 로 교체 (grounded 변종은 `_grounded_unused` 별칭으로 import 유지 — 코드 참조 보존 + revival 시 한 줄 swap).
2. **`restoreM1Passage` Stage 2 호출 (~line 283)**: grounded → non-grounded.
3. **`restoreM1PassageBatch` 의 `tryGroundedCall` (~line 828)**: 동일하게 swap.

스키마 / 프롬프트 / 결과 매핑 모두 **그대로**. Non-grounded 모드에선 모델이 `google_search` 도구 없어서 `sourceMatch=null` 로 자연스럽게 반환. Investigation C 의 "no source" 경로가 `aiRestoration.restoredText` 를 그대로 emit 함 (finalMethod=`QUESTION_EVIDENCE`).

### `src/trigger/_lib/m2-source-match.ts`

**변경 없음 — 그대로 작동.** Local DB Stage 1 매칭은 유지. 현재는 학원 Passage DB 사이즈가 작아서 hit 율 0%지만, 자료가 누적되면 자동 활용됨.

### `src/lib/extraction/m2-restoration.ts`

**변경 없음.** Grounded prompts (`buildGroundedRestorationPrompts`, `buildGroundedRestorationBatchPrompts`) + 스키마 (`groundedRestorationResponseSchema`, `groundedRestorationBatchResponseSchema`) 다 살아있음. 그냥 호출 안 함.

프롬프트 안에 Investigation A (source lookup) 와 C (comparison/patching) 가 그대로 있어서 input token 약 ~20% 낭비. 추후 cleanup 으로 lean prompt 만들 수 있음 (선택).

## 효과 (예상)

| 항목 | Before (grounded) | After (AI-only) |
|---|---|---|
| 잡당 비용 | ₩515 | **~₩290 (-45%)** |
| RECITATION 위험 | 잡별 0~10% drafts | **0** |
| Latency (grounded 호출당) | 60~180s | **30~60s** (google_search step 제거) |
| Local DB 매칭 | 작동 (Stage 1) | 작동 (Stage 1) |
| AI 복원 품질 | aiRestoration.restoredText 그대로 | **동일** |
| Source patch (어법/어휘 답안) | 14% drafts 에 적용 | 적용 안 함 |

## Revival (재활성화) 방법

`m1-passage-restoration.ts` 3 곳을 되돌리면 즉시 grounded 흐름 복원:

```diff
-import {
-  generateStructuredTextWithTriggerFetch,
-  // eslint-disable-next-line @typescript-eslint/no-unused-vars
-  generateGroundedStructuredTextWithTriggerFetch as _grounded_unused,
-} from "./gemini-ocr";
+import { generateGroundedStructuredTextWithTriggerFetch } from "./gemini-ocr";
```

그리고 두 곳의 `generateStructuredTextWithTriggerFetch` → `generateGroundedStructuredTextWithTriggerFetch` 로 변경.

또는 환경변수 기반 토글이 필요하면 분기 추가:

```ts
const USE_GROUNDED =
  process.env.EXTRACTION_USE_GROUNDED_RESTORATION === "true";
const call = USE_GROUNDED
  ? generateGroundedStructuredTextWithTriggerFetch
  : generateStructuredTextWithTriggerFetch;
```

## 관련 메모리 / 컨텍스트

- `memory/m1_extraction_pipeline.md` — gotcha 7 (RECITATION 회피), gotcha 15 (type-filtered restoration), 비용 분해
- `memory/session_2026-05-13_summary.md` — multimodal classify 도입, deterministic pageMeta
- 진단 세션: 2026-05-16. v20260516.9 까지 grounded 사용. v20260516.10+ 이 AI-only.

## 향후 검토 시점

- **Local DB Passage 누적량 1000+ 도달 시**: Stage 1 hit 율 측정. 의미 있게 hit 되면 grounding 의존도 감소했음을 의미.
- **저작권 클리어 source 데이터셋 확보 시**: 정식 모의고사 출처 (e.g. EBS 본문, 학원 라이선스) 가 DB 에 누적되면 source matching 의 신뢰성 회복. 재활성화 검토.
- **Gemini 모델 RECITATION 정책 변경**: Gemini 3+ 시리즈에서 grounded 모드의 RECITATION 발동 빈도가 낮아지면 ROI 재계산.
