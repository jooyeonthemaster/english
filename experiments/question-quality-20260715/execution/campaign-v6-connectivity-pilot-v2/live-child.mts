import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitGenericFatal = (): void => {
  process.exitCode = 1;
  process.stderr.write("ISOLATED_CONNECTIVITY_PILOT_CHILD_FAILED\n");
};
process.once("uncaughtException", emitGenericFatal);
process.once("unhandledRejection", emitGenericFatal);

const here = path.dirname(fileURLToPath(import.meta.url));
const privateRoot = realpathSync.native(path.join(here, "private"));
const cwd = realpathSync.native(process.cwd());
const executionName = process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_EXECUTION_NAME;

function fail(): never {
  throw new Error("ISOLATED_CONNECTIVITY_PILOT_CHILD_PREFLIGHT_FAILED");
}

if (
  process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD !== "1" ||
  typeof executionName !== "string" ||
  path.basename(cwd) !== executionName ||
  path.relative(privateRoot, cwd) !== executionName
) fail();

const allowedEnv = new Set([
  "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC",
  "OPENROUTER_API_KEY", "QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_EXECUTION_NAME",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_PRICE_SNAPSHOT",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_VALID_THROUGH",
]);
for (const name of Object.keys(process.env)) {
  if (!allowedEnv.has(name)) fail();
}
for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "NODE_OPTIONS", "NODE_PATH"]) {
  if (process.env[name] !== undefined) fail();
}

const snapshotPath = process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_PRICE_SNAPSHOT;
const validThrough = process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_VALID_THROUGH;
if (typeof snapshotPath !== "string" || typeof validThrough !== "string") fail();
const canonicalSnapshot = realpathSync.native(snapshotPath);
const snapshotRelative = path.relative(privateRoot, canonicalSnapshot);
if (snapshotRelative.startsWith("..") || path.isAbsolute(snapshotRelative)) fail();

const [ledgerModule, runnerModule] = await Promise.all([
  import("../../harness/ledger"),
  import("./runner"),
]);
const ledger = (ledgerModule as unknown as { default?: typeof ledgerModule }).default ?? ledgerModule;
const runner = (runnerModule as unknown as { default?: typeof runnerModule }).default ?? runnerModule;
const { BudgetStore } = ledger;
const snapshot = JSON.parse(readFileSync(canonicalSnapshot, "utf8")) as unknown;
const now = Date.now();
const materialized = runner.materializeConnectivityPilot({
  priceSnapshotId: `openrouter-schema-v2-${now}`,
  snapshot,
  validThrough,
  now,
});
const registryJson = runner.buildConnectivityPilotPrivateRegistryJson(materialized);
const store = BudgetStore.initializePreparedConnectivityPilotPrivateExecution({
  executionDirectoryName: executionName,
  registryJson,
});
try {
  const credential = runner.createPilotLiveCredentialCapabilityForIsolatedChild();
  process.env.OPENROUTER_API_KEY = "";
  delete process.env.OPENROUTER_API_KEY;
  const result = await runner.runConnectivityPilotLiveInIsolatedChild({
    materialized,
    store,
    rollingPricingAttestation: materialized.initialRollingPricingAttestation,
    credential,
  });
  runner.assertConnectivityPilotPublicResultPrivacy(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  store.close();
}
