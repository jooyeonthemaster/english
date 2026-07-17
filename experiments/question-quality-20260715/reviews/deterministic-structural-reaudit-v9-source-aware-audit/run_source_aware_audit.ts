#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findSummaryMcAnswerObjectMismatch } from "../../../../src/lib/question-quality/validators/summary/mc";
import { findGrammarKeypointNonexistentLabel } from "../../../../src/lib/question-quality/validators/grammar/shared";
import { validateSentenceOrderQuestion } from "../../../../src/lib/question-quality/validators/sentence-order";

type JsonRecord = Record<string, unknown>;
type Oracle = "normal" | "defect";
type Severity = "error" | "warning";
type Classification = "TP" | "TN" | "FP" | "FN" | "BLOCK";

type AuditCase = {
  case_id: string;
  pair_id: string;
  family_id: string;
  oracle: Oracle;
  question_type: string;
  surface: JsonRecord;
  oracle_detail: JsonRecord;
};

type Corpus = {
  corpus_id: string;
  cases: AuditCase[];
};

type ProductionIssue = {
  severity: Severity;
  code: string;
  message: string;
};

type Execution = {
  blockedReason: string | null;
  detectedDefect: boolean | null;
  finding: unknown;
  projection: JsonRecord;
};

const AUDIT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(AUDIT_DIR, "../../../..");
const SEALED_DIR = resolve(AUDIT_DIR, "../deterministic-structural-reaudit-v9");
const CASES_PATH = resolve(SEALED_DIR, "cases.json");
const MANIFEST_PATH = resolve(SEALED_DIR, "PRE_INSPECTION_MANIFEST.json");
const SEAL_PATH = resolve(SEALED_DIR, "PRE_INSPECTION_SEAL.sha256");
const RESULTS_PATH = resolve(AUDIT_DIR, "results.json");

const F1 = "F1_SUMMARY_KEY_OPTION_COHESION";
const F2 = "F2_GRAMMAR_RENDERED_LABEL_REFERENCE";
const F3 = "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION";
const F4 = "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY";
const FAMILIES = [F1, F2, F3, F4] as const;

const PRODUCTION_FILES = [
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/summary/killer-trap.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/dispatcher.ts",
] as const;

const F3_TARGET_CODES = new Set([
  "sentence-order-paragraph-count",
  "sentence-order-paragraph-labels",
  "sentence-order-paragraph-body-label",
]);
const F4_TARGET_CODE = "sentence-order-dependent-fragment";

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function outputJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function collectIssues(
  invoke: (add: (severity: Severity, code: string, message: string) => void) => void,
): ProductionIssue[] {
  const issues: ProductionIssue[] = [];
  invoke((severity, code, message) => issues.push({ severity, code, message }));
  return issues;
}

function executeF1(auditCase: AuditCase): Execution {
  const surface = auditCase.surface;
  const channel = surface.authoritative_selection_channel;
  if (channel !== "stem" && channel !== "explanation") {
    return {
      blockedReason: "authoritative_selection_channel is not stem or explanation",
      detectedDefect: null,
      finding: null,
      projection: { kind: "blocked-invalid-channel" },
    };
  }
  const carrier = surface[channel];
  const options = surface.options;
  const key = surface.keyed_option;
  if (typeof carrier !== "string" || !Array.isArray(options) || !options.every(isRecord)) {
    return {
      blockedReason: "F1 surface cannot be passed losslessly to the production helper",
      detectedDefect: null,
      finding: null,
      projection: { kind: "blocked-shape" },
    };
  }

  const finding = findSummaryMcAnswerObjectMismatch(carrier, options, key);
  return {
    blockedReason: null,
    detectedDefect: Boolean(finding),
    finding,
    projection: {
      kind: "direct-helper-call",
      carrier_field: channel,
      carrier_preserved_verbatim: true,
      option_array_preserved_verbatim: true,
      key_preserved_verbatim: true,
    },
  };
}

function executeF2(auditCase: AuditCase): Execution {
  const surface = auditCase.surface;
  const keyPoint = surface.grammar_key_point;
  const inventory = surface.rendered_label_inventory;
  if (typeof keyPoint !== "string" || !Array.isArray(inventory) || !inventory.every((v) => typeof v === "string")) {
    return {
      blockedReason: "F2 rendered-label inventory cannot be represented losslessly as production markedExpressions",
      detectedDefect: null,
      finding: null,
      projection: { kind: "blocked-shape" },
    };
  }

  const markedExpressions = inventory.map((label) => ({ label }));
  const finding = findGrammarKeypointNonexistentLabel([keyPoint], markedExpressions);
  return {
    blockedReason: null,
    detectedDefect: Boolean(finding),
    finding,
    projection: {
      kind: "lossless-inventory-adapter",
      key_point_preserved_verbatim: true,
      rendered_inventory_mapped_one_to_one_to_marked_expression_labels: true,
    },
  };
}

function splitF3RenderedBody(surface: JsonRecord):
  | { paragraphs: Array<{ label: string; text: string }>; roundTrip: string }
  | { blockedReason: string } {
  const body = surface.rendered_body;
  const expected = surface.expected_structural_labels;
  if (typeof body !== "string" || !Array.isArray(expected) || !expected.every((v) => typeof v === "string")) {
    return { blockedReason: "F3 rendered body or expected-label inventory has an unsupported shape" };
  }

  const paragraphs: Array<{ label: string; text: string }> = [];
  for (const [lineIndex, line] of body.split("\n").entries()) {
    const matches = expected.filter((label) => line === label || line.startsWith(`${label} `));
    if (matches.length !== 1) {
      return {
        blockedReason: `F3 line ${lineIndex + 1} has ${matches.length} possible leading-label projections`,
      };
    }
    const label = matches[0];
    const text = line.slice(label.length).replace(/^ /, "");
    paragraphs.push({ label, text });
  }

  const roundTrip = paragraphs
    .map(({ label, text }) => `${label}${text ? ` ${text}` : ""}`)
    .join("\n");
  if (roundTrip !== body) {
    return { blockedReason: "F3 structured projection does not round-trip to the sealed rendered body" };
  }
  return { paragraphs, roundTrip };
}

function executeF3(auditCase: AuditCase): Execution {
  const split = splitF3RenderedBody(auditCase.surface);
  if ("blockedReason" in split) {
    return {
      blockedReason: split.blockedReason,
      detectedDefect: null,
      finding: null,
      projection: { kind: "blocked-ambiguous-rendered-body" },
    };
  }

  const question: JsonRecord = {
    givenSentence: "A neutral opening sentence establishes the shared context.",
    paragraphs: split.paragraphs,
    options: [],
  };
  const issues = collectIssues((add) =>
    validateSentenceOrderQuestion(question, undefined, add),
  );
  const targetIssues = issues.filter((issue) => F3_TARGET_CODES.has(issue.code));
  return {
    blockedReason: null,
    detectedDefect: targetIssues.length > 0,
    finding: {
      target_issues: targetIssues,
      non_target_issue_codes: uniqueStrings(
        issues.filter((issue) => !F3_TARGET_CODES.has(issue.code)).map((issue) => issue.code),
      ),
    },
    projection: {
      kind: "lossless-rendered-line-to-paragraph-adapter",
      round_trip_equal_to_sealed_rendered_body: true,
      no_missing_line_or_label_was_synthesized: true,
      projected_paragraph_count: split.paragraphs.length,
    },
  };
}

const F4_CONTROL_TEXTS = [
  "The observers reviewed the complete morning record with care. They compared every result before they left the quiet laboratory for the day.",
  "The editors checked the final archive copy against the index. They recorded every confirmed difference in a separate review note afterward.",
  "The technicians inspected the calibrated instrument before the trial. They stored the verified readings in the shared project folder after lunch.",
];

function executeF4AtPosition(candidate: string, position: number): ProductionIssue[] {
  const paragraphs = ["(A)", "(B)", "(C)"].map((label, index) => ({
    label,
    text: index === position ? candidate : F4_CONTROL_TEXTS[index],
  }));
  const question: JsonRecord = {
    givenSentence: "A neutral opening sentence establishes the shared context.",
    paragraphs,
    options: [],
  };
  return collectIssues((add) =>
    validateSentenceOrderQuestion(question, undefined, add),
  );
}

function executeF4(auditCase: AuditCase): Execution {
  const candidate = auditCase.surface.candidate;
  if (typeof candidate !== "string" || candidate.length === 0) {
    return {
      blockedReason: "F4 candidate is not a non-empty string",
      detectedDefect: null,
      finding: null,
      projection: { kind: "blocked-shape" },
    };
  }

  // The production predicate is private and is reached through the exported
  // sentence-order validator. Probe all three paragraph positions. A position-
  // dependent verdict would make wrapper placement ambiguous and must BLOCK.
  const positionResults = [0, 1, 2].map((position) => {
    const issues = executeF4AtPosition(candidate, position);
    return {
      position: ["(A)", "(B)", "(C)"][position],
      detected: issues.some((issue) => issue.code === F4_TARGET_CODE),
      target_issues: issues.filter((issue) => issue.code === F4_TARGET_CODE),
      non_target_issue_codes: uniqueStrings(
        issues.filter((issue) => issue.code !== F4_TARGET_CODE).map((issue) => issue.code),
      ),
    };
  });
  const votes = new Set(positionResults.map((result) => result.detected));
  if (votes.size !== 1) {
    return {
      blockedReason: "F4 wrapper placement changes the production verdict",
      detectedDefect: null,
      finding: { position_results: positionResults },
      projection: { kind: "blocked-position-dependent-wrapper" },
    };
  }

  return {
    blockedReason: null,
    detectedDefect: positionResults[0].detected,
    finding: { position_results: positionResults },
    projection: {
      kind: "position-invariant-exported-validator-wrapper",
      candidate_preserved_verbatim: true,
      all_three_paragraph_positions_probed: true,
      verdict_unanimous_across_positions: true,
      wrapper_controls_are_not_counted_as_oracle_evidence: true,
    },
  };
}

function executeCase(auditCase: AuditCase): Execution {
  switch (auditCase.family_id) {
    case F1:
      return executeF1(auditCase);
    case F2:
      return executeF2(auditCase);
    case F3:
      return executeF3(auditCase);
    case F4:
      return executeF4(auditCase);
    default:
      return {
        blockedReason: `unknown family ${auditCase.family_id}`,
        detectedDefect: null,
        finding: null,
        projection: { kind: "blocked-unknown-family" },
      };
  }
}

function classify(oracle: Oracle, execution: Execution): Classification {
  if (execution.blockedReason || execution.detectedDefect === null) return "BLOCK";
  if (oracle === "defect") return execution.detectedDefect ? "TP" : "FN";
  return execution.detectedDefect ? "FP" : "TN";
}

function summarize(caseResults: JsonRecord[]): JsonRecord {
  const summary: JsonRecord = {};
  for (const familyId of [...FAMILIES, "OVERALL"]) {
    const selected = familyId === "OVERALL"
      ? caseResults
      : caseResults.filter((result) => result.family_id === familyId);
    const count = (classification: Classification) =>
      selected.filter((result) => result.classification === classification).length;
    const tp = count("TP");
    const tn = count("TN");
    const fp = count("FP");
    const fn = count("FN");
    const blocked = count("BLOCK");
    const executed = tp + tn + fp + fn;
    summary[familyId] = {
      total: selected.length,
      oracle_normal: selected.filter((result) => result.oracle === "normal").length,
      oracle_defect: selected.filter((result) => result.oracle === "defect").length,
      executed,
      blocked,
      confusion_matrix: { tp, fn, fp, tn },
      accuracy_excluding_blocks: executed ? (tp + tn) / executed : null,
      defect_recall_excluding_blocks: tp + fn ? tp / (tp + fn) : null,
      normal_specificity_excluding_blocks: tn + fp ? tn / (tn + fp) : null,
    };
  }
  return summary;
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function buildResults(): JsonRecord {
  const corpus = JSON.parse(readFileSync(CASES_PATH, "utf8")) as Corpus;
  const preManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as JsonRecord;
  requireCondition(Array.isArray(corpus.cases) && corpus.cases.length === 160, "sealed corpus must contain 160 cases");
  requireCondition(
    sha256(canonicalJson(corpus.cases)) === preManifest.aggregate_case_digest,
    "aggregate case digest changed before execution",
  );

  const productionFiles = Object.fromEntries(
    PRODUCTION_FILES.map((path) => {
      const absolute = resolve(REPO_ROOT, path);
      const status = gitOutput(["status", "--short", "--", path]);
      return [
        path,
        {
          sha256: sha256(readFileSync(absolute)),
          git_status: status || "clean",
        },
      ];
    }),
  );

  const caseResults = corpus.cases.map((auditCase) => {
    const execution = executeCase(auditCase);
    const classification = classify(auditCase.oracle, execution);
    return {
      case_id: auditCase.case_id,
      pair_id: auditCase.pair_id,
      family_id: auditCase.family_id,
      question_type: auditCase.question_type,
      oracle: auditCase.oracle,
      surface_sha256: sha256(canonicalJson(auditCase.surface)),
      status: classification === "BLOCK" ? "blocked" : "executed",
      detected_defect: execution.detectedDefect,
      classification,
      block_reason: execution.blockedReason,
      production_finding: execution.finding,
      projection: execution.projection,
    };
  });
  const metrics = summarize(caseResults);
  const failures = caseResults
    .filter((result) => !["TP", "TN"].includes(result.classification))
    .map((result) => ({
      case_id: result.case_id,
      pair_id: result.pair_id,
      family_id: result.family_id,
      oracle: result.oracle,
      classification: result.classification,
      detected_defect: result.detected_defect,
      block_reason: result.block_reason,
      production_finding: result.production_finding,
    }));

  return {
    schema_version: "1.0.0",
    audit_id: "deterministic-structural-reaudit-v9-source-aware-audit",
    audit_mode: "offline_current_worktree_source_aware",
    corpus: {
      corpus_id: corpus.corpus_id,
      cases_sha256: sha256(readFileSync(CASES_PATH)),
      aggregate_case_digest: preManifest.aggregate_case_digest,
      pre_inspection_manifest_sha256: sha256(readFileSync(MANIFEST_PATH)),
      pre_inspection_seal_sha256: sha256(readFileSync(SEAL_PATH)),
    },
    chain_of_custody: {
      pre_source_acceptance_record: "PRE_SOURCE_INSPECTION_ACCEPTANCE.json",
      sealed_bundle_relative_path: "../deterministic-structural-reaudit-v9",
      sealed_bundle_was_verified_before_source_inspection: true,
      oracle_labels_redefined: false,
    },
    production_snapshot: {
      repository_root: REPO_ROOT.replace(/\\/g, "/"),
      git_head: gitOutput(["rev-parse", "HEAD"]),
      source_files: productionFiles,
    },
    target_mappings: {
      [F1]: {
        path: "src/lib/question-quality/validators/summary/mc.ts",
        symbol: "findSummaryMcAnswerObjectMismatch",
        production_issue_code: "summary-mc-answer-object-mismatch",
        positive_when: "helper returns a non-null mismatch finding",
      },
      [F2]: {
        path: "src/lib/question-quality/validators/grammar/shared.ts",
        symbol: "findGrammarKeypointNonexistentLabel",
        production_issue_code: "grammar-keypoint-nonexistent-label",
        positive_when: "helper returns a non-null ghost-label finding",
      },
      [F3]: {
        path: "src/lib/question-quality/validators/sentence-order.ts",
        symbol: "validateSentenceOrderQuestion",
        production_issue_codes: [...F3_TARGET_CODES],
        positive_when: "at least one structural paragraph count/label/body-label issue is emitted",
      },
      [F4]: {
        path: "src/lib/question-quality/validators/sentence-order.ts",
        symbol: "validateSentenceOrderQuestion -> isHighConfidenceSentenceOrderDependentFragment",
        production_issue_code: F4_TARGET_CODE,
        positive_when: "sentence-order-dependent-fragment is emitted identically in all three wrapper positions",
      },
    },
    execution_guardrails: {
      api_used: false,
      network_used: false,
      database_used: false,
      secrets_read: false,
      production_writes: false,
      production_code_changed_by_audit: false,
      ambiguous_projection_policy: "BLOCK",
    },
    metrics,
    failure_count: failures.length,
    failures,
    case_results: caseResults,
  };
}

function main(): void {
  const mode = process.argv[2] ?? "--stdout";
  const results = buildResults();
  const rendered = outputJson(results);
  if (mode === "--write") {
    writeFileSync(RESULTS_PATH, rendered, "utf8");
    const overall = (results.metrics as JsonRecord).OVERALL as JsonRecord;
    process.stdout.write(
      `${JSON.stringify({ status: "written", results: relative(REPO_ROOT, RESULTS_PATH), overall })}\n`,
    );
    return;
  }
  if (mode === "--verify-existing") {
    const existing = readFileSync(RESULTS_PATH, "utf8");
    requireCondition(existing === rendered, "results.json does not match a fresh production execution");
    process.stdout.write(`${JSON.stringify({ status: "reexecution-match", cases: 160 })}\n`);
    return;
  }
  if (mode !== "--stdout") throw new Error(`unknown mode: ${mode}`);
  process.stdout.write(rendered);
}

main();
