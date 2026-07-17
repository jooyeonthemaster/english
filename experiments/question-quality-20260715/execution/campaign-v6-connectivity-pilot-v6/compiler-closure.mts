import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import { assertAndDescribeIsolatedCompilerEnvironmentV6 } from "./compiler-environment.mts";
import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV6 } = protocolCoreExports;

type CompilerFileKind = "compiler_source" | "dynamic_compiler_source" | "declared_compiler_data";

export interface CompilerClosureRowV6 {
  path: string;
  kind: CompilerFileKind;
  bytes: number;
  sha256: string;
}

interface ImportEdgeV6 {
  from: string;
  kind: "static-import" | "static-export" | "import-equals" | "literal-dynamic-import" | "literal-require";
  specifier: string;
  to: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const hash = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.replaceAll("\\", "/");

export const COMPILER_ENTRYPOINTS_V6 = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
] as const;

export const DYNAMIC_COMPILER_SOURCE_INPUTS_V6 = [
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
] as const;

export const DECLARED_COMPILER_DATA_INPUTS_V6 = [
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-v2.json",
] as const;

function canonicalRepoFile(absolute: string): string {
  const resolved = path.resolve(absolute);
  const relative = path.relative(repoRoot, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `compiler closure escaped repository: ${resolved}`);
  const real = realpathSync.native(resolved);
  const normalized = (candidate: string): string => process.platform === "win32" ? path.resolve(candidate).toLowerCase() : path.resolve(candidate);
  assert.equal(normalized(real), normalized(resolved), `compiler closure path is noncanonical: ${relative}`);
  assert(statSync(resolved).isFile(), `compiler closure path is not a regular file: ${relative}`);
  return resolved;
}

function repoRelative(absolute: string): string {
  return slash(path.relative(repoRoot, canonicalRepoFile(absolute)));
}

function resolveLocalImport(fromAbsolute: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromAbsolute), specifier);
  else return null;
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`,
    `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"),
    path.join(base, "index.mts"), path.join(base, "index.cts"),
    path.join(base, "index.js"), path.join(base, "index.mjs"),
  ];
  const matches = candidates.filter((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (matches.length !== 1) {
    throw new Error(`compiler local import ${specifier} from ${repoRelative(fromAbsolute)} resolved to ${matches.length} files`);
  }
  return canonicalRepoFile(matches[0]!);
}

function sourceRow(relative: string, kind: CompilerFileKind): CompilerClosureRowV6 {
  const bytes = readFileSync(canonicalRepoFile(path.join(repoRoot, relative)));
  return { path: slash(relative), kind, bytes: bytes.byteLength, sha256: hash(bytes) };
}

function compilerFileSystemCallSites(sourceRows: readonly CompilerClosureRowV6[]) {
  const contentInputCalls = new Set(["readFileSync"]);
  const metadataInputCalls = new Set(["existsSync", "realpathSync", "statSync"]);
  const contentReads: Array<{ path: string; line: number; character: number; callee: string; argument: string }> = [];
  const metadataReads: Array<{ path: string; line: number; character: number; callee: string; argument: string }> = [];
  for (const row of sourceRows) {
    const absolute = canonicalRepoFile(path.join(repoRoot, row.path));
    const text = readFileSync(absolute, "utf8");
    const source = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : null;
        if (callee && (contentInputCalls.has(callee) || metadataInputCalls.has(callee))) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          const record = {
            path: row.path,
            line: position.line + 1,
            character: position.character + 1,
            callee,
            argument: node.arguments[0]?.getText(source) ?? "",
          };
          if (contentInputCalls.has(callee)) contentReads.push(record);
          else metadataReads.push(record);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const order = <T extends { path: string; line: number; character: number; callee: string }>(left: T, right: T): number => {
    const l = `${left.path}\0${String(left.line).padStart(8, "0")}\0${String(left.character).padStart(8, "0")}\0${left.callee}`;
    const r = `${right.path}\0${String(right.line).padStart(8, "0")}\0${String(right.character).padStart(8, "0")}\0${right.callee}`;
    return l < r ? -1 : l > r ? 1 : 0;
  };
  contentReads.sort(order);
  metadataReads.sort(order);
  return {
    contentReads,
    metadataReads,
    contentReadsSha256: hash(stableJsonV6(contentReads)),
    metadataReadsSha256: hash(stableJsonV6(metadataReads)),
  };
}

function exactGitInput() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const stdout = result.stdout;
  const head = stdout.trim();
  assert.match(head, /^[a-f0-9]{40}$/u);
  return {
    command: ["git", "rev-parse", "HEAD"],
    cwdRepoRelative: ".",
    stdoutUtf8Bytes: Buffer.byteLength(stdout, "utf8"),
    stdoutSha256: hash(stdout),
    canonicalHead: head,
    canonicalHeadSha256: hash(head),
    stderrUtf8Bytes: Buffer.byteLength(result.stderr ?? "", "utf8"),
    exitStatus: result.status,
  };
}

export function computeCompilerClosureV6() {
  const queue = COMPILER_ENTRYPOINTS_V6.map((entry) => canonicalRepoFile(path.join(repoRoot, entry)));
  const visited = new Set<string>();
  const external = new Set<string>();
  const unresolvedLocalSpecifiers: Array<{ from: string; specifier: string }> = [];
  const nonliteralDynamicLoads: string[] = [];
  const edges: ImportEdgeV6[] = [];

  while (queue.length > 0) {
    const absolute = canonicalRepoFile(queue.shift()!);
    const relative = repoRelative(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (absolute.endsWith(".json")) continue;
    const text = readFileSync(absolute, "utf8");
    const source = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const imports: Array<{ specifier: string; kind: ImportEdgeV6["kind"] }> = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        imports.push({
          specifier: node.moduleSpecifier.text,
          kind: ts.isImportDeclaration(node) ? "static-import" : "static-export",
        });
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        imports.push({ specifier: node.moduleReference.expression.text, kind: "import-equals" });
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const kind: ImportEdgeV6["kind"] = node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? "literal-dynamic-import"
          : "literal-require";
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
          imports.push({ specifier: node.arguments[0]!.text, kind });
        } else {
          nonliteralDynamicLoads.push(`${relative}:${node.getStart(source)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    for (const imported of imports) {
      const resolved = resolveLocalImport(absolute, imported.specifier);
      if (resolved) {
        const target = repoRelative(resolved);
        edges.push({ from: relative, kind: imported.kind, specifier: imported.specifier, to: target });
        if (!visited.has(target)) queue.push(resolved);
      } else if (imported.specifier.startsWith(".") || imported.specifier.startsWith("@/")) {
        unresolvedLocalSpecifiers.push({ from: relative, specifier: imported.specifier });
      } else {
        external.add(imported.specifier);
      }
    }
  }

  const sortRow = <T extends { path: string }>(left: T, right: T): number => left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  const sourceFiles = [...visited].sort().map((relative) => sourceRow(relative, "compiler_source"));
  const dynamicSourceInputs = [...DYNAMIC_COMPILER_SOURCE_INPUTS_V6]
    .sort()
    .map((relative) => sourceRow(relative, "dynamic_compiler_source"));
  const declaredDataInputs = [...DECLARED_COMPILER_DATA_INPUTS_V6].sort().map((relative) => sourceRow(relative, "declared_compiler_data"));
  const overlap = [...dynamicSourceInputs, ...declaredDataInputs].filter((row) => visited.has(row.path));
  assert.deepEqual(overlap, [], "dynamic source/data input must not duplicate an AST-resolved source row");
  assert.deepEqual(
    dynamicSourceInputs.map((row) => row.path),
    [...DYNAMIC_COMPILER_SOURCE_INPUTS_V6].sort(),
    "dynamic SOURCE_PATHS-only compiler inputs differ",
  );
  const files = [...sourceFiles, ...dynamicSourceInputs, ...declaredDataInputs].sort(sortRow);
  assert.equal(new Set(files.map((row) => row.path)).size, files.length, "compiler closure contains duplicate paths");
  assert.deepEqual(unresolvedLocalSpecifiers, [], "compiler closure contains unresolved local imports");
  assert.deepEqual(nonliteralDynamicLoads, [], "compiler closure contains nonliteral dynamic import/require");
  const orderedEdges = edges.sort((left, right) => {
    const l = `${left.from}\0${left.kind}\0${left.specifier}\0${left.to}`;
    const r = `${right.from}\0${right.kind}\0${right.specifier}\0${right.to}`;
    return l < r ? -1 : l > r ? 1 : 0;
  });
  const fileSystemInputCalls = compilerFileSystemCallSites(sourceFiles);
  const environment = assertAndDescribeIsolatedCompilerEnvironmentV6();
  const git = exactGitInput();
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-compiler-closure-v6",
    algorithm: "INDEPENDENT_AST_PLUS_DYNAMIC_SOURCE_PLUS_DATA_PLUS_EXTERNAL_INPUTS_V3",
    entrypoints: [...COMPILER_ENTRYPOINTS_V6],
    sourceFiles,
    dynamicSourceInputs,
    declaredDataInputs,
    files,
    exactSourceFileSetAndBytesSha256: hash(stableJsonV6(sourceFiles)),
    exactDynamicSourceSetAndBytesSha256: hash(stableJsonV6(dynamicSourceInputs)),
    exactDeclaredDataSetAndBytesSha256: hash(stableJsonV6(declaredDataInputs)),
    exactCompilerClosureSetAndBytesSha256: hash(stableJsonV6(files)),
    resolutionEvidence: {
      edges: orderedEdges,
      edgesSha256: hash(stableJsonV6(orderedEdges)),
      externalSpecifiers: [...external].sort(),
      unresolvedLocalSpecifiers,
      nonliteralDynamicLoads,
    },
    externalInputContract: {
      git,
      environment,
      exactExternalInputsSha256: hash(stableJsonV6({ git, environment })),
      realCredentialValuesRead: 0,
      ambientEnvironmentVariablesAccepted: 0,
    },
    fileSystemInputContract: {
      astResolvedSourceInputs: sourceFiles.map((row) => row.path),
      dynamicSourceInputs: [...DYNAMIC_COMPILER_SOURCE_INPUTS_V6],
      declaredImmutableDataInputs: [...DECLARED_COMPILER_DATA_INPUTS_V6],
      exactContentInputCallSites: fileSystemInputCalls.contentReads,
      exactContentInputCallSitesSha256: fileSystemInputCalls.contentReadsSha256,
      exactMetadataInputCallSites: fileSystemInputCalls.metadataReads,
      exactMetadataInputCallSitesSha256: fileSystemInputCalls.metadataReadsSha256,
      repositoryByteInputPartitionsDisjointAndExhaustive: true,
      everyAstResolvedRepositorySourceReadAndHashed: true,
      everyDynamicSourcePathReadAndHashed: true,
      undeclaredRuntimeDataInputsAllowed: false,
      inheritedCompilerCliOutputWritesExecuted: false,
      productionFallbackDebugWriteEnvironmentAbsentBeforeProductionImport: "QGEN_*",
    },
    completeness: {
      staticImportsAndExportsIncluded: true,
      importEqualsIncluded: true,
      literalDynamicImportsIncluded: true,
      literalRequireIncluded: true,
      aliasAtSlashResolvedToSrc: true,
      dynamicSourceInputsIncluded: true,
      declaredDataInputsIncluded: true,
      compilerFileSystemReadSitesStaticallyEnumerated: true,
      externalGitAndEnvironmentInputsBound: true,
      isolatedChildEnvironmentRequired: true,
      unresolvedLocalSpecifiers: 0,
      nonliteralDynamicLoads: 0,
      inheritedThirtyTwoRowSubsetTrustedAsAuthority: false,
      minimumCountAcceptanceUsed: false,
    },
  };
  return { ...core, compilerClosureSemanticSha256: hash(stableJsonV6(core)) };
}
