import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertIndependentlyRootedTransformerLockV6 } from "./tsx-transform-root-v6.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const lockPath = path.join(here, "tsx-transformer-lock-v6.json");
const authorBootstrapMarker = "QGEN_V6_AUTHOR_EXTERNAL_BOOTSTRAP";
const allowedRoles = {
  AUTHOR_BUILD: {
    entrypoints: [path.join(here, "build-offline.mts")],
    nodeArgs: [],
  },
  AUTHOR_VALIDATION_TESTS: {
    entrypoints: [
      path.join(here, "offline.test.ts"),
      path.join(here, "system-boundary.test.ts"),
    ],
    nodeArgs: ["--test", "--test-isolation=none", "--test-concurrency=1"],
  },
  ISOLATED_COMPILER: {
    entrypoints: [path.join(here, "compiler-child.mts")],
    nodeArgs: [],
  },
};
const canonicalForbidden = new Set([
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_REPL_EXTERNAL_MODULE",
  "NODE_EXTRA_CA_CERTS",
  "ESBUILD_BINARY_PATH",
  "NPM_CONFIG_NODE_OPTIONS",
  "PNPAPI",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
]);
const osNames = [
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "WINDIR",
];
const compilerNames = [
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_V6_COMPILER_CHILD",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_GEMINI_REASONING_EFFORT",
  "OPENROUTER_REASONING_EFFORT",
  "OPENROUTER_STANDARD_MODEL",
  "PREMIUM_QGEN_MODEL_ID",
];
const exactImplementationPaths = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/author-bootstrap-v6.ps1",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/sealed-transform-launcher.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/transformer-provenance.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/tsx-transform-capture-loader.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/tsx-transform-capture-register.mjs",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function forbiddenName(name) {
  const upper = name.toUpperCase();
  return (
    canonicalForbidden.has(upper) ||
    upper.startsWith("TS_NODE") ||
    upper.startsWith("TSX_") ||
    upper.startsWith("YARN_") ||
    upper.includes("PNPAPI") ||
    upper.includes("YARN_PNP")
  );
}

function assertParentEnvironment(source) {
  const found = Object.keys(source).filter((name) => forbiddenName(name));
  if (found.length > 0)
    throw new Error(
      "sealed transform launcher rejects ambient influence: " +
        found.sort().join(","),
    );
}

function assertExactLauncherParentEnvironment(role, source) {
  const expected = new Set(osNames);
  if (role === "AUTHOR_BUILD") expected.add(authorBootstrapMarker);
  if (role === "ISOLATED_COMPILER") {
    for (const name of compilerNames) expected.add(name);
  }
  const actual = Object.keys(source);
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    "sealed transform launcher parent environment differs",
  );
  if (role === "AUTHOR_BUILD") {
    assert.equal(
      process.platform,
      "win32",
      "author build external bootstrap is Windows-only",
    );
    assert.equal(
      source[authorBootstrapMarker],
      "1",
      "author build external bootstrap marker differs",
    );
    assert.equal(
      source.TEMP,
      source.TMP,
      "author bootstrap TEMP and TMP differ",
    );
    const scratch = lstatSync(String(source.TEMP));
    assert(scratch.isDirectory() && !scratch.isSymbolicLink());
    assert.equal(
      comparable(realpathSync.native(String(source.TEMP))),
      comparable(String(source.TEMP)),
    );
    const systemRoot = String(source.SystemRoot);
    assert.equal(comparable(systemRoot), comparable("C:\\Windows"));
    assert.equal(comparable(source.WINDIR), comparable(systemRoot));
    assert.equal(
      comparable(source.COMSPEC),
      comparable(path.join(systemRoot, "System32", "cmd.exe")),
    );
    assert.equal(
      comparable(source.PATH),
      comparable(path.join(systemRoot, "System32")),
    );
    assert.equal(source.PATHEXT, ".COM;.EXE;.BAT;.CMD");
  } else {
    assert.equal(Object.hasOwn(source, authorBootstrapMarker), false);
  }
}

function packageSet(packageRoot) {
  const rows = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("transformer package contains a symlink");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const bytes = readFileSync(file);
        rows.push({
          path: path.relative(packageRoot, file).split(path.sep).join("/"),
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
        });
      } else {
        throw new Error("transformer package contains a special file");
      }
    }
  }
  walk(packageRoot);
  rows.sort((left, right) => left.path.localeCompare(right.path));
  const payload =
    rows
      .map((row) => row.sha256 + " " + row.bytes + " " + row.path)
      .join("\n") + "\n";
  return {
    exactFiles: rows.length,
    exactBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    setSha256: sha256(Buffer.from(payload, "utf8")),
  };
}

export function verifySealedTransformerInstallationV6() {
  const rootedLock = assertIndependentlyRootedTransformerLockV6();
  const lockBytes = readFileSync(lockPath);
  assert.equal(lockBytes.byteLength, rootedLock.bytes);
  assert.equal(sha256(lockBytes), rootedLock.sha256);
  const lock = JSON.parse(lockBytes.toString("utf8"));
  assert.equal(
    lock.status,
    "AUTHOR_COMPILER_AND_VALIDATION_ONLY_NOT_LIVE_RUNTIME",
  );
  assert.equal(lock.platform, process.platform);
  assert.equal(lock.architecture, process.arch);
  assert.match(process.version, /^v24\./u);
  const nodeExecutable = readFileSync(process.execPath);
  assert.equal(
    comparable(realpathSync.native(process.execPath)),
    comparable(lock.nodeRuntime.executablePath),
  );
  assert.equal(process.version, lock.nodeRuntime.nodeVersion);
  assert.equal(nodeExecutable.byteLength, lock.nodeRuntime.executableBytes);
  assert.equal(sha256(nodeExecutable), lock.nodeRuntime.executableSha256);
  assert.equal(lock.liveRuntimeTsxAllowed, false);
  for (const pin of lock.packages) {
    const packageRoot = path.join(
      repoRoot,
      "node_modules",
      ...pin.name.split("/"),
    );
    const stat = lstatSync(packageRoot);
    assert(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(realpathSync.native(packageRoot), path.resolve(packageRoot));
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    );
    assert.equal(packageJson.version, pin.version);
    assert.deepEqual(packageSet(packageRoot), {
      exactFiles: pin.exactFiles,
      exactBytes: pin.exactBytes,
      setSha256: pin.setSha256,
    });
  }
  for (const pin of [lock.packageJson, lock.packageLock]) {
    const bytes = readFileSync(path.join(repoRoot, pin.path));
    assert.equal(bytes.byteLength, pin.bytes);
    assert.equal(sha256(bytes), pin.sha256);
  }
  assert.deepEqual(
    lock.implementationFiles.map((pin) => pin.path),
    exactImplementationPaths,
  );
  assert.equal(lock.exactImplementationFiles, exactImplementationPaths.length);
  assert.equal(
    lock.exactImplementationBytes,
    lock.implementationFiles.reduce((sum, pin) => sum + pin.bytes, 0),
  );
  for (const pin of lock.implementationFiles) {
    const file = path.resolve(repoRoot, pin.path);
    const relative = path.relative(repoRoot, file);
    assert(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    );
    const stat = lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(realpathSync.native(file), file);
    const bytes = readFileSync(file);
    assert.equal(bytes.byteLength, pin.bytes);
    assert.equal(sha256(bytes), pin.sha256);
  }
  return {
    transformerLockSha256: sha256(lockBytes),
    independentPreTransformLockRoot: true,
    exactPackages: lock.exactPackages,
    exactFiles: lock.exactFiles,
    exactBytes: lock.exactBytes,
    exactImplementationFiles: lock.exactImplementationFiles,
    exactImplementationBytes: lock.exactImplementationBytes,
    nodeExecutableSha256: lock.nodeRuntime.executableSha256,
    liveRuntimeTsxAllowed: false,
  };
}

function cleanEnvironment(role, capturePath) {
  const env = {};
  for (const name of osNames) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) env[name] = value;
  }
  if (role === "ISOLATED_COMPILER") {
    for (const name of compilerNames) {
      const value = process.env[name];
      if (typeof value !== "string" || value.length < 1) {
        throw new Error("sealed compiler environment is missing " + name);
      }
      env[name] = value;
    }
  }
  env.QGEN_V6_TRANSFORM_CAPTURE_PATH = capturePath;
  env.QGEN_V6_TRANSFORM_ROLE = role;
  return env;
}

function parseArguments() {
  const roleFlag = process.argv.find((value) => value.startsWith("--role="));
  const outputFlag = process.argv.find((value) =>
    value.startsWith("--provenance-output="),
  );
  const separator = process.argv.indexOf("--");
  if (!roleFlag || !outputFlag || separator < 0)
    throw new Error("sealed transform launcher arguments differ");
  const role = roleFlag.slice("--role=".length);
  if (!Object.hasOwn(allowedRoles, role))
    throw new Error("sealed transform launcher role differs");
  return {
    role,
    output: path.resolve(outputFlag.slice("--provenance-output=".length)),
    childArgs: process.argv.slice(separator + 1),
  };
}

function validateCapture(role, capturePath, createdIdentity) {
  const before = lstatSync(capturePath, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink());
  assert.equal(
    comparable(realpathSync.native(capturePath)),
    comparable(capturePath),
  );
  assert.equal(before.dev, createdIdentity.dev);
  assert.equal(before.ino, createdIdentity.ino);
  assert(before.size > BigInt(0) && before.size <= BigInt(64 * 1024 * 1024));
  const lines = readFileSync(capturePath, "utf8")
    .trimEnd()
    .split(/\r?\n/u)
    .filter(Boolean);
  const after = lstatSync(capturePath, { bigint: true });
  assert.equal(before.dev, after.dev);
  assert.equal(before.ino, after.ino);
  assert.equal(before.size, after.size);
  assert.equal(before.mtimeNs, after.mtimeNs);
  assert.equal(before.ctimeNs, after.ctimeNs);
  const rawRows = lines
    .map((line) => JSON.parse(line))
    .map((row) => {
      assert.equal(row.role, role);
      const absolute = path.resolve(row.sourcePath);
      const relative = path
        .relative(repoRoot, absolute)
        .split(path.sep)
        .join("/");
      assert(
        relative && !relative.startsWith("../") && !path.isAbsolute(relative),
      );
      const source = readFileSync(absolute);
      assert.equal(source.byteLength, row.sourceBytes);
      assert.equal(sha256(source), row.sourceSha256);
      assert.match(row.emittedJsSha256, /^[a-f0-9]{64}$/u);
      assert(
        Number.isSafeInteger(row.emittedJsBytes) && row.emittedJsBytes > 0,
      );
      return {
        path: relative,
        sourceBytes: row.sourceBytes,
        sourceSha256: row.sourceSha256,
        emittedFormat: row.emittedFormat,
        emittedJsBytes: row.emittedJsBytes,
        emittedJsSha256: row.emittedJsSha256,
      };
    });
  const rowByPath = new Map();
  for (const row of rawRows) {
    const prior = rowByPath.get(row.path);
    if (prior === undefined) rowByPath.set(row.path, row);
    else
      assert.deepEqual(
        row,
        prior,
        "repeated transform capture path produced conflicting executed JavaScript",
      );
  }
  const rows = [...rowByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  assert(rows.length > 0);
  const required = allowedRoles[role].entrypoints.map((entry) =>
    path.relative(repoRoot, entry).split(path.sep).join("/"),
  );
  for (const entry of required) assert(rows.some((row) => row.path === entry));
  return {
    schemaVersion: "question-quality-executed-tsx-transform-provenance-v6",
    role,
    exactRows: rows,
    exactTransformedFiles: rows.length,
    exactRowsSha256: sha256(Buffer.from(JSON.stringify(rows), "utf8")),
    actualSourceToExecutedJavaScriptMappingCaptured: true,
    liveRuntimeTsxAllowed: false,
  };
}

function main() {
  const args = parseArguments();
  assertParentEnvironment(process.env);
  assertExactLauncherParentEnvironment(args.role, process.env);
  const transformer = verifySealedTransformerInstallationV6();
  const scratch = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-transform-"));
  const capturePath = path.join(
    scratch,
    randomBytes(16).toString("hex") + ".jsonl",
  );
  const fd = openSync(capturePath, "wx", 0o600);
  closeSync(fd);
  const createdIdentity = lstatSync(capturePath, { bigint: true });
  assert(
    createdIdentity.isFile() &&
      !createdIdentity.isSymbolicLink() &&
      createdIdentity.size === BigInt(0),
  );
  assert.equal(
    comparable(realpathSync.native(capturePath)),
    comparable(capturePath),
  );
  try {
    const register = path.join(here, "tsx-transform-capture-register.mjs");
    const roleConfiguration = allowedRoles[args.role];
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(register).href,
        ...roleConfiguration.nodeArgs,
        ...roleConfiguration.entrypoints,
        ...args.childArgs,
      ],
      {
        cwd: repoRoot,
        env: cleanEnvironment(args.role, capturePath),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: 300_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (child.error) throw child.error;
    if (child.status !== 0) {
      process.stderr.write(String(child.stderr));
      process.exitCode = child.status ?? 1;
      return;
    }
    const executed = validateCapture(args.role, capturePath, createdIdentity);
    const transformerAfterExecution = verifySealedTransformerInstallationV6();
    assert.deepEqual(
      transformerAfterExecution,
      transformer,
      "transformer installation changed across authority TypeScript execution",
    );
    const outputDirectory = path.dirname(args.output);
    const outputStat = statSync(outputDirectory);
    if (!outputStat.isDirectory())
      throw new Error("provenance output parent is absent");
    writeFileSync(
      args.output,
      JSON.stringify(
        {
          ...executed,
          transformerLockSha256:
            transformerAfterExecution.transformerLockSha256,
          transformer: transformerAfterExecution,
        },
        null,
        2,
      ) + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    process.stdout.write(String(child.stdout));
    process.stderr.write(String(child.stderr));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
