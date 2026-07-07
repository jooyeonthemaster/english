import { resolveQuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import type { QuestionQualityIssue } from "@/lib/question-quality";
import { SALVAGE_RELAXABLE_CODES } from "./run-question-generation-constants";
import type { QuestionGenerationRejectionIssue, QuestionGenerationRejectionSummary, RejectedQuestionCandidate, RejectionPhase, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeCustomPromptWithTypeSettings(
  customPrompt: string | undefined,
  typeSettingsPrompt: string,
): string | undefined {
  const parts = [customPrompt?.trim(), typeSettingsPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

export function formatIssuesForLog(issues: unknown): string {
  try {
    return JSON.stringify(issues);
  } catch {
    return String(issues);
  }
}

export function recordRejection(
  recorder: RejectionRecorder | undefined,
  issue: QuestionGenerationRejectionIssue,
) {
  if (!recorder) return;
  recorder.issues.push({
    ...issue,
    message: issue.message.slice(0, 800),
  });
}

export function summarizeQualityIssues(issues: QuestionQualityIssue[]): string {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ")
    .slice(0, 800);
}

// ── never-fail 구제 사다리(26-07-06 유저 결정: "생성 실패"는 최악의 결과) ──────
// quality 단계에서 탈락한 "구조 완성" 후보를 보존해 두었다가, 모든 재시도가
// 소진되면 craft(완성도) 결함만 있는 최선 후보를 경고 부착으로 재승인한다.

const REJECTION_POOL_CAP = 12;

export function recordRejectedCandidate(
  recorder: RejectionRecorder | undefined,
  candidate: RejectedQuestionCandidate,
) {
  if (!recorder) return;
  if (!recorder.pool) recorder.pool = [];
  if (recorder.pool.length >= REJECTION_POOL_CAP) return;
  recorder.pool.push(candidate);
}

function candidateDedupeKey(question: Record<string, unknown>): string {
  const pick = (value: unknown): string =>
    typeof value === "string" ? value.slice(0, 120) : JSON.stringify(value)?.slice(0, 120) ?? "";
  return [
    pick(question.correctAnswer),
    pick(question.questionText ?? question.direction),
    pick(question.options),
    pick(question.modelAnswer),
  ].join("|");
}

// craft 코드 → 검수자용 한국어 사유 요약. 코드명이 아니라 사람이 읽는 문장으로.
const SALVAGE_NOTICE_CATEGORIES: Array<{
  test: (code: string) => boolean;
  label: string;
}> = [
  { test: (c) => /verbatim|not-transformed|source-copy|source-exact/.test(c), label: "본문 표현이 크게 변형되지 않았을 수 있음" },
  { test: (c) => /killer|too-easy|thin|difficulty|basic/.test(c), label: "요청 난이도 대비 깊이가 얕을 수 있음" },
  { test: (c) => /decoy|filler|giveaway|distractor|trap|imbalance|awkward/.test(c), label: "오답 선지(함정) 완성도가 낮을 수 있음" },
  { test: (c) => /explanation|mislabel|terminology|keypoint|shorthand|surface-order/.test(c), label: "해설 표현이 다듬어지지 않았을 수 있음" },
  { test: (c) => /obvious|shallow|local|adjacent/.test(c), label: "일부 포인트가 평이할 수 있음" },
  { test: (c) => /underline|marker|dense/.test(c), label: "밑줄·표기 배치가 표준과 다를 수 있음" },
  { test: (c) => /language|direction-frame|collocation/.test(c), label: "형식·표현 스펙과 일부 다를 수 있음" },
];

export function buildSalvageNotice(codes: string[]): string {
  // salvage LLM 패스가 강등 경고 없이 깨끗하게 통과한 경우 — 완성도 경고를
  // 날조하지 않고 "재시도 끝에 생성"만 알린다.
  if (codes.length === 0) {
    return "여러 번 재시도한 끝에 생성된 문항입니다. 검수 후 사용을 권장합니다.";
  }
  const labels: string[] = [];
  for (const category of SALVAGE_NOTICE_CATEGORIES) {
    if (labels.includes(category.label)) continue;
    if (codes.some((code) => category.test(code))) labels.push(category.label);
  }
  const detail = labels.length > 0 ? labels.join(" · ") : "일부 완성도 기준 미충족";
  return `여러 번 재생성해도 모든 품질 기준을 충족하는 문항이 나오지 않아, 완성도 경고가 있는 최선 문항을 제공합니다 — ${detail}. 검수 후 사용을 권장하며, 다시 생성하면 더 나은 문항이 나올 수 있습니다.`;
}

/**
 * 거절 후보 풀에서 "craft 결함만 있는" 최선 후보를 최대 needed 개 재승인한다.
 * F급 코드(SALVAGE_RELAXABLE 밖)가 하나라도 있으면 후보는 영구 탈락 — 틀린 문항은
 * notice 로도 출하하지 않는다. 결함 수 오름차순, 동수면 늦은 시도(교정 피드백이
 * 더 반영된 쪽) 우선.
 */
export function admitSalvageCandidatesFromPool(
  recorder: RejectionRecorder | undefined,
  { needed }: { needed: number },
): Record<string, unknown>[] {
  const pool = recorder?.pool ?? [];
  const eligible = pool.filter(
    (candidate) =>
      candidate.blockingCodes.length > 0 &&
      candidate.blockingCodes.every((code) => SALVAGE_RELAXABLE_CODES.has(code)),
  );
  const ranked = [...eligible].sort(
    (a, b) =>
      a.blockingCodes.length - b.blockingCodes.length ||
      b.attemptIndex - a.attemptIndex,
  );
  const admitted: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const candidate of ranked) {
    if (admitted.length >= Math.max(1, needed)) break;
    const key = candidateDedupeKey(candidate.question);
    if (seen.has(key)) continue;
    seen.add(key);
    const question = candidate.question;
    const demoted = candidate.blockingIssues.map((issue) => ({
      ...issue,
      severity: "warning" as const,
    }));
    question._qualityWarnings = [...candidate.warnings, ...demoted];
    question._qualityMode = "relaxed";
    question._reviewRecommended = true;
    question._generationNotice = buildSalvageNotice(candidate.blockingCodes);
    admitted.push(question);
  }
  return admitted;
}

export function buildRejectionSample(
  subType: string,
  question: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (subType === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            expression: item.expression,
            isError: item.isError,
            errorExpression: item.errorExpression,
            correction: item.correction,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      markedCount: markedExpressions.length,
      renderedMarkerCount: (passageWithMarkers.match(/__[^_]+__/g) ?? []).length,
      markedExpressions,
      correctAnswer: question.correctAnswer,
      correctAnswers: question.correctAnswers,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType === "GRAMMAR_CHOICE_COMBO") {
    const slots = Array.isArray(question.slots)
      ? question.slots
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            correctExpression: item.correctExpression,
            wrongExpression: item.wrongExpression,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      slotCount: slots.length,
      renderedSlotCount: (passageWithMarkers.match(/\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g) ?? []).length,
      slots,
      correctAnswer: question.correctAnswer,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType !== "IRRELEVANT") return undefined;
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const insertedSentence =
    Number.isInteger(irrelevantIndex) && irrelevantIndex >= 0
      ? sentences[irrelevantIndex]
      : undefined;

  return {
    sentenceCount: sentences.length,
    irrelevantIndex: Number.isInteger(irrelevantIndex) ? irrelevantIndex : null,
    correctAnswer: question.correctAnswer,
    insertedSentence: insertedSentence?.slice(0, 180),
    firstSentence: sentences[0]?.slice(0, 180),
    lastSentence: sentences[sentences.length - 1]?.slice(0, 180),
  };
}

export function buildRejectionSummary(
  recorder: RejectionRecorder,
): QuestionGenerationRejectionSummary {
  const phaseCounts: Record<RejectionPhase, number> = {
    model: 0,
    postprocess: 0,
    quality: 0,
  };
  const codeCounts = new Map<string, number>();

  for (const issue of recorder.issues) {
    phaseCounts[issue.phase] += 1;
    for (const code of issue.codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
  const lastIssue = recorder.issues.at(-1);
  const topCodeText = topCodes
    .map(({ code, count }) => `${code} x${count}`)
    .join(", ");
  const message = [
    `Rejected candidates: ${recorder.issues.length}`,
    topCodeText ? `Top codes: ${topCodeText}` : "",
    lastIssue ? `Last: ${lastIssue.phase}/${lastIssue.subType} - ${lastIssue.message}` : "",
  ].filter(Boolean).join(" | ");

  return {
    total: recorder.issues.length,
    phaseCounts,
    topCodes,
    lastIssue,
    message,
  };
}

function correctiveActionForCode(code: string): string | null {
  switch (code) {
    case "duplicate-option-text":
      return "Every marked expression must be a unique visible option. Do not underline the same word or phrase twice; choose five different grammar decision points.";
    case "grammar-render-marker-count":
      return "The rendered passage must show every requested marker exactly once. Ensure each markedExpressions.expression occurs in the passage and is copied exactly.";
    case "grammar-error-not-mutated":
      return "At least one answer must visibly mutate the original source expression. For the answer, keep expression/correction as the original source and put the wrong student-visible form in errorExpression.";
    case "grammar-source-expression-not-backed":
    case "grammar-correction-not-source-backed":
      return "Copy expression and correction verbatim from the original passage. Do not invent a source form or correct to a phrase that is absent from the passage.";
    case "mid-word-marker":
      return "Do not insert a marker inside a word or punctuation run. Wrap only the exact standalone expression and verify the rendered marker count.";
    case "grammar-decoy-point-monotony":
      return "Do not pad the item with repeated pointCodes. Use at most two marks from the same grammar frame and spread decoys across different frames.";
    case "grammar-obvious-adjacent-sv-agreement":
      return "Do not use a directly adjacent subject-verb -s flip as the answer. If testing agreement, insert an attractor phrase, relative clause, or long subject between head noun and verb.";
    case "grammar-obvious-modal-gerund":
    case "grammar-obvious-modal-to-infinitive":
      return "For GRAMMAR_ERROR, do not create visibly broken modal/auxiliary surfaces such as 'can paying' or 'can to pay'; choose a subtler clause/complement trap.";
    case "grammar-obvious-intransitive-passive":
      return "Do not passivize intransitive verbs such as appear, happen, occur, belong, consist, remain, or seem.";
    case "grammar-obvious-endure-passive-object":
      return "Do not create transparent passive-with-object errors such as 'has been endured temperatures'; choose a less obvious active/passive target.";
    case "grammar-gibberish-inversion-fragment":
      return "Do not create fake inversion/subjunctive fragments such as 'had some church endured'; wrong forms must be plausible exam grammar, not gibberish.";
    case "grammar-obvious-finite-to-ing-colon":
      return "Do not turn an essential finite predicate before a colon into an -ing participle; choose a subtler finite/nonfinite target.";
    case "grammar-obvious-local-pronoun-agreement":
      return "Do not create locally visible pronoun-auxiliary clashes such as 'it are' or 'they is'; pronoun-reference answers must remain locally plausible and require antecedent tracking.";
    case "grammar-obvious-object-pronoun-subject":
      return "Do not put object-case pronouns in finite subject position, such as 'them pushes'. If testing pronoun reference, keep the displayed pronoun locally grammatical and make students track the antecedent.";
    case "grammar-obvious-before-after-to-infinitive":
      return "Do not mutate before/after + V-ing into before/after + to-V. Choose a nonfinite/complement trap that is locally plausible and context-dependent.";
    case "grammar-obvious-seem-to-gerund":
      return "Do not mutate 'seems to V' into 'seems V-ing'; it is too visibly broken for exam-quality grammar.";
    case "grammar-shallow-local-participle-parallel":
      return "Avoid same-clause participle parallel swaps such as 'were blown and solidified' -> 'were blown and solidifying'; choose a deeper structural target.";
    case "grammar-obvious-connector-to-what":
      return "Do not mutate connectors such as even if/although/while/because into 'what'; use a genuine clause-structure trap.";
    case "grammar-obvious-despite-being-to-be":
      return "Do not mutate 'despite it being' into 'despite it to be'; it is too visibly broken.";
    case "grammar-shallow-despite-although-gerund":
      return "Do not use despite -> although before 'it being' as the answer; choose a less overdrilled, source-backed structural target.";
    case "grammar-shallow-participle-adjective-answer":
      return "For INTERMEDIATE/KILLER grammar, do not use a shallow participle-adjective swap before a noun, such as 'neglected populations' -> 'neglecting populations'.";
    case "grammar-appear-adverb-mislabel":
    case "grammar-appear-pointcode-voice-mismatch":
      return "Do not call 'appear' an adverb or tag it as passive voice; in 'as it might appear' it is a linking/intransitive verb.";
    case "grammar-nonstandard-terminology":
      return "Use only standard school grammar terms; do not invent or mistype terms such as '전사구'.";
    case "grammar-obvious-living-finite":
    case "grammar-obvious-living-lived":
      return "Do not turn a reduced postmodifier like 'people living in ...' into a finite live/lives/lived form.";
    case "grammar-obvious-what-noun-prefix":
    case "grammar-obvious-noun-what-relative":
      return "Do not prepend 'what' to a complete noun phrase or complete clause; use what/that only when the following clause structure actually supports it.";
    case "grammar-debatable-attention-to-gerund":
      return "Avoid to-V -> V-ing mutations near 'attention to ...' because 'attention to finding' can be grammatical; choose an airtight structural target.";
    case "grammar-debatable-more-most-like":
      return "Avoid 'looks more like' -> 'looks most like'; it is a debatable lexical/degree choice, not a clean grammar error.";
    case "grammar-lexical-look-like-answer":
      return "Do not use 'look(s) more like' -> 'look(s) more likely/most like' as a grammar error; skip that passage phrase entirely.";
    case "grammar-semantic-how-why-answer":
      return "Do not use how/why near 'the way ...' as a grammar-error answer; it is semantic/collocational rather than a clean grammar violation.";
    case "grammar-debatable-sink-passive":
      return "Avoid sinking -> sunk/passive as the answer; 'sink' has transitive/passive uses and can make the grammar judgment debatable.";
    case "grammar-shallow-because-despite-clause":
      return "Avoid because -> despite before a finite clause; it is an overdrilled local preposition/conjunction swap.";
    case "grammar-killer-answer-point-repeated":
      return "For KILLER grammar, do not repeat the answer's grammar pointCode in decoys; make each non-answer underline use a different grammar frame.";
    case "grammar-killer-generic-answer-point":
      return "For KILLER grammar, do not tag the answer as generic a or lexical/comparison m. Choose a precise structural frame such as d, c, b, e, g, h, i, k, or l.";
    case "grammar-explanation-self-contradictory":
      return "Rewrite the explanation as a clean final rationale only; never include self-review, backtracking, or scratchpad language.";
    case "grammar-weak-filler-decoys":
      return "Replace weak filler underlines with meaningful grammar decisions that could attract a strong student. Do not use decorative surfaces such as it, that way, As one, does, it's, looks/looks more like, former/latter, uneven, one/ones, or bare comparative words as decoys.";
    case "grammar-marker-too-dense":
      return "Space grammar markers apart: no back-to-back labels, no labels within fewer than two source words, and prefer one marker per sentence or clearly separated clauses.";
    case "grammar-killer-thin-answer":
    case "killer-answer-not-structurally-loaded":
      return "For KILLER, the answer must require long-distance structure, semantic subject, reduced clause, complement pattern, or modifier-scope reasoning. Move the answer to the passage's most structurally layered sentence (relative clause + inserted phrase + parallel range), and make the answer's surroundingText contain the FULL dependency span (true subject head to verb / antecedent to relative clause / semantic subject to participle) — a short local snippet around the underline is judged thin.";
    case "grammar-killer-thin-concessive-as":
      return "For KILLER grammar, do not use a single concessive as/though -> how idiom as the answer; choose a deeper cross-clause or long-distance structural dependency.";
    case "grammar-killer-thin-connector":
      return "For KILLER grammar, do not use a single connector/preposition swap such as because -> because of as the answer; choose a deeper cross-clause or long-distance dependency.";
    case "grammar-debatable-it-being-decoy":
      return "Do not use 'it being' after a preposition as a correct decoy; it can invite a formal 'its being' dispute.";
    case "grammar-explanation-typo":
      return "Spellcheck every explanation and wrong-option rationale; fix typos such as 'dsepite' before returning the item.";
    case "grammar-noun-clause-pronoun-mislabel":
      return "Do not call a plain pronoun-reference or independent-clause check a noun-clause issue; use the exact grammar category of the marked structure.";
    case "grammar-phrasal-verb-mislabel":
      return "Do not call passive participles or parallel participle phrases phrasal verbs; reserve 'phrasal verb' for verb + particle/preposition combinations.";
    case "grammar-vague-metadata-tag":
      return "Use only precise grammar-frame tags that correspond to marked options; remove vague tags such as noun-flow analysis.";
    case "grammar-look-like-complement-mislabel":
      return "Do not explain 'look(s) more like + noun phrase' as an adjective-complement test; it is a comparative/prepositional pattern.";
    case "grammar-seem-to-complement-mislabel":
      return "Do not explain 'seem(s) to V' as an adjective-complement or copular-complement test; analyze it as seem + to-infinitive clause, or choose a different decoy.";
    case "grammar-seem-to-object-mislabel":
      return "Do not call the to-infinitive after seem an object; seem is intransitive/copular and the to-infinitive is a complement clause.";
    case "grammar-that-way-adverb-mislabel":
      return "Do not call 'that' in 'that way' a demonstrative adverb; it is a demonstrative determiner modifying the noun way.";
    case "grammar-human-made-postmodifier-mislabel":
      return "Do not call human-made a post-nominal participle; in phrases like 'human-made substances' it is a pre-nominal compound adjective.";
    case "grammar-basic-overloaded-design":
      return "For BASIC grammar, do not pile up advanced frames in keyPoints or decoys; keep the answer one-step and the decoys clean, familiar, and accurately explained.";
    case "grammar-too-basic-decoys":
      return "For INTERMEDIATE/KILLER grammar, replace pronoun/do-support filler decoys such as those/one/does with structurally meaningful distractors.";
    case "grammar-shallow-checklist-decoys":
      return "Replace shallow checklist decoys such as this/as a/it/that way/does/As one/looks more like/seems to V with structurally tempting grammar targets from different clauses.";
    case "grammar-shallow-depends-decoy":
      return "Do not use a simple 'depends on' subject-verb match as a decoy; replace it with a structurally meaningful target.";
    case "grammar-shallow-nearby-passive-decoy":
      return "Do not use nearby pronoun + be p.p. phrases such as 'they were blown' as passive-voice decoys; choose a more structurally loaded target.";
    case "grammar-shallow-than-decoy":
      return "Do not use standalone comparative 'than' as a correct decoy; replace it with a structurally meaningful comparative, clause, complement, or modifier-scope target.";
    case "grammar-explanation-too-long-hard":
      return "Shorten the main grammar explanation to the answer's decisive structure only; put non-answer rationales in wrongOptionExplanations.";
    case "grammar-agreement-explanation-too-thin":
      return "For long-distance subject-verb agreement, explicitly name the intervening modifier/relative phrase and the true subject head in the main explanation.";
    case "grammar-keypoint-untested-token":
      return "Do not mention a connector or grammar token in keyPoints unless one marked option actually tests that token.";
    case "grammar-mixed-as-it-span":
      return "Do not underline 'as it' as one target; choose either the connector 'as' or the pronoun 'it' only if that exact item is being tested.";
    case "grammar-underline-punctuated-fragment":
      return "Do not underline punctuation-bearing sentence fragments such as 'asking: for some scientists it is'; move the marker to the exact grammar token.";
    case "grammar-error-explanation-surface-order":
      return "In explanations, mention the student-visible wrong surface first, then the correct source form.";
    case "grammar-surrounding-missing-marker":
      return "Ensure every marker's surroundingText contains the exact marked expression and points to the same source location.";
    // ── 빈칸(BLANK_INFERENCE) 교정 액션 ──────────────────────────────────
    case "blank-missing-answer":
      return "정답 선지가 비어 있습니다. correctAnswer 라벨과 정확히 일치하는 options 항목에 빈칸에 들어갈 영어 표현(text)을 채우고, 라벨-정답 대응을 제출 전에 다시 확인하세요.";
    case "blank-paraphrase-answer-not-transformed":
      return "PARAPHRASE 모드인데 정답 선지가 originalExpression 을 그대로 복사했습니다. originalExpression 은 원문 그대로 두되, 정답 선지는 같은 의미·같은 문법 슬롯의 추상적 재진술(내용어 표면을 바꾼 패러프레이즈)로 다시 작성하세요.";
    case "blank-paraphrase-answer-too-verbatim":
      return "정답 선지가 원문 스팬의 내용어를 거의 그대로 재사용해 표면 매칭만으로 풀립니다. 핵심 내용어를 동의어·상위 개념으로 치환한 더 추상적인 재진술로 바꾸되, 의미·극성·문법 슬롯은 그대로 보존하세요.";
    case "blank-paraphrase-missing-answer-logic":
      return "answerLogic 이 비었거나 너무 짧습니다. 정답이 원문 스팬을 어떤 논리로 재진술했는지(무엇을 어떻게 바꿨고 왜 의미가 보존되는지)를 한국어 1~2문장으로 answerLogic 에 기록하세요.";
    case "blank-paraphrase-option-source-copy":
      return "오답 선지가 지문 구절을 그대로 복사해 정답과 문체가 갈립니다. 오답도 정답과 같은 수준으로 패러프레이즈하되, 본문 개념을 빌리면서 논리(극성·범위·인과)를 비틀어 틀리게 만드세요.";
    case "blank-target-list-like":
      return "빈칸 타깃(originalExpression)이 나열/구두점 구간이라 거부되었습니다. 쉼표 2개 이상·콜론·세미콜론·'A, B, and C' 나열·문장 경계를 포함하지 않는, 한 문장 안에서 깔끔하게 떨어지는 논리 구/술부를 다시 고르세요.";
    case "blank-awkward-correct-option":
      return "정답 선지가 수능식 자연스러운 영어가 아닙니다. 어색한 콜로케이션과 과장된 라틴계 어휘를 버리고, 실제 기출 선지처럼 읽히는 자연스러운 학술 영어 표현으로 정답을 다시 쓰세요.";
    case "blank-killer-target-too-easy":
      return "KILLER 인데 빈칸 타깃이 지엽적·상호수식 잡동사니(both parties review each other 류)입니다. 글의 핵심 논지(주제문·결론·인과의 귀결)가 담긴 문장에서 간결한 핵심 술부를 빈칸으로 다시 고르고, 서로 다른 근거 2문장을 연결해야만 정답이 나오게 만드세요.";
    case "multi-blank-answer-visible":
      return "빈칸으로 만든 표현이 지문 다른 곳에 그대로 남아 정답이 노출됩니다. 지문 전체에서 정확히 1회만 등장하는 표현을 각 빈칸 타깃(blanks[].originalExpression)으로 다시 고르세요.";
    case "blank-answer-residual-visible":
      return "정답(또는 정답과 동일한 표면 표현)이 빈칸 처리 후에도 지문에 그대로 남아 있어 베껴 풀립니다. 지문에 정확히 1회만 등장하는 스팬을 타깃으로 고르거나, 남은 출현이 정답을 누설하지 않는 다른 자리로 빈칸을 옮기세요.";
    default:
      return null;
  }
}

function shortRetrySurface(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function rejectedGrammarSurfaceLine(issue: QuestionGenerationRejectionIssue): string | null {
  if (issue.subType !== "GRAMMAR_ERROR") return null;
  const markedExpressions = Array.isArray(issue.sample?.markedExpressions)
    ? issue.sample.markedExpressions.filter(isRecord)
    : [];
  if (markedExpressions.length === 0) return null;
  const surfaces = markedExpressions
    .map((item) => {
      const label = shortRetrySurface(item.label) || "?";
      const expression = shortRetrySurface(item.expression);
      const errorExpression = shortRetrySurface(item.errorExpression);
      if (!expression) return "";
      return errorExpression && errorExpression !== expression
        ? `${label}:${expression}->${errorExpression}`
        : `${label}:${expression}`;
    })
    .filter(Boolean)
    .slice(0, 6);
  if (surfaces.length === 0) return null;
  return `- Rejected sample surfaces to abandon: ${surfaces.join("; ")}. Choose fresh, source-backed grammar targets instead of reusing these weak or broken surfaces.`;
}

/**
 * 직전 시도에서 새로 기록된 거절 사유를 다음 프롬프트에 주입할 짧은 한국어
 * 교정 지시 블록으로 만든다. 같은 실수를 반복하는 "맹목 재시도"를 구체적 사유를
 * 본 "교정 재생성"으로 바꿔 수율을 올리고 재시도 횟수를 줄인다.
 */
function retrySurfaceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rejectedGrammarSurfaceSummaryLine(
  issues: QuestionGenerationRejectionIssue[],
): string | null {
  const seen = new Set<string>();
  const surfaces: string[] = [];
  for (const issue of issues) {
    if (issue.subType !== "GRAMMAR_ERROR") continue;
    const markedExpressions = Array.isArray(issue.sample?.markedExpressions)
      ? issue.sample.markedExpressions.filter(isRecord)
      : [];
    for (const item of markedExpressions) {
      const expression = shortRetrySurface(item.expression);
      if (!expression) continue;
      const errorExpression = shortRetrySurface(item.errorExpression);
      const correction = shortRetrySurface(item.correction);
      const label = shortRetrySurface(item.label);
      const pointCode = shortRetrySurface(item.pointCode);
      const isError = item.isError === true;
      const mutation =
        errorExpression && errorExpression !== expression
          ? `${expression}->${errorExpression}`
          : correction && correction !== expression
            ? `${expression}->${correction}`
            : expression;
      const summary = [
        label ? `${label}:` : "",
        mutation,
        pointCode ? `(${pointCode})` : "",
        isError ? "[answer]" : "",
      ].filter(Boolean).join("");
      const key = retrySurfaceKey(summary);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      surfaces.push(summary);
      if (surfaces.length >= 14) break;
    }
    if (surfaces.length >= 14) break;
  }
  if (surfaces.length === 0) return null;
  return `- Hard-ban failed GRAMMAR_ERROR surfaces from all previous attempts: ${surfaces.join("; ")}. Do not reuse these expressions, labels, or mutation patterns; choose a new source-backed frame.`;
}

export function buildCorrectiveRetryFeedback(
  issues: QuestionGenerationRejectionIssue[],
  options: { cumulativeIssues?: QuestionGenerationRejectionIssue[] } = {},
): string | undefined {
  if (issues.length === 0) return undefined;
  const seen = new Set<string>();
  const lines: string[] = [];
  const grammarSurfaceSummary = rejectedGrammarSurfaceSummaryLine(
    options.cumulativeIssues?.length ? options.cumulativeIssues : issues,
  );
  if (grammarSurfaceSummary) lines.push(grammarSurfaceSummary);
  for (const issue of issues) {
    const key =
      issue.codes && issue.codes.length > 0
        ? issue.codes.join(",")
        : issue.message;
    if (seen.has(key)) continue;
    seen.add(key);
    const codeText = issue.codes?.length ? `[${issue.codes.join(", ")}] ` : "";
    // 따옴표 안 내용(정답·표현 파생 텍스트)은 다음 프롬프트로의 누설 경로가 될 수
    // 있어 …로 가린다. 게이트 이름·구조적 사유는 보존돼 교정 신호로는 충분하다.
    const detail = issue.message
      .replace(/[“”"][^“”"]*[“”"]|'[^']*'/g, "…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (detail) lines.push(`- ${codeText}${detail}`);
    const sampleLine = rejectedGrammarSurfaceLine(issue);
    if (sampleLine) lines.push(sampleLine);
    for (const code of issue.codes ?? []) {
      const action = correctiveActionForCode(code);
      if (action) lines.push(`- Fix: ${action}`);
    }
    if (lines.length >= 14) break;
  }
  if (lines.length === 0) return undefined;
  return [
    "## Corrective retry feedback from the previous failed generation",
    "## 직전 생성 실패 — 아래 사유를 반드시 교정해서 다시 출제",
    ...lines,
    "Regenerate a fresh item that fixes every listed defect. Preserve the requested type, answer count, marker count, and source-grounded corrections. Do not repeat the same failed surface pattern.",
    "위와 동일한 실수를 반복하지 마세요. 형식·정답 개수·밑줄/표현의 원문 일치·오답 선지의 매력도(지문 어휘에 기반한 그럴듯한 near-miss, 정답과 길이·문체가 비슷할 것)를 모두 충족하는 새 문항을 생성하세요.",
  ].join("\n");
}

export function hasDoubleNegativeBlankSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const blankSettings = input.typeSettings?.BLANK_INFERENCE;
  return (
    typeof blankSettings === "object" &&
    blankSettings !== null &&
    "doubleNegative" in blankSettings &&
    (blankSettings as { doubleNegative?: unknown }).doubleNegative === true
  );
}

export function hasBlankParaphraseAnswerSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (
    resolved.blankInferenceParaphraseAnswer === true &&
    resolved.blankInferenceDoubleNegative !== true &&
    (resolved.blankInferenceBlankCount ?? 1) === 1
  );
}

export function hasSingleBlankInferenceSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (resolved.blankInferenceBlankCount ?? 1) === 1;
}

export function getLargestIrrelevantSlotCount(input: RunGenerationInput): number {
  let maxSlotCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "IRRELEVANT" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxSlotCount = Math.max(
      maxSlotCount,
      resolved.irrelevantSlotCount ?? 0,
    );
  }
  return maxSlotCount;
}

export function getLargestGrammarMarkerCount(input: RunGenerationInput): number {
  let maxMarkerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxMarkerCount = Math.max(
      maxMarkerCount,
      resolved.grammarMarkerCount ?? 0,
    );
  }
  return maxMarkerCount;
}

export function getLargestGrammarAnswerCount(input: RunGenerationInput): number {
  let maxAnswerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxAnswerCount = Math.max(
      maxAnswerCount,
      resolved.grammarAnswerCount ?? 0,
    );
  }
  return maxAnswerCount;
}

// ── 미끼 스페어 과잉생성(G=K+1) 드랍 선별 — 26-07-06 1회호출 캠페인 Wave 3-lite ──
// KILLER 어법은 스키마로 미끼를 1개 더 받아(G=K+1), 조합 위반 미끼를 여기서
// 결정론 드랍해 K개로 후처리에 넘긴다 — "미끼 1개 불량 → 전체 재생성(~40k tok)"
// 루프의 0-콜 대체. 드랍 우선순위: 정답 pointCode 반복(KILLER 하드 게이트)
// > 미끼 코드 3회+ 편중(monotony) > 장식 필러 표면 > 배열 후순위.
// 산문 가드(적대검토): explanation/answerLogic/keyPoints 가 "(X)" 라벨로 참조하는
// 미끼는 드랍 금지(유령 라벨 오염 방지). 드랍 가능 미끼가 없으면 무변형 반환 —
// 기존 marker-count 게이트가 반려해 오늘까지의 재시도 경로로 흐른다(무회귀).
// 선별 후에도 전체 품질 게이트를 K 기준으로 그대로 통과해야 출하된다.

const GRAMMAR_WEAK_FILLER_DROP_SURFACES = new Set([
  // dispatcher 의 장식 필러 목록과 취지 동일(닫힌 소집합) — 선별은 힌트일 뿐이고
  // 최종 판정은 여전히 dispatcher 게이트가 하므로 목록 드리프트는 안전하다.
  "only", "given", "that", "this", "it", "does", "do", "its", "their",
  "and", "or", "but", "as", "so", "even", "just",
]);

function grammarLabelChar(value: unknown): string {
  const match = String(value ?? "").match(/[A-Ja-j]/);
  return match ? match[0].toUpperCase() : "";
}

function grammarPointCodeChar(value: unknown): string {
  const match = String(value ?? "").match(/[a-m]/i);
  return match ? match[0].toLowerCase() : "";
}

export function trimGrammarDecoySurplus(
  draft: Record<string, unknown>,
  options: { finalMarkerCount: number; finalAnswerCount: number },
): Record<string, unknown> {
  const marked = Array.isArray(draft.markedExpressions)
    ? draft.markedExpressions.filter(isRecord)
    : [];
  if (marked.length <= options.finalMarkerCount) return draft;

  const errors = marked.filter((me) => me.isError === true);
  const decoys = marked.filter((me) => me.isError !== true);
  // 오류 개수가 계약과 다르면 어느 쪽을 잘라야 할지 추정하지 않는다 — 게이트가 반려.
  if (errors.length !== options.finalAnswerCount) return draft;

  const answerCodes = new Set(
    errors.map((me) => grammarPointCodeChar(me.pointCode)).filter(Boolean),
  );
  const decoyCodeCounts = new Map<string, number>();
  for (const decoy of decoys) {
    const code = grammarPointCodeChar(decoy.pointCode);
    if (code) decoyCodeCounts.set(code, (decoyCodeCounts.get(code) ?? 0) + 1);
  }

  const proseTexts = [
    draft.explanation,
    draft.answerLogic,
    ...(Array.isArray(draft.keyPoints) ? draft.keyPoints : []),
  ]
    .map((value) => String(value ?? ""))
    .join("\n");
  const referencedLabels = new Set(
    Array.from(proseTexts.matchAll(/\(([A-Ja-j])\)/g), (m) => m[1].toUpperCase()),
  );

  const surplus = decoys.length - (options.finalMarkerCount - options.finalAnswerCount);
  if (surplus <= 0) return draft;

  const scored = decoys.map((decoy, index) => {
    const code = grammarPointCodeChar(decoy.pointCode);
    const surface = String(decoy.expression ?? "").trim().toLowerCase();
    let badness = index * 0.01; // 동률이면 배열 후순위(모델의 후순위 슬롯)를 먼저 버린다
    if (code && answerCodes.has(code)) badness += 100;
    if (code && (decoyCodeCounts.get(code) ?? 0) >= 3) badness += 60;
    else if (code && (decoyCodeCounts.get(code) ?? 0) >= 2) badness += 20;
    if (!surface.includes(" ") && GRAMMAR_WEAK_FILLER_DROP_SURFACES.has(surface)) {
      badness += 25;
    }
    return { decoy, badness, label: grammarLabelChar(decoy.label) };
  });

  const droppable = scored
    .filter((entry) => !entry.label || !referencedLabels.has(entry.label))
    .sort((a, b) => b.badness - a.badness);
  if (droppable.length < surplus) return draft;

  const droppedSet = new Set(droppable.slice(0, surplus).map((entry) => entry.decoy));
  const droppedLabels = new Set(
    droppable.slice(0, surplus).map((entry) => entry.label).filter(Boolean),
  );

  const keptMarked = marked.filter((me) => !droppedSet.has(me));
  const next: Record<string, unknown> = { ...draft, markedExpressions: keptMarked };

  // 드랍 라벨의 파생 필드 정리 — options 는 후처리가 markedExpressions 로 전량
  // 재생성하지만, 초안이 repair 프롬프트에 실릴 수 있어 좌표계를 맞춰 둔다.
  if (Array.isArray(draft.options)) {
    next.options = draft.options.filter(
      (option) => !isRecord(option) || !droppedLabels.has(grammarLabelChar(option.label)),
    );
  }
  if (Array.isArray(draft.wrongOptionExplanations)) {
    next.wrongOptionExplanations = draft.wrongOptionExplanations.filter(
      (entry) => !isRecord(entry) || !droppedLabels.has(grammarLabelChar(entry.label)),
    );
  } else if (isRecord(draft.wrongOptionExplanations)) {
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(draft.wrongOptionExplanations)) {
      if (!droppedLabels.has(grammarLabelChar(key))) rest[key] = value;
    }
    next.wrongOptionExplanations = rest;
  }
  return next;
}
