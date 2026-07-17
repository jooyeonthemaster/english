import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const RUNS_DIR = path.join(HERE, "runs");
const PRIVATE_DIR = path.join(HERE, "private");
const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

const WINDOW_START = new Date("2026-05-31T15:00:00.000Z"); // 2026-06-01 KST
const JULY_START = new Date("2026-06-30T15:00:00.000Z"); // 2026-07-01 KST
const DEPLOYMENT_AT = new Date("2026-07-14T14:55:04.535Z");
const DEPLOYMENT_ID = "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD";
const DEPLOYMENT_GIT_HEAD = "467c6d107137a91088d3eba1620ba4036a63d709";

type Period =
  | "JUNE_2026_KST"
  | "JULY_PRE_DEPLOYMENT"
  | "JULY_POST_DEPLOYMENT_TIMESTAMP_CORRELATED";

type JsonRecord = Record<string, unknown>;

interface CostEvent {
  sourceId: string;
  sourceDetail: string | null;
  provider: string;
  model: string | null;
  operationType: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: { toString(): string };
  costKrw: number;
  pricingSource: string;
  metadata: unknown;
  usageAt: Date;
}

interface JobRecord {
  id: string;
  status: string;
  mode: string | null;
  questionType: string | null;
  generationPlan: string;
  difficulty: string | null;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  config: unknown;
  result: unknown;
  triggerRunId: string | null;
  createdAt: Date;
}

interface SanitizedJob {
  jobKey: string;
  period: Period;
  createdAt: string;
  status: string;
  route: "FAST" | "TRIGGER" | "UNKNOWN";
  mode: string | null;
  questionType: string;
  generationPlan: string;
  difficulty: string;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  generationAttempts: number | null;
  relaxedFallback: boolean | null;
  resultQuestionCount: number;
  reviewRecommendedCount: number;
  difficultyDowngradedCount: number;
  resultQualityModes: Record<string, number>;
  ledgerEventCount: number;
  ledgerCalls: number;
  inputTokens: number;
  outputTokens: number;
  mixedCostUsd: number;
  recordedCostUsd: number;
  estimatedCostUsd: number;
  missingPricingEvents: number;
  recordedPricingEvents: number;
  eventReportedAttemptSum: number;
  eventReportedAttemptMax: number;
  eventDurationMsSum: number;
  generationIdPresentEvents: number;
  models: string[];
  eventSubTypes: string[];
  ledgerEventsByModel: Record<string, number>;
  mixedCostUsdByModel: Record<string, number>;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator, 6) : null;
}

function periodFor(date: Date): Period {
  assert.ok(date >= WINDOW_START, "job precedes the audit window");
  if (date < JULY_START) return "JUNE_2026_KST";
  if (date < DEPLOYMENT_AT) return "JULY_PRE_DEPLOYMENT";
  return "JULY_POST_DEPLOYMENT_TIMESTAMP_CORRELATED";
}

function parseArgs(): { label: string; write: boolean } {
  const args = process.argv.slice(2);
  const labelAt = args.indexOf("--label");
  const inline = args.find((arg) => arg.startsWith("--label="));
  const label =
    inline?.slice("--label=".length) ??
    (labelAt >= 0 ? args[labelAt + 1] : undefined);
  if (!label || !LABEL_PATTERN.test(label)) {
    throw new Error("--label must match /^[a-z0-9][a-z0-9-]{0,79}$/");
  }
  return { label, write: args.includes("--write") };
}

function writeExclusive(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, { encoding: "utf8", flag: "wx" });
}

function countStrings(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(out).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function addToRecord(
  target: Record<string, number>,
  key: string,
  value: number,
): void {
  target[key] = (target[key] ?? 0) + value;
}

function sumNumberRecords(
  records: readonly Record<string, number>[],
  places = 6,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) addToRecord(out, key, value);
  }
  return Object.fromEntries(
    Object.entries(out)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, value]) => [key, round(value, places)]),
  );
}

function kstDate(isoDate: string): string {
  const instant = new Date(isoDate);
  assert.ok(Number.isFinite(instant.getTime()), `invalid ISO date: ${isoDate}`);
  return new Date(instant.getTime() + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

function nearestRank(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return round(sorted[index], 6);
}

function distribution(values: readonly number[]) {
  return {
    n: values.length,
    min: values.length > 0 ? round(Math.min(...values), 6) : null,
    p50: nearestRank(values, 0.5),
    p90: nearestRank(values, 0.9),
    p95: nearestRank(values, 0.95),
    max: values.length > 0 ? round(Math.max(...values), 6) : null,
    mean:
      values.length > 0
        ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 6)
        : null,
  };
}

function resultDiagnostics(resultValue: unknown) {
  const result = asRecord(resultValue);
  const debug = asRecord(result?.debugTiming);
  const questions = Array.isArray(result?.questions) ? result.questions : [];
  const modes: string[] = [];
  let reviewRecommendedCount = 0;
  let difficultyDowngradedCount = 0;
  for (const value of questions) {
    const question = asRecord(value);
    if (!question) continue;
    if (typeof question._qualityMode === "string") modes.push(question._qualityMode);
    if (question._reviewRecommended === true) reviewRecommendedCount += 1;
    if (question._difficultyDowngraded === true) difficultyDowngradedCount += 1;
  }
  return {
    generationAttempts: finiteNumber(debug?.generationAttempts),
    relaxedFallback:
      typeof debug?.relaxedFallback === "number"
        ? debug.relaxedFallback > 0
        : typeof debug?.relaxedFallback === "boolean"
          ? debug.relaxedFallback
          : null,
    resultQuestionCount: questions.length,
    reviewRecommendedCount,
    difficultyDowngradedCount,
    resultQualityModes: countStrings(modes),
    resultFastPath: result?.fastPath === true,
  };
}

function eventDiagnostics(events: readonly CostEvent[]) {
  let ledgerCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let mixedCostUsd = 0;
  let recordedCostUsd = 0;
  let estimatedCostUsd = 0;
  let missingPricingEvents = 0;
  let recordedPricingEvents = 0;
  let eventReportedAttemptSum = 0;
  let eventReportedAttemptMax = 0;
  let eventDurationMsSum = 0;
  let generationIdPresentEvents = 0;
  const models = new Set<string>();
  const subTypes = new Set<string>();
  const ledgerEventsByModel: Record<string, number> = {};
  const mixedCostUsdByModel: Record<string, number> = {};

  for (const event of events) {
    const cost = Number(event.costUsd.toString());
    const metadata = asRecord(event.metadata);
    // This metadata field is polymorphic in the current implementation:
    // ordinary calls report GenerateQuestionObject.attempts, while the premium
    // grammar ladder reports its logical ladder-attempt index. It is therefore
    // descriptive only and must never be interpreted as physical HTTP calls.
    const reportedAttempts = finiteNumber(metadata?.attempts) ?? 0;
    const durationMs = finiteNumber(metadata?.durationMs) ?? 0;
    ledgerCalls += event.calls;
    inputTokens += event.inputTokens;
    outputTokens += event.outputTokens;
    mixedCostUsd += Number.isFinite(cost) ? cost : 0;
    if (event.pricingSource === "RECORDED") {
      recordedCostUsd += Number.isFinite(cost) ? cost : 0;
      recordedPricingEvents += 1;
    } else if (event.pricingSource === "MISSING") {
      missingPricingEvents += 1;
    } else {
      estimatedCostUsd += Number.isFinite(cost) ? cost : 0;
    }
    eventReportedAttemptSum += reportedAttempts;
    eventReportedAttemptMax = Math.max(eventReportedAttemptMax, reportedAttempts);
    eventDurationMsSum += durationMs;
    if (typeof metadata?.generationId === "string" && metadata.generationId.length > 0) {
      generationIdPresentEvents += 1;
    }
    if (event.model) {
      models.add(event.model);
      addToRecord(ledgerEventsByModel, event.model, 1);
      addToRecord(mixedCostUsdByModel, event.model, Number.isFinite(cost) ? cost : 0);
    }
    if (event.sourceDetail?.startsWith("QUESTION_GENERATION:")) {
      subTypes.add(event.sourceDetail.slice("QUESTION_GENERATION:".length));
    }
  }

  return {
    ledgerEventCount: events.length,
    ledgerCalls,
    inputTokens,
    outputTokens,
    mixedCostUsd: round(mixedCostUsd),
    recordedCostUsd: round(recordedCostUsd),
    estimatedCostUsd: round(estimatedCostUsd),
    missingPricingEvents,
    recordedPricingEvents,
    eventReportedAttemptSum,
    eventReportedAttemptMax,
    eventDurationMsSum,
    generationIdPresentEvents,
    models: [...models].sort((left, right) => left.localeCompare(right, "en")),
    eventSubTypes: [...subTypes].sort((left, right) => left.localeCompare(right, "en")),
    ledgerEventsByModel: sumNumberRecords([ledgerEventsByModel], 0),
    mixedCostUsdByModel: sumNumberRecords([mixedCostUsdByModel]),
  };
}

function summarize(rows: readonly SanitizedJob[]) {
  const completed = rows.filter((row) => row.status === "COMPLETED");
  const withLedger = rows.filter((row) => row.ledgerEventCount > 0);
  const fullyRecorded = rows.filter(
    (row) => row.ledgerEventCount > 0 && row.recordedPricingEvents === row.ledgerEventCount,
  );
  const requested = rows.reduce((sum, row) => sum + row.requestedCount, 0);
  const results = rows.reduce((sum, row) => sum + row.resultCount, 0);
  const ledgerEvents = rows.reduce((sum, row) => sum + row.ledgerEventCount, 0);
  const ledgerCalls = rows.reduce((sum, row) => sum + row.ledgerCalls, 0);
  const mixedCostUsd = rows.reduce((sum, row) => sum + row.mixedCostUsd, 0);
  const recordedCostUsd = rows.reduce((sum, row) => sum + row.recordedCostUsd, 0);
  const estimatedCostUsd = rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  return {
    jobs: rows.length,
    statusCounts: countStrings(rows.map((row) => row.status)),
    routes: countStrings(rows.map((row) => row.route)),
    requestedQuestions: requested,
    resultQuestions: results,
    completedJobs: completed.length,
    completionRate: rate(completed.length, rows.length),
    resultYield: rate(results, requested),
    jobsWithLedger: withLedger.length,
    ledgerCoverageRate: rate(withLedger.length, rows.length),
    fullyGatewayRecordedCostJobs: fullyRecorded.length,
    ledgerEvents,
    ledgerCalls,
    lowerBoundEventsPerResultQuestion: rate(ledgerEvents, results),
    lowerBoundCallsPerResultQuestion: rate(ledgerCalls, results),
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    mixedLedgerCostUsd: round(mixedCostUsd),
    gatewayRecordedCostUsd: round(recordedCostUsd),
    reconstructedEstimatedCostUsd: round(estimatedCostUsd),
    missingPricingEvents: rows.reduce((sum, row) => sum + row.missingPricingEvents, 0),
    generationIdPresentEvents: rows.reduce(
      (sum, row) => sum + row.generationIdPresentEvents,
      0,
    ),
    ledgerEventCountPerJob: distribution(rows.map((row) => row.ledgerEventCount)),
    ledgerEventCountPerLedgeredJob: distribution(
      withLedger.map((row) => row.ledgerEventCount),
    ),
    eventReportedAttemptSumPerLedgeredJob: distribution(
      withLedger.map((row) => row.eventReportedAttemptSum),
    ),
    generationAttemptsPerReportedJob: distribution(
      rows
        .map((row) => row.generationAttempts)
        .filter((value): value is number => value !== null),
    ),
    mixedCostUsdPerLedgeredJob: distribution(withLedger.map((row) => row.mixedCostUsd)),
    mixedCostUsdPerResultQuestion:
      results > 0 ? round(mixedCostUsd / results, 6) : null,
    reviewRecommendedQuestions: rows.reduce(
      (sum, row) => sum + row.reviewRecommendedCount,
      0,
    ),
    difficultyDowngradedQuestions: rows.reduce(
      (sum, row) => sum + row.difficultyDowngradedCount,
      0,
    ),
    jobsUsingModel: countStrings(rows.flatMap((row) => row.models)),
    jobsWithEventSubType: countStrings(rows.flatMap((row) => row.eventSubTypes)),
    ledgerEventsByModel: sumNumberRecords(
      rows.map((row) => row.ledgerEventsByModel),
      0,
    ),
    mixedCostUsdByModel: sumNumberRecords(
      rows.map((row) => row.mixedCostUsdByModel),
    ),
  };
}

function groupedSummary(
  rows: readonly SanitizedJob[],
  keyOf: (row: SanitizedJob) => string,
) {
  const groups = new Map<string, SanitizedJob[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, group]) => [key, summarize(group)]),
  );
}

async function main(): Promise<void> {
  const { label, write } = parseArgs();
  const capturedAt = new Date();
  assert.ok(capturedAt > DEPLOYMENT_AT);
  const { loadEnvConfig } = nextEnv;
  loadEnvConfig(REPO_ROOT);
  const { prisma } = await import("../../../../src/lib/prisma");

  let jobs: JobRecord[] = [];
  let costs: CostEvent[] = [];
  try {
    jobs = await prisma.workbenchAiJob.findMany({
      where: {
        domain: "QUESTION_GENERATION",
        createdAt: { gte: WINDOW_START, lt: capturedAt },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        questionType: true,
        generationPlan: true,
        difficulty: true,
        requestedCount: true,
        successCount: true,
        failedCount: true,
        resultCount: true,
        config: true,
        result: true,
        triggerRunId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    costs = (await prisma.platformApiUsageCost.findMany({
      where: {
        sourceType: "WORKBENCH_AI_JOB",
        sourceDetail: { startsWith: "QUESTION_GENERATION:" },
        usageAt: { gte: WINDOW_START, lt: capturedAt },
      },
      select: {
        sourceId: true,
        sourceDetail: true,
        provider: true,
        model: true,
        operationType: true,
        calls: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        costKrw: true,
        pricingSource: true,
        metadata: true,
        usageAt: true,
      },
      orderBy: [{ usageAt: "asc" }, { sourceId: "asc" }],
    })) as CostEvent[];
  } finally {
    await prisma.$disconnect();
  }

  const jobIds = new Set(jobs.map((job) => job.id));
  const orphanCosts = costs.filter((event) => !jobIds.has(event.sourceId));
  const costsByJob = new Map<string, CostEvent[]>();
  for (const event of costs) {
    if (!jobIds.has(event.sourceId)) continue;
    const group = costsByJob.get(event.sourceId) ?? [];
    group.push(event);
    costsByJob.set(event.sourceId, group);
  }

  const sanitized: SanitizedJob[] = jobs.map((job) => {
    const result = resultDiagnostics(job.result);
    const config = asRecord(job.config);
    const route =
      result.resultFastPath || config?.fastPath === true
        ? "FAST"
        : job.triggerRunId
          ? "TRIGGER"
          : "UNKNOWN";
    return {
      jobKey: sha256(`${label}\0${job.id}`).slice(0, 24),
      period: periodFor(job.createdAt),
      createdAt: job.createdAt.toISOString(),
      status: job.status,
      route,
      mode: job.mode,
      questionType: job.questionType ?? "UNKNOWN",
      generationPlan: job.generationPlan || "UNKNOWN",
      difficulty: job.difficulty ?? "UNKNOWN",
      requestedCount: job.requestedCount,
      successCount: job.successCount,
      failedCount: job.failedCount,
      resultCount: job.resultCount,
      generationAttempts: result.generationAttempts,
      relaxedFallback: result.relaxedFallback,
      resultQuestionCount: result.resultQuestionCount,
      reviewRecommendedCount: result.reviewRecommendedCount,
      difficultyDowngradedCount: result.difficultyDowngradedCount,
      resultQualityModes: result.resultQualityModes,
      ...eventDiagnostics(costsByJob.get(job.id) ?? []),
    };
  });

  assert.equal(new Set(sanitized.map((row) => row.jobKey)).size, sanitized.length);
  assert.equal(
    sanitized.reduce((sum, row) => sum + row.ledgerEventCount, 0) +
      orphanCosts.length,
    costs.length,
  );

  const privateCore = {
    schemaVersion: "production-question-generation-usage-ledger-private-v1",
    label,
    capturedAt: capturedAt.toISOString(),
    windowStart: WINDOW_START.toISOString(),
    deploymentBoundary: {
      deploymentId: DEPLOYMENT_ID,
      sourceGitHead: DEPLOYMENT_GIT_HEAD,
      deployedAt: DEPLOYMENT_AT.toISOString(),
      interpretation: "timestamp correlation only",
    },
    rows: sanitized,
    orphanCostEvents: orphanCosts.length,
    querySafety: {
      databaseReadsOnly: true,
      queryKinds: ["WorkbenchAiJob.findMany", "PlatformApiUsageCost.findMany"],
      databaseWrites: 0,
      modelApiCalls: 0,
      providerApiCalls: 0,
      fullQuestionCandidatesGenerated: 0,
    },
  };
  const privateJson = stableStringify({
    ...privateCore,
    artifactSha256: sha256(stableStringify(privateCore)),
  });

  const focusRows = sanitized.filter((row) =>
    ["GRAMMAR_ERROR", "BLANK_INFERENCE"].includes(row.questionType),
  );
  const publicCore = {
    schemaVersion: "production-question-generation-usage-ledger-public-v1",
    label,
    capturedAt: capturedAt.toISOString(),
    windowStart: WINDOW_START.toISOString(),
    deploymentBoundary: privateCore.deploymentBoundary,
    interpretation: {
      eventAndCallCounts:
        "Lower bounds over successfully returned top-level usage events; not physical provider calls.",
      usageEventAttempts:
        "Polymorphic descriptive metadata: ordinary object-generation attempts or premium-ladder logical attempt index; never a physical-call count.",
      costs:
        "RECORDED is gateway-reported; DB/ENV/ESTIMATE is reconstructed; mixed totals are not invoice totals.",
      deploymentCohort:
        "Rows after deployedAt are timestamp-correlated only because jobs lack source/runtime digests.",
      resultMetadata:
        "Quality-mode/review flags are aggregate metadata read from stored result objects; no question content is emitted.",
    },
    privacy: {
      containsPassageText: false,
      containsQuestionText: false,
      containsExplanationText: false,
      containsPromptText: false,
      containsTitles: false,
      containsRawDatabaseIds: false,
      containsAcademyIds: false,
      containsStaffIds: false,
      containsGenerationIds: false,
      containsErrorMessages: false,
    },
    coverage: {
      jobs: sanitized.length,
      costEvents: costs.length,
      orphanCostEvents: orphanCosts.length,
    },
    overall: summarize(sanitized),
    byPeriod: groupedSummary(sanitized, (row) => row.period),
    byKstDate: groupedSummary(sanitized, (row) => kstDate(row.createdAt)),
    byQuestionType: groupedSummary(sanitized, (row) => row.questionType),
    focusByPeriodTypePlanDifficulty: groupedSummary(
      focusRows,
      (row) =>
        `${row.period}|${row.questionType}|${row.generationPlan}|${row.difficulty}`,
    ),
    safety: privateCore.querySafety,
  };
  const publicJson = stableStringify({
    ...publicCore,
    privateArtifactSha256: sha256(privateJson),
    artifactSha256: sha256(stableStringify(publicCore)),
  });

  const scriptHash = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
  const manifest = [
    `${sha256(publicJson)}  runs/${label}-public.json`,
    `${sha256(privateJson)}  private/${label}-private.json`,
    `${scriptHash}  audit.mts`,
    "",
  ].join("\n");

  if (write) {
    writeExclusive(path.join(RUNS_DIR, `${label}-public.json`), publicJson);
    writeExclusive(path.join(PRIVATE_DIR, `${label}-private.json`), privateJson);
    writeExclusive(path.join(RUNS_DIR, `${label}-manifest.sha256`), manifest);
  }

  process.stdout.write(
    stableStringify({
      label,
      write,
      capturedAt: capturedAt.toISOString(),
      jobs: sanitized.length,
      costEvents: costs.length,
      orphanCostEvents: orphanCosts.length,
      periods: Object.fromEntries(
        Object.entries(publicCore.byPeriod).map(([key, value]) => [
          key,
          {
            jobs: value.jobs,
            resultQuestions: value.resultQuestions,
            jobsWithLedger: value.jobsWithLedger,
            ledgerEvents: value.ledgerEvents,
            mixedLedgerCostUsd: value.mixedLedgerCostUsd,
          },
        ]),
      ),
      publicSha256: sha256(publicJson),
      privateSha256: sha256(privateJson),
      modelApiCalls: 0,
    }),
  );
}

await main();
