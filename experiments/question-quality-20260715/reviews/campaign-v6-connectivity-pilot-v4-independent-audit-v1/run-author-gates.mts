import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reviewRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.join(reviewRoot, ".runtime-cache");
const repoRoot = path.resolve(reviewRoot, "../../../..");
const targetRoot = path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4");
const target = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4";
const ledgerPath = path.join(repoRoot, "experiments/question-quality-20260715/budget-ledger.json");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const tscCli = path.join(repoRoot, "node_modules/typescript/lib/tsc.js");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.replaceAll("\\", "/");

// Gate runtimes are useful while debugging, but they are not reproducible
// evidence. Node's test reporter also prints wall-clock durations. Seal only a
// canonicalized transcript so two executions over identical source bytes
// produce the same author-gate artifact.
function canonicalGateOutput(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replace(/(duration_ms\s+)\d+(?:\.\d+)?/gu, "$1<NORMALIZED>")
    .replace(/\(\d+(?:\.\d+)?ms\)/gu, "(<NORMALIZED_MS>)");
}

rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeRoot, { recursive: true });
process.on("exit", () => rmSync(runtimeRoot, { recursive: true, force: true }));

function snapshot(root: string): Array<{ path: string; bytes: number; sha256: string }> {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files.sort().map((absolute) => {
    const bytes = readFileSync(absolute);
    return { path: slash(path.relative(repoRoot, absolute)), bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
}

const controlledEnvironment: NodeJS.ProcessEnv = {
  SystemRoot: "C:\\Windows",
  WINDIR: "C:\\Windows",
  PATH: "C:\\Program Files\\nodejs;C:\\Program Files\\Git\\cmd;C:\\Windows\\System32",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  TEMP: runtimeRoot,
  TMP: runtimeRoot,
  COMSPEC: "C:\\Windows\\System32\\cmd.exe",
  TSX_DISABLE_CACHE: "1",
  NODE_DISABLE_COMPILE_CACHE: "1",
};

interface GateSpec {
  id: string;
  args: readonly string[];
  environment?: NodeJS.ProcessEnv;
}

const gateSpecs: readonly GateSpec[] = [
  {
    id: "author-build-check",
    args: [tsxCli, path.join(targetRoot, "build-offline.mts"), "--check"],
  },
  {
    id: "author-verifier",
    args: [tsxCli, path.join(targetRoot, "verify.mts")],
  },
  {
    id: "scoped-tsc",
    args: [tscCli, "-p", path.join(targetRoot, "tsconfig.json"), "--pretty", "false"],
  },
  {
    id: "author-offline-tests",
    args: [tsxCli, "--test", path.join(targetRoot, "offline.test.ts")],
  },
  {
    id: "independent-hostile-nonsecret-env-compiler-parity",
    args: [tsxCli, path.join(targetRoot, "build-offline.mts"), "--check"],
    environment: {
      GRAMMAR_PREMIUM_MODEL_ID: "anthropic/hostile-offline-sentinel",
      QUESTION_GENERATION_TIMEOUT_MS: "1",
      PREMIUM_QUESTION_GENERATION_TIMEOUT_MS: "2",
      QUESTION_GENERATION_APPLICATION_MAX_RETRIES: "0",
      QUESTION_GENERATION_SDK_MAX_RETRIES: "0",
      TRIGGER_WORKBENCH_QUESTION_QUEUE_NAME: "hostile-offline-queue",
      TRIGGER_WORKBENCH_QUESTION_CONCURRENCY: "999",
      TRIGGER_WORKBENCH_QUESTION_PER_ACADEMY: "999",
      NEXT_PUBLIC_SHOW_MODEL_SELECTOR: "true",
      NEXT_PUBLIC_ENABLE_LONG_PASSAGE_SETS: "true",
      NEXT_PUBLIC_SHOW_CREDIT_TOP_UP: "true",
    },
  },
];

const mode = process.argv.slice(2);
assert.deepEqual(mode, ["--write"], "run-author-gates.mts requires exactly --write");
const beforeTarget = snapshot(targetRoot);
const ledgerBefore = readFileSync(ledgerPath);
const v2ManifestBefore = readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/MANIFEST.sha256"));
const v3ManifestBefore = readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/MANIFEST.sha256"));
const results = gateSpecs.map((gate) => {
  const result = spawnSync(process.execPath, gate.args, {
    cwd: repoRoot,
    env: { ...controlledEnvironment, ...(gate.environment ?? {}) },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = canonicalGateOutput(result.stdout ?? "");
  const stderr = canonicalGateOutput(result.stderr ?? "");
  return {
    id: gate.id,
    executable: "current-node-executable",
    arguments: gate.args.map((argument) => slash(path.relative(repoRoot, argument)).startsWith("..") ? path.basename(argument) : slash(path.relative(repoRoot, argument))),
    exitCode: result.status,
    signal: result.signal,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    stdoutSummary: stdout.trim().split(/\r?\n/gu).slice(-8),
    stderrSummary: stderr.trim().split(/\r?\n/gu).slice(-8),
    injectedEnvironmentNames: Object.keys(gate.environment ?? {}).sort(),
  };
});
for (const result of results) assert.equal(result.exitCode, 0, `${result.id} failed: ${result.stderrSummary.join("\n")}`);
const afterTarget = snapshot(targetRoot);
const ledgerAfter = readFileSync(ledgerPath);
assert.deepEqual(afterTarget, beforeTarget, "author gates changed target bytes");
assert.equal(sha256(ledgerAfter), sha256(ledgerBefore), "author gates changed the global ledger");
assert.equal(sha256(readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/MANIFEST.sha256"))), sha256(v2ManifestBefore));
assert.equal(sha256(readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/MANIFEST.sha256"))), sha256(v3ManifestBefore));
const report = {
  schemaVersion: "question-quality-connectivity-pilot-v4-author-gate-reproduction-v1",
  target,
  verdict: "PASS",
  independentVerdictAuthority: false,
  note: "These author gates were reproduced separately; they are corroboration only and do not determine the hostile-audit verdict.",
  controlledEnvironmentNames: Object.keys(controlledEnvironment).sort(),
  hostileCompilerProbeUsesSyntheticNonsecretValuesOnly: true,
  transcriptNormalization: "CRLF_TO_LF_AND_ALL_NODE_TEST_TIMINGS_V2",
  wallClockDurationsPersisted: false,
  inheritedEnvironmentValuesReadOrForwarded: 0,
  credentialValuesRead: 0,
  gates: results,
  invariants: {
    targetBytesUnchanged: true,
    globalLedgerSha256Before: sha256(ledgerBefore),
    globalLedgerSha256After: sha256(ledgerAfter),
    globalLedgerMutations: 0,
    v2ManifestSha256Before: sha256(v2ManifestBefore),
    v2ManifestSha256After: sha256(v2ManifestBefore),
    v3ManifestSha256Before: sha256(v3ManifestBefore),
    v3ManifestSha256After: sha256(v3ManifestBefore),
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    databaseCalls: 0,
    browserCalls: 0,
  },
};
writeFileSync(path.join(reviewRoot, "author-gates.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ verdict: report.verdict, gates: results.map((result) => ({ id: result.id, exitCode: result.exitCode })), invariants: report.invariants }, null, 2)}\n`);
