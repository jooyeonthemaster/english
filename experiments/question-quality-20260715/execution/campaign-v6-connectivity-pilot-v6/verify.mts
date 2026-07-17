import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { builtinModules, createRequire } from "node:module";
import * as ts from "typescript";
import { build as independentEsbuild } from "esbuild";

import { runIsolatedCompilerV6 } from "./compiler-client.mts";
import * as authorBaselineLedgerModule from "./author-baseline-ledger";
import * as authorEnvironmentModule from "./author-environment";
import {
  COMPILER_EXPLICIT_ENV_V6,
  COMPILER_OS_ENV_NAMES_V6,
} from "./compiler-environment.mts";
import { computeLiveClosureV6 } from "./live-closure.mts";
import * as frozenBuildModule from "./build-frozen-runtime.mts";
import * as frozenRuntimeModule from "./frozen-runtime-core";
import * as protocolCoreModule from "./protocol-core";
import * as predecessorBindingModule from "./predecessor-binding";
import * as bundlerToolchainModule from "./bundler-toolchain-provenance";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule })
    .default ?? protocolCoreModule;
const authorBaselineLedgerExports =
  (
    authorBaselineLedgerModule as unknown as {
      default?: typeof authorBaselineLedgerModule;
    }
  ).default ?? authorBaselineLedgerModule;
const authorEnvironmentExports =
  (
    authorEnvironmentModule as unknown as {
      default?: typeof authorEnvironmentModule;
    }
  ).default ?? authorEnvironmentModule;
const predecessorBindingExports =
  (
    predecessorBindingModule as unknown as {
      default?: typeof predecessorBindingModule;
    }
  ).default ?? predecessorBindingModule;
const bundlerToolchainExports =
  (
    bundlerToolchainModule as unknown as {
      default?: typeof bundlerToolchainModule;
    }
  ).default ?? bundlerToolchainModule;
const { stableJsonV6, validateProtocolV6 } = protocolCoreExports;
const frozenBuildExports =
  (frozenBuildModule as unknown as { default?: typeof frozenBuildModule })
    .default ?? frozenBuildModule;
const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule })
    .default ?? frozenRuntimeModule;
const { buildFrozenRuntimeV6 } = frozenBuildExports;
const {
  assertCurrentNodeRuntimeV6,
  assertFrozenBundleBytesV6,
  validateFrozenRuntimeArtifactV6,
} = frozenRuntimeExports;
const { attestAuthorBaselineLedgerV6 } = authorBaselineLedgerExports;
const {
  assertNoAuthorToolchainEnvironmentInfluenceV6,
  buildExactAuthorChildEnvironmentV6,
} = authorEnvironmentExports;
const { assertPredecessorBindingV6 } = predecessorBindingExports;
const { assertCurrentBundlerToolchainV6 } = bundlerToolchainExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const authorBootstrap = path.join(here, "author-bootstrap-v6.ps1");
const windowsPowerShell =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const tscCli = path.join(repoRoot, "node_modules/typescript/bin/tsc");
const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const requireForIndependentVerifier = createRequire(import.meta.url);
const slash = (value: string): string => value.replaceAll("\\", "/");

type IndependentEdge = {
  from: string;
  kind:
    | "static-import"
    | "static-export"
    | "import-equals"
    | "literal-dynamic-import"
    | "literal-require";
  specifier: string;
  to: string;
};

const compilerEntrypoints = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
] as const;
const compilerDynamicSourceInputs = [
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
] as const;
const compilerDataInputs = [
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-v2.json",
] as const;
const liveEntrypoints = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/capture-price-snapshot.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-wrapper.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/production-runner.ts",
] as const;
const liveDataInputs = [
  [
    "experiments/question-quality-20260715/budget-ledger.json",
    "mutable_runtime_data_precondition",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/capture-price-snapshot-v6.bundle.mjs",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/live-child-v6.bundle.mjs",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/operator-wrapper-v6.bundle.mjs",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-runtime-v6.json",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-bootstrap-preflight-v6.mjs",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-bootstrap-v6.sh",
    "immutable_runtime_artifact",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/private/exact-wire-v6.private.json",
    "immutable_runtime_data",
  ],
  [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/protocol-v6.json",
    "immutable_runtime_data",
  ],
] as const;

function canonicalRepoFile(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `independent graph escaped repository: ${absolute}`,
  );
  const real = realpathSync.native(resolved);
  const normalize = (candidate: string): string =>
    process.platform === "win32"
      ? path.resolve(candidate).toLowerCase()
      : path.resolve(candidate);
  assert.equal(
    normalize(real),
    normalize(resolved),
    `noncanonical graph path: ${relative}`,
  );
  assert(statSync(resolved).isFile());
  return resolved;
}

function relativeRepo(absolute: string): string {
  return slash(path.relative(repoRoot, canonicalRepoFile(absolute)));
}

function independentResolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/"))
    base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith("."))
    base = path.resolve(path.dirname(from), specifier);
  else return null;
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
    path.join(base, "index.cts"),
    path.join(base, "index.js"),
    path.join(base, "index.mjs"),
  ];
  const matches = candidates.filter(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  assert.equal(
    matches.length,
    1,
    `independent resolver found ${matches.length} matches for ${specifier} from ${relativeRepo(from)}`,
  );
  return canonicalRepoFile(matches[0]!);
}

function independentGraph(entrypoints: readonly string[]) {
  const queue = entrypoints.map((entry) =>
    canonicalRepoFile(path.join(repoRoot, entry)),
  );
  const visited = new Set<string>();
  const edges: IndependentEdge[] = [];
  const external = new Set<string>();
  const unresolvedLocalSpecifiers: Array<{ from: string; specifier: string }> =
    [];
  const nonliteralDynamicLoads: string[] = [];
  while (queue.length > 0) {
    const absolute = canonicalRepoFile(queue.shift()!);
    const relative = relativeRepo(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (absolute.endsWith(".json")) continue;
    const source = ts.createSourceFile(
      absolute,
      readFileSync(absolute, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const imports: Array<{ specifier: string; kind: IndependentEdge["kind"] }> =
      [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        imports.push({
          specifier: node.moduleSpecifier.text,
          kind: ts.isImportDeclaration(node)
            ? "static-import"
            : "static-export",
        });
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        imports.push({
          specifier: node.moduleReference.expression.text,
          kind: "import-equals",
        });
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const kind: IndependentEdge["kind"] =
          node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? "literal-dynamic-import"
            : "literal-require";
        if (
          node.arguments.length === 1 &&
          ts.isStringLiteralLike(node.arguments[0]!)
        )
          imports.push({ specifier: node.arguments[0]!.text, kind });
        else
          nonliteralDynamicLoads.push(`${relative}:${node.getStart(source)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const imported of imports) {
      const resolved = independentResolve(absolute, imported.specifier);
      if (resolved) {
        const target = relativeRepo(resolved);
        edges.push({
          from: relative,
          kind: imported.kind,
          specifier: imported.specifier,
          to: target,
        });
        if (!visited.has(target)) queue.push(resolved);
      } else if (
        imported.specifier.startsWith(".") ||
        imported.specifier.startsWith("@/")
      ) {
        unresolvedLocalSpecifiers.push({
          from: relative,
          specifier: imported.specifier,
        });
      } else external.add(imported.specifier);
    }
  }
  const key = (edge: IndependentEdge): string =>
    `${edge.from}\0${edge.kind}\0${edge.specifier}\0${edge.to}`;
  return {
    files: [...visited].sort(),
    edges: edges.sort((left, right) =>
      key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0,
    ),
    externalSpecifiers: [...external].sort(),
    unresolvedLocalSpecifiers: unresolvedLocalSpecifiers.sort((left, right) =>
      `${left.from}:${left.specifier}`.localeCompare(
        `${right.from}:${right.specifier}`,
      ),
    ),
    nonliteralDynamicLoads: nonliteralDynamicLoads.sort(),
  };
}

function exactRow(relative: string, kind: string) {
  const bytes = readFileSync(canonicalRepoFile(path.join(repoRoot, relative)));
  return {
    path: slash(relative),
    kind,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function assertExactRows(
  candidate: unknown,
  expected: unknown,
  label: string,
): void {
  assert.equal(
    stableJsonV6(candidate),
    stableJsonV6(expected),
    `${label} requires exact set/bytes/hash equality; subsets and minimum-count substitutes are forbidden`,
  );
}

function schemaKeywords(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "response schema node must be an object",
  );
  const schema = value as Record<string, unknown>;
  Object.keys(schema).forEach((key) => result.add(key));
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  ) {
    Object.values(schema.properties as Record<string, unknown>).forEach(
      (child) => schemaKeywords(child, result),
    );
  }
  if (schema.items) schemaKeywords(schema.items, result);
  return result;
}

const supportedParserSchemaKeywords = new Set([
  "$schema",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "enum",
  "const",
  "minimum",
  "maximum",
  "pattern",
  "description",
  "title",
]);

function enumerateFileSystemCalls(sourceFiles: readonly string[]) {
  const calls: Array<{
    path: string;
    operation: string;
    position: number;
    line: number;
    character: number;
    argument: string;
  }> = [];
  for (const relative of sourceFiles) {
    if (relative.endsWith(".json")) continue;
    const absolute = path.join(repoRoot, relative);
    const text = readFileSync(absolute, "utf8");
    const source = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const direct = new Map<string, string>();
    const namespaces = new Set<string>();
    const collectBindings = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        (node.moduleSpecifier.text === "node:fs" ||
          node.moduleSpecifier.text === "node:fs/promises")
      ) {
        const clause = node.importClause;
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements)
            direct.set(
              element.name.text,
              element.propertyName?.text ?? element.name.text,
            );
        } else if (
          clause?.namedBindings &&
          ts.isNamespaceImport(clause.namedBindings)
        )
          namespaces.add(clause.namedBindings.name.text);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        let initializer: ts.Expression = node.initializer;
        while (
          ts.isAsExpression(initializer) ||
          ts.isTypeAssertionExpression(initializer) ||
          ts.isParenthesizedExpression(initializer)
        )
          initializer = initializer.expression;
        if (
          ts.isCallExpression(initializer) &&
          ts.isIdentifier(initializer.expression) &&
          initializer.expression.text === "require" &&
          initializer.arguments.length === 1 &&
          ts.isStringLiteralLike(initializer.arguments[0]!) &&
          (initializer.arguments[0]!.text === "node:fs" ||
            initializer.arguments[0]!.text === "node:fs/promises")
        ) {
          namespaces.add(node.name.text);
        }
      }
      ts.forEachChild(node, collectBindings);
    };
    collectBindings(source);
    const collectCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const position = node.getStart(source);
        const location = source.getLineAndCharacterOfPosition(position);
        const call = (operation: string) => ({
          path: relative,
          operation,
          position,
          line: location.line + 1,
          character: location.character + 1,
          argument: node.arguments[0]?.getText(source) ?? "",
        });
        if (
          ts.isIdentifier(node.expression) &&
          direct.has(node.expression.text)
        ) {
          calls.push(call(direct.get(node.expression.text)!));
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          namespaces.has(node.expression.expression.text)
        ) {
          calls.push(call(node.expression.name.text));
        }
      }
      ts.forEachChild(node, collectCalls);
    };
    collectCalls(source);
  }
  return calls.sort((left, right) =>
    left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : left.position - right.position,
  );
}

function safeEnv(): NodeJS.ProcessEnv {
  return buildExactAuthorChildEnvironmentV6(process.env);
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: safeEnv(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `offline command failed: ${path.basename(command)} ${args.join(" ")}\n${result.stderr.slice(0, 4000)}`,
    );
  return result.stdout;
}

function runMustFail(command: string, args: string[], expected: RegExp): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: safeEnv(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.notEqual(
    result.status,
    0,
    `command unexpectedly succeeded: ${args.join(" ")}`,
  );
  assert.match(`${result.stdout}\n${result.stderr}`, expected);
}

function withSealedAuthorBuild<T>(
  childArgs: string[],
  execute: (command: string, args: string[]) => T,
): T {
  const mode =
    childArgs.length === 0
      ? "invalid"
      : childArgs.length === 1 && childArgs[0] === "--check"
        ? "check"
        : childArgs.length === 1 && childArgs[0] === "--write"
          ? "write"
          : null;
  assert(mode, "author bootstrap verifier arguments differ");
  return execute(windowsPowerShell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    authorBootstrap,
    "-Mode",
    mode,
  ]);
}

async function independentlyRecomputeFrozenMetafileMappings(
  artifact: ReturnType<typeof validateFrozenRuntimeArtifactV6>,
): Promise<void> {
  const entrypoints = {
    CAPTURE_PRICE_METADATA:
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/capture-price-snapshot.mts",
    LIVE_CHILD:
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/live-child.mts",
    OPERATOR:
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-wrapper.mts",
  } as const;
  for (const bundle of artifact.bundles) {
    const result = await independentEsbuild({
      absWorkingDir: repoRoot,
      entryPoints: [entrypoints[bundle.role]],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      packages: "bundle",
      sourcemap: false,
      legalComments: "none",
      charset: "utf8",
      treeShaking: true,
      write: false,
      metafile: true,
      logLevel: "silent",
      outfile: "frozen-entry.mjs",
      tsconfigRaw: { compilerOptions: {} },
    });
    assert(result.metafile, `${bundle.role} independent metafile missing`);
    const outputs = Object.values(result.metafile.outputs);
    assert.equal(
      outputs.length,
      1,
      `${bundle.role} independent metafile output cardinality differs`,
    );
    const outputInputs = outputs[0]!.inputs;
    const independentlyObserved = Object.entries(result.metafile.inputs)
      .map(([inputPath, input]) => {
        const normalized = slash(inputPath);
        const bytes = readFileSync(path.join(repoRoot, normalized));
        assert.equal(
          bytes.byteLength,
          input.bytes,
          `${bundle.role} independent source byte count differs`,
        );
        const mapping = outputInputs[inputPath];
        assert(
          mapping &&
            Number.isSafeInteger(mapping.bytesInOutput) &&
            mapping.bytesInOutput >= 0,
        );
        return {
          path: normalized,
          sourceBytes: bytes.byteLength,
          sourceSha256: sha256(bytes),
          bytesInOutput: mapping.bytesInOutput,
        };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    assert.deepEqual(
      independentlyObserved,
      bundle.sourceInputs,
      `${bundle.role} independently recomputed source-to-bundle metafile mapping differs`,
    );
  }
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
    assert(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    );
    const bytes = readFileSync(absolute);
    assert.equal(sha256(bytes), expected, `manifest drift at ${relativePath}`);
    if (relativePath!.endsWith(".json")) {
      assert.notDeepEqual(
        [...bytes.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        `manifest JSON has UTF-8 BOM: ${relativePath}`,
      );
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      assert.doesNotThrow(
        () => JSON.parse(text),
        `manifest JSON is not exact fatal-UTF8 parseable: ${relativePath}`,
      );
    }
  }
  return rows.length;
}

function verifyV4IndependentAuditPins(): void {
  const directory =
    "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1";
  const expectedRows: Record<string, string> = {
    [`${directory}/author-gates.json`]:
      "5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0",
    [`${directory}/build.mts`]:
      "45d21b186aac9d39f928bbbf5e65c787cd602ad06968131c4dae7d424b5d3f2a",
    [`${directory}/evidence.json`]:
      "2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6",
    [`${directory}/independent-audit.mts`]:
      "1b6ce550cf2e109f106834695318460ca8a6eec2d5a80a9e7e706520317140d6",
    [`${directory}/README.md`]:
      "dcc562b826a79618006482af4bfff209832715af5d0f6a43ec1e0fad66b25e6e",
    [`${directory}/report.json`]:
      "8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3",
    [`${directory}/run-author-gates.mts`]:
      "b5e5fb904a9f6f11fb7d25e402584099ffbf4ddbdc64ae5eb93133173328ae29",
    [`${directory}/tsconfig.json`]:
      "1b2c619dd51b41bbc1b05c5f8753a2fe5440bba07f58effd3a21a134f66bc48a",
    [`${directory}/verify.mts`]:
      "2211da72c2249c1302eddac8f138acf91c4c302a36fbb7810d24f20035c73dd0",
  };
  const manifestBytes = readFileSync(
    path.join(repoRoot, directory, "MANIFEST.sha256"),
  );
  assert.equal(
    sha256(manifestBytes),
    "2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791",
  );
  const rows = manifestBytes.toString("utf8").trimEnd().split(/\r?\n/u);
  assert.equal(rows.length, 9);
  const observed: Record<string, string> = {};
  for (const row of rows) {
    const match = /^([a-f0-9]{64})  (experiments\/[^\r\n]+)$/u.exec(row);
    assert(match);
    assert(match[2]!.startsWith(`${directory}/`));
    assert(!Object.hasOwn(observed, match[2]!));
    observed[match[2]!] = match[1]!;
  }
  assert.deepEqual(observed, expectedRows);
  for (const [relative, expected] of Object.entries(expectedRows)) {
    assert.equal(sha256(readFileSync(path.join(repoRoot, relative))), expected);
  }
  assert.equal(
    sha256(
      readFileSync(
        path.join(
          repoRoot,
          "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/protocol-v4.json",
        ),
      ),
    ),
    "18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9",
  );
  const report = JSON.parse(
    readFileSync(path.join(repoRoot, directory, "report.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(report.verdict, "FAIL");
  assert.equal(
    (report.sourceListHashes as Record<string, unknown>).targetManifestSha256,
    "33a7cd93fdf4bb5af4cb8bf8f320e79203c7365bf257896f9fb67a8c05d3d37d",
  );
}

function manifestBoundContentDigest(): string {
  const rows = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  const exact = rows.map((row) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match);
    return {
      path: match[2],
      sha256: sha256(readFileSync(path.join(repoRoot, match[2]!))),
    };
  });
  return sha256(stableJsonV6(exact));
}

function assertNoNondeterministicGeneratedFields(
  relativePaths: readonly string[],
): void {
  for (const relative of relativePaths) {
    const raw = readFileSync(path.join(repoRoot, relative), "utf8");
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        assert.doesNotMatch(
          key,
          /duration|elapsed|wall.?clock|random.?temp|temporary.?directory/iu,
          `${relative}:${key}`,
        );
        visit(child);
      }
    };
    visit(JSON.parse(raw) as unknown);
    assert.doesNotMatch(
      raw,
      /[A-Z]:\\[^"\r\n]*\\Temp\\qgen-connectivity-v6-compiler-|\/tmp\/qgen-connectivity-v6-compiler-/iu,
      relative,
    );
  }
}

function verifyPreservedPackageManifest(
  relativeManifest: string,
  expectedManifestSha256: string,
): number {
  const absoluteManifest = path.join(repoRoot, relativeManifest);
  const bytes = readFileSync(absoluteManifest);
  assert.equal(
    sha256(bytes),
    expectedManifestSha256,
    `preserved package manifest changed: ${relativeManifest}`,
  );
  const rows = bytes.toString("utf8").trim().split(/\r?\n/u);
  for (const row of rows) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
    assert(match, `malformed preserved manifest row: ${row}`);
    assert.equal(
      sha256(readFileSync(path.join(repoRoot, match[2]!))),
      match[1],
      `preserved package byte drift: ${match[2]}`,
    );
  }
  return rows.length;
}

async function main(): Promise<void> {
  assertNoAuthorToolchainEnvironmentInfluenceV6(process.env);
  let deniedNetworkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    deniedNetworkAttempts += 1;
    throw new Error("V6_OFFLINE_VERIFIER_NETWORK_DENIED");
  }) as typeof fetch;
  try {
    const ledgerBefore = attestAuthorBaselineLedgerV6(repoRoot);
    const protocolBytes = readFileSync(path.join(here, "protocol-v6.json"));
    const protocol = validateProtocolV6(
      JSON.parse(protocolBytes.toString("utf8")) as unknown,
    );
    const predecessorBindingBytes = readFileSync(
      path.join(here, "predecessor-binding-v6.json"),
    );
    const predecessorBinding = assertPredecessorBindingV6(
      repoRoot,
      JSON.parse(predecessorBindingBytes.toString("utf8")) as unknown,
    );
    assert.deepEqual(protocol.authorization, {
      liveExecutionAuthorized: false,
      metadataNetworkAuthorized: false,
      hostileAuditPassed: false,
      dispatchCommandPresent: false,
    });
    assert.deepEqual(protocol.authorFreezeActivity, {
      externalNetworkCalls: 0,
      metadataNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      productionDatabaseCalls: 0,
      realCredentialValuesRead: 0,
      globalLedgerReadOnlyAttestations: 1,
      globalLedgerReservationMutations: 0,
    });
    verifyV4IndependentAuditPins();
    const privateBytes = readFileSync(
      path.join(repoRoot, protocol.exactWireCommitment.privateArtifactPath),
    );
    const publicBytes = readFileSync(
      path.join(repoRoot, protocol.exactWireCommitment.publicArtifactPath),
    );
    assert.equal(
      sha256(privateBytes),
      protocol.exactWireCommitment.privateArtifactSha256,
    );
    assert.equal(
      sha256(publicBytes),
      protocol.exactWireCommitment.publicArtifactSha256,
    );
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
    const independentCompilerSources = independentCompiler.files.map(
      (relative) => exactRow(relative, "compiler_source"),
    );
    const independentCompilerDynamicSources = [...compilerDynamicSourceInputs]
      .sort()
      .map((relative) => exactRow(relative, "dynamic_compiler_source"));
    const independentCompilerData = [...compilerDataInputs]
      .sort()
      .map((relative) => exactRow(relative, "declared_compiler_data"));
    const independentCompilerRows = [
      ...independentCompilerSources,
      ...independentCompilerDynamicSources,
      ...independentCompilerData,
    ].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    assert.equal(
      independentCompilerSources.length,
      195,
      "independent AST compiler graph cardinality drifted",
    );
    assert.equal(independentCompilerDynamicSources.length, 3);
    assert.equal(independentCompilerData.length, 4);
    assert.equal(independentCompilerRows.length, 202);
    const compilerClosureBytes = readFileSync(
      path.join(repoRoot, protocol.compilerClosureContract.artifactPath),
    );
    assert.equal(
      sha256(compilerClosureBytes),
      protocol.compilerClosureContract.artifactSha256,
    );
    const isolatedCompiler = runIsolatedCompilerV6();
    assert.equal(
      isolatedCompiler.compilerClosureBytes,
      compilerClosureBytes.toString("utf8"),
      "isolated compiler closure bytes differ",
    );
    assert.equal(
      isolatedCompiler.privateBytes,
      privateBytes.toString("utf8"),
      "isolated private exact wire differs",
    );
    assert.equal(
      isolatedCompiler.publicBytes,
      publicBytes.toString("utf8"),
      "isolated public exact wire differs",
    );
    const storedCompilerClosure = JSON.parse(
      compilerClosureBytes.toString("utf8"),
    ) as Record<string, unknown>;
    assertExactRows(
      storedCompilerClosure.sourceFiles,
      independentCompilerSources,
      "compiler source closure",
    );
    assertExactRows(
      storedCompilerClosure.dynamicSourceInputs,
      independentCompilerDynamicSources,
      "compiler dynamic SOURCE_PATHS closure",
    );
    assertExactRows(
      storedCompilerClosure.declaredDataInputs,
      independentCompilerData,
      "compiler declared-data closure",
    );
    assertExactRows(
      storedCompilerClosure.files,
      independentCompilerRows,
      "complete compiler closure",
    );
    const resolution = storedCompilerClosure.resolutionEvidence as Record<
      string,
      unknown
    >;
    assertExactRows(
      resolution.edges,
      independentCompiler.edges,
      "compiler import edges",
    );
    assertExactRows(
      resolution.externalSpecifiers,
      independentCompiler.externalSpecifiers,
      "compiler external specifiers",
    );
    assert.deepEqual(resolution.unresolvedLocalSpecifiers, []);
    assert.deepEqual(resolution.nonliteralDynamicLoads, []);
    assert.equal(
      storedCompilerClosure.exactSourceFileSetAndBytesSha256,
      sha256(stableJsonV6(independentCompilerSources)),
    );
    assert.equal(
      storedCompilerClosure.exactDynamicSourceSetAndBytesSha256,
      sha256(stableJsonV6(independentCompilerDynamicSources)),
    );
    assert.equal(
      storedCompilerClosure.exactDeclaredDataSetAndBytesSha256,
      sha256(stableJsonV6(independentCompilerData)),
    );
    assert.equal(
      storedCompilerClosure.exactCompilerClosureSetAndBytesSha256,
      sha256(stableJsonV6(independentCompilerRows)),
    );
    const compilerCore = { ...storedCompilerClosure };
    delete compilerCore.compilerClosureSemanticSha256;
    assert.equal(
      storedCompilerClosure.compilerClosureSemanticSha256,
      sha256(stableJsonV6(compilerCore)),
    );
    assert.equal(
      storedCompilerClosure.compilerClosureSemanticSha256,
      protocol.compilerClosureContract.semanticSha256,
    );
    const externalInputs =
      storedCompilerClosure.externalInputContract as Record<string, unknown>;
    const gitInput = externalInputs.git as Record<string, unknown>;
    const gitStdout = run("git", ["rev-parse", "HEAD"]);
    assert.equal(
      gitInput.stdoutUtf8Bytes,
      Buffer.byteLength(gitStdout, "utf8"),
    );
    assert.equal(gitInput.stdoutSha256, sha256(gitStdout));
    assert.equal(gitInput.canonicalHead, gitStdout.trim());
    const environmentInput = externalInputs.environment as Record<
      string,
      unknown
    >;
    const expectedEnvironmentRows = [
      ...COMPILER_OS_ENV_NAMES_V6.flatMap((name) => {
        const value = process.env[name];
        return typeof value === "string" && value.length > 0
          ? [
              {
                name,
                kind: "minimal_os",
                valueUtf8Bytes: Buffer.byteLength(value, "utf8"),
                valueSha256: sha256(value),
              },
            ]
          : [];
      }),
      ...Object.entries(COMPILER_EXPLICIT_ENV_V6).map(([name, value]) => ({
        name,
        kind: "explicit_offline_qgen",
        valueUtf8Bytes: Buffer.byteLength(value, "utf8"),
        valueSha256: sha256(value),
      })),
    ].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    assertExactRows(
      environmentInput.rows,
      expectedEnvironmentRows,
      "isolated compiler exact environment rows",
    );
    assert.equal(environmentInput.realCredentialValuesRead, 0);
    assert.equal(environmentInput.ambientEnvironmentVariablesAccepted, 0);
    assert.equal(environmentInput.droppedCredentialValuesRead, 0);
    assert.equal(
      externalInputs.exactExternalInputsSha256,
      sha256(
        stableJsonV6({
          git: gitInput,
          environment: environmentInput,
        }),
      ),
    );
    assert.equal(externalInputs.realCredentialValuesRead, 0);
    assert.equal(externalInputs.ambientEnvironmentVariablesAccepted, 0);
    assert.equal(
      protocol.compilerClosureContract.exactSourceFiles,
      independentCompilerSources.length,
    );
    assert.equal(
      protocol.compilerClosureContract.exactDynamicSourceInputs,
      independentCompilerDynamicSources.length,
    );
    assert.equal(
      protocol.compilerClosureContract.exactDeclaredDataInputs,
      independentCompilerData.length,
    );
    assert.equal(
      protocol.compilerClosureContract.exactTotalFiles,
      independentCompilerRows.length,
    );

    const fsCalls = enumerateFileSystemCalls(independentCompiler.files);
    const fsCallFiles = [...new Set(fsCalls.map((row) => row.path))].sort();
    assert.deepEqual(
      fsCallFiles,
      [
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compile-exact-wire.mts",
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-closure.mts",
        "src/lib/question-generation-llm.ts",
      ],
      "independent fs-capability inventory changed",
    );
    const unexpectedReadFile = fsCalls.filter(
      (row) =>
        /read|open|stream/iu.test(row.operation) &&
        ![
          "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
          "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compile-exact-wire.mts",
          "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
          "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-closure.mts",
        ].includes(row.path),
    );
    assert.deepEqual(
      unexpectedReadFile,
      [],
      "a production dependency gained an unclassified filesystem read",
    );
    const fileSystemContract =
      storedCompilerClosure.fileSystemInputContract as Record<string, unknown>;
    const expectedContentSites = fsCalls
      .filter((row) => row.operation === "readFileSync")
      .map((row) => ({
        path: row.path,
        line: row.line,
        character: row.character,
        callee: row.operation,
        argument: row.argument,
      }));
    const expectedMetadataSites = fsCalls
      .filter((row) =>
        ["existsSync", "realpathSync", "statSync"].includes(row.operation),
      )
      .map((row) => ({
        path: row.path,
        line: row.line,
        character: row.character,
        callee: row.operation,
        argument: row.argument,
      }));
    assertExactRows(
      fileSystemContract.exactContentInputCallSites,
      expectedContentSites,
      "compiler content-input call sites",
    );
    assertExactRows(
      fileSystemContract.exactMetadataInputCallSites,
      expectedMetadataSites,
      "compiler metadata-input call sites",
    );
    assert.equal(
      fileSystemContract.repositoryByteInputPartitionsDisjointAndExhaustive,
      true,
    );
    const v2CompilerSource = readFileSync(
      path.join(
        repoRoot,
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      ),
      "utf8",
    );
    for (const name of [
      "protocolV2",
      "originalProtocolV1",
      "corpusPublic",
      "corpusPrivate",
    ] as const) {
      assert.match(
        v2CompilerSource,
        new RegExp(`readJson<[^>]+>\\(paths\\.${name}\\)`, "u"),
        `v2 declared data read ${name} disappeared or changed`,
      );
    }
    const v2CompilerAst = ts.createSourceFile(
      "campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      v2CompilerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const variableInitializer = (name: string): ts.Expression => {
      let found: ts.Expression | null = null;
      const visit = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === name &&
          node.initializer
        ) {
          assert.equal(found, null, `v2 compiler duplicates ${name}`);
          found = node.initializer;
        }
        ts.forEachChild(node, visit);
      };
      visit(v2CompilerAst);
      assert(found, `v2 compiler lost ${name}`);
      return found;
    };
    const unwrapExpression = (expression: ts.Expression): ts.Expression => {
      let current = expression;
      while (
        ts.isAsExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isParenthesizedExpression(current) ||
        ts.isNonNullExpression(current)
      ) {
        current = current.expression;
      }
      return current;
    };
    const v2CompilerAbsolute = path.join(
      repoRoot,
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
    );
    const evaluateLiteralPathExpression = (
      expression: ts.Expression,
      stack: readonly string[] = [],
    ): string => {
      const current = unwrapExpression(expression);
      if (ts.isIdentifier(current)) {
        assert(
          !stack.includes(current.text),
          `v2 path declaration cycle: ${[...stack, current.text].join(" -> ")}`,
        );
        return evaluateLiteralPathExpression(
          variableInitializer(current.text),
          [...stack, current.text],
        );
      }
      assert(
        ts.isCallExpression(current),
        "v2 declared path must be a literal call/identifier expression",
      );
      if (
        ts.isIdentifier(current.expression) &&
        current.expression.text === "fileURLToPath"
      ) {
        assert.equal(
          current.arguments.length,
          1,
          "fileURLToPath must have one import.meta.url argument",
        );
        const argument = current.arguments[0]!;
        assert(
          ts.isPropertyAccessExpression(argument) &&
            argument.name.text === "url" &&
            ts.isMetaProperty(argument.expression) &&
            argument.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
            argument.expression.name.text === "meta",
          "v2 here must derive only from import.meta.url",
        );
        return v2CompilerAbsolute;
      }
      assert(
        ts.isPropertyAccessExpression(current.expression) &&
          ts.isIdentifier(current.expression.expression) &&
          current.expression.expression.text === "path",
        "v2 declared path call must use node:path",
      );
      const method = current.expression.name.text;
      if (method === "dirname") {
        assert.equal(
          current.arguments.length,
          1,
          "path.dirname must have one argument",
        );
        return path.dirname(
          evaluateLiteralPathExpression(current.arguments[0]!, stack),
        );
      }
      assert(
        method === "join" || method === "resolve",
        `v2 declared path uses unsupported path.${method}`,
      );
      assert(
        current.arguments.length >= 2,
        `path.${method} requires one base and literal tail`,
      );
      const base = evaluateLiteralPathExpression(current.arguments[0]!, stack);
      const tails = current.arguments.slice(1).map((argument) => {
        assert(
          ts.isStringLiteralLike(argument),
          `path.${method} tail must be a string literal`,
        );
        assert(
          !path.isAbsolute(argument.text) && !argument.text.includes("\0"),
          `path.${method} tail must be a relative non-NUL literal`,
        );
        return argument.text;
      });
      return method === "join"
        ? path.join(base, ...tails)
        : path.resolve(base, ...tails);
    };
    const pathsInitializer = unwrapExpression(variableInitializer("paths"));
    assert(
      ts.isObjectLiteralExpression(pathsInitializer),
      "v2 paths must remain an object literal",
    );
    const pathProperties = new Map<string, ts.PropertyAssignment>();
    for (const property of pathsInitializer.properties) {
      assert(
        ts.isPropertyAssignment(property) && ts.isIdentifier(property.name),
        "v2 paths must contain only named property assignments",
      );
      assert(
        !pathProperties.has(property.name.text),
        `v2 paths duplicates ${property.name.text}`,
      );
      pathProperties.set(property.name.text, property);
    }
    const expectedDeclaredPaths = new Map<string, string>([
      [
        "protocolV2",
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-v2.json",
      ],
      [
        "originalProtocolV1",
        "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
      ],
      [
        "corpusPublic",
        "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
      ],
      [
        "corpusPrivate",
        "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
      ],
    ]);
    const resolvedDeclaredPaths: string[] = [];
    for (const [name, expectedRelative] of expectedDeclaredPaths) {
      const property = pathProperties.get(name);
      assert(property, `v2 paths lost ${name}`);
      const absolute = path.resolve(
        evaluateLiteralPathExpression(property.initializer),
      );
      const relative = slash(path.relative(repoRoot, absolute));
      assert(
        relative && !relative.startsWith("../") && !path.isAbsolute(relative),
        `v2 declared path ${name} escaped repository root`,
      );
      assert.equal(
        relative,
        expectedRelative,
        `v2 declared path ${name} AST resolution differs`,
      );
      resolvedDeclaredPaths.push(relative);
    }
    assert.equal(
      new Set(resolvedDeclaredPaths).size,
      resolvedDeclaredPaths.length,
      "v2 declared data paths contain a duplicate",
    );
    assert.deepEqual(
      [...resolvedDeclaredPaths].sort(),
      [...compilerDataInputs].sort(),
      "v2 declared data AST paths differ from compiler closure data inputs",
    );

    const sourcePathsInitializer = unwrapExpression(
      variableInitializer("SOURCE_PATHS"),
    );
    assert(
      ts.isArrayLiteralExpression(sourcePathsInitializer),
      "v2 SOURCE_PATHS must remain an array literal",
    );
    const sourcePathRows = sourcePathsInitializer.elements.map((element) => {
      assert(
        ts.isStringLiteralLike(element),
        "v2 SOURCE_PATHS rows must all be string literals",
      );
      assert(
        !path.isAbsolute(element.text) && !element.text.includes("\0"),
        "v2 SOURCE_PATHS row must be a relative non-NUL literal",
      );
      const absolute = path.resolve(repoRoot, element.text);
      const relative = slash(path.relative(repoRoot, absolute));
      assert(
        relative && !relative.startsWith("../") && !path.isAbsolute(relative),
        `v2 SOURCE_PATHS row escaped repository root: ${element.text}`,
      );
      return relative;
    });
    assert.equal(
      new Set(sourcePathRows).size,
      sourcePathRows.length,
      "v2 SOURCE_PATHS contains a duplicate",
    );
    for (const relative of compilerDynamicSourceInputs) {
      assert(
        sourcePathRows.includes(relative),
        `v2 SOURCE_PATHS AST lost dynamic row ${relative}`,
      );
    }
    const allCompilerText = independentCompiler.files
      .map((relative) => readFileSync(path.join(repoRoot, relative), "utf8"))
      .join("\n");
    assert.doesNotMatch(
      allCompilerText,
      /node:fs\/promises|Bun\.file|Deno\.(?:read|open)/u,
    );
    const qgenSource = readFileSync(
      path.join(repoRoot, "src/lib/question-generation-llm.ts"),
      "utf8",
    );
    assert.match(
      qgenSource,
      /const dir = process\.env\.QGEN_FALLBACK_RAW_DUMP_DIR;\s*if \(!dir\) return;/u,
    );
    assert.match(
      v2CompilerSource,
      /QGEN_/u,
      "offline compiler must erase every QGEN_ debug-write environment variable",
    );

    const privateArtifact = JSON.parse(privateBytes.toString("utf8")) as Record<
      string,
      unknown
    >;
    assert(
      !Object.hasOwn(privateArtifact, "productionSourceClosure"),
      "v6 must not retain the inherited 32-row field as authority",
    );
    assertExactRows(
      privateArtifact.productionCompilerClosure,
      independentCompilerRows,
      "private exact-wire compiler closure",
    );
    assert.equal(
      privateArtifact.productionCompilerClosureSha256,
      sha256(stableJsonV6(independentCompilerRows)),
    );
    assert.equal(privateArtifact.productionCompilerSourceFiles, 195);
    assert.equal(privateArtifact.productionCompilerDynamicSourceInputs, 3);
    assert.equal(privateArtifact.productionCompilerDeclaredDataInputs, 4);
    const authority = privateArtifact.productionCompilerAuthority as Record<
      string,
      unknown
    >;
    assert.equal(authority.inheritedThirtyTwoRowClosureAuthority, false);
    assert.equal(authority.inheritedThirtyTwoRowClosureRows, 32);
    const exactRows = privateArtifact.rows as Array<Record<string, unknown>>;
    assert.equal(exactRows.length, 2);
    const frozenV4Wire = [
      {
        bytes: 53_354,
        hash: "5c68b632eff4f3f0e963b13c3697b41ebaf7772a9088836da54ba0f027ee2003",
      },
      {
        bytes: 24_943,
        hash: "aed07356a5f580be158490ef12d8cf5555a7ea910a5ccc397e53356fa295e643",
      },
    ] as const;
    for (const [index, row] of exactRows.entries()) {
      const bodyText = row.bodyText;
      assert.equal(typeof bodyText, "string");
      assert.equal(
        row.bodyUtf8Bytes,
        frozenV4Wire[index]!.bytes,
        `wire ${index + 1} bytes differ from v4`,
      );
      assert.equal(
        row.bodySha256,
        frozenV4Wire[index]!.hash,
        `wire ${index + 1} hash differs from v4`,
      );
      const body = JSON.parse(bodyText as string) as Record<string, unknown>;
      assert.equal(
        body.model,
        index === 0
          ? "google/gemini-3.5-flash"
          : "google/gemini-3.1-pro-preview",
      );
      assert.deepEqual(body.provider, {
        order: ["google-vertex/global"],
        only: ["google-vertex/global"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
      });
      assert.deepEqual(body.reasoning, {
        enabled: false,
        effort: "none",
        exclude: true,
      });
      const responseFormat = body.response_format as Record<string, unknown>;
      const jsonSchema = responseFormat.json_schema as Record<string, unknown>;
      const schema = jsonSchema.schema as Record<string, unknown>;
      assert.equal(responseFormat.type, "json_schema");
      assert.equal(jsonSchema.strict, true);
      assert.equal(sha256(stableJsonV6(schema)), row.schemaSha256);
      const unsupported = [...schemaKeywords(schema)].filter(
        (keyword) => !supportedParserSchemaKeywords.has(keyword),
      );
      assert.deepEqual(
        unsupported,
        [],
        `wire ${index + 1} contains response-schema keywords unsupported by the live parser`,
      );
      assert.equal(
        (
          (schema.properties as Record<string, unknown>).questions as Record<
            string,
            unknown
          >
        ).minItems,
        1,
      );
      assert.equal(
        (
          (schema.properties as Record<string, unknown>).questions as Record<
            string,
            unknown
          >
        ).maxItems,
        1,
      );
    }
    const v3Private = JSON.parse(
      readFileSync(
        path.join(
          here,
          "../campaign-v6-connectivity-pilot-v3/private/exact-wire-v3.private.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const inheritedSubset = v3Private.productionSourceClosure as unknown[];
    assert.equal(inheritedSubset.length, 32);
    assert(
      inheritedSubset.length >= 32,
      "regression fixture must demonstrate why a minimum-count test is insufficient",
    );
    assert.throws(
      () =>
        assertExactRows(
          inheritedSubset,
          independentCompilerRows,
          "v3 subset regression",
        ),
      /exact set\/bytes\/hash equality/u,
    );
    assert.throws(
      () =>
        assertExactRows(
          independentCompilerRows.slice(0, -1),
          independentCompilerRows,
          "v6 one-row deletion regression",
        ),
      /exact set\/bytes\/hash equality/u,
    );

    const storedClosure = JSON.parse(
      readFileSync(path.join(here, "live-closure-v6.json"), "utf8"),
    ) as ReturnType<typeof computeLiveClosureV6>;
    const computedClosure = computeLiveClosureV6();
    assert.equal(
      stableJsonV6(computedClosure),
      stableJsonV6(storedClosure),
      "exact live closure set/hash differs",
    );
    const independentLive = independentGraph(liveEntrypoints);
    assert.deepEqual(independentLive.unresolvedLocalSpecifiers, []);
    assert.deepEqual(independentLive.nonliteralDynamicLoads, []);
    const independentLiveRows = [
      ...independentLive.files.map((relative) => exactRow(relative, "source")),
      ...liveDataInputs.map(([relative, kind]) => exactRow(relative, kind)),
    ].sort((left, right) =>
      left.path < right.path
        ? -1
        : left.path > right.path
          ? 1
          : left.kind < right.kind
            ? -1
            : 1,
    );
    assert.equal(independentLive.files.length, 16);
    assert.equal(independentLiveRows.length, 27);
    assertExactRows(
      storedClosure.files,
      independentLiveRows,
      "live runtime closure",
    );
    assert.equal(storedClosure.completeness.minimumCountAcceptanceUsed, false);
    assert(
      !storedClosure.files.some((row) =>
        /offline\.test|test-support|verify|build-offline/u.test(row.path),
      ),
    );
    assert.equal(
      storedClosure.files.length,
      protocol.liveClosureContract.exactExpectedFiles,
    );
    const storedExternalRuntimeFiles =
      storedClosure.externalRuntimeFiles as Array<Record<string, unknown>>;
    assert.equal(
      storedExternalRuntimeFiles.length,
      protocol.liveClosureContract.exactExpectedExternalFiles,
    );
    assert.equal(
      storedExternalRuntimeFiles[0]!.path,
      realpathSync.native(process.execPath),
    );
    assert.equal(
      storedExternalRuntimeFiles[0]!.bytes,
      statSync(process.execPath).size,
    );
    assert.equal(
      storedExternalRuntimeFiles[0]!.sha256,
      sha256(readFileSync(process.execPath)),
    );
    const authorReportBytes = readFileSync(
      path.join(here, "AUTHOR-REPORT.json"),
    );
    const authorReport = JSON.parse(
      authorReportBytes.toString("utf8"),
    ) as Record<string, unknown>;
    assert.equal(authorReport.protocolSha256, sha256(protocolBytes));
    const reportPredecessor = authorReport.predecessorBinding as Record<
      string,
      unknown
    >;
    assert.equal(
      reportPredecessor.artifactSha256,
      sha256(predecessorBindingBytes),
    );
    assert.equal(
      reportPredecessor.contentSha256,
      predecessorBinding.contentSha256,
    );
    assert.deepEqual(reportPredecessor.v5Subject, predecessorBinding.v5Subject);
    assert.deepEqual(
      reportPredecessor.independentCorrectnessReview,
      predecessorBinding.independentCorrectnessReview,
    );
    assert.equal(authorReport.exactWirePrivateSha256, sha256(privateBytes));
    assert.equal(authorReport.exactWirePublicSha256, sha256(publicBytes));
    assert.equal(
      authorReport.compilerClosureSha256,
      sha256(compilerClosureBytes),
    );
    assert.equal(
      authorReport.compilerClosureSemanticSha256,
      storedCompilerClosure.compilerClosureSemanticSha256,
    );
    assert.equal(
      authorReport.liveClosureSha256,
      sha256(readFileSync(path.join(here, "live-closure-v6.json"))),
    );
    assert.equal(
      authorReport.liveClosureSemanticSha256,
      storedClosure.closureSemanticSha256,
    );
    assert.equal(authorReport.exactCompilerSourceFiles, 195);
    assert.equal(authorReport.exactCompilerDynamicSourceInputs, 3);
    assert.equal(authorReport.exactCompilerDeclaredDataInputs, 4);
    assert.equal(authorReport.exactCompilerClosureFiles, 202);
    assert.equal(authorReport.exactLiveClosureFiles, 25);
    const frozenContract = protocol.frozenRuntimeContract as Record<
      string,
      unknown
    >;
    const frozenArtifactBytes = readFileSync(
      path.join(repoRoot, String(frozenContract.artifactPath)),
    );
    assert.equal(sha256(frozenArtifactBytes), frozenContract.artifactSha256);
    const frozenArtifact = validateFrozenRuntimeArtifactV6(
      JSON.parse(frozenArtifactBytes.toString("utf8")) as unknown,
    );
    assertCurrentBundlerToolchainV6(frozenArtifact.bundler.toolchain);
    const reviewedBuiltins = new Set(
      builtinModules.map((name) => name.replace(/^node:/u, "")),
    );
    assert(
      frozenArtifact.bundler.toolchain.externalStaticSpecifiers.every(
        (specifier) =>
          specifier === "pnpapi" ||
          reviewedBuiltins.has(specifier.replace(/^node:/u, "")),
      ),
    );
    let independentPnpapiUnresolved = false;
    try {
      requireForIndependentVerifier.resolve("pnpapi");
    } catch (error) {
      independentPnpapiUnresolved =
        (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND";
    }
    assert.equal(
      independentPnpapiUnresolved,
      true,
      "independent verifier found ambient resolvable pnpapi",
    );
    await independentlyRecomputeFrozenMetafileMappings(frozenArtifact);
    assert.equal(
      frozenArtifact.contentSha256,
      frozenContract.artifactContentSha256,
    );
    assert.equal(
      frozenArtifact.bundleSetSha256,
      frozenContract.bundleSetSha256,
    );
    assert.equal(
      frozenArtifact.nodeRuntime.nodeVersion,
      frozenContract.nodeVersion,
    );
    assert.equal(
      frozenArtifact.nodeRuntime.executableSha256,
      frozenContract.nodeExecutableSha256,
    );
    const authorizedDurabilityPlatforms = protocol.privatePersistence
      .authorizedDurabilityPlatforms as string[];
    assert.equal(authorizedDurabilityPlatforms.includes("win32"), false);
    assert.equal(
      protocol.privatePersistence.windowsLiveExecutionAllowed,
      false,
    );
    if (
      !authorizedDurabilityPlatforms.includes(
        frozenArtifact.nodeRuntime.platform,
      )
    ) {
      assert.equal(protocol.authorization.liveExecutionAuthorized, false);
    }
    assertCurrentNodeRuntimeV6(frozenArtifact.nodeRuntime);
    const rebuiltFrozen = await buildFrozenRuntimeV6();
    assert.deepEqual(
      rebuiltFrozen.artifactBytes,
      frozenArtifactBytes,
      "frozen runtime artifact is not reproducible",
    );
    for (const bundle of frozenArtifact.bundles) {
      const stored = readFileSync(path.join(repoRoot, bundle.path));
      assertFrozenBundleBytesV6(frozenArtifact, bundle.role, stored);
      assert.deepEqual(
        stored,
        rebuiltFrozen.bundleBytesByRole.get(bundle.role),
        `${bundle.role} bundle is not reproducible`,
      );
      const mutated = Buffer.from(stored);
      mutated[Math.floor(mutated.length / 2)]! ^= 1;
      assert.throws(
        () => assertFrozenBundleBytesV6(frozenArtifact, bundle.role, mutated),
        /bundle bytes differ/u,
      );
    }
    const hostileNode = structuredClone(frozenArtifact.nodeRuntime);
    hostileNode.executableSha256 = `${hostileNode.executableSha256.slice(0, -1)}${hostileNode.executableSha256.endsWith("0") ? "1" : "0"}`;
    assert.throws(
      () => assertCurrentNodeRuntimeV6(hostileNode),
      /Node executable identity differs/u,
    );
    assert(
      frozenArtifact.externalRuntimeSpecifiers.every((specifier) =>
        specifier.startsWith("node:"),
      ),
    );
    const operatorBundle = readFileSync(
      path.join(
        repoRoot,
        frozenArtifact.bundles.find((row) => row.role === "OPERATOR")!.path,
      ),
      "utf8",
    );
    assert.doesNotMatch(
      operatorBundle,
      /node_modules[\\/]tsx|tsx\/dist|tsxCli/u,
    );
    assert.equal(
      (authorReport.frozenRuntime as Record<string, unknown>).artifactSha256,
      frozenContract.artifactSha256,
    );
    const reportDurability = (
      authorReport.frozenRuntime as Record<string, unknown>
    ).parentDirectoryDurability as Record<string, unknown>;
    assert.equal(
      reportDurability.observedPlatform,
      frozenArtifact.nodeRuntime.platform,
    );
    assert.equal(
      reportDurability.observedPlatformEligible,
      authorizedDurabilityPlatforms.includes(
        frozenArtifact.nodeRuntime.platform,
      ),
    );
    assert.equal(reportDurability.windowsFailClosedBeforeMutation, true);
    assert.deepEqual(
      Object.keys(
        authorReport.closedV4AuditFindings as Record<string, unknown>,
      ).sort(),
      [
        "V4-CLI-001",
        "V4-CLOSURE-004",
        "V4-COST-005",
        "V4-LEDGER-003",
        "V4-PARSER-002",
      ],
    );
    const v5Remediations = authorReport.v5CorrectnessRemediations as Record<
      string,
      unknown
    >;
    assert.equal(v5Remediations.predecessorVerdict, "FAIL_BLOCKERS");
    assert.equal(
      v5Remediations.authorClaimStatus,
      "IMPLEMENTED_PENDING_INDEPENDENT_AUDIT",
    );
    for (const code of [
      "C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT",
      "C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED",
      "C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE",
      "C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT",
    ])
      assert.equal(
        typeof v5Remediations[code],
        "string",
        `${code} remediation missing from author report`,
      );
    assert.doesNotMatch(
      protocolBytes.toString("utf8"),
      /"0{64}"/u,
      "protocol retains an unsealed hash placeholder",
    );
    assert.doesNotMatch(
      authorReportBytes.toString("utf8"),
      /"0{64}"/u,
      "author report retains an unsealed hash placeholder",
    );
    const v3Protocol = JSON.parse(
      readFileSync(
        path.join(
          here,
          "../campaign-v6-connectivity-pilot-v3/protocol-v3.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const v3Wire = v3Protocol.exactWireCommitment as Record<string, unknown>;
    assert.notEqual(
      protocol.exactWireCommitment.privateArtifactSha256,
      v3Wire.privateArtifactSha256,
      "v6 retained the v3 private artifact hash",
    );
    assert.notEqual(
      protocol.exactWireCommitment.publicArtifactSha256,
      v3Wire.publicArtifactSha256,
      "v6 retained the v3 public artifact hash",
    );
    assertNoNondeterministicGeneratedFields([
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/AUTHOR-REPORT.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/protocol-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-closure-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/live-closure-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-runtime-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline-exact-wire-seal-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/predecessor-binding-v6.json",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/private/exact-wire-v6.private.json",
    ]);
    const readme = readFileSync(path.join(here, "README.md"), "utf8");
    assert.match(
      readme,
      /author-bootstrap-v6\.ps1[^\n]*-Mode check/u,
      "README must document the external author entry",
    );
    assert.doesNotMatch(
      readme,
      /^\s*node\s+[^\n]*sealed-transform-launcher\.mjs[^\n]*--role=AUTHOR_BUILD/mu,
      "README must not document a direct plain-Node author command",
    );
    assert.match(
      readme,
      /direct `node sealed-transform-launcher\.mjs --role=AUTHOR_BUILD` is unauthorized and rejected/u,
    );
    assert.doesNotMatch(
      readme,
      /npx tsx[^\n]*build-offline\.mts/u,
      "README must not grant direct tsx author authority",
    );
    withSealedAuthorBuild([], (command, args) =>
      runMustFail(command, args, /choose exactly one of --write or --check/u),
    );
    const manifestBoundBefore = manifestBoundContentDigest();
    const buildOutput = withSealedAuthorBuild(["--check"], run);
    const buildOutputSecond = withSealedAuthorBuild(["--check"], run);
    assert.match(buildOutput, /V6_WRITE_NO_WRITE_PARITY_CONFIRMED/u);
    assert.equal(
      buildOutputSecond,
      buildOutput,
      "two full isolated builds produced different summaries",
    );
    assert.equal(
      manifestBoundContentDigest(),
      manifestBoundBefore,
      "two full isolated builds changed manifest-bound bytes",
    );
    run(process.execPath, [
      tscCli,
      "-p",
      path.join(here, "tsconfig.json"),
      "--pretty",
      "false",
    ]);
    const testOutput = run(process.execPath, [
      tsxCli,
      "--test",
      path.join(here, "offline.test.ts"),
      path.join(here, "system-boundary.test.ts"),
    ]);
    const passMatch = /(?:^|\n)(?:#|ℹ)\s+pass\s+(\d+)/u.exec(testOutput);
    assert(passMatch, "offline test pass count missing");
    assert(
      !/(?:^|\n)(?:#|ℹ)\s+fail\s+[1-9]/u.test(testOutput),
      "offline test suite failed",
    );
    const forbiddenMetadataOutput = path.join(
      here,
      "private/verifier-metadata-must-not-exist.json",
    );
    assert.equal(existsSync(forbiddenMetadataOutput), false);
    runMustFail(
      process.execPath,
      [
        tsxCli,
        path.join(here, "capture-price-snapshot.mts"),
        `--output=${forbiddenMetadataOutput}`,
      ],
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
    );
    assert.equal(existsSync(forbiddenMetadataOutput), false);
    runMustFail(
      process.execPath,
      [tsxCli, path.join(here, "operator-wrapper.mts")],
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
    );
    const runnerModule = await import("./production-runner.ts");
    const runnerExports =
      (runnerModule as unknown as { default?: typeof runnerModule }).default ??
      runnerModule;
    assert.deepEqual(
      Object.keys(runnerExports).sort(),
      ["runSealedConnectivityPilotV6"],
      "production runner exposed additional authority",
    );
    await assert.rejects(
      () =>
        runnerExports.runSealedConnectivityPilotV6({
          runId: "offline-verifier-must-not-create",
          priceSnapshotPath: "forbidden",
          priceSnapshotFileSha256: "0".repeat(64),
          priceSnapshotBundleSha256: "0".repeat(64),
        }),
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
    );
    assert.equal(
      deniedNetworkAttempts,
      0,
      "module-load fetch capture bypassed the offline deny guard",
    );
    const ledgerAfter = attestAuthorBaselineLedgerV6(repoRoot);
    assert.deepEqual(
      ledgerAfter,
      ledgerBefore,
      "author verifier mutated or drifted the global ledger",
    );
    assert.equal(deniedNetworkAttempts, 0);
    process.stdout.write(
      `${JSON.stringify(
        {
          verdict: "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED",
          protocolSha256: sha256(protocolBytes),
          manifestFiles,
          exactLiveClosureFiles: storedClosure.files.length,
          liveClosureSemanticSha256: storedClosure.closureSemanticSha256,
          exactCompilerSourceFiles: independentCompilerSources.length,
          exactCompilerDynamicSourceInputs:
            independentCompilerDynamicSources.length,
          exactCompilerDeclaredDataInputs: independentCompilerData.length,
          exactCompilerClosureFiles: independentCompilerRows.length,
          compilerClosureArtifactSha256: sha256(compilerClosureBytes),
          compilerClosureSemanticSha256:
            storedCompilerClosure.compilerClosureSemanticSha256,
          inheritedV3SubsetRowsRejected: inheritedSubset.length,
          preservedV2Files,
          preservedV3Files,
          offlineTestPasses: Number(passMatch[1]),
          writeNoWriteParity: true,
          twoConsecutiveFullBuildExactByteParity: true,
          scopedTypeScript: true,
          liveExecutionAuthorized: false,
          dispatchCommandPresent: false,
          externalNetworkCalls: 0,
          metadataNetworkCalls: 0,
          providerCalls: 0,
          modelCalls: 0,
          apiCandidatesConsumed: 0,
          productionDatabaseCalls: 0,
          realCredentialValuesRead: 0,
          globalLedgerReadOnlyAttestations: 2,
          globalLedgerReservationMutations: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
