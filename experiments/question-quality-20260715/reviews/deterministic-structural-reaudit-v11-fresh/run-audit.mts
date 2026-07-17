import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Severity = "error" | "warning";

interface Issue {
  severity: Severity;
  code: string;
  message: string;
}

interface AuditCase {
  caseId: string;
  pairId: string;
  familyId: string;
  group: string;
  scope: string;
  validatorRefs: string[];
  input: Record<string, unknown>;
}

interface OracleEntry {
  caseId: string;
  pairId: string;
  expectedValid: boolean;
  targetIssueCodes: string[];
  rationale: string;
}

interface Matrix {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const CORPUS_PATH = path.join(HERE, "corpus.json");
const ORACLE_PATH = path.join(HERE, "oracle.json");
const SEAL_PATH = path.join(HERE, "corpus.seal.json");
const RESULTS_PATH = path.join(HERE, "results.json");
const REPORT_PATH = path.join(HERE, "report.md");
const CHRONOLOGY_PATH = path.join(HERE, "chronology.json");

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(6));
}

function updateMatrix(
  matrix: Matrix,
  expectedInvalid: boolean,
  predictedInvalid: boolean,
): void {
  if (expectedInvalid && predictedInvalid) matrix.tp += 1;
  else if (!expectedInvalid && !predictedInvalid) matrix.tn += 1;
  else if (!expectedInvalid && predictedInvalid) matrix.fp += 1;
  else matrix.fn += 1;
}

function metrics(matrix: Matrix) {
  return {
    ...matrix,
    total: matrix.tp + matrix.tn + matrix.fp + matrix.fn,
    sensitivity: ratio(matrix.tp, matrix.tp + matrix.fn),
    specificity: ratio(matrix.tn, matrix.tn + matrix.fp),
    precision: ratio(matrix.tp, matrix.tp + matrix.fp),
    accuracy: ratio(
      matrix.tp + matrix.tn,
      matrix.tp + matrix.tn + matrix.fp + matrix.fn,
    ),
  };
}

const evaluationStartedAt = new Date().toISOString();
const corpusText = readFileSync(CORPUS_PATH, "utf8");
const oracleText = readFileSync(ORACLE_PATH, "utf8");
const sealText = readFileSync(SEAL_PATH, "utf8");
const corpus = JSON.parse(corpusText) as {
  auditId: string;
  caseCount: number;
  familyCount: number;
  cases: AuditCase[];
};
const oracle = JSON.parse(oracleText) as {
  caseCount: number;
  entries: OracleEntry[];
};
const seal = JSON.parse(sealText) as {
  chronology: string;
  sha256: Record<string, string>;
};

const sealChecks = {
  corpus: sha256(corpusText) === seal.sha256["corpus.json"],
  oracle: sha256(oracleText) === seal.sha256["oracle.json"],
  builder:
    sha256(readFileSync(path.join(HERE, "build-corpus.mjs"))) ===
    seal.sha256["build-corpus.mjs"],
};
if (!Object.values(sealChecks).every(Boolean)) {
  throw new Error(
    "Refusing validator execution because corpus/oracle seal verification failed.",
  );
}
if (
  corpus.caseCount !== corpus.cases.length ||
  oracle.caseCount !== oracle.entries.length ||
  corpus.caseCount !== oracle.caseCount
) {
  throw new Error("Corpus/oracle cardinality mismatch.");
}

const sealVerifiedAt = new Date().toISOString();

// Deliberately dynamic and sequenced after every corpus/oracle hash check above.
// This is the first point at which production validator code can execute.
const validatorModulePath = path.join(
  REPO_ROOT,
  "src",
  "lib",
  "question-quality",
  "index.ts",
);
const qualityModule = (await import(pathToFileURL(validatorModulePath).href)) as {
  validateQuestionQuality?: (input: Record<string, unknown>) => Issue[];
  default?: {
    validateQuestionQuality?: (input: Record<string, unknown>) => Issue[];
  };
};
const validateQuestionQuality =
  qualityModule.validateQuestionQuality ??
  qualityModule.default?.validateQuestionQuality;
if (typeof validateQuestionQuality !== "function") {
  throw new Error("Production validateQuestionQuality export was not found.");
}
const validatorImportedAt = new Date().toISOString();

const oracleById = new Map(
  oracle.entries.map((entry) => [entry.caseId, entry]),
);
const blockingMatrix: Matrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
const exactTargetMatrix: Matrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
const emittedErrorCodes = new Map<string, number>();
const emittedWarningCodes = new Map<string, number>();
const familyRows = new Map<
  string,
  { blocking: Matrix; target: Matrix; group: string; scope: string }
>();

const caseResults = corpus.cases.map((auditCase) => {
  const expected = oracleById.get(auditCase.caseId);
  if (!expected) {
    throw new Error("Missing oracle entry for " + auditCase.caseId);
  }
  const issues = validateQuestionQuality(auditCase.input);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const emittedCodes = new Set(issues.map((issue) => issue.code));
  const targetHits = expected.targetIssueCodes.filter((code) =>
    emittedCodes.has(code),
  );
  const predictedInvalid = blockingIssues.length > 0;
  const predictedTargetDefect = targetHits.length > 0;
  const expectedInvalid = !expected.expectedValid;

  updateMatrix(blockingMatrix, expectedInvalid, predictedInvalid);
  updateMatrix(exactTargetMatrix, expectedInvalid, predictedTargetDefect);

  const family = familyRows.get(auditCase.familyId) ?? {
    blocking: { tp: 0, tn: 0, fp: 0, fn: 0 },
    target: { tp: 0, tn: 0, fp: 0, fn: 0 },
    group: auditCase.group,
    scope: auditCase.scope,
  };
  updateMatrix(family.blocking, expectedInvalid, predictedInvalid);
  updateMatrix(family.target, expectedInvalid, predictedTargetDefect);
  familyRows.set(auditCase.familyId, family);

  for (const issue of blockingIssues) {
    emittedErrorCodes.set(
      issue.code,
      (emittedErrorCodes.get(issue.code) ?? 0) + 1,
    );
  }
  for (const issue of warningIssues) {
    emittedWarningCodes.set(
      issue.code,
      (emittedWarningCodes.get(issue.code) ?? 0) + 1,
    );
  }

  return {
    caseId: auditCase.caseId,
    pairId: auditCase.pairId,
    familyId: auditCase.familyId,
    group: auditCase.group,
    scope: auditCase.scope,
    expectedValid: expected.expectedValid,
    predictedValid: !predictedInvalid,
    exactTargetClean: !predictedTargetDefect,
    targetIssueCodes: expected.targetIssueCodes,
    targetHits,
    issues: issues.map(({ severity, code }) => ({ severity, code })),
  };
});

const sourceRefs = [
  ...new Set(corpus.cases.flatMap((auditCase) => auditCase.validatorRefs)),
].sort();
const productionSourceSnapshot = Object.fromEntries(
  sourceRefs.map((relativePath) => {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    return [relativePath.replaceAll("\\", "/"), sha256(readFileSync(absolutePath))];
  }),
);

const falseNegatives = caseResults.filter(
  (row) => !row.expectedValid && row.predictedValid,
);
const falsePositives = caseResults.filter(
  (row) => row.expectedValid && !row.predictedValid,
);
const exactTargetMisses = caseResults.filter(
  (row) => !row.expectedValid && row.exactTargetClean,
);
const exactTargetControlLeaks = caseResults.filter(
  (row) => row.expectedValid && !row.exactTargetClean,
);

const byFamily = [...familyRows.entries()]
  .map(([familyId, row]) => ({
    familyId,
    group: row.group,
    scope: row.scope,
    blocking: metrics(row.blocking),
    exactTarget: metrics(row.target),
  }))
  .sort((a, b) => a.familyId.localeCompare(b.familyId));

const groupRows = new Map<string, { blocking: Matrix; target: Matrix }>();
for (const result of caseResults) {
  const row = groupRows.get(result.group) ?? {
    blocking: { tp: 0, tn: 0, fp: 0, fn: 0 },
    target: { tp: 0, tn: 0, fp: 0, fn: 0 },
  };
  updateMatrix(row.blocking, !result.expectedValid, !result.predictedValid);
  updateMatrix(row.target, !result.expectedValid, !result.exactTargetClean);
  groupRows.set(result.group, row);
}
const byGroup = [...groupRows.entries()]
  .map(([group, row]) => ({
    group,
    blocking: metrics(row.blocking),
    exactTarget: metrics(row.target),
  }))
  .sort((a, b) => a.group.localeCompare(b.group));

const blockingMetrics = metrics(blockingMatrix);
const exactTargetMetrics = metrics(exactTargetMatrix);
let verdict: "PASS" | "PARTIAL" | "FAIL";
let verdictReason: string;
if (
  blockingMatrix.fp === 0 &&
  blockingMatrix.fn === 0 &&
  exactTargetMatrix.fp === 0 &&
  exactTargetMatrix.fn === 0
) {
  verdict = "PASS";
  verdictReason =
    "Every defect was blocked, every control passed, and every named contract code separated its pair.";
} else if (
  blockingMatrix.fn === 0 &&
  exactTargetMatrix.fp === 0 &&
  exactTargetMatrix.fn === 0
) {
  verdict = "PARTIAL";
  verdictReason =
    "All seeded defects and exact target contracts were detected, but one or more source-aware controls received unrelated blocking errors.";
} else {
  verdict = "FAIL";
  verdictReason =
    "At least one seeded defect escaped blocking or its named contract detector, or a named detector fired on a paired control.";
}

const sortCounts = (counts: Map<string, number>) =>
  [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

const evaluationCompletedAt = new Date().toISOString();
const results = {
  schemaVersion: 1,
  auditId: corpus.auditId,
  verdict,
  verdictReason,
  evaluation: {
    productionEntryPoint: "src/lib/question-quality/index.ts",
    blockingDefinition: "at least one severity=error issue",
    exactTargetDefinition:
      "at least one pre-sealed oracle targetIssueCode is emitted at either severity",
    chronology: {
      evaluationStartedAt,
      sealVerifiedAt,
      validatorImportedAt,
      evaluationCompletedAt,
      sealChecks,
    },
  },
  sealedInputs: {
    corpusSha256: sha256(corpusText),
    oracleSha256: sha256(oracleText),
    sealSha256: sha256(sealText),
  },
  corpusSummary: {
    caseCount: corpus.caseCount,
    familyCount: corpus.familyCount,
    expectedValid: oracle.entries.filter((entry) => entry.expectedValid).length,
    expectedInvalid: oracle.entries.filter((entry) => !entry.expectedValid).length,
  },
  confusionMatrix: {
    blocking: blockingMetrics,
    exactTarget: exactTargetMetrics,
  },
  misses: {
    falseNegatives: falseNegatives.map((row) => row.caseId),
    falsePositives: falsePositives.map((row) => row.caseId),
    exactTargetMisses: exactTargetMisses.map((row) => row.caseId),
    exactTargetControlLeaks: exactTargetControlLeaks.map((row) => row.caseId),
  },
  defectTaxonomy: {
    emittedErrorCodes: sortCounts(emittedErrorCodes),
    emittedWarningCodes: sortCounts(emittedWarningCodes),
    byGroup,
    byFamily,
  },
  productionSourceSnapshot,
  cases: caseResults,
};

writeFileSync(RESULTS_PATH, json(results), "utf8");

const md: string[] = [];
md.push("# Deterministic structural re-audit v11 (fresh)");
md.push("");
md.push("Verdict: **" + verdict + "** — " + verdictReason);
md.push("");
md.push("## Sealed holdout");
md.push("");
md.push(
  "- Cases: " +
    String(results.corpusSummary.caseCount) +
    " (" +
    String(results.corpusSummary.expectedValid) +
    " valid / " +
    String(results.corpusSummary.expectedInvalid) +
    " defective)",
);
md.push("- Families: " + String(results.corpusSummary.familyCount));
md.push("- Corpus SHA-256: " + results.sealedInputs.corpusSha256);
md.push("- Oracle SHA-256: " + results.sealedInputs.oracleSha256);
md.push("");
md.push("## Confusion matrices");
md.push("");
md.push("| Evaluation | TP | TN | FP | FN | Sensitivity | Specificity |");
md.push("|---|---:|---:|---:|---:|---:|---:|");
md.push(
  "| Production blocking | " +
    [blockingMetrics.tp, blockingMetrics.tn, blockingMetrics.fp, blockingMetrics.fn]
      .join(" | ") +
    " | " +
    String(blockingMetrics.sensitivity) +
    " | " +
    String(blockingMetrics.specificity) +
    " |",
);
md.push(
  "| Exact pre-sealed target | " +
    [
      exactTargetMetrics.tp,
      exactTargetMetrics.tn,
      exactTargetMetrics.fp,
      exactTargetMetrics.fn,
    ].join(" | ") +
    " | " +
    String(exactTargetMetrics.sensitivity) +
    " | " +
    String(exactTargetMetrics.specificity) +
    " |",
);
md.push("");
md.push("## Miss taxonomy");
md.push("");
md.push(
  "- Blocking false negatives: " +
    (results.misses.falseNegatives.join(", ") || "none"),
);
md.push(
  "- Blocking false positives: " +
    (results.misses.falsePositives.join(", ") || "none"),
);
md.push(
  "- Exact target misses: " +
    (results.misses.exactTargetMisses.join(", ") || "none"),
);
md.push(
  "- Exact target control leaks: " +
    (results.misses.exactTargetControlLeaks.join(", ") || "none"),
);
md.push("");
md.push("## Top emitted blocking codes");
md.push("");
for (const row of results.defectTaxonomy.emittedErrorCodes.slice(0, 20)) {
  md.push("- " + row.code + ": " + String(row.count));
}
md.push("");
md.push("The complete per-case and per-family taxonomy is in results.json.");
md.push("");
writeFileSync(REPORT_PATH, md.join("\n"), "utf8");

writeFileSync(
  CHRONOLOGY_PATH,
  json({
    schemaVersion: 1,
    chronologyClaim:
      "The runner verified all pre-existing corpus/oracle hashes before dynamically importing the production validator.",
    sealChronology: seal.chronology,
    steps: [
      { name: "evaluation-process-started", at: evaluationStartedAt },
      { name: "sealed-input-hashes-verified", at: sealVerifiedAt },
      {
        name: "production-validator-dynamically-imported",
        at: validatorImportedAt,
      },
      { name: "evaluation-completed", at: evaluationCompletedAt },
    ],
    sealChecks,
  }),
  "utf8",
);

process.stdout.write(
  JSON.stringify({
    verdict,
    caseCount: corpus.caseCount,
    familyCount: corpus.familyCount,
    blocking: blockingMetrics,
    exactTarget: exactTargetMetrics,
    corpusSha256: results.sealedInputs.corpusSha256,
    oracleSha256: results.sealedInputs.oracleSha256,
  }) + "\n",
);
