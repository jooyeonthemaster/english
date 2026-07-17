import { BudgetGuardError, openTestBudgetStore } from "./ledger";

async function main(): Promise<void> {
  if (process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE !== "1") {
    throw new BudgetGuardError("TEST_MODE_REQUIRED", "begin-call-worker is test-only");
  }
  const [storePath, registryPath, experimentId, batchId, callId, candidateSlotId] =
    process.argv.slice(2);
  if (!storePath || !registryPath || !experimentId || !batchId || !callId || !candidateSlotId) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "begin-call-worker arguments are incomplete");
  }
  const store = openTestBudgetStore(storePath, registryPath);
  try {
    const result = store.beginCall({
      experimentId,
      phaseId: "default",
      batchId,
      idempotencyKey: `worker-begin:${callId}`,
      callId,
      callKind: "full_question_generation",
      stage: "generation",
      model: "google/gemini-test",
      reservedCostUsd: 0.1,
      expectedCandidateOutputs: 1,
      candidateSlotIds: [candidateSlotId],
    }, { apply: true });
    process.stdout.write(`${JSON.stringify({ ok: true, call: result.value })}\n`);
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  const code = error instanceof BudgetGuardError ? error.code : "UNEXPECTED";
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${JSON.stringify({ ok: false, code, error: message })}\n`);
  process.exitCode = 1;
});
