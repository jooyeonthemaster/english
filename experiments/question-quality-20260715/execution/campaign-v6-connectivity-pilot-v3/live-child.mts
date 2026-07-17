import path from "node:path";
import { fileURLToPath } from "node:url";

import * as productionRunnerModule from "./production-runner";

const productionRunnerExports =
  (productionRunnerModule as unknown as { default?: typeof productionRunnerModule }).default ?? productionRunnerModule;
const { runSealedConnectivityPilotV3 } = productionRunnerExports;

const LIVE_CHILD_ENV = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V3_LIVE_CHILD";
const ALLOWED_EXACT = new Set([
  "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC",
  "OPENROUTER_API_KEY", LIVE_CHILD_ENV,
]);
const CREDENTIAL_LIKE = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|OPENROUTER|GEMINI|ANTHROPIC|ATLAS|QGEN)/iu;

function assertMinimalEnvironment(): void {
  for (const name of Object.keys(process.env)) {
    if (CREDENTIAL_LIKE.test(name) && !ALLOWED_EXACT.has(name)) {
      throw new Error("live child received a non-allowlisted credential-like environment name");
    }
  }
  if (process.env[LIVE_CHILD_ENV] !== "1") throw new Error("live child marker missing");
}

async function main(): Promise<void> {
  assertMinimalEnvironment();
  const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice("--run-id=".length);
  const snapshot = process.argv.find((value) => value.startsWith("--price-snapshot="))?.slice("--price-snapshot=".length);
  if (!runId || !snapshot) throw new Error("live child requires run id and private price snapshot path");
  const result = await runSealedConnectivityPilotV3({ runId, priceSnapshotPath: snapshot });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
