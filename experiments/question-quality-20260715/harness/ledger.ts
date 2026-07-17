import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";

export const CAMPAIGN_ID = "question-quality-20260715" as const;
export const GLOBAL_ATTEMPT_SLOT_CAP = 1_000 as const;
export const STORE_SCHEMA_VERSION = 4 as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = resolve(HERE, "../experiment-registry.json");
const ZERO_HASH = "0".repeat(64);
const EPSILON = 1e-9;
const MAX_CAPTURED_RESPONSE_BODY_BYTES = 16 * 1024 * 1024;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STRICT_KST_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/;
const TEST_MODE_ENV = "QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE";
const CONNECTIVITY_PILOT_PRIVATE_ROOT = resolve(
  HERE,
  "../execution/campaign-v6-connectivity-pilot-v2/private",
);
const CONNECTIVITY_PILOT_EXECUTION_DIR = /^live-execution-[a-z0-9][a-z0-9._-]{7,95}$/u;
const AUDIT_EVENT_TYPES: ReadonlySet<string> = new Set<AuditEventType>([
  "batch_reserved",
  "candidate_started",
  "candidate_parsed",
  "candidate_finished",
  "call_authorized",
  "call_in_flight",
  "call_settled",
  "usage_reconciled",
  "controller_registry_registered",
  "assignment_reserved",
  "assignment_quarantined",
  "assignment_closed",
  "terminal_evidence_recorded",
  "response_body_captured",
  "clone_evidence_recorded",
  "parser_evidence_recorded",
  "batch_breached",
  "batch_finalized",
]);
const AUDIT_ENTITY_BY_EVENT: Readonly<Record<AuditEventType, string>> = {
  batch_reserved: "batch",
  candidate_started: "candidate_slot",
  candidate_parsed: "candidate_slot",
  candidate_finished: "candidate_slot",
  call_authorized: "provider_call",
  call_in_flight: "provider_call",
  call_settled: "provider_call",
  usage_reconciled: "provider_call",
  controller_registry_registered: "controller_registry",
  assignment_reserved: "assignment",
  assignment_quarantined: "assignment",
  assignment_closed: "assignment",
  terminal_evidence_recorded: "provider_call",
  response_body_captured: "provider_call",
  clone_evidence_recorded: "provider_call",
  parser_evidence_recorded: "provider_call",
  batch_breached: "batch",
  batch_finalized: "batch",
};

export type CandidateOutcome =
  | "parsed_accepted"
  | "parsed_rejected"
  | "no_candidate"
  | "unknown_after_send";
export type ParsedCandidateOutcome = Exclude<
  CandidateOutcome,
  "no_candidate" | "unknown_after_send"
>;
export type CandidateState = "awaiting_result" | "parsed_pending" | "finished";
export type ProviderCallOutcome = "success" | "failed" | "unknown";
export type ProviderCallKind = "full_question_generation" | "design" | "evaluation";
export type AuditEventType =
  | "batch_reserved"
  | "candidate_started"
  | "candidate_parsed"
  | "candidate_finished"
  | "call_authorized"
  | "call_in_flight"
  | "call_settled"
  | "usage_reconciled"
  | "controller_registry_registered"
  | "assignment_reserved"
  | "assignment_quarantined"
  | "assignment_closed"
  | "terminal_evidence_recorded"
  | "response_body_captured"
  | "clone_evidence_recorded"
  | "parser_evidence_recorded"
  | "batch_breached"
  | "batch_finalized";

export interface BatchRef {
  experimentId: string;
  phaseId: string;
  batchId: string;
}

export interface ControllerRegistryRecordInput {
  idempotencyKey: string;
  registryHash: string;
  registryContentJson: string;
  entries: Array<{
    entryId: string;
    entryHash: string;
    entryContentJson: string;
  }>;
}

export interface ControllerAssignmentEnvelope {
  contractId: string;
  envelopeHash: string;
  maxPhysicalCalls: number;
  maxCandidateOutputs: number;
  maxCostUsd: number;
}

export interface ReserveControllerAssignmentInput extends BatchRef {
  idempotencyKey: string;
  assignmentId: string;
  operationId: string;
  controllerRegistryHash: string;
  envelope: ControllerAssignmentEnvelope;
}

export type ControllerAssignmentState = "open" | "quarantined" | "closed";

export interface ControllerAssignmentView extends BatchRef {
  assignmentId: string;
  operationId: string;
  controllerRegistryHash: string;
  contractId: string;
  envelopeHash: string;
  state: ControllerAssignmentState;
  maxPhysicalCalls: number;
  usedPhysicalCalls: number;
  maxCandidateOutputs: number;
  /** Permanently consumed ITT attempt opportunities, not observed full questions. */
  usedCandidateOutputs: number;
  /** Full-question outputs actually observed by the response-bound semantic parser. */
  observedSemanticCandidates: number;
  maxCostUsd: number;
  effectiveCostUsd: number;
  quarantineReason: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface ControllerCallContractInput {
  assignmentId: string;
  controllerRegistryHash: string;
  controllerEntryId: string;
  controllerEntryHash: string;
  transitionId: string;
  entryMaxUsesPerAssignment: number;
  parentPhysicalCallId?: string;
  requestHash: string;
  requestJson: string;
  provenanceHash: string;
  provenanceJson: string;
  endpointHash: string;
  wireBodyHash: string;
  wirePromptHash: string;
  wireSchemaHash: string | null;
  canonicalRequestHash: string;
  parserArtifactHash: string | null;
  derivationContractId: string | null;
  derivationReceiptHash: string | null;
  pricingContractHash: string;
  /** Fresh lease-window evidence; null for archived non-rolling controllers. */
  rollingPricingAttestationHash?: string | null;
}

export interface ControllerTerminalEvidenceInput {
  idempotencyKey: string;
  callId: string;
  terminalKind:
    | "http-response"
    | "network-error"
    | "abort"
    | "never-sent"
    | "unknown-after-send";
  evidenceJson: string;
  evidenceHash: string;
}

export interface ControllerCloneEvidenceInput {
  idempotencyKey: string;
  callId: string;
  responseBodyHash: string | null;
  evidenceJson: string;
  evidenceHash: string;
}

export interface ControllerResponseBodyInput {
  idempotencyKey: string;
  callId: string;
  responseBodyHash: string;
  responseBody: Uint8Array;
}

export interface ControllerParserEvidenceInput {
  responseBodyHash: string;
  parserArtifactHash: string;
  disposition: "parsed" | "no_candidate";
  dispositionReason: string;
  observedOutputCount: number;
  outputHashes: string[];
  evidenceHash: string;
}

export interface ControllerCallRecoveryView {
  call: CallView;
  contract: ControllerCallContractInput;
  candidateSlots: CandidateSlotView[];
  terminalEvidenceJson: string | null;
  cloneEvidenceJson: string | null;
  parserEvidenceJson: string | null;
  /** Private raw evidence for trusted parser recovery; omitted from JSON exports. */
  capturedResponseBody: Uint8Array | null;
}

export interface ControllerAssignmentRecoveryView {
  assignment: ControllerAssignmentView;
  calls: ControllerCallRecoveryView[];
}

export interface ReserveBatchInput extends BatchRef {
  idempotencyKey: string;
  candidateSlots: number;
  maxProviderCalls: number;
  maxCostUsd: number;
  /** Optional campaign-wide completion barrier for a frozen controller matrix. */
  sealedControllerCampaign?: {
    campaignSemanticSha256: string;
    durableBatchIdentitySha256: string;
    expectedAssignmentIds: string[];
    expectedAssignmentSetSha256: string;
  };
}

export interface ParsedCandidateClassification {
  candidateSlotId: string;
  status: "parsed";
  outputIndex: number;
  outputHash: string;
}

export interface NoCandidateClassification {
  candidateSlotId: string;
  status: "no_candidate";
  failureReason: string;
}

export interface UnknownAfterSendClassification {
  candidateSlotId: string;
  status: "unknown_after_send";
  failureReason: string;
}

export type CandidateClassification =
  | ParsedCandidateClassification
  | NoCandidateClassification
  | UnknownAfterSendClassification;

export interface ClassifyCandidateCallInput {
  idempotencyKey: string;
  callId: string;
  /** Number of semantic full questions observed, including schema-invalid containers. */
  observedParsedOutputCount: number;
  /** Exactly one classification for every slot reserved by this physical call. */
  results: CandidateClassification[];
  /** Required for controller-governed calls; persisted atomically with classification. */
  controllerParserEvidence?: ControllerParserEvidenceInput;
}

export interface ParsedCandidateDecision {
  candidateSlotId: string;
  outcome: ParsedCandidateOutcome;
}

export interface FinalizeParsedCandidatesInput {
  idempotencyKey: string;
  decisions: ParsedCandidateDecision[];
}

export interface BeginCallInput extends BatchRef {
  idempotencyKey: string;
  callId: string;
  callKind: ProviderCallKind;
  stage: string;
  model: string;
  reservedCostUsd: number;
  /** Groups physical retries/repairs that belong to one logical operation. Defaults to callId. */
  logicalOperationId?: string;
  /** Zero-based physical attempt inside logicalOperationId. Defaults to 0. */
  physicalAttemptOrdinal?: number;
  /** Optional parsed candidate whose full-candidate repair/regeneration this call attempts. */
  parentCandidateSlotId?: string;
  /** Required and positive only for calls capable of emitting full candidates. */
  expectedCandidateOutputs?: number;
  /** Optional stable IDs; when omitted, the guard allocates IDs atomically. */
  candidateSlotIds?: string[];
  /** Frozen research-controller contract, admitted atomically with the provider call. */
  controller?: ControllerCallContractInput;
}

export interface SettleCallInput {
  idempotencyKey: string;
  callId: string;
  outcome: ProviderCallOutcome;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  usageFinal: boolean;
  providerRequestId?: string;
}

export interface ReconcileCallInput {
  idempotencyKey: string;
  callId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  usageFinal: boolean;
  providerRequestId?: string;
}

export interface FinalizeBatchInput extends BatchRef {
  idempotencyKey: string;
  /** Mandatory when the batch was registered as a sealed controller campaign. */
  sealedTerminalStatus?: "COMPLETE" | "ABORTED_INCOMPLETE";
}

export interface ControllerAuthorizationWindowInput {
  campaignSemanticSha256: string;
  credentialPublicId: string;
  windowOrdinal: number;
  previousAuthorizationRecordSha256: string | null;
  authorizationRecordSha256: string;
  providerUsageUsd: number;
  providerRemainingUsd: number;
  providerHardLimitUsd: number;
}

export interface BatchFinancialView extends BatchRef {
  actualCostUsd: number;
  effectiveCostUsd: number;
  maxCostUsd: number;
}

export interface MutationOptions {
  apply?: boolean;
}

export interface MutationReceipt<T> {
  applied: boolean;
  dryRun: boolean;
  idempotent: boolean;
  value: T;
  summary: CampaignSummary;
}

export interface BatchView extends BatchRef {
  status: "open" | "finalized";
  allocatedCandidateSlots: number;
  usedCandidateSlots: number;
  reservedCandidateSlots: number;
  releasedCandidateSlots: number;
  maxProviderCalls: number;
  providerCalls: number;
  maxCostUsd: number;
  effectiveCostUsd: number;
  actualCostUsd: number;
  breached: boolean;
  breachReason: string | null;
  registryBudget: number;
  registryCallCap: number;
  registryCostCapUsd: number;
  registryHash: string;
  createdAt: string;
  finalizedAt: string | null;
}

export interface CandidateSlotView {
  candidateSlotId: string;
  state: CandidateState;
  outcome: CandidateOutcome | null;
  producingCallId: string | null;
  terminalCallId: string | null;
  outputIndex: number | null;
  outputHash: string | null;
  failureReason: string | null;
  createdAt: string;
  parsedAt: string | null;
  finishedAt: string | null;
}

export interface CallView {
  callId: string;
  state: "authorized" | "in_flight" | "settled";
  outcome: ProviderCallOutcome | null;
  callKind: ProviderCallKind;
  stage: string;
  model: string;
  logicalOperationId: string;
  physicalAttemptOrdinal: number;
  parentCandidateSlotId: string | null;
  reservedCostUsd: number;
  actualCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  usageFinal: boolean;
  providerRequestId: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface BeginCallValue extends CallView {
  shouldExecute: boolean;
  candidateSlotIds: string[];
}

export interface CampaignSummary {
  campaignId: typeof CAMPAIGN_ID;
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  attemptSlotCap: typeof GLOBAL_ATTEMPT_SLOT_CAP;
  usedAttemptSlots: number;
  reservedAttemptSlots: number;
  remainingUnreservedAttemptSlots: number;
  batches: number;
  openBatches: number;
  breachedBatches: number;
  providerCalls: number;
  unresolvedCalls: number;
  openCandidateSlots: number;
  parsedPendingCandidateSlots: number;
  actualCostUsd: number;
  effectiveCostUsd: number;
  auditEvents: number;
  auditHeadHash: string;
}

export interface ProviderUsageObservation {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs?: number;
  usageFinal?: boolean;
  providerRequestId?: string;
}

interface NormalizedProviderUsageObservation {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  usageFinal: boolean;
  providerRequestId?: string;
}

type NonCandidateCallKind = Exclude<ProviderCallKind, "full_question_generation">;

export interface RunProviderCallInput<T>
  extends Omit<BeginCallInput, "callKind" | "expectedCandidateOutputs" | "candidateSlotIds"> {
  callKind: NonCandidateCallKind;
  invoke: () => Promise<T>;
  observeSuccess: (value: T, latencyMs: number) => ProviderUsageObservation;
  observeFailure?: (error: unknown, latencyMs: number) => ProviderUsageObservation;
}

export interface RunCandidateOutputCallInput<T>
  extends Omit<BeginCallInput, "callKind"> {
  expectedCandidateOutputs: number;
  invoke: () => Promise<T>;
  observeSuccess: (value: T, latencyMs: number) => ProviderUsageObservation;
  observeFailure?: (error: unknown, latencyMs: number) => ProviderUsageObservation;
}

export interface RunCandidateOutputCallResult<T> {
  value: T;
  call: CallView;
  candidateSlotIds: string[];
}

export interface CandidateClassificationValue {
  candidates: CandidateSlotView[];
  overflowOutputCount: number;
}

export interface ExportArtifactsResult {
  snapshotPath: string;
  backupPath: string;
  manifestPath: string;
  snapshotSha256: string;
  backupSha256: string;
}

export interface RegistryPhaseStatus {
  experimentId: string;
  phaseId: string;
  experimentStatus: string;
  phaseStatus: string | null;
  apiCandidateBudget: number | null;
  maxPhysicalProviderCalls: number | null;
  maxCostUsd: number | null;
  operational: boolean;
  blockingReasons: string[];
}

export interface RegistryStatus {
  registryPath: string;
  registryHash: string;
  attemptSlotCap: typeof GLOBAL_ATTEMPT_SLOT_CAP;
  preregisteredCandidateSlots: number;
  unallocatedCandidateSlots: number;
  allocationOverCap: boolean;
  operationalPhases: number;
  allPhasesBlocked: boolean;
  phases: RegistryPhaseStatus[];
}

interface RegistryPhase {
  experimentId: string;
  phaseId: string;
  budget: number;
  maxPhysicalProviderCalls: number | null;
  maxCostUsd: number | null;
  registryHash: string;
}

interface StoreOptions {
  storePath: string;
  registryPath: string;
  allowCreate: boolean;
}

function sameCanonicalPath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  return normalize(resolve(left)) === normalize(resolve(right));
}

function assertExistingCanonicalDirectoryWithoutLinks(directory: string, allowedAncestor: string): string {
  const expected = resolve(directory);
  const ancestor = resolve(allowedAncestor);
  const rel = relative(ancestor, expected);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new BudgetGuardError("PRIVATE_STORE_PATH_FORBIDDEN", "Private execution path escaped its allowed root");
  }
  let cursor = ancestor;
  for (const segment of rel.split(/[\\/]+/u).filter(Boolean)) {
    const stats = lstatSync(cursor);
    if (stats.isSymbolicLink()) {
      throw new BudgetGuardError("PRIVATE_STORE_LINK_FORBIDDEN", "Private execution ancestor is a symlink or junction");
    }
    const canonical = realpathSync.native(cursor);
    if (!sameCanonicalPath(canonical, cursor)) {
      throw new BudgetGuardError("PRIVATE_STORE_LINK_FORBIDDEN", "Private execution ancestor is not canonical");
    }
    cursor = resolve(cursor, segment);
  }
  const stats = lstatSync(expected);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new BudgetGuardError("PRIVATE_STORE_LINK_FORBIDDEN", "Private execution root must be a real directory");
  }
  const canonical = realpathSync.native(expected);
  if (!sameCanonicalPath(canonical, expected)) {
    throw new BudgetGuardError("PRIVATE_STORE_LINK_FORBIDDEN", "Private execution root is not canonical");
  }
  return canonical;
}

interface OperationClaim {
  idempotent: boolean;
}

type SqlRow = Record<string, unknown>;

export class BudgetGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BudgetGuardError";
    this.code = code;
  }
}

export class CallReplayPreventedError extends BudgetGuardError {
  readonly call: CallView;

  constructor(call: CallView) {
    super(
      "CALL_REPLAY_PREVENTED",
      `Call ${call.callId} already exists in state ${call.state}; the physical provider callback was not invoked`,
    );
    this.call = call;
  }
}

function requireJsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireJsonArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a JSON array`);
  }
  return value;
}

function nowUtc(): string {
  return new Date().toISOString();
}

export function assertStrictTimestamp(value: unknown, label = "timestamp"): asserts value is string {
  if (typeof value !== "string" || (!STRICT_UTC_PATTERN.test(value) && !STRICT_KST_PATTERN.test(value))) {
    throw new BudgetGuardError(
      "INVALID_TIMESTAMP",
      `${label} must be strict ISO-8601 UTC or +09:00 with millisecond precision`,
    );
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new BudgetGuardError("INVALID_TIMESTAMP", `${label} is not a real timestamp`);
  }
  const canonical = STRICT_UTC_PATTERN.test(value)
    ? new Date(parsed).toISOString()
    : new Date(parsed + 9 * 60 * 60 * 1_000).toISOString().replace("Z", "+09:00");
  if (canonical !== value) {
    throw new BudgetGuardError("INVALID_TIMESTAMP", `${label} is not a canonical real timestamp`);
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new BudgetGuardError(
      "INVALID_ARGUMENT",
      `${label} must be 1-160 safe ASCII identifier characters`,
    );
  }
}

function assertMetadataString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\u0000-\u001f]/.test(value)) {
    throw new BudgetGuardError(
      "INVALID_ARGUMENT",
      `${label} must be a non-empty string of at most 512 characters without control characters`,
    );
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a non-negative safe integer`);
  }
}

function assertNonNegativeFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a non-negative finite number`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be a lowercase SHA-256 hex digest`);
  }
}

function assertCallKind(value: unknown): asserts value is ProviderCallKind {
  if (!['full_question_generation', 'design', 'evaluation'].includes(value as string)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "callKind is invalid");
  }
}

function assertParsedCandidateOutcome(value: unknown): asserts value is ParsedCandidateOutcome {
  if (!['parsed_accepted', 'parsed_rejected'].includes(value as string)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "parsed candidate outcome is invalid");
  }
}

function assertCallOutcome(value: unknown): asserts value is ProviderCallOutcome {
  if (!['success', 'failed', 'unknown'].includes(value as string)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "provider call outcome is invalid");
  }
}

function normalizeProviderUsageObservation(
  value: ProviderUsageObservation,
  fallbackLatencyMs: number,
  defaultUsageFinal: boolean,
): NormalizedProviderUsageObservation {
  if (value === null || typeof value !== "object") {
    throw new BudgetGuardError("INVALID_ARGUMENT", "Provider usage observation must be an object");
  }
  assertNonNegativeInteger(value.inputTokens, "observed inputTokens");
  assertNonNegativeInteger(value.outputTokens, "observed outputTokens");
  assertNonNegativeFinite(value.costUsd, "observed costUsd");
  const latencyMs = value.latencyMs ?? fallbackLatencyMs;
  assertNonNegativeInteger(latencyMs, "observed latencyMs");
  const usageFinal = value.usageFinal ?? defaultUsageFinal;
  if (typeof usageFinal !== "boolean") {
    throw new BudgetGuardError("INVALID_ARGUMENT", "observed usageFinal must be boolean");
  }
  if (value.providerRequestId !== undefined) {
    assertMetadataString(value.providerRequestId, "observed providerRequestId");
  }
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    costUsd: value.costUsd,
    latencyMs,
    usageFinal,
    providerRequestId: value.providerRequestId,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "Values must be JSON serializable");
  }
  return serialized;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashProviderOutput(value: string | Uint8Array): string {
  return sha256(value);
}

function asNumber(value: unknown, label: string): number {
  if (typeof value === "bigint") {
    const converted = Number(value);
    if (!Number.isSafeInteger(converted)) {
      throw new BudgetGuardError("INVALID_SCHEMA", `${label} exceeds safe integer range`);
    }
    return converted;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BudgetGuardError("INVALID_SCHEMA", `${label} is not numeric`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new BudgetGuardError("INVALID_SCHEMA", `${label} is not a string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, label);
}

function asTimestamp(value: unknown, label: string): string {
  const timestamp = asString(value, label);
  assertStrictTimestamp(timestamp, label);
  return timestamp;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asTimestamp(value, label);
}

function booleanFromSql(value: unknown): boolean {
  return asNumber(value, "boolean") === 1;
}

function defaultStorePath(): string {
  const base = process.platform === "win32" && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "Codex", "research-ledgers")
    : join(homedir(), ".codex", "research-ledgers");
  return join(base, `${CAMPAIGN_ID}.sqlite`);
}

export function getCanonicalStorePath(): string {
  return defaultStorePath();
}

function registryError(message: string): never {
  throw new BudgetGuardError("REGISTRY_INVALID", message);
}

function validateRegistryIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    registryError(`${label} must be a safe 1-160 character identifier`);
  }
}

function validateRegistryBudget(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    registryError(`${label} must be a non-negative safe integer`);
  }
}

function registryCallCap(record: Record<string, unknown>, label: string): number | null {
  const hasCanonical = Object.prototype.hasOwnProperty.call(record, "maxPhysicalProviderCalls");
  const hasLegacyAlias = Object.prototype.hasOwnProperty.call(record, "maxProviderCalls");
  if (hasCanonical && hasLegacyAlias && record.maxPhysicalProviderCalls !== record.maxProviderCalls) {
    registryError(`${label} has conflicting maxPhysicalProviderCalls/maxProviderCalls values`);
  }
  const value = hasCanonical ? record.maxPhysicalProviderCalls : record.maxProviderCalls;
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    registryError(`${label} maxPhysicalProviderCalls must be null or a non-negative safe integer`);
  }
  return value;
}

function registryCostCap(record: Record<string, unknown>, label: string): number | null {
  const value = record.maxCostUsd;
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    registryError(`${label} maxCostUsd must be null or a non-negative finite number`);
  }
  return value;
}

function validateRegistryShape(raw: Record<string, unknown>): void {
  const experiments = raw.registeredExperiments;
  if (!Array.isArray(experiments)) {
    registryError("registeredExperiments must be an array");
  }
  const experimentIds = new Set<string>();
  for (const [experimentIndex, entry] of experiments.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      registryError(`registeredExperiments[${experimentIndex}] must be an object`);
    }
    const experiment = entry as Record<string, unknown>;
    validateRegistryIdentifier(experiment.id, `registeredExperiments[${experimentIndex}].id`);
    if (experimentIds.has(experiment.id)) {
      registryError(`Duplicate experiment id ${experiment.id}`);
    }
    experimentIds.add(experiment.id);

    const authorized = experiment.status === "registered" || experiment.status === "in_progress";
    registryCallCap(experiment, `Experiment ${experiment.id}`);
    registryCostCap(experiment, `Experiment ${experiment.id}`);
    if (experiment.phases !== undefined) {
      if (!Array.isArray(experiment.phases) || experiment.phases.length === 0) {
        registryError(`Experiment ${experiment.id} phases must be a non-empty array`);
      }
      if (experiment.apiCandidateBudget !== undefined) {
        registryError(`Experiment ${experiment.id} cannot define both phases and apiCandidateBudget`);
      }
      const phaseIds = new Set<string>();
      for (const [phaseIndex, phaseEntry] of experiment.phases.entries()) {
        if (phaseEntry === null || typeof phaseEntry !== "object" || Array.isArray(phaseEntry)) {
          registryError(`Experiment ${experiment.id} phase ${phaseIndex} must be an object`);
        }
        const phase = phaseEntry as Record<string, unknown>;
        validateRegistryIdentifier(phase.id, `Experiment ${experiment.id} phase ${phaseIndex} id`);
        if (phaseIds.has(phase.id)) {
          registryError(`Experiment ${experiment.id} has duplicate phase id ${phase.id}`);
        }
        phaseIds.add(phase.id);
        registryCallCap(phase, `Experiment ${experiment.id}/${phase.id}`);
        registryCostCap(phase, `Experiment ${experiment.id}/${phase.id}`);
        if (phase.status === "registered" || phase.status === "in_progress") {
          validateRegistryBudget(
            phase.apiCandidateBudget,
            `Experiment ${experiment.id}/${phase.id} apiCandidateBudget`,
          );
        }
      }
    } else if (authorized) {
      validateRegistryBudget(
        experiment.apiCandidateBudget,
        `Experiment ${experiment.id} apiCandidateBudget`,
      );
    }
  }
}

function loadRegistry(registryPath: string): { raw: Record<string, unknown>; hash: string } {
  let rawText: string;
  try {
    rawText = readFileSync(registryPath, "utf8");
  } catch (error) {
    throw new BudgetGuardError(
      "REGISTRY_READ_FAILED",
      `Unable to read experiment registry (${error instanceof Error ? error.name : "unknown"})`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new BudgetGuardError("REGISTRY_INVALID", "Experiment registry is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BudgetGuardError("REGISTRY_INVALID", "Experiment registry root must be an object");
  }
  const raw = parsed as Record<string, unknown>;
  validateRegistryShape(raw);
  return { raw, hash: sha256(rawText) };
}

function resolveRegistryPhase(
  registry: { raw: Record<string, unknown>; hash: string },
  experimentId: string,
  phaseId: string,
): RegistryPhase {
  const experiments = registry.raw.registeredExperiments;
  if (!Array.isArray(experiments)) {
    throw new BudgetGuardError("REGISTRY_INVALID", "registeredExperiments must be an array");
  }
  const experiment = experiments.find(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      (entry as Record<string, unknown>).id === experimentId,
  ) as Record<string, unknown> | undefined;
  if (!experiment) {
    throw new BudgetGuardError("EXPERIMENT_NOT_REGISTERED", `Experiment ${experimentId} is not registered`);
  }
  if (experiment.status !== "registered" && experiment.status !== "in_progress") {
    throw new BudgetGuardError(
      "EXPERIMENT_NOT_AUTHORIZED",
      `Experiment ${experimentId} status is not registered/in_progress`,
    );
  }

  const phases = experiment.phases;
  if (Array.isArray(phases)) {
    const phase = phases.find(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).id === phaseId,
    ) as Record<string, unknown> | undefined;
    if (!phase) {
      throw new BudgetGuardError(
        "PHASE_NOT_REGISTERED",
        `Phase ${phaseId} is not preregistered for ${experimentId}`,
      );
    }
    if (phase.status !== "registered" && phase.status !== "in_progress") {
      throw new BudgetGuardError(
        "PHASE_NOT_AUTHORIZED",
        `Phase ${experimentId}/${phaseId} is not registered/in_progress`,
      );
    }
    assertNonNegativeInteger(phase.apiCandidateBudget, "phase apiCandidateBudget");
    return {
      experimentId,
      phaseId,
      budget: phase.apiCandidateBudget,
      maxPhysicalProviderCalls: registryCallCap(phase, `Experiment ${experimentId}/${phaseId}`),
      maxCostUsd: registryCostCap(phase, `Experiment ${experimentId}/${phaseId}`),
      registryHash: registry.hash,
    };
  }

  if (phaseId !== "default") {
    throw new BudgetGuardError(
      "PHASE_NOT_REGISTERED",
      `Experiment ${experimentId} has only the default phase`,
    );
  }
  assertNonNegativeInteger(experiment.apiCandidateBudget, "experiment apiCandidateBudget");
  return {
    experimentId,
    phaseId,
    budget: experiment.apiCandidateBudget,
    maxPhysicalProviderCalls: registryCallCap(experiment, `Experiment ${experimentId}`),
    maxCostUsd: registryCostCap(experiment, `Experiment ${experimentId}`),
    registryHash: registry.hash,
  };
}

function assertPhaseOperational(
  phase: RegistryPhase,
): asserts phase is RegistryPhase & { maxPhysicalProviderCalls: number; maxCostUsd: number } {
  if (phase.budget <= 0) {
    throw new BudgetGuardError(
      "NO_PREREGISTERED_BUDGET",
      `${phase.experimentId}/${phase.phaseId} has no positive API candidate budget`,
    );
  }
  if (phase.maxPhysicalProviderCalls === null) {
    throw new BudgetGuardError(
      "PHASE_CALL_CAP_UNSET",
      `${phase.experimentId}/${phase.phaseId} has no preregistered physical provider-call cap`,
    );
  }
  if (phase.maxCostUsd === null) {
    throw new BudgetGuardError(
      "PHASE_COST_CAP_UNSET",
      `${phase.experimentId}/${phase.phaseId} has no preregistered USD cap`,
    );
  }
}

function inspectRegistryStatus(registryPath: string): RegistryStatus {
  const absolutePath = resolve(registryPath);
  const registry = loadRegistry(absolutePath);
  const experiments = registry.raw.registeredExperiments as Array<Record<string, unknown>>;
  const phases: RegistryPhaseStatus[] = [];
  let preregisteredCandidateSlots = 0;
  for (const experiment of experiments) {
    const experimentId = asString(experiment.id, "registry experiment id");
    const experimentStatus = typeof experiment.status === "string" ? experiment.status : "missing";
    const experimentAuthorized = experimentStatus === "registered" || experimentStatus === "in_progress";
    const phaseEntries = Array.isArray(experiment.phases)
      ? (experiment.phases as Array<Record<string, unknown>>)
      : [null];
    for (const phase of phaseEntries) {
      const phaseId = phase ? asString(phase.id, "registry phase id") : "default";
      const phaseStatus = phase
        ? (typeof phase.status === "string" ? phase.status : "missing")
        : null;
      const phaseAuthorized =
        phase === null || phaseStatus === "registered" || phaseStatus === "in_progress";
      const source = phase ?? experiment;
      const rawBudget = source.apiCandidateBudget;
      const apiCandidateBudget =
        typeof rawBudget === "number" && Number.isSafeInteger(rawBudget) && rawBudget >= 0
          ? rawBudget
          : null;
      const maxPhysicalProviderCalls = registryCallCap(
        source,
        `Experiment ${experimentId}/${phaseId}`,
      );
      const maxCostUsd = registryCostCap(source, `Experiment ${experimentId}/${phaseId}`);
      const blockingReasons: string[] = [];
      if (!experimentAuthorized) blockingReasons.push("experiment_not_authorized");
      if (!phaseAuthorized) blockingReasons.push("phase_not_authorized");
      if (apiCandidateBudget === null || apiCandidateBudget <= 0) {
        blockingReasons.push("no_positive_candidate_budget");
      }
      if (maxPhysicalProviderCalls === null) {
        blockingReasons.push("physical_call_cap_unset");
      } else if (maxPhysicalProviderCalls === 0) {
        blockingReasons.push("physical_call_cap_zero");
      }
      if (maxCostUsd === null) blockingReasons.push("usd_cap_unset");
      if (experimentAuthorized && phaseAuthorized && apiCandidateBudget !== null) {
        preregisteredCandidateSlots += apiCandidateBudget;
      }
      phases.push({
        experimentId,
        phaseId,
        experimentStatus,
        phaseStatus,
        apiCandidateBudget,
        maxPhysicalProviderCalls,
        maxCostUsd,
        operational: blockingReasons.length === 0,
        blockingReasons,
      });
    }
  }
  const operationalPhases = phases.filter((phase) => phase.operational).length;
  return {
    registryPath: absolutePath,
    registryHash: registry.hash,
    attemptSlotCap: GLOBAL_ATTEMPT_SLOT_CAP,
    preregisteredCandidateSlots,
    unallocatedCandidateSlots: GLOBAL_ATTEMPT_SLOT_CAP - preregisteredCandidateSlots,
    allocationOverCap: preregisteredCandidateSlots > GLOBAL_ATTEMPT_SLOT_CAP,
    operationalPhases,
    allPhasesBlocked: operationalPhases === 0,
    phases,
  };
}

function ensureTestPath(path: string): void {
  if (process.env[TEST_MODE_ENV] !== "1") {
    throw new BudgetGuardError("TEST_STORE_FORBIDDEN", "Test store injection is disabled");
  }
  const absolute = resolve(path);
  const root = resolve(tmpdir());
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new BudgetGuardError("TEST_STORE_FORBIDDEN", "Test stores must live under the OS temp directory");
  }
}

function validateBatchRef(ref: BatchRef): void {
  assertIdentifier(ref.experimentId, "experimentId");
  assertIdentifier(ref.phaseId, "phaseId");
  assertIdentifier(ref.batchId, "batchId");
}

function fingerprint(kind: string, input: unknown): string {
  return sha256(stableStringify({ kind, input }));
}

function derivedOperationKey(base: string, suffix: string): string {
  return `auto:${sha256(`${base}\u0000${suffix}`)}`;
}

function atomicWrite(path: string, content: string): Promise<void> {
  return (async () => {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, path);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  })();
}

function verifyAuditChainForDatabase(db: DatabaseSync): void {
  const rows = db.prepare(
    `SELECT sequence, operation_key, ordinal, event_type, entity_type, entity_id,
            payload_json, previous_hash, event_hash, created_at
     FROM audit_events ORDER BY sequence`,
  ).all();
  let expectedPrevious = ZERO_HASH;
  let expectedSequence = 1;
  for (const row of rows) {
    const sequence = asNumber(row.sequence, "audit sequence");
    if (sequence !== expectedSequence) {
      throw new BudgetGuardError("AUDIT_CHAIN_INVALID", "Audit sequence is not contiguous");
    }
    const previousHash = asString(row.previous_hash, "audit previous_hash");
    const eventHash = asString(row.event_hash, "audit event_hash");
    const createdAt = asString(row.created_at, "audit created_at");
    assertStrictTimestamp(createdAt, "audit created_at");
    const eventType = asString(row.event_type, "audit event_type");
    if (!AUDIT_EVENT_TYPES.has(eventType)) {
      throw new BudgetGuardError("AUDIT_CHAIN_INVALID", `Unknown audit event type at ${sequence}`);
    }
    const entityType = asString(row.entity_type, "audit entity_type");
    if (AUDIT_ENTITY_BY_EVENT[eventType as AuditEventType] !== entityType) {
      throw new BudgetGuardError(
        "AUDIT_CHAIN_INVALID",
        `Audit entity type does not match ${eventType} at sequence ${sequence}`,
      );
    }
    if (previousHash !== expectedPrevious) {
      throw new BudgetGuardError("AUDIT_CHAIN_INVALID", `Audit chain broke at sequence ${sequence}`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(asString(row.payload_json, "audit payload_json"));
    } catch {
      throw new BudgetGuardError("AUDIT_CHAIN_INVALID", `Audit payload ${sequence} is invalid JSON`);
    }
    const material = stableStringify({
      campaignId: CAMPAIGN_ID,
      operationKey: asString(row.operation_key, "audit operation_key"),
      ordinal: asNumber(row.ordinal, "audit ordinal"),
      eventType,
      entityType,
      entityId: asString(row.entity_id, "audit entity_id"),
      payload,
      previousHash,
      createdAt,
    });
    if (sha256(material) !== eventHash) {
      throw new BudgetGuardError("AUDIT_CHAIN_INVALID", `Audit hash mismatch at sequence ${sequence}`);
    }
    expectedPrevious = eventHash;
    expectedSequence += 1;
  }
}

function summarizeDatabase(db: DatabaseSync): CampaignSummary {
  verifyAuditChainForDatabase(db);
  const used = asNumber(
    db.prepare("SELECT COUNT(*) AS count FROM candidate_slots").get()?.count ?? 0,
    "used attempt slots",
  );
  const committed = asNumber(
    db.prepare(
      "SELECT COALESCE(SUM(allocated_slots - released_slots), 0) AS count FROM batches WHERE campaign_id = ?",
    ).get(CAMPAIGN_ID)?.count ?? 0,
    "campaign committed slots",
  );
  const batchCounts = db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) AS open_count,
            COALESCE(SUM(CASE WHEN breached = 1 THEN 1 ELSE 0 END), 0) AS breached_count
     FROM batches`,
  ).get() ?? {};
  const callCounts = db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN state IN ('authorized', 'in_flight') THEN 1 ELSE 0 END), 0) AS unresolved,
            COALESCE(SUM(actual_cost_usd), 0) AS actual_cost,
            COALESCE(SUM(CASE
              WHEN state IN ('authorized', 'in_flight') THEN reserved_cost_usd
              WHEN usage_final = 0 THEN MAX(reserved_cost_usd, actual_cost_usd)
              ELSE actual_cost_usd END), 0) AS effective_cost
     FROM provider_calls`,
  ).get() ?? {};
  const candidateCounts = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN state = 'awaiting_result' THEN 1 ELSE 0 END), 0) AS awaiting_count,
       COALESCE(SUM(CASE WHEN state = 'parsed_pending' THEN 1 ELSE 0 END), 0) AS pending_count
     FROM candidate_slots`,
  ).get() ?? {};
  const audit = db.prepare("SELECT COUNT(*) AS count FROM audit_events").get() ?? {};
  const head = db.prepare("SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1").get();
  return {
    campaignId: CAMPAIGN_ID,
    schemaVersion: STORE_SCHEMA_VERSION,
    attemptSlotCap: GLOBAL_ATTEMPT_SLOT_CAP,
    usedAttemptSlots: used,
    reservedAttemptSlots: Math.max(0, committed - used),
    remainingUnreservedAttemptSlots: GLOBAL_ATTEMPT_SLOT_CAP - committed,
    batches: asNumber(batchCounts.total ?? 0, "batch count"),
    openBatches: asNumber(batchCounts.open_count ?? 0, "open batch count"),
    breachedBatches: asNumber(batchCounts.breached_count ?? 0, "breached batch count"),
    providerCalls: asNumber(callCounts.total ?? 0, "provider call count"),
    unresolvedCalls: asNumber(callCounts.unresolved ?? 0, "unresolved call count"),
    openCandidateSlots: asNumber(candidateCounts.awaiting_count ?? 0, "open candidates"),
    parsedPendingCandidateSlots: asNumber(
      candidateCounts.pending_count ?? 0,
      "parsed pending candidates",
    ),
    actualCostUsd: asNumber(callCounts.actual_cost ?? 0, "actual cost"),
    effectiveCostUsd: asNumber(callCounts.effective_cost ?? 0, "effective cost"),
    auditEvents: asNumber(audit.count ?? 0, "audit count"),
    auditHeadHash: head ? asString(head.event_hash, "audit head") : ZERO_HASH,
  };
}

export class BudgetStore {
  readonly storePath: string;
  readonly registryPath: string;
  private readonly db: DatabaseSync;
  private closed = false;

  private constructor(options: StoreOptions) {
    this.storePath = resolve(options.storePath);
    this.registryPath = resolve(options.registryPath);
    loadRegistry(this.registryPath);
    mkdirSync(dirname(this.storePath), { recursive: true });
    this.db = new DatabaseSync(this.storePath);
    try {
      this.initialize(options.allowCreate);
      this.verifyAuditChain();
      this.verifyAllControllerRecoveryInvariants();
    } catch (error) {
      this.db.close();
      this.closed = true;
      throw error;
    }
  }

  static openCanonical(allowCreate = false): BudgetStore {
    const storePath = defaultStorePath();
    if (!allowCreate && !existsSync(storePath)) {
      throw new BudgetGuardError(
        "STORE_NOT_INITIALIZED",
        "Canonical budget store does not exist; initialize it explicitly before use",
      );
    }
    return new BudgetStore({
      storePath,
      registryPath: DEFAULT_REGISTRY_PATH,
      allowCreate,
    });
  }

  static openForTesting(storePath: string, registryPath: string): BudgetStore {
    ensureTestPath(storePath);
    ensureTestPath(registryPath);
    return new BudgetStore({ storePath, registryPath, allowCreate: true });
  }

  static prepareConnectivityPilotPrivateExecutionDirectory(
    executionDirectoryName: string,
  ): string {
    if (!CONNECTIVITY_PILOT_EXECUTION_DIR.test(executionDirectoryName)) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_PATH_FORBIDDEN",
        "Connectivity pilot execution directory name is invalid",
      );
    }
    const privateRoot = assertExistingCanonicalDirectoryWithoutLinks(
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
    );
    const executionRoot = resolve(privateRoot, executionDirectoryName);
    const rel = relative(privateRoot, executionRoot);
    if (rel !== executionDirectoryName || rel.startsWith("..") || isAbsolute(rel) || existsSync(executionRoot)) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
        "Connectivity pilot execution root must be a new direct child",
      );
    }
    mkdirSync(executionRoot, { recursive: false, mode: 0o700 });
    const canonical = assertExistingCanonicalDirectoryWithoutLinks(executionRoot, privateRoot);
    if (readdirSync(canonical).length !== 0) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
        "Prepared connectivity pilot execution root was not empty",
      );
    }
    return canonical;
  }

  static initializePreparedConnectivityPilotPrivateExecution(input: {
    executionDirectoryName: string;
    registryJson: string;
  }): BudgetStore {
    if (!CONNECTIVITY_PILOT_EXECUTION_DIR.test(input.executionDirectoryName)) {
      throw new BudgetGuardError("PRIVATE_STORE_PATH_FORBIDDEN", "Connectivity pilot execution directory name is invalid");
    }
    if (typeof input.registryJson !== "string" || Buffer.byteLength(input.registryJson, "utf8") > 256 * 1024) {
      throw new BudgetGuardError("REGISTRY_INVALID", "Private pilot registry bytes are invalid");
    }
    if (/(?:OPENROUTER_API_KEY|Bearer\s+|sk-or-v1-|credentialValue|\.env(?:\.|\b))/iu.test(input.registryJson)) {
      throw new BudgetGuardError("REGISTRY_INVALID", "Private pilot registry contains forbidden secret or env material");
    }
    const privateRoot = assertExistingCanonicalDirectoryWithoutLinks(
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
    );
    const expectedRoot = resolve(privateRoot, input.executionDirectoryName);
    const canonicalRoot = assertExistingCanonicalDirectoryWithoutLinks(expectedRoot, privateRoot);
    if (!sameCanonicalPath(expectedRoot, canonicalRoot) || readdirSync(canonicalRoot).length !== 0) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
        "Prepared pilot execution root must still be empty",
      );
    }
    const registryPath = resolve(canonicalRoot, "experiment-registry.private.json");
    const storePath = resolve(canonicalRoot, "pilot-ledger.sqlite");
    let registryHandle: number | null = null;
    let storeHandle: number | null = null;
    try {
      registryHandle = openSync(registryPath, "wx", 0o600);
      writeFileSync(registryHandle, input.registryJson, { encoding: "utf8" });
      closeSync(registryHandle);
      registryHandle = null;
      storeHandle = openSync(storePath, "wx", 0o600);
      closeSync(storeHandle);
      storeHandle = null;
      return new BudgetStore({ storePath, registryPath, allowCreate: true });
    } finally {
      if (registryHandle !== null) closeSync(registryHandle);
      if (storeHandle !== null) closeSync(storeHandle);
    }
  }

  /**
   * Creates the connectivity pilot's one-use production ledger in a brand-new,
   * private, direct child directory. This is deliberately not a general path
   * injection seam: the allowed root and filenames are compiled into the
   * guard, existing roots/databases are rejected, and no TEST_MODE is used.
   */
  static createConnectivityPilotPrivateExecution(input: {
    executionDirectoryName: string;
    registryJson: string;
  }): BudgetStore {
    if (!CONNECTIVITY_PILOT_EXECUTION_DIR.test(input.executionDirectoryName)) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_PATH_FORBIDDEN",
        "Connectivity pilot execution directory name is invalid",
      );
    }
    if (typeof input.registryJson !== "string" || Buffer.byteLength(input.registryJson, "utf8") > 256 * 1024) {
      throw new BudgetGuardError("REGISTRY_INVALID", "Private pilot registry bytes are invalid");
    }
    const forbiddenRegistryText = /(?:OPENROUTER_API_KEY|Bearer\s+|sk-or-v1-|credentialValue|\.env(?:\.|\b))/iu;
    if (forbiddenRegistryText.test(input.registryJson)) {
      throw new BudgetGuardError("REGISTRY_INVALID", "Private pilot registry contains forbidden secret or env material");
    }

    const privateRoot = assertExistingCanonicalDirectoryWithoutLinks(
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
      CONNECTIVITY_PILOT_PRIVATE_ROOT,
    );
    const executionRoot = resolve(privateRoot, input.executionDirectoryName);
    const rel = relative(privateRoot, executionRoot);
    if (
      rel !== input.executionDirectoryName ||
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      existsSync(executionRoot)
    ) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
        "Connectivity pilot execution root must be a new direct child",
      );
    }

    // `recursive:false` gives mkdir exclusive-create semantics. A concurrent
    // process wins or loses atomically; an existing path is never reused.
    mkdirSync(executionRoot, { recursive: false, mode: 0o700 });
    const canonicalRoot = assertExistingCanonicalDirectoryWithoutLinks(executionRoot, privateRoot);
    if (readdirSync(canonicalRoot).length !== 0) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
        "New connectivity pilot execution root was not empty",
      );
    }

    const registryPath = resolve(canonicalRoot, "experiment-registry.private.json");
    const storePath = resolve(canonicalRoot, "pilot-ledger.sqlite");
    for (const candidate of [registryPath, storePath]) {
      const candidateRel = relative(canonicalRoot, candidate);
      if (candidateRel.startsWith("..") || isAbsolute(candidateRel) || existsSync(candidate)) {
        throw new BudgetGuardError(
          "PRIVATE_STORE_EXISTING_PATH_FORBIDDEN",
          "Private pilot registry/database path already exists or escaped",
        );
      }
    }
    if (readdirSync(canonicalRoot).some((name) => /^\.env(?:\.|$)|^public(?:[._-]|$)/iu.test(name))) {
      throw new BudgetGuardError(
        "PRIVATE_STORE_ADJACENT_PATH_FORBIDDEN",
        "Private pilot root contains an env/public adjacent path",
      );
    }

    let registryHandle: number | null = null;
    let storeHandle: number | null = null;
    try {
      registryHandle = openSync(registryPath, "wx", 0o600);
      writeFileSync(registryHandle, input.registryJson, { encoding: "utf8" });
      closeSync(registryHandle);
      registryHandle = null;
      // Reserve the database inode exclusively before SQLite opens it. The
      // guard will initialize this exact empty file; overwrite/reuse is never
      // accepted.
      storeHandle = openSync(storePath, "wx", 0o600);
      closeSync(storeHandle);
      storeHandle = null;
      const store = new BudgetStore({ storePath, registryPath, allowCreate: true });
      if (
        !sameCanonicalPath(store.storePath, storePath) ||
        !sameCanonicalPath(store.registryPath, registryPath)
      ) {
        store.close();
        throw new BudgetGuardError(
          "PRIVATE_STORE_PATH_FORBIDDEN",
          "Private pilot store did not retain its canonical paths",
        );
      }
      return store;
    } finally {
      if (registryHandle !== null) closeSync(registryHandle);
      if (storeHandle !== null) closeSync(storeHandle);
    }
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new BudgetGuardError("STORE_CLOSED", "Budget store is closed");
  }

  private verifyAllControllerRecoveryInvariants(): void {
    const assignments = this.db.prepare(
      "SELECT assignment_id FROM controller_assignments ORDER BY assignment_id",
    ).all();
    for (const row of assignments) {
      this.getControllerAssignmentRecovery(asString(row.assignment_id, "assignment_id"));
    }
  }

  private verifyCriticalSchemaDefinitions(): void {
    const exactColumns: Record<string, readonly string[]> = {
      controller_call_contracts: [
        "call_id", "assignment_id", "controller_registry_hash", "controller_entry_id",
        "controller_entry_hash", "transition_id", "entry_max_uses",
        "parent_physical_call_id", "request_hash", "request_json", "provenance_hash",
        "provenance_json", "endpoint_hash", "wire_body_hash", "wire_prompt_hash",
        "wire_schema_hash", "canonical_request_hash", "parser_artifact_hash",
        "derivation_contract_id", "derivation_receipt_hash", "pricing_contract_hash",
        "rolling_pricing_attestation_hash", "created_at",
      ],
      controller_authorization_windows: [
        "campaign_semantic_sha256", "credential_public_id", "window_ordinal",
        "previous_authorization_record_sha256", "authorization_record_sha256",
        "provider_usage_usd", "provider_remaining_usd", "provider_hard_limit_usd",
        "created_at",
      ],
      sealed_controller_campaigns: [
        "batch_row_id", "campaign_semantic_sha256", "durable_batch_identity_sha256",
        "expected_assignment_count", "expected_assignment_ids_json",
        "expected_assignment_set_sha256", "created_at",
      ],
      sealed_controller_campaign_terminals: [
        "batch_row_id", "terminal_status", "assignment_count",
        "consumed_dispatch_count", "operation_key", "created_at",
      ],
      controller_terminal_evidence: [
        "call_id", "terminal_kind", "evidence_hash", "evidence_json", "operation_key",
        "created_at",
      ],
      controller_response_bodies: [
        "call_id", "response_body_hash", "byte_length", "response_body", "operation_key",
        "created_at",
      ],
      controller_clone_evidence: [
        "call_id", "response_body_hash", "evidence_hash", "evidence_json", "operation_key",
        "created_at",
      ],
      controller_parser_evidence: [
        "call_id", "response_body_hash", "parser_artifact_hash", "disposition",
        "disposition_reason", "observed_output_count", "output_hashes_json",
        "evidence_hash", "evidence_json", "operation_key", "created_at",
      ],
      controller_semantic_candidates: [
        "call_id", "output_index", "output_hash", "parser_evidence_hash", "created_at",
      ],
    };
    for (const [table, expected] of Object.entries(exactColumns)) {
      const columns = this.db.prepare(`PRAGMA table_xinfo(${table})`).all();
      const actual = columns.map((row) => asString(row.name, `${table} column`));
      if (
        stableStringify([...actual].sort()) !== stableStringify([...expected].sort()) ||
        columns.some((row) => asNumber(row.hidden, `${table} hidden`) !== 0)
      ) {
        throw new BudgetGuardError(
          "STORE_SCHEMA_INCOMPLETE",
          `${table} does not have the exact required column set`,
        );
      }
    }

    const appendOnlyTables = [
      "operations", "usage_reconciliations", "controller_registries",
      "controller_registry_entries", "controller_call_contracts",
      "controller_terminal_evidence", "controller_response_bodies",
      "controller_clone_evidence", "controller_parser_evidence",
      "controller_semantic_candidates", "controller_authorization_windows",
      "sealed_controller_campaigns", "sealed_controller_campaign_terminals",
    ];
    for (const table of appendOnlyTables) {
      for (const operation of ["update", "delete"] as const) {
        const name = `${table}_no_${operation}`;
        const trigger = this.db.prepare(
          "SELECT tbl_name, sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
        ).get(name);
        const sql = trigger ? asString(trigger.sql, `${name} sql`).toLowerCase() : "";
        if (
          trigger?.tbl_name !== table ||
          !sql.includes(`before ${operation} on ${table}`) ||
          !sql.includes("raise(abort") ||
          !sql.includes("append-only")
        ) {
          throw new BudgetGuardError(
            "STORE_SCHEMA_INCOMPLETE",
            `${name} is missing or is a look-alike trigger`,
          );
        }
      }
    }

    const exactIndexes = {
      candidate_output_identity_unique: {
        unique: 1, partial: 1, columns: ["producing_call_id", "output_index"],
      },
      candidate_output_hash_unique: {
        unique: 1, partial: 1, columns: ["output_hash"],
      },
      provider_call_logical_attempt_unique: {
        unique: 1, partial: 0,
        columns: ["batch_row_id", "logical_operation_id", "physical_attempt_ordinal"],
      },
      controller_call_contracts_assignment_idx: {
        unique: 0, partial: 0, columns: ["assignment_id", "controller_entry_id"],
      },
    } as const;
    for (const [name, expected] of Object.entries(exactIndexes)) {
      const owner = this.db.prepare(
        "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?",
      ).get(name);
      if (!owner) {
        throw new BudgetGuardError("STORE_SCHEMA_INCOMPLETE", `required index ${name} is absent`);
      }
      const list = this.db.prepare(`PRAGMA index_list(${asString(owner.tbl_name, "index owner")})`)
        .all().find((row) => row.name === name);
      const columns = this.db.prepare(`PRAGMA index_info(${name})`).all()
        .map((row) => asString(row.name, `${name} column`));
      if (
        !list ||
        asNumber(list.unique, `${name} unique`) !== expected.unique ||
        asNumber(list.partial, `${name} partial`) !== expected.partial ||
        stableStringify(columns) !== stableStringify(expected.columns)
      ) {
        throw new BudgetGuardError(
          "STORE_SCHEMA_INCOMPLETE",
          `${name} is a look-alike index with unsafe semantics`,
        );
      }
    }
  }

  private initialize(allowCreate: boolean): void {
    this.db.exec("PRAGMA busy_timeout=15000;");
    const currentJournalMode = this.db.prepare("PRAGMA journal_mode").get();
    const journalMode = currentJournalMode
      ? asString(currentJournalMode.journal_mode, "journal_mode").toLowerCase()
      : "";
    if (journalMode !== "wal") {
      const configured = this.db.prepare("PRAGMA journal_mode=WAL").get();
      if (!configured || asString(configured.journal_mode, "journal_mode").toLowerCase() !== "wal") {
        throw new BudgetGuardError("SQLITE_CONFIGURATION_FAILED", "SQLite WAL mode is required");
      }
    }
    this.db.exec("PRAGMA synchronous=FULL;");
    this.db.exec("PRAGMA foreign_keys=ON;");
    const existingCampaignTable = this.db.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'campaigns'",
    ).get();
    if (!existingCampaignTable && !allowCreate) {
      throw new BudgetGuardError(
        "STORE_NOT_INITIALIZED",
        "Canonical budget store has not been initialized with the v4 campaign schema",
      );
    }
    if (existingCampaignTable) {
      const existingCampaign = this.db.prepare(
        "SELECT campaign_id, schema_version, attempt_slot_cap FROM campaigns LIMIT 2",
      ).all();
      if (existingCampaign.length !== 1) {
        throw new BudgetGuardError(
          "CAMPAIGN_MISMATCH",
          "Existing SQLite store must contain exactly one campaign",
        );
      }
      const row = existingCampaign[0];
      if (!row || row.campaign_id !== CAMPAIGN_ID) {
        throw new BudgetGuardError("CAMPAIGN_MISMATCH", "SQLite store belongs to another campaign");
      }
      if (
        asNumber(row.schema_version, "schema_version") !== STORE_SCHEMA_VERSION ||
        asNumber(row.attempt_slot_cap, "attempt_slot_cap") !== GLOBAL_ATTEMPT_SLOT_CAP
      ) {
        throw new BudgetGuardError(
          "SCHEMA_MIGRATION_REQUIRED",
          "Budget store is not schema v4/cap 1000",
        );
      }
      if (!allowCreate) {
        const requiredObjects: Array<["table" | "index" | "trigger", string]> = [
          ["table", "campaigns"],
          ["table", "operations"],
          ["table", "batches"],
          ["table", "candidate_slots"],
          ["table", "provider_calls"],
          ["table", "call_candidate_slots"],
          ["table", "usage_reconciliations"],
          ["table", "controller_registries"],
          ["table", "controller_registry_entries"],
          ["table", "controller_assignments"],
          ["table", "controller_call_contracts"],
          ["table", "controller_terminal_evidence"],
          ["table", "controller_response_bodies"],
          ["table", "controller_clone_evidence"],
          ["table", "controller_parser_evidence"],
          ["table", "controller_semantic_candidates"],
          ["table", "controller_authorization_windows"],
          ["table", "sealed_controller_campaigns"],
          ["table", "sealed_controller_campaign_terminals"],
          ["table", "audit_events"],
          ["index", "candidate_output_identity_unique"],
          ["index", "candidate_output_hash_unique"],
          ["index", "candidate_slots_batch_idx"],
          ["index", "provider_calls_batch_idx"],
          ["index", "provider_call_logical_attempt_unique"],
          ["index", "batches_phase_idx"],
          ["index", "controller_assignments_batch_idx"],
          ["index", "controller_call_contracts_assignment_idx"],
          ["trigger", "audit_events_no_update"],
          ["trigger", "audit_events_no_delete"],
          ["trigger", "operations_no_update"],
          ["trigger", "operations_no_delete"],
          ["trigger", "usage_reconciliations_no_update"],
          ["trigger", "usage_reconciliations_no_delete"],
          ["trigger", "controller_registries_no_update"],
          ["trigger", "controller_registries_no_delete"],
          ["trigger", "controller_registry_entries_no_update"],
          ["trigger", "controller_registry_entries_no_delete"],
          ["trigger", "controller_call_contracts_no_update"],
          ["trigger", "controller_call_contracts_no_delete"],
          ["trigger", "controller_terminal_evidence_no_update"],
          ["trigger", "controller_terminal_evidence_no_delete"],
          ["trigger", "controller_response_bodies_no_update"],
          ["trigger", "controller_response_bodies_no_delete"],
          ["trigger", "controller_clone_evidence_no_update"],
          ["trigger", "controller_clone_evidence_no_delete"],
          ["trigger", "controller_parser_evidence_no_update"],
          ["trigger", "controller_parser_evidence_no_delete"],
          ["trigger", "controller_semantic_candidates_no_update"],
          ["trigger", "controller_semantic_candidates_no_delete"],
          ["trigger", "controller_authorization_windows_no_update"],
          ["trigger", "controller_authorization_windows_no_delete"],
          ["trigger", "sealed_controller_campaigns_no_update"],
          ["trigger", "sealed_controller_campaigns_no_delete"],
          ["trigger", "sealed_controller_campaign_terminals_no_update"],
          ["trigger", "sealed_controller_campaign_terminals_no_delete"],
        ];
        for (const [type, name] of requiredObjects) {
          if (!this.db.prepare(
            "SELECT 1 AS ok FROM sqlite_master WHERE type = ? AND name = ?",
          ).get(type, name)) {
            throw new BudgetGuardError(
              "STORE_SCHEMA_INCOMPLETE",
              `Canonical budget store is missing required ${type} ${name}`,
            );
          }
        }
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL CHECK (schema_version = 4),
        attempt_slot_cap INTEGER NOT NULL CHECK (attempt_slot_cap = 1000),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operations (
        operation_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS batches (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id),
        experiment_id TEXT NOT NULL,
        phase_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'finalized')),
        allocated_slots INTEGER NOT NULL CHECK (allocated_slots > 0),
        released_slots INTEGER NOT NULL DEFAULT 0 CHECK (released_slots >= 0),
        max_provider_calls INTEGER NOT NULL CHECK (max_provider_calls > 0),
        max_cost_usd REAL NOT NULL CHECK (max_cost_usd >= 0),
        breached INTEGER NOT NULL DEFAULT 0 CHECK (breached IN (0, 1)),
        breach_reason TEXT,
        registry_budget INTEGER NOT NULL CHECK (registry_budget >= 0),
        registry_call_cap INTEGER NOT NULL CHECK (registry_call_cap >= 0),
        registry_cost_cap_usd REAL NOT NULL CHECK (registry_cost_cap_usd >= 0),
        registry_hash TEXT NOT NULL,
        reserve_operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        finalized_at TEXT,
        UNIQUE (campaign_id, experiment_id, phase_id, batch_id),
        CHECK (released_slots <= allocated_slots)
      );

      CREATE TABLE IF NOT EXISTS candidate_slots (
        candidate_slot_id TEXT PRIMARY KEY,
        batch_row_id INTEGER NOT NULL REFERENCES batches(row_id),
        state TEXT NOT NULL CHECK (state IN ('awaiting_result', 'parsed_pending', 'finished')),
        outcome TEXT CHECK (outcome IN (
          'parsed_accepted', 'parsed_rejected', 'no_candidate', 'unknown_after_send'
        )),
        producing_call_id TEXT,
        terminal_call_id TEXT,
        output_index INTEGER CHECK (output_index >= 0),
        output_hash TEXT,
        failure_reason TEXT,
        begin_operation_key TEXT NOT NULL,
        parse_operation_key TEXT,
        parse_fingerprint TEXT,
        finish_operation_key TEXT,
        finish_fingerprint TEXT,
        created_at TEXT NOT NULL,
        parsed_at TEXT,
        finished_at TEXT,
        CHECK (
          (state = 'awaiting_result' AND outcome IS NULL AND producing_call_id IS NULL AND terminal_call_id IS NULL AND output_index IS NULL AND output_hash IS NULL AND failure_reason IS NULL AND parsed_at IS NULL AND finished_at IS NULL)
          OR
          (state = 'parsed_pending' AND outcome IS NULL AND producing_call_id IS NOT NULL AND terminal_call_id IS NULL AND output_index IS NOT NULL AND output_hash IS NOT NULL AND failure_reason IS NULL AND parsed_at IS NOT NULL AND finished_at IS NULL)
          OR
          (state = 'finished' AND outcome IN ('parsed_accepted', 'parsed_rejected') AND producing_call_id IS NOT NULL AND terminal_call_id IS NULL AND output_index IS NOT NULL AND output_hash IS NOT NULL AND failure_reason IS NULL AND parsed_at IS NOT NULL AND finished_at IS NOT NULL)
          OR
          (state = 'finished' AND outcome = 'no_candidate' AND producing_call_id IS NULL AND terminal_call_id IS NOT NULL AND output_index IS NULL AND output_hash IS NULL AND failure_reason IS NOT NULL AND parsed_at IS NULL AND finished_at IS NOT NULL)
          OR
          (state = 'finished' AND outcome = 'unknown_after_send' AND producing_call_id IS NULL AND terminal_call_id IS NOT NULL AND output_index IS NULL AND output_hash IS NULL AND failure_reason IS NOT NULL AND parsed_at IS NULL AND finished_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS provider_calls (
        call_id TEXT PRIMARY KEY,
        batch_row_id INTEGER NOT NULL REFERENCES batches(row_id),
        state TEXT NOT NULL CHECK (state IN ('authorized', 'in_flight', 'settled')),
        outcome TEXT CHECK (outcome IN ('success', 'failed', 'unknown')),
        call_kind TEXT NOT NULL CHECK (call_kind IN ('full_question_generation', 'design', 'evaluation')),
        stage TEXT NOT NULL,
        model TEXT NOT NULL,
        logical_operation_id TEXT NOT NULL,
        physical_attempt_ordinal INTEGER NOT NULL CHECK (physical_attempt_ordinal >= 0),
        parent_candidate_slot_id TEXT REFERENCES candidate_slots(candidate_slot_id),
        reserved_cost_usd REAL NOT NULL CHECK (reserved_cost_usd >= 0),
        actual_cost_usd REAL NOT NULL DEFAULT 0 CHECK (actual_cost_usd >= 0),
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
        usage_final INTEGER NOT NULL DEFAULT 0 CHECK (usage_final IN (0, 1)),
        provider_request_id TEXT,
        begin_operation_key TEXT NOT NULL UNIQUE,
        settle_operation_key TEXT UNIQUE,
        settle_fingerprint TEXT,
        created_at TEXT NOT NULL,
        in_flight_at TEXT NOT NULL,
        settled_at TEXT,
        CHECK (
          (state IN ('authorized', 'in_flight') AND outcome IS NULL AND settled_at IS NULL)
          OR
          (state = 'settled' AND outcome IS NOT NULL AND settled_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS call_candidate_slots (
        call_id TEXT NOT NULL REFERENCES provider_calls(call_id),
        candidate_slot_id TEXT NOT NULL UNIQUE REFERENCES candidate_slots(candidate_slot_id),
        PRIMARY KEY (call_id, candidate_slot_id)
      );

      CREATE TABLE IF NOT EXISTS usage_reconciliations (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT NOT NULL REFERENCES provider_calls(call_id),
        operation_key TEXT NOT NULL UNIQUE,
        input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
        cost_usd REAL NOT NULL CHECK (cost_usd >= 0),
        usage_final INTEGER NOT NULL CHECK (usage_final IN (0, 1)),
        provider_request_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_registries (
        registry_hash TEXT PRIMARY KEY,
        registry_content_json TEXT NOT NULL,
        register_operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_registry_entries (
        registry_hash TEXT NOT NULL REFERENCES controller_registries(registry_hash),
        entry_id TEXT NOT NULL,
        entry_hash TEXT NOT NULL,
        entry_content_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (registry_hash, entry_id),
        UNIQUE (registry_hash, entry_hash)
      );

      CREATE TABLE IF NOT EXISTS controller_assignments (
        assignment_id TEXT PRIMARY KEY,
        batch_row_id INTEGER NOT NULL REFERENCES batches(row_id),
        operation_id TEXT NOT NULL UNIQUE,
        controller_registry_hash TEXT NOT NULL REFERENCES controller_registries(registry_hash),
        contract_id TEXT NOT NULL,
        envelope_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('open', 'quarantined', 'closed')),
        max_physical_calls INTEGER NOT NULL CHECK (max_physical_calls > 0),
        max_candidate_outputs INTEGER NOT NULL CHECK (max_candidate_outputs > 0),
        max_cost_usd REAL NOT NULL CHECK (max_cost_usd >= 0),
        quarantine_reason TEXT,
        reserve_operation_key TEXT NOT NULL UNIQUE,
        close_operation_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        CHECK (
          (state = 'open' AND quarantine_reason IS NULL AND closed_at IS NULL)
          OR (state = 'quarantined' AND quarantine_reason IS NOT NULL AND closed_at IS NULL)
          OR (state = 'closed' AND closed_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS controller_call_contracts (
        call_id TEXT PRIMARY KEY REFERENCES provider_calls(call_id),
        assignment_id TEXT NOT NULL REFERENCES controller_assignments(assignment_id),
        controller_registry_hash TEXT NOT NULL,
        controller_entry_id TEXT NOT NULL,
        controller_entry_hash TEXT NOT NULL,
        transition_id TEXT NOT NULL,
        entry_max_uses INTEGER NOT NULL CHECK (entry_max_uses > 0),
        parent_physical_call_id TEXT REFERENCES provider_calls(call_id),
        request_hash TEXT NOT NULL,
        request_json TEXT NOT NULL,
        provenance_hash TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        endpoint_hash TEXT NOT NULL,
        wire_body_hash TEXT NOT NULL,
        wire_prompt_hash TEXT NOT NULL,
        wire_schema_hash TEXT,
        canonical_request_hash TEXT NOT NULL,
        parser_artifact_hash TEXT,
        derivation_contract_id TEXT,
        derivation_receipt_hash TEXT,
        pricing_contract_hash TEXT NOT NULL,
        rolling_pricing_attestation_hash TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (controller_registry_hash, controller_entry_id)
          REFERENCES controller_registry_entries(registry_hash, entry_id),
        CHECK (
          (derivation_contract_id IS NULL AND derivation_receipt_hash IS NULL)
          OR (derivation_contract_id IS NOT NULL AND derivation_receipt_hash IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS controller_terminal_evidence (
        call_id TEXT PRIMARY KEY REFERENCES provider_calls(call_id),
        terminal_kind TEXT NOT NULL CHECK (terminal_kind IN (
          'http-response', 'network-error', 'abort', 'never-sent', 'unknown-after-send'
        )),
        evidence_hash TEXT NOT NULL UNIQUE,
        evidence_json TEXT NOT NULL,
        operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_response_bodies (
        call_id TEXT PRIMARY KEY REFERENCES provider_calls(call_id),
        response_body_hash TEXT NOT NULL,
        byte_length INTEGER NOT NULL CHECK (byte_length >= 0 AND byte_length <= 16777216),
        response_body BLOB NOT NULL,
        operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_clone_evidence (
        call_id TEXT PRIMARY KEY REFERENCES provider_calls(call_id),
        response_body_hash TEXT,
        evidence_hash TEXT NOT NULL UNIQUE,
        evidence_json TEXT NOT NULL,
        operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_parser_evidence (
        call_id TEXT PRIMARY KEY REFERENCES provider_calls(call_id),
        response_body_hash TEXT NOT NULL,
        parser_artifact_hash TEXT NOT NULL,
        disposition TEXT NOT NULL CHECK (disposition IN ('parsed', 'no_candidate')),
        disposition_reason TEXT NOT NULL,
        observed_output_count INTEGER NOT NULL CHECK (observed_output_count >= 0),
        output_hashes_json TEXT NOT NULL,
        evidence_hash TEXT NOT NULL UNIQUE,
        evidence_json TEXT NOT NULL,
        operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_semantic_candidates (
        call_id TEXT NOT NULL REFERENCES controller_parser_evidence(call_id),
        output_index INTEGER NOT NULL CHECK (output_index >= 0),
        output_hash TEXT NOT NULL UNIQUE,
        parser_evidence_hash TEXT NOT NULL REFERENCES controller_parser_evidence(evidence_hash),
        created_at TEXT NOT NULL,
        PRIMARY KEY (call_id, output_index)
      );

      CREATE TABLE IF NOT EXISTS controller_authorization_windows (
        campaign_semantic_sha256 TEXT NOT NULL,
        credential_public_id TEXT NOT NULL,
        window_ordinal INTEGER NOT NULL CHECK (window_ordinal > 0),
        previous_authorization_record_sha256 TEXT,
        authorization_record_sha256 TEXT NOT NULL UNIQUE,
        provider_usage_usd REAL NOT NULL CHECK (provider_usage_usd >= 0),
        provider_remaining_usd REAL NOT NULL CHECK (provider_remaining_usd >= 0),
        provider_hard_limit_usd REAL NOT NULL CHECK (provider_hard_limit_usd > 0),
        created_at TEXT NOT NULL,
        PRIMARY KEY (campaign_semantic_sha256, window_ordinal)
      );

      CREATE TABLE IF NOT EXISTS sealed_controller_campaigns (
        batch_row_id INTEGER PRIMARY KEY REFERENCES batches(row_id),
        campaign_semantic_sha256 TEXT NOT NULL UNIQUE,
        durable_batch_identity_sha256 TEXT NOT NULL UNIQUE,
        expected_assignment_count INTEGER NOT NULL CHECK (expected_assignment_count > 0),
        expected_assignment_ids_json TEXT NOT NULL,
        expected_assignment_set_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sealed_controller_campaign_terminals (
        batch_row_id INTEGER PRIMARY KEY REFERENCES sealed_controller_campaigns(batch_row_id),
        terminal_status TEXT NOT NULL CHECK (terminal_status IN ('COMPLETE', 'ABORTED_INCOMPLETE')),
        assignment_count INTEGER NOT NULL CHECK (assignment_count >= 0),
        consumed_dispatch_count INTEGER NOT NULL CHECK (consumed_dispatch_count >= 0),
        operation_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id),
        operation_key TEXT NOT NULL REFERENCES operations(operation_key),
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'batch_reserved', 'candidate_started', 'candidate_parsed', 'candidate_finished',
          'call_authorized', 'call_in_flight', 'call_settled',
          'usage_reconciled', 'controller_registry_registered',
          'assignment_reserved', 'assignment_quarantined', 'assignment_closed',
          'terminal_evidence_recorded', 'response_body_captured', 'clone_evidence_recorded',
          'parser_evidence_recorded', 'batch_breached', 'batch_finalized'
        )),
        entity_type TEXT NOT NULL CHECK (entity_type IN (
          'batch', 'candidate_slot', 'provider_call', 'controller_registry', 'assignment'
        )),
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        UNIQUE (operation_key, ordinal)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS candidate_output_identity_unique
        ON candidate_slots(producing_call_id, output_index)
        WHERE producing_call_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS candidate_output_hash_unique
        ON candidate_slots(output_hash)
        WHERE output_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS candidate_slots_batch_idx ON candidate_slots(batch_row_id);
      CREATE INDEX IF NOT EXISTS provider_calls_batch_idx ON provider_calls(batch_row_id);
      CREATE UNIQUE INDEX IF NOT EXISTS provider_call_logical_attempt_unique
        ON provider_calls(batch_row_id, logical_operation_id, physical_attempt_ordinal);
      CREATE INDEX IF NOT EXISTS batches_phase_idx ON batches(experiment_id, phase_id);
      CREATE INDEX IF NOT EXISTS controller_assignments_batch_idx
        ON controller_assignments(batch_row_id, state);
      CREATE INDEX IF NOT EXISTS controller_call_contracts_assignment_idx
        ON controller_call_contracts(assignment_id, controller_entry_id);

      CREATE TRIGGER IF NOT EXISTS audit_events_no_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS operations_no_update
      BEFORE UPDATE ON operations
      BEGIN
        SELECT RAISE(ABORT, 'operations is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS operations_no_delete
      BEFORE DELETE ON operations
      BEGIN
        SELECT RAISE(ABORT, 'operations is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS usage_reconciliations_no_update
      BEFORE UPDATE ON usage_reconciliations
      BEGIN
        SELECT RAISE(ABORT, 'usage_reconciliations is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS usage_reconciliations_no_delete
      BEFORE DELETE ON usage_reconciliations
      BEGIN
        SELECT RAISE(ABORT, 'usage_reconciliations is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS controller_registries_no_update
      BEFORE UPDATE ON controller_registries BEGIN
        SELECT RAISE(ABORT, 'controller_registries is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_registries_no_delete
      BEFORE DELETE ON controller_registries BEGIN
        SELECT RAISE(ABORT, 'controller_registries is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_registry_entries_no_update
      BEFORE UPDATE ON controller_registry_entries BEGIN
        SELECT RAISE(ABORT, 'controller_registry_entries is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_registry_entries_no_delete
      BEFORE DELETE ON controller_registry_entries BEGIN
        SELECT RAISE(ABORT, 'controller_registry_entries is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_call_contracts_no_update
      BEFORE UPDATE ON controller_call_contracts BEGIN
        SELECT RAISE(ABORT, 'controller_call_contracts is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_call_contracts_no_delete
      BEFORE DELETE ON controller_call_contracts BEGIN
        SELECT RAISE(ABORT, 'controller_call_contracts is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_terminal_evidence_no_update
      BEFORE UPDATE ON controller_terminal_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_terminal_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_terminal_evidence_no_delete
      BEFORE DELETE ON controller_terminal_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_terminal_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_response_bodies_no_update
      BEFORE UPDATE ON controller_response_bodies BEGIN
        SELECT RAISE(ABORT, 'controller_response_bodies is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_response_bodies_no_delete
      BEFORE DELETE ON controller_response_bodies BEGIN
        SELECT RAISE(ABORT, 'controller_response_bodies is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_clone_evidence_no_update
      BEFORE UPDATE ON controller_clone_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_clone_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_clone_evidence_no_delete
      BEFORE DELETE ON controller_clone_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_clone_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_parser_evidence_no_update
      BEFORE UPDATE ON controller_parser_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_parser_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_parser_evidence_no_delete
      BEFORE DELETE ON controller_parser_evidence BEGIN
        SELECT RAISE(ABORT, 'controller_parser_evidence is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_semantic_candidates_no_update
      BEFORE UPDATE ON controller_semantic_candidates BEGIN
        SELECT RAISE(ABORT, 'controller_semantic_candidates is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_semantic_candidates_no_delete
      BEFORE DELETE ON controller_semantic_candidates BEGIN
        SELECT RAISE(ABORT, 'controller_semantic_candidates is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_authorization_windows_no_update
      BEFORE UPDATE ON controller_authorization_windows BEGIN
        SELECT RAISE(ABORT, 'controller_authorization_windows is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS controller_authorization_windows_no_delete
      BEFORE DELETE ON controller_authorization_windows BEGIN
        SELECT RAISE(ABORT, 'controller_authorization_windows is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS sealed_controller_campaigns_no_update
      BEFORE UPDATE ON sealed_controller_campaigns BEGIN
        SELECT RAISE(ABORT, 'sealed_controller_campaigns is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS sealed_controller_campaigns_no_delete
      BEFORE DELETE ON sealed_controller_campaigns BEGIN
        SELECT RAISE(ABORT, 'sealed_controller_campaigns is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS sealed_controller_campaign_terminals_no_update
      BEFORE UPDATE ON sealed_controller_campaign_terminals BEGIN
        SELECT RAISE(ABORT, 'sealed_controller_campaign_terminals is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS sealed_controller_campaign_terminals_no_delete
      BEFORE DELETE ON sealed_controller_campaign_terminals BEGIN
        SELECT RAISE(ABORT, 'sealed_controller_campaign_terminals is append-only');
      END;
    `);

    // Schema v4 predates rolling pricing attestations. Keep existing durable v4
    // stores resumable by applying the one safe, nullable additive migration
    // before any controller call contract can be written under the new runtime.
    // The exact shape is checked as well so a look-alike/manual column fails
    // closed instead of silently weakening evidence persistence.
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      let rollingPricingAttestationColumn = this.db
        .prepare("PRAGMA table_info(controller_call_contracts)")
        .all()
        .find((row) => row.name === "rolling_pricing_attestation_hash");
      if (!rollingPricingAttestationColumn) {
        this.db.exec(
          "ALTER TABLE controller_call_contracts ADD COLUMN rolling_pricing_attestation_hash TEXT",
        );
        rollingPricingAttestationColumn = this.db
          .prepare("PRAGMA table_info(controller_call_contracts)")
          .all()
          .find((row) => row.name === "rolling_pricing_attestation_hash");
      }
      if (
        !rollingPricingAttestationColumn ||
        asString(rollingPricingAttestationColumn.type, "rolling pricing attestation column type")
          .toUpperCase() !== "TEXT" ||
        asNumber(
          rollingPricingAttestationColumn.notnull,
          "rolling pricing attestation column notnull",
        ) !== 0 ||
        asNumber(rollingPricingAttestationColumn.pk, "rolling pricing attestation column pk") !== 0 ||
        rollingPricingAttestationColumn.dflt_value !== null
      ) {
        throw new BudgetGuardError(
          "STORE_SCHEMA_INCOMPLETE",
          "controller_call_contracts rolling pricing attestation column has an unsafe shape",
        );
      }
      this.db.exec("COMMIT;");
    } catch (error) {
      try { this.db.exec("ROLLBACK;"); } catch { /* preserve the primary failure */ }
      throw error;
    }

    this.verifyCriticalSchemaDefinitions();

    const createdAt = nowUtc();
    this.db.prepare(
      `INSERT OR IGNORE INTO campaigns(campaign_id, schema_version, attempt_slot_cap, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(CAMPAIGN_ID, STORE_SCHEMA_VERSION, GLOBAL_ATTEMPT_SLOT_CAP, createdAt);
    const campaigns = this.db.prepare(
      "SELECT campaign_id, schema_version, attempt_slot_cap, created_at FROM campaigns",
    ).all();
    if (campaigns.length !== 1) {
      throw new BudgetGuardError("CAMPAIGN_MISMATCH", "SQLite store must contain exactly one campaign");
    }
    const campaign = campaigns[0];
    if (!campaign || campaign.campaign_id !== CAMPAIGN_ID) {
      throw new BudgetGuardError("CAMPAIGN_MISMATCH", "SQLite store belongs to another campaign");
    }
    if (
      asNumber(campaign.schema_version, "schema_version") !== STORE_SCHEMA_VERSION ||
      asNumber(campaign.attempt_slot_cap, "attempt_slot_cap") !== GLOBAL_ATTEMPT_SLOT_CAP
    ) {
      throw new BudgetGuardError("SCHEMA_MIGRATION_REQUIRED", "Budget store is not schema v4/cap 1000");
    }
    assertStrictTimestamp(campaign.created_at, "campaign created_at");
  }

  private withMutation<T extends object>(
    apply: boolean,
    callback: () => T,
  ): T & { projectedSummary: CampaignSummary } {
    this.assertOpen();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      this.verifyAuditChain();
      const value = callback();
      const projectedSummary = this.summary();
      this.db.exec(apply ? "COMMIT;" : "ROLLBACK;");
      return Object.assign(value, { projectedSummary });
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // Transaction may already be closed by COMMIT/ROLLBACK failure.
      }
      if (error instanceof BudgetGuardError) throw error;
      throw new BudgetGuardError(
        "STORE_MUTATION_FAILED",
        `SQLite mutation failed (${error instanceof Error ? error.message : "unknown"})`,
      );
    }
  }

  private claimOperation(
    operationKey: string,
    kind: string,
    operationFingerprint: string,
    entityId: string,
  ): OperationClaim {
    assertIdentifier(operationKey, "idempotencyKey");
    const existing = this.db.prepare(
      "SELECT kind, fingerprint, entity_id FROM operations WHERE operation_key = ?",
    ).get(operationKey);
    if (existing) {
      if (
        existing.kind !== kind ||
        existing.fingerprint !== operationFingerprint ||
        existing.entity_id !== entityId
      ) {
        throw new BudgetGuardError(
          "IDEMPOTENCY_CONFLICT",
          `Idempotency key ${operationKey} was used for another operation`,
        );
      }
      return { idempotent: true };
    }
    this.db.prepare(
      "INSERT INTO operations(operation_key, kind, fingerprint, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(operationKey, kind, operationFingerprint, entityId, nowUtc());
    return { idempotent: false };
  }

  private appendAudit(
    operationKey: string,
    ordinal: number,
    eventType: AuditEventType,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): void {
    if (AUDIT_ENTITY_BY_EVENT[eventType] !== entityType) {
      throw new BudgetGuardError(
        "INVARIANT_VIOLATION",
        `Audit event ${eventType} cannot target entity type ${entityType}`,
      );
    }
    const previous = this.db.prepare(
      "SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1",
    ).get();
    const previousHash = previous ? asString(previous.event_hash, "event_hash") : ZERO_HASH;
    const createdAt = nowUtc();
    const payloadJson = stableStringify(payload);
    const material = stableStringify({
      campaignId: CAMPAIGN_ID,
      operationKey,
      ordinal,
      eventType,
      entityType,
      entityId,
      payload: JSON.parse(payloadJson) as unknown,
      previousHash,
      createdAt,
    });
    const eventHash = sha256(material);
    this.db.prepare(
      `INSERT INTO audit_events(
        campaign_id, operation_key, ordinal, event_type, entity_type, entity_id,
        payload_json, previous_hash, event_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      CAMPAIGN_ID,
      operationKey,
      ordinal,
      eventType,
      entityType,
      entityId,
      payloadJson,
      previousHash,
      eventHash,
      createdAt,
    );
  }

  verifyAuditChain(): void {
    this.assertOpen();
    verifyAuditChainForDatabase(this.db);
  }

  private getBatchRow(ref: BatchRef): SqlRow {
    validateBatchRef(ref);
    const row = this.db.prepare(
      `SELECT * FROM batches
       WHERE campaign_id = ? AND experiment_id = ? AND phase_id = ? AND batch_id = ?`,
    ).get(CAMPAIGN_ID, ref.experimentId, ref.phaseId, ref.batchId);
    if (!row) throw new BudgetGuardError("BATCH_NOT_FOUND", "Batch does not exist");
    return row;
  }

  private assertBatchCanStartWork(batch: SqlRow): void {
    if (batch.status !== "open") {
      throw new BudgetGuardError("BATCH_FINALIZED", "Batch is finalized");
    }
    if (booleanFromSql(batch.breached)) {
      throw new BudgetGuardError("BATCH_BREACHED", "Batch is breached; no new work is authorized");
    }
  }

  private countBatchCandidates(batchRowId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM candidate_slots WHERE batch_row_id = ?",
    ).get(batchRowId);
    return asNumber(row?.count ?? 0, "candidate count");
  }

  private countBatchCalls(batchRowId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM provider_calls WHERE batch_row_id = ?",
    ).get(batchRowId);
    return asNumber(row?.count ?? 0, "provider call count");
  }

  private effectiveBatchCost(batchRowId: number): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(
        CASE
          WHEN state IN ('authorized', 'in_flight') THEN reserved_cost_usd
          WHEN usage_final = 0 THEN MAX(reserved_cost_usd, actual_cost_usd)
          ELSE actual_cost_usd
        END
      ), 0) AS cost FROM provider_calls WHERE batch_row_id = ?`,
    ).get(batchRowId);
    return asNumber(row?.cost ?? 0, "effective cost");
  }

  private actualBatchCost(batchRowId: number): number {
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(actual_cost_usd), 0) AS cost FROM provider_calls WHERE batch_row_id = ?",
    ).get(batchRowId);
    return asNumber(row?.cost ?? 0, "actual cost");
  }

  private toBatchView(row: SqlRow): BatchView {
    const batchRowId = asNumber(row.row_id, "batch row_id");
    const used = this.countBatchCandidates(batchRowId);
    const allocated = asNumber(row.allocated_slots, "allocated_slots");
    const released = asNumber(row.released_slots, "released_slots");
    const reserved = Math.max(0, allocated - released - used);
    return {
      experimentId: asString(row.experiment_id, "experiment_id"),
      phaseId: asString(row.phase_id, "phase_id"),
      batchId: asString(row.batch_id, "batch_id"),
      status: row.status as BatchView["status"],
      allocatedCandidateSlots: allocated,
      usedCandidateSlots: used,
      reservedCandidateSlots: reserved,
      releasedCandidateSlots: released,
      maxProviderCalls: asNumber(row.max_provider_calls, "max_provider_calls"),
      providerCalls: this.countBatchCalls(batchRowId),
      maxCostUsd: asNumber(row.max_cost_usd, "max_cost_usd"),
      effectiveCostUsd: this.effectiveBatchCost(batchRowId),
      actualCostUsd: this.actualBatchCost(batchRowId),
      breached: booleanFromSql(row.breached),
      breachReason: optionalString(row.breach_reason, "breach_reason"),
      registryBudget: asNumber(row.registry_budget, "registry_budget"),
      registryCallCap: asNumber(row.registry_call_cap, "registry_call_cap"),
      registryCostCapUsd: asNumber(row.registry_cost_cap_usd, "registry_cost_cap_usd"),
      registryHash: asString(row.registry_hash, "registry_hash"),
      createdAt: asTimestamp(row.created_at, "created_at"),
      finalizedAt: optionalTimestamp(row.finalized_at, "finalized_at"),
    };
  }

  private getCandidateRow(candidateSlotId: string): SqlRow {
    assertIdentifier(candidateSlotId, "candidateSlotId");
    const row = this.db.prepare("SELECT * FROM candidate_slots WHERE candidate_slot_id = ?").get(
      candidateSlotId,
    );
    if (!row) throw new BudgetGuardError("CANDIDATE_NOT_FOUND", "Candidate slot does not exist");
    return row;
  }

  private toCandidateView(row: SqlRow): CandidateSlotView {
    return {
      candidateSlotId: asString(row.candidate_slot_id, "candidate_slot_id"),
      state: row.state as CandidateSlotView["state"],
      outcome: (row.outcome ?? null) as CandidateOutcome | null,
      producingCallId: optionalString(row.producing_call_id, "producing_call_id"),
      terminalCallId: optionalString(row.terminal_call_id, "terminal_call_id"),
      outputIndex: row.output_index === null ? null : asNumber(row.output_index, "output_index"),
      outputHash: optionalString(row.output_hash, "output_hash"),
      failureReason: optionalString(row.failure_reason, "failure_reason"),
      createdAt: asTimestamp(row.created_at, "candidate created_at"),
      parsedAt: optionalTimestamp(row.parsed_at, "candidate parsed_at"),
      finishedAt: optionalTimestamp(row.finished_at, "candidate finished_at"),
    };
  }

  private candidateIdsForCall(callId: string): string[] {
    return this.db.prepare(
      `SELECT candidate_slot_id FROM call_candidate_slots
       WHERE call_id = ? ORDER BY candidate_slot_id`,
    ).all(callId).map((row) => asString(row.candidate_slot_id, "candidate_slot_id"));
  }

  private candidatesForCall(callId: string): CandidateSlotView[] {
    return this.db.prepare(
      `SELECT cs.* FROM candidate_slots cs
       JOIN call_candidate_slots ccs ON ccs.candidate_slot_id = cs.candidate_slot_id
       WHERE ccs.call_id = ? ORDER BY cs.candidate_slot_id`,
    ).all(callId).map((row) => this.toCandidateView(row));
  }

  private getCallRow(callId: string): SqlRow {
    assertIdentifier(callId, "callId");
    const row = this.db.prepare("SELECT * FROM provider_calls WHERE call_id = ?").get(callId);
    if (!row) throw new BudgetGuardError("CALL_NOT_FOUND", `Call ${callId} does not exist`);
    return row;
  }

  private toCallView(row: SqlRow): CallView {
    return {
      callId: asString(row.call_id, "call_id"),
      state: row.state as CallView["state"],
      outcome: (row.outcome ?? null) as ProviderCallOutcome | null,
      callKind: row.call_kind as ProviderCallKind,
      stage: asString(row.stage, "stage"),
      model: asString(row.model, "model"),
      logicalOperationId: asString(row.logical_operation_id, "logical_operation_id"),
      physicalAttemptOrdinal: asNumber(
        row.physical_attempt_ordinal,
        "physical_attempt_ordinal",
      ),
      parentCandidateSlotId: optionalString(
        row.parent_candidate_slot_id,
        "parent_candidate_slot_id",
      ),
      reservedCostUsd: asNumber(row.reserved_cost_usd, "reserved_cost_usd"),
      actualCostUsd: asNumber(row.actual_cost_usd, "actual_cost_usd"),
      inputTokens: asNumber(row.input_tokens, "input_tokens"),
      outputTokens: asNumber(row.output_tokens, "output_tokens"),
      latencyMs: asNumber(row.latency_ms, "latency_ms"),
      usageFinal: booleanFromSql(row.usage_final),
      providerRequestId: optionalString(row.provider_request_id, "provider_request_id"),
      createdAt: asTimestamp(row.created_at, "call created_at"),
      settledAt: optionalTimestamp(row.settled_at, "call settled_at"),
    };
  }

  private getControllerAssignmentRow(assignmentId: string): SqlRow {
    assertIdentifier(assignmentId, "assignmentId");
    const row = this.db.prepare(
      "SELECT * FROM controller_assignments WHERE assignment_id = ?",
    ).get(assignmentId);
    if (!row) {
      throw new BudgetGuardError(
        "ASSIGNMENT_NOT_FOUND",
        `Controller assignment ${assignmentId} does not exist`,
      );
    }
    return row;
  }

  private controllerAssignmentEffectiveCost(assignmentId: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN pc.state IN ('authorized', 'in_flight') THEN pc.reserved_cost_usd
           WHEN pc.usage_final = 0 THEN MAX(pc.reserved_cost_usd, pc.actual_cost_usd)
           ELSE pc.actual_cost_usd
         END
       ), 0) AS cost
       FROM provider_calls pc
       JOIN controller_call_contracts cc ON cc.call_id = pc.call_id
       WHERE cc.assignment_id = ?`,
    ).get(assignmentId);
    return asNumber(row?.cost ?? 0, "assignment effective cost");
  }

  private controllerAssignmentCounts(assignmentId: string): {
    physicalCalls: number;
    candidateOpportunities: number;
    observedSemanticCandidates: number;
  } {
    const calls = asNumber(
      this.db.prepare(
        "SELECT COUNT(*) AS count FROM controller_call_contracts WHERE assignment_id = ?",
      ).get(assignmentId)?.count ?? 0,
      "assignment physical calls",
    );
    const opportunities = asNumber(
      this.db.prepare(
        `SELECT COUNT(*) AS count FROM candidate_slots cs
         JOIN call_candidate_slots ccs ON ccs.candidate_slot_id = cs.candidate_slot_id
         JOIN controller_call_contracts cc ON cc.call_id = ccs.call_id
         WHERE cc.assignment_id = ?`,
      ).get(assignmentId)?.count ?? 0,
      "assignment candidate opportunities",
    );
    const observedSemanticCandidates = asNumber(
      this.db.prepare(
        `SELECT COUNT(*) AS count FROM controller_semantic_candidates sc
         JOIN controller_call_contracts cc ON cc.call_id = sc.call_id
         WHERE cc.assignment_id = ?`,
      ).get(assignmentId)?.count ?? 0,
      "observed semantic candidates",
    );
    return { physicalCalls: calls, candidateOpportunities: opportunities, observedSemanticCandidates };
  }

  private toControllerAssignmentView(row: SqlRow): ControllerAssignmentView {
    const batch = this.db.prepare("SELECT * FROM batches WHERE row_id = ?").get(
      asNumber(row.batch_row_id, "assignment batch_row_id"),
    );
    if (!batch) throw new BudgetGuardError("INVARIANT_VIOLATION", "Assignment batch is missing");
    const assignmentId = asString(row.assignment_id, "assignment_id");
    const counts = this.controllerAssignmentCounts(assignmentId);
    return {
      experimentId: asString(batch.experiment_id, "experiment_id"),
      phaseId: asString(batch.phase_id, "phase_id"),
      batchId: asString(batch.batch_id, "batch_id"),
      assignmentId,
      operationId: asString(row.operation_id, "operation_id"),
      controllerRegistryHash: asString(row.controller_registry_hash, "controller_registry_hash"),
      contractId: asString(row.contract_id, "contract_id"),
      envelopeHash: asString(row.envelope_hash, "envelope_hash"),
      state: row.state as ControllerAssignmentState,
      maxPhysicalCalls: asNumber(row.max_physical_calls, "max_physical_calls"),
      usedPhysicalCalls: counts.physicalCalls,
      maxCandidateOutputs: asNumber(row.max_candidate_outputs, "max_candidate_outputs"),
      usedCandidateOutputs: counts.candidateOpportunities,
      observedSemanticCandidates: counts.observedSemanticCandidates,
      maxCostUsd: asNumber(row.max_cost_usd, "max_cost_usd"),
      effectiveCostUsd: this.controllerAssignmentEffectiveCost(assignmentId),
      quarantineReason: optionalString(row.quarantine_reason, "quarantine_reason"),
      createdAt: asTimestamp(row.created_at, "assignment created_at"),
      closedAt: optionalTimestamp(row.closed_at, "assignment closed_at"),
    };
  }

  private assertCanonicalControllerJson(value: string, hash: string, label: string): unknown {
    assertSha256(hash, `${label}Hash`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BudgetGuardError("INVALID_ARGUMENT", `${label} must be valid JSON`);
    }
    if (stableStringify(parsed) !== value) {
      throw new BudgetGuardError("NON_CANONICAL_JSON", `${label} must use canonical stable JSON`);
    }
    if (sha256(value) !== hash) {
      throw new BudgetGuardError("HASH_MISMATCH", `${label} hash does not match content`);
    }
    return parsed;
  }

  private phaseCommittedSlots(experimentId: string, phaseId: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(allocated_slots - released_slots), 0) AS count
       FROM batches WHERE campaign_id = ? AND experiment_id = ? AND phase_id = ?`,
    ).get(CAMPAIGN_ID, experimentId, phaseId);
    return asNumber(row?.count ?? 0, "phase committed slots");
  }

  private phaseCommittedCallCapacity(experimentId: string, phaseId: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN b.status = 'open' THEN b.max_provider_calls
           ELSE (SELECT COUNT(*) FROM provider_calls pc WHERE pc.batch_row_id = b.row_id)
         END
       ), 0) AS count
       FROM batches b
       WHERE b.campaign_id = ? AND b.experiment_id = ? AND b.phase_id = ?`,
    ).get(CAMPAIGN_ID, experimentId, phaseId);
    return asNumber(row?.count ?? 0, "phase committed physical-call capacity");
  }

  private phaseCommittedCostCapacity(experimentId: string, phaseId: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN b.status = 'open' THEN MAX(
             b.max_cost_usd,
             COALESCE((
               SELECT SUM(
                 CASE
                   WHEN pc.state IN ('authorized', 'in_flight') THEN pc.reserved_cost_usd
                   WHEN pc.usage_final = 0 THEN MAX(pc.reserved_cost_usd, pc.actual_cost_usd)
                   ELSE pc.actual_cost_usd
                 END
               )
               FROM provider_calls pc WHERE pc.batch_row_id = b.row_id
             ), 0)
           )
           ELSE COALESCE((
             SELECT SUM(
               CASE
                 WHEN pc.state IN ('authorized', 'in_flight') THEN pc.reserved_cost_usd
                 WHEN pc.usage_final = 0 THEN MAX(pc.reserved_cost_usd, pc.actual_cost_usd)
                 ELSE pc.actual_cost_usd
               END
             )
             FROM provider_calls pc WHERE pc.batch_row_id = b.row_id
           ), 0)
         END
       ), 0) AS cost
       FROM batches b
       WHERE b.campaign_id = ? AND b.experiment_id = ? AND b.phase_id = ?`,
    ).get(CAMPAIGN_ID, experimentId, phaseId);
    return asNumber(row?.cost ?? 0, "phase committed USD capacity");
  }

  private assertCurrentPhaseCanStartWork(batch: SqlRow): void {
    const experimentId = asString(batch.experiment_id, "experiment_id");
    const phaseId = asString(batch.phase_id, "phase_id");
    const phase = resolveRegistryPhase(loadRegistry(this.registryPath), experimentId, phaseId);
    assertPhaseOperational(phase);
    if (this.phaseCommittedSlots(experimentId, phaseId) > phase.budget) {
      throw new BudgetGuardError(
        "PHASE_SLOT_CAP_BREACHED",
        `${experimentId}/${phaseId} committed slots exceed its current registry cap`,
      );
    }
    if (this.phaseCommittedCallCapacity(experimentId, phaseId) > phase.maxPhysicalProviderCalls) {
      throw new BudgetGuardError(
        "PHASE_CALL_CAP_BREACHED",
        `${experimentId}/${phaseId} committed physical-call capacity exceeds its current registry cap`,
      );
    }
    if (this.phaseCommittedCostCapacity(experimentId, phaseId) - phase.maxCostUsd > EPSILON) {
      throw new BudgetGuardError(
        "PHASE_COST_CAP_BREACHED",
        `${experimentId}/${phaseId} committed USD capacity exceeds its current registry cap`,
      );
    }
  }

  private campaignCommittedSlots(): number {
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(allocated_slots - released_slots), 0) AS count FROM batches WHERE campaign_id = ?",
    ).get(CAMPAIGN_ID);
    return asNumber(row?.count ?? 0, "campaign committed slots");
  }

  private assertNoCampaignCandidateOverflow(): void {
    const overflow = this.db.prepare(
      `SELECT batch_id FROM batches
       WHERE breached = 1
         AND INSTR(COALESCE(breach_reason, ''), 'beyond its pre-network reservation') > 0
       LIMIT 1`,
    ).get();
    if (overflow) {
      throw new BudgetGuardError(
        "CAMPAIGN_CANDIDATE_OVERFLOW",
        `Campaign is halted after an unreserved candidate-output overflow in batch ${asString(overflow.batch_id, "batch_id")}`,
      );
    }
  }

  registerControllerRegistry(
    input: ControllerRegistryRecordInput,
    options: MutationOptions = {},
  ): MutationReceipt<{ registryHash: string }> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    const parsedRegistry = this.assertCanonicalControllerJson(
      input.registryContentJson,
      input.registryHash,
      "controller registry content",
    );
    const registryContent = requireJsonRecord(parsedRegistry, "controller registry content");
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Controller registry requires entries");
    }
    const entryIds = new Set<string>();
    const entryHashes = new Set<string>();
    for (const entry of input.entries) {
      assertIdentifier(entry.entryId, "entryId");
      if (entryIds.has(entry.entryId) || entryHashes.has(entry.entryHash)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "Controller registry entries must be unique");
      }
      entryIds.add(entry.entryId);
      entryHashes.add(entry.entryHash);
      this.assertCanonicalControllerJson(
        entry.entryContentJson,
        entry.entryHash,
        `controller entry ${entry.entryId}`,
      );
    }
    const sealedEntries = requireJsonArray(
      registryContent.entries,
      "controller registry content entries",
    );
    if (
      sealedEntries.length !== input.entries.length ||
      requireJsonArray(
        registryContent.assignmentContracts,
        "controller registry assignment contracts",
      ).length === 0 ||
      requireJsonArray(registryContent.transitions, "controller registry transitions").length === 0
    ) {
      throw new BudgetGuardError(
        "CONTROLLER_REGISTRY_CONTENT_MISMATCH",
        "Durable registry content is missing entries, envelopes, or transitions",
      );
    }
    const entryInputById = new Map(input.entries.map((entry) => [entry.entryId, entry]));
    for (const sealedEntryValue of sealedEntries) {
      const sealedEntry = requireJsonRecord(sealedEntryValue, "sealed controller registry entry");
      const entryId = sealedEntry.entryId;
      const entryHash = sealedEntry.entryHash;
      if (typeof entryId !== "string" || typeof entryHash !== "string") {
        throw new BudgetGuardError(
          "CONTROLLER_REGISTRY_CONTENT_MISMATCH",
          "Sealed registry entry lacks its ID or self-hash",
        );
      }
      const durableEntry = entryInputById.get(entryId);
      const entryContent = { ...sealedEntry };
      delete entryContent.entryHash;
      if (
        !durableEntry ||
        durableEntry.entryHash !== entryHash ||
        durableEntry.entryContentJson !== stableStringify(entryContent)
      ) {
        throw new BudgetGuardError(
          "CONTROLLER_REGISTRY_CONTENT_MISMATCH",
          "Sealed registry entries differ from their durable self-hashed records",
        );
      }
    }
    const normalized = {
      ...input,
      entries: [...input.entries].sort((left, right) => left.entryId.localeCompare(right.entryId)),
    };
    const apply = options.apply === true;
    const opFingerprint = fingerprint("register_controller_registry", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "register_controller_registry",
        opFingerprint,
        input.registryHash,
      );
      if (claim.idempotent) {
        return { idempotent: true, registryHash: input.registryHash };
      }
      if (this.db.prepare(
        "SELECT 1 AS ok FROM controller_registries WHERE registry_hash = ?",
      ).get(input.registryHash)) {
        throw new BudgetGuardError(
          "CONTROLLER_REGISTRY_EXISTS",
          "Controller registry hash already exists under another operation",
        );
      }
      const createdAt = nowUtc();
      this.db.prepare(
        `INSERT INTO controller_registries(
           registry_hash, registry_content_json, register_operation_key, created_at
         ) VALUES (?, ?, ?, ?)`,
      ).run(input.registryHash, input.registryContentJson, input.idempotencyKey, createdAt);
      for (const entry of normalized.entries) {
        this.db.prepare(
          `INSERT INTO controller_registry_entries(
             registry_hash, entry_id, entry_hash, entry_content_json, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        ).run(
          input.registryHash,
          entry.entryId,
          entry.entryHash,
          entry.entryContentJson,
          createdAt,
        );
      }
      this.appendAudit(
        input.idempotencyKey,
        0,
        "controller_registry_registered",
        "controller_registry",
        input.registryHash,
        {
          registryHash: input.registryHash,
          entries: normalized.entries.map((entry) => ({
            entryId: entry.entryId,
            entryHash: entry.entryHash,
          })),
        },
      );
      return { idempotent: false, registryHash: input.registryHash };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: { registryHash: result.registryHash },
      summary: result.projectedSummary,
    };
  }

  reserveControllerAssignment(
    input: ReserveControllerAssignmentInput,
    options: MutationOptions = {},
  ): MutationReceipt<ControllerAssignmentView> {
    validateBatchRef(input);
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.assignmentId, "assignmentId");
    assertIdentifier(input.operationId, "operationId");
    assertSha256(input.controllerRegistryHash, "controllerRegistryHash");
    assertIdentifier(input.envelope.contractId, "contractId");
    assertSha256(input.envelope.envelopeHash, "envelopeHash");
    assertPositiveInteger(input.envelope.maxPhysicalCalls, "maxPhysicalCalls");
    assertPositiveInteger(input.envelope.maxCandidateOutputs, "maxCandidateOutputs");
    assertNonNegativeFinite(input.envelope.maxCostUsd, "maxCostUsd");
    const expectedEnvelopeHash = sha256(stableStringify({
      contractId: input.envelope.contractId,
      maxPhysicalCalls: input.envelope.maxPhysicalCalls,
      maxCandidateOutputs: input.envelope.maxCandidateOutputs,
      maxCostUsd: input.envelope.maxCostUsd,
    }));
    if (expectedEnvelopeHash !== input.envelope.envelopeHash) {
      throw new BudgetGuardError("ENVELOPE_HASH_MISMATCH", "Assignment envelope hash is invalid");
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("reserve_controller_assignment", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "reserve_controller_assignment",
        opFingerprint,
        input.assignmentId,
      );
      if (claim.idempotent) {
        return {
          idempotent: true,
          assignment: this.toControllerAssignmentView(
            this.getControllerAssignmentRow(input.assignmentId),
          ),
        };
      }
      const registry = this.db.prepare(
        "SELECT registry_content_json FROM controller_registries WHERE registry_hash = ?",
      ).get(input.controllerRegistryHash);
      if (!registry) {
        throw new BudgetGuardError(
          "CONTROLLER_REGISTRY_NOT_FOUND",
          "Assignment controller registry is not durably registered",
        );
      }
      const registryContent = requireJsonRecord(
        JSON.parse(asString(registry.registry_content_json, "registry_content_json")),
        "durable controller registry",
      );
      const contracts = requireJsonArray(
        registryContent.assignmentContracts,
        "durable registry assignment contracts",
      ).map((value) => requireJsonRecord(value, "durable assignment contract"));
      const matchingContracts = contracts.filter(
        (contract) => contract.contractId === input.envelope.contractId,
      );
      const frozenEnvelope = matchingContracts[0];
      if (
        matchingContracts.length !== 1 ||
        frozenEnvelope.envelopeHash !== input.envelope.envelopeHash ||
        frozenEnvelope.maxPhysicalCalls !== input.envelope.maxPhysicalCalls ||
        frozenEnvelope.maxCandidateOutputs !== input.envelope.maxCandidateOutputs ||
        frozenEnvelope.maxCostUsd !== input.envelope.maxCostUsd
      ) {
        throw new BudgetGuardError(
          "ASSIGNMENT_ENVELOPE_REGISTRY_MISMATCH",
          "Assignment envelope differs from its durable controller registry",
        );
      }
      const batch = this.getBatchRow(input);
      this.assertBatchCanStartWork(batch);
      this.assertCurrentPhaseCanStartWork(batch);
      const batchRowId = asNumber(batch.row_id, "batch row_id");
      const unmanagedCalls = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM provider_calls pc
           LEFT JOIN controller_call_contracts cc ON cc.call_id = pc.call_id
           WHERE pc.batch_row_id = ? AND cc.call_id IS NULL`,
        ).get(batchRowId)?.count ?? 0,
        "unmanaged provider calls",
      );
      if (unmanagedCalls > 0) {
        throw new BudgetGuardError(
          "MIXED_CONTROLLER_BATCH",
          "Controller assignments cannot share a batch with unmanaged calls",
        );
      }
      const assignmentRows = this.db.prepare(
        "SELECT * FROM controller_assignments WHERE batch_row_id = ?",
      ).all(batchRowId);
      let committedCandidates = 0;
      let committedCalls = 0;
      let committedCost = 0;
      for (const row of assignmentRows) {
        const assignmentId = asString(row.assignment_id, "assignment_id");
        // Candidate opportunity capacity is never recycled into queue top-up.
        committedCandidates += asNumber(row.max_candidate_outputs, "max_candidate_outputs");
        if (row.state === "closed") {
          const counts = this.controllerAssignmentCounts(assignmentId);
          committedCalls += counts.physicalCalls;
          committedCost += this.controllerAssignmentEffectiveCost(assignmentId);
        } else {
          committedCalls += asNumber(row.max_physical_calls, "max_physical_calls");
          committedCost += asNumber(row.max_cost_usd, "max_cost_usd");
        }
      }
      if (
        committedCandidates + input.envelope.maxCandidateOutputs >
        asNumber(batch.allocated_slots, "allocated_slots") -
          asNumber(batch.released_slots, "released_slots")
      ) {
        throw new BudgetGuardError(
          "ASSIGNMENT_CANDIDATE_ENVELOPE_EXCEEDED",
          "Whole-assignment candidate opportunity envelope exceeds the batch allocation",
        );
      }
      if (
        committedCalls + input.envelope.maxPhysicalCalls >
        asNumber(batch.max_provider_calls, "max_provider_calls")
      ) {
        throw new BudgetGuardError(
          "ASSIGNMENT_CALL_ENVELOPE_EXCEEDED",
          "Whole-assignment physical-call envelope exceeds the batch cap",
        );
      }
      if (
        committedCost + input.envelope.maxCostUsd -
          asNumber(batch.max_cost_usd, "max_cost_usd") > EPSILON
      ) {
        throw new BudgetGuardError(
          "ASSIGNMENT_COST_ENVELOPE_EXCEEDED",
          "Whole-assignment USD envelope exceeds the batch cap",
        );
      }
      const createdAt = nowUtc();
      this.db.prepare(
        `INSERT INTO controller_assignments(
           assignment_id, batch_row_id, operation_id, controller_registry_hash,
           contract_id, envelope_hash, state, max_physical_calls,
           max_candidate_outputs, max_cost_usd, reserve_operation_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      ).run(
        input.assignmentId,
        batchRowId,
        input.operationId,
        input.controllerRegistryHash,
        input.envelope.contractId,
        input.envelope.envelopeHash,
        input.envelope.maxPhysicalCalls,
        input.envelope.maxCandidateOutputs,
        input.envelope.maxCostUsd,
        input.idempotencyKey,
        createdAt,
      );
      this.appendAudit(
        input.idempotencyKey,
        0,
        "assignment_reserved",
        "assignment",
        input.assignmentId,
        {
          operationId: input.operationId,
          controllerRegistryHash: input.controllerRegistryHash,
          ...input.envelope,
          candidateCapacityKind: "temporary_worst_case_itt_opportunity_envelope",
          queueTopUpAllowed: false,
        },
      );
      return {
        idempotent: false,
        assignment: this.toControllerAssignmentView(
          this.getControllerAssignmentRow(input.assignmentId),
        ),
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.assignment,
      summary: result.projectedSummary,
    };
  }

  quarantineControllerAssignment(
    input: { idempotencyKey: string; assignmentId: string; reason: string },
    options: MutationOptions = {},
  ): MutationReceipt<ControllerAssignmentView> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.assignmentId, "assignmentId");
    assertMetadataString(input.reason, "reason");
    const apply = options.apply === true;
    const normalized = { ...input, reason: input.reason.slice(0, 500) };
    const opFingerprint = fingerprint("quarantine_controller_assignment", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "quarantine_controller_assignment",
        opFingerprint,
        input.assignmentId,
      );
      if (claim.idempotent) {
        return {
          idempotent: true,
          assignment: this.toControllerAssignmentView(
            this.getControllerAssignmentRow(input.assignmentId),
          ),
        };
      }
      const row = this.getControllerAssignmentRow(input.assignmentId);
      if (row.state !== "open") {
        throw new BudgetGuardError("ASSIGNMENT_NOT_OPEN", "Only an open assignment can be quarantined");
      }
      this.db.prepare(
        "UPDATE controller_assignments SET state = 'quarantined', quarantine_reason = ? WHERE assignment_id = ?",
      ).run(normalized.reason, input.assignmentId);
      this.appendAudit(
        input.idempotencyKey,
        0,
        "assignment_quarantined",
        "assignment",
        input.assignmentId,
        { reason: normalized.reason, newProviderCallsAllowed: false },
      );
      return {
        idempotent: false,
        assignment: this.toControllerAssignmentView(
          this.getControllerAssignmentRow(input.assignmentId),
        ),
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.assignment,
      summary: result.projectedSummary,
    };
  }

  closeControllerAssignment(
    input: { idempotencyKey: string; assignmentId: string },
    options: MutationOptions = {},
  ): MutationReceipt<ControllerAssignmentView> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.assignmentId, "assignmentId");
    const apply = options.apply === true;
    const opFingerprint = fingerprint("close_controller_assignment", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "close_controller_assignment",
        opFingerprint,
        input.assignmentId,
      );
      if (claim.idempotent) {
        return {
          idempotent: true,
          assignment: this.toControllerAssignmentView(
            this.getControllerAssignmentRow(input.assignmentId),
          ),
        };
      }
      const row = this.getControllerAssignmentRow(input.assignmentId);
      if (row.state === "closed") {
        throw new BudgetGuardError("ASSIGNMENT_CLOSED", "Assignment is already closed");
      }
      const consumedDispatches = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM controller_call_contracts
           WHERE assignment_id = ?`,
        ).get(input.assignmentId)?.count ?? 0,
        "assignment consumed dispatches",
      );
      if (consumedDispatches === 0) {
        throw new BudgetGuardError(
          "ASSIGNMENT_ZERO_DISPATCH",
          "A controller assignment cannot close without consuming its frozen dispatch",
        );
      }
      const unresolved = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM provider_calls pc
           JOIN controller_call_contracts cc ON cc.call_id = pc.call_id
           WHERE cc.assignment_id = ? AND pc.state != 'settled'`,
        ).get(input.assignmentId)?.count ?? 0,
        "assignment unresolved calls",
      );
      if (unresolved > 0) {
        throw new BudgetGuardError("ASSIGNMENT_UNRESOLVED_CALLS", "Assignment has unresolved calls");
      }
      const unfinishedUsage = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM provider_calls pc
           JOIN controller_call_contracts cc ON cc.call_id = pc.call_id
           WHERE cc.assignment_id = ? AND pc.usage_final = 0`,
        ).get(input.assignmentId)?.count ?? 0,
        "assignment unfinished usage",
      );
      if (unfinishedUsage > 0) {
        throw new BudgetGuardError("ASSIGNMENT_UNFINALIZED_USAGE", "Assignment billing is not final");
      }
      const openCandidates = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM candidate_slots cs
           JOIN call_candidate_slots ccs ON ccs.candidate_slot_id = cs.candidate_slot_id
           JOIN controller_call_contracts cc ON cc.call_id = ccs.call_id
           WHERE cc.assignment_id = ? AND cs.state != 'finished'`,
        ).get(input.assignmentId)?.count ?? 0,
        "assignment open candidates",
      );
      if (openCandidates > 0) {
        throw new BudgetGuardError("ASSIGNMENT_OPEN_CANDIDATES", "Assignment candidates are not terminal");
      }
      const missingTerminalEvidence = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM controller_call_contracts cc
           LEFT JOIN controller_terminal_evidence te ON te.call_id = cc.call_id
           WHERE cc.assignment_id = ? AND te.call_id IS NULL`,
        ).get(input.assignmentId)?.count ?? 0,
        "missing terminal evidence",
      );
      if (missingTerminalEvidence > 0) {
        throw new BudgetGuardError(
          "ASSIGNMENT_MISSING_EVIDENCE",
          "Assignment has calls without durable terminal evidence",
        );
      }
      const missingHttpCloneEvidence = asNumber(
        this.db.prepare(
          `SELECT COUNT(*) AS count FROM controller_call_contracts cc
           JOIN controller_terminal_evidence te ON te.call_id = cc.call_id
           LEFT JOIN controller_clone_evidence ce ON ce.call_id = cc.call_id
           WHERE cc.assignment_id = ?
             AND te.terminal_kind = 'http-response'
             AND ce.call_id IS NULL`,
        ).get(input.assignmentId)?.count ?? 0,
        "missing HTTP clone evidence",
      );
      if (missingHttpCloneEvidence > 0) {
        throw new BudgetGuardError(
          "ASSIGNMENT_MISSING_CLONE_EVIDENCE",
          "HTTP-terminal calls require durable clone/body evidence before assignment closure",
        );
      }
      const closedAt = nowUtc();
      this.db.prepare(
        `UPDATE controller_assignments
         SET state = 'closed', close_operation_key = ?, closed_at = ?
         WHERE assignment_id = ?`,
      ).run(input.idempotencyKey, closedAt, input.assignmentId);
      this.appendAudit(
        input.idempotencyKey,
        0,
        "assignment_closed",
        "assignment",
        input.assignmentId,
        {
          capacityReleasedForQueueTopUp: false,
          evidenceComplete: true,
        },
      );
      return {
        idempotent: false,
        assignment: this.toControllerAssignmentView(
          this.getControllerAssignmentRow(input.assignmentId),
        ),
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.assignment,
      summary: result.projectedSummary,
    };
  }

  recordControllerTerminalEvidence(
    input: ControllerTerminalEvidenceInput,
    options: MutationOptions = {},
  ): MutationReceipt<{ callId: string; evidenceHash: string }> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    if (!(
      ["http-response", "network-error", "abort", "never-sent", "unknown-after-send"] as const
    ).includes(input.terminalKind)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Invalid terminal evidence kind");
    }
    const parsedEvidence = this.assertCanonicalControllerJson(
      input.evidenceJson,
      input.evidenceHash,
      "terminal evidence",
    );
    if (!parsedEvidence || typeof parsedEvidence !== "object" || Array.isArray(parsedEvidence)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Terminal evidence must be a JSON object");
    }
    const evidence = parsedEvidence as Record<string, unknown>;
    if (
      evidence.physicalCallId !== input.callId ||
      evidence.terminalKind !== input.terminalKind ||
      typeof evidence.operationId !== "string" ||
      !Number.isSafeInteger(evidence.physicalOrdinal) ||
      (evidence.physicalOrdinal as number) <= 0
    ) {
      throw new BudgetGuardError(
        "EVIDENCE_LINEAGE_MISMATCH",
        "Terminal evidence lineage does not match its durable call",
      );
    }
    if (input.terminalKind === "http-response") {
      if (
        !Number.isSafeInteger(evidence.status) ||
        (evidence.status as number) < 100 ||
        (evidence.status as number) > 599 ||
        typeof evidence.ok !== "boolean" ||
        evidence.ok !== ((evidence.status as number) >= 200 && (evidence.status as number) <= 299)
      ) {
        throw new BudgetGuardError(
          "INVALID_ARGUMENT",
          "HTTP terminal evidence has inconsistent status/ok fields",
        );
      }
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("record_controller_terminal_evidence", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "record_controller_terminal_evidence",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        return { idempotent: true, callId: input.callId, evidenceHash: input.evidenceHash };
      }
      const call = this.getCallRow(input.callId);
      if (!this.db.prepare(
        "SELECT 1 AS ok FROM controller_call_contracts WHERE call_id = ?",
      ).get(input.callId)) {
        throw new BudgetGuardError("NOT_CONTROLLER_CALL", "Terminal evidence requires a controller call");
      }
      if (
        evidence.operationId !== asString(call.logical_operation_id, "logical_operation_id") ||
        evidence.physicalOrdinal !==
          asNumber(call.physical_attempt_ordinal, "physical_attempt_ordinal") + 1
      ) {
        throw new BudgetGuardError(
          "EVIDENCE_LINEAGE_MISMATCH",
          "Terminal evidence operation/ordinal differs from its durable call",
        );
      }
      this.db.prepare(
        `INSERT INTO controller_terminal_evidence(
           call_id, terminal_kind, evidence_hash, evidence_json, operation_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.callId,
        input.terminalKind,
        input.evidenceHash,
        input.evidenceJson,
        input.idempotencyKey,
        nowUtc(),
      );
      this.appendAudit(
        input.idempotencyKey,
        0,
        "terminal_evidence_recorded",
        "provider_call",
        input.callId,
        { terminalKind: input.terminalKind, evidenceHash: input.evidenceHash },
      );
      return { idempotent: false, callId: input.callId, evidenceHash: input.evidenceHash };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: { callId: result.callId, evidenceHash: result.evidenceHash },
      summary: result.projectedSummary,
    };
  }

  recordControllerResponseBody(
    input: ControllerResponseBodyInput,
    options: MutationOptions = {},
  ): MutationReceipt<{ callId: string; responseBodyHash: string; byteLength: number }> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    assertSha256(input.responseBodyHash, "responseBodyHash");
    if (!(input.responseBody instanceof Uint8Array)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Captured response body must be Uint8Array");
    }
    const responseBody = new Uint8Array(input.responseBody);
    if (responseBody.byteLength > MAX_CAPTURED_RESPONSE_BODY_BYTES) {
      throw new BudgetGuardError(
        "RESPONSE_BODY_TOO_LARGE",
        "Captured response body exceeds the private evidence bound",
      );
    }
    if (sha256(responseBody) !== input.responseBodyHash) {
      throw new BudgetGuardError(
        "RESPONSE_BODY_HASH_MISMATCH",
        "Captured response bytes do not match their declared hash",
      );
    }
    const normalized = {
      idempotencyKey: input.idempotencyKey,
      callId: input.callId,
      responseBodyHash: input.responseBodyHash,
      byteLength: responseBody.byteLength,
    };
    const apply = options.apply === true;
    const opFingerprint = fingerprint("record_controller_response_body", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "record_controller_response_body",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        return {
          idempotent: true,
          callId: input.callId,
          responseBodyHash: input.responseBodyHash,
          byteLength: responseBody.byteLength,
        };
      }
      this.getCallRow(input.callId);
      if (!this.db.prepare(
        "SELECT 1 AS ok FROM controller_call_contracts WHERE call_id = ?",
      ).get(input.callId)) {
        throw new BudgetGuardError(
          "NOT_CONTROLLER_CALL",
          "Captured response bodies require a controller call",
        );
      }
      this.db.prepare(
        `INSERT INTO controller_response_bodies(
           call_id, response_body_hash, byte_length, response_body, operation_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.callId,
        input.responseBodyHash,
        responseBody.byteLength,
        responseBody,
        input.idempotencyKey,
        nowUtc(),
      );
      this.appendAudit(
        input.idempotencyKey,
        0,
        "response_body_captured",
        "provider_call",
        input.callId,
        {
          responseBodyHash: input.responseBodyHash,
          byteLength: responseBody.byteLength,
          privateRawBodyExcludedFromJsonExport: true,
        },
      );
      return {
        idempotent: false,
        callId: input.callId,
        responseBodyHash: input.responseBodyHash,
        byteLength: responseBody.byteLength,
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: {
        callId: result.callId,
        responseBodyHash: result.responseBodyHash,
        byteLength: result.byteLength,
      },
      summary: result.projectedSummary,
    };
  }

  recordControllerCloneEvidence(
    input: ControllerCloneEvidenceInput,
    options: MutationOptions = {},
  ): MutationReceipt<{ callId: string; evidenceHash: string }> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    if (input.responseBodyHash !== null) assertSha256(input.responseBodyHash, "responseBodyHash");
    const parsedEvidence = this.assertCanonicalControllerJson(
      input.evidenceJson,
      input.evidenceHash,
      "clone evidence",
    );
    if (!parsedEvidence || typeof parsedEvidence !== "object" || Array.isArray(parsedEvidence)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Clone evidence must be a JSON object");
    }
    const evidence = parsedEvidence as Record<string, unknown>;
    if (
      evidence.physicalCallId !== input.callId ||
      evidence.responseBodyHash !== input.responseBodyHash ||
      typeof evidence.operationId !== "string" ||
      !Number.isSafeInteger(evidence.physicalOrdinal) ||
      (evidence.physicalOrdinal as number) <= 0
    ) {
      throw new BudgetGuardError(
        "EVIDENCE_LINEAGE_MISMATCH",
        "Clone evidence lineage/body hash does not match its durable call",
      );
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("record_controller_clone_evidence", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "record_controller_clone_evidence",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        return { idempotent: true, callId: input.callId, evidenceHash: input.evidenceHash };
      }
      const call = this.getCallRow(input.callId);
      if (!this.db.prepare(
        "SELECT 1 AS ok FROM controller_call_contracts WHERE call_id = ?",
      ).get(input.callId)) {
        throw new BudgetGuardError("NOT_CONTROLLER_CALL", "Clone evidence requires a controller call");
      }
      if (input.responseBodyHash !== null && evidence.parseState !== "body-too-large") {
        const captured = this.db.prepare(
          `SELECT response_body_hash FROM controller_response_bodies WHERE call_id = ?`,
        ).get(input.callId);
        if (
          !captured ||
          asString(captured.response_body_hash, "captured response_body_hash") !==
            input.responseBodyHash
        ) {
          throw new BudgetGuardError(
            "MISSING_CAPTURED_RESPONSE_BODY",
            "Clone evidence must bind to privately captured exact response bytes",
          );
        }
      }
      if (
        evidence.operationId !== asString(call.logical_operation_id, "logical_operation_id") ||
        evidence.physicalOrdinal !==
          asNumber(call.physical_attempt_ordinal, "physical_attempt_ordinal") + 1
      ) {
        throw new BudgetGuardError(
          "EVIDENCE_LINEAGE_MISMATCH",
          "Clone evidence operation/ordinal differs from its durable call",
        );
      }
      this.db.prepare(
        `INSERT INTO controller_clone_evidence(
           call_id, response_body_hash, evidence_hash, evidence_json, operation_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.callId,
        input.responseBodyHash,
        input.evidenceHash,
        input.evidenceJson,
        input.idempotencyKey,
        nowUtc(),
      );
      this.appendAudit(
        input.idempotencyKey,
        0,
        "clone_evidence_recorded",
        "provider_call",
        input.callId,
        {
          responseBodyHash: input.responseBodyHash,
          evidenceHash: input.evidenceHash,
        },
      );
      return { idempotent: false, callId: input.callId, evidenceHash: input.evidenceHash };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: { callId: result.callId, evidenceHash: result.evidenceHash },
      summary: result.projectedSummary,
    };
  }

  getControllerAssignmentRecovery(assignmentId: string): ControllerAssignmentRecoveryView {
    this.assertOpen();
    const assignmentRow = this.getControllerAssignmentRow(assignmentId);
    const assignmentEnvelopeMaterial = {
      contractId: asString(assignmentRow.contract_id, "assignment contract_id"),
      maxPhysicalCalls: asNumber(assignmentRow.max_physical_calls, "max_physical_calls"),
      maxCandidateOutputs: asNumber(
        assignmentRow.max_candidate_outputs,
        "max_candidate_outputs",
      ),
      maxCostUsd: asNumber(assignmentRow.max_cost_usd, "max_cost_usd"),
    };
    if (
      sha256(stableStringify(assignmentEnvelopeMaterial)) !==
      asString(assignmentRow.envelope_hash, "assignment envelope_hash")
    ) {
      throw new BudgetGuardError(
        "CONTROLLER_RECOVERY_CORRUPT",
        "Durable assignment envelope no longer matches its self-hash",
      );
    }
    const assignmentRegistryHash = asString(
      assignmentRow.controller_registry_hash,
      "assignment registry hash",
    );
    const durableRegistry = this.db.prepare(
      "SELECT registry_content_json FROM controller_registries WHERE registry_hash = ?",
    ).get(assignmentRegistryHash);
    if (!durableRegistry) {
      throw new BudgetGuardError("CONTROLLER_RECOVERY_CORRUPT", "Assignment registry is absent");
    }
    const registryJson = asString(durableRegistry.registry_content_json, "registry content");
    if (
      stableStringify(JSON.parse(registryJson)) !== registryJson ||
      sha256(registryJson) !== assignmentRegistryHash
    ) {
      throw new BudgetGuardError(
        "CONTROLLER_RECOVERY_CORRUPT",
        "Durable registry canonical JSON/hash is invalid",
      );
    }
    const callRows = this.db.prepare(
      `SELECT pc.*, cc.* FROM provider_calls pc
       JOIN controller_call_contracts cc ON cc.call_id = pc.call_id
       WHERE cc.assignment_id = ? ORDER BY pc.physical_attempt_ordinal, pc.call_id`,
    ).all(assignmentId);
    const calls = callRows.map((row): ControllerCallRecoveryView => {
      const callId = asString(row.call_id, "call_id");
      const requestJson = asString(row.request_json, "request_json");
      const provenanceJson = asString(row.provenance_json, "provenance_json");
      const parsedRequest = requireJsonRecord(JSON.parse(requestJson), "durable request");
      const parsedProvenance = requireJsonRecord(
        JSON.parse(provenanceJson),
        "durable provenance",
      );
      if (
        stableStringify(parsedRequest) !== requestJson ||
        stableStringify(parsedProvenance) !== provenanceJson ||
        sha256(requestJson) !== asString(row.request_hash, "request_hash") ||
        sha256(provenanceJson) !== asString(row.provenance_hash, "provenance_hash") ||
        parsedRequest.endpointHash !== row.endpoint_hash ||
        parsedRequest.wireBodyHash !== row.wire_body_hash ||
        parsedRequest.wirePromptHash !== row.wire_prompt_hash ||
        (parsedRequest.wireSchemaHash ?? null) !== row.wire_schema_hash ||
        parsedRequest.canonicalRequestHash !== row.canonical_request_hash
      ) {
        throw new BudgetGuardError(
          "CONTROLLER_RECOVERY_CORRUPT",
          "Durable call request/provenance hashes or projected wire columns diverge",
        );
      }
      const durableEntry = this.db.prepare(
        `SELECT entry_hash, entry_content_json FROM controller_registry_entries
         WHERE registry_hash = ? AND entry_id = ?`,
      ).get(
        asString(row.controller_registry_hash, "call registry hash"),
        asString(row.controller_entry_id, "call entry id"),
      );
      if (!durableEntry) {
        throw new BudgetGuardError("CONTROLLER_RECOVERY_CORRUPT", "Call registry entry is absent");
      }
      const entryJson = asString(durableEntry.entry_content_json, "entry content");
      const entryHash = asString(durableEntry.entry_hash, "entry hash");
      const parsedEntry = requireJsonRecord(JSON.parse(entryJson), "durable registry entry");
      const parsedPricing = requireJsonRecord(parsedEntry.pricing, "durable entry pricing");
      if (
        stableStringify(parsedEntry) !== entryJson ||
        sha256(entryJson) !== entryHash ||
        entryHash !== row.controller_entry_hash ||
        row.controller_registry_hash !== assignmentRegistryHash ||
        parsedPricing.pricingContractHash !== row.pricing_contract_hash
      ) {
        throw new BudgetGuardError(
          "CONTROLLER_RECOVERY_CORRUPT",
          "Durable call entry/pricing binding is invalid",
        );
      }
      const contract: ControllerCallContractInput = {
        assignmentId: asString(row.assignment_id, "assignment_id"),
        controllerRegistryHash: asString(row.controller_registry_hash, "controller_registry_hash"),
        controllerEntryId: asString(row.controller_entry_id, "controller_entry_id"),
        controllerEntryHash: asString(row.controller_entry_hash, "controller_entry_hash"),
        transitionId: asString(row.transition_id, "transition_id"),
        entryMaxUsesPerAssignment: asNumber(row.entry_max_uses, "entry_max_uses"),
        ...(row.parent_physical_call_id === null
          ? {}
          : { parentPhysicalCallId: asString(row.parent_physical_call_id, "parent_physical_call_id") }),
        requestHash: asString(row.request_hash, "request_hash"),
        requestJson,
        provenanceHash: asString(row.provenance_hash, "provenance_hash"),
        provenanceJson,
        endpointHash: asString(row.endpoint_hash, "endpoint_hash"),
        wireBodyHash: asString(row.wire_body_hash, "wire_body_hash"),
        wirePromptHash: asString(row.wire_prompt_hash, "wire_prompt_hash"),
        wireSchemaHash: optionalString(row.wire_schema_hash, "wire_schema_hash"),
        canonicalRequestHash: asString(row.canonical_request_hash, "canonical_request_hash"),
        parserArtifactHash: optionalString(row.parser_artifact_hash, "parser_artifact_hash"),
        derivationContractId: optionalString(row.derivation_contract_id, "derivation_contract_id"),
        derivationReceiptHash: optionalString(row.derivation_receipt_hash, "derivation_receipt_hash"),
        pricingContractHash: asString(row.pricing_contract_hash, "pricing_contract_hash"),
        rollingPricingAttestationHash: optionalString(
          row.rolling_pricing_attestation_hash,
          "rolling_pricing_attestation_hash",
        ),
      };
      const terminal = this.db.prepare(
        "SELECT terminal_kind, evidence_hash, evidence_json FROM controller_terminal_evidence WHERE call_id = ?",
      ).get(callId);
      const clone = this.db.prepare(
        "SELECT response_body_hash, evidence_hash, evidence_json FROM controller_clone_evidence WHERE call_id = ?",
      ).get(callId);
      const parser = this.db.prepare(
        "SELECT response_body_hash, parser_artifact_hash, evidence_hash, evidence_json FROM controller_parser_evidence WHERE call_id = ?",
      ).get(callId);
      const captured = this.db.prepare(
        "SELECT response_body_hash, byte_length, response_body FROM controller_response_bodies WHERE call_id = ?",
      ).get(callId);
      for (const [label, evidence] of [
        ["terminal", terminal],
        ["clone", clone],
        ["parser", parser],
      ] as const) {
        if (evidence) {
          const evidenceJson = asString(evidence.evidence_json, `${label} evidence_json`);
          if (
            stableStringify(JSON.parse(evidenceJson)) !== evidenceJson ||
            sha256(evidenceJson) !== asString(evidence.evidence_hash, `${label} evidence_hash`)
          ) {
            throw new BudgetGuardError(
              "CONTROLLER_RECOVERY_CORRUPT",
              `Durable ${label} evidence canonical JSON/hash is invalid`,
            );
          }
        }
      }
      const capturedValue = captured?.response_body;
      if (capturedValue !== undefined && !(capturedValue instanceof Uint8Array)) {
        throw new BudgetGuardError(
          "INVARIANT_VIOLATION",
          "Captured response body is not a SQLite BLOB",
        );
      }
      if (capturedValue instanceof Uint8Array) {
        const capturedHash = hashProviderOutput(capturedValue);
        if (
          capturedHash !== asString(captured!.response_body_hash, "captured response hash") ||
          capturedValue.byteLength !== asNumber(captured!.byte_length, "captured byte length") ||
          (clone && optionalString(clone.response_body_hash, "clone response hash") !== capturedHash) ||
          (parser && asString(parser.response_body_hash, "parser response hash") !== capturedHash) ||
          (parser && optionalString(row.parser_artifact_hash, "contract parser hash") !==
            asString(parser.parser_artifact_hash, "parser artifact hash"))
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_RECOVERY_CORRUPT",
            "Captured body, clone, parser, and contract bindings diverge",
          );
        }
      }
      return {
        call: this.toCallView(this.getCallRow(callId)),
        contract,
        candidateSlots: this.candidatesForCall(callId),
        terminalEvidenceJson: terminal
          ? asString(terminal.evidence_json, "terminal evidence_json")
          : null,
        cloneEvidenceJson: clone ? asString(clone.evidence_json, "clone evidence_json") : null,
        parserEvidenceJson: parser ? asString(parser.evidence_json, "parser evidence_json") : null,
        capturedResponseBody: capturedValue === undefined
          ? null
          : new Uint8Array(capturedValue),
      };
    });
    return { assignment: this.toControllerAssignmentView(assignmentRow), calls };
  }

  getControllerAssignmentsForRegistry(registryHash: string): ControllerAssignmentRecoveryView[] {
    this.assertOpen();
    assertSha256(registryHash, "registryHash");
    return this.db.prepare(
      `SELECT assignment_id FROM controller_assignments
       WHERE controller_registry_hash = ? AND state != 'closed'
       ORDER BY created_at, assignment_id`,
    ).all(registryHash).map((row) =>
      this.getControllerAssignmentRecovery(asString(row.assignment_id, "assignment_id")));
  }

  getBatchFinancialView(ref: BatchRef): BatchFinancialView | null {
    this.assertOpen();
    validateBatchRef(ref);
    const row = this.db.prepare(
      `SELECT * FROM batches
       WHERE campaign_id = ? AND experiment_id = ? AND phase_id = ? AND batch_id = ?`,
    ).get(CAMPAIGN_ID, ref.experimentId, ref.phaseId, ref.batchId);
    if (!row) return null;
    const batchRowId = asNumber(row.row_id, "batch row_id");
    const calls = this.db.prepare(
      `SELECT
         COALESCE(SUM(actual_cost_usd), 0) AS actual_cost,
         COALESCE(SUM(CASE WHEN usage_final = 0
           THEN MAX(reserved_cost_usd, actual_cost_usd) ELSE actual_cost_usd END), 0) AS effective_cost
       FROM provider_calls WHERE batch_row_id = ?`,
    ).get(batchRowId);
    return {
      ...ref,
      actualCostUsd: asNumber(calls?.actual_cost ?? 0, "actual cost"),
      effectiveCostUsd: asNumber(calls?.effective_cost ?? 0, "effective cost"),
      maxCostUsd: asNumber(row.max_cost_usd, "max cost"),
    };
  }

  acceptControllerAuthorizationWindow(input: ControllerAuthorizationWindowInput): void {
    assertSha256(input.campaignSemanticSha256, "campaignSemanticSha256");
    assertIdentifier(input.credentialPublicId, "credentialPublicId");
    assertPositiveInteger(input.windowOrdinal, "windowOrdinal");
    if (input.previousAuthorizationRecordSha256 !== null) {
      assertSha256(input.previousAuthorizationRecordSha256, "previousAuthorizationRecordSha256");
    }
    assertSha256(input.authorizationRecordSha256, "authorizationRecordSha256");
    assertNonNegativeFinite(input.providerUsageUsd, "providerUsageUsd");
    assertNonNegativeFinite(input.providerRemainingUsd, "providerRemainingUsd");
    assertNonNegativeFinite(input.providerHardLimitUsd, "providerHardLimitUsd");
    if (input.providerHardLimitUsd <= 0) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "providerHardLimitUsd must be positive");
    }
    this.withMutation(true, () => {
      const exact = this.db.prepare(
        `SELECT * FROM controller_authorization_windows
         WHERE campaign_semantic_sha256 = ? AND window_ordinal = ?`,
      ).get(input.campaignSemanticSha256, input.windowOrdinal);
      if (exact) {
        const persisted = {
          campaignSemanticSha256: asString(exact.campaign_semantic_sha256, "campaign semantic"),
          credentialPublicId: asString(exact.credential_public_id, "credential public id"),
          windowOrdinal: asNumber(exact.window_ordinal, "window ordinal"),
          previousAuthorizationRecordSha256: optionalString(
            exact.previous_authorization_record_sha256,
            "previous authorization record",
          ),
          authorizationRecordSha256: asString(exact.authorization_record_sha256, "authorization record"),
          providerUsageUsd: asNumber(exact.provider_usage_usd, "provider usage"),
          providerRemainingUsd: asNumber(exact.provider_remaining_usd, "provider remaining"),
          providerHardLimitUsd: asNumber(exact.provider_hard_limit_usd, "provider hard limit"),
        };
        if (stableStringify(persisted) !== stableStringify(input)) {
          throw new BudgetGuardError(
            "AUTHORIZATION_CHAIN_CONFLICT",
            "Authorization ordinal is already occupied by different evidence",
          );
        }
        return { idempotent: true };
      }
      const head = this.db.prepare(
        `SELECT * FROM controller_authorization_windows
         WHERE campaign_semantic_sha256 = ? ORDER BY window_ordinal DESC LIMIT 1`,
      ).get(input.campaignSemanticSha256);
      if (!head) {
        if (
          input.windowOrdinal !== 1 ||
          input.previousAuthorizationRecordSha256 !== null ||
          Math.abs(
            input.providerUsageUsd + input.providerRemainingUsd - input.providerHardLimitUsd,
          ) > EPSILON
        ) {
          throw new BudgetGuardError(
            "AUTHORIZATION_CHAIN_GAP",
            "The first durable authorization window must be ordinal one with no predecessor",
          );
        }
      } else {
        const priorOrdinal = asNumber(head.window_ordinal, "prior window ordinal");
        const priorHash = asString(head.authorization_record_sha256, "prior authorization hash");
        const priorCredential = asString(head.credential_public_id, "prior credential id");
        const priorUsage = asNumber(head.provider_usage_usd, "prior provider usage");
        const priorHardLimit = asNumber(head.provider_hard_limit_usd, "prior hard limit");
        if (
          input.windowOrdinal !== priorOrdinal + 1 ||
          input.previousAuthorizationRecordSha256 !== priorHash ||
          input.credentialPublicId !== priorCredential ||
          input.providerUsageUsd + EPSILON < priorUsage ||
          Math.abs(input.providerHardLimitUsd - priorHardLimit) > EPSILON ||
          Math.abs(
            input.providerUsageUsd + input.providerRemainingUsd - input.providerHardLimitUsd,
          ) > EPSILON
        ) {
          throw new BudgetGuardError(
            "AUTHORIZATION_CHAIN_INVALID",
            "Authorization must extend the unique credential/usage chain monotonically",
          );
        }
      }
      this.db.prepare(
        `INSERT INTO controller_authorization_windows(
           campaign_semantic_sha256, credential_public_id, window_ordinal,
           previous_authorization_record_sha256, authorization_record_sha256,
           provider_usage_usd, provider_remaining_usd, provider_hard_limit_usd, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.campaignSemanticSha256,
        input.credentialPublicId,
        input.windowOrdinal,
        input.previousAuthorizationRecordSha256,
        input.authorizationRecordSha256,
        input.providerUsageUsd,
        input.providerRemainingUsd,
        input.providerHardLimitUsd,
        nowUtc(),
      );
      return { idempotent: false };
    });
  }

  assertControllerAuthorizationWindowHead(input: ControllerAuthorizationWindowInput): void {
    this.assertOpen();
    const head = this.db.prepare(
      `SELECT * FROM controller_authorization_windows
       WHERE campaign_semantic_sha256 = ? ORDER BY window_ordinal DESC LIMIT 1`,
    ).get(input.campaignSemanticSha256);
    if (!head) {
      throw new BudgetGuardError("AUTHORIZATION_REQUIRED", "No durable authorization head exists");
    }
    if (
      asNumber(head.window_ordinal, "window ordinal") !== input.windowOrdinal ||
      asString(head.authorization_record_sha256, "authorization hash") !==
        input.authorizationRecordSha256 ||
      asString(head.credential_public_id, "credential id") !== input.credentialPublicId ||
      Math.abs(asNumber(head.provider_usage_usd, "provider usage") - input.providerUsageUsd) > EPSILON ||
      Math.abs(asNumber(head.provider_remaining_usd, "provider remaining") - input.providerRemainingUsd) > EPSILON ||
      Math.abs(asNumber(head.provider_hard_limit_usd, "provider hard limit") - input.providerHardLimitUsd) > EPSILON
    ) {
      throw new BudgetGuardError(
        "AUTHORIZATION_HEAD_STALE",
        "Execution permit is not the current durable authorization head",
      );
    }
  }

  summary(): CampaignSummary {
    this.assertOpen();
    return summarizeDatabase(this.db);
  }

  reserveBatch(input: ReserveBatchInput, options: MutationOptions = {}): MutationReceipt<BatchView> {
    validateBatchRef(input);
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertPositiveInteger(input.candidateSlots, "candidateSlots");
    assertPositiveInteger(input.maxProviderCalls, "maxProviderCalls");
    assertNonNegativeFinite(input.maxCostUsd, "maxCostUsd");
    if (input.sealedControllerCampaign) {
      const sealed = input.sealedControllerCampaign;
      assertSha256(sealed.campaignSemanticSha256, "sealed campaign semantic hash");
      assertSha256(sealed.durableBatchIdentitySha256, "sealed durable batch identity");
      assertSha256(sealed.expectedAssignmentSetSha256, "sealed assignment-set hash");
      if (
        !Array.isArray(sealed.expectedAssignmentIds) ||
        sealed.expectedAssignmentIds.length !== input.candidateSlots ||
        new Set(sealed.expectedAssignmentIds).size !== sealed.expectedAssignmentIds.length
      ) {
        throw new BudgetGuardError(
          "SEALED_CAMPAIGN_INVALID",
          "Sealed assignment IDs must be unique and exactly fill the candidate allocation",
        );
      }
      for (const assignmentId of sealed.expectedAssignmentIds) {
        assertIdentifier(assignmentId, "sealed assignmentId");
      }
      const sorted = [...sealed.expectedAssignmentIds].sort(
        (left, right) => left < right ? -1 : left > right ? 1 : 0,
      );
      if (
        stableStringify(sorted) !== stableStringify(sealed.expectedAssignmentIds) ||
        sha256(stableStringify(sorted)) !== sealed.expectedAssignmentSetSha256
      ) {
        throw new BudgetGuardError(
          "SEALED_CAMPAIGN_INVALID",
          "Sealed assignment IDs must be canonical and match their set hash",
        );
      }
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("reserve_batch", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "reserve_batch",
        opFingerprint,
        `${input.experimentId}/${input.phaseId}/${input.batchId}`,
      );
      if (claim.idempotent) {
        const existing = this.db.prepare("SELECT * FROM batches WHERE reserve_operation_key = ?").get(
          input.idempotencyKey,
        );
        if (!existing) throw new BudgetGuardError("INVARIANT_VIOLATION", "Reserved batch is missing");
        return { idempotent: true, batch: this.toBatchView(existing) };
      }
      this.assertNoCampaignCandidateOverflow();
      const phase = resolveRegistryPhase(
        loadRegistry(this.registryPath),
        input.experimentId,
        input.phaseId,
      );
      assertPhaseOperational(phase);
      const duplicate = this.db.prepare(
        `SELECT row_id FROM batches
         WHERE campaign_id = ? AND experiment_id = ? AND phase_id = ? AND batch_id = ?`,
      ).get(CAMPAIGN_ID, input.experimentId, input.phaseId, input.batchId);
      if (duplicate) throw new BudgetGuardError("BATCH_EXISTS", "Batch identifier already exists");
      const phaseCommitted = this.phaseCommittedSlots(input.experimentId, input.phaseId);
      if (phaseCommitted + input.candidateSlots > phase.budget) {
        throw new BudgetGuardError(
          "PHASE_ALLOCATION_EXCEEDED",
          `Reservation would exceed ${input.experimentId}/${input.phaseId} budget ${phase.budget}`,
        );
      }
      const phaseCallCapacity = this.phaseCommittedCallCapacity(input.experimentId, input.phaseId);
      if (phaseCallCapacity + input.maxProviderCalls > phase.maxPhysicalProviderCalls) {
        throw new BudgetGuardError(
          "PHASE_CALL_ALLOCATION_EXCEEDED",
          `Reservation would exceed ${input.experimentId}/${input.phaseId} physical-call cap ${phase.maxPhysicalProviderCalls}`,
        );
      }
      const phaseCostCapacity = this.phaseCommittedCostCapacity(input.experimentId, input.phaseId);
      if (phaseCostCapacity + input.maxCostUsd - phase.maxCostUsd > EPSILON) {
        throw new BudgetGuardError(
          "PHASE_COST_ALLOCATION_EXCEEDED",
          `Reservation would exceed ${input.experimentId}/${input.phaseId} USD cap ${phase.maxCostUsd}`,
        );
      }
      const campaignCommitted = this.campaignCommittedSlots();
      if (campaignCommitted + input.candidateSlots > GLOBAL_ATTEMPT_SLOT_CAP) {
        throw new BudgetGuardError("GLOBAL_CAP_EXCEEDED", "Reservation would exceed 1,000 attempt slots");
      }
      const createdAt = nowUtc();
      this.db.prepare(
        `INSERT INTO batches(
          campaign_id, experiment_id, phase_id, batch_id, status, allocated_slots,
          released_slots, max_provider_calls, max_cost_usd, registry_budget,
          registry_call_cap, registry_cost_cap_usd, registry_hash,
          reserve_operation_key, created_at
        ) VALUES (?, ?, ?, ?, 'open', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        CAMPAIGN_ID,
        input.experimentId,
        input.phaseId,
        input.batchId,
        input.candidateSlots,
        input.maxProviderCalls,
        input.maxCostUsd,
        phase.budget,
        phase.maxPhysicalProviderCalls,
        phase.maxCostUsd,
        phase.registryHash,
        input.idempotencyKey,
        createdAt,
      );
      const row = this.getBatchRow(input);
      if (input.sealedControllerCampaign) {
        const sealed = input.sealedControllerCampaign;
        this.db.prepare(
          `INSERT INTO sealed_controller_campaigns(
             batch_row_id, campaign_semantic_sha256, durable_batch_identity_sha256,
             expected_assignment_count, expected_assignment_ids_json,
             expected_assignment_set_sha256, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          asNumber(row.row_id, "batch row_id"),
          sealed.campaignSemanticSha256,
          sealed.durableBatchIdentitySha256,
          sealed.expectedAssignmentIds.length,
          stableStringify(sealed.expectedAssignmentIds),
          sealed.expectedAssignmentSetSha256,
          createdAt,
        );
      }
      this.appendAudit(input.idempotencyKey, 0, "batch_reserved", "batch", input.batchId, {
        experimentId: input.experimentId,
        phaseId: input.phaseId,
        candidateSlots: input.candidateSlots,
        maxProviderCalls: input.maxProviderCalls,
        maxCostUsd: input.maxCostUsd,
        registryBudget: phase.budget,
        registryCallCap: phase.maxPhysicalProviderCalls,
        registryCostCapUsd: phase.maxCostUsd,
        registryHash: phase.registryHash,
      });
      return { idempotent: false, batch: this.toBatchView(row) };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.batch,
      summary: result.projectedSummary,
    };
  }

  beginCall(input: BeginCallInput, options: MutationOptions = {}): MutationReceipt<BeginCallValue> {
    validateBatchRef(input);
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    assertCallKind(input.callKind);
    assertIdentifier(input.stage, "stage");
    assertIdentifier(input.model, "model");
    assertNonNegativeFinite(input.reservedCostUsd, "reservedCostUsd");
    const logicalOperationId = input.logicalOperationId ?? input.callId;
    const physicalAttemptOrdinal = input.physicalAttemptOrdinal ?? 0;
    assertIdentifier(logicalOperationId, "logicalOperationId");
    assertNonNegativeInteger(physicalAttemptOrdinal, "physicalAttemptOrdinal");
    if (input.parentCandidateSlotId !== undefined) {
      assertIdentifier(input.parentCandidateSlotId, "parentCandidateSlotId");
      if (input.callKind !== "full_question_generation") {
        throw new BudgetGuardError(
          "INVALID_ARGUMENT",
          "Only candidate-output repair/regeneration calls may name a parent candidate",
        );
      }
    }
    const requestedCandidateSlotIds = input.candidateSlotIds ?? [];
    if (new Set(requestedCandidateSlotIds).size !== requestedCandidateSlotIds.length) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "candidateSlotIds contains duplicates");
    }
    for (const slotId of requestedCandidateSlotIds) assertIdentifier(slotId, "candidateSlotId");
    const expectedCandidateOutputs = input.expectedCandidateOutputs ?? 0;
    assertNonNegativeInteger(expectedCandidateOutputs, "expectedCandidateOutputs");
    if (input.callKind === "full_question_generation" && expectedCandidateOutputs === 0) {
      throw new BudgetGuardError(
        "CANDIDATE_OUTPUT_COUNT_REQUIRED",
        "Candidate-output calls require a positive expectedCandidateOutputs reservation",
      );
    }
    if (input.callKind !== "full_question_generation" && expectedCandidateOutputs !== 0) {
      throw new BudgetGuardError(
        "INVALID_ARGUMENT",
        "Design/evaluation calls cannot reserve candidate outputs",
      );
    }
    if (
      requestedCandidateSlotIds.length > 0 &&
      requestedCandidateSlotIds.length !== expectedCandidateOutputs
    ) {
      throw new BudgetGuardError(
        "INVALID_ARGUMENT",
        "candidateSlotIds length must equal expectedCandidateOutputs",
      );
    }
    if (input.callKind !== "full_question_generation" && requestedCandidateSlotIds.length > 0) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Only candidate-output calls may name slots");
    }
    let controllerRequest: Record<string, unknown> | null = null;
    let controllerProvenance: Record<string, unknown> | null = null;
    if (input.controller) {
      const controller = input.controller;
      assertIdentifier(controller.assignmentId, "controller.assignmentId");
      assertSha256(controller.controllerRegistryHash, "controller.controllerRegistryHash");
      assertIdentifier(controller.controllerEntryId, "controller.controllerEntryId");
      assertSha256(controller.controllerEntryHash, "controller.controllerEntryHash");
      assertIdentifier(controller.transitionId, "controller.transitionId");
      assertPositiveInteger(
        controller.entryMaxUsesPerAssignment,
        "controller.entryMaxUsesPerAssignment",
      );
      if (controller.parentPhysicalCallId !== undefined) {
        assertIdentifier(controller.parentPhysicalCallId, "controller.parentPhysicalCallId");
      }
      const parsedRequest = this.assertCanonicalControllerJson(
        controller.requestJson,
        controller.requestHash,
        "controller request",
      );
      const parsedProvenance = this.assertCanonicalControllerJson(
        controller.provenanceJson,
        controller.provenanceHash,
        "controller provenance",
      );
      if (
        !parsedRequest ||
        typeof parsedRequest !== "object" ||
        Array.isArray(parsedRequest) ||
        !parsedProvenance ||
        typeof parsedProvenance !== "object" ||
        Array.isArray(parsedProvenance)
      ) {
        throw new BudgetGuardError(
          "INVALID_ARGUMENT",
          "Controller request and provenance must be JSON objects",
        );
      }
      controllerRequest = parsedRequest as Record<string, unknown>;
      controllerProvenance = parsedProvenance as Record<string, unknown>;
      for (const [label, value] of [
        ["endpointHash", controller.endpointHash],
        ["wireBodyHash", controller.wireBodyHash],
        ["wirePromptHash", controller.wirePromptHash],
        ["canonicalRequestHash", controller.canonicalRequestHash],
        ["pricingContractHash", controller.pricingContractHash],
      ] as const) {
        assertSha256(value, `controller.${label}`);
      }
      if (controller.wireSchemaHash !== null) {
        assertSha256(controller.wireSchemaHash, "controller.wireSchemaHash");
      }
      if (controller.parserArtifactHash !== null) {
        assertSha256(controller.parserArtifactHash, "controller.parserArtifactHash");
      }
      if (
        controller.rollingPricingAttestationHash !== undefined &&
        controller.rollingPricingAttestationHash !== null
      ) {
        assertSha256(
          controller.rollingPricingAttestationHash,
          "controller.rollingPricingAttestationHash",
        );
      }
      if ((controller.derivationContractId === null) !== (controller.derivationReceiptHash === null)) {
        throw new BudgetGuardError(
          "INVALID_ARGUMENT",
          "Derivation contract and receipt must both be present or absent",
        );
      }
      if (controller.derivationContractId !== null) {
        assertIdentifier(controller.derivationContractId, "controller.derivationContractId");
        assertSha256(controller.derivationReceiptHash!, "controller.derivationReceiptHash");
      }
      if (
        controllerRequest.endpointHash !== controller.endpointHash ||
        controllerRequest.wireBodyHash !== controller.wireBodyHash ||
        controllerRequest.wirePromptHash !== controller.wirePromptHash ||
        (controllerRequest.wireSchemaHash ?? null) !== controller.wireSchemaHash ||
        controllerRequest.canonicalRequestHash !== controller.canonicalRequestHash ||
        controllerRequest.model !== input.model ||
        controllerProvenance.effectiveModel !== input.model ||
        controllerProvenance.stage !== input.stage
      ) {
        throw new BudgetGuardError(
          "CONTROLLER_CALL_CONTRACT_MISMATCH",
          "Duplicated wire/provenance fields differ from their canonical controller JSON",
        );
      }
      const fixedPerCompletion = controllerRequest.structurallyFixedOutputsPerCompletion;
      const completionCount = controllerRequest.completionCount;
      if (
        input.callKind === "full_question_generation" &&
        (
          !Number.isSafeInteger(fixedPerCompletion) ||
          (fixedPerCompletion as number) <= 0 ||
          !Number.isSafeInteger(completionCount) ||
          (completionCount as number) <= 0 ||
          (fixedPerCompletion as number) * (completionCount as number) !==
            expectedCandidateOutputs
        )
      ) {
        throw new BudgetGuardError(
          "CONTROLLER_CANDIDATE_COUNT_MISMATCH",
          "Controller candidate reservation differs from the frozen wire cardinality",
        );
      }
    }
    const normalized = {
      ...input,
      logicalOperationId,
      physicalAttemptOrdinal,
      expectedCandidateOutputs,
      candidateSlotIds: requestedCandidateSlotIds,
    };
    const apply = options.apply === true;
    const opFingerprint = fingerprint("begin_call", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "begin_call",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        const row = this.db.prepare("SELECT * FROM provider_calls WHERE begin_operation_key = ?").get(
          input.idempotencyKey,
        );
        if (!row) throw new BudgetGuardError("INVARIANT_VIOLATION", "Provider call is missing");
        return {
          idempotent: true,
          call: {
            ...this.toCallView(row),
            shouldExecute: false,
            candidateSlotIds: this.candidateIdsForCall(input.callId),
          },
        };
      }
      if (this.db.prepare("SELECT call_id FROM provider_calls WHERE call_id = ?").get(input.callId)) {
        throw new BudgetGuardError("CALL_ID_EXISTS", `Call ID ${input.callId} already exists`);
      }
      this.assertNoCampaignCandidateOverflow();
      const batch = this.getBatchRow(input);
      this.assertBatchCanStartWork(batch);
      this.assertCurrentPhaseCanStartWork(batch);
      const batchRowId = asNumber(batch.row_id, "batch row_id");
      const batchAssignmentCount = asNumber(
        this.db.prepare(
          "SELECT COUNT(*) AS count FROM controller_assignments WHERE batch_row_id = ?",
        ).get(batchRowId)?.count ?? 0,
        "batch assignment count",
      );
      if (batchAssignmentCount > 0 && !input.controller) {
        throw new BudgetGuardError(
          "MIXED_CONTROLLER_BATCH",
          "A controller-governed batch cannot admit unmanaged provider calls",
        );
      }
      if (input.controller) {
        const controller = input.controller;
        const assignment = this.getControllerAssignmentRow(controller.assignmentId);
        if (assignment.state !== "open") {
          throw new BudgetGuardError(
            "ASSIGNMENT_NOT_OPEN",
            "Controller assignment does not admit new physical calls",
          );
        }
        if (asNumber(assignment.batch_row_id, "assignment batch_row_id") !== batchRowId) {
          throw new BudgetGuardError("ASSIGNMENT_BATCH_MISMATCH", "Assignment belongs to another batch");
        }
        if (asString(assignment.operation_id, "operation_id") !== logicalOperationId) {
          throw new BudgetGuardError(
            "ASSIGNMENT_OPERATION_MISMATCH",
            "Logical operation does not match its whole-assignment lease",
          );
        }
        if (
          asString(assignment.controller_registry_hash, "controller_registry_hash") !==
          controller.controllerRegistryHash
        ) {
          throw new BudgetGuardError(
            "ASSIGNMENT_REGISTRY_MISMATCH",
            "Call controller registry differs from assignment registry",
          );
        }
        const registryEntry = this.db.prepare(
          `SELECT entry_hash, entry_content_json FROM controller_registry_entries
           WHERE registry_hash = ? AND entry_id = ?`,
        ).get(controller.controllerRegistryHash, controller.controllerEntryId);
        if (
          !registryEntry ||
          asString(registryEntry.entry_hash, "entry_hash") !== controller.controllerEntryHash
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_ENTRY_MISMATCH",
            "Call entry is absent from the durable self-hashed registry",
          );
        }
        const entryContent = requireJsonRecord(
          JSON.parse(asString(registryEntry.entry_content_json, "entry_content_json")),
          "durable controller entry",
        );
        const entryWire = requireJsonRecord(entryContent.wire, "durable entry wire contract");
        const entryPricing = requireJsonRecord(
          entryContent.pricing,
          "durable entry pricing contract",
        );
        const expectedCallKind = entryContent.purpose === "candidate"
          ? "full_question_generation"
          : entryContent.purpose;
        if (
          expectedCallKind !== input.callKind ||
          entryContent.maxUsesPerAssignment !== controller.entryMaxUsesPerAssignment ||
          entryPricing.pricingContractHash !== controller.pricingContractHash ||
          entryWire.endpointHash !== controller.endpointHash ||
          (entryWire.wireSchemaHash ?? null) !== controller.wireSchemaHash ||
          entryWire.outputShape !== controllerRequest!.outputShape ||
          entryWire.structurallyFixedOutputsPerCompletion !==
            controllerRequest!.structurallyFixedOutputsPerCompletion ||
          entryWire.completionCount !== controllerRequest!.completionCount ||
          typeof controllerRequest!.requestBodyUtf8Bytes !== "number" ||
          typeof entryWire.maxRequestBodyUtf8Bytes !== "number" ||
          controllerRequest!.requestBodyUtf8Bytes > entryWire.maxRequestBodyUtf8Bytes
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_ENTRY_CONTRACT_MISMATCH",
            "Physical call differs from its durable self-hashed registry entry",
          );
        }
        const requestTokenCaps = [
          controllerRequest!.maxTokens,
          controllerRequest!.maxCompletionTokens,
          controllerRequest!.maxOutputTokens,
        ].filter((value): value is number => typeof value === "number");
        if (
          requestTokenCaps.length !== 1 ||
          requestTokenCaps[0] !== entryWire.maxOutputTokens
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_ENTRY_CONTRACT_MISMATCH",
            "Runtime output-token cap differs from its durable registry entry",
          );
        }
        const entryCandidate = entryContent.candidateContract === null
          ? null
          : requireJsonRecord(entryContent.candidateContract, "durable candidate contract");
        if (
          (entryCandidate?.parserArtifactHash ?? null) !== controller.parserArtifactHash ||
          (entryContent.candidateProducing === true) !==
            (input.callKind === "full_question_generation")
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_CANDIDATE_PURPOSE_MISMATCH",
            "Durable entry candidate capability differs from the physical call",
          );
        }
        const entryProvenance = requireJsonRecord(
          entryContent.provenance,
          "durable entry provenance",
        );
        const requestMode = entryWire.requestMode;
        if (requestMode === "exact") {
          if (
            entryWire.wireBodyHash !== controller.wireBodyHash ||
            entryWire.wirePromptHash !== controller.wirePromptHash ||
            stableStringify(entryProvenance) !== stableStringify(controllerProvenance) ||
            controller.derivationContractId !== null ||
            controller.derivationReceiptHash !== null
          ) {
            throw new BudgetGuardError(
              "CONTROLLER_EXACT_REQUEST_MISMATCH",
              "Exact request differs from its durable registry entry",
            );
          }
        } else if (requestMode === "derived") {
          const derivation = requireJsonRecord(
            entryWire.derivationContract,
            "durable derivation contract",
          );
          const entryProvenanceTemplate = { ...entryProvenance, promptHash: undefined };
          const runtimeProvenanceTemplate = {
            ...controllerProvenance!,
            promptHash: undefined,
          };
          if (
            entryWire.wireBodyHash !== null ||
            entryWire.wirePromptHash !== null ||
            derivation.contractId !== controller.derivationContractId ||
            stableStringify(entryProvenanceTemplate) !==
              stableStringify(runtimeProvenanceTemplate) ||
            controllerProvenance!.promptHash !== controller.wirePromptHash ||
            !controller.parentPhysicalCallId ||
            !controller.derivationReceiptHash
          ) {
            throw new BudgetGuardError(
              "CONTROLLER_DERIVED_REQUEST_MISMATCH",
              "Derived request differs from its durable derivation contract",
            );
          }
          const parentClone = this.db.prepare(
            `SELECT ce.response_body_hash FROM controller_clone_evidence ce
             JOIN controller_call_contracts cc ON cc.call_id = ce.call_id
             WHERE ce.call_id = ? AND cc.assignment_id = ?`,
          ).get(controller.parentPhysicalCallId, controller.assignmentId);
          const parentResponseBodyHash = parentClone
            ? optionalString(parentClone.response_body_hash, "parent response_body_hash")
            : null;
          if (!parentResponseBodyHash) {
            throw new BudgetGuardError(
              "CONTROLLER_DERIVATION_PARENT_EVIDENCE_MISSING",
              "Derived request requires a captured parent response-body hash",
            );
          }
          const expectedReceiptHash = sha256(stableStringify({
            contractId: controller.derivationContractId,
            artifactHash: derivation.artifactHash,
            parentPhysicalCallId: controller.parentPhysicalCallId,
            parentResponseBodyHash,
            derivedWireBodyHash: controller.wireBodyHash,
            derivedWirePromptHash: controller.wirePromptHash,
          }));
          if (expectedReceiptHash !== controller.derivationReceiptHash) {
            throw new BudgetGuardError(
              "CONTROLLER_DERIVATION_RECEIPT_MISMATCH",
              "Derived request receipt does not bind parent, artifact, and exact child bytes",
            );
          }
        } else {
          throw new BudgetGuardError(
            "CONTROLLER_ENTRY_CONTRACT_MISMATCH",
            "Durable registry entry has an unknown request mode",
          );
        }
        let parentEntryId: string | null = null;
        if (controller.parentPhysicalCallId) {
          const parent = this.db.prepare(
            `SELECT cc.assignment_id, cc.controller_entry_id, pc.state
             FROM controller_call_contracts cc
             JOIN provider_calls pc ON pc.call_id = cc.call_id
             WHERE cc.call_id = ?`,
          ).get(controller.parentPhysicalCallId);
          if (
            !parent ||
            asString(parent.assignment_id, "parent assignment_id") !== controller.assignmentId
          ) {
            throw new BudgetGuardError(
              "CONTROLLER_PARENT_MISMATCH",
              "Parent physical call is absent or belongs to another assignment",
            );
          }
          if (parent.state !== "settled") {
            throw new BudgetGuardError(
              "CONTROLLER_PARENT_UNSETTLED",
              "Child physical call requires a settled parent",
            );
          }
          parentEntryId = asString(parent.controller_entry_id, "parent controller_entry_id");
        }
        const registryRow = this.db.prepare(
          "SELECT registry_content_json FROM controller_registries WHERE registry_hash = ?",
        ).get(controller.controllerRegistryHash);
        const registryContent = requireJsonRecord(
          JSON.parse(asString(registryRow?.registry_content_json, "registry_content_json")),
          "durable controller registry",
        );
        const matchingTransitions = requireJsonArray(
          registryContent.transitions,
          "durable registry transitions",
        ).filter((value) => {
          const transition = requireJsonRecord(value, "durable registry transition");
          return transition.transitionId === controller.transitionId;
        });
        if (matchingTransitions.length !== 1) {
          throw new BudgetGuardError(
            "CONTROLLER_TRANSITION_MISMATCH",
            "Transition ID is absent or ambiguous in the durable registry",
          );
        }
        const transition = requireJsonRecord(
          matchingTransitions[0],
          "durable registry transition",
        );
        if (
          (transition.fromEntryId ?? null) !== parentEntryId ||
          transition.toEntryId !== controller.controllerEntryId
        ) {
          throw new BudgetGuardError(
            "CONTROLLER_TRANSITION_MISMATCH",
            "Parent physical entry does not satisfy the frozen stage transition",
          );
        }
        const counts = this.controllerAssignmentCounts(controller.assignmentId);
        if (counts.physicalCalls + 1 > asNumber(assignment.max_physical_calls, "max_physical_calls")) {
          throw new BudgetGuardError(
            "ASSIGNMENT_CALL_CAP_EXCEEDED",
            "Assignment physical-call envelope is exhausted",
          );
        }
        if (
          counts.candidateOpportunities + expectedCandidateOutputs >
          asNumber(assignment.max_candidate_outputs, "max_candidate_outputs")
        ) {
          throw new BudgetGuardError(
            "ASSIGNMENT_CANDIDATE_CAP_EXCEEDED",
            "Assignment candidate-opportunity envelope is exhausted",
          );
        }
        if (
          this.controllerAssignmentEffectiveCost(controller.assignmentId) + input.reservedCostUsd -
          asNumber(assignment.max_cost_usd, "max_cost_usd") > EPSILON
        ) {
          throw new BudgetGuardError(
            "ASSIGNMENT_COST_CAP_EXCEEDED",
            "Assignment conservative USD envelope is exhausted",
          );
        }
        const entryUses = asNumber(
          this.db.prepare(
            `SELECT COUNT(*) AS count FROM controller_call_contracts
             WHERE assignment_id = ? AND controller_entry_id = ?`,
          ).get(controller.assignmentId, controller.controllerEntryId)?.count ?? 0,
          "controller entry uses",
        );
        if (entryUses >= controller.entryMaxUsesPerAssignment) {
          throw new BudgetGuardError(
            "CONTROLLER_ENTRY_USE_CAP_EXCEEDED",
            "Frozen controller entry use count is exhausted",
          );
        }
      }
      if (
        this.db.prepare(
          `SELECT 1 AS ok FROM provider_calls
           WHERE batch_row_id = ? AND logical_operation_id = ? AND physical_attempt_ordinal = ?`,
        ).get(batchRowId, logicalOperationId, physicalAttemptOrdinal)
      ) {
        throw new BudgetGuardError(
          "LOGICAL_ATTEMPT_EXISTS",
          "Logical operation already has a physical call at this attempt ordinal",
        );
      }
      if (input.parentCandidateSlotId !== undefined) {
        const parent = this.getCandidateRow(input.parentCandidateSlotId);
        if (asNumber(parent.batch_row_id, "parent candidate batch_row_id") !== batchRowId) {
          throw new BudgetGuardError(
            "CANDIDATE_BATCH_MISMATCH",
            "Parent candidate belongs to another batch",
          );
        }
        if (
          parent.state === "awaiting_result" ||
          parent.outcome === "no_candidate" ||
          parent.outcome === "unknown_after_send"
        ) {
          throw new BudgetGuardError(
            "INVALID_PARENT_CANDIDATE",
            "Repair parent must be a parsed candidate",
          );
        }
      }
      if (this.countBatchCalls(batchRowId) >= asNumber(batch.max_provider_calls, "max_provider_calls")) {
        throw new BudgetGuardError("CALL_CAP_EXCEEDED", "Batch provider-call cap is exhausted");
      }
      if (
        this.effectiveBatchCost(batchRowId) + input.reservedCostUsd -
          asNumber(batch.max_cost_usd, "max_cost_usd") >
        EPSILON
      ) {
        throw new BudgetGuardError(
          "COST_RESERVATION_EXCEEDED",
          "Conservative call-cost reservation would exceed the batch USD cap",
        );
      }
      const used = this.countBatchCandidates(batchRowId);
      const available =
        asNumber(batch.allocated_slots, "allocated_slots") -
        asNumber(batch.released_slots, "released_slots");
      if (used + expectedCandidateOutputs > available) {
        throw new BudgetGuardError(
          "BATCH_SLOT_CAP_EXCEEDED",
          "Physical call candidate-output reservation exhausts the batch allocation",
        );
      }
      const globalUsed = asNumber(
        this.db.prepare("SELECT COUNT(*) AS count FROM candidate_slots").get()?.count ?? 0,
        "global used candidates",
      );
      if (globalUsed + expectedCandidateOutputs > GLOBAL_ATTEMPT_SLOT_CAP) {
        throw new BudgetGuardError(
          "GLOBAL_CAP_EXCEEDED",
          "Physical call candidate-output reservation exceeds the global 1,000-slot cap",
        );
      }
      const candidateSlotIds = requestedCandidateSlotIds.length > 0
        ? requestedCandidateSlotIds
        : Array.from({ length: expectedCandidateOutputs }, () => `cand-${randomUUID()}`);
      for (const slotId of candidateSlotIds) {
        if (this.db.prepare("SELECT 1 AS ok FROM candidate_slots WHERE candidate_slot_id = ?").get(slotId)) {
          throw new BudgetGuardError("CANDIDATE_ID_EXISTS", `Candidate slot ${slotId} already exists`);
        }
      }
      const createdAt = nowUtc();
      this.db.prepare(
        `INSERT INTO provider_calls(
          call_id, batch_row_id, state, call_kind, stage, model, reserved_cost_usd,
          logical_operation_id, physical_attempt_ordinal, parent_candidate_slot_id,
          begin_operation_key, created_at, in_flight_at
        ) VALUES (?, ?, 'authorized', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.callId,
        batchRowId,
        input.callKind,
        input.stage,
        input.model,
        input.reservedCostUsd,
        logicalOperationId,
        physicalAttemptOrdinal,
        input.parentCandidateSlotId ?? null,
        input.idempotencyKey,
        createdAt,
        createdAt,
      );
      if (input.controller) {
        const controller = input.controller;
        this.db.prepare(
          `INSERT INTO controller_call_contracts(
             call_id, assignment_id, controller_registry_hash, controller_entry_id,
             controller_entry_hash, transition_id, entry_max_uses,
             parent_physical_call_id, request_hash, request_json, provenance_hash,
             provenance_json, endpoint_hash, wire_body_hash, wire_prompt_hash,
             wire_schema_hash, canonical_request_hash, parser_artifact_hash,
             derivation_contract_id, derivation_receipt_hash, pricing_contract_hash,
             rolling_pricing_attestation_hash, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.callId,
          controller.assignmentId,
          controller.controllerRegistryHash,
          controller.controllerEntryId,
          controller.controllerEntryHash,
          controller.transitionId,
          controller.entryMaxUsesPerAssignment,
          controller.parentPhysicalCallId ?? null,
          controller.requestHash,
          controller.requestJson,
          controller.provenanceHash,
          controller.provenanceJson,
          controller.endpointHash,
          controller.wireBodyHash,
          controller.wirePromptHash,
          controller.wireSchemaHash,
          controller.canonicalRequestHash,
          controller.parserArtifactHash,
          controller.derivationContractId,
          controller.derivationReceiptHash,
          controller.pricingContractHash,
          controller.rollingPricingAttestationHash ?? null,
          createdAt,
        );
      }
      for (const slotId of candidateSlotIds) {
        this.db.prepare(
          `INSERT INTO candidate_slots(
            candidate_slot_id, batch_row_id, state, begin_operation_key, created_at
          ) VALUES (?, ?, 'awaiting_result', ?, ?)`,
        ).run(slotId, batchRowId, input.idempotencyKey, createdAt);
        this.db.prepare(
          "INSERT INTO call_candidate_slots(call_id, candidate_slot_id) VALUES (?, ?)",
        ).run(input.callId, slotId);
      }
      this.appendAudit(input.idempotencyKey, 0, "call_authorized", "provider_call", input.callId, {
        experimentId: input.experimentId,
        phaseId: input.phaseId,
        batchId: input.batchId,
        callKind: input.callKind,
        stage: input.stage,
        model: input.model,
        logicalOperationId,
        physicalAttemptOrdinal,
        parentCandidateSlotId: input.parentCandidateSlotId ?? null,
        reservedCostUsd: input.reservedCostUsd,
        expectedCandidateOutputs,
        controller: input.controller
          ? {
              assignmentId: input.controller.assignmentId,
              registryHash: input.controller.controllerRegistryHash,
              entryId: input.controller.controllerEntryId,
              entryHash: input.controller.controllerEntryHash,
              transitionId: input.controller.transitionId,
              parentPhysicalCallId: input.controller.parentPhysicalCallId ?? null,
              requestHash: input.controller.requestHash,
              provenanceHash: input.controller.provenanceHash,
              pricingContractHash: input.controller.pricingContractHash,
              rollingPricingAttestationHash:
                input.controller.rollingPricingAttestationHash ?? null,
            }
          : null,
        candidateSlotIds,
      });
      candidateSlotIds.forEach((slotId, index) => {
        this.appendAudit(
          input.idempotencyKey,
          index + 1,
          "candidate_started",
          "candidate_slot",
          slotId,
          {
            callId: input.callId,
            outputReservationOrdinal: index,
            permanentlyConsumedAttemptSlot: true,
            consumedBeforeNetwork: true,
          },
        );
      });
      this.db.prepare("UPDATE provider_calls SET state = 'in_flight' WHERE call_id = ?").run(input.callId);
      this.appendAudit(
        input.idempotencyKey,
        candidateSlotIds.length + 1,
        "call_in_flight",
        "provider_call",
        input.callId,
        { reservationRetainedUntilSettlement: true },
      );
      return {
        idempotent: false,
        call: {
          ...this.toCallView(this.getCallRow(input.callId)),
          shouldExecute: true,
          candidateSlotIds,
        },
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.call,
      summary: result.projectedSummary,
    };
  }

  private markBatchBreached(
    batchRowId: number,
    reason: string,
    operationKey: string,
    ordinal: number,
  ): boolean {
    const batch = this.db.prepare("SELECT * FROM batches WHERE row_id = ?").get(batchRowId);
    if (!batch) throw new BudgetGuardError("INVARIANT_VIOLATION", "Call batch is missing");
    const alreadyBreached = booleanFromSql(batch.breached);
    const previousReason = optionalString(batch.breach_reason, "breach_reason");
    if (alreadyBreached && previousReason?.split("; ").includes(reason)) return false;
    const combinedReason = previousReason ? `${previousReason}; ${reason}` : reason;
    this.db.prepare(
      "UPDATE batches SET breached = 1, breach_reason = ? WHERE row_id = ?",
    ).run(combinedReason, batchRowId);
    this.appendAudit(
      operationKey,
      ordinal,
      "batch_breached",
      "batch",
      asString(batch.batch_id, "batch_id"),
      { reason, additional: alreadyBreached },
    );
    return true;
  }

  settleCall(input: SettleCallInput, options: MutationOptions = {}): MutationReceipt<CallView> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    assertCallOutcome(input.outcome);
    assertNonNegativeInteger(input.inputTokens, "inputTokens");
    assertNonNegativeInteger(input.outputTokens, "outputTokens");
    assertNonNegativeFinite(input.costUsd, "costUsd");
    assertNonNegativeInteger(input.latencyMs, "latencyMs");
    if (typeof input.usageFinal !== "boolean") {
      throw new BudgetGuardError("INVALID_ARGUMENT", "usageFinal must be boolean");
    }
    if (input.providerRequestId !== undefined) {
      assertMetadataString(input.providerRequestId, "providerRequestId");
    }
    if (input.outcome === "unknown" && input.usageFinal) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Unknown calls cannot have final usage");
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("settle_call", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "settle_call",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        const row = this.getCallRow(input.callId);
        return { idempotent: true, call: this.toCallView(row) };
      }
      const call = this.getCallRow(input.callId);
      if (call.state === "settled") {
        throw new BudgetGuardError("CALL_ALREADY_SETTLED", `Call ${input.callId} is already settled`);
      }
      const settledAt = nowUtc();
      this.db.prepare(
        `UPDATE provider_calls SET
          state = 'settled', outcome = ?, input_tokens = ?, output_tokens = ?,
          actual_cost_usd = ?, latency_ms = ?, usage_final = ?, provider_request_id = ?,
          settle_operation_key = ?, settle_fingerprint = ?, settled_at = ?
         WHERE call_id = ?`,
      ).run(
        input.outcome,
        input.inputTokens,
        input.outputTokens,
        input.costUsd,
        input.latencyMs,
        input.usageFinal ? 1 : 0,
        input.providerRequestId ?? null,
        input.idempotencyKey,
        opFingerprint,
        settledAt,
        input.callId,
      );
      const batchRowId = asNumber(call.batch_row_id, "call batch_row_id");
      const batch = this.db.prepare("SELECT * FROM batches WHERE row_id = ?").get(batchRowId);
      if (!batch) throw new BudgetGuardError("INVARIANT_VIOLATION", "Call batch is missing");
      const reasons: string[] = [];
      if (input.costUsd - asNumber(call.reserved_cost_usd, "reserved_cost_usd") > EPSILON) {
        reasons.push("actual call cost exceeded its conservative reservation");
      }
      if (this.effectiveBatchCost(batchRowId) - asNumber(batch.max_cost_usd, "max_cost_usd") > EPSILON) {
        reasons.push("effective batch cost exceeded its preregistered cap");
      }
      this.appendAudit(input.idempotencyKey, 0, "call_settled", "provider_call", input.callId, {
        outcome: input.outcome,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsd: input.costUsd,
        latencyMs: input.latencyMs,
        usageFinal: input.usageFinal,
        providerRequestId: input.providerRequestId ?? null,
        overrunRecorded: reasons.length > 0,
      });
      if (reasons.length > 0) {
        this.markBatchBreached(batchRowId, reasons.join("; "), input.idempotencyKey, 1);
      }
      return { idempotent: false, call: this.toCallView(this.getCallRow(input.callId)) };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.call,
      summary: result.projectedSummary,
    };
  }

  reconcileCallUsage(
    input: ReconcileCallInput,
    options: MutationOptions = {},
  ): MutationReceipt<CallView> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    assertNonNegativeInteger(input.inputTokens, "inputTokens");
    assertNonNegativeInteger(input.outputTokens, "outputTokens");
    assertNonNegativeFinite(input.costUsd, "costUsd");
    if (typeof input.usageFinal !== "boolean") {
      throw new BudgetGuardError("INVALID_ARGUMENT", "usageFinal must be boolean");
    }
    if (input.providerRequestId !== undefined) {
      assertMetadataString(input.providerRequestId, "providerRequestId");
    }
    const apply = options.apply === true;
    const opFingerprint = fingerprint("reconcile_call", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "reconcile_call",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        return { idempotent: true, call: this.toCallView(this.getCallRow(input.callId)) };
      }
      const call = this.getCallRow(input.callId);
      if (call.state !== "settled") {
        throw new BudgetGuardError("CALL_UNRESOLVED", "Only settled calls can be reconciled");
      }
      const existingProviderRequestId = optionalString(
        call.provider_request_id,
        "provider_request_id",
      );
      if (
        existingProviderRequestId !== null &&
        input.providerRequestId !== undefined &&
        input.providerRequestId !== existingProviderRequestId
      ) {
        throw new BudgetGuardError(
          "PROVIDER_REQUEST_ID_CONFLICT",
          "Reconciliation providerRequestId does not match the settled physical call",
        );
      }
      if (booleanFromSql(call.usage_final)) {
        throw new BudgetGuardError(
          input.usageFinal ? "USAGE_FINAL_IMMUTABLE" : "USAGE_FINAL_DOWNGRADE",
          "Final provider usage is immutable; authenticated corrections require a separate protocol",
        );
      }
      const createdAt = nowUtc();
      this.db.prepare(
        `INSERT INTO usage_reconciliations(
          call_id, operation_key, input_tokens, output_tokens, cost_usd,
          usage_final, provider_request_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.callId,
        input.idempotencyKey,
        input.inputTokens,
        input.outputTokens,
        input.costUsd,
        input.usageFinal ? 1 : 0,
        input.providerRequestId ?? null,
        createdAt,
      );
      this.db.prepare(
        `UPDATE provider_calls SET input_tokens = ?, output_tokens = ?, actual_cost_usd = ?,
          usage_final = ?, provider_request_id = COALESCE(?, provider_request_id)
         WHERE call_id = ?`,
      ).run(
        input.inputTokens,
        input.outputTokens,
        input.costUsd,
        input.usageFinal ? 1 : 0,
        input.providerRequestId ?? null,
        input.callId,
      );
      this.appendAudit(
        input.idempotencyKey,
        0,
        "usage_reconciled",
        "provider_call",
        input.callId,
        {
          previous: {
            inputTokens: asNumber(call.input_tokens, "input_tokens"),
            outputTokens: asNumber(call.output_tokens, "output_tokens"),
            costUsd: asNumber(call.actual_cost_usd, "actual_cost_usd"),
            usageFinal: booleanFromSql(call.usage_final),
          },
          reconciled: {
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            costUsd: input.costUsd,
            usageFinal: input.usageFinal,
            providerRequestId: input.providerRequestId ?? null,
          },
        },
      );
      const batchRowId = asNumber(call.batch_row_id, "call batch_row_id");
      const batch = this.db.prepare("SELECT * FROM batches WHERE row_id = ?").get(batchRowId);
      if (!batch) throw new BudgetGuardError("INVARIANT_VIOLATION", "Call batch is missing");
      const reasons: string[] = [];
      if (input.costUsd - asNumber(call.reserved_cost_usd, "reserved_cost_usd") > EPSILON) {
        reasons.push("reconciled call cost exceeded its conservative reservation");
      }
      if (this.effectiveBatchCost(batchRowId) - asNumber(batch.max_cost_usd, "max_cost_usd") > EPSILON) {
        reasons.push("reconciled effective batch cost exceeded its preregistered cap");
      }
      if (reasons.length > 0) {
        this.markBatchBreached(batchRowId, reasons.join("; "), input.idempotencyKey, 1);
      }
      return { idempotent: false, call: this.toCallView(this.getCallRow(input.callId)) };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.call,
      summary: result.projectedSummary,
    };
  }

  classifyCandidateCall(
    input: ClassifyCandidateCallInput,
    options: MutationOptions = {},
  ): MutationReceipt<CandidateClassificationValue> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.callId, "callId");
    assertNonNegativeInteger(input.observedParsedOutputCount, "observedParsedOutputCount");
    if (!Array.isArray(input.results) || input.results.length === 0) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "results must classify at least one slot");
    }
    const candidateIds = new Set<string>();
    for (const result of input.results) {
      assertIdentifier(result.candidateSlotId, "candidateSlotId");
      if (candidateIds.has(result.candidateSlotId)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "results contains duplicate candidate slots");
      }
      candidateIds.add(result.candidateSlotId);
      if (result.status === "parsed") {
        assertNonNegativeInteger(result.outputIndex, "outputIndex");
        assertSha256(result.outputHash, "outputHash");
      } else if (
        result.status === "no_candidate" ||
        result.status === "unknown_after_send"
      ) {
        assertMetadataString(result.failureReason, "failureReason");
      } else {
        throw new BudgetGuardError("INVALID_ARGUMENT", "candidate classification status is invalid");
      }
    }
    const parserEvidence = input.controllerParserEvidence;
    let parserEvidenceJson: string | null = null;
    if (parserEvidence) {
      assertSha256(parserEvidence.responseBodyHash, "parserEvidence.responseBodyHash");
      assertSha256(parserEvidence.parserArtifactHash, "parserEvidence.parserArtifactHash");
      assertMetadataString(parserEvidence.dispositionReason, "parserEvidence.dispositionReason");
      assertNonNegativeInteger(parserEvidence.observedOutputCount, "parserEvidence.observedOutputCount");
      if (!Array.isArray(parserEvidence.outputHashes)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "Parser output hashes must be an array");
      }
      const semanticHashes = new Set<string>();
      for (const outputHash of parserEvidence.outputHashes) {
        assertSha256(outputHash, "parserEvidence.outputHash");
        if (semanticHashes.has(outputHash)) {
          throw new BudgetGuardError("DUPLICATE_OUTPUT_HASH", "Semantic parser outputs are duplicated");
        }
        semanticHashes.add(outputHash);
      }
      if (
        parserEvidence.outputHashes.length !== parserEvidence.observedOutputCount ||
        parserEvidence.observedOutputCount !== input.observedParsedOutputCount
      ) {
        throw new BudgetGuardError(
          "PARSER_EVIDENCE_COUNT_MISMATCH",
          "Semantic parser evidence count must equal the observed classification count",
        );
      }
      if (
        (parserEvidence.disposition === "parsed") !==
        (parserEvidence.observedOutputCount > 0)
      ) {
        throw new BudgetGuardError(
          "PARSER_DISPOSITION_MISMATCH",
          "Parsed disposition requires outputs and no-candidate requires zero outputs",
        );
      }
      parserEvidenceJson = stableStringify({
        callId: input.callId,
        responseBodyHash: parserEvidence.responseBodyHash,
        parserArtifactHash: parserEvidence.parserArtifactHash,
        disposition: parserEvidence.disposition,
        dispositionReason: parserEvidence.dispositionReason,
        observedOutputCount: parserEvidence.observedOutputCount,
        outputHashes: parserEvidence.outputHashes,
      });
      if (sha256(parserEvidenceJson) !== parserEvidence.evidenceHash) {
        throw new BudgetGuardError(
          "PARSER_EVIDENCE_HASH_MISMATCH",
          "Parser evidence hash does not match its canonical content",
        );
      }
    }
    const normalizedResults = [...input.results].sort((left, right) =>
      left.candidateSlotId.localeCompare(right.candidateSlotId));
    const normalized = { ...input, results: normalizedResults };
    const apply = options.apply === true;
    const opFingerprint = fingerprint("classify_candidate_call", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "classify_candidate_call",
        opFingerprint,
        input.callId,
      );
      if (claim.idempotent) {
        const candidates = this.candidatesForCall(input.callId);
        return {
          idempotent: true,
          classification: {
            candidates,
            overflowOutputCount: Math.max(0, input.observedParsedOutputCount - candidates.length),
          },
        };
      }
      const call = this.getCallRow(input.callId);
      if (call.call_kind !== "full_question_generation") {
        throw new BudgetGuardError(
          "NOT_CANDIDATE_OUTPUT_CALL",
          "Only candidate-output calls can be classified",
        );
      }
      if (call.state !== "settled") {
        throw new BudgetGuardError("CALL_UNRESOLVED", "Candidate-output call must settle first");
      }
      const controllerContract = this.db.prepare(
        "SELECT * FROM controller_call_contracts WHERE call_id = ?",
      ).get(input.callId);
      if (controllerContract) {
        const terminal = this.db.prepare(
          "SELECT terminal_kind, evidence_json FROM controller_terminal_evidence WHERE call_id = ?",
        ).get(input.callId);
        if (!terminal) {
          throw new BudgetGuardError(
            "MISSING_TERMINAL_EVIDENCE",
            "Controller candidate classification requires durable terminal evidence",
          );
        }
        const terminalJson = JSON.parse(asString(terminal.evidence_json, "terminal evidence_json")) as {
          ok?: unknown;
        };
        const successfulHttp = terminal.terminal_kind === "http-response" && terminalJson.ok === true;
        const cloneEvidence = this.db.prepare(
          "SELECT response_body_hash, evidence_json FROM controller_clone_evidence WHERE call_id = ?",
        ).get(input.callId);
        const cloneJson = cloneEvidence
          ? JSON.parse(asString(cloneEvidence.evidence_json, "clone evidence_json")) as {
              parseState?: unknown;
            }
          : null;
        const uninspectableSuccessfulHttp =
          successfulHttp &&
          !parserEvidence &&
          cloneJson !== null &&
          (cloneJson.parseState === "body-too-large" || cloneJson.parseState === "clone-error") &&
          input.observedParsedOutputCount === 0 &&
          normalizedResults.every((classification) =>
            classification.status === "unknown_after_send");
        if (successfulHttp && !parserEvidence && !uninspectableSuccessfulHttp) {
          throw new BudgetGuardError(
            "MISSING_PARSER_EVIDENCE",
            "Successful controller candidate calls require response-bound parser evidence",
          );
        }
        if (!successfulHttp && parserEvidence) {
          throw new BudgetGuardError(
            "UNEXPECTED_PARSER_EVIDENCE",
            "Non-success terminal calls cannot claim semantic parser outputs",
          );
        }
        if (parserEvidence) {
          if (
            !cloneEvidence ||
            optionalString(cloneEvidence.response_body_hash, "response_body_hash") !==
              parserEvidence.responseBodyHash
          ) {
            throw new BudgetGuardError(
              "PARSER_RESPONSE_BINDING_MISMATCH",
              "Parser evidence is not bound to the captured response body",
            );
          }
          if (
            optionalString(controllerContract.parser_artifact_hash, "parser_artifact_hash") !==
            parserEvidence.parserArtifactHash
          ) {
            throw new BudgetGuardError(
              "PARSER_ARTIFACT_MISMATCH",
              "Parser evidence artifact differs from the durable call contract",
            );
          }
        }
      } else if (parserEvidence) {
        throw new BudgetGuardError(
          "NOT_CONTROLLER_CALL",
          "Controller parser evidence cannot be attached to an unmanaged call",
        );
      }
      const linkedIds = this.candidateIdsForCall(input.callId);
      if (
        linkedIds.length !== normalizedResults.length ||
        linkedIds.some((candidateSlotId, index) => candidateSlotId !== normalizedResults[index]?.candidateSlotId)
      ) {
        throw new BudgetGuardError(
          "CANDIDATE_CLASSIFICATION_INCOMPLETE",
          "Exactly one result is required for every slot reserved by the physical call",
        );
      }
      const parsedResults = normalizedResults.filter(
        (entry): entry is ParsedCandidateClassification => entry.status === "parsed",
      );
      if (parsedResults.length !== Math.min(input.observedParsedOutputCount, linkedIds.length)) {
        throw new BudgetGuardError(
          "PARSED_OUTPUT_COUNT_MISMATCH",
          "Parsed classifications must match the observed count up to the reserved maximum",
        );
      }
      if (parserEvidence) {
        for (const parsed of parsedResults) {
          if (parserEvidence.outputHashes[parsed.outputIndex] !== parsed.outputHash) {
            throw new BudgetGuardError(
              "PARSER_OUTPUT_BINDING_MISMATCH",
              "Candidate slot hash differs from response-bound semantic parser evidence",
            );
          }
        }
      }
      const outputIndexes = new Set<number>();
      const outputHashes = new Set<string>();
      for (const parsed of parsedResults) {
        if (parsed.outputIndex >= input.observedParsedOutputCount) {
          throw new BudgetGuardError(
            "OUTPUT_INDEX_OUT_OF_RANGE",
            "Parsed output index exceeds the observed parsed output count",
          );
        }
        if (outputIndexes.has(parsed.outputIndex)) {
          throw new BudgetGuardError("DUPLICATE_OUTPUT_ID", "Call/output index is duplicated");
        }
        outputIndexes.add(parsed.outputIndex);
        if (outputHashes.has(parsed.outputHash)) {
          throw new BudgetGuardError("DUPLICATE_OUTPUT_HASH", "Output hash is duplicated");
        }
        outputHashes.add(parsed.outputHash);
        if (
          this.db.prepare(
            "SELECT 1 AS ok FROM candidate_slots WHERE producing_call_id = ? AND output_index = ?",
          ).get(input.callId, parsed.outputIndex)
        ) {
          throw new BudgetGuardError("DUPLICATE_OUTPUT_ID", "Call/output index is already linked");
        }
        if (
          this.db.prepare("SELECT 1 AS ok FROM candidate_slots WHERE output_hash = ?").get(parsed.outputHash)
        ) {
          throw new BudgetGuardError("DUPLICATE_OUTPUT_HASH", "Output hash is already linked");
        }
      }
      const classifiedAt = nowUtc();
      normalizedResults.forEach((classification, index) => {
        const candidate = this.getCandidateRow(classification.candidateSlotId);
        if (candidate.state !== "awaiting_result") {
          throw new BudgetGuardError(
            "CANDIDATE_ALREADY_CLASSIFIED",
            `Candidate slot ${classification.candidateSlotId} is already classified`,
          );
        }
        if (classification.status === "parsed") {
          this.db.prepare(
            `UPDATE candidate_slots SET state = 'parsed_pending', producing_call_id = ?,
              output_index = ?, output_hash = ?, parse_operation_key = ?, parse_fingerprint = ?,
              parsed_at = ? WHERE candidate_slot_id = ?`,
          ).run(
            input.callId,
            classification.outputIndex,
            classification.outputHash,
            input.idempotencyKey,
            opFingerprint,
            classifiedAt,
            classification.candidateSlotId,
          );
          this.appendAudit(
            input.idempotencyKey,
            index,
            "candidate_parsed",
            "candidate_slot",
            classification.candidateSlotId,
            {
              producingCallId: input.callId,
              outputIndex: classification.outputIndex,
              outputHash: classification.outputHash,
              gateDecisionPending: true,
            },
          );
        } else {
          this.db.prepare(
            `UPDATE candidate_slots SET state = 'finished', outcome = ?,
              terminal_call_id = ?, failure_reason = ?, finish_operation_key = ?,
              finish_fingerprint = ?, finished_at = ? WHERE candidate_slot_id = ?`,
          ).run(
            classification.status,
            input.callId,
            classification.failureReason,
            input.idempotencyKey,
            opFingerprint,
            classifiedAt,
            classification.candidateSlotId,
          );
          this.appendAudit(
            input.idempotencyKey,
            index,
            "candidate_finished",
            "candidate_slot",
            classification.candidateSlotId,
            {
              terminalCallId: input.callId,
              outcome: classification.status,
              failureReason: classification.failureReason,
              syntheticOutputIdentity: false,
            },
          );
        }
      });
      if (parserEvidence && parserEvidenceJson) {
        this.db.prepare(
          `INSERT INTO controller_parser_evidence(
             call_id, response_body_hash, parser_artifact_hash, disposition,
             disposition_reason, observed_output_count, output_hashes_json,
             evidence_hash, evidence_json, operation_key, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.callId,
          parserEvidence.responseBodyHash,
          parserEvidence.parserArtifactHash,
          parserEvidence.disposition,
          parserEvidence.dispositionReason,
          parserEvidence.observedOutputCount,
          stableStringify(parserEvidence.outputHashes),
          parserEvidence.evidenceHash,
          parserEvidenceJson,
          input.idempotencyKey,
          classifiedAt,
        );
        parserEvidence.outputHashes.forEach((outputHash, outputIndex) => {
          this.db.prepare(
            `INSERT INTO controller_semantic_candidates(
               call_id, output_index, output_hash, parser_evidence_hash, created_at
             ) VALUES (?, ?, ?, ?, ?)`,
          ).run(
            input.callId,
            outputIndex,
            outputHash,
            parserEvidence.evidenceHash,
            classifiedAt,
          );
        });
        this.appendAudit(
          input.idempotencyKey,
          normalizedResults.length,
          "parser_evidence_recorded",
          "provider_call",
          input.callId,
          {
            responseBodyHash: parserEvidence.responseBodyHash,
            parserArtifactHash: parserEvidence.parserArtifactHash,
            disposition: parserEvidence.disposition,
            observedSemanticCandidates: parserEvidence.observedOutputCount,
            outputHashes: parserEvidence.outputHashes,
            evidenceHash: parserEvidence.evidenceHash,
          },
        );
      }
      const overflowOutputCount = Math.max(
        0,
        input.observedParsedOutputCount - linkedIds.length,
      );
      if (overflowOutputCount > 0) {
        this.markBatchBreached(
          asNumber(call.batch_row_id, "call batch_row_id"),
          `physical call emitted ${overflowOutputCount} parsed candidate output(s) beyond its pre-network reservation`,
          input.idempotencyKey,
          normalizedResults.length + (parserEvidence ? 1 : 0),
        );
      }
      return {
        idempotent: false,
        classification: {
          candidates: this.candidatesForCall(input.callId),
          overflowOutputCount,
        },
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.classification,
      summary: result.projectedSummary,
    };
  }

  finalizeParsedCandidates(
    input: FinalizeParsedCandidatesInput,
    options: MutationOptions = {},
  ): MutationReceipt<CandidateSlotView[]> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "decisions must not be empty");
    }
    const seen = new Set<string>();
    for (const decision of input.decisions) {
      assertIdentifier(decision.candidateSlotId, "candidateSlotId");
      assertParsedCandidateOutcome(decision.outcome);
      if (seen.has(decision.candidateSlotId)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "decisions contains duplicate candidates");
      }
      seen.add(decision.candidateSlotId);
    }
    const normalizedDecisions = [...input.decisions].sort((left, right) =>
      left.candidateSlotId.localeCompare(right.candidateSlotId));
    const normalized = { ...input, decisions: normalizedDecisions };
    const apply = options.apply === true;
    const opFingerprint = fingerprint("finalize_parsed_candidates", normalized);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "finalize_parsed_candidates",
        opFingerprint,
        input.idempotencyKey,
      );
      if (claim.idempotent) {
        return {
          idempotent: true,
          candidates: normalizedDecisions.map((decision) =>
            this.toCandidateView(this.getCandidateRow(decision.candidateSlotId))),
        };
      }
      const finishedAt = nowUtc();
      normalizedDecisions.forEach((decision, index) => {
        const candidate = this.getCandidateRow(decision.candidateSlotId);
        if (candidate.state !== "parsed_pending") {
          throw new BudgetGuardError(
            "CANDIDATE_NOT_PENDING",
            `Candidate slot ${decision.candidateSlotId} is not awaiting a gate decision`,
          );
        }
        this.db.prepare(
          `UPDATE candidate_slots SET state = 'finished', outcome = ?,
            finish_operation_key = ?, finish_fingerprint = ?, finished_at = ?
           WHERE candidate_slot_id = ?`,
        ).run(
          decision.outcome,
          input.idempotencyKey,
          opFingerprint,
          finishedAt,
          decision.candidateSlotId,
        );
        this.appendAudit(
          input.idempotencyKey,
          index,
          "candidate_finished",
          "candidate_slot",
          decision.candidateSlotId,
          { outcome: decision.outcome, twoStageFinalization: true },
        );
      });
      return {
        idempotent: false,
        candidates: normalizedDecisions.map((decision) =>
          this.toCandidateView(this.getCandidateRow(decision.candidateSlotId))),
      };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.candidates,
      summary: result.projectedSummary,
    };
  }

  finalizeBatch(
    input: FinalizeBatchInput,
    options: MutationOptions = {},
  ): MutationReceipt<BatchView> {
    validateBatchRef(input);
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    const apply = options.apply === true;
    const opFingerprint = fingerprint("finalize_batch", input);
    const result = this.withMutation(apply, () => {
      const claim = this.claimOperation(
        input.idempotencyKey,
        "finalize_batch",
        opFingerprint,
        `${input.experimentId}/${input.phaseId}/${input.batchId}`,
      );
      if (claim.idempotent) {
        return { idempotent: true, batch: this.toBatchView(this.getBatchRow(input)) };
      }
      const batch = this.getBatchRow(input);
      if (batch.status !== "open") {
        throw new BudgetGuardError("BATCH_FINALIZED", "Batch is already finalized");
      }
      const batchRowId = asNumber(batch.row_id, "batch row_id");
      const sealedCampaign = this.db.prepare(
        "SELECT * FROM sealed_controller_campaigns WHERE batch_row_id = ?",
      ).get(batchRowId);
      if (sealedCampaign && !input.sealedTerminalStatus) {
        throw new BudgetGuardError(
          "SEALED_TERMINAL_STATUS_REQUIRED",
          "A sealed controller campaign must finalize as COMPLETE or ABORTED_INCOMPLETE",
        );
      }
      if (!sealedCampaign && input.sealedTerminalStatus) {
        throw new BudgetGuardError(
          "SEALED_TERMINAL_STATUS_FORBIDDEN",
          "Only a sealed controller campaign may use a sealed terminal status",
        );
      }
      let sealedAssignmentCount = 0;
      let sealedConsumedDispatchCount = 0;
      if (sealedCampaign) {
        const expectedIdsJson = asString(
          sealedCampaign.expected_assignment_ids_json,
          "expected assignment IDs",
        );
        const expectedIds = requireJsonArray(
          JSON.parse(expectedIdsJson),
          "expected assignment IDs",
        ).map((value) => {
          assertIdentifier(value, "expected assignment ID");
          return value;
        });
        if (
          stableStringify(expectedIds) !== expectedIdsJson ||
          sha256(expectedIdsJson) !==
            asString(sealedCampaign.expected_assignment_set_sha256, "assignment set hash") ||
          expectedIds.length !==
            asNumber(sealedCampaign.expected_assignment_count, "expected assignment count")
        ) {
          throw new BudgetGuardError(
            "SEALED_CAMPAIGN_CORRUPT",
            "Durable sealed assignment membership is not self-consistent",
          );
        }
        const assignmentRows = this.db.prepare(
          `SELECT ca.assignment_id, ca.state, COUNT(cc.call_id) AS dispatch_count
           FROM controller_assignments ca
           LEFT JOIN controller_call_contracts cc ON cc.assignment_id = ca.assignment_id
           WHERE ca.batch_row_id = ?
           GROUP BY ca.assignment_id, ca.state ORDER BY ca.assignment_id`,
        ).all(batchRowId);
        sealedAssignmentCount = assignmentRows.length;
        sealedConsumedDispatchCount = assignmentRows.reduce(
          (sum, row) => sum + asNumber(row.dispatch_count, "dispatch count"),
          0,
        );
        if (input.sealedTerminalStatus === "COMPLETE") {
          const actualIds = assignmentRows.map((row) => asString(row.assignment_id, "assignment ID"));
          if (
            stableStringify(actualIds) !== expectedIdsJson ||
            assignmentRows.some(
              (row) => row.state !== "closed" || asNumber(row.dispatch_count, "dispatch count") !== 1,
            )
          ) {
            throw new BudgetGuardError(
              "SEALED_CAMPAIGN_INCOMPLETE",
              "COMPLETE requires every frozen assignment closed with exactly one consumed dispatch",
            );
          }
        }
      }
      const unresolvedCalls = asNumber(
        this.db.prepare(
          "SELECT COUNT(*) AS count FROM provider_calls WHERE batch_row_id = ? AND state IN ('authorized', 'in_flight')",
        ).get(batchRowId)?.count ?? 0,
        "unresolved calls",
      );
      if (unresolvedCalls > 0) {
        throw new BudgetGuardError("UNRESOLVED_CALLS", "Batch has authorized/in-flight provider calls");
      }
      const openCandidates = asNumber(
        this.db.prepare(
          "SELECT COUNT(*) AS count FROM candidate_slots WHERE batch_row_id = ? AND state = 'awaiting_result'",
        ).get(batchRowId)?.count ?? 0,
        "open candidates",
      );
      if (openCandidates > 0) {
        throw new BudgetGuardError(
          "OPEN_CANDIDATES",
          "Batch has candidate-output slots that have not been classified",
        );
      }
      const pendingCandidates = asNumber(
        this.db.prepare(
          "SELECT COUNT(*) AS count FROM candidate_slots WHERE batch_row_id = ? AND state = 'parsed_pending'",
        ).get(batchRowId)?.count ?? 0,
        "parsed pending candidates",
      );
      if (pendingCandidates > 0) {
        throw new BudgetGuardError(
          "PENDING_CANDIDATES",
          "Batch has parsed candidates awaiting accepted/rejected gate decisions",
        );
      }
      const unfinalizedUsage = asNumber(
        this.db.prepare(
          "SELECT COUNT(*) AS count FROM provider_calls WHERE batch_row_id = ? AND usage_final = 0",
        ).get(batchRowId)?.count ?? 0,
        "calls without final usage",
      );
      if (unfinalizedUsage > 0) {
        throw new BudgetGuardError(
          "UNFINALIZED_USAGE",
          "Batch has provider calls awaiting final billing reconciliation",
        );
      }
      const used = this.countBatchCandidates(batchRowId);
      const released = asNumber(batch.allocated_slots, "allocated_slots") - used;
      const finalizedAt = nowUtc();
      this.db.prepare(
        `UPDATE batches SET status = 'finalized', released_slots = ?, finalized_at = ?
         WHERE row_id = ?`,
      ).run(released, finalizedAt, batchRowId);
      if (sealedCampaign) {
        this.db.prepare(
          `INSERT INTO sealed_controller_campaign_terminals(
             batch_row_id, terminal_status, assignment_count,
             consumed_dispatch_count, operation_key, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          batchRowId,
          input.sealedTerminalStatus!,
          sealedAssignmentCount,
          sealedConsumedDispatchCount,
          input.idempotencyKey,
          finalizedAt,
        );
      }
      this.appendAudit(input.idempotencyKey, 0, "batch_finalized", "batch", input.batchId, {
        experimentId: input.experimentId,
        phaseId: input.phaseId,
        usedCandidateSlots: used,
        releasedCandidateSlots: released,
        breached: booleanFromSql(batch.breached),
      });
      return { idempotent: false, batch: this.toBatchView(this.getBatchRow(input)) };
    });
    return {
      applied: apply && !result.idempotent,
      dryRun: !apply,
      idempotent: result.idempotent,
      value: result.batch,
      summary: result.projectedSummary,
    };
  }

  createSession(ref: BatchRef): BudgetSession {
    validateBatchRef(ref);
    this.getBatchRow(ref);
    return new BudgetSession(this, ref);
  }

  async exportArtifacts(outputDirectory: string): Promise<ExportArtifactsResult> {
    this.assertOpen();
    const outputDir = resolve(outputDirectory);
    await mkdir(outputDir, { recursive: true });
    const stamp = nowUtc().replace(/[:.]/g, "-");
    const base = `${CAMPAIGN_ID}-${stamp}-${randomUUID().slice(0, 8)}`;
    const snapshotPath = join(outputDir, `${base}.snapshot.json`);
    const backupPath = join(outputDir, `${base}.backup.sqlite`);
    const manifestPath = join(outputDir, `${base}.manifest.json`);
    let snapshotSummary: CampaignSummary;
    try {
      await backup(this.db, backupPath);
      const exportedRegistry = loadRegistry(this.registryPath);
      const snapshotDb = new DatabaseSync(backupPath);
      try {
        snapshotDb.exec("PRAGMA query_only = ON;");
        snapshotSummary = summarizeDatabase(snapshotDb);
        const snapshot = {
          exportedAt: nowUtc(),
          summary: snapshotSummary,
          registryPath: this.registryPath,
          registryHash: exportedRegistry.hash,
          batches: snapshotDb.prepare("SELECT * FROM batches ORDER BY row_id").all(),
          candidateSlots: snapshotDb.prepare(
            "SELECT * FROM candidate_slots ORDER BY created_at, candidate_slot_id",
          ).all(),
          providerCalls: snapshotDb.prepare(
            "SELECT * FROM provider_calls ORDER BY created_at, call_id",
          ).all(),
          callCandidateSlots: snapshotDb.prepare(
            "SELECT * FROM call_candidate_slots ORDER BY call_id, candidate_slot_id",
          ).all(),
          reconciliations: snapshotDb.prepare(
            "SELECT * FROM usage_reconciliations ORDER BY row_id",
          ).all(),
          controllerRegistries: snapshotDb.prepare(
            "SELECT * FROM controller_registries ORDER BY created_at, registry_hash",
          ).all(),
          controllerRegistryEntries: snapshotDb.prepare(
            "SELECT * FROM controller_registry_entries ORDER BY registry_hash, entry_id",
          ).all(),
          controllerAssignments: snapshotDb.prepare(
            "SELECT * FROM controller_assignments ORDER BY created_at, assignment_id",
          ).all(),
          controllerCallContracts: snapshotDb.prepare(
            "SELECT * FROM controller_call_contracts ORDER BY created_at, call_id",
          ).all(),
          controllerTerminalEvidence: snapshotDb.prepare(
            "SELECT * FROM controller_terminal_evidence ORDER BY created_at, call_id",
          ).all(),
          controllerResponseBodyMetadata: snapshotDb.prepare(
            `SELECT call_id, response_body_hash, byte_length, created_at
             FROM controller_response_bodies ORDER BY created_at, call_id`,
          ).all(),
          controllerCloneEvidence: snapshotDb.prepare(
            "SELECT * FROM controller_clone_evidence ORDER BY created_at, call_id",
          ).all(),
          controllerParserEvidence: snapshotDb.prepare(
            "SELECT * FROM controller_parser_evidence ORDER BY created_at, call_id",
          ).all(),
          controllerSemanticCandidates: snapshotDb.prepare(
            "SELECT * FROM controller_semantic_candidates ORDER BY call_id, output_index",
          ).all(),
          auditEvents: snapshotDb.prepare("SELECT * FROM audit_events ORDER BY sequence").all(),
        };
        await atomicWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      } finally {
        snapshotDb.close();
      }
    } catch (error) {
      await Promise.all([
        rm(snapshotPath, { force: true }).catch(() => undefined),
        rm(backupPath, { force: true }).catch(() => undefined),
        rm(`${backupPath}-wal`, { force: true }).catch(() => undefined),
        rm(`${backupPath}-shm`, { force: true }).catch(() => undefined),
      ]);
      throw new BudgetGuardError(
        "EXPORT_FAILED",
        `Consistent snapshot/backup export failed (${error instanceof Error ? error.message : "unknown"})`,
      );
    }
    const [snapshotBytes, backupBytes] = await Promise.all([readFile(snapshotPath), readFile(backupPath)]);
    const snapshotSha256 = sha256(snapshotBytes);
    const backupSha256 = sha256(backupBytes);
    await atomicWrite(
      manifestPath,
      `${JSON.stringify(
        {
          campaignId: CAMPAIGN_ID,
          schemaVersion: STORE_SCHEMA_VERSION,
          exportedAt: nowUtc(),
          auditHeadHash: snapshotSummary.auditHeadHash,
          snapshot: { path: snapshotPath, sha256: snapshotSha256 },
          backup: { path: backupPath, sha256: backupSha256 },
        },
        null,
        2,
      )}\n`,
    );
    return { snapshotPath, backupPath, manifestPath, snapshotSha256, backupSha256 };
  }
}

export class BudgetSession {
  private readonly store: BudgetStore;
  private readonly ref: BatchRef;

  constructor(store: BudgetStore, ref: BatchRef) {
    this.store = store;
    this.ref = { ...ref };
  }

  async runProviderCall<T>(input: RunProviderCallInput<T>): Promise<T> {
    const begin = this.store.beginCall(
      {
        ...this.ref,
        idempotencyKey: input.idempotencyKey,
        callId: input.callId,
        callKind: input.callKind,
        stage: input.stage,
        model: input.model,
        reservedCostUsd: input.reservedCostUsd,
        logicalOperationId: input.logicalOperationId,
        physicalAttemptOrdinal: input.physicalAttemptOrdinal,
        parentCandidateSlotId: input.parentCandidateSlotId,
        expectedCandidateOutputs: 0,
      },
      { apply: true },
    );
    if (!begin.value.shouldExecute) {
      throw new CallReplayPreventedError(begin.value);
    }
    const startedAt = Date.now();
    let value: T;
    try {
      value = await input.invoke();
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - startedAt);
      let observed: NormalizedProviderUsageObservation;
      try {
        observed = normalizeProviderUsageObservation(
          input.observeFailure?.(error, latencyMs) ?? {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          },
          latencyMs,
          false,
        );
      } catch {
        observed = {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs,
          usageFinal: false,
        };
      }
      this.store.settleCall(
        {
          idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
          callId: input.callId,
          outcome: "failed",
          inputTokens: observed.inputTokens,
          outputTokens: observed.outputTokens,
          costUsd: observed.costUsd,
          latencyMs: observed.latencyMs,
          usageFinal: observed.usageFinal,
          providerRequestId: observed.providerRequestId,
        },
        { apply: true },
      );
      throw error;
    }

    const latencyMs = Math.max(0, Date.now() - startedAt);
    let observed: NormalizedProviderUsageObservation;
    try {
      observed = normalizeProviderUsageObservation(
        input.observeSuccess(value, latencyMs),
        latencyMs,
        true,
      );
    } catch (error) {
      this.store.settleCall(
        {
          idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
          callId: input.callId,
          outcome: "unknown",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs,
          usageFinal: false,
        },
        { apply: true },
      );
      throw error;
    }
    this.store.settleCall(
      {
        idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
        callId: input.callId,
        outcome: "success",
        inputTokens: observed.inputTokens,
        outputTokens: observed.outputTokens,
        costUsd: observed.costUsd,
        latencyMs: observed.latencyMs,
        usageFinal: observed.usageFinal,
        providerRequestId: observed.providerRequestId,
      },
      { apply: true },
    );
    return value;
  }

  async runCandidateOutputCall<T>(
    input: RunCandidateOutputCallInput<T>,
  ): Promise<RunCandidateOutputCallResult<T>> {
    const begin = this.store.beginCall(
      {
        ...this.ref,
        idempotencyKey: input.idempotencyKey,
        callId: input.callId,
        callKind: "full_question_generation",
        stage: input.stage,
        model: input.model,
        reservedCostUsd: input.reservedCostUsd,
        logicalOperationId: input.logicalOperationId,
        physicalAttemptOrdinal: input.physicalAttemptOrdinal,
        parentCandidateSlotId: input.parentCandidateSlotId,
        expectedCandidateOutputs: input.expectedCandidateOutputs,
        candidateSlotIds: input.candidateSlotIds,
      },
      { apply: true },
    );
    if (!begin.value.shouldExecute) {
      throw new CallReplayPreventedError(begin.value);
    }
    const candidateSlotIds = begin.value.candidateSlotIds;
    const markAllNoCandidate = (failureReason: string): void => {
      this.store.classifyCandidateCall(
        {
          idempotencyKey: derivedOperationKey(input.idempotencyKey, `classify:${failureReason}`),
          callId: input.callId,
          observedParsedOutputCount: 0,
          results: candidateSlotIds.map((candidateSlotId) => ({
            candidateSlotId,
            status: "no_candidate" as const,
            failureReason,
          })),
        },
        { apply: true },
      );
    };

    const startedAt = Date.now();
    let value: T;
    try {
      value = await input.invoke();
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - startedAt);
      let observed: NormalizedProviderUsageObservation;
      try {
        observed = normalizeProviderUsageObservation(
          input.observeFailure?.(error, latencyMs) ?? {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          },
          latencyMs,
          false,
        );
      } catch {
        observed = {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs,
          usageFinal: false,
        };
      }
      this.store.settleCall(
        {
          idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
          callId: input.callId,
          outcome: "failed",
          inputTokens: observed.inputTokens,
          outputTokens: observed.outputTokens,
          costUsd: observed.costUsd,
          latencyMs: observed.latencyMs,
          usageFinal: observed.usageFinal,
          providerRequestId: observed.providerRequestId,
        },
        { apply: true },
      );
      markAllNoCandidate("provider_call_failed");
      throw error;
    }

    const latencyMs = Math.max(0, Date.now() - startedAt);
    let observed: NormalizedProviderUsageObservation;
    try {
      observed = normalizeProviderUsageObservation(
        input.observeSuccess(value, latencyMs),
        latencyMs,
        true,
      );
    } catch (error) {
      this.store.settleCall(
        {
          idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
          callId: input.callId,
          outcome: "unknown",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs,
          usageFinal: false,
        },
        { apply: true },
      );
      markAllNoCandidate("usage_observation_failed");
      throw error;
    }
    const settled = this.store.settleCall(
      {
        idempotencyKey: derivedOperationKey(input.idempotencyKey, "settle"),
        callId: input.callId,
        outcome: "success",
        inputTokens: observed.inputTokens,
        outputTokens: observed.outputTokens,
        costUsd: observed.costUsd,
        latencyMs: observed.latencyMs,
        usageFinal: observed.usageFinal,
        providerRequestId: observed.providerRequestId,
      },
      { apply: true },
    );
    return { value, call: settled.value, candidateSlotIds };
  }

  classifyCandidateCall(
    input: ClassifyCandidateCallInput,
    options: MutationOptions = { apply: true },
  ): MutationReceipt<CandidateClassificationValue> {
    return this.store.classifyCandidateCall(input, options);
  }

  finalizeParsedCandidates(
    input: FinalizeParsedCandidatesInput,
    options: MutationOptions = { apply: true },
  ): MutationReceipt<CandidateSlotView[]> {
    return this.store.finalizeParsedCandidates(input, options);
  }
}

export function openCanonicalBudgetStore(): BudgetStore {
  return BudgetStore.openCanonical();
}

export function initializeCanonicalBudgetStore(): BudgetStore {
  return BudgetStore.openCanonical(true);
}

export function inspectCanonicalExperimentRegistry(): RegistryStatus {
  return inspectRegistryStatus(DEFAULT_REGISTRY_PATH);
}

export function openTestBudgetStore(storePath: string, registryPath: string): BudgetStore {
  return BudgetStore.openForTesting(storePath, registryPath);
}

export function inspectTestExperimentRegistry(registryPath: string): RegistryStatus {
  ensureTestPath(registryPath);
  return inspectRegistryStatus(registryPath);
}
