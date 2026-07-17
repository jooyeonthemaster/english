import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DurableAtlasResearchController,
  deriveAtlasControllerPricingSnapshotProof,
  sealAtlasControllerAssignmentContract,
  sealAtlasControllerPricingContract,
  sealAtlasControllerRegistry,
  sealAtlasControllerRollingPricingAttestation,
  validateAtlasControllerSchemaV2RouterMetadata,
  type AtlasControllerRegistry,
  type AtlasControllerRollingPricingAttestation,
} from "../../harness/atlas-controller";
import type { BudgetStore, ControllerAssignmentRecoveryView } from "../../harness/ledger";
import { createS1OpenRouterQuestionParser } from "../campaign-v6-s1-durable-controller-v1/openrouter-question-parser";
import {
  createAtlasResearchFetchDispatcher,
  installAtlasResearchFetchController,
  runWithAtlasResearchScope,
  type AtlasResearchLeaseRequest,
  type AtlasResearchProvenance,
  type AtlasResearchScope,
  type AtlasResearchWireRequestFacts,
} from "@/lib/atlas-research-fetch-boundary";
import {
  validateConnectivityPilotProtocolV2,
  validatePilotPublicResultShape,
  validatePricingSnapshotV2,
  type ConnectivityPilotProtocolV2 as ProtocolV2,
  type JsonRecord,
  type PilotPlan as Plan,
} from "./protocol-schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocolPath = path.join(here, "protocol-v2.json");
const privateExactWirePath = path.join(here, "private/exact-wire-v2.private.json");
const publicExactWirePath = path.join(here, "offline-exact-wire-seal-v2.json");
const parserPath = path.join(
  repoRoot,
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
);

const SHA256 = /^[a-f0-9]{64}$/u;
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const EXACT_TAG = "google-vertex/global";
const EXPERIMENT_ID = "question-quality-20260715";
const PHASE_ID = "connectivity-pilot-v2";
const BATCH_ID = "ocvp-two-call-v2";
const CAMPAIGN_ID = "question-quality-20260715-connectivity-pilot-v2";
const PARSER_ID = "ocvp-openrouter-question-parser-v2";
const TEST_MODE_ENV = "QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST_MODE";
const LIVE_CHILD_ENV = "QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD";
type FetchDelegate = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PilotExactWireRow {
  ordinal: 1 | 2;
  plan: Plan;
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

interface PilotExactWirePrivateArtifact {
  schemaVersion: string;
  status: string;
  source: {
    protocolV1Sha256: string;
    protocolV2AuthoritySemanticSha256: string;
    publicCorpusSha256: string;
    privateCorpusArtifactSha256: string;
    passageSha256: string;
  };
  sourceClosureSha256: string;
  sourceClosure: Array<{ path: string; bytes: number; sha256: string }>;
  gitVersion: string;
  rows: PilotExactWireRow[];
  privateSemanticSha256: string;
}

export interface PilotMaterializedAssignment {
  ordinal: 1 | 2;
  plan: Plan;
  assignmentId: string;
  operationId: string;
  contractId: string;
  entryId: string;
  transitionId: string;
  bodyText: string;
  provenance: AtlasResearchProvenance;
  registry: Readonly<AtlasControllerRegistry>;
  reservedCostUsd: number;
  timeoutMs: number;
  expectedProvider: string;
  allowedServedModels: readonly string[];
}

export interface PilotMaterializedExecution {
  schemaVersion: "question-quality-v6-connectivity-pilot-materialized-v2";
  campaignId: typeof CAMPAIGN_ID;
  experimentId: typeof EXPERIMENT_ID;
  phaseId: typeof PHASE_ID;
  batchId: typeof BATCH_ID;
  protocolSha256: string;
  exactWirePrivateArtifactSha256: string;
  durableBatchIdentitySha256: string;
  parserArtifactSha256: string;
  archivedPriceSnapshotId: string;
  archivedPriceSnapshot: unknown;
  initialRollingPricingAttestation: Readonly<AtlasControllerRollingPricingAttestation>;
  assignments: PilotMaterializedAssignment[];
  globalCandidateCap: 2;
  globalPhysicalFetchCap: 2;
  globalCostCapUsd: number;
  experimentRegistryPhase: {
    id: typeof PHASE_ID;
    apiCandidateBudget: 2;
    maxPhysicalProviderCalls: 2;
    maxCostUsd: number;
  };
}

export interface PilotPublicResult {
  schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v2";
  status: "PARTIAL_OR_BLOCKED" | "COMPLETED_BOUNDED_CONNECTIVITY_PILOT";
  startedAssignments: number;
  settledAssignments: number;
  successfulAssignments: number;
  candidateOpportunitiesConsumed: number;
  physicalFetches: number;
  actualCostUsd: number;
  effectiveCostUsd: number;
  usageEvidenceComplete: boolean;
  routeEvidenceComplete: boolean;
  parserEvidenceComplete: boolean;
  batchBreached: boolean;
  auditHeadHash: string;
  executionArtifactSha256: string;
}

const permitBrand = Symbol("connectivity-pilot-offline-test-permit");
export interface PilotOfflineTestPermit {
  readonly mode: "OFFLINE_INJECTED_TRANSPORT_TEST_ONLY";
  readonly materializedIdentitySha256: string;
  readonly [permitBrand]: true;
}

const offlineTransportBrand = Symbol("connectivity-pilot-offline-transport");
export interface PilotOfflineTransportCapability {
  readonly mode: "OFFLINE_INJECTED_TRANSPORT_TEST_ONLY";
  readonly [offlineTransportBrand]: true;
  readonly delegate: FetchDelegate;
}

const liveCredentialBrand = Symbol("connectivity-pilot-live-child-credential");
export interface PilotLiveCredentialCapability {
  readonly sourceEnvironmentName: "OPENROUTER_API_KEY";
  readonly [liveCredentialBrand]: true;
  withAuthorizationHeader<T>(fn: (headerValue: string) => T | Promise<T>): Promise<T>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function deepFreezePilot<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as JsonRecord)) deepFreezePilot(child, seen);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactRecordKeys(value: unknown, label: string, expected: readonly string[]): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (stableJson(actual) !== stableJson(keys)) {
    throw new Error(`${label} has unknown or missing keys`);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} is invalid`);
}

export function computePilotConservativeCostUsd(input: {
  bodyUtf8Bytes: number;
  maxOutputTokens: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  serverTokenOverheadUpperBound: number;
  safetyMultiplier: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be positive and finite`);
    }
  }
  const raw = (
    (input.bodyUtf8Bytes + input.serverTokenOverheadUpperBound) * input.inputUsdPer1M +
    input.maxOutputTokens * input.outputUsdPer1M
  ) / 1_000_000;
  return Math.ceil(raw * input.safetyMultiplier * 1e9) / 1e9;
}

function parseBodyFacts(row: PilotExactWireRow): AtlasResearchWireRequestFacts {
  const body = JSON.parse(row.bodyText) as JsonRecord;
  const responseFormat = body.response_format;
  if (!isRecord(responseFormat) || responseFormat.type !== "json_schema") {
    throw new Error("sealed pilot body lacks strict response format");
  }
  const jsonSchema = responseFormat.json_schema;
  if (!isRecord(jsonSchema) || jsonSchema.strict !== true || !isRecord(jsonSchema.schema)) {
    throw new Error("sealed pilot body lacks strict JSON schema");
  }
  const schema = jsonSchema.schema;
  const properties = schema.properties;
  const questions = isRecord(properties) ? properties.questions : null;
  if (!isRecord(questions) || questions.minItems !== 1 || questions.maxItems !== 1) {
    throw new Error("sealed pilot schema is not structurally one-question");
  }
  const promptSurface = {
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  };
  const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => typeof value === "number");
  if (tokenCaps.length !== 1 || tokenCaps[0] !== row.maxOutputTokens) {
    throw new Error("sealed pilot body token cap drifted");
  }
  const endpointUrl = new URL(row.endpoint);
  return {
    method: "POST",
    endpointOrigin: endpointUrl.origin,
    endpointPath: endpointUrl.pathname,
    endpointHash: sha256(row.endpoint),
    wireBodyHash: sha256(row.bodyText),
    requestBodyUtf8Bytes: Buffer.byteLength(row.bodyText, "utf8"),
    canonicalRequestHash: sha256(stableJson({ method: "POST", endpoint: row.endpoint, body })),
    wirePromptHash: sha256(stableJson(promptSurface)),
    wireSchemaHash: sha256(stableJson(schema)),
    model: String(body.model),
    completionCount: body.n === undefined ? 1 : Number(body.n),
    stream: false,
    outputShape: "json-schema-object",
    structurallyFixedOutputsPerCompletion: 1,
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
    maxCompletionTokens:
      typeof body.max_completion_tokens === "number" ? body.max_completion_tokens : null,
    maxOutputTokens: typeof body.max_output_tokens === "number" ? body.max_output_tokens : null,
  };
}

function validateProtocolAndExactWire(): {
  protocol: ProtocolV2;
  protocolSha256: string;
  artifact: PilotExactWirePrivateArtifact;
  artifactSha256: string;
} {
  const protocolBytes = readFileSync(protocolPath);
  const protocolSha256 = sha256(protocolBytes);
  const protocol = validateConnectivityPilotProtocolV2(
    JSON.parse(protocolBytes.toString("utf8")) as unknown,
  );
  if (
    sha256(readFileSync(publicExactWirePath)) !== protocol.exactWireSeal.publicArtifactSha256 ||
    sha256(readFileSync(privateExactWirePath)) !== protocol.exactWireSeal.privateArtifactSha256
  ) {
    throw new Error("pilot exact-wire artifacts differ from protocol commitments");
  }
  const artifactBytes = readFileSync(privateExactWirePath);
  const artifactSha256 = sha256(artifactBytes);
  const artifact = JSON.parse(artifactBytes.toString("utf8")) as PilotExactWirePrivateArtifact;
  assertExactRecordKeys(artifact, "pilot private exact-wire artifact", [
    "schemaVersion", "status", "confidentiality", "source", "sourceClosure",
    "sourceClosureSha256", "gitVersion", "fixedProductionInput", "rows", "safety",
    "privateSemanticSha256",
  ]);
  assertExactRecordKeys(artifact.source, "pilot private exact-wire source", [
    "protocolV1Sha256", "protocolV2AuthoritySemanticSha256", "publicCorpusSha256",
    "privateCorpusArtifactSha256", "passageSha256",
  ]);
  for (const [index, row] of artifact.rows.entries()) {
    assertExactRecordKeys(row, `pilot exact-wire row ${index}`, [
      "ordinal", "plan", "modelId", "endpoint", "bodyText", "bodySha256", "bodyUtf8Bytes",
      "promptSha256", "schemaSha256", "requestEnvelopeSha256", "profileArtifactSha256",
      "gateArtifactSha256", "policyArtifactSha256", "maxOutputTokens", "completionCount",
      "candidateOutputsPerCompletion",
    ]);
  }
  if (
    artifact.schemaVersion !== "question-quality-v6-connectivity-pilot-exact-wire-private-v2" ||
    artifact.status !== "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_EXECUTION_BLOCKED" ||
    artifact.rows.length !== 2
  ) {
    throw new Error("pilot private exact-wire artifact is malformed");
  }
  const { privateSemanticSha256, ...privateCore } = artifact;
  assertHash(privateSemanticSha256, "privateSemanticSha256");
  if (sha256(stableJson(privateCore)) !== privateSemanticSha256) {
    throw new Error("pilot private semantic commitment is invalid");
  }
  if (
    artifact.source.protocolV2AuthoritySemanticSha256 !==
      protocol.authorityCommitment.authoritySemanticSha256 ||
    artifact.source.protocolV1Sha256 !== protocol.authorityCommitment.originalProtocolV1Sha256 ||
    artifact.source.publicCorpusSha256 !== protocol.authorityCommitment.originalPublicCorpusSha256
  ) {
    throw new Error("pilot exact-wire source authority differs from protocol-v2");
  }
  const publicArtifact = JSON.parse(readFileSync(publicExactWirePath, "utf8")) as JsonRecord;
  assertExactRecordKeys(publicArtifact, "pilot public exact-wire artifact", [
    "schemaVersion", "status", "originalProtocolSha256", "protocolV2AuthoritySemanticSha256",
    "publicCorpusSha256", "privateArtifactSha256", "sourceClosureSha256", "counts", "wire",
    "privacy", "safety", "executionHolds", "publicSemanticSha256",
  ]);
  const publicSemantic = publicArtifact.publicSemanticSha256;
  assertHash(publicSemantic, "publicSemanticSha256");
  const publicCore = { ...publicArtifact };
  delete publicCore.publicSemanticSha256;
  if (sha256(stableJson(publicCore)) !== publicSemantic) {
    throw new Error("pilot public exact-wire semantic commitment is invalid");
  }
  const allowedControllerFreezePaths = new Set([
    "experiments/question-quality-20260715/harness/atlas-controller.ts",
    "experiments/question-quality-20260715/harness/ledger.ts",
    "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
    "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256",
  ]);
  if (
    protocol.controllerSourceFreeze.files.length !== allowedControllerFreezePaths.size ||
    protocol.controllerSourceFreeze.files.some((file) => !allowedControllerFreezePaths.has(file.path))
  ) {
    throw new Error("pilot controller source freeze path set drifted");
  }
  for (const file of protocol.controllerSourceFreeze.files) {
    const absolute = path.resolve(repoRoot, file.path);
    const relative = path.relative(repoRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative) || sha256(readFileSync(absolute)) !== file.sha256) {
      throw new Error(`pilot controller source freeze differs at ${file.path}`);
    }
  }
  if (
    !Array.isArray(artifact.sourceClosure) ||
    sha256(stableJson(artifact.sourceClosure)) !== artifact.sourceClosureSha256
  ) {
    throw new Error("pilot exact-wire source closure commitment is invalid");
  }
  for (const source of artifact.sourceClosure) {
    if (!source || typeof source.path !== "string" || typeof source.bytes !== "number") {
      throw new Error("pilot exact-wire source closure row is malformed");
    }
    const absolute = path.resolve(repoRoot, source.path);
    const relative = path.relative(repoRoot, absolute);
    const bytes = readFileSync(absolute);
    if (
      relative.startsWith("..") || path.isAbsolute(relative) ||
      bytes.byteLength !== source.bytes || sha256(bytes) !== source.sha256
    ) {
      throw new Error(`pilot exact-wire source closure differs at ${source.path}`);
    }
  }
  if (
    protocol.exactProviderContract.endpoint !== ENDPOINT ||
    protocol.exactProviderContract.endpointTag !== EXACT_TAG ||
    protocol.exactProviderContract.completionCount !== 1 ||
    protocol.exactProviderContract.semanticCandidateMaximum !== 1 ||
    protocol.pricingAmendment.silentUnderReservationAllowed !== false ||
    protocol.pricingAmendment.assignments.length !== 2 ||
    protocol.durableBounds.sharedBatchCandidateOpportunityCap !== 2 ||
    protocol.durableBounds.sharedBatchPhysicalFetchCap !== 2 ||
    protocol.durableBounds.concurrency !== 1 ||
    stableJson(protocol.durableBounds.serialOrder) !== stableJson(["STANDARD", "PREMIUM"]) ||
    protocol.durableBounds.retryAllowed !== false ||
    protocol.durableBounds.repairAllowed !== false ||
    protocol.durableBounds.fallbackAllowed !== false ||
    protocol.durableBounds.replacementAllowed !== false ||
    protocol.durableBounds.topUpAllowed !== false
  ) {
    throw new Error("pilot v2 bounds or route drifted");
  }
  const sortedRows = [...artifact.rows].sort((left, right) => left.ordinal - right.ordinal);
  const sortedProtocol = [...protocol.pricingAmendment.assignments]
    .sort((left, right) => left.ordinal - right.ordinal);
  if (stableJson(sortedRows.map((row) => row.plan)) !== stableJson(["STANDARD", "PREMIUM"])) {
    throw new Error("pilot exact-wire serial order drifted");
  }
  let summedCost = 0;
  for (let index = 0; index < sortedRows.length; index += 1) {
    const row = sortedRows[index]!;
    const price = sortedProtocol[index]!;
    assertHash(row.bodySha256, "bodySha256");
    for (const [label, hash] of [
      ["promptSha256", row.promptSha256],
      ["schemaSha256", row.schemaSha256],
      ["requestEnvelopeSha256", row.requestEnvelopeSha256],
      ["profileArtifactSha256", row.profileArtifactSha256],
      ["gateArtifactSha256", row.gateArtifactSha256],
      ["policyArtifactSha256", row.policyArtifactSha256],
    ] as const) assertHash(hash, label);
    if (
      row.ordinal !== price.ordinal ||
      row.plan !== price.plan ||
      row.modelId !== price.modelId ||
      row.endpoint !== ENDPOINT ||
      row.bodySha256 !== sha256(row.bodyText) ||
      row.bodyUtf8Bytes !== Buffer.byteLength(row.bodyText, "utf8") ||
      row.bodyUtf8Bytes !== price.exactWireBodyUtf8Bytes ||
      row.maxOutputTokens !== 4000 ||
      row.completionCount !== 1 ||
      row.candidateOutputsPerCompletion !== 1
    ) {
      throw new Error("pilot exact-wire row differs from its protocol amendment");
    }
    const facts = parseBodyFacts(row);
    const body = JSON.parse(row.bodyText) as JsonRecord;
    if (
      facts.model !== row.modelId ||
      facts.wireBodyHash !== row.bodySha256 ||
      facts.wirePromptHash !== row.promptSha256 ||
      facts.wireSchemaHash !== row.schemaSha256 ||
      stableJson(body.provider) !== stableJson(protocol.exactProviderContract.provider) ||
      stableJson(body.reasoning) !== stableJson(protocol.exactProviderContract.reasoning)
    ) {
      throw new Error("pilot exact-wire body route, model, prompt, or schema drifted");
    }
    const cost = computePilotConservativeCostUsd({
      bodyUtf8Bytes: row.bodyUtf8Bytes,
      maxOutputTokens: row.maxOutputTokens,
      inputUsdPer1M: price.emergencyInputUsdPer1M,
      outputUsdPer1M: price.emergencyOutputUsdPer1M,
      serverTokenOverheadUpperBound:
        protocol.pricingAmendment.serverTokenOverheadUpperBound,
      safetyMultiplier: protocol.pricingAmendment.safetyMultiplier,
    });
    if (cost !== price.calculatedWorstCaseUsdCap || cost <= price.v1CapUsd) {
      throw new Error("pilot protocol cost amendment is arithmetically invalid");
    }
    summedCost += cost;
  }
  const summedCostRounded = Math.ceil(summedCost * 1e9) / 1e9;
  if (
    summedCostRounded !== protocol.pricingAmendment.totalCalculatedWorstCaseUsdCap ||
    summedCostRounded !== protocol.durableBounds.sharedBatchCostCapUsd ||
    summedCostRounded <= protocol.pricingAmendment.v1TotalCapUsd ||
    protocol.pricingAmendment.v1TotalCapSufficient !== false
  ) {
    throw new Error("pilot shared cost amendment is invalid");
  }
  return { protocol, protocolSha256, artifact, artifactSha256 };
}

function validateFreshPricingAndCapabilities(input: {
  protocol: ProtocolV2;
  priceSnapshotId: string;
  snapshot: unknown;
  validThrough: string;
  now: number;
}) {
  if (!Number.isFinite(input.now)) throw new Error("pilot pricing clock is invalid");
  const proof = deriveAtlasControllerPricingSnapshotProof(input.priceSnapshotId, input.snapshot);
  if (proof.schemaVersion !== 2) throw new Error("pilot requires schema-v2 pricing evidence");
  const fetchedAt = Date.parse(proof.fetchedAt);
  const validThrough = Date.parse(input.validThrough);
  const maxAge = input.protocol.freshPricingAndCapabilityProof.maximumAgeMsAtEveryLease;
  if (
    !Number.isFinite(validThrough) ||
    new Date(validThrough).toISOString() !== input.validThrough ||
    validThrough <= fetchedAt ||
    validThrough - fetchedAt > maxAge ||
    input.now < fetchedAt ||
    input.now > validThrough
  ) {
    throw new Error("pilot pricing proof is stale or has a non-canonical window");
  }
  const strictSnapshot = validatePricingSnapshotV2(input.snapshot);
  const models = strictSnapshot.models;
  for (const assignment of input.protocol.pricingAmendment.assignments) {
    const model = models.filter((value) => value.id === assignment.modelId);
    if (model.length !== 1) {
      throw new Error(`pilot pricing/capability evidence is missing ${assignment.plan}`);
    }
    const exact = model[0].endpointRates.filter(
      (value) => value.tag === EXACT_TAG && value.status === "active",
    );
    if (exact.length !== 1) {
      throw new Error(`pilot exact tag capability cardinality is invalid for ${assignment.plan}`);
    }
    const supported = exact[0].supportedParameters;
    for (const required of input.protocol.freshPricingAndCapabilityProof
      .publicEndpointSupportedParametersRequired) {
      if (!supported.includes(required)) {
        throw new Error(`pilot exact tag lacks ${required} capability for ${assignment.plan}`);
      }
    }
    const modelProof = proof.models[assignment.modelId];
    if (
      !modelProof ||
      modelProof.exactRouteTag !== EXACT_TAG ||
      modelProof.exactRouteProvider !== exact[0].provider ||
      !modelProof.servedModelAllowlist?.includes(model[0].canonicalSlug) ||
      !modelProof.servedModelAllowlist?.includes(assignment.modelId) ||
      modelProof.maxInputUsdPer1M - assignment.emergencyInputUsdPer1M > 1e-12 ||
      modelProof.maxOutputUsdPer1M - assignment.emergencyOutputUsdPer1M > 1e-12
    ) {
      throw new Error(
        `pilot fresh price exceeds the frozen ${assignment.plan} ceiling; new protocol required`,
      );
    }
  }
  return proof;
}

export function materializeConnectivityPilot(input: {
  priceSnapshotId: string;
  snapshot: unknown;
  validThrough: string;
  now?: number;
}): Readonly<PilotMaterializedExecution> {
  const loaded = validateProtocolAndExactWire();
  const now = input.now ?? Date.now();
  const proof = validateFreshPricingAndCapabilities({
    protocol: loaded.protocol,
    priceSnapshotId: input.priceSnapshotId,
    snapshot: input.snapshot,
    validThrough: input.validThrough,
    now,
  });
  const parserArtifactSha256 = sha256(readFileSync(parserPath));
  const attestationMaterial = {
    attestationId: PARSER_ID,
    candidatesPerCompletion: 1,
    parserArtifactHash: parserArtifactSha256,
  };
  const candidateContract = {
    ...attestationMaterial,
    attestationHash: sha256(stableJson(attestationMaterial)),
  };
  const priceByPlan = new Map(
    loaded.protocol.pricingAmendment.assignments.map((row) => [row.plan, row]),
  );
  const assignments = [...loaded.artifact.rows]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((row): PilotMaterializedAssignment => {
      const price = priceByPlan.get(row.plan)!;
      const modelProof = proof.models[row.modelId]!;
      const pricing = sealAtlasControllerPricingContract({
        inputUsdPer1M: price.emergencyInputUsdPer1M,
        outputUsdPer1M: price.emergencyOutputUsdPer1M,
        safetyMultiplier: loaded.protocol.pricingAmendment.safetyMultiplier,
        serverTokenOverheadUpperBound:
          loaded.protocol.pricingAmendment.serverTokenOverheadUpperBound,
        currency: "USD",
        proofKind: "maximum-allowed-provider-list-price",
        priceSnapshotId: input.priceSnapshotId,
        priceSnapshotHash: proof.snapshotHash,
        providerAllowlistHash: modelProof.providerAllowlistHash,
        proofSchemaVersion: 2,
        exactRouteTag: modelProof.exactRouteTag,
        exactRouteRateHash: modelProof.exactRouteRateHash,
        exactRouteInputUsdPer1M: modelProof.exactRouteInputUsdPer1M,
        exactRouteOutputUsdPer1M: modelProof.exactRouteOutputUsdPer1M,
        exactRouteProvider: modelProof.exactRouteProvider,
        servedModelAllowlistHash: modelProof.servedModelAllowlistHash,
        emergencyInputUsdPer1M: modelProof.emergencyInputUsdPer1M,
        emergencyOutputUsdPer1M: modelProof.emergencyOutputUsdPer1M,
        validAt: proof.fetchedAt,
        validThrough: input.validThrough,
        basis:
          "Fresh schema-v2 exact-tag proof; reservation uses frozen all-active emergency ceilings.",
      });
      const contractId = `ocvp-${row.plan.toLowerCase()}-one-call-v2`;
      const assignmentContract = sealAtlasControllerAssignmentContract({
        contractId,
        maxPhysicalCalls: 1,
        maxCandidateOutputs: 1,
        maxCostUsd: price.calculatedWorstCaseUsdCap,
      });
      const assignmentId = `OCVP-V2-${row.plan}-01`;
      const operationId = `ocvp:v2:${row.plan.toLowerCase()}:assignment-01`;
      const entryId = `ocvp-${row.plan.toLowerCase()}-candidate`;
      const transitionId = `root-${entryId}`;
      const provenance: AtlasResearchProvenance = {
        requestedModel: row.modelId,
        effectiveModel: row.modelId,
        plan: row.plan,
        stage: "question.structured",
        promptHash: row.promptSha256,
        requestEnvelopeHash: row.requestEnvelopeSha256,
        promptProfileArtifactHash: row.profileArtifactSha256,
        schemaHash: row.schemaSha256,
        gateHash: row.gateArtifactSha256,
        ladderHash: null,
        policyHash: row.policyArtifactSha256,
        corpus: {
          corpusId: "original-connectivity-pilot-v1",
          rowId: "OCVP-B01",
          passageHash: loaded.artifact.source.passageSha256,
        },
        runnerVersion: "campaign-v6-connectivity-pilot-v2",
        gitVersion: loaded.artifact.gitVersion,
      };
      const registry = sealAtlasControllerRegistry({
        schemaVersion: 2,
        controllerId: `ocvp-v2-${row.plan.toLowerCase()}-controller`,
        operationIdPrefix: `ocvp:v2:${row.plan.toLowerCase()}:`,
        experimentId: EXPERIMENT_ID,
        phaseId: PHASE_ID,
        batchId: BATCH_ID,
        entries: [{
          entryId,
          purpose: "candidate",
          candidateProducing: true,
          provenance,
          wire: {
            endpointHash: sha256(row.endpoint),
            requestMode: "exact",
            wireBodyHash: row.bodySha256,
            wirePromptHash: row.promptSha256,
            wireSchemaHash: row.schemaSha256,
            outputShape: "json-schema-object",
            structurallyFixedOutputsPerCompletion: 1,
            completionCount: 1,
            maxOutputTokens: row.maxOutputTokens,
            maxRequestBodyUtf8Bytes: row.bodyUtf8Bytes,
            derivationContract: null,
          },
          candidateContract,
          pricing,
          maxUsesPerAssignment: 1,
        }],
        assignmentContracts: [assignmentContract],
        transitions: [{ transitionId, fromEntryId: null, toEntryId: entryId }],
      });
      return {
        ordinal: row.ordinal,
        plan: row.plan,
        assignmentId,
        operationId,
        contractId,
        entryId,
        transitionId,
        bodyText: row.bodyText,
        provenance,
        registry,
        reservedCostUsd: price.calculatedWorstCaseUsdCap,
        timeoutMs: loaded.protocol.durableBounds.timeoutMsByPlan[row.plan],
        expectedProvider: modelProof.exactRouteProvider!,
        allowedServedModels: Object.freeze([...(modelProof.servedModelAllowlist ?? [])]),
      };
    });
  const initialRollingPricingAttestation = sealAtlasControllerRollingPricingAttestation({
    priceSnapshotId: input.priceSnapshotId,
    snapshot: input.snapshot,
    validThrough: input.validThrough,
  });
  const identityMaterial = {
    campaignId: CAMPAIGN_ID,
    protocolSha256: loaded.protocolSha256,
    exactWirePrivateArtifactSha256: loaded.artifactSha256,
    parserArtifactSha256,
    registryHashes: assignments.map((row) => row.registry.registryHash),
    globalCandidateCap: 2,
    globalPhysicalFetchCap: 2,
    globalCostCapUsd: loaded.protocol.durableBounds.sharedBatchCostCapUsd,
  };
  const materialized: PilotMaterializedExecution = {
    schemaVersion: "question-quality-v6-connectivity-pilot-materialized-v2",
    campaignId: CAMPAIGN_ID,
    experimentId: EXPERIMENT_ID,
    phaseId: PHASE_ID,
    batchId: BATCH_ID,
    protocolSha256: loaded.protocolSha256,
    exactWirePrivateArtifactSha256: loaded.artifactSha256,
    durableBatchIdentitySha256: sha256(stableJson(identityMaterial)),
    parserArtifactSha256,
    archivedPriceSnapshotId: input.priceSnapshotId,
    archivedPriceSnapshot: JSON.parse(JSON.stringify(input.snapshot)) as unknown,
    initialRollingPricingAttestation,
    assignments,
    globalCandidateCap: 2,
    globalPhysicalFetchCap: 2,
    globalCostCapUsd: loaded.protocol.durableBounds.sharedBatchCostCapUsd,
    experimentRegistryPhase: {
      id: PHASE_ID,
      apiCandidateBudget: 2,
      maxPhysicalProviderCalls: 2,
      maxCostUsd: loaded.protocol.durableBounds.sharedBatchCostCapUsd,
    },
  };
  return deepFreezePilot(materialized);
}

export function createOfflineInjectedTransportTestPermit(
  materialized: PilotMaterializedExecution,
): Readonly<PilotOfflineTestPermit> {
  if (process.env[TEST_MODE_ENV] !== "1") {
    throw new Error("offline injected-transport permit is test-only");
  }
  return Object.freeze({
    mode: "OFFLINE_INJECTED_TRANSPORT_TEST_ONLY" as const,
    materializedIdentitySha256: materialized.durableBatchIdentitySha256,
    [permitBrand]: true as const,
  });
}

export function createOfflineInjectedTransportCapability(
  delegate: FetchDelegate,
): Readonly<PilotOfflineTransportCapability> {
  if (process.env[TEST_MODE_ENV] !== "1" || typeof delegate !== "function") {
    throw new Error("offline injected transport is test-only");
  }
  return Object.freeze({
    mode: "OFFLINE_INJECTED_TRANSPORT_TEST_ONLY" as const,
    [offlineTransportBrand]: true as const,
    delegate,
  });
}

function assertTestExecutionAuthority(
  materialized: PilotMaterializedExecution,
  permit: PilotOfflineTestPermit,
  transport: PilotOfflineTransportCapability,
): void {
  if (
    process.env[TEST_MODE_ENV] !== "1" ||
    permit[permitBrand] !== true ||
    transport[offlineTransportBrand] !== true ||
    permit.materializedIdentitySha256 !== materialized.durableBatchIdentitySha256
  ) {
    throw new Error("pilot live execution remains blocked pending hostile audit");
  }
}

/**
 * This factory is intentionally unusable while protocol-v2 remains blocked.
 * A later, separately audited protocol version may call it only from the
 * isolated child; offline tests cannot mint this brand or pass its checks.
 */
export function createPilotLiveCredentialCapabilityForIsolatedChild(): Readonly<PilotLiveCredentialCapability> {
  const loaded = validateProtocolAndExactWire();
  const authorization = loaded.protocol.authorization as unknown as Record<string, unknown>;
  if (
    process.env[LIVE_CHILD_ENV] !== "1" ||
    authorization.liveExecutionAuthorized !== true ||
    authorization.hostileAuditPassed !== true ||
    authorization.dispatchCommandPresent !== true
  ) {
    throw new Error("pilot live credential capability is not authorized by this protocol");
  }
  const credentialNames = Object.keys(process.env).filter(
    (name) => /^OPENROUTER_.*(?:KEY|TOKEN|SECRET|CREDENTIAL)$/iu.test(name),
  );
  if (credentialNames.length !== 1 || credentialNames[0] !== "OPENROUTER_API_KEY") {
    throw new Error("isolated child requires exactly one generic OpenRouter credential source");
  }
  const secret = process.env.OPENROUTER_API_KEY;
  if (typeof secret !== "string" || secret.length < 8) {
    throw new Error("isolated child generic OpenRouter credential is absent or malformed");
  }
  return Object.freeze({
    sourceEnvironmentName: "OPENROUTER_API_KEY" as const,
    [liveCredentialBrand]: true as const,
    async withAuthorizationHeader<T>(fn: (headerValue: string) => T | Promise<T>): Promise<T> {
      return fn(`Bearer ${secret}`);
    },
  });
}

export function reserveConnectivityPilotBatch(
  materialized: PilotMaterializedExecution,
  store: BudgetStore,
): void {
  const before = store.summary();
  if (
    before.breachedBatches > 0 ||
    before.batches > 1 ||
    (before.batches === 0 && (before.usedAttemptSlots !== 0 || before.reservedAttemptSlots !== 0))
  ) {
    throw new Error("pilot requires a clean exclusive durable store");
  }
  const receipt = store.reserveBatch(
    {
      experimentId: materialized.experimentId,
      phaseId: materialized.phaseId,
      batchId: materialized.batchId,
      idempotencyKey: `pilot:reserve:${materialized.durableBatchIdentitySha256.slice(0, 40)}`,
      candidateSlots: materialized.globalCandidateCap,
      maxProviderCalls: materialized.globalPhysicalFetchCap,
      maxCostUsd: materialized.globalCostCapUsd,
    },
    { apply: true },
  );
  if (
    receipt.value.allocatedCandidateSlots !== 2 ||
    receipt.value.maxProviderCalls !== 2 ||
    receipt.value.maxCostUsd !== materialized.globalCostCapUsd
  ) {
    throw new Error("pilot durable batch differs from the frozen two-call envelope");
  }
}

export function buildConnectivityPilotPrivateRegistryJson(
  materialized: PilotMaterializedExecution,
): string {
  if (
    materialized.experimentId !== EXPERIMENT_ID ||
    materialized.phaseId !== PHASE_ID ||
    materialized.globalCandidateCap !== 2 ||
    materialized.globalPhysicalFetchCap !== 2
  ) {
    throw new Error("pilot materialization cannot define the private registry");
  }
  return `${JSON.stringify({
    schemaVersion: 1,
    status: "SEALED_PRIVATE_CONNECTIVITY_PILOT_REGISTRY",
    registeredExperiments: [{
      id: EXPERIMENT_ID,
      status: "in_progress",
      phases: [{
        id: PHASE_ID,
        status: "in_progress",
        apiCandidateBudget: 2,
        maxPhysicalProviderCalls: 2,
        maxCostUsd: materialized.globalCostCapUsd,
      }],
    }],
  }, null, 2)}\n`;
}

function createController(
  materialized: PilotMaterializedExecution,
  assignment: PilotMaterializedAssignment,
  store: BudgetStore,
  rollingPricingAttestation: AtlasControllerRollingPricingAttestation,
  now: () => number,
): DurableAtlasResearchController {
  return new DurableAtlasResearchController({
    store,
    registry: assignment.registry,
    parsers: {
      [PARSER_ID]: createS1OpenRouterQuestionParser(materialized.parserArtifactSha256),
    },
    pricingSnapshots: {
      [materialized.archivedPriceSnapshotId]: materialized.archivedPriceSnapshot,
    },
    rollingPricingAttestation,
    now,
  });
}

function scopeFor(assignment: PilotMaterializedAssignment): AtlasResearchScope {
  const entry = assignment.registry.entries[0]!;
  const candidate = entry.candidateContract!;
  return {
    operationId: assignment.operationId,
    purpose: "candidate",
    expectedEndpoint: ENDPOINT,
    expectedCandidateOutputs: 1,
    candidateContract: {
      attestationId: candidate.attestationId,
      attestationHash: candidate.attestationHash,
      expectedCandidatesPerCompletion: 1,
    },
    derivationIntent: null,
    parentPhysicalCallId: null,
    provenance: assignment.provenance,
  };
}

export function inspectConnectivityPilotFrozenWireMatchForOfflineAudit(
  assignment: PilotMaterializedAssignment,
): Record<string, boolean> {
  const entry = assignment.registry.entries[0]!;
  const facts = parseBodyFacts({
    ordinal: assignment.ordinal,
    plan: assignment.plan,
    modelId: assignment.provenance.effectiveModel,
    endpoint: ENDPOINT,
    bodyText: assignment.bodyText,
    bodySha256: sha256(assignment.bodyText),
    bodyUtf8Bytes: Buffer.byteLength(assignment.bodyText, "utf8"),
    promptSha256: assignment.provenance.promptHash,
    schemaSha256: assignment.provenance.schemaHash!,
    requestEnvelopeSha256: assignment.provenance.requestEnvelopeHash!,
    profileArtifactSha256: assignment.provenance.promptProfileArtifactHash!,
    gateArtifactSha256: assignment.provenance.gateHash!,
    policyArtifactSha256: assignment.provenance.policyHash!,
    maxOutputTokens: 4000,
    completionCount: 1,
    candidateOutputsPerCompletion: 1,
  });
  return {
    endpointHash: entry.wire.endpointHash === facts.endpointHash,
    schemaHash: entry.wire.wireSchemaHash === facts.wireSchemaHash,
    outputShape: entry.wire.outputShape === facts.outputShape,
    structurallyFixedOutputs:
      entry.wire.structurallyFixedOutputsPerCompletion === facts.structurallyFixedOutputsPerCompletion,
    completionCount: entry.wire.completionCount === facts.completionCount,
    maxOutputTokens:
      entry.wire.maxOutputTokens === (facts.maxTokens ?? facts.maxCompletionTokens ?? facts.maxOutputTokens),
    bodyBytes: facts.requestBodyUtf8Bytes <= entry.wire.maxRequestBodyUtf8Bytes,
    model: entry.provenance.effectiveModel === facts.model,
    bodyHash: entry.wire.wireBodyHash === facts.wireBodyHash,
    promptHash: entry.wire.wirePromptHash === facts.wirePromptHash,
    provenance: stableJson(entry.provenance) === stableJson(assignment.provenance),
  };
}

function hasCompleteParserEvidence(
  recovered: ControllerAssignmentRecoveryView["calls"][number],
  assignment: PilotMaterializedAssignment,
): boolean {
  let parserEvidence: JsonRecord | null = null;
  try {
    parserEvidence = recovered.parserEvidenceJson
      ? JSON.parse(recovered.parserEvidenceJson) as JsonRecord
      : null;
  } catch {
    return false;
  }
  return Boolean(
    parserEvidence &&
    parserEvidence.callId === recovered.call.callId &&
    parserEvidence.parserArtifactHash === assignment.registry.entries[0]?.candidateContract?.parserArtifactHash &&
    parserEvidence.disposition === "parsed" &&
    parserEvidence.observedOutputCount === 1 &&
    Array.isArray(parserEvidence.outputHashes) &&
    parserEvidence.outputHashes.length === 1 &&
    recovered.candidateSlots.length === 1 &&
    recovered.candidateSlots[0]?.outputHash === parserEvidence.outputHashes[0]
  );
}

function requireCompleteSuccessfulEvidence(
  store: BudgetStore,
  assignment: PilotMaterializedAssignment,
): ControllerAssignmentRecoveryView {
  const recovery = store.getControllerAssignmentRecovery(assignment.assignmentId);
  if (recovery.calls.length !== 1) throw new Error("pilot assignment lacks its single durable call");
  const recovered = recovery.calls[0]!;
  if (recovered.call.state !== "settled") throw new Error("pilot call is unresolved");
  if (recovered.call.outcome === "success") {
    const parserComplete = hasCompleteParserEvidence(recovered, assignment);
    if (
      !recovered.call.usageFinal ||
      recovered.call.inputTokens <= 0 ||
      recovered.call.outputTokens < 0 ||
      recovered.call.actualCostUsd < 0 ||
      !recovered.call.providerRequestId ||
      !recovered.capturedResponseBody ||
      !parserComplete ||
      validateAtlasControllerSchemaV2RouterMetadata(
        recovered.capturedResponseBody,
        assignment.provenance.effectiveModel,
        {
          allowedServedModels: assignment.allowedServedModels,
          expectedProvider: assignment.expectedProvider,
        },
      ) !== null
    ) {
      store.quarantineControllerAssignment(
        {
          idempotencyKey: `pilot:quarantine:evidence:${sha256(assignment.assignmentId).slice(0, 32)}`,
          assignmentId: assignment.assignmentId,
          reason: "successful pilot call lacks final usage, cost, route, body, or parser evidence",
        },
        { apply: true },
      );
      throw new Error("pilot successful response evidence is incomplete; assignment quarantined");
    }
  }
  return recovery;
}

function quarantineIncompletePilotAssignment(
  store: BudgetStore,
  assignment: PilotMaterializedAssignment,
  reason: string,
): ControllerAssignmentRecoveryView {
  const recovery = store.getControllerAssignmentRecovery(assignment.assignmentId);
  if (recovery.assignment.state === "quarantined") return recovery;
  if (recovery.assignment.state !== "open") return recovery;
  store.quarantineControllerAssignment(
    {
      idempotencyKey: `pilot:quarantine:terminal:${sha256(assignment.assignmentId).slice(0, 32)}`,
      assignmentId: assignment.assignmentId,
      reason,
    },
    { apply: true },
  );
  return store.getControllerAssignmentRecovery(assignment.assignmentId);
}

function finalizeParsedConnectivityEvidence(
  controller: DurableAtlasResearchController,
  assignment: PilotMaterializedAssignment,
  recovery: ControllerAssignmentRecoveryView,
): void {
  if (recovery.calls[0]?.call.outcome !== "success") return;
  const alreadyFinal = recovery.calls[0].candidateSlots.filter(
    (candidate) => candidate.state === "finished" && candidate.outcome === "parsed_accepted",
  );
  if (alreadyFinal.length === 1) return;
  const parsed = recovery.calls[0].candidateSlots.filter(
    (candidate) => candidate.state === "parsed_pending" && candidate.outputHash !== null,
  );
  if (parsed.length !== 1) {
    throw new Error("successful pilot assignment lacks one parsed connectivity candidate");
  }
  controller.finalizeCorrelatedCandidates({
    operationId: assignment.operationId,
    decisions: [{ candidateSlotId: parsed[0]!.candidateSlotId, outcome: "parsed_accepted" }],
  });
}

async function executeAssignment(input: {
  materialized: PilotMaterializedExecution;
  assignment: PilotMaterializedAssignment;
  store: BudgetStore;
  rollingPricingAttestation: AtlasControllerRollingPricingAttestation;
  delegate: FetchDelegate;
  credential: Pick<PilotLiveCredentialCapability, "withAuthorizationHeader">;
  now: () => number;
}): Promise<void> {
  const controller = createController(
    input.materialized,
    input.assignment,
    input.store,
    input.rollingPricingAttestation,
    input.now,
  );
  const admitted = controller.admitAssignment({
    operationId: input.assignment.operationId,
    assignmentId: input.assignment.assignmentId,
    contractId: input.assignment.contractId,
  });
  if (admitted.state === "closed") return;
  if (admitted.state === "quarantined") throw new Error("pilot assignment is quarantined");
  const existing = controller.recoverAssignment(input.assignment.assignmentId);
  if (existing.calls.length > 0) {
    await controller.awaitTrackedCloneObservations();
    const recovered = requireCompleteSuccessfulEvidence(input.store, input.assignment);
    if (recovered.assignment.state === "open") {
      if (recovered.calls[0]?.call.outcome === "success") {
        finalizeParsedConnectivityEvidence(controller, input.assignment, recovered);
        await controller.closeAssignment(input.assignment.assignmentId);
      } else {
        quarantineIncompletePilotAssignment(
          input.store,
          input.assignment,
          "non-success pilot opportunity is terminal and must never be replayed",
        );
      }
    }
    return;
  }

  const uninstall = installAtlasResearchFetchController(controller);
  const dispatcher = createAtlasResearchFetchDispatcher(input.delegate);
  try {
    await runWithAtlasResearchScope(scopeFor(input.assignment), () =>
      input.credential.withAuthorizationHeader((authorization) =>
        dispatcher(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: input.assignment.bodyText,
          signal: AbortSignal.timeout(input.assignment.timeoutMs),
        }).then(async (response) => {
          // Drain the reconstructed response through the same bounded capture;
          // the durable parser is response-bound and does not trust this value.
          await response.arrayBuffer();
        }),
      ),
    );
  } finally {
    uninstall();
  }
  await controller.awaitTrackedCloneObservations();
  const completed = requireCompleteSuccessfulEvidence(input.store, input.assignment);
  if (completed.calls[0]?.call.outcome !== "success") {
    quarantineIncompletePilotAssignment(
      input.store,
      input.assignment,
      "non-success pilot opportunity is terminal and must never be replayed",
    );
    return;
  }
  finalizeParsedConnectivityEvidence(controller, input.assignment, completed);
  if (input.store.summary().breachedBatches > 0) {
    throw new Error("pilot cost envelope breached; later assignments are blocked");
  }
  await controller.closeAssignment(input.assignment.assignmentId);
}

export async function runConnectivityPilotWithInjectedTransport(input: {
  materialized: PilotMaterializedExecution;
  store: BudgetStore;
  rollingPricingAttestation?: AtlasControllerRollingPricingAttestation;
  transport: PilotOfflineTransportCapability;
  permit: PilotOfflineTestPermit;
  now?: () => number;
}): Promise<PilotPublicResult> {
  assertTestExecutionAuthority(input.materialized, input.permit, input.transport);
  reserveConnectivityPilotBatch(input.materialized, input.store);
  const now = input.now ?? Date.now;
  const rolling = input.rollingPricingAttestation ??
    input.materialized.initialRollingPricingAttestation;
  for (const assignment of [...input.materialized.assignments]
    .sort((left, right) => left.ordinal - right.ordinal)) {
    if (input.store.summary().breachedBatches > 0) {
      throw new Error("pilot batch is breached; no later assignment may start");
    }
    await executeAssignment({
      materialized: input.materialized,
      assignment,
      store: input.store,
      rollingPricingAttestation: rolling,
      delegate: input.transport.delegate,
      credential: {
        withAuthorizationHeader: <T>(
          fn: (headerValue: string) => T | Promise<T>,
        ): Promise<T> => Promise.resolve(fn("Bearer offline-injected-non-secret")),
      },
      now,
    });
  }
  return buildConnectivityPilotPublicResult(input.materialized, input.store);
}

export async function runConnectivityPilotLiveInIsolatedChild(input: {
  materialized: PilotMaterializedExecution;
  store: BudgetStore;
  rollingPricingAttestation: AtlasControllerRollingPricingAttestation;
  credential: PilotLiveCredentialCapability;
  now?: () => number;
}): Promise<PilotPublicResult> {
  const loaded = validateProtocolAndExactWire();
  const authorization = loaded.protocol.authorization as unknown as Record<string, unknown>;
  if (
    process.env[LIVE_CHILD_ENV] !== "1" ||
    input.credential[liveCredentialBrand] !== true ||
    authorization.liveExecutionAuthorized !== true ||
    authorization.hostileAuditPassed !== true ||
    authorization.dispatchCommandPresent !== true
  ) {
    throw new Error("pilot live dispatch is not authorized");
  }
  reserveConnectivityPilotBatch(input.materialized, input.store);
  const now = input.now ?? Date.now;
  for (const assignment of [...input.materialized.assignments]
    .sort((left, right) => left.ordinal - right.ordinal)) {
    if (input.store.summary().breachedBatches > 0) {
      throw new Error("pilot batch is breached; no later assignment may start");
    }
    await executeAssignment({
      materialized: input.materialized,
      assignment,
      store: input.store,
      rollingPricingAttestation: input.rollingPricingAttestation,
      delegate: globalThis.fetch.bind(globalThis),
      credential: input.credential,
      now,
    });
  }
  return buildConnectivityPilotPublicResult(input.materialized, input.store);
}

export function leasePilotAssignmentWithoutNetworkForCrashTest(input: {
  materialized: PilotMaterializedExecution;
  store: BudgetStore;
  plan: Plan;
  permit: PilotOfflineTestPermit;
  transport: PilotOfflineTransportCapability;
  now?: () => number;
}): string {
  assertTestExecutionAuthority(input.materialized, input.permit, input.transport);
  reserveConnectivityPilotBatch(input.materialized, input.store);
  const assignment = input.materialized.assignments.find((row) => row.plan === input.plan);
  if (!assignment) throw new Error("unknown pilot plan");
  const controller = createController(
    input.materialized,
    assignment,
    input.store,
    input.materialized.initialRollingPricingAttestation,
    input.now ?? Date.now,
  );
  controller.admitAssignment({
    operationId: assignment.operationId,
    assignmentId: assignment.assignmentId,
    contractId: assignment.contractId,
  });
  const physicalCallId = `${assignment.operationId}:http:1`;
  const request: AtlasResearchLeaseRequest = {
    operationId: assignment.operationId,
    physicalCallId,
    physicalOrdinal: 1,
    purpose: "candidate",
    parentPhysicalCallId: null,
    derivationIntent: null,
    candidateOutputs: 1,
    provenance: assignment.provenance,
    request: parseBodyFacts({
      ...input.materialized.assignments.find((row) => row.plan === input.plan)!,
      ordinal: assignment.ordinal,
      modelId: assignment.provenance.effectiveModel,
      endpoint: ENDPOINT,
      bodySha256: sha256(assignment.bodyText),
      bodyUtf8Bytes: Buffer.byteLength(assignment.bodyText, "utf8"),
      promptSha256: assignment.provenance.promptHash,
      schemaSha256: assignment.provenance.schemaHash!,
      requestEnvelopeSha256: assignment.provenance.requestEnvelopeHash!,
      profileArtifactSha256: assignment.provenance.promptProfileArtifactHash!,
      gateArtifactSha256: assignment.provenance.gateHash!,
      policyArtifactSha256: assignment.provenance.policyHash!,
      maxOutputTokens: 4000,
      completionCount: 1,
      candidateOutputsPerCompletion: 1,
    }),
  };
  controller.preFetchLease(request);
  return physicalCallId;
}

export async function recoverPilotCrashWithoutReplay(input: {
  materialized: PilotMaterializedExecution;
  store: BudgetStore;
  plan: Plan;
  physicalCallId: string;
  disposition: "never_sent" | "unknown_after_send";
  permit: PilotOfflineTestPermit;
  transport: PilotOfflineTransportCapability;
  now?: () => number;
}): Promise<void> {
  assertTestExecutionAuthority(input.materialized, input.permit, input.transport);
  const assignment = input.materialized.assignments.find((row) => row.plan === input.plan);
  if (!assignment) throw new Error("unknown pilot plan");
  const controller = createController(
    input.materialized,
    assignment,
    input.store,
    input.materialized.initialRollingPricingAttestation,
    input.now ?? Date.now,
  );
  controller.admitAssignment({
    operationId: assignment.operationId,
    assignmentId: assignment.assignmentId,
    contractId: assignment.contractId,
  });
  controller.recoverAmbiguousCall({
    physicalCallId: input.physicalCallId,
    disposition: input.disposition,
    reason: "offline crash/restart proof; network replay forbidden",
  });
  if (input.disposition === "never_sent") {
    await controller.closeAssignment(assignment.assignmentId);
  } else {
    quarantineIncompletePilotAssignment(
      input.store,
      assignment,
      "unknown-after-send call is terminal, conservatively reserved, and never replayed",
    );
  }
}

export function buildConnectivityPilotPublicResult(
  materialized: PilotMaterializedExecution,
  store: BudgetStore,
): PilotPublicResult {
  const summary = store.summary();
  const recoveries = materialized.assignments.flatMap((assignment) => {
    try {
      return [{ assignment, recovery: store.getControllerAssignmentRecovery(assignment.assignmentId) }];
    } catch {
      return [];
    }
  });
  const calls = recoveries.flatMap(({ assignment, recovery }) =>
    recovery.calls.map((call) => ({ assignment, recovery, call }))
  );
  const successfulCalls = calls.filter(({ call }) => call.call.outcome === "success");
  const usageEvidenceComplete = successfulCalls.length === 2 && successfulCalls.every(
    ({ call }) => call.call.usageFinal && call.call.providerRequestId !== null,
  );
  const routeEvidenceComplete = successfulCalls.length === 2 && successfulCalls.every(
    ({ assignment, call: row }) => row.capturedResponseBody !== null &&
      validateAtlasControllerSchemaV2RouterMetadata(
        row.capturedResponseBody,
        row.call.model,
        {
          allowedServedModels: assignment.allowedServedModels,
          expectedProvider: assignment.expectedProvider,
        },
      ) === null,
  );
  const parserEvidenceComplete = successfulCalls.length === 2 && successfulCalls.every(
    ({ assignment, call }) => hasCompleteParserEvidence(call, assignment),
  );
  const startedAssignments = calls.length;
  const settledAssignments = calls.filter(({ call }) => call.call.state === "settled").length;
  const successfulAssignments = successfulCalls.length;
  const serialOrderComplete = calls.length === 2 &&
    calls[0]?.assignment.plan === "STANDARD" &&
    calls[1]?.assignment.plan === "PREMIUM" &&
    Date.parse(calls[0].call.call.createdAt) <= Date.parse(calls[1].call.call.createdAt);
  const noBreach = summary.breachedBatches === 0 &&
    summary.unresolvedCalls === 0 &&
    summary.openCandidateSlots === 0 &&
    summary.usedAttemptSlots === 2 &&
    summary.providerCalls === 2 &&
    summary.effectiveCostUsd <= materialized.globalCostCapUsd + 1e-12;
  const exactTerminalBarrier = recoveries.length === 2 &&
    recoveries.every(({ recovery }) => recovery.assignment.state === "closed" && recovery.calls.length === 1) &&
    startedAssignments === 2 &&
    settledAssignments === 2 &&
    successfulAssignments === 2 &&
    usageEvidenceComplete &&
    routeEvidenceComplete &&
    parserEvidenceComplete &&
    serialOrderComplete &&
    noBreach;
  const core = {
    schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v2" as const,
    status: (
      exactTerminalBarrier
        ? "COMPLETED_BOUNDED_CONNECTIVITY_PILOT"
        : "PARTIAL_OR_BLOCKED"
    ) as PilotPublicResult["status"],
    startedAssignments,
    settledAssignments,
    successfulAssignments,
    candidateOpportunitiesConsumed: summary.usedAttemptSlots,
    physicalFetches: summary.providerCalls,
    actualCostUsd: summary.actualCostUsd,
    effectiveCostUsd: summary.effectiveCostUsd,
    usageEvidenceComplete,
    routeEvidenceComplete,
    parserEvidenceComplete,
    batchBreached: summary.breachedBatches > 0,
    auditHeadHash: summary.auditHeadHash,
  };
  const result: PilotPublicResult = {
    ...core,
    executionArtifactSha256: sha256(stableJson(core)),
  };
  validatePilotPublicResultShape(result);
  assertConnectivityPilotPublicResultPrivacy(result);
  return result;
}

export function assertConnectivityPilotPublicResultPrivacy(value: unknown): void {
  const loaded = validateProtocolAndExactWire();
  validatePilotPublicResultShape(value);
  if (!isRecord(value)) throw new Error("pilot public result must be an object");
  const keys = Object.keys(value).sort();
  const allowlist = [...loaded.protocol.publicResultAllowlist].sort();
  assert.deepEqual(keys, allowlist, "pilot public result contains a non-allowlisted field");
  const forbiddenKey = /(?:prompt|passage|question|option|answer|explanation|response|generation|credential|providerRequestId|rawMetadata)/iu;
  const visit = (child: unknown): void => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (!isRecord(child)) return;
    for (const [key, nested] of Object.entries(child)) {
      if (forbiddenKey.test(key)) throw new Error(`pilot public result leaks forbidden field ${key}`);
      visit(nested);
    }
  };
  visit(value);
  const bytes = JSON.stringify(value);
  if (/sk-or-v1-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}/u.test(bytes)) {
    throw new Error("pilot public result contains a credential-shaped value");
  }
}
