import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as questionQuality from "../../../../src/lib/question-quality/index";
import * as generationConstants from "../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import * as blankParaphrase from "../../../../src/lib/question-quality/validators/blank/paraphrase";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as summaryMc from "../../../../src/lib/question-quality/validators/summary/mc";

const { SHIP_FIRST_WARNING_CODES, validateQuestionQuality } = questionQuality;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;
const { findBlankParaphraseDifficultyIssue, findBlankParaphraseSlotIssue } = blankParaphrase;
const { findGrammarKeypointChoiceMismatch, findNonstandardGrammarTerminology } = grammarShared;
const { findAwkwardSummaryMcCollocation } = summaryMc;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

const REMOVE_RELAXATION = [
  "blank-paraphrase-subject-slot-mismatch",
  "implied-meaning-option-language",
  "topic-option-language",
] as const;

const SPLIT_REQUIRED = [
  "blank-explanation-step-numbering",
  "blank-paraphrase-answer-not-transformed",
  "blank-paraphrase-correct-too-thin",
  "grammar-keypoint-choice-mismatch",
  "grammar-nonstandard-terminology",
  "sentence-order-given-too-long",
  "sentence-order-paragraph-too-short",
  "sentence-order-paragraph-too-thin",
  "summary-mc-awkward-collocation",
  "summary-mc-direction-frame",
] as const;

const STALE_NO_EMITTER = [
  "blank-paraphrase-killer-giveaway-distractors",
  "grammar-obvious-living-lived",
] as const;

// Explicit complement of the two unsafe groups. Keeping this list literal makes
// policy drift fail closed: adding a new notice-eligible code requires a fresh
// classification instead of silently inheriting KEEP_CRAFT.
const KEEP_CRAFT = [
  "blank-killer-target-too-easy",
  "blank-paraphrase-answer-too-verbatim",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-target-too-wide",
  "blank-paraphrase-target-trailing-function",
  "blank-target-list-like",
  "blank-target-too-small",
  "grammar-agreement-explanation-too-thin",
  "grammar-answer-point-not-core",
  "grammar-basic-overloaded-design",
  "grammar-correction-killer-thin-segment",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "grammar-decoy-filler-span",
  "grammar-decoy-point-diversity",
  "grammar-decoy-point-monotony",
  "grammar-demonstrative-that-way-decoy",
  "grammar-error-explanation-surface-order",
  "grammar-explanation-too-long-hard",
  "grammar-fixed-that-is-idiom",
  "grammar-killer-answer-point-repeated",
  "grammar-killer-generic-answer-point",
  "grammar-killer-overdrilled-answer",
  "grammar-killer-thin-answer",
  "grammar-killer-thin-concessive-as",
  "grammar-killer-thin-connector",
  "grammar-killer-thin-missing-aux",
  "grammar-killer-thin-relative-animacy",
  "grammar-marker-too-dense",
  "grammar-mixed-as-it-span",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-obvious-adverb-adjective",
  "grammar-obvious-before-after-to-infinitive",
  "grammar-obvious-connector-to-what",
  "grammar-obvious-despite-being-to-be",
  "grammar-obvious-double-ing",
  "grammar-obvious-endure-passive-object",
  "grammar-obvious-finite-to-ing-colon",
  "grammar-obvious-intransitive-passive",
  "grammar-obvious-living-finite",
  "grammar-obvious-local-agreement",
  "grammar-obvious-local-pronoun-agreement",
  "grammar-obvious-modal-gerund",
  "grammar-obvious-modal-to-infinitive",
  "grammar-obvious-noun-what-relative",
  "grammar-obvious-object-pronoun-subject",
  "grammar-obvious-passive-to-gap-ing",
  "grammar-obvious-pronoun-agreement",
  "grammar-obvious-seem-gerund",
  "grammar-obvious-seem-to-gerund",
  "grammar-obvious-to-gerund-after-verb",
  "grammar-obvious-what-noun-prefix",
  "grammar-shallow-because-despite-clause",
  "grammar-shallow-checklist-decoys",
  "grammar-shallow-depends-decoy",
  "grammar-shallow-despite-although-gerund",
  "grammar-shallow-local-participle-parallel",
  "grammar-shallow-nearby-passive-decoy",
  "grammar-shallow-participle-adjective-answer",
  "grammar-shallow-than-decoy",
  "grammar-too-basic-decoys",
  "grammar-underline-punctuated-fragment",
  "grammar-underline-too-long",
  "grammar-vague-metadata-tag",
  "grammar-weak-filler-decoys",
  "implied-meaning-absolute-giveaway-option",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-thin-reasoning-gap",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "irrelevant-source-first-sentence",
  "irrelevant-too-many-new-terms",
  "irrelevant-too-unrelated",
  "multi-blank-paraphrase-correct-source-exact",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-imbalance",
  "sentence-order-unscrambled-answer",
  "summary-mc-missing-half-correct-traps",
] as const;

const RECOMMENDATIONS: Record<string, string> = {
  "blank-paraphrase-subject-slot-mismatch":
    "Remove from SHIP_FIRST and SALVAGE. The trigger describes the visible correct completion itself becoming a semantically malformed subject/copular frame (V3).",
  "implied-meaning-option-language":
    "Remove from SALVAGE. The error-emitting branch is an explicit optionLanguage=en contract violation (V5); the Korean-setting branch is already emitted as warning and remains nonblocking without SALVAGE.",
  "topic-option-language":
    "Remove from SALVAGE. It is emitted as error only when the requested option language is English and a non-English option is present (V5).",
  "blank-explanation-step-numbering":
    "Split narrative circled-step numbering (V5) from legitimate terse option references that do not quote the option head; block only the former with a higher-precision code.",
  "blank-paraphrase-answer-not-transformed":
    "Keep the general verbatim-paraphrase code as craft, but add a blocking residual-visible code for PARAPHRASE mode when the same source span remains elsewhere in passageWithBlank (V5/C4 answer leak).",
  "blank-paraphrase-correct-too-thin":
    "Keep token-count thinness as craft; add a separate blocking semantic-role loss code/judgment for lost actor, polarity, condition, cause, or scope. The current count proxy catches both faithful compression and invalid genericization.",
  "grammar-keypoint-choice-mismatch":
    "Split nonexistent-label references (blocking V4/V5) from first-item ordering and pointCode/topic disagreement. The latter often reflects wrong metadata while the student-facing keyPoint is correct.",
  "grammar-nonstandard-terminology":
    "Split actual term errors such as '전사구' (blocking V4) from accurate but advanced/register-heavy terms such as '통사적으로' (craft warning).",
  "sentence-order-given-too-long":
    "Split the label-contamination branch into a blocking sentence-order-given-contains-paragraph-label code (V1/V5); keep word/sentence length branches as craft.",
  "sentence-order-paragraph-too-short":
    "Add a blocking sentence-order-empty-paragraph code before the minimum-sentence craft check. Empty text currently returns early from source reconstruction and can be salvaged (V1/V5).",
  "sentence-order-paragraph-too-thin":
    "Share the blocking empty/fragment guard with paragraph-too-short; retain ordinary sub-24-word but grammatical blocks as craft.",
  "summary-mc-awkward-collocation":
    "Split high-confidence malformed heads (e.g. 'equity to learning') into blocking V3 and retain ambiguous noun-chain regexes as warning; the current regex also matches grammatical 'question of access to learning'.",
  "summary-mc-direction-frame":
    "Split empty/competing-task directions (blocking V5) from an otherwise valid summary-completion stem that merely omits literal (A)/(B) labels (craft).",
  "blank-paraphrase-killer-giveaway-distractors":
    "Remove stale policy membership after compatibility review. No current validator emits this string; the active emitter is blank-killer-giveaway-distractors.",
  "grammar-obvious-living-lived":
    "Remove stale policy membership after compatibility review. No current validator emits this string; it survives only in policy/repair-feedback tables.",
};

function collectFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const file = path.join(root, name);
    if (statSync(file).isDirectory()) out.push(...collectFiles(file));
    else if (file.endsWith(".ts") || file.endsWith(".tsx")) out.push(file);
  }
  return out;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scopeFor(code: string): string[] {
  if (code.startsWith("grammar-correction-")) return ["GRAMMAR_CORRECTION"];
  if (code.startsWith("grammar-")) return ["GRAMMAR_ERROR"];
  if (code.startsWith("blank-") || code.startsWith("multi-blank-")) return ["BLANK_INFERENCE"];
  if (code.startsWith("implied-")) return ["IMPLIED_MEANING"];
  if (code.startsWith("irrelevant-")) return ["IRRELEVANT"];
  if (code.startsWith("sentence-order-")) return ["SENTENCE_ORDER"];
  if (code.startsWith("summary-mc-")) return ["SUMMARY_COMPLETE_MC"];
  if (code === "topic-option-language") return ["TOPIC", "MAIN_IDEA"];
  return ["UNKNOWN"];
}

function policyEffect(code: string): string {
  const ship = SHIP_FIRST_WARNING_CODES.has(code);
  const salvage = SALVAGE_RELAXABLE_CODES.has(code);
  const relaxed = RELAXED_BLOCKING_QUALITY_CODES.has(code);
  if (ship && code.startsWith("implied-meaning-")) {
    return "warning globally except KILLER strict; relaxed fallback is nonblocking";
  }
  if (ship) return "warning before strict/relaxed evaluation";
  if (salvage && relaxed) return "blocks strict/relaxed, but final salvage may ship with notice";
  if (salvage && !relaxed) return "already nonblocking in relaxed; SALVAGE entry is behaviorally redundant";
  return "policy membership inconsistent with audit union";
}

function issueOf(
  input: Parameters<typeof validateQuestionQuality>[0],
  code: string,
) {
  return validateQuestionQuality(input).filter((issue) => issue.code === code);
}

const blankOptions = [
  { label: "1", text: "shared trust" },
  { label: "2", text: "strict enforcement" },
  { label: "3", text: "private incentives" },
  { label: "4", text: "formal oversight" },
  { label: "5", text: "short-term compliance" },
];

const residualBlankQuestion = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "_____ anchors the debate. Later, shared trust anchors the settlement as well.",
  originalExpression: "shared trust",
  options: blankOptions,
  correctAnswer: "1",
  answerLogic:
    "원문 표현이 공동의 신뢰를 뜻하고 정답 선지가 같은 관계를 복원한다는 설명입니다.",
  explanation: "공동의 신뢰가 두 판단을 연결한다.",
};

const subjectSlotQuestion = {
  ...residualBlankQuestion,
  passageWithBlank:
    "_____ is not whether institutions should respond, but how they should balance speed with fairness.",
  originalExpression: "the central challenge",
  options: [
    { label: "1", text: "balancing speed with fairness" },
    { label: "2", text: "enforcing every rule immediately" },
    { label: "3", text: "rejecting all institutional discretion" },
    { label: "4", text: "measuring only short-term outcomes" },
    { label: "5", text: "avoiding every form of intervention" },
  ],
};

const naturalSummaryQuestion = {
  direction: "다음 요약문의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  difficulty: "INTERMEDIATE",
  summaryWithBlanks: "The reform tries to expand (A) (B).",
  blanks: [
    { label: "(A)", answer: "access" },
    { label: "(B)", answer: "to learning" },
  ],
  options: [
    { label: "1", text: "access - to learning", blankA: "access", blankB: "to learning" },
    { label: "2", text: "access - from learning", blankA: "access", blankB: "from learning" },
    { label: "3", text: "barriers - to learning", blankA: "barriers", blankB: "to learning" },
    { label: "4", text: "limits - on learning", blankA: "limits", blankB: "on learning" },
    { label: "5", text: "distance - from learning", blankA: "distance", blankB: "from learning" },
  ],
  correctAnswer: "1",
  explanation: "접근성을 넓힌다는 요약이 글의 핵심을 보존한다.",
};

const malformedSummaryQuestion = {
  ...naturalSummaryQuestion,
  summaryWithBlanks: "The reform tries to expand (A) (B).",
  blanks: [
    { label: "(A)", answer: "equity" },
    { label: "(B)", answer: "to learning" },
  ],
  options: [
    { label: "1", text: "equity - to learning", blankA: "equity", blankB: "to learning" },
    { label: "2", text: "equity - from learning", blankA: "equity", blankB: "from learning" },
    { label: "3", text: "barriers - to learning", blankA: "barriers", blankB: "to learning" },
    { label: "4", text: "limits - on learning", blankA: "limits", blankB: "on learning" },
    { label: "5", text: "distance - from learning", blankA: "distance", blankB: "from learning" },
  ],
};

const topicQuestion = {
  direction: "다음 글의 주제로 가장 적절한 것은?",
  difficulty: "INTERMEDIATE",
  options: [
    { label: "1", text: "the role of trust in collective decisions" },
    { label: "2", text: "집단 판단에서 신뢰의 역할" },
    { label: "3", text: "the cost of enforcing uniform rules" },
    { label: "4", text: "the history of institutional reform" },
    { label: "5", text: "the limits of private incentives" },
  ],
  correctAnswer: "1",
  explanation: "글 전체가 공동 판단과 신뢰의 관계를 다룬다.",
};

const impliedQuestion = {
  direction: "밑줄 친 표현이 의미하는 바로 가장 적절한 것은?",
  difficulty: "INTERMEDIATE",
  passageWithUnderline: "The committee learned that __speed can become a tax__ on careful judgment.",
  underlinedExpression: "speed can become a tax",
  options: [
    { label: "1", text: "rapid action can impose hidden costs on sound judgment" },
    { label: "2", text: "빠른 행동은 항상 가장 정확한 결정을 만든다" },
    { label: "3", text: "committees should eliminate every deadline" },
    { label: "4", text: "careful judgment requires no institutional support" },
    { label: "5", text: "tax policy determines the pace of every meeting" },
  ],
  correctAnswer: "1",
  impliedMeaning: "지나친 속도는 신중한 판단에 숨은 비용을 부과할 수 있다.",
  explanation: "tax는 문자 그대로의 세금이 아니라 판단의 비용을 비유한다.",
};

const longParagraph =
  "Institutions first gather evidence from several independent sources before acting. They then compare the sources carefully so that one vivid report does not dominate the final decision.";
const otherParagraph =
  "Next, reviewers identify which assumptions connect the evidence to the proposed action. This step makes hidden disagreements visible and allows the group to test them directly.";
const finalParagraph =
  "Finally, the group records why the chosen action follows from the evidence. The record helps later reviewers distinguish a justified revision from an arbitrary change of course.";

function sentenceOrderQuestion(givenSentence: string, paragraphA = longParagraph) {
  return {
    direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
    difficulty: "INTERMEDIATE",
    givenSentence,
    paragraphs: [
      { label: "(A)", text: paragraphA },
      { label: "(B)", text: otherParagraph },
      { label: "(C)", text: finalParagraph },
    ],
    options: [
      { label: "1", text: "(B)-(A)-(C)" },
      { label: "2", text: "(A)-(C)-(B)" },
      { label: "3", text: "(B)-(C)-(A)" },
      { label: "4", text: "(C)-(A)-(B)" },
      { label: "5", text: "(C)-(B)-(A)" },
    ],
    correctAnswer: "1",
    explanation: "두 검토 단계와 기록 단계의 연결 순서를 따른다.",
  };
}

function blankExplanationQuestion(explanation: string) {
  return {
    direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    difficulty: "INTERMEDIATE",
    blankAnswerMode: "SOURCE_EXACT",
    passageWithBlank: "Careful review depends on _____.",
    originalExpression: "shared standards",
    options: [
      { label: "1", text: "private intuition" },
      { label: "2", text: "rapid agreement" },
      { label: "3", text: "formal authority" },
      { label: "4", text: "shared standards" },
      { label: "5", text: "fixed outcomes" },
    ],
    correctAnswer: "4",
    explanation,
  };
}

const repeatedSourceIssues = validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: residualBlankQuestion,
  passage:
    "Shared trust anchors the debate. Later, shared trust anchors the settlement as well.",
  requestedDifficulty: "BASIC",
});
const repeatedSourceSelected = repeatedSourceIssues.filter((issue) =>
  ["blank-paraphrase-answer-not-transformed", "blank-answer-residual-visible"].includes(issue.code),
);

const subjectSlotIssues = issueOf(
  {
    typeId: "BLANK_INFERENCE",
    question: subjectSlotQuestion,
    requestedDifficulty: "BASIC",
  },
  "blank-paraphrase-subject-slot-mismatch",
);

const malformedSummaryIssues = issueOf(
  {
    typeId: "SUMMARY_COMPLETE_MC",
    question: malformedSummaryQuestion,
    requestedDifficulty: "INTERMEDIATE",
  },
  "summary-mc-awkward-collocation",
);

const topicLanguageIssues = issueOf(
  {
    typeId: "TOPIC",
    question: topicQuestion,
    requestedDifficulty: "INTERMEDIATE",
    optionLanguage: "en",
  },
  "topic-option-language",
);

const impliedLanguageIssues = issueOf(
  {
    typeId: "IMPLIED_MEANING",
    question: impliedQuestion,
    requestedDifficulty: "INTERMEDIATE",
    optionLanguage: "en",
  },
  "implied-meaning-option-language",
);

const givenLabelIssues = issueOf(
  {
    typeId: "SENTENCE_ORDER",
    question: sentenceOrderQuestion(
      "A reliable process begins with a shared question. (A) This leaked label belongs to the paragraph area.",
    ),
    requestedDifficulty: "INTERMEDIATE",
  },
  "sentence-order-given-too-long",
);

const emptyParagraphIssues = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: sentenceOrderQuestion(
    "A reliable process begins with a shared question.",
    "",
  ),
  requestedDifficulty: "INTERMEDIATE",
}).filter((issue) =>
  ["sentence-order-paragraph-too-short", "sentence-order-paragraph-too-thin"].includes(issue.code),
);

const validDirectionWithoutLabels = issueOf(
  {
    typeId: "SUMMARY_COMPLETE_MC",
    question: {
      ...naturalSummaryQuestion,
      direction: "다음 요약문의 두 빈칸에 들어갈 말로 가장 적절한 것은?",
    },
    requestedDifficulty: "INTERMEDIATE",
  },
  "summary-mc-direction-frame",
);
const wrongTaskDirection = issueOf(
  {
    typeId: "SUMMARY_COMPLETE_MC",
    question: {
      ...naturalSummaryQuestion,
      direction: "다음 글의 제목으로 가장 적절한 것은?",
    },
    requestedDifficulty: "INTERMEDIATE",
  },
  "summary-mc-direction-frame",
);

const narrativeNumberingIssues = issueOf(
  {
    typeId: "BLANK_INFERENCE",
    question: blankExplanationQuestion(
      "① 먼저 빈칸 문장의 주어를 확인한다. ② 이어서 앞 문장의 인과 관계를 확인한다. 따라서 정답은 공유된 기준이다.",
    ),
    requestedDifficulty: "INTERMEDIATE",
  },
  "blank-explanation-step-numbering",
);
const terseOptionReferenceIssues = issueOf(
  {
    typeId: "BLANK_INFERENCE",
    question: blankExplanationQuestion(
      "①은 개인 직관으로 범위를 좁혀 오답이다. ②는 합의를 지나치게 서두르므로 오답이다. ④가 공동 기준을 복원한다.",
    ),
    requestedDifficulty: "INTERMEDIATE",
  },
  "blank-explanation-step-numbering",
);

const malformedSubjectDirect = findBlankParaphraseSlotIssue(
  "_____ is not whether institutions should respond, but how they should respond.",
  "the central challenge",
  "balancing speed with fairness",
);
const faithfulThin = findBlankParaphraseDifficultyIssue(
  "avoid oversimplification",
  "resist reducing complex evidence to simple rules",
  "KILLER",
);
const genericThin = findBlankParaphraseDifficultyIssue(
  "sound judgment",
  "resist reducing complex evidence to simple rules",
  "KILLER",
);

const markedForKeypoints = [
  { label: "(A)", pointCode: "d", expression: "are" },
  { label: "(B)", pointCode: "e", expression: "where" },
  { label: "(C)", pointCode: "c", expression: "rooted" },
];
const nonexistentKeypointLabel = findGrammarKeypointChoiceMismatch(
  ["(F) 수일치 — 존재하지 않는 밑줄을 설명"],
  markedForKeypoints,
  "(A)",
);
const metadataDriftKeypoint = findGrammarKeypointChoiceMismatch(
  ["(B) 관계부사 where — 장소 선행사 뒤 완전한 절을 이끈다"],
  markedForKeypoints,
  "(B)",
);

const policyUnion = [
  ...new Set([...SHIP_FIRST_WARNING_CODES, ...SALVAGE_RELAXABLE_CODES]),
].sort();
const classified = [
  ...new Set([...REMOVE_RELAXATION, ...SPLIT_REQUIRED, ...STALE_NO_EMITTER, ...KEEP_CRAFT]),
].sort();
assert.deepEqual(classified, policyUnion, "Every notice-eligible code must be explicitly classified");
assert.equal(policyUnion.length, 102);
assert.equal(SHIP_FIRST_WARNING_CODES.size, 31);
assert.equal(SALVAGE_RELAXABLE_CODES.size, 99);

assert.equal(subjectSlotIssues[0]?.severity, "warning");
assert.equal(malformedSummaryIssues[0]?.severity, "warning");
assert.equal(topicLanguageIssues[0]?.severity, "error");
assert.equal(impliedLanguageIssues[0]?.severity, "error");
assert.equal(givenLabelIssues[0]?.severity, "warning");
assert.equal(
  repeatedSourceSelected.some((issue) => issue.code === "blank-answer-residual-visible"),
  false,
);
assert.equal(
  repeatedSourceSelected.find((issue) => issue.code === "blank-paraphrase-answer-not-transformed")?.severity,
  "error",
);
assert.equal(emptyParagraphIssues.length, 2);
assert.equal(emptyParagraphIssues.every((issue) => SALVAGE_RELAXABLE_CODES.has(issue.code)), true);
assert.equal(validDirectionWithoutLabels.length, 1);
assert.equal(wrongTaskDirection.length, 1);
assert.equal(narrativeNumberingIssues.length, 1);
assert.equal(terseOptionReferenceIssues.length, 1);
assert.equal(malformedSubjectDirect?.code, "blank-paraphrase-subject-slot-mismatch");
assert.equal(faithfulThin?.code, "blank-paraphrase-correct-too-thin");
assert.equal(genericThin?.code, "blank-paraphrase-correct-too-thin");
assert.ok(nonexistentKeypointLabel);
assert.ok(metadataDriftKeypoint);
assert.ok(findNonstandardGrammarTerminology("전사구 성격의 분사 표현"));
assert.ok(findNonstandardGrammarTerminology("통사적으로 적합한 구조"));
assert.ok(findAwkwardSummaryMcCollocation("This is a question of access to learning."));
assert.ok(findAwkwardSummaryMcCollocation("The policy promises equity to learning."));

const sourceFiles = collectFiles(path.join(REPO_ROOT, "src", "lib", "question-quality"));
const constantsFile = path.join(
  REPO_ROOT,
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
);
const sourceTextByFile = new Map(
  [...sourceFiles, constantsFile].map((file) => [file, readFileSync(file, "utf8")]),
);
const policySourceHash = sha256(
  [...sourceTextByFile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, text]) => `${path.relative(REPO_ROOT, file).replaceAll("\\", "/")}\0${text}`)
    .join("\0"),
);

const removeSet = new Set<string>(REMOVE_RELAXATION);
const splitSet = new Set<string>(SPLIT_REQUIRED);
const staleSet = new Set<string>(STALE_NO_EMITTER);
const keepSet = new Set<string>(KEEP_CRAFT);
const inventoryItems = policyUnion.map((code) => {
  const emitters = [...sourceTextByFile.entries()]
    .filter(([file, text]) =>
      !file.endsWith("core.ts") &&
      !file.endsWith("run-question-generation-constants.ts") &&
      text.includes(`"${code}"`),
    )
    .map(([file]) => path.relative(REPO_ROOT, file).replaceAll("\\", "/"))
    .sort();
  const verdict = removeSet.has(code)
    ? "REMOVE_RELAXATION"
    : splitSet.has(code)
      ? "SPLIT_REQUIRED"
      : staleSet.has(code)
        ? "STALE_NO_EMITTER"
        : keepSet.has(code)
          ? "KEEP_CRAFT"
          : "UNCLASSIFIED";
  return {
    code,
    typeScopes: scopeFor(code),
    policy: {
      shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
      relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
      salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
      effect: policyEffect(code),
    },
    verdict,
    recommendation: RECOMMENDATIONS[code] ??
      "Keep notice-eligible: the emitter establishes difficulty, distractor attractiveness, span aesthetics, metadata depth, or formatting craft, but not a V1-V5 failure by itself.",
    emitterFiles: emitters,
  };
});

const activeTypes = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
] as const;

const exposedTypeSet = new Set(inventoryItems.flatMap((item) => item.typeScopes));
const typeCoverage = activeTypes.map((typeId) => ({
  typeId,
  policyCodes: inventoryItems.filter((item) => item.typeScopes.includes(typeId)).map((item) => item.code),
  downgradeExposure: exposedTypeSet.has(typeId),
}));

const result = {
  schemaVersion: 1,
  mode: "offline-zero-call-policy-severity-audit",
  repoHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim(),
  policySourceHash,
  counts: {
    activeEnglishTypes: activeTypes.length,
    shipFirst: SHIP_FIRST_WARNING_CODES.size,
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.size,
    noticeEligibleUnion: policyUnion.length,
    removeRelaxation: REMOVE_RELAXATION.length,
    splitRequired: SPLIT_REQUIRED.length,
    staleNoEmitter: STALE_NO_EMITTER.length,
    keepCraft: KEEP_CRAFT.length,
    exposedTypes: typeCoverage.filter((row) => row.downgradeExposure).length,
    unexposedTypes: typeCoverage.filter((row) => !row.downgradeExposure).length,
  },
  scenarios: {
    subjectSlotCorrectCompletion: subjectSlotIssues,
    paraphraseExactAnswerWithResidualSource: repeatedSourceSelected,
    summaryMalformedCorrectCompletion: malformedSummaryIssues,
    englishTopicWithKoreanOption: topicLanguageIssues,
    englishImpliedMeaningWithKoreanOption: impliedLanguageIssues,
    sentenceOrderGivenContainsParagraphLabel: givenLabelIssues,
    sentenceOrderEmptyParagraph: emptyParagraphIssues,
    summaryValidDirectionWithoutLiteralLabels: validDirectionWithoutLabels,
    summaryCompetingWrongTaskDirection: wrongTaskDirection,
    blankNarrativeCircledNumbering: narrativeNumberingIssues,
    blankTerseLegitimateOptionReferences: terseOptionReferenceIssues,
    grammarKeypointNonexistentLabel: nonexistentKeypointLabel,
    grammarKeypointCorrectTextWrongMetadata: metadataDriftKeypoint,
    terminologyActualError: findNonstandardGrammarTerminology("전사구 성격의 분사 표현"),
    terminologyRegisterOnly: findNonstandardGrammarTerminology("통사적으로 적합한 구조"),
    summaryRegexGrammaticalFalsePositive: findAwkwardSummaryMcCollocation(
      "This is a question of access to learning.",
    ),
    summaryRegexTrueMalformed: findAwkwardSummaryMcCollocation(
      "The policy promises equity to learning.",
    ),
    blankFaithfulCompressionCountProxy: faithfulThin,
    blankGenericMeaningLossCountProxy: genericThin,
  },
  typeCoverage,
  inventory: inventoryItems,
};

const stableJson = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(path.join(HERE, "INVENTORY.json"), stableJson, "utf8");
}
process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      policySourceHash,
      inventoryHash: sha256(stableJson),
      counts: result.counts,
      output: process.argv.includes("--write") ? "INVENTORY.json" : null,
    },
    null,
    2,
  ) + "\n",
);
