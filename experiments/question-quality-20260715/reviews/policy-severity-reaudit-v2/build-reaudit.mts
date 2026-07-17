import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import * as questionQualityImport from "../../../../src/lib/question-quality/index";
import * as generationConstantsImport from "../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import * as blankParaphraseImport from "../../../../src/lib/question-quality/validators/blank/paraphrase";
import * as grammarSharedImport from "../../../../src/lib/question-quality/validators/grammar/shared";

// tsx may expose transpiled local modules through a default CJS namespace,
// while tsc correctly rejects a source-level default import. Normalize both
// shapes without weakening the production modules' export contracts.
const questionQualityNamespace =
  (questionQualityImport as { default?: unknown }).default ?? questionQualityImport;
const generationConstantsNamespace =
  (generationConstantsImport as { default?: unknown }).default ?? generationConstantsImport;
const blankParaphraseNamespace =
  (blankParaphraseImport as { default?: unknown }).default ?? blankParaphraseImport;
const grammarSharedNamespace =
  (grammarSharedImport as { default?: unknown }).default ?? grammarSharedImport;

const questionQuality = questionQualityNamespace as unknown as {
  SHIP_FIRST_WARNING_CODES: Set<string>;
  validateQuestionQuality: (input: Record<string, unknown>) => QualityIssue[];
};
const generationConstants = generationConstantsNamespace as unknown as {
  RELAXED_BLOCKING_QUALITY_CODES: Set<string>;
  SALVAGE_RELAXABLE_CODES: Set<string>;
};
const blankParaphrase = blankParaphraseNamespace as unknown as {
  findBlankParaphraseDifficultyIssue: (
    correctText: string,
    originalExpression: string,
    requestedDifficulty: string,
  ) => { code: string; message: string } | null;
  findBlankParaphrasePolarityIssue: (
    originalExpression: string,
    correctText: string,
  ) => { code: string; message: string } | null;
};
const grammarShared = grammarSharedNamespace as unknown as {
  findGrammarKeypointChoiceMismatch: (
    keyPoints: unknown,
    markedExpressions: Array<Record<string, unknown>>,
    correctAnswer: unknown,
  ) => string | null;
  findGrammarKeypointNonexistentLabel: (
    keyPoints: unknown,
    markedExpressions: Array<Record<string, unknown>>,
  ) => string | null;
  findGrammarTerminologyError: (text: unknown) => string | null;
  findGrammarTerminologyRegister: (text: unknown) => string | null;
};

const { SHIP_FIRST_WARNING_CODES, validateQuestionQuality } = questionQuality;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

interface QualityIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

interface SemanticPair {
  id: string;
  dimension: "actor" | "polarity" | "condition" | "cause" | "scope";
  originalExpression: string;
  faithful: string;
  defect: string;
  distractors: string[];
  referenceJudgment: { faithful: string; defect: string };
}

interface CasesFile {
  schemaVersion: number;
  mode: string;
  constraints: Record<string, unknown>;
  semanticRolePairs: SemanticPair[];
  narrowPolarityPositiveControl: {
    originalExpression: string;
    faithful: string;
    defect: string;
    expectedDefectCode: string;
  };
  tokenProxyCollision: {
    originalExpression: string;
    faithfulCompression: string;
    genericMeaningLoss: string;
    difficulty: string;
    expectedSharedCode: string;
  };
  priorAuditFindings: {
    immediateRemoval: string[];
    splitRequired: string[];
    staleNoEmitter: string[];
  };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const CASES_PATH = path.join(HERE, "cases.json");
const PRIOR_AUDIT_DIR = path.join(HERE, "../policy-severity-audit");
const QUALITY_ROOT = path.join(REPO_ROOT, "src/lib/question-quality");
const CONSTANTS_FILE = path.join(
  REPO_ROOT,
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
);
const ACTIVE_TYPE_SOURCE = path.join(
  REPO_ROOT,
  "src/components/workbench/passage-detail/constants.ts",
);

const ACTIVE_ENGLISH_TYPES = [
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

const MULTIPLE_CHOICE_TYPES = [
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
] as const;

const KILLER_IMPLIED_BLOCKING = new Set([
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-thin-reasoning-gap",
]);

const cases = JSON.parse(readFileSync(CASES_PATH, "utf8")) as CasesFile;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeStable(file: string, value: unknown): void {
  writeFileSync(file, stableJson(value), "utf8");
}

function collectFiles(root: string, extensions = new Set([".ts", ".tsx"])): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const file = path.join(root, name);
    if (statSync(file).isDirectory()) out.push(...collectFiles(file, extensions));
    else if (extensions.has(path.extname(file))) out.push(file);
  }
  return out.sort();
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).replaceAll("\\", "/");
}

function stringLiterals(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteralLike(child)) values.push(child.text);
    else child.forEachChild(visit);
  };
  visit(node);
  return values;
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

type EmissionSite = {
  file: string;
  line: number;
  kind: "direct-add" | "helper-code-return";
  rawSeverities: Array<"error" | "warning">;
  expression?: string;
};

function scanEmissionSites() {
  const direct = new Map<string, EmissionSite[]>();
  const helper = new Map<string, EmissionSite[]>();
  const dynamicAddSites: Array<{
    file: string;
    line: number;
    severityExpression: string;
    codeExpression: string;
    classification: string;
  }> = [];

  for (const file of collectFiles(QUALITY_ROOT)) {
    const sourceText = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "add" &&
        node.arguments.length >= 2
      ) {
        const codeValues = stringLiterals(node.arguments[1]).filter((value) =>
          /^[a-z0-9][a-z0-9-]+$/.test(value),
        );
        const severities = stringLiterals(node.arguments[0]).filter(
          (value): value is "error" | "warning" => value === "error" || value === "warning",
        );
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        if (codeValues.length === 0) {
          const codeExpression = node.arguments[1].getText(source);
          dynamicAddSites.push({
            file: relative(file),
            line: location.line + 1,
            severityExpression: node.arguments[0].getText(source),
            codeExpression,
            classification: codeExpression === "koIssue.code"
              ? "excluded-non-English-KO-dispatch"
              : "resolved-by-helper-code-return-sites",
          });
        }
        for (const code of codeValues) {
          assert.ok(severities.length > 0, `Static severity was not recoverable for ${code}`);
          const sites = direct.get(code) ?? [];
          sites.push({
            file: relative(file),
            line: location.line + 1,
            kind: "direct-add",
            rawSeverities: [...new Set(severities)].sort() as Array<"error" | "warning">,
            expression: node.arguments[1].getText(source),
          });
          direct.set(code, sites);
        }
      }

      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === "code" &&
        ts.isStringLiteralLike(node.initializer) &&
        /^[a-z0-9][a-z0-9-]+$/.test(node.initializer.text)
      ) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        const code = node.initializer.text;
        const sites = helper.get(code) ?? [];
        sites.push({
          file: relative(file),
          line: location.line + 1,
          kind: "helper-code-return",
          // Every English dynamic qIssue/finding/slotIssue call site in this
          // snapshot passes literal "error" to add(); the assertion below
          // fails if a helper-only family appears outside the audited files.
          rawSeverities: ["error"],
        });
        helper.set(code, sites);
      }
      node.forEachChild(visit);
    };
    visit(source);
  }

  const allowedHelperOnlyFiles = [
    "src/lib/question-quality/validators/blank/inference-distractor.ts",
    "src/lib/question-quality/validators/blank/paraphrase.ts",
    "src/lib/question-quality/validators/blank/seam.ts",
    "src/lib/question-quality/validators/grammar/shared.ts",
  ];
  for (const [code, sites] of helper) {
    if (direct.has(code)) continue;
    assert.ok(
      sites.every((site) => allowedHelperOnlyFiles.includes(site.file)),
      `Unexpected helper-only emitter family for ${code}`,
    );
  }
  const unresolvedEnglishDynamic = dynamicAddSites.filter(
    (site) => site.classification === "resolved-by-helper-code-return-sites",
  );
  assert.equal(unresolvedEnglishDynamic.length, 13);

  const codes = new Map<string, EmissionSite[]>();
  for (const [code, sites] of direct) codes.set(code, [...sites]);
  for (const [code, sites] of helper) {
    if (!codes.has(code)) codes.set(code, [...sites]);
    else codes.get(code)!.push(...sites);
  }
  return { codes, dynamicAddSites };
}

function policyFor(code: string) {
  return {
    shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
  };
}

function isHardThroughSalvage(code: string): boolean {
  const policy = policyFor(code);
  return !policy.shipFirstWarning && policy.relaxedBlocking && !policy.salvageRelaxable;
}

function postShipFirstSeverities(
  code: string,
  raw: Array<"error" | "warning">,
): Array<"error" | "warning"> {
  if (!SHIP_FIRST_WARNING_CODES.has(code)) return [...new Set(raw)].sort();
  if (KILLER_IMPLIED_BLOCKING.has(code) && raw.includes("error")) {
    return ["error", "warning"];
  }
  return ["warning"];
}

function scopesFor(code: string, sites: EmissionSite[]): string[] {
  const all = [...ACTIVE_ENGLISH_TYPES];
  const mc = [...MULTIPLE_CHOICE_TYPES];
  if (/^(?:blank-|double-negative-|negative-paraphrase-|multi-blank-)/.test(code)) return ["BLANK_INFERENCE"];
  if (code.startsWith("grammar-correction-")) return ["GRAMMAR_CORRECTION"];
  if (code.startsWith("grammar-quantity-")) return ["GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"];
  if (code === "grammar-perception-complement-toggle") return ["GRAMMAR_ERROR", "GRAMMAR_CORRECTION"];
  if (code.startsWith("grammar-")) return ["GRAMMAR_ERROR"];
  if (code.startsWith("combo-")) return ["GRAMMAR_CHOICE_COMBO"];
  if (code.startsWith("vocab-")) return ["VOCAB_CHOICE"];
  if (code.startsWith("sentence-order-")) return ["SENTENCE_ORDER"];
  if (code.startsWith("sentence-insert-")) return ["SENTENCE_INSERT"];
  if (code === "topic-option-language" || code.startsWith("topic-main-idea-")) return ["TOPIC", "MAIN_IDEA"];
  if (code.startsWith("topic-")) return ["TOPIC"];
  if (code.startsWith("main-idea-")) return ["MAIN_IDEA"];
  if (code.startsWith("title-")) return ["TITLE"];
  if (code.startsWith("gist-")) return ["TOPIC", "MAIN_IDEA", "TITLE"];
  if (code.startsWith("implied-")) return ["IMPLIED_MEANING"];
  if (code.startsWith("reference-")) return ["REFERENCE"];
  if (code.startsWith("content-match-")) return ["CONTENT_MATCH"];
  if (code.startsWith("summary-mc-")) return ["SUMMARY_COMPLETE_MC"];
  if (code.startsWith("irrelevant-") || code === "empty-irrelevant-sentence") return ["IRRELEVANT"];
  if (code.startsWith("cond-writing-")) return ["CONDITIONAL_WRITING"];
  if (code.startsWith("transform-")) return ["SENTENCE_TRANSFORM"];
  if (code.startsWith("fbk-")) return ["FILL_BLANK_KEY"];
  if (code.startsWith("summary-complete-")) return ["SUMMARY_COMPLETE"];
  if (code.startsWith("sw-")) return ["SUMMARY_WRITING"];
  if (code.startsWith("word-order-")) return ["WORD_ORDER"];
  if (code.startsWith("tsw-")) return ["TOPIC_SENTENCE_WRITING"];
  if (code.startsWith("antonym-")) return ["ANTONYM"];
  if (code === "killer-needs-multiple-conditions") return ["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM"];
  if (code === "duplicate-summary-answer") return ["SUMMARY_COMPLETE", "SUMMARY_COMPLETE_MC"];
  if (code === "punctuation-only-chunk" || code === "scrambled-already-solved") return ["WORD_ORDER", "TOPIC_SENTENCE_WRITING"];
  if (code === "scrambled-near-answer-order" || code === "word-order-unreconstructable") return ["WORD_ORDER"];
  if (code === "writing-answer-verbatim-in-passage" || code === "writing-answer-verbatim-copy") {
    return ["CONDITIONAL_WRITING", "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING"];
  }
  if (code === "weak-target-word") return ["REFERENCE", "CONTEXT_MEANING", "ANTONYM"];
  if (code === "target-not-standalone") return ["CONTEXT_MEANING", "ANTONYM"];
  if ([
    "correct-answer-mismatch",
    "duplicate-option-label",
    "duplicate-option-text",
    "empty-option-text",
    "explanation-choice-count-mismatch",
    "generic-answer-count",
    "generic-multi-answer-direction",
    "option-count",
    "thin-wrong-option-explanations",
    "wrong-option-explanation-count",
  ].includes(code)) return mc;
  if (sites.some((site) => site.file.includes("validators/antonym"))) return ["ANTONYM"];
  if (sites.some((site) => site.file.includes("validators/conditional-writing"))) return ["CONDITIONAL_WRITING"];
  if (sites.some((site) => site.file.includes("validators/topic-sentence/writing"))) return ["TOPIC_SENTENCE_WRITING"];
  if (sites.some((site) => site.file.includes("validators/summary/writing"))) return ["SUMMARY_WRITING"];
  if (sites.some((site) => site.file.includes("validators/word-order"))) return ["WORD_ORDER"];
  // Generic signature, marker, difficulty, diversity, and KILLER-craft checks
  // are called before/around type dispatch and can apply to multiple families.
  return all;
}

function lexicalTokenCount(text: string): number {
  return text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g)?.length ?? 0;
}

function semanticQuestion(pair: SemanticPair, answer: string, counterpart: string) {
  return {
    direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
    difficulty: "INTERMEDIATE",
    blankAnswerMode: "PARAPHRASE",
    passageWithBlank: "The report concludes that _____.",
    originalExpression: pair.originalExpression,
    correctAnswer: "1",
    answerLogic: "The correct answer must preserve the original proposition while changing its wording.",
    explanation: "정답은 원문의 핵심 명제를 다른 표현으로 정확히 보존한다.",
    options: [answer, counterpart, ...pair.distractors].map((text, index) => ({
      label: String(index + 1),
      text,
    })),
  };
}

function semanticIssues(pair: SemanticPair, answer: string, counterpart: string): QualityIssue[] {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: semanticQuestion(pair, answer, counterpart),
    passage: `The report concludes that ${pair.originalExpression}.`,
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  });
}

function selectCodes(issues: QualityIssue[], codes: string[]): QualityIssue[] {
  const wanted = new Set(codes);
  return issues.filter((issue) => wanted.has(issue.code));
}

const { codes: emittedCodeSites, dynamicAddSites } = scanEmissionSites();
const emittedCodeSet = new Set(emittedCodeSites.keys());
const inventoryCodes = [...emittedCodeSites.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
  ([code, sites]) => {
    const rawSeverities = [...new Set(sites.flatMap((site) => site.rawSeverities))].sort() as Array<
      "error" | "warning"
    >;
    return {
      code,
      rawSeverities,
      postShipFirstSeverities: postShipFirstSeverities(code, rawSeverities),
      shipFirstException: KILLER_IMPLIED_BLOCKING.has(code)
        ? "error remains possible only for KILLER IMPLIED_MEANING"
        : null,
      policy: policyFor(code),
      activeEnglishTypeScopes: scopesFor(code, sites),
      emissionSites: sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    };
  },
);
assert.ok(inventoryCodes.every((row) => row.rawSeverities.length > 0));
assert.ok(inventoryCodes.every((row) => row.activeEnglishTypeScopes.length > 0));

const policyUnion = [...new Set([
  ...SHIP_FIRST_WARNING_CODES,
  ...RELAXED_BLOCKING_QUALITY_CODES,
  ...SALVAGE_RELAXABLE_CODES,
])].sort();
const policyOnlyCodes = policyUnion.filter((code) => !emittedCodeSet.has(code));
const stalePriorCodes = cases.priorAuditFindings.staleNoEmitter.map((code) => ({
  code,
  stillNoEnglishQualityEmitter: !emittedCodeSet.has(code),
  policy: policyFor(code),
}));

const sourceFiles = [...collectFiles(QUALITY_ROOT), CONSTANTS_FILE, ACTIVE_TYPE_SOURCE].sort();
const sourceFileHashes = Object.fromEntries(
  sourceFiles.map((file) => [relative(file), sha256(readFileSync(file))]),
);
const sourceSnapshotHash = sha256(
  sourceFiles.map((file) => `${relative(file)}\0${readFileSync(file, "utf8")}`).join("\0"),
);
const repoHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
}).trim();

const semanticIntegrityCodes = inventoryCodes
  .filter((row) =>
    row.code.startsWith("blank-") &&
    /(?:^|-)(?:semantic|actor|polarity|condition|cause|scope|role)(?:-|$)/.test(row.code),
  )
  .map((row) => row.code);
const semanticIntegrityCodeSet = new Set(semanticIntegrityCodes);

const semanticRoleResults = cases.semanticRolePairs.map((pair) => {
  const faithfulTokenCount = lexicalTokenCount(pair.faithful);
  const defectTokenCount = lexicalTokenCount(pair.defect);
  assert.equal(
    faithfulTokenCount,
    defectTokenCount,
    `${pair.id} must be lexically token-balanced`,
  );
  const faithfulIssues = semanticIssues(pair, pair.faithful, pair.defect);
  const defectIssues = semanticIssues(pair, pair.defect, pair.faithful);
  const semanticErrors = (issues: QualityIssue[]) => issues.filter(
    (issue) => issue.severity === "error" && semanticIntegrityCodeSet.has(issue.code),
  );
  return {
    id: pair.id,
    dimension: pair.dimension,
    referenceJudgment: pair.referenceJudgment,
    lexicalControl: {
      faithfulTokenCount,
      defectTokenCount,
      equal: faithfulTokenCount === defectTokenCount,
      certificationLimit: "equal token counts control surface length only; they do not certify proposition preservation",
    },
    faithfulIssues,
    defectIssues,
    faithfulSemanticErrors: semanticErrors(faithfulIssues),
    defectSemanticErrors: semanticErrors(defectIssues),
    defectBlockedForSemanticIntegrity: semanticErrors(defectIssues).length > 0,
  };
});

const narrowPolarity = cases.narrowPolarityPositiveControl;
const narrowPolarityResult = {
  faithful: blankParaphrase.findBlankParaphrasePolarityIssue(
    narrowPolarity.originalExpression,
    narrowPolarity.faithful,
  ),
  defect: blankParaphrase.findBlankParaphrasePolarityIssue(
    narrowPolarity.originalExpression,
    narrowPolarity.defect,
  ),
  expectedDefectCode: narrowPolarity.expectedDefectCode,
  interpretation: "positive control proves the existing polarity gate is alive, but only for its narrow resist-the-temptation-to-reduce template",
};
assert.equal(narrowPolarityResult.faithful, null);
assert.equal(narrowPolarityResult.defect?.code, narrowPolarity.expectedDefectCode);

const tokenProxy = cases.tokenProxyCollision;
const tokenProxyResult = {
  faithfulCompression: blankParaphrase.findBlankParaphraseDifficultyIssue(
    tokenProxy.faithfulCompression,
    tokenProxy.originalExpression,
    tokenProxy.difficulty,
  ),
  genericMeaningLoss: blankParaphrase.findBlankParaphraseDifficultyIssue(
    tokenProxy.genericMeaningLoss,
    tokenProxy.originalExpression,
    tokenProxy.difficulty,
  ),
  policy: policyFor(tokenProxy.expectedSharedCode),
  conclusion: "the same token-thinness code fires for a plausible faithful compression and a generic meaning-loss phrase; it cannot certify semantic roles",
};
assert.equal(tokenProxyResult.faithfulCompression?.code, tokenProxy.expectedSharedCode);
assert.equal(tokenProxyResult.genericMeaningLoss?.code, tokenProxy.expectedSharedCode);

const subjectSlotQuestion = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "_____ is not whether institutions should respond, but how they should balance speed with fairness.",
  originalExpression: "the central challenge",
  correctAnswer: "1",
  answerLogic: "The correct completion must fill the nominal subject slot.",
  explanation: "핵심 과제가 무엇인지 묻는 문장 구조를 확인한다.",
  options: [
    { label: "1", text: "balancing speed with fairness" },
    { label: "2", text: "immediate institutional enforcement" },
    { label: "3", text: "complete procedural uniformity" },
    { label: "4", text: "measuring only short term outcomes" },
    { label: "5", text: "avoiding public deliberation" },
  ],
};
const subjectSlotIssues = selectCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: subjectSlotQuestion,
  requestedDifficulty: "BASIC",
  blankInferenceParaphraseAnswer: true,
}), ["blank-paraphrase-subject-slot-mismatch"]);

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
  explanation: "글 전체가 공동 판단과 신뢰의 관계를 설명한다.",
};
const topicLanguageIssues = selectCodes(validateQuestionQuality({
  typeId: "TOPIC",
  question: topicQuestion,
  requestedDifficulty: "INTERMEDIATE",
  optionLanguage: "en",
}), ["topic-option-language"]);

const impliedQuestion = {
  direction: "밑줄 친 표현이 의미하는 바로 가장 적절한 것은?",
  difficulty: "INTERMEDIATE",
  passageWithUnderline:
    "The committee learned that __speed can become a tax__ on careful judgment.",
  underlinedExpression: "speed can become a tax",
  options: [
    { label: "1", text: "rapid action can impose hidden costs on sound judgment" },
    { label: "2", text: "빠른 행동은 언제나 정확한 결정을 만든다" },
    { label: "3", text: "committees should eliminate every deadline" },
    { label: "4", text: "careful judgment requires no institutional support" },
    { label: "5", text: "tax policy determines the pace of every meeting" },
  ],
  correctAnswer: "1",
  impliedMeaning: "지나친 속도는 신중한 판단에 숨은 비용을 부과할 수 있다.",
  explanation: "tax는 판단 비용을 비유한다.",
};
const impliedLanguageIssues = selectCodes(validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: impliedQuestion,
  requestedDifficulty: "INTERMEDIATE",
  optionLanguage: "en",
}), ["implied-meaning-option-language"]);
const impliedKoreanSettingIssues = selectCodes(validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: impliedQuestion,
  requestedDifficulty: "INTERMEDIATE",
  optionLanguage: "ko",
}), ["implied-meaning-option-language"]);

const residualBase = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "mutual confidence",
  correctAnswer: "1",
  answerLogic: "The transformed answer restates the source phrase.",
  explanation: "정답은 원문의 의미를 바꾸어 표현한다.",
  options: [
    { label: "1", text: "shared trust" },
    { label: "2", text: "formal authority" },
    { label: "3", text: "private incentives" },
    { label: "4", text: "rapid enforcement" },
    { label: "5", text: "fixed outcomes" },
  ],
};
const residualVisibleQuestion = {
  ...residualBase,
  passageWithBlank: "_____ anchors the debate. Later, shared trust anchors the settlement.",
};
const residualHiddenQuestion = {
  ...residualBase,
  passageWithBlank: "_____ anchors the debate. Later, procedural review anchors the settlement.",
};
const residualVisibleIssues = selectCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: residualVisibleQuestion,
  passage: "Mutual confidence anchors the debate. Later, shared trust anchors the settlement.",
  requestedDifficulty: "BASIC",
  blankInferenceParaphraseAnswer: true,
}), ["blank-paraphrase-correct-residual-visible"]);
const residualHiddenIssues = selectCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: residualHiddenQuestion,
  passage: "Mutual confidence anchors the debate. Later, procedural review anchors the settlement.",
  requestedDifficulty: "BASIC",
  blankInferenceParaphraseAnswer: true,
}), ["blank-paraphrase-correct-residual-visible"]);

const explanationOptions = [
  { label: "1", text: "reshape how we recall past events" },
  { label: "2", text: "gradually get replaced by objective facts" },
  { label: "3", text: "settle only as fixed opinions" },
  { label: "4", text: "come to define who we understand ourselves to be" },
  { label: "5", text: "determine every judgment we make" },
];
function explanationNumberingIssues(explanation: string): QualityIssue[] {
  return selectCodes(validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: {
      direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
      passageWithBlank: "Narratives matter. Over time the stories we tell _____ in the end.",
      originalExpression: "come to define who we understand ourselves to be",
      blankAnswerMode: "PARAPHRASE",
      options: explanationOptions,
      correctAnswer: "4",
      explanation,
      keyPoints: ["근거 문장 종합", "과협소 오답 구분", "인과 방향"],
      difficulty: "KILLER",
    },
    requestedDifficulty: "KILLER",
  }), ["blank-explanation-step-numbering", "blank-explanation-narrative-circled-numbering"]);
}
const narrativeNumberingIssues = explanationNumberingIssues(
  "① 먼저 빈칸 앞의 대조 관계를 확인한다. ② 이어서 핵심 근거가 어느 결론으로 수렴하는지 살핀다. ③ 마지막으로 두 문장을 종합해 정답을 결정한다.",
);
const terseOptionReferenceIssues = explanationNumberingIssues(
  "①은 범위를 과장해 오답이다. ②는 인과를 뒤집어 오답이다. ④는 지문의 결론과 정확히 일치하므로 정답이다.",
);

const markedForKeypoints = [
  { label: "(A)", pointCode: "d", expression: "are" },
  { label: "(B)", pointCode: "e", expression: "where" },
  { label: "(C)", pointCode: "c", expression: "rooted" },
];
const ghostKeypoint = grammarShared.findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "(F) 분사구문의 능수동"],
  markedForKeypoints,
);
const metadataDriftKeypoint = grammarShared.findGrammarKeypointChoiceMismatch(
  ["(B) 관계대명사 where는 장소 선행사를 받는다"],
  markedForKeypoints,
  "(B)",
);
const terminologyError = grammarShared.findGrammarTerminologyError(
  "전사구는 전치사와 명사가 결합한 표현이다.",
);
const terminologyRegister = grammarShared.findGrammarTerminologyRegister(
  "통사적으로 결합한 구조를 확인한다.",
);

const longParagraphA =
  "Institutions first gather evidence from several independent sources before acting. They then compare the sources carefully so that one vivid report does not dominate the final decision.";
const longParagraphB =
  "Next, reviewers identify which assumptions connect the evidence to the proposed action. This step makes hidden disagreements visible and allows the group to test them directly.";
const longParagraphC =
  "Finally, the group records why the chosen action follows from the evidence. The record helps later reviewers distinguish a justified revision from an arbitrary change of course.";
function sentenceOrderQuestion(givenSentence: string, paragraphB = longParagraphB) {
  return {
    direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
    difficulty: "INTERMEDIATE",
    givenSentence,
    paragraphs: [
      { label: "(A)", text: longParagraphA },
      { label: "(B)", text: paragraphB },
      { label: "(C)", text: longParagraphC },
    ],
    options: [
      { label: "1", text: "(B)-(A)-(C)" },
      { label: "2", text: "(A)-(C)-(B)" },
      { label: "3", text: "(B)-(C)-(A)" },
      { label: "4", text: "(C)-(A)-(B)" },
      { label: "5", text: "(C)-(B)-(A)" },
    ],
    correctAnswer: "1",
    explanation: "검토 단계와 기록 단계의 연결 순서를 따른다.",
  };
}
function sentenceOrderIssues(question: Record<string, unknown>) {
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  });
}
const givenLabelIssues = selectCodes(sentenceOrderIssues(sentenceOrderQuestion(
  "A reliable process begins with a shared question. (A) This leaked label belongs to the paragraph area.",
)), ["sentence-order-given-contains-paragraph-label", "sentence-order-given-too-long"]);
const emptyParagraphIssues = selectCodes(sentenceOrderIssues(sentenceOrderQuestion(
  "A reliable process begins with a shared question.",
  " \n\t ",
)), ["sentence-order-empty-paragraph", "sentence-order-paragraph-too-short", "sentence-order-paragraph-too-thin"]);
const formatOnlyParagraphIssues = selectCodes(sentenceOrderIssues(sentenceOrderQuestion(
  "A reliable process begins with a shared question.",
  "\u200B\u2060\uFEFF",
)), ["sentence-order-empty-paragraph", "sentence-order-paragraph-too-short", "sentence-order-paragraph-too-thin"]);
const shortCompleteParagraphIssues = selectCodes(sentenceOrderIssues(sentenceOrderQuestion(
  "A reliable process begins with a shared question.",
  "Reviewers compare the evidence carefully before acting.",
)), ["sentence-order-empty-paragraph", "sentence-order-paragraph-too-short", "sentence-order-paragraph-too-thin"]);

const summaryPassage =
  "Careful teams compare independent measurements before making a decision. " +
  "This practice reduces the risk that one noisy result will determine the outcome.";
const summaryBase = {
  direction: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  summaryWithBlanks:
    "Teams can make more (A) decisions by comparing measurements, thereby reducing their reliance on (B) results.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / consistent", blankA: "reliable", blankB: "consistent" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / consistent", blankA: "hasty", blankB: "consistent" },
    { label: "5", text: "random / stable", blankA: "random", blankB: "stable" },
  ],
  correctAnswer: "1",
  explanation: "Independent measurements support reliable decisions and reduce reliance on noisy results.",
};
function summaryDirectionIssues(direction: string): QualityIssue[] {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...summaryBase, direction },
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) =>
    issue.code.startsWith("summary-mc-direction") || issue.code === "summary-mc-missing-direction"
  );
}
const summaryMissingDirection = summaryDirectionIssues("   ");
const summaryWrongTaskDirection = summaryDirectionIssues(
  "Which of the underlined expressions is grammatically incorrect?",
);
const summaryValidWithoutLabels = summaryDirectionIssues(
  "Complete the summary by choosing the most appropriate pair of words.",
);

function summaryCollocationIssues(summaryWithBlanks: string, blankA: string, blankB: string) {
  const question = {
    direction: "Complete the summary by choosing the best words for (A) and (B).",
    summaryWithBlanks,
    blanks: [
      { label: "(A)", answer: blankA },
      { label: "(B)", answer: blankB },
    ],
    options: [
      { label: "1", text: `${blankA} / ${blankB}`, blankA, blankB },
      { label: "2", text: `${blankA} / delay`, blankA, blankB: "delay" },
      { label: "3", text: `scarcity / ${blankB}`, blankA: "scarcity", blankB },
      { label: "4", text: "scarcity / delay", blankA: "scarcity", blankB: "delay" },
      { label: "5", text: "confusion / retreat", blankA: "confusion", blankB: "retreat" },
    ],
    correctAnswer: "1",
    explanation: "The correct pair preserves the relationship expressed in the passage.",
  };
  return selectCodes(validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question,
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  }), ["summary-mc-correct-completion-ungrammatical", "summary-mc-awkward-collocation"]);
}
const malformedSummaryCompletion = summaryCollocationIssues(
  "The policy promises (A) to (B).",
  "equity",
  "learning",
);
const grammaticalSummaryCompletion = summaryCollocationIssues(
  "This is a (A) of access to (B).",
  "question",
  "learning",
);

function issueIsError(issues: QualityIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code && issue.severity === "error");
}

const allSemanticDefectsBlocked = semanticRoleResults.every(
  (row) => row.defectBlockedForSemanticIntegrity,
);

const remediationRows = [
  {
    priorCode: "blank-paraphrase-subject-slot-mismatch",
    priorClass: "IMMEDIATE_REMOVAL",
    replacementCode: "blank-paraphrase-subject-slot-mismatch",
    evidence: subjectSlotIssues,
    remediated: issueIsError(subjectSlotIssues, "blank-paraphrase-subject-slot-mismatch") &&
      isHardThroughSalvage("blank-paraphrase-subject-slot-mismatch"),
  },
  {
    priorCode: "topic-option-language",
    priorClass: "IMMEDIATE_REMOVAL",
    replacementCode: "topic-option-language",
    evidence: topicLanguageIssues,
    remediated: issueIsError(topicLanguageIssues, "topic-option-language") &&
      isHardThroughSalvage("topic-option-language"),
  },
  {
    priorCode: "implied-meaning-option-language",
    priorClass: "IMMEDIATE_REMOVAL",
    replacementCode: "implied-meaning-option-language",
    evidence: { englishContract: impliedLanguageIssues, koreanSettingControl: impliedKoreanSettingIssues },
    remediated: issueIsError(impliedLanguageIssues, "implied-meaning-option-language") &&
      impliedKoreanSettingIssues.some((issue) => issue.severity === "warning") &&
      isHardThroughSalvage("implied-meaning-option-language"),
  },
  {
    priorCode: "blank-explanation-step-numbering",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "blank-explanation-narrative-circled-numbering",
    evidence: { defect: narrativeNumberingIssues, legitimateControl: terseOptionReferenceIssues },
    remediated: issueIsError(
      narrativeNumberingIssues,
      "blank-explanation-narrative-circled-numbering",
    ) &&
      !terseOptionReferenceIssues.some((issue) =>
        issue.code === "blank-explanation-narrative-circled-numbering"
      ) &&
      isHardThroughSalvage("blank-explanation-narrative-circled-numbering"),
  },
  {
    priorCode: "blank-paraphrase-answer-not-transformed",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "blank-paraphrase-correct-residual-visible",
    evidence: { defect: residualVisibleIssues, legitimateControl: residualHiddenIssues },
    remediated: issueIsError(
      residualVisibleIssues,
      "blank-paraphrase-correct-residual-visible",
    ) && residualHiddenIssues.length === 0 &&
      isHardThroughSalvage("blank-paraphrase-correct-residual-visible"),
  },
  {
    priorCode: "blank-paraphrase-correct-too-thin",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: null,
    evidence: { semanticRoleResults, tokenProxyResult, semanticIntegrityCodes },
    remediated: allSemanticDefectsBlocked,
  },
  {
    priorCode: "grammar-keypoint-choice-mismatch",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "grammar-keypoint-nonexistent-label",
    evidence: { ghostKeypoint, metadataDriftKeypoint },
    remediated: Boolean(ghostKeypoint) && Boolean(metadataDriftKeypoint) &&
      isHardThroughSalvage("grammar-keypoint-nonexistent-label") &&
      SALVAGE_RELAXABLE_CODES.has("grammar-keypoint-choice-mismatch"),
  },
  {
    priorCode: "grammar-nonstandard-terminology",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "grammar-terminology-error / grammar-terminology-register",
    evidence: { terminologyError, terminologyRegister },
    remediated: Boolean(terminologyError) && Boolean(terminologyRegister) &&
      isHardThroughSalvage("grammar-terminology-error") &&
      SALVAGE_RELAXABLE_CODES.has("grammar-terminology-register"),
  },
  {
    priorCode: "sentence-order-given-too-long",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "sentence-order-given-contains-paragraph-label",
    evidence: givenLabelIssues,
    remediated: issueIsError(
      givenLabelIssues,
      "sentence-order-given-contains-paragraph-label",
    ) && isHardThroughSalvage("sentence-order-given-contains-paragraph-label"),
  },
  {
    priorCode: "sentence-order-paragraph-too-short",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "sentence-order-empty-paragraph",
    evidence: { empty: emptyParagraphIssues, formatOnly: formatOnlyParagraphIssues, shortControl: shortCompleteParagraphIssues },
    remediated: issueIsError(emptyParagraphIssues, "sentence-order-empty-paragraph") &&
      issueIsError(formatOnlyParagraphIssues, "sentence-order-empty-paragraph") &&
      !shortCompleteParagraphIssues.some((issue) => issue.code === "sentence-order-empty-paragraph") &&
      isHardThroughSalvage("sentence-order-empty-paragraph"),
  },
  {
    priorCode: "sentence-order-paragraph-too-thin",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "sentence-order-empty-paragraph",
    evidence: { empty: emptyParagraphIssues, formatOnly: formatOnlyParagraphIssues, shortControl: shortCompleteParagraphIssues },
    remediated: issueIsError(emptyParagraphIssues, "sentence-order-empty-paragraph") &&
      issueIsError(formatOnlyParagraphIssues, "sentence-order-empty-paragraph") &&
      !shortCompleteParagraphIssues.some((issue) => issue.code === "sentence-order-empty-paragraph") &&
      isHardThroughSalvage("sentence-order-empty-paragraph"),
  },
  {
    priorCode: "summary-mc-awkward-collocation",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "summary-mc-correct-completion-ungrammatical",
    evidence: { defect: malformedSummaryCompletion, grammaticalControl: grammaticalSummaryCompletion },
    remediated: issueIsError(
      malformedSummaryCompletion,
      "summary-mc-correct-completion-ungrammatical",
    ) &&
      !grammaticalSummaryCompletion.some((issue) =>
        issue.code === "summary-mc-correct-completion-ungrammatical"
      ) &&
      isHardThroughSalvage("summary-mc-correct-completion-ungrammatical"),
  },
  {
    priorCode: "summary-mc-direction-frame",
    priorClass: "SPLIT_REQUIRED",
    replacementCode: "summary-mc-missing-direction / summary-mc-direction-task-mismatch",
    evidence: {
      missing: summaryMissingDirection,
      competingTask: summaryWrongTaskDirection,
      validWithoutLabels: summaryValidWithoutLabels,
    },
    remediated: issueIsError(summaryMissingDirection, "summary-mc-missing-direction") &&
      issueIsError(summaryWrongTaskDirection, "summary-mc-direction-task-mismatch") &&
      summaryValidWithoutLabels.some((issue) =>
        issue.code === "summary-mc-direction-frame" && issue.severity === "warning"
      ) &&
      isHardThroughSalvage("summary-mc-missing-direction") &&
      isHardThroughSalvage("summary-mc-direction-task-mismatch"),
  },
];

assert.deepEqual(
  remediationRows.filter((row) => row.priorClass === "IMMEDIATE_REMOVAL").map((row) => row.priorCode),
  cases.priorAuditFindings.immediateRemoval,
);
assert.deepEqual(
  remediationRows.filter((row) => row.priorClass === "SPLIT_REQUIRED").map((row) => row.priorCode),
  cases.priorAuditFindings.splitRequired,
);

const remediatedCount = remediationRows.filter((row) => row.remediated).length;
const unresolvedRows = remediationRows.filter((row) => !row.remediated);
const typeCoverage = ACTIVE_ENGLISH_TYPES.map((typeId) => {
  const codes = inventoryCodes
    .filter((row) => row.activeEnglishTypeScopes.includes(typeId))
    .map((row) => row.code);
  return { typeId, emittedCodeCount: codes.length, emittedCodes: codes };
});

const priorInventoryPath = path.join(PRIOR_AUDIT_DIR, "INVENTORY.json");
const priorAuditPath = path.join(PRIOR_AUDIT_DIR, "AUDIT.md");
const priorArtifact = {
  inventoryHash: sha256(readFileSync(priorInventoryPath)),
  auditHash: sha256(readFileSync(priorAuditPath)),
};

const inventory = {
  schemaVersion: 2,
  mode: "fresh-static-English-emitter-and-policy-reconstruction",
  repoHead,
  sourceSnapshotHash,
  scopeNote:
    "Every literal English quality-emitter code and its raw severity is reconstructed from add() AST sites plus helper-return code sites. Type scopes are exact for named families and conservatively all-active for shared generic pre/post-dispatch gates. KO dynamic dispatch is explicitly excluded.",
  counts: {
    activeEnglishTypes: ACTIVE_ENGLISH_TYPES.length,
    emittedEnglishQualityCodes: inventoryCodes.length,
    rawErrorCapable: inventoryCodes.filter((row) => row.rawSeverities.includes("error")).length,
    rawWarningCapable: inventoryCodes.filter((row) => row.rawSeverities.includes("warning")).length,
    dualRawSeverity: inventoryCodes.filter((row) => row.rawSeverities.length > 1).length,
    shipFirst: SHIP_FIRST_WARNING_CODES.size,
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.size,
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.size,
    policyUnion: policyUnion.length,
    policyOnlyNotEmittedByEnglishQualityTree: policyOnlyCodes.length,
    dynamicAddSites: dynamicAddSites.length,
  },
  dynamicAddSites,
  policyOnlyCodes,
  stalePriorCodes,
  typeCoverage,
  codes: inventoryCodes,
};

const overallVerdict = allSemanticDefectsBlocked && unresolvedRows.length === 0 ? "PASS" : "BLOCK";
const results = {
  schemaVersion: 2,
  mode: "offline-zero-call-fresh-policy-severity-reaudit",
  repoHead,
  sourceSnapshotHash,
  constraints: cases.constraints,
  counts: {
    apiCandidatesCreated: 0,
    activeEnglishTypes: ACTIVE_ENGLISH_TYPES.length,
    semanticRolePairs: semanticRoleResults.length,
    tokenBalancedPairs: semanticRoleResults.filter((row) => row.lexicalControl.equal).length,
    semanticDefectsBlocked: semanticRoleResults.filter((row) => row.defectBlockedForSemanticIntegrity).length,
    priorSafetyFindings: remediationRows.length,
    priorSafetyFindingsRemediated: remediatedCount,
    priorSafetyFindingsUnresolved: unresolvedRows.length,
    stalePolicyEntriesStillWithoutEnglishEmitter: stalePriorCodes.filter(
      (row) => row.stillNoEnglishQualityEmitter,
    ).length,
  },
  verdict: {
    overall: overallVerdict,
    priorImmediateRemovalAndSplitRemediation:
      `${remediatedCount}/${remediationRows.length} remediated`,
    blockingReasons: [
      ...unresolvedRows.map((row) =>
        `${row.priorCode}: prior split-required safety finding remains unresolved`
      ),
      ...(!allSemanticDefectsBlocked
        ? [
            `BLANK_INFERENCE semantic-role preservation is not certified: ${semanticRoleResults.filter((row) => !row.defectBlockedForSemanticIntegrity).map((row) => row.dimension).join(", ")} defect controls evade the semantic-integrity gate`,
          ]
        : []),
    ],
    nonBlockingDebt: stalePriorCodes
      .filter((row) => row.stillNoEnglishQualityEmitter)
      .map((row) => `${row.code}: stale policy membership remains`),
  },
  semanticIntegrityCodeDiscovery: {
    matchedCodes: semanticIntegrityCodes,
    limit:
      "Name-based discovery is not itself a semantic oracle; paired proposition controls below are the behavioral evidence.",
  },
  semanticRoleResults,
  narrowPolarityPositiveControl: narrowPolarityResult,
  tokenProxyCollision: tokenProxyResult,
  priorAuditComparison: remediationRows,
  stalePolicyComparison: stalePriorCodes,
  priorArtifact,
};

writeStable(path.join(HERE, "emitted-code-inventory.json"), inventory);
writeStable(path.join(HERE, "results.json"), results);

const artifactFiles = [
  "cases.json",
  "build-reaudit.mts",
  "verify-reaudit.mts",
  "emitted-code-inventory.json",
  "results.json",
  ...(existsSync(path.join(HERE, "AUDIT.md")) ? ["AUDIT.md"] : []),
];
const manifest = {
  schemaVersion: 1,
  repoHead,
  sourceSnapshotHash,
  sourceFileHashes,
  artifactFileHashes: Object.fromEntries(
    artifactFiles.map((name) => [name, sha256(readFileSync(path.join(HERE, name)))]),
  ),
  priorArtifact,
  invariants: {
    apiCandidatesCreated: 0,
    externalModelCalls: 0,
    databaseCalls: 0,
    productionFilesEditedByThisAudit: 0,
    verdict: overallVerdict,
  },
};
writeStable(path.join(HERE, "manifest.json"), manifest);

process.stdout.write(stableJson({
  ok: true,
  verdict: overallVerdict,
  sourceSnapshotHash,
  emittedEnglishQualityCodes: inventoryCodes.length,
  remediated: `${remediatedCount}/${remediationRows.length}`,
  semanticDefectsBlocked: `${results.counts.semanticDefectsBlocked}/${semanticRoleResults.length}`,
  output: ["emitted-code-inventory.json", "results.json", "manifest.json"],
}));
