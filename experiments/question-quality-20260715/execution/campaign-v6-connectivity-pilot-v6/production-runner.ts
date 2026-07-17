import {
  appendFileSync,
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODEL_RESPONSE_BODY_MAX_BYTES_V6,
  readBoundedUtf8ResponseBodyV6,
} from "./bounded-response-body";
import {
  conservativeCostV6,
  sha256V6,
  stableJsonV6,
  validatePriceSnapshotV6,
  validateProtocolV6,
  type AssignmentV6,
  type ConnectivityPilotProtocolV6,
  type JsonObject,
  type PilotPlanV6,
} from "./protocol-core";
import { priceEvidenceForModelV6, validatePinnedPrivatePriceEvidenceBundleV6 } from "./price-snapshot-core";
import {
  extractConnectivityBillingEvidenceV6,
  parseConnectivityResponseV6,
  type ParsedResponseEvidenceV6,
} from "./response-parser";
import {
  buildAssignmentChargeV6,
  buildFailClosedPostSendChargeV6,
  buildPostSettlementMarkerFailureEvidenceV6,
  buildRunLedgerSettlementForDispatchV6,
  buildSettlementFailureEvidenceV6,
  buildTerminalReconciliationIntentV6,
  commitGlobalSettlementAfterDurableIntentV6,
  constructPostSendChargeFailClosedV6,
  MAX_RUN_EFFECTIVE_COST_USD_V6,
  MAX_RUN_USAGE_TOKENS_V6,
  projectCandidateCapacityQuarantineV6,
  TerminalIntentNotDurableErrorV6,
  type AssignmentChargeV6,
  type RunLedgerSettlementV6,
} from "./terminal-reconciliation-core";
import { observeRawCandidateCardinalityV6 } from "./strict-json-observer";
import { assertAuthorFreezePermanentlyNoDispatchV6 } from "./author-freeze-gate";
import { writeExclusiveDurablePrivateMarkerV6 } from "./durable-private-marker";
import { assertParentDirectoryDurabilityPlatformSupportedV6 } from "./filesystem-durability";
import {
  assertFrozenRuntimeEntrypointV6,
  frozenRuntimeReferenceFromProtocolV6,
} from "./frozen-runtime-core";
import { LIVE_CHILD_MARKER_ENV_V6 } from "./live-environment";
import {
  assertRealDirectoryV6,
  createExclusivePrivateRunDirectoryV6,
  livePackageRootV6,
  readImmutableRepoBytesV6,
  readPrivateAttestedJsonEvidenceV6,
  RepoJsonTransactionCommitUnknownErrorV6,
  withExclusiveRepoJsonTransactionV6,
} from "./live-io";

const directNetworkFetchV6 = globalThis.fetch.bind(globalThis);
const PROTOCOL_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/protocol-v6.json";
const EXACT_WIRE_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/private/exact-wire-v6.private.json";
const GLOBAL_LEDGER_PATH = "experiments/question-quality-20260715/budget-ledger.json";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const GLOBAL_BATCH_ID = "campaign-v6-connectivity-pilot-v6-two-call";

interface ExactWireRowV6 {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
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

interface ExactWireArtifactV6 extends JsonObject {
  schemaVersion: string;
  status: string;
  rows: ExactWireRowV6[];
  privateSemanticSha256: string;
}

interface GlobalLedgerV6 extends JsonObject {
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

interface JournalEventV6 extends JsonObject {
  sequence: number;
  at: string;
  event: string;
  plan: PilotPlanV6 | null;
  details: JsonObject;
  previousHash: string;
  eventHash: string;
}

interface PrivateRunStateV6 extends JsonObject {
  schemaVersion: "question-quality-connectivity-pilot-private-run-v6";
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
  effectiveCostUsd: number;
  actualCostKnownAssignments: number;
  usageKnownAssignments: number;
  manualCostReconciliationAssignments: number;
  globalReservationCommitted: boolean;
  globalReservationCommitUnknown: boolean;
  globalSettlementSucceeded: boolean;
  globalSettlementCommitUnknown: boolean;
  assignments: JsonObject[];
  charges: AssignmentChargeV6[];
  journalHeadHash: string;
}

export interface PublicConnectivityResultV6 {
  schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v6";
  status: "COMPLETED_BOUNDED_CONNECTIVITY_PILOT" | "TERMINAL_PARTIAL_OR_FAILED";
  startedAssignments: number;
  settledAssignments: number;
  successfulAssignments: number;
  candidateOpportunitiesConsumed: number;
  physicalFetches: number;
  completionsRequested: number;
  actualCostUsd: number;
  effectiveCostUsd: number;
  actualCostKnownAssignments: number;
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

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/u, "")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function money(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_RUN_EFFECTIVE_COST_USD_V6) {
    throw new Error("money is outside the v6 representable run bound");
  }
  const scaled = Math.ceil(value * 1e12);
  if (!Number.isSafeInteger(scaled)) throw new Error("money cannot be represented at the v6 decimal scale");
  return scaled / 1e12;
}

function addMoney(left: number, right: number): number {
  const leftScaled = Math.round(money(left) * 1e12);
  const rightScaled = Math.round(money(right) * 1e12);
  const totalScaled = leftScaled + rightScaled;
  if (!Number.isSafeInteger(totalScaled) || totalScaled < 0 ||
      totalScaled > MAX_RUN_EFFECTIVE_COST_USD_V6 * 1e12) {
    throw new Error("money aggregate is outside the v6 representable run bound");
  }
  return totalScaled / 1e12;
}

function kstNow(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function exactWire(): { protocol: ConnectivityPilotProtocolV6; artifact: ExactWireArtifactV6 } {
  const protocolBytes = readImmutableRepoBytesV6(PROTOCOL_PATH);
  const protocol = validateProtocolV6(parseJsonBytes(protocolBytes, "protocol"));
  const artifactBytes = readImmutableRepoBytesV6(EXACT_WIRE_PATH);
  if (sha256V6(artifactBytes) !== protocol.exactWireCommitment.privateArtifactSha256) {
    throw new Error("private exact-wire artifact differs from protocol commitment");
  }
  const artifact = parseJsonBytes(artifactBytes, "private exact-wire artifact") as ExactWireArtifactV6;
  if (artifact.schemaVersion !== "question-quality-v6-connectivity-pilot-exact-wire-private-v6" ||
      artifact.status !== "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED" ||
      !Array.isArray(artifact.rows) || artifact.rows.length !== 2) {
    throw new Error("private exact-wire artifact is malformed");
  }
  const core = { ...artifact } as JsonObject;
  delete core.privateSemanticSha256;
  assertHash(artifact.privateSemanticSha256, "privateSemanticSha256");
  if (sha256V6(stableJsonV6(core)) !== artifact.privateSemanticSha256) {
    throw new Error("private exact-wire semantic hash differs");
  }
  const rows = [...artifact.rows].sort((left, right) => left.ordinal - right.ordinal);
  for (let index = 0; index < rows.length; index += 1) {
    const wire = rows[index]!;
    const assignment = protocol.durableBounds.assignments[index]!;
    if (wire.ordinal !== assignment.ordinal || wire.plan !== assignment.plan || wire.modelId !== assignment.modelId ||
        wire.endpoint !== ENDPOINT || wire.bodySha256 !== sha256V6(wire.bodyText) ||
        wire.bodyUtf8Bytes !== Buffer.byteLength(wire.bodyText, "utf8") ||
        wire.bodySha256 !== assignment.exactWireBodySha256 ||
        wire.bodyUtf8Bytes !== assignment.exactWireBodyUtf8Bytes ||
        wire.maxOutputTokens !== 4000 || wire.completionCount !== 1 || wire.candidateOutputsPerCompletion !== 1) {
      throw new Error(`exact wire differs for ${assignment.plan}`);
    }
    const body = asObject(JSON.parse(wire.bodyText) as unknown, `${assignment.plan} body`);
    const exactBodyKeys = ["max_tokens", "messages", "model", "provider", "reasoning", "response_format"];
    if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(exactBodyKeys)) {
      throw new Error(`${assignment.plan} exact wire exposes an unmodeled charge-capable request surface`);
    }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.some((candidate) => {
      const message = asObject(candidate, `${assignment.plan} message`);
      return JSON.stringify(Object.keys(message).sort()) !== JSON.stringify(["content", "role"]) ||
        typeof message.content !== "string" ||
        (message.role !== "system" && message.role !== "user");
    })) {
      throw new Error(`${assignment.plan} exact wire messages are not text-only role/content objects`);
    }
    if (body.model !== assignment.modelId || (body.n !== undefined && body.n !== 1) || body.stream === true ||
        stableJsonV6(body.provider) !== stableJsonV6({
          order: ["google-vertex/global"], only: ["google-vertex/global"], allow_fallbacks: false,
          require_parameters: true, data_collection: "deny", zdr: true,
        }) || stableJsonV6(body.reasoning) !== stableJsonV6({ enabled: false, effort: "none", exclude: true })) {
      throw new Error(`exact route or body model differs for ${assignment.plan}`);
    }
    const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
      .filter((value): value is number => typeof value === "number");
    if (tokenCaps.length !== 1 || tokenCaps[0] !== 4000) throw new Error(`${assignment.plan} token cap differs`);
    const responseFormat = asObject(body.response_format, `${assignment.plan} response_format`);
    const jsonSchema = asObject(responseFormat.json_schema, `${assignment.plan} response_format.json_schema`);
    const responseSchema = asObject(jsonSchema.schema, `${assignment.plan} response schema`);
    if (responseFormat.type !== "json_schema" || jsonSchema.strict !== true ||
        sha256V6(stableJsonV6(responseSchema)) !== wire.schemaSha256) {
      throw new Error(`${assignment.plan} exact response schema differs from compiler commitment`);
    }
  }
  return { protocol, artifact: { ...artifact, rows } };
}

function assertAuthorized(protocol: ConnectivityPilotProtocolV6): void {
  const authorization = protocol.authorization as unknown as Record<string, unknown>;
  if (process.env[LIVE_CHILD_MARKER_ENV_V6] !== "1" || authorization.liveExecutionAuthorized !== true ||
      authorization.hostileAuditPassed !== true || authorization.dispatchCommandPresent !== true) {
    throw new Error("v6 live dispatch is not authorized");
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("live child lacks its sole OpenRouter credential");
}

function validateFreshPriceSnapshot(
  protocol: ConnectivityPilotProtocolV6,
  snapshotPath: string,
  expectedFileSha256: string,
  expectedBundleSha256: string,
) {
  const observed = readPrivateAttestedJsonEvidenceV6(snapshotPath);
  const bundle = validatePinnedPrivatePriceEvidenceBundleV6({
    value: observed.value,
    observedFileSha256: observed.fileSha256,
    expectedFileSha256,
    expectedBundleSha256,
  });
  const snapshot = validatePriceSnapshotV6(bundle.snapshot);
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  const age = Date.now() - fetchedAt;
  if (age < 0 || age > Number(protocol.pricingEvidenceContract.maximumAgeMs)) throw new Error("price snapshot is stale");
  for (const assignment of protocol.durableBounds.assignments) {
    const evidence = priceEvidenceForModelV6(snapshot, assignment.modelId);
    if (evidence.emergencyPromptUsdPer1M > assignment.emergencyInputUsdPer1M + 1e-12 ||
        evidence.emergencyCompletionUsdPer1M > assignment.emergencyOutputUsdPer1M + 1e-12 ||
        evidence.emergencyRequestUsd > assignment.emergencyRequestUsd + 1e-12) {
      throw new Error(`${assignment.plan} public price exceeds the frozen emergency ceiling`);
    }
    const recomputed = conservativeCostV6({
      bodyBytes: assignment.exactWireBodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputUsdPer1M: assignment.emergencyInputUsdPer1M,
      outputUsdPer1M: assignment.emergencyOutputUsdPer1M,
      fixedRequestUsd: assignment.emergencyRequestUsd,
      serverTokenOverheadUpperBound: Number(protocol.pricingEvidenceContract.serverTokenOverheadUpperBound),
      safetyMultiplier: Number(protocol.pricingEvidenceContract.safetyMultiplier),
    });
    if (recomputed !== assignment.calculatedWorstCaseUsdCap) throw new Error("frozen cost envelope differs");
  }
  return snapshot;
}

function globalLedger(value: unknown): GlobalLedgerV6 {
  const ledger = asObject(value, "global research ledger") as GlobalLedgerV6;
  const exactKeys = [
    "schemaVersion", "capFullQuestionCandidates", "usedFullQuestionCandidates",
    "reservedFullQuestionCandidates", "acceptedQuestions", "modelCalls", "inputTokens",
    "outputTokens", "costUsd", "startedAtKst", "lastUpdatedAtKst", "batches", "note",
  ].sort();
  if (ledger.schemaVersion !== 1 || ledger.capFullQuestionCandidates !== 1000 ||
      !Number.isSafeInteger(ledger.usedFullQuestionCandidates) ||
      !Number.isSafeInteger(ledger.reservedFullQuestionCandidates) ||
      ledger.usedFullQuestionCandidates < 0 || ledger.reservedFullQuestionCandidates < 0 ||
      ledger.usedFullQuestionCandidates + ledger.reservedFullQuestionCandidates > ledger.capFullQuestionCandidates ||
      !Number.isSafeInteger(ledger.acceptedQuestions) || ledger.acceptedQuestions < 0 ||
      !Number.isSafeInteger(ledger.modelCalls) || ledger.modelCalls < 0 ||
      !Number.isSafeInteger(ledger.inputTokens) || ledger.inputTokens < 0 ||
      !Number.isSafeInteger(ledger.outputTokens) || ledger.outputTokens < 0 ||
      !Number.isFinite(ledger.costUsd) || ledger.costUsd < 0 ||
      !Number.isSafeInteger(Math.ceil(ledger.costUsd * 1e12)) ||
      typeof ledger.startedAtKst !== "string" || typeof ledger.lastUpdatedAtKst !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+09:00$/u.test(ledger.startedAtKst) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+09:00$/u.test(ledger.lastUpdatedAtKst) ||
      !Number.isFinite(Date.parse(ledger.startedAtKst)) || !Number.isFinite(Date.parse(ledger.lastUpdatedAtKst)) ||
      typeof ledger.note !== "string" || !Array.isArray(ledger.batches) ||
      JSON.stringify(Object.keys(ledger).sort()) !== JSON.stringify(exactKeys) ||
      ledger.batches.some((batch) => !batch || typeof batch !== "object" || Array.isArray(batch))) {
    throw new Error("global research ledger is malformed");
  }
  return ledger;
}

function safeCounterAdd(left: number, right: number, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum) {
    throw new Error(`${label} aggregate is outside its safe bound`);
  }
  return result;
}

function reserveGlobalTwo(): string[] {
  const outcome = withExclusiveRepoJsonTransactionV6({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v6",
    mutate(current) {
      const ledger = globalLedger(current);
      if (ledger.usedFullQuestionCandidates !== 0 || ledger.reservedFullQuestionCandidates !== 0 ||
          ledger.acceptedQuestions !== 0 || ledger.modelCalls !== 0 || ledger.inputTokens !== 0 ||
          ledger.outputTokens !== 0 || ledger.costUsd !== 0 || ledger.batches.length !== 0) {
        throw new Error("v6 author freeze binds every mutable global ledger counter, cost, and batch at exact zero; reseal required");
      }
      if (ledger.batches.some((batch) => batch.batchId === GLOBAL_BATCH_ID)) {
        throw new Error("global pilot reservation already exists");
      }
      if (ledger.usedFullQuestionCandidates + ledger.reservedFullQuestionCandidates + 2 > ledger.capFullQuestionCandidates) {
        throw new Error("global candidate cap cannot reserve two pilot candidates");
      }
      return {
        next: {
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
            actualCostUsd: 0,
            effectiveCostUsd: 0,
            costUsd: 0,
            actualCostKnownAssignments: 0,
            usageKnownAssignments: 0,
            conservativeUnknownBillingAssignments: 0,
            manualCostReconciliationAssignments: 0,
            note: "v6 connectivity pilot: exactly Standard then Premium, single-shot, no replay",
          }],
        },
        value: undefined,
      };
    },
  });
  return outcome.cleanupWarningKinds;
}

function settleGlobal(input: RunLedgerSettlementV6): string[] {
  const outcome = withExclusiveRepoJsonTransactionV6({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v6",
    mutate(current) {
      const ledger = globalLedger(current);
      const matches = ledger.batches.filter((batch) => batch.batchId === GLOBAL_BATCH_ID);
      if (matches.length !== 1 || matches[0]!.status !== "RESERVED" || ledger.reservedFullQuestionCandidates < 2) {
        throw new Error("global pilot reservation cannot be settled exactly once");
      }
      const reservedBatch = matches[0]!;
      if (reservedBatch.experiment !== "question-quality-20260715" ||
          reservedBatch.reservedFullQuestionCandidates !== 2 || reservedBatch.usedFullQuestionCandidates !== 0 ||
          reservedBatch.modelCalls !== 0 || reservedBatch.inputTokens !== 0 || reservedBatch.outputTokens !== 0 ||
          reservedBatch.actualCostUsd !== 0 || reservedBatch.effectiveCostUsd !== 0 || reservedBatch.costUsd !== 0 ||
          reservedBatch.actualCostKnownAssignments !== 0 || reservedBatch.usageKnownAssignments !== 0 ||
          reservedBatch.conservativeUnknownBillingAssignments !== 0 || reservedBatch.manualCostReconciliationAssignments !== 0) {
        throw new Error("global pilot reservation batch invariants differ");
      }
      if (!Number.isSafeInteger(input.used) || input.used < 0 || input.used > 2 || input.modelCalls !== input.used ||
          input.observedFullQuestionCandidates > input.used || input.candidateOverflowAssignments !== 0 ||
          input.choiceCardinalityExcessAssignments !== 0 || input.candidateCardinalityAmbiguousAssignments !== 0 ||
          input.choiceCardinalityDriftAssignments !== input.choiceCardinalityShortageAssignments ||
          input.globalCandidateQuarantineRequired !== false ||
          !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 0 || input.inputTokens > MAX_RUN_USAGE_TOKENS_V6 ||
          !Number.isSafeInteger(input.outputTokens) || input.outputTokens < 0 || input.outputTokens > MAX_RUN_USAGE_TOKENS_V6 ||
          !Number.isFinite(input.actualCostUsd) || input.actualCostUsd < 0 || input.actualCostUsd > MAX_RUN_EFFECTIVE_COST_USD_V6 ||
          !Number.isFinite(input.effectiveCostUsd) || input.effectiveCostUsd < 0 || input.effectiveCostUsd > MAX_RUN_EFFECTIVE_COST_USD_V6 ||
          !Number.isSafeInteger(Math.ceil(input.actualCostUsd * 1e12)) ||
          !Number.isSafeInteger(Math.ceil(input.effectiveCostUsd * 1e12)) ||
          input.effectiveCostUsd + 1e-12 < input.actualCostUsd ||
          !Number.isSafeInteger(input.actualCostKnownAssignments) || input.actualCostKnownAssignments < 0 ||
          !Number.isSafeInteger(input.usageKnownAssignments) || input.usageKnownAssignments < 0 ||
          !Number.isSafeInteger(input.conservativeUnknownBillingAssignments) || input.conservativeUnknownBillingAssignments < 0 ||
          !Number.isSafeInteger(input.manualCostReconciliationAssignments) || input.manualCostReconciliationAssignments < 0 ||
          input.manualReconciliationRequired !== false || input.manualCostReconciliationAssignments !== 0 ||
          input.actualCostKnownAssignments > input.used || input.usageKnownAssignments > input.used ||
          input.conservativeUnknownBillingAssignments + input.manualCostReconciliationAssignments !== input.used - input.actualCostKnownAssignments) {
        throw new Error("global settlement counts are invalid");
      }
      const batches = ledger.batches.map((batch) => batch.batchId === GLOBAL_BATCH_ID ? {
        ...batch,
        status: "SETTLED_TERMINAL_NO_REPLAY",
        reservedFullQuestionCandidates: 0,
        usedFullQuestionCandidates: input.used,
        modelCalls: input.modelCalls,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        actualCostUsd: input.actualCostUsd,
        effectiveCostUsd: input.effectiveCostUsd,
        costUsd: input.effectiveCostUsd,
        actualCostKnownAssignments: input.actualCostKnownAssignments,
        usageKnownAssignments: input.usageKnownAssignments,
        conservativeUnknownBillingAssignments: input.conservativeUnknownBillingAssignments,
        manualCostReconciliationAssignments: input.manualCostReconciliationAssignments,
      } : batch);
      return {
        next: {
          ...ledger,
          usedFullQuestionCandidates: safeCounterAdd(ledger.usedFullQuestionCandidates, input.used, "used candidates", ledger.capFullQuestionCandidates),
          reservedFullQuestionCandidates: ledger.reservedFullQuestionCandidates - 2,
          modelCalls: safeCounterAdd(ledger.modelCalls, input.modelCalls, "model calls"),
          inputTokens: safeCounterAdd(ledger.inputTokens, input.inputTokens, "input tokens"),
          outputTokens: safeCounterAdd(ledger.outputTokens, input.outputTokens, "output tokens"),
          costUsd: addMoney(ledger.costUsd, input.effectiveCostUsd),
          lastUpdatedAtKst: kstNow(),
          batches,
        },
        value: undefined,
      };
    },
  });
  return outcome.cleanupWarningKinds;
}

function quarantineGlobalCandidateCapacity(input: RunLedgerSettlementV6): string[] {
  if (!input.globalCandidateQuarantineRequired) {
    throw new Error("global candidate quarantine requires observed cardinality drift or overflow");
  }
  const outcome = withExclusiveRepoJsonTransactionV6({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v6-global-quarantine",
    mutate(current) {
      const ledger = globalLedger(current);
      const matches = ledger.batches.filter((batch) => batch.batchId === GLOBAL_BATCH_ID);
      if (matches.length !== 1 || matches[0]!.status !== "RESERVED" || ledger.reservedFullQuestionCandidates < 2) {
        throw new Error("global pilot reservation cannot enter candidate quarantine exactly once");
      }
      if (!Number.isSafeInteger(input.used) || input.used < 1 ||
          !Number.isSafeInteger(input.modelCalls) || input.modelCalls < 1 || input.modelCalls > 2 ||
          !Number.isSafeInteger(input.observedFullQuestionCandidates) || input.observedFullQuestionCandidates < 0 ||
          !Number.isSafeInteger(input.candidateOverflowAssignments) || input.candidateOverflowAssignments < 0 ||
          !Number.isSafeInteger(input.choiceCardinalityDriftAssignments) || input.choiceCardinalityDriftAssignments < 0 ||
          !Number.isSafeInteger(input.choiceCardinalityShortageAssignments) || input.choiceCardinalityShortageAssignments < 0 ||
          !Number.isSafeInteger(input.choiceCardinalityExcessAssignments) || input.choiceCardinalityExcessAssignments < 0 ||
          !Number.isSafeInteger(input.candidateCardinalityAmbiguousAssignments) || input.candidateCardinalityAmbiguousAssignments < 0) {
        throw new Error("candidate quarantine settlement counts are invalid");
      }
      const quarantine = projectCandidateCapacityQuarantineV6({
        cap: ledger.capFullQuestionCandidates,
        currentUsed: ledger.usedFullQuestionCandidates,
        currentReserved: ledger.reservedFullQuestionCandidates,
        pilotReservation: 2,
        observedCandidateUnits: input.used,
      });
      const { usedIncrement, nextUsed, nextReserved, pilotQuarantineReservation } = quarantine;
      const batches = ledger.batches.map((batch) => batch.batchId === GLOBAL_BATCH_ID ? {
        ...batch,
        status: "QUARANTINED_GLOBAL_CANDIDATE_HALT_TERMINAL_NO_REPLAY",
        reservedFullQuestionCandidates: pilotQuarantineReservation,
        usedFullQuestionCandidates: usedIncrement,
        observedFullQuestionCandidates: input.observedFullQuestionCandidates,
        modelCalls: input.modelCalls,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        actualCostUsd: input.actualCostUsd,
        effectiveCostUsd: input.effectiveCostUsd,
        costUsd: input.effectiveCostUsd,
        actualCostKnownAssignments: input.actualCostKnownAssignments,
        usageKnownAssignments: input.usageKnownAssignments,
        conservativeUnknownBillingAssignments: input.conservativeUnknownBillingAssignments,
        manualCostReconciliationAssignments: input.manualCostReconciliationAssignments,
        candidateOverflowAssignments: input.candidateOverflowAssignments,
        choiceCardinalityDriftAssignments: input.choiceCardinalityDriftAssignments,
        choiceCardinalityShortageAssignments: input.choiceCardinalityShortageAssignments,
        choiceCardinalityExcessAssignments: input.choiceCardinalityExcessAssignments,
        candidateCardinalityAmbiguousAssignments: input.candidateCardinalityAmbiguousAssignments,
        globalCandidateQuarantineRequired: true,
        globallyEnforcedHalt: true,
      } : batch);
      return {
        next: {
          ...ledger,
          usedFullQuestionCandidates: nextUsed,
          reservedFullQuestionCandidates: nextReserved,
          modelCalls: safeCounterAdd(ledger.modelCalls, input.modelCalls, "model calls"),
          inputTokens: safeCounterAdd(ledger.inputTokens, input.inputTokens, "input tokens"),
          outputTokens: safeCounterAdd(ledger.outputTokens, input.outputTokens, "output tokens"),
          costUsd: addMoney(ledger.costUsd, input.effectiveCostUsd),
          lastUpdatedAtKst: kstNow(),
          batches,
          note: `${ledger.note} | GLOBAL_CANDIDATE_CAPACITY_QUARANTINED_NO_FURTHER_DISPATCH`,
        },
        value: undefined,
      };
    },
  });
  return outcome.cleanupWarningKinds;
}

function createPrivateState(runId: string): {
  runRoot: string;
  state: PrivateRunStateV6;
  append: (event: string, plan: PilotPlanV6 | null, details: JsonObject) => void;
  writeMarker: (name: string, value: JsonObject) => void;
  persistFinal: () => void;
} {
  if (!/^[a-z0-9][a-z0-9-]{7,80}$/u.test(runId)) throw new Error("runId is invalid");
  const runRoot = createExclusivePrivateRunDirectoryV6(runId);
  const journalPath = path.join(runRoot, "events.private.jsonl");
  const handle = openSync(journalPath, "wx", 0o600);
  closeSync(handle);
  const state: PrivateRunStateV6 = {
    schemaVersion: "question-quality-connectivity-pilot-private-run-v6",
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
    effectiveCostUsd: 0,
    actualCostKnownAssignments: 0,
    usageKnownAssignments: 0,
    manualCostReconciliationAssignments: 0,
    globalReservationCommitted: false,
    globalReservationCommitUnknown: false,
    globalSettlementSucceeded: false,
    globalSettlementCommitUnknown: false,
    assignments: [],
    charges: [],
    journalHeadHash: "0".repeat(64),
  };
  const writeMarker = (name: string, value: JsonObject) => {
    assertRealDirectoryV6(runRoot, "v6 private run directory before marker write");
    writeExclusiveDurablePrivateMarkerV6({ directory: runRoot, name, value });
  };
  writeMarker("private-reservation.private.json", {
    schemaVersion: "question-quality-connectivity-pilot-private-reservation-v6",
    runId,
    reservedCandidates: 2,
    noReplay: true,
    settlementFailureDisposition: "NO_REPLAY_MANUAL_RECONCILIATION",
    durableBeforeGlobalReservation: true,
  });
  let sequence = 0;
  const append = (event: string, plan: PilotPlanV6 | null, details: JsonObject) => {
    assertRealDirectoryV6(runRoot, "v6 private run directory before journal append");
    sequence += 1;
    const core = { sequence, at: new Date().toISOString(), event, plan, details, previousHash: state.journalHeadHash };
    const row: JournalEventV6 = { ...core, eventHash: sha256V6(stableJsonV6(core)) };
    appendFileSync(journalPath, `${JSON.stringify(row)}\n`, { encoding: "utf8", flush: true });
    state.journalHeadHash = row.eventHash;
  };
  const persistFinal = () => {
    assertRealDirectoryV6(runRoot, "v6 private run directory before final state write");
    writeExclusiveDurablePrivateMarkerV6({
      directory: runRoot,
      name: "state.private.json",
      value: state,
    });
  };
  return { runRoot, state, append, writeMarker, persistFinal };
}

function publicResult(protocol: ConnectivityPilotProtocolV6, state: PrivateRunStateV6): PublicConnectivityResultV6 {
  const evidence = state.assignments.map((row) => row.parserEvidence).filter(Boolean) as ParsedResponseEvidenceV6[];
  const usageEvidenceComplete = evidence.length === 2 && state.usageKnownAssignments === 2 &&
    evidence.every((row) => row.promptTokens > 0 && row.totalTokens === row.promptTokens + row.completionTokens);
  const routeEvidenceComplete = evidence.length === 2 && evidence.every((row) => Boolean(row.providerRequestId && row.servedModel && row.provider));
  const parserEvidenceComplete = evidence.length === 2 && evidence.every((row) => /^[a-f0-9]{64}$/u.test(row.parserEvidenceHash));
  const serialOrderComplete = state.assignments.length === 2 &&
    state.assignments[0]?.plan === "STANDARD" && state.assignments[1]?.plan === "PREMIUM";
  const complete = state.successfulAssignments === 2 && state.settledAssignments === 2 &&
    state.candidateOpportunitiesConsumed === 2 && state.physicalFetches === 2 && state.completionsRequested === 2 &&
    state.actualCostKnownAssignments === 2 && usageEvidenceComplete && routeEvidenceComplete &&
    parserEvidenceComplete && serialOrderComplete && state.globalSettlementSucceeded &&
    state.effectiveCostUsd <= protocol.durableBounds.sharedCostCapUsd + 1e-12;
  const core = {
    schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v6" as const,
    status: complete ? "COMPLETED_BOUNDED_CONNECTIVITY_PILOT" as const : "TERMINAL_PARTIAL_OR_FAILED" as const,
    startedAssignments: state.assignments.length,
    settledAssignments: state.settledAssignments,
    successfulAssignments: state.successfulAssignments,
    candidateOpportunitiesConsumed: state.candidateOpportunitiesConsumed,
    physicalFetches: state.physicalFetches,
    completionsRequested: state.completionsRequested,
    actualCostUsd: state.actualCostUsd,
    effectiveCostUsd: state.effectiveCostUsd,
    actualCostKnownAssignments: state.actualCostKnownAssignments,
    usageEvidenceComplete,
    routeEvidenceComplete,
    parserEvidenceComplete,
    serialOrderComplete,
    globalReservationBound: state.globalReservationCommitted && state.globalSettlementSucceeded,
  };
  return { ...core, executionArtifactSha256: sha256V6(stableJsonV6({ ...core, journalHeadHash: state.journalHeadHash })) };
}

function authorizationHeader(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("OpenRouter credential unavailable");
  return `Bearer ${key}`;
}

async function executeOne(input: {
  assignment: AssignmentV6;
  wire: ExactWireRowV6;
  expectedProvider: string;
  allowedServedModels: readonly string[];
  allowedFinishReasons: readonly ["stop"];
  run: ReturnType<typeof createPrivateState>;
}): Promise<boolean> {
  const { assignment, wire, run } = input;
  const header = authorizationHeader();
  run.append("ASSIGNMENT_WILL_DEBIT_AND_SEND", assignment.plan, {
    ordinal: assignment.ordinal,
    candidateOpportunity: 1,
    physicalFetch: 1,
    completion: 1,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    wireBodySha256: assignment.exactWireBodySha256,
    replayAllowed: false,
  });
  const assignmentState: JsonObject = {
    ordinal: assignment.ordinal,
    plan: assignment.plan,
    requestedModel: assignment.modelId,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    state: "UNKNOWN_AFTER_SEND_TERMINAL_UNTIL_RECONCILED",
    wireBodySha256: assignment.exactWireBodySha256,
  };
  run.state.assignments.push(assignmentState);
  run.state.candidateOpportunitiesConsumed += 1;
  run.state.physicalFetches += 1;
  run.state.completionsRequested += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("CONNECTIVITY_PILOT_TIMEOUT")), assignment.timeoutMs);
  let rawText = "";
  let parserEvidence: ParsedResponseEvidenceV6 | null = null;
  let terminalError: unknown = null;
  let dispatchAttempted = false;
  let responseBodyObservationComplete = false;
  try {
    dispatchAttempted = true;
    const response = await directNetworkFetchV6(ENDPOINT, {
      method: "POST",
      headers: { authorization: header, "content-type": "application/json", accept: "application/json" },
      body: wire.bodyText,
      redirect: "error",
      signal: controller.signal,
    });
    const boundedBody = await readBoundedUtf8ResponseBodyV6({
      response,
      maximumBytes: MODEL_RESPONSE_BODY_MAX_BYTES_V6,
      label: `${assignment.plan} model response`,
    });
    rawText = boundedBody.text;
    responseBodyObservationComplete = true;
    assertRealDirectoryV6(run.runRoot, "v6 private run directory before raw response write");
    const responsePath = path.join(run.runRoot, `${assignment.ordinal}-${assignment.plan.toLowerCase()}-response.private.json`);
    const responseHandle = openSync(responsePath, "wx", 0o600);
    try {
      writeFileSync(responseHandle, rawText, "utf8");
      fsyncSync(responseHandle);
    } finally {
      closeSync(responseHandle);
    }
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    parserEvidence = parseConnectivityResponseV6({
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
    if (parserEvidence.actualCostUsd > assignment.calculatedWorstCaseUsdCap + 1e-12) {
      throw new Error("actual cost exceeded frozen assignment cap");
    }
  } catch (error) {
    terminalError = error;
  } finally {
    clearTimeout(timer);
    const reconciledCharge = constructPostSendChargeFailClosedV6({
      ordinal: assignment.ordinal,
      plan: assignment.plan,
      reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
      constructPrimaryCharge() {
        const billing = extractConnectivityBillingEvidenceV6(rawText);
        const candidateObservation = observeRawCandidateCardinalityV6(rawText);
        return buildAssignmentChargeV6({
          ordinal: assignment.ordinal,
          plan: assignment.plan,
          reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
          billing,
          candidateObservation,
          responseCandidateCardinalityUnobservableAfterSend: dispatchAttempted && !responseBodyObservationComplete,
        });
      },
    });
    const charge = reconciledCharge.charge;
    if (reconciledCharge.constructionError !== null) {
      terminalError = terminalError === null
        ? reconciledCharge.constructionError
        : new AggregateError([terminalError, reconciledCharge.constructionError],
          "provider terminal failure and post-send charge construction failure");
    }
    run.state.charges.push(charge);
    run.state.settledAssignments += 1;
    run.state.actualCostUsd = addMoney(run.state.actualCostUsd, charge.actualCostUsd ?? 0);
    run.state.effectiveCostUsd = addMoney(run.state.effectiveCostUsd, charge.effectiveCostUsd);
    if (charge.actualKnown) run.state.actualCostKnownAssignments += 1;
    if (charge.usageKnown) run.state.usageKnownAssignments += 1;
    if (charge.manualCostReconciliationRequired) run.state.manualCostReconciliationAssignments += 1;
    assignmentState.actualKnown = charge.actualKnown;
    assignmentState.usageKnown = charge.usageKnown;
    assignmentState.actualCostUsd = charge.actualCostUsd;
    assignmentState.effectiveCostUsd = charge.effectiveCostUsd;
    assignmentState.billingEvidenceHash = charge.billingEvidenceHash;
    assignmentState.conservativeUnknownBilling = charge.conservativeUnknownBilling;
    assignmentState.manualCostReconciliationRequired = charge.manualCostReconciliationRequired;
    assignmentState.explicitPositiveCostEvidenceHash = charge.explicitPositiveCostEvidenceHash;
    assignmentState.provisionalReservedCostPendingManualReconciliation = charge.provisionalReservedCostPendingManualReconciliation;
    assignmentState.observedFullQuestionCandidates = charge.observedFullQuestionCandidates;
    assignmentState.candidateUnitsEffective = charge.candidateUnitsEffective;
    assignmentState.choiceCardinalityDrift = charge.choiceCardinalityDrift;
    assignmentState.choiceCardinalityShortage = charge.choiceCardinalityShortage;
    assignmentState.choiceCardinalityExcess = charge.choiceCardinalityExcess;
    assignmentState.candidateCardinalityAmbiguous = charge.candidateCardinalityAmbiguous;
    assignmentState.responseCandidateCardinalityUnobservableAfterSend =
      charge.responseCandidateCardinalityUnobservableAfterSend;
    assignmentState.candidateOverflow = charge.candidateOverflow;
    assignmentState.globalCandidateQuarantineRequired = charge.globalCandidateQuarantineRequired;
    assignmentState.candidateObservationEvidenceHash = charge.candidateObservationEvidenceHash;
    if (terminalError === null && parserEvidence) {
      assignmentState.state = "SUCCESS_TERMINAL";
      assignmentState.parserEvidence = parserEvidence;
      run.state.successfulAssignments += 1;
      run.append("ASSIGNMENT_SUCCESS_TERMINAL_RECONCILED", assignment.plan, {
        providerRequestIdSha256: sha256V6(parserEvidence.providerRequestId),
        servedModelSha256: sha256V6(parserEvidence.servedModel),
        providerSha256: sha256V6(parserEvidence.provider),
        parserEvidenceHash: parserEvidence.parserEvidenceHash,
        questionHash: parserEvidence.questionHash,
        billingEvidenceHash: charge.billingEvidenceHash,
        actualKnown: charge.actualKnown,
        usageKnown: charge.usageKnown,
        actualCostUsd: charge.actualCostUsd,
        effectiveCostUsd: charge.effectiveCostUsd,
        replayAllowed: false,
      });
    } else {
      assignmentState.state = "FAILED_OR_UNKNOWN_AFTER_SEND_TERMINAL_RECONCILED";
      assignmentState.failureClass = controller.signal.aborted ? "TIMEOUT" : "HTTP_SCHEMA_PARSER_COST_OR_UNKNOWN";
      assignmentState.failureMessageSha256 = sha256V6(terminalError instanceof Error ? terminalError.message : String(terminalError));
      run.append("ASSIGNMENT_FAILED_OR_UNKNOWN_TERMINAL_RECONCILED", assignment.plan, {
        failureClass: assignmentState.failureClass,
        failureMessageSha256: assignmentState.failureMessageSha256,
        rawResponseCaptured: rawText.length > 0,
        billingEvidenceHash: charge.billingEvidenceHash,
        actualKnown: charge.actualKnown,
        usageKnown: charge.usageKnown,
        actualCostUsd: charge.actualCostUsd,
        effectiveCostUsd: charge.effectiveCostUsd,
        conservativeUnknownBilling: charge.conservativeUnknownBilling,
        manualCostReconciliationRequired: charge.manualCostReconciliationRequired,
        replayAllowed: false,
      });
    }
  }
  return terminalError === null && parserEvidence !== null;
}

export async function runSealedConnectivityPilotV6(input: {
  runId: string;
  priceSnapshotPath: string;
  priceSnapshotFileSha256: string;
  priceSnapshotBundleSha256: string;
}): Promise<PublicConnectivityResultV6> {
  assertAuthorFreezePermanentlyNoDispatchV6();
  assertParentDirectoryDurabilityPlatformSupportedV6();
  const loaded = exactWire();
  const frozenReference = frozenRuntimeReferenceFromProtocolV6(loaded.protocol);
  assertFrozenRuntimeEntrypointV6({
    repoRoot: path.resolve(livePackageRootV6, "../../../.."),
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "LIVE_CHILD",
    currentModulePath: fileURLToPath(import.meta.url),
  });
  assertAuthorized(loaded.protocol);
  const snapshot = validateFreshPriceSnapshot(
    loaded.protocol,
    input.priceSnapshotPath,
    input.priceSnapshotFileSha256,
    input.priceSnapshotBundleSha256,
  );
  const run = createPrivateState(input.runId);
  let primaryError: unknown = null;
  let reconciliationError: unknown = null;
  try {
    const reserveCleanupWarnings = reserveGlobalTwo();
    run.state.globalReservationCommitted = true;
    run.append("DUAL_RESERVATION_COMMITTED", null, {
      globalCandidateReservation: 2,
      privateCandidateReservation: 2,
      globalLedgerPathSha256: sha256V6(GLOBAL_LEDGER_PATH),
      replayAllowed: false,
      postCommitCleanupWarningKinds: reserveCleanupWarnings,
    });
    if (reserveCleanupWarnings.length > 0) {
      throw new Error("global reservation committed with lock cleanup warning; no provider dispatch allowed");
    }
    for (let index = 0; index < loaded.protocol.durableBounds.assignments.length; index += 1) {
      const assignment = loaded.protocol.durableBounds.assignments[index]!;
      const wire = loaded.artifact.rows[index]!;
      const price = priceEvidenceForModelV6(snapshot, assignment.modelId);
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
  } catch (error) {
    if (error instanceof RepoJsonTransactionCommitUnknownErrorV6) {
      run.state.globalReservationCommitUnknown = true;
      run.state.status = "GLOBAL_RESERVATION_COMMIT_UNKNOWN_NO_DISPATCH_NO_REPLAY_MANUAL_RECONCILIATION";
      try {
        run.append("GLOBAL_RESERVATION_COMMIT_UNKNOWN_NO_DISPATCH", null, {
          transactionMutationState: error.transactionMutationState,
          stage: error.stage,
          disposition: error.disposition,
          retryAllowed: false,
          replayAllowed: false,
          providerDispatchAllowed: false,
        });
      } catch {
        // The final private state remains the authoritative most-accurate disposition.
      }
    }
    primaryError = error;
  } finally {
    while (run.state.charges.length < run.state.physicalFetches) {
      const ordinal = (run.state.charges.length + 1) as 1 | 2;
      const assignment = loaded.protocol.durableBounds.assignments[ordinal - 1]!;
      const missingCharge = buildFailClosedPostSendChargeV6({
        ordinal,
        plan: assignment.plan,
        reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
        failure: primaryError ?? new Error("sent assignment escaped without a terminal charge"),
      });
      run.state.charges.push(missingCharge);
      run.state.settledAssignments += 1;
      run.state.effectiveCostUsd = addMoney(run.state.effectiveCostUsd, missingCharge.effectiveCostUsd);
      run.state.manualCostReconciliationAssignments += 1;
      primaryError = primaryError === null
        ? new Error("sent assignment required synthesized fail-closed charge")
        : primaryError;
    }
    const settlement = buildRunLedgerSettlementForDispatchV6({
      charges: run.state.charges,
      physicalFetches: run.state.physicalFetches,
      candidateOpportunitiesConsumed: run.state.candidateOpportunitiesConsumed,
    });
    run.state.terminal = true;
    if (!run.state.globalReservationCommitUnknown) {
      run.state.status = run.state.successfulAssignments === 2
        ? "TERMINAL_PENDING_GLOBAL_RECONCILIATION"
        : "FAILED_OR_UNKNOWN_TERMINAL_PENDING_GLOBAL_RECONCILIATION";
    }
    let intent: JsonObject | null = null;
    if (run.state.globalReservationCommitUnknown) {
      // Atomic replacement may have happened. Provider dispatch, reservation
      // replay, settlement guessing, and automatic retry are all forbidden.
    } else if (run.state.globalReservationCommitted) {
      intent = buildTerminalReconciliationIntentV6({
        runId: run.state.runId,
        journalHeadHash: run.state.journalHeadHash,
        settlement,
        status: run.state.status,
      });
      let settlementError: unknown = null;
      let settlementCleanupWarnings: string[] = [];
      try {
        settlementCleanupWarnings = commitGlobalSettlementAfterDurableIntentV6({
          persistIntent: () => run.writeMarker("terminal-reconciliation-intent.private.json", intent!),
          globalCandidateQuarantineRequired: settlement.globalCandidateQuarantineRequired,
          settle: () => settleGlobal(settlement),
          quarantine: () => quarantineGlobalCandidateCapacity(settlement),
        });
      } catch (error) {
        if (error instanceof TerminalIntentNotDurableErrorV6) {
          reconciliationError = error;
          run.state.status = "TERMINAL_INTENT_NOT_DURABLE_GLOBAL_RESERVED_NO_REPLAY_MANUAL_INTERVENTION";
        } else if (error instanceof RepoJsonTransactionCommitUnknownErrorV6) {
          reconciliationError = error;
          run.state.globalSettlementCommitUnknown = true;
          run.state.status = "GLOBAL_SETTLEMENT_COMMIT_UNKNOWN_TERMINAL_NO_REPLAY_MANUAL_RECONCILIATION";
        } else {
          settlementError = error;
        }
      }
      if (reconciliationError instanceof TerminalIntentNotDurableErrorV6) {
        // Deliberately leave the global batch RESERVED. The earlier private
        // reservation marker and exclusive run directory forbid replay; an
        // operator must reconcile this run manually.
      } else if (run.state.globalSettlementCommitUnknown) {
        const error = reconciliationError as RepoJsonTransactionCommitUnknownErrorV6;
        try {
          run.writeMarker("global-settlement-commit-unknown.private.json", {
            schemaVersion: "question-quality-connectivity-pilot-global-settlement-commit-unknown-v6",
            noReplay: true,
            retryAllowed: false,
            manualReconciliationRequired: true,
            transactionMutationState: error.transactionMutationState,
            stage: error.stage,
            intentSha256: typeof intent?.intentSha256 === "string" ? intent.intentSha256 : "0".repeat(64),
            settlement,
          });
        } catch (markerError) {
          reconciliationError = new AggregateError(
            [error, markerError],
            "global settlement commit state and its private evidence marker are both uncertain",
          );
        }
      } else if (settlementError !== null) {
        const error = settlementError;
        reconciliationError = error;
        run.state.status = "GLOBAL_SETTLEMENT_FAILED_TERMINAL_NO_REPLAY_MANUAL_RECONCILIATION";
        const failure = buildSettlementFailureEvidenceV6({
          intentSha256: typeof intent?.intentSha256 === "string" ? intent.intentSha256 : "0".repeat(64),
          settlement,
          error,
        });
        try {
          run.writeMarker("terminal-reconciliation-failure.private.json", failure);
        } catch (markerError) {
          reconciliationError = new AggregateError([error, markerError], "global settlement and no-replay evidence write both failed");
        }
      } else {
        run.state.globalSettlementSucceeded = true;
        run.state.status = settlement.globalCandidateQuarantineRequired
          ? "GLOBAL_CANDIDATE_CAPACITY_QUARANTINED_TERMINAL_NO_REPLAY"
          : settlementCleanupWarnings.length > 0
            ? "GLOBAL_SETTLED_LOCK_CLEANUP_WARNING_TERMINAL_NO_REPLAY"
          : run.state.successfulAssignments === 2 ? "COMPLETED_TERMINAL" : "FAILED_OR_UNKNOWN_TERMINAL";
        try {
          run.writeMarker("terminal-reconciliation-success.private.json", {
            schemaVersion: "question-quality-connectivity-pilot-terminal-reconciliation-success-v6",
            noReplay: true,
            intentSha256: intent?.intentSha256 ?? null,
            settlement,
            postCommitCleanupWarningKinds: settlementCleanupWarnings,
          });
          if (settlementCleanupWarnings.length > 0) {
            reconciliationError = new Error("global settlement committed with lock cleanup warning");
          }
        } catch (error) {
          reconciliationError = error;
          run.state.status = "GLOBAL_SETTLED_SUCCESS_MARKER_FAILED_TERMINAL_NO_REPLAY";
          const postSettlementFailure = buildPostSettlementMarkerFailureEvidenceV6({
            intentSha256: typeof intent?.intentSha256 === "string" ? intent.intentSha256 : "0".repeat(64),
            settlement,
            error,
          });
          try {
            run.writeMarker("post-settlement-marker-failure.private.json", postSettlementFailure);
          } catch (markerError) {
            reconciliationError = new AggregateError(
              [error, markerError],
              "global settlement succeeded but both success and post-settlement evidence writes failed",
            );
          }
        }
      }
    } else {
      run.state.status = "GLOBAL_RESERVATION_NOT_COMMITTED_TERMINAL";
    }
    try {
      run.append("RUN_TERMINAL_NO_REPLAY", null, {
        status: run.state.status,
        candidateOpportunitiesConsumed: run.state.candidateOpportunitiesConsumed,
        physicalFetches: run.state.physicalFetches,
        completionsRequested: run.state.completionsRequested,
        successfulAssignments: run.state.successfulAssignments,
        actualCostKnownAssignments: run.state.actualCostKnownAssignments,
        manualCostReconciliationAssignments: run.state.manualCostReconciliationAssignments,
        actualCostUsd: run.state.actualCostUsd,
        effectiveCostUsd: run.state.effectiveCostUsd,
        globalSettlementSucceeded: run.state.globalSettlementSucceeded,
        globalReservationCommitUnknown: run.state.globalReservationCommitUnknown,
        globalSettlementCommitUnknown: run.state.globalSettlementCommitUnknown,
        replayAllowed: false,
      });
    } catch (error) {
      primaryError ??= error;
    }
    try {
      run.persistFinal();
    } catch (error) {
      primaryError ??= error;
    }
  }
  if (reconciliationError) throw reconciliationError;
  if (primaryError) throw primaryError;
  return publicResult(loaded.protocol, run.state);
}
