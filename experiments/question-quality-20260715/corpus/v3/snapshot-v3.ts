import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  contentHash,
  normalizeContent,
  sha256,
  stableStringify,
} from "../selector-core";
import { comparisonHash } from "../v2/history-index";
import { scanHistoricalExposureV3 } from "./history-v3";
import {
  type V3DatabaseEvidence,
  V3_DEFAULT_SEED,
  type V3ForbiddenReference,
  type V3PinnedSnapshot,
  type V3PrivateDatabaseProvenance,
  type V3RawCandidate,
  type V3RetainedPass,
  type V3SnapshotCore,
} from "./types-v3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const V3_REPO_ROOT = path.resolve(HERE, "../../../..");
const REPO_PASSAGES_PATH = path.join(V3_REPO_ROOT, "src/data/exam-passages/passages.json");
const V1_PRIVATE_PATH = path.join(HERE, "../private/manifest-private.json");
const V1_ADJUDICATION_PATH = path.join(
  V3_REPO_ROOT,
  "experiments/question-quality-20260715/reviews/corpus/adjudication.json",
);
const DAWN_PATH = path.join(V3_REPO_ROOT, "scripts/_gen_audit_out/jul15-dawn-questions.json");
const PRIVATE_SNAPSHOT_PATH = path.join(HERE, "private/input-snapshot.json");
const PUBLIC_SNAPSHOT_PATH = path.join(HERE, "input-snapshot-public.json");

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

interface DbPassageRow {
  id: string;
  academyId: string;
  title: string;
  content: string;
  source: string | null;
  subject: string | null;
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

interface DbGroup {
  hash: string;
  rows: DbPassageRow[];
  questionCount: number;
  aiQuestionCount: number;
  workbenchJobCount: number;
}

export interface V3DatabaseExtract {
  groups: DbGroup[];
  byPassageId: Map<string, DbPassageRow>;
  diagnostics: Record<string, unknown>;
  extractHash: string;
}

interface V1PrivateRecord {
  id: string;
  origin: "repo-official" | "db-real";
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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function safeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizedOriginalType(raw: string | null | undefined, tags: string[]): string | null {
  const joined = `${raw ?? ""} ${tags.join(" ")}`.toLowerCase();
  if (/빈칸|blank/.test(joined)) return "빈칸추론";
  if (/어법|grammar/.test(joined)) return "어법";
  return raw?.trim() || tags[0] || null;
}

function countMap<T extends { passageId: string | null; _count: { _all: number } }>(rows: T[]) {
  return new Map(
    rows
      .filter((row): row is T & { passageId: string } => row.passageId !== null)
      .map((row) => [row.passageId, row._count._all]),
  );
}

function privateProvenance(group: DbGroup, representative: DbPassageRow): V3PrivateDatabaseProvenance {
  return {
    representativePassageId: representative.id,
    representativeAcademyId: representative.academyId,
    matchedPassageIds: group.rows.map((row) => row.id).sort(),
    matchedAcademyIds: [...new Set(group.rows.map((row) => row.academyId))].sort(),
    reviewedAtByPassageId: Object.fromEntries(
      group.rows
        .map((row) => [row.id, row.reviewedAt?.toISOString() ?? null] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function publicEvidence(group: DbGroup, representative: DbPassageRow): V3DatabaseEvidence {
  return {
    candidateAcademyId: null,
    priorUseScope: "ALL_ACADEMIES",
    matchedPassageCount: group.rows.length,
    matchedPassageIds: group.rows.map((row) => row.id).sort(),
    questionCount: group.questionCount,
    aiQuestionCount: group.aiQuestionCount,
    workbenchJobCount: group.workbenchJobCount,
    reviewed: representative.reviewedAt !== null,
    representativeReviewed: representative.reviewedAt !== null,
    reviewedPassageCount: group.rows.filter((row) => row.reviewedAt !== null).length,
    matchedAcademyCount: new Set(group.rows.map((row) => row.academyId)).size,
  };
}

function representativeRow(group: DbGroup): DbPassageRow {
  return [...group.rows].sort((left, right) => {
    const reviewed = Number(right.reviewedAt !== null) - Number(left.reviewedAt !== null);
    if (reviewed !== 0) return reviewed;
    const leftMetadata = Number(Boolean(left.sourceMaterialId)) + Number(Boolean(left.tags));
    const rightMetadata = Number(Boolean(right.sourceMaterialId)) + Number(Boolean(right.tags));
    return rightMetadata - leftMetadata || left.id.localeCompare(right.id);
  })[0];
}

export async function loadGlobalDatabaseV3(): Promise<V3DatabaseExtract> {
  const { prisma } = await import("../../../../src/lib/prisma");
  try {
    const queriedRows = (await prisma.passage.findMany({
      where: { OR: [{ subject: null }, { subject: "ENGLISH" }] },
      select: {
        id: true,
        academyId: true,
        title: true,
        content: true,
        source: true,
        subject: true,
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
    })) as DbPassageRow[];
    const rows = queriedRows.filter((row) => {
      const compact = normalizeContent(row.content).replace(/\s/g, "");
      const latin = compact.match(/[A-Za-z]/g)?.length ?? 0;
      const sourceSubject = row.sourceMaterial?.subject?.toUpperCase() ?? null;
      return (
        latin / Math.max(1, compact.length) >= 0.55 &&
        (sourceSubject === null || sourceSubject === "ENGLISH")
      );
    });
    const ids = rows.map((row) => row.id);
    const [questions, aiQuestions, jobs] = await Promise.all([
      prisma.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.question.groupBy({
        by: ["passageId"],
        where: { passageId: { in: ids }, aiGenerated: true },
        _count: { _all: true },
      }),
      prisma.workbenchAiJob.groupBy({
        by: ["passageId"],
        where: { passageId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const qById = countMap(questions);
    const aiById = countMap(aiQuestions);
    const jobsById = countMap(jobs);
    const rowsByHash = new Map<string, DbPassageRow[]>();
    for (const row of rows) {
      const hash = contentHash(row.content);
      const group = rowsByHash.get(hash) ?? [];
      group.push(row);
      rowsByHash.set(hash, group);
    }
    const groups: DbGroup[] = [...rowsByHash.entries()]
      .map(([hash, groupRows]) => ({
        hash,
        rows: groupRows,
        questionCount: groupRows.reduce((sum, row) => sum + (qById.get(row.id) ?? 0), 0),
        aiQuestionCount: groupRows.reduce((sum, row) => sum + (aiById.get(row.id) ?? 0), 0),
        workbenchJobCount: groupRows.reduce((sum, row) => sum + (jobsById.get(row.id) ?? 0), 0),
      }))
      .sort((left, right) => left.hash.localeCompare(right.hash));
    const extractHash = sha256(
      stableStringify(
        groups.map((group) => ({
          hash: group.hash,
          rows: group.rows.map((row) => ({
            id: row.id,
            academyId: row.academyId,
            reviewedAt: row.reviewedAt?.toISOString() ?? null,
            contentHash: contentHash(row.content),
            title: row.title,
            source: row.source,
            subject: row.subject,
            extractionOutput: row.extractionOutput,
            tags: row.tags,
            sourceMaterialId: row.sourceMaterialId,
            sourceMaterial: row.sourceMaterial,
          })),
          questionCount: group.questionCount,
          aiQuestionCount: group.aiQuestionCount,
          workbenchJobCount: group.workbenchJobCount,
        })),
      ),
    );
    return {
      groups,
      byPassageId: new Map(rows.map((row) => [row.id, row])),
      extractHash,
      diagnostics: {
        queriedPassageRows: queriedRows.length,
        passageRows: rows.length,
        nonEnglishRowsExcluded: queriedRows.length - rows.length,
        normalizedContentGroups: groups.length,
        zeroPriorUseGroups: groups.filter(
          (group) =>
            group.questionCount === 0 &&
            group.aiQuestionCount === 0 &&
            group.workbenchJobCount === 0,
        ).length,
        priorUsedGroups: groups.filter(
          (group) =>
            group.questionCount > 0 ||
            group.aiQuestionCount > 0 ||
            group.workbenchJobCount > 0,
        ).length,
        reviewedRows: rows.filter((row) => row.reviewedAt !== null).length,
        databaseWrites: 0,
        queryKinds: ["Passage.findMany", "Question.groupBy", "WorkbenchAiJob.groupBy"],
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

function repoDocument(passage: RepoPassage) {
  return {
    documentKey: passage.examId ? `repo-exam:${passage.examId}` : null,
    sourceKind: "OFFICIAL_EXAM_REPOSITORY",
    sourceId: passage.examId ?? passage.id,
    year: passage.year ?? null,
    round: passage.exam ?? null,
    qNumbers: [...(passage.qNumbers ?? [])].sort((left, right) => left - right),
    originalType: passage.typeGroup ?? passage.type ?? null,
  };
}

function dbDocument(row: DbPassageRow, tags: string[]) {
  const rawDocumentId = row.sourceMaterial?.id ?? row.id;
  const pseudonymousDocument = `dbdoc:${sha256(rawDocumentId).slice(0, 24)}`;
  return {
    documentKey: pseudonymousDocument,
    sourceKind: row.sourceMaterial?.type ?? "DB_PASSAGE",
    sourceId: pseudonymousDocument,
    year: row.sourceMaterial?.year ?? null,
    round: row.sourceMaterial?.round ?? null,
    qNumbers: [],
    originalType: normalizedOriginalType(row.sourceMaterial?.examType, tags),
  };
}

function buildCandidates(repo: RepoPassage[], database: V3DatabaseExtract): V3RawCandidate[] {
  const dbByHash = new Map(database.groups.map((group) => [group.hash, group]));
  const repoCandidates: V3RawCandidate[] = repo.map((passage) => {
    const group = dbByHash.get(contentHash(passage.text)) ?? {
      hash: contentHash(passage.text),
      rows: [],
      questionCount: 0,
      aiQuestionCount: 0,
      workbenchJobCount: 0,
    };
    const representative = group.rows[0] ?? null;
    const evidence: V3DatabaseEvidence = representative
      ? publicEvidence(group, representative)
      : {
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
        };
    return {
      id: `repo:${passage.id}`,
      sourceRecordId: passage.id,
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
      databaseEvidence: evidence,
      privateDatabaseProvenance: representative
        ? privateProvenance(group, representative)
        : undefined,
    };
  });

  const dbCandidates: V3RawCandidate[] = database.groups
    .filter(
      (group) =>
        group.questionCount === 0 &&
        group.aiQuestionCount === 0 &&
        group.workbenchJobCount === 0,
    )
    .map((group) => {
      const representative = representativeRow(group);
      const tags = safeTags(representative.tags);
      return {
        id: `dbv3:${group.hash.slice(0, 24)}`,
        sourceRecordId: representative.id,
        origin: "db-global" as const,
        text: representative.content,
        title: representative.title,
        source: representative.source ?? representative.sourceMaterial?.title ?? null,
        sourceKind: representative.sourceMaterial?.type ?? "DB_PASSAGE",
        sourceSubject: representative.sourceMaterial?.subject ?? representative.subject ?? "ENGLISH",
        sourceExamType: representative.sourceMaterial?.examType ?? null,
        typeHint: tags.join(" ") || (representative.sourceMaterial?.examType ?? null),
        topicHint: tags.join(" ") || null,
        reconstructionKind: "none",
        hasDeliberateError: false,
        reviewed: representative.reviewedAt !== null,
        priorGeneratedQuestions: 0,
        priorWorkbenchJobs: 0,
        document: dbDocument(representative, tags),
        databaseEvidence: publicEvidence(group, representative),
        privateDatabaseProvenance: privateProvenance(group, representative),
        metadata: { extractionOutput: representative.extractionOutput },
      };
    });
  return [...repoCandidates, ...dbCandidates];
}

function buildRetained(
  candidates: V3RawCandidate[],
  database: V3DatabaseExtract,
): V3RetainedPass[] {
  const adjudication = readJson<{ records: AdjudicationRecord[] }>(V1_ADJUDICATION_PATH);
  const prior = readJson<{ splits: { dev: V1PrivateRecord[]; holdout: V1PrivateRecord[] } }>(
    V1_PRIVATE_PATH,
  );
  const privateById = new Map(
    [...prior.splits.dev, ...prior.splits.holdout].map((item) => [item.id, item]),
  );
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidateByHash = new Map(candidates.map((candidate) => [contentHash(candidate.text), candidate]));
  const dbGroupById = new Map<string, DbGroup>();
  for (const group of database.groups) for (const row of group.rows) dbGroupById.set(row.id, group);

  return adjudication.records
    .filter((record) => record.finalDecision === "PASS" && record.keepOrDrop !== "DROP")
    .map((record) => {
      const privateRecord = privateById.get(record.id);
      if (!privateRecord) throw new Error(`Missing retained private passage: ${record.id}`);
      let candidate =
        candidateById.get(record.id) ?? candidateByHash.get(contentHash(privateRecord.content));
      if (!candidate && privateRecord.origin === "db-real") {
        const dbRow = database.byPassageId.get(record.id);
        const group = dbGroupById.get(record.id);
        if (!dbRow || !group) throw new Error(`Retained DB passage not in pinned DB extract: ${record.id}`);
        const tags = safeTags(dbRow.tags);
        candidate = {
          id: `retained-dbv3:${contentHash(privateRecord.content).slice(0, 24)}`,
          sourceRecordId: dbRow.id,
          origin: "db-global",
          text: privateRecord.content,
          title: privateRecord.title ?? dbRow.title,
          source: dbRow.source ?? dbRow.sourceMaterial?.title ?? null,
          sourceKind: dbRow.sourceMaterial?.type ?? "DB_PASSAGE",
          sourceSubject: dbRow.sourceMaterial?.subject ?? dbRow.subject ?? "ENGLISH",
          typeHint: tags.join(" ") || (dbRow.sourceMaterial?.examType ?? null),
          reconstructionKind: "none",
          reviewed: privateRecord.provenance?.reviewed === true,
          priorGeneratedQuestions: group.aiQuestionCount,
          priorWorkbenchJobs: group.workbenchJobCount,
          document: dbDocument(dbRow, tags),
          databaseEvidence: publicEvidence(group, dbRow),
          privateDatabaseProvenance: privateProvenance(group, dbRow),
        };
      }
      if (!candidate) throw new Error(`Retained passage cannot be reconstructed: ${record.id}`);
      return {
        candidate,
        split: record.split,
        finalDecision: "PASS" as const,
        keepOrDrop: record.keepOrDrop,
        grammarRichness: record.grammarRichness,
        blankSuitability: record.blankSuitability,
        independentReviewCount: 2 as const,
      };
    });
}

function codeHash(repoRoot: string): string {
  const files = fs
    .readdirSync(HERE)
    .filter((name) => name.endsWith(".ts"))
    .sort();
  return sha256(
    stableStringify(
      files.map((name) => ({
        path: path.relative(repoRoot, path.join(HERE, name)).replace(/\\/g, "/"),
        sha256: sha256(fs.readFileSync(path.join(HERE, name), "utf8")),
      })),
    ),
  );
}

function dedupeReferences(references: V3ForbiddenReference[]): V3ForbiddenReference[] {
  const unique = new Map<string, V3ForbiddenReference>();
  for (const reference of references) {
    const key = `${contentHash(reference.text)}|${comparisonHash(reference.text)}`;
    if (!unique.has(key)) unique.set(key, reference);
  }
  return [...unique.values()].sort(
    (left, right) =>
      contentHash(left.text).localeCompare(contentHash(right.text)) || left.id.localeCompare(right.id),
  );
}

export async function buildPinnedSnapshotV3(asOf: string, seed = V3_DEFAULT_SEED) {
  if (!Number.isFinite(Date.parse(asOf)) || !/[zZ]|[+-]\d\d:\d\d$/.test(asOf)) {
    throw new Error("--as-of must be an ISO-8601 timestamp with an explicit timezone.");
  }
  const repoRaw = fs.readFileSync(REPO_PASSAGES_PATH, "utf8");
  const repo = JSON.parse(repoRaw) as RepoPassage[];
  const history = scanHistoricalExposureV3(V3_REPO_ROOT, [
    path.join(V3_REPO_ROOT, "experiments"),
    path.join(V3_REPO_ROOT, "scripts"),
  ]);
  if (history.parseFailures.length > 0) {
    throw new Error(`Historical snapshot has ${history.parseFailures.length} parse failure(s).`);
  }
  const database = await loadGlobalDatabaseV3();
  const candidates = buildCandidates(repo, database);
  const retained = buildRetained(candidates, database);
  const dawnRows = readJson<Array<{ passageId?: string }>>(DAWN_PATH);
  const dawnIds = [...new Set(dawnRows.map((row) => row.passageId).filter(Boolean))] as string[];
  const dawnReferences: V3ForbiddenReference[] = dawnIds
    .map((id) => database.byPassageId.get(id))
    .filter((row): row is DbPassageRow => Boolean(row))
    .map((row) => ({
      id: `dawn:${row.id}`,
      text: row.content,
      source: "jul15-dawn-db",
      lineage: "EXPLICIT_SENTINEL" as const,
    }));
  const priorDbReferences: V3ForbiddenReference[] = database.groups
    .filter(
      (group) =>
        group.questionCount > 0 ||
        group.aiQuestionCount > 0 ||
        group.workbenchJobCount > 0,
    )
    .map((group) => ({
      id: `prior-db:${group.hash.slice(0, 24)}`,
      text: representativeRow(group).content,
      source: "database-prior-use-all-academies",
      lineage: "PRIOR_DB_USE" as const,
    }));
  const historicalReferences: V3ForbiddenReference[] = history.texts.map((item, index) => ({
    id: `history:${index + 1}:${item.contentHash.slice(0, 12)}`,
    text: item.text,
    source: item.sourceFile,
    lineage: "ANTECEDENT_ARTIFACT" as const,
  }));
  const forbiddenReferences = dedupeReferences([
    ...historicalReferences,
    ...priorDbReferences,
    ...dawnReferences,
  ]);
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: V3_REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const gitDirty = Boolean(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: V3_REPO_ROOT,
      encoding: "utf8",
    }).trim(),
  );
  const core: V3SnapshotCore = {
    schemaVersion: 3,
    asOf: new Date(asOf).toISOString(),
    seed,
    gitSha,
    gitDirty,
    codeHash: codeHash(V3_REPO_ROOT),
    repoPassagesFileHash: sha256(repoRaw),
    historicalFilesHash: history.filesHash,
    historicalExtractHash: history.extractHash,
    databaseExtractHash: database.extractHash,
    candidates,
    retained,
    forbiddenReferences,
    historicalPassageIds: [
      ...new Set([
        ...history.uniquePassageIds,
        ...dawnIds,
        ...dawnIds.map((id) => `repo:${id}`),
      ]),
    ].sort(),
    diagnostics: {
      history: {
        filesScanned: history.filesScanned,
        uniqueTexts: history.texts.length,
        uniquePassageIds: history.uniquePassageIds.size,
        excludedDerivedFiles: history.excludedDerivedFiles.length,
        parseFailures: 0,
      },
      database: database.diagnostics,
      candidates: {
        total: candidates.length,
        repo: candidates.filter((candidate) => candidate.origin === "repo-official").length,
        dbGlobal: candidates.filter((candidate) => candidate.origin === "db-global").length,
        dbGlobalReviewed: candidates.filter(
          (candidate) => candidate.origin === "db-global" && candidate.reviewed === true,
        ).length,
      },
      retained: {
        total: retained.length,
        devDb: retained.filter(
          (item) => item.split === "dev" && item.candidate.origin === "db-global",
        ).length,
        devRepo: retained.filter(
          (item) => item.split === "dev" && item.candidate.origin === "repo-official",
        ).length,
        holdoutDb: retained.filter(
          (item) => item.split === "holdout" && item.candidate.origin === "db-global",
        ).length,
        holdoutRepo: retained.filter(
          (item) => item.split === "holdout" && item.candidate.origin === "repo-official",
        ).length,
      },
      forbiddenReferences: forbiddenReferences.length,
      databaseWrites: 0,
      apiCalls: 0,
    },
  };
  const snapshot: V3PinnedSnapshot = { ...core, snapshotHash: sha256(stableStringify(core)) };
  return { snapshot, history, database };
}

function publicSnapshot(snapshot: V3PinnedSnapshot): Record<string, unknown> {
  return {
    schemaVersion: snapshot.schemaVersion,
    asOf: snapshot.asOf,
    seed: snapshot.seed,
    snapshotHash: snapshot.snapshotHash,
    gitSha: snapshot.gitSha,
    gitDirty: snapshot.gitDirty,
    codeHash: snapshot.codeHash,
    repoPassagesFileHash: snapshot.repoPassagesFileHash,
    historicalFilesHash: snapshot.historicalFilesHash,
    historicalExtractHash: snapshot.historicalExtractHash,
    databaseExtractHash: snapshot.databaseExtractHash,
    diagnostics: snapshot.diagnostics,
    policy: {
      pinnedBeforeSelection: true,
      privateSnapshot: "private/input-snapshot.json (git-ignored)",
      databaseScope: "All academies, English/null-subject passages, normalized-content groups.",
      academyIdentifiersPublic: false,
      reviewedAtRule: "Metadata/stratum only; not an automatic eligibility gate.",
      derivedLineageExclusion:
        "Only this v3 campaign's corpus/v3 and reviews/corpus-v3 JSON outputs are excluded from antecedent history.",
    },
  };
}

function writeExclusive(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableStringify(value), { encoding: "utf8", flag: "wx" });
}

async function main(): Promise<void> {
  loadEnvConfig(V3_REPO_ROOT);
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const at = args.findIndex((argument) => argument === "--as-of");
  const inline = args.find((argument) => argument.startsWith("--as-of="));
  const asOf = inline?.slice("--as-of=".length) ?? (at >= 0 ? args[at + 1] : undefined);
  if (!asOf) throw new Error("--as-of is required and must be fixed before selection.");
  const { snapshot } = await buildPinnedSnapshotV3(asOf);
  if (write) {
    writeExclusive(PRIVATE_SNAPSHOT_PATH, snapshot);
    writeExclusive(PUBLIC_SNAPSHOT_PATH, publicSnapshot(snapshot));
  }
  process.stdout.write(
    stableStringify({
      mode: write ? "write" : "dry-run",
      snapshotHash: snapshot.snapshotHash,
      asOf: snapshot.asOf,
      diagnostics: snapshot.diagnostics,
      privateAcademyIdentifiers: true,
      publicAcademyIdentifiers: false,
      databaseWrites: 0,
      apiCalls: 0,
    }),
  );
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { codeHash as computeV3CodeHash, publicSnapshot as publicSnapshotV3 };
