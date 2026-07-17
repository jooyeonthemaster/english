import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const full = process.argv.includes("--full");
const S1 = "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1";
const PREFLIGHT = "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1";
const REVIEW_FILES = [
  "README.md",
  "normalize-scope.probe.ts",
  "result.json",
  "source-hashes.json",
  "verify.mjs",
];

const abs = (relativePath) => path.join(repoRoot, relativePath);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (relativePath) => sha256(readFileSync(abs(relativePath)));
const readJson = (relativePath) => JSON.parse(readFileSync(abs(relativePath), "utf8"));

function walk(relativeDir) {
  const found = [];
  const visit = (current) => {
    for (const entry of readdirSync(abs(current), { withFileTypes: true })) {
      const child = `${current}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) found.push(child);
    }
  };
  visit(relativeDir);
  return found.sort();
}

function verifyTargetManifest(relativeDir, expectedOuterHash) {
  const manifestPath = `${relativeDir}/MANIFEST.sha256`;
  assert.equal(fileSha256(manifestPath), expectedOuterHash);
  const lines = readFileSync(abs(manifestPath), "utf8").trim().split(/\r?\n/u);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `malformed target manifest row: ${line}`);
    assert.equal(fileSha256(`${relativeDir}/${match[2]}`), match[1]);
  }
  return lines.length;
}

function resolveLocalImport(fromRelativePath, specifier) {
  if (specifier.startsWith("node:") || (!specifier.startsWith(".") && !specifier.startsWith("@/"))) {
    return null;
  }
  const base = specifier.startsWith("@/")
    ? path.join(repoRoot, "src", specifier.slice(2))
    : path.resolve(repoRoot, path.dirname(fromRelativePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.json`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.mts"),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return resolved ? path.relative(repoRoot, resolved).replaceAll("\\", "/") : null;
}

function collectClosure(root) {
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/gu;
  const pending = [root];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    if (current.endsWith(".json")) continue;
    const source = readFileSync(abs(current), "utf8");
    for (const match of source.matchAll(pattern)) {
      const dependency = resolveLocalImport(current, match[1] ?? match[2] ?? match[3] ?? "");
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].sort();
}

const result = readJson(`${path.relative(repoRoot, here).replaceAll("\\", "/")}/result.json`);
const hashes = readJson(`${path.relative(repoRoot, here).replaceAll("\\", "/")}/source-hashes.json`);
assert.equal(result.verdict, "PASS_OFFLINE_ISOLATION_REPRODUCED_EXECUTION_BLOCKED");
assert.equal(hashes.files.length, 32);
assert.equal(new Set(hashes.files.map((row) => row.path)).size, hashes.files.length);
for (const row of hashes.files) {
  const bytes = readFileSync(abs(row.path));
  assert.equal(bytes.byteLength, row.bytes, `${row.path}: byte count`);
  assert.equal(sha256(bytes), row.sha256, `${row.path}: SHA-256`);
}
assert.deepEqual(walk(S1), [...hashes.targetInventories.s1].sort());
assert.deepEqual(walk(PREFLIGHT), [...hashes.targetInventories.preflight].sort());
assert.equal(verifyTargetManifest(S1, hashes.seals.s1ManifestSha256), 12);
assert.equal(verifyTargetManifest(PREFLIGHT, hashes.seals.preflightManifestSha256), 6);

const closure = collectClosure(hashes.productionRuntimeRoot);
assert.deepEqual(closure, hashes.productionRuntimeClosure);
assert.equal(closure.length, 9);
assert.equal(closure.some((entry) => entry.endsWith("/runtime.test-support.ts")), false);

const runtimeSource = readFileSync(abs(`${S1}/runtime.ts`), "utf8");
assert.match(runtimeSource, /PLACEHOLDER ONLY\. Its private half was deliberately discarded/);
assert.match(runtimeSource, /const productionTrustRoot[\s\S]*operatorKeyId: PLACEHOLDER_PRODUCTION_OPERATOR_KEY_ID/);
assert.match(runtimeSource, /trustRoot: productionTrustRoot/);
assert.doesNotMatch(runtimeSource, /credentialSecrets\.set\s*\(/);
assert.doesNotMatch(runtimeSource, /runtime\.test-support|ForTesting|createS1Test|TEST_MODE_ENV/);
assert.equal(
  [...runtimeSource.matchAll(/^export function\s+(\w+)/gmu)].some((match) => /test|offline/iu.test(match[1])),
  false,
);

const supportSource = readFileSync(abs(`${S1}/runtime.test-support.ts`), "utf8");
assert.match(supportSource, /const safeStores = new WeakSet<object>\(\)/);
assert.match(supportSource, /mkdtempSync\(path\.join\(tmpdir\(\), prefix\)\)/);
assert.match(supportSource, /safeStores\.has\(store as object\)/);
assert.match(supportSource, /only a module-created OS-temp test store is accepted/);
assert.match(supportSource, /transportMode: "OFFLINE_FAKE_ONLY_NO_DELEGATE"/);
assert.doesNotMatch(
  supportSource,
  /atlas-research-fetch-boundary|QuestionGenerationCallsiteAdapter|globalThis\.fetch|FetchDelegate/,
);
const supportImports = [...supportSource.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]);
assert.equal(supportImports.some((specifier) => /node:(?:http|https|net|tls)|undici/iu.test(specifier)), false);

const boundarySource = readFileSync(abs("src/lib/atlas-research-fetch-boundary.ts"), "utf8");
const normalizeStart = boundarySource.indexOf("function normalizeScope(");
const normalizeEnd = boundarySource.indexOf("function deepFreeze", normalizeStart);
assert(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const normalizeSource = boundarySource.slice(normalizeStart, normalizeEnd);
assert.match(normalizeSource, /input\.provenance\.requestEnvelopeHash === undefined[\s\S]*requestEnvelopeHash: assertHash\([\s\S]*input\.provenance\.requestEnvelopeHash/);
assert.match(normalizeSource, /input\.provenance\.promptProfileArtifactHash === undefined[\s\S]*promptProfileArtifactHash: assertHash\([\s\S]*input\.provenance\.promptProfileArtifactHash/);
assert.equal((normalizeSource.match(/requestEnvelopeHash/g) ?? []).length, 4);
assert.equal((normalizeSource.match(/promptProfileArtifactHash/g) ?? []).length, 4);
assert.equal((normalizeSource.match(/\bprovenance,\s*\n\s*\}\);/g) ?? []).length, 2);

const bundle = readJson(`${S1}/fixture/controller-bundle-v1.json`);
const s1Public = readJson(`${S1}/controller-materialization-fixture-v1.json`);
assert.equal(bundle.status, "DRY_RUN_ONLY_EXECUTION_BLOCKED");
assert.equal(bundle.designAuthorization.status, "BLOCKED_FIXTURE");
assert.equal(bundle.assignments.length, 180);
assert.equal(s1Public.counts.assignments, 180);
assert.equal(bundle.safety.registries, 180);
assert.equal(bundle.safety.externalNetworkCallsDuringMaterialization, 0);
assert.equal(bundle.safety.providerCallsDuringMaterialization, 0);
assert.equal(bundle.safety.apiCandidatesConsumedDuringMaterialization, 0);
for (const assignment of bundle.assignments) {
  const provenance = assignment.registry.entries[0].provenance;
  assert.equal(provenance.requestEnvelopeHash, assignment.exactWire.requestEnvelopeSha256);
  assert.equal(provenance.promptProfileArtifactHash, assignment.exactWire.promptProfileArtifactHash);
}

const preflightPublic = readJson(`${PREFLIGHT}/exact-wire-preflight-v1.json`);
const preflightPrivate = readJson(`${PREFLIGHT}/private/exact-wire-preflight-v1.json`);
assert.equal(preflightPublic.status, "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED");
assert.equal(preflightPrivate.status, "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED");
assert.equal(preflightPublic.privatePreflightArtifactSha256, hashes.seals.privatePreflightArtifactSha256);
assert.equal(fileSha256(`${PREFLIGHT}/private/exact-wire-preflight-v1.json`), hashes.seals.privatePreflightArtifactSha256);
assert.equal(preflightPublic.counts.assignments, 180);
assert.equal(preflightPublic.counts.locallyInterceptedFetches, 180);
assert.equal(preflightPublic.counts.externalNetworkCalls, 0);
assert.equal(preflightPublic.counts.uniqueWireBodies, 180);
assert.equal(preflightPublic.counts.uniqueRequestEnvelopes, 180);
assert.equal(preflightPrivate.safety.unexpectedFetchAttempts, 0);
assert.equal(preflightPrivate.safety.blockedNonFetchTransportAttempts, 0);
for (const field of ["externalNetworkCalls", "providerCalls", "modelCalls", "databaseCalls", "realSecretReads", "apiCandidatesConsumed"]) {
  assert.equal(preflightPrivate.safety[field], 0, `preflight safety ${field}`);
}
assert.equal(preflightPrivate.durableControllerUnpricedBinding.assignments.length, 180);

const compilerSource = readFileSync(abs(`${PREFLIGHT}/compile-exact-wire-preflight.mts`), "utf8");
const environmentAt = compilerSource.indexOf("installSecretFreeOfflineEnvironment();");
const guardAt = compilerSource.indexOf("installFailClosedTransportGuard();", environmentAt);
const importsAt = compilerSource.indexOf("await loadProductionDependencies();", guardAt);
assert(environmentAt >= 0 && guardAt > environmentAt && importsAt > guardAt);
for (const marker of ["globalThis.fetch", "http.request", "https.request", "net.connect", "net.createConnection", "tls.connect"]) {
  assert.match(compilerSource, new RegExp(marker.replace(".", "\\.")));
}

const gitIgnored = spawnSync("git", ["check-ignore", "-q", `${PREFLIGHT}/private/exact-wire-preflight-v1.json`], { cwd: repoRoot });
assert.equal(gitIgnored.status, 0);
const gitTracked = spawnSync("git", ["ls-files", "--error-unmatch", `${PREFLIGHT}/private/exact-wire-preflight-v1.json`], { cwd: repoRoot });
assert.notEqual(gitTracked.status, 0);

for (const field of ["externalNetworkCalls", "providerCalls", "modelCalls", "apiCalls", "applicationDatabaseCalls", "browserCalls", "credentialReads", "realSecretReads", "apiCandidatesConsumed"]) {
  assert.equal(result.sideEffects[field], 0, `result side effect ${field}`);
}

function verifyReviewManifest() {
  const lines = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8").trim().split(/\r?\n/u);
  assert.deepEqual(lines.map((line) => line.replace(/^[a-f0-9]{64}  /u, "")), REVIEW_FILES);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match);
    assert.equal(sha256(readFileSync(path.join(here, match[2]))), match[1]);
  }
}

function run(label, args, expected = []) {
  const child = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(child.status, 0, `${label} failed\n${child.stdout}\n${child.stderr}`);
  for (const marker of expected) {
    assert.equal(child.stdout.includes(marker), true, `${label} missing ${marker}`);
  }
  process.stdout.write(`PASS ${label}\n`);
}

if (full) {
  const before = new Map([...hashes.targetInventories.s1, ...hashes.targetInventories.preflight]
    .map((file) => [file, fileSha256(file)]));
  const tsx = abs("node_modules/tsx/dist/cli.mjs");
  const tsc = abs("node_modules/typescript/bin/tsc");
  const buildInfo = path.join(tmpdir(), `campaign-v6-s1-review-${process.pid}-${randomUUID()}.tsbuildinfo`);
  try {
    run("S1 non-writing builder replay", [tsx, `${S1}/build-fixture.ts`], ["DRY_RUN_ONLY_EXECUTION_BLOCKED", '"assignments": 180']);
    run("S1 materializer/runtime unit tests", [tsx, "--test", `${S1}/materialize.test.ts`], ["pass 28", "fail 0"]);
    run("S1 official verifier", [tsx, `${S1}/verify.mts`], ["PASS_OFFLINE_FIXTURE_ONLY_EXECUTION_BLOCKED"]);
    run("S1 scoped TypeScript", [tsc, "-p", `${S1}/tsconfig.json`, "--noEmit", "--tsBuildInfoFile", buildInfo]);
    run("preflight guarded 180-row replay", [tsx, `${PREFLIGHT}/compile-exact-wire-preflight.mts`], ['"locallyInterceptedFetches": 180', '"externalNetworkCalls": 0']);
    run("preflight official verifier", [tsx, `${PREFLIGHT}/verify.mts`], ["PASS_OFFLINE_V6_S1_EXACT_WIRE_EXECUTION_BLOCKED", '"locallyInterceptedFetches": 180']);
    run("preflight scoped TypeScript", [tsc, "-p", `${PREFLIGHT}/tsconfig.json`, "--noEmit"]);
    run("shared controller/boundary/callsite tests", [tsx, "--test", "experiments/question-quality-20260715/harness/atlas-controller.test.ts", "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts", "tests/unit/atlas-research-fetch-boundary.test.ts"], ["pass 52", "fail 0"]);
    run("shared ledger tests", [tsx, "experiments/question-quality-20260715/harness/test.ts"], ["PASS 25/25 budget-guard v4 tests"]);
    run("normalizeScope binding probe", [tsx, `${path.relative(repoRoot, here).replaceAll("\\", "/")}/normalize-scope.probe.ts`], ["PASS_NORMALIZE_SCOPE_BINDINGS_ONLY", '"nativeFetchCalls":0']);
  } finally {
    if (existsSync(buildInfo)) unlinkSync(buildInfo);
  }
  for (const [file, digest] of before) assert.equal(fileSha256(file), digest, `${file}: target changed`);
}

verifyReviewManifest();
process.stdout.write(`${JSON.stringify({
  verdict: result.verdict,
  fullVerification: full,
  reviewedFiles: hashes.files.length,
  productionRuntimeClosureFiles: closure.length,
  offlineTestSupportInProductionClosure: false,
  guardedReplayAssignments: 180,
  guardedReplayLocalInterceptions: 180,
  externalNetworkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  apiCalls: 0,
  applicationDatabaseCalls: 0,
  credentialReads: 0,
  realSecretReads: 0,
  apiCandidatesConsumed: 0,
  targetFilesChanged: 0,
}, null, 2)}\n`);
