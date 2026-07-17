import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import * as ledgerModule from "../../harness/ledger";
import * as runnerModule from "../../execution/campaign-v6-connectivity-pilot-v2/runner";
import * as protocolSchemaModule from "../../execution/campaign-v6-connectivity-pilot-v2/protocol-schema";

const ledger = (ledgerModule as unknown as { default?: typeof ledgerModule }).default ?? ledgerModule;
const runner = (runnerModule as unknown as { default?: typeof runnerModule }).default ?? runnerModule;
const protocolSchema =
  (protocolSchemaModule as unknown as { default?: typeof protocolSchemaModule }).default ??
  protocolSchemaModule;
const { openTestBudgetStore } = ledger;
const {
  buildConnectivityPilotPrivateRegistryJson,
  createOfflineInjectedTransportCapability,
  createOfflineInjectedTransportTestPermit,
  materializeConnectivityPilot,
  runConnectivityPilotWithInjectedTransport,
} = runner;
const { validateConnectivityPilotProtocolV2 } = protocolSchema;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const targetRelative =
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2";
const targetRoot = path.join(repoRoot, targetRelative);
const targetManifestPath = path.join(targetRoot, "MANIFEST.sha256");
const targetProtocolPath = path.join(targetRoot, "protocol-v2.json");
const sourceHashesPath = path.join(here, "SOURCE-HASHES.sha256");
const resultPath = path.join(here, "result.json");
const reviewManifestPath = path.join(here, "REVIEW-MANIFEST.json");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const tscCli = path.join(repoRoot, "node_modules/typescript/bin/tsc");

const fullEntrypoints = [
  "compile-exact-wire.mts",
  "live-child.mts",
  "live-launcher.ts",
  "offline.test.ts",
  "protocol-schema.ts",
  "runner.ts",
  "seal-offline.mts",
  "verify.mts",
].map((name) => `${targetRelative}/${name}`);

const runtimeEntrypoints = [
  `${targetRelative}/live-launcher.ts`,
  `${targetRelative}/live-child.mts`,
  `${targetRelative}/runner.ts`,
];

const compilerEntrypoints = [`${targetRelative}/compile-exact-wire.mts`];

const additionalBoundInputs = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "experiments/question-quality-20260715/harness/node-sqlite.d.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256",
];

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function canonicalInsideRepo(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), `path escaped repo: ${absolute}`);
  const canonical = realpathSync.native(resolved);
  const normalize = (value: string): string =>
    process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
  assert.equal(normalize(canonical), normalize(resolved), `non-canonical or linked path: ${relative}`);
  return slash(relative);
}

function resolveLocalImport(fromAbsolute: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = path.join(repoRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromAbsolute), specifier);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.mts"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

interface ImportClosure {
  files: string[];
  externalSpecifiers: string[];
  unresolvedLocalSpecifiers: Array<{ from: string; specifier: string }>;
}

function collectImportClosure(entrypoints: readonly string[]): ImportClosure {
  const queue = entrypoints.map((entry) => path.resolve(repoRoot, entry));
  const visited = new Set<string>();
  const external = new Set<string>();
  const unresolved: Array<{ from: string; specifier: string }> = [];
  while (queue.length > 0) {
    const absolute = queue.shift()!;
    const relative = canonicalInsideRepo(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    const source = readFileSync(absolute, "utf8");
    const sourceFile = ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const specifiers: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        specifiers.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]!) &&
        (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")
        )
      ) {
        specifiers.push(node.arguments[0]!.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const specifier of specifiers) {
      const imported = resolveLocalImport(absolute, specifier);
      if (imported) {
        const importedRelative = canonicalInsideRepo(imported);
        if (!visited.has(importedRelative)) queue.push(imported);
      } else if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        unresolved.push({ from: relative, specifier });
      } else {
        external.add(specifier);
      }
    }
  }
  return {
    files: [...visited].sort(),
    externalSpecifiers: [...external].sort(),
    unresolvedLocalSpecifiers: unresolved.sort((left, right) =>
      `${left.from}:${left.specifier}`.localeCompare(`${right.from}:${right.specifier}`)
    ),
  };
}

function walkFiles(root: string): string[] {
  const found: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile()) found.push(canonicalInsideRepo(absolute));
      else assert.fail(`target contains non-regular entry: ${absolute}`);
    }
  }
  return found.sort();
}

function expectedSourceHashRows(fullClosure: ImportClosure): string[] {
  const paths = new Set([
    ...fullClosure.files,
    ...walkFiles(targetRoot),
    ...additionalBoundInputs,
  ]);
  return [...paths].sort().map((relative) => {
    const bytes = readFileSync(path.join(repoRoot, relative));
    return `${sha256(bytes)}  ${relative}`;
  });
}

function parseHashRows(text: string, label: string): Array<{ hash: string; path: string }> {
  const rows = text.trim().split(/\r?\n/u);
  assert(rows.length > 0, `${label} is empty`);
  const seen = new Set<string>();
  return rows.map((row) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match, `${label} has malformed row: ${row}`);
    const [, hash, relative] = match;
    assert(!seen.has(relative!), `${label} duplicates ${relative}`);
    seen.add(relative!);
    return { hash: hash!, path: relative! };
  });
}

function verifyHashRows(filePath: string, expectedPaths?: readonly string[]): number {
  const rows = parseHashRows(readFileSync(filePath, "utf8"), slash(path.relative(repoRoot, filePath)));
  if (expectedPaths) assert.deepEqual(rows.map((row) => row.path).sort(), [...expectedPaths].sort());
  for (const row of rows) {
    canonicalInsideRepo(path.join(repoRoot, row.path));
    assert.equal(sha256(readFileSync(path.join(repoRoot, row.path))), row.hash, `hash drift: ${row.path}`);
  }
  return rows.length;
}

function minimalChildEnv(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"]) {
    const value = process.env[name];
    if (typeof value === "string") result[name] = value;
  }
  result.QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST_MODE = "1";
  result.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
  return result;
}

function runGate(id: string, args: string[]): { id: string; status: number; stdout: string; stderr: string } {
  const completed = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: minimalChildEnv(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(completed.status, 0, `${id} failed: ${completed.stderr.slice(0, 4000)}`);
  return {
    id,
    status: completed.status!,
    stdout: completed.stdout,
    stderr: completed.stderr,
  };
}

function syntheticPricingSnapshot() {
  const supportedParameters = ["max_tokens", "response_format"];
  const content = {
    schemaVersion: 2 as const,
    fetchedAt: "2026-07-15T10:00:00.000Z",
    source: "independent-review-local-synthetic-fixture",
    routingContract: {
      allowedEndpointTags: ["google-vertex/global"] as ["google-vertex/global"],
      emergencyCeilingScope: "all-active-model-endpoints" as const,
    },
    chargeDimensions: {
      textInputTokens: "MODELED_BY_PROMPT_RATE",
      textOutputTokens: "MODELED_BY_COMPLETION_RATE",
      cachedInputTokens: "INAPPLICABLE_NO_CACHE",
      reasoningTokens: "INAPPLICABLE_REASONING_DISABLED",
      imageTokens: "INAPPLICABLE_TEXT_ONLY",
      webSearch: "INAPPLICABLE_NO_WEB_PLUGIN",
      fixedRequestFees: "NONE",
      unknownDimensions: "REJECT",
    },
    models: [{
      id: "google/gemini-3.5-flash",
      canonicalSlug: "google/gemini-3.5-flash-20260519",
      endpointRates: [{
        provider: "Google",
        endpointName: "synthetic global",
        tag: "google-vertex/global",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000015,
        completionUsdPerToken: 0.000009,
        supportedParameters,
        structuredOutputs: true,
        overrides: [],
      }, {
        provider: "Google",
        endpointName: "synthetic emergency ceiling",
        tag: "google-vertex/global/priority",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000027,
        completionUsdPerToken: 0.0000162,
        supportedParameters,
        overrides: [],
      }],
    }, {
      id: "google/gemini-3.1-pro-preview",
      canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
      endpointRates: [{
        provider: "Google",
        endpointName: "synthetic global",
        tag: "google-vertex/global",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.000002,
        completionUsdPerToken: 0.000012,
        supportedParameters,
        structuredOutputs: true,
        overrides: [{
          minPromptTokens: 200_000,
          promptUsdPerToken: 0.000004,
          completionUsdPerToken: 0.000018,
        }],
      }, {
        provider: "Google",
        endpointName: "synthetic emergency ceiling",
        tag: "google-vertex/global/priority",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000036,
        completionUsdPerToken: 0.0000324,
        supportedParameters,
        overrides: [{
          minPromptTokens: 200_000,
          promptUsdPerToken: 0.0000072,
          completionUsdPerToken: 0.0000324,
        }],
      }],
    }],
  };
  return { ...content, snapshotSha256: sha256(JSON.stringify(content)) };
}

async function proveInjectedDelegateAuthorizationBypass(): Promise<number> {
  process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST_MODE = "1";
  process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
  const protocol = validateConnectivityPilotProtocolV2(
    JSON.parse(readFileSync(targetProtocolPath, "utf8")) as unknown,
  );
  assert.equal(protocol.authorization.liveExecutionAuthorized, false);
  assert.equal(protocol.authorization.hostileAuditPassed, false);
  assert.equal(protocol.authorization.dispatchCommandPresent, false);

  const materialized = materializeConnectivityPilot({
    priceSnapshotId: "independent-review-synthetic-price-v2",
    snapshot: syntheticPricingSnapshot(),
    validThrough: "2026-07-15T10:15:00.000Z",
    now: Date.parse("2026-07-15T10:01:00.000Z"),
  });
  const tempRoot = mkdtempSync(path.join(tmpdir(), "ocvp-v2-independent-review-"));
  const registryPath = path.join(tempRoot, "registry.json");
  const storePath = path.join(tempRoot, "ledger.sqlite");
  writeFileSync(registryPath, buildConnectivityPilotPrivateRegistryJson(materialized), "utf8");
  const store = openTestBudgetStore(storePath, registryPath);
  let arbitraryDelegateInvocations = 0;
  const permit = createOfflineInjectedTransportTestPermit(materialized);
  const transport = createOfflineInjectedTransportCapability(async () => {
    arbitraryDelegateInvocations += 1;
    throw new Error("SYNTHETIC_ARBITRARY_DELEGATE_REACHED");
  });
  try {
    await assert.rejects(
      () => runConnectivityPilotWithInjectedTransport({
        materialized,
        store,
        permit,
        transport,
        now: () => Date.parse("2026-07-15T10:02:00.000Z"),
      }),
      /SYNTHETIC_ARBITRARY_DELEGATE_REACHED/u,
    );
    assert.equal(arbitraryDelegateInvocations, 1);
    assert.equal(store.summary().providerCalls, 1);
    return arbitraryDelegateInvocations;
  } finally {
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const fullClosure = collectImportClosure(fullEntrypoints);
  const compilerClosure = collectImportClosure(compilerEntrypoints);
  const runtimeClosure = collectImportClosure(runtimeEntrypoints);
  assert.deepEqual(fullClosure.unresolvedLocalSpecifiers, []);
  assert.deepEqual(compilerClosure.unresolvedLocalSpecifiers, []);
  assert.deepEqual(runtimeClosure.unresolvedLocalSpecifiers, []);

  const expectedRows = expectedSourceHashRows(fullClosure);
  if (process.argv.includes("--print-source-hashes")) {
    process.stdout.write(`${expectedRows.join("\n")}\n`);
    return;
  }

  assert.equal(fullClosure.files.length, 198);
  assert.equal(compilerClosure.files.length, 189);
  assert.equal(runtimeClosure.files.length, 9);
  assert.deepEqual(readFileSync(sourceHashesPath, "utf8").trim().split(/\r?\n/u), expectedRows);
  const sourceHashFiles = verifyHashRows(sourceHashesPath, expectedRows.map((row) => row.slice(66)));

  const targetManifestRows = parseHashRows(readFileSync(targetManifestPath, "utf8"), "target manifest");
  assert.equal(targetManifestRows.length, 13);
  for (const row of targetManifestRows) {
    assert.equal(sha256(readFileSync(path.join(repoRoot, row.path))), row.hash, `target manifest drift: ${row.path}`);
  }

  const protocol = validateConnectivityPilotProtocolV2(
    JSON.parse(readFileSync(targetProtocolPath, "utf8")) as unknown,
  );
  const privateArtifact = JSON.parse(
    readFileSync(path.join(targetRoot, "private/exact-wire-v2.private.json"), "utf8"),
  ) as { sourceClosure: Array<{ path: string; bytes: number; sha256: string }> };
  assert.equal(privateArtifact.sourceClosure.length, 32);
  for (const row of privateArtifact.sourceClosure) {
    const bytes = readFileSync(path.join(repoRoot, row.path));
    assert.equal(bytes.byteLength, row.bytes, `claimed source byte drift: ${row.path}`);
    assert.equal(sha256(bytes), row.sha256, `claimed source hash drift: ${row.path}`);
  }
  const claimedCompilerPaths = new Set(privateArtifact.sourceClosure.map((row) => row.path));
  const omittedCompilerImports = compilerClosure.files.filter((file) => !claimedCompilerPaths.has(file));
  assert.equal(omittedCompilerImports.length, 162);

  assert.equal(
    sha256(readFileSync(path.join(targetRoot, "offline-exact-wire-seal-v2.json"))),
    protocol.exactWireSeal.publicArtifactSha256,
  );
  assert.equal(
    sha256(readFileSync(path.join(targetRoot, "private/exact-wire-v2.private.json"))),
    protocol.exactWireSeal.privateArtifactSha256,
  );
  assert.equal(
    sha256(readFileSync(path.join(repoRoot, protocol.amends.path))),
    protocol.authorityCommitment.originalProtocolV1Sha256,
  );
  assert.equal(
    sha256(readFileSync(path.join(
      repoRoot,
      "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
    ))),
    protocol.authorityCommitment.originalPublicCorpusSha256,
  );

  const targetVerifierSource = readFileSync(path.join(targetRoot, "verify.mts"), "utf8");
  assert.match(targetVerifierSource, /assert\(closure\.length >= 7\)/u);
  assert.doesNotMatch(targetVerifierSource, /sourceClosureSha256/u);
  const runnerSource = readFileSync(path.join(targetRoot, "runner.ts"), "utf8");
  assert.match(runnerSource, /export function createOfflineInjectedTransportCapability\([\s\S]*delegate: FetchDelegate/u);
  assert.match(runnerSource, /process\.env\[TEST_MODE_ENV\] !== "1"/u);
  assert.match(runnerSource, /export async function runConnectivityPilotWithInjectedTransport/u);

  const arbitraryDelegateInvocations = await proveInjectedDelegateAuthorizationBypass();

  const documented = runGate("documented_verifier", [
    tsxCli,
    path.join(targetRoot, "verify.mts"),
  ]);
  const targetVerifierResult = JSON.parse(documented.stdout) as Record<string, unknown>;
  assert.equal(targetVerifierResult.localImportClosureFiles, 9);
  assert.equal(targetVerifierResult.offlineTestPasses, 22);
  const typecheck = runGate("scoped_typescript", [
    tscCli,
    "-p",
    path.join(targetRoot, "tsconfig.json"),
    "--pretty",
    "false",
  ]);
  const offline = runGate("offline_tests", [
    tsxCli,
    "--test",
    path.join(targetRoot, "offline.test.ts"),
  ]);
  assert.match(offline.stdout, /(?:^|\n)(?:#|ℹ)\s+pass\s+22/u);
  assert.doesNotMatch(offline.stdout, /(?:^|\n)(?:#|ℹ)\s+fail\s+[1-9]/u);

  const result = JSON.parse(readFileSync(resultPath, "utf8")) as {
    verdict: string;
    findings: Array<{ id: string }>;
    safetyCounters: Record<string, number | boolean>;
  };
  assert.equal(result.verdict, "FAIL");
  assert.deepEqual(result.findings.map((finding) => finding.id), ["F-001", "F-002"]);
  for (const key of [
    "externalNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed",
    "realCredentialValueReads",
    "productionDatabaseReads",
  ]) assert.equal(result.safetyCounters[key], 0, `${key} must remain zero`);

  const reviewManifest = JSON.parse(readFileSync(reviewManifestPath, "utf8")) as {
    schemaVersion: string;
    reviewId: string;
    selfExcluded: boolean;
    artifacts: Array<{ path: string; bytes: number; sha256: string }>;
  };
  assert.equal(reviewManifest.schemaVersion, "question-quality-independent-review-manifest-v1");
  assert.equal(reviewManifest.reviewId, "campaign-v6-connectivity-pilot-v2-independent-review-v1");
  assert.equal(reviewManifest.selfExcluded, true);
  assert.deepEqual(
    reviewManifest.artifacts.map((artifact) => artifact.path),
    ["README.md", "SOURCE-HASHES.sha256", "result.json", "verify.mts"],
  );
  for (const artifact of reviewManifest.artifacts) {
    const bytes = readFileSync(path.join(here, artifact.path));
    assert.equal(bytes.byteLength, artifact.bytes, `review artifact byte drift: ${artifact.path}`);
    assert.equal(sha256(bytes), artifact.sha256, `review artifact hash drift: ${artifact.path}`);
  }
  const reviewManifestRows = reviewManifest.artifacts.length;
  assert.equal(reviewManifestRows, 4);
  process.stdout.write(`${JSON.stringify({
    verification: "PASS",
    reviewedVerdict: "FAIL",
    targetManifestHashesReproduced: targetManifestRows.length,
    independentlyBoundFiles: sourceHashFiles,
    fullRepositoryLocalClosureFiles: fullClosure.files.length,
    compilerRepositoryLocalClosureFiles: compilerClosure.files.length,
    runtimeRepositoryLocalClosureFiles: runtimeClosure.files.length,
    targetClaimedCompilerSourceFiles: privateArtifact.sourceClosure.length,
    omittedCompilerImportFiles: omittedCompilerImports.length,
    syntheticArbitraryDelegateInvocations: arbitraryDelegateInvocations,
    documentedVerifierStatus: documented.status,
    scopedTypeScriptStatus: typecheck.status,
    offlineTestPasses: 22,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    realCredentialValueReads: 0,
    productionDatabaseReads: 0,
    ephemeralSyntheticSQLiteOnly: true,
    livePilotPerformed: false,
  }, null, 2)}\n`);
}

await main();
