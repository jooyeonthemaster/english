import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import { HS_PASSAGE_DATA } from "../../../../scripts/data/hs-passages";
import { MS_PASSAGE_DATA } from "../../../../scripts/data/ms-passages";
import { RESTORATION_CASES } from "../../../../scripts/restoration-lite-corpus";
import { TEST_PASSAGES } from "../../../../scripts/report-test-passages";
import { prisma } from "../../../../src/lib/prisma";
import { contentHash, countWords, sha256, stableStringify } from "../selector-core";
import { loadGlobalDatabaseV3 } from "../v3/snapshot-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";
import { analyzeInventoryV4, inventorySnapshotHashV4 } from "./inventory-core-v4";
import {
  V4_SUPPLY_SCHEMA_VERSION,
  V4_SUPPLY_VERSION,
  type V4InventoryRecord,
  type V4DependencyEntry,
  type V4DependencyGitStatus,
  type V4DependencyManifest,
  type V4LineageState,
  type V4PinnedInventory,
  type V4ReviewState,
  type V4RightsStatus,
} from "./types-v4";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const V4_REPO_ROOT = path.resolve(HERE, "../../../..");
const V3_SNAPSHOT_PATH = path.resolve(HERE, "../v3/private/input-snapshot.json");
const PRIVATE_SNAPSHOT_PATH = path.join(HERE, "private/inventory-snapshot.json");
const PUBLIC_REPORT_PATH = path.join(HERE, "inventory-public.json");
const DECLARED_SURVEY_FILES = [
  "src/data/exam-passages/passages.json",
  "src/data/exam-passages/facets.json",
  "src/data/suneung-wanseong/passages.json",
  "src/data/exam-passages-korean/passages.json",
] as const;
const DEPENDENCY_ENTRYPOINTS = [
  "experiments/question-quality-20260715/corpus/v4-supply/build-inventory-v4.ts",
] as const;
const DECLARED_REQUIRED_FILES = [
  "prisma/schema.prisma",
  "package.json",
  "package-lock.json",
  "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
] as const;

interface SourceMaterialShape {
  id: string;
  academyId: string;
  type: string;
  subject: string | null;
  examType: string | null;
  sourceRef: string | null;
  originalFileUrl: string | null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sourceMaterialSelect() {
  return {
    id: true,
    academyId: true,
    type: true,
    subject: true,
    examType: true,
    sourceRef: true,
    originalFileUrl: true,
  } as const;
}

function sourceRights(source: SourceMaterialShape | null): V4RightsStatus {
  if (source?.type === "SUNEUNG") {
    return "OFFICIAL_EXAM_PROVENANCE_LICENSE_NOT_RECORDED";
  }
  return "CUSTOMER_UPLOAD_RIGHTS_NOT_RECORDED";
}

function officialTypeTagged(source: SourceMaterialShape | null): boolean {
  return Boolean(
    source &&
      ["EXAM", "MOCK", "SUNEUNG"].includes(source.type) &&
      (source.subject === null || source.subject === "ENGLISH"),
  );
}

function baseRecord(
  id: string,
  family: V4InventoryRecord["family"],
  text: string,
  source: SourceMaterialShape | null,
  reviewState: V4ReviewState,
  lineageState: V4LineageState,
): V4InventoryRecord {
  return {
    id,
    family,
    text,
    sourceDocumentKey: source?.id ?? null,
    sourceMaterialType: source?.type ?? null,
    sourceMaterialSubject: source?.subject ?? null,
    sourceExamType: source?.examType ?? null,
    sourceRefPresent: Boolean(source?.sourceRef),
    originalFilePresent: Boolean(source?.originalFileUrl),
    academyId: source?.academyId ?? null,
    reviewState,
    lineageState,
    savedOrPromoted: lineageState !== "NONE",
    rightsStatus: sourceRights(source),
    officialTypeTagged: officialTypeTagged(source),
    blankEvidence: "NONE",
    blankStemCount: 0,
  };
}

function blankEvidence(text: string, metadata: unknown): boolean {
  return /빈칸|blank|들어갈\s*(?:말|내용|표현)/i.test(`${text} ${JSON.stringify(metadata ?? {})}`);
}

function collectLongEnglishLeaves(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const words = countWords(value);
    const compact = value.replace(/\s/g, "");
    const latin = compact.match(/[A-Za-z]/g)?.length ?? 0;
    if (words >= 120 && words <= 360 && latin / Math.max(1, compact.length) >= 0.55) {
      output.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLongEnglishLeaves(item, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectLongEnglishLeaves(item, output),
    );
  }
}

function collectGrammarDrillRecords(): V4InventoryRecord[] {
  const root = path.join(V4_REPO_ROOT, "src/data/grammar-drill");
  const files: string[] = [];
  const visit = (entry: string) => {
    if (fs.statSync(entry).isDirectory()) {
      fs.readdirSync(entry)
        .sort()
        .forEach((name) => visit(path.join(entry, name)));
    } else if (entry.endsWith(".json")) files.push(entry);
  };
  visit(root);
  const texts: string[] = [];
  files.forEach((file) => collectLongEnglishLeaves(readJson<unknown>(file), texts));
  return texts.map((text, index) => ({
    ...baseRecord(
      `local-grammar:${index + 1}:${contentHash(text).slice(0, 12)}`,
      "local-grammar-drill",
      text,
      null,
      "UNKNOWN",
      "NONE",
    ),
    rightsStatus: "PROJECT_CURRICULUM_NOT_PASSAGE_SOURCE",
  }));
}

function localRecords(): V4InventoryRecord[] {
  const school = [...HS_PASSAGE_DATA, ...MS_PASSAGE_DATA].flatMap((group) => group.passages);
  const schoolRecords = school.map((item, index) => ({
    ...baseRecord(`local-school:${index + 1}`, "local-hs-ms", item.content, null, "UNKNOWN", "NONE"),
    rightsStatus: "GENERIC_SOURCE_LABEL_RIGHTS_UNVERIFIED" as const,
  }));
  const testRecords = [
    ...TEST_PASSAGES.map((item) => item.content),
    ...RESTORATION_CASES.map((item) => item.original),
  ].map((text, index) => ({
    ...baseRecord(
      `local-test:${index + 1}`,
      "local-test-restoration",
      text,
      null,
      "UNKNOWN",
      "NONE",
    ),
    rightsStatus: "PROJECT_SYNTHETIC_TEST_NOT_INDEPENDENT" as const,
  }));
  return [...schoolRecords, ...testRecords, ...collectGrammarDrillRecords()];
}

async function databaseRecords() {
  const v3Database = (await loadGlobalDatabaseV3()) as unknown as {
    groups: Array<{
      hash: string;
      questionCount: number;
      aiQuestionCount: number;
      workbenchJobCount: number;
      rows: Array<{
        id: string;
        academyId: string;
        content: string;
        reviewedAt: Date | null;
        tags: string | null;
        sourceMaterial: SourceMaterialShape | null;
      }>;
    }>;
    diagnostics: Record<string, unknown>;
    extractHash: string;
  };
  const committed = v3Database.groups
    .filter(
      (group) =>
        group.questionCount === 0 &&
        group.aiQuestionCount === 0 &&
        group.workbenchJobCount === 0,
    )
    .map((group) => {
      const row = [...group.rows].sort(
        (left, right) =>
          Number(right.reviewedAt !== null) - Number(left.reviewedAt !== null) ||
          left.id.localeCompare(right.id),
      )[0];
      const record = baseRecord(
        `committed:${group.hash.slice(0, 24)}`,
        "committed-passage-current",
        row.content,
        row.sourceMaterial,
        "COMMITTED",
        "CANONICAL_COMMITTED_PASSAGE",
      );
      if (blankEvidence(row.tags ?? "", row.sourceMaterial?.examType)) {
        record.blankEvidence = "TAG_ONLY";
      }
      record.academyId = row.academyId;
      return record;
    });

  const [items, results, m1, m2, sourceMaterialCounts, suneungPassageCount] =
    await Promise.all([
      prisma.extractionItem.findMany({
        where: { blockType: { in: ["PASSAGE_BODY", "QUESTION_STEM"] } },
        select: {
          id: true,
          jobId: true,
          groupId: true,
          blockType: true,
          content: true,
          questionMeta: true,
          status: true,
          promotedTo: true,
          job: { select: { sourceMaterial: { select: sourceMaterialSelect() } } },
        },
        orderBy: [{ jobId: "asc" }, { order: "asc" }],
      }),
      prisma.extractionResult.findMany({
        select: {
          id: true,
          content: true,
          status: true,
          savedPassageId: true,
          job: { select: { sourceMaterial: { select: sourceMaterialSelect() } } },
        },
        orderBy: [{ id: "asc" }],
      }),
      prisma.extractionM1PassageDraft.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          teacherText: true,
          reviewStatus: true,
          savedPassageId: true,
          confirmedAt: true,
          sourceMaterial: { select: sourceMaterialSelect() },
          sourceMatches: {
            where: { selected: true },
            select: { sourceId: true, sourceRef: true },
          },
        },
        orderBy: [{ id: "asc" }],
      }),
      prisma.extractionPassageDraft.findMany({
        select: {
          id: true,
          problemText: true,
          restoredText: true,
          teacherText: true,
          reviewStatus: true,
          confirmedAt: true,
          sourceMaterial: { select: sourceMaterialSelect() },
          questions: { select: { questionType: true, stem: true, metadata: true } },
        },
        orderBy: [{ id: "asc" }],
      }),
      prisma.sourceMaterial.groupBy({
        by: ["type", "subject", "examType"],
        _count: { _all: true },
      }),
      prisma.suneungPassage.count(),
    ]);

  const groupMap = new Map<
    string,
    { passages: typeof items; stems: typeof items; source: SourceMaterialShape | null }
  >();
  for (const item of items) {
    const key = `${item.jobId}|${item.groupId ?? "NONE"}`;
    const group = groupMap.get(key) ?? {
      passages: [],
      stems: [],
      source: item.job.sourceMaterial,
    };
    (item.blockType === "PASSAGE_BODY" ? group.passages : group.stems).push(item);
    groupMap.set(key, group);
  }
  const itemRecords: V4InventoryRecord[] = [];
  for (const [groupKey, group] of [...groupMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const blankStems = group.stems.filter((item) => blankEvidence(item.content, item.questionMeta));
    for (const passage of group.passages) {
      const record = baseRecord(
        `item:${passage.id}`,
        "extraction-item-passage",
        passage.content,
        group.source,
        passage.status === "REVIEWED" ? "REVIEWED" : "DRAFT",
        passage.promotedTo ? "EXTRACTION_PROMOTED" : "NONE",
      );
      record.sourceDocumentKey = group.source?.id ?? `item-group:${sha256(groupKey).slice(0, 20)}`;
      if (blankStems.length > 0) {
        record.blankEvidence = "LINKED_ORIGINAL_STEM";
        record.blankStemCount = blankStems.length;
      }
      itemRecords.push(record);
    }
  }

  const resultRecords = results.map((item) =>
    baseRecord(
      `result:${item.id}`,
      "extraction-result",
      item.content,
      item.job.sourceMaterial,
      item.status === "REVIEWED" || item.status === "SAVED" ? "REVIEWED" : "DRAFT",
      item.savedPassageId ? "SAVED_PASSAGE_LINKED" : "NONE",
    ),
  );
  const m1Records = m1.map((item) => {
    const reviewState: V4ReviewState = item.reviewStatus === "COMMITTED"
      ? "COMMITTED"
      : item.reviewStatus === "REVIEWED"
        ? "REVIEWED"
        : "DRAFT";
    const record = baseRecord(
      `m1:${item.id}`,
      "m1-passage-draft",
      item.teacherText,
      item.sourceMaterial,
      reviewState,
      item.savedPassageId ? "SAVED_PASSAGE_LINKED" : "NONE",
    );
    if (!item.sourceMaterial && item.sourceMatches.length > 0) {
      record.sourceDocumentKey = item.sourceMatches[0].sourceId ??
        (item.sourceMatches[0].sourceRef
          ? `web:${sha256(item.sourceMatches[0].sourceRef).slice(0, 20)}`
          : null);
      record.sourceRefPresent = Boolean(item.sourceMatches[0].sourceRef);
    }
    return record;
  });
  const m2Records = m2.map((item) => {
    const text = item.teacherText ?? item.restoredText ?? item.problemText;
    const record = baseRecord(
      `m2:${item.id}`,
      "m2-passage-draft",
      text,
      item.sourceMaterial,
      item.reviewStatus === "REVIEWED" ? "REVIEWED" : "DRAFT",
      item.confirmedAt ? "DRAFT_CONFIRMED" : "NONE",
    );
    const blankQuestions = item.questions.filter((question) =>
      blankEvidence(question.stem, { questionType: question.questionType, metadata: question.metadata }),
    );
    if (blankQuestions.length > 0) {
      record.blankEvidence = "LINKED_ORIGINAL_STEM";
      record.blankStemCount = blankQuestions.length;
    }
    return record;
  });
  return {
    records: [...committed, ...itemRecords, ...resultRecords, ...m1Records, ...m2Records],
    diagnostics: {
      committedDatabase: v3Database.diagnostics,
      extraction: {
        itemRows: items.length,
        passageBodyRows: itemRecords.length,
        linkedBlankPassageBodies: itemRecords.filter(
          (record) => record.blankEvidence === "LINKED_ORIGINAL_STEM",
        ).length,
        resultRows: resultRecords.length,
        m1Rows: m1Records.length,
        m2Rows: m2Records.length,
        sourceMaterialCounts,
        suneungPassageRows: suneungPassageCount,
        allExtractionRowsObservedAsReadOnly: true,
      },
    },
    extractHash: sha256(
      stableStringify({
        committedHash: v3Database.extractHash,
        records: [...itemRecords, ...resultRecords, ...m1Records, ...m2Records],
      }),
    ),
    recordSetHash: sha256(
      stableStringify([...committed, ...itemRecords, ...resultRecords, ...m1Records, ...m2Records]),
    ),
  };
}

function relativeRepoPath(absolutePath: string): string {
  const relative = path.relative(V4_REPO_ROOT, absolutePath).replace(/\\/g, "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Dependency escaped repository root: ${absolutePath}`);
  }
  return relative;
}

function resolveLocalModule(importer: string, specifier: string): string {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.mts`,
    `${unresolved}.mjs`,
    `${unresolved}.js`,
    `${unresolved}.json`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
    path.join(unresolved, "index.mts"),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) {
    throw new Error(
      `Missing transitive local dependency '${specifier}' imported by ${relativeRepoPath(importer)}`,
    );
  }
  relativeRepoPath(resolved);
  return resolved;
}

function staticLocalImportClosure(entrypoints: readonly string[]): string[] {
  const pending = entrypoints.map((relative) => path.join(V4_REPO_ROOT, relative));
  const visited = new Set<string>();
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (!fs.existsSync(current) || !fs.statSync(current).isFile()) {
      throw new Error(`Missing dependency entrypoint: ${relativeRepoPath(current)}`);
    }
    visited.add(current);
    if (!/\.[cm]?[jt]sx?$/.test(current)) continue;
    const source = fs.readFileSync(current, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) pending.push(resolveLocalModule(current, specifier));
    }
  }
  return [...visited].map(relativeRepoPath).sort();
}

function grammarDrillInputs(): string[] {
  const root = path.join(V4_REPO_ROOT, "src/data/grammar-drill");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("Missing dynamic grammar-drill catalog directory: src/data/grammar-drill");
  }
  const files: string[] = [];
  const visit = (entry: string) => {
    for (const name of fs.readdirSync(entry).sort()) {
      const child = path.join(entry, name);
      if (fs.statSync(child).isDirectory()) visit(child);
      else if (child.endsWith(".json")) files.push(relativeRepoPath(child));
    }
  };
  visit(root);
  if (files.length === 0) throw new Error("Dynamic grammar-drill catalog resolved to zero JSON files.");
  return files.sort();
}

function gitFileState(paths: readonly string[]): {
  headSha: string;
  repositoryDirty: boolean;
  dirtyPathCount: number;
  untrackedPathCount: number;
  states: Map<string, { status: V4DependencyGitStatus; porcelain: string | null }>;
} {
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: V4_REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z"], {
      cwd: V4_REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }).split("\0").filter(Boolean).map((item) => item.replace(/\\/g, "/")),
  );
  const statusOutput = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: V4_REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const chunks = statusOutput.split("\0").filter(Boolean);
  const statusByPath = new Map<string, string>();
  let untrackedPathCount = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const code = chunk.slice(0, 2);
    const filePath = chunk.slice(3).replace(/\\/g, "/");
    statusByPath.set(filePath, code);
    if (code === "??") untrackedPathCount += 1;
    if (/^[RC]/.test(code) && chunks[index + 1]) {
      statusByPath.set(chunks[index + 1].replace(/\\/g, "/"), code);
      index += 1;
    }
  }
  const states = new Map<string, { status: V4DependencyGitStatus; porcelain: string | null }>();
  for (const filePath of paths) {
    const porcelain = statusByPath.get(filePath) ?? null;
    const status: V4DependencyGitStatus = !tracked.has(filePath)
      ? "UNTRACKED"
      : porcelain
        ? "TRACKED_DIRTY"
        : "TRACKED_CLEAN";
    states.set(filePath, { status, porcelain });
  }
  return {
    headSha,
    repositoryDirty: chunks.length > 0,
    dirtyPathCount: chunks.length,
    untrackedPathCount,
    states,
  };
}

export function buildV4DependencyManifest(
  additionalRequiredFiles: readonly string[] = [],
): V4DependencyManifest {
  const staticFiles = staticLocalImportClosure(DEPENDENCY_ENTRYPOINTS);
  const dynamicFiles = grammarDrillInputs();
  const roles = new Map<string, V4DependencyEntry["role"]>();
  staticFiles.forEach((filePath) => roles.set(filePath, "STATIC_IMPORT_CLOSURE"));
  dynamicFiles.forEach((filePath) => roles.set(filePath, "DYNAMIC_CATALOG_INPUT"));
  DECLARED_SURVEY_FILES.forEach((filePath) => roles.set(filePath, "DECLARED_SURVEY_INPUT"));
  DECLARED_REQUIRED_FILES.forEach((filePath) => {
    const role: V4DependencyEntry["role"] = filePath === "prisma/schema.prisma"
      ? "DATABASE_SCHEMA"
      : filePath.includes("/v3/private/")
        ? "PINNED_V3_INPUT"
        : "PACKAGE_RESOLUTION";
    roles.set(filePath, role);
  });
  additionalRequiredFiles.forEach((filePath) => roles.set(filePath.replace(/\\/g, "/"), "DECLARED_SURVEY_INPUT"));

  const allPaths = [...roles.keys()].sort();
  for (const relative of allPaths) {
    const absolute = path.join(V4_REPO_ROOT, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`Missing required v4 dependency: ${relative}`);
    }
  }
  const git = gitFileState(allPaths);
  const files: Record<string, V4DependencyEntry> = {};
  for (const relative of allPaths) {
    const absolute = path.join(V4_REPO_ROOT, relative);
    const content = fs.readFileSync(absolute, "utf8");
    const state = git.states.get(relative);
    if (!state) throw new Error(`Missing Git state for dependency: ${relative}`);
    files[relative] = {
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, "utf8"),
      role: roles.get(relative)!,
      gitStatus: state.status,
      gitPorcelain: state.porcelain,
    };
  }
  const dependencyDirtyPaths = allPaths.filter(
    (filePath) => files[filePath].gitStatus !== "TRACKED_CLEAN",
  );
  const dependencyUntrackedPaths = allPaths.filter(
    (filePath) => files[filePath].gitStatus === "UNTRACKED",
  );
  const manifestCore = {
    algorithm: "STATIC_LOCAL_IMPORT_CLOSURE_PLUS_DECLARED_INPUTS_V2" as const,
    entrypoints: [...DEPENDENCY_ENTRYPOINTS],
    files,
    repositoryGit: {
      headSha: git.headSha,
      dirty: git.repositoryDirty,
      dirtyPathCount: git.dirtyPathCount,
      untrackedPathCount: git.untrackedPathCount,
      dependencyDirty: dependencyDirtyPaths.length > 0,
      dependencyDirtyPaths,
      dependencyUntrackedPaths,
    },
  };
  return {
    ...manifestCore,
    manifestHash: dependencyManifestHashV4(manifestCore),
  };
}

export function dependencyManifestHashV4(
  manifest: Pick<V4DependencyManifest, "algorithm" | "entrypoints" | "files">,
): string {
  return sha256(
    stableStringify({
      algorithm: manifest.algorithm,
      entrypoints: manifest.entrypoints,
      files: manifest.files,
    }),
  );
}

/** Compatibility name: this now returns the dependency-closed code/input manifest hash. */
export function computeV4CodeHash(): string {
  return buildV4DependencyManifest().manifestHash;
}

function localSourceHashes(manifest: V4DependencyManifest): Record<string, string> {
  return Object.fromEntries(
    Object.entries(manifest.files)
      .filter(([, entry]) =>
        entry.role === "DYNAMIC_CATALOG_INPUT" || entry.role === "DECLARED_SURVEY_INPUT",
      )
      .map(([filePath, entry]) => [filePath, entry.sha256]),
  );
}

export async function buildPinnedInventoryV4(): Promise<{
  inventory: V4PinnedInventory;
  report: ReturnType<typeof analyzeInventoryV4>;
}> {
  const startedAt = new Date().toISOString();
  const v3 = readJson<V3PinnedSnapshot>(V3_SNAPSHOT_PATH);
  const dependencyManifest = buildV4DependencyManifest();
  const database = await databaseRecords();
  const records = [...database.records, ...localRecords()];
  const completedAt = new Date().toISOString();
  const core = {
    schemaVersion: V4_SUPPLY_SCHEMA_VERSION as 4,
    version: V4_SUPPLY_VERSION,
    capturedAt: completedAt,
    captureWindow: { startedAt, completedAt },
    temporalSemantics: "CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF" as const,
    historicalAsOfSupported: false as const,
    v3SnapshotHash: v3.snapshotHash,
    gitSha: dependencyManifest.repositoryGit.headSha,
    codeHash: dependencyManifest.manifestHash,
    dependencyManifest,
    localSourceHashes: localSourceHashes(dependencyManifest),
    databaseExtractHash: database.extractHash,
    databaseRecordSetHash: database.recordSetHash,
    records,
    sourceDiagnostics: {
      ...database.diagnostics,
      capture: {
        semantics: "CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF",
        historicalAsOfSupported: false,
        captureWindow: { startedAt, completedAt },
        databaseExtractHash: database.extractHash,
        databaseRecordSetHash: database.recordSetHash,
      },
      local: {
        hsMsRows: records.filter((record) => record.family === "local-hs-ms").length,
        testRestorationRows: records.filter(
          (record) => record.family === "local-test-restoration",
        ).length,
        grammarDrillLongEnglishLeaves: records.filter(
          (record) => record.family === "local-grammar-drill",
        ).length,
        experimentAndScriptJsonLineage:
          "Already blocking antecedent history in immutable v3; never counted as new v4 supply.",
        englishOfficialCatalog:
          "src/data/exam-passages/passages.json is already wholly represented in immutable v3 candidates.",
        koreanCatalogs: "Out of English scope.",
      },
      apiCalls: 0,
      browserCalls: 0,
      databaseWrites: 0,
    },
  };
  const inventory: V4PinnedInventory = {
    ...core,
    snapshotHash: inventorySnapshotHashV4(core),
  };
  return { inventory, report: analyzeInventoryV4(inventory, v3) };
}

export function assertCurrentStateCaptureArguments(args: readonly string[]): void {
  if (args.some((argument) => argument === "--as-of" || argument.startsWith("--as-of="))) {
    throw new Error(
      "--as-of is unsupported: the DB source is current-state, not temporal. This command records its own actual capturedAt/captureWindow.",
    );
  }
  if (args.some((argument) => argument === "--captured-at" || argument.startsWith("--captured-at="))) {
    throw new Error(
      "--captured-at cannot be supplied by the caller; capture time is recorded from the actual read window.",
    );
  }
  const unknown = args.filter((argument) => argument !== "--write");
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
}

function writeExclusive(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableStringify(value), { encoding: "utf8", flag: "wx" });
}

async function main(): Promise<void> {
  loadEnvConfig(V4_REPO_ROOT);
  const args = process.argv.slice(2);
  assertCurrentStateCaptureArguments(args);
  const write = args.includes("--write");
  const { inventory, report } = await buildPinnedInventoryV4();
  if (write) {
    writeExclusive(PRIVATE_SNAPSHOT_PATH, inventory);
    writeExclusive(PUBLIC_REPORT_PATH, report);
  }
  process.stdout.write(
    stableStringify({
      mode: write ? "write" : "dry-run",
      status: report.status,
      capturedAt: inventory.capturedAt,
      temporalSemantics: inventory.temporalSemantics,
      inventorySnapshotHash: inventory.snapshotHash,
      reportSha256: report.reportSha256,
      exactV3Feasibility: report.exactV3Feasibility,
      operationalManifestCreated: false,
      modelApiCalls: 0,
      browserCalls: 0,
      databaseWrites: 0,
    }),
  );
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
