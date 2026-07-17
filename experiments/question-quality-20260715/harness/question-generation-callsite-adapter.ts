import { createHash } from "node:crypto";

import {
  getCurrentAtlasResearchLineage,
  runWithAtlasResearchChildScope,
  runWithAtlasResearchScope,
  type AtlasResearchScope,
} from "@/lib/atlas-research-fetch-boundary";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  type QuestionGenerationResearchCandidateDecision,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
  type QuestionGenerationResearchStageKey,
} from "@/lib/question-generation-research-runtime";

import {
  DurableAtlasResearchController,
  type AtlasControllerParsedCandidate,
  type AtlasControllerRegistry,
  type AtlasControllerRegistryEntry,
} from "./atlas-controller";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function semanticHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

interface CandidateBinding {
  candidate: AtlasControllerParsedCandidate;
  decision: QuestionGenerationResearchCandidateDecision | null;
}

/**
 * Stage-to-registry mapping is explicit because the same semantic stage can be
 * an exact root in one preregistered assignment and a parent-derived child in
 * another. No production caller chooses entry IDs or controller contracts.
 */
export interface QuestionGenerationCallsiteAdapterOptions {
  runtimeId: string;
  controller: DurableAtlasResearchController;
  registry: Readonly<AtlasControllerRegistry>;
  expectedEndpoint: string;
  operationId: string;
  assignmentId: string;
  assignmentContractId: string;
  rootEntryId: string;
  /** Derived entry used when the production outer retry loop repeats the root stage. */
  repeatRootEntryId?: string;
  childEntryIds: Partial<Record<QuestionGenerationResearchStageKey, string>>;
}

export class QuestionGenerationCallsiteAdapter
implements QuestionGenerationResearchRuntime {
  readonly runtimeId: string;
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall: number;

  private readonly controller: DurableAtlasResearchController;
  private readonly registry: Readonly<AtlasControllerRegistry>;
  private readonly expectedEndpoint: string;
  private readonly operationId: string;
  private readonly assignmentId: string;
  private readonly assignmentContractId: string;
  private readonly rootEntry: AtlasControllerRegistryEntry;
  private readonly repeatRootEntry: AtlasControllerRegistryEntry | null;
  private readonly childEntries = new Map<
    QuestionGenerationResearchStageKey,
    AtlasControllerRegistryEntry
  >();
  private activeOperation: Readonly<QuestionGenerationResearchOperation> | null = null;
  private assignmentActive = false;
  private operationCount = 0;
  private readonly candidateBySemanticHash = new Map<string, CandidateBinding>();
  private readonly candidateByObjectIdentity = new WeakMap<object, CandidateBinding>();
  private readonly candidateBySlotId = new Map<string, CandidateBinding>();
  private readonly producerByObjectIdentity = new WeakMap<object, string>();
  private readonly rejectedUnreturnedSlots = new Set<string>();

  constructor(options: QuestionGenerationCallsiteAdapterOptions) {
    this.runtimeId = options.runtimeId;
    this.controller = options.controller;
    this.registry = options.registry;
    this.expectedEndpoint = new URL(options.expectedEndpoint).toString();
    this.operationId = options.operationId;
    this.assignmentId = options.assignmentId;
    this.assignmentContractId = options.assignmentContractId;
    const rootEntry = this.registry.entries.find(
      (entry) => entry.entryId === options.rootEntryId,
    );
    if (!rootEntry || rootEntry.wire.requestMode !== "exact") {
      throw new Error("research callsite adapter root entry must be an exact registry entry");
    }
    this.rootEntry = rootEntry;
    if (options.repeatRootEntryId) {
      const repeatRootEntry = this.registry.entries.find(
        (entry) => entry.entryId === options.repeatRootEntryId,
      );
      if (!repeatRootEntry || repeatRootEntry.wire.requestMode !== "derived") {
        throw new Error("research repeated root stage requires a derived registry entry");
      }
      this.repeatRootEntry = repeatRootEntry;
    } else {
      this.repeatRootEntry = null;
    }
    for (const [stage, entryId] of Object.entries(options.childEntryIds)) {
      if (!entryId) continue;
      const entry = this.registry.entries.find((candidate) => candidate.entryId === entryId);
      if (!entry || entry.wire.requestMode !== "derived") {
        throw new Error(`research child stage ${stage} lacks a derived registry entry`);
      }
      this.childEntries.set(stage as QuestionGenerationResearchStageKey, entry);
    }
    const candidateCounts = new Set(
      [this.rootEntry, this.repeatRootEntry, ...this.childEntries.values()]
        .filter((entry): entry is AtlasControllerRegistryEntry => entry !== null)
        .map((entry) => entry.candidateContract?.candidatesPerCompletion)
        .filter((count): count is number => count !== undefined),
    );
    if (candidateCounts.size !== 1) {
      throw new Error(
        "research callsite adapter requires one sealed semantic question count",
      );
    }
    const [expectedQuestionsPerStructuredCall] = candidateCounts;
    if (
      !Number.isSafeInteger(expectedQuestionsPerStructuredCall) ||
      expectedQuestionsPerStructuredCall <= 0
    ) {
      throw new Error(
        "research callsite adapter question count must be a positive safe integer",
      );
    }
    this.expectedQuestionsPerStructuredCall =
      expectedQuestionsPerStructuredCall;
  }

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.assignmentActive || this.activeOperation) {
      throw new Error("research callsite adapter permits one active assignment");
    }
    const rootStage = {
      key: this.rootEntry.provenance.stage as QuestionGenerationResearchStageKey,
      purpose: this.rootEntry.purpose,
    } satisfies QuestionGenerationResearchStage;
    this.controller.admitAssignment({
      operationId: this.operationId,
      assignmentId: this.assignmentId,
      contractId: this.assignmentContractId,
    });
    this.assignmentActive = true;
    this.operationCount = 0;
    let value!: T;
    let primaryError: unknown;
    let failed = false;
    try {
      value = await runWithAtlasResearchScope(
        this.scopeFor(rootStage, this.rootEntry, null),
        fn,
      );
    } catch (error) {
      failed = true;
      primaryError = error;
    }

    try {
      await this.rejectUnreturnedParsedCandidates();
      const undecided = [...this.candidateBySemanticHash.values()].filter(
        (binding) => binding.decision === null,
      );
      if (undecided.length > 0) {
        this.rejectBindings(undecided);
        if (!failed) {
          throw new Error(
            `${undecided.length} correlated candidate(s) lack production gate decisions`,
          );
        }
      }
      await this.controller.closeAssignment(this.assignmentId);
    } catch (closeError) {
      if (!failed) {
        failed = true;
        primaryError = closeError;
      }
    } finally {
      this.assignmentActive = false;
      this.activeOperation = null;
    }
    if (failed) throw primaryError;
    return value;
  }

  private scopeFor(
    stage: Readonly<QuestionGenerationResearchStage>,
    entry: AtlasControllerRegistryEntry,
    parentPhysicalCallId: string | null,
  ): AtlasResearchScope {
    if (entry.purpose !== stage.purpose) {
      throw new Error(
        `stage ${stage.key} purpose ${stage.purpose} differs from registry ${entry.purpose}`,
      );
    }
    const candidateContract = entry.candidateContract
      ? {
          attestationId: entry.candidateContract.attestationId,
          attestationHash: entry.candidateContract.attestationHash,
          expectedCandidatesPerCompletion:
            entry.candidateContract.candidatesPerCompletion,
        }
      : undefined;
    return {
      operationId: this.operationId,
      purpose: entry.purpose,
      expectedEndpoint: this.expectedEndpoint,
      expectedCandidateOutputs: entry.candidateContract
        ? entry.candidateContract.candidatesPerCompletion * entry.wire.completionCount
        : 0,
      candidateContract,
      parentPhysicalCallId,
      derivationIntent: entry.wire.derivationContract
        ? {
            contractId: entry.wire.derivationContract.contractId,
            artifactHash: entry.wire.derivationContract.artifactHash,
          }
        : null,
      provenance: entry.provenance,
    };
  }

  async runOperation<T>(
    operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    if (!this.assignmentActive) {
      throw new Error("research operation requires an active whole assignment");
    }
    if (this.activeOperation) {
      throw new Error("research callsite adapter permits one active production operation");
    }
    const firstOperation = this.operationCount === 0;
    if (firstOperation && (
      operation.rootStage.key !== this.rootEntry.provenance.stage ||
      operation.rootStage.purpose !== this.rootEntry.purpose
    )) {
      throw new Error(
        `root stage ${operation.rootStage.key} does not match frozen entry ${this.rootEntry.entryId}`,
      );
    }
    let repeatEntry: AtlasControllerRegistryEntry | null = null;
    if (!firstOperation) {
      repeatEntry = operation.rootStage.key === this.rootEntry.provenance.stage
        ? this.repeatRootEntry
        : this.childEntries.get(operation.rootStage.key) ?? null;
      if (!repeatEntry || repeatEntry.purpose !== operation.rootStage.purpose) {
        throw new Error(
          `outer retry root stage ${operation.rootStage.key} lacks a matching derived entry`,
        );
      }
    }
    this.operationCount += 1;
    this.activeOperation = operation;
    let value!: T;
    let primaryError: unknown;
    let failed = false;
    try {
      if (repeatEntry) {
        const lineage = getCurrentAtlasResearchLineage();
        if (!lineage?.lastPhysicalCallId || lineage.operationId !== this.operationId) {
          throw new Error("outer retry root stage has no trusted prior physical call");
        }
        value = await runWithAtlasResearchChildScope(
          this.scopeFor(operation.rootStage, repeatEntry, lineage.lastPhysicalCallId),
          fn,
        );
      } else {
        value = await fn();
      }
    } catch (error) {
      failed = true;
      primaryError = error;
    }

    try {
      await this.rejectUnreturnedParsedCandidates();
      const undecided = [...this.candidateBySemanticHash.values()].filter(
        (binding) => binding.decision === null,
      );
      if (undecided.length > 0) {
        this.rejectBindings(undecided);
        if (!failed) {
          throw new Error(
            `${undecided.length} correlated candidate(s) lack production gate decisions`,
          );
        }
      }
    } catch (closeError) {
      if (!failed) {
        failed = true;
        primaryError = closeError;
      }
    } finally {
      this.activeOperation = null;
    }
    if (failed) throw primaryError;
    return value;
  }

  async runStage<T>(
    stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    if (!this.activeOperation) {
      throw new Error("research stage requires an admitted active operation");
    }
    const before = new Set(
      this.controller
        .getParsedCandidatesForOperation(this.operationId)
        .map((candidate) => candidate.candidateSlotId),
    );
    try {
      if (stage.key === this.activeOperation.rootStage.key) {
        if (stage.purpose !== this.activeOperation.rootStage.purpose) {
          throw new Error("root stage purpose changed inside the production call path");
        }
        return await fn();
      }
      const entry = this.childEntries.get(stage.key);
      if (!entry) throw new Error(`unregistered research child stage ${stage.key}`);
      const lineage = getCurrentAtlasResearchLineage();
      if (!lineage || lineage.operationId !== this.operationId || !lineage.lastPhysicalCallId) {
        throw new Error(`research child stage ${stage.key} has no trusted latest parent`);
      }
      let parentPhysicalCallId = lineage.lastPhysicalCallId;
      if (stage.derivationParentValue !== undefined) {
        const parentValue = stage.derivationParentValue;
        if (parentValue === null || typeof parentValue !== "object") {
          throw new Error(
            `research child stage ${stage.key} derivation parent must be an observed object`,
          );
        }
        const boundParent = this.producerByObjectIdentity.get(parentValue as object);
        if (!boundParent) {
          throw new Error(
            `research child stage ${stage.key} has no trusted producer for its derivation value`,
          );
        }
        parentPhysicalCallId = boundParent;
      }
      return await runWithAtlasResearchChildScope(
        this.scopeFor(stage, entry, parentPhysicalCallId),
        fn,
      );
    } catch (error) {
      // A successful provider response can contain a semantic question even if
      // SDK/schema parsing later rejects the stage. Such unreturned candidates
      // still consume slots and receive an explicit rejected gate outcome.
      const newlyParsed = this.controller
        .getParsedCandidatesForOperation(this.operationId)
        .filter((candidate) => !before.has(candidate.candidateSlotId));
      this.rejectCandidates(newlyParsed);
      throw error;
    }
  }

  async observeCandidateValues(values: readonly unknown[]): Promise<void> {
    if (!this.activeOperation) {
      throw new Error("candidate observation requires an active research operation");
    }
    const lineage = getCurrentAtlasResearchLineage();
    if (!lineage?.lastPhysicalCallId || lineage.operationId !== this.operationId) {
      throw new Error("candidate observation has no trusted producer lineage");
    }
    const normalized = values.map((value) => stableJson(value));
    const correlated = await this.controller.correlateReturnedCandidates({
      operationId: this.operationId,
      producerPhysicalCallId: lineage.lastPhysicalCallId,
      normalizedSemanticCandidates: normalized,
    });
    if (correlated.length !== values.length) {
      throw new Error("candidate correlation cardinality differs from production values");
    }
    correlated.forEach((candidate, index) => {
      const hash = semanticHash(values[index]);
      const prior = this.candidateBySemanticHash.get(hash);
      if (prior && prior.candidate.candidateSlotId !== candidate.candidateSlotId) {
        throw new Error("same semantic candidate hash was returned by multiple physical calls");
      }
      const binding = { candidate, decision: null } satisfies CandidateBinding;
      this.candidateBySemanticHash.set(hash, binding);
      this.candidateBySlotId.set(candidate.candidateSlotId, binding);
      if (values[index] !== null && typeof values[index] === "object") {
        this.candidateByObjectIdentity.set(values[index] as object, binding);
        this.producerByObjectIdentity.set(
          values[index] as object,
          candidate.physicalCallId,
        );
      }
    });

    // Earlier response-bound semantic outputs in wrapper/SDK retries were not
    // the value returned to production. Reject them explicitly; never pretend
    // they did not count merely because a later repair succeeded.
    const correlatedSlots = new Set(correlated.map((candidate) => candidate.candidateSlotId));
    const unreturned = this.controller
      .getParsedCandidatesForOperation(this.operationId)
      .filter(
        (candidate) =>
          !correlatedSlots.has(candidate.candidateSlotId) &&
          !this.hasCandidateBinding(candidate.candidateSlotId) &&
          !this.rejectedUnreturnedSlots.has(candidate.candidateSlotId),
      );
    this.rejectCandidates(unreturned);
  }

  async decideCandidateValue(
    value: unknown,
    outcome: QuestionGenerationResearchCandidateDecision,
  ): Promise<void> {
    const binding = value !== null && typeof value === "object"
      ? this.candidateByObjectIdentity.get(value as object) ??
        this.candidateBySemanticHash.get(semanticHash(value))
      : this.candidateBySemanticHash.get(semanticHash(value));
    if (!binding) {
      throw new Error("production gate decision does not match a correlated candidate");
    }
    if (binding.decision !== null) {
      if (binding.decision !== outcome) {
        throw new Error("production gate attempted conflicting candidate decisions");
      }
      return;
    }
    this.controller.finalizeCorrelatedCandidates({
      operationId: this.operationId,
      decisions: [{
        candidateSlotId: binding.candidate.candidateSlotId,
        outcome,
      }],
    });
    binding.decision = outcome;
  }

  private hasCandidateBinding(candidateSlotId: string): boolean {
    return [...this.candidateBySemanticHash.values()].some(
      (binding) => binding.candidate.candidateSlotId === candidateSlotId,
    );
  }

  private rejectCandidates(candidates: AtlasControllerParsedCandidate[]): void {
    const bindings: CandidateBinding[] = [];
    const unboundCandidates: AtlasControllerParsedCandidate[] = [];
    for (const candidate of candidates) {
      const binding = this.candidateBySlotId.get(candidate.candidateSlotId);
      if (binding) {
        if (binding.decision === null) bindings.push(binding);
      } else if (!this.rejectedUnreturnedSlots.has(candidate.candidateSlotId)) {
        unboundCandidates.push(candidate);
      }
    }
    this.rejectBindings(bindings);
    const decisions = unboundCandidates.map((candidate) => ({
      candidateSlotId: candidate.candidateSlotId,
      outcome: "parsed_rejected" as const,
    }));
    if (decisions.length === 0) return;
    this.controller.finalizeCorrelatedCandidates({
      operationId: this.operationId,
      decisions,
    });
    decisions.forEach((decision) => this.rejectedUnreturnedSlots.add(decision.candidateSlotId));
  }

  private rejectBindings(bindings: CandidateBinding[]): void {
    const pending = bindings.filter((binding) => binding.decision === null);
    if (pending.length === 0) return;
    this.controller.finalizeCorrelatedCandidates({
      operationId: this.operationId,
      decisions: pending.map((binding) => ({
        candidateSlotId: binding.candidate.candidateSlotId,
        outcome: "parsed_rejected" as const,
      })),
    });
    pending.forEach((binding) => {
      binding.decision = "parsed_rejected";
    });
  }

  private async rejectUnreturnedParsedCandidates(): Promise<void> {
    await this.controller.awaitTrackedCloneObservations();
    const unreturned = this.controller
      .getParsedCandidatesForOperation(this.operationId)
      .filter(
        (candidate) =>
          !this.hasCandidateBinding(candidate.candidateSlotId) &&
          !this.rejectedUnreturnedSlots.has(candidate.candidateSlotId),
      );
    this.rejectCandidates(unreturned);
  }
}
