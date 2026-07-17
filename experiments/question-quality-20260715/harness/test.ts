import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  assertStrictTimestamp,
  BudgetGuardError,
  CallReplayPreventedError,
  getCanonicalStorePath,
  hashProviderOutput,
  initializeCanonicalBudgetStore,
  inspectTestExperimentRegistry,
  openCanonicalBudgetStore,
  openTestBudgetStore,
  type BatchRef,
  type BudgetStore,
  type CandidateClassification,
  type ParsedCandidateDecision,
} from "./ledger";

process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, "cli.ts");
const WORKER = resolve(HERE, "test-worker.ts");
const BEGIN_CALL_WORKER = resolve(HERE, "begin-call-worker.ts");
const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");
const MODEL = "google/gemini-test";

const DEFAULT_REF: BatchRef = {
  experimentId: "EXP-A",
  phaseId: "default",
  batchId: "batch-1",
};

function expectCode(callback: () => unknown, code: string): void {
  assert.throws(callback, (error: unknown) => {
    assert(error instanceof BudgetGuardError);
    assert.equal(error.code, code);
    return true;
  });
}

async function expectCodeAsync(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert(error instanceof BudgetGuardError);
    assert.equal(error.code, code);
    return true;
  });
}

async function runProcess(
  script: string,
  args: string[],
  envOverrides: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [TSX_CLI, script, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE: "1",
        ...envOverrides,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

async function createRegistry(root: string): Promise<string> {
  const path = join(root, "registry.json");
  const registry = {
    schemaVersion: 1,
    status: "preregistering",
    registeredExperiments: [
      {
        id: "EXP-A",
        status: "registered",
        apiCandidateBudget: 6,
        maxPhysicalProviderCalls: 20,
        maxCostUsd: 20,
      },
      {
        id: "EXP-B",
        status: "registered",
        apiCandidateBudget: 6,
        maxPhysicalProviderCalls: 20,
        maxCostUsd: 20,
      },
      {
        id: "BIG-A",
        status: "registered",
        apiCandidateBudget: 1_000,
        maxPhysicalProviderCalls: 2,
        maxCostUsd: 1,
      },
      {
        id: "BIG-B",
        status: "registered",
        apiCandidateBudget: 1_000,
        maxPhysicalProviderCalls: 2,
        maxCostUsd: 1,
      },
      { id: "ZERO", status: "registered", apiCandidateBudget: 0 },
      { id: "UNCAPPED", status: "registered", apiCandidateBudget: 1 },
      {
        id: "NO-COST-CAP",
        status: "registered",
        apiCandidateBudget: 1,
        maxPhysicalProviderCalls: 1,
        maxCostUsd: null,
      },
      {
        id: "TIGHT",
        status: "registered",
        apiCandidateBudget: 4,
        maxPhysicalProviderCalls: 3,
        maxCostUsd: 1,
      },
      {
        id: "PHASE-CAMPAIGN",
        status: "registered",
        phases: [
          { id: "P0", status: "registered", apiCandidateBudget: 0, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P1", status: "registered", apiCandidateBudget: 150, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P2A", status: "registered", apiCandidateBudget: 64, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P2B", status: "registered", apiCandidateBudget: 64, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P3", status: "registered", apiCandidateBudget: 240, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P4", status: "registered", apiCandidateBudget: 240, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P5", status: "registered", apiCandidateBudget: 150, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P6", status: "registered", apiCandidateBudget: 50, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P7", status: "registered", apiCandidateBudget: 20, maxPhysicalProviderCalls: null, maxCostUsd: null },
          { id: "P8", status: "registered", apiCandidateBudget: 20, maxPhysicalProviderCalls: null, maxCostUsd: null },
        ],
      },
      { id: "PROPOSED", status: "proposed_not_reserved", apiCandidateBudget: 10 },
      {
        id: "PHASED",
        status: "registered",
        phases: [
          {
            id: "pilot",
            status: "registered",
            apiCandidateBudget: 2,
            maxPhysicalProviderCalls: 8,
            maxCostUsd: 8,
          },
          {
            id: "final",
            status: "registered",
            apiCandidateBudget: 1,
            maxPhysicalProviderCalls: 4,
            maxCostUsd: 4,
          },
        ],
      },
    ],
  };
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return path;
}

function openStore(root: string, registryPath: string, name: string): BudgetStore {
  return openTestBudgetStore(join(root, `${name}.sqlite`), registryPath);
}

function reserve(
  store: BudgetStore,
  ref: BatchRef,
  slots: number,
  maxCalls = 8,
  maxCost = 4,
): void {
  store.reserveBatch(
    {
      ...ref,
      idempotencyKey: `reserve:${ref.experimentId}:${ref.phaseId}:${ref.batchId}`,
      candidateSlots: slots,
      maxProviderCalls: maxCalls,
      maxCostUsd: maxCost,
    },
    { apply: true },
  );
}

function beginCandidateCall(
  store: BudgetStore,
  ref: BatchRef,
  callId: string,
  candidateSlotIds: string[],
  reservedCostUsd = 0.1,
  lineage: {
    logicalOperationId?: string;
    physicalAttemptOrdinal?: number;
    parentCandidateSlotId?: string;
  } = {},
): void {
  store.beginCall(
    {
      ...ref,
      idempotencyKey: `begin:${callId}`,
      callId,
      callKind: "full_question_generation",
      stage: "generation",
      model: MODEL,
      reservedCostUsd,
      ...lineage,
      expectedCandidateOutputs: candidateSlotIds.length,
      candidateSlotIds,
    },
    { apply: true },
  );
}

function settle(
  store: BudgetStore,
  callId: string,
  outcome: "success" | "failed" | "unknown" = "success",
  costUsd = 0.05,
): void {
  store.settleCall(
    {
      idempotencyKey: `settle:${callId}`,
      callId,
      outcome,
      inputTokens: 10,
      outputTokens: outcome === "success" ? 10 : 0,
      costUsd,
      latencyMs: 1,
      usageFinal: outcome !== "unknown",
    },
    { apply: true },
  );
}

function classify(
  store: BudgetStore,
  callId: string,
  observedParsedOutputCount: number,
  results: CandidateClassification[],
  key = `classify:${callId}`,
): void {
  store.classifyCandidateCall(
    { idempotencyKey: key, callId, observedParsedOutputCount, results },
    { apply: true },
  );
}

function finish(
  store: BudgetStore,
  decisions: ParsedCandidateDecision[],
  key: string,
): void {
  store.finalizeParsedCandidates({ idempotencyKey: key, decisions }, { apply: true });
}

async function testDryRunAndAllocation(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "dry-allocation");
  try {
    const registry = inspectTestExperimentRegistry(registryPath);
    const campaignPhases = registry.phases.filter((phase) => phase.experimentId === "PHASE-CAMPAIGN");
    assert.equal(campaignPhases.length, 10);
    assert.equal(campaignPhases.reduce((sum, phase) => sum + (phase.apiCandidateBudget ?? 0), 0), 998);
    assert.equal(campaignPhases.every((phase) => !phase.operational), true);
    const preview = store.reserveBatch({
      ...DEFAULT_REF,
      idempotencyKey: "dry-reserve",
      candidateSlots: 2,
      maxProviderCalls: 2,
      maxCostUsd: 1,
    });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.summary.reservedAttemptSlots, 2);
    assert.equal(store.summary().batches, 0);

    const phaseRef: BatchRef = { experimentId: "PHASED", phaseId: "pilot", batchId: "p1" };
    reserve(store, phaseRef, 2, 4, 2);
    expectCode(
      () => reserve(store, { experimentId: "PHASED", phaseId: "pilot", batchId: "p2" }, 1),
      "PHASE_ALLOCATION_EXCEEDED",
    );
    expectCode(
      () => reserve(store, { experimentId: "ZERO", phaseId: "default", batchId: "z" }, 1),
      "NO_PREREGISTERED_BUDGET",
    );
    expectCode(
      () => reserve(store, { experimentId: "UNCAPPED", phaseId: "default", batchId: "u" }, 1),
      "PHASE_CALL_CAP_UNSET",
    );
    expectCode(
      () => reserve(store, { experimentId: "NO-COST-CAP", phaseId: "default", batchId: "n" }, 1),
      "PHASE_COST_CAP_UNSET",
    );
    expectCode(
      () => reserve(store, { experimentId: "PROPOSED", phaseId: "default", batchId: "p" }, 1),
      "EXPERIMENT_NOT_AUTHORIZED",
    );
  } finally {
    store.close();
  }
}

async function testRegistryRevocationAndReplay(root: string): Promise<void> {
  const registryPath = join(root, "replay-registry.json");
  const storePath = join(root, "replay-registry.sqlite");
  const original = {
    schemaVersion: 1,
    registeredExperiments: [{
      id: "REPLAY",
      status: "registered",
      apiCandidateBudget: 1,
      maxPhysicalProviderCalls: 2,
      maxCostUsd: 1,
    }],
  };
  await writeFile(registryPath, `${JSON.stringify(original)}\n`, "utf8");
  const input = {
    experimentId: "REPLAY",
    phaseId: "default",
    batchId: "batch-1",
    idempotencyKey: "replay-reservation",
    candidateSlots: 1,
    maxProviderCalls: 2,
    maxCostUsd: 1,
  };
  const store = openTestBudgetStore(storePath, registryPath);
  try {
    store.reserveBatch(input, { apply: true });
    await writeFile(registryPath, `${JSON.stringify({
      schemaVersion: 1,
      registeredExperiments: [{
        ...original.registeredExperiments[0],
        maxPhysicalProviderCalls: null,
        maxCostUsd: null,
      }],
    })}\n`, "utf8");
    expectCode(
      () => store.beginCall({
        ...input,
        idempotencyKey: "blocked-after-null",
        callId: "blocked-after-null",
        callKind: "evaluation",
        stage: "judge",
        model: MODEL,
        reservedCostUsd: 0,
      }, { apply: true }),
      "PHASE_CALL_CAP_UNSET",
    );
    await writeFile(registryPath, `${JSON.stringify({ schemaVersion: 1, registeredExperiments: [] })}\n`, "utf8");
    assert.equal(store.reserveBatch(input, { apply: true }).idempotent, true);
    expectCode(
      () => store.reserveBatch({ ...input, batchId: "new", idempotencyKey: "new" }, { apply: true }),
      "EXPERIMENT_NOT_REGISTERED",
    );
  } finally {
    store.close();
  }
  const replay = openTestBudgetStore(storePath, registryPath);
  try {
    assert.equal(replay.reserveBatch(input, { apply: true }).idempotent, true);
  } finally {
    replay.close();
  }
  await writeFile(registryPath, `${JSON.stringify({
    schemaVersion: 1,
    registeredExperiments: [
      { id: "DUP", status: "registered", apiCandidateBudget: 1, maxPhysicalProviderCalls: 1, maxCostUsd: 1 },
      { id: "DUP", status: "registered", apiCandidateBudget: 1, maxPhysicalProviderCalls: 1, maxCostUsd: 1 },
    ],
  })}\n`, "utf8");
  expectCode(
    () => openTestBudgetStore(join(root, "duplicate-registry.sqlite"), registryPath),
    "REGISTRY_INVALID",
  );
}

async function testPhaseCapacityRelease(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "phase-release");
  const first: BatchRef = { experimentId: "TIGHT", phaseId: "default", batchId: "first" };
  const second: BatchRef = { experimentId: "TIGHT", phaseId: "default", batchId: "second" };
  try {
    reserve(store, first, 1, 2, 0.7);
    expectCode(() => reserve(store, second, 1, 2, 0.1), "PHASE_CALL_ALLOCATION_EXCEEDED");
    expectCode(() => reserve(store, second, 1, 1, 0.4), "PHASE_COST_ALLOCATION_EXCEEDED");
    store.finalizeBatch({ ...first, idempotencyKey: "finish-first" }, { apply: true });
    reserve(store, second, 4, 3, 1);
    assert.equal(store.summary().reservedAttemptSlots, 4);
  } finally {
    store.close();
  }
}

async function testPreNetworkSlotAndReplay(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "pre-network");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    const session = store.createSession(DEFAULT_REF);
    let physicalInvocations = 0;
    const callInput = {
      ...DEFAULT_REF,
      idempotencyKey: "physical-1",
      callId: "physical-1",
      stage: "generation",
      model: MODEL,
      reservedCostUsd: 0.5,
      expectedCandidateOutputs: 1,
      candidateSlotIds: ["candidate-1"],
      invoke: async () => {
        physicalInvocations += 1;
        assert.equal(store.summary().usedAttemptSlots, 1);
        assert.equal(store.summary().unresolvedCalls, 1);
        return { text: "question" };
      },
      observeSuccess: () => ({ inputTokens: 100, outputTokens: 30, costUsd: 0.4, usageFinal: true }),
    };
    const result = await session.runCandidateOutputCall(callInput);
    assert.equal(result.value.text, "question");
    assert.deepEqual(result.candidateSlotIds, ["candidate-1"]);
    await expectCodeAsync(session.runCandidateOutputCall(callInput), "CALL_REPLAY_PREVENTED");
    await expectCodeAsync(
      session.runCandidateOutputCall({ ...callInput, idempotencyKey: "physical-1-new-key" }),
      "CALL_ID_EXISTS",
    );
    assert.equal(physicalInvocations, 1);
    const parsed = session.classifyCandidateCall({
      idempotencyKey: "parse-physical-1",
      callId: "physical-1",
      observedParsedOutputCount: 1,
      results: [{
        candidateSlotId: "candidate-1",
        status: "parsed",
        outputIndex: 0,
        outputHash: hashProviderOutput("question"),
      }],
    });
    assert.equal(parsed.value.candidates[0]?.state, "parsed_pending");
    session.finalizeParsedCandidates({
      idempotencyKey: "gate-physical-1",
      decisions: [{ candidateSlotId: "candidate-1", outcome: "parsed_accepted" }],
    });
  } finally {
    store.close();
  }
}

async function testCallKindsAndCaps(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "call-kinds-caps");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 0.5);
    expectCode(
      () => store.beginCall({
        ...DEFAULT_REF,
        idempotencyKey: "full-without-reservation",
        callId: "full-without-reservation",
        callKind: "full_question_generation",
        stage: "generation",
        model: MODEL,
        reservedCostUsd: 0.1,
      }, { apply: true }),
      "CANDIDATE_OUTPUT_COUNT_REQUIRED",
    );
    expectCode(
      () => store.beginCall({
        ...DEFAULT_REF,
        idempotencyKey: "eval-with-slot",
        callId: "eval-with-slot",
        callKind: "evaluation",
        stage: "judge",
        model: MODEL,
        reservedCostUsd: 0.1,
        expectedCandidateOutputs: 1,
      }, { apply: true }),
      "INVALID_ARGUMENT",
    );
    store.beginCall({
      ...DEFAULT_REF,
      idempotencyKey: "eval-1",
      callId: "eval-1",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 0.4,
    }, { apply: true });
    expectCode(
      () => store.beginCall({
        ...DEFAULT_REF,
        idempotencyKey: "cost-over",
        callId: "cost-over",
        callKind: "design",
        stage: "design",
        model: MODEL,
        reservedCostUsd: 0.2,
      }, { apply: true }),
      "COST_RESERVATION_EXCEEDED",
    );
    settle(store, "eval-1", "success", 0.4);
    store.beginCall({
      ...DEFAULT_REF,
      idempotencyKey: "eval-2",
      callId: "eval-2",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 0.1,
    }, { apply: true });
    expectCode(
      () => store.beginCall({
        ...DEFAULT_REF,
        idempotencyKey: "call-over",
        callId: "call-over",
        callKind: "evaluation",
        stage: "judge",
        model: MODEL,
        reservedCostUsd: 0,
      }, { apply: true }),
      "CALL_CAP_EXCEEDED",
    );
    assert.equal(store.summary().usedAttemptSlots, 0);
  } finally {
    store.close();
  }
}

async function testProviderFailures(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "provider-failures");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    const session = store.createSession(DEFAULT_REF);
    const providerError = new Error("simulated provider failure");
    let invocations = 0;
    const failedCall = {
      ...DEFAULT_REF,
      idempotencyKey: "failed-call",
      callId: "failed-call",
      stage: "generation",
      model: MODEL,
      reservedCostUsd: 0.5,
      expectedCandidateOutputs: 1,
      candidateSlotIds: ["failed-candidate"],
      invoke: async (): Promise<{ text: string }> => {
        invocations += 1;
        throw providerError;
      },
      observeSuccess: () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }),
      observeFailure: () => ({
        inputTokens: 20,
        outputTokens: 0,
        costUsd: 0.2,
        usageFinal: false,
        providerRequestId: "request-failed-but-billed",
      }),
    };
    await assert.rejects(session.runCandidateOutputCall(failedCall), (error: unknown) => error === providerError);
    await assert.rejects(session.runCandidateOutputCall(failedCall), (error: unknown) => {
      assert(error instanceof CallReplayPreventedError);
      assert.equal(error.call.outcome, "failed");
      return true;
    });
    assert.equal(invocations, 1);

    const snapshotPath = join(root, "provider-failures-export");
    const exported = await store.exportArtifacts(snapshotPath);
    const snapshot = JSON.parse(await readFile(exported.snapshotPath, "utf8"));
    const failedCandidate = snapshot.candidateSlots.find(
      (candidate: { candidate_slot_id: string }) => candidate.candidate_slot_id === "failed-candidate",
    );
    assert.equal(failedCandidate.outcome, "no_candidate");
    assert.equal(failedCandidate.producing_call_id, null);
    assert.equal(failedCandidate.terminal_call_id, "failed-call");
    assert.equal(failedCandidate.output_index, null);
    assert.equal(failedCandidate.output_hash, null);
    assert.equal(failedCandidate.failure_reason, "provider_call_failed");

    const observationError = new Error("usage observation failed");
    await assert.rejects(session.runProviderCall({
      ...DEFAULT_REF,
      idempotencyKey: "observation-failure",
      callId: "observation-failure",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 0.4,
      invoke: async () => ({ verdict: "unobserved" }),
      observeSuccess: (): never => {
        throw observationError;
      },
    }), (error: unknown) => error === observationError);
    assert.equal(store.summary().unresolvedCalls, 0);
    store.reconcileCallUsage({
      idempotencyKey: "failed-call-final-billing",
      callId: "failed-call",
      inputTokens: 20,
      outputTokens: 0,
      costUsd: 0.2,
      usageFinal: true,
      providerRequestId: "request-failed-but-billed",
    }, { apply: true });
    store.reconcileCallUsage({
      idempotencyKey: "observation-failure-final-billing",
      callId: "observation-failure",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      usageFinal: true,
    }, { apply: true });
    store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "failures-finalize" }, { apply: true });
  } finally {
    store.close();
  }
}

async function testOverrunBreach(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "overrun");
  try {
    reserve(store, DEFAULT_REF, 1, 3, 1);
    store.beginCall({
      ...DEFAULT_REF,
      idempotencyKey: "overrun-begin",
      callId: "overrun-call",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 0.4,
    }, { apply: true });
    store.settleCall({
      idempotencyKey: "overrun-settle",
      callId: "overrun-call",
      outcome: "success",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 1.2,
      latencyMs: 10,
      usageFinal: true,
    }, { apply: true });
    assert.equal(store.summary().actualCostUsd, 1.2);
    assert.equal(store.summary().breachedBatches, 1);
    expectCode(
      () => store.beginCall({
        ...DEFAULT_REF,
        idempotencyKey: "blocked-after-breach",
        callId: "blocked-after-breach",
        callKind: "evaluation",
        stage: "judge",
        model: MODEL,
        reservedCostUsd: 0,
      }, { apply: true }),
      "BATCH_BREACHED",
    );
  } finally {
    store.close();
  }
}

async function testPhaseCostOverrunBlocksSiblingBatch(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "phase-cost-overrun");
  const first: BatchRef = { experimentId: "TIGHT", phaseId: "default", batchId: "overrun-a" };
  const second: BatchRef = { experimentId: "TIGHT", phaseId: "default", batchId: "overrun-b" };
  try {
    reserve(store, first, 1, 1, 0.5);
    reserve(store, second, 1, 1, 0.5);
    store.beginCall({
      ...first,
      idempotencyKey: "phase-overrun-begin",
      callId: "phase-overrun-call",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 0.4,
    }, { apply: true });
    store.settleCall({
      idempotencyKey: "phase-overrun-settle",
      callId: "phase-overrun-call",
      outcome: "success",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.6,
      latencyMs: 1,
      usageFinal: true,
    }, { apply: true });
    expectCode(
      () => store.beginCall({
        ...second,
        idempotencyKey: "phase-overrun-sibling-begin",
        callId: "phase-overrun-sibling-call",
        callKind: "evaluation",
        stage: "judge",
        model: MODEL,
        reservedCostUsd: 0,
      }, { apply: true }),
      "PHASE_COST_CAP_BREACHED",
    );
  } finally {
    store.close();
  }
}

async function testCrashLeaseAndOpenOutput(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "crash-lease");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    beginCandidateCall(store, DEFAULT_REF, "crash-call", ["crash-candidate"], 0.7);
    assert.equal(store.summary().unresolvedCalls, 1);
    assert.equal(store.summary().openCandidateSlots, 1);
    expectCode(
      () => store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "finalize-inflight" }, { apply: true }),
      "UNRESOLVED_CALLS",
    );
    settle(store, "crash-call", "unknown", 0);
    expectCode(
      () => store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "finalize-unclassified" }, { apply: true }),
      "OPEN_CANDIDATES",
    );
    classify(store, "crash-call", 0, [{
      candidateSlotId: "crash-candidate",
      status: "no_candidate",
      failureReason: "process_crash_after_response",
    }]);
    expectCode(
      () => store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "finalize-before-billing" }, { apply: true }),
      "UNFINALIZED_USAGE",
    );
    store.reconcileCallUsage({
      idempotencyKey: "crash-call-final-billing",
      callId: "crash-call",
      inputTokens: 10,
      outputTokens: 0,
      costUsd: 0,
      usageFinal: true,
    }, { apply: true });
    store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "finalize-crash-closed" }, { apply: true });
  } finally {
    store.close();
  }
}

async function testRetryProducerLineage(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "retry-lineage");
  try {
    reserve(store, DEFAULT_REF, 3, 4, 2);
    beginCandidateCall(store, DEFAULT_REF, "retry-1", ["retry-c1"], 0.1, {
      logicalOperationId: "retry-operation",
      physicalAttemptOrdinal: 0,
    });
    settle(store, "retry-1", "failed");
    classify(store, "retry-1", 0, [{
      candidateSlotId: "retry-c1",
      status: "no_candidate",
      failureReason: "transport_failure",
    }]);
    expectCode(
      () => beginCandidateCall(store, DEFAULT_REF, "retry-duplicate-ordinal", ["never-reserved"], 0.1, {
        logicalOperationId: "retry-operation",
        physicalAttemptOrdinal: 0,
      }),
      "LOGICAL_ATTEMPT_EXISTS",
    );
    expectCode(
      () => beginCandidateCall(store, DEFAULT_REF, "invalid-parent-repair", ["never-reserved"], 0.1, {
        logicalOperationId: "invalid-parent-operation",
        physicalAttemptOrdinal: 0,
        parentCandidateSlotId: "retry-c1",
      }),
      "INVALID_PARENT_CANDIDATE",
    );

    beginCandidateCall(store, DEFAULT_REF, "retry-2", ["retry-c2"], 0.1, {
      logicalOperationId: "retry-operation",
      physicalAttemptOrdinal: 1,
    });
    settle(store, "retry-2");
    classify(store, "retry-2", 0, [{
      candidateSlotId: "retry-c2",
      status: "no_candidate",
      failureReason: "schema_parse_failure",
    }]);

    beginCandidateCall(store, DEFAULT_REF, "retry-3", ["retry-c3"], 0.1, {
      logicalOperationId: "retry-operation",
      physicalAttemptOrdinal: 2,
    });
    settle(store, "retry-3");
    classify(store, "retry-3", 1, [{
      candidateSlotId: "retry-c3",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("retry-final-question"),
    }]);
    finish(store, [{ candidateSlotId: "retry-c3", outcome: "parsed_accepted" }], "retry-gate");
    assert.equal(store.summary().usedAttemptSlots, 3);

    const exported = await store.exportArtifacts(join(root, "retry-export"));
    const snapshot = JSON.parse(await readFile(exported.snapshotPath, "utf8"));
    const byId = new Map(snapshot.candidateSlots.map(
      (candidate: { candidate_slot_id: string }) => [candidate.candidate_slot_id, candidate],
    ));
    assert.equal((byId.get("retry-c1") as { terminal_call_id: string }).terminal_call_id, "retry-1");
    assert.equal((byId.get("retry-c2") as { terminal_call_id: string }).terminal_call_id, "retry-2");
    assert.equal((byId.get("retry-c3") as { producing_call_id: string }).producing_call_id, "retry-3");
    const retryCalls = snapshot.providerCalls
      .filter((call: { logical_operation_id: string }) => call.logical_operation_id === "retry-operation")
      .map((call: { physical_attempt_ordinal: number }) => call.physical_attempt_ordinal)
      .sort();
    assert.deepEqual(retryCalls, [0, 1, 2]);
  } finally {
    store.close();
  }
}

async function testRepairCreatesNewSlot(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "repair-lineage");
  try {
    reserve(store, DEFAULT_REF, 2, 3, 2);
    beginCandidateCall(store, DEFAULT_REF, "original-call", ["original-candidate"], 0.1, {
      logicalOperationId: "repair-operation",
      physicalAttemptOrdinal: 0,
    });
    settle(store, "original-call");
    classify(store, "original-call", 1, [{
      candidateSlotId: "original-candidate",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("original"),
    }]);
    finish(store, [{ candidateSlotId: "original-candidate", outcome: "parsed_rejected" }], "reject-original");

    beginCandidateCall(store, DEFAULT_REF, "repair-call", ["repair-candidate"], 0.1, {
      logicalOperationId: "repair-operation",
      physicalAttemptOrdinal: 1,
      parentCandidateSlotId: "original-candidate",
    });
    settle(store, "repair-call");
    classify(store, "repair-call", 1, [{
      candidateSlotId: "repair-candidate",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("repaired"),
    }]);
    finish(store, [{ candidateSlotId: "repair-candidate", outcome: "parsed_accepted" }], "accept-repair");
    assert.equal(store.summary().usedAttemptSlots, 2);
  } finally {
    store.close();
  }
}

async function testTwoStageFinalization(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "two-stage");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    beginCandidateCall(store, DEFAULT_REF, "pending-call", ["pending-candidate"]);
    settle(store, "pending-call");
    const classificationInput = {
      idempotencyKey: "pending-parse",
      callId: "pending-call",
      observedParsedOutputCount: 1,
      results: [{
        candidateSlotId: "pending-candidate",
        status: "parsed" as const,
        outputIndex: 0,
        outputHash: hashProviderOutput("pending"),
      }],
    };
    const first = store.classifyCandidateCall(classificationInput, { apply: true });
    assert.equal(first.value.candidates[0]?.state, "parsed_pending");
    assert.equal(store.classifyCandidateCall(classificationInput, { apply: true }).idempotent, true);
    assert.equal(store.summary().parsedPendingCandidateSlots, 1);
    expectCode(
      () => store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "pending-finalize" }, { apply: true }),
      "PENDING_CANDIDATES",
    );
    const decision = {
      idempotencyKey: "pending-gate",
      decisions: [{ candidateSlotId: "pending-candidate", outcome: "parsed_rejected" as const }],
    };
    store.finalizeParsedCandidates(decision, { apply: true });
    assert.equal(store.finalizeParsedCandidates(decision, { apply: true }).idempotent, true);
    expectCode(
      () => store.finalizeParsedCandidates({
        idempotencyKey: "second-decision",
        decisions: [{ candidateSlotId: "pending-candidate", outcome: "parsed_accepted" }],
      }, { apply: true }),
      "CANDIDATE_NOT_PENDING",
    );
  } finally {
    store.close();
  }
}

async function testMultiOutputShortage(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "multi-shortage");
  try {
    reserve(store, DEFAULT_REF, 3, 2, 2);
    beginCandidateCall(store, DEFAULT_REF, "multi-call", ["multi-1", "multi-2", "multi-3"]);
    settle(store, "multi-call");
    const receipt = store.classifyCandidateCall({
      idempotencyKey: "multi-classify",
      callId: "multi-call",
      observedParsedOutputCount: 2,
      results: [
        { candidateSlotId: "multi-1", status: "parsed", outputIndex: 0, outputHash: hashProviderOutput("m1") },
        { candidateSlotId: "multi-2", status: "parsed", outputIndex: 1, outputHash: hashProviderOutput("m2") },
        { candidateSlotId: "multi-3", status: "no_candidate", failureReason: "missing_expected_output" },
      ],
    }, { apply: true });
    assert.equal(receipt.value.overflowOutputCount, 0);
    const missing = receipt.value.candidates.find((candidate) => candidate.candidateSlotId === "multi-3");
    assert.equal(missing?.outcome, "no_candidate");
    assert.equal(missing?.outputHash, null);
    assert.equal(missing?.outputIndex, null);
    finish(store, [
      { candidateSlotId: "multi-1", outcome: "parsed_accepted" },
      { candidateSlotId: "multi-2", outcome: "parsed_rejected" },
    ], "multi-gate");
    store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "multi-finish" }, { apply: true });
  } finally {
    store.close();
  }
}

async function testMultiOutputOverflowBreaches(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "multi-overflow");
  const siblingRef: BatchRef = { ...DEFAULT_REF, batchId: "overflow-sibling" };
  try {
    reserve(store, DEFAULT_REF, 2, 3, 2);
    reserve(store, siblingRef, 1, 2, 1);
    beginCandidateCall(store, DEFAULT_REF, "overflow-call", ["overflow-candidate"]);
    settle(store, "overflow-call");
    const classified = store.classifyCandidateCall({
      idempotencyKey: "overflow-classify",
      callId: "overflow-call",
      observedParsedOutputCount: 2,
      results: [{
        candidateSlotId: "overflow-candidate",
        status: "parsed",
        outputIndex: 0,
        outputHash: hashProviderOutput("admitted-output"),
      }],
    }, { apply: true });
    assert.equal(classified.value.overflowOutputCount, 1);
    assert.equal(classified.summary.breachedBatches, 1);
    expectCode(
      () => beginCandidateCall(store, DEFAULT_REF, "blocked-after-output-overflow", ["never-created"]),
      "CAMPAIGN_CANDIDATE_OVERFLOW",
    );
    expectCode(
      () => beginCandidateCall(store, siblingRef, "blocked-sibling-after-overflow", ["never-created-sibling"]),
      "CAMPAIGN_CANDIDATE_OVERFLOW",
    );
    finish(store, [{ candidateSlotId: "overflow-candidate", outcome: "parsed_rejected" }], "overflow-gate");
  } finally {
    store.close();
  }
}

async function testOutputUniqueness(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "output-uniqueness");
  try {
    reserve(store, DEFAULT_REF, 3, 3, 2);
    beginCandidateCall(store, DEFAULT_REF, "unique-call-1", ["unique-1", "unique-2"]);
    settle(store, "unique-call-1");
    expectCode(
      () => classify(store, "unique-call-1", 2, [
        { candidateSlotId: "unique-1", status: "parsed", outputIndex: 0, outputHash: hashProviderOutput("u1") },
        { candidateSlotId: "unique-2", status: "parsed", outputIndex: 0, outputHash: hashProviderOutput("u2") },
      ], "duplicate-index"),
      "DUPLICATE_OUTPUT_ID",
    );
    const firstHash = hashProviderOutput("unique-first");
    classify(store, "unique-call-1", 2, [
      { candidateSlotId: "unique-1", status: "parsed", outputIndex: 0, outputHash: firstHash },
      { candidateSlotId: "unique-2", status: "parsed", outputIndex: 1, outputHash: hashProviderOutput("unique-second") },
    ], "valid-first-call");
    beginCandidateCall(store, DEFAULT_REF, "unique-call-2", ["unique-3"]);
    settle(store, "unique-call-2");
    expectCode(
      () => classify(store, "unique-call-2", 1, [{
        candidateSlotId: "unique-3",
        status: "parsed",
        outputIndex: 0,
        outputHash: firstHash,
      }], "duplicate-hash"),
      "DUPLICATE_OUTPUT_HASH",
    );
    classify(store, "unique-call-2", 0, [{
      candidateSlotId: "unique-3",
      status: "no_candidate",
      failureReason: "duplicate_normalized_output_rejected",
    }], "close-duplicate-hash-call");
  } finally {
    store.close();
  }
}

async function testConcurrentCandidateOperations(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "concurrent-candidates");
  try {
    reserve(store, DEFAULT_REF, 2, 3, 2);
    const session = store.createSession(DEFAULT_REF);
    const makeCall = (index: number) => session.runCandidateOutputCall({
      ...DEFAULT_REF,
      idempotencyKey: `concurrent-${index}`,
      callId: `concurrent-${index}`,
      stage: "generation",
      model: MODEL,
      reservedCostUsd: 0.1,
      expectedCandidateOutputs: 1,
      candidateSlotIds: [`concurrent-candidate-${index}`],
      invoke: async () => {
        await Promise.resolve();
        return { index };
      },
      observeSuccess: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 0.05 }),
    });
    const [first, second] = await Promise.all([makeCall(1), makeCall(2)]);
    assert.deepEqual(first.candidateSlotIds, ["concurrent-candidate-1"]);
    assert.deepEqual(second.candidateSlotIds, ["concurrent-candidate-2"]);
    assert.equal(store.summary().usedAttemptSlots, 2);
    for (const index of [1, 2]) {
      classify(store, `concurrent-${index}`, 1, [{
        candidateSlotId: `concurrent-candidate-${index}`,
        status: "parsed",
        outputIndex: 0,
        outputHash: hashProviderOutput(`concurrent-output-${index}`),
      }]);
    }
    finish(store, [
      { candidateSlotId: "concurrent-candidate-1", outcome: "parsed_accepted" },
      { candidateSlotId: "concurrent-candidate-2", outcome: "parsed_accepted" },
    ], "concurrent-gate");
  } finally {
    store.close();
  }
}

async function testPermanentRetrySlots(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "permanent-retry-slots");
  try {
    reserve(store, DEFAULT_REF, 2, 4, 2);
    for (const index of [1, 2]) {
      beginCandidateCall(store, DEFAULT_REF, `empty-${index}`, [`empty-candidate-${index}`]);
      settle(store, `empty-${index}`, "failed");
      classify(store, `empty-${index}`, 0, [{
        candidateSlotId: `empty-candidate-${index}`,
        status: "no_candidate",
        failureReason: "retry_failed",
      }]);
    }
    expectCode(
      () => beginCandidateCall(store, DEFAULT_REF, "empty-3", ["empty-candidate-3"]),
      "BATCH_SLOT_CAP_EXCEEDED",
    );
    assert.equal(store.summary().usedAttemptSlots, 2);
  } finally {
    store.close();
  }
}

async function testLadderAndFailedRepairLineage(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "ladder-repair-lineage");
  try {
    reserve(store, DEFAULT_REF, 4, 6, 3);
    const session = store.createSession(DEFAULT_REF);
    await session.runProviderCall({
      ...DEFAULT_REF,
      idempotencyKey: "answer-only-design",
      callId: "answer-only-design",
      callKind: "design",
      stage: "answer-design",
      model: MODEL,
      reservedCostUsd: 0.1,
      logicalOperationId: "ladder-operation",
      physicalAttemptOrdinal: 0,
      invoke: async () => ({ answer: "designed only" }),
      observeSuccess: () => ({ inputTokens: 5, outputTokens: 2, costUsd: 0.05 }),
    });
    assert.equal(store.summary().usedAttemptSlots, 0);

    beginCandidateCall(store, DEFAULT_REF, "base-candidate-call", ["base-candidate"], 0.1, {
      logicalOperationId: "base-repair-operation",
      physicalAttemptOrdinal: 0,
    });
    settle(store, "base-candidate-call");
    classify(store, "base-candidate-call", 1, [{
      candidateSlotId: "base-candidate",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("base-candidate"),
    }]);
    const repairError = new Error("repair did not return a full candidate");
    await assert.rejects(session.runCandidateOutputCall({
      ...DEFAULT_REF,
      idempotencyKey: "failed-repair-call",
      callId: "failed-repair-call",
      stage: "candidate-repair",
      model: MODEL,
      reservedCostUsd: 0.1,
      logicalOperationId: "base-repair-operation",
      physicalAttemptOrdinal: 1,
      parentCandidateSlotId: "base-candidate",
      expectedCandidateOutputs: 1,
      candidateSlotIds: ["failed-repair-candidate"],
      invoke: async (): Promise<{ text: string }> => {
        throw repairError;
      },
      observeSuccess: () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }),
    }), (error: unknown) => error === repairError);
    finish(store, [{ candidateSlotId: "base-candidate", outcome: "parsed_accepted" }], "retain-base");

    beginCandidateCall(store, DEFAULT_REF, "add-decoys-call", ["add-decoys-candidate"], 0.1, {
      logicalOperationId: "ladder-operation",
      physicalAttemptOrdinal: 1,
    });
    settle(store, "add-decoys-call");
    classify(store, "add-decoys-call", 1, [{
      candidateSlotId: "add-decoys-candidate",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("partial-add-decoys"),
    }]);
    finish(store, [{ candidateSlotId: "add-decoys-candidate", outcome: "parsed_rejected" }], "reject-partial");

    beginCandidateCall(store, DEFAULT_REF, "hard-regen-call", ["hard-regen-candidate"], 0.1, {
      logicalOperationId: "ladder-operation",
      physicalAttemptOrdinal: 2,
      parentCandidateSlotId: "add-decoys-candidate",
    });
    settle(store, "hard-regen-call");
    classify(store, "hard-regen-call", 1, [{
      candidateSlotId: "hard-regen-candidate",
      status: "parsed",
      outputIndex: 0,
      outputHash: hashProviderOutput("hard-regenerated-candidate"),
    }]);
    finish(store, [{ candidateSlotId: "hard-regen-candidate", outcome: "parsed_accepted" }], "accept-hard-regen");
    assert.equal(store.summary().usedAttemptSlots, 4);
    assert.equal(store.summary().providerCalls, 5);
  } finally {
    store.close();
  }
}

async function testDelayedReconciliation(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "reconciliation");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    store.beginCall({
      ...DEFAULT_REF,
      idempotencyKey: "reconcile-begin",
      callId: "reconcile-call",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 1,
    }, { apply: true });
    settle(store, "reconcile-call", "unknown", 0.2);
    expectCode(
      () => store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "reconcile-too-early" }, { apply: true }),
      "UNFINALIZED_USAGE",
    );
    const reconciled = store.reconcileCallUsage({
      idempotencyKey: "reconcile-late",
      callId: "reconcile-call",
      inputTokens: 120,
      outputTokens: 40,
      costUsd: 1.5,
      usageFinal: true,
      providerRequestId: "provider-request-1",
    }, { apply: true });
    assert.equal(reconciled.value.actualCostUsd, 1.5);
    assert.equal(reconciled.summary.breachedBatches, 1);
    store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "reconcile-finalize" }, { apply: true });
  } finally {
    store.close();
  }
}

async function testReconciliationIdentityAndFinality(root: string, registryPath: string): Promise<void> {
  const store = openStore(root, registryPath, "reconciliation-integrity");
  try {
    reserve(store, DEFAULT_REF, 1, 2, 2);
    store.beginCall({
      ...DEFAULT_REF,
      idempotencyKey: "integrity-begin",
      callId: "integrity-call",
      callKind: "evaluation",
      stage: "judge",
      model: MODEL,
      reservedCostUsd: 1,
    }, { apply: true });
    store.settleCall({
      idempotencyKey: "integrity-settle",
      callId: "integrity-call",
      outcome: "success",
      inputTokens: 100,
      outputTokens: 10,
      costUsd: 0.5,
      latencyMs: 1,
      usageFinal: true,
      providerRequestId: "provider-request-original",
    }, { apply: true });
    expectCode(
      () => store.reconcileCallUsage({
        idempotencyKey: "integrity-downgrade",
        callId: "integrity-call",
        inputTokens: 100,
        outputTokens: 10,
        costUsd: 0.5,
        usageFinal: false,
      }, { apply: true }),
      "USAGE_FINAL_DOWNGRADE",
    );
    expectCode(
      () => store.reconcileCallUsage({
        idempotencyKey: "integrity-request-conflict",
        callId: "integrity-call",
        inputTokens: 100,
        outputTokens: 10,
        costUsd: 0.5,
        usageFinal: true,
        providerRequestId: "provider-request-other",
      }, { apply: true }),
      "PROVIDER_REQUEST_ID_CONFLICT",
    );
    store.finalizeBatch({ ...DEFAULT_REF, idempotencyKey: "integrity-finalize" }, { apply: true });
  } finally {
    store.close();
  }
}

async function testCanonicalStoreRequiresExplicitInitialization(root: string): Promise<void> {
  if (process.platform !== "win32") return;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const libraryRoot = join(root, "canonical-library-root");
  const cliRoot = join(root, "canonical-cli-root");
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(cliRoot, { recursive: true });
  try {
    process.env.LOCALAPPDATA = libraryRoot;
    const libraryPath = getCanonicalStorePath();
    expectCode(() => openCanonicalBudgetStore(), "STORE_NOT_INITIALIZED");
    await assert.rejects(stat(libraryPath));

    await mkdir(dirname(libraryPath), { recursive: true });
    await writeFile(libraryPath, "", "utf8");
    expectCode(() => openCanonicalBudgetStore(), "STORE_NOT_INITIALIZED");
    await rm(libraryPath, { force: true });
    const partial = new DatabaseSync(libraryPath);
    try {
      partial.exec(`CREATE TABLE campaigns (
        campaign_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        attempt_slot_cap INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
      partial.prepare("INSERT INTO campaigns VALUES (?, 4, 1000, ?)").run(
        "question-quality-20260715",
        "2026-07-15T00:00:00.000Z",
      );
    } finally {
      partial.close();
    }
    expectCode(() => openCanonicalBudgetStore(), "STORE_SCHEMA_INCOMPLETE");
    await Promise.all([
      rm(libraryPath, { force: true }),
      rm(`${libraryPath}-wal`, { force: true }),
      rm(`${libraryPath}-shm`, { force: true }),
    ]);
    const initialized = initializeCanonicalBudgetStore();
    initialized.close();
    const reopened = openCanonicalBudgetStore();
    try {
      assert.equal(reopened.summary().attemptSlotCap, 1_000);
    } finally {
      reopened.close();
    }

    const cliEnv = { LOCALAPPDATA: cliRoot };
    const status = await runProcess(CLI, ["status"], cliEnv);
    assert.equal(status.code, 1);
    assert.equal(JSON.parse(status.stderr).code, "STORE_NOT_INITIALIZED");
    const cliPath = join(
      cliRoot,
      "Codex",
      "research-ledgers",
      "question-quality-20260715.sqlite",
    );
    await assert.rejects(stat(cliPath));

    const preview = await runProcess(CLI, [
      "reserve-batch",
      "--experiment-id", "G-PAIR-001",
      "--phase-id", "default",
      "--batch-id", "preview",
      "--idempotency-key", "preview",
      "--candidate-slots", "1",
      "--max-provider-calls", "1",
      "--max-cost-usd", "1",
    ], cliEnv);
    assert.equal(preview.code, 1);
    assert.equal(JSON.parse(preview.stderr).code, "STORE_NOT_INITIALIZED");
    await assert.rejects(stat(cliPath));
  } finally {
    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }
  }
}

async function testConcurrentGlobalCap(root: string, registryPath: string): Promise<void> {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const storePath = join(root, `concurrent-global-${iteration}.sqlite`);
    const initialize = openTestBudgetStore(storePath, registryPath);
    initialize.close();
    const [first, second] = await Promise.all([
      runProcess(WORKER, [storePath, registryPath, "BIG-A", "batch-a", "600"]),
      runProcess(WORKER, [storePath, registryPath, "BIG-B", "batch-b", "600"]),
    ]);
    assert.deepEqual([first.code, second.code].sort(), [0, 1]);
    const failure = first.code === 1 ? first : second;
    assert.equal(JSON.parse(failure.stderr).code, "GLOBAL_CAP_EXCEEDED");
    const verify = openTestBudgetStore(storePath, registryPath);
    try {
      assert.equal(verify.summary().reservedAttemptSlots, 600);
      verify.verifyAuditChain();
    } finally {
      verify.close();
    }
  }
}

async function testCrossProcessPreNetworkReservation(root: string, registryPath: string): Promise<void> {
  const storePath = join(root, "concurrent-begin-call.sqlite");
  const ref: BatchRef = { experimentId: "EXP-A", phaseId: "default", batchId: "concurrent-begin" };
  const initialize = openTestBudgetStore(storePath, registryPath);
  try {
    reserve(initialize, ref, 1, 2, 1);
  } finally {
    initialize.close();
  }
  const [first, second] = await Promise.all([
    runProcess(BEGIN_CALL_WORKER, [
      storePath,
      registryPath,
      ref.experimentId,
      ref.batchId,
      "concurrent-begin-a",
      "concurrent-slot-a",
    ]),
    runProcess(BEGIN_CALL_WORKER, [
      storePath,
      registryPath,
      ref.experimentId,
      ref.batchId,
      "concurrent-begin-b",
      "concurrent-slot-b",
    ]),
  ]);
  assert.deepEqual([first.code, second.code].sort(), [0, 1]);
  const failure = first.code === 1 ? first : second;
  assert.equal(JSON.parse(failure.stderr).code, "BATCH_SLOT_CAP_EXCEEDED");
  const verify = openTestBudgetStore(storePath, registryPath);
  try {
    const summary = verify.summary();
    assert.equal(summary.usedAttemptSlots, 1);
    assert.equal(summary.unresolvedCalls, 1);
    verify.verifyAuditChain();
  } finally {
    verify.close();
  }
}

async function testCliFixedPath(root: string): Promise<void> {
  const fake = join(root, "forbidden.sqlite");
  for (const option of ["--store", "--ledger"]) {
    const result = await runProcess(CLI, ["status", option, fake]);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stderr).code, "INVALID_ARGUMENT");
  }
  const help = await runProcess(CLI, ["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /budget guard v4/);
  assert.match(help.stdout, /runCandidateOutputCall/);
  const preview = await runProcess(CLI, ["init", "--dry-run"]);
  assert.equal(preview.code, 0);
  assert.equal(JSON.parse(preview.stdout).dryRun, true);
  await assert.rejects(stat(fake));
}

async function testAuditExportSchemaAndTimestamps(root: string, registryPath: string): Promise<void> {
  const storePath = join(root, "audit-export.sqlite");
  const store = openTestBudgetStore(storePath, registryPath);
  try {
    reserve(store, DEFAULT_REF, 1);
    const exported = await store.exportArtifacts(join(root, "exports"));
    const manifest = JSON.parse(await readFile(exported.manifestPath, "utf8"));
    const snapshot = JSON.parse(await readFile(exported.snapshotPath, "utf8"));
    assert.equal(manifest.schemaVersion, 4);
    assert.equal(snapshot.summary.schemaVersion, 4);
    assert.equal(manifest.auditHeadHash, store.summary().auditHeadHash);
    const backupDb = new DatabaseSync(exported.backupPath);
    try {
      assert.equal(backupDb.prepare("SELECT schema_version FROM campaigns").get()?.schema_version, 4);
    } finally {
      backupDb.close();
    }
  } finally {
    store.close();
  }

  const raw = new DatabaseSync(storePath);
  try {
    assert.throws(() => raw.exec("UPDATE audit_events SET payload_json = '{}' WHERE sequence = 1"));
    assert.throws(() => raw.exec("DELETE FROM audit_events WHERE sequence = 1"));
    assert.throws(() => raw.exec("UPDATE operations SET entity_id = 'tampered'"));
    assert.throws(() => raw.exec("DELETE FROM operations"));
    raw.exec("DROP TRIGGER audit_events_no_update");
    raw.exec("UPDATE audit_events SET payload_json = '{}' WHERE sequence = 1");
  } finally {
    raw.close();
  }
  expectCode(() => openTestBudgetStore(storePath, registryPath), "AUDIT_CHAIN_INVALID");

  const v2Path = join(root, "old-v2.sqlite");
  const old = new DatabaseSync(v2Path);
  try {
    old.exec(`CREATE TABLE campaigns (
      campaign_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL CHECK (schema_version = 2),
      attempt_slot_cap INTEGER NOT NULL CHECK (attempt_slot_cap = 1000),
      created_at TEXT NOT NULL
    );`);
    old.prepare("INSERT INTO campaigns VALUES (?, 2, 1000, ?)").run(
      "question-quality-20260715",
      "2026-07-15T00:00:00.000Z",
    );
  } finally {
    old.close();
  }
  expectCode(() => openTestBudgetStore(v2Path, registryPath), "SCHEMA_MIGRATION_REQUIRED");
  assert.doesNotThrow(() => assertStrictTimestamp("2026-07-15T01:02:03.004Z"));
  assert.doesNotThrow(() => assertStrictTimestamp("2026-07-15T10:02:03.004+09:00"));
  expectCode(() => assertStrictTimestamp("0"), "INVALID_TIMESTAMP");
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "question-quality-budget-v4-"));
  const registryPath = await createRegistry(root);
  const tests: Array<[string, () => Promise<void>]> = [
    ["dry-run and preregistered phase allocation", () => testDryRunAndAllocation(root, registryPath)],
    ["registry revocation fail-close and reservation replay", () => testRegistryRevocationAndReplay(root)],
    ["phase call/USD capacity release after finalization", () => testPhaseCapacityRelease(root, registryPath)],
    ["pre-network candidate slots and physical replay prevention", () => testPreNetworkSlotAndReplay(root, registryPath)],
    ["candidate versus design/evaluation call contracts and caps", () => testCallKindsAndCaps(root, registryPath)],
    ["provider and observation failures settle and close candidate slots", () => testProviderFailures(root, registryPath)],
    ["actual cost overrun is retained and breaches batch", () => testOverrunBreach(root, registryPath)],
    ["phase cost overrun blocks sibling batches", () =>
      testPhaseCostOverrunBlocksSiblingBatch(root, registryPath)],
    ["crash lease and unclassified response block finalization", () => testCrashLeaseAndOpenOutput(root, registryPath)],
    ["multi-retry no-candidate lineage selects actual producer", () => testRetryProducerLineage(root, registryPath)],
    ["full-candidate repair consumes a distinct permanent slot", () => testRepairCreatesNewSlot(root, registryPath)],
    ["parsed-pending requires one accepted/rejected terminal decision", () => testTwoStageFinalization(root, registryPath)],
    ["multi-output shortage closes missing output without fake identity", () => testMultiOutputShortage(root, registryPath)],
    ["multi-output overflow breaches pre-network reservation", () => testMultiOutputOverflowBreaches(root, registryPath)],
    ["parsed output identity and hash remain campaign-unique", () => testOutputUniqueness(root, registryPath)],
    ["concurrent candidate operations retain isolated call lineage", () => testConcurrentCandidateOperations(root, registryPath)],
    ["failed retries permanently consume candidate attempt slots", () => testPermanentRetrySlots(root, registryPath)],
    ["answer-only ladder, failed repair, partial output, and hard regen lineage", () =>
      testLadderAndFailedRepairLineage(root, registryPath)],
    ["billing reconciliation is required before batch finalization", () => testDelayedReconciliation(root, registryPath)],
    ["billing reconciliation preserves finality and provider identity", () =>
      testReconciliationIdentityAndFinality(root, registryPath)],
    ["canonical store requires explicit initialization", () =>
      testCanonicalStoreRequiresExplicitInitialization(root)],
    ["cross-process global-cap transaction", () => testConcurrentGlobalCap(root, registryPath)],
    ["cross-process pre-network candidate reservation", () =>
      testCrossProcessPreNetworkReservation(root, registryPath)],
    ["CLI rejects alternate stores and exposes v4 contracts", () => testCliFixedPath(root)],
    ["audit chain, export, schema migration refusal, timestamps", () => testAuditExportSchemaAndTimestamps(root, registryPath)],
  ];
  try {
    for (const [name, test] of tests) {
      await test();
      process.stdout.write(`PASS ${name}\n`);
    }
    process.stdout.write(`PASS ${tests.length}/${tests.length} budget-guard v4 tests\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? `${error.name}: ${error.message}` : "Unknown failure"}\n`);
  process.exitCode = 1;
});
