import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as qualityModule from "../../../../src/lib/question-quality/index";
import * as grammarSharedModule from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as blankParaphraseModule from "../../../../src/lib/question-quality/validators/blank/paraphrase";

type JsonRecord = Record<string, any>;
type QualityIssue = { code: string; severity?: string; message?: string };
type BlindCase = {
  id: string;
  family: string;
  control: "normal" | "defect";
  oracle: "ACCEPT" | "BLOCK";
  pair_id: string;
  tags: string[];
  input: JsonRecord;
  oracle_rationale: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const reviewsRoot = path.dirname(here);
const checkOnly = process.argv.includes("--check");

const qualityRuntime =
  (qualityModule as unknown as { default?: typeof qualityModule }).default ??
  qualityModule;
const grammarRuntime =
  (grammarSharedModule as unknown as { default?: typeof grammarSharedModule })
    .default ?? grammarSharedModule;
const blankParaphraseRuntime =
  (blankParaphraseModule as unknown as {
    default?: typeof blankParaphraseModule;
  }).default ?? blankParaphraseModule;

const { validateQuestionQuality } = qualityRuntime;
const {
  findGrammarKeypointNonexistentLabel,
  findGrammarTerminologyError,
  findGrammarTerminologyRegister,
} = grammarRuntime;
const { findBlankParaphrasePolarityIssue } = blankParaphraseRuntime;

const fileSha256 = (filePath: string) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");
const valueSha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const readJson = (fileName: string) =>
  JSON.parse(readFileSync(path.join(here, fileName), "utf8"));
const writeJson = (fileName: string, value: unknown) =>
  writeFileSync(
    path.join(here, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );

const corpus = readJson("cases.json") as { cases: BlindCase[]; [key: string]: any };
const seal = readJson("blind-seal.json") as JsonRecord;
assert.equal(seal.phase, "PRE_INSPECTION");
assert.equal(corpus.cases.length, 256);
assert.equal(
  fileSha256(path.join(here, "cases.json")),
  seal.sha256["cases.json"],
  "sealed cases.json drifted",
);
assert.equal(
  fileSha256(path.join(here, "blind_corpus_author.py")),
  seal.sha256["blind_corpus_author.py"],
  "blind author script drifted",
);
assert.equal(
  fileSha256(path.join(here, "BLIND_PROTOCOL.md")),
  seal.sha256["BLIND_PROTOCOL.md"],
  "blind protocol drifted",
);

const circledToNumeric = (value: string): string => {
  const index = "①②③④⑤".indexOf(value);
  return index >= 0 ? String(index + 1) : value;
};

const nativeOptions = (values: string[]) =>
  values.map((text, index) => ({ label: String(index + 1), text }));

const fullIssues = (
  typeId: string,
  question: JsonRecord,
  passage = "",
): QualityIssue[] =>
  validateQuestionQuality({
    typeId,
    question,
    passage,
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];

const summaryBase = {
  summaryWithBlanks:
    "Reviewers form more (A) conclusions when they avoid (B) signals.",
  blanks: [
    { label: "(A)", answer: "measured" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "measured / noisy", blankA: "measured", blankB: "noisy" },
    { label: "2", text: "measured / stable", blankA: "measured", blankB: "stable" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / stable", blankA: "hasty", blankB: "stable" },
    { label: "5", text: "random / fixed", blankA: "random", blankB: "fixed" },
  ],
  correctAnswer: "1",
  explanation: "The keyed pair restores a cautious conclusion and rejects noisy evidence.",
};

const sentenceOrderPadding =
  "Additional observers documented this stage carefully in a separate field ledger, preserving every transition for later reconstruction by the review team.";

const sentenceOrderQuestion = (
  input: JsonRecord,
  options: { padParagraphs?: boolean; forceNontrivialKey?: boolean } = {},
) => ({
  direction: "Arrange the following paragraphs in the most logical order.",
  givenSentence: input.intro,
  paragraphs: ["A", "B", "C"].map((label) => ({
    label: `(${label})`,
    text: options.padParagraphs
      ? `${input.segments[label]} ${sentenceOrderPadding}`
      : input.segments[label],
  })),
  options: (options.forceNontrivialKey
    ? ["B-A-C", "A-B-C", "C-A-B", "B-C-A", "C-B-A"]
    : (input.choices as string[])
  ).map((text, index) => ({
    label: String(index + 1),
    text: text
      .split("-")
      .map((label) => `(${label})`)
      .join("-"),
  })),
  correctAnswer: options.forceNontrivialKey
    ? "1"
    : circledToNumeric(input.correct_answer),
  explanation: input.explanation,
  keyPoints: ["Track the initiating action.", "Follow the observed change.", "Place the final outcome last."],
  tags: ["sequence"],
  difficulty: "INTERMEDIATE",
});

type Observation = {
  observedBlock: boolean;
  targetedCodes: string[];
  allIssueCodes: string[];
  projection: string;
  support: string;
  notes?: string;
};

function observe(entry: BlindCase): Observation {
  const input = entry.input;
  switch (entry.family) {
    case "summary_complete_mc_answer_object_binding": {
      // The blind corpus stores the Korean command utterance in explanation;
      // projection places that exact sealed utterance on the production
      // direction surface, the only SUMMARY_COMPLETE_MC answer-object gate.
      const issues = fullIssues(
        "SUMMARY_COMPLETE_MC",
        { ...summaryBase, direction: input.explanation },
        input.passage,
      );
      const target = issues
        .filter((issue) => issue.code === "summary-mc-direction-task-mismatch")
        .map((issue) => issue.code);
      return {
        observedBlock: target.length > 0,
        targetedCodes: target,
        allIssueCodes: issues.map((issue) => issue.code),
        projection: "sealed Korean command -> question.direction",
        support: "bounded production direction answer-object classifier",
        notes:
          "The current gate classifies task objects, not whether an explanation command selects the keyed option text.",
      };
    }

    case "blank_explanation_option_analysis": {
      const issues = fullIssues(
        "BLANK_INFERENCE",
        {
          direction: "Choose the phrase that best completes the blank.",
          passageWithBlank: String(input.blank_sentence).replace("[BLANK]", "_____"),
          originalExpression: input.correct_answer_text,
          options: nativeOptions(input.choices),
          correctAnswer: circledToNumeric(input.correct_answer),
          explanation: input.explanation,
          keyPoints: ["Read the local relation.", "Compare concrete option meanings.", "Reject reversals and overclaims."],
        },
        input.passage,
      );
      const target = issues
        .filter((issue) =>
          [
            "blank-explanation-narrative-circled-numbering",
            "blank-explanation-step-numbering",
          ].includes(issue.code),
        )
        .map((issue) => issue.code);
      // Only the narrative/discourse code is blocking in production. The
      // broad step-numbering warning is preserved as evidence but not scored.
      return {
        observedBlock: target.includes(
          "blank-explanation-narrative-circled-numbering",
        ),
        targetedCodes: target,
        allIssueCodes: issues.map((issue) => issue.code),
        projection: "sealed explanation -> BLANK_INFERENCE explanation",
        support: "bounded circled-marker discourse classifier",
      };
    }

    case "grammar_ghost_labels_unicode_rendered": {
      const marked = (input.existing_labels as string[]).map((label) => ({ label }));
      const finding = findGrammarKeypointNonexistentLabel(
        [input.explanation],
        marked,
      );
      return {
        observedBlock: Boolean(finding),
        targetedCodes: finding ? ["grammar-keypoint-nonexistent-label"] : [],
        allIssueCodes: finding ? ["grammar-keypoint-nonexistent-label"] : [],
        projection: "sealed explanation -> one keyPoint; sealed labels -> rendered labels",
        support: "bounded leading-label grammar normalizer",
      };
    }

    case "grammar_free_text_rule_truth": {
      const errorFinding = findGrammarTerminologyError(input.explanation);
      const registerFinding = findGrammarTerminologyRegister(input.explanation);
      return {
        observedBlock: Boolean(errorFinding),
        targetedCodes: errorFinding ? ["grammar-terminology-error"] : [],
        allIssueCodes: [
          ...(errorFinding ? ["grammar-terminology-error"] : []),
          ...(registerFinding ? ["grammar-terminology-register"] : []),
        ],
        projection: "sealed rule explanation -> deterministic terminology checks",
        support: "KNOWN_UNSUPPORTED_OPEN_ENDED_SEMANTIC_TRUTH",
        notes:
          "Production intentionally recognizes a finite high-confidence terminology set; it is not a general truth verifier.",
      };
    }

    case "sentence_order_body_duplicate_label_contamination": {
      const issues = fullIssues(
        "SENTENCE_ORDER",
        sentenceOrderQuestion(input, {
          padParagraphs: true,
          forceNontrivialKey: true,
        }),
      );
      const target = issues
        .filter((issue) => issue.code === "sentence-order-paragraph-body-label")
        .map((issue) => issue.code);
      return {
        observedBlock: target.length > 0,
        targetedCodes: target,
        allIssueCodes: issues.map((issue) => issue.code),
        projection: "sealed segments -> labeled production paragraphs",
        support: "bounded paragraph-body label detector",
      };
    }

    case "sentence_order_dependent_fragments": {
      const issues = fullIssues(
        "SENTENCE_ORDER",
        sentenceOrderQuestion(input, {
          padParagraphs: true,
          forceNontrivialKey: true,
        }),
      );
      const target = issues
        .filter((issue) => issue.code === "sentence-order-dependent-fragment")
        .map((issue) => issue.code);
      return {
        observedBlock: target.length > 0,
        targetedCodes: target,
        allIssueCodes: issues.map((issue) => issue.code),
        projection: "sealed segments -> labeled production paragraphs",
        support: "bounded dependent-opener completeness detector",
      };
    }

    case "exact_transformed_answer_residue": {
      const issues = fullIssues(
        "BLANK_INFERENCE",
        {
          direction: "Choose the phrase that best completes the blank.",
          passageWithBlank: String(input.transformed_body).replace(
            "[BLANK]",
            "_____",
          ),
          originalExpression: input.answer_text,
          options: nativeOptions(input.choices),
          correctAnswer: circledToNumeric(input.correct_answer),
          explanation: input.explanation,
          keyPoints: ["Locate the removed span.", "Check for visible residue.", "Confirm the keyed restoration."],
        },
        input.source_text,
      );
      const target = issues
        .filter((issue) => issue.code === "blank-answer-residual-visible")
        .map((issue) => issue.code);
      return {
        observedBlock: target.length > 0,
        targetedCodes: target,
        allIssueCodes: issues.map((issue) => issue.code),
        projection: "sealed transformed_body -> passageWithBlank; answer_text -> originalExpression",
        support: "exact normalized residual visibility detector",
      };
    }

    case "blank_inference_semantic_role_preservation": {
      const finding = findBlankParaphrasePolarityIssue(
        input.passage,
        input.correct_answer_text,
      );
      return {
        observedBlock: Boolean(finding),
        targetedCodes: finding ? [finding.code] : [],
        allIssueCodes: finding ? [finding.code] : [],
        projection: "sealed source/correct answer -> current semantic-preservation helper",
        support:
          input.semantic_role === "polarity"
            ? "narrow lexical polarity pattern only"
            : "NO_GENERAL_ACTOR_CONDITION_CAUSE_SCOPE_VERIFIER",
        notes:
          "Equal token count is enforced by the sealed author and verifier; length is not a confound.",
      };
    }

    default:
      throw new Error(`unknown family: ${entry.family}`);
  }
}

const caseResults = corpus.cases.map((entry) => {
  let observation: Observation;
  let evaluationError: string | null = null;
  try {
    observation = observe(entry);
  } catch (error) {
    evaluationError = error instanceof Error ? error.message : String(error);
    observation = {
      observedBlock: false,
      targetedCodes: [],
      allIssueCodes: [],
      projection: "evaluation failed",
      support: "EVALUATION_ERROR",
    };
  }
  const expectedBlock = entry.oracle === "BLOCK";
  return {
    id: entry.id,
    family: entry.family,
    pairId: entry.pair_id,
    control: entry.control,
    tags: entry.tags,
    expectedBlock,
    observedBlock: observation.observedBlock,
    pass: evaluationError === null && expectedBlock === observation.observedBlock,
    targetedCodes: [...new Set(observation.targetedCodes)],
    allIssueCodes: [...new Set(observation.allIssueCodes)],
    projection: observation.projection,
    support: observation.support,
    notes: observation.notes,
    evaluationError,
  };
});

const familyOrder = [
  "summary_complete_mc_answer_object_binding",
  "blank_explanation_option_analysis",
  "grammar_ghost_labels_unicode_rendered",
  "grammar_free_text_rule_truth",
  "sentence_order_body_duplicate_label_contamination",
  "sentence_order_dependent_fragments",
  "exact_transformed_answer_residue",
  "blank_inference_semantic_role_preservation",
];

const familyResults = Object.fromEntries(
  familyOrder.map((family) => {
    const rows = caseResults.filter((entry) => entry.family === family);
    const failed = rows.filter((entry) => !entry.pass);
    const falsePositive = rows.filter(
      (entry) => !entry.expectedBlock && entry.observedBlock,
    );
    const falseNegative = rows.filter(
      (entry) => entry.expectedBlock && !entry.observedBlock,
    );
    return [
      family,
      {
        verdict: failed.length === 0 ? "PASS" : "BLOCK",
        total: rows.length,
        normalControls: rows.filter((entry) => !entry.expectedBlock).length,
        defectControls: rows.filter((entry) => entry.expectedBlock).length,
        pass: rows.length - failed.length,
        fail: failed.length,
        falsePositive: falsePositive.length,
        falseNegative: falseNegative.length,
        failedCaseIds: failed.map((entry) => entry.id),
        emittedTargetCodes: [...new Set(rows.flatMap((entry) => entry.targetedCodes))],
        supportModes: [...new Set(rows.map((entry) => entry.support))],
      },
    ];
  }),
);

// Literal-novelty comparison is deliberately post-seal. Compare every
// semantic leaf of at least eight characters/two word-like tokens against all
// text artifacts in earlier sibling review directories, using NFKC, case and
// whitespace normalization. Structural enums/labels are excluded explicitly.
const semanticKeys = new Set([
  "passage",
  "stem",
  "summary",
  "explanation",
  "choices",
  "correct_answer_text",
  "blank_sentence",
  "ghost_literal",
  "intro",
  "segments",
  "source_text",
  "answer_text",
  "transformed_body",
]);
const structuralValues = new Set([
  "SUMMARY_COMPLETE_MC",
  "BLANK_INFERENCE",
  "GRAMMAR",
  "SENTENCE_ORDER",
  "TRANSFORMED_BLANK",
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "(a)",
  "(b)",
  "(c)",
  "(d)",
  "(e)",
]);
const normalizeNovelty = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const literals = new Map<string, { literal: string; caseIds: Set<string> }>();

function collectStrings(
  value: unknown,
  key: string,
  caseId: string,
): void {
  if (typeof value === "string") {
    if (!semanticKeys.has(key)) return;
    const literal = value.trim();
    const wordLike = literal.match(/[A-Za-z0-9가-힣]+/g) ?? [];
    if (
      literal.length < 8 ||
      wordLike.length < 2 ||
      structuralValues.has(literal) ||
      /^(?:[A-C](?:-[A-C]){2}|\([A-Za-z]\)|\d+)$/.test(literal)
    ) {
      return;
    }
    const normalized = normalizeNovelty(literal);
    const current = literals.get(normalized) ?? {
      literal,
      caseIds: new Set<string>(),
    };
    current.caseIds.add(caseId);
    literals.set(normalized, current);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, key, caseId);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      collectStrings(child, childKey, caseId);
    }
  }
}

for (const entry of corpus.cases) {
  collectStrings(entry.input, "input", entry.id);
}

const textExtensions = new Set([
  ".ts",
  ".mts",
  ".js",
  ".mjs",
  ".json",
  ".jsonl",
  ".md",
  ".txt",
  ".sha256",
]);

function walkTextFiles(root: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (path.resolve(full) === path.resolve(here)) continue;
      output.push(...walkTextFiles(full));
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      output.push(full);
    }
  }
  return output;
}

const priorFiles = walkTextFiles(reviewsRoot).sort();
const normalizedPrior = new Map<string, string>();
for (const file of priorFiles) {
  normalizedPrior.set(file, normalizeNovelty(readFileSync(file, "utf8")));
}
const joinedPrior = [...normalizedPrior.values()].join("\u0000");
const noveltyMatches: Array<{
  literal: string;
  caseIds: string[];
  files: string[];
}> = [];
for (const [normalized, data] of literals) {
  if (!joinedPrior.includes(normalized)) continue;
  noveltyMatches.push({
    literal: data.literal,
    caseIds: [...data.caseIds].sort(),
    files: [...normalizedPrior]
      .filter(([, content]) => content.includes(normalized))
      .map(([file]) => path.relative(repoRoot, file).replaceAll("\\", "/")),
  });
}

const comparisonUniverse = priorFiles.map((file) => ({
  path: path.relative(repoRoot, file).replaceAll("\\", "/"),
  bytes: statSync(file).size,
  sha256: fileSha256(file),
}));
const novelty = {
  phase: "POST_SEAL",
  method:
    "NFKC + lowercase + whitespace-normalized exact semantic-leaf substring search across every textual artifact in all earlier sibling review directories",
  semanticLiteralMinimum: "8 characters and 2 word-like tokens",
  semanticLiteralCount: literals.size,
  priorFileCount: priorFiles.length,
  priorBytes: comparisonUniverse.reduce((sum, file) => sum + file.bytes, 0),
  comparisonUniverseSha256: valueSha256(
    comparisonUniverse
      .map((file) => `${file.path}\0${file.sha256}\0${file.bytes}`)
      .join("\n"),
  ),
  matchCount: noveltyMatches.length,
  verdict: noveltyMatches.length === 0 ? "PASS" : "BLOCK",
  matches: noveltyMatches,
  files: comparisonUniverse,
};

const sourceAndTestPaths = [
  "src/lib/question-quality/index.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/blank/inference.ts",
  "src/lib/question-quality/validators/blank/paraphrase.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "tests/unit/summary-mc-direction-split.test.mjs",
  "tests/unit/blank-explanation-step-numbering.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/sentence-order-quality.test.mjs",
  "tests/unit/wave1-integrity-gates.test.mjs",
  "tests/unit/blank-paraphrase-contract.test.mjs",
];
const sourceHashes = Object.fromEntries(
  sourceAndTestPaths.map((relative) => [
    relative,
    fileSha256(path.join(repoRoot, relative)),
  ]),
);
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const blockedFamilies = Object.entries(familyResults)
  .filter(([, value]: [string, any]) => value.verdict === "BLOCK")
  .map(([family]) => family);
const boundedPassFamilies = Object.entries(familyResults)
  .filter(([, value]: [string, any]) => value.verdict === "PASS")
  .map(([family]) => family);
const mismatchCount = caseResults.filter((entry) => !entry.pass).length;

let legacyTests: JsonRecord = {
  command: null,
  status: null,
  pass: null,
  fail: null,
  skippedInCheckMode: true,
};

if (!checkOnly) {
  const testFiles = sourceAndTestPaths.filter((relative) =>
    relative.startsWith("tests/"),
  );
  const args = ["--test", ...testFiles];
  const started = Date.now();
  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const log = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  writeFileSync(path.join(here, "legacy-tests.log"), log, "utf8");
  const passMatch = log.match(/^.*?pass\s+(\d+)\s*$/m);
  const failMatch = log.match(/^.*?fail\s+(\d+)\s*$/m);
  legacyTests = {
    command: [process.execPath, ...args].join(" "),
    status: run.status,
    signal: run.signal,
    pass: passMatch ? Number(passMatch[1]) : null,
    fail: failMatch ? Number(failMatch[1]) : null,
    durationMs: Date.now() - started,
    logSha256: valueSha256(log),
    logBytes: Buffer.byteLength(log),
    skippedInCheckMode: false,
  };
}

const summary = {
  schemaVersion: 1,
  kind: "deterministic-splits-remediation-reaudit-v8",
  verdict:
    mismatchCount === 0 && novelty.verdict === "PASS" ? "PASS" : "BLOCK",
  verdictRule: "Any sealed oracle mismatch => BLOCK",
  sealedCorpus: {
    sha256: seal.sha256["cases.json"],
    cases: corpus.cases.length,
    families: familyOrder.length,
    perFamily: "16 normal / 16 defect",
  },
  totals: {
    total: caseResults.length,
    pass: caseResults.length - mismatchCount,
    fail: mismatchCount,
    falsePositive: caseResults.filter(
      (entry) => !entry.expectedBlock && entry.observedBlock,
    ).length,
    falseNegative: caseResults.filter(
      (entry) => entry.expectedBlock && !entry.observedBlock,
    ).length,
  },
  familyResults,
  boundedPassFamilies,
  blockedFamilies,
  novelty: {
    verdict: novelty.verdict,
    semanticLiteralCount: novelty.semanticLiteralCount,
    priorFileCount: novelty.priorFileCount,
    priorBytes: novelty.priorBytes,
    matchCount: novelty.matchCount,
    comparisonUniverseSha256: novelty.comparisonUniverseSha256,
  },
  equalTokenSemanticRolePairs: {
    checked: 16,
    pass: corpus.cases
      .filter(
        (entry) =>
          entry.family === "blank_inference_semantic_role_preservation" &&
          entry.control === "normal",
      )
      .every((normal) => {
        const defect = corpus.cases.find(
          (entry) =>
            entry.family === normal.family &&
            entry.pair_id === normal.pair_id &&
            entry.control === "defect",
        );
        return (
          normal.input.correct_answer_text.split(/\s+/).length ===
          defect?.input.correct_answer_text.split(/\s+/).length
        );
      }),
  },
  legacyTests,
  provenance: { gitHead, sourceAndTestSha256: sourceHashes },
  apiCandidatesConsumed: 0,
  safety: {
    modelApiCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    secretReads: 0,
  },
};

if (checkOnly) {
  const frozen = readJson("results.json");
  assert.equal(frozen.verdict, summary.verdict);
  assert.deepEqual(frozen.totals, summary.totals);
  assert.deepEqual(frozen.familyResults, summary.familyResults);
  assert.deepEqual(frozen.boundedPassFamilies, summary.boundedPassFamilies);
  assert.deepEqual(frozen.blockedFamilies, summary.blockedFamilies);
  assert.deepEqual(frozen.novelty, summary.novelty);
  assert.deepEqual(
    frozen.equalTokenSemanticRolePairs,
    summary.equalTokenSemanticRolePairs,
  );
  assert.deepEqual(frozen.provenance, summary.provenance);
  process.stdout.write(
    `${JSON.stringify({ check: "PASS", verdict: summary.verdict, cases: caseResults.length, mismatches: mismatchCount })}\n`,
  );
} else {
  writeJson("case-results.json", {
    schemaVersion: 1,
    sealedCasesSha256: seal.sha256["cases.json"],
    cases: caseResults,
  });
  writeJson("novelty.json", novelty);
  writeJson("source-hashes.json", {
    gitHead,
    sourceAndTestSha256: sourceHashes,
  });
  writeJson("results.json", summary);
  process.stdout.write(
    `${JSON.stringify({ verdict: summary.verdict, totals: summary.totals, familyResults, novelty: summary.novelty, legacyTests }, null, 2)}\n`,
  );
}
