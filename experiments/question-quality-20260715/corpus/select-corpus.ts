import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  buildCorpus,
  contentHash,
  DEFAULT_SEED,
  type RawCandidate,
  stableStringify,
} from "./selector-core";

const DEFAULT_RESEARCH_ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const REPO_CORPUS_PATH = path.join(REPO_ROOT, "src/data/exam-passages/passages.json");
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
  text: string;
  type?: string;
  typeGroup?: string;
  board?: string;
  exam?: string;
  year?: number;
  grade?: string;
  confidence?: string;
  reconstructionKind?: string;
  hasDeliberateError?: boolean;
}

interface DawnQuestion {
  passageId?: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function parseArgs(argv: string[]): CliOptions {
  loadEnvConfig(REPO_ROOT);
  const result: CliOptions = {
    write: false,
    noDb: false,
    academyId:
      process.env.CORPUS_ACADEMY_ID ??
      process.env.QUESTION_QUALITY_RESEARCH_ACADEMY_ID ??
      process.env.AUDIT_LOOP_ACADEMY_ID ??
      DEFAULT_RESEARCH_ACADEMY_ID,
    seed: process.env.CORPUS_SEED ?? DEFAULT_SEED,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") result.write = true;
    else if (arg === "--no-db") result.noDb = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--academy-id") result.academyId = argv[++index] ?? "";
    else if (arg.startsWith("--academy-id=")) result.academyId = arg.slice("--academy-id=".length);
    else if (arg === "--seed") result.seed = argv[++index] ?? "";
    else if (arg.startsWith("--seed=")) result.seed = arg.slice("--seed=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.academyId && !result.noDb) throw new Error("--academy-id must not be empty when DB input is enabled.");
  if (!result.seed) throw new Error("--seed must not be empty.");
  return result;
}

function help(): string {
  return [
    "Frozen question-quality corpus selector (dry-run by default)",
    "",
    "Usage:",
    "  npx tsx experiments/question-quality-20260715/corpus/select-corpus.ts [options]",
    "",
    "Options:",
    "  --write                 Write public/private manifests and schedule after tests pass",
    "  --academy-id <id>       Production academy to read (SELECT only)",
    "  --seed <text>           Stable deterministic seed",
    "  --no-db                 Offline diagnostic; DB quotas will be reported as shortfalls",
    "  --help                  Show this help",
    "",
    "Environment: CORPUS_ACADEMY_ID or QUESTION_QUALITY_RESEARCH_ACADEMY_ID may set the academy.",
  ].join("\n");
}

function repoCandidates(): RawCandidate[] {
  return readJson<RepoPassage[]>(REPO_CORPUS_PATH).map((passage) => ({
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
    reviewed: passage.confidence === "high" && passage.reconstructionKind === "none",
    priorGeneratedQuestions: 0,
    priorWorkbenchJobs: 0,
    metadata: {
      repositoryId: passage.id,
      year: passage.year ?? null,
      grade: passage.grade ?? null,
      exam: passage.exam ?? null,
    },
  }));
}

type DbPassageRow = {
  id: string;
  title: string;
  content: string;
  source: string | null;
  reviewedAt: Date | null;
  extractionOutput: string | null;
  tags: string | null;
  sourceMaterial: {
    type: string;
    subject: string | null;
    examType: string | null;
    title: string;
    year: number | null;
    round: string | null;
  } | null;
};

function safeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function dbCandidates(
  academyId: string,
  dawnIds: string[],
): Promise<{ candidates: RawCandidate[]; dawnHashes: Set<string> }> {
  // This module intentionally exposes no mutation-capable Prisma object. Every operation below
  // is findMany/groupBy, which Prisma compiles to SELECT statements.
  const { prisma } = await import("../../../src/lib/prisma");
  try {
    const passages = await prisma.passage.findMany({
      where: {
        academyId,
        OR: [{ subject: null }, { subject: "ENGLISH" }],
      },
      select: {
        id: true,
        title: true,
        content: true,
        source: true,
        reviewedAt: true,
        extractionOutput: true,
        tags: true,
        sourceMaterial: {
          select: {
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
    });
    const passageIds = passages.map((passage) => passage.id);
    const [questionCounts, jobCounts, dawnPassages] = await Promise.all([
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
      dawnIds.length > 0
        ? prisma.passage.findMany({
            where: { id: { in: dawnIds } },
            select: { id: true, content: true },
          })
        : Promise.resolve([]),
    ]);
    const questionsByPassage = new Map(
      questionCounts
        .filter((row): row is typeof row & { passageId: string } => typeof row.passageId === "string")
        .map((row) => [row.passageId, row._count._all]),
    );
    const jobsByPassage = new Map(jobCounts.map((row) => [row.passageId, row._count._all]));
    const candidates: RawCandidate[] = (passages as DbPassageRow[]).map((passage) => {
      const tags = safeTags(passage.tags);
      return {
        id: passage.id,
        origin: "db-real",
        text: passage.content,
        title: passage.title,
        source: passage.source ?? passage.sourceMaterial?.title ?? null,
        sourceKind: passage.sourceMaterial?.type ?? null,
        sourceSubject: passage.sourceMaterial?.subject ?? "ENGLISH",
        sourceExamType: passage.sourceMaterial?.examType ?? null,
        typeHint: tags.join(" "),
        topicHint: tags.join(" "),
        reviewed: passage.reviewedAt !== null,
        priorGeneratedQuestions: questionsByPassage.get(passage.id) ?? 0,
        priorWorkbenchJobs: jobsByPassage.get(passage.id) ?? 0,
        metadata: {
          extractionOutput: passage.extractionOutput,
          sourceYear: passage.sourceMaterial?.year ?? null,
          sourceRound: passage.sourceMaterial?.round ?? null,
        },
      };
    });
    return {
      candidates,
      dawnHashes: new Set(dawnPassages.map((passage) => contentHash(passage.content))),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }

  const grammarCorpus = readJson<Array<{ text: string }>>(GRAMMAR_CORPUS_PATH);
  const dawnQuestions = readJson<DawnQuestion[]>(DAWN_QUESTIONS_PATH);
  const dawnIds = [...new Set(dawnQuestions.map((question) => question.passageId).filter((id): id is string => Boolean(id)))];
  const grammarHashes = new Set(grammarCorpus.map((passage) => contentHash(passage.text)));
  const db = options.noDb
    ? { candidates: [] as RawCandidate[], dawnHashes: new Set<string>() }
    : await dbCandidates(options.academyId, dawnIds);
  const excludedHashes = new Set([...grammarHashes, ...db.dawnHashes]);

  const result = buildCorpus({
    repo: repoCandidates(),
    db: db.candidates,
    excludedHashes,
    excludedIds: new Set(dawnIds),
    seed: options.seed,
    academyId: options.noDb ? undefined : options.academyId,
    exclusionEvidence: {
      grammarCorpusHashes: grammarHashes.size,
      dawnPassageIds: dawnIds.length,
      dawnPassageHashes: db.dawnHashes.size,
    },
  });

  if (options.write) {
    const privateDir = path.join(SCRIPT_DIR, "private");
    fs.mkdirSync(privateDir, { recursive: true });
    const writes: Array<[string, unknown]> = [
      [path.join(SCRIPT_DIR, "manifest-public.json"), result.publicManifest],
      [path.join(privateDir, "manifest-private.json"), result.privateManifest],
      [path.join(SCRIPT_DIR, "robustness-queue.json"), result.robustnessQueue],
      [path.join(SCRIPT_DIR, "schedule-template.json"), result.scheduleTemplate],
    ];
    for (const [filePath, value] of writes) fs.writeFileSync(filePath, stableStringify(value), "utf8");
  }

  const summary = {
    mode: options.write ? "write" : "dry-run",
    outputDirectory: SCRIPT_DIR,
    diagnostics: result.diagnostics,
    manifestFiles: options.write
      ? ["manifest-public.json", "private/manifest-private.json", "robustness-queue.json", "schedule-template.json"]
      : [],
  };
  process.stdout.write(stableStringify(summary));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export { dbCandidates, parseArgs, repoCandidates };

