import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorCoreModule from "../selector-core";
import * as selectorV2Module from "../v2/selector-core-v2";
import * as selectorV3Module from "../v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorCore =
  (selectorCoreModule as unknown as { default?: typeof selectorCoreModule }).default ??
  selectorCoreModule;
const selectorV2 =
  (selectorV2Module as unknown as { default?: typeof selectorV2Module }).default ??
  selectorV2Module;
const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module }).default ??
  selectorV3Module;
const { contentHash } = selectorCore;
const { NearDuplicateIndex } = selectorV2;
const { buildCorpusV3 } = selectorV3;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const publicFramePath = path.join(here, "source-frame-public.json");
const privateFramePath = path.join(here, "private/source-frame-private.json");
const snapshotPath = path.join(here, "../v3/private/input-snapshot.json");
const reviewPath = path.join(here, "private/reviewer-a.json");
const summaryPath = path.join(here, "reviewer-a-summary.json");
const auditPath = path.join(here, "REVIEWER-A-AUDIT.md");
const manifestPath = path.join(here, "REVIEWER-A-MANIFEST.sha256");
const passagesPath = path.join(repoRoot, "src/data/exam-passages/passages.json");
const rawSourceRoot = path.join(repoRoot, "english-exam-passages/by-exam");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();
const countBy = (values: readonly string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((value) => [value, values.filter((item) => item === value).length]),
  );
const englishTokens = (value: string) =>
  value.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];
const ngrams = (tokens: string[], size: number) => {
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
};

interface PublicRow {
  frameId: string;
  contentHash: string;
  qNumbers: number[];
}
interface PrivateFrameRow {
  frameId: string;
  contentHash: string;
  candidateId: string;
  sourceRecordId: string;
  documentKey: string;
  sourceId: string;
}
type Criterion = "PASS" | "FAIL" | "UNVERIFIABLE";
interface ReviewRow {
  frameId: string;
  verdict: "PASS" | "EXCLUDE" | "DOMAIN_REVIEW";
  reasonCodes: string[];
  criteria: Record<
    | "textCompleteness"
    | "encodingAndOcr"
    | "sentenceBoundaries"
    | "reconstructionFidelity"
    | "centralInference"
    | "contextSupport"
    | "historicalSeparation",
    Criterion
  >;
  privateNote: string;
}
interface Summary {
  sourceBindingHash: string;
  privateReviewSha256: string;
  rowDecisionHash: string;
  verdictCounts: Record<string, number>;
  reasonCodeCounts: Record<string, number>;
  sourceEvidence: {
    rawBlankBearingRecordAvailable: number;
    rawBlankBearingRecordAbsent: number;
    fullRestoredTextExactMatch: number;
    singleRestoredSpanLiteralMatch: number;
    multiConnectorCombinedRecord: number;
    passagesFileSha256: string;
    rawEvidenceFileSetSha256: string;
  };
  historyReplay: Record<string, number>;
  authorization: { campaignEligibleRows: number };
  privacy: Record<string, boolean>;
  safety: Record<string, number>;
}

const publicRaw = readFileSync(publicFramePath, "utf8");
const privateFrameRaw = readFileSync(privateFramePath, "utf8");
const snapshotRaw = readFileSync(snapshotPath, "utf8");
const reviewRaw = readFileSync(reviewPath, "utf8");
const summaryRaw = readFileSync(summaryPath, "utf8");
const auditRaw = readFileSync(auditPath, "utf8");
const publicFrame = JSON.parse(publicRaw) as {
  bindingHash: string;
  rows: PublicRow[];
};
const privateFrame = JSON.parse(privateFrameRaw) as {
  bindingHash: string;
  rows: PrivateFrameRow[];
};
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
const review = JSON.parse(reviewRaw) as {
  sourceBindingHash: string;
  fixedReasonCodes: Record<string, string>;
  rows: ReviewRow[];
  evidencePins: {
    passagesFileSha256: string;
    rawEvidenceFileCount: number;
    rawEvidenceFileSetSha256: string;
  };
  aggregate: {
    reviewed: number;
    verdicts: Record<string, number>;
    rawRestorationEvidence: { available: number; absent: number };
    samplingUsed: boolean;
  };
  independenceAttestation: {
    reviewerBArtifactsRead: boolean;
    reviewerBVerdictsUsed: boolean;
    rowsReviewedManually: number;
    samplingUsed: boolean;
  };
  safety: Record<string, number>;
};
const summary = JSON.parse(summaryRaw) as Summary;
const passages = JSON.parse(readFileSync(passagesPath, "utf8")) as Array<{
  id: string;
  text: string;
}>;

assert.equal(publicFrame.rows.length, 59);
assert.equal(privateFrame.rows.length, 59);
assert.equal(review.rows.length, 59);
assert.equal(review.aggregate.reviewed, 59);
assert.equal(review.aggregate.samplingUsed, false);
assert.deepEqual(review.independenceAttestation, {
  reviewerBArtifactsRead: false,
  reviewerBVerdictsUsed: false,
  rowsReviewedManually: 59,
  samplingUsed: false,
});
assert.equal(review.sourceBindingHash, publicFrame.bindingHash);
assert.equal(privateFrame.bindingHash, publicFrame.bindingHash);
assert.equal(summary.sourceBindingHash, publicFrame.bindingHash);
assert.equal(summary.privateReviewSha256, sha256(reviewRaw));

const decisionCore = review.rows.map((row) => ({
  frameId: row.frameId,
  verdict: row.verdict,
  reasonCodes: row.reasonCodes,
  criteria: row.criteria,
}));
assert.equal(summary.rowDecisionHash, sha256(JSON.stringify(decisionCore)));

const publicIds = publicFrame.rows.map((row) => row.frameId);
const privateIds = privateFrame.rows.map((row) => row.frameId);
const reviewIds = review.rows.map((row) => row.frameId);
assert.deepEqual(privateIds, publicIds);
assert.deepEqual(reviewIds, publicIds);
assert.equal(new Set(reviewIds).size, 59);

const allowedVerdicts = new Set(["PASS", "EXCLUDE", "DOMAIN_REVIEW"]);
const allowedCriteria = new Set(["PASS", "FAIL", "UNVERIFIABLE"]);
const allowedReasonCodes = new Set(Object.keys(review.fixedReasonCodes));
for (const row of review.rows) {
  assert.ok(allowedVerdicts.has(row.verdict));
  assert.ok(row.reasonCodes.length >= 1);
  assert.ok(row.reasonCodes.every((code) => allowedReasonCodes.has(code)));
  assert.ok(Object.values(row.criteria).every((value) => allowedCriteria.has(value)));
  assert.ok(row.privateNote.length >= 30 && row.privateNote.length <= 260);
  assert.equal(row.criteria.historicalSeparation, "PASS");
  assert.equal(row.criteria.textCompleteness, "PASS");
  assert.equal(row.criteria.encodingAndOcr, "PASS");
  assert.equal(row.criteria.sentenceBoundaries, "PASS");
  if (row.verdict === "PASS") {
    assert.deepEqual(row.reasonCodes, ["PASS_ALL_LENS_A_CRITERIA"]);
    assert.ok(Object.values(row.criteria).every((value) => value === "PASS"));
  } else if (row.verdict === "DOMAIN_REVIEW") {
    assert.deepEqual(row.reasonCodes, ["RAW_RESTORATION_EVIDENCE_ABSENT"]);
    assert.equal(row.criteria.reconstructionFidelity, "UNVERIFIABLE");
    assert.equal(row.criteria.centralInference, "UNVERIFIABLE");
    assert.equal(row.criteria.contextSupport, "UNVERIFIABLE");
  } else {
    assert.ok(Object.values(row.criteria).some((value) => value === "FAIL"));
  }
}

const verdictCounts = countBy(review.rows.map((row) => row.verdict));
const reasonCodeCounts = countBy(review.rows.flatMap((row) => row.reasonCodes));
assert.deepEqual(verdictCounts, { DOMAIN_REVIEW: 27, EXCLUDE: 3, PASS: 29 });
assert.deepEqual(review.aggregate.verdicts, { PASS: 29, EXCLUDE: 3, DOMAIN_REVIEW: 27 });
assert.deepEqual(summary.verdictCounts, { PASS: 29, EXCLUDE: 3, DOMAIN_REVIEW: 27 });
assert.deepEqual(reasonCodeCounts, {
  ANSWER_FORM_CONFLICT: 1,
  CONNECTOR_MULTI_BLANK_NOT_INFERENCE: 2,
  MULTI_QUESTION_CONTAINER: 1,
  NONCENTRAL_LOCAL_TARGET: 1,
  PASS_ALL_LENS_A_CRITERIA: 29,
  RAW_RESTORATION_EVIDENCE_ABSENT: 27,
});
assert.deepEqual(summary.reasonCodeCounts, {
  PASS_ALL_LENS_A_CRITERIA: 29,
  RAW_RESTORATION_EVIDENCE_ABSENT: 27,
  NONCENTRAL_LOCAL_TARGET: 1,
  MULTI_QUESTION_CONTAINER: 1,
  CONNECTOR_MULTI_BLANK_NOT_INFERENCE: 2,
  ANSWER_FORM_CONFLICT: 1,
});

assert.equal(sha256(readFileSync(passagesPath)), review.evidencePins.passagesFileSha256);
assert.equal(summary.sourceEvidence.passagesFileSha256, review.evidencePins.passagesFileSha256);
const rawEvidencePins: Array<{ frameId: string; sha256: string }> = [];
let fullRestoredTextExactMatch = 0;
let singleRestoredSpanLiteralMatch = 0;
let multiConnectorCombinedRecord = 0;
let encodingOrControlCharacterFailure = 0;
let incompleteOpeningOrTerminalBoundaryFailure = 0;
const currentById = new Map(passages.map((passage) => [passage.id, passage]));
for (let index = 0; index < 59; index += 1) {
  const publicRow = publicFrame.rows[index];
  const mapping = privateFrame.rows[index];
  const decision = review.rows[index];
  assert.equal(mapping.frameId, publicRow.frameId);
  assert.equal(mapping.contentHash, publicRow.contentHash);
  const passage = currentById.get(mapping.sourceRecordId);
  assert.ok(passage, `missing current passage for ${mapping.frameId}`);
  assert.equal(contentHash(passage.text), publicRow.contentHash);
  const malformedEncoding = /�|Ã.|â€|â€™|â€œ|â€/u.test(passage.text);
  const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(passage.text);
  if (malformedEncoding || controlChars) encodingOrControlCharacterFailure += 1;
  const startsComplete = /^["“‘(]*[A-Z]/u.test(passage.text);
  const endsComplete = /[.!?"”’)]$/u.test(passage.text.trim());
  if (!startsComplete || !endsComplete) incompleteOpeningOrTerminalBoundaryFailure += 1;

  const rawPath = path.join(rawSourceRoot, `${mapping.sourceId}.json`);
  if (!existsSync(rawPath)) {
    assert.equal(decision.verdict, "DOMAIN_REVIEW");
    continue;
  }
  const rawFile = readFileSync(rawPath);
  rawEvidencePins.push({ frameId: mapping.frameId, sha256: sha256(rawFile) });
  const exam = JSON.parse(rawFile.toString("utf8")) as {
    passages: Array<{
      qNumbers: number[];
      rawText: string;
      restoredText: string;
      note: string | null;
      reconstruction: { blankFilledWith: string | null };
    }>;
  };
  const rawPassage = exam.passages.find(
    (item) => item.qNumbers.join(",") === publicRow.qNumbers.join(","),
  );
  assert.ok(rawPassage, `missing raw passage for ${mapping.frameId}`);
  assert.ok(/_{3,}|\([AB]\)\s*_{2,}/u.test(rawPassage.rawText));
  assert.equal(normalize(rawPassage.restoredText), normalize(passage.text));
  fullRestoredTextExactMatch += 1;
  if (["strict-blank-021", "strict-blank-040"].includes(mapping.frameId)) {
    multiConnectorCombinedRecord += 1;
    assert.equal(decision.verdict, "EXCLUDE");
  } else {
    const fill = rawPassage.reconstruction.blankFilledWith;
    assert.ok(fill);
    assert.equal(normalize(passage.text).split(normalize(fill)).length - 1, 1);
    singleRestoredSpanLiteralMatch += 1;
  }
}
assert.equal(rawEvidencePins.length, 32);
assert.equal(sha256(JSON.stringify(rawEvidencePins)), review.evidencePins.rawEvidenceFileSetSha256);
assert.equal(review.evidencePins.rawEvidenceFileCount, 32);
assert.deepEqual(review.aggregate.rawRestorationEvidence, { available: 32, absent: 27 });
assert.equal(fullRestoredTextExactMatch, 32);
assert.equal(singleRestoredSpanLiteralMatch, 30);
assert.equal(multiConnectorCombinedRecord, 2);
assert.equal(encodingOrControlCharacterFailure, 0);
assert.equal(incompleteOpeningOrTerminalBoundaryFailure, 0);
assert.equal(summary.sourceEvidence.rawBlankBearingRecordAvailable, 32);
assert.equal(summary.sourceEvidence.rawBlankBearingRecordAbsent, 27);
assert.equal(summary.sourceEvidence.fullRestoredTextExactMatch, 32);
assert.equal(summary.sourceEvidence.singleRestoredSpanLiteralMatch, 30);
assert.equal(summary.sourceEvidence.multiConnectorCombinedRecord, 2);
assert.equal(summary.sourceEvidence.rawEvidenceFileSetSha256, review.evidencePins.rawEvidenceFileSetSha256);

const selection = buildCorpusV3(snapshot);
const selected = selection.selected["focus-blank-killer"];
assert.equal(selected.length, 59);
assert.deepEqual(
  selected.map((item) => item.contentHash),
  publicFrame.rows.map((item) => item.contentHash),
);
const historicalIds = new Set(snapshot.historicalPassageIds);
const historicalIndex = new NearDuplicateIndex();
for (const reference of snapshot.forbiddenReferences) {
  historicalIndex.add({
    id: reference.id,
    text: reference.text,
    source: reference.source,
    document: reference.document,
  });
}
const withinFrameIndex = new NearDuplicateIndex();
for (const candidate of selected) {
  const aliases = [
    candidate.id,
    candidate.id.replace(/^repo:/iu, ""),
    candidate.sourceRecordId,
    candidate.sourceRecordId.replace(/^repo:/iu, ""),
  ];
  assert.ok(aliases.every((alias) => !historicalIds.has(alias)));
  assert.equal(historicalIndex.query(candidate as never), null);
  assert.equal(withinFrameIndex.query(candidate as never), null);
  withinFrameIndex.add({
    id: candidate.id,
    text: candidate.text,
    source: "reviewer-a-frame",
    document: candidate.document,
  });
}
assert.deepEqual(summary.historyReplay, {
  pinnedSelectionRowsReproduced: 59,
  historicalIdCollision: 0,
  historicalExactOrNearDuplicate: 0,
  withinFrameExactOrNearDuplicate: 0,
});

const publicOutputs = `${summaryRaw}\n${auditRaw}`;
assert.ok(
  !/"(?:text|candidateId|sourceRecordId|academyId|documentKey|sourceId|privateNote)"\s*:/u.test(
    summaryRaw,
  ),
);
for (const mapping of privateFrame.rows) {
  for (const privateValue of [
    mapping.candidateId,
    mapping.sourceRecordId,
    mapping.documentKey,
    mapping.sourceId,
  ]) {
    assert.ok(!publicOutputs.includes(privateValue));
    assert.ok(!reviewRaw.includes(`"${privateValue}"`));
  }
}
const passageEightGrams = new Set<string>();
for (const passage of passages) {
  for (const gram of ngrams(englishTokens(passage.text), 8)) passageEightGrams.add(gram);
}
for (const row of review.rows) {
  for (const gram of ngrams(englishTokens(row.privateNote), 8)) {
    assert.ok(!passageEightGrams.has(gram), `verbatim note overlap in ${row.frameId}`);
  }
}
assert.deepEqual(summary.privacy, {
  passageTextIncluded: false,
  privateSourceIdentifiersIncluded: false,
  perRowPrivateNotesIncluded: false,
});
assert.deepEqual(summary.safety, {
  modelApiCalls: 0,
  networkCalls: 0,
  databaseCalls: 0,
  campaignCandidates: 0,
});
assert.deepEqual(review.safety, summary.safety);
assert.equal(summary.authorization.campaignEligibleRows, 0);

const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.equal(manifestLines.length, 8);
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(repoRoot, relativePath))),
    expected,
    `hash mismatch: ${relativePath}`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "FRAME_BLOCKED",
      rowsReviewedManually: 59,
      samplingUsed: false,
      verdictCounts: { PASS: 29, EXCLUDE: 3, DOMAIN_REVIEW: 27 },
      rawEvidence: { available: 32, absent: 27, exactRestoredText: 32 },
      historyCollisions: 0,
      campaignEligibleRows: 0,
      privacy: "PASS",
      manifestEntries: manifestLines.length,
      safety: summary.safety,
    },
    null,
    2,
  )}\n`,
);
