import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  contentHash,
  type RawCandidate,
  stableStringify,
} from "../selector-core";
import {
  publicHistoricalIndex,
  scanHistoricalExposure,
} from "./history-index";
import {
  type AdjudicatedRetained,
  buildCorpusV2,
  type DatabaseContentEvidence,
  type ForbiddenReference,
  type SourceDocumentMetadata,
  type V2RawCandidate,
  V2_DEFAULT_SEED,
} from "./selector-core-v2";

const DEFAULT_RESEARCH_ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const REPO_CORPUS_PATH = path.join(REPO_ROOT, "src/data/exam-passages/passages.json");
const V1_PRIVATE_PATH = path.join(SCRIPT_DIR, "../private/manifest-private.json");
const ADJUDICATION_PATH = path.join(REPO_ROOT, "experiments/question-quality-20260715/reviews/corpus/adjudication.json");
const GRAMMAR_CORPUS_PATH = path.join(REPO_ROOT, "experiments/grammar-quality-20260714/corpus-30.json");
const DAWN_QUESTIONS_PATH = path.join(REPO_ROOT, "scripts/_gen_audit_out/jul15-dawn-questions.json");

interface CliOptions {
  write: boolean;
  noDb: boolean;
  academyId: string;
  seed: string;
  help: boolean;
}

interface RepoPassage {
  id: string;
  examId?: string;
  year?: number;
  exam?: string;
  qNumbers?: number[];
  text: string;
  type?: string;
  typeGroup?: string;
  board?: string;
  grade?: string;
  confidence?: string;
  reconstructionKind?: string;
  hasDeliberateError?: boolean;
}

interface V1PrivateRecord {
  id: string;
  origin: RawCandidate["origin"];
  content: string;
  title?: string | null;
  provenance?: { reviewed?: boolean; priorGeneratedQuestions?: number; priorWorkbenchJobs?: number };
}

interface AdjudicationRecord {
  id: string;
  split: "dev" | "holdout";
  finalDecision: string;
  keepOrDrop: string;
  grammarRichness: string;
  blankSuitability: string;
}

interface DbPassageRow {
  id: string;
  title: string;
  content: string;
  source: string | null;
  reviewedAt: Date | null;
  extractionOutput: string | null;
  tags: string | null;
  sourceMaterialId: string | null;
  sourceMaterial: {
    id: string;
    type: string;
    subject: string | null;
    examType: string | null;
    title: string;
    year: number | null;
    round: string | null;
  } | null;
}

interface DbLoadResult {
  candidates: V2RawCandidate[];
  evidenceByHash: Map<string, DatabaseContentEvidence>;
  dawnReferences: ForbiddenReference[];
  priorUsedReferences: ForbiddenReference[];
  diagnostics: Record<string, unknown>;
}

interface GlobalContentRow {
  id: string;
  academyId: string;
  content: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function parseArgs(argv: string[]): CliOptions {
  loadEnvConfig(REPO_ROOT);
  const options: CliOptions = {
    write: false,
    noDb: false,
    academyId:
      process.env.CORPUS_ACADEMY_ID ??
      process.env.QUESTION_QUALITY_RESEARCH_ACADEMY_ID ??
      process.env.AUDIT_LOOP_ACADEMY_ID ??
      DEFAULT_RESEARCH_ACADEMY_ID,
    seed: process.env.CORPUS_V2_SEED ?? V2_DEFAULT_SEED,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.write = true;
    else if (argument === "--no-db") options.noDb = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--academy-id") options.academyId = argv[++index] ?? "";
    else if (argument.startsWith("--academy-id=")) options.academyId = argument.slice("--academy-id=".length);
    else if (argument === "--seed") options.seed = argv[++index] ?? "";
    else if (argument.startsWith("--seed=")) options.seed = argument.slice("--seed=".length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.noDb && !options.academyId) throw new Error("--academy-id is required unless --no-db is used.");
  if (!options.seed) throw new Error("--seed must not be empty.");
  return options;
}

function help(): string {
  return [
    "Strict deterministic corpus v2 selector (dry-run by default)",
    "",
    "Usage:",
    "  npx tsx experiments/question-quality-20260715/corpus/v2/select-corpus-v2.ts [options]",
    "",
    "Options:",
    "  --write                 Create v2 manifests; refuses to overwrite any existing output",
    "  --academy-id <id>       Research academy for SELECT-only content-level exposure checks",
    "  --seed <text>           Deterministic seed",
    "  --no-db                 Offline shortfall diagnostic; no new candidate can pass the DB proof gate",
    "  --help                  Show help",
    "",
    "This script performs no model/API calls and exposes no database mutation method.",
  ].join("\n");
}

function emptyDatabaseEvidence(
  candidateAcademyId: string | null,
  proofAvailable: boolean,
): DatabaseContentEvidence {
  return {
    candidateAcademyId,
    priorUseScope: proofAvailable ? "ALL_ACADEMIES" : null,
    matchedPassageCount: 0,
    matchedPassageIds: [],
    questionCount: 0,
    aiQuestionCount: 0,
    workbenchJobCount: 0,
    reviewed: false,
  };
}

function repoDocument(passage: RepoPassage): SourceDocumentMetadata {
  return {
    documentKey: passage.examId ? `repo-exam:${passage.examId}` : null,
    sourceKind: "OFFICIAL_EXAM_REPOSITORY",
    sourceId: passage.examId ?? passage.id,
    year: passage.year ?? null,
    round: passage.exam ?? null,
    qNumbers: [...(passage.qNumbers ?? [])].sort((a, b) => a - b),
    originalType: passage.typeGroup ?? passage.type ?? null,
  };
}

function repoCandidates(
  passages: RepoPassage[],
  evidenceByHash: Map<string, DatabaseContentEvidence>,
  academyId: string | null,
  proofAvailable = academyId !== null,
): V2RawCandidate[] {
  return passages.map((passage) => {
    const evidence =
      evidenceByHash.get(contentHash(passage.text)) ?? emptyDatabaseEvidence(academyId, proofAvailable);
    return {
      id: `repo:${passage.id}`,
      origin: "repo-official",
      text: passage.text,
      title: `${passage.board ?? "official"} ${passage.year ?? ""} ${passage.exam ?? ""}`.trim(),
      source: passage.board ?? "official-exam-repository",
      sourceKind: "EXAM",
      sourceSubject: "ENGLISH",
      typeHint: passage.typeGroup ?? passage.type ?? null,
      confidence: passage.confidence ?? null,
      reconstructionKind: passage.reconstructionKind ?? null,
      hasDeliberateError: passage.hasDeliberateError === true,
      reviewed: passage.confidence === "high",
      priorGeneratedQuestions: evidence.aiQuestionCount,
      priorWorkbenchJobs: evidence.workbenchJobCount,
      document: repoDocument(passage),
      databaseEvidence: { ...evidence, matchedPassageIds: [...evidence.matchedPassageIds] },
    };
  });
}

function safeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function loadDatabase(
  academyId: string,
  dawnIds: string[],
  repositoryContentHashes: Set<string>,
): Promise<DbLoadResult> {
  // Deliberately import only the shared client and call findMany/groupBy. There
  // is no create/update/delete/upsert/raw execution in this module.
  const { prisma } = await import("../../../../src/lib/prisma");
  try {
    const [rows, globalContentRows, dawnRows] = await Promise.all([
      prisma.passage.findMany({
        where: { academyId, OR: [{ subject: null }, { subject: "ENGLISH" }] },
        select: {
          id: true,
          title: true,
          content: true,
          source: true,
          reviewedAt: true,
          extractionOutput: true,
          tags: true,
          sourceMaterialId: true,
          sourceMaterial: {
            select: {
              id: true,
              type: true,
              subject: true,
              examType: true,
              title: true,
              year: true,
              round: true,
            },
          },
        },
        orderBy: [{ id: "asc" }],
      }),
      prisma.passage.findMany({
        where: { OR: [{ subject: null }, { subject: "ENGLISH" }] },
        select: { id: true, academyId: true, content: true },
        orderBy: [{ id: "asc" }],
      }),
      dawnIds.length === 0
        ? Promise.resolve([])
        : prisma.passage.findMany({
            where: { id: { in: dawnIds } },
            select: { id: true, content: true },
            orderBy: [{ id: "asc" }],
          }),
    ]);
    const scopedRows = rows as DbPassageRow[];
    const targetHashes = new Set([
      ...repositoryContentHashes,
      ...scopedRows.map((row) => contentHash(row.content)),
    ]);
    const matchingGlobalRows = (globalContentRows as GlobalContentRow[]).filter((row) =>
      targetHashes.has(contentHash(row.content)),
    );
    const passageIds = (globalContentRows as GlobalContentRow[]).map((row) => row.id);
    const [questionCounts, aiQuestionCounts, jobCounts] = await Promise.all([
      prisma.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: passageIds } },
        _count: { _all: true },
      }),
      prisma.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: passageIds }, aiGenerated: true },
        _count: { _all: true },
      }),
      prisma.workbenchAiJob.groupBy({
        by: ["passageId"],
        where: { passageId: { in: passageIds } },
        _count: { _all: true },
      }),
    ]);
    const toCountMap = (items: Array<{ passageId: string | null; _count: { _all: number } }>) =>
      new Map(items.filter((item) => item.passageId !== null).map((item) => [item.passageId!, item._count._all]));
    const qById = toCountMap(questionCounts);
    const aiQById = toCountMap(aiQuestionCounts);
    const jobsById = toCountMap(jobCounts);
    const priorUsedReferences: ForbiddenReference[] = (globalContentRows as GlobalContentRow[])
      .filter(
        (row) =>
          (qById.get(row.id) ?? 0) > 0 ||
          (aiQById.get(row.id) ?? 0) > 0 ||
          (jobsById.get(row.id) ?? 0) > 0,
      )
      .map((row) => ({
        id: row.id,
        text: row.content,
        source: "database-prior-use-all-academies",
      }));

    const rowsByHash = new Map<string, GlobalContentRow[]>();
    for (const row of matchingGlobalRows) {
      const hash = contentHash(row.content);
      const group = rowsByHash.get(hash) ?? [];
      group.push(row);
      rowsByHash.set(hash, group);
    }
    const evidenceByHash = new Map<string, DatabaseContentEvidence>();
    for (const [hash, group] of rowsByHash) {
      evidenceByHash.set(hash, {
        candidateAcademyId: academyId,
        priorUseScope: "ALL_ACADEMIES",
        matchedPassageCount: group.length,
        matchedPassageIds: group.map((row) => row.id).sort(),
        questionCount: group.reduce((sum, row) => sum + (qById.get(row.id) ?? 0), 0),
        aiQuestionCount: group.reduce((sum, row) => sum + (aiQById.get(row.id) ?? 0), 0),
        workbenchJobCount: group.reduce((sum, row) => sum + (jobsById.get(row.id) ?? 0), 0),
        reviewed: false,
      });
    }

    const candidates: V2RawCandidate[] = scopedRows.map((row) => {
      const evidence = evidenceByHash.get(contentHash(row.content))!;
      const tags = safeTags(row.tags);
      return {
        id: row.id,
        origin: "db-real",
        text: row.content,
        title: row.title,
        source: row.source ?? row.sourceMaterial?.title ?? null,
        sourceKind: row.sourceMaterial?.type ?? null,
        sourceSubject: row.sourceMaterial?.subject ?? "ENGLISH",
        sourceExamType: row.sourceMaterial?.examType ?? null,
        typeHint: tags.join(" "),
        topicHint: tags.join(" "),
        reviewed: row.reviewedAt !== null,
        priorGeneratedQuestions: evidence.aiQuestionCount,
        priorWorkbenchJobs: evidence.workbenchJobCount,
        document: {
          documentKey: row.sourceMaterial?.id ? `db-source:${row.sourceMaterial.id}` : `db-passage:${row.id}`,
          sourceKind: row.sourceMaterial?.type ?? null,
          sourceId: row.sourceMaterial?.id ?? row.id,
          year: row.sourceMaterial?.year ?? null,
          round: row.sourceMaterial?.round ?? null,
          qNumbers: [],
          originalType: row.sourceMaterial?.examType ?? null,
        },
        databaseEvidence: {
          ...evidence,
          reviewed: row.reviewedAt !== null,
          matchedPassageIds: [...evidence.matchedPassageIds],
        },
        metadata: { extractionOutput: row.extractionOutput },
      };
    });
    return {
      candidates,
      evidenceByHash,
      dawnReferences: dawnRows.map((row) => ({
        id: row.id,
        text: row.content,
        source: "jul15-dawn-db",
      })),
      priorUsedReferences,
      diagnostics: {
        candidateAcademyId: academyId,
        scopedCandidatePassages: scopedRows.length,
        globalEnglishPassagesScanned: globalContentRows.length,
        globallyMatchingPassages: matchingGlobalRows.length,
        globallyMatchingAcademies: new Set(matchingGlobalRows.map((row) => row.academyId)).size,
        globallyPriorUsedPassages: priorUsedReferences.length,
        targetContentHashes: targetHashes.size,
        matchedContentHashes: rowsByHash.size,
        duplicateContentGroups: [...rowsByHash.values()].filter((group) => group.length > 1).length,
        dawnIdsRequested: dawnIds.length,
        dawnContentsResolved: dawnRows.length,
        priorUseScope: "ALL_ACADEMIES",
        queryKinds: ["Passage.findMany", "Question.groupBy", "WorkbenchAiJob.groupBy"],
        databaseWrites: 0,
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

function buildRetained(
  adjudication: { records: AdjudicationRecord[] },
  privateManifest: { splits: { dev: V1PrivateRecord[]; holdout: V1PrivateRecord[] } },
  candidateById: Map<string, V2RawCandidate>,
  academyId: string | null,
): AdjudicatedRetained[] {
  const privateById = new Map(
    [...privateManifest.splits.dev, ...privateManifest.splits.holdout].map((item) => [item.id, item]),
  );
  return adjudication.records
    .filter((record) => record.finalDecision === "PASS" && record.keepOrDrop !== "DROP")
    .map((record) => {
      const known = candidateById.get(record.id);
      const prior = privateById.get(record.id);
      if (!known && !prior) throw new Error(`Adjudicated PASS has no private passage: ${record.id}`);
      const candidate: V2RawCandidate = known ?? {
        id: record.id,
        origin: prior!.origin,
        text: prior!.content,
        title: prior!.title ?? null,
        reviewed: prior!.provenance?.reviewed === true,
        priorGeneratedQuestions: prior!.provenance?.priorGeneratedQuestions ?? 0,
        priorWorkbenchJobs: prior!.provenance?.priorWorkbenchJobs ?? 0,
        document: {
          documentKey: null,
          sourceKind: null,
          sourceId: record.id,
          year: null,
          round: null,
          qNumbers: [],
          originalType: null,
        },
        databaseEvidence: emptyDatabaseEvidence(academyId, academyId !== null),
      };
      return {
        candidate,
        split: record.split,
        finalDecision: "PASS" as const,
        keepOrDrop: record.keepOrDrop,
        grammarRichness: record.grammarRichness,
        blankSuitability: record.blankSuitability,
      };
    });
}

function writeExclusive(outputs: Array<[string, unknown]>): void {
  const existing = outputs.map(([filePath]) => filePath).filter((filePath) => fs.existsSync(filePath));
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite existing v2 output(s):\n${existing.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  const temporary: Array<{ temp: string; final: string }> = [];
  try {
    for (const [filePath, value] of outputs) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temp = `${filePath}.tmp-${process.pid}`;
      fs.writeFileSync(temp, stableStringify(value), { encoding: "utf8", flag: "wx" });
      temporary.push({ temp, final: filePath });
    }
    for (const item of temporary) fs.renameSync(item.temp, item.final);
  } catch (error) {
    for (const item of temporary) if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp);
    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }

  const repoPassages = readJson<RepoPassage[]>(REPO_CORPUS_PATH);
  const dawnRows = readJson<Array<{ passageId?: string }>>(DAWN_QUESTIONS_PATH);
  const dawnIds = [...new Set(dawnRows.map((row) => row.passageId).filter((id): id is string => Boolean(id)))];
  const historical = scanHistoricalExposure(REPO_ROOT, [
    path.join(REPO_ROOT, "experiments"),
    path.join(REPO_ROOT, "scripts"),
  ]);
  const database = options.noDb
    ? {
        candidates: [] as V2RawCandidate[],
        evidenceByHash: new Map<string, DatabaseContentEvidence>(),
        dawnReferences: [] as ForbiddenReference[],
        priorUsedReferences: [] as ForbiddenReference[],
        diagnostics: { mode: "no-db", databaseWrites: 0, proofAvailable: false },
      }
    : await loadDatabase(
        options.academyId,
        dawnIds,
        new Set(repoPassages.map((passage) => contentHash(passage.text))),
      );
  const repo = repoCandidates(
    repoPassages,
    database.evidenceByHash,
    options.noDb ? null : options.academyId,
    !options.noDb,
  );
  const candidates = [...repo, ...database.candidates];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const retained = buildRetained(
    readJson<{ records: AdjudicationRecord[] }>(ADJUDICATION_PATH),
    readJson<{ splits: { dev: V1PrivateRecord[]; holdout: V1PrivateRecord[] } }>(V1_PRIVATE_PATH),
    candidateById,
    options.noDb ? null : options.academyId,
  );

  const grammarReferences = readJson<Array<{ id?: string; text: string }>>(GRAMMAR_CORPUS_PATH).map(
    (item, index): ForbiddenReference => ({
      id: item.id ?? `grammar-corpus-${index + 1}`,
      text: item.text,
      source: "grammar-quality-20260714-corpus-30",
    }),
  );
  const historicalReferences: ForbiddenReference[] = historical.texts.map((item, index) => ({
    id: `historical-${index + 1}-${item.contentHash.slice(0, 12)}`,
    text: item.text,
    source: item.sourceFile,
  }));
  const result = buildCorpusV2({
    candidates,
    retained,
    forbiddenReferences: [
      ...historicalReferences,
      ...grammarReferences,
      ...database.dawnReferences,
      ...database.priorUsedReferences,
    ],
    historicalPassageIds: new Set([...historical.uniquePassageIds, ...dawnIds.flatMap((id) => [id, `repo:${id}`])]),
    seed: options.seed,
  });

  const historicalPublic = {
    ...publicHistoricalIndex(historical),
    explicitSources: {
      grammarCorpusReferences: grammarReferences.length,
      dawnPassageIds: dawnIds.length,
      dawnContentsResolvedFromDb: database.dawnReferences.length,
      databasePriorUsedPassageReferences: database.priorUsedReferences.length,
    },
    databaseEvidence: database.diagnostics,
  };
  if (options.write) {
    writeExclusive([
      [path.join(SCRIPT_DIR, "manifest-public.json"), result.publicManifest],
      [path.join(SCRIPT_DIR, "private/manifest-private.json"), result.privateManifest],
      [path.join(SCRIPT_DIR, "historical-exposure-public.json"), historicalPublic],
    ]);
  }

  process.stdout.write(
    stableStringify({
      mode: options.write ? "write" : "dry-run",
      outputDirectory: SCRIPT_DIR,
      apiCalls: 0,
      databaseWrites: 0,
      database: database.diagnostics,
      historical: {
        filesScanned: historical.filesScanned,
        parseFailures: historical.parseFailures.length,
        uniqueTexts: historical.texts.length,
        uniquePassageIds: historical.uniquePassageIds.size,
      },
      diagnostics: result.diagnostics,
      filesCreated: options.write
        ? ["manifest-public.json", "private/manifest-private.json", "historical-exposure-public.json"]
        : [],
    }),
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { buildRetained, loadDatabase, parseArgs, repoCandidates, writeExclusive };
