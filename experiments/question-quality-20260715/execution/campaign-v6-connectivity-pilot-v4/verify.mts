import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import { computeLiveClosureV4 } from "./live-closure.mts";
import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV4, validateProtocolV4 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const manifestPath = path.join(here, "MANIFEST.sha256");
const ledgerPath = path.join(repoRoot, "experiments/question-quality-20260715/budget-ledger.json");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const tscCli = path.join(repoRoot, "node_modules/typescript/bin/tsc");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.replaceAll("\\", "/");

type IndependentEdge = {
  from: string;
  kind: "static-import" | "static-export" | "import-equals" | "literal-dynamic-import" | "literal-require";
  specifier: string;
  to: string;
};

const compilerEntrypoints = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compile-exact-wire.mts",
] as const;
const compilerDataInputs = [
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-v2.json",
] as const;
const liveEntrypoints = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/capture-price-snapshot.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/operator-wrapper.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/production-runner.ts",
] as const;
const liveDataInputs = [
  ["experiments/question-quality-20260715/budget-ledger.json", "mutable_runtime_data_precondition"],
  ["experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/private/exact-wire-v4.private.json", "immutable_runtime_data"],
  ["experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/protocol-v4.json", "immutable_runtime_data"],
] as const;

function canonicalRepoFile(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `independent graph escaped repository: ${absolute}`);
  const real = realpathSync.native(resolved);
  const normalize = (candidate: string): string => process.platform === "win32" ? path.resolve(candidate).toLowerCase() : path.resolve(candidate);
  assert.equal(normalize(real), normalize(resolved), `noncanonical graph path: ${relative}`);
  assert(statSync(resolved).isFile());
  return resolved;
}

function relativeRepo(absolute: string): string {
  return slash(path.relative(repoRoot, canonicalRepoFile(absolute)));
}

function independentResolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.mts"), path.join(base, "index.cts"),
    path.join(base, "index.js"), path.join(base, "index.mjs"),
  ];
  const matches = candidates.filter((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  assert.equal(matches.length, 1, `independent resolver found ${matches.length} matches for ${specifier} from ${relativeRepo(from)}`);
  return canonicalRepoFile(matches[0]!);
}

function independentGraph(entrypoints: readonly string[]) {
  const queue = entrypoints.map((entry) => canonicalRepoFile(path.join(repoRoot, entry)));
  const visited = new Set<string>();
  const edges: IndependentEdge[] = [];
  const external = new Set<string>();
  const unresolvedLocalSpecifiers: Array<{ from: string; specifier: string }> = [];
  const nonliteralDynamicLoads: string[] = [];
  while (queue.length > 0) {
    const absolute = canonicalRepoFile(queue.shift()!);
    const relative = relativeRepo(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (absolute.endsWith(".json")) continue;
    const source = ts.createSourceFile(absolute, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true, absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imports: Array<{ specifier: string; kind: IndependentEdge["kind"] }> = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, kind: ts.isImportDeclaration(node) ? "static-import" : "static-export" });
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
        imports.push({ specifier: node.moduleReference.expression.text, kind: "import-equals" });
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const kind: IndependentEdge["kind"] = node.expression.kind === ts.SyntaxKind.ImportKeyword ? "literal-dynamic-import" : "literal-require";
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) imports.push({ specifier: node.arguments[0]!.text, kind });
        else nonliteralDynamicLoads.push(`${relative}:${node.getStart(source)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const imported of imports) {
      const resolved = independentResolve(absolute, imported.specifier);
      if (resolved) {
        const target = relativeRepo(resolved);
        edges.push({ from: relative, kind: imported.kind, specifier: imported.specifier, to: target });
        if (!visited.has(target)) queue.push(resolved);
      } else if (imported.specifier.startsWith(".") || imported.specifier.startsWith("@/")) {
        unresolvedLocalSpecifiers.push({ from: relative, specifier: imported.specifier });
      } else external.add(imported.specifier);
    }
  }
  const key = (edge: IndependentEdge): string => `${edge.from}\0${edge.kind}\0${edge.specifier}\0${edge.to}`;
  return {
    files: [...visited].sort(),
    edges: edges.sort((left, right) => key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0),
    externalSpecifiers: [...external].sort(),
    unresolvedLocalSpecifiers: unresolvedLocalSpecifiers.sort((left, right) => `${left.from}:${left.specifier}`.localeCompare(`${right.from}:${right.specifier}`)),
    nonliteralDynamicLoads: nonliteralDynamicLoads.sort(),
  };
}

function exactRow(relative: string, kind: string) {
  const bytes = readFileSync(canonicalRepoFile(path.join(repoRoot, relative)));
  return { path: slash(relative), kind, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function assertExactRows(candidate: unknown, expected: unknown, label: string): void {
  assert.equal(stableJsonV4(candidate), stableJsonV4(expected), `${label} requires exact set/bytes/hash equality; subsets and minimum-count substitutes are forbidden`);
}

function schemaKeywords(value: unknown, result = new Set<string>()): Set<string> {
  assert(value && typeof value === "object" && !Array.isArray(value), "response schema node must be an object");
  const schema = value as Record<string, unknown>;
  Object.keys(schema).forEach((key) => result.add(key));
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    Object.values(schema.properties as Record<string, unknown>).forEach((child) => schemaKeywords(child, result));
  }
  if (schema.items) schemaKeywords(schema.items, result);
  return result;
}

const supportedParserSchemaKeywords = new Set([
  "$schema", "type", "properties", "required", "additionalProperties", "items",
  "minItems", "maxItems", "minLength", "maxLength", "enum", "const", "minimum",
  "maximum", "pattern", "description", "title",
]);

function enumerateFileSystemCalls(sourceFiles: readonly string[]) {
  const calls: Array<{ path: string; operation: string; position: number }> = [];
  for (const relative of sourceFiles) {
    if (relative.endsWith(".json")) continue;
    const absolute = path.join(repoRoot, relative);
    const text = readFileSync(absolute, "utf8");
    const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const direct = new Map<string, string>();
    const namespaces = new Set<string>();
    const collectBindings = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && (node.moduleSpecifier.text === "node:fs" || node.moduleSpecifier.text === "node:fs/promises")) {
        const clause = node.importClause;
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) direct.set(element.name.text, element.propertyName?.text ?? element.name.text);
        } else if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaces.add(clause.namedBindings.name.text);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        let initializer: ts.Expression = node.initializer;
        while (ts.isAsExpression(initializer) || ts.isTypeAssertionExpression(initializer) || ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
        if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "require" && initializer.arguments.length === 1 &&
            ts.isStringLiteralLike(initializer.arguments[0]!) && (initializer.arguments[0]!.text === "node:fs" || initializer.arguments[0]!.text === "node:fs/promises")) {
          namespaces.add(node.name.text);
        }
      }
      ts.forEachChild(node, collectBindings);
    };
    collectBindings(source);
    const collectCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && direct.has(node.expression.text)) {
          calls.push({ path: relative, operation: direct.get(node.expression.text)!, position: node.getStart(source) });
        } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && namespaces.has(node.expression.expression.text)) {
          calls.push({ path: relative, operation: node.expression.name.text, position: node.getStart(source) });
        }
      }
      ts.forEachChild(node, collectCalls);
    };
    collectCalls(source);
  }
  return calls.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.position - right.position);
}

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

function verifyPreservedPackageManifest(relativeManifest: string, expectedManifestSha256: string): number {
  const absoluteManifest = path.join(repoRoot, relativeManifest);
  const bytes = readFileSync(absoluteManifest);
  assert.equal(sha256(bytes), expectedManifestSha256, `preserved package manifest changed: ${relativeManifest}`);
  const rows = bytes.toString("utf8").trim().split(/\r?\n/u);
  for (const row of rows) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match, `malformed preserved manifest row: ${row}`);
    assert.equal(sha256(readFileSync(path.join(repoRoot, match[2]!))), match[1], `preserved package byte drift: ${match[2]}`);
  }
  return rows.length;
}

async function main(): Promise<void> {
  let deniedNetworkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { deniedNetworkAttempts += 1; throw new Error("V4_OFFLINE_VERIFIER_NETWORK_DENIED"); }) as typeof fetch;
  try {
    const ledgerBefore = readFileSync(ledgerPath);
    const protocolBytes = readFileSync(path.join(here, "protocol-v4.json"));
    const protocol = validateProtocolV4(JSON.parse(protocolBytes.toString("utf8")) as unknown);
    assert.deepEqual(protocol.authorization, { liveExecutionAuthorized: false, hostileAuditPassed: false, dispatchCommandPresent: false });
    assert(Object.values(protocol.authorFreezeActivity).every((value) => value === 0));
    const privateBytes = readFileSync(path.join(repoRoot, protocol.exactWireCommitment.privateArtifactPath));
    const publicBytes = readFileSync(path.join(repoRoot, protocol.exactWireCommitment.publicArtifactPath));
    assert.equal(sha256(privateBytes), protocol.exactWireCommitment.privateArtifactSha256);
    assert.equal(sha256(publicBytes), protocol.exactWireCommitment.publicArtifactSha256);
    const manifestFiles = verifyManifest();
    const preservedV2Files = verifyPreservedPackageManifest(
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/MANIFEST.sha256",
      "8234032c53b742648345c06020f37f3f069dd60d883cf490076cc5dde7c18ea2",
    );
    const preservedV3Files = verifyPreservedPackageManifest(
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/MANIFEST.sha256",
      "f5baacde25a267e6a6413a5f21380f1ed735308b39213099393eab1d4c78b192",
    );

    const independentCompiler = independentGraph(compilerEntrypoints);
    assert.deepEqual(independentCompiler.unresolvedLocalSpecifiers, []);
    assert.deepEqual(independentCompiler.nonliteralDynamicLoads, []);
    const independentCompilerSources = independentCompiler.files.map((relative) => exactRow(relative, "compiler_source"));
    const independentCompilerData = [...compilerDataInputs].sort().map((relative) => exactRow(relative, "declared_compiler_data"));
    const independentCompilerRows = [...independentCompilerSources, ...independentCompilerData]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    assert.equal(independentCompilerSources.length, 192, "independent compiler graph cardinality drifted");
    assert.equal(independentCompilerData.length, 4);
    assert.equal(independentCompilerRows.length, 196);
    const compilerClosureBytes = readFileSync(path.join(repoRoot, protocol.compilerClosureContract.artifactPath));
    assert.equal(sha256(compilerClosureBytes), protocol.compilerClosureContract.artifactSha256);
    const storedCompilerClosure = JSON.parse(compilerClosureBytes.toString("utf8")) as Record<string, unknown>;
    assertExactRows(storedCompilerClosure.sourceFiles, independentCompilerSources, "compiler source closure");
    assertExactRows(storedCompilerClosure.declaredDataInputs, independentCompilerData, "compiler declared-data closure");
    assertExactRows(storedCompilerClosure.files, independentCompilerRows, "complete compiler closure");
    const resolution = storedCompilerClosure.resolutionEvidence as Record<string, unknown>;
    assertExactRows(resolution.edges, independentCompiler.edges, "compiler import edges");
    assertExactRows(resolution.externalSpecifiers, independentCompiler.externalSpecifiers, "compiler external specifiers");
    assert.deepEqual(resolution.unresolvedLocalSpecifiers, []);
    assert.deepEqual(resolution.nonliteralDynamicLoads, []);
    assert.equal(storedCompilerClosure.exactSourceFileSetAndBytesSha256, sha256(stableJsonV4(independentCompilerSources)));
    assert.equal(storedCompilerClosure.exactDeclaredDataSetAndBytesSha256, sha256(stableJsonV4(independentCompilerData)));
    assert.equal(storedCompilerClosure.exactCompilerClosureSetAndBytesSha256, sha256(stableJsonV4(independentCompilerRows)));
    const compilerCore = { ...storedCompilerClosure };
    delete compilerCore.compilerClosureSemanticSha256;
    assert.equal(storedCompilerClosure.compilerClosureSemanticSha256, sha256(stableJsonV4(compilerCore)));
    assert.equal(storedCompilerClosure.compilerClosureSemanticSha256, protocol.compilerClosureContract.semanticSha256);
    assert.equal(protocol.compilerClosureContract.exactSourceFiles, independentCompilerSources.length);
    assert.equal(protocol.compilerClosureContract.exactDeclaredDataInputs, independentCompilerData.length);
    assert.equal(protocol.compilerClosureContract.exactTotalFiles, independentCompilerRows.length);

    const fsCalls = enumerateFileSystemCalls(independentCompiler.files);
    const fsCallFiles = [...new Set(fsCalls.map((row) => row.path))].sort();
    assert.deepEqual(fsCallFiles, [
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compile-exact-wire.mts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compiler-closure.mts",
      "src/lib/question-generation-llm.ts",
    ], "independent fs-capability inventory changed");
    const unexpectedReadFile = fsCalls.filter((row) => /read|open|stream/iu.test(row.operation) && ![
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compile-exact-wire.mts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compiler-closure.mts",
    ].includes(row.path));
    assert.deepEqual(unexpectedReadFile, [], "a production dependency gained an unclassified filesystem read");
    const v2CompilerSource = readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts"), "utf8");
    for (const name of ["protocolV2", "originalProtocolV1", "corpusPublic", "corpusPrivate"] as const) {
      assert.match(v2CompilerSource, new RegExp(`readJson<[^>]+>\\(paths\\.${name}\\)`, "u"), `v2 declared data read ${name} disappeared or changed`);
    }
    const v2CompilerModule = await import("../campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts");
    const v2SourcePaths = v2CompilerModule.paths;
    assert.equal(relativeRepo(v2SourcePaths.protocolV2), compilerDataInputs[3]);
    assert.equal(relativeRepo(v2SourcePaths.originalProtocolV1), compilerDataInputs[2]);
    assert.equal(relativeRepo(v2SourcePaths.corpusPublic), compilerDataInputs[1]);
    assert.equal(relativeRepo(v2SourcePaths.corpusPrivate), compilerDataInputs[0]);
    const allCompilerText = independentCompiler.files.map((relative) => readFileSync(path.join(repoRoot, relative), "utf8")).join("\n");
    assert.doesNotMatch(allCompilerText, /node:fs\/promises|Bun\.file|Deno\.(?:read|open)/u);
    const qgenSource = readFileSync(path.join(repoRoot, "src/lib/question-generation-llm.ts"), "utf8");
    assert.match(qgenSource, /const dir = process\.env\.QGEN_FALLBACK_RAW_DUMP_DIR;\s*if \(!dir\) return;/u);
    assert.match(v2CompilerSource, /QGEN_/u, "offline compiler must erase every QGEN_ debug-write environment variable");

    const privateArtifact = JSON.parse(privateBytes.toString("utf8")) as Record<string, unknown>;
    assert(!Object.hasOwn(privateArtifact, "productionSourceClosure"), "v4 must not retain the inherited 32-row field as authority");
    assertExactRows(privateArtifact.productionCompilerClosure, independentCompilerRows, "private exact-wire compiler closure");
    assert.equal(privateArtifact.productionCompilerClosureSha256, sha256(stableJsonV4(independentCompilerRows)));
    const authority = privateArtifact.productionCompilerAuthority as Record<string, unknown>;
    assert.equal(authority.inheritedThirtyTwoRowClosureAuthority, false);
    assert.equal(authority.inheritedThirtyTwoRowClosureRows, 32);
    const exactRows = privateArtifact.rows as Array<Record<string, unknown>>;
    assert.equal(exactRows.length, 2);
    for (const [index, row] of exactRows.entries()) {
      const bodyText = row.bodyText;
      assert.equal(typeof bodyText, "string");
      const body = JSON.parse(bodyText as string) as Record<string, unknown>;
      assert.equal(body.model, index === 0 ? "google/gemini-3.5-flash" : "google/gemini-3.1-pro-preview");
      assert.deepEqual(body.provider, {
        order: ["google-vertex/global"], only: ["google-vertex/global"], allow_fallbacks: false,
        require_parameters: true, data_collection: "deny", zdr: true,
      });
      assert.deepEqual(body.reasoning, { enabled: false, effort: "none", exclude: true });
      const responseFormat = body.response_format as Record<string, unknown>;
      const jsonSchema = responseFormat.json_schema as Record<string, unknown>;
      const schema = jsonSchema.schema as Record<string, unknown>;
      assert.equal(responseFormat.type, "json_schema");
      assert.equal(jsonSchema.strict, true);
      assert.equal(sha256(stableJsonV4(schema)), row.schemaSha256);
      const unsupported = [...schemaKeywords(schema)].filter((keyword) => !supportedParserSchemaKeywords.has(keyword));
      assert.deepEqual(unsupported, [], `wire ${index + 1} contains response-schema keywords unsupported by the live parser`);
      assert.equal(((schema.properties as Record<string, unknown>).questions as Record<string, unknown>).minItems, 1);
      assert.equal(((schema.properties as Record<string, unknown>).questions as Record<string, unknown>).maxItems, 1);
    }
    const v3Private = JSON.parse(readFileSync(path.join(here, "../campaign-v6-connectivity-pilot-v3/private/exact-wire-v3.private.json"), "utf8")) as Record<string, unknown>;
    const inheritedSubset = v3Private.productionSourceClosure as unknown[];
    assert.equal(inheritedSubset.length, 32);
    assert(inheritedSubset.length >= 32, "regression fixture must demonstrate why a minimum-count test is insufficient");
    assert.throws(() => assertExactRows(inheritedSubset, independentCompilerRows, "v3 subset regression"), /exact set\/bytes\/hash equality/u);
    assert.throws(() => assertExactRows(independentCompilerRows.slice(0, -1), independentCompilerRows, "v4 one-row deletion regression"), /exact set\/bytes\/hash equality/u);

    const storedClosure = JSON.parse(readFileSync(path.join(here, "live-closure-v4.json"), "utf8")) as ReturnType<typeof computeLiveClosureV4>;
    const computedClosure = computeLiveClosureV4();
    assert.equal(stableJsonV4(computedClosure), stableJsonV4(storedClosure), "exact live closure set/hash differs");
    const independentLive = independentGraph(liveEntrypoints);
    assert.deepEqual(independentLive.unresolvedLocalSpecifiers, []);
    assert.deepEqual(independentLive.nonliteralDynamicLoads, []);
    const independentLiveRows = [
      ...independentLive.files.map((relative) => exactRow(relative, "source")),
      ...liveDataInputs.map(([relative, kind]) => exactRow(relative, kind)),
    ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.kind < right.kind ? -1 : 1);
    assert.equal(independentLive.files.length, 8);
    assert.equal(independentLiveRows.length, 11);
    assertExactRows(storedClosure.files, independentLiveRows, "live runtime closure");
    assert.equal(storedClosure.completeness.minimumCountAcceptanceUsed, false);
    assert(!storedClosure.files.some((row) => /offline\.test|test-support|verify|build-offline/u.test(row.path)));
    assert.equal(storedClosure.files.length, protocol.liveClosureContract.exactExpectedFiles);
    const authorReportBytes = readFileSync(path.join(here, "AUTHOR-REPORT.json"));
    const authorReport = JSON.parse(authorReportBytes.toString("utf8")) as Record<string, unknown>;
    assert.equal(authorReport.protocolSha256, sha256(protocolBytes));
    assert.equal(authorReport.exactWirePrivateSha256, sha256(privateBytes));
    assert.equal(authorReport.exactWirePublicSha256, sha256(publicBytes));
    assert.equal(authorReport.compilerClosureSha256, sha256(compilerClosureBytes));
    assert.equal(authorReport.compilerClosureSemanticSha256, storedCompilerClosure.compilerClosureSemanticSha256);
    assert.equal(authorReport.liveClosureSha256, sha256(readFileSync(path.join(here, "live-closure-v4.json"))));
    assert.equal(authorReport.liveClosureSemanticSha256, storedClosure.closureSemanticSha256);
    assert.equal(authorReport.exactCompilerSourceFiles, 192);
    assert.equal(authorReport.exactCompilerDeclaredDataInputs, 4);
    assert.equal(authorReport.exactCompilerClosureFiles, 196);
    assert.equal(authorReport.exactLiveClosureFiles, 11);
    assert.doesNotMatch(protocolBytes.toString("utf8"), /"0{64}"/u, "protocol retains an unsealed hash placeholder");
    assert.doesNotMatch(authorReportBytes.toString("utf8"), /"0{64}"/u, "author report retains an unsealed hash placeholder");
    const v3Protocol = JSON.parse(readFileSync(path.join(here, "../campaign-v6-connectivity-pilot-v3/protocol-v3.json"), "utf8")) as Record<string, unknown>;
    const v3Wire = v3Protocol.exactWireCommitment as Record<string, unknown>;
    assert.notEqual(protocol.exactWireCommitment.privateArtifactSha256, v3Wire.privateArtifactSha256, "v4 retained the v3 private artifact hash");
    assert.notEqual(protocol.exactWireCommitment.publicArtifactSha256, v3Wire.publicArtifactSha256, "v4 retained the v3 public artifact hash");
    const readme = readFileSync(path.join(here, "README.md"), "utf8");
    assert.match(readme, /build-offline\.mts --check/u, "README must document the non-writing parity command");
    for (const line of readme.split(/\r?\n/u).filter((value) => value.includes("build-offline.mts"))) {
      assert.match(line, /build-offline\.mts --(?:check|write)\s*$/u, `README has an unqualified build command: ${line}`);
    }
    runMustFail(process.execPath, [tsxCli, path.join(here, "build-offline.mts")], /choose exactly one of --write or --check/u);
    const buildOutput = run(process.execPath, [tsxCli, path.join(here, "build-offline.mts"), "--check"]);
    assert.match(buildOutput, /V4_WRITE_NO_WRITE_PARITY_CONFIRMED/u);
    run(process.execPath, [tscCli, "-p", path.join(here, "tsconfig.json"), "--pretty", "false"]);
    const testOutput = run(process.execPath, [tsxCli, "--test", path.join(here, "offline.test.ts")]);
    const passMatch = /(?:^|\n)(?:#|ℹ)\s+pass\s+(\d+)/u.exec(testOutput);
    assert(passMatch, "offline test pass count missing");
    assert(!/(?:^|\n)(?:#|ℹ)\s+fail\s+[1-9]/u.test(testOutput), "offline test suite failed");
    runMustFail(process.execPath, [tsxCli, path.join(here, "operator-wrapper.mts")], /No dispatch command is present/u);
    const runnerModule = await import("./production-runner.ts");
    const runnerExports = (runnerModule as unknown as { default?: typeof runnerModule }).default ?? runnerModule;
    assert.deepEqual(Object.keys(runnerExports).sort(), ["runSealedConnectivityPilotV4"], "production runner exposed additional authority");
    await assert.rejects(
      () => runnerExports.runSealedConnectivityPilotV4({ runId: "offline-verifier-must-not-create", priceSnapshotPath: "forbidden" }),
      /live dispatch is not authorized/u,
    );
    assert.equal(deniedNetworkAttempts, 0, "module-load fetch capture bypassed the offline deny guard");
    assert.equal(sha256(readFileSync(ledgerPath)), sha256(ledgerBefore), "author verifier mutated global ledger");
    assert.equal(deniedNetworkAttempts, 0);
    process.stdout.write(`${JSON.stringify({
      verdict: "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED",
      protocolSha256: sha256(protocolBytes),
      manifestFiles,
      exactLiveClosureFiles: storedClosure.files.length,
      liveClosureSemanticSha256: storedClosure.closureSemanticSha256,
      exactCompilerSourceFiles: independentCompilerSources.length,
      exactCompilerDeclaredDataInputs: independentCompilerData.length,
      exactCompilerClosureFiles: independentCompilerRows.length,
      compilerClosureArtifactSha256: sha256(compilerClosureBytes),
      compilerClosureSemanticSha256: storedCompilerClosure.compilerClosureSemanticSha256,
      inheritedV3SubsetRowsRejected: inheritedSubset.length,
      preservedV2Files,
      preservedV3Files,
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
