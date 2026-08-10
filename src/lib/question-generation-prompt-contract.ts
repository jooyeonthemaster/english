import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { TeacherPointPayload } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";

// ── 교사 지정 출제 포인트 블록 (point-picker-design.md §2 서버 소비 4단계) ────
// STANDARD(compact)·PREMIUM(prompts.ts) 두 생성 경로가 같은 블록을 공유한다.
// AI 플랜 targetPoints("Required target points"/"분석 포인트")와는 별도 블록이며,
// 지문 바로 다음·유형 프롬프트 앞에 배치된다.

const TEACHER_POINT_UNIT_LABELS: Record<TeacherPointPayload["unit"], string> = {
  word: "단어",
  phrase: "구",
  clause: "절",
  sentence: "문장",
};

/**
 * teacherPoints 를 "## 교사 지정 출제 포인트 (필수 반영)" 프롬프트 블록으로 만든다.
 * 항목은 "N. \"축자 인용\" (단위, 태그?)" 형식(note 는 있으면 말미에 병기).
 * 빈 배열이면 "" 를 반환해 기존 프롬프트와 바이트 동일을 보장한다.
 */
export function buildTeacherPointsPromptBlock(
  teacherPoints: readonly TeacherPointPayload[],
): string {
  if (teacherPoints.length === 0) return "";
  const lines = teacherPoints.map((point, index) => {
    const unitLabel = TEACHER_POINT_UNIT_LABELS[point.unit] ?? point.unit;
    const tag = point.tag?.trim();
    const note = point.note?.trim();
    const meta = tag ? `(${unitLabel}, ${tag})` : `(${unitLabel})`;
    return `${index + 1}. "${point.text}" ${meta}${note ? ` — ${note}` : ""}`;
  });
  return `## 교사 지정 출제 포인트 (필수 반영)
${lines.join("\n")}
위 verbatim 구간을 이 유형의 정답 위치(밑줄/빈칸/오류 지점/근거 문장)로 반드시 사용하라. 유형 규칙상 불가한 항목만 최근접 대체하고 해설에 사유를 남겨라. 이 지시는 다양성 회피 목록보다 우선한다.`;
}

// GEMINI_QUESTION_QUALITY_CONTRACT 재구성(26-07-06): 전 유형 공유 단일 문자열을
// 공통부(CONTRACT_COMMON)와 유형별 지시(CONTRACT_TYPE_SEGMENTS)로 분리한다. typeId 없이
// 호출하면 전 세그먼트를 원문 순서대로 이어붙여 기존 문자열과 바이트 동일하게 재현하고,
// typeId 를 주면 공통부 + 그 유형 섹션만 남겨 무관한 유형 지시(토큰)를 떨어낸다.
// 현재는 GRAMMAR_ERROR 만 CONTRACT_TYPE_SECTIONS 에 등록되어 그 경로에서만 필터가 작동한다
// (그 외 유형은 키가 없어 전체 tail 로 폴백 → 기존 프롬프트와 완전 동일).

const CONTRACT_COMMON = `
## Gemini item quality contract
Use this checklist silently before writing the final JSON. Do not output notes, markdown, or hidden analysis outside the JSON object.

Core evidence:
- Choose the exact passage sentence(s), phrase(s), or discourse clue that prove the answer.
- Make the correct answer require passage reasoning, not generic English knowledge.
- Keep every answer, distractor, and explanation grounded in the passage.

Distractor design for multiple-choice items:
- Create one plausible wrong option for every non-correct option slot before finalizing the correct option. For standard 5-option items this means four wrong options; for IRRELEVANT with a larger slotCount, this means slotCount - 1 wrong options; for multi-answer GRAMMAR_ERROR this means option count minus the configured answer count.
- Each wrong option must have a distinct trap role where possible. Use different roles from this pool: too broad, too narrow, partial truth, reversed logic, wrong cause/effect, wrong contrast/concession, unsupported inference, wrong reference, wrong grammar relation, wrong context meaning, dictionary-meaning trap, example-only trap, emotional-overreach trap.
- Do not make any wrong option obviously absurd, much shorter/longer, or stylistically different from the correct option.
- For vocabulary/context items, keep distractors in the same part of speech and make them contextually tempting.
- If a wrong option can be eliminated without reading the passage closely, rewrite it.
- If two wrong options fail for the same reason, rewrite one of them.
- Keep all options parallel in grammar, register, length, and abstraction level so the correct answer is not visible by style.
- The correct option should be the best synthesis of the passage, not merely the only reasonable-looking option.
- Every wrong option must be anchored in a real passage phrase, example, or concept. Do not add an unrelated filler distractor just to satisfy a trap role.
- Prefer "near-miss" distractors over opposite or random distractors. A near-miss borrows true passage language but distorts scope, relation, timing, target, or author stance.

Silent trap blueprint:
- Before final JSON, silently make an option blueprint: correct evidence path + one wrong-option trap role for every wrong option.
- Use the blueprint to write the options, but do not output the blueprint.
- Make the wrongOptionExplanations reveal the trap logic in Korean without using role labels such as "too broad" unless that is natural.
- Prefer traps that a strong student would actually consider for 5-15 seconds, not choices that a weak student would eliminate instantly.

wrongOptionExplanations requirements:
- For every multiple-choice item, wrongOptionExplanations must contain exactly one entry for each wrong option label. Standard 5-option items have four entries; IRRELEVANT with slotCount N must have N - 1 entries; multi-answer GRAMMAR_ERROR has one entry for each grammatically correct non-answer label, or zero entries when the configured answer count makes every label an answer.
- Follow the schema shape exactly. If the schema is an array, each entry must be { "label": "...", "explanation": "..." }. If the schema is an object, use the wrong option label as the key.
- Each wrong option explanation must explain both why the option may look tempting and the concrete passage clue that makes it wrong.
- Avoid generic phrases such as "it is not in the passage" unless you also name the exact missing or contradicted passage evidence.
- Use concise Korean, preferably 1-2 sentences per wrong option.
- For Korean visible options, especially REFERENCE/TOPIC_MAIN_IDEA/MAIN_IDEA/CONTENT_MATCH, name the visible Korean option text first. Do not start the explanation only with the English source phrase; English passage terms may be used as evidence after the Korean option is identified.

해설 품질 계약 (위반 시 반려 — O201 S3i 실측: 이 계약 주입이 스탠다드 콘텐츠성 F 0 의 축):
- E1. 해설의 구조 분석(선행사·절 경계·수식 관계·품사 판정)은 실제 문장을 재파싱한 결과와 정확히 일치해야 한다 — 틀린 근거로 맞는 결론을 내는 것도 결함이다.
- E2. 해설이 인용하는 영어 표현은 지문·선지·고친 형태에 실재하는 것만 쓴다(존재하지 않는 단어·창작 표현 인용 금지).
- E3. 해설이 지문 두 표현의 관계를 서술할 때는 그 관계가 실제 문장에서 성립하는 짝인지 확인한다(다른 문장의 표현을 붙여 쓰지 마라).
- E4. 한국어는 표준어만: 존재하지 않는 단어(오타·비어) 금지, 조사·어미 정확히, 합니다체 통일.

Type-specific checks:`;

interface ContractTypeSegment {
  // 이 지시 줄이 실제로 검사하는 유형. 여러 유형에 걸치면 전부 태깅한다.
  // 빈 배열은 유형 무관(구조적 줄, 예: 말미 개행)이라 모든 유형 섹션에 항상 포함된다.
  types: readonly string[];
  text: string;
}

// 원문 헤더 이후의 유형별 지시 줄을 순서대로 보존한 배열. 전 세그먼트의 text 를 순서대로
// 개행 문자로 조인하면 원문 tail 을 그대로 재현한다(바이트 동일 보증의 척추).
const CONTRACT_TYPE_SEGMENTS: readonly ContractTypeSegment[] = [
  { types: ["SENTENCE_ORDER", "SENTENCE_INSERT"], text: "- SENTENCE_ORDER and SENTENCE_INSERT: cite ordering clues such as reference words, contrast, chronology, cause/effect, or topic flow." },
  { types: ["SENTENCE_ORDER"], text: "- SENTENCE_ORDER display contract: givenSentence must be only the first 1-2 sentences and 65 words or fewer, never a long introductory paragraph. If the first two sentences exceed 65 words, use only the first sentence. Split the remaining text into exactly three balanced chunks (A), (B), and (C); each chunk must contain at least two sentences and no chunk should be roughly twice as long as another. Do not produce \"given 4 sentences + one-sentence A/B/C\" items. Label the chunks so the correct order is not simply (A)-(B)-(C), and make all five options valid permutations of (A), (B), and (C)." },
  { types: ["SENTENCE_INSERT"], text: "- SENTENCE_INSERT source omission contract: givenSentence must be copied from or very lightly transformed from one original passage sentence. Always output sourceSentenceToOmit as the original verbatim source sentence. Never invent a new bridge sentence or add outside background information. The displayed passage must not still contain that same source sentence or a near-verbatim version of it; otherwise the answer is exposed." },
  { types: ["TITLE", "TOPIC", "TOPIC_MAIN_IDEA", "MAIN_IDEA"], text: "- TITLE, TOPIC, TOPIC_MAIN_IDEA, and MAIN_IDEA: build the four wrong options as different title/topic/main-idea traps: topic-only, example-only, too broad, too narrow, reversed stance, or attractive but unsupported implication. Avoid options that are merely silly." },
  { types: ["CONTENT_MATCH"], text: "- CONTENT_MATCH: the false statement should be a subtle distortion of a real passage claim, not an invented fact. Use traps such as cause reversal, future/past criterion confusion, scope exaggeration, condition loss, or example-to-claim shift." },
  { types: ["SUMMARY_COMPLETE_MC"], text: "- SUMMARY_COMPLETE_MC: this is the CSAT-style objective summary completion item, not the constructed-response summary item. Use the exact frame \"다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?\" The summaryWithBlanks must be one English sentence with (A) and (B) exactly once each. After inserting the correct pair, the sentence must read as native, natural exam English. Do not force awkward bridges such as \"a question/matter/issue of (A) to (B)\"; if (B) follows \"to\", it normally needs a base verb, while a gerund blank needs a natural preposition such as by/through/of. Options must be five English pairs; each option should include blankA, blankB, and text in \"blankA …… blankB\" form. The correct pair must match blanks exactly. Wrong pairs must be passage-grounded near-misses. Include one A-only-correct option by copying the exact correct blankA string and changing only blankB. Include a different B-only-correct option by copying the exact correct blankB string and changing only blankA. For KILLER, those half-correct traps must be genuinely competitive: pair the correct blankA with the most tempting wrong blankB, and pair the correct blankB with the most tempting wrong blankA. Do not bury a strong trap such as genetically behind an obviously wrong blankA such as individualistic. Wrong blankA/blankB values should stay in the same semantic field as the correct answer, not be instant antonyms or silly contrasts. Wrong-option explanations should say \"선지 배열상/지문 논리상/요약문의 관계상\", not \"대조군 설계\"." },
  { types: ["SUMMARY_COMPLETE_MC"], text: "- SUMMARY_COMPLETE_MC variable blank override: if a type-detail setting requests more than two summary blanks, it overrides the default (A)/(B)-only contract above. Use exactly the requested labels, include every label exactly once in summaryWithBlanks, include a blanks answer entry for every label, and make every option provide blankValues for every requested label plus a text value joining them with \" …… \"." },
  { types: ["TOPIC", "MAIN_IDEA"], text: "- TOPIC vs MAIN_IDEA distinction: TOPIC asks what the passage is centrally about, so all TOPIC options must be compact English topic phrases with the controlling viewpoint. MAIN_IDEA asks what the passage says/argues, so the correct option must be a complete Korean claim statement. Do not generate a title-like noun phrase for MAIN_IDEA." },
  { types: ["IMPLIED_MEANING"], text: "- IMPLIED_MEANING: treat this as a main-idea/gist family item, like TOPIC, TITLE, and SUMMARY_COMPLETE_MC. Underline a SHORT phrase or clause (≤6 words by default, 8 words maximum — never a full sentence or a 9+ word clause) that is one of: (1) a compressed expression of the passage's keyword/theme, (2) an expression of the OPPOSITE of that theme (the writer's critique/negation/contrast), or (3) a metaphorical/figurative expression (prefer (3) if any figurative wording exists). If a good span is longer, underline only its core nucleus. Do not use a peripheral local detail, a single vocabulary word, pronoun, dictionary idiom, rhetorical question, or self-answering question. All five options must be English-only. The correct English option must paraphrase the central implied meaning of the underline, not translate the surface text. There must be a real surface-to-central-meaning gap; if the next sentence directly paraphrases the answer, choose a different underline. Wrong options must be near-misses anchored in passage concepts and fail by scope, cause-effect, stance, example/generalization, or local-vs-global evidence. For KILLER, require at least two evidence links before/after the underlined expression, fill surfaceMeaning and reasoningGap honestly for internal audit, avoid giveaway absolutes such as completely, entirely, always, never, only, solely, exclusively, must, without exception, and keep all five options similar in length and abstraction." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE: all options must fit the same grammatical slot. Wrong options should echo real passage vocabulary or concepts while violating the sentence's logical relation. Do not use unrelated distractors such as social comparison, vague life lessons, or generic experience unless they are explicitly in the passage." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE difficulty depth ladder: BASIC = the answer is recoverable from a restatement inside or right next to the blank sentence (one-sentence evidence). INTERMEDIATE = the answer requires connecting two different sentences through a cause-effect or contrast relation. KILLER = the blank sits where the whole passage's thesis converges, the answer requires linking at least two evidence sentences, and the correct option is an abstract paraphrase (KILLER single-blank items always run in PARAPHRASE mode), never a verbatim copy of the source span." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE with blankAnswerMode PARAPHRASE: originalExpression remains the exact source span for blank placement, but the visible correct option must be a non-verbatim paraphrase that preserves the full source meaning, grammar slot, polarity, scope, and discourse relation. Calibrate wording by difficulty: BASIC uses short high-frequency wording, INTERMEDIATE uses natural academic paraphrase, and KILLER uses compact abstract reformulation that requires surrounding evidence. Wrong options must be similarly paraphrased, parallel in length/register, and passage-grounded near-misses. If the blank is a sentence subject in a frame such as \"_____ is not whether ... but how ...\", keep the option as a compact noun phrase like \"the central challenge/task\"; do not turn it into a gerund process phrase such as \"balancing ...\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE INTERMEDIATE calibration: INTERMEDIATE should not be a 2-3 word local synonym swap such as \"making judgments\" -> \"forming evaluations\". Choose a fuller source relation and a fuller natural academic paraphrase, normally at least four words and four meaningful content words on both the source target and correct option, while keeping it readable." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE KILLER calibration: KILLER must not be a short local synonym question. Pick a central relation that requires at least two passage evidence links. The source originalExpression should normally be at least seven words with five meaningful content words, and the visible correct option should be a natural 8-16 word reformulation with at least six meaningful content words. Do not use the screenshot-level pattern of \"commercial transactions\" for \"selling a product\" and call it KILLER; that is BASIC/INTERMEDIATE." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE KILLER distractors: at least three wrong options must be same-field near misses grounded in passage concepts. Avoid giveaway extremes or instant opposites such as unconditionally, completely, passive/passively, strict/strictly, inevitably, naturally, whatever, successfully, solely, entirely, fully, only, always, never, must, cannot, guarantees, definitive, flawless, seamless, error-free, automatically, altogether, eliminate, any form of, from/without/against any, bound to, or indefinitely unless the passage itself makes that exact strength necessary." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE target span check: choose a clean semantic unit for originalExpression. Do not end originalExpression with a dangling modal, auxiliary, or function word such as will, can, could, is, are, or to; that turns the item into a grammar-tail variant instead of a reading-inference paraphrase." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE target size check: originalExpression should normally be a compact 3-11 word semantic unit under 80 characters, not a whole sentence or a long clause with multiple alternatives. In frames like \"X requires more than A or B\", blank a compact phrase such as A or B, not the entire \"X requires more than...\" clause." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE target width check: never make originalExpression longer than about 12 words or 90 characters. If the intended idea needs more than that, choose the central relation phrase rather than the full clause." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE polarity check: if the source expression contains resistance, avoidance, negation, or prevention, the correct paraphrase must preserve that relation. For example, \"resisting the temptation to reduce...\" cannot become \"simplifying/reducing...\"; it should be \"avoiding the reduction of...\" or \"recognizing the need not to reduce...\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE context-fit check: silently insert every option into the blank. If the left context already says \"ways in which _____\" or \"process by which _____\", the option must not repeat \"ways in which\" or \"process by which\"; write the subject/action phrase that completes that frame." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE preposition-slot check: if the left context already ends with a preposition such as by/of/to/for/with/from/in/on, the option must not start with another preposition. For example, after \"by _____\", write \"helping plants recover\", not \"by helping plants recover\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE infinitive-slot check: if the left context ends with \"to _____\", every option must begin with a base verb phrase that completes the infinitive. Do not write a gerund phrase such as \"critically evaluating...\" after \"to\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE PARAPHRASE clause-slot check: if originalExpression is a finite clause such as \"it requires...\", the correct option must also be a finite clause when the blank starts after a semicolon or sentence boundary. Do not replace that clause with a bare gerund phrase such as \"making...\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE with blankAnswerMode DOUBLE_NEGATIVE: treat it as a negative-paraphrase blank. The passage itself does not need a visible negation cue. The correct option must be a non-verbatim negative/privative paraphrase of originalExpression, and at least two wrong options must also contain negative/privative language so the negative-looking option is not a shortcut. Avoid tangled negation such as \"not ... without\", \"unable ... without\", or \"impossible ... without\" when it changes a helpful function into a strict necessity. Never create no-subject + negative-predicate double negation such as \"No effort does not...\", \"No strategy cannot...\", or \"No reason is not...\"; if the option uses no/lack/absence, the completed sentence must remain affirmative and logically clear." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE with blankAnswerMode PARAPHRASE (KILLER): originalExpression stays a verbatim passage span (used only to locate the blank), but the correct option must be an abstract same-slot restatement of it, not a verbatim or near-verbatim copy. At least two wrong options must reuse real passage vocabulary or concepts, and at least two must share the correct option's polarity, so neither surface matching nor polarity alone solves the item." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE native-English check: reject awkward collocations such as \"achievement(s) failing\", \"prevent your achievement from failing\", \"achieved success\", \"capacity to lack\", \"events cannot survive\", \"guarantee major crops\", \"not allow any disruption\", or \"can be not entirely immune\". Use natural exam English such as \"prevent success from eroding/collapsing\", \"keep current success from eroding\", \"freedom from dependence on...\", \"cannot be dismissed as trivial\", \"secure stable supplies of major crops\", or \"are not immune to...\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE paraphrase naturalness check: avoid stilted paraphrases such as \"carrying out following evaluations or estimations\", \"act as an active filter\", \"active filter amidst...\", \"sovereignly filtering\", \"cultural influxes\", \"moral terrains\", \"property of shared choices\", \"synergistic channels\", \"collective boundaries\", \"compassionate comprehension\", \"compromising alternatives\", \"reality that envelopes us\", \"degraders\", or \"degraders internalize\". Prefer natural exam English such as \"make later judgments\", \"evaluate ideas critically\", \"filter global influences critically\", \"global cultural influences\", \"navigate complex ethical issues\", \"build collaborative innovation networks\", or \"make polluters pay/internalize environmental costs\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE slot check: if the source says \"can/could certainly be influenced by X\", blank the whole modal passive span such as \"can certainly be influenced by reasoning\"; do not leave \"can certainly be _____\" for a correct option beginning with \"not...\" or \"are not...\"." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE adjacent-conclusion check: if the sentence right after the blank begins with a conclusion signal such as \"By adopting this strategy\", \"Therefore\", \"Thus\", \"For this reason\", or \"As a result\", the correct option must directly support that next sentence. Reject answers that only strengthen one side of a policy when the next sentence says the strategy reduces excessive dependence or creates a balanced/resilient system." },
  { types: ["BLANK_INFERENCE"], text: "- BLANK_INFERENCE wrong-option explanations: cite the decisive clue that eliminates each option. Do not explain a wrong option only by saying it is positive, negative, or close to the author's ideal. For conclusion blanks, name the conclusion signal or adjacent evidence that the option fails to match." },
  { types: ["SENTENCE_ORDER", "SENTENCE_INSERT"], text: "- SENTENCE_ORDER and SENTENCE_INSERT: every wrong order/location should have one tempting local clue but fail on a later reference, contrast, chronology, or conclusion signal." },
  { types: ["SENTENCE_ORDER"], text: "- SENTENCE_ORDER: before final JSON, count sentences and words silently. givenSentence must be 1-2 sentences and 65 words or fewer; each of (A)/(B)/(C) must be at least 2 sentences; the three chunks must be balanced in word count; reject any split where the given part is longer than the average A/B/C chunk." },
  { types: ["GRAMMAR_ERROR", "GRAMMAR_CORRECTION"], text: "  - GRAMMAR_ERROR and GRAMMAR_CORRECTION: ensure the marked expression actually appears in the passage and the explanation names the grammar rule. Avoid controversial errors where a standard grammar reader could accept both versions. Grammar explanations must label parts of speech and syntax accurately; never call a finite verb, modal, conjunction, or clause by the wrong category. Use simple reliable labels such as subject, object, finite verb, auxiliary, conjunction, preposition, gerund, participle, relative pronoun, or noun clause; if unsure, describe the structure without inventing a category." },
  { types: ["GRAMMAR_ERROR"], text: "  - GRAMMAR_ERROR target quality: every marked position must test one of the structural grammar frames, even for non-answer decoys. Do not underline filler or lexical surfaces such as \"thicker\", \"more\", \"hard\", \"as a\", \"this\", discourse \"though,\", \"looks more like\", or \"seems to V\"; do not make \"looks more like\" into \"looks more likely/most like\". If the passage contains those phrases, skip them and choose a cleaner source-backed structure." },
  { types: ["GRAMMAR_CORRECTION"], text: "  - GRAMMAR_CORRECTION display contract: underline a sentence-level or clause-level passage segment, not the exact wrong word/form. The student must find the grammar error hidden inside that wider underline. Do not print a separate error sentence that reveals the location." },
  { types: ["GRAMMAR_CORRECTION"], text: "  - GRAMMAR_CORRECTION source contract: underlinedSegments[].sourceText must be an original passage segment. Every underlined segment is an error segment with a label starting at (A); displayedText is sourceText with correctedPart changed to errorPart, and correctAnswer lists every label + correctedPart in order joined by comma + space." },
  { types: ["GRAMMAR_CORRECTION"], text: "  - GRAMMAR_CORRECTION target quality: prefer agreement, finite/non-finite verb choice, parallelism, modifier active/passive, relative/nominal clause choice, pronoun agreement, complement form, comparison structure, or preposition-vs-conjunction. Avoid articles, tiny prepositions, spelling, punctuation, style-only improvements, or debatable active/passive infinitive preferences." },
  { types: ["GRAMMAR_ERROR"], text: "- GRAMMAR_ERROR with detailed settings: the setting controls both the number of marked expressions and the exact number of answers. correctAnswers must list every isError=true label, correctAnswer must repeat those labels joined by comma + space, and the explanation must explicitly cover every displayed wrong expression and its correction. If the configured answer count is 2 or more, the direction must use \"모두\" without revealing the number. Do not silently fall back to a single answer; when the configured answer count equals the marked expression count, every label can be an answer." },
  { types: ["GRAMMAR_ERROR", "GRAMMAR_CORRECTION"], text: "- When writing Korean grammar explanations, never call ask, asking, require, requires, spend, spent, developing, or similar verb forms \"전치사\". Never write phrases like \"전치사 'asking'\", \"전치사 asking\", \"전치사 'spend'\", \"전치사 'require'\", or \"전치사 'developing'\". Use \"동사\", \"분사구문\", \"동명사\", \"현재분사\", or \"목적어를 취하는 구조\" only when accurate." },
  { types: ["GRAMMAR_ERROR", "GRAMMAR_CORRECTION"], text: "- If you explain \"asking\", say \"asking 뒤의 목적어 자리\" or \"asking이 이끄는 분사구문\" as appropriate. Do not put the word \"전치사\" anywhere in the same sentence as asking/ask/requires/require/spend/spent/developing." },
  { types: ["GRAMMAR_ERROR"], text: "- GRAMMAR_ERROR schema rule: expression/correction must be the original correct passage wording; errorExpression must be the intentionally wrong displayed wording. The original correct wording must exist verbatim in the passage. Never mark the original author's wording as wrong, and never \"improve\" a grammatically acceptable original phrase into a different preferred phrase." },
  { types: ["GRAMMAR_CHOICE_COMBO"], text: "- GRAMMAR_CHOICE_COMBO contract: each of the three slots must have correctExpression copied verbatim from the passage and wrongExpression as an intentionally wrong same-stem mutation that is clearly ungrammatical in that position. Assume the original passage is correct; never present the original wording as the wrong candidate. The three slots must use three different pointCodes and live in three different sentences. Exactly one option's slotValues equals all three correctExpressions, options must not repeat the same slotValues combination, every option's slotValues entries must be copied exactly from that slot's two candidates, and each slot's wrongExpression must appear in at least one wrong option. Do not use tense-only mutations (past vs present alone) or debatable preferences (active/passive infinitive, gain/lose targets) as the wrong candidate." },
  { types: ["GRAMMAR_ERROR"], text: "- GRAMMAR_ERROR explanation rule: explain the displayed wrong expression (errorExpression) as wrong and the original expression/correction as the fix. Do not say or imply that the original correct expression is the error. Start the explanation by quoting the displayed wrong expression with its (A)-style label (never a circled number — labels can be reordered server-side), then give the correction, for example: \"(D) 'requiring'은 이 절의 정동사 자리에 올 수 없으므로 'requires'로 고쳐야 합니다.\" Never write \"원문 표현\", \"원문은\", or any wording that reveals what the source originally said — the student only sees the displayed form." },
  { types: ["GRAMMAR_ERROR"], text: "- GRAMMAR_ERROR safety rule: assume the original passage is grammatically correct. If you think an original phrase might be improved, do not use that phrase as the error target. Prefer unambiguous mutations such as subject-verb agreement, because/because of mismatch, modal + base verb, parallel verb form, spend + money/time + -ing, or what/that replacement when the following clause has a clear gap." },
  { types: ["GRAMMAR_ERROR"], text: "- GRAMMAR_ERROR no-filler rule: do not use weak marked positions such as \"thicker\", \"more\", \"hard\", \"as a\", \"this\", discourse \"though,\", \"looks more like\", or \"seems to V\" as either answers or non-answer decoys. Do not explain \"looks more like + noun phrase\" as an adjective-complement issue, and do not explain \"seems to V\" as a complement-slot issue." },
  { types: ["GRAMMAR_ERROR"], text: "- Forbidden GRAMMAR_ERROR target: do not test active/passive infinitive preference such as \"to gain\" vs \"to be gained\", \"to lose\" vs \"to be lost\", or similar stylistic rewrites. These are too debatable for this item type." },
  { types: ["GRAMMAR_ERROR"], text: "- Forbidden GRAMMAR_ERROR source words: do not choose a marked error expression containing gain, gained, to gain, to be gained, lose, lost, to lose, or to be lost. Choose another grammar point." },
  { types: ["VOCAB_CHOICE", "CONTEXT_MEANING", "SYNONYM", "ANTONYM"], text: "- VOCAB_CHOICE, CONTEXT_MEANING, SYNONYM, and ANTONYM: keep all options in the same part of speech and semantic field. Avoid elementary synonym/antonym pairs; use context, register, metaphor, collocation, or stance as the deciding factor. The correct answer must be the most natural exam answer in the actual collocation, not merely the rarest or most advanced dictionary synonym. If a distractor could be argued as equally good, rewrite it." },
  { types: ["VOCAB_CHOICE"], text: "- VOCAB_CHOICE display contract: originalWord is the correct word that exists verbatim in the source passage. For exactly one label, replace that source word with substituteWord in the rendered passage; betterWord must equal originalWord, and correctAnswer must be that label. Never mark the original source word itself as inappropriate without changing it. For example, if the source says \"presence of cues\" and you want the error to be absence, use originalWord=\"presence\", substituteWord=\"absence\", betterWord=\"presence\"; never explain it as presence -> absence." },
  { types: ["SYNONYM"], text: "- SYNONYM uniqueness test: silently substitute every option into the original sentence. Exactly one option may preserve the sentence's meaning, tone, collocation, and argument structure. Do not use a wrong option that is also a normal dictionary synonym in that sentence, such as a metaphorically valid near-synonym. A good distractor should be semantically nearby but fail one specific contextual requirement, not merely be a less common synonym." },
  { types: ["ANTONYM"], text: "- ANTONYM contract: this is a \"wrong antonym pair\" item. The direction must ask for the pair whose antonym relation is NOT correct. If an ANTONYM target planning guardrail is provided, choose sourceWord/correctAntonym/suggestedWrongPair from that safe source-backed list instead of inventing your own pairs. Exactly one markedWords item must have isIncorrectPair=true and correctAntonym filled. The other four pairs must be defensibly clean antonyms in the passage's actual sense. Match part of speech and surface form: forces must pair with allows/releases, not restrain; -ing with -ing, -ed with -ed, -ly with -ly. Reject contestable or wrong-axis pairs such as force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, and paid-refunded." },
  { types: ["REFERENCE"], text: "- REFERENCE: include nearby grammatically plausible antecedents as distractors, then make the correct answer depend on number, role, and sentence meaning. Options must be Korean antecedent descriptions, and wrongOptionExplanations must refer to those Korean option texts before mentioning English source phrases." },
  { types: ["IRRELEVANT"], text: "- IRRELEVANT: choose four source sentences verbatim and keep them in their original passage order, then insert exactly one newly written irrelevant sentence between two consecutive originals. Do not replace, delete, paraphrase, merge, or split any source sentence. The original first passage sentence is context only: it must be shown before the marked choices without a marker and must never appear as a choice. DISTRIBUTE the four chosen source sentences across the whole passage body (early, middle, and late) so the marked choices are not bunched at the top — this matters most for long passages; a short passage may have adjacent choices. Apply the remove-and-reconnect test: deleting the inserted sentence must leave its two neighboring originals reading as one seamless flow, while deleting any of the four real sentences must instead damage the coherence (unique answer). Bias the answer to the middle (②/③/④, never the first or last marked sentence) and vary it across items rather than always answering ③. The inserted sentence must not be a random outside topic. It must reuse meaningful English content words from the source window, and a substantial share of its meaningful words should come from that window. Share the passage's semantic field and nearby keywords, but fail by discourse function such as scope shift, actor/purpose shift, cause/effect target shift, evidence/procedure focus shift, example-to-advice shift, or local conclusion mismatch. Make it a plausible skim-reading trap, not an obvious alien sentence. Prefer neutral explanatory prose; do not rely on awkward grammar, absolute/extreme words, blunt advice markers, explicit opposition cues such as however/instead, regulation-backlash claims, intellectual-property detours, academic-freedom detours, sponsor-relationship advice, or a simple direct contradiction of the thesis to make it removable." },
  { types: [], text: "" },
];

const CONTRACT_TYPE_FULL_TAIL = CONTRACT_TYPE_SEGMENTS.map(
  (segment) => segment.text,
).join("\n");

const CONTRACT_KNOWN_TYPE_IDS = new Set(
  CONTRACT_TYPE_SEGMENTS.flatMap((segment) => segment.types),
);

function buildContractTypeSectionBody(typeId: string): string {
  return CONTRACT_TYPE_SEGMENTS.filter(
    (segment) => segment.types.length === 0 || segment.types.includes(typeId),
  )
    .map((segment) => segment.text)
    .join("\n");
}

// 유형별 지시 묶음. 등록된 유형만 STANDARD 1차 프롬프트에서 무관한 유형 지시를
// 떨어내 토큰을 절감한다. 키가 없는 유형은 전체 tail 로 폴백한다.
// BLANK_INFERENCE 는 26-07-17 등록 — 미등록 상태에서 full tail(~28KB)을 통째로 받아
// 빈칸 생성 콜 입력의 절반 가까이가 무관 유형 지시였다(O166). 자기 세그먼트는 전부 보존.
const CONTRACT_TYPE_SECTIONS: Record<string, string> = {
  GRAMMAR_ERROR: buildContractTypeSectionBody("GRAMMAR_ERROR"),
  BLANK_INFERENCE: buildContractTypeSectionBody("BLANK_INFERENCE"),
};

export type StandardQuestionContractScope =
  | "production_legacy"
  | "force_type_scoped";

/**
 * 유형별 표시 계약 본문(요약문 (A)(B) 프레임, 문장삽입 givenSentence 규칙,
 * 순서 분할 계약 등)을 플랜과 무관하게 돌려준다. PREMIUM 경로는 역사적으로
 * 이 계약을 받지 않았고(O178: 구조 변형형 유형의 V1 필수필드 누락 전멸 원인),
 * env `PREMIUM_TYPE_CONTRACT_INJECTION=on` 실험 주입용으로 노출한다.
 * 미등록 유형은 빈 문자열.
 */
export function buildTypeContractSectionBody(typeId: string | undefined): string {
  if (!typeId || !CONTRACT_KNOWN_TYPE_IDS.has(typeId)) return "";
  return buildContractTypeSectionBody(typeId);
}

export function buildQuestionGenerationPromptContract(
  generationPlan: QuestionGenerationPlan,
  typeId?: string,
  options: { standardScope?: StandardQuestionContractScope } = {},
): string {
  if (generationPlan !== "STANDARD") return "";
  if (options.standardScope === "force_type_scoped") {
    if (!typeId || !CONTRACT_KNOWN_TYPE_IDS.has(typeId)) {
      throw new Error(
        `force_type_scoped requires a known contract typeId (received ${typeId ?? "none"})`,
      );
    }
    return `${CONTRACT_COMMON}\n${buildContractTypeSectionBody(typeId)}`;
  }
  const tail =
    typeId && CONTRACT_TYPE_SECTIONS[typeId] !== undefined
      ? CONTRACT_TYPE_SECTIONS[typeId]
      : CONTRACT_TYPE_FULL_TAIL;
  return `${CONTRACT_COMMON}\n${tail}`;
}

interface GeminiCompactGenerationPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  targetPoints?: string[];
  targetCandidateBlock?: string;
  typePrompt: string;
  typeQualityRubric?: string;
  count: number;
  difficulty: string;
  difficultyInstruction?: string;
  typeId?: string;
  /**
   * Research-only prompt surface switch. The default preserves production bytes.
   * A caller must explicitly opt in to type scoping and record the resulting prompt hash.
   */
  standardContractScope?: StandardQuestionContractScope;
  finalChecklist?: string;
  customPrompt?: string;
  /** 교사 지정 출제 포인트(포인트 짚어주기) — 지문 바로 다음 별도 블록으로 주입. */
  teacherPoints?: readonly TeacherPointPayload[];
}

interface GeminiCompactPlanningPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  count: number;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  customPrompt?: string;
  diffLabel: string;
}

const GEMINI_COMPACT_DIFFICULTY_RUBRIC: Record<string, string> = {
  BASIC: [
    "- BASIC: make the answer directly supported by a visible passage clue.",
    "- Distractors should be clearly wrong only after checking the passage, not random.",
  ].join("\n"),
  INTERMEDIATE: [
    "- INTERMEDIATE: require connecting at least two nearby clues, such as meaning plus logic or grammar plus context.",
    "- Distractors should borrow real passage language but distort relation, scope, or cause.",
  ].join("\n"),
  KILLER: [
    "- KILLER: require at least two reasoning steps from passage evidence to answer.",
    "- The correct answer must not be visible by length, style, rarity, or generic plausibility.",
    "- Distractors must be near-misses: true words or concepts from the passage with one subtle flaw.",
    "- For grammar items, test a defensible grammar rule, not a stylistic preference.",
  ].join("\n"),
};

const GEMINI_COMPACT_MARKING_RUBRIC = [
  "- Any underlinedPronoun, underlinedWord, underlinedExpression, originalExpression, markedExpressions, every VOCAB_CHOICE markedWords[].originalWord, and every GRAMMAR_CHOICE_COMBO slots[].correctExpression must exist verbatim in the original passage. For VOCAB_CHOICE, the single substituteWord is the intentionally displayed wrong word and does not need to exist in the source passage; likewise GRAMMAR_CHOICE_COMBO slots[].wrongExpression is the intentionally wrong candidate.",
  "- For GRAMMAR_CORRECTION, underlinedSegments must identify 1-5 wider original passage segments; every item must be isError=true, and each displayedText must hide errorPart inside a sentence/clause-level underline rather than underlining only errorPart.",
  "- Very short words such as it, is, in, as, or to may only be selected as standalone tokens, never as substrings.",
  "- surroundingText must be an exact source slice containing the selected expression and must follow the current type schema's stated length range. For GRAMMAR_ERROR, normally use 40-120 characters and preserve the full long-distance dependency (true subject to verb, antecedent to relative clause, semantic subject to participle, or first parallel item to target), even when that requires more than 80 characters. Do not apply this grammar exception to other types.",
  "- Do not generate full-passage display fields such as passageWithBlank, passageWithMarkers, passageWithUnderline, or passageWithNumbers. The server reconstructs them.",
].join("\n");

// ── S3i 경량 생성 계약 (26-07-21, O201 스펙 완전 이식 — O204 후속) ────────────
// 스탠다드 빈칸·어법의 생성 프롬프트를 실험이 검증한 경량 계약으로 교체한다.
// 근거: S3i 확정 수치(콘텐츠 F 0/46·38원·중앙 63s)는 이 경량 계약으로 측정된
// 것인데, 프로덕션 이식이 기존 대형 컴팩트 프롬프트를 유지한 채 검증층만 얹어
// 시간·원가가 2배로 부풀었다(실사용 실측 125~170s — O204). 필드 형상·값 규칙은
// strict 구조화 출력의 스키마 describe 가 전달하므로 프롬프트는 내용 규칙만
// 담는다. 결정형 게이트·검수리 콜이 위반을 잡는다(경량 계약의 안전망).
// 킬스위치: env STANDARD_LEAN_CONTRACT=off → 기존 컴팩트 프롬프트 복귀.

const LEAN_EXPLANATION_CONTRACT = `해설 품질 계약(위반 시 반려):
- 해설의 구조 분석(선행사·절 경계·수식 관계·품사 판정)은 실제 문장을 재파싱한 결과와 정확히 일치해야 합니다 — 틀린 근거로 맞는 결론을 내는 것도 결함입니다.
- 해설이 인용하는 영어 표현은 지문·선지·고친 형태에 실재하는 것만 씁니다(창작 표현 인용 금지).
- 두 표현의 관계를 서술할 때는 실제 그 문장에서 성립하는 짝인지 확인합니다.
- 한국어는 표준어만: 존재하지 않는 단어(오타·비어) 금지, 합니다체 통일.`;

const LEAN_BLANK_RULES = `절대 규칙(위반 시 반려):
1. originalExpression 은 지문에 축자로 존재해야 하며, 문장 전체를 삼키면 안 됩니다(구·절 단위 — 호스트 문장의 대부분을 차지하는 스팬 금지).
2. 빈칸 직후에 빈칸 내용에 문법적으로 의존하는 잔여 구문을 남기지 마십시오 — ", nor …", ", which …" 가 빈칸 바로 뒤에 오게 뚫는 것 금지.
3. 선지 5개 전부 빈칸 자리에 문법적으로 정확히 들어가야 합니다(품사·절/구 형태 통일).
4. 정답 선지는 원문 표현의 표면 어휘를 재사용하지 않는 추상적 패러프레이즈. 오답 4개는 서로 다른 함정 기제(극성 반전·과확장·과협소·인과 역전·절반-진실)로, 본문 소재를 재활용해 매력도를 높이십시오.
5. 표적은 논지 핵심 — 주변 단서만으로 즉답되지 않고 글 전체 논리 종합이 필요한 자리.`;

const LEAN_GRAMMAR_RULES = `절대 규칙(위반 시 반려):
1. 서로 다른 문장에서 스키마가 요구하는 개수의 밑줄 후보를 고르십시오. expression 은 전부 지문 축자이고, 정답 자리에만 errorExpression(어법상 틀린 오형)을 심습니다 — 오형은 실존하는 영어 어형만.
2. 변형 포인트는 구조 판단형(정동사/준동사·관계사·분사 태·병렬·도치) — 인접 수일치·품사 표면 치환 같은 뻔한 포인트 회피.
3. 오답 밑줄도 각각 판단 근거가 뚜렷한 어법 자리(장식 필러 금지). 정답과 같은 pointCode 를 오답에 반복하지 마십시오.
4. 해설의 구조 분석은 실제 문장 구조와 정확히 일치해야 합니다(선행사·절 경계·수식 관계 오귀속 금지).`;

export interface StandardLeanGenerationPromptInput {
  typeId: "BLANK_INFERENCE" | "GRAMMAR_ERROR";
  passageContent: string;
  difficulty: string;
  /** typeSettings 프롬프트·다양성 회피 블록 등 호출자가 합성한 부가 블록(없으면 ""). */
  extraBlocks?: string;
  teacherPoints?: readonly TeacherPointPayload[];
}

export function buildStandardLeanGenerationPrompt({
  typeId,
  passageContent,
  difficulty,
  extraBlocks,
  teacherPoints = [],
}: StandardLeanGenerationPromptInput): string {
  const kind = typeId === "BLANK_INFERENCE" ? "'빈칸 추론'" : "'어법(밑줄 중 틀린 것)'";
  const rules = typeId === "BLANK_INFERENCE" ? LEAN_BLANK_RULES : LEAN_GRAMMAR_RULES;
  const difficultyRubric =
    GEMINI_COMPACT_DIFFICULTY_RUBRIC[difficulty] ??
    GEMINI_COMPACT_DIFFICULTY_RUBRIC.INTERMEDIATE;
  const teacherPointsBlock = buildTeacherPointsPromptBlock(teacherPoints);
  return [
    `당신은 수능 영어 킬러 문항 출제 전문가입니다. 아래 지문으로 ${kind} ${difficulty} 문항 1개를 완제품으로 만드십시오. 각 필드의 작성 규칙은 출력 스키마의 필드 설명을 정확히 따르고, 지문 전체 복사 필드(passageWithBlank·passageWithMarkers 등)는 출력하지 마십시오(서버가 재조립).`,
    rules,
    LEAN_EXPLANATION_CONTRACT,
    `난이도 기준:\n${difficultyRubric}`,
    `## 지문\n${passageContent}`,
    teacherPointsBlock,
    extraBlocks?.trim() ? extraBlocks.trim() : "",
    `정확히 1문항. JSON 만 출력하십시오.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGeminiCompactPlanningPrompt({
  schoolType = "",
  gradeInfo = "",
  count,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  customPrompt,
  diffLabel,
}: GeminiCompactPlanningPromptInput): string {
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "None. Plan from the original passage and teacher annotations only.";

  return `You are a Korean English exam item planning expert for ${schoolType} ${gradeInfo}.

Read the passage and plan exactly ${count} exam questions.

## Passage
${passageContent}
${teacherIntentBlock?.trim() ? `\n\n## Teacher annotations\n${teacherIntentBlock}` : ""}

## Saved passage analysis
${analysisBlock}

## Available question types
Multiple choice: BLANK_INFERENCE, GRAMMAR_ERROR, GRAMMAR_CHOICE_COMBO, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC, MAIN_IDEA, TOPIC_MAIN_IDEA, TITLE, IMPLIED_MEANING, REFERENCE, CONTENT_MATCH, SUMMARY_COMPLETE_MC, IRRELEVANT
Constructed response: CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY, SUMMARY_COMPLETE, SUMMARY_WRITING, WORD_ORDER, TOPIC_SENTENCE_WRITING, GRAMMAR_CORRECTION
Vocabulary: CONTEXT_MEANING, SYNONYM, ANTONYM

## Planning rules
- Return a balanced plan with concrete targetPoints from the passage.
- Do not assign more than 3 questions to the same type unless the teacher specifically asks.
- Every targetPoint must cite a word, phrase, sentence, relation, or grammar feature actually present in the passage.
- Difficulty is ${diffLabel}.
${GEMINI_COMPACT_DIFFICULTY_RUBRIC[diffLabel] ?? GEMINI_COMPACT_DIFFICULTY_RUBRIC.INTERMEDIATE}
${customPrompt?.trim() ? `\n## Teacher instructions\n${customPrompt}` : ""}

Return the planning JSON only.`;
}

export function buildGeminiCompactGenerationPrompt({
  schoolType = "",
  gradeInfo = "",
  passageContent,
  teacherIntentBlock,
  analysisContext,
  targetPoints = [],
  targetCandidateBlock,
  typePrompt,
  typeQualityRubric,
  count,
  difficulty,
  difficultyInstruction,
  typeId,
  standardContractScope = "production_legacy",
  finalChecklist,
  customPrompt,
  teacherPoints = [],
}: GeminiCompactGenerationPromptInput): string {
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "None. Generate directly from the original passage.";
  const targetPointBlock = targetPoints.length
    ? `\n\n## Required target points\n${targetPoints.map((point) => `- ${point}`).join("\n")}`
    : "";
  // 교사 지정 포인트: 지문 바로 다음·유형 프롬프트 앞. 빈 배열이면 "" — 기존 바이트 동일.
  const teacherPointsBlock = buildTeacherPointsPromptBlock(teacherPoints);
  const teacherPointsSection = teacherPointsBlock ? `\n${teacherPointsBlock}` : "";

  return `You are a Korean high-school English exam item writer for ${schoolType} ${gradeInfo}.

## Passage
${passageContent}
${teacherPointsSection}${targetCandidateBlock?.trim() ? `\n${targetCandidateBlock}` : ""}
${teacherIntentBlock?.trim() ? `\n\n## Teacher annotations\n${teacherIntentBlock}` : ""}

## Saved passage analysis
${analysisBlock}
${targetPointBlock}

## Question type instructions
${typePrompt}
${typeQualityRubric?.trim() ? `\n${typeQualityRubric}` : ""}

## Output schema requirements
- Return JSON matching the provided schema exactly.
- Use exactly the field names required by the schema.
- Write direction, explanation, keyPoints, wrongOptionExplanations, and tags in Korean.
- correctAnswer must be the option label for multiple-choice items, or the exact answer text for constructed-response items.
- Do not include full-passage display fields. The server reconstructs them.

## Generation requirements
- Generate exactly ${count} question(s).
- Difficulty: ${difficulty}${difficultyInstruction ? ` (${difficultyInstruction})` : ""}
${GEMINI_COMPACT_DIFFICULTY_RUBRIC[difficulty] ?? GEMINI_COMPACT_DIFFICULTY_RUBRIC.INTERMEDIATE}
${GEMINI_COMPACT_MARKING_RUBRIC}
${buildQuestionGenerationPromptContract("STANDARD", typeId, { standardScope: standardContractScope })}
${customPrompt?.trim() ? `\n## Teacher instructions\n${customPrompt}` : ""}
- difficulty field must be exactly "${difficulty}".
- Multiple-choice items must have exactly the requested number of options in {label, text} form. Most types use 5 options; IRRELEVANT may use the passage-length-based slot count, and multi-answer GRAMMAR_ERROR settings may use 5~10 options.
- explanation: Korean, 3-5 concise evidence-based sentences.
- keyPoints: exactly 3 Korean learning points.
- wrongOptionExplanations is required for every multiple-choice item: exactly one entry for each wrong option. Multi-answer items have fewer wrong options. If the schema is an array, each entry must be {label, explanation}.
- tags: Korean grammar/vocabulary/question-type tags.${finalChecklist?.trim() ? `\n\n${finalChecklist}` : ""}

Generate exactly ${count} question(s).`;
}
