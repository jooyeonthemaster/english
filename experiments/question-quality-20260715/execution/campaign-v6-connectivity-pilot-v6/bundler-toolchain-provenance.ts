import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import type {
  FrozenBundlerToolchainV6,
  FrozenProvenanceAnalyzerV6,
  FrozenToolchainFileV6,
} from "./frozen-runtime-core";
import { sha256V6, stableJsonV6 } from "./protocol-core";
import { assertNoAuthorToolchainEnvironmentInfluenceV6 } from "./author-environment";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const requireFromHere = createRequire(import.meta.url);
const STATIC_SOURCE_EXTENSIONS = [".js", ".cjs", ".mjs", ".json"] as const;

function comparable(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function repoRelative(absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`toolchain file escaped repository root: ${absolutePath}`);
  }
  return relative.split(path.sep).join("/");
}

function captureStableToolchainFileV6(filePath: string, label: string): FrozenToolchainFileV6 {
  const absolute = path.resolve(filePath);
  const realPath = realpathSync.native(absolute);
  const before = lstatSync(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || comparable(realPath) !== comparable(absolute)) {
    throw new Error(`${label} must be a direct real regular file`);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute, { bigint: true });
  if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size || comparable(realpathSync.native(absolute)) !== comparable(realPath)) {
    throw new Error(`${label} changed during provenance capture`);
  }
  return {
    repoRelativePath: repoRelative(absolute),
    realPath,
    bytes: bytes.byteLength,
    sha256: sha256V6(bytes),
  };
}

function enumerateRealPackageFilesV6(packageRoot: string, label: string): FrozenToolchainFileV6[] {
  const root = path.resolve(packageRoot);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() ||
      comparable(realpathSync.native(root)) !== comparable(root)) {
    throw new Error(`${label} root must be a direct real directory`);
  }
  const files: FrozenToolchainFileV6[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`${label} contains a symbolic link: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(captureStableToolchainFileV6(absolute, `${label} file`));
      else throw new Error(`${label} contains a non-file entry: ${absolute}`);
    }
  };
  visit(root);
  return files.sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
}

function platformNativePackageV6(): { packageName: string; subpath: string } {
  const key = `${process.platform} ${process.arch}`;
  const table: Record<string, string> = {
    "win32 x64": "@esbuild/win32-x64",
    "win32 ia32": "@esbuild/win32-ia32",
    "win32 arm64": "@esbuild/win32-arm64",
    "darwin x64": "@esbuild/darwin-x64",
    "darwin arm64": "@esbuild/darwin-arm64",
    "linux x64": "@esbuild/linux-x64",
    "linux ia32": "@esbuild/linux-ia32",
    "linux arm": "@esbuild/linux-arm",
    "linux arm64": "@esbuild/linux-arm64",
    "linux ppc64": "@esbuild/linux-ppc64",
    "linux s390x": "@esbuild/linux-s390x",
    "linux riscv64": "@esbuild/linux-riscv64",
    "linux loong64": "@esbuild/linux-loong64",
    "linux mips64el": "@esbuild/linux-mips64el",
    "freebsd x64": "@esbuild/freebsd-x64",
    "freebsd arm64": "@esbuild/freebsd-arm64",
    "openbsd x64": "@esbuild/openbsd-x64",
    "netbsd x64": "@esbuild/netbsd-x64",
    "sunos x64": "@esbuild/sunos-x64",
    "aix ppc64": "@esbuild/aix-ppc64",
  };
  const packageName = table[key];
  if (!packageName) throw new Error(`unsupported esbuild native platform ${key}`);
  return { packageName, subpath: process.platform === "win32" ? "esbuild.exe" : "bin/esbuild" };
}

function resolveLocalStaticModuleV6(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...STATIC_SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...STATIC_SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    try {
      const stat = lstatSync(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) return candidate;
    } catch {
      // Continue through the exact resolver candidates.
    }
  }
  throw new Error(`unresolved esbuild local static dependency ${specifier} from ${fromFile}`);
}

function staticModuleSpecifiersV6(filePath: string): { local: string[]; external: string[] } {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    throw new Error(`TypeScript provenance analyzer reported parse diagnostics in ${filePath}`);
  }
  const local = new Set<string>();
  const external = new Set<string>();
  const add = (specifier: string): void => {
    if (specifier.startsWith("./") || specifier.startsWith("../")) local.add(specifier);
    else external.add(specifier);
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteralLike(node.moduleSpecifier)) {
        throw new Error(`nonliteral esbuild static module specifier in ${filePath}`);
      }
      add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamicImport) {
        if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]!)) {
          throw new Error(`nonliteral esbuild module load in ${filePath}`);
        }
        add(node.arguments[0]!.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { local: [...local].sort(), external: [...external].sort() };
}

const REVIEWED_NODE_BUILTINS_V6 = new Set(builtinModules.map((name) => name.replace(/^node:/u, "")));

export function assertBundlerExternalResolutionPolicyV6(
  externalStaticSpecifiers: readonly string[],
  resolveForOfflineTestOnly: (specifier: string) => string = (specifier) => requireFromHere.resolve(specifier),
): "UNRESOLVED" {
  for (const specifier of externalStaticSpecifiers) {
    const normalized = specifier.replace(/^node:/u, "");
    if (specifier !== "pnpapi" && !REVIEWED_NODE_BUILTINS_V6.has(normalized)) {
      throw new Error(`unreviewed external esbuild implementation dependency ${specifier}`);
    }
  }
  try {
    const resolved = resolveForOfflineTestOnly("pnpapi");
    throw new Error(`pnpapi unexpectedly resolved and could alter esbuild native binary selection: ${resolved}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("pnpapi unexpectedly resolved")) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "MODULE_NOT_FOUND") throw new Error("pnpapi resolution failed with a non-absence error");
  }
  return "UNRESOLVED";
}

export function captureTransitiveJsClosureV6(entrypoint: string): {
  files: FrozenToolchainFileV6[];
  externalStaticSpecifiers: string[];
} {
  const pending = [path.resolve(entrypoint)];
  const visited = new Map<string, string>();
  const external = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    const canonicalCurrent = realpathSync.native(current);
    const comparableCurrent = comparable(canonicalCurrent);
    if (visited.has(comparableCurrent)) continue;
    visited.set(comparableCurrent, canonicalCurrent);
    const specifiers = staticModuleSpecifiersV6(canonicalCurrent);
    specifiers.external.forEach((specifier) => external.add(specifier));
    for (const specifier of specifiers.local) pending.push(resolveLocalStaticModuleV6(canonicalCurrent, specifier));
  }
  const files = [...visited.values()]
    .map((actual) => captureStableToolchainFileV6(actual, "esbuild transitive JavaScript closure"))
    .sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
  return { files, externalStaticSpecifiers: [...external].sort() };
}

function exactPackageMetadataV6(packageJsonPath: string, expectedName: string): { name: string; version: string } {
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  if (parsed.name !== expectedName || typeof parsed.version !== "string" || !parsed.version) {
    throw new Error(`${expectedName} package metadata differs`);
  }
  return { name: parsed.name, version: parsed.version };
}

export function captureBundlerToolchainProvenanceV6(): FrozenBundlerToolchainV6 {
  assertNoAuthorToolchainEnvironmentInfluenceV6(process.env);
  if (process.env.ESBUILD_BINARY_PATH !== undefined) {
    throw new Error("ESBUILD_BINARY_PATH is forbidden for the exact sealed v6 bundler toolchain");
  }
  const resolvedEntrypointPath = requireFromHere.resolve("esbuild");
  const packageJsonPath = requireFromHere.resolve("esbuild/package.json");
  const packageMetadata = exactPackageMetadataV6(packageJsonPath, "esbuild");
  const esbuildPackageRoot = path.dirname(packageJsonPath);
  const transitive = captureTransitiveJsClosureV6(resolvedEntrypointPath);
  const pnpapiResolution = assertBundlerExternalResolutionPolicyV6(transitive.externalStaticSpecifiers);
  const native = platformNativePackageV6();
  const nativePackageJsonPath = requireFromHere.resolve(`${native.packageName}/package.json`);
  const nativeMetadata = exactPackageMetadataV6(nativePackageJsonPath, native.packageName);
  if (nativeMetadata.version !== packageMetadata.version) {
    throw new Error("esbuild JavaScript and selected native package versions differ");
  }
  const nativeExecutablePath = requireFromHere.resolve(`${native.packageName}/${native.subpath}`);
  const packageLockPath = path.join(repoRoot, "package-lock.json");
  const rootPackageJsonPath = path.join(repoRoot, "package.json");
  const analyzerEntrypointPath = requireFromHere.resolve("typescript");
  const analyzerPackageJsonPath = requireFromHere.resolve("typescript/package.json");
  const analyzerMetadata = exactPackageMetadataV6(analyzerPackageJsonPath, "typescript");
  if (analyzerMetadata.version !== ts.version) {
    throw new Error("imported TypeScript analyzer version differs from its resolved package metadata");
  }
  const resolvedEntrypoint = captureStableToolchainFileV6(resolvedEntrypointPath, "esbuild resolved entrypoint");
  const packageJson = captureStableToolchainFileV6(packageJsonPath, "esbuild package.json");
  const esbuildPackageFiles = enumerateRealPackageFilesV6(esbuildPackageRoot, "esbuild package");
  const selectedNativePackageFiles = enumerateRealPackageFilesV6(
    path.dirname(nativePackageJsonPath),
    "selected esbuild native package",
  );
  const selectedNativePackageJson = captureStableToolchainFileV6(
    nativePackageJsonPath,
    "selected esbuild native package.json",
  );
  const selectedNativeExecutable = captureStableToolchainFileV6(
    nativeExecutablePath,
    "selected esbuild native executable",
  );
  const packageLock = captureStableToolchainFileV6(packageLockPath, "package-lock binding");
  const rootPackageJson = captureStableToolchainFileV6(rootPackageJsonPath, "root package.json binding");
  const analyzerEntrypoint = captureStableToolchainFileV6(
    analyzerEntrypointPath,
    "TypeScript provenance analyzer entrypoint",
  );
  const analyzerPackageJson = captureStableToolchainFileV6(
    analyzerPackageJsonPath,
    "TypeScript provenance analyzer package.json",
  );
  const analyzerFiles = [analyzerEntrypoint, analyzerPackageJson]
    .sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
  const analyzerCore = {
    name: "typescript" as const,
    version: analyzerMetadata.version,
    resolvedEntrypoint: analyzerEntrypoint,
    packageJson: analyzerPackageJson,
    implementationFileSetSha256: sha256V6(stableJsonV6(analyzerFiles)),
  };
  const provenanceAnalyzer: FrozenProvenanceAnalyzerV6 = {
    ...analyzerCore,
    contentSha256: sha256V6(stableJsonV6(analyzerCore)),
  };
  const filesForSet = [
    ...esbuildPackageFiles,
    ...selectedNativePackageFiles,
    packageLock,
    rootPackageJson,
    ...analyzerFiles,
  ].sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
  const core = {
    schemaVersion: "question-quality-esbuild-toolchain-provenance-v6" as const,
    platform: process.platform,
    arch: process.arch,
    esbuildVersion: packageMetadata.version,
    resolvedEntrypoint,
    packageJson,
    transitiveJsClosure: transitive.files,
    externalStaticSpecifiers: transitive.externalStaticSpecifiers,
    pnpapiResolution,
    esbuildPackageFiles,
    selectedNativePackageName: native.packageName,
    selectedNativePackageJson,
    selectedNativeExecutable,
    selectedNativePackageFiles,
    packageLock,
    rootPackageJson,
    provenanceAnalyzer,
    fileSetSha256: sha256V6(stableJsonV6(filesForSet)),
  };
  return {
    ...core,
    contentSha256: sha256V6(stableJsonV6(core)),
  };
}

export function assertCurrentBundlerToolchainV6(expected: FrozenBundlerToolchainV6): void {
  const actual = captureBundlerToolchainProvenanceV6();
  if (stableJsonV6(actual) !== stableJsonV6(expected)) {
    throw new Error("current resolved esbuild toolchain differs from the exact frozen provenance");
  }
}
