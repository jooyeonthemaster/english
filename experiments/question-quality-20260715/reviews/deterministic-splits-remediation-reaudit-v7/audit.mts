import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as blindHoldoutModule from "./blind-holdout-cases.mjs";
import * as targetedSummaryModule from "./targeted-summary-answer-object-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const reviewsRoot = path.dirname(here);
const v4Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v4");
const v5Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v5");
const v6Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v6");
const v6HarnessPath = path.join(v6Dir, "audit.mts");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyError } =
  grammarRuntime;

type QualityIssue = { severity?: string; code: string; message?: string };
type BlindCase = {
  id: string;
  family: string;
  expectedFlag: boolean;
  rationale: string;
  input: Record<string, unknown>;
};
type V6Replay = {
  verdict: "PASS" | "BLOCK";
  summary: { total: number; pass: number; fail: number; failedCaseIds: string[] };
  failures: Array<Record<string, unknown>>;
  safety: Record<string, number>;
  provenance: {
    auditScriptSha256: string;
    auditedSourceAndTestSha256: Record<string, string>;
  };
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(absolutePath: string): string {
  return sha256(readFileSync(absolutePath));
}

function repoFileSha(relativePath: string): string {
  return fileSha(path.join(repoRoot, relativePath));
}

function hasCode(issues: QualityIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function targetIssues(issues: QualityIssue[], codes: string[]): QualityIssue[] {
  const accepted = new Set(codes);
  return issues.filter((issue) => accepted.has(issue.code));
}

// ---------------------------------------------------------------------------
// Frozen v6 artifact verification and current semantic replay.
// ---------------------------------------------------------------------------

const frozenV6Results = JSON.parse(
  readFileSync(path.join(v6Dir, "RESULTS.json"), "utf8"),
) as V6Replay;
assert.equal(frozenV6Results.verdict, "BLOCK");
assert.equal(frozenV6Results.summary.total, 904);
assert.equal(frozenV6Results.summary.pass, 894);
assert.equal(frozenV6Results.summary.fail, 10);
assert.equal(frozenV6Results.failures.length, 10);
assert.equal(
  fileSha(v6HarnessPath),
  frozenV6Results.provenance.auditScriptSha256,
  "frozen v6 audit script drift",
);

const v6ManifestPath = path.join(v6Dir, "MANIFEST.sha256");
const v6ManifestEntries = readFileSync(v6ManifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid frozen v6 manifest line: ${line}`);
    return { expectedHash: match[1], relativePath: match[2] };
  });
assert.equal(v6ManifestEntries.length, 4);
for (const entry of v6ManifestEntries) {
  assert.equal(
    fileSha(path.join(v6Dir, entry.relativePath)),
    entry.expectedHash,
    `frozen v6 artifact drift: ${entry.relativePath}`,
  );
}

const currentV6Replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, v6HarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as V6Replay;
assert.equal(currentV6Replay.summary.total, 904);
assert.equal(currentV6Replay.summary.pass, 904);
assert.equal(currentV6Replay.summary.fail, 0);
assert.equal(currentV6Replay.verdict, "PASS");
assert.deepEqual(currentV6Replay.summary.failedCaseIds, []);
assert.deepEqual(currentV6Replay.failures, []);
for (const [name, count] of Object.entries(currentV6Replay.safety)) {
  assert.equal(count, 0, `v6 current replay safety counter ${name}`);
}

const v6FrozenSourceAndTestProvenance = Object.fromEntries(
  Object.entries(frozenV6Results.provenance.auditedSourceAndTestSha256).map(
    ([relativePath, frozenHash]) => {
      const currentHash = repoFileSha(relativePath);
      return [
        relativePath,
        {
          frozenSha256: frozenHash,
          currentSha256: currentHash,
          matchesFrozen: currentHash === frozenHash,
        },
      ];
    },
  ),
);

// ---------------------------------------------------------------------------
// Production-shaped fixtures. Only the named split signal is scored; unrelated
// diagnostics from deliberately minimal fixtures cannot create pass credit.
// ---------------------------------------------------------------------------

const summaryPassage =
  "Careful reviewers compare several independent observations before accepting a conclusion. " +
  "This practice prevents one noisy measurement from controlling the result.";
const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Reviewers make more (A) judgments by limiting reliance on (B) observations.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / stable", blankA: "reliable", blankB: "stable" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / stable", blankA: "hasty", blankB: "stable" },
    { label: "5", text: "random / fixed", blankA: "random", blankB: "fixed" },
  ],
  correctAnswer: "1",
  explanation:
    "Several observations support reliable judgments and reduce dependence on noisy ones.",
};

function summaryDirectionIssues(direction: string): QualityIssue[] {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...summaryBase, direction },
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];
}

const blankBase = {
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "Institutions preserve effects of earlier choices. Their long-term consequence is _____.",
  originalExpression: "lasting limits on how institutions can respond",
  answerLogic:
    "The answer restates persistent institutional limits without copying the source phrase.",
  options: [
    { label: "1", text: "durable constraints on institutional choice" },
    { label: "2", text: "a temporary administrative convenience" },
    { label: "3", text: "an immediate expansion of discretion" },
    { label: "4", text: "a symbolic public gesture" },
    { label: "5", text: "an easily reversible procedural choice" },
  ],
  correctAnswer: "1",
  explanation: "Earlier choices can constrain what institutions later do.",
};

function blankIssues(question: Record<string, unknown>): QualityIssue[] {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage:
      "Institutions preserve effects of earlier choices, creating lasting limits on later responses.",
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  }) as QualityIssue[];
}

const sentenceOrderBase = {
  givenSentence:
    "A shared observation establishes the context in which the following events occur.",
  paragraphs: [
    {
      label: "(A)",
      text:
        "Observers first recorded the baseline at sunrise. They stored every measurement in a shared archive.",
    },
    {
      label: "(B)",
      text:
        "A second team checked the archive after noon. Its independent readings confirmed the initial pattern.",
    },
    {
      label: "(C)",
      text:
        "Both teams then compared their methods carefully. The agreement supported a common conclusion.",
    },
  ],
  options: [
    { label: "1", text: "(A)-(B)-(C)" },
    { label: "2", text: "(A)-(C)-(B)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(B)-(C)-(A)" },
    { label: "5", text: "(C)-(A)-(B)" },
  ],
  correctAnswer: "1",
};

function sentenceOrderIssues(input: Record<string, unknown>): QualityIssue[] {
  const paragraphInput = input.paragraphs as Record<string, string>;
  const paragraphs = ["A", "B", "C"].map((label) => ({
    label: `(${label})`,
    text: paragraphInput[label],
  }));
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question: {
      ...sentenceOrderBase,
      givenSentence: input.givenText,
      paragraphs,
    },
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];
}

function primaryInput(entry: BlindCase): string {
  switch (entry.family) {
    case "blank_explanation_step_numbering":
    case "grammar_terminology_accuracy":
      return String(entry.input.explanation);
    case "blank_paraphrase_residual_visibility":
      return JSON.stringify({ answer: entry.input.answer, passage: entry.input.passage });
    case "grammar_keypoint_nonexistent_label":
      return JSON.stringify({
        declaredLabels: entry.input.declaredLabels,
        explanation: entry.input.explanation,
      });
    case "sentence_order_paragraph_integrity":
      return JSON.stringify(entry.input.paragraphs);
    case "summary_mc_direction_answer_object":
      return String(entry.input.direction);
    default:
      throw new Error(`unknown family: ${entry.family}`);
  }
}

function observe(entry: BlindCase): { observedFlag: boolean; scoredIssues: QualityIssue[] } {
  switch (entry.family) {
    case "blank_explanation_step_numbering": {
      const issues = blankIssues({
        ...blankBase,
        explanation: entry.input.explanation,
      });
      const scoredIssues = targetIssues(issues, [
        "blank-explanation-narrative-circled-numbering",
      ]);
      return { observedFlag: scoredIssues.length > 0, scoredIssues };
    }
    case "blank_paraphrase_residual_visibility": {
      const answer = String(entry.input.answer);
      const issues = blankIssues({
        ...blankBase,
        passageWithBlank: entry.input.passage,
        options: [{ label: "1", text: answer }, ...blankBase.options.slice(1)],
      });
      const scoredIssues = targetIssues(issues, [
        "blank-paraphrase-correct-residual-visible",
      ]);
      return { observedFlag: scoredIssues.length > 0, scoredIssues };
    }
    case "grammar_keypoint_nonexistent_label": {
      const markedExpressions = (entry.input.declaredLabels as string[]).map(
        (label, index) => ({ label, pointCode: String.fromCharCode(97 + (index % 10)) }),
      );
      const finding = findGrammarKeypointNonexistentLabel(
        [entry.input.explanation],
        markedExpressions,
      );
      return {
        observedFlag: Boolean(finding),
        scoredIssues: finding
          ? [{ code: "grammar-keypoint-nonexistent-label", message: finding }]
          : [],
      };
    }
    case "grammar_terminology_accuracy": {
      const finding = findGrammarTerminologyError(entry.input.explanation);
      return {
        observedFlag: Boolean(finding),
        scoredIssues: finding
          ? [{ code: "grammar-terminology-error", message: finding }]
          : [],
      };
    }
    case "sentence_order_paragraph_integrity": {
      const issues = sentenceOrderIssues(entry.input);
      const structuralLabelCodes = [
        "sentence-order-text-contains-paragraph-label",
        "sentence-order-paragraph-body-label",
        "sentence-order-paragraph-label-contamination",
      ];
      const scoredIssues = issues.filter(
        (issue) =>
          issue.code === "sentence-order-empty-paragraph" ||
          structuralLabelCodes.includes(issue.code) ||
          (issue.code === "sentence-order-paragraph-too-short" &&
            /got\s+0\b/i.test(issue.message ?? "")),
      );
      return { observedFlag: scoredIssues.length > 0, scoredIssues };
    }
    case "summary_mc_direction_answer_object": {
      const issues = summaryDirectionIssues(String(entry.input.direction));
      const scoredIssues = targetIssues(issues, ["summary-mc-direction-task-mismatch"]);
      return { observedFlag: scoredIssues.length > 0, scoredIssues };
    }
    default:
      throw new Error(`unknown family: ${entry.family}`);
  }
}

// ---------------------------------------------------------------------------
// Blind seal, novelty, balance, and semantic execution.
// ---------------------------------------------------------------------------

const blindSeal = JSON.parse(readFileSync(path.join(here, "BLIND-SEAL.json"), "utf8"));
const blindHoldoutPath = path.join(here, "blind-holdout-cases.mjs");
assert.equal(fileSha(blindHoldoutPath), blindSeal.holdoutSha256);
assert.equal(blindSeal.semanticCaseCount, 224);

const blindCases = blindHoldoutModule.cases as BlindCase[];
const targetedCases = targetedSummaryModule.cases as BlindCase[];
assert.equal(blindCases.length, 224);
assert.equal(targetedCases.length, 32);
const cases = [...blindCases, ...targetedCases];
assert.equal(cases.length, 256);
assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
assert.ok(cases.every((entry) => entry.id.startsWith("v7-")));
assert.ok(cases.every((entry) => entry.rationale.length >= 50));

const primaryInputs = cases.map(primaryInput);
assert.equal(new Set(primaryInputs).size, primaryInputs.length);

const priorAuditSource = [v4Dir, v5Dir, v6Dir]
  .map((dir) => readFileSync(path.join(dir, "audit.mts"), "utf8"))
  .join("\n");
const priorAuditLiteralCollisionIds = cases
  .filter((entry) => priorAuditSource.includes(primaryInput(entry)))
  .map((entry) => entry.id);
assert.deepEqual(priorAuditLiteralCollisionIds, []);

const evaluated = cases.map((entry) => {
  const observation = observe(entry);
  return {
    ...entry,
    input: primaryInput(entry),
    observedFlag: observation.observedFlag,
    pass: entry.expectedFlag === observation.observedFlag,
    polarity: entry.expectedFlag ? "positive" : "negative",
    scoredIssues: observation.scoredIssues,
  };
});

const familyNames = [...new Set(evaluated.map((entry) => entry.family))];
assert.equal(familyNames.length, 6);
const familySummary = Object.fromEntries(
  familyNames.map((family) => {
    const familyCases = evaluated.filter((entry) => entry.family === family);
    const expectedPositive = familyCases.filter((entry) => entry.expectedFlag).length;
    const expectedNegative = familyCases.length - expectedPositive;
    const minimum = family === "summary_mc_direction_answer_object" ? 32 : 16;
    assert.ok(expectedPositive >= minimum, `${family}: positive minimum`);
    assert.ok(expectedNegative >= minimum, `${family}: negative minimum`);
    return [
      family,
      {
        total: familyCases.length,
        pass: familyCases.filter((entry) => entry.pass).length,
        fail: familyCases.filter((entry) => !entry.pass).length,
        expectedPositive,
        expectedNegative,
        observedPositive: familyCases.filter((entry) => entry.observedFlag).length,
        observedNegative: familyCases.filter((entry) => !entry.observedFlag).length,
        falseNegative: familyCases.filter(
          (entry) => entry.expectedFlag && !entry.observedFlag,
        ).length,
        falsePositive: familyCases.filter(
          (entry) => !entry.expectedFlag && entry.observedFlag,
        ).length,
      },
    ];
  }),
);

const positiveControls = evaluated.filter((entry) => entry.expectedFlag).length;
const negativeControls = evaluated.length - positiveControls;
assert.equal(positiveControls, 128);
assert.equal(negativeControls, 128);

const summaryCases = evaluated.filter(
  (entry) => entry.family === "summary_mc_direction_answer_object",
);
const requiredKoreanSourceVariants = [
  "본문상",
  "지문으로 볼 때",
  "글에 비추어",
  "제시 근거상",
];
const requiredSourceVariantCounts = Object.fromEntries(
  requiredKoreanSourceVariants.map((variant) => [
    variant,
    summaryCases.filter((entry) => entry.input.includes(variant)).length,
  ]),
);
assert.ok(Object.values(requiredSourceVariantCounts).every((count) => count >= 8));

const hardNegativeSummaryCases = summaryCases.filter(
  (entry) =>
    !entry.expectedFlag &&
    /(?:주장|진술|명제)/u.test(entry.input) &&
    /(?:근거|본문|지문|글|제시문)/u.test(entry.input) &&
    /(?:고르|선택|찾|결정)/u.test(entry.input) &&
    /(?:쌍|조합|짝)/u.test(entry.input),
);
assert.ok(hardNegativeSummaryCases.length >= 24);

const markerStyleSummary = Object.fromEntries(
  ["explicit_AB", "unlabeled_two_blanks"].map((style) => [
    style,
    {
      positive: cases.filter(
        (entry) =>
          entry.family === "summary_mc_direction_answer_object" &&
          entry.expectedFlag &&
          entry.input.markerStyle === style,
      ).length,
      negative: cases.filter(
        (entry) =>
          entry.family === "summary_mc_direction_answer_object" &&
          !entry.expectedFlag &&
          entry.input.markerStyle === style,
      ).length,
    },
  ]),
);
assert.deepEqual(markerStyleSummary, {
  explicit_AB: { positive: 32, negative: 32 },
  unlabeled_two_blanks: { positive: 16, negative: 16 },
});

const holdoutFailures = evaluated.filter((entry) => !entry.pass);
const falseNegativeIds = holdoutFailures
  .filter((entry) => entry.expectedFlag && !entry.observedFlag)
  .map((entry) => entry.id);
const falsePositiveIds = holdoutFailures
  .filter((entry) => !entry.expectedFlag && entry.observedFlag)
  .map((entry) => entry.id);
const failureIds = [...falseNegativeIds, ...falsePositiveIds];
assert.equal(failureIds.length, holdoutFailures.length);

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v7",
  verdict: failureIds.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total: currentV6Replay.summary.total + evaluated.length,
    pass: currentV6Replay.summary.pass + evaluated.length - failureIds.length,
    fail: failureIds.length,
    v6CurrentSemanticReplay: {
      total: currentV6Replay.summary.total,
      pass: currentV6Replay.summary.pass,
      fail: currentV6Replay.summary.fail,
      verdict: currentV6Replay.verdict,
      failedCaseIds: currentV6Replay.summary.failedCaseIds,
    },
    newHoldout: {
      total: evaluated.length,
      pass: evaluated.length - failureIds.length,
      fail: failureIds.length,
      minimumRequired: 224,
      blindCaseCount: blindCases.length,
      postBlindTargetedSupplementCount: targetedCases.length,
      families: familySummary,
      controlBalance: { positive: positiveControls, negative: negativeControls },
      summaryDirection: {
        positive: summaryCases.filter((entry) => entry.expectedFlag).length,
        negative: summaryCases.filter((entry) => !entry.expectedFlag).length,
        hardNegativeCount: hardNegativeSummaryCases.length,
        requiredSourceVariantCounts,
        markerStyleSummary,
      },
    },
  },
  oraclePolicy: {
    mismatchRule:
      "One expected/observed mismatch blocks the audit; no tolerance, warning credit, majority vote, or post-run oracle change is allowed.",
    positiveDefinition:
      "A positive is an unambiguous fatal surface defect in the named family and requires that family's deterministic fatal split.",
    negativeDefinition:
      "A negative is a legitimate lexical/structural look-alike for which that family split must stay silent.",
    unrelatedIssuePolicy:
      "Only the named split code or a documented same-family structural equivalent is scored; unrelated diagnostics cannot create pass credit.",
    ambiguityExclusion:
      "Ambiguous candidates were discarded during blind authoring and were never assigned an id or included in the sealed 224-case corpus.",
    failureEvidenceLocator:
      "Resolve each compact failure id to blind-holdout-cases.mjs or targeted-summary-answer-object-cases.mjs for its immutable input and oracle.",
  },
  noveltyAndBlinding: {
    blindSeal,
    blindHoldoutSha256: fileSha(blindHoldoutPath),
    blindSealSha256: fileSha(path.join(here, "BLIND-SEAL.json")),
    targetedSupplementSha256: fileSha(
      path.join(here, "targeted-summary-answer-object-cases.mjs"),
    ),
    blindedCaseCount: blindCases.length,
    transparentlyPostBlindTargetedCaseCount: targetedCases.length,
    priorAuditLiteralCollisionIds,
    uniqueIdCount: new Set(cases.map((entry) => entry.id)).size,
    uniquePrimaryInputCount: new Set(primaryInputs).size,
    newCaseIdsSha256: sha256(JSON.stringify(cases.map((entry) => entry.id))),
    newPrimaryInputsSha256: sha256(JSON.stringify(primaryInputs)),
    passedCaseIdsSha256: sha256(
      JSON.stringify(evaluated.filter((entry) => entry.pass).map((entry) => entry.id)),
    ),
  },
  safety: {
    modelApiCalls: 0,
    browserCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    productionEdits: 0,
    existingTestEdits: 0,
  },
  provenance: {
    auditScriptSha256: fileSha(fileURLToPath(import.meta.url)),
    frozenV6: {
      immutableVerdict: frozenV6Results.verdict,
      immutableSummary: {
        total: frozenV6Results.summary.total,
        pass: frozenV6Results.summary.pass,
        fail: frozenV6Results.summary.fail,
        failedCaseIdsSha256: sha256(
          JSON.stringify(frozenV6Results.summary.failedCaseIds),
        ),
      },
      manifestSha256: fileSha(v6ManifestPath),
      manifestEntries: v6ManifestEntries,
      auditScriptSha256: fileSha(v6HarnessPath),
      sourceAndTestProvenance: v6FrozenSourceAndTestProvenance,
    },
    currentV6ReplayAuditScriptSha256: currentV6Replay.provenance.auditScriptSha256,
  },
  failureIndex: {
    falseNegativeIds,
    falsePositiveIds,
    allFailureIdsSha256: sha256(JSON.stringify(failureIds)),
    evidenceLocator:
      "Case ids resolve to blind-holdout-cases.mjs or targeted-summary-answer-object-cases.mjs; exact replay recomputes observed issue codes.",
  },
};

assert.equal(result.summary.total, 1160);
assert.equal(result.summary.total, result.summary.pass + result.summary.fail);
assert.equal(result.summary.fail, failureIds.length);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
