import assert from "node:assert/strict";
import test from "node:test";

import { stableStringify } from "../selector-core";
import type { V3PinnedSnapshot, V3RawCandidate } from "../v3/types-v3";
import {
  assertCurrentStateCaptureArguments,
  buildV4DependencyManifest,
  dependencyManifestHashV4,
} from "./build-inventory-v4";
import {
  analyzeInventoryV4,
  inventorySnapshotHashV4,
  isCoreEnglishV4,
  minimumRateForSupplyV4,
} from "./inventory-core-v4";
import type { V4InventoryRecord, V4PinnedInventory } from "./types-v4";

function longPassage(label: string, sentences = 10): string {
  return Array.from(
    { length: sentences },
    (_, index) =>
      `${label} sentence ${index + 1} explains a meaningful relationship because careful readers compare evidence; however, the conclusion changes when context reveals another consequence for people and institutions.`,
  ).join(" ");
}

function v3Candidate(id: string, text: string): V3RawCandidate {
  return {
    id: `repo:${id}`,
    sourceRecordId: id,
    origin: "repo-official",
    text,
    reviewed: true,
    confidence: "high",
    reconstructionKind: "none",
    hasDeliberateError: false,
    document: {
      documentKey: `doc:${id}`,
      sourceKind: "OFFICIAL_EXAM_REPOSITORY",
      sourceId: id,
      year: 2025,
      round: "test",
      qNumbers: [1],
      originalType: "주제",
    },
    databaseEvidence: {
      candidateAcademyId: null,
      priorUseScope: "ALL_ACADEMIES",
      matchedPassageCount: 0,
      matchedPassageIds: [],
      questionCount: 0,
      aiQuestionCount: 0,
      workbenchJobCount: 0,
      reviewed: false,
      representativeReviewed: false,
      reviewedPassageCount: 0,
      matchedAcademyCount: 0,
    },
  };
}

function v3Snapshot(candidates: V3RawCandidate[]): V3PinnedSnapshot {
  return {
    schemaVersion: 3,
    asOf: "2026-07-15T00:00:00.000Z",
    seed: "test",
    gitSha: "a".repeat(40),
    gitDirty: false,
    codeHash: "code",
    repoPassagesFileHash: "repo",
    historicalFilesHash: "history-files",
    historicalExtractHash: "history-extract",
    databaseExtractHash: "db",
    candidates,
    retained: [],
    forbiddenReferences: [],
    historicalPassageIds: [],
    diagnostics: {},
    snapshotHash: "v3-test-snapshot",
  };
}

function inventoryRecord(
  id: string,
  text: string,
  family: V4InventoryRecord["family"],
): V4InventoryRecord {
  return {
    id,
    family,
    text,
    sourceDocumentKey: `source:${id}`,
    sourceMaterialType: "EXAM",
    sourceMaterialSubject: "ENGLISH",
    sourceExamType: "MIDTERM",
    sourceRefPresent: false,
    originalFilePresent: true,
    academyId: "academy-secret",
    reviewState: family === "committed-passage-current" ? "COMMITTED" : "DRAFT",
    lineageState: family === "committed-passage-current"
      ? "CANONICAL_COMMITTED_PASSAGE"
      : "NONE",
    savedOrPromoted: family === "committed-passage-current",
    rightsStatus: "CUSTOMER_UPLOAD_RIGHTS_NOT_RECORDED",
    officialTypeTagged: true,
    blankEvidence: family === "extraction-item-passage" ? "LINKED_ORIGINAL_STEM" : "NONE",
    blankStemCount: family === "extraction-item-passage" ? 1 : 0,
  };
}

function inventory(records: V4InventoryRecord[]): V4PinnedInventory {
  const dependencyManifest = {
    algorithm: "STATIC_LOCAL_IMPORT_CLOSURE_PLUS_DECLARED_INPUTS_V2" as const,
    entrypoints: ["test.ts"],
    files: {},
    repositoryGit: {
      headSha: "a".repeat(40),
      dirty: true,
      dirtyPathCount: 1,
      untrackedPathCount: 1,
      dependencyDirty: true,
      dependencyDirtyPaths: ["test.ts"],
      dependencyUntrackedPaths: ["test.ts"],
    },
    manifestHash: "dependency-test",
  };
  const core = {
    schemaVersion: 4 as const,
    version: "test-v4",
    capturedAt: "2026-07-15T00:00:00.000Z",
    captureWindow: {
      startedAt: "2026-07-14T23:59:59.000Z",
      completedAt: "2026-07-15T00:00:00.000Z",
    },
    temporalSemantics: "CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF" as const,
    historicalAsOfSupported: false as const,
    v3SnapshotHash: "v3-test-snapshot",
    gitSha: "a".repeat(40),
    codeHash: "dependency-test",
    dependencyManifest,
    localSourceHashes: {},
    databaseExtractHash: "db",
    databaseRecordSetHash: "db-records",
    records,
    sourceDiagnostics: {},
  };
  return { ...core, snapshotHash: inventorySnapshotHashV4(core) };
}

test("core-English gate is explicit and bounded", () => {
  assert.equal(isCoreEnglishV4(longPassage("eligible")), true);
  assert.equal(isCoreEnglishV4("A short English sentence."), false);
  assert.equal(isCoreEnglishV4("한국어 문장입니다. ".repeat(100)), false);
});

test("minimum rate reports mathematical impossibility and exact assurance threshold", () => {
  assert.equal(minimumRateForSupplyV4(59, 66), null);
  const rate = minimumRateForSupplyV4(154, 29);
  assert.ok(rate !== null && rate > 0.2 && rate < 0.3);
});

test("v3, earlier-family, and earlier-within-family overlaps are labeled separately", () => {
  const oldText = longPassage("already in v3");
  const newText = Array.from(
    { length: 8 },
    (_, index) =>
      `Astronomers observation ${index + 1} uses calibrated telescopes to measure distant stellar spectra. Each wavelength reveals chemical elements, temperature, motion, and magnetic activity across a changing galaxy, so repeated measurements let researchers distinguish transient noise from durable celestial patterns.`,
  ).join(" ");
  const familyOnlyText = Array.from(
    { length: 8 },
    (_, index) =>
      `Ecologists field study ${index + 1} uses calibrated sensors to measure forest recovery after disturbance. Each observation reveals soil moisture, canopy growth, species movement, and seasonal change across a watershed, so repeated measurements let researchers distinguish transient noise from durable ecosystem patterns.`,
  ).join(" ");
  const familyOnlyVariant = familyOnlyText.replace(
    "durable ecosystem patterns.",
    "durable ecosystem patterns under climate pressure.",
  );
  const v3 = v3Snapshot([v3Candidate("old", oldText)]);
  const report = analyzeInventoryV4(
    inventory([
      inventoryRecord("committed-old", oldText, "committed-passage-current"),
      inventoryRecord("committed-new", newText, "committed-passage-current"),
      inventoryRecord("draft-same-new", newText, "extraction-item-passage"),
      inventoryRecord("draft-same-new-2", newText, "extraction-item-passage"),
      inventoryRecord("m1-family-first", familyOnlyText, "m1-passage-draft"),
      inventoryRecord("m1-family-near", familyOnlyVariant, "m1-passage-draft"),
    ]),
    v3,
  );
  const committed = report.familySummaries.find(
    (summary) => summary.family === "committed-passage-current",
  );
  const draft = report.familySummaries.find(
    (summary) => summary.family === "extraction-item-passage",
  );
  const m1 = report.familySummaries.find((summary) => summary.family === "m1-passage-draft");
  assert.equal(committed?.allExactOrNearV3Overlap, 1);
  assert.equal(committed?.netIncrementalAfterV3AndEarlierInventory, 1);
  assert.equal(draft?.earlierFamilyExactOrNearOverlap, 1);
  assert.equal(draft?.earlierWithinFamilyExactOrNearOverlap, 0);
  assert.equal(draft?.netIncrementalAfterV3AndEarlierInventory, 0);
  assert.equal(m1?.earlierFamilyExactOrNearOverlap, 0);
  assert.equal(m1?.earlierWithinFamilyExactOrNearOverlap, 1);
  assert.equal(m1?.netIncrementalAfterV3AndEarlierInventory, 1);
  assert.equal("crossSourceExactOrNearOverlap" in (draft ?? {}), false);
});

test("public report never serializes private academy identifiers or raw passages", () => {
  const text = longPassage("private inventory text");
  const report = analyzeInventoryV4(
    inventory([inventoryRecord("private", text, "m1-passage-draft")]),
    v3Snapshot([]),
  );
  const serialized = stableStringify(report);
  assert.equal(serialized.includes("academy-secret"), false);
  assert.equal(serialized.includes(text), false);
  assert.equal(serialized.includes("officialTraceable"), false);
  assert.equal(report.constraints.operationalManifestCreated, false);
});

test("current-state capture contract rejects caller-supplied historical or capture timestamps", () => {
  assert.doesNotThrow(() => assertCurrentStateCaptureArguments([]));
  assert.doesNotThrow(() => assertCurrentStateCaptureArguments(["--write"]));
  assert.throws(
    () => assertCurrentStateCaptureArguments(["--as-of=2000-01-01T00:00:00Z"]),
    /current-state, not temporal/i,
  );
  assert.throws(
    () => assertCurrentStateCaptureArguments(["--captured-at", "2000-01-01T00:00:00Z"]),
    /cannot be supplied/i,
  );
});

test("dependency manifest closes over imported research code, schema, lockfile, and dynamic catalogs", () => {
  const manifest = buildV4DependencyManifest();
  const paths = Object.keys(manifest.files);
  for (const expected of [
    "experiments/question-quality-20260715/corpus/selector-core.ts",
    "experiments/question-quality-20260715/corpus/v2/history-index.ts",
    "experiments/question-quality-20260715/corpus/v2/selector-core-v2.ts",
    "experiments/question-quality-20260715/corpus/v3/history-v3.ts",
    "experiments/question-quality-20260715/corpus/v3/queue-sizing.ts",
    "experiments/question-quality-20260715/corpus/v3/snapshot-v3.ts",
    "experiments/question-quality-20260715/corpus/v3/types-v3.ts",
    "prisma/schema.prisma",
    "package-lock.json",
    "src/data/exam-passages/facets.json",
  ]) {
    assert.equal(paths.includes(expected), true, `missing dependency ${expected}`);
  }
  assert.equal(
    paths.some((filePath) => filePath.startsWith("src/data/grammar-drill/") && filePath.endsWith(".json")),
    true,
  );
  assert.equal(dependencyManifestHashV4(manifest), manifest.manifestHash);
  assert.equal(typeof manifest.repositoryGit.dirty, "boolean");
  assert.throws(
    () => buildV4DependencyManifest(["definitely/missing-v4-dependency.txt"]),
    /missing required v4 dependency/i,
  );
});

test("public family summary exposes evidence-strength and saved/promoted lineage precisely", () => {
  const text = longPassage("lineage record");
  const record = inventoryRecord("lineage", text, "m1-passage-draft");
  record.lineageState = "SAVED_PASSAGE_LINKED";
  record.savedOrPromoted = true;
  record.sourceRefPresent = false;
  record.originalFilePresent = false;
  const report = analyzeInventoryV4(inventory([record]), v3Snapshot([]));
  const summary = report.familySummaries.find((item) => item.family === "m1-passage-draft");
  assert.equal(summary?.netIncrementalOfficialTypeTagged, 1);
  assert.equal(summary?.netIncrementalOfficialTypeTaggedWithSourceRefOrOriginalFileLocator, 0);
  assert.equal(summary?.netIncrementalLineageState.SAVED_PASSAGE_LINKED, 1);
});

test("alternatives state estimand changes instead of silently pooling", () => {
  const report = analyzeInventoryV4(inventory([]), v3Snapshot([]));
  assert.equal(report.alternatives[0].preservesV3Estimand, true);
  assert.equal(report.alternatives[1].preservesV3Estimand, false);
  assert.equal(report.alternatives[2].preservesV3Estimand, false);
  assert.match(report.recommendation, /never relabel/i);
});

test("inventory snapshot hash changes on any pinned input tamper", () => {
  const first = inventory([]);
  const core = { ...first };
  delete (core as Partial<V4PinnedInventory>).snapshotHash;
  const original = inventorySnapshotHashV4(core as Omit<V4PinnedInventory, "snapshotHash">);
  const changed = inventorySnapshotHashV4({
    ...(core as Omit<V4PinnedInventory, "snapshotHash">),
    databaseExtractHash: "changed",
  });
  assert.equal(original, first.snapshotHash);
  assert.notEqual(original, changed);
});
