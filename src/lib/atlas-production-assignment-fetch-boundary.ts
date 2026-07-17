import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import {
  getAtlasFetchScopeKind,
  runOutsideAtlasFetchScopeKind,
  runWithAtlasFetchScopeKind,
} from "@/lib/atlas-fetch-scope-coordinator";
import {
  atlasResearchFetch,
  getCurrentAtlasResearchLineage,
} from "@/lib/atlas-research-fetch-boundary";

export const QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED =
  "QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED" as const;

const MAX_OBSERVED_RESPONSE_BYTES = 16 * 1024 * 1024;
const OBSERVATION_TIMEOUT_MS = 5_000;

type AtlasFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type QuestionGenerationAssignmentBudgetMode =
  | "AUDIT"
  | "SHADOW"
  | "CANARY_ENFORCE"
  | "ENFORCE";

export interface AtlasProductionAssignmentScope {
  jobId: string;
  policyVersion: string;
  policyHash: string;
  mode: QuestionGenerationAssignmentBudgetMode;
}

export interface AtlasProductionWireRequestFacts {
  method: "POST";
  endpointOrigin: string;
  endpointPath: string;
  endpointHash: string;
  wireBodyHash: string;
  requestBodyUtf8Bytes: number;
  model: string;
  completionCount: number;
  outputTokenCap: number | null;
  stream: false;
  textOnly: boolean;
  knownCostShape: boolean;
  providerRoutingHash: string;
  providerRoutingPinned: boolean;
  reasoningOff: boolean;
}

export interface AtlasProductionLeaseRequest {
  scope: Readonly<AtlasProductionAssignmentScope>;
  request: Readonly<AtlasProductionWireRequestFacts>;
}

export interface AtlasProductionCallLease {
  leaseId: string;
  /** Last millisecond at which the priced request may be handed to fetch. */
  dispatchNotAfterEpochMs?: number;
}

export interface AtlasProductionResponseEvidence {
  status: number;
  ok: boolean;
  observedCostMicros: bigint | null;
  generationIdHash: string | null;
  servedModel: string | null;
  terminalKind: "http-response";
}

export interface AtlasProductionErrorEvidence {
  errorName: string;
  errorCode: string | null;
  terminalKind: "network-error" | "abort";
}

export interface AtlasProductionAssignmentFetchController {
  readonly controllerId: string;
  preFetchLease(
    request: Readonly<AtlasProductionLeaseRequest>,
  ): AtlasProductionCallLease | Promise<AtlasProductionCallLease>;
  observeResponse(
    lease: Readonly<AtlasProductionCallLease>,
    evidence: Readonly<AtlasProductionResponseEvidence>,
  ): void | Promise<void>;
  observeError(
    lease: Readonly<AtlasProductionCallLease>,
    evidence: Readonly<AtlasProductionErrorEvidence>,
  ): void | Promise<void>;
}

export class QuestionGenerationAssignmentBudgetError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "QuestionGenerationAssignmentBudgetError";
    this.code = code;
  }
}

interface InternalScope {
  scope: Readonly<AtlasProductionAssignmentScope>;
  controller: AtlasProductionAssignmentFetchController;
  open: boolean;
  observations: Set<Promise<void>>;
}

const scopeStorage = new AsyncLocalStorage<InternalScope>();

function boundaryError(code: string, message: string): never {
  throw new QuestionGenerationAssignmentBudgetError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string, maxLength = 300): string {
  if (typeof value !== "string" || !value.trim()) {
    boundaryError("INVALID_PRODUCTION_BUDGET_SCOPE", `${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_SCOPE",
      `${field} exceeds ${maxLength} characters`,
    );
  }
  return normalized;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function normalizeScope(
  input: AtlasProductionAssignmentScope,
): Readonly<AtlasProductionAssignmentScope> {
  if (!isRecord(input)) {
    boundaryError("INVALID_PRODUCTION_BUDGET_SCOPE", "scope must be an object");
  }
  const mode = input.mode;
  if (
    mode !== "AUDIT" &&
    mode !== "SHADOW" &&
    mode !== "CANARY_ENFORCE" &&
    mode !== "ENFORCE"
  ) {
    boundaryError("INVALID_PRODUCTION_BUDGET_SCOPE", "unsupported budget mode");
  }
  const policyHash = nonEmpty(input.policyHash, "policyHash", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(policyHash)) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_SCOPE",
      "policyHash must be a SHA-256 digest",
    );
  }
  return Object.freeze({
    jobId: nonEmpty(input.jobId, "jobId", 200),
    policyVersion: nonEmpty(input.policyVersion, "policyVersion", 200),
    policyHash,
    mode,
  });
}

function validateController(
  controller: AtlasProductionAssignmentFetchController,
): void {
  nonEmpty(controller?.controllerId, "controllerId", 200);
  for (const method of [
    "preFetchLease",
    "observeResponse",
    "observeError",
  ] as const) {
    if (typeof controller?.[method] !== "function") {
      boundaryError(
        "INVALID_PRODUCTION_BUDGET_CONTROLLER",
        `controller.${method} is required`,
      );
    }
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  boundaryError("UNSUPPORTED_PRODUCTION_BUDGET_REQUEST", "unsupported request URL");
}

function snapshotArguments(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): { input: RequestInfo | URL; init: RequestInit | undefined } {
  let snapshotInput: RequestInfo | URL;
  if (typeof input === "string") {
    snapshotInput = input;
  } else if (input instanceof URL) {
    snapshotInput = new URL(input.toString());
  } else if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      snapshotInput = input.clone();
    } catch {
      boundaryError(
        "UNSUPPORTED_PRODUCTION_BUDGET_REQUEST",
        "Request input must be cloneable",
      );
    }
  } else {
    boundaryError(
      "UNSUPPORTED_PRODUCTION_BUDGET_REQUEST",
      "unsupported request input",
    );
  }

  if (!init) return { input: snapshotInput, init: undefined };
  let headers: HeadersInit | undefined;
  try {
    headers = init.headers === undefined ? undefined : new Headers(init.headers);
  } catch {
    boundaryError(
      "UNSUPPORTED_PRODUCTION_BUDGET_REQUEST",
      "request headers must be cloneable",
    );
  }
  return {
    input: snapshotInput,
    init: { ...init, ...(headers === undefined ? {} : { headers }) },
  };
}

function positiveIntegerOrNull(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      `${field} must be a positive integer`,
    );
  }
  return Number(value);
}

const NON_TEXT_OR_EXTERNAL_BILLING_KEYS = new Set([
  "attachments",
  "audio",
  "file",
  "file_data",
  "files",
  "image",
  "image_url",
  "images",
  "input_audio",
  "input_file",
  "input_image",
  "plugins",
  "video",
  "web_search",
  "web_search_options",
]);

// Exact top-level request envelope currently emitted by the production
// OpenAI-compatible SDK plus the equivalent bounded token-cap/count aliases.
// Provider options are spread at top level by the SDK, so an unknown field is
// unpriced until it is deliberately reviewed and added here.
const PRICED_TEXT_WIRE_TOP_LEVEL_KEYS = new Set([
  "frequency_penalty",
  "max_completion_tokens",
  "max_output_tokens",
  "max_tokens",
  "messages",
  "model",
  "n",
  "presence_penalty",
  "provider",
  "reasoning",
  "reasoning_effort",
  "response_format",
  "seed",
  "stop",
  "stream",
  "temperature",
  "tool_choice",
  "tools",
  "top_p",
  "user",
  "verbosity",
]);

function hasNonTextInput(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNonTextInput);
  if (!isRecord(value)) return false;
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  if (
    type.includes("image") ||
    type.includes("audio") ||
    type.includes("video") ||
    type.includes("file") ||
    type.includes("web_search") ||
    type.includes("computer_use")
  ) {
    return true;
  }
  for (const [rawKey, nested] of Object.entries(value)) {
    const key = rawKey.toLowerCase();
    if (
      NON_TEXT_OR_EXTERNAL_BILLING_KEYS.has(key) &&
      nested !== undefined &&
      nested !== null
    ) {
      return true;
    }
    if (key === "modalities") {
      if (
        !Array.isArray(nested) ||
        nested.length !== 1 ||
        String(nested[0]).toLowerCase() !== "text"
      ) {
        return true;
      }
      continue;
    }
    if (hasNonTextInput(nested)) return true;
  }
  return false;
}

function parseRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Readonly<AtlasProductionWireRequestFacts> {
  const method = (
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "POST") {
    boundaryError(
      "UNSUPPORTED_PRODUCTION_BUDGET_REQUEST",
      "protected Atlas requests must use POST",
    );
  }
  if (typeof init?.body !== "string") {
    boundaryError(
      "UNSUPPORTED_PRODUCTION_BUDGET_REQUEST_BODY",
      "protected Atlas requests require an inline JSON body",
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(init.body);
  } catch {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "request body is not valid JSON",
    );
  }
  if (!isRecord(body)) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "request body must be an object",
    );
  }
  if (body.stream === true) {
    boundaryError(
      "PRODUCTION_BUDGET_STREAMING_UNSUPPORTED",
      "streaming cannot be cost-settled by this boundary",
    );
  }
  if (body.stream !== undefined && body.stream !== false) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "stream must be false or omitted",
    );
  }
  const model = nonEmpty(body.model, "wire.model", 300);
  const providerRouting = isRecord(body.provider) ? body.provider : null;
  const providerOrder =
    providerRouting && Array.isArray(providerRouting.order)
      ? providerRouting.order
      : [];
  const providerRoutingPinned =
    providerRouting !== null &&
    providerRouting.allow_fallbacks === false &&
    providerOrder.length > 0 &&
    providerOrder.every(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  const reasoning = isRecord(body.reasoning) ? body.reasoning : null;
  const reasoningEffort =
    typeof body.reasoning_effort === "string"
      ? body.reasoning_effort.toLowerCase()
      : null;
  const reasoningOff =
    reasoning !== null &&
    reasoning.enabled === false &&
    reasoning.effort === "none" &&
    reasoning.exclude === true &&
    (reasoningEffort === null || reasoningEffort === "none");
  const completionCount = positiveIntegerOrNull(body.n, "wire.n") ?? 1;
  const tokenCaps = [
    positiveIntegerOrNull(body.max_tokens, "wire.max_tokens"),
    positiveIntegerOrNull(
      body.max_completion_tokens,
      "wire.max_completion_tokens",
    ),
    positiveIntegerOrNull(body.max_output_tokens, "wire.max_output_tokens"),
  ].filter((value): value is number => value !== null);
  if (new Set(tokenCaps).size > 1) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "wire max-token fields disagree",
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(requestUrl(input));
  } catch {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "request endpoint must be absolute",
    );
  }
  if (endpoint.username || endpoint.password || endpoint.hash) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_WIRE",
      "request endpoint contains credentials or a fragment",
    );
  }
  const endpointValue = endpoint.toString();
  return Object.freeze({
    method: "POST" as const,
    endpointOrigin: endpoint.origin,
    endpointPath: `${endpoint.pathname}${endpoint.search}`,
    endpointHash: sha256(endpointValue),
    wireBodyHash: sha256(init.body),
    requestBodyUtf8Bytes: Buffer.byteLength(init.body, "utf8"),
    model,
    completionCount,
    outputTokenCap: tokenCaps[0] ?? null,
    stream: false as const,
    // Inspect the complete wire object, not only message-like fields. OpenRouter
    // can bill top-level audio/image/plugin surfaces outside token pricing.
    textOnly: !hasNonTextInput(body),
    knownCostShape: Object.keys(body).every((key) =>
      PRICED_TEXT_WIRE_TOP_LEVEL_KEYS.has(key),
    ),
    providerRoutingHash: sha256(
      JSON.stringify(stableJsonValue(body.provider ?? null)),
    ),
    providerRoutingPinned,
    reasoningOff,
  });
}

function validateLease(
  lease: AtlasProductionCallLease,
): Readonly<AtlasProductionCallLease> {
  if (!isRecord(lease)) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_LEASE",
      "controller returned an invalid lease",
    );
  }
  const leaseId = nonEmpty(lease.leaseId, "leaseId", 300);
  const dispatchNotAfterEpochMs = lease.dispatchNotAfterEpochMs;
  if (
    dispatchNotAfterEpochMs !== undefined &&
    (!Number.isSafeInteger(dispatchNotAfterEpochMs) ||
      dispatchNotAfterEpochMs <= 0)
  ) {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_LEASE",
      "dispatchNotAfterEpochMs must be a positive safe integer",
    );
  }
  return Object.freeze({
    leaseId,
    ...(dispatchNotAfterEpochMs === undefined
      ? {}
      : { dispatchNotAfterEpochMs }),
  });
}

function errorEvidence(error: unknown): AtlasProductionErrorEvidence {
  const record = isRecord(error) ? error : {};
  const rawName = error instanceof Error && error.name ? error.name : "";
  const errorName = new Set([
    "AbortError",
    "Error",
    "NetworkError",
    "TimeoutError",
    "TypeError",
  ]).has(rawName)
    ? rawName
    : "UnknownFetchError";
  const rawCode = record.code;
  const candidateCode =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode)
      : "";
  const errorCode = new Set([
    "ABORT_ERR",
    "EAI_AGAIN",
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENETUNREACH",
    "ENOTFOUND",
    "EPIPE",
    "ERR_NETWORK",
    "ETIMEDOUT",
    "UND_ERR_ABORTED",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
  ]).has(candidateCode)
    ? candidateCode
    : null;
  const aborted =
    errorName === "AbortError" ||
    errorCode === "ABORT_ERR" ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError");
  return {
    errorName,
    errorCode,
    terminalKind: aborted ? "abort" : "network-error",
  };
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

async function readResponseEvidence(
  response: Response,
): Promise<AtlasProductionResponseEvidence> {
  let parsed: unknown = null;
  try {
    const clone = response.clone();
    const contentLength = Number(clone.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_OBSERVED_RESPONSE_BYTES
    ) {
      throw new Error("response body exceeds observation limit");
    }
    const bytes = await readBoundedResponseBytes(clone);
    if (bytes.byteLength > MAX_OBSERVED_RESPONSE_BYTES) {
      throw new Error("response body exceeds observation limit");
    }
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    parsed = null;
  }
  const body = isRecord(parsed) ? parsed : {};
  const usage = isRecord(body.usage) ? body.usage : {};
  const rawCost = finiteNonNegative(usage.cost);
  const details = isRecord(usage.cost_details) ? usage.cost_details : {};
  const upstreamCost = finiteNonNegative(details.upstream_inference_cost);
  const totalCost =
    rawCost === null
      ? null
      : rawCost + (usage.is_byok === true && upstreamCost !== null ? upstreamCost : 0);
  const scaledCost = totalCost === null ? null : Math.ceil(totalCost * 1_000_000);
  return {
    status: response.status,
    ok: response.ok,
    observedCostMicros:
      scaledCost !== null && Number.isSafeInteger(scaledCost)
        ? BigInt(scaledCost)
        : null,
    generationIdHash:
      typeof body.id === "string" && body.id
        ? sha256(body.id)
        : null,
    servedModel:
      typeof body.model === "string" && body.model
        ? body.model.slice(0, 300)
        : null,
    terminalKind: "http-response",
  };
}

async function readBoundedResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const read = (async () => {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_OBSERVED_RESPONSE_BYTES) {
          await reader.cancel("assignment-budget-response-limit").catch(() => undefined);
          throw new Error("response body exceeds observation limit");
        }
        chunks.push(new Uint8Array(next.value));
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  })();
  const timed = new Promise<Uint8Array>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel("assignment-budget-observation-timeout").catch(
        () => undefined,
      );
      reject(new Error("response observation timed out"));
    }, OBSERVATION_TIMEOUT_MS);
    if (typeof timeout === "object" && "unref" in timeout) timeout.unref();
  });
  try {
    return await Promise.race([read, timed]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function boundObservation(operation: Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled = operation.catch(() => undefined);
  const timed = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, OBSERVATION_TIMEOUT_MS);
    if (typeof timeout === "object" && "unref" in timeout) timeout.unref();
  });
  return Promise.race([settled, timed]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
}

function trackObservation(internal: InternalScope, operation: Promise<void>): void {
  const bounded = boundObservation(operation);
  internal.observations.add(bounded);
  void bounded.finally(() => internal.observations.delete(bounded));
}

function startDetachedObservation(
  internal: InternalScope,
  observe: () => void | Promise<void>,
): void {
  const operation = runOutsideAtlasFetchScopeKind(() =>
    scopeStorage.exit(() => Promise.resolve().then(observe)),
  );
  trackObservation(internal, Promise.resolve(operation));
}

async function dispatchProtectedFetch(
  delegate: AtlasFetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  internal: InternalScope,
): Promise<Response> {
  if (getCurrentAtlasResearchLineage()) {
    boundaryError(
      "RESEARCH_PRODUCTION_BUDGET_SCOPE_CONFLICT",
      "research and production assignment scopes are mutually exclusive",
    );
  }
  const snapshot = snapshotArguments(input, init);
  const request = parseRequest(snapshot.input, snapshot.init);
  let lease: Readonly<AtlasProductionCallLease>;
  try {
    lease = validateLease(
      await internal.controller.preFetchLease({
        scope: internal.scope,
        request,
      }),
    );
  } catch (error) {
    if (error instanceof QuestionGenerationAssignmentBudgetError) throw error;
    boundaryError(
      "PRODUCTION_BUDGET_LEASE_FAILED",
      "durable pre-fetch lease failed",
    );
  }

  if (
    lease.dispatchNotAfterEpochMs !== undefined &&
    Date.now() > lease.dispatchNotAfterEpochMs
  ) {
    boundaryError(
      "QUESTION_GENERATION_ASSIGNMENT_BUDGET_PRICE_SNAPSHOT_STALE",
      "the price proof expired while waiting for its durable lease",
    );
  }

  let response: Response;
  try {
    response = await delegate(snapshot.input, snapshot.init);
  } catch (error) {
    startDetachedObservation(internal, () =>
      internal.controller.observeError(lease, errorEvidence(error)),
    );
    throw error;
  }

  startDetachedObservation(internal, () =>
    readResponseEvidence(response).then((evidence) =>
      internal.controller.observeResponse(lease, evidence),
    ),
  );
  return response;
}

/**
 * Wraps the shared Atlas fetch. With no production assignment scope this is an
 * exact delegate call: the original arguments and promise are returned.
 */
export function createAtlasProductionAssignmentFetchDispatcher(
  delegate: AtlasFetch,
): AtlasFetch {
  if (typeof delegate !== "function") {
    boundaryError(
      "INVALID_PRODUCTION_BUDGET_CONTROLLER",
      "fetch delegate must be a function",
    );
  }
  return (input, init) => {
    const internal = scopeStorage.getStore();
    if (!internal) return delegate(input, init);
    if (!internal.open) {
      return Promise.reject(
        new QuestionGenerationAssignmentBudgetError(
          "PRODUCTION_BUDGET_SCOPE_CLOSED",
          "assignment scope no longer accepts provider calls",
        ),
      );
    }
    return dispatchProtectedFetch(delegate, input, init, internal);
  };
}

export async function runWithAtlasProductionAssignmentScope<T>(
  scope: AtlasProductionAssignmentScope,
  controller: AtlasProductionAssignmentFetchController,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (getAtlasFetchScopeKind() !== null) {
    boundaryError(
      "RESEARCH_PRODUCTION_BUDGET_SCOPE_CONFLICT",
      "research and production assignment scopes are mutually exclusive",
    );
  }
  if (scopeStorage.getStore()) {
    boundaryError(
      "NESTED_PRODUCTION_BUDGET_SCOPE",
      "a production assignment scope is already active",
    );
  }
  if (getCurrentAtlasResearchLineage()) {
    boundaryError(
      "RESEARCH_PRODUCTION_BUDGET_SCOPE_CONFLICT",
      "research and production assignment scopes are mutually exclusive",
    );
  }
  validateController(controller);
  const internal: InternalScope = {
    scope: normalizeScope(scope),
    controller,
    open: true,
    observations: new Set(),
  };
  let result!: T;
  let failed = false;
  let thrown: unknown;
  try {
    result = await runWithAtlasFetchScopeKind("production-assignment", () =>
      scopeStorage.run(internal, fn),
    );
  } catch (error) {
    failed = true;
    thrown = error;
  } finally {
    internal.open = false;
    // Observation is deliberately detached and best effort. A hanging clone or
    // telemetry database must not delay a response already received by the SDK
    // and cause the whole Workbench job to time out/replay. The committed full
    // reservation remains authoritative when settlement never finishes.
  }
  if (failed) throw thrown;
  return result;
}

export function hasAtlasProductionAssignmentScope(): boolean {
  return scopeStorage.getStore() !== undefined;
}

/** Production assignment admission composes outside the existing research seam. */
export const atlasProductionAssignmentFetch =
  createAtlasProductionAssignmentFetchDispatcher(atlasResearchFetch);

export function isQuestionGenerationAssignmentBudgetError(
  error: unknown,
): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof QuestionGenerationAssignmentBudgetError) return true;
    if (isRecord(current)) {
      if (
        typeof current.code === "string" &&
        (current.code.startsWith("QUESTION_GENERATION_ASSIGNMENT_BUDGET") ||
          current.code.startsWith("ASSIGNMENT_BUDGET_") ||
          current.code === "INVALID_ASSIGNMENT_BUDGET_POLICY" ||
          current.code === "INVALID_ASSIGNMENT_BUDGET_DESCRIPTOR")
      ) {
        return true;
      }
      const message =
        typeof current.message === "string" ? current.message : "";
      if (
        message.includes(QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED) ||
        message.includes("ASSIGNMENT_BUDGET_") ||
        message.includes("PRODUCTION_BUDGET_") ||
        message.includes("RESEARCH_PRODUCTION_BUDGET_SCOPE_CONFLICT")
      ) {
        return true;
      }
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}
