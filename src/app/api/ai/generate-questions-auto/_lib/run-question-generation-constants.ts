import { KO_BLOCKING_CODES } from "@/lib/korean/quality/codes";
import { SHIP_FIRST_WARNING_CODES } from "@/lib/question-quality";

export const RELAXED_BLOCKING_QUALITY_CODES = new Set([
  "option-count",
  "duplicate-option-label",
  "duplicate-option-text",
  "empty-option-text",
  "correct-answer-mismatch",
  "wrong-option-explanation-count",
  // v12 blind holdout + independent production-path adjudication (2026-07-15):
  // these five schema-conforming fatal errors reached the relaxed publisher in
  // all three lexical variants. They affect answerability/key integrity, not
  // craft preference, and therefore remain blocking under every quality mode.
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-insert-missing-given",
  "sentence-order-dependent-fragment",
  "sentence-order-paragraph-body-label",
  "mid-word-marker",
  "target-not-standalone",
  "punctuation-only-chunk",
  "scrambled-already-solved",
  // 배열 영작 재구성 실패 — 칩(선언 미끼 제외)으로 modelAnswer 를 조립할 수
  // 없으면 학생이 정답을 만들 수 없는 정답 무효급 결함 (wave1).
  "word-order-unreconstructable",
  // 조건부 영작 — 발문이 명시한 기계 검증 가능 조건(정확 단어 수·필수/금지 토큰)을
  // 모범답안이 어기면 채점 불능/정답 무효급 결함 (wave1).
  "cond-writing-condition-violated",
  // wave2: 영작 계열 모범답안이 지문 문장의 사실상 통째 복사(내용토큰 80%+ 연속
  // verbatim)면 INLINE 지문에서 베껴 쓰는 받아쓰기 과제가 된다 — 베이스라인 실측
  // CONDITIONAL_WRITING(37/38)·WORD_ORDER(47/48) 4건 경고만 받고 출하 → 차단 승격.
  "cond-writing-verbatim-answer",
  "writing-answer-verbatim-copy",
  // wave2: REFERENCE 형식 무결성 — odd-one-out 발문에 단일 밑줄, 선지 마크업 오염,
  // 정답 라벨 이탈(베이스라인 실측 runIndex 23/24)은 렌더 파손/정답 노출급.
  "reference-marker-shape",
  // wave2: 네모 어법 해설이 슬롯 라벨만 남기고 잘리면((C) 뒤 내용 0) 해설 누락
  // (베이스라인 실측 runIndex 5).
  "combo-explanation-truncated",
  "combo-complementizer-that-mislabel",
  "grammar-marker-count",
  "grammar-render-marker-count",
  "grammar-error-count",
  "grammar-correct-answer-labels",
  "grammar-missing-error-expression",
  "grammar-error-not-mutated",
  "grammar-error-pos-change",
  "grammar-answer-nonword-forced",
  "grammar-correction-form-exposed",
  "grammar-error-explanation-surface-order",
  "grammar-explanation-answer-range-leak",
  "grammar-explanation-range-shorthand",
  "grammar-answer-in-wrong-explanations",
  "grammar-obvious-pronoun-agreement",
  "grammar-obvious-noun-what-relative",
  "grammar-obvious-seem-gerund",
  "grammar-obvious-seem-to-gerund",
  "grammar-shallow-local-participle-parallel",
  "grammar-obvious-to-gerund-after-verb",
  "grammar-obvious-connector-to-what",
  "grammar-obvious-despite-being-to-be",
  "grammar-shallow-despite-although-gerund",
  "grammar-debatable-attention-to-gerund",
  "grammar-debatable-more-most-like",
  "grammar-lexical-look-like-answer",
  "grammar-debatable-sink-passive",
  "grammar-debatable-retained-object-passive",
  "grammar-shallow-because-despite-clause",
  "grammar-obvious-modal-gerund",
  "grammar-obvious-modal-to-infinitive",
  "grammar-obvious-intransitive-passive",
  "grammar-obvious-endure-passive-object",
  "grammar-gibberish-inversion-fragment",
  "grammar-obvious-finite-to-ing-colon",
  "grammar-shallow-participle-adjective-answer",
  "grammar-obvious-double-ing",
  "grammar-obvious-local-agreement",
  "grammar-obvious-local-pronoun-agreement",
  "grammar-obvious-object-pronoun-subject",
  "grammar-obvious-before-after-to-infinitive",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-obvious-passive-to-gap-ing",
  "grammar-obvious-adverb-adjective",
  "grammar-fixed-that-is-idiom",
  "grammar-obvious-living-finite",
  "grammar-obvious-living-lived",
  "grammar-obvious-what-noun-prefix",
  "grammar-killer-thin-missing-aux",
  "grammar-debatable-who-object-decoy",
  "grammar-debatable-discourse-though-decoy",
  "grammar-demonstrative-that-way-decoy",
  "grammar-semantic-who-what-answer",
  "grammar-semantic-how-why-answer",
  "grammar-killer-thin-relative-animacy",
  "grammar-killer-thin-concessive-as",
  "grammar-weak-filler-decoys",
  "grammar-debatable-it-being-decoy",
  "grammar-explanation-self-contradictory",
  "grammar-explanation-meta-leak",
  "grammar-explanation-lint",
  "grammar-explanation-typo",
  "grammar-noun-clause-pronoun-mislabel",
  "grammar-phrasal-verb-mislabel",
  "grammar-vague-metadata-tag",
  "grammar-look-like-complement-mislabel",
  "grammar-seem-to-complement-mislabel",
  "grammar-seem-to-object-mislabel",
  "grammar-that-way-adverb-mislabel",
  "grammar-human-made-postmodifier-mislabel",
  "grammar-basic-overloaded-design",
  "grammar-too-basic-decoys",
  "grammar-shallow-checklist-decoys",
  "grammar-shallow-depends-decoy",
  "grammar-shallow-nearby-passive-decoy",
  "grammar-shallow-than-decoy",
  "grammar-explanation-too-long-hard",
  "grammar-agreement-explanation-too-thin",
  "grammar-afford-modal-mislabel",
  "grammar-appear-adverb-mislabel",
  "grammar-appear-pointcode-voice-mismatch",
  "grammar-category-mislabel",
  "grammar-pointcode-span-mismatch",
  "grammar-terminology-error",
  "grammar-terminology-register",
  "grammar-marker-too-dense",
  "grammar-keypoint-token-not-source-backed",
  "grammar-keypoint-untested-token",
  "grammar-mixed-as-it-span",
  "grammar-decoy-point-diversity",
  "grammar-killer-answer-point-repeated",
  "grammar-killer-thin-answer",
  // 26-07-06 검수 패널 MAJOR 최다축 — KILLER 정답의 과훈련 전형 패턴(one-of 수일치/
  // ±ly 맞교환/that↔what 동일표면 26회/인접 수일치). craft: strict/relaxed 재시도
  // 압박, 최후 구제에서만 경고 출하.
  "grammar-killer-overdrilled-answer",
  // 26-07-06 유저 지시 — keyPoints 라벨 연동(일반론 필러 차단) + 정답 CORE-10 표적.
  "grammar-keypoint-choice-mismatch",
  "grammar-keypoint-nonexistent-label",
  "grammar-answer-point-not-core",
  "grammar-killer-generic-answer-point",
  // 26-07-07 유저 검수 3회+ 재발 — 해설 본문이 원형숫자를 서술 단계 번호로 오용
  // ("① 빈칸 문장은…") → 선지 번호와 뒤섞여 정답 오독. craft: 재시도 압박,
  // 최후 구제에서만 경고 출하.
  "blank-explanation-step-numbering",
  "blank-explanation-narrative-circled-numbering",
  // 절/문장 통째 밑줄(예: 프리미엄 실측 "these digital platforms create a trusting
  // environment" 7단어)은 정답성·가독성을 해치는 명백한 결함 — relaxed 폴백에서도
  // 출하 금지. ('wide'는 strict 전용이라 의도적으로 제외 — 완전 실패 방지.)
  "grammar-underline-too-long",
  "grammar-underline-punctuated-fragment",
  // 복수정답 시비(규범 논쟁 자리 밑줄)는 relaxed 폴백에서도 출하 금지 —
  // 정답 무효급 결함이라 미생성이 잘못된 문항보다 낫다.
  "grammar-disputed-usage-target",
  // 정답 노출/타깃 부적격도 같은 이유로 relaxed에서 출하 금지
  // (2026-06-12 사용자 테스트에서 relaxed 누수 실측: 노출 5건·list-like 1건).
  "multi-blank-answer-visible",
  // 단일 빈칸(SOURCE_EXACT) 잔존 누수 — 빈칸으로 뺀 정답 스팬이 지문 다른 곳에
  // verbatim 잔존하면 베껴 즉답(정답 노출). multi-blank-answer-visible 미러 (wave1).
  "blank-answer-residual-visible",
  "blank-target-list-like",
  "vocab-option-word-mismatch",
  // 부분구 누설(빈칸 값 핵심부 잔존)·어휘 원단어 잔존도 정답 노출이라 차단
  // (2026-06-12 적대검수 추가 발견).
  "multi-blank-answer-partial-visible",
  "vocab-source-word-visible",
  // 마커 깨짐(인접 중복)·오배치(엉뚱한 동형 단어)도 정답 노출/해설 불일치라
  // relaxed에서도 차단 (2026-06-12 어법 KILLER 30개 중 실측 2건).
  "grammar-marker-adjacent-duplicate",
  "grammar-marker-context-mismatch",
  "grammar-surrounding-missing-marker",
  // wave5: isError 마커가 오류형 대신 정답형을 지문에 렌더 — 학생 표면과 선지가
  // 어긋나는 무정답급 (실측 26-07-05: (E) 'in which' 렌더 vs 선지 'which').
  "grammar-marker-error-form-mismatch",
  // 시제 단독변경(realizes↔realized)은 문맥상 두 시제 가능 = 정답 시비. 차단.
  "grammar-tense-only-error",
  // 같은 시제/지각동사 시비 게이트의 다른 어법 유형 확장 (wave1) — 서술형 교정·
  // 네모 어법도 동일하게 복수정답/무정답 시비라 relaxed 폴백에서도 출하 금지.
  "grammar-correction-tense-only-error",
  "grammar-correction-perception-toggle",
  "combo-tense-only-error",
  "combo-perception-toggle",
  // 지각동사 보어 토글(to↔원형↔V-ing) — 오류형이 지각동사 구문/명사+to-V 파스로
  // 정문이 되어 무정답 (실측 26-07-04 KILLER 출하 사고: see the ... power of AI
  // to broaden → broaden). scarce에서도 절대 강등 금지.
  "grammar-perception-complement-toggle",
  // 수량(m) 시비형 정답 — 의미토글(little↔a little)·양용명사·규범논쟁(less/fewer)은
  // 둘 다 정문/문맥의존이라 복수정답 시비. relaxed 폴백에서도 출하 금지(적대검증 2026-06-23).
  "grammar-quantity-meaning-toggle",
  "grammar-quantity-ambiguous-noun",
  "grammar-quantity-debatable",
  // 네모 어법 — 세 슬롯 전부가 정답 키를 구성하므로 슬롯/조합 결함은 전부
  // 정답 무효급. relaxed 폴백에서도 출하 금지.
  "combo-slot-count",
  "combo-render-slot-count",
  "combo-slot-missing-candidate",
  "combo-slot-not-mutated",
  "combo-correct-not-in-source",
  "combo-option-value-mismatch",
  "combo-duplicate-option",
  "combo-answer-combo-mismatch",
  "combo-candidate-visible-elsewhere",
  "grammar-correction-underline-count",
  "grammar-correction-missing-underlined-segments",
  "grammar-correction-missing-passage-underline",
  "grammar-correction-underline-count-mismatch",
  "grammar-correction-error-count",
  "grammar-correction-missing-corrected-part",
  "grammar-correction-missing-source-text",
  "grammar-correction-missing-displayed-text",
  "grammar-correction-missing-error-part",
  "grammar-correction-not-mutated",
  "grammar-correction-correction-mismatch",
  "grammar-correction-answer-mismatch",
  "grammar-correction-corrected-part-not-in-source-text",
  "grammar-correction-error-part-not-in-displayed-text",
  "grammar-correction-displayed-not-mutated",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "grammar-correction-displayed-text-not-rendered",
  "grammar-correction-source-text-not-source-backed",
  "grammar-correction-sentence-not-source-backed",
  "grammar-correction-debatable-infinitive",
  "grammar-correction-killer-thin-segment",
  "topic-option-language",
  // 정답 극성 토글(강제 설정 시에만 발생) — 발문/저장 극성이 강제값과 어긋나면
  // 정답 무효급이라 relaxed 폴백에서도 출하 금지. 미설정(기본) 경로엔 영향 없음.
  "content-match-direction-polarity",
  "content-match-type-mismatch",
  "gist-polarity-direction-mismatch",
  "gist-polarity-field-mismatch",
  "summary-mc-direction-frame",
  "summary-mc-missing-direction",
  "summary-mc-direction-task-mismatch",
  "summary-mc-missing-summary",
  "summary-mc-blank-marker-count",
  // wave5: 종결 부호 없이 잘린 요약문 stem (실측 26-07-05 "...the words for ") —
  // 마커 게이트를 통과해도 문항 불성립이라 relaxed 에서도 차단.
  "summary-mc-stem-unterminated",
  "summary-mc-summary-language",
  "summary-mc-missing-blank-answer",
  "summary-mc-answer-language",
  "summary-mc-correct-completion-ungrammatical",
  "summary-mc-awkward-collocation",
  "summary-mc-correct-answer-mismatch",
  "summary-mc-correct-pair-mismatch",
  // 정답 번호가 맞더라도 direction/explanation이 실제 오답 선지 표면을 선택하면
  // 학생에게 상충된 정답을 주는 무결성 결함이므로 relaxed·salvage 모두 출하 금지.
  "summary-mc-answer-object-mismatch",
  "summary-mc-option-pair-shape",
  "summary-mc-option-language",
  "summary-mc-missing-half-correct-traps",
  // 정답 조합과 동일한 오답(복수정답 결함)은 relaxed 폴백에서도 출하 금지 (wave1 승격).
  "summary-mc-duplicate-correct-option",
  // 요약문 완성(단답) — 마커 누락/정답 인라인 노출은 relaxed 폴백에서도 출하 금지(누수·렌더 파손).
  "summary-complete-missing-summary",
  "summary-complete-blank-marker-count",
  "summary-complete-answer-language",
  "summary-complete-answer-leaks-in-summary",
  // 요약문 영작(SUMMARY_WRITING) — 누수/구조 무효 게이트는 relaxed 폴백에서도
  // 출하 금지(정답 노출·placeholder 깨짐·비영어 정답은 미생성이 잘못 생성보다 낫다).
  // sw-distractor-semantic 은 warning 이라 여기 미포함.
  "sw-answer-not-in-summary",
  // 26-07-06 검수 패널 FATAL 실측(w9dsc1: 정답 필수 'along'이 [보기]에 없고 'the'
  // 2회 필요한데 1개) — 정답을 칩으로 조립할 수 없으면 채점 불능급. TSW cloze 미러.
  "sw-answer-not-buildable-from-wordbank",
  "tsw-answer-not-buildable-from-wordbank",
  "sw-wordbank-no-answer-order",
  "sw-summary-blank-marker-count",
  "sw-modelanswer-present",
  "sw-answer-language",
  // wave5: TSW cloze 퇴화 stem("The (A), (B)"뿐) — 발문 골격이 없어 문항 불성립
  // (실측 26-07-05 final-std KILLER).
  "tsw-cloze-degenerate-stem",
  // wave2: [해석] 전문 번역 + [보기] 칩 전부 정답(미끼 0) 조합의 정답 노출
  // (베이스라인 실측 runIndex 45)과, 발문이 참조하는 [보기]/[해석] 상자가 비어
  // 있는 발문-렌더 불일치(runIndex 46 계열)는 relaxed 에서도 차단.
  "sw-gloss-answer-leak",
  "sw-direction-wordbank-mismatch",
  // 핵심 표현 빈칸(FILL_BLANK_KEY) — 빈칸 무결성/정답 노출 게이트는 relaxed 폴백에서도
  // 출하 금지(정답 자음골격 노출·빈칸 2개·정답이 본문에 비-빈칸 verbatim 잔존은
  // 미생성이 잘못 생성보다 낫다). fbk-answer-residual-leak 은 단일어일 때 warning 이라
  // 여기 있어도 차단되지 않는다(warning 은 비차단).
  "fbk-missing-blank-marker",
  "fbk-answer-skeleton-leak",
  "fbk-multiple-blanks",
  "fbk-answer-residual-leak",
  // wave2: 빈칸에 정답을 되끼운 복원문이 원문에 없으면 프레임 변형(비문/창작 정답)
  // — 베이스라인 실측 runIndex 41/42. 정답 무효급이라 relaxed 에서도 차단.
  "fbk-frame-altered",
  // wave4: 발문("한 단어로")과 정답 단어 수 모순 — 채점 불능급이라 relaxed 에서도
  // 차단 (베이스라인 실측: '한 단어로 쓰시오' + 3단어 정답).
  "fbk-direction-word-count-mismatch",
  "implied-meaning-missing-expression",
  "implied-meaning-missing-underline",
  "implied-meaning-underline-count",
  "implied-meaning-option-language",
  "implied-meaning-option-not-english",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-target-not-in-passage",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-thin-reasoning-gap",
  "implied-meaning-direct-answer-leak",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-absolute-giveaway-option",
  "irrelevant-sentence-count",
  "empty-irrelevant-sentence",
  "irrelevant-index-range",
  "irrelevant-index-edge",
  "irrelevant-answer-index-mismatch",
  // wave2: 해설/keyPoints/오답해설/렌더가 주장하는 무관문장 위치가 irrelevantIndex
  // 와 어긋나면 정답 무효급(베이스라인 실측 runIndex 29, llm 심사 15점).
  "irrelevant-answer-desync",
  "irrelevant-source-not-verbatim",
  "irrelevant-source-first-sentence",
  "irrelevant-source-order",
  "irrelevant-answer-from-source",
  "irrelevant-too-unrelated",
  // wave2: KILLER 삽입문 어휘 드리프트(창작 문장) — 0.18~0.25 경고 밴드로 출하된
  // 실측(runIndex 30)을 막기 위해 error 승격과 함께 relaxed 에서도 차단.
  "irrelevant-too-many-new-terms",
  "irrelevant-inserted-ungrammatical",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "sentence-insert-missing-passage",
  "sentence-insert-gap-marker-count",
  // wave2: correctAnswer(재구성 위치)와 해설/오답해설의 갭 주장이 어긋나면 정답
  // 무효급(베이스라인 실측 runIndex 12, llm 심사 38점).
  "sentence-insert-answer-desync",
  "sentence-insert-neutral-given",
  "passage-boundary-spacing-corruption",
  "passage-duplicate-sentence",
  "passage-joined-sentence-token",
  "sentence-insert-omitted-source-not-backed",
  "sentence-insert-omitted-source-visible",
  "sentence-insert-given-leaks-in-passage",
  "sentence-order-missing-given",
  // A paragraph that normalizes to empty makes the permutation unanswerable;
  // a paragraph label inside the GIVEN block corrupts the rendered structure.
  // These are validity failures, not the adjacent length/balance craft signals.
  "sentence-order-empty-paragraph",
  "sentence-order-given-contains-paragraph-label",
  "sentence-order-given-too-long",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-count",
  "sentence-order-paragraph-labels",
  "sentence-order-paragraph-too-short",
  "sentence-order-paragraph-too-thin",
  "sentence-order-paragraph-imbalance",
  "sentence-order-option-permutation",
  "sentence-order-option-duplicates",
  "sentence-order-correct-option-shape",
  "sentence-order-unscrambled-answer",
  // 정답 키 재구성 게이트 (wave1) — 주장된 순열이 원문 위치 순서와 어긋나거나
  // 단락이 원문 verbatim 이 아니어서 검증 불가면 정답 무효급이라 relaxed 에서도 차단.
  "sentence-order-answer-key-mismatch",
  "sentence-order-paragraph-not-source-backed",
  // These BLANK_INFERENCE paraphrase gates remain blocking even in the relaxed
  // fallback because shipping an untransformed or giveaway item is worse than
  // asking the generation loop to try again.
  "blank-missing-answer",
  // 26-07-06 검수 패널 FATAL 실측 3건 — 슬롯 복원 무결성(모드 불문): 빈칸이 주어/
  // 조동사/보어 골격을 삼켰는데 선지가 그 골격을 복원하지 못하면 어떤 선지를 넣어도
  // 비문(선지 복원 문법 파손 = 무정답급). notice 로도 출하 금지.
  "blank-slot-subject-swallowed",
  "blank-slot-aux-agreement-broken",
  "blank-slot-double-verb-option",
  "blank-relative-tail-contract",
  "blank-finite-tail-agreement-contract",
  "blank-double-connector-boundary",
  "blank-double-preposition-boundary",
  "blank-double-punctuation-boundary",
  "blank-article-boundary",
  "blank-paraphrase-answer-not-transformed",
  "blank-paraphrase-correct-residual-visible",
  "blank-paraphrase-answer-too-verbatim",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-correct-too-thin",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-killer-giveaway-distractors",
  "blank-paraphrase-verb-form-slot-mismatch",
  "blank-paraphrase-subject-slot-mismatch",
  "blank-paraphrase-clause-slot-mismatch",
  "blank-paraphrase-polarity-loss",
  "blank-paraphrase-target-trailing-function",
  "blank-paraphrase-target-too-wide",
  "blank-killer-target-too-easy",
  "blank-target-too-small",
  "blank-target-list-like",
  "blank-awkward-correct-option",
  "blank-awkward-option",
  "blank-option-slot-syntax",
  "multi-blank-paraphrase-correct-source-exact",
  "negative-paraphrase-copula-slot-mismatch",
  "negative-paraphrase-stacked-prepositions",
  "negative-paraphrase-verb-slot-mismatch",
  "negative-paraphrase-modal-be-negated-complement",
  "negative-paraphrase-no-subject-double-negation",
  "double-negative-clause-missing-subject",
  "double-negative-because-phrase-slot",
]);

// KO(국어) blocking 코드 전부 등록 — 미등록 error 는 relaxed 폴백에서 warning 으로
// 강등 출하되므로(판정단 실측) 구조·정답 무결성 결함은 relaxed 에서도 차단한다
// (KO-DESIGN-SPEC §7). KO 코드는 SHIP_FIRST 에 없어 아래 차감의 영향을 받지 않는다.
for (const code of KO_BLOCKING_CODES) {
  RELAXED_BLOCKING_QUALITY_CODES.add(code);
}

// SHIP-FIRST: B(취향/난이도) 코드는 question-quality 에서 warning 으로 강등되어 절대
// error 로 이 필터에 도달하지 않는다. 단일 진실원(SHIP_FIRST_WARNING_CODES)에서 차감해
// 두 목록의 동기화를 보장하고 위 리터럴의 중복 항목(blank-target-list-like)도 제거한다.
// 남는 것 = A(차단 유지) + C(사전 fast-fail) 코드뿐.
for (const code of SHIP_FIRST_WARNING_CODES) {
  RELAXED_BLOCKING_QUALITY_CODES.delete(code);
}

// ============================================================================
// 결핍 지문(scarce) 최선 생성 모드 — 어법 "품질 취향" 게이트만 추가 강등.
//
// 유저 결정(26-07-04): 깨끗한 어법 자리가 부족한 지문에서도 "못 만듭니다"로
// 끝내지 말고, 최선 문항을 만들어 주되 왜 품질이 제한적인지 notice 로 알린다.
// 이 셋의 코드는 scarce 모드에서 error→warning 강등되어 출하된다(검수 권장 배지).
//
// 절대 강등 금지(RELAXED_BLOCKING 잔류 유지): 마커/개수/정답표 무결성,
// 오류 미도입·원문 비근거, 복수정답 시비(debatable-*/quantity-*/tense-only/
// disputed-usage/semantic-*), 렌더 파손 계열 — 이런 결함은 "품질 낮은 문항"이
// 아니라 "틀린 문항"이라 notice 로도 출하할 수 없다.
// ============================================================================
export const GRAMMAR_SCARCE_RELAXABLE_CODES = new Set([
  // 디코이 매력도/장식성 — 문항은 성립하나 함정 가치가 낮음.
  "grammar-weak-filler-decoys",
  "grammar-too-basic-decoys",
  "grammar-shallow-checklist-decoys",
  "grammar-shallow-depends-decoy",
  "grammar-shallow-nearby-passive-decoy",
  "grammar-shallow-than-decoy",
  "grammar-demonstrative-that-way-decoy",
  "grammar-decoy-point-monotony",
  // 킬러 깊이 미달 — 정답은 유일하나 난이도 라벨 대비 얕음.
  "grammar-killer-thin-answer",
  "grammar-killer-overdrilled-answer",
  "grammar-keypoint-choice-mismatch",
  "grammar-answer-point-not-core",
  "grammar-killer-generic-answer-point",
  "grammar-killer-answer-point-repeated",
  "blank-explanation-step-numbering",
  "grammar-killer-thin-relative-animacy",
  "grammar-killer-thin-concessive-as",
  "grammar-killer-thin-connector",
  "grammar-killer-thin-missing-aux",
  // obvious 계열 — 정답이 로컬로 뻔히 보이는 저품질 오류형(단일 정답은 확실).
  "grammar-obvious-modal-gerund",
  "grammar-obvious-modal-to-infinitive",
  "grammar-obvious-intransitive-passive",
  "grammar-obvious-double-ing",
  "grammar-obvious-local-agreement",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-obvious-to-gerund-after-verb",
  "grammar-obvious-connector-to-what",
  "grammar-obvious-despite-being-to-be",
  "grammar-obvious-seem-to-gerund",
  "grammar-obvious-seem-gerund",
  "grammar-obvious-passive-to-gap-ing",
  "grammar-obvious-adverb-adjective",
  "grammar-obvious-living-finite",
  "grammar-obvious-living-lived",
  "grammar-obvious-what-noun-prefix",
  "grammar-obvious-local-pronoun-agreement",
  "grammar-obvious-object-pronoun-subject",
  "grammar-obvious-before-after-to-infinitive",
  "grammar-obvious-pronoun-agreement",
  "grammar-obvious-noun-what-relative",
  "grammar-obvious-endure-passive-object",
  "grammar-obvious-finite-to-ing-colon",
  "grammar-shallow-participle-adjective-answer",
  "grammar-shallow-local-participle-parallel",
  "grammar-shallow-despite-although-gerund",
  "grammar-shallow-because-despite-clause",
  "grammar-basic-overloaded-design",
  "grammar-marker-too-dense",
  // 해설 취향 — 길이·비표준 표현만 최후 구제에서 완화한다. 사실 오분석,
  // source 비근거 keyPoint, 오탈자, 누락은 문항 해설의 정확성 결함이라 제외한다.
  "grammar-explanation-too-long-hard",
  "grammar-vague-metadata-tag",
]);

// ============================================================================
// never-fail 구제(salvage) 강등 계층 — 전 유형 공통 (26-07-06 유저 결정).
//
// "생성 실패"는 최악의 결과다: 저품질이 우려되면 경고(notice)를 달고서라도 반드시
// 문항을 만들어야 한다. 이 셋의 코드는 "완성도(craft)" 결함 — 문항은 성립하고
// 정답은 유일하지만 함정 매력도·난이도 깊이·해설 다듬기·변형 깊이가 기준에 못
// 미치는 것들이다. strict/relaxed 에서는 여전히 차단되어 재시도(교정 재생성)를
// 압박하고, 사다리 최후의 scarce(구제) 모드에서만 경고로 강등되어 출하된다.
//
// 절대 여기 넣으면 안 되는 것(F급 — RELAXED_BLOCKING 잔류): 정답 무효·복수정답
// 시비(debatable/tense-only/perception/quantity/desync/answer-key-mismatch),
// 정답 노출(leak/visible/verbatim 잔존), 렌더 파손(마커/개수/빈칸 마커), 발문
// 불성립(stem 잘림·퇴화). 이런 결함은 "품질 낮은 문항"이 아니라 "틀린 문항"이라
// notice 로도 출하할 수 없다 — 실측 근거: 26-07-05 최종 스윕의 무정답/desync 사고.
// ============================================================================
export const SALVAGE_RELAXABLE_CODES = new Set<string>([
  // 어법 취향 게이트 전체(기존 scarce 분류를 그대로 승계).
  ...GRAMMAR_SCARCE_RELAXABLE_CODES,
  // 어법 — scarce 분류엔 없지만 같은 craft 급인 해설/표기/밑줄 취향.
  "grammar-error-explanation-surface-order",
  "grammar-terminology-register",
  "grammar-agreement-explanation-too-thin",
  "grammar-underline-too-long",
  "grammar-underline-punctuated-fragment",
  "grammar-decoy-point-diversity",
  // 정답형·메타데이터 무결성 코드는 RELAXED_BLOCKING 에 남겨 어떤 최후 구제
  // 경로에서도 출하하지 않는다. 여기에는 실제 공예 완화·표적수리 후보만 둔다.
  // ② 장식 필러 미끼 스팬 — 미끼 1개만 교체하는 decoy-only repair 대상.
  "grammar-decoy-filler-span",
  // idiom/스팬 취향과 KILLER 깊이 미러만 craft 구제로 유지한다.
  "grammar-fixed-that-is-idiom",
  "grammar-mixed-as-it-span",
  "grammar-correction-killer-thin-segment",
  // (제거됨 26-07-06 적대검증) cond-writing-verbatim-answer / writing-answer-
  // verbatim-copy — 발화 유형은 지문이 문항 안에 인라인 렌더되므로(passage-policy
  // INLINE) verbatim 모범답안 = 학생 눈앞에 정답 노출. F급 잔류.
  // 빈칸 추론 — 변형 깊이/함정 완성도/난이도 취향. 정답 유일성은 별도 게이트가 지킨다.
  "blank-paraphrase-answer-not-transformed",
  "blank-paraphrase-answer-too-verbatim",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-correct-too-thin",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-killer-giveaway-distractors",
  // (제거됨 26-07-06 적대검증) verb-form/clause-slot-mismatch — "정답 선지"를
  // 빈칸에 넣으면 비문("to developing")이 되는 무정답급이라 F급 잔류.
  // subject-slot mismatch also breaks the visible completed sentence and is
  // intentionally absent from salvage.
  "blank-paraphrase-target-trailing-function",
  "blank-paraphrase-target-too-wide",
  "blank-killer-target-too-easy",
  "blank-target-too-small",
  "multi-blank-paraphrase-correct-source-exact",
  // (제거됨 26-07-06 적대검증) negative-paraphrase-stacked-prepositions —
  // 정답 삽입 시 전치사 중첩 비문("by by")이 되는 무정답급이라 F급 잔류.
  // 함축 의미 — 타깃 선정/추론 깊이 취향(정답 유일성·누출 게이트는 별도 F급).
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-thin-reasoning-gap",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-absolute-giveaway-option",
  "implied-meaning-missing-surface-meaning",
  // 26-07-06 과엄격 적대검증 — topic-option-language 와 동일한 형식 취향 클래스.
  // 무관한 문장 — 삽입문 완성도 취향(위치/정합 desync 계열은 F급 잔류).
  "irrelevant-source-first-sentence",
  "irrelevant-too-unrelated",
  "irrelevant-too-many-new-terms",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  // 순서 배열 — 단락 균형/길이 취향(정답키 재구성·순열 무결성은 F급 잔류).
  "sentence-order-given-too-long",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-too-short",
  "sentence-order-paragraph-too-thin",
  "sentence-order-paragraph-imbalance",
  "sentence-order-unscrambled-answer",
  // 요약문 — 발문 프레임/콜로케이션/함정 구성 취향(정답표·마커·언어는 F급 잔류).
  "summary-mc-direction-frame",
  "summary-mc-awkward-collocation",
  "summary-mc-missing-half-correct-traps",
  // 주제 — 선지 언어 스펙(문항 성립, 형식 취향).
]);
