import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  conservativeCostV4,
  sha256V4,
  stableJsonV4,
  validatePriceSnapshotV4,
  validateProtocolV4,
  type AssignmentV4,
  type ConnectivityPilotProtocolV4,
  type JsonObject,
  type PilotPlanV4,
} from "./protocol-core";
import { priceEvidenceForModelV4 } from "./price-snapshot-core";
import { parseConnectivityResponseV4, type ParsedResponseEvidenceV4 } from "./response-parser";
import {
  livePrivateRootV4,
  readImmutableRepoBytesV4,
  readImmutableRepoJsonV4,
  readPrivateAttestedJsonV4,
  withExclusiveRepoJsonTransactionV4,
} from "./live-io";

const directNetworkFetchV4 = globalThis.fetch.bind(globalThis);
const PROTOCOL_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/protocol-v4.json";
const EXACT_WIRE_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/private/exact-wire-v4.private.json";
const GLOBAL_LEDGER_PATH = "experiments/question-quality-20260715/budget-ledger.json";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const LIVE_CHILD_ENV = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V4_LIVE_CHILD";
const GLOBAL_BATCH_ID = "campaign-v6-connectivity-pilot-v4-two-call";

interface ExactWireRowV4 {
  ordinal: 1 | 2;
  plan: PilotPlanV4;
  modelId: string;
  endpoint: string;
  bodyText: string;
  bodySha256: string;
  bodyUtf8Bytes: number;
  promptSha256: string;
  schemaSha256: string;
  requestEnvelopeSha256: string;
  profileArtifactSha256: string;
  gateArtifactSha256: string;
  policyArtifactSha256: string;
  maxOutputTokens: 4000;
  completionCount: 1;
  candidateOutputsPerCompletion: 1;
}

interface ExactWireArtifactV4 extends JsonObject {
  schemaVersion: string;
  status: string;
  rows: ExactWireRowV4[];
  privateSemanticSha256: string;
}

interface GlobalLedgerV4 extends JsonObject {
  schemaVersion: number;
  capFullQuestionCandidates: number;
  usedFullQuestionCandidates: number;
  reservedFullQuestionCandidates: number;
  acceptedQuestions: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAtKst: string;
  lastUpdatedAtKst: string;
  batches: JsonObject[];
  note: string;
}

interface JournalEventV4 extends JsonObject {
  sequence: number;
  at: string;
  event: string;
  plan: PilotPlanV4 | null;
  details: JsonObject;
  previousHash: string;
  eventHash: string;
}

interface PrivateRunStateV4 extends JsonObject {
  schemaVersion: "question-quality-connectivity-pilot-private-run-v4";
  runId: string;
  terminal: boolean;
  status: string;
  reservedCandidates: 2;
  candidateOpportunitiesConsumed: number;
  physicalFetches: number;
  completionsRequested: number;
  settledAssignments: number;
  successfulAssignments: number;
  actualCostUsd: number;
  assignments: Array<JsonObject>;
  journalHeadHash: string;
}

export interface PublicConnectivityResultV4 {
  schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v4";
  status: "COMPLETED_BOUNDED_CONNECTIVITY_PILOT" | "TERMINAL_PARTIAL_OR_FAILED";
  startedAssignments: number;
  settledAssignments: number;
  successfulAssignments: number;
  candidateOpportunitiesConsumed: number;
  physicalFetches: number;
  completionsRequested: number;
  actualCostUsd: number;
  effectiveCostUsd: number;
  usageEvidenceComplete: boolean;
  routeEvidenceComplete: boolean;
  parserEvidenceComplete: boolean;
  serialOrderComplete: boolean;
  globalReservationBound: boolean;
  executionArtifactSha256: string;
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} must be SHA-256`);
}

function kstNow(): string {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
  return shifted;
}

function exactWire(): { protocol: ConnectivityPilotProtocolV4; artifact: ExactWireArtifactV4 } {
  const protocolBytes = readImmutableRepoBytesV4(PROTOCOL_PATH);
  const protocol = validateProtocolV4(JSON.parse(protocolBytes.toString("utf8")) as unknown);
  const artifactBytes = readImmutableRepoBytesV4(EXACT_WIRE_PATH);
  if (sha256V4(artifactBytes) !== protocol.exactWireCommitment.privateArtifactSha256) {
    throw new Error("private exact-wire artifact differs from protocol commitment");
  }
  const artifact = JSON.parse(artifactBytes.toString("utf8")) as ExactWireArtifactV4;
  if (artifact.schemaVersion !== "question-quality-v6-connectivity-pilot-exact-wire-private-v4" ||
      artifact.status !== "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED" ||
      !Array.isArray(artifact.rows) || artifact.rows.length !== 2) {
    throw new Error("private exact-wire artifact is malformed");
  }
  const core = { ...artifact } as JsonObject;
  delete core.privateSemanticSha256;
  assertHash(artifact.privateSemanticSha256, "privateSemanticSha256");
  if (sha256V4(stableJsonV4(core)) !== artifact.privateSemanticSha256) throw new Error("private exact-wire semantic hash differs");
  const rows = [...artifact.rows].sort((left, right) => left.ordinal - right.ordinal);
  for (let index = 0; index < rows.length; index += 1) {
    const wire = rows[index]!;
    const assignment = protocol.durableBounds.assignments[index]!;
    if (wire.ordinal !== assignment.ordinal || wire.plan !== assignment.plan || wire.modelId !== assignment.modelId ||
        wire.endpoint !== ENDPOINT || wire.bodySha256 !== sha256V4(wire.bodyText) ||
        wire.bodyUtf8Bytes !== Buffer.byteLength(wire.bodyText, "utf8") ||
        wire.bodySha256 !== assignment.exactWireBodySha256 ||
        wire.bodyUtf8Bytes !== assignment.exactWireBodyUtf8Bytes ||
        wire.maxOutputTokens !== 4000 || wire.completionCount !== 1 || wire.candidateOutputsPerCompletion !== 1) {
      throw new Error(`exact wire differs for ${assignment.plan}`);
    }
    const body = asObject(JSON.parse(wire.bodyText) as unknown, `${assignment.plan} body`);
    if (body.model !== assignment.modelId || body.n !== undefined && body.n !== 1 || body.stream === true ||
        stableJsonV4(body.provider) !== stableJsonV4({
          order: ["google-vertex/global"], only: ["google-vertex/global"], allow_fallbacks: false,
          require_parameters: true, data_collection: "deny", zdr: true,
        }) || stableJsonV4(body.reasoning) !== stableJsonV4({ enabled: false, effort: "none", exclude: true })) {
      throw new Error(`exact route or body model differs for ${assignment.plan}`);
    }
    const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
      .filter((value): value is number => typeof value === "number");
    if (tokenCaps.length !== 1 || tokenCaps[0] !== 4000) throw new Error(`${assignment.plan} token cap differs`);
    const responseFormat = asObject(body.response_format, `${assignment.plan} response_format`);
    const jsonSchema = asObject(responseFormat.json_schema, `${assignment.plan} response_format.json_schema`);
    const responseSchema = asObject(jsonSchema.schema, `${assignment.plan} response schema`);
    if (responseFormat.type !== "json_schema" || jsonSchema.strict !== true || sha256V4(stableJsonV4(responseSchema)) !== wire.schemaSha256) {
      throw new Error(`${assignment.plan} exact response schema differs from compiler commitment`);
    }
  }
  return { protocol, artifact: { ...artifact, rows } };
}

function assertAuthorized(protocol: ConnectivityPilotProtocolV4): void {
  const authorization = protocol.authorization as unknown as Record<string, unknown>;
  if (process.env[LIVE_CHILD_ENV] !== "1" || authorization.liveExecutionAuthorized !== true ||
      authorization.hostileAuditPassed !== true || authorization.dispatchCommandPresent !== true) {
    throw new Error("v4 live dispatch is not authorized");
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("live child lacks its sole OpenRouter credential");
}

function validateFreshPriceSnapshot(protocol: ConnectivityPilotProtocolV4, snapshotPath: string) {
  const snapshot = validatePriceSnapshotV4(readPrivateAttestedJsonV4(snapshotPath));
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  const age = Date.now() - fetchedAt;
  if (age < 0 || age > Number(protocol.pricingEvidenceContract.maximumAgeMs)) throw new Error("price snapshot is stale");
  for (const assignment of protocol.durableBounds.assignments) {
    const evidence = priceEvidenceForModelV4(snapshot, assignment.modelId);
    if (evidence.emergencyPromptUsdPer1M > assignment.emergencyInputUsdPer1M + 1e-12 ||
        evidence.emergencyCompletionUsdPer1M > assignment.emergencyOutputUsdPer1M + 1e-12) {
      throw new Error(`${assignment.plan} public price exceeds the frozen emergency ceiling`);
    }
    const recomputed = conservativeCostV4({
      bodyBytes: assignment.exactWireBodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputUsdPer1M: assignment.emergencyInputUsdPer1M,
      outputUsdPer1M: assignment.emergencyOutputUsdPer1M,
      serverTokenOverheadUpperBound: Number(protocol.pricingEvidenceContract.serverTokenOverheadUpperBound),
      safetyMultiplier: Number(protocol.pricingEvidenceContract.safetyMultiplier),
    });
    if (recomputed !== assignment.calculatedWorstCaseUsdCap) throw new Error("frozen cost envelope differs");
  }
  return snapshot;
}

function globalLedger(value: unknown): GlobalLedgerV4 {
  const ledger = asObject(value, "global research ledger") as GlobalLedgerV4;
  if (ledger.schemaVersion !== 1 || ledger.capFullQuestionCandidates !== 1000 ||
      !Number.isSafeInteger(ledger.usedFullQuestionCandidates) ||
      !Number.isSafeInteger(ledger.reservedFullQuestionCandidates) || !Array.isArray(ledger.batches)) {
    throw new Error("global research ledger is malformed");
  }
  return ledger;
}

function reserveGlobalTwo(): void {
  withExclusiveRepoJsonTransactionV4({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v4",
    mutate(current) {
      const ledger = globalLedger(current);
      if (ledger.usedFullQuestionCandidates !== 0 || ledger.reservedFullQuestionCandidates !== 0) {
        throw new Error("v4 author freeze binds the global ledger at exactly 0 used / 0 reserved; reseal required");
      }
      if (ledger.batches.some((batch) => batch.batchId === GLOBAL_BATCH_ID)) throw new Error("global pilot reservation already exists");
      if (ledger.usedFullQuestionCandidates + ledger.reservedFullQuestionCandidates + 2 > ledger.capFullQuestionCandidates) {
        throw new Error("global candidate cap cannot reserve two pilot candidates");
      }
      const next = {
        ...ledger,
        reservedFullQuestionCandidates: ledger.reservedFullQuestionCandidates + 2,
        lastUpdatedAtKst: kstNow(),
        batches: [...ledger.batches, {
          batchId: GLOBAL_BATCH_ID,
          experiment: "question-quality-20260715",
          status: "RESERVED",
          reservedFullQuestionCandidates: 2,
          usedFullQuestionCandidates: 0,
          modelCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          note: "v4 connectivity pilot: exactly Standard then Premium, single-shot, no replay",
        }],
      };
      return { next, value: undefined };
    },
  });
}

function settleGlobal(input: { used: number; modelCalls: number; inputTokens: number; outputTokens: number; costUsd: number }): void {
  withExclusiveRepoJsonTransactionV4({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v4",
    mutate(current) {
      const ledger = globalLedger(current);
      const matches = ledger.batches.filter((batch) => batch.batchId === GLOBAL_BATCH_ID);
      if (matches.length !== 1 || matches[0]!.status !== "RESERVED" || ledger.reservedFullQuestionCandidates < 2) {
        throw new Error("global pilot reservation cannot be settled exactly once");
      }
      if (!Number.isSafeInteger(input.used) || input.used < 0 || input.used > 2 || input.modelCalls !== input.used) {
        throw new Error("global settlement counts are invalid");
      }
      const batches = ledger.batches.map((batch) => batch.batchId === GLOBAL_BATCH_ID ? {
        ...batch,
        status: "SETTLED_TERMINAL",
        reservedFullQuestionCandidates: 0,
        usedFullQuestionCandidates: input.used,
        modelCalls: input.modelCalls,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsd: input.costUsd,
      } : batch);
      const next = {
        ...ledger,
        usedFullQuestionCandidates: ledger.usedFullQuestionCandidates + input.used,
        reservedFullQuestionCandidates: ledger.reservedFullQuestionCandidates - 2,
        modelCalls: ledger.modelCalls + input.modelCalls,
        inputTokens: ledger.inputTokens + input.inputTokens,
        outputTokens: ledger.outputTokens + input.outputTokens,
        costUsd: Math.ceil((ledger.costUsd + input.costUsd) * 1e12) / 1e12,
        lastUpdatedAtKst: kstNow(),
        batches,
      };
      return { next, value: undefined };
    },
  });
}

function createPrivateState(runId: string): { runRoot: string; state: PrivateRunStateV4; append: (event: string, plan: PilotPlanV4 | null, details: JsonObject) => void; persist: () => void } {
  if (!/^[a-z0-9][a-z0-9-]{7,80}$/u.test(runId)) throw new Error("runId is invalid");
  const runsRoot = path.join(livePrivateRootV4, "runs");
  mkdirSync(runsRoot, { recursive: true });
  const runRoot = path.join(runsRoot, runId);
  mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  const journalPath = path.join(runRoot, "events.private.jsonl");
  const statePath = path.join(runRoot, "state.private.json");
  const handle = openSync(journalPath, "wx", 0o600);
  closeSync(handle);
  const state: PrivateRunStateV4 = {
    schemaVersion: "question-quality-connectivity-pilot-private-run-v4",
    runId,
    terminal: false,
    status: "PRIVATE_RESERVED_NOT_STARTED",
    reservedCandidates: 2,
    candidateOpportunitiesConsumed: 0,
    physicalFetches: 0,
    completionsRequested: 0,
    settledAssignments: 0,
    successfulAssignments: 0,
    actualCostUsd: 0,
    assignments: [],
    journalHeadHash: "0".repeat(64),
  };
  const persist = () => {
    const temporary = `${statePath}.${process.pid}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(statePath)) throw new Error("private state replacement is intentionally single-process only");
    // First state snapshot is immutable; subsequent truth is the append-only journal.
    writeFileSync(statePath, readFileSync(temporary));
  };
  let sequence = 0;
  const append = (event: string, plan: PilotPlanV4 | null, details: JsonObject) => {
    sequence += 1;
    const core = { sequence, at: new Date().toISOString(), event, plan, details, previousHash: state.journalHeadHash };
    const row: JournalEventV4 = { ...core, eventHash: sha256V4(stableJsonV4(core)) };
    appendFileSync(journalPath, `${JSON.stringify(row)}\n`, { encoding: "utf8", flush: true });
    state.journalHeadHash = row.eventHash;
  };
  return { runRoot, state, append, persist };
}

function publicResult(protocol: ConnectivityPilotProtocolV4, state: PrivateRunStateV4): PublicConnectivityResultV4 {
  const assignments = state.assignments;
  const evidence = assignments.map((row) => row.evidence).filter(Boolean) as ParsedResponseEvidenceV4[];
  const usageEvidenceComplete = evidence.length === 2 && evidence.every((row) => row.promptTokens > 0 && row.totalTokens >= row.promptTokens + row.completionTokens);
  const routeEvidenceComplete = evidence.length === 2 && evidence.every((row) => Boolean(row.providerRequestId && row.servedModel && row.provider));
  const parserEvidenceComplete = evidence.length === 2 && evidence.every((row) => /^[a-f0-9]{64}$/u.test(row.parserEvidenceHash));
  const serialOrderComplete = assignments.length === 2 && assignments[0]?.plan === "STANDARD" && assignments[1]?.plan === "PREMIUM";
  const complete = state.successfulAssignments === 2 && state.settledAssignments === 2 &&
    state.candidateOpportunitiesConsumed === 2 && state.physicalFetches === 2 && state.completionsRequested === 2 &&
    usageEvidenceComplete && routeEvidenceComplete && parserEvidenceComplete && serialOrderComplete &&
    state.actualCostUsd <= protocol.durableBounds.sharedCostCapUsd + 1e-12;
  const core = {
    schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v4" as const,
    status: complete ? "COMPLETED_BOUNDED_CONNECTIVITY_PILOT" as const : "TERMINAL_PARTIAL_OR_FAILED" as const,
    startedAssignments: assignments.length,
    settledAssignments: state.settledAssignments,
    successfulAssignments: state.successfulAssignments,
    candidateOpportunitiesConsumed: state.candidateOpportunitiesConsumed,
    physicalFetches: state.physicalFetches,
    completionsRequested: state.completionsRequested,
    actualCostUsd: state.actualCostUsd,
    effectiveCostUsd: Math.max(state.actualCostUsd, assignments.reduce((sum, row) => sum + Number(row.reservedCostUsd ?? 0), 0)),
    usageEvidenceComplete,
    routeEvidenceComplete,
    parserEvidenceComplete,
    serialOrderComplete,
    globalReservationBound: true,
  };
  return { ...core, executionArtifactSha256: sha256V4(stableJsonV4({ ...core, journalHeadHash: state.journalHeadHash })) };
}

function authorizationHeader(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("OpenRouter credential unavailable");
  return `Bearer ${key}`;
}

async function executeOne(input: {
  assignment: AssignmentV4;
  wire: ExactWireRowV4;
  expectedProvider: string;
  allowedServedModels: readonly string[];
  allowedFinishReasons: readonly ["stop"];
  run: ReturnType<typeof createPrivateState>;
}): Promise<boolean> {
  const { assignment, wire, run } = input;
  run.state.candidateOpportunitiesConsumed += 1;
  run.state.physicalFetches += 1;
  run.state.completionsRequested += 1;
  const assignmentState: JsonObject = {
    ordinal: assignment.ordinal,
    plan: assignment.plan,
    requestedModel: assignment.modelId,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    state: "UNKNOWN_AFTER_SEND_TERMINAL_UNTIL_SETTLED",
    wireBodySha256: assignment.exactWireBodySha256,
  };
  run.state.assignments.push(assignmentState);
  run.append("ASSIGNMENT_DEBITED_BEFORE_SEND", assignment.plan, {
    ordinal: assignment.ordinal,
    candidateOpportunity: 1,
    physicalFetch: 1,
    completion: 1,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    wireBodySha256: assignment.exactWireBodySha256,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("CONNECTIVITY_PILOT_TIMEOUT")), assignment.timeoutMs);
  let rawText = "";
  try {
    const response = await directNetworkFetchV4(ENDPOINT, {
      method: "POST",
      headers: { authorization: authorizationHeader(), "content-type": "application/json", accept: "application/json" },
      body: wire.bodyText,
      redirect: "error",
      signal: controller.signal,
    });
    rawText = await response.text();
    const responsePath = path.join(run.runRoot, `${assignment.ordinal}-${assignment.plan.toLowerCase()}-response.private.json`);
    const responseHandle = openSync(responsePath, "wx", 0o600);
    try {
      writeFileSync(responseHandle, rawText, "utf8");
      fsyncSync(responseHandle);
    } finally {
      closeSync(responseHandle);
    }
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    const evidence = parseConnectivityResponseV4({
      rawText,
      requestedModel: assignment.modelId,
      allowedServedModels: input.allowedServedModels,
      expectedProvider: input.expectedProvider,
      allowedFinishReasons: input.allowedFinishReasons,
      responseSchema: asObject(
        asObject(asObject(JSON.parse(wire.bodyText) as unknown, "wire body").response_format, "wire response_format").json_schema,
        "wire json_schema",
      ).schema as JsonObject,
    });
    if (evidence.actualCostUsd > assignment.calculatedWorstCaseUsdCap + 1e-12) throw new Error("actual cost exceeded frozen assignment cap");
    assignmentState.state = "SUCCESS_TERMINAL";
    assignmentState.evidence = evidence;
    run.state.settledAssignments += 1;
    run.state.successfulAssignments += 1;
    run.state.actualCostUsd = Math.ceil((run.state.actualCostUsd + evidence.actualCostUsd) * 1e12) / 1e12;
    run.append("ASSIGNMENT_SUCCESS_TERMINAL", assignment.plan, {
      providerRequestIdSha256: sha256V4(evidence.providerRequestId),
      servedModelSha256: sha256V4(evidence.servedModel),
      providerSha256: sha256V4(evidence.provider),
      parserEvidenceHash: evidence.parserEvidenceHash,
      questionHash: evidence.questionHash,
      promptTokens: evidence.promptTokens,
      completionTokens: evidence.completionTokens,
      totalTokens: evidence.totalTokens,
      actualCostUsd: evidence.actualCostUsd,
    });
    return true;
  } catch (error) {
    assignmentState.state = "FAILED_OR_UNKNOWN_AFTER_SEND_TERMINAL";
    assignmentState.failureClass = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "FAILURE_OR_UNKNOWN";
    assignmentState.failureMessageSha256 = sha256V4(error instanceof Error ? error.message : String(error));
    run.state.settledAssignments += 1;
    run.append("ASSIGNMENT_FAILED_OR_UNKNOWN_TERMINAL", assignment.plan, {
      failureClass: assignmentState.failureClass,
      failureMessageSha256: assignmentState.failureMessageSha256,
      rawResponseCaptured: rawText.length > 0,
      replayAllowed: false,
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function runSealedConnectivityPilotV4(input: {
  runId: string;
  priceSnapshotPath: string;
}): Promise<PublicConnectivityResultV4> {
  const loaded = exactWire();
  assertAuthorized(loaded.protocol);
  const snapshot = validateFreshPriceSnapshot(loaded.protocol, input.priceSnapshotPath);
  const run = createPrivateState(input.runId);
  reserveGlobalTwo();
  run.append("DUAL_RESERVATION_COMMITTED", null, {
    globalCandidateReservation: 2,
    privateCandidateReservation: 2,
    globalLedgerPathSha256: sha256V4(GLOBAL_LEDGER_PATH),
  });
  try {
    for (let index = 0; index < loaded.protocol.durableBounds.assignments.length; index += 1) {
      const assignment = loaded.protocol.durableBounds.assignments[index]!;
      const wire = loaded.artifact.rows[index]!;
      const price = priceEvidenceForModelV4(snapshot, assignment.modelId);
      const success = await executeOne({
        assignment,
        wire,
        expectedProvider: price.exactProvider,
        allowedServedModels: [assignment.modelId, price.canonicalSlug],
        allowedFinishReasons: loaded.protocol.providerContract.terminalFinishReasons as readonly ["stop"],
        run,
      });
      if (!success) break;
    }
  } finally {
    const evidence = run.state.assignments.map((row) => row.evidence).filter(Boolean) as ParsedResponseEvidenceV4[];
    settleGlobal({
      used: run.state.candidateOpportunitiesConsumed,
      modelCalls: run.state.physicalFetches,
      inputTokens: evidence.reduce((sum, row) => sum + row.promptTokens, 0),
      outputTokens: evidence.reduce((sum, row) => sum + row.completionTokens, 0),
      costUsd: run.state.actualCostUsd,
    });
    run.state.terminal = true;
    run.state.status = run.state.successfulAssignments === 2 ? "COMPLETED_TERMINAL" : "FAILED_OR_UNKNOWN_TERMINAL";
    run.append("RUN_TERMINAL_NO_REPLAY", null, {
      status: run.state.status,
      candidateOpportunitiesConsumed: run.state.candidateOpportunitiesConsumed,
      physicalFetches: run.state.physicalFetches,
      completionsRequested: run.state.completionsRequested,
      successfulAssignments: run.state.successfulAssignments,
      replayAllowed: false,
    });
    run.persist();
  }
  return publicResult(loaded.protocol, run.state);
}
