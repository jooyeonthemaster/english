# 지문 웹툰 v2 — 확정 스펙 (26-09-29)

> 정본. 구현·검수 에이전트는 이 문서만 믿는다. 채팅 맥락·추측으로 스펙을 바꾸지 말 것.

## 0. 배경 (실측)
- 운영 `webtoons` 210건 중 실패 46건. 그중 39건이 AtlasCloud `402 insufficient balance`이고, **9/22 이후 생성이 100% 실패**했다.
- 실사용: 화풍은 KOREAN_WEBTOON이 75%, 언어는 KO 112 · KO_EN 37. 검수완료 5/164, 자막 편집 export 11.
- 교사 추가지시 실례: "글씨 좀 안깨지게 해줘 자꾸 깨져서 다시 만들고 있어", "상황묘사 디테일하게 해주고 글씨 크게", "중3 기준으로 귀엽게", 캐스팅·비유 표(병원체=악당 몬스터, 대식세포=경비병 …).

## 1. 사용자 확정 결정
1. **컷별 개별 생성은 하지 않는다.** 웹툰 1편 = 이미지 1장(9:16), 호출 1회.
2. LLM 스토리보드(각색·대사·컷별 연출 설계)는 **`google/gemini-3.7-flash`**(OpenRouter).
3. 이미지는 **OpenRouter `/api/v1/images`**로 생성한다. 등급 차이는 모델뿐이다.
   - 일반(STANDARD) = `openai/gpt-image-2.5-flare`
   - 프리미엄(PREMIUM) = `openai/gpt-image-2.5-sunburst`
4. AtlasCloud 이미지 경로는 폐기한다.

## 2. 파이프라인 (구현 완료 — 감독 소유, 함대는 수정 금지)
| 단계 | 파일 | 요점 |
|---|---|---|
| 스토리보드 | `src/lib/webtoon-storyboard/{types,rules,prompt,validate,generate}.ts` | json_schema strict · 결정론 검증 · 수리 1회 · 실패 시 throw(`calls` 첨부) |
| 컴파일 | `src/lib/webtoon-storyboard/{compile,styles}.ts` | 스토리보드를 한 장 프롬프트로 변환(레이아웃 행 + 컷별 SHOT/ANGLE/구도/연기/배경/조명/정확한 글자 인용 + 레터링 규칙). 결정론 |
| 이미지 | `src/lib/openrouter-image.ts` | 동기 POST, b64 수신, `usage.cost` 실측, 408/429/5xx만 재시도 |
| 프로세서 | `src/lib/webtoon-processor.ts` | claim → 스토리보드(실패 시 레거시 프롬프트 폴백) → 이미지 → sharp JPEG q92 → 버퍼 업로드 → COMPLETED. 실패 시 환불 + 친절 메시지(`src/lib/webtoon-errors.ts`) |
| 등급 | `src/lib/webtoon-models.ts` | `engineLabel`·`etaLabel`·`legacyModelIds`(AtlasCloud 시절 id → 같은 등급) |
| 저장 | `src/lib/webtoon-storage.ts` `uploadImageBufferToWebtoonBucket` | 경로는 기존과 동일 `${academyId}/${webtoonId}.jpg` |
| DB | `webtoons.storyboard jsonb` (`scripts/sql/webtoon-storyboard.sql`) | shape = `PersistedWebtoonStoryboard`. null = 레거시 행 |

원가 원장: 프로세서가 직접 기록한다(provider `OPENROUTER`, 실측 `recordedCostUsd`).
- 이미지: sourceKey `webtoon:<id>:image`, unitType IMAGE, operationType = 등급의 operationType
- 스토리보드: sourceKey `webtoon:<id>:storyboard:<n>`, unitType TOKENS, sourceDetail STORYBOARD, operationType 동일

## 3. 언어 모드 (5종)
`KO` · **`KO_KEY`(신규: 한국어 서술 속에 핵심 영어 표현 끼워 넣기)** · `KO_EN` · `EN` · `EN_KO_GLOSS`.
- `WEBTOON_LANGUAGES` 순서는 KO, KO_KEY, KO_EN, EN, EN_KO_GLOSS.
- 기본값은 계속 `KO`다(바꾸지 말 것).
- 국어 지문은 언어 선택과 무관하게 한국어로 조판된다.

## 4. API 계약 (함대가 맞출 인터페이스)
- `GET /api/webtoons/list` 각 행에 **`plan: "STANDARD"|"PREMIUM"|null`**(`planForModelId(imageModel)?.id ?? null`)과 **`hasStoryboard: boolean`**을 추가한다.
  - 목록에서 storyboard JSON 전체를 싣지 말 것(무겁다).
- `GET /api/webtoons/[id]` 응답에 **`storyboard: PersistedWebtoonStoryboard | null`**과 `plan`을 싣는다.
  - `creditTransactionId`·`promptSnapshot`·`promptHash`·`rawAtlasUrl`·`atlasPredictionId`는 **응답에서 제거**한다(환불 악용·내부 정보 노출 차단).
  - 클라이언트가 이 필드들을 읽는지 먼저 grep해서 확인하라.
- `POST /api/ai/webtoon/generate` 계약은 불변(`passageIds, style, language, customPrompt, plan`). 재시도도 이 엔드포인트에 **원래 plan을 실어** 보낸다.

## 5. 금지·주의
- 크레딧 가격(5/10)은 바꾸지 말 것 — 벤치 실측 후 감독이 사용자와 결정한다.
- 기본 언어·기본 화풍·기본 등급을 바꾸지 말 것.
- `tests/unit/webtoon-prompt-subject.test.mjs`(레거시 프롬프트 288케이스 SHA 스냅숏)는 반드시 계속 통과해야 한다. `webtoon-prompts.ts` 기존 문자열 수정 금지.
- 모델명·AtlasCloud를 UI 문구에 새로 노출하지 말 것. 예외는 등급 카드의 `engineLabel` 한 줄(감독 결정).
- 파일 500줄 규칙(CLAUDE.md): 손댄 파일이 500줄을 넘으면 분리 경계(`<이름>-parts/`)로 쪼개거나 보고한다. 분리는 동작 보존.
- 새 의존성 추가 금지. 운영 DB·스토리지 쓰기 금지(코드만).
- 이미 올바른 동작을 "개선"하며 바꾸지 말 것. 불확실하면 유지(KEEP).
