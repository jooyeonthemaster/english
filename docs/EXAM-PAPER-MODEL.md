# 시험지 공용 모델 계약 — 「무엇을 찍을지」 (웹 · HWPX · DOCX, 26-09-30)

> 읽는 사람: 시험지 조판·인쇄·HWPX·DOCX·단일 문항 내보내기·지문 삭제를 다음에 만질 개발자. 「웹과 한글 파일이 다르다」는 신고를 받은 운영자.
> 한 줄 요약: **무엇을 찍을지는 공용 모델 한 곳이 정한다. 웹·HWPX·DOCX 는 그 결과를 그리기만 한다.**
> 지문을 실을지(§2), 어떤 지문인지(§3), 어디에 찍는지(§4)를 렌더러가 다시 해석하지 않는다.

관련 문서
- 언제·어떻게 인쇄하나(준비 신호 · 인쇄 컨트롤러 · 검증 도구): [`EXAM-PRINT-PIPELINE.md`](EXAM-PRINT-PIPELINE.md)
- 웹 조판 추정 · 넘침 가드 · 선지 묶음 조판기: [`EXAM-PAGINATION-OVERFLOW.md`](EXAM-PAGINATION-OVERFLOW.md)
- HWPX 구역 · 표지 · 정답표 · 한컴 실측: [`hwpx-exam-export-e36.md`](hwpx-exam-export-e36.md)
- 이 계약이 생긴 사고와 수리 실측: [`customers/eastim-print-hwpx-2609.md`](customers/eastim-print-hwpx-2609.md)

**옛 번호 대응.** 26-09-29~30 작업 중 코드·테스트가 인용하던 스크래치 「확정 스펙 §2.x」를 이 문서로 옮겼다. 코드 주석은 이
문서 번호로 바꿨다. 테스트 이름 · 단언 메시지에 남은 옛 번호는 아래 표로 읽는다.

| 옛 스펙 | 내용 | 이 문서 |
|---|---|---|
| §2.4 | includePassage 판정 순서 | §2 |
| §2.4 1항 · 3항 | 인쇄 강제 목록 · 저장값 없음의 기본값 | §2 「강제 목록」 · 「기본값」 |
| §2.4 末 | settings NULL 의 배지 끔 · 답란 · 정답표 원문자 | §7 · §8 |
| §2.5 | 지문 원천 순서 | §3 |
| §2.6 | 지문 삭제 정책 | §5 |
| §2.7 | 선지 묶음(keep-together) | §9 |
| §2.8 | HWPX lineseg 폭 | §10 |
| §2.9 | 범위 밖 | §13 |

---

## 1. 한 모델, 여러 출력

```
시험 문항(Prisma include) + exams.settings
 → parseSavedPaperSettings(raw)                       saved-paper-types.ts
 → buildPaperItemsFromExam(examQuestions, settings)   saved-paper-items.ts      §2 · §3
     v2 blocks → savedItemToPaperItem / savedBlockToPaperItem
     v1 · v2 items(similar-v1 포함) → savedItemToPaperItem
     settings NULL · 모르는 source → examQuestionToPaperItem(= makePaperItem + 인쇄 강제 규칙)
 → buildGroups(paperItems)                            paper-item-groups.ts      §4 ① 그룹 지문 박스 · 세트 안내문
 → toPaperExportItems(paperItems).printInlinePassage  paper-export-items.ts     §4 ② 문항 안 지문
 → resolvePaperLayout(settings)                       paper-layout-defaults.ts  §8
 → answerKeyEntries(paperItems)                       answer-key-entries.ts     §7
```

모듈은 전부 `src/components/exams/paper-builder/` 에 있고 JSX · window 의존이 없다. 서버 라우트가 그대로 import 한다.
빌더에 새로 담은 문항은 `paper-item-model.makePaperItem` 이 같은 함수(`resolvePrintablePassage` · `defaultIncludePassage`)로 만든다.

| 소비처 | 진입 | 비고 |
|---|---|---|
| 웹 상세 · 빠른보기 · 카드 인쇄 대화상자 · `?print=1` | `exam-detail-paper-preview.tsx` | 인쇄 절차는 EXAM-PRINT-PIPELINE |
| 빌더 재오픈 | `exam-paper-builder-existing.ts` | 상세와 같은 결과(519개 시험지 대조 차이 0) |
| HWPX 시험지 | `export-hwpx/_lib/exam-document.buildExamHwpxDocument` → `export-model.hwpxBuilderInput` | `route.ts` 는 SELECT 뒤 이것만 부른다 |
| DOCX 시험지 | `export-docx/_lib/build-builder-document/assemble.buildExamDocxDocument` | settings NULL · similar-v1 도 같은 경로 |
| 단일 문항 HWPX · DOCX | `api/questions/[questionId]/_lib/load-single-question-export` → `examQuestionToPaperItem` | 학원 범위를 where 에 건다 |
| 관리자 시험지 DOCX | `api/admin/exam-export/route.ts` → `buildExamDocxDocument` | 26-09-30 레거시 `build-document` 폐기. printCount 는 기록하지 않는다 |
| 관리자 보기 · 인쇄 | `(admin-bare)/admin/exam-print/page.tsx` → `components/admin/exam-print-model.buildAdminPrintModel` | `window.print()` 직접 호출(인쇄 계약 밖 — EXAM-PRINT-PIPELINE §4) |
| 랜딩 데모 파일 생성 | `scripts/landing/build-demo-exports.mts` | 공개 파일(`public/landing/demo/*`)은 아직 07-11 레거시 산출물 |
| 「원문 지문 없음」 경고 | `a4-paper-page-parts/missing-passage-items.ts` · `missing-passage-warning.tsx` | §6 |
| 감사 · 백필 | `scripts/exam-pagination/export-parity-audit.ts` · `scripts/backfill/orphan-passage-backfill.ts` | §14 · §5 |

레거시 렌더러 `export-docx/_lib/build-document.ts` · `build-question.ts`(와 그것만 쓰는 `render-*`)는 운영 호출처가 0 이다.
새 소비처가 이것을 다시 import 하지 않도록 계약 테스트(`exam-paper-legacy-cleanup-contract` L3)가 지킨다. 삭제는 별도 정리 건이다.

---

## 2. 지문을 실을지 — includePassage (옛 §2.4)

판정은 `passage-policy.resolveIncludePassage({ saved, question, setKind })` 하나다. `question.passage.content` 에는 §3 에서 고른
**인쇄될 지문**을 넣어 부른다(빈 스냅숏이 강제 판정을 가리지 않게).

```
setKind = passageSetKindFor(question)   기출 장문(_gichul.set.key) → "gichul" · setId + 국어 유형 → "ko" · setId → "english" · 그 밖 null
1) "ko"      → false                    멤버 안 지문을 억제한다. 공유지문 1박스는 그룹 선두가 항상 그린다(§4)
2) "gichul"  → 저장값이 boolean 이면 그 값, 아니면 기본값      ← 강제 규칙을 적용하지 않는다(아래 「기출 세트 결정」)
3) 인쇄 강제(isSourcePassageForcedForPrint) → true
4) 저장값이 boolean(빌더 「지문 표시」 토글의 결과) → 그 값
5) 저장값 없음(settings NULL · similar-v1 · 새로 담은 문항) → 기본값 defaultIncludePassage
```

선생님 의도(저장된 토글)가 기본값보다 앞선다. 종전에는 저장 뒤 상세 · 인쇄 · 재오픈이 `기본값 || 저장값 === true` 로 끈 지문을
되살려 웹 안에서도 편집 미리보기와 인쇄가 달랐다(5/30 `abf8cfa6` WIP 스냅숏에서 생긴 규칙, 의도 기록 없음). 26-09-30 전환의
운영 영향(SELECT): 상세 · 인쇄는 19문항 · 2개 시험지(모두 WORD_ORDER 저장값 false)에서 지문이 빠졌다. 재오픈은 65개 시험지 ·
21개 학원 · 307문항이 바뀌었다. 상세와 재오픈의 차이는 0이다.

### 강제 목록 (코드 기준 — `isSourcePassageForcedForPrint`)

| 규칙 | 유형 | 조건 |
|---|---|---|
| (a) `shouldForceSourcePassage` | TOPIC · MAIN_IDEA · TOPIC_MAIN_IDEA · TITLE · CONTENT_MATCH · SUMMARY_COMPLETE_MC · SUMMARY_WRITING · 국어 지문 동봉형(레지스트리 `includesPassage`) | source 흐름 · HIDEABLE 아님 · 발문/구조화 필드에 내장 지문 없음 · 지문 있음 · **기출 세트 멤버 아님** |
| (b) `ALWAYS_INLINE_SOURCE_PASSAGE_SUBTYPES` | SUMMARY_COMPLETE · SUMMARY_COMPLETE_MC · SUMMARY_WRITING · TOPIC_SENTENCE_WRITING | 지문 있음. 웹이 토글과 무관하게 문항 안에 항상 그리므로 인쇄 규칙에서도 강제다 |

- 끌 수 있는 유형(`HIDEABLE_SOURCE_PASSAGE_SUBTYPES`): CONDITIONAL_WRITING · SENTENCE_TRANSFORM · WORD_ORDER · SYNONYM.
  SUMMARY_COMPLETE · TOPIC_SENTENCE_WRITING 도 이 목록에 있지만 (b) 가 강제하므로 빌더 토글이 효과가 없다(알려진 UI 불일치).
- 내장 지문 유형(embedded 흐름 — 빈칸 · 어법 · 어휘 · 순서 · 삽입 · 함축 · 지칭 · 무관 · 커스텀 등)은 강제가 아니고 기본값이 false 다.

### 기본값 (`defaultIncludePassage` — makePaperItem 과 같은 함수)

- 국어 세트 멤버 → false. 기출 세트 · 영어 세트 멤버 → 지문이 있으면 true. SUMMARY_WRITING · TOPIC_SENTENCE_WRITING → true.
- 그 밖 → `shouldIncludeSourcePassageByDefault`: 지문 없음 false · 정답 노출형(`ANSWER_BEARING_SOURCE_SUBTYPES` = CONDITIONAL_WRITING ·
  SENTENCE_TRANSFORM, 정답이 원문 문장이라 베껴 쓰게 된다) false · source 흐름은 내장 지문 표시가 없으면 true · embedded 흐름 false.
- source 흐름인데 인쇄할 지문이 없으면(지문 삭제 · 미연결) 「지문이 있었다면」의 값으로 정한다(26-09-30 MODEL-FINISH). 빈 지문은
  어디에도 찍히지 않으므로 인쇄는 그대로다. 이 값은 의도 기록이라, 저장한 뒤 지문이 복구되면 기본값대로 찍힌다.

### 기출 세트 결정 — 선생님 토글을 따른다 (감독 최종, 26-09-30 · CM-R1 B안)

기출 장문 세트 멤버는 인쇄 강제 대상이 **아니다.** 세트 지문은 빌더 「지문 표시」 토글(세트 전체가 공유 —
`use-paper-items.updateItem` 의 `sharedPassage`)을 따른다. 옛 스펙 문구 「기출 세트 규칙 등 현행 강제 규칙 → 항상 true」와
다르며, **이 문서가 우선한다.**
- `shouldForceSourcePassage` 가 기출 멤버를 빼므로 저장기(`save-draft.resolveSerializableIncludePassage` =
  `includePassage || shouldForceSourcePassage`)도 선생님 값을 그대로 기록한다. 편집 → 저장 → 재오픈 왕복이 성립한다
  (`exam-paper-core-roundtrip.test.mjs`). 종전에는 끈 세트의 TITLE · CONTENT_MATCH 멤버가 true 로 저장돼 지문이 되살아났다.
- 운영 영향(26-09-30 SELECT): 기출 세트가 있는 시험지 2개 · 세트 3개가 모두 저장값 true 라 출력 변화는 0이다.
- 배포 전 운영 코드(HEAD)로 「끈 세트」를 저장하면 강제형 멤버가 true 로 남는다. 배포 뒤 다시 끄고 저장하면 바로잡힌다(현재 0건).

영어 세트 멤버의 includePassage 는 기록일 뿐이다. 공유 지문 박스는 지문만 있으면 그룹 선두에 한 번 찍힌다
(`shouldRenderSourcePassageForItem`). 강제형 멤버(TITLE · CONTENT_MATCH)가 true 여도 문항 안 지문은 없다(§4).

---

## 3. 어떤 지문을 — 지문 원천 순서 (옛 §2.5)

`passage-policy.resolvePrintablePassage` 가 정한다.

1. **비어 있지 않은** 빌더 스냅숏(`settings.items[] / blocks[]` 의 `passageContent`). 빈 문자열 · 공백뿐인 스냅숏은 「없음」이다
   (`??` 로 고르면 안 된다 — 고객 80문항 빌더 저장본의 고아 14문항이 모두 `passageContent: ""` 였다).
2. DB 지문 `question.passage.content`.
3. `structuredData._sourcePassage.content` — 지문을 지울 때 떼어 낸 원문 보관본(§5).
4. 없음(`origin: "missing"`) — §6 경고 대상이 될 수 있다.

- 제목은 원천별 후보 중 첫 비공백이다. 스냅숏이면 [스냅숏 · DB · 보관본], DB 면 [스냅숏 · DB], 보관본이면 [스냅숏 · 보관본]
  (`export-passage-title-priority.test.mjs`).
- 지문 id: DB 지문 id → 보관본이면 `detached:<원 지문 id>` → 그 밖 `saved:<문항 id>`. 내보내기 라우트는 `passage.id` 를 SELECT 하지
  않아 서버에서는 문항마다 `saved:<문항 id>` 다. **지문 id 로 「같은 지문」을 판정하는 규칙을 만들지 말 것**(§4 묶음 규칙이
  그룹 id 를 쓰는 이유).
- 정규화는 `normalizePassageText`. 국어 세트 멤버는 원문 개행(운문 행)을 보존한다. 기출 반입 문항의 각주
  (`_gichul.footnotes`)는 지문 꼬리에 붙는다.

---

## 4. 어디에 찍나 — 두 자리

지문은 **두 자리에만** 찍힌다. 렌더러(웹 조판 · HWPX · DOCX)는 이 두 값만 본다.

| 자리 | 값 | 규칙 |
|---|---|---|
| ① 그룹 지문 박스 | `buildGroups(paperItems)` 의 `group.includePassage · passageContent · passageTitle · setPrompt` | 그룹 안 어느 문항이든 지문을 원하면 켠다. 비문항 블록으로 쪼개진 같은 그룹은 한 번만. 영어 세트는 병합 지문 + 「[n~m] 다음 글을 읽고, 물음에 답하시오.」. 국어 세트는 지시문 + 마커 병합 공유지문 1박스(`applyKoSetSharedPassages`). 기출 세트는 세트 토글 |
| ② 문항 안 지문 | `PaperExportItem.printInlinePassage` = `inlineSourcePassageForItem(item)` | 구조화 유형(`isFlowStructuredSubtype`)만. `structuredSegments` 의 passage 박스. **세트 멤버는 항상 ""**(공유 지문은 ①). PaperItem 하나로 정해진다(그룹 문맥 불필요) |

- **지문 묶음 규칙**(`dropBundleBoxAfterInlinePassage`, 26-09-30): 세트가 아닌 지문 묶음(`passage:` 그룹 — 빌더 「지문별로 다시
  묶기」 · 유사 시험지)에서 박스를 켠 첫 멤버보다 앞서 문항 안에 지문을 그린 멤버가 있으면 그룹 박스를 끈다. 앞 멤버의 문항 안
  지문이 한 번의 출력이고, 뒤 멤버는 위의 지문을 본다. ①이 ②를 보고 조정하므로 ② 계약은 바뀌지 않는다.
- **includePassage 는 판정 기록이다.** 「문항 안 지문을 그릴지」로 다시 해석하지 않는다(`includePassage !== false || force` 금지).
  국어 문항의 지문 억제도 HWPX · DOCX 모두 `koPaperRenderModel({ ...item, includePassage: printInlinePassage 있음 })` 로 판정한다.
- **계약 예외 — SENTENCE_TRANSFORM 의 [원문] 블록**: 본문에서 [원문] 을 지우는 조건은 세 출력 모두 `includePassage !== false` 다
  (웹 `question-body-layout.ts` 의 본문 규칙을 따른다). 그래서 저장값 true 인데 지문이 사라진 문항은 [원문] 도 지문도 안 찍힌다(세
  출력 같음). 고치려면 세 곳을 함께 「실제로 찍히는 지문이 있는가」로 바꿔야 한다(§12).
- 문항 안 지문 위치: 웹 · DOCX 는 조건 영작 · 배열 영작 · 문장 전환(DOCX 는 주제문 영작 포함)만 지문 → 본문, 그 밖은 본문 → 지문.
  HWPX 는 항상 지문 → 본문(§12).

---

## 5. 지문 삭제 정책과 원문 보관본 (옛 §2.6)

지문 삭제는 **막지 않는다.** 모든 삭제 경로가 `src/actions/workbench/_lib/passage-delete-guard.ts` 를 거친다.

- (a) **학원 범위 강제** — 호출자 학원의 지문만 계획에 들어간다(IDOR 차단).
- (b) **옮겨 연결** — 같은 학원에 정규화 전문(`\s+` → 공백 하나, 앞뒤 자름. 그 밖 글자는 그대로)이 **완전히 같은** 지문이 있으면
  (가장 먼저 만든 것) SET NULL 로 끊길 참조를 그쪽으로 옮긴다: 문항 · 생성 잡 · 세트 기본 지문 · 교사 프롬프트 · 튜터 AI 로그.
- (c) **원문 보관** — 없으면 연결 문항(휴지통 포함)마다 `structuredData._sourcePassage` 를 쓴 뒤 삭제한다. 쓸 자리가 없는
  structuredData(배열 · 숫자 등, `unsupported`)는 원문이 감사 이벤트에만 남는다.
- (d) **감사 이벤트** `PASSAGE_DELETE`(`buildPassageDeleteAuditEvents`, 보관 시 원문 사본 포함).
- (e) **확인창은 사실대로**(`components/workbench/passage-delete-confirm.ts`) — 연결 문항 · 시험지 사용 · 동일 지문 유무 · RESTRICT
  참조를 조회해 보여 준다. 거짓 문구 「관련 문제도 모두 삭제됩니다」는 없앴다.
- 외래키는 그대로(SET NULL). RESTRICT 참조(튜터 수업 · 시즌 커리큘럼 · 학습 진도 · 학습 기록 · 내신 문항 · 학습 세트)가 있으면 DB 가
  거부하므로 미리 걸러 「삭제하지 않음」으로 보고한다. 한 트랜잭션에 지문 20개(타임아웃 60초).

```
structuredData._sourcePassage = {
  passageId:  string   // 지운 지문 id
  title:      string
  content:    string   // 원문 그대로(정규화 전)
  detachedAt: string   // ISO 시각
}
```

- 읽기: `passage-policy.readDetachedSourcePassage`(객체 · JSON 문자열 모두, content 가 비면 없음). 다시 다른 지문을 지우면 덮어쓴다.
- **서버 관리 키**: 문항 편집 경로(`workbench/questions.ts` 편집 · `question-ai-edit.ts` 적용 · 새 문항 저장)는
  `_lib/source-passage-preserve.ts` 로 이전 DB 값을 이어 붙인다. 클라이언트가 보낸 `_sourcePassage` 는 버린다(위조 방지). 저장 형태
  (객체 / JSON 문자열)는 유지한다.
- **배포 순서**: 삭제 가드 · 보관본 읽기(§3) · 편집 경로 보존 · HWPX/DOCX 소비는 **한 배포**로 나가야 한다. 따로 나가면 확인창이
  「원문을 보관한 채 남습니다」라고 약속하는데 인쇄에는 지문이 없거나, 편집 한 번에 보관본이 지워진다.
- 알려진 틈: 클래스 스튜디오의 `studio_class_passages` 약한 참조는 옮기지 않는다(동일 지문으로 옮겨도 스튜디오 목록에서
  사라진다 — 결정 대기). 등록 취소(unpromote) 라우트는 삭제 가드와 다른 자체 참조 목록을 쓴다.

**지난 고아 복구(백필)** — 이 정책 이전에 지워진 지문의 문항: `scripts/backfill/orphan-passage-backfill.ts`(기본 dry-run, SELECT 만).
단계 0(고객 이스팀 14문항 → 같은 전문의 day 6 지문), 1(전역 동일 전문 재연결), 2(`_sourcePassage` 보관, 전부 검토). 적용은
`--apply --academy <id> --stages <검토본과 같은 값> --plan <검토본>` 이고, 검토본 `applyScope` 해시가 지금 DB 로 다시 만든 값과
같아야 한다. 26-09-30 전 학원 dry-run: 고아 2,370문항 · 23개 학원(0단계 14 · 1단계 216 · 검토 대기 62 · 2단계 676 · 복구 불가 215 ·
손대지 않음 1,187). **운영 적용은 아직 없다**(건별 승인 대상). 백필은 위 배포와 운영 스모크 **뒤에만** 한다 — 먼저 하면 옛 HWPX 가
재연결된 지문을 번호 없는 원문으로 다시 찍는다.

---

## 6. 「원문 지문 없음」 판정

단일 판정 `saved-paper-items.isPaperItemSourcePassageMissing(item)` → `passage-policy.isSourcePassageMissing`. 참이 되려면 넷 다
성립해야 한다.

1. 찍을 지문이 비었다. 웹 기준은 `item.passageContent → sourceQuestion.passage.content` 폴백(빌더에서 박스 글을 지워도 원문으로
   찍히므로 경고 없음). HWPX · DOCX 기준은 §3 의 `resolvePrintablePassage`(서버 판정 ⊆ 웹 판정).
2. source 흐름 유형이다(국어는 레지스트리 `includesPassage`).
3. 발문 · 구조화 필드에 내장 지문이 없다.
4. **지문이 있었다면 찍었을 것**(`wouldPrintSourcePassage`): 영어 · 국어 세트 멤버는 참. 그 밖은 지문이 있다고 가정한
   `resolveIncludePassage` — 강제 유형은 항상, 저장값 false 는 **선생님 선택이라 경고하지 않는다**, 저장값 없음은 기본값.

- 시험지 문맥 없이 부르면(백필 2단계 대상 판정) 4를 건너뛴다(어떤 저장값으로든 찍힐 수 있으면 참).
- 경고는 **막지 않는다**: 빌더 · 상세 배너와 문항 칩, 인쇄 뒤 토스트(상세 컴포넌트를 쓰는 진입점 — 상세 · 빠른보기 · 카드 대화상자 ·
  딥링크), HWPX · DOCX 내보내기 토스트(빌더 툴바 · 메뉴, 상세 툴바, 상세 머리 「시험지 다운로드」 DOCX).
- 통일 전후(26-09-30, 전 시험지): UI 45 · 감사 50 · 내보내기 45 → 42 · 42 · 42.
- 고객 두 시험지의 경고(80문항 #27 · 31 · 35 · 69 · 77, 107문항 #20 · 23 · 24 · 27 · 29)는 데이터 문제(지문 삭제)다. 0단계 백필(§5)
  승인 대기.

---

## 7. 정답표 표기 (`answer-key-entries.ts`)

- 원천: 빌더에서 고친 정답(`item.correctAnswer`) → 없으면 원 문항 값. 표기 `formatStoredQuestionCorrectAnswer`(어법 (B) → ② 등).
- **원문자 통일**(`circledObjectiveAnswer`, 표시만 — 저장값 불변): 객관식(선지 + 추가 슬롯 > 0)의 단일 정답이 순수 숫자이고 선지
  개수 안이면 ①~ 로 바꾼다. 주관식 · 복수 정답(「2, 4」) · (A) 형 · 범위 밖 숫자는 그대로 둔다.
- 번호는 시험지 순서(문항 블록만 1부터 — `orderNum`).
- 모양: 웹 · DOCX 는 5열 그리드, 가장 긴 정답이 20자를 넘으면 전체 폭 목록. 웹은 정답표를 쪽 단위로 나눈다(`answer-key-layout.ts`).
  HWPX 는 1단 전체 폭 별도 구역(section2)의 10칸 밴드 표, 20자 초과면 번호 목록(E36).
- 해설 포함(`includeAnswers`)은 정답표가 없다. 대신 문항마다 정답 배지가 붙는데, 배지는 원문자 통일을 거치지 않아 숫자와 원문자가
  섞인다(세 출력 같음 — §12).
- 26-09-30 실측: settings NULL 107문항 HWPX 정답표 원문자 30 → 106/107(나머지 1은 서술형), DOCX 106/106 + 서술 1.

---

## 8. 레이아웃 기본값 (`paper-layout-defaults.resolvePaperLayout`)

| 값 | 기본(저장값이 boolean · 알려진 값이 아닐 때) |
|---|---|
| columns · paperSize · density | 2 · A4 · comfortable(`columns === 1` 일 때만 1단) |
| showAnswerSpace | true |
| showPassageTitle | false(`DEFAULT_SHOW_PASSAGE_TITLE`) |
| showQuestionMeta(「[n점 · 유형]」 배지) | **false** — settings NULL 시험지 HWPX 배지 107 → 0 |
| forceTwoPerPage | `=== true` 일 때만. 실제 사용은 `forcedPerPageEnabled = forceTwoPerPage && !includeAnswers`(웹 · HWPX) |
| header.instructions · studentNameLabel | `DEFAULT_INSTRUCTIONS` · 「이름」 |
| cover | `normalizePaperCover` |

- 소비: 웹 상세 · 첫 장 미리보기(26-09-30 인라인 기본값 제거, 519개 시험지 13개 필드 대조 차이 0), HWPX(2단 표 경로 포함), DOCX.
- 배지를 켰을 때: `[n점 · 유형 라벨]`, 라벨이 없는 유형은 `[n점]` 만(웹 · HWPX · DOCX 같음 — 26-09-30 원시 코드 「UNKNOWN」 폴백 제거).
- 표지: 웹은 `cover.enabled` 일 때만 표지. HWPX 는 표지를 항상 그린다(E36 사용자 확정). HWPX 는 header 를 저장값 그대로 받아
  settings NULL 시험지의 표지에 안내문이 없다(§12 — 표지 모델 통일은 §13 범위 밖).

---

## 9. 선지 묶음 — 웹 · HWPX · DOCX (옛 §2.7)

**규칙(세 출력 공통)**: 한 문항의 선지 ①~⑤(다중 빈칸 행 · 추가 슬롯 ⑥… 포함)는 단 · 쪽 경계에서 쪼개지지 않는다. **한 단보다 긴
묶음만** 예외로 쪼갠다. 문항 머리(발문)가 단 바닥에 홀로 남지 않게 한다. **지문 · 본문 문단은 묶지 않는다**(한 문단이 15~18줄이라
묶으면 큰 공백이 생긴다).

렌더러는 역할만 고르고, 역할 → 엔진 속성 변환은 출력마다 한 모듈이 한다.

| 역할 | 웹 조판 `pagination-keep.ts` | HWPX `export-hwpx/_lib/keep-policy.ts` (breakSetting) | DOCX `export-docx/_lib/keep-policy.ts` (w:pPr) |
|---|---|---|---|
| 문항 머리 questionHead | 발문 뒤 본문이 2줄(`KEEP_SHORT_BODY_LINES`) 이하이고 곧바로 선지면 발문 + 그 줄 + 선지를 한 묶음. 그 밖 머리는 최소 시작 줄 3(`MIN_QUESTION_START_LINES`) | keepWithNext + keepLines. 뒤가 또 머리면 kwn 없음 | keepNext + keepLines. 문항 안에 뒤 요소가 있을 때만 keepNext. 추정 6줄(`KEEP_MAX_LINES`) 초과면 없음 |
| 캡션 caption(주어진 문장 · ↓ · 〈보기〉 · [조건] · 세트 안내문 · 지문 제목 · 해설 라벨) | 해설 라벨은 첫 줄과 한 조판 단위(`explanation-layout.ts`) | keepWithNext + keepLines | keepNext + keepLines. 본문 안 단독 라벨 줄(`isStandaloneLabelLine`)도 |
| 다중 빈칸 머리 optionHead | 그리드 행이 선지 묶음에 든다 | keepWithNext + keepLines | 표 머리 행 = 선지 행과 같은 keep + 행 cantSplit |
| 선지 option | 첫 선지 → 마지막 선지 · 추가 슬롯(`keptRunEnd`) | keepLines, 다음이 선지면 kwn. 빈 문단(최대 2) 너머가 정답 배지면 이어 묶는다 | keepLines, 묶음 마지막이 아니면 keepNext. **배지로 잇지 않는다**(아래) |
| 정답 배지 badge(해설 모드) | 독립 단위 | 역할 표 keepWithNext | 행 cantSplit + 행 문단 keepNext · keepLines(뒤에 해설이 있을 때). 배지 → 간격 → 「해설」 은 `bridgeKeep` |
| 역할 없음(지문 · 본문 · 해설 문단) | 묶지 않음(지문 시작 최소 2줄 `MIN_PASSAGE_START_LINES`) | 0 | 0 |
| 상한 | 한 칸보다 긴 묶음은 종전처럼 블록 단위로 흘린다 | 사슬 추정 높이 × 1.15 > 단 높이면 선지 묶음 앞에서 끊는다(`CHAIN_CAP_FRACTION = 1`). 다음 블록이 강제 나눔이면 kwn 을 뗀다 | 엔진에 맡긴다(역할 문단 6줄 상한만) |
| 켜짐 | exam-font 조판(미리보기 · 인쇄)이고 쪽당 N문제 강제가 아닐 때. 해설 모드는 강제가 꺼지므로 켜진다 | 흐름형 본문(네이티브 2단 · 1단 흐름)만. 2단 표 경로에는 없다(§11). `HWPX_KEEP_TOGETHER=0` 이면 끔 | 항상 |

**엔진 차이(실측 26-09-29 · 30)**

- **한컴 2024 · HWPX**: keepWithNext 는 단 경계와 쪽 경계 모두에서 동작한다. 다음 문단이 본문이면 **첫 줄만** 붙인다(first-lines).
  사슬은 전이된다. 한 단보다 긴 사슬은 시작을 다음 단 첫머리로 옮긴 뒤 거기서 쪼갠다 — 원래 단에 큰 빈칸이 남으므로 상한이 필요하다.
- **Word · DOCX**: keepNext 문단은 쪽 · 단 경계에서 나뉠 수 있다(마지막 줄만 다음 문단과 붙는다). 사슬 상한이 없어 통째로 옮긴다.
  선지 → 배지 → 「해설」 → 첫 줄 사슬(단의 약 40%)을 걸었더니 25% 넘는 빈 단이 정답포함 A 0 → 10, B 0 → 9 로 늘었다. 그래서 DOCX 는
  선지 → 배지 다리를 두지 않는다(**의도된 차이**). 대가: 배지가 선지와 떨어져 다음 단 첫머리에서 시작할 수 있다.
- **한컴이 연 DOCX**: keepNext 문단을 **통째로** 다음 문단과 같은 단에 두려 한다. 선지 앞 본문(대개 지문 전체)에 keepNext 를 걸자
  74~82% 빈 단이 생겼고, 사슬이 한 단보다 길면 keep 을 포기해 선지가 갈라지고 머리 줄만 단 바닥에 남았다(HW-1) → 본문 keepNext 를
  없앴다. 표 셀 문단의 keepNext 를 표 전체의 「다음 문단과 함께」로 늘 읽지는 않아 배지 바닥 고아가 일부 남는다. 한글 사용자의 정본
  경로는 HWPX 다.

**실측(26-09-30, 한컴 2024 · Word, 고객 A 107 · B 80 외 시험지 7~8종 × 일반 · 정답포함)**

| | 선지 쪼개짐 | 머리 고아(엄격) | 라벨 고아 | 정답 배지 |
|---|---|---|---|---|
| 웹 PDF(25개) | 0(고객 80: 60묶음, 107: 80묶음) | — | 0 | — |
| HWPX-한컴(16문서) | 0 | 0 | 0 | 바닥 고아 0 · 단 첫머리 A 2 · B 1 |
| DOCX-Word(14문서) | 0 | 0 | 0 | 바닥 고아 0 · 단 첫머리 A 23 · B 11 |
| DOCX-한컴(14문서) | 2 → 0 | A 2 → 0 · B 2 → 0 · SIM 1 → 0(남은 MD 1은 계측기가 「3.」 목록을 머리로 잡은 거짓 양성) | A해설 10 · B해설 5 등 → 0 | 바닥 고아 A해설 5 · 단 첫머리 10 · 12 |

25% 넘는 빈 단은 HWPX-한컴 일반 모드 0(1단 B 는 8/33 — §12 쪽 나눔). DOCX 는 A 한컴 1 · 세트 시험지 한컴 2 / Word 1 이 남았다 —
본문이 없는 문항의 「머리 + 선지 묶음」(약 12줄)이 단 바닥에 안 들어가 통째로 넘어간 경우로, 이 규칙이 요구하는 대가다.

---

## 10. HWPX lineseg 폭 (옛 §2.8, `export-hwpx/_lib/section-xml.ts` `linesegWidthFor`)

**규칙**: 본문 문단의 줄 배치 캐시(`linesegarray` 의 `horzsize`) 폭은 **단 폭 W 안이면서 4의 배수가 아닌 값**이다.
- 다단: W = floor((본문 폭 − 단 간격 × (n−1)) / n), 폭 = W − 1, 그것이 4의 배수면 W − 2.
- 1단: 본문 전체 폭, 4의 배수일 때만 −1(A4 54202 · 55142 는 그대로 = 예전과 바이트 동일, B4 67524 → 67523).

**왜**(한컴 2024 실측): 한컴의 실제 줄 폭은 가용 폭을 4 HPU 단위로 내린 값 floor(W/4)·4 다. 그리고 파일의 폭이 그 값과 **정확히 같을
때만** 우리 줄바꿈 캐시를 믿는다 → 단어 간격 벌어짐 · 쪽 수 변화 · 빈칸 밑줄 소실(A4 2단 25848: 57 → 58쪽, B4 2단 · 1단: 단어 수만 개
이동). 한 칸이라도 다르면 캐시를 버리고 스스로 배치해 lineseg 를 지운 파일과 단어 위치가 같다. 4의 배수가 아닌 값은 한컴 폭과 겹칠
수 없다 — 캐시를 믿는 다른 뷰어엔 단 안에 들어가는 줄을, 한컴 2024 엔 자체 배치를 준다(예전 2단의 전체 폭 54202 는 캐시를 믿는
뷰어라면 두 단을 가로지를 수 있었다 — 고객 RCA §2.4 D, 미증명 후보).

- 범위 밖: 표 셀 안 문단과 머리말 · 꼬리말 subList 의 lineseg(표지 셀 11924 · 21088, 빈 답란 표 25848 등 4의 배수가 남아 있다 — 짧거나
  빈 텍스트라 지금은 이동 0). 긴 텍스트 셀이 생기면 같은 붕괴가 날 수 있다.
- 검증: `tests/unit/hwpx-keep-together.test.mjs`, 게이트 실측 본문 lineseg 중 4의 배수 0(2단 25847 · 26317, 1단 54202 · 55142, B4 32507).
- 실측은 이 머신의 한컴 2024 뿐이다. 구버전 한글 · 한컴 뷰어 · 한컴독스 · 모바일은 미검증.

---

## 11. 환경 변수 스위치

HWPX 내보내기는 요청마다 `process.env` 를 읽는다. **미설정이 정상 동작**이고 넷 다 진단 · 비상용이다. Vercel 환경변수를 바꾸면
**재배포**해야 적용된다(로컬은 개발 서버 재시작). 넷 다 `.env.example` 에 아직 없다. 라우트는 요청마다
`[export-hwpx] keep chains=… capped=… conflicts=… flagged=… droppedKeepLines=… enabled=…` 한 줄을 남긴다.

| 변수 | 값 | 미설정(기본) | 켜면 무엇이 꺼지나 | 코드 |
|---|---|---|---|---|
| `HWPX_KEEP_TOGETHER` | `0` | §9 역할 → keepWithNext/keepLines 적용 | **keep 정책 전체**(선지 묶음 · 머리 · 캡션 · 정답 배지). 선지가 단 경계에서 갈라질 수 있다. 사슬 때문에 생긴 큰 빈칸이 신고됐을 때 확인용 | `_lib/keep-policy.ts` `keepTogetherEnabled()` |
| `HWPX_LINESEG_WIDTH` | `full` | §10 규칙 | **lineseg 폭 규칙**. 어디서나 본문 전체 폭(예전 동작). A4 1단은 바이트 동일, B4 · 다단은 한컴 캐시 신뢰 붕괴(쪽 수 변화 · 단어 이동)가 다시 날 수 있다 | `_lib/section-xml.ts` `linesegWidthFor()` |
| `HWPX_NATIVE_2COL` | `0` | 2단 시험지 = 네이티브 2단 구역(한컴 자동 흐름) | **네이티브 2단**. 순수 문항 2단은 쪽마다 [좌칸 · 간격 · 우칸] 원자 표(웹 조판의 쪽 나눔 계획 사용, 해설 모드는 그리디 패킹), 커스텀 블록이 섞이면 전체 폭 1단 흐름으로 간다. 표 경로에서는 `applyKeepPolicy` 를 부르지 않아 **§9 선지 묶음이 통째로 꺼진다** | `_lib/builder.ts` `useNative2Col` |
| `HWPX_SAFETY_PX` | 숫자(px) | 40 | 네이티브 2단에서는 효과 없다. `HWPX_NATIVE_2COL=0` 의 표 경로(순수 문항 · 해설 아님)에서 쪽 용량 안전 여백을 바꾼다. 작으면 원자 표가 넘쳐 통째로 다음 쪽으로 밀릴 수 있다 | `_lib/builder.ts` `contentSafetyPx` |

웹 조판의 개발 전용 스위치(`localStorage.paperOverflowGuard = "off"`)는 EXAM-PAGINATION-OVERFLOW §3.2.

---

## 12. 남은 출력 차이 (26-09-30 기준, COH-10)

공용 모델을 써도 렌더러 차원에서 남은 차이다. 「의도」는 바꾸지 않는다. 「결함」 · 「결정 대기」는 고칠 때 이 표를 갱신한다.

| # | 차이 | 웹 | HWPX | DOCX | 성격 |
|---|---|---|---|---|---|
| 1 | 문항 안 지문 위치(§4) | 영작 3종만 지문 → 본문 | 항상 지문 → 본문 | 웹 + 주제문 영작 | 결함(고객 두 시험지 0건). HWPX 에 `shouldPlaceInlinePassageBeforeBody` 적용 필요 |
| 2 | 기출 3점 발문 꼬리 「[3점]」(`questionStemPointsSuffix`) | 있음 | 없음 | 없음 | 결함 |
| 3 | 국어 유형 라벨 38개(배지 켬) | `[n점]` | `[n점 · 국어 라벨]` | 같음 | 결함. 라벨 표가 세 벌(웹 constants · HWPX · DOCX). 운영 국어 시험지 0 |
| 4 | 쪽 나눔 | 추정 + 넘침 가드 | 네이티브 2단 = 한컴 자동 흐름. 1단 · 표 경로 = 웹 조판의 쪽 시작에 강제 나눔(한컴이 더 촘촘하면 쪽 바닥 공백, 1단 B 최대 77%) | 엔진 자동 흐름 | 결함(HW-5, 운영 1단 시험지 0) |
| 5 | 쪽당 N문제 · 항목별 강제 나눔 · 표지 | 있음 | 있음 | 없음 | 의도(§13) |
| 6 | 표지 | `cover.enabled` 일 때만 | 항상. settings NULL 이면 안내문 없음 | 없음 | 표지는 의도(E36) · NULL 안내문은 결함(표지 모델 통일 §13) |
| 7 | 정답표 모양(§7) | 5열 그리드 | 10칸 밴드 | 5열 그리드(머리 「문항 / 정답」 2줄 접힘) | 의도 · 머리 접힘은 결함 |
| 8 | 해설 모드 정답 배지 표기 | 숫자 · 원문자 혼재 | 같음 | 같음 | 결정 대기(HW-6). 정답표의 복수 정답 「2, 3, 4, 5」도 숫자 그대로 |
| 9 | SENTENCE_TRANSFORM [원문] 제거 술어(§4) | `includePassage` | 같음 | 같음 | 계약 예외. 지문이 사라진 저장값 true 문항은 [원문]도 지문도 없음 |
| 10 | 비세트 지문 묶음의 문항 안 지문 2회 이상 | 11개 묶음 · 7개 시험지(고객 80문항 #53+54, #74+76 포함) | 같음 | 같음 | **감독 판단 대기** — 빌더 「다시 묶기」는 첫 멤버만 켜는데 저장기 · 재오픈 강제 규칙이 강제형 멤버를 true 로 만든다. 고치면 고객 인쇄가 바뀐다 |
| 11 | 내장형 문항 + 저장값 true → 그룹 박스 + 발문 속 지문 | 2회 | 같음 | 같음 | 결함. 감사 탐침이 못 본다(GA-3), 운영 빈도 미측정 |
| 12 | 해설 글 | HTML 이 공백을 접음 · 평문 | 짝 없는 `**` 를 지운 자리에 두 칸 · 원문자 · (A) 표식 · 밑줄 서식 있음 | 같음(HWPX) | 기존 차이 |
| 13 | keep 대가(§9) | — | 배지 단 첫머리 A 2 · B 1 | 배지 단 첫머리 Word 23 · 11 / 한컴 10 · 12, 한컴 배지 바닥 고아 5, Word 인접 테두리 병합으로 답란 선 1개 | 의도 · 기록 |

남은 이중 출력의 드문 경우(운영 0건, 테스트로 현상 고정): 박스를 원하는 멤버가 문항 안 지문 멤버보다 **앞**인 묶음, 박스와 문항 안
지문이 비문항 블록 앞뒤 조각으로 갈린 묶음, `passage:` 가 아닌 임의 그룹 id. similar-v1 시험지 `cmppijdnd` 41~42번은 41번 문항 안에
지문이 한 번 찍히고 42번이 그것을 읽는다(수능형 「41 위 그룹 박스」 배치가 아니다 — 묶음 규칙의 결과).

---

## 13. 범위 밖 (옛 §2.9)

- 빌더 저장 형식 변경 — `settings.items[].passageContent` 에 지문 전문을 문항마다 복사해 settings 가 49만~61만 자가 된다(지문 id 참조로
  바꾸면 인쇄 · 빌더 로딩량이 절반 가까이 준다).
- 표지 모델 통일(웹 · HWPX · DOCX).
- DOCX 의 쪽당 N문제 · 강제 나눔(breakBefore) · 표지.
- 외래키 RESTRICT 전환(§5 는 SET NULL 을 전제로 한다).
- 운영 DB 백필 **실행**(스크립트 · dry-run 까지만. 적용은 건별 승인).

---

## 14. 검증

| 무엇 | 도구 |
|---|---|
| §2 · §3 판정 매트릭스(settings NULL · v1 · v2 · similar-v1 × 세트 종류 × 유형 × 저장값 × 스냅숏 × DB 지문 × 보관본, 독립 오라클) | `tests/unit/exam-paper-core-model.test.mjs` |
| 저장 → 재오픈 왕복 · 기출 세트 토글(§2 결정) | `exam-paper-core-roundtrip.test.mjs` |
| 지문 묶음 규칙 · 새로 담은 문항의 보관본(§3 · §4) | `exam-paper-model-finish.test.mjs` |
| HWPX · DOCX 가 공용 정본만 소비 · 단일 문항 | `hwpx-shared-model` · `docx-single-question-passage` · `ko-set-export-wiring` · `export-passage-title-priority` |
| 레거시 경로 · printCount · 원시 배지 금지 | `exam-paper-legacy-cleanup-contract`(L1~L7) · `exam-paper-legacy-cleanup-behavior` |
| §5 삭제 가드 · 백필 | `passage-delete-guard` · `orphan-passage-backfill` |
| §6 경고 | `missing-passage-warning` |
| §9 선지 묶음 | `exam-paper-option-keep`(웹) · `hwpx-keep-together`(HWPX, §10 포함) · `docx-keep-policy`(DOCX, 역할 분류 R1~R7) · `docx-table-grid` |
| 웹 ↔ HWPX ↔ DOCX 전 시험지 대조 | `npx tsx --env-file-if-exists=.env scripts/exam-pagination/export-parity-audit.ts`(읽기 전용 Prisma 가드 · SELECT 만). 26-09-30: 519개 시험지 · 14,026문항, 불일치 0 · 불변 조건 위반 0 · 오류 0 |

- 실행은 관련 파일만: `node --test --test-timeout=240000 tests/unit/<files>`(전체 `npm run test:unit` 은 20분 안에 끝나지 않는다).
- 실제 엔진 검증: HWPX 는 한컴 2024(열기 → PDF 내보내기 → 저장 없이 닫기), DOCX 는 Word(PowerShell COM → PDF)와 한컴. 문서는
  **진입점 `buildExamHwpxDocument` · `buildExamDocxDocument` 를 SELECT 전용 로딩으로 직접 불러** 만든다. 내보내기 HTTP 라우트 ·
  다운로드 링크는 부르지 않는다 — printCount 를 올리고 `app_events` 를 쓴다(26-09-30 운영 쓰기 사고, EXAM-PRINT-PIPELINE §6.1).
- 웹 인쇄: EXAM-PRINT-PIPELINE §6(`print-e2e.mjs`, 쓰기 가드).

---

## 15. 바꿀 때 — 하지 말 것

- 렌더러 · 라우트에서 지문 규칙을 다시 만들기(`includePassage !== false || force`, 라우트 자체 기본값). `buildPaperItemsFromExam` ·
  `buildGroups` · `printInlinePassage` 만 본다.
- 빈 문자열 스냅숏을 지문으로 쓰기(`??` 선택). 지문 id 로 「같은 지문」 판정하기.
- `_sourcePassage` 를 클라이언트 값으로 쓰거나, 문항 편집 경로에서 structuredData 를 다시 만들며 떨어뜨리기.
- 정답표 표기를 렌더러마다 따로 만들기 — `answerKeyEntries` 하나.
- 레이아웃 기본값을 인라인으로 복제하기(`?? true` 등) — `resolvePaperLayout` 하나.
- 본문 · 지문 문단에 keep 걸기(DOCX 본문 keepNext 부활 = 한컴 빈 단 · 선지 쪼개짐). DOCX 에 선지 → 배지 다리 넣기(Word 빈 단).
- lineseg 폭을 4의 배수로 두기. 표 경로(`HWPX_NATIVE_2COL=0`)를 운영 기본으로 쓰기(선지 묶음이 꺼진다).
- 검증에서 내보내기 라우트 · 다운로드 링크 부르기. 새 소비처가 레거시 `build-document` 를 import 하기.
- 규칙을 바꾸면 이 문서 해당 절과 §12 표, 그리고 감사(`export-parity-audit`)를 함께 갱신하고 돌린다.
