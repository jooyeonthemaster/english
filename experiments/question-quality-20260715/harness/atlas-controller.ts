import { createHash } from "node:crypto";

import {
  AtlasResearchBoundaryError,
  MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES,
  type AtlasResearchCandidateAttestation,
  type AtlasResearchCandidateAttestationRequest,
  type AtlasResearchCloneEvidence,
  type AtlasResearchFetchController,
  type AtlasResearchFetchErrorEvidence,
  type AtlasResearchHttpResponseEvidence,
  type AtlasResearchLease,
  type AtlasResearchLeaseRequest,
  type AtlasResearchProvenance,
  type AtlasResearchPurpose,
  type AtlasResearchScope,
  type AtlasResearchWireOutputShape,
  type AtlasResearchWireRequestFacts,
} from "@/lib/atlas-research-fetch-boundary";

import {
  type BatchRef,
  type BudgetStore,
  type CandidateClassification,
  type ControllerAssignmentRecoveryView,
  type ControllerAssignmentView,
  hashProviderOutput,
} from "./ledger";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const REGISTRY_SCHEMA_VERSION = 2 as const;
export const ATLAS_CONTROLLER_ROLLING_PRICE_MAX_AGE_MS = 15 * 60 * 1_000;

export interface AtlasControllerCandidateContract {
  attestationId: string;
  attestationHash: string;
  /** Maximum semantic full-question outputs that the frozen parser can expose. */
  candidatesPerCompletion: number;
  parserArtifactHash: string;
}

export interface AtlasControllerDerivationContract {
  contractId: string;
  artifactHash: string;
  allowedParentEntryIds: string[];
}

export interface AtlasControllerWireContract {
  endpointHash: string;
  requestMode: "exact" | "derived";
  wireBodyHash: string | null;
  wirePromptHash: string | null;
  wireSchemaHash: string | null;
  outputShape: AtlasResearchWireOutputShape;
  structurallyFixedOutputsPerCompletion: number | null;
  completionCount: number;
  maxOutputTokens: number;
  /** Frozen upper bound for exact or parent-derived serialized request bytes. */
  maxRequestBodyUtf8Bytes: number;
  derivationContract: AtlasControllerDerivationContract | null;
}

export interface AtlasControllerPricingContract {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  safetyMultiplier: number;
  serverTokenOverheadUpperBound: number;
  currency: "USD";
  proofKind: "maximum-allowed-provider-list-price";
  priceSnapshotId: string;
  priceSnapshotHash: string;
  providerAllowlistHash: string;
  /**
   * Schema-v2 price proofs bind the exact OpenRouter endpoint tag admitted by
   * the request route.  These fields are optional only for archived v1
   * registries; new campaign materializers must emit v2.
   */
  proofSchemaVersion?: 1 | 2;
  exactRouteTag?: string;
  exactRouteRateHash?: string;
  exactRouteInputUsdPer1M?: number;
  exactRouteOutputUsdPer1M?: number;
  exactRouteProvider?: string;
  servedModelAllowlistHash?: string;
  emergencyInputUsdPer1M?: number;
  emergencyOutputUsdPer1M?: number;
  validAt: string;
  validThrough: string;
  basis: string;
  pricingContractHash: string;
}

export interface AtlasControllerPricingModelProof {
  maxInputUsdPer1M: number;
  maxOutputUsdPer1M: number;
  providerAllowlistHash: string;
  exactRouteTag?: string;
  exactRouteRateHash?: string;
  exactRouteInputUsdPer1M?: number;
  exactRouteOutputUsdPer1M?: number;
  emergencyInputUsdPer1M?: number;
  emergencyOutputUsdPer1M?: number;
  exactRouteProvider?: string;
  servedModelAllowlist?: readonly string[];
  servedModelAllowlistHash?: string;
}

export interface AtlasControllerPricingSnapshotProof {
  schemaVersion: 1 | 2;
  snapshotHash: string;
  fetchedAt: string;
  models: Readonly<Record<string, AtlasControllerPricingModelProof>>;
}

/**
 * Fresh, replaceable pricing evidence used only for lease-time admission. It
 * never changes the frozen registry, assignment envelope, or durable batch.
 */
export interface AtlasControllerRollingPricingAttestation {
  schemaVersion: "atlas-controller-rolling-pricing-attestation-v1";
  priceSnapshotId: string;
  snapshot: unknown;
  validThrough: string;
  attestationHash: string;
}

export interface AtlasControllerRegistryEntry {
  entryHash: string;
  entryId: string;
  purpose: AtlasResearchPurpose;
  candidateProducing: boolean;
  provenance: AtlasResearchProvenance;
  wire: AtlasControllerWireContract;
  candidateContract: AtlasControllerCandidateContract | null;
  pricing: AtlasControllerPricingContract;
  maxUsesPerAssignment: number;
}

export type AtlasControllerRegistryEntryDraft = Omit<AtlasControllerRegistryEntry, "entryHash">;

export interface AtlasControllerAssignmentContract {
  contractId: string;
  envelopeHash: string;
  maxPhysicalCalls: number;
  maxCandidateOutputs: number;
  maxCostUsd: number;
}

export interface AtlasControllerStageTransition {
  transitionId: string;
  fromEntryId: string | null;
  toEntryId: string;
}

export interface AtlasControllerRegistryDraft {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  controllerId: string;
  operationIdPrefix: string;
  experimentId: string;
  phaseId: string;
  batchId: string;
  entries: AtlasControllerRegistryEntryDraft[];
  assignmentContracts: AtlasControllerAssignmentContract[];
  transitions: AtlasControllerStageTransition[];
}

export interface AtlasControllerRegistry
  extends Omit<AtlasControllerRegistryDraft, "entries"> {
  entries: AtlasControllerRegistryEntry[];
  registryHash: string;
}

export interface AtlasControllerParseResult {
  operationId: string;
  producerPhysicalCallId: string;
}

export interface AtlasControllerNoCandidateResult {
  operationId: string;
  failureReason: string;
}

export interface AtlasControllerParsedCandidate {
  physicalCallId: string;
  candidateSlotId: string;
  outputIndex: number;
  outputHash: string;
}

export interface AtlasControllerParserResult {
  disposition: "parsed" | "no_candidate";
  dispositionReason: string;
  /** Include semantically complete questions even if their production schema is invalid. */
  normalizedSemanticCandidates: Array<string | Uint8Array>;
}

export interface AtlasControllerParserImplementation {
  artifactHash: string;
  parseResponseBody: (
    responseBody: string | Uint8Array,
  ) => AtlasControllerParserResult | Promise<AtlasControllerParserResult>;
}

interface LeaseState {
  readonly leaseId: string;
  readonly request: AtlasResearchLeaseRequest;
  readonly entry: AtlasControllerRegistryEntry;
  readonly candidateSlotIds: string[];
  readonly startedAt: number;
  response: AtlasResearchHttpResponseEvidence | null;
  clone: AtlasResearchCloneEvidence | null;
  capturedResponseBody: Uint8Array | null;
  settled: boolean;
  reconciled: boolean;
  classified: boolean;
  parsedCandidates: AtlasControllerParsedCandidate[];
  serial: Promise<void>;
}

function fail(code: string, message: string): never {
  throw new AtlasResearchBoundaryError(code, message);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        // Match the durable ledger's locale-independent Unicode code-point
        // ordering exactly; localeCompare can emit non-canonical JSON.
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID.test(value)) fail("CONTROLLER_REGISTRY_INVALID", `${label} is not a safe identifier`);
}

function assertHash(value: string, label: string): void {
  if (!SHA256.test(value)) fail("CONTROLLER_REGISTRY_INVALID", `${label} is not a lowercase SHA-256`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("CONTROLLER_REGISTRY_INVALID", `${label} must be a positive safe integer`);
  }
}

function pricingMaterial(
  pricing: Omit<AtlasControllerPricingContract, "pricingContractHash">,
): Omit<AtlasControllerPricingContract, "pricingContractHash"> {
  return pricing;
}

function conservativeEntryCostUsd(entry: AtlasControllerRegistryEntryDraft): number {
  const inputUpper =
    (entry.wire.maxRequestBodyUtf8Bytes + entry.pricing.serverTokenOverheadUpperBound) *
    entry.wire.completionCount;
  const outputUpper = entry.wire.maxOutputTokens * entry.wire.completionCount;
  const raw =
    (inputUpper * entry.pricing.inputUsdPer1M +
      outputUpper * entry.pricing.outputUsdPer1M) /
    1_000_000;
  return Math.ceil(raw * entry.pricing.safetyMultiplier * 1e9) / 1e9;
}

function pricingRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function pricingArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} must be a JSON array`);
  }
  return value;
}

function positiveSnapshotRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function assertStrictPricingJson(
  value: unknown,
  label: string,
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} contains a non-finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} contains a non-JSON value`);
  }
  if (ancestors.has(value)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} contains a cycle`);
  }
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} contains a sparse array`);
      }
      assertStrictPricingJson(value[index], `${label}[${index}]`, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} has a non-JSON prototype`);
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail("CONTROLLER_PRICING_PROOF_INVALID", `${label} contains a symbol key`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || descriptor.get || descriptor.set) {
      fail("CONTROLLER_PRICING_PROOF_INVALID", `${label}.${key} is not plain JSON data`);
    }
    assertStrictPricingJson(descriptor.value, `${label}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function deriveAtlasControllerPricingSnapshotProof(
  snapshotId: string,
  input: unknown,
): Readonly<AtlasControllerPricingSnapshotProof> {
  assertStrictPricingJson(input, `pricing snapshot ${snapshotId}`);
  const snapshot = pricingRecord(cloneJson(input), `pricing snapshot ${snapshotId}`);
  if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "unsupported pricing snapshot schemaVersion");
  }
  const schemaVersion = snapshot.schemaVersion as 1 | 2;
  const snapshotHash = snapshot.snapshotSha256;
  if (typeof snapshotHash !== "string") {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot lacks snapshotSha256");
  }
  if (!SHA256.test(snapshotHash)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshotSha256 is invalid");
  }
  const content = { ...snapshot };
  delete content.snapshotSha256;
  if (sha256(JSON.stringify(content)) !== snapshotHash) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot content hash is invalid");
  }
  const fetchedAt = snapshot.fetchedAt;
  if (
    typeof fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(fetchedAt)) ||
    new Date(Date.parse(fetchedAt)).toISOString() !== fetchedAt
  ) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot fetchedAt is not canonical UTC");
  }
  const models: Record<string, AtlasControllerPricingModelProof> = {};
  const modelIds = new Set<string>();
  let exactRouteTag: string | null = null;
  if (schemaVersion === 2) {
    const routing = pricingRecord(snapshot.routingContract, "pricing snapshot routingContract");
    const allowedTags = pricingArray(
      routing.allowedEndpointTags,
      "pricing snapshot allowedEndpointTags",
    );
    if (
      allowedTags.length !== 1 ||
      allowedTags[0] !== "google-vertex/global" ||
      routing.emergencyCeilingScope !== "all-active-model-endpoints"
    ) {
      fail(
        "CONTROLLER_PRICING_PROOF_INVALID",
        "schema-v2 pricing must admit only google-vertex/global and retain an all-active emergency ceiling",
      );
    }
    exactRouteTag = allowedTags[0];
    const dimensions = pricingRecord(
      snapshot.chargeDimensions,
      "pricing snapshot chargeDimensions",
    );
    const expectedDimensions = {
      textInputTokens: "MODELED_BY_PROMPT_RATE",
      textOutputTokens: "MODELED_BY_COMPLETION_RATE",
      cachedInputTokens: "INAPPLICABLE_NO_CACHE",
      reasoningTokens: "INAPPLICABLE_REASONING_DISABLED",
      imageTokens: "INAPPLICABLE_TEXT_ONLY",
      webSearch: "INAPPLICABLE_NO_WEB_PLUGIN",
      fixedRequestFees: "NONE",
      unknownDimensions: "REJECT",
    };
    if (stableJson(dimensions) !== stableJson(expectedDimensions)) {
      fail(
        "CONTROLLER_PRICING_PROOF_INVALID",
        "schema-v2 pricing must explicitly model text charges and mark every other charge dimension inapplicable",
      );
    }
  }
  for (const modelValue of pricingArray(snapshot.models, "pricing snapshot models")) {
    const model = pricingRecord(modelValue, "pricing snapshot model");
    if (typeof model.id !== "string" || !model.id.trim() || modelIds.has(model.id)) {
      fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot model IDs must be unique");
    }
    modelIds.add(model.id);
    const canonicalSlug = schemaVersion === 2 ? model.canonicalSlug : model.id;
    if (typeof canonicalSlug !== "string" || !canonicalSlug.trim()) {
      fail(
        "CONTROLLER_PRICING_PROOF_INVALID",
        "schema-v2 pricing models require a non-empty canonicalSlug",
      );
    }
    const servedModelAllowlist = [...new Set([model.id, canonicalSlug])].sort(
      (left, right) => left < right ? -1 : left > right ? 1 : 0,
    );
    const promptRates: number[] = [];
    const completionRates: number[] = [];
    const providerEndpoints: Array<{
      provider: string;
      endpointName: string;
      contextLength: number | null;
      tag?: string;
    }> = [];
    const exactPromptRates: number[] = [];
    const exactCompletionRates: number[] = [];
    const exactRateRows: unknown[] = [];
    let exactRouteProvider: string | null = null;
    const endpointTags = new Set<string>();
    for (const endpointValue of pricingArray(model.endpointRates, "pricing endpoint rates")) {
      const endpoint = pricingRecord(endpointValue, "pricing endpoint rate");
      if (
        typeof endpoint.provider !== "string" || !endpoint.provider.trim() ||
        typeof endpoint.endpointName !== "string" || !endpoint.endpointName.trim()
      ) {
        fail(
          "CONTROLLER_PRICING_PROOF_INVALID",
          "pricing endpoints require provider and endpointName",
        );
      }
      let tag: string | undefined;
      let active = true;
      if (schemaVersion === 2) {
        if (typeof endpoint.tag !== "string" || !endpoint.tag.trim()) {
          fail("CONTROLLER_PRICING_PROOF_INVALID", "schema-v2 endpoint tag is required");
        }
        tag = endpoint.tag;
        if (endpointTags.has(tag)) {
          fail("CONTROLLER_PRICING_PROOF_INVALID", "schema-v2 endpoint tags must be unique per model");
        }
        endpointTags.add(tag);
        if (endpoint.status !== "active" && endpoint.status !== "inactive") {
          fail(
            "CONTROLLER_PRICING_PROOF_INVALID",
            "schema-v2 endpoint status must be active or inactive",
          );
        }
        active = endpoint.status === "active";
      }
      const endpointDescriptor = {
        provider: endpoint.provider,
        endpointName: endpoint.endpointName,
        contextLength: typeof endpoint.contextLength === "number"
          ? endpoint.contextLength
          : null,
        ...(tag ? { tag } : {}),
      };
      if (schemaVersion === 1 || (active && tag === exactRouteTag)) {
        providerEndpoints.push(endpointDescriptor);
      }
      const prompt = positiveSnapshotRate(endpoint.promptUsdPerToken);
      const completion = positiveSnapshotRate(endpoint.completionUsdPerToken);
      if (active && (prompt === null || completion === null)) {
        fail(
          "CONTROLLER_PRICING_PROOF_INVALID",
          "every active endpoint requires positive finite base prompt and completion rates",
        );
      }
      if (active && prompt !== null) promptRates.push(prompt);
      if (active && completion !== null) completionRates.push(completion);
      const overrides = pricingArray(endpoint.overrides, "pricing endpoint overrides");
      if (schemaVersion === 2 && active && tag === exactRouteTag) {
        exactRouteProvider = endpoint.provider;
        if (prompt !== null) exactPromptRates.push(prompt);
        if (completion !== null) exactCompletionRates.push(completion);
        exactRateRows.push({
          ...endpointDescriptor,
          status: endpoint.status,
          promptUsdPerToken: prompt,
          completionUsdPerToken: completion,
          overrides: stableValue(overrides),
        });
      }
      for (const overrideValue of overrides) {
        const override = pricingRecord(overrideValue, "pricing endpoint override");
        const hasOverridePrompt = Object.prototype.hasOwnProperty.call(
          override,
          "promptUsdPerToken",
        );
        const hasOverrideCompletion = Object.prototype.hasOwnProperty.call(
          override,
          "completionUsdPerToken",
        );
        const overridePrompt = hasOverridePrompt
          ? positiveSnapshotRate(override.promptUsdPerToken)
          : prompt;
        const overrideCompletion = hasOverrideCompletion
          ? positiveSnapshotRate(override.completionUsdPerToken)
          : completion;
        if (
          (hasOverridePrompt && overridePrompt === null) ||
          (hasOverrideCompletion && overrideCompletion === null)
        ) {
          fail(
            "CONTROLLER_PRICING_PROOF_INVALID",
            "override rates must be positive finite numbers; an omitted dimension inherits its base rate",
          );
        }
        if (active && overridePrompt !== null) promptRates.push(overridePrompt);
        if (active && overrideCompletion !== null) completionRates.push(overrideCompletion);
        if (schemaVersion === 2 && active && tag === exactRouteTag) {
          if (overridePrompt !== null) exactPromptRates.push(overridePrompt);
          if (overrideCompletion !== null) exactCompletionRates.push(overrideCompletion);
        }
      }
    }
    if (promptRates.length === 0 || completionRates.length === 0) {
      fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot has no positive endpoint rates");
    }
    if (
      schemaVersion === 2 &&
      (
        exactPromptRates.length === 0 ||
        exactCompletionRates.length === 0 ||
          providerEndpoints.length !== 1 ||
        exactRateRows.length !== 1 ||
        exactRouteProvider === null
      )
    ) {
      fail(
        "CONTROLLER_PRICING_PROOF_INVALID",
        "schema-v2 pricing requires exactly one active google-vertex/global endpoint per model",
      );
    }
    providerEndpoints.sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    const emergencyInputUsdPer1M = Math.max(...promptRates) * 1_000_000;
    const emergencyOutputUsdPer1M = Math.max(...completionRates) * 1_000_000;
    const baseProof: AtlasControllerPricingModelProof = {
      // Reservations deliberately use the all-active emergency ceiling.  The
      // separately hashed exact-route rates prove what was admitted, while a
      // routing regression cannot turn into a silent local cost overrun.
      maxInputUsdPer1M: emergencyInputUsdPer1M,
      maxOutputUsdPer1M: emergencyOutputUsdPer1M,
      providerAllowlistHash: sha256(stableJson(providerEndpoints)),
    };
    models[model.id] = schemaVersion === 1
      ? baseProof
      : {
          ...baseProof,
          exactRouteTag: exactRouteTag!,
          exactRouteRateHash: sha256(stableJson(exactRateRows)),
          exactRouteInputUsdPer1M: Math.max(...exactPromptRates) * 1_000_000,
          exactRouteOutputUsdPer1M: Math.max(...exactCompletionRates) * 1_000_000,
          emergencyInputUsdPer1M,
          emergencyOutputUsdPer1M,
          exactRouteProvider: exactRouteProvider!,
          servedModelAllowlist,
          servedModelAllowlistHash: sha256(stableJson(servedModelAllowlist)),
        };
  }
  if (modelIds.size === 0) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "pricing snapshot contains no models");
  }
  return deepFreeze({ schemaVersion, snapshotHash, fetchedAt, models });
}

export function sealAtlasControllerPricingContract(
  input: Omit<AtlasControllerPricingContract, "pricingContractHash">,
): Readonly<AtlasControllerPricingContract> {
  const copy = cloneJson(input);
  return deepFreeze({ ...copy, pricingContractHash: sha256(stableJson(copy)) });
}

function rollingPricingAttestationMaterial(
  input: Omit<AtlasControllerRollingPricingAttestation, "attestationHash">,
): Omit<AtlasControllerRollingPricingAttestation, "attestationHash"> {
  return input;
}

export function sealAtlasControllerRollingPricingAttestation(input: {
  priceSnapshotId: string;
  snapshot: unknown;
  validThrough: string;
}): Readonly<AtlasControllerRollingPricingAttestation> {
  const material = cloneJson({
    schemaVersion: "atlas-controller-rolling-pricing-attestation-v1" as const,
    ...input,
  });
  return verifyAtlasControllerRollingPricingAttestation({
    ...material,
    attestationHash: sha256(stableJson(material)),
  });
}

export function verifyAtlasControllerRollingPricingAttestation(
  input: AtlasControllerRollingPricingAttestation,
): Readonly<AtlasControllerRollingPricingAttestation> {
  const copy = cloneJson(input);
  if (copy.schemaVersion !== "atlas-controller-rolling-pricing-attestation-v1") {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "unsupported rolling pricing attestation schema");
  }
  if (!SAFE_ID.test(copy.priceSnapshotId)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "rolling priceSnapshotId is not safe");
  }
  if (!SHA256.test(copy.attestationHash)) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "rolling pricing attestation hash is invalid");
  }
  const { attestationHash, ...material } = copy;
  if (sha256(stableJson(rollingPricingAttestationMaterial(material))) !== attestationHash) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "rolling pricing attestation hash mismatches content");
  }
  const proof = deriveAtlasControllerPricingSnapshotProof(
    copy.priceSnapshotId,
    copy.snapshot,
  );
  if (proof.schemaVersion !== 2) {
    fail("CONTROLLER_PRICING_PROOF_INVALID", "rolling pricing requires schema-v2 tag evidence");
  }
  const fetchedAt = Date.parse(proof.fetchedAt);
  const validThrough = Date.parse(copy.validThrough);
  if (
    !Number.isFinite(validThrough) ||
    new Date(validThrough).toISOString() !== copy.validThrough ||
    validThrough <= fetchedAt ||
    validThrough - fetchedAt > ATLAS_CONTROLLER_ROLLING_PRICE_MAX_AGE_MS
  ) {
    fail(
      "CONTROLLER_PRICING_PROOF_INVALID",
      "rolling pricing must use a positive canonical window no longer than 15 minutes",
    );
  }
  return deepFreeze(copy);
}

export function sealAtlasControllerAssignmentContract(
  input: Omit<AtlasControllerAssignmentContract, "envelopeHash">,
): Readonly<AtlasControllerAssignmentContract> {
  const copy = cloneJson(input);
  return deepFreeze({ ...copy, envelopeHash: sha256(stableJson(copy)) });
}

function validateRegistryDraft(draft: AtlasControllerRegistryDraft): void {
  if (draft.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    fail("CONTROLLER_REGISTRY_INVALID", "unsupported controller registry schemaVersion");
  }
  assertSafeId(draft.controllerId, "controllerId");
  assertSafeId(draft.experimentId, "experimentId");
  assertSafeId(draft.phaseId, "phaseId");
  assertSafeId(draft.batchId, "batchId");
  if (!draft.operationIdPrefix || !SAFE_ID.test(`${draft.operationIdPrefix}x`)) {
    fail("CONTROLLER_REGISTRY_INVALID", "operationIdPrefix must form safe operation IDs");
  }
  if (!Array.isArray(draft.entries) || draft.entries.length === 0) {
    fail("CONTROLLER_REGISTRY_INVALID", "controller registry must contain entries");
  }
  if (!Array.isArray(draft.assignmentContracts) || draft.assignmentContracts.length === 0) {
    fail("CONTROLLER_REGISTRY_INVALID", "controller registry requires assignment contracts");
  }
  if (!Array.isArray(draft.transitions) || draft.transitions.length === 0) {
    fail("CONTROLLER_REGISTRY_INVALID", "controller registry requires stage transitions");
  }
  const ids = new Set<string>();
  const exactSemanticContracts = new Map<string, AtlasResearchPurpose>();
  for (const entry of draft.entries) {
    assertSafeId(entry.entryId, "entryId");
    if (ids.has(entry.entryId)) fail("CONTROLLER_REGISTRY_INVALID", "duplicate entryId");
    ids.add(entry.entryId);
    assertPositiveInteger(entry.maxUsesPerAssignment, "maxUsesPerAssignment");
    const shouldProduce = entry.purpose === "candidate";
    if (entry.candidateProducing !== shouldProduce) {
      fail("CONTROLLER_REGISTRY_INVALID", "purpose and candidateProducing disagree");
    }
    assertHash(entry.provenance.promptHash, "provenance.promptHash");
    if (entry.provenance.requestEnvelopeHash !== undefined) {
      assertHash(entry.provenance.requestEnvelopeHash, "provenance.requestEnvelopeHash");
    }
    if (entry.provenance.promptProfileArtifactHash !== undefined) {
      assertHash(
        entry.provenance.promptProfileArtifactHash,
        "provenance.promptProfileArtifactHash",
      );
    }
    for (const [label, value] of [
      ["schemaHash", entry.provenance.schemaHash],
      ["gateHash", entry.provenance.gateHash],
      ["ladderHash", entry.provenance.ladderHash],
      ["policyHash", entry.provenance.policyHash],
    ] as const) {
      if (value !== null) assertHash(value, `provenance.${label}`);
    }
    if (entry.provenance.corpus) {
      assertHash(entry.provenance.corpus.passageHash, "provenance.corpus.passageHash");
    }
    assertHash(entry.wire.endpointHash, "wire.endpointHash");
    if (entry.wire.requestMode === "exact") {
      if (!entry.wire.wireBodyHash || !entry.wire.wirePromptHash) {
        fail("CONTROLLER_REGISTRY_INVALID", "exact wire contract requires body and prompt hashes");
      }
      assertHash(entry.wire.wireBodyHash, "wire.wireBodyHash");
      assertHash(entry.wire.wirePromptHash, "wire.wirePromptHash");
      if (entry.wire.derivationContract !== null) {
        fail("CONTROLLER_REGISTRY_INVALID", "exact wire contract cannot have derivation metadata");
      }
      const semanticKey = stableJson({
        endpointHash: entry.wire.endpointHash,
        wireBodyHash: entry.wire.wireBodyHash,
        wirePromptHash: entry.wire.wirePromptHash,
        model: entry.provenance.effectiveModel,
      });
      const priorPurpose = exactSemanticContracts.get(semanticKey);
      if (priorPurpose !== undefined && priorPurpose !== entry.purpose) {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "an exact wire contract cannot have conflicting candidate capability",
        );
      }
      exactSemanticContracts.set(semanticKey, entry.purpose);
    } else if (entry.wire.requestMode === "derived") {
      if (entry.wire.wireBodyHash !== null || entry.wire.wirePromptHash !== null) {
        fail("CONTROLLER_REGISTRY_INVALID", "derived wire contract cannot predeclare future bytes");
      }
      if (!entry.wire.derivationContract) {
        fail("CONTROLLER_REGISTRY_INVALID", "derived wire contract requires derivation metadata");
      }
      assertSafeId(entry.wire.derivationContract.contractId, "derivationContract.contractId");
      assertHash(entry.wire.derivationContract.artifactHash, "derivationContract.artifactHash");
      if (
        !Array.isArray(entry.wire.derivationContract.allowedParentEntryIds) ||
        entry.wire.derivationContract.allowedParentEntryIds.length === 0 ||
        new Set(entry.wire.derivationContract.allowedParentEntryIds).size !==
          entry.wire.derivationContract.allowedParentEntryIds.length
      ) {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "derived contract requires unique allowed parent entries",
        );
      }
      for (const parentId of entry.wire.derivationContract.allowedParentEntryIds) {
        assertSafeId(parentId, "derivationContract.allowedParentEntryId");
      }
      const semanticKey = stableJson({
        endpointHash: entry.wire.endpointHash,
        derivationContractId: entry.wire.derivationContract.contractId,
        derivationArtifactHash: entry.wire.derivationContract.artifactHash,
        model: entry.provenance.effectiveModel,
      });
      const priorPurpose = exactSemanticContracts.get(semanticKey);
      if (priorPurpose !== undefined && priorPurpose !== entry.purpose) {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "a derived request contract cannot have conflicting candidate capability",
        );
      }
      exactSemanticContracts.set(semanticKey, entry.purpose);
    } else {
      fail("CONTROLLER_REGISTRY_INVALID", "unknown wire request mode");
    }
    if (entry.wire.wireSchemaHash !== null) {
      assertHash(entry.wire.wireSchemaHash, "wire.wireSchemaHash");
    }
    assertPositiveInteger(entry.wire.completionCount, "wire.completionCount");
    assertPositiveInteger(entry.wire.maxOutputTokens, "wire.maxOutputTokens");
    assertPositiveInteger(
      entry.wire.maxRequestBodyUtf8Bytes,
      "wire.maxRequestBodyUtf8Bytes",
    );
    if (
      entry.wire.structurallyFixedOutputsPerCompletion !== null &&
      (!Number.isSafeInteger(entry.wire.structurallyFixedOutputsPerCompletion) ||
        entry.wire.structurallyFixedOutputsPerCompletion <= 0)
    ) {
      fail("CONTROLLER_REGISTRY_INVALID", "fixed output cardinality must be positive");
    }
    if (shouldProduce) {
      if (!entry.candidateContract) {
        fail("CONTROLLER_REGISTRY_INVALID", "candidate entry requires a candidateContract");
      }
      assertSafeId(entry.candidateContract.attestationId, "attestationId");
      assertHash(entry.candidateContract.attestationHash, "attestationHash");
      assertHash(entry.candidateContract.parserArtifactHash, "parserArtifactHash");
      assertPositiveInteger(
        entry.candidateContract.candidatesPerCompletion,
        "candidatesPerCompletion",
      );
      const expectedAttestationHash = sha256(stableJson({
        attestationId: entry.candidateContract.attestationId,
        candidatesPerCompletion: entry.candidateContract.candidatesPerCompletion,
        parserArtifactHash: entry.candidateContract.parserArtifactHash,
      }));
      if (expectedAttestationHash !== entry.candidateContract.attestationHash) {
        fail("CONTROLLER_REGISTRY_INVALID", "candidate attestation hash is not self-verifying");
      }
      if (
        entry.wire.structurallyFixedOutputsPerCompletion !==
        entry.candidateContract.candidatesPerCompletion
      ) {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "candidate contract must use a structurally fixed maximum cardinality",
        );
      }
    } else if (entry.candidateContract !== null) {
      fail("CONTROLLER_REGISTRY_INVALID", "non-candidate entry cannot have candidateContract");
    }
    if (!Number.isFinite(entry.pricing.inputUsdPer1M) || entry.pricing.inputUsdPer1M <= 0) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing.inputUsdPer1M must be positive");
    }
    if (!Number.isFinite(entry.pricing.outputUsdPer1M) || entry.pricing.outputUsdPer1M <= 0) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing.outputUsdPer1M must be positive");
    }
    if (!Number.isFinite(entry.pricing.safetyMultiplier) || entry.pricing.safetyMultiplier <= 1) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing.safetyMultiplier must exceed 1");
    }
    if (
      !Number.isSafeInteger(entry.pricing.serverTokenOverheadUpperBound) ||
      entry.pricing.serverTokenOverheadUpperBound <= 0
    ) {
      fail("CONTROLLER_REGISTRY_INVALID", "server token overhead upper bound must be positive");
    }
    if (
      entry.pricing.currency !== "USD" ||
      entry.pricing.proofKind !== "maximum-allowed-provider-list-price"
    ) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing must use the proved USD maximum-rate contract");
    }
    assertSafeId(entry.pricing.priceSnapshotId, "pricing.priceSnapshotId");
    assertHash(entry.pricing.priceSnapshotHash, "pricing.priceSnapshotHash");
    assertHash(entry.pricing.providerAllowlistHash, "pricing.providerAllowlistHash");
    const pricingProofSchemaVersion = entry.pricing.proofSchemaVersion ?? 1;
    if (pricingProofSchemaVersion !== 1 && pricingProofSchemaVersion !== 2) {
      fail("CONTROLLER_REGISTRY_INVALID", "unsupported pricing proof schema version");
    }
    if (pricingProofSchemaVersion === 2) {
      if (entry.pricing.exactRouteTag !== "google-vertex/global") {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "schema-v2 pricing must bind the exact google-vertex/global route tag",
        );
      }
      assertHash(entry.pricing.exactRouteRateHash ?? "", "pricing.exactRouteRateHash");
      if (
        typeof entry.pricing.exactRouteProvider !== "string" ||
        !entry.pricing.exactRouteProvider.trim()
      ) {
        fail("CONTROLLER_REGISTRY_INVALID", "schema-v2 pricing requires exactRouteProvider");
      }
      assertHash(
        entry.pricing.servedModelAllowlistHash ?? "",
        "pricing.servedModelAllowlistHash",
      );
      for (const [label, value] of [
        ["exactRouteInputUsdPer1M", entry.pricing.exactRouteInputUsdPer1M],
        ["exactRouteOutputUsdPer1M", entry.pricing.exactRouteOutputUsdPer1M],
        ["emergencyInputUsdPer1M", entry.pricing.emergencyInputUsdPer1M],
        ["emergencyOutputUsdPer1M", entry.pricing.emergencyOutputUsdPer1M],
      ] as const) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          fail("CONTROLLER_REGISTRY_INVALID", `pricing.${label} must be positive`);
        }
      }
      if (
        entry.pricing.emergencyInputUsdPer1M! + 1e-12 <
          entry.pricing.exactRouteInputUsdPer1M! ||
        entry.pricing.emergencyOutputUsdPer1M! + 1e-12 <
          entry.pricing.exactRouteOutputUsdPer1M! ||
        entry.pricing.inputUsdPer1M + 1e-12 < entry.pricing.emergencyInputUsdPer1M! ||
        entry.pricing.outputUsdPer1M + 1e-12 < entry.pricing.emergencyOutputUsdPer1M!
      ) {
        fail(
          "CONTROLLER_REGISTRY_INVALID",
          "schema-v2 reserved rates must cover the separate all-active emergency ceiling",
        );
      }
    } else if (
      entry.pricing.exactRouteTag !== undefined ||
      entry.pricing.exactRouteRateHash !== undefined ||
      entry.pricing.exactRouteInputUsdPer1M !== undefined ||
      entry.pricing.exactRouteOutputUsdPer1M !== undefined ||
      entry.pricing.emergencyInputUsdPer1M !== undefined ||
      entry.pricing.emergencyOutputUsdPer1M !== undefined ||
      entry.pricing.exactRouteProvider !== undefined ||
      entry.pricing.servedModelAllowlistHash !== undefined
    ) {
      fail(
        "CONTROLLER_REGISTRY_INVALID",
        "legacy pricing proofs cannot carry unaudited schema-v2 route fields",
      );
    }
    const validAt = Date.parse(entry.pricing.validAt);
    const validThrough = Date.parse(entry.pricing.validThrough);
    if (
      !Number.isFinite(validAt) ||
      new Date(validAt).toISOString() !== entry.pricing.validAt
    ) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing.validAt must be a canonical ISO timestamp");
    }
    if (
      !Number.isFinite(validThrough) ||
      new Date(validThrough).toISOString() !== entry.pricing.validThrough
    ) {
      fail(
        "CONTROLLER_REGISTRY_INVALID",
        "pricing.validThrough must be a canonical ISO timestamp",
      );
    }
    if (validThrough <= validAt || validThrough - validAt > 24 * 60 * 60 * 1_000) {
      fail(
        "CONTROLLER_REGISTRY_INVALID",
        "pricing proof must use a positive validity window no longer than 24 hours",
      );
    }
    if (!entry.pricing.basis.trim() || entry.pricing.basis.length > 500) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing.basis is required");
    }
    assertHash(entry.pricing.pricingContractHash, "pricing.pricingContractHash");
    const { pricingContractHash, ...pricingWithoutHash } = entry.pricing;
    if (sha256(stableJson(pricingMaterial(pricingWithoutHash))) !== pricingContractHash) {
      fail("CONTROLLER_REGISTRY_INVALID", "pricing contract hash does not match content");
    }
  }
  for (const entry of draft.entries) {
    for (const parentId of entry.wire.derivationContract?.allowedParentEntryIds ?? []) {
      if (!ids.has(parentId)) {
        fail("CONTROLLER_REGISTRY_INVALID", "derived contract references an unknown parent entry");
      }
    }
  }
  const assignmentIds = new Set<string>();
  const graphWorstPhysicalCalls = draft.entries.reduce(
    (total, entry) => total + entry.maxUsesPerAssignment,
    0,
  );
  const graphWorstCandidateOutputs = draft.entries.reduce(
    (total, entry) => total + (
      entry.candidateContract
        ? entry.maxUsesPerAssignment *
          entry.candidateContract.candidatesPerCompletion *
          entry.wire.completionCount
        : 0
    ),
    0,
  );
  const graphWorstCostUsd = draft.entries.reduce(
    (total, entry) => total + entry.maxUsesPerAssignment * conservativeEntryCostUsd(entry),
    0,
  );
  for (const contract of draft.assignmentContracts) {
    assertSafeId(contract.contractId, "assignmentContract.contractId");
    if (assignmentIds.has(contract.contractId)) {
      fail("CONTROLLER_REGISTRY_INVALID", "duplicate assignment contract ID");
    }
    assignmentIds.add(contract.contractId);
    assertPositiveInteger(contract.maxPhysicalCalls, "assignmentContract.maxPhysicalCalls");
    assertPositiveInteger(contract.maxCandidateOutputs, "assignmentContract.maxCandidateOutputs");
    if (!Number.isFinite(contract.maxCostUsd) || contract.maxCostUsd <= 0) {
      fail("CONTROLLER_REGISTRY_INVALID", "assignmentContract.maxCostUsd must be positive");
    }
    assertHash(contract.envelopeHash, "assignmentContract.envelopeHash");
    const { envelopeHash, ...envelope } = contract;
    if (sha256(stableJson(envelope)) !== envelopeHash) {
      fail("CONTROLLER_REGISTRY_INVALID", "assignment envelope hash does not match content");
    }
    if (
      contract.maxPhysicalCalls < graphWorstPhysicalCalls ||
      contract.maxCandidateOutputs < graphWorstCandidateOutputs ||
      contract.maxCostUsd + 1e-12 < graphWorstCostUsd
    ) {
      fail(
        "CONTROLLER_REGISTRY_INVALID",
        "assignment envelope is smaller than the registry graph's frozen worst case",
      );
    }
  }
  const transitionIds = new Set<string>();
  const transitionKeys = new Set<string>();
  for (const transition of draft.transitions) {
    assertSafeId(transition.transitionId, "transitionId");
    if (transitionIds.has(transition.transitionId)) {
      fail("CONTROLLER_REGISTRY_INVALID", "duplicate transition ID");
    }
    transitionIds.add(transition.transitionId);
    if (transition.fromEntryId !== null && !ids.has(transition.fromEntryId)) {
      fail("CONTROLLER_REGISTRY_INVALID", "transition references unknown parent entry");
    }
    if (!ids.has(transition.toEntryId)) {
      fail("CONTROLLER_REGISTRY_INVALID", "transition references unknown child entry");
    }
    const key = `${transition.fromEntryId ?? "ROOT"}->${transition.toEntryId}`;
    if (transitionKeys.has(key)) {
      fail("CONTROLLER_REGISTRY_INVALID", "ambiguous duplicate stage transition");
    }
    transitionKeys.add(key);
  }
  for (const entryId of ids) {
    if (!draft.transitions.some((transition) => transition.toEntryId === entryId)) {
      fail("CONTROLLER_REGISTRY_INVALID", `entry ${entryId} has no admitted transition`);
    }
  }
}

export function sealAtlasControllerRegistry(
  input: AtlasControllerRegistryDraft,
): Readonly<AtlasControllerRegistry> {
  const draft = cloneJson(input);
  validateRegistryDraft(draft);
  const entries = draft.entries.map((entry) => ({
    ...entry,
    entryHash: sha256(stableJson(entry)),
  }));
  const sealedDraft = { ...draft, entries };
  return deepFreeze({
    ...sealedDraft,
    registryHash: sha256(stableJson(sealedDraft)),
  });
}

export function verifyAtlasControllerRegistry(
  input: AtlasControllerRegistry,
): Readonly<AtlasControllerRegistry> {
  const copy = cloneJson(input);
  const { registryHash, ...sealedDraft } = copy;
  const draft: AtlasControllerRegistryDraft = {
    ...sealedDraft,
    entries: sealedDraft.entries.map(({ entryHash, ...entry }) => {
      assertHash(entryHash, "entryHash");
      if (sha256(stableJson(entry)) !== entryHash) {
        fail("CONTROLLER_ENTRY_HASH_MISMATCH", "controller entry hash does not match content");
      }
      return entry;
    }),
  };
  validateRegistryDraft(draft);
  assertHash(registryHash, "registryHash");
  if (sha256(stableJson(sealedDraft)) !== registryHash) {
    fail("CONTROLLER_REGISTRY_HASH_MISMATCH", "controller registry hash does not match content");
  }
  return deepFreeze(copy);
}

function requestMaxOutputTokens(request: Readonly<AtlasResearchWireRequestFacts>): number {
  const values = [
    request.maxTokens,
    request.maxCompletionTokens,
    request.maxOutputTokens,
  ].filter((value): value is number => value !== null);
  if (values.length === 0 || new Set(values).size !== 1) {
    fail("CONTROLLER_OUTPUT_CAP_REQUIRED", "exactly one effective output-token cap is required");
  }
  return values[0];
}

function sameProvenance(left: AtlasResearchProvenance, right: AtlasResearchProvenance): boolean {
  return stableJson(left) === stableJson(right);
}

function sameDerivedProvenanceTemplate(
  template: AtlasResearchProvenance,
  actual: AtlasResearchProvenance,
): boolean {
  const templateRest = { ...template, promptHash: undefined };
  const actualRest = { ...actual, promptHash: undefined };
  return stableJson(templateRest) === stableJson(actualRest);
}

function operationKey(label: string, ...parts: string[]): string {
  return `ctrl:${label}:${sha256(parts.join("\u001f")).slice(0, 32)}`;
}

function boundedReason(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f]+/g, " ").trim();
  return (normalized || "unspecified_no_candidate").slice(0, 500);
}

export function validateAtlasControllerSchemaV2RouterMetadata(
  responseBody: Uint8Array,
  requestedModel: string,
  proof?: {
    allowedServedModels: readonly string[];
    expectedProvider: string;
  },
): string | null {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(responseBody));
  } catch {
    return "router_metadata_provider_envelope_not_json";
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "router_metadata_provider_envelope_not_object";
  }
  const envelope = body as Record<string, unknown>;
  const metadata = envelope.openrouter_metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "router_metadata_missing";
  }
  const route = metadata as Record<string, unknown>;
  if (
    route.requested !== requestedModel ||
    route.strategy !== "direct" ||
    route.attempt !== 1 ||
    route.is_byok !== false
  ) {
    return "router_metadata_direct_contract_mismatch";
  }
  const endpoints = route.endpoints;
  const available = endpoints && typeof endpoints === "object" && !Array.isArray(endpoints)
    ? (endpoints as Record<string, unknown>).available
    : null;
  if (!Array.isArray(available)) return "router_metadata_available_endpoints_missing";
  const selected = available.filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).selected === true,
  );
  if (selected.length !== 1) {
    return "router_metadata_selected_endpoint_cardinality_mismatch";
  }
  const selectedProvider = selected[0].provider;
  const expectedProvider = proof?.expectedProvider;
  if (
    typeof selectedProvider !== "string" ||
    !selectedProvider ||
    selected[0].model !== requestedModel ||
    envelope.provider !== selectedProvider ||
    (expectedProvider !== undefined && selectedProvider !== expectedProvider)
  ) {
    return "router_metadata_selected_provider_or_model_mismatch";
  }

  const servedModel = envelope.model;
  const allowedServedModels = proof?.allowedServedModels ?? [requestedModel];
  if (
    typeof servedModel !== "string" ||
    !allowedServedModels.includes(servedModel)
  ) {
    return "router_metadata_served_model_mismatch";
  }

  // `attempt` above is mandatory and proves the successful attempt count.
  // The detailed `attempts` array is optional; when present it must strengthen,
  // never weaken, the direct one-attempt/provider/model/status evidence.
  const attempts = route.attempts;
  if (attempts !== undefined) {
    if (!Array.isArray(attempts) || attempts.length !== 1) {
      return "router_metadata_attempts_invalid";
    }
    const attempt = attempts[0];
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) {
      return "router_metadata_attempts_invalid";
    }
    const attemptRecord = attempt as Record<string, unknown>;
    const status = attemptRecord.status;
    if (
      attemptRecord.provider !== selectedProvider ||
      attemptRecord.model !== requestedModel ||
      typeof status !== "number" ||
      status < 200 ||
      status >= 300
    ) {
      return "router_metadata_attempts_invalid";
    }
  }
  return null;
}

export class DurableAtlasResearchController implements AtlasResearchFetchController {
  readonly controllerId: string;

  private readonly store: BudgetStore;
  private readonly ref: BatchRef;
  private readonly registry: Readonly<AtlasControllerRegistry>;
  private readonly leases = new Map<string, LeaseState>();
  private readonly operationCalls = new Map<string, string[]>();
  private readonly trackedCloneObservations = new Set<Promise<unknown>>();
  private trackedObservationFailure: unknown = null;
  private readonly parsers = new Map<string, AtlasControllerParserImplementation>();
  private readonly pricingSnapshots = new Map<string, AtlasControllerPricingSnapshotProof>();
  private readonly rollingPricingAttestation:
    Readonly<AtlasControllerRollingPricingAttestation> | null;
  private readonly rollingPricingProof: Readonly<AtlasControllerPricingSnapshotProof> | null;
  private readonly assignmentsByOperation = new Map<string, ControllerAssignmentView>();
  private readonly now: () => number;
  private readonly executionAuthority: () => void;

  constructor(options: {
    store: BudgetStore;
    registry: AtlasControllerRegistry;
    parsers: Record<string, AtlasControllerParserImplementation>;
    /** Archived raw OpenRouter snapshot objects, keyed by frozen priceSnapshotId. */
    pricingSnapshots: Record<string, unknown>;
    /** Fresh lease-time proof; does not mutate the frozen registry or batch. */
    rollingPricingAttestation?: AtlasControllerRollingPricingAttestation;
    /** Test seam only; production callers should use the default wall clock. */
    now?: () => number;
    /** Revalidates credential, authorization head, cost, and expiry at mutation boundaries. */
    executionAuthority?: () => void;
  }) {
    this.store = options.store;
    this.registry = verifyAtlasControllerRegistry(options.registry);
    this.controllerId = this.registry.controllerId;
    this.ref = {
      experimentId: this.registry.experimentId,
      phaseId: this.registry.phaseId,
      batchId: this.registry.batchId,
    };
    this.now = options.now ?? Date.now;
    this.executionAuthority = options.executionAuthority ?? (() => {});
    this.rollingPricingAttestation = options.rollingPricingAttestation
      ? verifyAtlasControllerRollingPricingAttestation(options.rollingPricingAttestation)
      : null;
    this.rollingPricingProof = this.rollingPricingAttestation
      ? deriveAtlasControllerPricingSnapshotProof(
          this.rollingPricingAttestation.priceSnapshotId,
          this.rollingPricingAttestation.snapshot,
        )
      : null;
    for (const [snapshotId, snapshot] of Object.entries(options.pricingSnapshots)) {
      assertSafeId(snapshotId, "pricingSnapshotId");
      this.pricingSnapshots.set(
        snapshotId,
        deriveAtlasControllerPricingSnapshotProof(snapshotId, snapshot),
      );
    }
    for (const [parserId, parser] of Object.entries(options.parsers)) {
      assertSafeId(parserId, "parserId");
      assertHash(parser.artifactHash, "parser.artifactHash");
      if (typeof parser.parseResponseBody !== "function") {
        fail("CONTROLLER_PARSER_INVALID", `parser ${parserId} has no implementation`);
      }
      this.parsers.set(parserId, parser);
    }
    for (const entry of this.registry.entries) {
      this.assertPricingSnapshotProof(entry);
      this.assertRollingPricingEnvelope(entry);
      if (!entry.candidateContract) continue;
      const parser = this.parsers.get(entry.candidateContract.attestationId);
      if (!parser || parser.artifactHash !== entry.candidateContract.parserArtifactHash) {
        fail(
          "CONTROLLER_PARSER_INVALID",
          `candidate entry ${entry.entryId} lacks its exact frozen parser artifact`,
        );
      }
    }
    const { registryHash, ...registryContent } = this.registry;
    this.store.registerControllerRegistry(
      {
        idempotencyKey: operationKey("register-registry", registryHash),
        registryHash,
        registryContentJson: stableJson(registryContent),
        entries: this.registry.entries.map(({ entryHash, ...entry }) => ({
          entryId: entry.entryId,
          entryHash,
          entryContentJson: stableJson(entry),
        })),
      },
      { apply: true },
    );
    for (const recovery of this.store.getControllerAssignmentsForRegistry(registryHash)) {
      this.hydrateAssignment(recovery);
    }
  }

  private assertPricingSnapshotProof(entry: AtlasControllerRegistryEntry): void {
    const proof = this.pricingSnapshots.get(entry.pricing.priceSnapshotId);
    const model = proof?.models[entry.provenance.effectiveModel];
    const proofVersion = entry.pricing.proofSchemaVersion ?? 1;
    const v2Mismatch = proofVersion === 2 && (
      proof?.schemaVersion !== 2 ||
      model?.exactRouteTag !== entry.pricing.exactRouteTag ||
      model?.exactRouteRateHash !== entry.pricing.exactRouteRateHash ||
      model?.exactRouteInputUsdPer1M !== entry.pricing.exactRouteInputUsdPer1M ||
      model?.exactRouteOutputUsdPer1M !== entry.pricing.exactRouteOutputUsdPer1M ||
      model?.exactRouteProvider !== entry.pricing.exactRouteProvider ||
      model?.servedModelAllowlistHash !== entry.pricing.servedModelAllowlistHash ||
      model?.emergencyInputUsdPer1M !== entry.pricing.emergencyInputUsdPer1M ||
      model?.emergencyOutputUsdPer1M !== entry.pricing.emergencyOutputUsdPer1M
    );
    if (
      !proof ||
      !model ||
      (proofVersion === 1 && proof.schemaVersion !== 1) ||
      v2Mismatch ||
      proof.snapshotHash !== entry.pricing.priceSnapshotHash ||
      proof.fetchedAt !== entry.pricing.validAt ||
      model.providerAllowlistHash !== entry.pricing.providerAllowlistHash ||
      entry.pricing.inputUsdPer1M + 1e-12 < model.maxInputUsdPer1M ||
      entry.pricing.outputUsdPer1M + 1e-12 < model.maxOutputUsdPer1M
    ) {
      fail(
        "CONTROLLER_PRICING_PROOF_INVALID",
        `pricing contract for ${entry.entryId} is not backed by its archived maximum-rate snapshot`,
      );
    }
  }

  private assertPricingProofCurrent(entry: AtlasControllerRegistryEntry): void {
    const now = this.now();
    if (!Number.isFinite(now)) {
      fail("CONTROLLER_PRICING_PROOF_EXPIRED", "pricing validation clock is not finite");
    }
    if (this.rollingPricingAttestation && this.rollingPricingProof) {
      this.assertRollingPricingEnvelope(entry);
      const validAt = Date.parse(this.rollingPricingProof.fetchedAt);
      const validThrough = Date.parse(this.rollingPricingAttestation.validThrough);
      if (now < validAt || now > validThrough) {
        fail(
          "CONTROLLER_PRICING_PROOF_EXPIRED",
          `rolling pricing proof ${this.rollingPricingAttestation.priceSnapshotId} is outside its validity window`,
        );
      }
      return;
    }
    const validAt = Date.parse(entry.pricing.validAt);
    const validThrough = Date.parse(entry.pricing.validThrough);
    if (now < validAt || now > validThrough) {
      fail(
        "CONTROLLER_PRICING_PROOF_EXPIRED",
        `pricing proof ${entry.pricing.priceSnapshotId} is outside its frozen validity window`,
      );
    }
  }

  private assertRollingPricingEnvelope(entry: AtlasControllerRegistryEntry): void {
    if (!this.rollingPricingProof) return;
    const model = this.rollingPricingProof.models[entry.provenance.effectiveModel];
    if (
      entry.pricing.proofSchemaVersion !== 2 ||
      this.rollingPricingProof.schemaVersion !== 2 ||
      !model ||
      model.exactRouteTag !== entry.pricing.exactRouteTag ||
      model.exactRouteProvider !== entry.pricing.exactRouteProvider ||
      model.servedModelAllowlistHash !== entry.pricing.servedModelAllowlistHash ||
      model.maxInputUsdPer1M - entry.pricing.inputUsdPer1M > 1e-12 ||
      model.maxOutputUsdPer1M - entry.pricing.outputUsdPer1M > 1e-12
    ) {
      fail(
        "CONTROLLER_PRICING_ENVELOPE_EXCEEDED",
        `rolling price for ${entry.entryId} is absent, off-route, or exceeds the frozen envelope`,
      );
    }
  }

  private reconcileDurableGaps(
    initial: ControllerAssignmentRecoveryView,
  ): ControllerAssignmentRecoveryView {
    let changed = false;
    for (const recovered of initial.calls) {
      const terminal = recovered.terminalEvidenceJson
        ? JSON.parse(recovered.terminalEvidenceJson) as Record<string, unknown>
        : null;
      if (terminal && recovered.call.state !== "settled") {
        const terminalKind = String(terminal.terminalKind ?? "");
        const isHttp = terminalKind === "http-response";
        const neverSent = terminalKind === "never-sent";
        const neverSentContradicted = neverSent && Boolean(
          recovered.cloneEvidenceJson || recovered.capturedResponseBody,
        );
        this.store.settleCall(
          {
            idempotencyKey: operationKey("recover-settle", recovered.call.callId),
            callId: recovered.call.callId,
            outcome: isHttp
              ? terminal.ok === true ? "success" : "failed"
              : neverSent && !neverSentContradicted ? "failed" : "unknown",
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            latencyMs: 0,
            usageFinal: neverSent && !neverSentContradicted,
          },
          { apply: true },
        );
        changed = true;
      }
      if (
        recovered.cloneEvidenceJson &&
        !recovered.call.usageFinal &&
        (recovered.call.state === "settled" || terminal !== null)
      ) {
        const clone = JSON.parse(recovered.cloneEvidenceJson) as Record<string, unknown>;
        const promptTokens = typeof clone.promptTokens === "number" ? clone.promptTokens : 0;
        const completionTokens = typeof clone.completionTokens === "number"
          ? clone.completionTokens
          : 0;
        const costUsd = typeof clone.costUsd === "number" ? clone.costUsd : 0;
        const usageFinal =
          clone.parseState === "json" &&
          clone.costState === "reported" &&
          typeof clone.promptTokens === "number" &&
          typeof clone.completionTokens === "number" &&
          typeof clone.costUsd === "number";
        let recoveredProviderRequestId: string | null = null;
        if (recovered.capturedResponseBody) {
          try {
            const raw = JSON.parse(
              new TextDecoder().decode(recovered.capturedResponseBody),
            ) as unknown;
            const rawId = raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>).id
              : null;
            if (
              typeof rawId === "string" && rawId.trim() &&
              typeof clone.generationId === "string" && clone.generationId.trim() &&
              rawId === clone.generationId
            ) {
              recoveredProviderRequestId = rawId;
            }
          } catch {
            // Invalid/missing generation identity is quarantined before parsing.
          }
        }
        this.store.reconcileCallUsage(
          {
            idempotencyKey: operationKey("recover-clone", recovered.call.callId),
            callId: recovered.call.callId,
            inputTokens: promptTokens,
            outputTokens: completionTokens,
            costUsd,
            usageFinal,
            ...(recoveredProviderRequestId
              ? { providerRequestId: recoveredProviderRequestId }
              : {}),
          },
          { apply: true },
        );
        changed = true;
      }
    }
    return changed
      ? this.store.getControllerAssignmentRecovery(initial.assignment.assignmentId)
      : initial;
  }

  private hydrateAssignment(initial: ControllerAssignmentRecoveryView): void {
    const recovery = this.reconcileDurableGaps(initial);
    this.assignmentsByOperation.set(recovery.assignment.operationId, recovery.assignment);
    for (const recovered of recovery.calls) {
      const request = deepFreeze(
        JSON.parse(recovered.contract.requestJson) as AtlasResearchWireRequestFacts,
      );
      const provenance = deepFreeze(
        JSON.parse(recovered.contract.provenanceJson) as AtlasResearchProvenance,
      );
      const entry = this.registry.entries.find(
        (candidate) =>
          candidate.entryId === recovered.contract.controllerEntryId &&
          candidate.entryHash === recovered.contract.controllerEntryHash,
      );
      if (!entry) {
        fail("CONTROLLER_RECOVERY_REJECTED", "durable call references an unknown registry entry");
      }
      const physicalOrdinal = recovered.call.physicalAttemptOrdinal + 1;
      const leaseRequest: AtlasResearchLeaseRequest = deepFreeze({
        operationId: recovered.call.logicalOperationId,
        physicalCallId: recovered.call.callId,
        physicalOrdinal,
        purpose: entry.purpose,
        parentPhysicalCallId: recovered.contract.parentPhysicalCallId ?? null,
        derivationIntent: entry.wire.derivationContract
          ? {
              contractId: entry.wire.derivationContract.contractId,
              artifactHash: entry.wire.derivationContract.artifactHash,
            }
          : null,
        candidateOutputs: recovered.candidateSlots.length,
        provenance,
        request,
      });
      const terminal = recovered.terminalEvidenceJson
        ? JSON.parse(recovered.terminalEvidenceJson) as Record<string, unknown>
        : null;
      const response = terminal?.terminalKind === "http-response"
        ? terminal as unknown as AtlasResearchHttpResponseEvidence
        : null;
      const clone = recovered.cloneEvidenceJson
        ? {
            ...JSON.parse(recovered.cloneEvidenceJson) as Omit<
              AtlasResearchCloneEvidence,
              "capturedResponseBody"
            >,
            capturedResponseBody: null,
          }
        : null;
      const parsedCandidates = recovered.candidateSlots.flatMap((candidate) =>
        candidate.outputHash !== null && candidate.outputIndex !== null
          ? [{
              physicalCallId: recovered.call.callId,
              candidateSlotId: candidate.candidateSlotId,
              outputIndex: candidate.outputIndex,
              outputHash: candidate.outputHash,
            }]
          : [],
      );
      const state: LeaseState = {
        leaseId: `lease:${sha256(`${this.registry.registryHash}:${recovered.call.callId}`).slice(0, 40)}`,
        request: leaseRequest,
        entry,
        candidateSlotIds: recovered.candidateSlots.map((candidate) => candidate.candidateSlotId),
        startedAt: Date.parse(recovered.call.createdAt),
        response,
        clone,
        capturedResponseBody: recovered.capturedResponseBody,
        settled: recovered.call.state === "settled",
        reconciled: recovered.call.usageFinal,
        classified: recovered.candidateSlots.every((candidate) => candidate.state !== "awaiting_result"),
        parsedCandidates,
        serial: Promise.resolve(),
      };
      this.leases.set(recovered.call.callId, state);
      const calls = this.operationCalls.get(recovered.call.logicalOperationId) ?? [];
      calls.push(recovered.call.callId);
      this.operationCalls.set(recovered.call.logicalOperationId, calls);
      if (state.settled && state.response && !state.response.ok && !state.classified) {
        this.classifyNoCandidate(state, `http_status_${state.response.status}`);
      }
      if (state.settled && terminal?.terminalKind === "never-sent" && !state.classified) {
        if (state.clone || state.capturedResponseBody) {
          this.classifyUnknownAfterSend(
            state,
            "recovered_never_sent_contradicted_by_clone_or_body",
          );
          const current = this.assignmentsByOperation.get(state.request.operationId);
          if (current?.state === "open") {
            const quarantined = this.store.quarantineControllerAssignment(
              {
                idempotencyKey: operationKey(
                  "quarantine-recovered-never-sent-contradiction",
                  current.assignmentId,
                  state.request.physicalCallId,
                ),
                assignmentId: current.assignmentId,
                reason: "recovered never-sent terminal contradicted durable clone/body evidence",
              },
              { apply: true },
            );
            this.assignmentsByOperation.set(state.request.operationId, quarantined.value);
          }
        } else {
          this.classifyNoCandidate(state, "recovered_never_sent_proven_zero_candidate");
        }
      }
      if (
        state.settled &&
        ["unknown-after-send", "network-error", "abort"].includes(
          String(terminal?.terminalKind ?? ""),
        ) &&
        !state.classified
      ) {
        this.classifyUnknownAfterSend(
          state,
          "recovered_unknown_after_send_consumes_reserved_max",
        );
      }
      if (
        state.settled &&
        state.response?.ok === true &&
        state.capturedResponseBody &&
        !state.classified
      ) {
        const completion = this.serialized(state, () => this.classifyCapturedResponse(state));
        this.trackInternalCompletion(completion);
      }
      if (
        state.settled &&
        state.response?.ok === true &&
        state.clone &&
        !state.capturedResponseBody &&
        !state.classified
      ) {
        this.quarantineUninspectableSuccess(
          state,
          `recovered_${state.clone.parseState}_successful_response`,
        );
      }
    }
  }

  admitAssignment(input: {
    operationId: string;
    assignmentId: string;
    contractId: string;
  }): ControllerAssignmentView {
    this.executionAuthority();
    assertSafeId(input.operationId, "operationId");
    assertSafeId(input.assignmentId, "assignmentId");
    assertSafeId(input.contractId, "contractId");
    if (!input.operationId.startsWith(this.registry.operationIdPrefix)) {
      fail("CONTROLLER_OPERATION_REJECTED", "assignment operation is outside the frozen prefix");
    }
    const contract = this.registry.assignmentContracts.find(
      (candidate) => candidate.contractId === input.contractId,
    );
    if (!contract) {
      fail("CONTROLLER_ASSIGNMENT_REJECTED", "assignment contract is not frozen in the registry");
    }
    for (const entry of this.registry.entries) this.assertPricingProofCurrent(entry);
    const receipt = this.store.reserveControllerAssignment(
      {
        ...this.ref,
        idempotencyKey: operationKey(
          "reserve-assignment",
          this.registry.registryHash,
          input.assignmentId,
        ),
        assignmentId: input.assignmentId,
        operationId: input.operationId,
        controllerRegistryHash: this.registry.registryHash,
        envelope: contract,
      },
      { apply: true },
    );
    this.assignmentsByOperation.set(input.operationId, receipt.value);
    return receipt.value;
  }

  recoverAssignment(assignmentId: string): ControllerAssignmentRecoveryView {
    return this.store.getControllerAssignmentRecovery(assignmentId);
  }

  private findEntry(
    scope: Pick<
      Readonly<AtlasResearchScope>,
      "operationId" | "purpose" | "provenance" | "parentPhysicalCallId" | "derivationIntent"
    >,
    request: Readonly<AtlasResearchWireRequestFacts>,
  ): AtlasControllerRegistryEntry {
    if (!scope.operationId.startsWith(this.registry.operationIdPrefix)) {
      fail("CONTROLLER_OPERATION_REJECTED", "operationId is outside the frozen batch prefix");
    }
    const maxOutputTokens = requestMaxOutputTokens(request);
    const matches = this.registry.entries.filter((entry) => {
      if (
        entry.purpose !== scope.purpose ||
        entry.candidateProducing !== (scope.purpose === "candidate") ||
        entry.wire.endpointHash !== request.endpointHash ||
        entry.wire.wireSchemaHash !== request.wireSchemaHash ||
        entry.wire.outputShape !== request.outputShape ||
        entry.wire.structurallyFixedOutputsPerCompletion !==
          request.structurallyFixedOutputsPerCompletion ||
        entry.wire.completionCount !== request.completionCount ||
        entry.wire.maxOutputTokens !== maxOutputTokens ||
        request.requestBodyUtf8Bytes > entry.wire.maxRequestBodyUtf8Bytes ||
        entry.provenance.effectiveModel !== request.model
      ) {
        return false;
      }
      if (entry.wire.requestMode === "exact") {
        return (
          sameProvenance(entry.provenance, scope.provenance) &&
          entry.wire.wireBodyHash === request.wireBodyHash &&
          entry.wire.wirePromptHash === request.wirePromptHash &&
          scope.derivationIntent == null
        );
      }
      const intent = scope.derivationIntent;
      const contract = entry.wire.derivationContract;
      if (!intent || !contract || !sameDerivedProvenanceTemplate(entry.provenance, scope.provenance)) {
        return false;
      }
      if (
        intent.contractId !== contract.contractId ||
        intent.artifactHash !== contract.artifactHash ||
        !scope.parentPhysicalCallId
      ) {
        return false;
      }
      const parent = this.leases.get(scope.parentPhysicalCallId);
      if (
        !parent ||
        parent.request.operationId !== scope.operationId ||
        !parent.settled ||
        !contract.allowedParentEntryIds.includes(parent.entry.entryId) ||
        !parent.clone?.responseBodyHash ||
        !parent.capturedResponseBody ||
        hashProviderOutput(parent.capturedResponseBody) !== parent.clone.responseBodyHash
      ) {
        return false;
      }
      return true;
    });
    if (matches.length !== 1) {
      fail(
        "CONTROLLER_REGISTRY_REJECTED",
        matches.length === 0
          ? "wire request has no exact frozen registry entry"
          : "wire request ambiguously matches multiple registry entries",
      );
    }
    return matches[0];
  }

  attestCandidateContract(
    input: AtlasResearchCandidateAttestationRequest,
  ): AtlasResearchCandidateAttestation {
    const entry = this.findEntry(input.scope, input.request);
    if (!entry.candidateContract) {
      fail("CONTROLLER_ATTESTATION_REJECTED", "registry entry is not candidate-producing");
    }
    return { ...entry.candidateContract };
  }

  private conservativeCostUsd(
    entry: AtlasControllerRegistryEntry,
  ): number {
    // Every valid tokenizer token contains at least one encoded byte. Charging
    // the frozen maximum serialized body byte bound as prompt tokens (plus
    // overhead), and multiplying by n, intentionally over-reserves relative to
    // normal chat tokenization. Output max is also per completion.
    return conservativeEntryCostUsd(entry);
  }

  preFetchLease(request: AtlasResearchLeaseRequest): AtlasResearchLease {
    this.executionAuthority();
    assertSafeId(request.operationId, "operationId");
    assertSafeId(request.physicalCallId, "physicalCallId");
    if (request.physicalOrdinal <= 0 || !Number.isSafeInteger(request.physicalOrdinal)) {
      fail("CONTROLLER_LINEAGE_REJECTED", "physicalOrdinal must be one-based and positive");
    }
    if (this.leases.has(request.physicalCallId)) {
      fail("CONTROLLER_REPLAY_REJECTED", "physical call was already leased");
    }
    const assignment = this.assignmentsByOperation.get(request.operationId);
    if (!assignment || assignment.state !== "open") {
      fail(
        "CONTROLLER_ASSIGNMENT_REQUIRED",
        "whole-assignment envelope must be durably admitted before any physical fetch",
      );
    }
    const entry = this.findEntry(request, request.request);
    this.assertPricingProofCurrent(entry);
    const expectedOutputs = entry.candidateContract
      ? entry.candidateContract.candidatesPerCompletion * request.request.completionCount
      : 0;
    if (expectedOutputs !== request.candidateOutputs) {
      fail("CONTROLLER_CANDIDATE_COUNT_REJECTED", "leased candidate count differs from registry");
    }

    if (
      entry.wire.requestMode === "derived" &&
      request.provenance.promptHash !== request.request.wirePromptHash
    ) {
      fail(
        "CONTROLLER_DERIVED_PROVENANCE_UNBOUND",
        "derived provenance must be bound by the trusted boundary to the actual wire prompt",
      );
    }

    let parentCandidateSlotId: string | undefined;
    let parentEntryId: string | null = null;
    let parentState: LeaseState | null = null;
    if (request.parentPhysicalCallId) {
      const parent = this.leases.get(request.parentPhysicalCallId);
      if (!parent || parent.request.operationId !== request.operationId || !parent.settled) {
        fail("CONTROLLER_PARENT_REJECTED", "parent physical call is missing or cross-operation");
      }
      parentState = parent;
      parentEntryId = parent.entry.entryId;
      if (parent.parsedCandidates.length === 1) {
        parentCandidateSlotId = parent.parsedCandidates[0].candidateSlotId;
      }
    }
    const transition = this.registry.transitions.find(
      (candidate) =>
        candidate.fromEntryId === parentEntryId && candidate.toEntryId === entry.entryId,
    );
    if (!transition) {
      fail(
        "CONTROLLER_TRANSITION_REJECTED",
        `frozen stage graph does not admit ${parentEntryId ?? "ROOT"} -> ${entry.entryId}`,
      );
    }
    let derivationReceiptHash: string | null = null;
    if (entry.wire.requestMode === "derived") {
      const contract = entry.wire.derivationContract!;
      const intent = request.derivationIntent;
      const parentResponseBodyHash = parentState?.clone?.responseBodyHash ?? null;
      if (
        !intent ||
        !parentState ||
        !request.parentPhysicalCallId ||
        intent.contractId !== contract.contractId ||
        intent.artifactHash !== contract.artifactHash ||
        !contract.allowedParentEntryIds.includes(parentState.entry.entryId) ||
        !parentResponseBodyHash ||
        !parentState.capturedResponseBody ||
        hashProviderOutput(parentState.capturedResponseBody) !== parentResponseBodyHash
      ) {
        fail(
          "CONTROLLER_DERIVATION_MINT_REJECTED",
          "trusted parent response evidence and frozen derivation intent are required",
        );
      }
      // This receipt never crosses the caller boundary.  It is minted from the
      // durable parent body plus actual child wire facts immediately before the
      // ledger atomically re-verifies the same material and authorizes the call.
      derivationReceiptHash = sha256(stableJson({
        contractId: contract.contractId,
        artifactHash: contract.artifactHash,
        parentPhysicalCallId: request.parentPhysicalCallId,
        parentResponseBodyHash,
        derivedWireBodyHash: request.request.wireBodyHash,
        derivedWirePromptHash: request.request.wirePromptHash,
      }));
    } else if (request.derivationIntent !== null) {
      fail(
        "CONTROLLER_UNEXPECTED_DERIVATION_INTENT",
        "exact registry entries cannot consume a derivation intent",
      );
    }
    const requestJson = stableJson(request.request);
    const provenanceJson = stableJson(request.provenance);

    const begin = this.store.beginCall(
      {
        ...this.ref,
        idempotencyKey: operationKey("lease", this.registry.registryHash, request.physicalCallId),
        callId: request.physicalCallId,
        callKind:
          request.purpose === "candidate" ? "full_question_generation" : request.purpose,
        stage: request.provenance.stage,
        model: request.request.model,
        reservedCostUsd: this.conservativeCostUsd(entry),
        logicalOperationId: request.operationId,
        physicalAttemptOrdinal: request.physicalOrdinal - 1,
        parentCandidateSlotId,
        expectedCandidateOutputs: request.candidateOutputs,
        controller: {
          assignmentId: assignment.assignmentId,
          controllerRegistryHash: this.registry.registryHash,
          controllerEntryId: entry.entryId,
          controllerEntryHash: entry.entryHash,
          transitionId: transition.transitionId,
          entryMaxUsesPerAssignment: entry.maxUsesPerAssignment,
          ...(request.parentPhysicalCallId
            ? { parentPhysicalCallId: request.parentPhysicalCallId }
            : {}),
          requestHash: sha256(requestJson),
          requestJson,
          provenanceHash: sha256(provenanceJson),
          provenanceJson,
          endpointHash: request.request.endpointHash,
          wireBodyHash: request.request.wireBodyHash,
          wirePromptHash: request.request.wirePromptHash,
          wireSchemaHash: request.request.wireSchemaHash,
          canonicalRequestHash: request.request.canonicalRequestHash,
          parserArtifactHash: entry.candidateContract?.parserArtifactHash ?? null,
          derivationContractId: entry.wire.derivationContract?.contractId ?? null,
          derivationReceiptHash,
          pricingContractHash: entry.pricing.pricingContractHash,
          rollingPricingAttestationHash:
            this.rollingPricingAttestation?.attestationHash ?? null,
        },
      },
      { apply: true },
    );
    if (!begin.value.shouldExecute) {
      fail("CONTROLLER_REPLAY_REJECTED", "durable lease already exists");
    }
    const leaseId = `lease:${sha256(`${this.registry.registryHash}:${request.physicalCallId}`).slice(0, 40)}`;
    const state: LeaseState = {
      leaseId,
      request,
      entry,
      candidateSlotIds: [...begin.value.candidateSlotIds],
      startedAt: Date.now(),
      response: null,
      clone: null,
      capturedResponseBody: null,
      settled: false,
      reconciled: false,
      classified: false,
      parsedCandidates: [],
      serial: Promise.resolve(),
    };
    this.leases.set(request.physicalCallId, state);
    const calls = this.operationCalls.get(request.operationId) ?? [];
    calls.push(request.physicalCallId);
    this.operationCalls.set(request.operationId, calls);
    return { leaseId };
  }

  private stateFor(lease: Readonly<AtlasResearchLease>): LeaseState {
    for (const state of this.leases.values()) {
      if (state.leaseId === lease.leaseId) return state;
    }
    fail("CONTROLLER_LEASE_UNKNOWN", "observer lease is unknown");
  }

  private verifyEvidence(
    state: LeaseState,
    evidence: { operationId: string; physicalCallId: string; physicalOrdinal: number },
  ): void {
    if (
      evidence.operationId !== state.request.operationId ||
      evidence.physicalCallId !== state.request.physicalCallId ||
      evidence.physicalOrdinal !== state.request.physicalOrdinal
    ) {
      fail("CONTROLLER_EVIDENCE_MISMATCH", "observer evidence does not match its lease");
    }
  }

  private async serialized<T>(state: LeaseState, action: () => T | Promise<T>): Promise<T> {
    const next = state.serial.then(action);
    state.serial = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async settleResponse(
    state: LeaseState,
    evidence: AtlasResearchHttpResponseEvidence,
  ): Promise<void> {
    if (state.settled) fail("CONTROLLER_DUPLICATE_TERMINAL", "physical call already settled");
    const evidenceJson = stableJson(evidence);
    this.store.recordControllerTerminalEvidence(
      {
        idempotencyKey: operationKey("terminal", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        terminalKind: evidence.terminalKind,
        evidenceJson,
        evidenceHash: sha256(evidenceJson),
      },
      { apply: true },
    );
    this.store.settleCall(
      {
        idempotencyKey: operationKey("response", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        outcome: evidence.ok ? "success" : "failed",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Math.max(0, Date.now() - state.startedAt),
        usageFinal: false,
      },
      { apply: true },
    );
    state.response = evidence;
    state.settled = true;
    if (!evidence.ok && state.candidateSlotIds.length > 0) {
      this.classifyNoCandidate(state, `http_status_${evidence.status}`);
    }
    this.reconcileCloneIfReady(state);
    await this.classifySuccessfulResponseIfReady(state);
  }

  private reconcileCloneIfReady(state: LeaseState): void {
    if (!state.settled || state.reconciled || !state.clone) return;
    const evidence = state.clone;
    const hasFinalUsage =
      evidence.parseState === "json" &&
      evidence.costState === "reported" &&
      evidence.costUsd !== undefined &&
      evidence.promptTokens !== null &&
      evidence.completionTokens !== null;
    const providerRequestId = this.validatedProviderGenerationId(state);
    this.store.reconcileCallUsage(
      {
        idempotencyKey: operationKey("clone", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        inputTokens: evidence.promptTokens ?? 0,
        outputTokens: evidence.completionTokens ?? 0,
        costUsd: evidence.costUsd ?? 0,
        usageFinal: hasFinalUsage,
        ...(providerRequestId ? { providerRequestId } : {}),
      },
      { apply: true },
    );
    state.reconciled = true;
  }

  private validatedProviderGenerationId(state: LeaseState): string | null {
    if (!state.clone || !state.capturedResponseBody) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(state.capturedResponseBody));
    } catch {
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const rawId = (raw as Record<string, unknown>).id;
    const cloneId = state.clone.generationId;
    return typeof rawId === "string" && rawId.trim() &&
      typeof cloneId === "string" && cloneId.trim() && rawId === cloneId
      ? rawId
      : null;
  }

  observeResponse(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchHttpResponseEvidence,
  ): Promise<void> {
    const state = this.stateFor(lease);
    this.verifyEvidence(state, evidence);
    return this.serialized(state, () => this.settleResponse(state, evidence));
  }

  observeError(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchFetchErrorEvidence,
  ): Promise<void> {
    const state = this.stateFor(lease);
    this.verifyEvidence(state, evidence);
    return this.serialized(state, () => {
      if (state.settled) fail("CONTROLLER_DUPLICATE_TERMINAL", "physical call already settled");
      const evidenceJson = stableJson(evidence);
      this.store.recordControllerTerminalEvidence(
        {
          idempotencyKey: operationKey("terminal", state.request.physicalCallId),
          callId: state.request.physicalCallId,
          terminalKind: evidence.terminalKind,
          evidenceJson,
          evidenceHash: sha256(evidenceJson),
        },
        { apply: true },
      );
      this.store.settleCall(
        {
          idempotencyKey: operationKey("fetch-error", state.request.physicalCallId),
          callId: state.request.physicalCallId,
          outcome: "failed",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: Math.max(0, Date.now() - state.startedAt),
          usageFinal: false,
        },
        { apply: true },
      );
      state.settled = true;
      if (state.candidateSlotIds.length > 0) {
        this.classifyUnknownAfterSend(
          state,
          `${evidence.terminalKind}_${evidence.errorName}_delivery_ambiguous`,
        );
      }
    });
  }

  observeClone(
    lease: Readonly<AtlasResearchLease>,
    evidence: AtlasResearchCloneEvidence,
  ): Promise<void> {
    const state = this.stateFor(lease);
    this.verifyEvidence(state, evidence);
    return this.serialized(state, async () => {
      if (state.clone) fail("CONTROLLER_DUPLICATE_CLONE", "clone evidence already recorded");
      const capturedResponseBody = evidence.capturedResponseBody === null
        ? null
        : new Uint8Array(evidence.capturedResponseBody);
      if (
        capturedResponseBody &&
        (
          capturedResponseBody.byteLength > MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES ||
          evidence.responseBodyHash !== hashProviderOutput(capturedResponseBody)
        )
      ) {
        fail(
          "CONTROLLER_CAPTURED_RESPONSE_MISMATCH",
          "trusted clone bytes exceed the bound or differ from their response hash",
        );
      }
      if (
        !capturedResponseBody &&
        !["body-too-large", "clone-error"].includes(evidence.parseState)
      ) {
        fail(
          "CONTROLLER_CAPTURED_RESPONSE_MISSING",
          "hashed clone evidence requires trusted exact response bytes",
        );
      }
      if (capturedResponseBody && evidence.responseBodyHash) {
        this.store.recordControllerResponseBody(
          {
            idempotencyKey: operationKey("response-body", state.request.physicalCallId),
            callId: state.request.physicalCallId,
            responseBodyHash: evidence.responseBodyHash,
            responseBody: capturedResponseBody,
          },
          { apply: true },
        );
      }
      const publicEvidence = { ...evidence };
      delete (publicEvidence as Partial<AtlasResearchCloneEvidence>).capturedResponseBody;
      const evidenceJson = stableJson(publicEvidence);
      this.store.recordControllerCloneEvidence(
        {
          idempotencyKey: operationKey("clone-evidence", state.request.physicalCallId),
          callId: state.request.physicalCallId,
          responseBodyHash: evidence.responseBodyHash,
          evidenceJson,
          evidenceHash: sha256(evidenceJson),
        },
        { apply: true },
      );
      state.clone = { ...evidence, capturedResponseBody: null };
      state.capturedResponseBody = capturedResponseBody;
      this.reconcileCloneIfReady(state);
      await this.classifySuccessfulResponseIfReady(state);
    });
  }

  trackCloneObservation(
    _lease: Readonly<AtlasResearchLease>,
    completion: Promise<void>,
  ): void {
    this.trackInternalCompletion(completion);
  }

  private trackInternalCompletion(completion: Promise<unknown>): void {
    this.trackedCloneObservations.add(completion);
    void completion.then(
      () => this.trackedCloneObservations.delete(completion),
      (error) => {
        if (this.trackedObservationFailure === null) this.trackedObservationFailure = error;
        this.trackedCloneObservations.delete(completion);
      },
    );
  }

  async awaitTrackedCloneObservations(): Promise<void> {
    const results = await Promise.allSettled([...this.trackedCloneObservations]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    if (this.trackedObservationFailure !== null) throw this.trackedObservationFailure;
  }

  private classifyNoCandidate(state: LeaseState, reason: string): void {
    if (state.classified || state.candidateSlotIds.length === 0) return;
    this.store.classifyCandidateCall(
      {
        idempotencyKey: operationKey("classify-none", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        observedParsedOutputCount: 0,
        results: state.candidateSlotIds.map((candidateSlotId) => ({
          candidateSlotId,
          status: "no_candidate" as const,
          failureReason: boundedReason(reason),
        })),
      },
      { apply: true },
    );
    state.classified = true;
  }

  private classifyUnknownAfterSend(
    state: LeaseState,
    reason: string,
    persistParserFailureEvidence = false,
  ): void {
    if (state.classified || state.candidateSlotIds.length === 0) return;
    const bounded = boundedReason(reason);
    const parserArtifactHash = state.entry.candidateContract?.parserArtifactHash;
    const responseBodyHash = state.clone?.responseBodyHash;
    const parserEvidenceMaterial = persistParserFailureEvidence &&
      parserArtifactHash && responseBodyHash
      ? {
          callId: state.request.physicalCallId,
          responseBodyHash,
          parserArtifactHash,
          disposition: "no_candidate" as const,
          dispositionReason: bounded,
          observedOutputCount: 0,
          outputHashes: [] as string[],
        }
      : null;
    this.store.classifyCandidateCall(
      {
        idempotencyKey: operationKey(
          persistParserFailureEvidence ? "classify-parser-failure" : "classify-unknown",
          state.request.physicalCallId,
        ),
        callId: state.request.physicalCallId,
        observedParsedOutputCount: 0,
        results: state.candidateSlotIds.map((candidateSlotId) => ({
          candidateSlotId,
          status: "unknown_after_send" as const,
          failureReason: bounded,
        })),
        ...(parserEvidenceMaterial
          ? {
              controllerParserEvidence: {
                responseBodyHash: parserEvidenceMaterial.responseBodyHash,
                parserArtifactHash: parserEvidenceMaterial.parserArtifactHash,
                disposition: "no_candidate" as const,
                dispositionReason: bounded,
                observedOutputCount: 0,
                outputHashes: [] as string[],
                evidenceHash: sha256(stableJson(parserEvidenceMaterial)),
              },
            }
          : {}),
      },
      { apply: true },
    );
    state.classified = true;
  }

  private quarantineUninspectableSuccess(state: LeaseState, reason: string): void {
    this.classifyUnknownAfterSend(
      state,
      `successful_response_uninspectable_${boundedReason(reason)}`,
    );
    const assignment = this.assignmentsByOperation.get(state.request.operationId);
    if (assignment?.state === "open") {
      const quarantined = this.store.quarantineControllerAssignment(
        {
          idempotencyKey: operationKey(
            "quarantine-uninspectable",
            assignment.assignmentId,
            state.request.physicalCallId,
          ),
          assignmentId: assignment.assignmentId,
          reason:
            `successful candidate response could not be inspected (${boundedReason(reason)}); ` +
            "reserved maximum consumed and replay forbidden",
        },
        { apply: true },
      );
      this.assignmentsByOperation.set(state.request.operationId, quarantined.value);
    }
  }

  private quarantineResponseContractDrift(state: LeaseState, reason: string): void {
    const bounded = boundedReason(reason);
    const parserArtifactHash = state.entry.candidateContract?.parserArtifactHash;
    const responseBodyHash = state.clone?.responseBodyHash;
    if (!parserArtifactHash || !responseBodyHash) {
      fail(
        "CONTROLLER_RESPONSE_CONTRACT_DRIFT",
        "response-contract drift lacks parser/body binding evidence",
      );
    }
    const parserEvidenceMaterial = {
      callId: state.request.physicalCallId,
      responseBodyHash,
      parserArtifactHash,
      disposition: "no_candidate" as const,
      dispositionReason: bounded,
      observedOutputCount: 0,
      outputHashes: [] as string[],
    };
    this.store.classifyCandidateCall(
      {
        idempotencyKey: operationKey(
          "classify-response-contract-drift",
          state.request.physicalCallId,
        ),
        callId: state.request.physicalCallId,
        observedParsedOutputCount: 0,
        results: state.candidateSlotIds.map((candidateSlotId) => ({
          candidateSlotId,
          status: "unknown_after_send" as const,
          failureReason: `successful_response_contract_drift_${bounded}`,
        })),
        controllerParserEvidence: {
          ...parserEvidenceMaterial,
          evidenceHash: sha256(stableJson(parserEvidenceMaterial)),
        },
      },
      { apply: true },
    );
    state.classified = true;
    const assignment = this.assignmentsByOperation.get(state.request.operationId);
    if (assignment?.state === "open") {
      const quarantined = this.store.quarantineControllerAssignment(
        {
          idempotencyKey: operationKey(
            "quarantine-response-contract",
            assignment.assignmentId,
            state.request.physicalCallId,
          ),
          assignmentId: assignment.assignmentId,
          reason:
            `successful response violated the frozen provider envelope (${bounded}); ` +
            "reserved maximum consumed and replay forbidden",
        },
        { apply: true },
      );
      this.assignmentsByOperation.set(state.request.operationId, quarantined.value);
    }
  }

  private async classifySuccessfulResponseIfReady(state: LeaseState): Promise<void> {
    if (
      !state.settled ||
      state.response?.ok !== true ||
      !state.entry.candidateContract ||
      !state.clone ||
      state.classified
    ) {
      return;
    }
    if (state.capturedResponseBody) {
      await this.classifyCapturedResponse(state);
      return;
    }
    this.quarantineUninspectableSuccess(
      state,
      `${state.clone.parseState}_successful_response`,
    );
    fail(
      "CONTROLLER_RESPONSE_UNINSPECTABLE",
      "successful candidate response lacked bounded trusted bytes; assignment quarantined",
    );
  }

  recoverAmbiguousCall(input: {
    physicalCallId: string;
    disposition: "never_sent" | "unknown_after_send";
    reason: string;
  }): void {
    const state = this.leases.get(input.physicalCallId);
    if (!state || state.settled) {
      fail("CONTROLLER_RECOVERY_REJECTED", "call is absent or already terminal");
    }
    const terminalKind = input.disposition === "never_sent"
      ? "never-sent" as const
      : "unknown-after-send" as const;
    const neverSentContradicted = input.disposition === "never_sent" &&
      Boolean(state.clone || state.capturedResponseBody);
    const evidence = {
      operationId: state.request.operationId,
      physicalCallId: state.request.physicalCallId,
      physicalOrdinal: state.request.physicalOrdinal,
      terminalKind,
      recoveryReason: boundedReason(input.reason),
      networkReplayAllowed: false,
    };
    const evidenceJson = stableJson(evidence);
    this.store.recordControllerTerminalEvidence(
      {
        idempotencyKey: operationKey("terminal-recovery", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        terminalKind,
        evidenceJson,
        evidenceHash: sha256(evidenceJson),
      },
      { apply: true },
    );
    this.store.settleCall(
      {
        idempotencyKey: operationKey("settle-recovery", state.request.physicalCallId),
        callId: state.request.physicalCallId,
        outcome: input.disposition === "never_sent" && !neverSentContradicted
          ? "failed"
          : "unknown",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Math.max(0, Date.now() - state.startedAt),
        usageFinal: input.disposition === "never_sent" && !neverSentContradicted,
      },
      { apply: true },
    );
    state.settled = true;
    this.reconcileCloneIfReady(state);
    if (neverSentContradicted) {
      this.classifyUnknownAfterSend(
        state,
        "never_sent_contradicted_by_durable_clone_or_response_body",
      );
      const assignment = this.assignmentsByOperation.get(state.request.operationId);
      if (assignment?.state === "open") {
        const quarantined = this.store.quarantineControllerAssignment(
          {
            idempotencyKey: operationKey(
              "quarantine-never-sent-contradiction",
              assignment.assignmentId,
              state.request.physicalCallId,
            ),
            assignmentId: assignment.assignmentId,
            reason: "never-sent recovery contradicted by durable clone/body evidence",
          },
          { apply: true },
        );
        this.assignmentsByOperation.set(state.request.operationId, quarantined.value);
      }
      fail(
        "CONTROLLER_NEVER_SENT_CONTRADICTION",
        "never-sent recovery contradicted durable response evidence; call is unknown and quarantined",
      );
    } else if (input.disposition === "never_sent") {
      this.classifyNoCandidate(state, "recovered_never_sent_proven_zero_candidate");
    } else {
      this.classifyUnknownAfterSend(state, "recovered_unknown_after_send_consumes_reserved_max");
    }
  }

  async closeAssignment(assignmentId: string): Promise<ControllerAssignmentView> {
    await this.awaitTrackedCloneObservations();
    const recovery = this.store.getControllerAssignmentRecovery(assignmentId);
    const receipt = this.store.closeControllerAssignment(
      {
        idempotencyKey: operationKey("close-assignment", assignmentId),
        assignmentId,
      },
      { apply: true },
    );
    this.assignmentsByOperation.set(recovery.assignment.operationId, receipt.value);
    return receipt.value;
  }

  private quarantineUntrustedCandidateResponse(
    state: LeaseState,
    reason: string,
    code: string,
  ): never {
    if (!state.classified) {
      this.classifyUnknownAfterSend(state, boundedReason(reason), true);
    }
    const assignment = this.assignmentsByOperation.get(state.request.operationId);
    if (assignment?.state === "open") {
      const quarantined = this.store.quarantineControllerAssignment(
        {
          idempotencyKey: operationKey(
            "quarantine-untrusted-response",
            assignment.assignmentId,
            state.request.physicalCallId,
          ),
          assignmentId: assignment.assignmentId,
          reason: boundedReason(reason),
        },
        { apply: true },
      );
      this.assignmentsByOperation.set(state.request.operationId, quarantined.value);
    }
    fail(code, reason);
  }

  private async classifyCapturedResponse(
    producer: LeaseState,
  ): Promise<AtlasControllerParsedCandidate[]> {
    const assignment = this.assignmentsByOperation.get(producer.request.operationId);
    if (!assignment || assignment.state !== "open") {
      fail(
        "CONTROLLER_ASSIGNMENT_QUARANTINED",
        "quarantined/closed assignment evidence cannot re-enter candidate classification",
      );
    }
    if (producer.classified) return [...producer.parsedCandidates];
    if (!producer.settled || producer.response?.ok !== true) {
      fail("CONTROLLER_PARSE_PRODUCER_REJECTED", "parse producer is not a settled successful response");
    }
    if (producer.candidateSlotIds.length === 0) {
      fail("CONTROLLER_PARSE_PRODUCER_REJECTED", "parse producer cannot be classified");
    }
    if (!producer.clone?.responseBodyHash || !producer.capturedResponseBody) {
      fail(
        "CONTROLLER_PARSE_PRODUCER_REJECTED",
        "parse producer has no privately captured durable response body",
      );
    }
    const responseBodyHash = hashProviderOutput(producer.capturedResponseBody);
    if (responseBodyHash !== producer.clone.responseBodyHash) {
      fail(
        "CONTROLLER_PARSE_RESPONSE_MISMATCH",
        "private parser bytes differ from the captured provider response hash",
      );
    }
    if (
      producer.entry.pricing.proofSchemaVersion === 2 &&
      !this.validatedProviderGenerationId(producer)
    ) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        "raw and cloned provider generation IDs are absent, blank, or inconsistent",
        "CONTROLLER_GENERATION_ID_INVALID",
      );
    }
    const archivedPricingProof = this.pricingSnapshots
      .get(producer.entry.pricing.priceSnapshotId)
      ?.models[producer.entry.provenance.effectiveModel];
    const routerMetadataFailure = producer.entry.pricing.proofSchemaVersion === 2
      ? validateAtlasControllerSchemaV2RouterMetadata(
          producer.capturedResponseBody,
          producer.entry.provenance.effectiveModel,
          {
            allowedServedModels: archivedPricingProof?.servedModelAllowlist ?? [],
            expectedProvider: producer.entry.pricing.exactRouteProvider ?? "",
          },
        )
      : null;
    if (routerMetadataFailure) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        `schema-v2 route evidence failed (${routerMetadataFailure})`,
        "CONTROLLER_ROUTER_METADATA_INVALID",
      );
    }
    const candidateContract = producer.entry.candidateContract;
    if (!candidateContract) {
      fail("CONTROLLER_PARSE_PRODUCER_REJECTED", "producer has no candidate parser contract");
    }
    const parser = this.parsers.get(candidateContract.attestationId)!;
    let parsed: AtlasControllerParserResult;
    try {
      parsed = await parser.parseResponseBody(producer.capturedResponseBody);
    } catch (error) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        `frozen parser threw (${error instanceof Error ? error.name : "unknown"})`,
        "CONTROLLER_PARSER_FAILURE",
      );
    }
    if (
      !parsed ||
      !(parsed.disposition === "parsed" || parsed.disposition === "no_candidate") ||
      !Array.isArray(parsed.normalizedSemanticCandidates)
    ) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        "frozen parser returned an invalid disposition",
        "CONTROLLER_PARSER_INVALID_RESULT",
      );
    }
    const reason = boundedReason(parsed.dispositionReason);
    if (
      parsed.disposition === "no_candidate" &&
      reason.startsWith("response_contract_drift_")
    ) {
      this.quarantineResponseContractDrift(producer, reason);
      fail(
        "CONTROLLER_RESPONSE_CONTRACT_DRIFT",
        "successful response violated the frozen one-choice contract; assignment quarantined",
      );
    }
    if (
      (parsed.disposition === "parsed") !==
      (parsed.normalizedSemanticCandidates.length > 0)
    ) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        "parser disposition and semantic candidate count disagree",
        "CONTROLLER_PARSER_INVALID_RESULT",
      );
    }
    const outputs = parsed.normalizedSemanticCandidates.map((output, outputIndex) => ({
      outputIndex,
      outputHash: hashProviderOutput(output),
    }));
    const duplicateOutputHashes =
      new Set(outputs.map((output) => output.outputHash)).size !== outputs.length;
    if (outputs.length > producer.candidateSlotIds.length && duplicateOutputHashes) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        `semantic parser observed ${outputs.length} output(s) beyond the frozen maximum (duplicate hashes also present)`,
        "CONTROLLER_SEMANTIC_OUTPUT_OVERFLOW",
      );
    }
    if (duplicateOutputHashes) {
      this.quarantineUntrustedCandidateResponse(
        producer,
        "parser emitted duplicate semantic candidates",
        "CONTROLLER_PARSER_INVALID_RESULT",
      );
    }
    const results: CandidateClassification[] = producer.candidateSlotIds.map(
      (candidateSlotId, index) =>
        index < outputs.length
          ? {
              candidateSlotId,
              status: "parsed" as const,
              outputIndex: outputs[index].outputIndex,
              outputHash: outputs[index].outputHash,
            }
          : {
              candidateSlotId,
              status: "no_candidate" as const,
              failureReason: outputs.length === 0
                ? reason
                : "fewer_semantic_outputs_than_reserved_maximum",
            },
    );
    const parserEvidenceMaterial = {
      callId: producer.request.physicalCallId,
      responseBodyHash,
      parserArtifactHash: candidateContract.parserArtifactHash,
      disposition: parsed.disposition,
      dispositionReason: reason,
      observedOutputCount: outputs.length,
      outputHashes: outputs.map((output) => output.outputHash),
    };
    const classification = this.store.classifyCandidateCall(
      {
        idempotencyKey: operationKey("classify-parsed", producer.request.physicalCallId),
        callId: producer.request.physicalCallId,
        observedParsedOutputCount: outputs.length,
        results,
        controllerParserEvidence: {
          responseBodyHash,
          parserArtifactHash: candidateContract.parserArtifactHash,
          disposition: parsed.disposition,
          dispositionReason: reason,
          observedOutputCount: outputs.length,
          outputHashes: outputs.map((output) => output.outputHash),
          evidenceHash: sha256(stableJson(parserEvidenceMaterial)),
        },
      },
      { apply: true },
    );
    producer.classified = true;
    producer.parsedCandidates = results.flatMap((result) =>
      result.status === "parsed"
        ? [{
            physicalCallId: producer.request.physicalCallId,
            candidateSlotId: result.candidateSlotId,
            outputIndex: result.outputIndex,
            outputHash: result.outputHash,
          }]
        : [],
    );
    if (classification.value.overflowOutputCount > 0) {
      const operationId = producer.request.operationId;
      const assignment = this.assignmentsByOperation.get(operationId)!;
      const quarantined = this.store.quarantineControllerAssignment(
        {
          idempotencyKey: operationKey("quarantine-overflow", assignment.assignmentId),
          assignmentId: assignment.assignmentId,
          reason:
            `semantic parser observed ${classification.value.overflowOutputCount} output(s) ` +
            "beyond the preregistered structural maximum",
        },
        { apply: true },
      );
      this.assignmentsByOperation.set(operationId, quarantined.value);
      fail(
        "CONTROLLER_SEMANTIC_OUTPUT_OVERFLOW",
        "semantic output exceeded the preregistered maximum; assignment quarantined",
      );
    }
    return [...producer.parsedCandidates];
  }

  async recordOperationParseResult(
    input: AtlasControllerParseResult,
  ): Promise<AtlasControllerParsedCandidate[]> {
    const producer = this.leases.get(input.producerPhysicalCallId);
    if (!producer || producer.request.operationId !== input.operationId) {
      fail("CONTROLLER_PARSE_PRODUCER_REJECTED", "parse producer is absent or cross-operation");
    }
    return this.serialized(producer, () => this.classifyCapturedResponse(producer));
  }

  /**
   * Correlates the value returned by the SDK with the response-bound parser.
   * This accepts normalized semantic values, never reconstructed provider JSON.
   * A caller can therefore identify which already-captured candidate reached
   * production code, but cannot manufacture or replace response evidence.
   */
  async correlateReturnedCandidates(input: {
    operationId: string;
    producerPhysicalCallId: string;
    normalizedSemanticCandidates: Array<string | Uint8Array>;
  }): Promise<AtlasControllerParsedCandidate[]> {
    const producer = this.leases.get(input.producerPhysicalCallId);
    if (!producer || producer.request.operationId !== input.operationId) {
      fail(
        "CONTROLLER_RETURNED_CANDIDATE_PRODUCER_REJECTED",
        "returned candidate producer is absent or cross-operation",
      );
    }
    const parsed = await this.serialized(
      producer,
      () => this.classifyCapturedResponse(producer),
    );
    const returnedHashes = input.normalizedSemanticCandidates.map((value) =>
      hashProviderOutput(value));
    const correlated: AtlasControllerParsedCandidate[] = [];
    let searchFrom = 0;
    for (const returnedHash of returnedHashes) {
      const matchIndex = parsed.findIndex(
        (candidate, index) => index >= searchFrom && candidate.outputHash === returnedHash,
      );
      if (matchIndex < 0) {
        fail(
          "CONTROLLER_RETURNED_CANDIDATE_MISMATCH",
          "SDK-returned semantic candidates are not an ordered subset of the frozen response parser",
        );
      }
      correlated.push(parsed[matchIndex]);
      searchFrom = matchIndex + 1;
    }
    return correlated;
  }

  getParsedCandidatesForOperation(operationId: string): AtlasControllerParsedCandidate[] {
    const calls = this.operationCalls.get(operationId) ?? [];
    return calls.flatMap((physicalCallId) => {
      const state = this.leases.get(physicalCallId);
      return state ? state.parsedCandidates.map((candidate) => ({ ...candidate })) : [];
    });
  }

  finalizeCorrelatedCandidates(input: {
    operationId: string;
    decisions: Array<{
      candidateSlotId: string;
      outcome: "parsed_accepted" | "parsed_rejected";
    }>;
  }): void {
    if (input.decisions.length === 0) return;
    const owned = new Set(
      this.getParsedCandidatesForOperation(input.operationId).map(
        (candidate) => candidate.candidateSlotId,
      ),
    );
    if (
      new Set(input.decisions.map((decision) => decision.candidateSlotId)).size !==
        input.decisions.length ||
      input.decisions.some((decision) => !owned.has(decision.candidateSlotId))
    ) {
      fail(
        "CONTROLLER_GATE_DECISION_REJECTED",
        "gate decisions contain duplicate or cross-operation candidate slots",
      );
    }
    const material = [...input.decisions].sort((left, right) =>
      left.candidateSlotId.localeCompare(right.candidateSlotId));
    this.store.finalizeParsedCandidates(
      {
        idempotencyKey: operationKey(
          "finalize-gate",
          input.operationId,
          stableJson(material),
        ),
        decisions: material,
      },
      { apply: true },
    );
  }

  recordOperationNoCandidate(input: AtlasControllerNoCandidateResult): void {
    const calls = this.operationCalls.get(input.operationId) ?? [];
    for (const physicalCallId of calls) {
      const state = this.leases.get(physicalCallId)!;
      if (state.request.purpose === "candidate" && !state.classified) {
        if (!state.settled) {
          fail("CONTROLLER_PARSE_PENDING", "cannot classify an unresolved physical call");
        }
        if (state.response?.ok === true) {
          fail(
            "CONTROLLER_PARSER_EVIDENCE_REQUIRED",
            "successful responses require response bytes and the frozen semantic parser",
          );
        }
        this.classifyNoCandidate(state, input.failureReason);
      }
    }
  }
}
