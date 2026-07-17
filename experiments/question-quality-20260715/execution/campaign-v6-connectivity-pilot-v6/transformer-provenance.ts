import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type SealedTransformRoleV6 =
  | "AUTHOR_BUILD"
  | "AUTHOR_VALIDATION_TESTS"
  | "ISOLATED_COMPILER";

export interface ExecutedTransformRowV6 {
  path: string;
  sourceBytes: number;
  sourceSha256: string;
  emittedFormat: string;
  emittedJsBytes: number;
  emittedJsSha256: string;
}

export interface ExecutedTransformerProvenanceV6 {
  schemaVersion: "question-quality-executed-tsx-transform-provenance-v6";
  role: SealedTransformRoleV6;
  transformerLockPath: string;
  transformerLockSha256: string;
  exactTransformedFiles: number;
  exactRows: ExecutedTransformRowV6[];
  exactRowsSha256: string;
  actualSourceToExecutedJavaScriptMappingCaptured: true;
  liveRuntimeTsxAllowed: false;
}

const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => JSON.stringify(value);

let currentAttestationV6: ExecutedTransformerProvenanceV6 | null = null;

export function assertSealedTransformerInvocationV6(input: {
  role: SealedTransformRoleV6;
  packageRoot: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;
  const registerUrl = pathToFileURL(
    path.join(input.packageRoot, "tsx-transform-capture-register.mjs"),
  ).href;
  if (
    env.QGEN_V6_TRANSFORM_ROLE !== input.role ||
    !env.QGEN_V6_TRANSFORM_CAPTURE_PATH ||
    process.execArgv.length !== 2 ||
    process.execArgv[0] !== "--import" ||
    process.execArgv[1] !== registerUrl
  ) {
    throw new Error(
      "authority TypeScript must enter through the exact sealed plain-Node register invocation",
    );
  }
}

function assertCapturePath(capturePath: string): string {
  const absolute = path.resolve(capturePath);
  const relative = path.relative(path.resolve(os.tmpdir()), absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("transform capture must be an OS-temp child");
  }
  const stat = lstatSync(absolute, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    realpathSync.native(absolute) !== absolute ||
    stat.size < BigInt(1) ||
    stat.size > BigInt(64 * 1024 * 1024)
  ) {
    throw new Error(
      "transform capture is not a bounded direct real regular file",
    );
  }
  return absolute;
}

export function attestExecutedTransformerProvenanceV6(input: {
  role: SealedTransformRoleV6;
  repoRoot: string;
  packageRoot: string;
  requiredEntrypoint: string;
  env?: NodeJS.ProcessEnv;
}): ExecutedTransformerProvenanceV6 {
  const env = input.env ?? process.env;
  assertSealedTransformerInvocationV6({
    role: input.role,
    packageRoot: input.packageRoot,
    env,
  });
  if (env.QGEN_V6_TRANSFORM_ROLE !== input.role) {
    throw new Error("sealed transform role differs");
  }
  const capture = assertCapturePath(env.QGEN_V6_TRANSFORM_CAPTURE_PATH ?? "");
  const before = lstatSync(capture, { bigint: true });
  const raw = readFileSync(capture, "utf8");
  const after = lstatSync(capture, { bigint: true });
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  ) {
    throw new Error("transform capture identity changed during read");
  }
  const rawRows = raw
    .trimEnd()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          role: string;
          sourcePath: string;
          sourceBytes: number;
          sourceSha256: string;
          emittedFormat: string;
          emittedJsBytes: number;
          emittedJsSha256: string;
        },
    );
  if (rawRows.length < 1) throw new Error("transform capture contains no rows");
  const seen = new Set<string>();
  const rows = rawRows
    .map((row): ExecutedTransformRowV6 => {
      if (row.role !== input.role)
        throw new Error("transform capture contains another role");
      const absolute = path.resolve(row.sourcePath);
      const relative = path
        .relative(input.repoRoot, absolute)
        .split(path.sep)
        .join("/");
      if (
        !relative ||
        relative.startsWith("../") ||
        path.isAbsolute(relative) ||
        seen.has(relative)
      ) {
        throw new Error("transform capture path escaped or was duplicated");
      }
      seen.add(relative);
      const source = readFileSync(absolute);
      if (
        source.byteLength !== row.sourceBytes ||
        hash(source) !== row.sourceSha256 ||
        !Number.isSafeInteger(row.emittedJsBytes) ||
        row.emittedJsBytes < 1 ||
        !/^[a-f0-9]{64}$/u.test(row.emittedJsSha256) ||
        ![
          "module",
          "commonjs",
          "commonjs-typescript",
          "module-typescript",
        ].includes(row.emittedFormat)
      ) {
        throw new Error(
          "transform capture source or emitted JavaScript evidence differs",
        );
      }
      return {
        path: relative,
        sourceBytes: row.sourceBytes,
        sourceSha256: row.sourceSha256,
        emittedFormat: row.emittedFormat,
        emittedJsBytes: row.emittedJsBytes,
        emittedJsSha256: row.emittedJsSha256,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!seen.has(input.requiredEntrypoint)) {
    throw new Error("transform capture omitted the exact role entrypoint");
  }
  const lockPath = path.join(input.packageRoot, "tsx-transformer-lock-v6.json");
  const lockBytes = readFileSync(lockPath);
  const result: ExecutedTransformerProvenanceV6 = {
    schemaVersion: "question-quality-executed-tsx-transform-provenance-v6",
    role: input.role,
    transformerLockPath:
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/tsx-transformer-lock-v6.json",
    transformerLockSha256: hash(lockBytes),
    exactTransformedFiles: rows.length,
    exactRows: rows,
    exactRowsSha256: hash(stable(rows)),
    actualSourceToExecutedJavaScriptMappingCaptured: true,
    liveRuntimeTsxAllowed: false,
  };
  currentAttestationV6 = result;
  return result;
}

export function currentExecutedTransformerProvenanceV6(): ExecutedTransformerProvenanceV6 {
  if (currentAttestationV6 === null) {
    throw new Error("executed transformer provenance has not been attested");
  }
  return currentAttestationV6;
}
