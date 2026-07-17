import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import nextEnv from "@next/env";

import * as selectorV3Module from "../../corpus/v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../../corpus/v3/types-v3";

const selectorV3 = (
  selectorV3Module as unknown as { default?: typeof selectorV3Module }
).default ?? selectorV3Module;
const { buildCorpusV3 } = selectorV3;
const { loadEnvConfig } = nextEnv;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ARTIFACT = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/selected-source-history-v1",
);
const LABEL = "baseline-20260715-0745";
const PUBLIC_PATH = path.join(ARTIFACT, "runs", `${LABEL}-public.json`);
const PRIVATE_PATH = path.join(ARTIFACT, "private", `${LABEL}-private.json`);
const MANIFEST_PATH = path.join(ARTIFACT, "runs", `${LABEL}-MANIFEST.sha256`);
const REFRESH_PATH = path.join(ARTIFACT, "refresh.mts");
const LOADER_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/v3/snapshot-v3.ts",
);
const SNAPSHOT_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
);
const GRAMMAR_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/private/reconciliation-and-split-v2.json",
);
const BLANK_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json",
);

type FocusType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
type Split = "development" | "confirmatory" | "reserve";

interface SelectedRow {
  frameId: string;
  contentHash: string;
  split: Split;
  focusType: FocusType;
}

interface PrivateHistoryRow extends SelectedRow {
  matchedPassageCount: number;
  questionCount: number;
  aiQuestionCount: number;
  workbenchJobCount: number;
  historyClean: boolean;
}

interface Reconciliation {
  sourceBindingHash: string;
  selection: {
    rows: Array<{
      frameId: string;
      contentHash: string;
      split: Split;
    }>;
  };
}

function readRaw(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readRaw(filePath)) as T;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeContent(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function contentHash(value: string): string {
  return sha256(normalizeContent(value));
}

function stableStringify(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const result = {} as Record<T, number>;
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function flattenStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) {
    for (const child of value) flattenStrings(child, output);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      flattenStrings(child, output);
    }
  }
  return output;
}

function manifestEntries(raw: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of raw.trimEnd().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function coreWithout<T extends Record<string, unknown>>(
  value: T,
  excluded: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.includes(key)),
  );
}

function jsonContainsAnyIdentifier(value: unknown, identifiers: Set<string>): boolean {
  const publicStrings = flattenStrings(value);
  return [...identifiers].some((identifier) =>
    publicStrings.some((item) => item.includes(identifier)),
  );
}

function idsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function main(): Promise<void> {
  const publicRaw = readRaw(PUBLIC_PATH);
  const privateRaw = readRaw(PRIVATE_PATH);
  const manifestRaw = readRaw(MANIFEST_PATH);
  const refreshRaw = readRaw(REFRESH_PATH);
  const loaderRaw = readRaw(LOADER_PATH);
  const snapshotRaw = readRaw(SNAPSHOT_PATH);
  const grammarRaw = readRaw(GRAMMAR_PATH);
  const blankRaw = readRaw(BLANK_PATH);

  const publicArtifact = JSON.parse(publicRaw) as Record<string, unknown>;
  const privateArtifact = JSON.parse(privateRaw) as Record<string, unknown> & {
    rows: PrivateHistoryRow[];
  };
  const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
  const grammar = JSON.parse(grammarRaw) as Reconciliation;
  const blank = JSON.parse(blankRaw) as Reconciliation;
  const manifest = manifestEntries(manifestRaw);

  assert.equal(publicArtifact.label, LABEL);
  assert.equal(privateArtifact.label, LABEL);
  assert.equal(publicArtifact.schemaVersion, "selected-source-history-refresh-public-v1");
  assert.equal(privateArtifact.schemaVersion, "selected-source-history-refresh-v1");

  const manifestChecks = new Map<string, string>([
    [`runs/${LABEL}-public.json`, sha256(publicRaw)],
    [`private/${LABEL}-private.json`, sha256(privateRaw)],
    ["refresh.mts", sha256(refreshRaw)],
    ["../v3/private/input-snapshot.json", sha256(snapshotRaw)],
    [
      "../cross-type-grammar-source-frame-v2/private/reconciliation-and-split-v2.json",
      sha256(grammarRaw),
    ],
    [
      "../cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json",
      sha256(blankRaw),
    ],
  ]);
  assert.equal(manifest.size, manifestChecks.size);
  for (const [name, expected] of manifestChecks) {
    assert.equal(manifest.get(name), expected, `manifest mismatch: ${name}`);
  }

  const privateCore = coreWithout(privateArtifact, ["artifactSha256"]);
  assert.equal(
    privateArtifact.artifactSha256,
    sha256(stableStringify(privateCore)),
    "private internal artifact seal mismatch",
  );
  const publicCore = coreWithout(publicArtifact, [
    "artifactSha256",
    "privateArtifactSha256",
  ]);
  assert.equal(
    publicArtifact.artifactSha256,
    sha256(stableStringify(publicCore)),
    "public internal artifact seal mismatch",
  );
  assert.equal(publicArtifact.privateArtifactSha256, sha256(privateRaw));

  assert.equal(grammar.selection.rows.length, 38);
  assert.equal(blank.selection.rows.length, 38);
  const selected: SelectedRow[] = [
    ...grammar.selection.rows.map((row) => ({
      frameId: row.frameId,
      contentHash: row.contentHash,
      split: row.split,
      focusType: "GRAMMAR_ERROR" as const,
    })),
    ...blank.selection.rows.map((row) => ({
      frameId: row.frameId,
      contentHash: row.contentHash,
      split: row.split,
      focusType: "BLANK_INFERENCE" as const,
    })),
  ];
  assert.equal(selected.length, 76);
  assert.equal(new Set(selected.map((row) => row.frameId)).size, 76);
  assert.equal(new Set(selected.map((row) => row.contentHash)).size, 76);
  assert.equal(
    publicArtifact.status,
    "CURRENT_DATABASE_HISTORY_CLEAN_NOT_AUTHORIZED",
  );
  assert.deepEqual(countBy(selected.map((row) => row.focusType)), {
    BLANK_INFERENCE: 38,
    GRAMMAR_ERROR: 38,
  });
  for (const focusType of ["GRAMMAR_ERROR", "BLANK_INFERENCE"] as const) {
    assert.deepEqual(
      countBy(
        selected
          .filter((row) => row.focusType === focusType)
          .map((row) => row.split),
      ),
      { confirmatory: 20, development: 6, reserve: 12 },
    );
  }

  const selectionResult = buildCorpusV3(snapshot);
  const pool = selectionResult.selected["focus-grammar-killer"];
  assert.ok(pool.length >= 76);
  const poolByHash = new Map(pool.map((row) => [row.contentHash, row]));
  const frozenRows = selected.map((row) => {
    const candidate = poolByHash.get(row.contentHash);
    assert.ok(candidate, "selected row absent from sealed focus pool");
    assert.equal(contentHash(candidate.text), row.contentHash);
    assert.equal(candidate.databaseEvidence.questionCount, 0);
    assert.equal(candidate.databaseEvidence.aiQuestionCount, 0);
    assert.equal(candidate.databaseEvidence.workbenchJobCount, 0);
    return candidate;
  });
  const originCounts = countBy(frozenRows.map((row) => row.origin));
  assert.deepEqual(originCounts, { "db-global": 20, "repo-official": 56 });
  assert.equal(
    frozenRows.filter((row) => row.privateDatabaseProvenance !== undefined).length,
    20,
  );

  assert.equal(privateArtifact.rows.length, 76);
  assert.equal(new Set(privateArtifact.rows.map((row) => row.contentHash)).size, 76);
  const baselineByHash = new Map(
    privateArtifact.rows.map((row) => [row.contentHash, row]),
  );
  for (const row of selected) {
    const baseline = baselineByHash.get(row.contentHash);
    assert.ok(baseline, "selected row missing from baseline private artifact");
    assert.equal(baseline.frameId, row.frameId);
    assert.equal(baseline.focusType, row.focusType);
    assert.equal(baseline.split, row.split);
    assert.equal(baseline.questionCount, 0);
    assert.equal(baseline.aiQuestionCount, 0);
    assert.equal(baseline.workbenchJobCount, 0);
    assert.equal(baseline.historyClean, true);
  }
  assert.equal(
    privateArtifact.rows.filter((row) => row.matchedPassageCount > 0).length,
    20,
  );
  assert.equal(
    privateArtifact.rows.reduce((sum, row) => sum + row.matchedPassageCount, 0),
    20,
  );

  const privateIdentifiers = new Set<string>();
  for (const row of privateArtifact.rows) {
    privateIdentifiers.add(row.frameId);
    privateIdentifiers.add(row.contentHash);
  }
  for (const candidate of frozenRows) {
    privateIdentifiers.add(candidate.text);
    const provenance = candidate.privateDatabaseProvenance;
    if (!provenance) continue;
    privateIdentifiers.add(provenance.representativePassageId);
    privateIdentifiers.add(provenance.representativeAcademyId);
    for (const id of provenance.matchedPassageIds) privateIdentifiers.add(id);
    for (const id of provenance.matchedAcademyIds) privateIdentifiers.add(id);
  }
  assert.equal(jsonContainsAnyIdentifier(publicArtifact, privateIdentifiers), false);

  assert.match(
    loaderRaw,
    /prisma\.question\.groupBy\([\s\S]*?passageId:\s*\{\s*in:\s*ids\s*\}[\s\S]*?\)/,
  );
  assert.match(
    loaderRaw,
    /prisma\.workbenchAiJob\.groupBy\([\s\S]*?passageId:\s*\{\s*in:\s*ids\s*\}[\s\S]*?\)/,
  );
  const queryBundleStart = loaderRaw.indexOf("const [questions, aiQuestions, jobs]");
  const queryBundleEnd = loaderRaw.indexOf("const qById", queryBundleStart);
  assert.ok(queryBundleStart >= 0 && queryBundleEnd > queryBundleStart);
  const queryBundle = loaderRaw.slice(queryBundleStart, queryBundleEnd);
  assert.doesNotMatch(
    queryBundle,
    /\b(?:academyId|domain|status|deletedAt)\s*:/,
    "direct history counts must include every academy/domain/status/deletion state",
  );
  assert.doesNotMatch(
    `${refreshRaw}\n${loaderRaw}`,
    /prisma\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
  );
  assert.match(refreshRaw, /flag:\s*"wx"/);

  loadEnvConfig(ROOT);
  const { prisma } = await import("../../../../src/lib/prisma");
  const db = prisma as unknown as Record<string, any>;
  try {
    // Deliberately broader than the production loader: every Passage row in
    // every academy is hashed first, then the loader's subject/language
    // eligibility is audited as a separate classification.
    const allPassages = (await db.passage.findMany({
      select: {
        id: true,
        academyId: true,
        content: true,
        subject: true,
        sourceMaterial: { select: { subject: true } },
      },
      orderBy: [{ id: "asc" }],
    })) as Array<{
      id: string;
      academyId: string;
      content: string;
      subject: string | null;
      sourceMaterial: { subject: string | null } | null;
    }>;
    const selectedHashes = new Set(selected.map((row) => row.contentHash));
    const allExactMatches = allPassages.filter((row) =>
      selectedHashes.has(contentHash(row.content)),
    );
    const loaderEligibleMatches = allExactMatches.filter((row) => {
      if (row.subject !== null && row.subject !== "ENGLISH") return false;
      const compact = normalizeContent(row.content).replace(/\s/g, "");
      const latin = compact.match(/[A-Za-z]/g)?.length ?? 0;
      const sourceSubject = row.sourceMaterial?.subject?.toUpperCase() ?? null;
      return (
        latin / Math.max(1, compact.length) >= 0.55 &&
        (sourceSubject === null || sourceSubject === "ENGLISH")
      );
    });
    assert.equal(allExactMatches.length, 20);
    assert.equal(loaderEligibleMatches.length, 20);
    assert.equal(new Set(allExactMatches.map((row) => row.academyId)).size > 0, true);

    const pinnedPassageIds = new Set(
      frozenRows.flatMap(
        (row) => row.privateDatabaseProvenance?.matchedPassageIds ?? [],
      ),
    );
    assert.equal(pinnedPassageIds.size, 20);
    const currentPinnedRows = allPassages.filter((row) => pinnedPassageIds.has(row.id));
    assert.equal(currentPinnedRows.length, 20);
    assert.equal(
      currentPinnedRows.every((row) => selectedHashes.has(contentHash(row.content))),
      true,
    );

    const matchedIds = [...new Set(allExactMatches.map((row) => row.id))];
    const [questions, aiQuestions, workbenchJobs] = await Promise.all([
      db.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: matchedIds } },
        _count: { _all: true },
      }),
      db.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: matchedIds }, aiGenerated: true },
        _count: { _all: true },
      }),
      db.workbenchAiJob.groupBy({
        by: ["passageId"],
        where: { passageId: { in: matchedIds } },
        _count: { _all: true },
      }),
    ]);
    const sumCounts = (rows: Array<{ _count: { _all: number } }>) =>
      rows.reduce((sum, row) => sum + row._count._all, 0);
    assert.equal(sumCounts(questions), 0);
    assert.equal(sumCounts(aiQuestions), 0);
    assert.equal(sumCounts(workbenchJobs), 0);

    // Supplemental lineage probes are not part of v1's declared metric.
    // They quantify obvious exact-ID false-clean paths without inspecting or
    // emitting passage text, question text, or private identifiers.
    const [naeshinCount, similarJobs, customJobs, detachedWorkbenchJobs] =
      await Promise.all([
        db.naeshinQuestion.count({ where: { passageId: { in: matchedIds } } }),
        db.similarQuestionGenerationJob.findMany({
          select: { passageIds: true },
        }),
        db.customQuestionGenerationJob.findMany({
          select: { passageIds: true },
        }),
        db.workbenchAiJob.findMany({
          where: { passageId: null },
          select: { config: true, result: true },
        }),
      ]);
    const referencesSelectedId = (value: unknown): boolean =>
      idsFromJson(value).some((id) => pinnedPassageIds.has(id));
    const containsSelectedId = (value: unknown): boolean =>
      flattenStrings(value).some((item) => pinnedPassageIds.has(item));
    const supplemental = {
      naeshinQuestionRows: Number(naeshinCount),
      similarQuestionJobsReferencingSelectedIds: (
        similarJobs as Array<{ passageIds: unknown }>
      ).filter((job) => referencesSelectedId(job.passageIds)).length,
      customQuestionJobsReferencingSelectedIds: (
        customJobs as Array<{ passageIds: unknown }>
      ).filter((job) => referencesSelectedId(job.passageIds)).length,
      detachedWorkbenchJobsWithSelectedIdInConfigOrResult: (
        detachedWorkbenchJobs as Array<{ config: unknown; result: unknown }>
      ).filter(
        (job) => containsSelectedId(job.config) || containsSelectedId(job.result),
      ).length,
    };

    const output = {
      schemaVersion: "selected-source-history-v1-independent-audit-v1",
      label: "independent-audit-20260715-v1",
      verdict: "PASS",
      scopeQualification:
        "Exact normalized-content matches plus directly linked Question/aiQuestion/WorkbenchAiJob rows across all academies; not a universal proof over deleted content or every alternate lineage store.",
      baseline: {
        selectedRows: selected.length,
        grammarRows: 38,
        blankRows: 38,
        origins: originCounts,
        frozenQuestionZeroRows: 76,
        frozenAiQuestionZeroRows: 76,
        frozenWorkbenchJobZeroRows: 76,
        baselineHistoryCleanRows: privateArtifact.rows.filter(
          (row) => row.historyClean,
        ).length,
        frozenSelectorOverallStatus: selectionResult.status,
      },
      independentCurrentDbRecapture: {
        allAcademies: true,
        allPassageRowsExamined: allPassages.length,
        exactNormalizedContentMatches: allExactMatches.length,
        loaderEligibleExactMatches: loaderEligibleMatches.length,
        subjectExcludedExactMatches:
          allExactMatches.length - loaderEligibleMatches.length,
        pinnedDbPassageIds: pinnedPassageIds.size,
        pinnedDbPassageIdsStillPresent: currentPinnedRows.length,
        pinnedDbPassageIdsStillContentIdentical: currentPinnedRows.filter((row) =>
          selectedHashes.has(contentHash(row.content)),
        ).length,
        questionRows: sumCounts(questions),
        aiQuestionRows: sumCounts(aiQuestions),
        workbenchAiJobRows: sumCounts(workbenchJobs),
      },
      supplementalExactIdLineageProbe: supplemental,
      integrity: {
        manifestEntriesVerified: manifestChecks.size,
        publicInternalSealVerified: true,
        privateInternalSealVerified: true,
        privateBindingFromPublicVerified: true,
        immutableWriteFlagPresent: true,
        baselineFilesOverwritten: 0,
      },
      privacy: {
        privateIdentifiersOrPassagesFoundVerbatimInPublic: 0,
        opaqueAggregateCryptographicBindingsPresent: true,
      },
      residualRisks: {
        baselineManifestPinsTransitiveLoaderAndSelectorBytes: false,
        threeArtifactWriteIsAtomic: false,
        exactContentMatchingDetectsNearDuplicates: false,
        futureRefreshCanRecoverDeletedOrPreviouslyMutatedPassageContent: false,
        currentPinnedDbRowsCloseDeleteOrMutationRiskForThisCapture: true,
        supplementalAlternateLineageExactIdProbesWereClean: Object.values(
          supplemental,
        ).every((count) => count === 0),
        frozenSelectorOverallReady: selectionResult.status === "READY_FOR_BLIND_AUDIT",
      },
      safety: {
        databaseReadMethods: ["findMany", "groupBy", "count"],
        databaseWrites: 0,
        modelApiCalls: 0,
        fullQuestionCandidatesGenerated: 0,
      },
    };
    process.stdout.write(stableStringify(output));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
