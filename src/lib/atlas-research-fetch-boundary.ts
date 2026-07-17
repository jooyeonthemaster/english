import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import {
  getAtlasFetchScopeKind,
  runWithAtlasFetchScopeKind,
} from "@/lib/atlas-fetch-scope-coordinator";

/**
 * Trusted, opt-in research instrumentation for Atlas/OpenRouter HTTP calls.
 *
 * The production provider always uses `atlasResearchFetch`. With no active
 * research scope the dispatcher returns the captured native-fetch promise
 * directly and performs no parsing, cloning, controller lookup, or mutation.
 * Research callers must install one controller and enter a validated ALS scope.
 */

export type AtlasResearchPurpose = "candidate" | "design" | "evaluation";
export type AtlasResearchCostState = "reported" | "unknown";
export type AtlasResearchResponseParseState =
  | "json"
  | "non-json"
  | "clone-error"
  | "body-too-large";
export const MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES = 16 * 1024 * 1024;

export interface AtlasResearchCorpusProvenance {
  corpusId: string;
  rowId: string;
  passageHash: string;
}

export interface AtlasResearchProvenance {
  requestedModel: string;
  effectiveModel: string;
  plan: string;
  stage: string;
  promptHash: string;
  /** Frozen private preflight envelope containing profile/request inputs. */
  requestEnvelopeHash?: string;
  /** Immutable prompt-profile artifact selected for this exact request. */
  promptProfileArtifactHash?: string;
  schemaHash: string | null;
  gateHash: string | null;
  ladderHash: string | null;
  policyHash: string | null;
  corpus: AtlasResearchCorpusProvenance | null;
  runnerVersion: string;
  gitVersion: string;
}

/**
 * Candidate cardinality is semantic: `n=1` only proves one completion, not
 * how many full questions a JSON object contains. The installed controller
 * must attest an allow-listed output/parser contract against the wire facts.
 */
export interface AtlasResearchCandidateContract {
  attestationId: string;
  attestationHash: string;
  expectedCandidatesPerCompletion: number;
}

/**
 * Caller-visible declaration for a request whose exact bytes depend on a
 * prior model response.  It deliberately contains neither parent-response
 * evidence nor child wire hashes: callers do not possess either trusted fact.
 * After parsing the actual child wire request, the boundary passes this intent
 * to the controller.  The controller then mints the durable, parent-bound
 * authorization receipt internally while it leases the physical call.
 */
export interface AtlasResearchDerivationIntent {
  contractId: string;
  artifactHash: string;
}

export interface AtlasResearchScope {
  operationId: string;
  purpose: AtlasResearchPurpose;
  expectedEndpoint: string;
  expectedCandidateOutputs: number;
  candidateContract?: AtlasResearchCandidateContract;
  derivationIntent?: AtlasResearchDerivationIntent | null;
  parentPhysicalCallId?: string | null;
  provenance: AtlasResearchProvenance;
}

export type AtlasResearchWireOutputShape =
  | "json-schema-object"
  | "json-schema-fixed-array"
  | "json-schema-variable-array"
  | "json-schema-unknown"
  | "json-object"
  | "text-or-unknown";

export interface AtlasResearchWireRequestFacts {
  method: "POST";
  endpointOrigin: string;
  endpointPath: string;
  endpointHash: string;
  /** SHA-256 of the exact inline JSON string passed to fetch. */
  wireBodyHash: string;
  /** Exact UTF-8 byte length of that inline JSON request body. */
  requestBodyUtf8Bytes: number;
  canonicalRequestHash: string;
  wirePromptHash: string;
  wireSchemaHash: string | null;
  model: string;
  completionCount: number;
  stream: false;
  outputShape: AtlasResearchWireOutputShape;
  structurallyFixedOutputsPerCompletion: number | null;
  maxTokens: number | null;
  maxCompletionTokens: number | null;
  maxOutputTokens: number | null;
}

export interface AtlasResearchCandidateAttestationRequest {
  scope: Readonly<AtlasResearchScope>;
  request: Readonly<AtlasResearchWireRequestFacts>;
}

export interface AtlasResearchCandidateAttestation {
  attestationId: string;
  attestationHash: string;
  candidatesPerCompletion: number;
}

export interface AtlasResearchLeaseRequest {
  operationId: string;
  physicalCallId: string;
  physicalOrdinal: number;
  purpose: AtlasResearchPurpose;
  parentPhysicalCallId: string | null;
  derivationIntent: AtlasResearchDerivationIntent | null;
  candidateOutputs: number;
  provenance: Readonly<AtlasResearchProvenance>;
  request: Readonly<AtlasResearchWireRequestFacts>;
}

export interface AtlasResearchLease {
  leaseId: string;
}

export interface AtlasResearchHttpResponseEvidence {
  operationId: string;
  physicalCallId: string;
  physicalOrdinal: number;
  status: number;
  ok: boolean;
  terminalKind: "http-response";
}

export interface AtlasResearchFetchErrorEvidence {
  operationId: string;
  physicalCallId: string;
  physicalOrdinal: number;
  terminalKind: "network-error" | "abort";
  errorName: string;
  errorCode: string | null;
  errorMessageHash: string;
}

export interface AtlasResearchCloneEvidence {
  operationId: string;
  physicalCallId: string;
  physicalOrdinal: number;
  parseState: AtlasResearchResponseParseState;
  responseBodyHash: string | null;
  generationId: string | null;
  servedModel: string | null;
  upstreamProvider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costState: AtlasResearchCostState;
  /** Same total-cost rule as atlas-ai metadata: BYOK includes upstream cost. */
  costUsd?: number;
  rawUsageCostUsd: number | null;
  upstreamInferenceCostUsd: number | null;
  /** Trusted exact clone bytes. Controllers must keep these private and persist only bounded evidence. */
  capturedResponseBody: Uint8Array | null;
}

export interface AtlasResearchFetchController {
  readonly controllerId: string;
  attestCandidateContract(
    request: AtlasResearchCandidateAttestationRequest,
  ):
    | AtlasResearchCandidateAttestation
    | Promise<AtlasResearchCandidateAttestation>;
  /**
   * The trusted implementation must reject endpoint/model/plan/purpose/stage
   * combinations outside its phase registry before durably committing and
   * returning a lease. In particular, it must not let a candidate-producing
   * call self-label as design/evaluation merely to lease zero candidate slots.
   * All request facts here were parsed from the actual wire request, not copied
   * from caller arguments.
   */
  preFetchLease(
    request: AtlasResearchLeaseRequest,
  ): AtlasResearchLease | Promise<AtlasResearchLease>;
  observeResponse(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchHttpResponseEvidence,
  ): void | Promise<void>;
  observeError(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchFetchErrorEvidence,
  ): void | Promise<void>;
  observeClone(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchCloneEvidence,
  ): void | Promise<void>;
  /** The controller must retain/await this promise before closing its batch. */
  trackCloneObservation(
    lease: Readonly<AtlasResearchLease>,
    completion: Promise<void>,
  ): void;
}

export class AtlasResearchBoundaryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AtlasResearchBoundaryError";
    this.code = code;
  }
}

type AtlasFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface AtlasResearchOperationState {
  nextPhysicalOrdinal: number;
  lastPhysicalCallId: string | null;
  acceptingFetches: boolean;
  physicalFetchInProgress: boolean;
  inFlightFetches: Set<Promise<Response>>;
  cloneObservations: Set<Promise<void>>;
  cloneObservationFailed: boolean;
}

interface AtlasResearchInternalScope {
  scope: Readonly<AtlasResearchScope>;
  operationState: AtlasResearchOperationState;
  scopeOpen: boolean;
  inFlightFetches: Set<Promise<Response>>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const scopeStorage = new AsyncLocalStorage<AtlasResearchInternalScope>();
const activeOperationIds = new Set<string>();

let installedController:
  | {
      controller: AtlasResearchFetchController;
      installationToken: symbol;
    }
  | undefined;

function boundaryError(code: string, message: string): never {
  throw new AtlasResearchBoundaryError(code, message);
}

function rethrowControllerError(
  error: unknown,
  code: string,
  message: string,
): never {
  // Controller-authored boundary errors carry deliberate safe diagnostics and
  // remain non-retryable to the AI SDK. Arbitrary DB/transport errors are
  // hidden behind our own error type so `TypeError("fetch failed")` cannot be
  // mistaken for a retryable provider-network failure.
  if (error instanceof AtlasResearchBoundaryError) throw error;
  boundaryError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmpty(value: unknown, field: string, maxLength = 300): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    boundaryError("INVALID_SCOPE", `${field} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    boundaryError("INVALID_SCOPE", `${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function assertHash(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    boundaryError("INVALID_SCOPE", `${field} must be a SHA-256 hex digest`);
  }
  return value.toLowerCase();
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    boundaryError("INVALID_SCOPE", `${field} must be a positive safe integer`);
  }
  return Number(value);
}

function normalizeEndpoint(endpoint: string, field: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    boundaryError("INVALID_ENDPOINT", `${field} must be an absolute URL`);
  }
  if (url.username || url.password || url.hash) {
    boundaryError(
      "INVALID_ENDPOINT",
      `${field} must not include credentials or a fragment`,
    );
  }
  // Preserve the exact path and query semantics. In particular, trimming a
  // trailing slash here while forwarding the original URL would let the
  // controller lease `/chat/completions` but send `/chat/completions/`.
  return url.toString();
}

function normalizeScope(input: AtlasResearchScope): Readonly<AtlasResearchScope> {
  if (!isRecord(input)) {
    boundaryError("INVALID_SCOPE", "research scope must be an object");
  }
  const operationId = assertNonEmpty(input.operationId, "operationId", 200);
  if (!(["candidate", "design", "evaluation"] as const).includes(input.purpose)) {
    boundaryError("INVALID_SCOPE", "purpose must be candidate, design, or evaluation");
  }
  const expectedEndpoint = normalizeEndpoint(
    assertNonEmpty(input.expectedEndpoint, "expectedEndpoint", 2_000),
    "expectedEndpoint",
  );
  if (!isRecord(input.provenance)) {
    boundaryError("INVALID_SCOPE", "provenance is required");
  }
  const provenance: AtlasResearchProvenance = {
    requestedModel: assertNonEmpty(
      input.provenance.requestedModel,
      "provenance.requestedModel",
    ),
    effectiveModel: assertNonEmpty(
      input.provenance.effectiveModel,
      "provenance.effectiveModel",
    ),
    plan: assertNonEmpty(input.provenance.plan, "provenance.plan"),
    stage: assertNonEmpty(input.provenance.stage, "provenance.stage"),
    promptHash: assertHash(
      input.provenance.promptHash,
      "provenance.promptHash",
    )!,
    ...(input.provenance.requestEnvelopeHash === undefined
      ? {}
      : {
          requestEnvelopeHash: assertHash(
            input.provenance.requestEnvelopeHash,
            "provenance.requestEnvelopeHash",
          )!,
        }),
    ...(input.provenance.promptProfileArtifactHash === undefined
      ? {}
      : {
          promptProfileArtifactHash: assertHash(
            input.provenance.promptProfileArtifactHash,
            "provenance.promptProfileArtifactHash",
          )!,
        }),
    schemaHash: assertHash(
      input.provenance.schemaHash,
      "provenance.schemaHash",
      true,
    ),
    gateHash: assertHash(
      input.provenance.gateHash,
      "provenance.gateHash",
      true,
    ),
    ladderHash: assertHash(
      input.provenance.ladderHash,
      "provenance.ladderHash",
      true,
    ),
    policyHash: assertHash(
      input.provenance.policyHash,
      "provenance.policyHash",
      true,
    ),
    corpus: null,
    runnerVersion: assertNonEmpty(
      input.provenance.runnerVersion,
      "provenance.runnerVersion",
    ),
    gitVersion: assertNonEmpty(
      input.provenance.gitVersion,
      "provenance.gitVersion",
    ),
  };
  if (input.provenance.corpus !== null) {
    if (!isRecord(input.provenance.corpus)) {
      boundaryError("INVALID_SCOPE", "provenance.corpus must be an object or null");
    }
    provenance.corpus = {
      corpusId: assertNonEmpty(
        input.provenance.corpus.corpusId,
        "provenance.corpus.corpusId",
      ),
      rowId: assertNonEmpty(
        input.provenance.corpus.rowId,
        "provenance.corpus.rowId",
      ),
      passageHash: assertHash(
        input.provenance.corpus.passageHash,
        "provenance.corpus.passageHash",
      )!,
    };
  }

  let candidateContract: AtlasResearchCandidateContract | undefined;
  let derivationIntent: AtlasResearchDerivationIntent | null = null;
  // Fail loudly if an older or malicious caller attempts to inject trusted
  // receipt material.  Unknown object properties are otherwise intentionally
  // ignored during normalization, so this explicit check closes the legacy
  // caller-reconstructed response/wire-hash path.
  if (Object.prototype.hasOwnProperty.call(input, "derivationReceipt")) {
    boundaryError(
      "CALLER_DERIVATION_RECEIPT_FORBIDDEN",
      "callers may declare only derivationIntent; the controller mints receipts",
    );
  }
  if (input.derivationIntent != null) {
    if (!isRecord(input.derivationIntent)) {
      boundaryError("INVALID_SCOPE", "derivationIntent must be an object or null");
    }
    derivationIntent = {
      contractId: assertNonEmpty(
        input.derivationIntent.contractId,
        "derivationIntent.contractId",
      ),
      artifactHash: assertHash(
        input.derivationIntent.artifactHash,
        "derivationIntent.artifactHash",
      )!,
    };
  }
  if (input.purpose === "candidate") {
    const expectedCandidateOutputs = assertPositiveInteger(
      input.expectedCandidateOutputs,
      "expectedCandidateOutputs",
    );
    if (!isRecord(input.candidateContract)) {
      boundaryError(
        "MISSING_CANDIDATE_CONTRACT",
        "candidate scope requires a trusted cardinality attestation contract",
      );
    }
    candidateContract = {
      attestationId: assertNonEmpty(
        input.candidateContract.attestationId,
        "candidateContract.attestationId",
      ),
      attestationHash: assertHash(
        input.candidateContract.attestationHash,
        "candidateContract.attestationHash",
      )!,
      expectedCandidatesPerCompletion: assertPositiveInteger(
        input.candidateContract.expectedCandidatesPerCompletion,
        "candidateContract.expectedCandidatesPerCompletion",
      ),
    };
    return deepFreeze({
      operationId,
      purpose: input.purpose,
      expectedEndpoint,
      expectedCandidateOutputs,
      candidateContract,
      derivationIntent,
      parentPhysicalCallId:
        input.parentPhysicalCallId == null
          ? null
          : assertNonEmpty(input.parentPhysicalCallId, "parentPhysicalCallId"),
      provenance,
    });
  }

  if (input.expectedCandidateOutputs !== 0) {
    boundaryError(
      "NON_CANDIDATE_SLOT_MISMATCH",
      "design/evaluation scopes must declare zero candidate outputs",
    );
  }
  if (input.candidateContract !== undefined) {
    boundaryError(
      "NON_CANDIDATE_CONTRACT",
      "design/evaluation scopes must not include a candidate contract",
    );
  }
  return deepFreeze({
    operationId,
    purpose: input.purpose,
    expectedEndpoint,
    expectedCandidateOutputs: 0,
    derivationIntent,
    parentPhysicalCallId:
      input.parentPhysicalCallId == null
        ? null
        : assertNonEmpty(input.parentPhysicalCallId, "parentPhysicalCallId"),
    provenance,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
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

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function integerOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function optionalPositiveRequestInteger(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    boundaryError("INVALID_MAX_TOKENS", `${field} must be a positive integer`);
  }
  return Number(value);
}

function parseCompletionCount(body: Record<string, unknown>): number {
  if (body.n === undefined || body.n === null) return 1;
  if (!Number.isSafeInteger(body.n) || Number(body.n) <= 0) {
    boundaryError("INVALID_CARDINALITY", "wire request n must be a positive integer");
  }
  return Number(body.n);
}

function parseWireOutput(body: Record<string, unknown>): {
  outputShape: AtlasResearchWireOutputShape;
  wireSchemaHash: string | null;
  structurallyFixedOutputsPerCompletion: number | null;
} {
  const responseFormat = isRecord(body.response_format)
    ? body.response_format
    : undefined;
  if (!responseFormat) {
    return {
      outputShape: "text-or-unknown",
      wireSchemaHash: null,
      structurallyFixedOutputsPerCompletion: null,
    };
  }
  if (responseFormat.type === "json_object") {
    return {
      outputShape: "json-object",
      wireSchemaHash: null,
      // json_object constrains only the root transport syntax. It does not
      // freeze semantic full-question cardinality inside that object.
      structurallyFixedOutputsPerCompletion: null,
    };
  }
  if (responseFormat.type !== "json_schema") {
    return {
      outputShape: "text-or-unknown",
      wireSchemaHash: null,
      structurallyFixedOutputsPerCompletion: null,
    };
  }
  const jsonSchema = isRecord(responseFormat.json_schema)
    ? responseFormat.json_schema
    : undefined;
  const schema = jsonSchema && isRecord(jsonSchema.schema) ? jsonSchema.schema : undefined;
  if (!schema) {
    return {
      outputShape: "json-schema-unknown",
      wireSchemaHash: null,
      structurallyFixedOutputsPerCompletion: null,
    };
  }
  const wireSchemaHash = sha256(stableJson(schema));
  if (schema.type === "object") {
    const properties = isRecord(schema.properties) ? schema.properties : undefined;
    const questions = properties && isRecord(properties.questions)
      ? properties.questions
      : undefined;
    if (questions?.type === "array") {
      const minItems = integerOrNull(questions.minItems);
      const maxItems = integerOrNull(questions.maxItems);
      return {
        outputShape: "json-schema-object",
        wireSchemaHash,
        structurallyFixedOutputsPerCompletion:
          minItems !== null && minItems === maxItems ? minItems : null,
      };
    }
    return {
      outputShape: "json-schema-object",
      wireSchemaHash,
      // A frozen parser may attest that the root object itself is one semantic
      // candidate. Wrapper objects with questions[] are handled above and must
      // carry equal minItems/maxItems; an unbounded array is never called one.
      structurallyFixedOutputsPerCompletion: 1,
    };
  }
  if (schema.type === "array") {
    const minItems = integerOrNull(schema.minItems);
    const maxItems = integerOrNull(schema.maxItems);
    if (minItems !== null && minItems === maxItems) {
      return {
        outputShape: "json-schema-fixed-array",
        wireSchemaHash,
        structurallyFixedOutputsPerCompletion: minItems,
      };
    }
    return {
      outputShape: "json-schema-variable-array",
      wireSchemaHash,
      structurallyFixedOutputsPerCompletion: null,
    };
  }
  return {
    outputShape: "json-schema-unknown",
    wireSchemaHash,
    structurallyFixedOutputsPerCompletion: null,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  boundaryError("UNSUPPORTED_REQUEST", "active research request URL is unsupported");
}

/**
 * Research enforcement awaits trusted controller I/O before the network call.
 * Snapshot the transport arguments first so a caller cannot mutate a URL,
 * headers, or JSON body during that await and make the leased wire facts false.
 * This path is research-only; the no-scope fast path still forwards the exact
 * original objects and promise.
 */
function snapshotActiveFetchArguments(
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
        "UNSUPPORTED_REQUEST",
        "active research Request input must be cloneable",
      );
    }
  } else {
    boundaryError("UNSUPPORTED_REQUEST", "active research request is unsupported");
  }

  if (!init) return { input: snapshotInput, init: undefined };
  let headers: HeadersInit | undefined;
  try {
    headers = init.headers === undefined ? undefined : new Headers(init.headers);
  } catch {
    boundaryError(
      "UNSUPPORTED_REQUEST",
      "active research request headers must be cloneable",
    );
  }
  return {
    input: snapshotInput,
    init: {
      ...init,
      ...(headers === undefined ? {} : { headers }),
    },
  };
}

/**
 * OpenRouter exposes its routing decision only when this opt-in header is
 * present. Inject it after cloning the research request so application code
 * cannot race or remove it while the durable pre-fetch lease is awaited.
 * The no-scope dispatcher path never calls this helper, preserving ordinary
 * production request bytes and headers exactly.
 */
function withResearchRouterMetadataHeader(
  snapshot: { input: RequestInfo | URL; init: RequestInit | undefined },
): { input: RequestInfo | URL; init: RequestInit } {
  const headers = new Headers(
    typeof Request !== "undefined" && snapshot.input instanceof Request
      ? snapshot.input.headers
      : undefined,
  );
  if (snapshot.init?.headers !== undefined) {
    new Headers(snapshot.init.headers).forEach((value, key) => headers.set(key, value));
  }
  headers.set("X-OpenRouter-Metadata", "enabled");
  return {
    input: snapshot.input,
    init: { ...snapshot.init, headers },
  };
}

function parseActiveRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  scope: Readonly<AtlasResearchScope>,
): Readonly<AtlasResearchWireRequestFacts> {
  const method = (
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "POST") {
    boundaryError("UNSUPPORTED_REQUEST", "active research requests must use POST");
  }
  if (typeof init?.body !== "string") {
    boundaryError(
      "UNSUPPORTED_REQUEST_BODY",
      "active research requests require an inline JSON string body",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(init.body);
  } catch {
    boundaryError("INVALID_REQUEST_JSON", "active research request body is not JSON");
  }
  if (!isRecord(body)) {
    boundaryError("INVALID_REQUEST_JSON", "active research request body must be an object");
  }
  const model = assertNonEmpty(body.model, "wire.model");
  if (model !== scope.provenance.effectiveModel) {
    boundaryError(
      "MODEL_MISMATCH",
      `wire model does not match provenance.effectiveModel`,
    );
  }
  if (body.stream === true) {
    boundaryError(
      "STREAMING_UNSUPPORTED",
      "streaming is fail-closed in research scope until SSE billing is attested",
    );
  }
  if (body.stream !== undefined && body.stream !== false) {
    boundaryError("INVALID_STREAM_FLAG", "wire stream must be false or omitted");
  }

  const actualEndpoint = normalizeEndpoint(requestUrl(input), "wire endpoint");
  if (actualEndpoint !== scope.expectedEndpoint) {
    boundaryError("ENDPOINT_MISMATCH", "wire endpoint does not match scoped contract");
  }
  const endpointUrl = new URL(actualEndpoint);
  const promptFields = {
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  };
  const output = parseWireOutput(body);
  const maxTokens = optionalPositiveRequestInteger(body.max_tokens, "max_tokens");
  const maxCompletionTokens = optionalPositiveRequestInteger(
    body.max_completion_tokens,
    "max_completion_tokens",
  );
  const maxOutputTokens = optionalPositiveRequestInteger(
    body.max_output_tokens,
    "max_output_tokens",
  );
  const declaredTokenCaps = [maxTokens, maxCompletionTokens, maxOutputTokens].filter(
    (value): value is number => value !== null,
  );
  if (new Set(declaredTokenCaps).size > 1) {
    boundaryError(
      "MAX_TOKEN_CONTRACT_MISMATCH",
      "wire max-token fields disagree with one another",
    );
  }
  const facts: AtlasResearchWireRequestFacts = {
    method: "POST",
    endpointOrigin: endpointUrl.origin,
    endpointPath: endpointUrl.pathname,
    endpointHash: sha256(actualEndpoint),
    wireBodyHash: sha256(init.body),
    requestBodyUtf8Bytes: Buffer.byteLength(init.body, "utf8"),
    canonicalRequestHash: sha256(
      stableJson({ method: "POST", endpoint: actualEndpoint, body }),
    ),
    wirePromptHash: sha256(stableJson(promptFields)),
    wireSchemaHash: output.wireSchemaHash,
    model,
    completionCount: parseCompletionCount(body),
    stream: false,
    outputShape: output.outputShape,
    structurallyFixedOutputsPerCompletion:
      output.structurallyFixedOutputsPerCompletion,
    maxTokens,
    maxCompletionTokens,
    maxOutputTokens,
  };
  return deepFreeze(facts);
}

function validateController(controller: AtlasResearchFetchController): void {
  assertNonEmpty(controller?.controllerId, "controller.controllerId");
  for (const method of [
    "attestCandidateContract",
    "preFetchLease",
    "observeResponse",
    "observeError",
    "observeClone",
    "trackCloneObservation",
  ] as const) {
    if (typeof controller?.[method] !== "function") {
      boundaryError("INVALID_CONTROLLER", `controller.${method} is required`);
    }
  }
}

function validateLease(lease: AtlasResearchLease): Readonly<AtlasResearchLease> {
  if (!isRecord(lease)) {
    boundaryError("INVALID_LEASE", "controller returned an invalid lease");
  }
  return Object.freeze({ leaseId: assertNonEmpty(lease.leaseId, "lease.leaseId") });
}

async function candidateOutputsForRequest(
  controller: AtlasResearchFetchController,
  scope: Readonly<AtlasResearchScope>,
  request: Readonly<AtlasResearchWireRequestFacts>,
): Promise<number> {
  if (scope.purpose !== "candidate") return 0;
  const contract = scope.candidateContract!;
  let attestation: AtlasResearchCandidateAttestation;
  try {
    attestation = await controller.attestCandidateContract({ scope, request });
  } catch (error) {
    rethrowControllerError(
      error,
      "CONTROLLER_ATTESTATION_FAILED",
      "candidate contract attestation failed",
    );
  }
  if (!isRecord(attestation)) {
    boundaryError("INVALID_ATTESTATION", "controller returned an invalid attestation");
  }
  const attestationId = assertNonEmpty(
    attestation.attestationId,
    "attestation.attestationId",
  );
  const attestationHash = assertHash(
    attestation.attestationHash,
    "attestation.attestationHash",
  )!;
  const perCompletion = assertPositiveInteger(
    attestation.candidatesPerCompletion,
    "attestation.candidatesPerCompletion",
  );
  if (
    attestationId !== contract.attestationId ||
    attestationHash !== contract.attestationHash
  ) {
    boundaryError(
      "ATTESTATION_MISMATCH",
      "controller attestation does not match the scoped candidate contract",
    );
  }
  if (perCompletion !== contract.expectedCandidatesPerCompletion) {
    boundaryError(
      "ATTESTATION_CARDINALITY_MISMATCH",
      "controller cardinality does not match scoped candidates-per-completion",
    );
  }
  const total = request.completionCount * perCompletion;
  if (!Number.isSafeInteger(total) || total !== scope.expectedCandidateOutputs) {
    boundaryError(
      "CANDIDATE_CARDINALITY_MISMATCH",
      "wire n × attested cardinality does not match expectedCandidateOutputs",
    );
  }
  return total;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" && record[key].length > 0
    ? String(record[key])
    : null;
}

async function readBoundedResponseBody(
  response: Response,
): Promise<{ bytes: Uint8Array | null; tooLarge: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), tooLarge: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES) {
        await reader.cancel("atlas-research-response-body-limit").catch(() => undefined);
        return { bytes: null, tooLarge: true };
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
  return { bytes, tooLarge: false };
}

interface AtlasResearchInspectedResponse {
  evidence: AtlasResearchCloneEvidence;
  forwardedResponse: Response | null;
}

function rebuildConsumedResponse(
  response: Response,
  bytes: Uint8Array,
  bodyWasNull: boolean,
): Response {
  // A scoped research response is consumed here so the capture limit controls
  // the source stream itself. Rebuild the response from the exact bounded bytes
  // for the SDK; the production no-scope fast path never enters this seam.
  const nullBodyStatus = response.status === 204 || response.status === 205 ||
    response.status === 304;
  const forwardedBody = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(forwardedBody).set(bytes);
  const forwarded = new Response(
    bodyWasNull || nullBodyStatus ? null : forwardedBody,
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    },
  );
  // Response() cannot initialize these fetch-populated metadata fields. They
  // are immutable snapshots and safe to expose on the reconstructed instance.
  Object.defineProperties(forwarded, {
    redirected: { configurable: true, value: response.redirected },
    type: { configurable: true, value: response.type },
    url: { configurable: true, value: response.url },
  });
  return forwarded;
}

async function inspectBoundedResponse(
  response: Response,
  operationId: string,
  physicalCallId: string,
  physicalOrdinal: number,
): Promise<AtlasResearchInspectedResponse> {
  const bodyWasNull = response.body === null;
  let capture: { bytes: Uint8Array | null; tooLarge: boolean };
  try {
    capture = await readBoundedResponseBody(response);
  } catch {
    return {
      evidence: {
        operationId,
        physicalCallId,
        physicalOrdinal,
        parseState: "clone-error",
        responseBodyHash: null,
        generationId: null,
        servedModel: null,
        upstreamProvider: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costState: "unknown",
        rawUsageCostUsd: null,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: null,
      },
      forwardedResponse: null,
    };
  }
  if (capture.tooLarge || !capture.bytes) {
    return {
      evidence: {
        operationId,
        physicalCallId,
        physicalOrdinal,
        parseState: "body-too-large",
        responseBodyHash: null,
        generationId: null,
        servedModel: null,
        upstreamProvider: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costState: "unknown",
        rawUsageCostUsd: null,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: null,
      },
      forwardedResponse: null,
    };
  }
  const bytes = capture.bytes;
  let forwardedResponse: Response;
  try {
    forwardedResponse = rebuildConsumedResponse(response, bytes, bodyWasNull);
  } catch {
    return {
      evidence: {
        operationId,
        physicalCallId,
        physicalOrdinal,
        parseState: "clone-error",
        responseBodyHash: null,
        generationId: null,
        servedModel: null,
        upstreamProvider: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costState: "unknown",
        rawUsageCostUsd: null,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: null,
      },
      forwardedResponse: null,
    };
  }
  const responseBodyHash = sha256Bytes(bytes);
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      evidence: {
        operationId,
        physicalCallId,
        physicalOrdinal,
        parseState: "non-json",
        responseBodyHash,
        generationId: null,
        servedModel: null,
        upstreamProvider: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costState: "unknown",
        rawUsageCostUsd: null,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: bytes,
      },
      forwardedResponse,
    };
  }
  const body = isRecord(parsed) ? parsed : {};
  const usage = isRecord(body.usage) ? body.usage : {};
  const rawUsageCostUsd = finiteNonNegativeNumber(usage.cost);
  const costDetails = isRecord(usage.cost_details) ? usage.cost_details : {};
  const upstreamInferenceCostUsd = finiteNonNegativeNumber(
    costDetails.upstream_inference_cost,
  );
  let costUsd: number | undefined;
  if (rawUsageCostUsd !== null) {
    costUsd = rawUsageCostUsd;
    if (usage.is_byok === true && upstreamInferenceCostUsd !== null) {
      costUsd += upstreamInferenceCostUsd;
    }
  }
  return {
    evidence: {
      operationId,
      physicalCallId,
      physicalOrdinal,
      parseState: "json",
      responseBodyHash,
      generationId: readString(body, "id"),
      servedModel: readString(body, "model"),
      upstreamProvider: readString(body, "provider"),
      promptTokens: integerOrNull(usage.prompt_tokens),
      completionTokens: integerOrNull(usage.completion_tokens),
      totalTokens: integerOrNull(usage.total_tokens),
      costState: costUsd === undefined ? "unknown" : "reported",
      ...(costUsd === undefined ? {} : { costUsd }),
      rawUsageCostUsd,
      upstreamInferenceCostUsd,
      capturedResponseBody: bytes,
    },
    forwardedResponse,
  };
}

function errorEvidence(
  error: unknown,
  operationId: string,
  physicalCallId: string,
  physicalOrdinal: number,
): AtlasResearchFetchErrorEvidence {
  const record = isRecord(error) ? error : {};
  const rawName = error instanceof Error && error.name ? error.name : "";
  const name = new Set([
    "AbortError",
    "Error",
    "NetworkError",
    "TimeoutError",
    "TypeError",
  ]).has(rawName)
    ? rawName
    : "UnknownFetchError";
  const message = error instanceof Error ? error.message : String(error);
  const rawCode = record.code;
  const candidateCode =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode)
      : "";
  // Never persist an arbitrary transport-provided string as an error code.
  // Only a narrow Node/undici transport allow-list is retained; everything
  // else remains represented by the message hash and coarse terminal kind.
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
    name === "AbortError" ||
    errorCode === "ABORT_ERR" ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError");
  return {
    operationId,
    physicalCallId,
    physicalOrdinal,
    terminalKind: aborted ? "abort" : "network-error",
    errorName: name,
    errorCode,
    errorMessageHash: sha256(message),
  };
}

async function dispatchActiveResearchFetch(
  delegate: AtlasFetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  internal: AtlasResearchInternalScope,
): Promise<Response> {
  const installed = installedController;
  if (!installed) {
    boundaryError(
      "MISSING_CONTROLLER",
      "active Atlas research scope requires an installed controller",
    );
  }
  const controller = installed.controller;
  const snapshot = withResearchRouterMetadataHeader(
    snapshotActiveFetchArguments(input, init),
  );
  const request = parseActiveRequest(
    snapshot.input,
    snapshot.init,
    internal.scope,
  );
  const candidateOutputs = await candidateOutputsForRequest(
    controller,
    internal.scope,
    request,
  );
  // A derived prompt is not knowable to the caller before the SDK serializes
  // it. Bind durable provenance to the prompt facts parsed from the actual
  // wire body, not to a caller reconstruction or guessed SDK representation.
  const leaseProvenance = internal.scope.derivationIntent
    ? deepFreeze({
        ...internal.scope.provenance,
        promptHash: request.wirePromptHash,
      })
    : internal.scope.provenance;

  const physicalOrdinal = ++internal.operationState.nextPhysicalOrdinal;
  const physicalCallId = `${internal.scope.operationId}:http:${physicalOrdinal}`;
  const leaseRequest: AtlasResearchLeaseRequest = deepFreeze({
    operationId: internal.scope.operationId,
    physicalCallId,
    physicalOrdinal,
    purpose: internal.scope.purpose,
    parentPhysicalCallId: internal.scope.parentPhysicalCallId ?? null,
    derivationIntent: internal.scope.derivationIntent ?? null,
    candidateOutputs,
    provenance: leaseProvenance,
    request,
  });
  let rawLease: AtlasResearchLease;
  try {
    rawLease = await controller.preFetchLease(leaseRequest);
  } catch (error) {
    rethrowControllerError(
      error,
      "CONTROLLER_LEASE_FAILED",
      "durable pre-fetch lease failed",
    );
  }
  const lease = validateLease(rawLease);
  // The lease is committed before network I/O. A later failure remains evidence.
  internal.operationState.lastPhysicalCallId = physicalCallId;

  let response: Response;
  try {
    response = await delegate(snapshot.input, snapshot.init);
  } catch (error) {
    try {
      await controller.observeError(
        lease,
        errorEvidence(
          error,
          internal.scope.operationId,
          physicalCallId,
          physicalOrdinal,
        ),
      );
    } catch (observationError) {
      rethrowControllerError(
        observationError,
        "CONTROLLER_ERROR_OBSERVATION_FAILED",
        "fetch-error observation failed",
      );
    }
    throw error;
  }

  const inspectionCompletion = inspectBoundedResponse(
    response,
    internal.scope.operationId,
    physicalCallId,
    physicalOrdinal,
  );
  const cloneCompletion = inspectionCompletion.then(({ evidence }) =>
    controller.observeClone(lease, evidence)
  );
  internal.operationState.cloneObservations.add(cloneCompletion);
  void cloneCompletion.then(
    () => {
      internal.operationState.cloneObservations.delete(cloneCompletion);
    },
    () => {
      internal.operationState.cloneObservationFailed = true;
      internal.operationState.cloneObservations.delete(cloneCompletion);
    },
  );
  let cloneTrackingError: unknown;
  let cloneTrackingFailed = false;
  try {
    controller.trackCloneObservation(lease, cloneCompletion);
  } catch (error) {
    cloneTrackingFailed = true;
    cloneTrackingError = error;
  }
  // Start and register billing extraction before awaiting the terminal observer.
  // If durable response observation fails, the clone can still preserve cost
  // evidence and the root scope will not close until it settles.
  let responseObservationError: unknown;
  let responseObservationFailed = false;
  try {
    await controller.observeResponse(lease, {
      operationId: internal.scope.operationId,
      physicalCallId,
      physicalOrdinal,
      status: response.status,
      ok: response.ok,
      terminalKind: "http-response",
    });
  } catch (error) {
    responseObservationFailed = true;
    responseObservationError = error;
  }
  if (responseObservationFailed) {
    rethrowControllerError(
      responseObservationError,
      "CONTROLLER_RESPONSE_OBSERVATION_FAILED",
      "HTTP-response observation failed",
    );
  }
  if (cloneTrackingFailed) {
    rethrowControllerError(
      cloneTrackingError,
      "CONTROLLER_CLONE_TRACKING_FAILED",
      "clone-observation tracking failed",
    );
  }
  const inspection = await inspectionCompletion;
  if (!inspection.forwardedResponse) {
    // Do not hand a consumed, truncated, or otherwise unverifiable response to
    // the SDK. The clone observer remains registered and scope closure drains it
    // so the controller can consume the reserved maximum and forbid replay.
    boundaryError(
      "RESPONSE_BODY_UNINSPECTABLE",
      "research response body exceeded the capture bound or could not be inspected",
    );
  }
  return inspection.forwardedResponse;
}

/**
 * Builds a dispatcher around an immutable delegate. This is also used by the
 * zero-network tests with an in-memory delegate; it is not an environment
 * bypass and still enforces the single installed controller and ALS contract.
 */
export function createAtlasResearchFetchDispatcher(delegate: AtlasFetch): AtlasFetch {
  if (typeof delegate !== "function") {
    boundaryError("INVALID_FETCH_DELEGATE", "fetch delegate must be a function");
  }
  return (input, init) => {
    const internal = scopeStorage.getStore();
    if (!internal) {
      // Exact production fast path: no await, clone, parsing, or controller work.
      return delegate(input, init);
    }
    if (!internal.scopeOpen || !internal.operationState.acceptingFetches) {
      return Promise.reject(
        new AtlasResearchBoundaryError(
          "SCOPE_CLOSED",
          "research scope no longer accepts provider calls",
        ),
      );
    }
    // A shared "latest physical call" cannot represent two simultaneous
    // parents without ambiguous repair/fallback lineage. Independent attempts
    // must use independent root operation IDs.
    if (internal.operationState.physicalFetchInProgress) {
      return Promise.reject(
        new AtlasResearchBoundaryError(
          "CONCURRENT_OPERATION_FETCH",
          "concurrent provider calls require independent root operations",
        ),
      );
    }
    internal.operationState.physicalFetchInProgress = true;
    const completion = dispatchActiveResearchFetch(delegate, input, init, internal);
    internal.operationState.inFlightFetches.add(completion);
    internal.inFlightFetches.add(completion);
    void completion.then(
      () => {
        internal.operationState.inFlightFetches.delete(completion);
        internal.inFlightFetches.delete(completion);
        internal.operationState.physicalFetchInProgress = false;
      },
      () => {
        internal.operationState.inFlightFetches.delete(completion);
        internal.inFlightFetches.delete(completion);
        internal.operationState.physicalFetchInProgress = false;
      },
    );
    return completion;
  };
}

/** Installs exactly one trusted controller. There is intentionally no force reset. */
export function installAtlasResearchFetchController(
  controller: AtlasResearchFetchController,
): () => void {
  validateController(controller);
  if (installedController) {
    boundaryError(
      "CONTROLLER_ALREADY_INSTALLED",
      "an Atlas research fetch controller is already installed",
    );
  }
  const installationToken = Symbol(controller.controllerId);
  installedController = { controller, installationToken };
  let uninstalled = false;
  return () => {
    if (uninstalled) {
      boundaryError("CONTROLLER_ALREADY_UNINSTALLED", "controller already uninstalled");
    }
    if (installedController?.installationToken !== installationToken) {
      boundaryError("CONTROLLER_OWNERSHIP_MISMATCH", "controller ownership changed");
    }
    if (activeOperationIds.size > 0) {
      boundaryError(
        "CONTROLLER_HAS_ACTIVE_OPERATIONS",
        "controller cannot be uninstalled while research operations are active",
      );
    }
    installedController = undefined;
    uninstalled = true;
  };
}

/** Starts a root operation and prevents concurrent reuse of its operation ID. */
export async function runWithAtlasResearchScope<T>(
  scope: AtlasResearchScope,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (getAtlasFetchScopeKind() !== null) {
    boundaryError(
      "ATLAS_FETCH_SCOPE_CONFLICT",
      "research and production assignment scopes are mutually exclusive",
    );
  }
  if (scopeStorage.getStore()) {
    boundaryError(
      "NESTED_ROOT_SCOPE",
      "use runWithAtlasResearchChildScope for nested provider calls",
    );
  }
  const normalized = normalizeScope(scope);
  if (normalized.parentPhysicalCallId !== null) {
    boundaryError(
      "ROOT_HAS_PARENT_LINEAGE",
      "root scope must not declare parentPhysicalCallId",
    );
  }
  if (normalized.derivationIntent !== null) {
    boundaryError(
      "ROOT_HAS_DERIVATION_INTENT",
      "root scope cannot declare a parent-derived request intent",
    );
  }
  if (activeOperationIds.has(normalized.operationId)) {
    boundaryError(
      "DUPLICATE_ACTIVE_OPERATION",
      "operationId is already active in another async context",
    );
  }
  activeOperationIds.add(normalized.operationId);
  const internal: AtlasResearchInternalScope = {
    scope: normalized,
    operationState: {
      nextPhysicalOrdinal: 0,
      lastPhysicalCallId: null,
      acceptingFetches: true,
      physicalFetchInProgress: false,
      inFlightFetches: new Set(),
      cloneObservations: new Set(),
      cloneObservationFailed: false,
    },
    scopeOpen: true,
    inFlightFetches: new Set(),
  };
  let result!: T;
  let operationError: unknown;
  let operationFailed = false;
  let unawaitedFetch = false;
  try {
    result = await runWithAtlasFetchScopeKind("research", () =>
      scopeStorage.run(internal, fn),
    );
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    // Close admission first, then keep ownership/operation identity alive until
    // every already-started physical fetch and clone observation has settled.
    internal.scopeOpen = false;
    internal.operationState.acceptingFetches = false;
    const inFlight = [...internal.operationState.inFlightFetches];
    unawaitedFetch = inFlight.length > 0;
    await Promise.allSettled(inFlight);
    await Promise.allSettled([...internal.operationState.cloneObservations]);
    activeOperationIds.delete(normalized.operationId);
  }
  if (internal.operationState.cloneObservationFailed) {
    boundaryError(
      "CLONE_OBSERVATION_FAILED",
      "billing clone observation failed before scope closure",
    );
  }
  if (operationFailed) throw operationError;
  if (unawaitedFetch) {
    boundaryError(
      "UNAWAITED_PROVIDER_FETCH",
      "research scope returned before a provider fetch settled",
    );
  }
  return result;
}

/** Enters an explicitly attributed child stage while sharing physical ordinals. */
export async function runWithAtlasResearchChildScope<T>(
  scope: AtlasResearchScope,
  fn: () => T | Promise<T>,
): Promise<T> {
  const parent = scopeStorage.getStore();
  if (!parent) {
    boundaryError("MISSING_PARENT_SCOPE", "child scope requires an active root scope");
  }
  const normalized = normalizeScope(scope);
  if (normalized.operationId !== parent.scope.operationId) {
    boundaryError(
      "CHILD_OPERATION_MISMATCH",
      "child scope must retain the parent operationId",
    );
  }
  if (!normalized.parentPhysicalCallId) {
    boundaryError(
      "MISSING_PARENT_LINEAGE",
      "child scope requires parentPhysicalCallId",
    );
  }
  if (normalized.parentPhysicalCallId !== parent.operationState.lastPhysicalCallId) {
    boundaryError(
      "PARENT_LINEAGE_MISMATCH",
      "child parentPhysicalCallId is not the latest physical call",
    );
  }
  const internal: AtlasResearchInternalScope = {
    scope: normalized,
    operationState: parent.operationState,
    scopeOpen: true,
    inFlightFetches: new Set(),
  };
  let result!: T;
  let scopeError: unknown;
  let scopeFailed = false;
  let unawaitedFetch = false;
  try {
    result = await scopeStorage.run(internal, fn);
  } catch (error) {
    scopeFailed = true;
    scopeError = error;
  } finally {
    // Descendant async resources retain ALS stores after run() returns. Closing
    // this individual stage prevents a late task from reusing stale provenance.
    internal.scopeOpen = false;
    const inFlight = [...internal.inFlightFetches];
    unawaitedFetch = inFlight.length > 0;
    await Promise.allSettled(inFlight);
  }
  if (scopeFailed) throw scopeError;
  if (unawaitedFetch) {
    boundaryError(
      "UNAWAITED_PROVIDER_FETCH",
      "research child scope returned before a provider fetch settled",
    );
  }
  return result;
}

/** Redacted lineage accessor for explicit repair/fallback child scopes. */
export function getCurrentAtlasResearchLineage(): {
  operationId: string;
  lastPhysicalCallId: string | null;
} | null {
  const internal = scopeStorage.getStore();
  return internal
    ? {
        operationId: internal.scope.operationId,
        lastPhysicalCallId: internal.operationState.lastPhysicalCallId,
      }
    : null;
}

// Resolve the host fetch at call time, matching the provider SDK's native
// transport semantics (including late test/telemetry instrumentation). Active
// research calls still pass through this boundary before the delegate runs, so
// replacing global fetch cannot bypass leasing or response observation.
const nativeFetchDelegate: AtlasFetch = (input, init) =>
  globalThis.fetch(input, init);

export const atlasResearchFetch = createAtlasResearchFetchDispatcher(
  nativeFetchDelegate,
);
