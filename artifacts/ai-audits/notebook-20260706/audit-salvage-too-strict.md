# SALVAGE 과엄격 적대 감사 — RELAXED_BLOCKING ∖ SALVAGE 영어 코드 전수 판정

- 일자: 2026-07-06
- 대상: `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts`
- 산식: `RELAXED_BLOCKING_QUALITY_CODES`(리터럴 272종) − `SHIP_FIRST_WARNING_CODES`(35건 차감, core.ts:30) − `SALVAGE_RELAXABLE_CODES`(scarce 승계 포함 113종) = **영어 코드 155종** (KO_*는 범위 외).
- 소비 방식 확인: `run-question-generation.ts:641-651` — scarce(구제) 모드에서 `RELAXED_BLOCKING ∧ ¬SALVAGE` 인 error 만 차단. `run-question-generation-helpers.ts:113` — 구제 풀 승격은 후보의 **blockingCodes 전부**가 SALVAGE 소속일 때만. 즉 craft 코드를 이동해도 F급 코드와 동시 발화한 후보는 여전히 차단된다(이동의 안전 마진이 크다).
- 판정 기준(F급 = 차단 유지): 정답 없음 / 복수 정답 시비 / 정답이 학생 표면에 노출 / 렌더 파손(마커·개수·빈칸) / 발문 불성립 / 채점 불능. 이 정의에 **정확히** 해당하지 않으면 craft(SALVAGE 이동) 후보.

---

## 결론 요약

155종 중 **이동 권고 8종 + 조건부 2종**. 나머지 145종은 F급 잔류가 옳다.
이동 8종은 전부 "같은 결함 계열의 형제 코드는 이미 SALVAGE에 있는데 본인만 잔류한" 비일관 케이스라, 이동해도 분류 원칙이 바뀌지 않는다.

---

## 판정표

판정: **F**=차단 유지, **MOVE**=SALVAGE 이동 권고, **COND**=조건부(차순위 이동 후보).
경로는 `src/lib/question-quality/` 기준.

### 1) 공통 선지/정답표 무결성 — 전부 F

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| option-count | validators/options.ts:129 | F | 선지 개수 파손 = 렌더/채점 불능 |
| duplicate-option-label | validators/options.ts:135 | F | 같은 라벨 2개 = 마킹/채점 불능 |
| duplicate-option-text | validators/options.ts:141 | F | 중복 선지가 정답 본문이면 복수 정답 — 코드가 정답/오답을 구분 못 하므로 보수 유지 |
| empty-option-text | validators/options.ts:145 | F | 빈 선지 = 렌더 파손 |
| correct-answer-mismatch | validators/options.ts:179 | F | 정답 라벨이 선지에 없음 = 정답표 무효 |

### 2) 영작/재배열/조건 계열 — 전부 F

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| punctuation-only-chunk | dispatcher.ts:1061, topic-sentence/writing.ts:132 | F | 구두점 단독 칩은 배열 위치가 비결정 → 채점 시비 |
| scrambled-already-solved | dispatcher.ts:1066, topic-sentence/writing.ts:147,265 | F | 칩이 정답 어순 그대로 = 정답(어순) 노출 |
| word-order-unreconstructable | validators/word-order.ts:62 | F | 칩으로 modelAnswer 조립 불가 = 정답 무효 |
| cond-writing-condition-violated | validators/conditional-writing.ts:74,93,104 | F | 발문 조건(단어 수·필수/금지 토큰)과 모범답안 모순 = 채점 불능 |
| sw-modelanswer-present | summary/writing.ts:58, topic-sentence/writing.ts:62 | F | 모범답안 부재 = 채점 불능 |
| sw-summary-blank-marker-count | summary/writing.ts:66,79, topic-sentence/writing.ts:209,222 | F | placeholder 마커 파손 = 렌더 파손 |
| sw-answer-language | summary/writing.ts:92,106, topic-sentence/writing.ts:92,104 | F | 영작 유형의 정답/모범답안이 비영어 = 채점 기준 붕괴 |
| sw-answer-not-in-summary | summary/writing.ts:147, topic-sentence/writing.ts:295,384 | F | 정답 다토큰 어구가 학생 요약문에 verbatim = 정답 노출 |
| sw-wordbank-no-answer-order | summary/writing.ts:171 | F | [보기]가 정답 어순 그대로 = 어순 정답 노출 |
| sw-gloss-answer-leak | summary/writing.ts:284 | F | [해석] 전문 + 미끼 0 칩 = 내용·어순 동시 노출(실측 runIndex 45) |
| sw-direction-wordbank-mismatch | summary/writing.ts:233,240 | F | 발문이 참조하는 [보기]/[해석] 상자가 미렌더 = 발문 불성립(실측 runIndex 46) |
| tsw-cloze-degenerate-stem | topic-sentence/writing.ts:239 | F | "The (A), (B)"뿐인 stem = 발문 불성립(실측 26-07-05) |
| target-not-standalone | dispatcher.ts:900 | F | 타깃이 지문에 독립 토큰으로 없음 = 원문 비근거/렌더 위험 |
| mid-word-marker | grammar/marked.ts:28 | F | 단어 중간 마커 = 렌더 파손 |
| reference-marker-shape | validators/reference.ts:116 | F | odd-one-out 마커/선지/정답 라벨 형상 파손(실측 wave2) = 렌더/정답 노출급 |

### 3) FILL_BLANK_KEY — 전부 F (단일어 residual 은 이미 warning)

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| fbk-missing-blank-marker | blank/fill-key.ts:100 | F | 빈칸 마커 부재(자음골격 난독) = 렌더 파손/노출 |
| fbk-answer-skeleton-leak | blank/fill-key.ts:148 | F | 자음골격으로 정답 노출 |
| fbk-multiple-blanks | blank/fill-key.ts:28 | F | 단일 정답 유형에 빈칸 2개 = 채점 갈림 |
| fbk-answer-residual-leak | blank/fill-key.ts:48 | F | **확인 완료**: fill-key.ts:46-47 에서 다토큰만 error, 단일 내용어는 warning(비차단). 차단되는 것은 다토큰 verbatim 잔존 = 진짜 정답 노출뿐 — 유지 |
| fbk-frame-altered | blank/fill-key.ts:133 | F | 정답 되끼운 복원문이 원문에 없음 = 프레임 변조/정답 무효(실측 runIndex 41/42) |
| fbk-direction-word-count-mismatch | blank/fill-key.ts:85 | F | "한 단어로" 발문 vs 3단어 정답 = 채점 불능(실측) |

### 4) 어법(GRAMMAR_ERROR marked) — 무결성/시비는 F, craft 잔류 6종 MOVE

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| grammar-marker-count / grammar-render-marker-count | dispatcher.ts:1104/1107 | F | 마커 개수 파손 = 렌더 파손 |
| grammar-error-count / grammar-correct-answer-labels | dispatcher.ts:1122/1130 | F | 정답 개수/라벨 desync = 정답표 무효 |
| grammar-missing-error-expression | dispatcher.ts:1290 | F | 오류형 부재 = 문항 불성립 |
| grammar-error-not-mutated | dispatcher.ts:1278,1293 | F | 오류 미도입(원문 그대로를 오답 판정) = 무정답(실측 critical) |
| grammar-error-pos-change | dispatcher.ts:1312 (shared.ts:44) | **MOVE** | likely→likelihood 류 품사변경 변형. "어간 유지" 설계 계약 위반일 뿐 오류형은 유일·명백히 틀리고(품사 자리 판단은 실제 수능 어법 포인트) 렌더·채점 정상 — obvious 계열과 같은 craft |
| grammar-marker-adjacent-duplicate | dispatcher.ts:1215 | F | "is __(F) is costed__" 렌더 텍스트 파손 |
| grammar-surrounding-missing-marker | dispatcher.ts:1230 | F | surround 가 자기 마커를 안 가리킴 → 전역 폴백 오배치·해설-밑줄 desync 의 근원(실측). 후처리로 결정론 수선 불가 — 유지 |
| grammar-marker-context-mismatch | dispatcher.ts:1244 | F | 렌더 위치가 엉뚱한 동형 단어 = 해설-밑줄 desync(실측) |
| grammar-marker-error-form-mismatch | dispatcher.ts:1261 | F | 지문에 정답형 렌더 = 무정답(실측 26-07-05) |
| grammar-explanation-answer-range-leak | dispatcher.ts:2261 | F | 해설의 "나머지 ~는 옳다" 범위에 정답 라벨 포함 = 정답표-해설 desync(사고 이력 계열) |
| grammar-answer-in-wrong-explanations | dispatcher.ts:2282 | F | 오답 해설 맵에 정답 라벨 = desync |
| grammar-explanation-self-contradictory | dispatcher.ts:2119 | F | 해설이 정답 번복/스크래치패드(CoT 덤프, 실측 1012자 자기모순) = 채점 근거 붕괴 |
| grammar-explanation-typo | dispatcher.ts:2162 (511) | **MOVE** | 하드코딩 오탈자 2종(dsepite/desipte) 스펠링 검사. 순수 미관 — 경고 달고 출하 후 검수 교정이 합리적 |
| grammar-appear-pointcode-voice-mismatch | dispatcher.ts:2079 | **MOVE** | pointCode 메타데이터 오칭(학생 비노출). mislabel 계열 11종은 전부 SALVAGE 인데 본인만 잔류 — 비일관 |
| grammar-gibberish-inversion-fragment | dispatcher.ts:1827 (663) | **MOVE** | 오류형이 "had some church endured" 류 넌센스 = 너무 뻔한 오류일 뿐, 정답 유일·명백·채점 가능. obvious-* 34종과 동일 클래스인데 본인만 잔류 |
| grammar-fixed-that-is-idiom | dispatcher.ts:1741 | **MOVE** | "that is,"→"that being," 변형. 오류형은 명백한 비문(정답 유일). 차단 사유가 "관용구 포인트라 해설이 어긋나기 쉬움" = 해설 리스크(craft). 트리거 정규식이 극히 좁아 어느 쪽이든 리스크 미미 |
| grammar-mixed-as-it-span | dispatcher.ts:2005 | **MOVE** | **디코이** 밑줄이 "as it" 2단어 혼합 스팬 — 디코이는 원문 그대로(정문)라 복수정답 시비 없음. 더 심한 스팬 결함인 underline-punctuated-fragment 도 이미 SALVAGE — 비일관 |
| grammar-debatable-attention-to-gerund | dispatcher.ts:1685 | F | 규범 논쟁 자리 = 복수정답 시비(이동 금지 계열) |
| grammar-debatable-more-most-like | dispatcher.ts:1512 | F | 동상 |
| grammar-lexical-look-like-answer | dispatcher.ts:1524 | F | 어휘 판단을 어법 정답으로 = 발문("어법상")과 정답 근거 불일치 → 시비 |
| grammar-debatable-sink-passive | dispatcher.ts:1550 | F | 자타동 겸용 = 시비 |
| grammar-semantic-who-what-answer / how-why-answer | dispatcher.ts:1713/1538 | F | 의미 판단 정답 = 어법 발문과 불일치 → 시비 |
| grammar-debatable-who-object-decoy | dispatcher.ts:1956 | F | 구어 목적격 who 디코이 = 학생이 디코이를 오답 판정할 시비(복수정답) |
| grammar-debatable-discourse-though-decoy | dispatcher.ts:1963 | F | 동상 |
| grammar-debatable-it-being-decoy | dispatcher.ts:1977 | F | its being 규범 시비 디코이 |
| grammar-disputed-usage-target | dispatcher.ts:1202 | F | "복수주어+each+단수동사" 밑줄 = 시비(실측 critical) |
| grammar-tense-only-error | dispatcher.ts:1322 | F | 시제 단독 토글 = 무정답 시비(실측 사고 — 절대 이동 금지) |
| grammar-perception-complement-toggle | dispatcher.ts:1337 | F | 지각동사 보어 토글 = 무정답(실측 26-07-04 KILLER 출하 사고) |
| grammar-quantity-meaning-toggle / ambiguous-noun / debatable | grammar/shared.ts:315/327/321,333 | F | 수량(m) 의미토글·양용명사·규범논쟁 = 복수정답 시비(적대검증 26-06-23) |

### 5) 네모 어법(combo) — 전부 F (취향성 잔류 없음)

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| combo-slot-count / combo-render-slot-count | grammar/combo.ts:120/127 | F | 3슬롯 파손 = 렌더/정답키 파손 |
| combo-slot-missing-candidate / combo-slot-not-mutated | combo.ts:159/168 | F | 후보 부재/미변형 = 정답키 무효 |
| combo-correct-not-in-source | combo.ts:173 | F | 정답형 원문 비근거 = 정답 무효 |
| combo-option-value-mismatch / combo-duplicate-option | combo.ts:296,308/319 | F | 선지 값이 후보와 불일치·중복 조합 = 정답표 파손/복수정답 |
| combo-answer-combo-mismatch | combo.ts:328,332 | F | 전정답 조합 ≠ 1개 또는 correctAnswer 불일치 = 정답 무효 |
| combo-candidate-visible-elsewhere | combo.ts:229-250 | F | 정답/오답 후보가 지문 다른 곳에 정문으로 노출 = 정답 노출/시비 |
| combo-tense-only-error / combo-perception-toggle | combo.ts:189/202 | F | 시제/지각 시비(이동 금지 계열) |

참고: combo-explanation-truncated 는 이미 SALVAGE 이동됨 — 남은 combo 코드에 취향성 없음.

### 6) 서술형 교정(grammar-correction) — 구조는 F, KILLER 깊이 1종 MOVE

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| grammar-correction-underline-count / -count-mismatch / -missing-underlined-segments / -missing-passage-underline / -error-count | correction.ts:53/62/49/56/67 | F | 밑줄 개수·렌더 무결성 = 렌더 파손 |
| grammar-correction-missing-corrected-part / -source-text / -displayed-text / -error-part | correction.ts:87/91/95/99 | F | 정답 구성요소 부재 = 채점 불능 |
| grammar-correction-not-mutated / -displayed-not-mutated | correction.ts:104/116 | F | 오류 미도입 = 무정답 |
| grammar-correction-correction-mismatch / -answer-mismatch | correction.ts:107/182 | F | 정답표 desync |
| grammar-correction-corrected-part-not-in-source-text / -error-part-not-in-displayed-text / -displayed-text-not-rendered / -source-text-not-source-backed / -sentence-not-source-backed | correction.ts:110/113/125/128/187 | F | 원문 비근거·렌더 불일치 = 정답 무효 |
| grammar-correction-debatable-infinitive | correction.ts:133 | F | 능/수동 부정사 선호 = 시비(151코드 전수감사에서도 의도 제외 명시) |
| grammar-correction-tense-only-error / -perception-toggle | correction.ts:145/158 | F | 시비 계열(이동 금지) |
| grammar-correction-killer-thin-segment | correction.ts:171 | **MOVE** | KILLER 난이도 깊이 미달(로컬 단형 변화). 문항 성립·정답 유일·채점 가능 — grammar-killer-thin-answer/-relative-animacy/-concessive-as/-missing-aux 는 전부 SALVAGE 인데 교정형 미러만 잔류. 비일관 |

### 7) 빈칸 계열 — 전부 F(1종 COND)

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| blank-missing-answer | blank/inference.ts:43 | F | 정답 선지 텍스트 부재 = 정답 무효 |
| multi-blank-answer-visible / -partial-visible | blank/multi.ts:154/163 | F | 빈칸 정답이 본문 잔존 = 정답 노출(실측 누수) |
| blank-answer-residual-visible | blank/inference.ts:59 | F | 단일 빈칸 잔존 누수 미러 |
| blank-paraphrase-polarity-loss | blank/paraphrase.ts:295 | F | 부정/저항 관계 소실 = 의미 반전 → 정답 무효 |
| negative-paraphrase-copula-slot-mismatch | blank/inference-distractor.ts:101 | F | "is + prevent…" — 정답을 끼우면 비문 = 정답 자체가 성립 안 함 |
| negative-paraphrase-verb-slot-mismatch | inference-distractor.ts:115 | F | modal/to + 조동사형 정답 = 비문 완성 |
| negative-paraphrase-modal-be-negated-complement | inference-distractor.ts:122 | **COND** | "must be not X" — 메시지 스스로 "awkward"(비문 아님·의미 보존). 자매 stacked-prepositions 는 이미 SALVAGE. 차순위 이동 후보 |
| negative-paraphrase-no-subject-double-negation | inference-distractor.ts:180 | F | no-주어 + 부정 술어 이중부정 = 의미 반전 시비 |
| double-negative-clause-missing-subject / -because-phrase-slot | blank/inference.ts:385/393 | F | because/since 뒤 절 아닌 정답 = 비문 완성 |
| vocab-option-word-mismatch | validators/vocab.ts:255 | F | 선지 단어 ≠ 지문 마커 단어 = 렌더-정답 desync |
| vocab-source-word-visible | validators/vocab.ts:301 | F | 원단어 본문 잔존 = 정답 노출 |

### 8) 함축 의미 — 무결성 F, 언어 스펙 1종 MOVE

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| implied-meaning-missing-expression / -missing-underline / -underline-count | implied.ts:32/102/106 | F | 밑줄 부재/개수 파손 = 렌더 파손 |
| implied-meaning-option-language | implied.ts:58 | **MOVE** | en 설정 선지에 한글 혼입 — 문항 성립·정답 유일, 형식 스펙 위반. 동일 클래스인 topic-option-language 는 이미 SALVAGE("선지 언어 스펙 — 형식 취향"), ko 설정의 역방향 위반은 애초에 warning(implied.ts:85) — 이중 비일관 |
| implied-meaning-option-not-english | implied.ts:66 | F | 라틴문자 0 선지 = 쓰레기 선지(empty-option 등가 렌더 파손) — option-language 와 분리 유지 |
| implied-meaning-target-not-in-passage | implied.ts:189 | F | 밑줄 표현이 원문에 없음 = 지문 변조/원문 비근거(내신 지문 충실도 파괴) |
| implied-meaning-direct-answer-leak | implied.ts:222 | F | 다음 문장이 밑줄을 직접 해설 = 정답 노출 인접(151코드 전수감사에서 의도적 A급 유지 — 존중) |

### 9) 무관한 문장 — 전부 F (이동분은 이미 완료됨)

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| irrelevant-sentence-count / empty-irrelevant-sentence / irrelevant-index-range | irrelevant.ts:23/28/34 | F | 슬롯/렌더 파손 |
| irrelevant-index-edge | irrelevant.ts:40 | F | 첫/끝 문장 정답은 remove-and-reconnect 근거가 반쪽 → 방어력 저하·시비 여지. 모델이 관행상 중간 배치라 발화 희소 — 유지 비용 낮음 |
| irrelevant-answer-index-mismatch | irrelevant.ts:49 | F | 정답표 desync(후처리 후엔 사실상 사문이나 무해) |
| irrelevant-answer-desync | irrelevant.ts:385 | F | 해설/렌더의 무관문장 위치 주장 desync(실측 runIndex 29, 이동 금지 계열) |
| irrelevant-source-not-verbatim | irrelevant.ts:95 | F | 비정답 문장 창작 = 창작문이 2개가 되어 복수정답 시비 |
| irrelevant-source-order | irrelevant.ts:128 | F | 원문 순서 뒤섞임 = 삽입문이 "진짜 이웃 사이"에 있지 않아 remove-and-reconnect 정답 방어 논리 자체가 무너짐 → 다른 문장도 "흐름 깨짐" 주장 가능(복수정답 시비). ⚠️관찰: findComparablePassageSentenceIndex(irrelevant.ts:393)의 includes-기반 첫-매칭이 유사/중복 문장에서 오탐 순서역전을 만들 수 있음 — 실측 발화 로그에서 오탐율 확인 권장 |
| irrelevant-answer-from-source | irrelevant.ts:138 | F | 정답 문장이 원문 소속 = 무정답 |

참고: irrelevant-too-many-new-terms·-inserted-ungrammatical·-obvious-counterclaim-cue·-prescriptive-giveaway·-too-unrelated·-source-first-sentence 는 **이미 SALVAGE**(또는 SHIP_FIRST) — 질의된 코드들의 이동은 완료 상태.

### 10) 문장 삽입/순서 배열 — 전부 F

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| sentence-insert-missing-passage / -gap-marker-count | sentence-insert.ts:155/161 | F | 렌더 파손 |
| sentence-insert-answer-desync | sentence-insert.ts:359 | F | 정답-해설 갭 주장 desync(실측 runIndex 12, 이동 금지) |
| sentence-insert-omitted-source-not-backed / -omitted-source-visible / -given-leaks-in-passage | sentence-insert.ts:174/183/198 | F | 원문 비근거/정답 노출 |
| sentence-order-missing-given / -paragraph-count / -paragraph-labels | sentence-order.ts:28/64/107 | F | 구조 파손 |
| sentence-order-option-permutation / -option-duplicates / -correct-option-shape | sentence-order.ts:253/265/282 | F | 선지 순열 무결성 = 정답표 파손 |
| sentence-order-answer-key-mismatch | sentence-order.ts:231 | F | 주장 순열 ≠ 원문 위치 순서 = 정답 무효(이동 금지 계열) |
| sentence-order-paragraph-not-source-backed | sentence-order.ts:202 | F | 단락 창작 = 정답 검증 불가 |

참고: 균형/길이 취향(-given-too-long, -paragraph-imbalance, -too-short/thin, -unscrambled-answer)은 이미 SALVAGE/SHIP_FIRST.

### 11) 극성 강제 설정 정합 — 전부 F

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| content-match-direction-polarity / content-match-type-mismatch | content-match.ts:25,32/41 | F | 강제 극성 vs 발문/필드 모순 = 발문-정답 desync. 미설정 경로 무발화라 실패 드라이버 아님 |
| gist-polarity-direction-mismatch / gist-polarity-field-mismatch | topic.ts:23/31 | F | 동상 |

### 12) 요약문(MC/단답) — 무결성 F, 언어 스펙 1종 COND

| 코드 | 위치 | 판정 | 근거 |
|---|---|---|---|
| summary-mc-missing-summary / -blank-marker-count | summary/mc.ts:46/52 | F | stem/마커 파손 |
| summary-mc-stem-unterminated | mc.ts:66 | F | 잘린 요약문 = 발문 불성립(실측 26-07-05) |
| summary-mc-summary-language | mc.ts:75 | F | 요약문(발문 핵심 표면)에 한글 = 빈칸 콜로케이션 판단 자체가 붕괴할 수 있는 표면 파손 — 발화 희소라 유지 비용 낮음 |
| summary-mc-missing-blank-answer / -answer-language | mc.ts:95/106 | F | 정답 부재/비영어 정답 = 정답표 무효(선지와 비교 불능) |
| summary-mc-correct-answer-mismatch / -correct-pair-mismatch | mc.ts:141,153/165 | F | 정답표 desync |
| summary-mc-option-pair-shape | mc.ts:210 | F | 쌍 값 누락 = 선지 렌더 파손 |
| summary-mc-option-language | mc.ts:218 | **COND** | 정답쌍 언어/정합은 -answer-language(F)·-correct-pair-mismatch(F)가 별도 차단 → 이 코드의 실질 잔여 커버리지는 "오답쌍 비영어" = 제거 용이한 미끼(craft). 단 라틴문자 0 쓰레기쌍 렌더 케이스가 섞여 있어 조건부 |
| summary-mc-duplicate-correct-option | mc.ts:226 | F | 정답 조합과 동일한 오답 = 복수정답 |
| summary-complete-missing-summary / -blank-marker-count | summary/complete.ts:36/45 | F | stem/마커 파손 |
| summary-complete-answer-language | complete.ts:68 | F | 비영어 정답 = 채점 기준 붕괴 |
| summary-complete-answer-leaks-in-summary | complete.ts:78 | F | 정답이 요약문에 인라인 = 정답 노출 |

---

## 이동 판정 상세 — 경고 출하가 안전한 이유(학생 표면 기준)

1. **grammar-gibberish-inversion-fragment** — 학생은 5개 밑줄 중 명백히 깨진 오류형 하나를 본다. 정답은 유일하고 명백히 틀렸으며 채점·해설 모두 성립. 결함의 실체는 "함정이 너무 뻔함" = obvious-* 와 동일한 난이도 craft. obvious/shallow 계열 34종이 이미 SALVAGE.
2. **grammar-fixed-that-is-idiom** — 학생 표면은 "that being," 밑줄 = 명백한 비문(정답 유일). 코드의 차단 사유는 "관용구 포인트 + 해설 오류 빈발" — 해설 리스크는 mislabel 계열(전부 SALVAGE)과 같은 급. 트리거(`is`→`being` + "that is," 문맥)가 극히 좁아 빈도도 미미.
3. **grammar-mixed-as-it-span** — 문제가 되는 건 **디코이**(정문 그대로) 밑줄의 스팬 취향. 학생이 보는 그 스팬은 문법적으로 옳고, 정답은 다른 마커에 있다. 복수정답 시비 없음.
4. **grammar-error-pos-change** — 학생은 명사 자리에 형용사(또는 역) 같은 명백한 어형 오류를 본다. 품사 자리 판단은 실전 어법 포인트라 문항은 성립·채점 가능. 위반된 것은 내부 변형 계약("어간 유지·형태만") = 설계 취향.
5. **grammar-explanation-typo** — 학생 표면(지문·선지)은 완전 정상. 해설 문자열에 하드코딩 오탈자 2종 중 하나가 있을 뿐. 검수 배지 달고 출하 후 교정이 미생성보다 명백히 낫다.
6. **grammar-appear-pointcode-voice-mismatch** — pointCode 는 학생에게 렌더되지 않는 메타데이터. 밑줄·정답·해설 표면 무결성과 무관.
7. **grammar-correction-killer-thin-segment** — KILLER 라벨 대비 오류가 얕다는 것뿐, 학생은 정상 렌더된 밑줄 문장을 고쳐 쓰고 유일 정답으로 채점된다. marked 미러(grammar-killer-thin-answer)는 이미 SALVAGE.
8. **implied-meaning-option-language** — 학생은 영어 선지 사이에 한글이 섞인 선지를 본다. 보기 흉하고 그 선지의 판별이 쉬워질 뿐, 정답 유일성·채점·렌더는 성립. 같은 결함 클래스(topic-option-language)가 이미 "형식 취향"으로 SALVAGE 이동됐고, ko 설정의 역방향 위반은 원래 warning.

조건부 2종(차순위, 이동해도 원칙 위반은 아님):
- **negative-paraphrase-modal-be-negated-complement** — 완성문이 "must be not distorted" 식으로 어색하지만 비문 아님(검증기 메시지 자체가 "awkward"). 자매 코드는 이미 SALVAGE.
- **summary-mc-option-language** — F급 절반(정답쌍 언어·정합)은 다른 두 게이트가 독립 차단. 잔여는 오답쌍 언어 = craft. 쓰레기쌍(라틴 0) 렌더 케이스 때문에 조건부.

---

## 발화 빈도 위험 평가 (F 잔류 코드 중 실패 드라이버 후보)

- **시제/지각/수량/disputed 계열** (tense-only, perception-toggle, quantity-*, disputed-usage, debatable-*): 실측상 가장 자주 밟는 시비 게이트지만 전부 실제 출하 사고 이력(26-07-04/05) — 절대 이동 금지가 맞다. 실패 방지는 이동이 아니라 corrective-retry 피드백(다른 자리 선택 유도)으로 해결해야 함.
- **grammar-explanation-self-contradictory**: Gemini CoT 덤프 성향상 발화 빈도 중간. 유지가 맞지만(정답 번복) 발화 로그 모니터 권장 — 패턴("다시 확인해 보겠습니다" 등)이 무해한 해설을 오탐하면 이 코드가 salvage 실패의 숨은 드라이버가 된다.
- **irrelevant-source-order**: 판정은 유지지만 includes-기반 문장 매칭의 오탐 벡터(유사 문장 중복 시 순서 역전 오판) 존재 — 발화 시 실제 역전인지 스팟체크 권장.
- **implied-meaning-target-not-in-passage / irrelevant-source-not-verbatim**: 모델이 지문 표현을 "다듬어" 인용할 때 발화. normalizeComparableText 가 구두점/공백은 흡수하므로 오탐은 낮으나 KILLER 재작성 성향의 프리미엄 모델에서 빈도 상승 가능. 원문 비근거는 내신 지문 충실도의 마지노선이라 유지.
- 이동 8종 중 빈도 실익이 큰 것: **grammar-error-pos-change**(프리미엄 실측 존재), **grammar-gibberish-inversion-fragment**, **implied-meaning-option-language**. 나머지는 빈도 자체가 낮아 "안전한 정리"에 가깝다.

## 부수 관찰 (코드 수정 없음, 기록만)

1. **SALVAGE 사문 항목 34종**: SHIP_FIRST_WARNING_CODES 소속 코드(wrong-option-explanation-count, summary-mc-awkward-collocation, blank-*/implied-*/irrelevant-*/sentence-order-* 취향군)는 warning 으로 강등되어 error 필터에 도달하지 않으므로 SALVAGE 등재가 무효(무해하나 노이즈). 또한 grammar-decoy-point-monotony·grammar-killer-thin-connector·grammar-category-mislabel 3종은 RELAXED_BLOCKING 에 없어 relaxed 에서 이미 비차단 — SALVAGE 등재 실효 없음.
2. **질의 코드 상태 확인**: irrelevant-too-many-new-terms ✅이동 완료 / summary-mc-awkward-collocation ✅SHIP_FIRST+SALVAGE(이중 비차단) / wrong-option-explanation-count ✅SHIP_FIRST(전 모드 비차단) / blank-target-list-like ✅SHIP_FIRST(전 모드 비차단) / grammar-keypoint-* ✅둘 다 scarce→SALVAGE 이동 완료.
3. **구제 승격 게이트**(helpers.ts:113)는 blockingCodes **전부**가 SALVAGE 소속일 때만 후보를 살리므로, 위 8종 이동은 "craft-only 후보"만 구제한다 — F급 결함이 하나라도 있으면 여전히 차단된다.

---

## 최종 이동 권고 목록 (복붙용)

강한 권고 8종:

```
grammar-gibberish-inversion-fragment
grammar-fixed-that-is-idiom
grammar-mixed-as-it-span
grammar-error-pos-change
grammar-explanation-typo
grammar-appear-pointcode-voice-mismatch
grammar-correction-killer-thin-segment
implied-meaning-option-language
```

조건부(차순위) 2종:

```
negative-paraphrase-modal-be-negated-complement
summary-mc-option-language
```
