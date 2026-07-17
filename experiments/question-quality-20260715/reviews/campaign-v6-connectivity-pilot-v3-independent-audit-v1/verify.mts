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
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";

type JsonObject = Record<string, unknown>;
type Graph = {
  files: string[];
  edges: Array<{ from: string; specifier: string; to: string; kind: string }>;
  externalSpecifiers: string[];
  unresolvedLocalSpecifiers: Array<{ from: string; specifier: string }>;
  nonliteralDynamicLoads: string[];
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const targetRelative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3";
const targetRoot = path.join(repoRoot, targetRelative);
const v2Relative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2";
const v2Root = path.join(repoRoot, v2Relative);
const priorV2ReviewRelative = "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v2-independent-review-v1";
const ledgerRelative = "experiments/question-quality-20260715/budget-ledger.json";
const ledgerPath = path.join(repoRoot, ledgerRelative);
const sourceHashesPath = path.join(here, "SOURCE-HASHES.sha256");
const resultPath = path.join(here, "result.json");
const reviewManifestPath = path.join(here, "REVIEW-MANIFEST.json");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const tscCli = path.join(repoRoot, "node_modules/typescript/bin/tsc");

const liveEntrypoints = [
  `${targetRelative}/capture-price-snapshot.mts`,
  `${targetRelative}/live-child.mts`,
  `${targetRelative}/operator-wrapper.mts`,
  `${targetRelative}/production-runner.ts`,
] as const;
const compilerEntrypoints = [`${targetRelative}/compile-exact-wire.mts`] as const;
const testSupportEntrypoints = [`${targetRelative}/test-support.ts`] as const;

const V2_BASELINE: Readonly<Record<string, string>> = {
  "MANIFEST.sha256": "8234032c53b742648345c06020f37f3f069dd60d883cf490076cc5dde7c18ea2",
  "README.md": "f363f44138a540afb1f993963118aab88933b96a50aaa90917f701fc3a643490",
  "compile-exact-wire.mts": "7597c4d101c9f5bd5d85298475fbb7e8cc20f8448f9cfa0cbf8f84021de9f484",
  "live-child.mts": "39e00daab43024737198aa09a6197d7612ac5182ff79d90e6fe9e338f01199f2",
  "live-launcher.ts": "f582eba079839e789104e4893e6d7541e0d9d9a0a91f3582d6f2794c50024419",
  "offline-exact-wire-seal-v2.json": "8f801052a4eed1c3ec908f7105ec58b0ed1d7a96e197c45033dc2fbd79c2c181",
  "offline.test.ts": "03da00a5b730895f489d90e620d3063d1e6d8f7b93812547657960c7f4b18fd8",
  "private/.gitignore": "240a3e0d37d2e86b614063f5347eb02d4f99ca6c254de6b82871ff8d95532a7d",
  "private/exact-wire-v2.private.json": "9f82b1d2934beafac2f32d4daa1d7328870b8928a11ab2a502f4a8f26f8fae49",
  "protocol-schema.ts": "2daf5f982e25ccffdcd83411c56026e6ea209bbf8f9d64eedf358ebe080b0a46",
  "protocol-v2.json": "df1247adced33f22e9993ef335202ff23b17587f7eaa4349b01fafdc88364ede",
  "runner.ts": "9490d1ed02af7aaa0e7a6b0ebbbe9aa99172c2d50ba79185669956fa23dbe0bd",
  "seal-offline.mts": "6ed2b814b71ff6646da655fd94b9febde2f03cc0d6b1843672aacf3fc1584dda",
  "tsconfig.json": "0cfc3405b54ee01f6823cd963ece035ad755ccad5690096c6ac1e46f25d1ccfd",
  "verify.mts": "860da554d88cb7faae4d83f0c04715f42d837f5917e2184aab607cddbadacff3",
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function repoRelative(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `path escaped repository: ${absolute}`);
  const real = realpathSync.native(resolved);
  const normalize = (candidate: string): string => process.platform === "win32" ? path.resolve(candidate).toLowerCase() : path.resolve(candidate);
  assert.equal(normalize(real), normalize(resolved), `noncanonical repository path: ${relative}`);
  return slash(relative);
}

function walkFiles(root: string): string[] {
  const queue = [root];
  const files: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile()) files.push(repoRelative(absolute));
      else assert.fail(`non-regular filesystem entry: ${absolute}`);
    }
  }
  return files.sort();
}

function resolveLocalImport(fromAbsolute: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromAbsolute), specifier);
  else return null;
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.mts"), path.join(base, "index.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function collectGraph(entrypoints: readonly string[]): Graph {
  const queue = entrypoints.map((entry) => path.join(repoRoot, entry));
  const visited = new Set<string>();
  const external = new Set<string>();
  const unresolved: Array<{ from: string; specifier: string }> = [];
  const nonliteral: string[] = [];
  const edges: Graph["edges"] = [];
  while (queue.length > 0) {
    const absolute = path.resolve(queue.shift()!);
    const relative = repoRelative(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (absolute.endsWith(".json")) continue;
    const text = readFileSync(absolute, "utf8");
    const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const specifiers: Array<{ value: string; kind: string }> = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specifiers.push({ value: node.moduleSpecifier.text, kind: ts.isImportDeclaration(node) ? "static-import" : "static-export" });
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
        specifiers.push({ value: node.moduleReference.expression.text, kind: "import-equals" });
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
          specifiers.push({ value: node.arguments[0]!.text, kind: node.expression.kind === ts.SyntaxKind.ImportKeyword ? "literal-dynamic-import" : "literal-require" });
        } else {
          nonliteral.push(`${relative}:${node.getStart(source)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const item of specifiers) {
      const imported = resolveLocalImport(absolute, item.value);
      if (imported) {
        const to = repoRelative(imported);
        edges.push({ from: relative, specifier: item.value, to, kind: item.kind });
        if (!visited.has(to)) queue.push(imported);
      } else if (item.value.startsWith(".") || item.value.startsWith("@/")) {
        unresolved.push({ from: relative, specifier: item.value });
      } else {
        external.add(item.value);
      }
    }
  }
  const edgeKey = (row: Graph["edges"][number]): string => `${row.from}\0${row.specifier}\0${row.to}\0${row.kind}`;
  return {
    files: [...visited].sort(),
    edges: edges.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))),
    externalSpecifiers: [...external].sort(),
    unresolvedLocalSpecifiers: unresolved.sort((left, right) => `${left.from}:${left.specifier}`.localeCompare(`${right.from}:${right.specifier}`)),
    nonliteralDynamicLoads: nonliteral.sort(),
  };
}

function exactRow(relative: string, kind: "source" | "immutable_runtime_data" | "mutable_runtime_data_precondition") {
  const bytes = readFileSync(path.join(repoRoot, relative));
  return { path: relative, kind, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function independentLiveRows(liveGraph: Graph) {
  const rows = [
    ...liveGraph.files.map((file) => exactRow(file, "source")),
    exactRow(`${targetRelative}/private/exact-wire-v3.private.json`, "immutable_runtime_data"),
    exactRow(`${targetRelative}/protocol-v3.json`, "immutable_runtime_data"),
    exactRow(ledgerRelative, "mutable_runtime_data_precondition"),
  ];
  return rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.kind < right.kind ? -1 : 1);
}

function sourceHashPaths(compilerGraph: Graph, liveRows: ReturnType<typeof independentLiveRows>): string[] {
  const paths = new Set<string>([
    ...compilerGraph.files,
    ...liveRows.map((row) => row.path),
    ...walkFiles(targetRoot),
    ...walkFiles(v2Root),
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "node_modules/tsx/dist/cli.mjs",
    "node_modules/typescript/bin/tsc",
    "node_modules/typescript/lib/typescript.js",
    "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
    "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
    `${priorV2ReviewRelative}/SOURCE-HASHES.sha256`,
    `${priorV2ReviewRelative}/result.json`,
    `${priorV2ReviewRelative}/REVIEW-MANIFEST.json`,
  ]);
  return [...paths].sort();
}

function sourceHashLines(compilerGraph: Graph, liveRows: ReturnType<typeof independentLiveRows>): string[] {
  return sourceHashPaths(compilerGraph, liveRows).map((relative) => `${sha256(readFileSync(path.join(repoRoot, relative)))}  ${relative}`);
}

function snapshotTree(root: string): Array<{ path: string; bytes: number; sha256: string }> {
  return walkFiles(root).map((relative) => {
    const bytes = readFileSync(path.join(repoRoot, relative));
    return { path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
}

function safeEnvironment(tempRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TEMP: tempRoot, TMP: tempRoot };
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "COMSPEC"] as const) {
    const value = process.env[name];
    if (typeof value === "string") env[name] = value;
  }
  return env;
}

function runNodeGate(tempRoot: string, args: string[], expectSuccess = true): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: safeEnvironment(tempRoot),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (expectSuccess && result.status !== 0) {
    throw new Error(`sandboxed local gate failed: ${args.join(" ")}\n${String(result.stderr).slice(0, 8000)}`);
  }
  if (!expectSuccess) assert.notEqual(result.status, 0, `sandboxed command unexpectedly succeeded: ${args.join(" ")}`);
  return { stdout: String(result.stdout), stderr: String(result.stderr), status: result.status };
}

function verifyHashManifest(filePath: string): number {
  const lines = readFileSync(filePath, "utf8").trim().split(/\r?\n/u);
  const seen = new Set<string>();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `malformed hash manifest row: ${line}`);
    const expected = match[1]!;
    const relative = slash(match[2]!);
    assert(!seen.has(relative), `duplicate hash manifest row: ${relative}`);
    seen.add(relative);
    assert.equal(sha256(readFileSync(path.join(repoRoot, relative))), expected, `hash drift: ${relative}`);
  }
  return lines.length;
}

function verifyV2Baseline(): void {
  const files = walkFiles(v2Root).map((relative) => relative.slice(v2Relative.length + 1));
  assert.deepEqual(files, Object.keys(V2_BASELINE).sort(), "v2 file set changed from independent review baseline");
  for (const [relative, expected] of Object.entries(V2_BASELINE)) {
    assert.equal(sha256(readFileSync(path.join(v2Root, relative))), expected, `v2 changed: ${relative}`);
  }
}

function readJson(filePath: string): JsonObject {
  const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonObject;
}

function exactKeys(value: unknown, expected: readonly string[], label: string): void {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...expected].sort(), `${label} keys differ`);
}

function reviewArtifacts(): string[] {
  return ["REPORT.md", "SOURCE-HASHES.sha256", "result.json", "verify.mts"];
}

function writeReviewManifest(): void {
  const artifacts = reviewArtifacts().map((relative) => {
    const bytes = readFileSync(path.join(here, relative));
    return { path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  const manifest = {
    schemaVersion: "question-quality-independent-audit-manifest-v1",
    reviewId: "campaign-v6-connectivity-pilot-v3-independent-audit-v1",
    selfExcluded: true,
    artifacts,
  };
  writeFileSync(reviewManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const compilerGraph = collectGraph(compilerEntrypoints);
  const liveGraph = collectGraph(liveEntrypoints);
  const liveRows = independentLiveRows(liveGraph);

  if (process.argv.includes("--write-source-hashes")) {
    writeFileSync(sourceHashesPath, `${sourceHashLines(compilerGraph, liveRows).join("\n")}\n`, "utf8");
    return;
  }
  if (process.argv.includes("--write-manifest")) {
    writeReviewManifest();
    return;
  }

  let verifierFetchAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    verifierFetchAttempts += 1;
    throw new Error("INDEPENDENT_AUDIT_NETWORK_FORBIDDEN");
  }) as typeof fetch;
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "campaign-v6-pilot-v3-audit-"));
  const targetBefore = snapshotTree(targetRoot);
  const ledgerBefore = readFileSync(ledgerPath);
  try {
    assert.deepEqual(compilerGraph.unresolvedLocalSpecifiers, []);
    assert.deepEqual(compilerGraph.nonliteralDynamicLoads, []);
    assert.equal(compilerGraph.files.length, 191, "independent compiler graph size drifted");
    assert.deepEqual(liveGraph.unresolvedLocalSpecifiers, []);
    assert.deepEqual(liveGraph.nonliteralDynamicLoads, []);
    assert.equal(liveGraph.files.length, 8, "independent live source graph size drifted");
    assert.equal(liveRows.length, 11, "independent live source+runtime-data closure size drifted");

    const testGraph = collectGraph(testSupportEntrypoints);
    assert.deepEqual(testGraph.unresolvedLocalSpecifiers, []);
    assert.deepEqual(testGraph.nonliteralDynamicLoads, []);
    assert.equal(testGraph.files.length, 3);
    assert(!liveGraph.files.includes(`${targetRelative}/test-support.ts`));
    assert.deepEqual(
      testGraph.files.filter((file) => !liveGraph.files.includes(file)),
      [`${targetRelative}/test-support.ts`],
    );
    const testText = testGraph.files.map((file) => readFileSync(path.join(repoRoot, file), "utf8")).join("\n");
    assert.doesNotMatch(testText, /node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)|globalThis\.fetch|\bfetch\s*\(|WebSocket|XMLHttpRequest|process\.env/iu);

    const storedClosurePath = path.join(targetRoot, "live-closure-v3.json");
    const storedClosure = readJson(storedClosurePath);
    assert.deepEqual(storedClosure.entrypoints, [...liveEntrypoints]);
    assert.equal(stableJson(storedClosure.files), stableJson(liveRows), "stored live rows differ from independent closure");
    assert.equal(storedClosure.exactFileSetAndBytesSha256, sha256(stableJson(liveRows)));
    const storedClosureCore = { ...storedClosure };
    delete storedClosureCore.closureSemanticSha256;
    assert.equal(storedClosure.closureSemanticSha256, sha256(stableJson(storedClosureCore)));

    verifyV2Baseline();
    assert.deepEqual(readFileSync(sourceHashesPath, "utf8").trim().split(/\r?\n/u), sourceHashLines(compilerGraph, liveRows));
    const sourceHashFiles = verifyHashManifest(sourceHashesPath);

    const targetManifestPath = path.join(targetRoot, "MANIFEST.sha256");
    const targetManifestRows = verifyHashManifest(targetManifestPath);
    const targetWithoutManifest = walkFiles(targetRoot).filter((file) => file !== `${targetRelative}/MANIFEST.sha256`);
    const manifestPaths = readFileSync(targetManifestPath, "utf8").trim().split(/\r?\n/u).map((line) => slash(line.slice(66))).sort();
    assert.deepEqual(manifestPaths, targetWithoutManifest);

    const protocolBytes = readFileSync(path.join(targetRoot, "protocol-v3.json"));
    const protocol = JSON.parse(protocolBytes.toString("utf8")) as JsonObject;
    assert.deepEqual(protocol.authorization, { liveExecutionAuthorized: false, hostileAuditPassed: false, dispatchCommandPresent: false });
    assert(Object.values(protocol.authorFreezeActivity as JsonObject).every((value) => value === 0));
    const ledger = JSON.parse(ledgerBefore.toString("utf8")) as JsonObject;
    assert.equal(ledger.capFullQuestionCandidates, 1000);
    assert.equal(ledger.usedFullQuestionCandidates, 0);
    assert.equal(ledger.reservedFullQuestionCandidates, 0);

    const privateArtifactBytes = readFileSync(path.join(targetRoot, "private/exact-wire-v3.private.json"));
    const publicArtifactBytes = readFileSync(path.join(targetRoot, "offline-exact-wire-seal-v3.json"));
    const privateArtifact = JSON.parse(privateArtifactBytes.toString("utf8")) as JsonObject;
    const rows = privateArtifact.rows as JsonObject[];
    assert.equal(rows.length, 2);
    const assignments = (protocol.durableBounds as JsonObject).assignments as JsonObject[];
    assert.deepEqual(rows.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
    assert.deepEqual(rows.map((row) => row.modelId), ["google/gemini-3.5-flash", "google/gemini-3.1-pro-preview"]);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const bodyText = row.bodyText;
      assert.equal(typeof bodyText, "string");
      assert.equal(row.bodySha256, sha256(bodyText as string));
      assert.equal(row.bodyUtf8Bytes, Buffer.byteLength(bodyText as string, "utf8"));
      assert.equal(row.bodySha256, assignments[index]!.exactWireBodySha256);
      assert.equal(row.bodyUtf8Bytes, assignments[index]!.exactWireBodyUtf8Bytes);
      assert.equal(row.completionCount, 1);
      assert.equal(row.candidateOutputsPerCompletion, 1);
      const body = JSON.parse(bodyText as string) as JsonObject;
      assert.equal(body.model, row.modelId);
      assert(body.n === undefined || body.n === 1);
      assert.notEqual(body.stream, true);
      assert.deepEqual(body.provider, {
        order: ["google-vertex/global"], only: ["google-vertex/global"], allow_fallbacks: false,
        require_parameters: true, data_collection: "deny", zdr: true,
      });
      assert.deepEqual(body.reasoning, { enabled: false, effort: "none", exclude: true });
      const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens].filter((value) => typeof value === "number");
      assert.deepEqual(tokenCaps, [4000]);
      const responseFormat = body.response_format as JsonObject;
      assert.equal(responseFormat.type, "json_schema");
      const jsonSchema = responseFormat.json_schema as JsonObject;
      assert.equal(jsonSchema.strict, true);
      assert(jsonSchema.schema && typeof jsonSchema.schema === "object");
    }
    const commitment = protocol.exactWireCommitment as JsonObject;
    assert.equal(commitment.privateArtifactSha256, sha256(privateArtifactBytes));
    assert.equal(commitment.publicArtifactSha256, sha256(publicArtifactBytes));

    const claimed = privateArtifact.productionSourceClosure as Array<{ path: string; bytes: number; sha256: string }>;
    assert.equal(claimed.length, 32);
    for (const row of claimed) {
      const bytes = readFileSync(path.join(repoRoot, row.path));
      assert.equal(bytes.byteLength, row.bytes);
      assert.equal(sha256(bytes), row.sha256);
    }
    const claimedPaths = new Set(claimed.map((row) => row.path));
    const compilerIntersection = compilerGraph.files.filter((file) => claimedPaths.has(file));
    const omittedCompilerFiles = compilerGraph.files.filter((file) => !claimedPaths.has(file));
    const claimedOutsideCompilerGraph = claimed.filter((row) => !compilerGraph.files.includes(row.path));
    assert.equal(compilerIntersection.length, 27);
    assert.equal(omittedCompilerFiles.length, 164);
    assert.equal(claimedOutsideCompilerGraph.length, 5);
    assert(omittedCompilerFiles.includes(`${v2Relative}/compile-exact-wire.mts`));
    assert(omittedCompilerFiles.includes(`${targetRelative}/compile-exact-wire.mts`));
    assert(omittedCompilerFiles.includes(`${targetRelative}/protocol-core.ts`));

    const runnerSource = readFileSync(path.join(targetRoot, "production-runner.ts"), "utf8");
    const childSource = readFileSync(path.join(targetRoot, "live-child.mts"), "utf8");
    const operatorSource = readFileSync(path.join(targetRoot, "operator-wrapper.mts"), "utf8");
    const liveIoSource = readFileSync(path.join(targetRoot, "live-io.ts"), "utf8");
    const executionSource = `${runnerSource}\n${childSource}\n${operatorSource}`;
    assert.doesNotMatch(executionSource, /TEST_MODE|InjectedTransport|createOffline|\bdelegate\b|\bpermit\b|test[_-]?transport|process\.env\s*(?:\[[^\]]+\]|\.\w+)\s*=/iu);
    assert.equal([...runnerSource.matchAll(/directNetworkFetchV3\s*\(/gu)].length, 1);
    assert.equal([...runnerSource.matchAll(/globalThis\.fetch/gu)].length, 1);
    assert.doesNotMatch(executionSource, /from\s+["']node:(?:http|https|net|tls|dns|dgram)["']|axios|undici|WebSocket|XMLHttpRequest/iu);
    assert.match(operatorSource, /await blockedEntrypoint\(\)/u);
    assert.match(operatorSource, /No dispatch command is present/u);
    assert.doesNotMatch(operatorSource, /console\.|writeFile|appendFile|OPENROUTER_API_KEY.*(?:hash|sha)/iu);
    assert.match(operatorSource, /^\s*const match = \/\^\\s\*\(\?:export\\s\+\)\?OPENROUTER_API_KEY/mu);
    assert.match(runnerSource, /if \(!success\) break/u);
    assert.match(runnerSource, /replayAllowed: false/u);
    const durableBounds = protocol.durableBounds as JsonObject;
    for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"] as const) {
      assert.equal(durableBounds[key], false);
    }
    assert.match(liveIoSource, /openSync\(lockPath, "wx"/u);
    assert.match(liveIoSource, /renameSync\(tempPath, target\)/u);
    assert.match(runnerSource, /reservedFullQuestionCandidates: ledger\.reservedFullQuestionCandidates \+ 2/u);
    assert.match(runnerSource, /reservedCandidates: 2/u);

    const parserModule = await import(pathToFileURL(path.join(targetRoot, "response-parser.ts")).href);
    const permissiveEvidence = parserModule.parseConnectivityResponseV3({
      rawText: JSON.stringify({
        id: "audit-local-id",
        model: "canonical-model",
        provider: "Google Vertex",
        choices: [{ index: 0, finish_reason: "length", message: { content: JSON.stringify({ questions: [{ unexpected: true }] }) } }],
        usage: { prompt_tokens: 1.5, completion_tokens: 0.5, total_tokens: 2, cost: 0 },
      }),
      requestedModel: "requested-model",
      allowedServedModels: ["canonical-model"],
      expectedProvider: "Google Vertex",
    }) as JsonObject;
    assert.equal(permissiveEvidence.finishReason, "length");
    assert.equal(permissiveEvidence.promptTokens, 1.5);

    const publicAllowlist = (protocol.publicResultContract as JsonObject).allowlist as string[];
    exactKeys(Object.fromEntries(publicAllowlist.map((key) => [key, true])), [
      "schemaVersion", "status", "startedAssignments", "settledAssignments", "successfulAssignments",
      "candidateOpportunitiesConsumed", "physicalFetches", "completionsRequested", "actualCostUsd", "effectiveCostUsd",
      "usageEvidenceComplete", "routeEvidenceComplete", "parserEvidenceComplete", "serialOrderComplete",
      "globalReservationBound", "executionArtifactSha256",
    ], "public result allowlist");

    const priceContract = protocol.pricingEvidenceContract as JsonObject;
    assert.equal(priceContract.maximumAgeMs, 900000);
    assert.equal(priceContract.canonicalSlugRequired, true);
    assert.equal(priceContract.allActiveEndpointsAndOverridesRequired, true);
    assert.equal(priceContract.chargeDimensionsRequired, true);
    assert.equal(priceContract.contentHashRequired, true);
    const priceCollectorSource = readFileSync(path.join(targetRoot, "capture-price-snapshot.mts"), "utf8");
    assert.equal([...priceCollectorSource.matchAll(/\bfetch\s*\(/gu)].length, 1);

    const buildGate = runNodeGate(tempRoot, [tsxCli, path.join(targetRoot, "build-offline.mts"), "--check"]);
    assert.match(buildGate.stdout, /V3_WRITE_NO_WRITE_PARITY_CONFIRMED/u);
    runNodeGate(tempRoot, [tscCli, "-p", path.join(targetRoot, "tsconfig.json"), "--pretty", "false"]);
    const testsGate = runNodeGate(tempRoot, [tsxCli, "--test", path.join(targetRoot, "offline.test.ts")]);
    const passMatch = /(?:^|\n).*?pass\s+(\d+)\s*$/mu.exec(testsGate.stdout);
    const failMatch = /(?:^|\n).*?fail\s+(\d+)\s*$/mu.exec(testsGate.stdout);
    assert(passMatch);
    assert.equal(Number(failMatch?.[1] ?? -1), 0);
    const operatorGate = runNodeGate(tempRoot, [tsxCli, path.join(targetRoot, "operator-wrapper.mts")], false);
    assert.match(`${operatorGate.stdout}\n${operatorGate.stderr}`, /No dispatch command is present/u);

    assert.deepEqual(snapshotTree(targetRoot), targetBefore, "audit changed target package");
    assert.equal(sha256(readFileSync(ledgerPath)), sha256(ledgerBefore), "audit changed global ledger");
    assert.equal(verifierFetchAttempts, 0);

    const storedResult = readJson(resultPath);
    assert.equal(storedResult.verdict, "FAIL");
    const metrics = storedResult.metrics as JsonObject;
    assert.equal(metrics.independentCompilerGraphFiles, 191);
    assert.equal(metrics.claimedProductionSourceClosureRows, 32);
    assert.equal(metrics.compilerGraphRowsOmittedFromClaim, 164);
    assert.equal(metrics.claimedRowsOutsideCompilerGraph, 5);
    assert.equal(metrics.independentLiveClosureFiles, 11);
    const safety = storedResult.safetyCounters as JsonObject;
    assert(Object.values(safety).every((value) => value === 0));

    const reviewManifest = readJson(reviewManifestPath);
    assert.equal(reviewManifest.selfExcluded, true);
    const reviewArtifactsStored = reviewManifest.artifacts as Array<{ path: string; bytes: number; sha256: string }>;
    assert.deepEqual(reviewArtifactsStored.map((row) => row.path), reviewArtifacts());
    for (const artifact of reviewArtifactsStored) {
      const bytes = readFileSync(path.join(here, artifact.path));
      assert.equal(bytes.byteLength, artifact.bytes);
      assert.equal(sha256(bytes), artifact.sha256);
    }

    process.stdout.write(`${JSON.stringify({
      verdict: "FAIL",
      disposition: "DO_NOT_AUTHORIZE_OR_DISPATCH",
      protocolSha256: sha256(protocolBytes),
      privateExactWireSha256: sha256(privateArtifactBytes),
      publicExactWireSha256: sha256(publicArtifactBytes),
      independentLiveClosureFiles: liveRows.length,
      independentLiveClosureRowsSha256: sha256(stableJson(liveRows)),
      independentCompilerGraphFiles: compilerGraph.files.length,
      claimedProductionSourceClosureRows: claimed.length,
      compilerGraphClaimIntersection: compilerIntersection.length,
      compilerGraphRowsOmittedFromClaim: omittedCompilerFiles.length,
      claimedRowsOutsideCompilerGraph: claimedOutsideCompilerGraph.length,
      sourceHashFiles,
      targetManifestRows,
      v2BaselineFiles: Object.keys(V2_BASELINE).length,
      authorOfflineTestsPassed: Number(passMatch[1]),
      authorScopedTypeScriptPassed: true,
      authorWriteNoWriteParityPassed: true,
      operatorCliDormant: true,
      priceCollectorExecutions: 0,
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      productionDatabaseCalls: 0,
      credentialOrSecretValueReads: 0,
      globalLedgerMutations: 0,
      targetMutations: 0,
    }, null, 2)}\n`);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
