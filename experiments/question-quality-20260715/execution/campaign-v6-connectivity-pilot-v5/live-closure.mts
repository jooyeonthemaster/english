import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV5 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const SHA256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export const LIVE_ENTRYPOINTS_V5 = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-price-snapshot.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/operator-wrapper.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/production-runner.ts",
] as const;

type FileKind = "source" | "immutable_runtime_data" | "immutable_runtime_artifact" | "mutable_runtime_data_precondition";
interface ClosureRow { path: string; kind: FileKind; bytes: number; sha256: string }

const DECLARED_FROZEN_RUNTIME_ARTIFACTS = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json",
] as const;

function slash(value: string): string { return value.replace(/\\/gu, "/"); }

function canonicalRepoFile(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `closure escaped repository: ${resolved}`);
  const real = realpathSync.native(resolved);
  assert.equal(process.platform === "win32" ? real.toLowerCase() : real, process.platform === "win32" ? resolved.toLowerCase() : resolved, `closure path is noncanonical: ${relative}`);
  return resolved;
}

function resolveLocalImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const candidates = [base, `${base}.ts`, `${base}.mts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, "index.ts"), path.join(base, "index.mts")];
  const matches = candidates.filter((candidate) => existsSync(candidate));
  if (matches.length !== 1) throw new Error(`local import ${specifier} from ${slash(path.relative(repoRoot, from))} resolved to ${matches.length} files`);
  return canonicalRepoFile(matches[0]!);
}

function literalText(node: ts.Expression, constants: ReadonlyMap<string, string>): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  return null;
}

function topLevelStringConstants(source: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isStringLiteralLike(declaration.initializer)) {
        result.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
  return result;
}

function inspectSource(file: string): { imports: string[]; immutableData: string[]; mutableData: string[]; dynamicPrivateReads: number; secretReads: number } {
  const text = readFileSync(file, "utf8");
  const sourceRelative = slash(path.relative(repoRoot, file));
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const constants = topLevelStringConstants(source);
  const imports: string[] = [];
  const immutableData: string[] = [];
  const mutableData: string[] = [];
  let dynamicPrivateReads = 0;
  let secretReads = 0;
  const addImport = (specifier: string) => { const resolved = resolveLocalImport(file, specifier); if (resolved) imports.push(resolved); };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      addImport(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]!)) throw new Error(`nonliteral dynamic import forbidden in ${slash(path.relative(repoRoot, file))}`);
        addImport((node.arguments[0] as ts.StringLiteral).text);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]!)) throw new Error(`nonliteral require forbidden in ${slash(path.relative(repoRoot, file))}`);
        addImport((node.arguments[0] as ts.StringLiteral).text);
      } else if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (name === "readImmutableRepoBytesV5" || name === "readImmutableRepoJsonV5") {
          if (sourceRelative.endsWith("/live-io.ts")) {
            ts.forEachChild(node, visit);
            return;
          }
          const value = node.arguments[0] && literalText(node.arguments[0], constants);
          if (!value) throw new Error(`immutable runtime data path must be statically resolvable in ${slash(path.relative(repoRoot, file))}`);
          immutableData.push(value);
        } else if (name === "readPrivateAttestedJsonV5" || name === "readPrivateAttestedJsonEvidenceV5") {
          dynamicPrivateReads += 1;
        } else if (name === "readDirectRealEnvLocalCredentialTextV5" &&
            slash(path.relative(repoRoot, file)).endsWith("operator-wrapper.mts")) {
          secretReads += 1;
        } else if (name === "withExclusiveRepoJsonTransactionV5") {
          const argument = node.arguments[0];
          if (!argument || !ts.isObjectLiteralExpression(argument)) throw new Error("ledger transaction must use an object literal");
          const property = argument.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && ts.isIdentifier(entry.name) && entry.name.text === "relativePath");
          if (!property) throw new Error("ledger transaction lacks relativePath");
          const value = literalText(property.initializer, constants);
          if (!value) throw new Error("ledger transaction path is not statically resolvable");
          mutableData.push(value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, immutableData, mutableData, dynamicPrivateReads, secretReads };
}

function rowFor(relativePath: string, kind: FileKind): ClosureRow {
  const absolute = canonicalRepoFile(path.join(repoRoot, relativePath));
  const bytes = readFileSync(absolute);
  return { path: slash(relativePath), kind, bytes: bytes.byteLength, sha256: SHA256(bytes) };
}

function rowForDeclaredArtifact(
  relativePath: string,
  overrides: ReadonlyMap<string, Uint8Array> | undefined,
): ClosureRow {
  const override = overrides?.get(relativePath);
  if (override) return { path: relativePath, kind: "immutable_runtime_artifact", bytes: override.byteLength, sha256: SHA256(override) };
  return rowFor(relativePath, "immutable_runtime_artifact");
}

export function computeLiveClosureV5(input: {
  declaredRuntimeArtifactBytes?: ReadonlyMap<string, Uint8Array>;
} = {}) {
  const queue = LIVE_ENTRYPOINTS_V5.map((entry) => canonicalRepoFile(path.join(repoRoot, entry)));
  const visited = new Set<string>();
  const immutable = new Set<string>();
  const mutable = new Set<string>();
  let dynamicPrivateReads = 0;
  let secretReads = 0;
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (file.endsWith(".json")) continue;
    const inspected = inspectSource(file);
    for (const imported of inspected.imports) if (!visited.has(imported)) queue.push(imported);
    inspected.immutableData.forEach((entry) => immutable.add(slash(entry)));
    inspected.mutableData.forEach((entry) => mutable.add(slash(entry)));
    dynamicPrivateReads += inspected.dynamicPrivateReads;
    secretReads += inspected.secretReads;
  }
  const sourceRows = [...visited]
    .filter((file) => !file.endsWith(".json"))
    .map((file) => rowFor(slash(path.relative(repoRoot, file)), "source"));
  const importedJson = [...visited]
    .filter((file) => file.endsWith(".json"))
    .map((file) => slash(path.relative(repoRoot, file)));
  importedJson.forEach((entry) => immutable.add(entry));
  const immutableRows = [...immutable].map((entry) => rowFor(entry, "immutable_runtime_data"));
  const mutableRows = [...mutable].map((entry) => rowFor(entry, "mutable_runtime_data_precondition"));
  if (input.declaredRuntimeArtifactBytes &&
      (input.declaredRuntimeArtifactBytes.size !== DECLARED_FROZEN_RUNTIME_ARTIFACTS.length ||
       [...input.declaredRuntimeArtifactBytes.keys()].some((entry) => !DECLARED_FROZEN_RUNTIME_ARTIFACTS.includes(entry as typeof DECLARED_FROZEN_RUNTIME_ARTIFACTS[number])))) {
    throw new Error("declared frozen runtime override set differs from the exact four artifacts");
  }
  const declaredRuntimeArtifactRows = DECLARED_FROZEN_RUNTIME_ARTIFACTS
    .map((entry) => rowForDeclaredArtifact(entry, input.declaredRuntimeArtifactBytes));
  const files = [...sourceRows, ...immutableRows, ...mutableRows, ...declaredRuntimeArtifactRows]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.kind < right.kind ? -1 : 1);
  if (new Set(files.map((row) => row.path)).size !== files.length) throw new Error("live closure classifies one path more than once");
  const forbidden = files.filter((row) => /(?:offline\.test|test-support|verify|build-offline)/u.test(row.path));
  if (forbidden.length > 0) throw new Error(`test/author module entered live closure: ${forbidden.map((row) => row.path).join(",")}`);
  const productionRunner = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  if (/\b(?:TEST_MODE|INJECTED|delegate|transport|permit)\b/iu.test(productionRunner)) {
    throw new Error("production runner contains a forbidden test/offline transport surface");
  }
  const nodeExecutablePath = realpathSync.native(process.execPath);
  const nodeExecutableBytes = readFileSync(nodeExecutablePath);
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-live-closure-v5",
    algorithm: "TYPESCRIPT_AST_TRANSITIVE_IMPORTS_PLUS_DECLARED_RUNTIME_DATA_V1",
    entrypoints: [...LIVE_ENTRYPOINTS_V5],
    files,
    exactFileSetAndBytesSha256: SHA256(stableJsonV5(files)),
    externalRuntimeFiles: [{
      path: nodeExecutablePath,
      kind: "external_node_executable",
      bytes: nodeExecutableBytes.byteLength,
      sha256: SHA256(nodeExecutableBytes),
      nodeVersion: process.version,
      modulesAbi: process.versions.modules,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
    }],
    runtimeInterfaces: {
      dynamicPrivateAttestedJsonReads: dynamicPrivateReads,
      dynamicPrivateAttestedJsonContract: "canonical direct real private file; fd-bound exact-size pre/open/post identity read <=306184192 bytes; duplicate-free fatal UTF-8 without BOM; three raw bounded HTTP bodies reproduce the normalized schema-v5 snapshot; capture file SHA and bundle SHA handed to live child from same operator memory; <=15 minutes old",
      secretSourceReads: secretReads,
      secretSourceContract: "repository-direct .env.local must be a stable real regular file read exactly by fd with pre/open/post identity and hard EOF only after authorization; duplicate assignment rejected; only OPENROUTER_API_KEY retained; temporary bytes zeroed; value/length/hash never committed",
      privateOutputContract: "exclusive real v5/private/runs/run directory with no symlink/junction ancestors; response and append-only journal never public",
      executableRuntimeContract: "three exact plain-ESM bundle byte hashes plus exact Node executable realpath/version/ABI/V8/platform/arch/bytes/hash; no tsx or external package at live runtime",
    },
    completeness: {
      localStaticImportsIncluded: true,
      localExportsIncluded: true,
      literalDynamicImportsIncluded: true,
      literalRequireIncluded: true,
      nonliteralDynamicImportsRejected: true,
      immutableRuntimeDataIncludedWithExactBytes: true,
      mutableResearchLedgerIncludedWithExactPreconditionBytes: true,
      secretAndDynamicPrivateInputsExplicitlyClassified: true,
      minimumCountAcceptanceUsed: false,
      testSupportExcluded: true,
    },
  };
  return { ...core, closureSemanticSha256: SHA256(stableJsonV5(core)) };
}
