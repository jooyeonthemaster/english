import { BudgetGuardError, openTestBudgetStore } from "./ledger";

async function main(): Promise<void> {
  if (process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE !== "1") {
    throw new BudgetGuardError("TEST_MODE_REQUIRED", "test-worker is test-only");
  }
  const [storePath, registryPath, experimentId, batchId, slotsRaw] = process.argv.slice(2);
  if (!storePath || !registryPath || !experimentId || !batchId || !slotsRaw) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "test-worker arguments are incomplete");
  }
  const store = openTestBudgetStore(storePath, registryPath);
  try {
    const result = store.reserveBatch(
      {
        experimentId,
        phaseId: "default",
        batchId,
        idempotencyKey: `worker:${experimentId}:${batchId}`,
        candidateSlots: Number(slotsRaw),
        maxProviderCalls: 2,
        maxCostUsd: 1,
      },
      { apply: true },
    );
    process.stdout.write(`${JSON.stringify({ ok: true, summary: result.summary })}\n`);
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
