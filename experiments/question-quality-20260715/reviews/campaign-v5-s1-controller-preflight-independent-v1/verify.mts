import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunGenerationInput } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";
import type {
  QuestionGenerationResearchOperation,
  QuestionGenerationResearchRuntime,
  QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const designDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v5-s1",
);
const preflightDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1",
);
const queuePath = path.join(designDir, "private/s1-queue-v5.json");
const campaignPublicPath = path.join(designDir, "campaign-v5-s1.json");
const preflightPrivatePath = path.join(
  preflightDir,
  "private/controller-preflight-v1.json",
);
const preflightPublicPath = path.join(preflightDir, "controller-preflight-v1.json");
const preflightManifestPath = path.join(preflightDir, "MANIFEST.sha256");
const resultsPath = path.join(here, "results.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const PROVIDER_ROUTING = {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
} as const;
const SEED = "question-quality-s1-campaign-v5-20260715-v1";
const SCHOOL_TYPE = "고등학교";
const GRADE_INFO = "2학년";
const GRAMMAR_PROFILES = [
  "G0_CURRENT_CONTROL",
  "G1_FINAL_CHECKLIST_ABLATION",
  "G2_POSITIVE_COMPACT",
  "G3_SITE_CERTIFICATE",
] as const;
const BLANK_PROFILES = [
  "B0_CURRENT_CONTROL",
  "B1_TYPE_SCOPED_TAIL",
  "B2_POSITIVE_COMPACT",
  "B3_OPTION_INTENT_LEDGER",
] as const;
const PLANS = ["STANDARD", "PREMIUM"] as const;
const DIFFICULTIES = ["INTERMEDIATE", "KILLER"] as const;
const MANIFEST_FILES = ["README.md", "tsconfig.json", "verify.mts", "results.json"];

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
type Plan = (typeof PLANS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];

interface QueuePassage extends Record<string, unknown> {
  passageToken: string;
  frameId: string;
  questionType: QuestionType;
  passageContentExact: string;
  passageUtf8Bytes: number;
  passageUtf8Sha256: string;
}

interface QueueAssignment extends Record<string, unknown> {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  orderRank: string;
  passageToken: string;
  questionType: QuestionType;
  profileId: string;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  request: {
    plan: RunGenerationInput["plan"];
    schoolType: string;
    gradeInfo: string;
    passageContentRef: string;
    teacherIntentBlock: string;
    analysisContext: string;
    diffLabel: string;
    diffInstruction: string;
    generationPlan: Plan;
    customPrompt: string;
  };
  wireContract: {
    providerRequireParameters: boolean;
    reasoning: { enabled: boolean; effort: string; exclude: boolean };
    questionsMinItems: number;
    questionsMaxItems: number;
    maxOutputTokens: number;
  };
  admission: Record<string, unknown>;
  topology: Record<string, unknown>;
  replacementAllowed: boolean;
  topUpAllowed: boolean;
  generationAuthorized: boolean;
}

interface PrivateQueue extends Record<string, unknown> {
  schemaVersion: string;
  status: string;
  seed: string;
  fixedRequestContext: Record<string, unknown>;
  passages: QueuePassage[];
  assignments: QueueAssignment[];
  noReplacementOrTopUp: boolean;
  campaignEligibleAssignments: number;
  generationAuthorized: boolean;
  safety: Record<string, unknown>;
  privateQueueSemanticSha256: string;
}

interface CapturedWire {
  endpoint: string;
  method: string;
  bodyText: string;
  body: Record<string, unknown>;
}

interface IndependentWireFact {
  bodySha256: string;
  bodyBytes: number;
  promptSha256: string;
  schemaSha256: string;
  schemaKind: "base" | "grammar-site-certificate" | "blank-option-ledger";
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function assertManifest(filePath: string, baseDir: string, expectedLines?: number): void {
  const lines = readFileSync(filePath, "utf8").trim().split(/\r?\n/u);
  if (expectedLines !== undefined) assert.equal(lines.length, expectedLines);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
    assert.ok(match, `invalid manifest line in ${path.basename(filePath)}`);
    assert.equal(fileSha256(path.join(baseDir, match[2]!)), match[1]);
  }
}

function expectedModel(plan: Plan): string {
  return plan === "STANDARD"
    ? "google/gemini-3.5-flash"
    : "google/gemini-3.1-pro-preview";
}

function expectedOutputCap(type: QuestionType): number {
  return type === "GRAMMAR_ERROR" ? 6_000 : 4_000;
}

function expectedUsdCapCents(type: QuestionType, plan: Plan): number {
  if (type === "GRAMMAR_ERROR") return plan === "STANDARD" ? 20 : 43;
  return plan === "STANDARD" ? 14 : 20;
}

function validateFrozenQueue(
  queue: PrivateQueue,
  campaignPublic: Record<string, unknown>,
  diffDescription: Record<string, string>,
): void {
  assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v5-private-queue-v1");
  assert.equal(queue.status, "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED");
  assert.equal(queue.seed, SEED);
  assert.equal(queue.passages.length, 12);
  assert.equal(queue.assignments.length, 180);
  assert.equal(queue.noReplacementOrTopUp, true);
  assert.equal(queue.campaignEligibleAssignments, 0);
  assert.equal(queue.generationAuthorized, false);
  assert.equal(queue.safety.modelApiCalls, 0);
  assert.equal(queue.safety.networkCalls, 0);
  assert.equal(queue.safety.databaseCalls, 0);
  assert.equal(queue.safety.fullQuestionCandidatesGenerated, 0);
  assert.equal(queue.safety.globalApiCandidateCount, 0);

  assert.equal(queue.fixedRequestContext.schoolType, SCHOOL_TYPE);
  assert.equal(queue.fixedRequestContext.gradeInfo, GRADE_INFO);
  assert.deepEqual(queue.fixedRequestContext.difficulties, DIFFICULTIES);
  assert.deepEqual(queue.fixedRequestContext.difficultyInstructions, {
    INTERMEDIATE: diffDescription.INTERMEDIATE,
    KILLER: diffDescription.KILLER,
  });

  const semantic = sha256(
    stableJson(withoutKey(queue, "privateQueueSemanticSha256")),
  );
  assert.equal(semantic, queue.privateQueueSemanticSha256);
  const publicQueue = (campaignPublic.queue ?? {}) as Record<string, unknown>;
  assert.equal(publicQueue.privateQueueFileSha256, fileSha256(queuePath));
  assert.equal(publicQueue.privateQueueSemanticSha256, semantic);
  assert.equal(publicQueue.assignmentRows, 180);
  assert.equal(publicQueue.candidateOpportunities, 180);
  assert.equal(publicQueue.physicalFetchCap, 180);
  assert.equal(publicQueue.semanticFullQuestionCap, 180);

  assert.equal(new Set(queue.passages.map((row) => row.passageToken)).size, 12);
  assert.equal(new Set(queue.passages.map((row) => row.frameId)).size, 12);
  for (const passage of queue.passages) {
    assert.equal(Buffer.byteLength(passage.passageContentExact, "utf8"), passage.passageUtf8Bytes);
    assert.equal(sha256(passage.passageContentExact), passage.passageUtf8Sha256);
    assert.equal(passage.campaignEligible, false);
  }

  const expectedCells: Array<{
    assignmentKey: string;
    orderRank: string;
    passage: QueuePassage;
    profileId: string;
    plan: Plan;
    difficulty: Difficulty;
  }> = [];
  for (const passage of queue.passages) {
    const profiles =
      passage.questionType === "GRAMMAR_ERROR" ? GRAMMAR_PROFILES : BLANK_PROFILES;
    for (const profileId of profiles) {
      for (const plan of PLANS) {
        if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
        for (const difficulty of DIFFICULTIES) {
          const assignmentKey = [
            passage.questionType,
            passage.frameId,
            profileId,
            plan,
            difficulty,
          ].join("|");
          expectedCells.push({
            assignmentKey,
            orderRank: sha256(`${SEED}|order|${assignmentKey}`),
            passage,
            profileId,
            plan,
            difficulty,
          });
        }
      }
    }
  }
  expectedCells.sort(
    (left, right) =>
      left.orderRank.localeCompare(right.orderRank, "en") ||
      left.assignmentKey.localeCompare(right.assignmentKey, "en"),
  );
  assert.equal(expectedCells.length, 180);

  for (const [index, assignment] of queue.assignments.entries()) {
    const expected = expectedCells[index]!;
    const ordinal = index + 1;
    assert.equal(assignment.queueOrdinal, ordinal);
    assert.equal(assignment.assignmentKey, expected.assignmentKey);
    assert.equal(assignment.orderRank, expected.orderRank);
    assert.equal(
      assignment.assignmentId,
      `S1V5-${String(ordinal).padStart(3, "0")}-${expected.orderRank.slice(0, 12)}`,
    );
    assert.equal(assignment.passageToken, expected.passage.passageToken);
    assert.equal(assignment.questionType, expected.passage.questionType);
    assert.equal(assignment.profileId, expected.profileId);
    assert.equal(assignment.plan, expected.plan);
    assert.equal(assignment.difficulty, expected.difficulty);
    assert.equal(assignment.modelId, expectedModel(expected.plan));
    assert.deepEqual(assignment.request.plan, [
      {
        subType: expected.passage.questionType,
        count: 1,
        reason: "S1 v5 fixed profile-screen assignment",
        targetPoints: [],
      },
    ]);
    assert.equal(assignment.request.schoolType, SCHOOL_TYPE);
    assert.equal(assignment.request.gradeInfo, GRADE_INFO);
    assert.equal(assignment.request.passageContentRef, expected.passage.passageToken);
    assert.equal(assignment.request.teacherIntentBlock, "");
    assert.equal(assignment.request.analysisContext, "");
    assert.equal(assignment.request.diffLabel, expected.difficulty);
    assert.equal(assignment.request.diffInstruction, diffDescription[expected.difficulty]);
    assert.equal(assignment.request.generationPlan, expected.plan);
    assert.equal(assignment.request.customPrompt, "");
    assert.deepEqual(assignment.wireContract, {
      providerRequireParameters: true,
      reasoning: { enabled: false, effort: "none", exclude: true },
      questionsMinItems: 1,
      questionsMaxItems: 1,
      maxOutputTokens: expectedOutputCap(expected.passage.questionType),
    });
    assert.deepEqual(assignment.admission, {
      candidateOpportunityCap: 1,
      physicalFetchCap: 1,
      fullQuestionSemanticCap: 1,
      outerAttempts: 1,
      sdkRetries: 0,
      qualityMode: "strict",
      attemptIndex: 0,
      perCallUsdCapCents: expectedUsdCapCents(expected.passage.questionType, expected.plan),
      debitGlobalCandidateBudgetOnStartedOpportunity: 1,
    });
    assert.deepEqual(assignment.topology, {
      runner: "runPhaseCQuestionGenerationAssignment",
      directSingleShotMechanismScreen: true,
      triggerTaskUsed: false,
      ladderUsed: false,
      repairUsed: false,
      solverUsed: false,
      fallbackUsed: false,
      salvageUsed: false,
    });
    assert.equal(assignment.replacementAllowed, false);
    assert.equal(assignment.topUpAllowed, false);
    assert.equal(assignment.generationAuthorized, false);
  }

  assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
  assert.equal(new Set(queue.assignments.map((row) => row.orderRank)).size, 180);
  assert.deepEqual(countBy(queue.assignments.map((row) => row.questionType)), {
    BLANK_INFERENCE: 84,
    GRAMMAR_ERROR: 96,
  });
  assert.deepEqual(countBy(queue.assignments.map((row) => row.plan)), {
    PREMIUM: 84,
    STANDARD: 96,
  });
  assert.deepEqual(countBy(queue.assignments.map((row) => row.difficulty)), {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.equal(
    queue.assignments.reduce(
      (sum, row) => sum + Number(row.admission.perCallUsdCapCents),
      0,
    ),
    4_416,
  );
}

function assertProductionChain(): void {
  const read = (relative: string) =>
    readFileSync(path.join(repoRoot, relative), "utf8");
  const fast = read("src/app/api/workbench/ai-jobs/question-generation/fast/route.ts");
  const trigger = read("src/trigger/workbench-question-generation.ts");
  const engine = read(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  );
  const retry = read(
    "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
  );
  const llm = read("src/lib/question-generation-llm.ts");
  const atlas = read("src/lib/atlas-ai.ts");
  const boundary = read("src/lib/atlas-production-assignment-fetch-boundary.ts");
  const compiler = read(
    "experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/compile-controller-preflight.mts",
  );

  for (const callsite of [fast, trigger]) {
    assert.match(callsite, /runWithQuestionGenerationAssignmentBudget/u);
    assert.match(callsite, /runQuestionGenerationWithEmptyRetry/u);
    assert.match(callsite, /passage\.school\?\.type === "MIDDLE"/u);
    assert.ok(
      callsite.includes("\\uc911\\ud559\\uad50") || callsite.includes("\"중학교\""),
    );
    assert.ok(
      callsite.includes("\\uace0\\ub4f1\\ud559\\uad50") || callsite.includes("\"고등학교\""),
    );
    assert.match(callsite, /DIFF_DESCRIPTION\[diffLabel\]/u);
  }
  assert.match(engine, /generateWithRetry/u);
  assert.match(retry, /generateQuestionObject/u);
  assert.match(llm, /atlasChatModel\(config\.modelId\)/u);
  assert.match(atlas, /fetch:\s*atlasProductionAssignmentFetch/u);
  assert.match(boundary, /createAtlasProductionAssignmentFetchDispatcher\(atlasResearchFetch\)/u);

  // Architectural classification: this package exercises the generation core,
  // not either production entrypoint or the durable assignment-budget scope.
  assert.match(compiler, /runQuestionGeneration\(generation,/u);
  assert.doesNotMatch(compiler, /runQuestionGenerationWithEmptyRetry\(/u);
  assert.doesNotMatch(compiler, /runWithQuestionGenerationAssignmentBudget\(/u);
}

function maskedFailure(): Response {
  return new Response(
    JSON.stringify({
      error: { message: "offline independent audit", code: 400 },
      usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, cost: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function promptSurface(body: Record<string, unknown>): Record<string, unknown> {
  return {
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  };
}

function collectStrings(value: unknown, target: string[] = []): string[] {
  if (typeof value === "string") target.push(value);
  else if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, target);
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) collectStrings(child, target);
  }
  return target;
}

function questionItemProperties(schema: Record<string, unknown>): Record<string, unknown> {
  assert.ok(isRecord(schema.properties));
  const questions = schema.properties.questions;
  assert.ok(isRecord(questions));
  assert.equal(questions.type, "array");
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 1);
  assert.ok(isRecord(questions.items));
  assert.ok(isRecord(questions.items.properties));
  return questions.items.properties;
}

function validateCapturedWire(
  assignment: QueueAssignment,
  passage: QueuePassage,
  captured: CapturedWire,
): IndependentWireFact {
  assert.equal(captured.endpoint, ENDPOINT);
  assert.equal(captured.method, "POST");
  const body = captured.body;
  assert.equal(body.model, expectedModel(assignment.plan));
  assert.equal(body.model, assignment.modelId);
  assert.deepEqual(body.provider, PROVIDER_ROUTING);
  assert.deepEqual(body.reasoning, { enabled: false, effort: "none", exclude: true });
  assert.equal(body.plugins, undefined);
  assert.equal(body.models, undefined);
  assert.equal(body.route, undefined);
  assert.equal(body.routes, undefined);
  assert.equal(body.tools, undefined);
  assert.equal(body.tool_choice, undefined);
  assert.ok(body.stream === undefined || body.stream === false);
  assert.ok(body.n === undefined || body.n === 1);

  const caps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => typeof value === "number");
  assert.deepEqual(caps, [expectedOutputCap(assignment.questionType)]);

  assert.ok(isRecord(body.response_format));
  assert.equal(body.response_format.type, "json_schema");
  assert.ok(isRecord(body.response_format.json_schema));
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(isRecord(body.response_format.json_schema.schema));
  const schema = body.response_format.json_schema.schema;
  const properties = questionItemProperties(schema);

  let schemaKind: IndependentWireFact["schemaKind"] = "base";
  if (assignment.profileId === "G3_SITE_CERTIFICATE") {
    assert.ok(isRecord(properties.siteCertificate));
    assert.equal(properties.errorDesign, undefined);
    schemaKind = "grammar-site-certificate";
  } else if (assignment.profileId === "B3_OPTION_INTENT_LEDGER") {
    assert.ok(isRecord(properties.blankBlueprint));
    assert.equal(properties.blankDesign, undefined);
    schemaKind = "blank-option-ledger";
  } else if (assignment.questionType === "GRAMMAR_ERROR") {
    assert.ok(isRecord(properties.errorDesign));
    assert.equal(properties.siteCertificate, undefined);
  } else {
    assert.ok(isRecord(properties.blankDesign));
    assert.equal(properties.blankBlueprint, undefined);
  }

  const promptValues = collectStrings(promptSurface(body));
  const promptIncludes = (needle: string) =>
    promptValues.some((value) => value.includes(needle));
  assert.ok(promptIncludes(passage.passageContentExact));
  assert.ok(promptIncludes(assignment.request.schoolType));
  assert.ok(promptIncludes(assignment.request.gradeInfo));
  assert.ok(promptIncludes(assignment.request.diffLabel));
  assert.ok(promptIncludes(assignment.request.diffInstruction));

  return {
    bodySha256: sha256(captured.bodyText),
    bodyBytes: Buffer.byteLength(captured.bodyText, "utf8"),
    promptSha256: sha256(stableJson(promptSurface(body))),
    schemaSha256: sha256(stableJson(schema)),
    schemaKind,
  };
}

async function captureAll(
  queue: PrivateQueue,
  passageByToken: ReadonlyMap<string, QueuePassage>,
): Promise<IndependentWireFact[]> {
  // Dummy values are installed before the dynamic production import. The
  // verifier neither reads nor logs credential/header values.
  process.env.ATLASCLOUD_API_KEY = "offline-independent-audit-dummy";
  process.env.OPENROUTER_API_KEY = "offline-independent-audit-dummy";

  const hostFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("independent offline audit blocked network during module loading");
  }) as typeof fetch;
  try {

  const [generationModule, profilesModule, runtimeModule] = await Promise.all([
    import("@/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
    import("@/lib/question-generation-research-profiles"),
    import("@/lib/question-generation-research-runtime"),
  ]);
  const generation =
    (generationModule as unknown as { default?: typeof generationModule }).default ??
    generationModule;
  const profiles =
    (profilesModule as unknown as { default?: typeof profilesModule }).default ??
    profilesModule;
  const runtime =
    (runtimeModule as unknown as { default?: typeof runtimeModule }).default ??
    runtimeModule;
  const { runQuestionGeneration } = generation;
  const { runWithQuestionGenerationResearchPromptProfile } = profiles;
  const {
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
    runWithQuestionGenerationResearchRuntime,
  } = runtime;

  class IndependentRuntime implements QuestionGenerationResearchRuntime {
    readonly runtimeId = "campaign-v5-s1-independent-offline-audit";
    readonly retryPolicy = QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
    readonly expectedQuestionsPerStructuredCall = 1;
    async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> { return fn(); }
    async runOperation<T>(
      _operation: Readonly<QuestionGenerationResearchOperation>,
      fn: () => T | Promise<T>,
    ): Promise<T> { return fn(); }
    async runStage<T>(
      _stage: Readonly<QuestionGenerationResearchStage>,
      fn: () => T | Promise<T>,
    ): Promise<T> { return fn(); }
    async observeCandidateValues(): Promise<void> {}
    async decideCandidateValue(): Promise<void> {}
  }

  const facts: IndependentWireFact[] = [];
  for (const assignment of queue.assignments) {
    const passage = passageByToken.get(assignment.passageToken);
    assert.ok(passage);
    const input: RunGenerationInput = {
      plan: assignment.request.plan,
      schoolType: assignment.request.schoolType,
      gradeInfo: assignment.request.gradeInfo,
      passageContent: passage.passageContentExact,
      teacherIntentBlock: assignment.request.teacherIntentBlock,
      analysisContext: assignment.request.analysisContext,
      diffLabel: assignment.request.diffLabel,
      diffInstruction: assignment.request.diffInstruction,
      generationPlan: assignment.request.generationPlan,
      customPrompt: assignment.request.customPrompt,
    };
    const captured: CapturedWire[] = [];
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      const endpoint = new URL(
        typeof request === "string" || request instanceof URL ? request : request.url,
      ).toString();
      if (endpoint !== ENDPOINT || typeof init?.body !== "string") {
        throw new Error("independent offline audit rejected an unexpected network request");
      }
      captured.push({
        endpoint,
        method: String(init.method ?? "GET").toUpperCase(),
        bodyText: init.body,
        body: JSON.parse(init.body) as Record<string, unknown>,
      });
      return maskedFailure();
    }) as typeof fetch;
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    try {
      const questions = await runWithQuestionGenerationResearchPromptProfile(
        assignment.profileId as never,
        () =>
          runWithQuestionGenerationResearchRuntime(
            new IndependentRuntime(),
            () =>
              runQuestionGeneration(input, {
                qualityMode: "strict",
                attemptIndex: 0,
                deadlineAt: Date.now() - 1,
              }),
          ),
      );
      assert.deepEqual(questions, []);
    } finally {
      globalThis.fetch = originalFetch;
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    assert.equal(captured.length, 1);
    facts.push(validateCapturedWire(assignment, passage, captured[0]!));
  }
  return facts;
  } finally {
    globalThis.fetch = hostFetch;
  }
}

function validateProfileAndDifficultyEffects(
  queue: PrivateQueue,
  facts: IndependentWireFact[],
): void {
  const profileGroups = new Map<string, Set<string>>();
  const difficultyGroups = new Map<string, Set<string>>();
  for (const [index, assignment] of queue.assignments.entries()) {
    const fact = facts[index]!;
    const profileKey = [
      assignment.passageToken,
      assignment.plan,
      assignment.difficulty,
    ].join("|");
    const profileHashes = profileGroups.get(profileKey) ?? new Set<string>();
    profileHashes.add(fact.promptSha256);
    profileGroups.set(profileKey, profileHashes);

    const difficultyKey = [
      assignment.passageToken,
      assignment.profileId,
      assignment.plan,
    ].join("|");
    const difficultyHashes = difficultyGroups.get(difficultyKey) ?? new Set<string>();
    difficultyHashes.add(fact.promptSha256);
    difficultyGroups.set(difficultyKey, difficultyHashes);
  }
  for (const [key, hashes] of profileGroups) {
    const isBlankPremium = key.includes("|PREMIUM|") && key.startsWith("B-");
    assert.equal(hashes.size, isBlankPremium ? 3 : 4);
  }
  for (const hashes of difficultyGroups.values()) assert.equal(hashes.size, 2);
}

function validateOfficialArtifacts(
  queue: PrivateQueue,
  facts: IndependentWireFact[],
  preflightPrivate: Record<string, unknown>,
  preflightPublic: Record<string, unknown>,
): void {
  assert.equal(preflightPrivate.status, "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED");
  assert.equal(preflightPublic.status, "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED");
  assert.equal(
    sha256(stableJson(withoutKey(preflightPrivate, "controllerPreflightSemanticSha256"))),
    preflightPrivate.controllerPreflightSemanticSha256,
  );
  assert.equal(
    sha256(stableJson(withoutKey(preflightPublic, "publicArtifactSemanticSha256"))),
    preflightPublic.publicArtifactSemanticSha256,
  );
  assert.equal(
    preflightPrivate.controllerPreflightSemanticSha256,
    preflightPublic.controllerPreflightSemanticSha256,
  );
  assert.equal(preflightPublic.campaignPrivateQueueFileSha256, fileSha256(queuePath));

  const officialRows = preflightPrivate.rows as Array<Record<string, unknown>>;
  assert.equal(officialRows.length, 180);
  for (const [index, row] of officialRows.entries()) {
    const assignment = queue.assignments[index]!;
    const fact = facts[index]!;
    assert.equal(row.queueOrdinal, assignment.queueOrdinal);
    assert.equal(row.assignmentId, assignment.assignmentId);
    assert.equal(row.assignmentKey, assignment.assignmentKey);
    assert.equal(row.wireBodySha256, fact.bodySha256);
    assert.equal(row.wireBodyUtf8Bytes, fact.bodyBytes);
    assert.equal(row.wirePromptSha256, fact.promptSha256);
    assert.equal(row.wireSchemaSha256, fact.schemaSha256);
    assert.equal(row.observedFetches, 1);
    assert.equal(row.candidateOutputsPerCompletion, 1);
  }

  const sourceClosure = preflightPrivate.sourceClosure as Array<Record<string, unknown>>;
  assert.ok(sourceClosure.length >= 20);
  for (const item of sourceClosure) {
    const sourcePath = path.join(repoRoot, String(item.path));
    assert.equal(fileSha256(sourcePath), item.sha256);
    assert.equal(readFileSync(sourcePath).byteLength, item.bytes);
  }
  assert.equal(
    sha256(stableJson(sourceClosure)),
    preflightPublic.sourceClosureSha256,
  );

  const counts = preflightPublic.counts as Record<string, unknown>;
  assert.equal(counts.assignments, 180);
  assert.equal(counts.interceptedFetches, 180);
  assert.equal(counts.physicalFetchCap, 180);
  assert.equal(counts.candidateOpportunityCap, 180);
  assert.equal(counts.uniqueWireBodies, 180);
  const wire = preflightPublic.wire as Record<string, unknown>;
  const bodyBytes = facts.map((fact) => fact.bodyBytes);
  assert.equal(wire.endpointSha256, sha256(ENDPOINT));
  assert.equal(wire.minimumBodyUtf8Bytes, Math.min(...bodyBytes));
  assert.equal(wire.maximumBodyUtf8Bytes, Math.max(...bodyBytes));
  assert.equal(wire.totalBodyUtf8Bytes, bodyBytes.reduce((sum, value) => sum + value, 0));
  assert.equal(wire.strictJsonSchemaRows, 180);
  assert.equal(wire.reasoningOffRows, 180);
  assert.equal(wire.providerRequireParametersRows, 180);
  assert.equal(wire.providerZdrRows, 180);
  assert.equal(wire.providerDataCollectionDenyRows, 180);
  assert.equal(wire.providerFallbackDisabledRows, 180);
  assert.equal(wire.exactGoogleVertexGlobalOnlyRows, 180);

  const safety = preflightPublic.safety as Record<string, unknown>;
  assert.deepEqual(safety, {
    externalNetworkCalls: 0,
    providerCalls: 0,
    apiCandidatesConsumed: 0,
    compiledAssignments: 180,
    observedInterceptedFetches: 180,
    liveExecutionAuthorized: false,
    pricingAttached: false,
    rightsGateAttached: false,
    privacyGateAttached: false,
  });
  assert.ok(Array.isArray(preflightPublic.executionHolds));
  assert.equal(preflightPublic.executionHolds.length, 6);
}

function assertPublicPrivacy(
  queue: PrivateQueue,
  preflightPublic: Record<string, unknown>,
): void {
  const publicText = JSON.stringify(preflightPublic);
  const forbiddenKeys = [
    "passageContentExact",
    "passageToken",
    "assignmentId",
    "assignmentKey",
    "orderRank",
    "frameId",
    "sourceRecordId",
    "documentKey",
    "sourceDocumentId",
    "candidateId",
    "wireBodySha256",
    "wirePromptSha256",
    "wireSchemaSha256",
    "requestEnvelopeSha256",
  ];
  for (const key of forbiddenKeys) assert.equal(publicText.includes(`"${key}"`), false);

  const privateValues = new Set<string>();
  for (const passage of queue.passages) {
    for (const key of [
      "passageToken",
      "frameId",
      "contentHash",
      "candidateId",
      "sourceRecordId",
      "documentKey",
      "sourceDocumentId",
      "passageContentExact",
      "passageUtf8Sha256",
    ]) {
      const value = passage[key];
      if (typeof value === "string" && value.length >= 6) privateValues.add(value);
    }
  }
  for (const row of queue.assignments) {
    for (const value of [row.assignmentId, row.assignmentKey, row.orderRank, row.passageToken]) {
      if (value.length >= 6) privateValues.add(value);
    }
  }
  for (const value of privateValues) assert.equal(publicText.includes(value), false);
}

async function buildResults(): Promise<Record<string, unknown>> {
  assertManifest(preflightManifestPath, preflightDir, 6);
  const queue = readJson<PrivateQueue>(queuePath);
  const campaignPublic = readJson<Record<string, unknown>>(campaignPublicPath);
  const preflightPrivate = readJson<Record<string, unknown>>(preflightPrivatePath);
  const preflightPublic = readJson<Record<string, unknown>>(preflightPublicPath);

  const constantsModule = await import(
    "@/app/api/ai/generate-questions-auto/_lib/constants"
  );
  const constants =
    (constantsModule as unknown as { default?: typeof constantsModule }).default ??
    constantsModule;
  validateFrozenQueue(
    queue,
    campaignPublic,
    constants.DIFF_DESCRIPTION as Record<string, string>,
  );
  assertProductionChain();
  assertPublicPrivacy(queue, preflightPublic);

  const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
  const firstReplay = await captureAll(queue, passageByToken);
  const secondReplay = await captureAll(queue, passageByToken);
  assert.deepEqual(secondReplay, firstReplay);
  assert.equal(firstReplay.length, 180);
  assert.equal(new Set(firstReplay.map((row) => row.bodySha256)).size, 180);
  validateProfileAndDifficultyEffects(queue, firstReplay);
  validateOfficialArtifacts(queue, firstReplay, preflightPrivate, preflightPublic);

  const preflightCompiler = readFileSync(
    path.join(preflightDir, "compile-controller-preflight.mts"),
    "utf8",
  );
  const sourceClosure = preflightPrivate.sourceClosure as Array<Record<string, unknown>>;
  const closurePaths = new Set(sourceClosure.map((row) => String(row.path)));
  assert.equal(closurePaths.has("package-lock.json"), false);
  assert.equal(closurePaths.has("src/lib/concurrency-config.ts"), false);
  assert.match(preflightCompiler, /SOURCE_CLOSURE/u);

  return {
    schemaVersion: "question-quality-s1-controller-preflight-independent-audit-v1",
    verdict: "PASS_OFFLINE_WIRE_PREFLIGHT_ONLY_EXECUTION_BLOCKED",
    auditedArtifact: {
      publicPreflightSha256: fileSha256(preflightPublicPath),
      privatePreflightSha256: fileSha256(preflightPrivatePath),
      preflightManifestSha256: fileSha256(preflightManifestPath),
      controllerPreflightSemanticSha256:
        preflightPublic.controllerPreflightSemanticSha256,
      sourceClosureSha256: preflightPublic.sourceClosureSha256,
      privateQueueFileSha256: fileSha256(queuePath),
      privateQueueSemanticSha256: queue.privateQueueSemanticSha256,
    },
    independentReplay: {
      replays: 2,
      assignmentsPerReplay: 180,
      interceptedFetchesPerReplay: 180,
      exactOneFetchRows: 180,
      uniqueWireBodies: 180,
      byteIdenticalRowsAcrossReplays: 180,
      strictSingleQuestionJsonSchemaRows: 180,
      exactModelRows: 180,
      exactOutputCapRows: 180,
      exactProviderRequireParametersRows: 180,
      exactGoogleVertexGlobalOnlyRows: 180,
      providerFallbackDisabledRows: 180,
      providerDataCollectionDenyRows: 180,
      providerZdrRows: 180,
      exactReasoningOffRows: 180,
      exactDifficultyPromptBindingRows: 180,
      profileEffectGroupsPassed: 48,
      difficultyEffectGroupsPassed: 90,
    },
    allocation: {
      byType: countBy(queue.assignments.map((row) => row.questionType)),
      byPlan: countBy(queue.assignments.map((row) => row.plan)),
      byDifficulty: countBy(queue.assignments.map((row) => row.difficulty)),
      byModel: countBy(queue.assignments.map((row) => row.modelId)),
      byProfile: countBy(queue.assignments.map((row) => row.profileId)),
      frozenReservationUsd: 44.16,
    },
    privacy: {
      publicForbiddenPrivateKeysFound: 0,
      publicExactPrivateValuesFound: 0,
      reviewContainsRowLevelData: false,
    },
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      apiCandidatesConsumed: 0,
      databaseCalls: 0,
      secretsReadOrLogged: 0,
      dummyCredentialInstalledBeforeProductionDynamicImport: true,
      liveExecutionAuthorized: false,
    },
    architecturalClassification: {
      exactCurrentLocalGenerationCoreWirePreflight: true,
      productionFastOrTriggerEntrypointExecuted: false,
      runQuestionGenerationWithEmptyRetryExecuted: false,
      durableAssignmentBudgetScopeExecuted: false,
      durablePerAssignmentStateLeaseOutcomeLedgerAttached: false,
      completeTransitiveBuildDependencyClosure: false,
      deploymentEnvironmentParityProven: false,
      pricingAttached: false,
      providerSideHardSpendCeilingAttached: false,
      rightsGateAttached: false,
      privacyRetentionGateAttached: false,
      exactRequestProviderRoutePinAttached: true,
      accountPrivacyRetentionAndProviderComplianceProven: false,
    },
    executionHolds: [
      "documented source rights for provider processing",
      "current privacy, retention, account settings and pinned endpoint compliance/availability decision",
      "separate limited credential and provider-side hard spend ceiling",
      "fresh exact-route worst-case price proof within 15 minutes",
      "durable 180-row state/lease/outcome controller and ledger",
      "deployment configuration and transitive build closure",
    ],
  };
}

const results = await buildResults();
if (process.argv.includes("--write")) {
  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  const manifest = MANIFEST_FILES.map(
    (relativePath) => `${fileSha256(path.join(here, relativePath))}  ${relativePath}`,
  );
  writeFileSync(manifestPath, `${manifest.join("\n")}\n`, "utf8");
} else {
  assert.deepEqual(readJson<Record<string, unknown>>(resultsPath), results);
  assertManifest(manifestPath, here, MANIFEST_FILES.length);
}

process.stdout.write(
  `${JSON.stringify({
    verdict: results.verdict,
    assignments: (results.independentReplay as Record<string, unknown>).assignmentsPerReplay,
    interceptedFetchesPerReplay:
      (results.independentReplay as Record<string, unknown>).interceptedFetchesPerReplay,
    replays: (results.independentReplay as Record<string, unknown>).replays,
    externalNetworkCalls: (results.safety as Record<string, unknown>).externalNetworkCalls,
    providerCalls: (results.safety as Record<string, unknown>).providerCalls,
    apiCandidatesConsumed: (results.safety as Record<string, unknown>).apiCandidatesConsumed,
    publicPreflightSha256:
      (results.auditedArtifact as Record<string, unknown>).publicPreflightSha256,
    independentResultsSha256: process.argv.includes("--write")
      ? fileSha256(resultsPath)
      : fileSha256(resultsPath),
    independentManifestSha256: process.argv.includes("--write")
      ? fileSha256(manifestPath)
      : fileSha256(manifestPath),
  }, null, 2)}\n`,
);
