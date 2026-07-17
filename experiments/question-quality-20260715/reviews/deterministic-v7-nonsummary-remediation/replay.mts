import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as blindHoldoutModule from "../deterministic-splits-remediation-reaudit-v7/blind-holdout-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const frozenV7Dir = path.join(
  path.dirname(here),
  "deterministic-splits-remediation-reaudit-v7",
);
const frozenV7Audit = path.join(frozenV7Dir, "audit.mts");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ??
  grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyError } =
  grammarRuntime;

type QualityIssue = { code: string; severity?: string; message?: string };
type BlindCase = {
  id: string;
  family: string;
  expectedFlag: boolean;
  input: Record<string, unknown>;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function repoFileSha(relativePath: string): string {
  return fileSha(path.join(repoRoot, relativePath));
}

function verifyManifest(directory: string): Array<{
  relativePath: string;
  expectedSha256: string;
  actualSha256: string;
}> {
  return readFileSync(path.join(directory, "MANIFEST.sha256"), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/);
      assert.ok(match, `invalid manifest line: ${line}`);
      const actualSha256 = fileSha(path.join(directory, match[2]));
      assert.equal(actualSha256, match[1], `frozen v7 drift: ${match[2]}`);
      return {
        relativePath: match[2],
        expectedSha256: match[1],
        actualSha256,
      };
    });
}

const frozenManifestEntries = verifyManifest(frozenV7Dir);
const frozenScoringReplay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, frozenV7Audit], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
);

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

function blankIssues(explanation: unknown): QualityIssue[] {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: { ...blankBase, explanation },
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
    { label: "(A)", text: "placeholder" },
    { label: "(B)", text: "placeholder" },
    { label: "(C)", text: "placeholder" },
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
  const sourceParagraphs = input.paragraphs as Record<string, string>;
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question: {
      ...sentenceOrderBase,
      givenSentence: input.givenText,
      paragraphs: ["A", "B", "C"].map((label) => ({
        label: `(${label})`,
        text: sourceParagraphs[label],
      })),
    },
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];
}

const scoredFamilies = new Set([
  "blank_explanation_step_numbering",
  "grammar_keypoint_nonexistent_label",
  "grammar_terminology_accuracy",
  "sentence_order_paragraph_integrity",
]);
const cases = (blindHoldoutModule.cases as BlindCase[]).filter((entry) =>
  scoredFamilies.has(entry.family),
);
assert.equal(cases.length, 128);

function observe(entry: BlindCase): { observedFlag: boolean; issueCodes: string[] } {
  if (entry.family === "blank_explanation_step_numbering") {
    const issueCodes = blankIssues(entry.input.explanation).map((issue) => issue.code);
    return {
      observedFlag: issueCodes.includes(
        "blank-explanation-narrative-circled-numbering",
      ),
      issueCodes,
    };
  }

  if (entry.family === "grammar_keypoint_nonexistent_label") {
    const markedExpressions = (entry.input.declaredLabels as string[]).map(
      (label) => ({ label }),
    );
    const finding = findGrammarKeypointNonexistentLabel(
      [entry.input.explanation],
      markedExpressions,
    );
    return {
      observedFlag: Boolean(finding),
      issueCodes: finding ? ["grammar-keypoint-nonexistent-label"] : [],
    };
  }

  if (entry.family === "grammar_terminology_accuracy") {
    const finding = findGrammarTerminologyError(entry.input.explanation);
    return {
      observedFlag: Boolean(finding),
      issueCodes: finding ? ["grammar-terminology-error"] : [],
    };
  }

  const issueCodes = sentenceOrderIssues(entry.input).map((issue) => issue.code);
  return {
    observedFlag: [
      "sentence-order-empty-paragraph",
      "sentence-order-paragraph-body-label",
      "sentence-order-dependent-fragment",
    ].some((code) => issueCodes.includes(code)),
    issueCodes,
  };
}

const evaluated = cases.map((entry) => {
  const observation = observe(entry);
  return {
    id: entry.id,
    family: entry.family,
    expectedFlag: entry.expectedFlag,
    observedFlag: observation.observedFlag,
    pass: entry.expectedFlag === observation.observedFlag,
    issueCodes: observation.issueCodes,
  };
});

const familySummary = Object.fromEntries(
  [...scoredFamilies].map((family) => {
    const familyCases = evaluated.filter((entry) => entry.family === family);
    return [
      family,
      {
        total: familyCases.length,
        pass: familyCases.filter((entry) => entry.pass).length,
        fail: familyCases.filter((entry) => !entry.pass).length,
        expectedPositive: familyCases.filter((entry) => entry.expectedFlag).length,
        expectedNegative: familyCases.filter((entry) => !entry.expectedFlag).length,
        observedPositive: familyCases.filter((entry) => entry.observedFlag).length,
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

const oracleContradictionId = "v7-grammar-label-neg-12";
const boundedCases = evaluated.filter(
  (entry) =>
    entry.family !== "grammar_terminology_accuracy" &&
    entry.id !== oracleContradictionId,
);
assert.equal(boundedCases.length, 95);
assert.equal(boundedCases.filter((entry) => !entry.pass).length, 0);

const failures = evaluated.filter((entry) => !entry.pass);
const sourceAndTestPaths = [
  "src/lib/question-quality/validators/blank/inference.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "tests/unit/blank-explanation-step-numbering.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/sentence-order-quality.test.mjs",
];

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  kind: "deterministic-v7-nonsummary-remediation-replay",
  verdict: "BLOCK",
  verdictReason:
    "Bounded surface defects are remediated, but free-text grammar-rule truth remains uncertified and the immutable v7 corpus contains one contradictory ghost-label oracle.",
  frozenArtifact: {
    directory:
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v7",
    manifestSha256: fileSha(path.join(frozenV7Dir, "MANIFEST.sha256")),
    manifestEntries: frozenManifestEntries,
    untouched: true,
  },
  exactFrozenScoringReplay: {
    verdict: frozenScoringReplay.verdict,
    total: frozenScoringReplay.summary.total,
    pass: frozenScoringReplay.summary.pass,
    fail: frozenScoringReplay.summary.fail,
    families: Object.fromEntries(
      [...scoredFamilies].map((family) => [
        family,
        frozenScoringReplay.summary.newHoldout.families[family],
      ]),
    ),
    note:
      "The frozen scorer does not count the newly dedicated sentence-order-dependent-fragment code, so its five fragment rows remain false negatives despite direct code emission.",
  },
  remediationAwareReplay: {
    total: evaluated.length,
    pass: evaluated.filter((entry) => entry.pass).length,
    fail: failures.length,
    families: familySummary,
    boundedHighConfidenceSubset: {
      total: boundedCases.length,
      pass: boundedCases.filter((entry) => entry.pass).length,
      fail: boundedCases.filter((entry) => !entry.pass).length,
      verdict: "PASS",
      exclusions: [
        "32 grammar_terminology_accuracy cases: semantic truth is outside deterministic free-text regex scope",
        `${oracleContradictionId}: immutable negative oracle declares ㉡ valid against declared labels [1]..[5]`,
      ],
    },
    failedCaseIds: failures.map((entry) => entry.id),
    failureDetails: failures,
  },
  residualBlockers: {
    freeTextGrammarTruth: {
      count: evaluated.filter(
        (entry) =>
          entry.family === "grammar_terminology_accuracy" && !entry.pass,
      ).length,
      policy:
        "Do not add an open-ended regex fact list. Require a bounded structured rule certificate and an independent semantic verifier for unrestricted explanation prose.",
    },
    frozenOracleContradiction: {
      count: 1,
      id: oracleContradictionId,
      declaredLabels: ["[1]", "[2]", "[3]", "[4]", "[5]"],
      referencedLabel: "㉡",
      correctSemanticObservation: "ghost label",
      frozenExpectedFlag: false,
    },
    frozenScorerCoverageGap: {
      count: 5,
      ids: [12, 13, 14, 15, 16].map(
        (n) => `v7-order-pos-${String(n).padStart(2, "0")}`,
      ),
      emittedCode: "sentence-order-dependent-fragment",
    },
  },
  provenance: {
    replayScriptSha256: fileSha(fileURLToPath(import.meta.url)),
    sourceAndTestSha256: Object.fromEntries(
      sourceAndTestPaths.map((relativePath) => [
        relativePath,
        repoFileSha(relativePath),
      ]),
    ),
  },
  safety: {
    modelApiCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    secretReads: 0,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
