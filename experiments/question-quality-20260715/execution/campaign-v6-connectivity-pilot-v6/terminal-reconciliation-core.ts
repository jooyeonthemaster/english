import {
  MAX_PER_RESPONSE_ACTUAL_COST_USD_V6,
  MAX_PER_RESPONSE_USAGE_TOKENS_V6,
  sha256V6,
  stableJsonV6,
  type JsonObject,
  type PilotPlanV6,
} from "./protocol-core";
import type { BillingEvidenceV6 } from "./response-parser";
import type { RawCandidateObservationV6 } from "./strict-json-observer";

const MONEY_SCALE_V6 = 1e12;
export const MAX_RUN_EFFECTIVE_COST_USD_V6 = MAX_PER_RESPONSE_ACTUAL_COST_USD_V6 * 2;
export const MAX_RUN_USAGE_TOKENS_V6 = MAX_PER_RESPONSE_USAGE_TOKENS_V6 * 2;

export interface AssignmentChargeV6 extends JsonObject {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
  reservedCostUsd: number;
  actualKnown: boolean;
  costDisposition: BillingEvidenceV6["costDisposition"];
  manualCostReconciliationRequired: boolean;
  explicitPositiveCostEvidenceHash: string | null;
  usageKnown: boolean;
  actualCostUsd: number | null;
  effectiveCostUsd: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  billingEvidenceHash: string;
  conservativeUnknownBilling: boolean;
  provisionalReservedCostPendingManualReconciliation: boolean;
  observedFullQuestionCandidates: number;
  candidateUnitsEffective: number;
  choiceCardinalityDrift: boolean;
  choiceCardinalityShortage: boolean;
  choiceCardinalityExcess: boolean;
  candidateCardinalityAmbiguous: boolean;
  candidateObservationSaturated: boolean;
  responseCandidateCardinalityUnobservableAfterSend: boolean;
  candidateOverflow: boolean;
  globalCandidateQuarantineRequired: boolean;
  candidateObservationEvidenceHash: string;
}

export interface RunLedgerSettlementV6 extends JsonObject {
  used: number;
  modelCalls: number;
  observedFullQuestionCandidates: number;
  candidateOverflowAssignments: number;
  choiceCardinalityDriftAssignments: number;
  choiceCardinalityShortageAssignments: number;
  choiceCardinalityExcessAssignments: number;
  candidateCardinalityAmbiguousAssignments: number;
  globalCandidateQuarantineRequired: boolean;
  inputTokens: number;
  outputTokens: number;
  actualCostUsd: number;
  effectiveCostUsd: number;
  actualCostKnownAssignments: number;
  usageKnownAssignments: number;
  conservativeUnknownBillingAssignments: number;
  manualCostReconciliationAssignments: number;
  manualReconciliationRequired: boolean;
}

export interface CandidateQuarantineProjectionV6 {
  usedIncrement: number;
  nextUsed: number;
  otherReserved: number;
  nextReserved: number;
  pilotQuarantineReservation: number;
  furtherCandidateReservationAllowed: false;
}

export class TerminalIntentNotDurableErrorV6 extends Error {
  public readonly persistenceError: unknown;
  public readonly noReplay = true as const;
  public readonly retryAllowed = false as const;
  public readonly manualInterventionRequired = true as const;
  public readonly disposition = "GLOBAL_SETTLEMENT_FORBIDDEN_NO_REPLAY_MANUAL_INTERVENTION" as const;

  public constructor(persistenceError: unknown) {
    super("terminal reconciliation intent was not durably committed; global settlement is forbidden");
    this.name = "TerminalIntentNotDurableErrorV6";
    this.persistenceError = persistenceError;
  }
}

/**
 * This is the control dependency between private no-replay evidence and the
 * global ledger commit. The global callback is unreachable unless the intent
 * callback returns successfully. Exclusive-create, partial-write, fsync, and
 * close failures must therefore throw from persistIntent. This marker
 * primitive does not use or claim a rename step.
 */
export function commitGlobalSettlementAfterDurableIntentV6<T>(input: {
  persistIntent: () => void;
  globalCandidateQuarantineRequired: boolean;
  settle: () => T;
  quarantine: () => T;
}): T {
  try {
    input.persistIntent();
  } catch (error) {
    throw new TerminalIntentNotDurableErrorV6(error);
  }
  return input.globalCandidateQuarantineRequired ? input.quarantine() : input.settle();
}

export function projectCandidateCapacityQuarantineV6(input: {
  cap: number;
  currentUsed: number;
  currentReserved: number;
  pilotReservation: number;
  observedCandidateUnits: number;
}): CandidateQuarantineProjectionV6 {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
  }
  if (input.cap < 1 || input.pilotReservation < 1 || input.currentReserved < input.pilotReservation ||
      input.currentUsed + input.currentReserved > input.cap || input.observedCandidateUnits < 1) {
    throw new Error("candidate quarantine projection inputs violate the global cap invariant");
  }
  const remainingBefore = input.cap - input.currentUsed;
  const usedIncrement = Math.min(input.observedCandidateUnits, remainingBefore);
  const nextUsed = input.currentUsed + usedIncrement;
  const otherReserved = input.currentReserved - input.pilotReservation;
  const nextReserved = input.cap - nextUsed;
  if (otherReserved > nextReserved) {
    throw new Error("concurrent reservation prevents exact candidate quarantine attribution");
  }
  return {
    usedIncrement,
    nextUsed,
    otherReserved,
    nextReserved,
    pilotQuarantineReservation: nextReserved - otherReserved,
    furtherCandidateReservationAllowed: false,
  };
}

function boundedMoney(value: number, label: string, maximum: number): number {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be nonnegative finite money <= ${maximum}`);
  }
  const scaled = Math.ceil(value * MONEY_SCALE_V6);
  if (!Number.isSafeInteger(scaled) || scaled < 0) throw new Error(`${label} cannot be safely scaled`);
  const rounded = scaled / MONEY_SCALE_V6;
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > maximum) throw new Error(`${label} cannot be safely rounded`);
  return rounded;
}

function maybeActualMoney(value: number | null): number | null {
  if (value === null) return null;
  try {
    return boundedMoney(value, "actualCostUsd", MAX_PER_RESPONSE_ACTUAL_COST_USD_V6);
  } catch {
    return null;
  }
}

function exactKnownUsage(billing: BillingEvidenceV6): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  if (!billing.usageActualKnown || billing.promptTokens === null || billing.completionTokens === null ||
      billing.totalTokens === null) return null;
  const values = [billing.promptTokens, billing.completionTokens, billing.totalTokens];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_PER_RESPONSE_USAGE_TOKENS_V6) ||
      billing.promptTokens < 1 || billing.totalTokens < 1 ||
      !Number.isSafeInteger(billing.promptTokens + billing.completionTokens) ||
      billing.totalTokens !== billing.promptTokens + billing.completionTokens) return null;
  return {
    promptTokens: billing.promptTokens,
    completionTokens: billing.completionTokens,
    totalTokens: billing.totalTokens,
  };
}

export function buildAssignmentChargeV6(input: {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
  reservedCostUsd: number;
  billing: BillingEvidenceV6;
  candidateObservation: RawCandidateObservationV6;
  responseCandidateCardinalityUnobservableAfterSend: boolean;
}): AssignmentChargeV6 {
  const reservedCostUsd = boundedMoney(input.reservedCostUsd, "reservedCostUsd", MAX_RUN_EFFECTIVE_COST_USD_V6);
  if (reservedCostUsd <= 0) throw new Error("reservedCostUsd must be positive");
  const actualCostUsd = input.billing.costActualKnown ? maybeActualMoney(input.billing.actualCostUsd) : null;
  const actualKnown = actualCostUsd !== null;
  const manualCostReconciliationRequired = input.billing.costDisposition === "EXPLICIT_POSITIVE_UNREPRESENTABLE" ||
    input.billing.costDisposition === "AMBIGUOUS_DUPLICATE_BILLING_KEYS" ||
    input.billing.costDisposition === "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION" ||
    input.billing.manualCostReconciliationRequired ||
    (input.billing.costActualKnown && !actualKnown);
  const costDisposition: BillingEvidenceV6["costDisposition"] = manualCostReconciliationRequired
    ? input.billing.costDisposition
    : actualKnown
      ? "ACTUAL_KNOWN"
      : "ABSENT_OR_MALFORMED_UNKNOWN";
  const usage = exactKnownUsage(input.billing);
  const usageKnown = usage !== null;
  const effectiveCostUsd = actualCostUsd ?? reservedCostUsd;
  const observation = input.candidateObservation;
  if (!Number.isSafeInteger(observation.fullQuestionObjectsObserved) ||
      observation.fullQuestionObjectsObserved < 0 ||
      !Number.isSafeInteger(observation.candidateUnitsEffective) ||
      observation.candidateUnitsEffective < 1) {
    throw new Error("raw candidate observation is outside its bounded integer contract");
  }
  if (typeof input.responseCandidateCardinalityUnobservableAfterSend !== "boolean") {
    throw new Error("response candidate cardinality observability disposition must be explicit");
  }
  const candidateOverflow = observation.candidateUnitsEffective > 1 || observation.observationSaturated;
  const candidateCardinalityAmbiguous = observation.cardinalityAmbiguous ||
    input.responseCandidateCardinalityUnobservableAfterSend;
  const globalCandidateQuarantineRequired = candidateOverflow || observation.choiceCardinalityExcess ||
    candidateCardinalityAmbiguous;
  const candidateObservationEvidenceHash = sha256V6(stableJsonV6({
    observation,
    responseCandidateCardinalityUnobservableAfterSend: input.responseCandidateCardinalityUnobservableAfterSend,
  }));
  const core = {
    ordinal: input.ordinal,
    plan: input.plan,
    reservedCostUsd,
    actualKnown,
    costDisposition,
    manualCostReconciliationRequired,
    explicitPositiveCostEvidenceHash: input.billing.explicitPositiveCostEvidenceHash,
    usageKnown,
    actualCostUsd,
    effectiveCostUsd,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    billingEvidenceHash: input.billing.billingEvidenceHash,
    conservativeUnknownBilling: !actualKnown && !manualCostReconciliationRequired,
    provisionalReservedCostPendingManualReconciliation: manualCostReconciliationRequired,
    observedFullQuestionCandidates: observation.fullQuestionObjectsObserved,
    candidateUnitsEffective: observation.candidateUnitsEffective,
    choiceCardinalityDrift: observation.choiceCardinalityDrift,
    choiceCardinalityShortage: observation.choiceCardinalityShortage,
    choiceCardinalityExcess: observation.choiceCardinalityExcess,
    candidateCardinalityAmbiguous,
    candidateObservationSaturated: observation.observationSaturated,
    responseCandidateCardinalityUnobservableAfterSend: input.responseCandidateCardinalityUnobservableAfterSend,
    candidateOverflow,
    globalCandidateQuarantineRequired,
    candidateObservationEvidenceHash,
  };
  return core;
}

export function buildFailClosedPostSendChargeV6(input: {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
  reservedCostUsd: number;
  failure: unknown;
}): AssignmentChargeV6 {
  const reservedCostUsd = boundedMoney(input.reservedCostUsd, "reservedCostUsd", MAX_RUN_EFFECTIVE_COST_USD_V6);
  if (reservedCostUsd <= 0) throw new Error("fail-closed post-send charge requires positive reserved cost");
  const failureMessage = input.failure instanceof Error
    ? `${input.failure.name}:${input.failure.message}`
    : String(input.failure);
  const failureHash = sha256V6(failureMessage);
  const candidateObservationEvidenceHash = sha256V6(stableJsonV6({
    disposition: "POST_SEND_CHARGE_CONSTRUCTION_FAILED_GLOBAL_QUARANTINE",
    failureHash,
    responseCandidateCardinalityUnobservableAfterSend: true,
  }));
  return {
    ordinal: input.ordinal,
    plan: input.plan,
    reservedCostUsd,
    actualKnown: false,
    costDisposition: "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION",
    manualCostReconciliationRequired: true,
    explicitPositiveCostEvidenceHash: failureHash,
    usageKnown: false,
    actualCostUsd: null,
    effectiveCostUsd: reservedCostUsd,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    billingEvidenceHash: sha256V6(stableJsonV6({
      disposition: "POST_SEND_BILLING_UNOBSERVABLE_MANUAL_RECONCILIATION",
      failureHash,
    })),
    conservativeUnknownBilling: false,
    provisionalReservedCostPendingManualReconciliation: true,
    observedFullQuestionCandidates: 0,
    candidateUnitsEffective: 1,
    choiceCardinalityDrift: true,
    choiceCardinalityShortage: true,
    choiceCardinalityExcess: false,
    candidateCardinalityAmbiguous: true,
    candidateObservationSaturated: false,
    responseCandidateCardinalityUnobservableAfterSend: true,
    candidateOverflow: false,
    globalCandidateQuarantineRequired: true,
    candidateObservationEvidenceHash,
  };
}

export function constructPostSendChargeFailClosedV6(input: {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
  reservedCostUsd: number;
  constructPrimaryCharge: () => AssignmentChargeV6;
}): { charge: AssignmentChargeV6; constructionError: unknown | null } {
  try {
    return { charge: input.constructPrimaryCharge(), constructionError: null };
  } catch (constructionError) {
    return {
      charge: buildFailClosedPostSendChargeV6({
        ordinal: input.ordinal,
        plan: input.plan,
        reservedCostUsd: input.reservedCostUsd,
        failure: constructionError,
      }),
      constructionError,
    };
  }
}

export function buildRunLedgerSettlementV6(charges: readonly AssignmentChargeV6[]): RunLedgerSettlementV6 {
  if (charges.length > 2) throw new Error("v6 settlement cannot contain more than two sent assignments");
  for (const charge of charges) {
    const dispositions = Number(charge.actualKnown) + Number(charge.conservativeUnknownBilling) +
      Number(charge.manualCostReconciliationRequired);
    if (dispositions !== 1) throw new Error("each charge must have exactly one cost disposition");
  }
  const ordinals = charges.map((charge) => charge.ordinal);
  if (JSON.stringify(ordinals) !== JSON.stringify(ordinals.length === 2 ? [1, 2] : ordinals.length === 1 ? [1] : [])) {
    throw new Error("v6 settlement assignment order differs from Standard then Premium");
  }
  const sumMoney = (values: number[]): number => {
    const scaledValues = values.map((value) => {
      const bounded = boundedMoney(value, "cost component", MAX_RUN_EFFECTIVE_COST_USD_V6);
      const scaled = Math.round(bounded * MONEY_SCALE_V6);
      if (!Number.isSafeInteger(scaled) || scaled < 0) throw new Error("cost component scaled representation is invalid");
      return scaled;
    });
    const scaledTotal = scaledValues.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(scaledTotal) || scaledTotal < 0 ||
        scaledTotal > MAX_RUN_EFFECTIVE_COST_USD_V6 * MONEY_SCALE_V6) {
      throw new Error("cost sum is outside the v6 representable run bound");
    }
    return scaledTotal / MONEY_SCALE_V6;
  };
  const knownUsage = charges.filter((charge) => charge.usageKnown);
  const inputTokensCandidate = knownUsage.reduce((sum, charge) => sum + (charge.promptTokens ?? 0), 0);
  const outputTokensCandidate = knownUsage.reduce((sum, charge) => sum + (charge.completionTokens ?? 0), 0);
  const aggregateUsageSafe = knownUsage.every((charge) =>
    Number.isSafeInteger(charge.promptTokens) && Number.isSafeInteger(charge.completionTokens) &&
    Number.isSafeInteger(charge.totalTokens) && (charge.promptTokens ?? -1) >= 1 &&
    (charge.completionTokens ?? -1) >= 0 && (charge.totalTokens ?? -1) >= 1 &&
    (charge.promptTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V6 &&
    (charge.completionTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V6 &&
    (charge.totalTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V6 &&
    charge.totalTokens === (charge.promptTokens ?? 0) + (charge.completionTokens ?? 0)) &&
    Number.isSafeInteger(inputTokensCandidate) && Number.isSafeInteger(outputTokensCandidate) &&
    inputTokensCandidate <= MAX_RUN_USAGE_TOKENS_V6 && outputTokensCandidate <= MAX_RUN_USAGE_TOKENS_V6;
  const inputTokens = aggregateUsageSafe ? inputTokensCandidate : 0;
  const outputTokens = aggregateUsageSafe ? outputTokensCandidate : 0;
  const usageKnownAssignments = aggregateUsageSafe ? knownUsage.length : 0;
  const manualCostReconciliationAssignments = charges.filter((charge) => charge.manualCostReconciliationRequired).length;
  const observedFullQuestionCandidates = charges.reduce(
    (sum, charge) => sum + charge.observedFullQuestionCandidates,
    0,
  );
  const candidateUnits = charges.reduce((sum, charge) => sum + charge.candidateUnitsEffective, 0);
  if (!Number.isSafeInteger(observedFullQuestionCandidates) || !Number.isSafeInteger(candidateUnits)) {
    throw new Error("candidate observation aggregate is outside safe integer bounds");
  }
  const candidateOverflowAssignments = charges.filter((charge) => charge.candidateOverflow).length;
  const choiceCardinalityDriftAssignments = charges.filter((charge) => charge.choiceCardinalityDrift).length;
  const choiceCardinalityShortageAssignments = charges.filter((charge) => charge.choiceCardinalityShortage).length;
  const choiceCardinalityExcessAssignments = charges.filter((charge) => charge.choiceCardinalityExcess).length;
  const candidateCardinalityAmbiguousAssignments = charges.filter((charge) => charge.candidateCardinalityAmbiguous).length;
  const globalCandidateQuarantineRequired = charges.some((charge) => charge.globalCandidateQuarantineRequired);
  return {
    used: candidateUnits,
    modelCalls: charges.length,
    observedFullQuestionCandidates,
    candidateOverflowAssignments,
    choiceCardinalityDriftAssignments,
    choiceCardinalityShortageAssignments,
    choiceCardinalityExcessAssignments,
    candidateCardinalityAmbiguousAssignments,
    globalCandidateQuarantineRequired,
    inputTokens,
    outputTokens,
    actualCostUsd: sumMoney(charges.flatMap((charge) => charge.actualCostUsd === null ? [] : [charge.actualCostUsd])),
    effectiveCostUsd: sumMoney(charges.map((charge) => charge.effectiveCostUsd)),
    actualCostKnownAssignments: charges.filter((charge) => charge.actualKnown).length,
    usageKnownAssignments,
    conservativeUnknownBillingAssignments: charges.filter((charge) => charge.conservativeUnknownBilling).length,
    manualCostReconciliationAssignments,
    manualReconciliationRequired: manualCostReconciliationAssignments > 0 || globalCandidateQuarantineRequired,
  };
}

export function buildRunLedgerSettlementForDispatchV6(input: {
  charges: readonly AssignmentChargeV6[];
  physicalFetches: number;
  candidateOpportunitiesConsumed: number;
}): RunLedgerSettlementV6 {
  if (!Number.isSafeInteger(input.physicalFetches) || input.physicalFetches < 0 || input.physicalFetches > 2 ||
      !Number.isSafeInteger(input.candidateOpportunitiesConsumed) || input.candidateOpportunitiesConsumed < 0 ||
      input.candidateOpportunitiesConsumed > 2 ||
      input.physicalFetches !== input.candidateOpportunitiesConsumed ||
      input.charges.length !== input.physicalFetches ||
      (input.physicalFetches > 0 && input.charges.length === 0)) {
    throw new Error("post-send charge coverage differs from physical fetches and consumed opportunities");
  }
  return buildRunLedgerSettlementV6(input.charges);
}

export function buildTerminalReconciliationIntentV6(input: {
  runId: string;
  journalHeadHash: string;
  settlement: RunLedgerSettlementV6;
  status: string;
}): JsonObject {
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-terminal-reconciliation-intent-v6",
    runId: input.runId,
    noReplay: true,
    globalSettlementState: "PENDING_FAIL_CLOSED",
    status: input.status,
    journalHeadHash: input.journalHeadHash,
    settlement: input.settlement,
  };
  return { ...core, intentSha256: sha256V6(stableJsonV6(core)) };
}

export function buildSettlementFailureEvidenceV6(input: {
  intentSha256: string;
  settlement: RunLedgerSettlementV6;
  error: unknown;
}): JsonObject {
  const message = input.error instanceof Error ? `${input.error.name}:${input.error.message}` : String(input.error);
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-settlement-failure-v6",
    noReplay: true,
    manualReconciliationRequired: true,
    reservationMayRemain: true,
    intentSha256: input.intentSha256,
    settlement: input.settlement,
    errorSha256: sha256V6(message),
  };
  return { ...core, evidenceSha256: sha256V6(stableJsonV6(core)) };
}

export function buildPostSettlementMarkerFailureEvidenceV6(input: {
  intentSha256: string;
  settlement: RunLedgerSettlementV6;
  error: unknown;
}): JsonObject {
  const message = input.error instanceof Error ? `${input.error.name}:${input.error.message}` : String(input.error);
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-post-settlement-marker-failure-v6",
    noReplay: true,
    globalLedgerSettlementSucceeded: true,
    reservationMayRemain: false,
    manualEvidenceRepairRequired: true,
    intentSha256: input.intentSha256,
    settlement: input.settlement,
    errorSha256: sha256V6(message),
  };
  return { ...core, evidenceSha256: sha256V6(stableJsonV6(core)) };
}
