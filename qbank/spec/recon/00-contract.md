# md-qgen 공유 계약 (정찰 확정본)

> 출처: 정찰 에이전트 `contract` (run `wf_7f5ce00e-51e`), 코드 직독 + tsx 실행 검증.
> 모든 주장에 `file:line` 인용이 붙어 있다. **이 문서는 전 저작·검수 에이전트의 필독 자료다.**

---

## 1. MdLane 인터페이스 (12멤버) — `src/lib/md-qgen/lane-types.ts:54-91`

`subType` / `operationType` / `retryEligible` / `isEligible` / `buildBasePrompt` / `buildExtras` /
`parseAndGate` / `adapt` / `qualityArgs` / `mdFormat` / `diversityTargets` / `filterQualityIssues?`

- `MdLaneContext` = `{passage, difficulty(BASIC|INTERMEDIATE|KILLER), rawDifficulty, resolved, rawTypeSettings, teacherPoints, variantIndex, variantCount}` — `lane-types.ts:22-37`
- `MdLaneParsed` = `{question: unknown, gateIssues: string[], corrections: string[]}` — `lane-types.ts:39-46`
- `MdLaneAdaptResult` = `{ok, error?, aiQuestion?}` — `lane-types.ts:48-52`
- `getMdLane(subType)` 이 `null` 이면 정본(`BLANK_INFERENCE`·`GRAMMAR_ERROR`) 하드코딩 분기 — `lane-registry.ts:88-91`
- **등록 레인 24 + 정본 2 = 26유형**

## 2. 전체 경로 (호출 순서) — `.../md-stream/route.ts:933-1141`

```
streamOnce
  → lane.parseAndGate(text, ctx)        // 파싱 → 오토스냅 → 게이트 → 교사포인트 준수검사
  → (조건부 재생성 1회)                  // retryEligible && gateIssues>0 && budgetMs()>30000
  → lane.adapt(parsed, ctx)
  → postProcessQuestion(subType, passage, aiQuestion)
  → 메타부착 (_typeId/_typeLabel/_generationPlan/difficulty)
  → shuffleQuestionOptionsForDiversity
  → validateQuestionQuality             // ★ 비차단 — 기록만 (route.ts:86, 1104-1123)
  → saveGeneratedQuestionsForJob        // structuredData = toPrismaJson
```

**★ 게이트 판정의 진실원은 `parsed.gateIssues` 하나뿐이다.** `validateQuestionQuality` 는 라우트가 차단하지 않는다.
→ qbank 하네스는 기준이 더 높으므로 차단하되 **축을 분리**한다(`blocking` vs `qualityBlocking`).

재생성 채택 조건은 `retryParsed.gateIssues.length <= parsedMd.gateIssues.length` — 같아도 재생성본을 채택
(`route.ts:962-1003`). **오프라인 하네스에는 재생성이 없으므로 웹 통과율과 하네스 통과율을 환산하지 마라.**

## 3. ★ 1 마크다운 문서 = 정확히 1문항

- 요청 스키마가 `count` 를 `min(1).max(1)` 로 강제 — `route.ts:114`
- **문서 시작/끝 마커도, 문항 구분자도 md-qgen 에 존재하지 않는다.**
- 파서는 **첫 매치만** 취한다 (`^정답:\s*([①②③④⑤])` 등) — `parser.ts:83,122,153`
  → 한 파일에 5문항을 붙이면 2~5번이 **조용히 사라지거나 첫 문항을 오염**시킨다.

**qbank 규약**: 유닛 `.md` 는 5~8문항을 담되, 하네스가 `<!-- ITEM n ... -->` 로 **1문항씩 잘라** `parseAndGate` 에 넣는다.
이 구분자는 **qbank 규약이지 md-qgen 규약이 아니다** — 잘라낸 뒤의 본문만이 md-qgen 계약 대상이다.

## 4. 공통 섹션 머리표

| 계열 | 정답의 진실원 | 비고 |
|---|---|---|
| 객관식 전반 | `정답:` | 선지 줄에 정답 표시를 **다시 받지 않는다**(철칙1) — `docs/md-qgen-type-expansion-spec.md:260-266` |
| 조건부영작·문장변형·어순배열 | **`모범답안:`** | `정답:` 줄이 없다. 어댑터가 `correctAnswer = modelAnswer` 로 복제 — `prompts-conditional-writing.ts:172-175` |
| 요약문영작·주제문쓰기 | **`정답(A):`** 계열 | 빈칸 라벨별 |

공통 머리표는 `정답:` `해설:` `오답:` 셋. **`## 지문` 은 프롬프트 입력이지 모델 출력이 아니다** — `prompts.ts:93-103`.

> ⚠ **26유형 일괄 템플릿에 `정답:` 을 강제로 박으면 서술형 계열이 전량 반려된다.**

## 5. 인라인 마커 문법 4종 — `parser.ts:143`

| 문법 | 용도 |
|---|---|
| `[[A:표현]]` | 어법·어휘·반의어·네모 (라벨 A~J) |
| `[[1]]` | 문장 삽입 위치 |
| `[[1:문장]]` | 무관한 문장 |
| `[[them]]` | 지칭 |

정규식: `/\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g`

### ★ 마커 밖 지문은 한 글자도 바꿀 수 없다 — `parser.ts:288-302`
게이트가 마커를 원형으로 되돌린 **재구성본과 원문을 `normalizeWs` 비교**해 「지문 재구성 불일치」로 반려한다.

`normalizeWs` 가 흡수하는 차이(이것만 안전) — `parser.ts:67-74`:
곱슬따옴표 → 곧은따옴표 · en/em dash → `-` · `…` → `...` · 공백 축약.
**그 외 모든 문자 차이는 반려다.**

## 6. 값 구분자 리터럴 (고정)

| 구분자 | 용도 | 출처 |
|---|---|---|
| ` …… ` (공백+…+…+공백) | 다중빈칸 조합 선지 | `prompts.ts:198` |
| ` / ` | 청크·칩 | `parser.ts:115-119` |
| ` \| ` | 원형·포인트/허용답 | 〃 |
| `, ` | 복수정답 병기 | 〃 |

## 7. 라벨 축

| 자리 | 축 |
|---|---|
| 학생 표면 선지 | 원문자 `①~⑤` (일반형 최대 `⑧`, 어법 마커 최대 `⑩`) |
| 어법·반의어 밑줄 | `(A)~(J)` |
| 다중빈칸 | `(A)(B)(C)` 고정 순서 |
| 저장 축 | 어댑터의 `digitOptionLabel` 이 `"1"~"8"` 로 변환 — `adapter.ts:74-78` |

## 8. ★ 장식(마크다운 강조) — 관용이지 계약이 아니다

`decoration.ts` 는 `stripEmphasis`/`unwrapQuotes`/`cleanMdValue`/`keywordLineRe`/`isKeywordHead`/
`readKeywordValue`/`sliceKeywordSection` 7개를 export 하는 **의존성 0 순수 모듈** — `decoration.ts:30~141`.
흡수 대상: 들여쓰기 · 인용 `>` · 표 파이프 `|` · 헤딩 `#`~`######` · 불릿 `- * •` · 강조 `* _ ~` 백틱 ·
따옴표 · 전각 콜론 `：` · 콜론 생략 — `decoration.ts:80-96`

> ### ⚠ 치명적: `decoration.ts` 를 import 하는 파일은 10개뿐이고 **정본 `parser.ts` 는 포함되지 않는다.**
> `BLANK_INFERENCE`/`GRAMMAR_ERROR` 에 `**정답:**` 를 쓰면 **정답이 통째로 사라지고**
> 게이트가 「정답 누락」이라는 **거짓 원인**을 지목한다.
> `parser-title.ts` 는 또 자체 정규식이라 표 파이프를 흡수하지 않는다 — **유형마다 관용 범위가 다르다.**

**→ qbank 저작 규칙: 장식 0.** 굵게·헤딩·불릿·인용·표·백틱을 머리표와 선지 줄에 절대 쓰지 않는다.
관용을 계약으로 착각하면 유형마다 다른 지점에서 터진다.

## 9. 프롬프트 조립 — `route.ts:190, 736-837`

- **system 롤이 없다.** `messages: [{role:'user', content: prompt}]` 단일 메시지. 페르소나는 유저 메시지 첫 줄.
- `프롬프트 = base + "\n\n" + extras.join("\n\n")`
- `base` 의 **맨 끝**이 `## 지문\n{passage}` → **모든 옵션 블록이 지문 뒤(문서 최후미)에 붙는다**
  (레인 extras → 교사포인트 → 다양성 → 커스텀 → 반려피드백)

## 10. 오프라인 최소 호출 시퀀스 (tsx 실행 검증 완료)

### 레인형 (24종)
```ts
getMdLane(subType)
  → resolveQuestionTypeGenerationSettings(typeId, rawSettings, fallbackDifficulty)
  → lane.isEligible(resolved)
  → lane.parseAndGate(mdText, ctx)
  → lane.adapt(parsed, ctx)
  → postProcessQuestion(subType, passage, aiQuestion)
  → shuffleQuestionOptionsForDiversity(data, subType)
  → validateQuestionQuality({typeId, question, passage, requestedDifficulty, ...lane.qualityArgs(ctx)})
```
TITLE 픽스처에서 `gate []` · `adapt ok` · `pp ok` · `quality error 0` 통과 확인 — `lane-title.ts:79-194`

### 정본 2종
```ts
parseMdBlank / parseMdGrammar
  → autoSnapBlankExpression / autoSnap*
  → gateMdQuestion(q, passage, {requireWrong?, markerCount?, answerCount?})   // 기본 markerCount 5, answerCount 1
  → adaptMdBlankToAiQuestion(q, passage, difficulty, answerMode)
  → postProcessQuestion
```
- `gateMdMultiBlank(q, passage, {blankCount?, requireWrong?})` — `parser.ts:358-362`
- `answerMode` = `'PARAPHRASE' | 'SOURCE_EXACT' | 'DOUBLE_NEGATIVE'` (기본 PARAPHRASE).
  **다중빈칸은 `DOUBLE_NEGATIVE` 미지원** (두 모드만) — `adapter.ts:99,160`
- 최종 키에 `passageWithBlank` 가 **후처리로** 추가된다 — `adapter.ts:91`

**구현체**: `qbank/harness/qgen-core.ts` (레인형 24종 범용) — 음성테스트 29/29 통과.
정본 2종은 별도 분기 필요(현재 `UNSUPPORTED_LANE` 로 차단 중 — 조용한 통과 방지).

## 11. 저장 매핑 — `question-generation-persistence.ts:213,242-263`

- `structuredData` = `postProcessQuestion` 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + 셔플 + tags
- `subType` = `q._typeId ?? q.subType`
- `type` = `Array.isArray(q.options) ? MULTIPLE_CHOICE : SHORT_ANSWER`
- `correctAnswer` = `q.correctAnswer ?? q.modelAnswer ?? ''`

## 12. 과금 축 — `lane-types.ts:56-62`

`CONTEXT_MEANING`·`SYNONYM`·`ANTONYM` **3종만** `QUESTION_GEN_VOCAB`, 나머지 21종 `QUESTION_GEN_SINGLE`.
(qbank 은 과금 경로를 타지 않지만, 유형 분류의 참고 축이다.)

## 13. 하네스 작성 시 함정

- `scripts/` 는 `tsconfig.json` exclude 대상 → **`@/` 별칭 대신 상대경로 import**. `qbank/` 도 동일하게 exclude 처리함.
- `scripts/_test-md-*.ts` **35개**가 이미 동일한 순수 호출 시퀀스를 굴린다. 백지에서 쓰지 말고 이들을 원본으로 삼아라.
- 반려 시 잡 result 에 `mdFormat`/`gateIssues`/`firstGateIssues`/`mdRawText`(선두 8k)/`mdRawLength` 기록 — `route.ts:1010-1049`
