import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;
type QualityIssue = { severity: "error" | "warning"; code: string; message: string };
type AuditCase = {
  id: string;
  pairId: string;
  familyId: string;
  variant: number;
  role: "control" | "defect";
  targetCode: string;
  sourceKind: string;
  productionExpectation: "blocking-error" | "craft-warning";
  input: JsonRecord & { question: JsonRecord };
};

const here = dirname(fileURLToPath(import.meta.url));
const write = process.argv.includes("--write");

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, name), "utf8")) as T;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function comparable(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: unknown): string[] {
  return comparable(value).match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}

function label(value: unknown): string {
  const raw = text(value);
  const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
  const circledIndex = circled.indexOf(raw);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return raw.replace(/^[\[(]?\s*([A-Za-z]|\d+)\s*[\])\].:]?$/, "$1").toLowerCase();
}

function answerLabels(question: JsonRecord): string[] {
  const raw = text(question.correctAnswer);
  if (!raw) return [];
  const matches = raw.match(/[A-Za-z]|\d+/g) ?? [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
}

function wordCount(value: unknown): number {
  return text(value).match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g)?.length ?? 0;
}

function sentenceCount(value: unknown): number {
  return text(value).split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

function sequenceInPassage(answer: unknown, passage: unknown, minRun = 6): boolean {
  const a = tokens(answer);
  const p = ` ${tokens(passage).join(" ")} `;
  if (a.length < minRun) return false;
  for (let size = a.length; size >= minRun; size -= 1) {
    for (let index = 0; index + size <= a.length; index += 1) {
      if (p.includes(` ${a.slice(index, index + size).join(" ")} `)) return true;
    }
  }
  return false;
}

function addCheck(checks: Array<{ name: string; ok: boolean; evidence?: unknown }>, name: string, ok: boolean, evidence?: unknown) {
  checks.push({ name, ok, ...(evidence === undefined ? {} : { evidence }) });
}

function sourceAudit(item: AuditCase) {
  const input = item.input;
  const q = input.question;
  const passage = text(input.passage);
  const checks: Array<{ name: string; ok: boolean; evidence?: unknown }> = [];

  if (item.sourceKind === "generic-mc") {
    const opts = Array.isArray(q.options) ? (q.options as JsonRecord[]) : [];
    addCheck(checks, "five-nonempty-options", opts.length === 5 && opts.every((opt) => text(opt.text).length > 0), opts.length);
    addCheck(checks, "unique-option-labels", new Set(opts.map((opt) => label(opt.label))).size === opts.length);
    addCheck(checks, "unique-option-texts", new Set(opts.map((opt) => comparable(opt.text))).size === opts.length);
    const known = new Set(opts.map((opt) => label(opt.label)));
    addCheck(checks, "answer-labels-exist", answerLabels(q).every((answer) => known.has(answer)), answerLabels(q));
    addCheck(checks, "no-foreign-fields", q.passageWithBlank == null && q.originalExpression == null && q.blanks == null);
  } else if (item.sourceKind === "word-order") {
    const chips = Array.isArray(q.scrambledWords) ? (q.scrambledWords as unknown[]).map(text) : [];
    const distractors = Array.isArray(q.wordBankDistractors) ? (q.wordBankDistractors as unknown[]).map(text) : [];
    const available = new Map<string, number>();
    for (const chip of chips) for (const token of tokens(chip)) available.set(token, (available.get(token) ?? 0) + 1);
    for (const distractor of distractors) for (const token of tokens(distractor)) available.set(token, Math.max(0, (available.get(token) ?? 0) - 1));
    let reconstructable = true;
    for (const token of tokens(q.modelAnswer)) {
      const count = available.get(token) ?? 0;
      if (count <= 0) reconstructable = false;
      else available.set(token, count - 1);
    }
    addCheck(checks, "answer-reconstructable", reconstructable);
    addCheck(checks, "not-pre-solved", text(q.modelAnswer) !== chips.join(" "));
    addCheck(checks, "no-punctuation-only-chip", chips.every((chip) => !/^[^\wA-Za-z]+$/.test(chip)));
    addCheck(checks, "answer-not-verbatim-source-copy", !sequenceInPassage(q.modelAnswer, passage, 6));
  } else if (item.sourceKind === "fill-blank-key") {
    const rendered = text(q.passageWithBlank) || text(q.sentenceWithBlank);
    const blankCount = rendered.match(/_{3,}/g)?.length ?? 0;
    addCheck(checks, "exactly-one-visible-blank", blankCount === 1, blankCount);
    const restored = comparable(rendered.replace(/_{3,}/, text(q.answer ?? q.correctAnswer)));
    addCheck(checks, "restored-frame-source-backed", !passage || comparable(passage).includes(restored), restored);
    addCheck(checks, "answer-hidden", !comparable(rendered).includes(comparable(q.answer ?? q.correctAnswer)));
  } else if (item.sourceKind === "summary-complete") {
    const summary = text(q.summaryWithBlanks);
    const blanks = Array.isArray(q.blanks) ? (q.blanks as JsonRecord[]) : [];
    addCheck(checks, "summary-present", summary.length > 0);
    for (const blank of blanks) {
      const marker = text(blank.label);
      addCheck(checks, `marker-once-${marker}`, summary.split(marker).length - 1 === 1);
      addCheck(checks, `answer-present-${marker}`, text(blank.answer).length > 0);
      addCheck(checks, `answer-hidden-${marker}`, !comparable(summary).includes(comparable(blank.answer)));
    }
  } else if (item.sourceKind === "sentence-order") {
    const paragraphs = Array.isArray(q.paragraphs) ? (q.paragraphs as JsonRecord[]) : [];
    addCheck(checks, "given-present", text(q.givenSentence).length > 0);
    addCheck(checks, "three-paragraphs", paragraphs.length === 3, paragraphs.length);
    addCheck(checks, "literal-labels", paragraphs.map((p) => text(p.label)).join("|") === "(A)|(B)|(C)");
    for (const paragraph of paragraphs) {
      const paragraphLabel = text(paragraph.label);
      addCheck(checks, `two-sentences-${paragraphLabel}`, sentenceCount(paragraph.text) >= 2, sentenceCount(paragraph.text));
      addCheck(checks, `minimum-24-words-${paragraphLabel}`, wordCount(paragraph.text) >= 24, wordCount(paragraph.text));
      addCheck(checks, `source-backed-${paragraphLabel}`, comparable(passage).includes(comparable(paragraph.text)));
    }
    const opts = Array.isArray(q.options) ? (q.options as JsonRecord[]) : [];
    const correct = opts.find((opt) => label(opt.label) === answerLabels(q)[0]);
    const order = text(correct?.text).match(/[ABC]/g)?.map((value) => `(${value})`) ?? [];
    const sourcePositions = new Map(paragraphs.map((p) => [text(p.label), comparable(passage).indexOf(comparable(p.text))]));
    const positions = order.map((entry) => sourcePositions.get(entry) ?? -1);
    addCheck(checks, "keyed-order-source-backed", positions.length === 3 && positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), { order, positions });
    addCheck(checks, "key-not-visible-order", order.join("") !== "(A)(B)(C)", order);
  } else if (item.sourceKind === "multi-blank") {
    const blanks = Array.isArray(q.blanks) ? (q.blanks as JsonRecord[]) : [];
    const rendered = text(q.passageWithBlank);
    addCheck(checks, "two-blanks", blanks.length === 2, blanks.length);
    for (const [index, blank] of blanks.entries()) {
      const expected = index === 0 ? "(A)" : "(B)";
      addCheck(checks, `label-${expected}`, text(blank.label) === expected);
      addCheck(checks, `expression-source-backed-${expected}`, comparable(passage).includes(comparable(blank.originalExpression)));
      addCheck(checks, `marker-once-${expected}`, rendered.split(`${expected} _____`).length - 1 === 1);
      addCheck(checks, `expression-hidden-${expected}`, !comparable(rendered).includes(comparable(blank.originalExpression)));
    }
    const opts = Array.isArray(q.options) ? (q.options as JsonRecord[]) : [];
    const correct = opts.find((opt) => label(opt.label) === answerLabels(q)[0]);
    const values = Array.isArray(correct?.blankValues) ? correct.blankValues.map(text) : [];
    addCheck(checks, "correct-combination-exact", values.length === blanks.length && values.every((value, index) => comparable(value) === comparable(blanks[index]?.originalExpression)));
  } else if (item.sourceKind === "blank-single") {
    const opts = Array.isArray(q.options) ? (q.options as JsonRecord[]) : [];
    const correct = opts.find((opt) => label(opt.label) === answerLabels(q)[0]);
    addCheck(checks, "source-expression-backed", comparable(passage).includes(comparable(q.originalExpression)));
    addCheck(checks, "source-expression-hidden", !comparable(q.passageWithBlank).includes(comparable(q.originalExpression)));
    addCheck(checks, "correct-option-exists", text(correct?.text).length > 0);
    addCheck(checks, "correct-option-restores-source", comparable(correct?.text) === comparable(q.originalExpression));
  } else if (item.sourceKind === "grammar-error") {
    const marked = Array.isArray(q.markedExpressions) ? (q.markedExpressions as JsonRecord[]) : [];
    const markerCount = text(q.passageWithMarkers).match(/__\([A-J]\)\s*[^_]+__/g)?.length ?? 0;
    addCheck(checks, "five-marked-expressions", marked.length === 5 && markerCount === 5, { marked: marked.length, rendered: markerCount });
    const errors = marked.filter((entry) => entry.isError === true);
    addCheck(checks, "one-error", errors.length === 1, errors.length);
    addCheck(checks, "answer-label-sync", errors.map((entry) => label(entry.label)).join("|") === answerLabels(q).join("|"));
    for (const entry of marked) {
      const sourceSurface = text(entry.expression);
      addCheck(checks, `source-backed-${label(entry.label)}`, comparable(passage).includes(comparable(sourceSurface)));
      if (entry.isError === true) {
        addCheck(checks, "error-is-real-mutation", comparable(entry.errorExpression) !== comparable(entry.correction));
        addCheck(checks, "correction-source-backed", comparable(passage).includes(comparable(entry.correction)));
      }
    }
  } else if (item.sourceKind === "grammar-correction") {
    const segments = Array.isArray(q.underlinedSegments) ? (q.underlinedSegments as JsonRecord[]) : [];
    addCheck(checks, "one-segment", segments.length === 1, segments.length);
    const segment = segments[0] ?? {};
    addCheck(checks, "source-text-backed", comparable(passage).includes(comparable(segment.sourceText)));
    addCheck(checks, "displayed-rendered", comparable(q.passageWithUnderline).includes(comparable(segment.displayedText)));
    addCheck(checks, "error-mutated", comparable(segment.errorPart) !== comparable(segment.correctedPart));
    addCheck(checks, "correction-source-backed", comparable(segment.sourceText).includes(comparable(segment.correctedPart)));
    const correctionAnswer = text(q.correctAnswer).replace(/^\s*\([A-J]\)\s*/i, "");
    addCheck(checks, "answer-sync", comparable(correctionAnswer) === comparable(segment.correctedPart));
  } else if (item.sourceKind === "sentence-insert") {
    const given = text(q.givenSentence);
    const omitted = text(q.omittedSourceSentence ?? q.sourceSentenceToOmit);
    const rendered = text(q.passageWithMarkers);
    const markers = ["①", "②", "③", "④", "⑤"];
    addCheck(checks, "given-present", given.length > 0);
    addCheck(checks, "omitted-source-backed", comparable(passage).includes(comparable(omitted)));
    addCheck(checks, "omitted-hidden", !comparable(rendered).includes(comparable(omitted)));
    addCheck(checks, "five-markers", markers.filter((marker) => rendered.includes(marker)).length === 5);
    const answer = Number(answerLabels(q)[0]);
    let rebuilt = rendered;
    markers.forEach((marker, index) => {
      rebuilt = rebuilt.replace(marker, index + 1 === answer ? ` ${given} ` : " ");
    });
    addCheck(checks, "keyed-gap-reconstructs-source", comparable(rebuilt) === comparable(passage), { answer });
  } else {
    addCheck(checks, "known-source-kind", false, item.sourceKind);
  }

  return {
    valid: checks.length > 0 && checks.every((check) => check.ok),
    checks,
  };
}

const corpusBytes = readFileSync(join(here, "corpus.json"), "utf8");
const oracleBytes = readFileSync(join(here, "oracle.json"), "utf8");
const corpus = JSON.parse(corpusBytes) as { study: string; cases: AuditCase[]; construction: JsonRecord };
const oracle = JSON.parse(oracleBytes) as { cases: Array<{ id: string; expectedTargetPresent: boolean; expectedProductionBlocking: boolean; expectedProductionDisposition: string; expectedControlSourceValid: boolean }> };
const seal = loadJson<{ corpusSha256: string; oracleSha256: string; caseCount: number; familyCount: number }>("seal.json");

if (sha256(corpusBytes) !== seal.corpusSha256) throw new Error("Corpus hash differs from the pre-run seal.");
if (sha256(oracleBytes) !== seal.oracleSha256) throw new Error("Oracle hash differs from the pre-run seal.");
if (corpus.cases.length !== seal.caseCount) throw new Error("Sealed case count mismatch.");

const qualityModule = await import("../../../../src/lib/question-quality/index.js");
const policyModule = await import("../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.js");
const validateQuestionQuality = qualityModule.validateQuestionQuality;
const blockingSet = policyModule.RELAXED_BLOCKING_QUALITY_CODES as Set<string>;

const oracleById = new Map(oracle.cases.map((item) => [item.id, item]));
const rows = corpus.cases.map((item) => {
  const expected = oracleById.get(item.id);
  if (!expected) throw new Error(`Missing oracle row for ${item.id}.`);
  const { question, ...settings } = item.input;
  const validatorInput = { ...settings, question } as unknown as Parameters<
    typeof validateQuestionQuality
  >[0];
  const issues = validateQuestionQuality(validatorInput) as QualityIssue[];
  const issueCodes = [...new Set(issues.map((issue) => issue.code))];
  const blockingCodes = [...new Set(
    issues
      .filter((issue) => issue.severity === "error" && blockingSet.has(issue.code))
      .map((issue) => issue.code),
  )];
  const source = sourceAudit(item);
  return {
    id: item.id,
    pairId: item.pairId,
    familyId: item.familyId,
    variant: item.variant,
    role: item.role,
    sourceKind: item.sourceKind,
    productionExpectation: item.productionExpectation,
    targetCode: item.targetCode,
    targetCodeIsProductionBlocking: blockingSet.has(item.targetCode),
    expectedTargetPresent: expected.expectedTargetPresent,
    observedTargetPresent: issueCodes.includes(item.targetCode),
    expectedProductionBlocking: expected.expectedProductionBlocking,
    observedProductionBlocking: blockingCodes.length > 0,
    expectedControlSourceValid: expected.expectedControlSourceValid,
    sourceAudit: source,
    issueCodes,
    blockingCodes,
    issues,
  };
});

function confusion(expectedKey: "expectedTargetPresent" | "expectedProductionBlocking", observedKey: "observedTargetPresent" | "observedProductionBlocking") {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const row of rows) {
    const expected = row[expectedKey];
    const observed = row[observedKey];
    if (expected && observed) tp += 1;
    else if (!expected && !observed) tn += 1;
    else if (!expected && observed) fp += 1;
    else fn += 1;
  }
  return {
    tp,
    tn,
    fp,
    fn,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
  };
}

const targetExactness = confusion("expectedTargetPresent", "observedTargetPresent");
const productionBlocking = confusion("expectedProductionBlocking", "observedProductionBlocking");
const invalidControls = rows.filter((row) => row.role === "control" && !row.sourceAudit.valid);
const blockingControls = rows.filter((row) => row.role === "control" && row.observedProductionBlocking);
const missedDefects = rows.filter(
  (row) => row.role === "defect" && row.expectedProductionBlocking && !row.observedProductionBlocking,
);
const missedTargets = rows.filter((row) => row.role === "defect" && !row.observedTargetPresent);
const nonBlockingTargets = [...new Set(rows.filter((row) => !row.targetCodeIsProductionBlocking).map((row) => row.targetCode))];
const policyGapTargets = [...new Set(rows
  .filter((row) => row.role === "defect" && row.expectedProductionBlocking && !row.targetCodeIsProductionBlocking)
  .map((row) => row.targetCode))];
const acceptedNonblockingTargets = [...new Set(rows
  .filter((row) => row.role === "defect" && !row.expectedProductionBlocking && !row.targetCodeIsProductionBlocking)
  .map((row) => row.targetCode))];
const familySummary = [...new Set(rows.map((row) => row.familyId))].map((familyId) => {
  const group = rows.filter((row) => row.familyId === familyId);
  return {
    familyId,
    sourceKind: group[0]?.sourceKind,
    targetCode: group[0]?.targetCode,
    targetExact: group.every((row) => row.expectedTargetPresent === row.observedTargetPresent),
    productionExact: group.every((row) => row.expectedProductionBlocking === row.observedProductionBlocking),
    controlsSourceValid: group.filter((row) => row.role === "control").every((row) => row.sourceAudit.valid),
    controlUnexpectedBlockingCodes: [...new Set(group.filter((row) => row.role === "control").flatMap((row) => row.blockingCodes))],
    defectObservedBlockingCodes: [...new Set(group.filter((row) => row.role === "defect").flatMap((row) => row.blockingCodes))],
  };
});

const verdict =
  targetExactness.fp === 0 &&
  targetExactness.fn === 0 &&
  productionBlocking.fp === 0 &&
  productionBlocking.fn === 0 &&
  invalidControls.length === 0 &&
  policyGapTargets.length === 0
    ? "PASS"
    : "PARTIAL";

const results = {
  schemaVersion: 1,
  study: corpus.study,
  verdict,
  sealedInputs: {
    corpusSha256: seal.corpusSha256,
    oracleSha256: seal.oracleSha256,
    caseCount: seal.caseCount,
    familyCount: seal.familyCount,
  },
  targetExactness,
  productionBlocking,
  sourceAwareControlValidity: {
    controlCount: rows.filter((row) => row.role === "control").length,
    validCount: rows.filter((row) => row.role === "control" && row.sourceAudit.valid).length,
    invalidCount: invalidControls.length,
    invalidIds: invalidControls.map((row) => row.id),
  },
  targetPolicy: {
    nonBlockingTargetCount: nonBlockingTargets.length,
    nonBlockingTargets,
    policyGapTargetCount: policyGapTargets.length,
    policyGapTargets,
    acceptedNonblockingTargetCount: acceptedNonblockingTargets.length,
    acceptedNonblockingTargets,
  },
  failures: {
    targetFalsePositiveIds: rows.filter((row) => row.role === "control" && row.observedTargetPresent).map((row) => row.id),
    targetFalseNegativeIds: missedTargets.map((row) => row.id),
    productionFalsePositiveIds: blockingControls.map((row) => row.id),
    productionFalseNegativeIds: missedDefects.map((row) => row.id),
  },
  familySummary,
  rows,
};

const reportLines = [
  "# Deterministic Structural Reaudit v12 — Blind Holdout",
  "",
  `Verdict: **${verdict}**`,
  "",
  "## Sealed design",
  "",
  `- ${seal.familyCount} independently authored validation families`,
  `- ${seal.caseCount} cases (${seal.caseCount / 2} defect/control pairs; three lexical variants per family)`,
  `- corpus SHA-256: \`${seal.corpusSha256}\``,
  `- oracle SHA-256: \`${seal.oracleSha256}\``,
  "- No API, network, database, or production-source mutation was used.",
  "- Earlier v9/v10/v11 corpus, oracle, case payload, and builder artifacts were excluded from authoring.",
  "",
  "## Results",
  "",
  `- Target exactness: TP ${targetExactness.tp}, TN ${targetExactness.tn}, FP ${targetExactness.fp}, FN ${targetExactness.fn}; sensitivity ${targetExactness.sensitivity}, specificity ${targetExactness.specificity}.`,
  `- Production blocking: TP ${productionBlocking.tp}, TN ${productionBlocking.tn}, FP ${productionBlocking.fp}, FN ${productionBlocking.fn}; sensitivity ${productionBlocking.sensitivity}, specificity ${productionBlocking.specificity}.`,
  `- Source-aware control audit: ${results.sourceAwareControlValidity.validCount}/${results.sourceAwareControlValidity.controlCount} valid controls.`,
  `- Structural error targets missing from the production relaxed-blocking policy: ${policyGapTargets.length ? policyGapTargets.join(", ") : "none"}.`,
  `- Preclassified craft-warning targets correctly left nonblocking: ${acceptedNonblockingTargets.length ? acceptedNonblockingTargets.join(", ") : "none"}.`,
  "",
  "## Scope safeguards",
  "",
  "WORD_ORDER controls use reconstructable but strongly shuffled chunks and their model answers do not appear as six-token verbatim runs in the source passage. SENTENCE_ORDER controls use exactly three source-backed blocks, each with at least two sentences and 24 words, and their keyed order reconstructs the source without using visible (A)-(B)-(C) order. Every control also receives a family-specific source/answer synchronization audit in addition to the production validator.",
  "",
  "## Family matrix",
  "",
  "| Family | Surface | Target | Target exact | Production exact | Controls source-valid |",
  "|---|---|---|---:|---:|---:|",
  ...familySummary.map((family) => `| ${family.familyId} | ${family.sourceKind} | \`${family.targetCode}\` | ${family.targetExact ? "yes" : "no"} | ${family.productionExact ? "yes" : "no"} | ${family.controlsSourceValid ? "yes" : "no"} |`),
  "",
  "## Failure ids",
  "",
  `- Target FP: ${results.failures.targetFalsePositiveIds.join(", ") || "none"}`,
  `- Target FN: ${results.failures.targetFalseNegativeIds.join(", ") || "none"}`,
  `- Production FP: ${results.failures.productionFalsePositiveIds.join(", ") || "none"}`,
  `- Production FN: ${results.failures.productionFalseNegativeIds.join(", ") || "none"}`,
  `- Source-invalid controls: ${results.sourceAwareControlValidity.invalidIds.join(", ") || "none"}`,
  "",
];

if (!write) {
  console.log(JSON.stringify({ verdict, targetExactness, productionBlocking, sourceAwareControlValidity: results.sourceAwareControlValidity, policyGapTargets, acceptedNonblockingTargets }, null, 2));
  process.exit(verdict === "PASS" ? 0 : 2);
}

writeFileSync(join(here, "results.json"), jsonBytes(results));
writeFileSync(join(here, "REPORT.md"), `${reportLines.join("\n")}\n`);
console.log(`AUDIT ${verdict} target=${targetExactness.tp}/${targetExactness.tp + targetExactness.fn} controls=${productionBlocking.tn}/${productionBlocking.tn + productionBlocking.fp} source=${results.sourceAwareControlValidity.validCount}/${results.sourceAwareControlValidity.controlCount}`);
process.exitCode = verdict === "PASS" ? 0 : 2;
