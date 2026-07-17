#!/usr/bin/env node

import {
  BudgetGuardError,
  getCanonicalStorePath,
  initializeCanonicalBudgetStore,
  inspectCanonicalExperimentRegistry,
  openCanonicalBudgetStore,
  type BatchRef,
  type CandidateClassification,
  type ParsedCandidateDecision,
  type ProviderCallKind,
  type ProviderCallOutcome,
} from "./ledger";

const HELP = `Question-quality API budget guard v4

The campaign/store are fixed. Mutations are dry-runs unless --apply is present.
Only init --apply creates the canonical store; every other command fails closed if absent.

Commands:
  init [--apply]
  registry-status
  status
  verify
  reserve-batch --experiment-id ID --phase-id ID --batch-id ID --idempotency-key KEY
    --candidate-slots N --max-provider-calls N --max-cost-usd N [--apply]
  begin-call --experiment-id ID --phase-id ID --batch-id ID --idempotency-key KEY
    --call-id ID --call-kind full_question_generation|design|evaluation --stage ID --model ID
    --reserved-cost-usd N [--logical-operation-id ID] [--physical-attempt-ordinal N]
    [--parent-candidate-slot-id ID] [--expected-candidate-outputs N]
    [--candidate-slot-ids ID,ID] [--apply]
  settle-call --idempotency-key KEY --call-id ID --status success|failed|unknown
    --input-tokens N --output-tokens N --cost-usd N --latency-ms N
    --usage-final true|false [--provider-request-id ID] [--apply]
  classify-call --idempotency-key KEY --call-id ID --observed-parsed-output-count N
    --results-json JSON [--apply]
  finalize-parsed --idempotency-key KEY --decisions-json JSON [--apply]
  reconcile-call --idempotency-key KEY --call-id ID --input-tokens N --output-tokens N
    --cost-usd N --usage-final true|false [--provider-request-id ID] [--apply]
  finalize-batch --experiment-id ID --phase-id ID --batch-id ID --idempotency-key KEY [--apply]
  export --output-dir PATH [--apply]

There is intentionally no --ledger or --store option. Experiment runners must use
BudgetSession.runProviderCall rather than manually calling providers around this CLI.
Candidate-output calls must use BudgetSession.runCandidateOutputCall, then the
classification and parsed-finalization APIs.
`;

type ParsedArgs = {
  command: string;
  options: Map<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const options = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "Unexpected positional argument");
    }
    const key = token.slice(2);
    if (options.has(key)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", `Duplicate option --${key}`);
    }
    if (["apply", "dry-run", "help"].includes(key)) {
      options.set(key, true);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new BudgetGuardError("INVALID_ARGUMENT", `Option --${key} requires a value`);
    }
    options.set(key, value);
    index += 1;
  }
  return { command, options };
}

function assertAllowed(options: Map<string, string | boolean>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of options.keys()) {
    if (!allowedSet.has(key)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", `Unknown option --${key}`);
    }
  }
  if (options.has("apply") && options.has("dry-run")) {
    throw new BudgetGuardError("INVALID_ARGUMENT", "Choose either --apply or --dry-run");
  }
}

function required(options: Map<string, string | boolean>, key: string): string {
  const value = options.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `Missing required option --${key}`);
  }
  return value;
}

function optional(options: Map<string, string | boolean>, key: string): string | undefined {
  const value = options.get(key);
  return typeof value === "string" ? value : undefined;
}

function numeric(options: Map<string, string | boolean>, key: string, integer: boolean): number {
  const raw = required(options, key);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `Option --${key} is not a valid non-negative number`);
  }
  return value;
}

function booleanValue(options: Map<string, string | boolean>, key: string): boolean {
  const raw = required(options, key);
  if (raw !== "true" && raw !== "false") {
    throw new BudgetGuardError("INVALID_ARGUMENT", `Option --${key} must be true or false`);
  }
  return raw === "true";
}

function jsonArray<T>(options: Map<string, string | boolean>, key: string): T[] {
  const raw = required(options, key);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BudgetGuardError("INVALID_ARGUMENT", `Option --${key} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new BudgetGuardError("INVALID_ARGUMENT", `Option --${key} must be a JSON array`);
  }
  return parsed as T[];
}

function batchRef(options: Map<string, string | boolean>): BatchRef {
  return {
    experimentId: required(options, "experiment-id"),
    phaseId: required(options, "phase-id"),
    batchId: required(options, "batch-id"),
  };
}

function mutationAllowed(extra: string[]): string[] {
  return ["apply", "dry-run", "idempotency-key", ...extra];
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || options.has("help")) {
    if (options.size > (options.has("help") ? 1 : 0)) {
      throw new BudgetGuardError("INVALID_ARGUMENT", "--help cannot be combined with mutation options");
    }
    process.stdout.write(HELP);
    return;
  }

  if (command === "status" || command === "verify") {
    assertAllowed(options, []);
    const store = openCanonicalBudgetStore();
    try {
      if (command === "verify") store.verifyAuditChain();
      process.stdout.write(`${JSON.stringify({ ok: true, summary: store.summary() }, null, 2)}\n`);
    } finally {
      store.close();
    }
    return;
  }

  if (command === "registry-status") {
    assertAllowed(options, []);
    process.stdout.write(
      `${JSON.stringify({ ok: true, registry: inspectCanonicalExperimentRegistry() }, null, 2)}\n`,
    );
    return;
  }

  if (command === "init") {
    assertAllowed(options, ["apply", "dry-run"]);
    if (!options.has("apply")) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            dryRun: true,
            canonicalStorePath: getCanonicalStorePath(),
            registry: inspectCanonicalExperimentRegistry(),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    const store = initializeCanonicalBudgetStore();
    try {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            dryRun: false,
            canonicalStorePath: store.storePath,
            registry: inspectCanonicalExperimentRegistry(),
            summary: store.summary(),
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      store.close();
    }
    return;
  }

  if (command === "export") {
    assertAllowed(options, ["output-dir", "apply", "dry-run"]);
    const outputDir = required(options, "output-dir");
    if (!options.has("apply")) {
      process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, outputDir }, null, 2)}\n`);
      return;
    }
    const store = openCanonicalBudgetStore();
    try {
      const exported = await store.exportArtifacts(outputDir);
      process.stdout.write(`${JSON.stringify({ ok: true, dryRun: false, ...exported }, null, 2)}\n`);
    } finally {
      store.close();
    }
    return;
  }

  const apply = options.has("apply");
  let execute: ((store: ReturnType<typeof openCanonicalBudgetStore>) => unknown) | undefined;

  switch (command) {
    case "reserve-batch":
      assertAllowed(
        options,
        mutationAllowed([
          "experiment-id",
          "phase-id",
          "batch-id",
          "candidate-slots",
          "max-provider-calls",
          "max-cost-usd",
        ]),
      );
      execute = (store) =>
        store.reserveBatch(
          {
            ...batchRef(options),
            idempotencyKey: required(options, "idempotency-key"),
            candidateSlots: numeric(options, "candidate-slots", true),
            maxProviderCalls: numeric(options, "max-provider-calls", true),
            maxCostUsd: numeric(options, "max-cost-usd", false),
          },
          { apply },
        );
      break;
    case "begin-call": {
      assertAllowed(
        options,
        mutationAllowed([
          "experiment-id",
          "phase-id",
          "batch-id",
          "call-id",
          "call-kind",
          "stage",
          "model",
          "reserved-cost-usd",
          "logical-operation-id",
          "physical-attempt-ordinal",
          "parent-candidate-slot-id",
          "expected-candidate-outputs",
          "candidate-slot-ids",
        ]),
      );
      const rawKind = required(options, "call-kind");
      if (!["full_question_generation", "design", "evaluation"].includes(rawKind)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "Invalid --call-kind");
      }
      const slotList = optional(options, "candidate-slot-ids");
      execute = (store) =>
        store.beginCall(
          {
            ...batchRef(options),
            idempotencyKey: required(options, "idempotency-key"),
            callId: required(options, "call-id"),
            callKind: rawKind as ProviderCallKind,
            stage: required(options, "stage"),
            model: required(options, "model"),
            reservedCostUsd: numeric(options, "reserved-cost-usd", false),
            logicalOperationId: optional(options, "logical-operation-id"),
            physicalAttemptOrdinal: options.has("physical-attempt-ordinal")
              ? numeric(options, "physical-attempt-ordinal", true)
              : undefined,
            parentCandidateSlotId: optional(options, "parent-candidate-slot-id"),
            expectedCandidateOutputs: options.has("expected-candidate-outputs")
              ? numeric(options, "expected-candidate-outputs", true)
              : 0,
            candidateSlotIds: slotList ? slotList.split(",").filter(Boolean) : [],
          },
          { apply },
        );
      break;
    }
    case "settle-call": {
      assertAllowed(
        options,
        mutationAllowed([
          "call-id",
          "status",
          "input-tokens",
          "output-tokens",
          "cost-usd",
          "latency-ms",
          "usage-final",
          "provider-request-id",
        ]),
      );
      const rawStatus = required(options, "status");
      if (!["success", "failed", "unknown"].includes(rawStatus)) {
        throw new BudgetGuardError("INVALID_ARGUMENT", "Invalid --status");
      }
      execute = (store) =>
        store.settleCall(
          {
            idempotencyKey: required(options, "idempotency-key"),
            callId: required(options, "call-id"),
            outcome: rawStatus as ProviderCallOutcome,
            inputTokens: numeric(options, "input-tokens", true),
            outputTokens: numeric(options, "output-tokens", true),
            costUsd: numeric(options, "cost-usd", false),
            latencyMs: numeric(options, "latency-ms", true),
            usageFinal: booleanValue(options, "usage-final"),
            providerRequestId: optional(options, "provider-request-id"),
          },
          { apply },
        );
      break;
    }
    case "classify-call": {
      assertAllowed(
        options,
        mutationAllowed([
          "call-id",
          "observed-parsed-output-count",
          "results-json",
        ]),
      );
      execute = (store) =>
        store.classifyCandidateCall(
          {
            idempotencyKey: required(options, "idempotency-key"),
            callId: required(options, "call-id"),
            observedParsedOutputCount: numeric(
              options,
              "observed-parsed-output-count",
              true,
            ),
            results: jsonArray<CandidateClassification>(options, "results-json"),
          },
          { apply },
        );
      break;
    }
    case "finalize-parsed":
      assertAllowed(options, mutationAllowed(["decisions-json"]));
      execute = (store) =>
        store.finalizeParsedCandidates(
          {
            idempotencyKey: required(options, "idempotency-key"),
            decisions: jsonArray<ParsedCandidateDecision>(options, "decisions-json"),
          },
          { apply },
        );
      break;
    case "reconcile-call":
      assertAllowed(
        options,
        mutationAllowed([
          "call-id",
          "input-tokens",
          "output-tokens",
          "cost-usd",
          "usage-final",
          "provider-request-id",
        ]),
      );
      execute = (store) =>
        store.reconcileCallUsage(
          {
            idempotencyKey: required(options, "idempotency-key"),
            callId: required(options, "call-id"),
            inputTokens: numeric(options, "input-tokens", true),
            outputTokens: numeric(options, "output-tokens", true),
            costUsd: numeric(options, "cost-usd", false),
            usageFinal: booleanValue(options, "usage-final"),
            providerRequestId: optional(options, "provider-request-id"),
          },
          { apply },
        );
      break;
    case "finalize-batch":
      assertAllowed(
        options,
        mutationAllowed(["experiment-id", "phase-id", "batch-id"]),
      );
      execute = (store) =>
        store.finalizeBatch(
          {
            ...batchRef(options),
            idempotencyKey: required(options, "idempotency-key"),
          },
          { apply },
        );
      break;
    default:
      throw new BudgetGuardError("INVALID_COMMAND", "Unknown command; use --help");
  }

  const store = openCanonicalBudgetStore();
  try {
    const result = execute(store);
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof BudgetGuardError) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code, error: error.message })}\n`);
  } else {
    process.stderr.write(
      `${JSON.stringify({ ok: false, code: "UNEXPECTED", error: error instanceof Error ? error.message : "Unexpected failure" })}\n`,
    );
  }
  process.exitCode = 1;
});
