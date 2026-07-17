import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { compileConnectivityPilotExactWire, paths } from "./compile-exact-wire.mts";
import * as protocolSchemaModule from "./protocol-schema";

const protocolSchemaExports =
  (protocolSchemaModule as unknown as { default?: typeof protocolSchemaModule }).default ??
  protocolSchemaModule;
const { validateConnectivityPilotProtocolV2 } = protocolSchemaExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const manifestPath = path.join(here, "MANIFEST.sha256");
const protocolPath = path.join(here, "protocol-v2.json");
const tsconfigPath = path.join(here, "tsconfig.json");
const testPath = path.join(here, "offline.test.ts");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

function safeChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"]) {
    const value = process.env[name];
    if (typeof value === "string") env[name] = value;
  }
  env.QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST_MODE = "1";
  env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
  return env;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: safeChildEnv(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`offline verification command failed (${path.basename(command)} ${args[0] ?? ""}): ${result.stderr.slice(0, 2000)}`);
  }
  return result.stdout;
}

function verifyManifest(): number {
  const rows = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  assert(rows.length >= 10);
  const seen = new Set<string>();
  for (const row of rows) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match, `invalid manifest row: ${row}`);
    const [, expected, relativePath] = match;
    assert(!seen.has(relativePath!), `duplicate manifest path ${relativePath}`);
    seen.add(relativePath!);
    const absolute = path.resolve(repoRoot, relativePath!);
    const relative = path.relative(repoRoot, absolute);
    assert(!relative.startsWith("..") && !path.isAbsolute(relative));
    assert.equal(sha256(readFileSync(absolute)), expected, `manifest drift at ${relativePath}`);
  }
  return rows.length;
}

function resolveLocalImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const candidates = [base, `${base}.ts`, `${base}.mts`, `${base}.tsx`, path.join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectImportClosure(entryPaths: string[]): string[] {
  const queue = entryPaths.map((entry) => path.resolve(repoRoot, entry));
  const visited = new Set<string>();
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gu;
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    const relative = path.relative(repoRoot, file);
    assert(!relative.startsWith("..") && !path.isAbsolute(relative), `closure escaped repo: ${file}`);
    const canonical = realpathSync.native(file);
    assert.equal(
      process.platform === "win32" ? canonical.toLowerCase() : canonical,
      process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file),
      `closure contains link or noncanonical path: ${relative}`,
    );
    visited.add(file);
    const source = readFileSync(file, "utf8");
    assert(
      !/(?:(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s*)["'](?:dotenv(?:\/[^"']*)?|@next\/env(?:\/[^"']*)?)["']|\bloadEnvConfig\s*\(|--env-file(?:-if-exists)?(?:=|\s))/iu.test(source),
      `env loader/reference in ${relative}`,
    );
    for (const match of source.matchAll(importPattern)) {
      const resolved = resolveLocalImport(file, match[1] ?? match[2]!);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return [...visited].sort();
}

async function main(): Promise<void> {
  let deniedNetworkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    deniedNetworkAttempts += 1;
    throw new Error("OFFLINE_VERIFIER_NETWORK_DENIED");
  }) as typeof fetch;
  try {
    const protocol = validateConnectivityPilotProtocolV2(
      JSON.parse(readFileSync(protocolPath, "utf8")) as unknown,
    );
    assert.equal(protocol.authorization.liveExecutionAuthorized, false);
    assert.equal(protocol.authorization.hostileAuditPassed, false);
    assert.equal(protocol.authorization.dispatchCommandPresent, false);
    assert.equal(protocol.exactWireSeal.externalNetworkCalls, 0);
    assert.equal(protocol.exactWireSeal.apiCandidatesConsumed, 0);
    assert.equal(sha256(readFileSync(paths.privateArtifact)), protocol.exactWireSeal.privateArtifactSha256);
    assert.equal(sha256(readFileSync(paths.publicArtifact)), protocol.exactWireSeal.publicArtifactSha256);
    const privateIgnore = readFileSync(path.join(here, "private/.gitignore"), "utf8");
    assert.match(privateIgnore, /^\*\s*!\.gitignore\s*$/mu);

    const manifestFiles = verifyManifest();
    const closure = collectImportClosure([
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/runner.ts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/live-launcher.ts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/live-child.mts",
      "experiments/question-quality-20260715/harness/atlas-controller.ts",
      "experiments/question-quality-20260715/harness/ledger.ts",
      "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
      "src/lib/atlas-research-fetch-boundary.ts",
    ]);
    assert(closure.length >= 7);

    const compiled = await compileConnectivityPilotExactWire();
    assert.equal(compiled.privateBytes, readFileSync(paths.privateArtifact, "utf8"));
    assert.equal(compiled.publicBytes, readFileSync(paths.publicArtifact, "utf8"));
    assert.equal(deniedNetworkAttempts, 0);

    run(process.execPath, [path.join(repoRoot, "node_modules/typescript/bin/tsc"), "-p", tsconfigPath, "--pretty", "false"]);
    const testOutput = run(process.execPath, [tsxCli, "--test", testPath]);
    const passMatch = /(?:^|\n)(?:#|ℹ)\s+pass\s+(\d+)/u.exec(testOutput);
    assert(passMatch && Number(passMatch[1]) >= 18, "offline hostile suite did not report enough passing checks");
    assert(!/(?:^|\n)(?:#|ℹ)\s+fail\s+[1-9]/u.test(testOutput), "offline hostile suite reported a failure");
    assert.equal(deniedNetworkAttempts, 0);

    process.stdout.write(`${JSON.stringify({
      verdict: "READY_FOR_SEPARATE_HOSTILE_AUDIT",
      liveExecutionAuthorized: false,
      dispatchCommandPresent: false,
      manifestFiles,
      localImportClosureFiles: closure.length,
      offlineTestPasses: Number(passMatch[1]),
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      realCredentialValuesRead: 0,
      productionDatabaseCalls: 0,
      ephemeralSQLiteRegressionOnly: true,
    }, null, 2)}\n`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
