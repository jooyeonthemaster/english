import { createHash } from "node:crypto";

import {
  deriveAtlasControllerPricingSnapshotProof,
  sealAtlasControllerAssignmentContract,
  sealAtlasControllerPricingContract,
  sealAtlasControllerRegistry,
  type AtlasControllerPricingContract,
  type AtlasControllerRegistry,
} from "../../harness/atlas-controller";

export const S1_ASSIGNMENT_COUNT = 180 as const;
export const S1_EXACT_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions" as const;
export const S1_EXACT_ROUTE_TAG = "google-vertex/global" as const;
export const S1_PROVIDER_ROUTING = Object.freeze({
  order: Object.freeze([S1_EXACT_ROUTE_TAG]),
  only: Object.freeze([S1_EXACT_ROUTE_TAG]),
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny" as const,
  zdr: true,
});
export const S1_ROOT_STAGE = "question.structured" as const;
export const S1_PRICE_PROOF_MAX_AGE_MS = 15 * 60 * 1_000;
export const S1_GRAMMAR_PROFILES = Object.freeze([
  "G0_CURRENT_CONTROL",
  "G1_FINAL_CHECKLIST_ABLATION",
  "G2_POSITIVE_COMPACT",
  "G3_SITE_CERTIFICATE",
] as const);
export const S1_BLANK_PROFILES = Object.freeze([
  "B0_CURRENT_CONTROL",
  "B1_TYPE_SCOPED_TAIL",
  "B2_POSITIVE_COMPACT",
  "B3_OPTION_INTENT_LEDGER",
] as const);
export const S1_OUTPUT_CAP_BY_TYPE = Object.freeze({
  GRAMMAR_ERROR: 6_000,
  BLANK_INFERENCE: 4_000,
} as const);

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const STANDARD_MODEL = "google/gemini-3.5-flash";
const PREMIUM_MODEL = "google/gemini-3.1-pro-preview";

export type S1Plan = "STANDARD" | "PREMIUM";
export type S1QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
export type S1Difficulty = "INTERMEDIATE" | "KILLER";
export type S1ProfileId =
  | (typeof S1_GRAMMAR_PROFILES)[number]
  | (typeof S1_BLANK_PROFILES)[number];

export interface S1ProfileArtifactManifest {
  schemaVersion: "question-quality-s1-v6-profile-artifact-manifest-v1";
  aliasesAllowed: false;
  profiles: Record<S1ProfileId, string>;
  manifestSha256: string;
}

export interface S1RightsRecord {
  rightsRecordHash: string;
  authorship: "CAMPAIGN_ORIGINAL";
  externalModelProcessingAuthorized: true;
  piiReview: "NO_PII_FOUND";
  passageUtf8Sha256: string;
}

export interface S1ExactWireRow {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  passageToken: string;
  questionType: S1QuestionType;
  profileId: S1ProfileId;
  plan: S1Plan;
  difficulty: S1Difficulty;
  modelId: string;
  endpoint: typeof S1_EXACT_ENDPOINT;
  endpointSha256: string;
  requestEnvelopeSha256: string;
  wireBodySha256: string;
  wireBodyUtf8Bytes: number;
  wirePromptSha256: string;
  wireSchemaSha256: string;
  maxOutputTokens: number;
  completionCount: 1;
  candidateOutputsPerCompletion: 1;
  providerRouting: typeof S1_PROVIDER_ROUTING;
  providerRoutingSha256: string;
  reasoning: { enabled: false; effort: "none"; exclude: true };
  rootStage: typeof S1_ROOT_STAGE;
  promptProfileArtifactHash: string;
  gateArtifactHash: string;
  policyArtifactHash: string;
  runnerVersion: string;
  gitVersion: string;
  rights: S1RightsRecord;
}

export interface S1MaterializationInput {
  schemaVersion: "question-quality-s1-v6-materializer-input-v1.2";
  experimentId: string;
  phaseId: string;
  batchId: string;
  campaignId: string;
  preflightSemanticSha256: string;
  preflightArtifactSha256: string;
  parser: {
    attestationId: string;
    parserArtifactHash: string;
  };
  profileArtifactManifest: S1ProfileArtifactManifest;
  pricing: {
    priceSnapshotId: string;
    snapshot: unknown;
    /** Hash preregistered outside the mutable snapshot object. */
    expectedSnapshotSha256: string;
    validThrough: string;
    safetyMultiplier: number;
    serverTokenOverheadUpperBound: number;
  };
  designAuthorization: {
    status: "BLOCKED_FIXTURE" | "AUTHORIZED";
    authorizationRecordHash: string | null;
  };
  assignments: S1ExactWireRow[];
}

export interface S1MaterializedAssignment {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  operationId: string;
  assignmentContractId: string;
  rootEntryId: string;
  profileId: S1ProfileId;
  questionType: S1QuestionType;
  plan: S1Plan;
  difficulty: S1Difficulty;
  modelId: string;
  rightsRecordHash: string;
  exactWire: {
    endpointSha256: string;
    requestEnvelopeSha256: string;
    wireBodySha256: string;
    wirePromptSha256: string;
    wireSchemaSha256: string;
    wireBodyUtf8Bytes: number;
    providerRoutingSha256: string;
    promptProfileArtifactHash: string;
    routerMetadataHeaderRequired: true;
  };
  conservativeMaxCostUsd: number;
  registry: Readonly<AtlasControllerRegistry>;
}

export interface S1MaterializedCampaignCore {
  schemaVersion: "question-quality-s1-v6-durable-controller-bundle-v1.2";
  status: "DRY_RUN_ONLY_EXECUTION_BLOCKED" | "SEALED_PENDING_LIVE_AUTHORIZATION";
  campaignId: string;
  experimentId: string;
  phaseId: string;
  batchId: string;
  preflightSemanticSha256: string;
  preflightArtifactSha256: string;
  /** Stable across rolling credential/price authorization windows. */
  durableBatchIdentitySha256: string;
  /** Timestamp-free commitment to the rates/cost assumptions the batch reserved. */
  frozenPricingEnvelopeSha256: string;
  designAuthorization: S1MaterializationInput["designAuthorization"];
  credentialPolicy: {
    sourceEnvName: "OPENROUTER_S1_API_KEY";
    genericFallbackAllowed: false;
    providerHardLimitMustEqualLocalCap: true;
    initialZeroUsageRequired: true;
    rollingCampaignUsageAllowedWithinCap: true;
  };
  pricingRefreshPolicy: {
    rollingAttestationRequiredPerRuntime: true;
    frozenEnvelopeMayNeverIncrease: true;
    campaignAndBatchIdentityRemainStable: true;
    maximumAttestationAgeMs: typeof S1_PRICE_PROOF_MAX_AGE_MS;
  };
  transportPolicy: {
    endpoint: typeof S1_EXACT_ENDPOINT;
    endpointSha256: string;
    providerRouting: typeof S1_PROVIDER_ROUTING;
    providerRoutingSha256: string;
    reasoning: { enabled: false; effort: "none"; exclude: true };
    routerMetadataHeader: "X-OpenRouter-Metadata: enabled";
    rawResponseCapturedPrivately: true;
    providerGenerationIdBoundToLedger: true;
    selectedTierTagReturnedByMetadata: false;
  };
  priceProof: {
    schemaVersion: 2;
    priceSnapshotId: string;
    snapshotSha256: string;
    fetchedAt: string;
    validThrough: string;
    maximumAgeMs: typeof S1_PRICE_PROOF_MAX_AGE_MS;
    exactRouteTag: typeof S1_EXACT_ROUTE_TAG;
    admissionBasis: "EXACT_TAG_RATE";
    reservationBasis: "ALL_ACTIVE_ENDPOINT_EMERGENCY_CEILING";
  };
  parser: S1MaterializationInput["parser"];
  profileArtifactManifest: S1ProfileArtifactManifest;
  globalEnvelope: {
    candidateOpportunityCap: typeof S1_ASSIGNMENT_COUNT;
    physicalFetchCap: typeof S1_ASSIGNMENT_COUNT;
    maxCostUsd: number;
    oneDurableBatchOnly: true;
    queueTopUpAllowed: false;
  };
  batchReservation: {
    experimentId: string;
    phaseId: string;
    batchId: string;
    candidateSlots: typeof S1_ASSIGNMENT_COUNT;
    maxProviderCalls: typeof S1_ASSIGNMENT_COUNT;
    maxCostUsd: number;
  };
  experimentRegistryPhase: {
    id: string;
    status: "registered";
    apiCandidateBudget: typeof S1_ASSIGNMENT_COUNT;
    maxPhysicalProviderCalls: typeof S1_ASSIGNMENT_COUNT;
    maxCostUsd: number;
  };
  pricingSnapshots: Record<string, unknown>;
  assignments: S1MaterializedAssignment[];
  safety: {
    registries: typeof S1_ASSIGNMENT_COUNT;
    entriesPerRegistry: 1;
    maxUsesPerEntry: 1;
    maxPhysicalCallsPerAssignment: 1;
    maxCandidateOutputsPerAssignment: 1;
    externalNetworkCallsDuringMaterialization: 0;
    providerCallsDuringMaterialization: 0;
    apiCandidatesConsumedDuringMaterialization: 0;
  };
}

export type S1MaterializedCampaign = Readonly<
  S1MaterializedCampaignCore & { campaignSemanticSha256: string }
>;

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Recursively freezes every JSON-like campaign surface before it becomes a capability input. */
export function deepFreezeS1<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  // A caller can shallow-freeze a parent while leaving its children mutable.
  // Always traverse children; only the freeze operation itself is conditional.
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeS1(child);
  return value;
}

/** Converts an admitted JSON surface to null-prototype-free canonical data. */
function canonicalJsonClone<T>(value: T): T {
  return JSON.parse(stableJson(value)) as T;
}

function snapshotJsonClone<T>(value: T): T {
  // Pricing snapshotSha256 is explicitly defined over JSON.stringify insertion
  // order. Preserve those admitted bytes while still dropping prototypes,
  // accessors, and caller-owned references.
  return JSON.parse(JSON.stringify(value)) as T;
}

export function computeS1DurableBatchIdentitySha256(input: {
  campaignId: string;
  experimentId: string;
  phaseId: string;
  batchId: string;
  preflightSemanticSha256: string;
  preflightArtifactSha256: string;
  parser: S1MaterializationInput["parser"];
  profileArtifactManifest: S1ProfileArtifactManifest;
  designAuthorization: S1MaterializationInput["designAuthorization"];
  assignments: readonly S1MaterializedAssignment[];
  frozenPricingEnvelopeSha256: string;
}): string {
  const durableAssignments = input.assignments.map((assignment) => {
    const { registryHash, entries, ...registry } = assignment.registry;
    void registryHash;
    return {
      ...assignment,
      registry: {
        ...registry,
        entries: entries.map((entry) => {
          const { entryHash, pricing, ...entryCore } = entry;
          const {
            priceSnapshotId,
            priceSnapshotHash,
            validAt,
            validThrough,
            pricingContractHash,
            ...durablePricing
          } = pricing;
          void entryHash;
          void priceSnapshotId;
          void priceSnapshotHash;
          void validAt;
          void validThrough;
          void pricingContractHash;
          return { ...entryCore, pricing: durablePricing };
        }),
      },
    };
  });
  return sha256(stableJson({
    identitySchemaVersion: "question-quality-s1-v6-durable-batch-identity-v1.2",
    ...input,
    assignments: durableAssignments,
  }));
}

function fail(message: string): never {
  throw new Error(`S1_V6_MATERIALIZATION_REJECTED: ${message}`);
}

function assertHash(value: string, label: string): void {
  if (!SHA256.test(value)) fail(`${label} must be a lowercase SHA-256`);
}

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID.test(value)) fail(`${label} is not a safe identifier`);
}

function assertCanonicalUtc(value: string, label: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail(`${label} must be canonical UTC`);
  }
  return time;
}

function conservativeCostUsd(input: {
  requestBytes: number;
  outputTokens: number;
  completionCount: number;
  pricing: Readonly<AtlasControllerPricingContract>;
}): number {
  const inputUpper =
    (input.requestBytes + input.pricing.serverTokenOverheadUpperBound) *
    input.completionCount;
  const outputUpper = input.outputTokens * input.completionCount;
  const raw =
    (inputUpper * input.pricing.inputUsdPer1M +
      outputUpper * input.pricing.outputUsdPer1M) /
    1_000_000;
  return Math.ceil(raw * input.pricing.safetyMultiplier * 1e9) / 1e9;
}

function validateWireRow(row: S1ExactWireRow, expectedOrdinal: number): void {
  if (row.queueOrdinal !== expectedOrdinal) fail("queue ordinals must be contiguous");
  if (row.questionType !== "GRAMMAR_ERROR" && row.questionType !== "BLANK_INFERENCE") {
    fail(`${row.assignmentId} has an unknown questionType`);
  }
  if (row.plan !== "STANDARD" && row.plan !== "PREMIUM") {
    fail(`${row.assignmentId} has an unknown plan`);
  }
  if (row.difficulty !== "INTERMEDIATE" && row.difficulty !== "KILLER") {
    fail(`${row.assignmentId} has an unknown difficulty`);
  }
  assertSafeId(row.assignmentId, "assignmentId");
  assertSafeId(row.assignmentKey, "assignmentKey");
  assertSafeId(row.passageToken, "passageToken");
  assertSafeId(row.profileId, "profileId");
  const allowedProfiles = row.questionType === "GRAMMAR_ERROR"
    ? S1_GRAMMAR_PROFILES
    : S1_BLANK_PROFILES;
  if (!(allowedProfiles as readonly string[]).includes(row.profileId)) {
    fail(`${row.assignmentId} profile is incompatible with its question type`);
  }
  if (row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan !== "STANDARD") {
    fail(`${row.assignmentId} B1 is frozen to STANDARD only`);
  }
  if (row.endpoint !== S1_EXACT_ENDPOINT || row.endpointSha256 !== sha256(S1_EXACT_ENDPOINT)) {
    fail(`${row.assignmentId} endpoint differs from the exact OpenRouter chat endpoint`);
  }
  if (stableJson(row.providerRouting) !== stableJson(S1_PROVIDER_ROUTING)) {
    fail(`${row.assignmentId} provider routing is not exact google-vertex/global-only ZDR`);
  }
  if (row.providerRoutingSha256 !== sha256(stableJson(S1_PROVIDER_ROUTING))) {
    fail(`${row.assignmentId} provider routing hash is invalid`);
  }
  if (
    row.reasoning.enabled !== false ||
    row.reasoning.effort !== "none" ||
    row.reasoning.exclude !== true
  ) {
    fail(`${row.assignmentId} reasoning must be fully disabled`);
  }
  if (
    row.completionCount !== 1 ||
    row.candidateOutputsPerCompletion !== 1 ||
    row.rootStage !== S1_ROOT_STAGE
  ) {
    fail(`${row.assignmentId} must be one exact structured candidate dispatch`);
  }
  if (
    !Number.isSafeInteger(row.wireBodyUtf8Bytes) ||
    row.wireBodyUtf8Bytes <= 0 ||
    !Number.isSafeInteger(row.maxOutputTokens) ||
    row.maxOutputTokens !== S1_OUTPUT_CAP_BY_TYPE[row.questionType]
  ) {
    fail(
      `${row.assignmentId} request/output bounds differ from the frozen ` +
      `${row.questionType} cap ${S1_OUTPUT_CAP_BY_TYPE[row.questionType]}`,
    );
  }
  for (const [label, value] of [
    ["requestEnvelopeSha256", row.requestEnvelopeSha256],
    ["wireBodySha256", row.wireBodySha256],
    ["wirePromptSha256", row.wirePromptSha256],
    ["wireSchemaSha256", row.wireSchemaSha256],
    ["promptProfileArtifactHash", row.promptProfileArtifactHash],
    ["gateArtifactHash", row.gateArtifactHash],
    ["policyArtifactHash", row.policyArtifactHash],
    ["rightsRecordHash", row.rights.rightsRecordHash],
    ["passageUtf8Sha256", row.rights.passageUtf8Sha256],
  ] as const) assertHash(value, `${row.assignmentId}.${label}`);
  const { rightsRecordHash, ...rightsMaterial } = row.rights;
  if (rightsRecordHash !== sha256(stableJson(rightsMaterial))) {
    fail(`${row.assignmentId} rights record hash does not match its content`);
  }
  if (
    row.rights.authorship !== "CAMPAIGN_ORIGINAL" ||
    row.rights.externalModelProcessingAuthorized !== true ||
    row.rights.piiReview !== "NO_PII_FOUND"
  ) {
    fail(`${row.assignmentId} has no original-work, external-processing, PII-free rights closure`);
  }
  const expectedModel = row.plan === "STANDARD" ? STANDARD_MODEL : PREMIUM_MODEL;
  if (row.modelId !== expectedModel) {
    fail(`${row.assignmentId} plan/model mapping differs from the frozen S1 policy`);
  }
  if (!row.runnerVersion.trim() || !row.gitVersion.trim()) {
    fail(`${row.assignmentId} lacks runner/git provenance`);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function expectedPassageCells(questionType: S1QuestionType): string[] {
  const profiles = questionType === "GRAMMAR_ERROR"
    ? S1_GRAMMAR_PROFILES
    : S1_BLANK_PROFILES;
  const cells: string[] = [];
  for (const profile of profiles) {
    const plans: readonly S1Plan[] = profile === "B1_TYPE_SCOPED_TAIL"
      ? ["STANDARD"]
      : ["STANDARD", "PREMIUM"];
    for (const plan of plans) {
      for (const difficulty of ["INTERMEDIATE", "KILLER"] as const) {
        cells.push(`${profile}|${plan}|${difficulty}`);
      }
    }
  }
  return cells.sort();
}

function validateProfileArtifactManifest(manifest: S1ProfileArtifactManifest): void {
  const expectedIds = [...S1_GRAMMAR_PROFILES, ...S1_BLANK_PROFILES].sort();
  const actualIds = Object.keys(manifest.profiles).sort();
  if (
    manifest.schemaVersion !== "question-quality-s1-v6-profile-artifact-manifest-v1" ||
    manifest.aliasesAllowed !== false ||
    stableJson(actualIds) !== stableJson(expectedIds)
  ) {
    fail("profile artifact manifest does not contain the exact authorized profile set");
  }
  assertHash(manifest.manifestSha256, "profileArtifactManifest.manifestSha256");
  const { manifestSha256, ...material } = manifest;
  if (sha256(stableJson(material)) !== manifestSha256) {
    fail("profile artifact manifest hash does not match its content");
  }
  const hashes = Object.values(manifest.profiles);
  for (const [profileId, artifactHash] of Object.entries(manifest.profiles)) {
    assertHash(artifactHash, `profileArtifactManifest.${profileId}`);
  }
  if (new Set(hashes).size !== hashes.length) {
    fail("distinct treatment profile IDs cannot share an artifact hash");
  }
}

function validateFrozenMatrix(
  rows: readonly S1ExactWireRow[],
  profileManifest: S1ProfileArtifactManifest,
): void {
  const passages = new Map<string, {
    questionType: S1QuestionType;
    passageHash: string;
    rightsRecordHash: string;
    cells: string[];
  }>();
  const profileArtifactById = new Map<string, string>();
  for (const row of rows) {
    const existing = passages.get(row.passageToken);
    if (existing) {
      if (
        existing.questionType !== row.questionType ||
        existing.passageHash !== row.rights.passageUtf8Sha256 ||
        existing.rightsRecordHash !== row.rights.rightsRecordHash
      ) {
        fail(`${row.passageToken} has cross-type or inconsistent passage/rights provenance`);
      }
      existing.cells.push(`${row.profileId}|${row.plan}|${row.difficulty}`);
    } else {
      passages.set(row.passageToken, {
        questionType: row.questionType,
        passageHash: row.rights.passageUtf8Sha256,
        rightsRecordHash: row.rights.rightsRecordHash,
        cells: [`${row.profileId}|${row.plan}|${row.difficulty}`],
      });
    }
    const priorProfileArtifact = profileArtifactById.get(row.profileId);
    if (priorProfileArtifact && priorProfileArtifact !== row.promptProfileArtifactHash) {
      fail(`${row.profileId} is bound to inconsistent profile artifact hashes`);
    }
    profileArtifactById.set(row.profileId, row.promptProfileArtifactHash);
    if (profileManifest.profiles[row.profileId] !== row.promptProfileArtifactHash) {
      fail(`${row.profileId} differs from the authorized profile artifact manifest`);
    }
  }
  const passageCounts = countBy(
    [...passages.values()].map((passage) => passage.questionType),
  );
  if (
    passages.size !== 12 ||
    passageCounts.GRAMMAR_ERROR !== 6 ||
    passageCounts.BLANK_INFERENCE !== 6
  ) {
    fail("frozen matrix requires exactly six distinct grammar and six distinct blank passages");
  }
  const passageValues = [...passages.values()];
  if (
    new Set(passageValues.map((row) => row.passageHash)).size !== 12 ||
    new Set(passageValues.map((row) => row.rightsRecordHash)).size !== 12
  ) {
    fail("frozen matrix requires 12 distinct passage hashes and 12 distinct rights hashes");
  }
  for (const questionType of ["GRAMMAR_ERROR", "BLANK_INFERENCE"] as const) {
    const typed = passageValues.filter((row) => row.questionType === questionType);
    if (
      new Set(typed.map((row) => row.passageHash)).size !== 6 ||
      new Set(typed.map((row) => row.rightsRecordHash)).size !== 6
    ) {
      fail(`${questionType} requires six distinct passage and rights hashes`);
    }
  }
  for (const [token, passage] of passages) {
    const actual = [...passage.cells].sort();
    const expected = expectedPassageCells(passage.questionType);
    if (stableJson(actual) !== stableJson(expected)) {
      fail(`${token} does not contain the complete unique frozen profile/plan/difficulty cross`);
    }
  }
  const byType = countBy(rows.map((row) => row.questionType));
  const byPlan = countBy(rows.map((row) => row.plan));
  const byDifficulty = countBy(rows.map((row) => row.difficulty));
  const byProfile = countBy(rows.map((row) => row.profileId));
  if (stableJson(byType) !== stableJson({ BLANK_INFERENCE: 84, GRAMMAR_ERROR: 96 })) {
    fail("frozen matrix type counts differ from GRAMMAR=96/BLANK=84");
  }
  if (stableJson(byPlan) !== stableJson({ PREMIUM: 84, STANDARD: 96 })) {
    fail("frozen matrix plan counts differ from STANDARD=96/PREMIUM=84");
  }
  if (stableJson(byDifficulty) !== stableJson({ INTERMEDIATE: 90, KILLER: 90 })) {
    fail("frozen matrix difficulty counts differ from INTERMEDIATE=90/KILLER=90");
  }
  const expectedProfiles = {
    B0_CURRENT_CONTROL: 24,
    B1_TYPE_SCOPED_TAIL: 12,
    B2_POSITIVE_COMPACT: 24,
    B3_OPTION_INTENT_LEDGER: 24,
    G0_CURRENT_CONTROL: 24,
    G1_FINAL_CHECKLIST_ABLATION: 24,
    G2_POSITIVE_COMPACT: 24,
    G3_SITE_CERTIFICATE: 24,
  };
  if (stableJson(byProfile) !== stableJson(expectedProfiles)) {
    fail("frozen matrix profile counts are incomplete or imbalanced");
  }
  if (rows.some((row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM")) {
    fail("frozen matrix admits no B1 Premium cells");
  }
}

export function materializeS1Campaign(
  input: S1MaterializationInput,
): S1MaterializedCampaign {
  if (input.schemaVersion !== "question-quality-s1-v6-materializer-input-v1.2") {
    fail("unsupported materializer input schema");
  }
  for (const [label, value] of [
    ["experimentId", input.experimentId],
    ["phaseId", input.phaseId],
    ["batchId", input.batchId],
    ["campaignId", input.campaignId],
    ["parser.attestationId", input.parser.attestationId],
    ["priceSnapshotId", input.pricing.priceSnapshotId],
  ] as const) assertSafeId(value, label);
  for (const [label, value] of [
    ["preflightSemanticSha256", input.preflightSemanticSha256],
    ["preflightArtifactSha256", input.preflightArtifactSha256],
    ["parserArtifactHash", input.parser.parserArtifactHash],
  ] as const) assertHash(value, label);
  if (input.designAuthorization.status === "AUTHORIZED") {
    if (!input.designAuthorization.authorizationRecordHash) {
      fail("authorized design requires a self-contained authorization record hash");
    }
    assertHash(
      input.designAuthorization.authorizationRecordHash,
      "authorizationRecordHash",
    );
  } else if (input.designAuthorization.authorizationRecordHash !== null) {
    fail("blocked fixture cannot carry an authorization record");
  }
  validateProfileArtifactManifest(input.profileArtifactManifest);
  const profileArtifactManifest = canonicalJsonClone(input.profileArtifactManifest);
  if (input.assignments.length !== S1_ASSIGNMENT_COUNT) {
    fail(`campaign must contain exactly ${S1_ASSIGNMENT_COUNT} assignments`);
  }
  const assignmentIds = new Set<string>();
  const assignmentKeys = new Set<string>();
  const wireBodies = new Set<string>();
  const requestEnvelopes = new Set<string>();
  input.assignments.forEach((row, index) => {
    validateWireRow(row, index + 1);
    if (assignmentIds.has(row.assignmentId)) fail("duplicate assignmentId");
    if (assignmentKeys.has(row.assignmentKey)) fail("duplicate assignmentKey");
    if (wireBodies.has(row.wireBodySha256)) fail("duplicate exact wire body");
    if (requestEnvelopes.has(row.requestEnvelopeSha256)) fail("duplicate request envelope");
    assignmentIds.add(row.assignmentId);
    assignmentKeys.add(row.assignmentKey);
    wireBodies.add(row.wireBodySha256);
    requestEnvelopes.add(row.requestEnvelopeSha256);
  });
  validateFrozenMatrix(input.assignments, profileArtifactManifest);

  const priceProof = deriveAtlasControllerPricingSnapshotProof(
    input.pricing.priceSnapshotId,
    input.pricing.snapshot,
  );
  assertHash(input.pricing.expectedSnapshotSha256, "pricing.expectedSnapshotSha256");
  if (priceProof.snapshotHash !== input.pricing.expectedSnapshotSha256) {
    fail("tagged price snapshot differs from the externally preregistered hash");
  }
  if (priceProof.schemaVersion !== 2) {
    fail("S1 v6 accepts only tag-bound pricing proof schema v2");
  }
  // Persist exactly the canonical JSON bytes whose hash/proof was admitted;
  // never retain a caller-owned object, getter, proxy, or mutable nested child.
  const pricingSnapshot = snapshotJsonClone(input.pricing.snapshot);
  const validAt = assertCanonicalUtc(priceProof.fetchedAt, "pricing.fetchedAt");
  const validThrough = assertCanonicalUtc(input.pricing.validThrough, "pricing.validThrough");
  if (
    validThrough <= validAt ||
    validThrough - validAt > S1_PRICE_PROOF_MAX_AGE_MS
  ) {
    fail("price proof validity must be positive and no longer than 15 minutes");
  }
  if (
    !Number.isFinite(input.pricing.safetyMultiplier) ||
    input.pricing.safetyMultiplier <= 1 ||
    !Number.isSafeInteger(input.pricing.serverTokenOverheadUpperBound) ||
    input.pricing.serverTokenOverheadUpperBound <= 0
  ) {
    fail("pricing safety multiplier/overhead are invalid");
  }

  const candidateAttestationHash = sha256(stableJson({
    attestationId: input.parser.attestationId,
    candidatesPerCompletion: 1,
    parserArtifactHash: input.parser.parserArtifactHash,
  }));
  const assignments: S1MaterializedAssignment[] = input.assignments.map((row) => {
    const modelProof = priceProof.models[row.modelId];
    if (
      !modelProof ||
      modelProof.exactRouteTag !== S1_EXACT_ROUTE_TAG ||
      !modelProof.exactRouteRateHash ||
      !modelProof.exactRouteInputUsdPer1M ||
      !modelProof.exactRouteOutputUsdPer1M ||
      !modelProof.exactRouteProvider ||
      !modelProof.servedModelAllowlistHash ||
      !modelProof.emergencyInputUsdPer1M ||
      !modelProof.emergencyOutputUsdPer1M
    ) {
      fail(`${row.assignmentId} lacks an exact-tag plus emergency-ceiling price proof`);
    }
    const pricing = sealAtlasControllerPricingContract({
      inputUsdPer1M: modelProof.emergencyInputUsdPer1M,
      outputUsdPer1M: modelProof.emergencyOutputUsdPer1M,
      safetyMultiplier: input.pricing.safetyMultiplier,
      serverTokenOverheadUpperBound: input.pricing.serverTokenOverheadUpperBound,
      currency: "USD",
      proofKind: "maximum-allowed-provider-list-price",
      priceSnapshotId: input.pricing.priceSnapshotId,
      priceSnapshotHash: priceProof.snapshotHash,
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
      validAt: priceProof.fetchedAt,
      validThrough: input.pricing.validThrough,
      basis:
        "Admit exact google-vertex/global tag rate; reserve the separately proved maximum across every active model endpoint as an emergency ceiling.",
    });
    const maxCostUsd = conservativeCostUsd({
      requestBytes: row.wireBodyUtf8Bytes,
      outputTokens: row.maxOutputTokens,
      completionCount: 1,
      pricing,
    });
    const assignmentContractId = `one-call-${String(row.queueOrdinal).padStart(3, "0")}`;
    const assignmentContract = sealAtlasControllerAssignmentContract({
      contractId: assignmentContractId,
      maxPhysicalCalls: 1,
      maxCandidateOutputs: 1,
      maxCostUsd,
    });
    const rootEntryId = `candidate-${String(row.queueOrdinal).padStart(3, "0")}`;
    const operationId =
      `${input.experimentId}:${input.phaseId}:${input.batchId}:${row.assignmentId}`;
    const registry = sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: `s1v6-controller-${String(row.queueOrdinal).padStart(3, "0")}`,
      operationIdPrefix: `${operationId}:`,
      experimentId: input.experimentId,
      phaseId: input.phaseId,
      batchId: input.batchId,
      entries: [{
        entryId: rootEntryId,
        purpose: "candidate",
        candidateProducing: true,
        provenance: {
          requestedModel: row.modelId,
          effectiveModel: row.modelId,
          plan: row.plan,
          stage: row.rootStage,
          promptHash: row.wirePromptSha256,
          requestEnvelopeHash: row.requestEnvelopeSha256,
          promptProfileArtifactHash: row.promptProfileArtifactHash,
          schemaHash: row.wireSchemaSha256,
          gateHash: row.gateArtifactHash,
          ladderHash: null,
          policyHash: row.policyArtifactHash,
          corpus: {
            corpusId: input.campaignId,
            rowId: row.passageToken,
            passageHash: row.rights.passageUtf8Sha256,
          },
          runnerVersion: row.runnerVersion,
          gitVersion: row.gitVersion,
        },
        wire: {
          endpointHash: row.endpointSha256,
          requestMode: "exact",
          wireBodyHash: row.wireBodySha256,
          wirePromptHash: row.wirePromptSha256,
          wireSchemaHash: row.wireSchemaSha256,
          outputShape: "json-schema-object",
          structurallyFixedOutputsPerCompletion: 1,
          completionCount: 1,
          maxOutputTokens: row.maxOutputTokens,
          maxRequestBodyUtf8Bytes: row.wireBodyUtf8Bytes,
          derivationContract: null,
        },
        candidateContract: {
          attestationId: input.parser.attestationId,
          attestationHash: candidateAttestationHash,
          candidatesPerCompletion: 1,
          parserArtifactHash: input.parser.parserArtifactHash,
        },
        pricing,
        maxUsesPerAssignment: 1,
      }],
      assignmentContracts: [assignmentContract],
      transitions: [{
        transitionId: `root-${String(row.queueOrdinal).padStart(3, "0")}`,
        fromEntryId: null,
        toEntryId: rootEntryId,
      }],
    });
    return {
      queueOrdinal: row.queueOrdinal,
      assignmentId: row.assignmentId,
      assignmentKey: row.assignmentKey,
      operationId: `${operationId}:run`,
      assignmentContractId,
      rootEntryId,
      profileId: row.profileId,
      questionType: row.questionType,
      plan: row.plan,
      difficulty: row.difficulty,
      modelId: row.modelId,
      rightsRecordHash: row.rights.rightsRecordHash,
      exactWire: {
        endpointSha256: row.endpointSha256,
        requestEnvelopeSha256: row.requestEnvelopeSha256,
        wireBodySha256: row.wireBodySha256,
        wirePromptSha256: row.wirePromptSha256,
        wireSchemaSha256: row.wireSchemaSha256,
        wireBodyUtf8Bytes: row.wireBodyUtf8Bytes,
        providerRoutingSha256: row.providerRoutingSha256,
        promptProfileArtifactHash: row.promptProfileArtifactHash,
        routerMetadataHeaderRequired: true,
      },
      conservativeMaxCostUsd: maxCostUsd,
      registry,
    };
  });
  const maxCostUsd =
    Math.ceil(assignments.reduce((sum, row) => sum + row.conservativeMaxCostUsd, 0) * 1e9) /
    1e9;
  const frozenPricingEnvelope = {
    envelopeSchemaVersion: "question-quality-s1-v6-frozen-pricing-envelope-v1",
    exactRouteTag: S1_EXACT_ROUTE_TAG,
    currency: "USD",
    safetyMultiplier: input.pricing.safetyMultiplier,
    serverTokenOverheadUpperBound: input.pricing.serverTokenOverheadUpperBound,
    models: [...new Set(input.assignments.map((row) => row.modelId))]
      .sort()
      .map((modelId) => {
        const model = priceProof.models[modelId]!;
        return {
          modelId,
          emergencyInputUsdPer1M: model.emergencyInputUsdPer1M,
          emergencyOutputUsdPer1M: model.emergencyOutputUsdPer1M,
        };
      }),
    globalMaxCostUsd: maxCostUsd,
  } as const;
  const frozenPricingEnvelopeSha256 = sha256(stableJson(frozenPricingEnvelope));
  const durableBatchIdentitySha256 = computeS1DurableBatchIdentitySha256({
    campaignId: input.campaignId,
    experimentId: input.experimentId,
    phaseId: input.phaseId,
    batchId: input.batchId,
    preflightSemanticSha256: input.preflightSemanticSha256,
    preflightArtifactSha256: input.preflightArtifactSha256,
    parser: input.parser,
    profileArtifactManifest,
    designAuthorization: input.designAuthorization,
    assignments,
    frozenPricingEnvelopeSha256,
  });
  const core: S1MaterializedCampaignCore = {
    schemaVersion: "question-quality-s1-v6-durable-controller-bundle-v1.2",
    status: input.designAuthorization.status === "AUTHORIZED"
      ? "SEALED_PENDING_LIVE_AUTHORIZATION"
      : "DRY_RUN_ONLY_EXECUTION_BLOCKED",
    campaignId: input.campaignId,
    experimentId: input.experimentId,
    phaseId: input.phaseId,
    batchId: input.batchId,
    preflightSemanticSha256: input.preflightSemanticSha256,
    preflightArtifactSha256: input.preflightArtifactSha256,
    durableBatchIdentitySha256,
    frozenPricingEnvelopeSha256,
    designAuthorization: input.designAuthorization,
    credentialPolicy: {
      sourceEnvName: "OPENROUTER_S1_API_KEY",
      genericFallbackAllowed: false,
      providerHardLimitMustEqualLocalCap: true,
      initialZeroUsageRequired: true,
      rollingCampaignUsageAllowedWithinCap: true,
    },
    pricingRefreshPolicy: {
      rollingAttestationRequiredPerRuntime: true,
      frozenEnvelopeMayNeverIncrease: true,
      campaignAndBatchIdentityRemainStable: true,
      maximumAttestationAgeMs: S1_PRICE_PROOF_MAX_AGE_MS,
    },
    transportPolicy: {
      endpoint: S1_EXACT_ENDPOINT,
      endpointSha256: sha256(S1_EXACT_ENDPOINT),
      providerRouting: S1_PROVIDER_ROUTING,
      providerRoutingSha256: sha256(stableJson(S1_PROVIDER_ROUTING)),
      reasoning: { enabled: false, effort: "none", exclude: true },
      routerMetadataHeader: "X-OpenRouter-Metadata: enabled",
      rawResponseCapturedPrivately: true,
      providerGenerationIdBoundToLedger: true,
      // OpenRouter's documented metadata identifies selected provider/model,
      // but does not currently promise the service-tier tag. The exact tag is
      // therefore enforced by the request route and tag-bound pricing proof.
      selectedTierTagReturnedByMetadata: false,
    },
    priceProof: {
      schemaVersion: 2,
      priceSnapshotId: input.pricing.priceSnapshotId,
      snapshotSha256: priceProof.snapshotHash,
      fetchedAt: priceProof.fetchedAt,
      validThrough: input.pricing.validThrough,
      maximumAgeMs: S1_PRICE_PROOF_MAX_AGE_MS,
      exactRouteTag: S1_EXACT_ROUTE_TAG,
      admissionBasis: "EXACT_TAG_RATE",
      reservationBasis: "ALL_ACTIVE_ENDPOINT_EMERGENCY_CEILING",
    },
    parser: input.parser,
    profileArtifactManifest,
    globalEnvelope: {
      candidateOpportunityCap: S1_ASSIGNMENT_COUNT,
      physicalFetchCap: S1_ASSIGNMENT_COUNT,
      maxCostUsd,
      oneDurableBatchOnly: true,
      queueTopUpAllowed: false,
    },
    batchReservation: {
      experimentId: input.experimentId,
      phaseId: input.phaseId,
      batchId: input.batchId,
      candidateSlots: S1_ASSIGNMENT_COUNT,
      maxProviderCalls: S1_ASSIGNMENT_COUNT,
      maxCostUsd,
    },
    experimentRegistryPhase: {
      id: input.phaseId,
      status: "registered",
      apiCandidateBudget: S1_ASSIGNMENT_COUNT,
      maxPhysicalProviderCalls: S1_ASSIGNMENT_COUNT,
      maxCostUsd,
    },
    pricingSnapshots: { [input.pricing.priceSnapshotId]: pricingSnapshot },
    assignments,
    safety: {
      registries: S1_ASSIGNMENT_COUNT,
      entriesPerRegistry: 1,
      maxUsesPerEntry: 1,
      maxPhysicalCallsPerAssignment: 1,
      maxCandidateOutputsPerAssignment: 1,
      externalNetworkCallsDuringMaterialization: 0,
      providerCallsDuringMaterialization: 0,
      apiCandidatesConsumedDuringMaterialization: 0,
    },
  };
  return deepFreezeS1({
    ...core,
    campaignSemanticSha256: sha256(stableJson(core)),
  });
}
