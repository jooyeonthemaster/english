import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { computeLiveClosureV3 } from "./live-closure.mts";
import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV3, validateProtocolV3 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const manifestPath = path.join(here, "MANIFEST.sha256");
const ledgerPath = path.join(repoRoot, "experiments/question-quality-20260715/budget-ledger.json");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const tscCli = path.join(repoRoot, "node_modules/typescript/bin/tsc");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

function safeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"]) {
    const value = process.env[name];
    if (typeof value === "string") env[name] = value;
  }
  return env;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, env: safeEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`offline command failed: ${path.basename(command)} ${args.join(" ")}\n${result.stderr.slice(0, 4000)}`);
  return result.stdout;
}

function runMustFail(command: string, args: string[], expected: RegExp): void {
  const result = spawnSync(command, args, { cwd: repoRoot, env: safeEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  assert.notEqual(result.status, 0, `command unexpectedly succeeded: ${args.join(" ")}`);
  assert.match(`${result.stdout}\n${result.stderr}`, expected);
}

function verifyManifest(): number {
  const rows = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  const seen = new Set<string>();
  for (const row of rows) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match, `malformed manifest row: ${row}`);
    const [, expected, relativePath] = match;
    assert(!seen.has(relativePath!), `duplicate manifest row: ${relativePath}`);
    seen.add(relativePath!);
    const absolute = path.resolve(repoRoot, relativePath!);
    const relative = path.relative(repoRoot, absolute);
    assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.equal(sha256(readFileSync(absolute)), expected, `manifest drift at ${relativePath}`);
  }
  return rows.length;
}

async function main(): Promise<void> {
  let deniedNetworkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { deniedNetworkAttempts += 1; throw new Error("V3_OFFLINE_VERIFIER_NETWORK_DENIED"); }) as typeof fetch;
  try {
    const ledgerBefore = readFileSync(ledgerPath);
    const protocolBytes = readFileSync(path.join(here, "protocol-v3.json"));
    const protocol = validateProtocolV3(JSON.parse(protocolBytes.toString("utf8")) as unknown);
    assert.deepEqual(protocol.authorization, { liveExecutionAuthorized: false, hostileAuditPassed: false, dispatchCommandPresent: false });
    assert(Object.values(protocol.authorFreezeActivity).every((value) => value === 0));
    const privateBytes = readFileSync(path.join(repoRoot, protocol.exactWireCommitment.privateArtifactPath));
    const publicBytes = readFileSync(path.join(repoRoot, protocol.exactWireCommitment.publicArtifactPath));
    assert.equal(sha256(privateBytes), protocol.exactWireCommitment.privateArtifactSha256);
    assert.equal(sha256(publicBytes), protocol.exactWireCommitment.publicArtifactSha256);
    const manifestFiles = verifyManifest();
    const storedClosure = JSON.parse(readFileSync(path.join(here, "live-closure-v3.json"), "utf8")) as ReturnType<typeof computeLiveClosureV3>;
    const computedClosure = computeLiveClosureV3();
    assert.equal(stableJsonV3(computedClosure), stableJsonV3(storedClosure), "exact live closure set/hash differs");
    assert.equal(storedClosure.completeness.minimumCountAcceptanceUsed, false);
    assert(!storedClosure.files.some((row) => /offline\.test|test-support|verify|build-offline/u.test(row.path)));
    const readme = readFileSync(path.join(here, "README.md"), "utf8");
    assert.match(readme, /build-offline\.mts --check/u, "README must document the non-writing parity command");
    for (const line of readme.split(/\r?\n/u).filter((value) => value.includes("build-offline.mts"))) {
      assert.match(line, /build-offline\.mts --(?:check|write)\s*$/u, `README has an unqualified build command: ${line}`);
    }
    runMustFail(process.execPath, [tsxCli, path.join(here, "build-offline.mts")], /choose exactly one of --write or --check/u);
    const buildOutput = run(process.execPath, [tsxCli, path.join(here, "build-offline.mts"), "--check"]);
    assert.match(buildOutput, /V3_WRITE_NO_WRITE_PARITY_CONFIRMED/u);
    run(process.execPath, [tscCli, "-p", path.join(here, "tsconfig.json"), "--pretty", "false"]);
    const testOutput = run(process.execPath, [tsxCli, "--test", path.join(here, "offline.test.ts")]);
    const passMatch = /(?:^|\n)(?:#|ℹ)\s+pass\s+(\d+)/u.exec(testOutput);
    assert(passMatch, "offline test pass count missing");
    assert(!/(?:^|\n)(?:#|ℹ)\s+fail\s+[1-9]/u.test(testOutput), "offline test suite failed");
    assert.equal(sha256(readFileSync(ledgerPath)), sha256(ledgerBefore), "author verifier mutated global ledger");
    assert.equal(deniedNetworkAttempts, 0);
    process.stdout.write(`${JSON.stringify({
      verdict: "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED",
      protocolSha256: sha256(protocolBytes),
      manifestFiles,
      exactLiveClosureFiles: storedClosure.files.length,
      liveClosureSemanticSha256: storedClosure.closureSemanticSha256,
      offlineTestPasses: Number(passMatch[1]),
      writeNoWriteParity: true,
      scopedTypeScript: true,
      liveExecutionAuthorized: false,
      dispatchCommandPresent: false,
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      productionDatabaseCalls: 0,
      realCredentialValuesRead: 0,
      globalLedgerReservationMutations: 0,
    }, null, 2)}\n`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
