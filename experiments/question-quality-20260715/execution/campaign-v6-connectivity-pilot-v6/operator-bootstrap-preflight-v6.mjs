import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const allowedEnvironment = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "QUESTION_QUALITY_V6_POSIX_ENV_I",
  "TMPDIR",
];
const forbiddenExecArgv =
  /^(?:-r(?:.+|$)|--require(?:=|$)|--import(?:=|$)|--loader(?:=|$)|--experimental-loader(?:=|$))/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function regularRealFile(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) throw new Error(label + " is absent");
  const stat = lstatSync(absolute);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    realpathSync.native(absolute) !== absolute
  ) {
    throw new Error(label + " is not a direct real regular file");
  }
  return absolute;
}

function exactJson(filePath, label) {
  return JSON.parse(readFileSync(regularRealFile(filePath, label), "utf8"));
}

function assertCleanBootstrap() {
  if (process.platform === "win32")
    throw new Error("Windows live operator bootstrap remains blocked");
  if (process.env.QUESTION_QUALITY_V6_POSIX_ENV_I !== "1") {
    throw new Error("operator preflight lacks the external env -i marker");
  }
  const names = Object.keys(process.env).sort();
  if (JSON.stringify(names) !== JSON.stringify(allowedEnvironment)) {
    throw new Error(
      "operator preflight environment is not the exact sealed set",
    );
  }
  if (process.execArgv.some((value) => forbiddenExecArgv.test(value))) {
    throw new Error(
      "operator preflight rejects Node preload or loader arguments",
    );
  }
  if (
    process.env.PATH !== "/usr/bin:/bin" ||
    process.env.HOME !== "/nonexistent" ||
    process.env.LANG !== "C" ||
    process.env.LC_ALL !== "C" ||
    process.env.TMPDIR !== "/tmp"
  ) {
    throw new Error("operator preflight exact environment values differ");
  }
  if (realpathSync.native(process.execPath) !== "/usr/bin/node") {
    throw new Error("operator preflight Node realpath differs");
  }
  if (
    !process.argv[1] ||
    realpathSync.native(process.argv[1]) !== fileURLToPath(import.meta.url)
  ) {
    throw new Error("operator preflight was not the direct Node entry script");
  }
  if (!/^v24\./u.test(process.version))
    throw new Error("operator preflight requires Node 24.x");
}

async function main() {
  assertCleanBootstrap();
  const packagePath = regularRealFile(
    path.join(repoRoot, "package.json"),
    "tracked package runtime policy",
  );
  const packageBytes = readFileSync(packagePath);
  const packageJson = JSON.parse(packageBytes.toString("utf8"));
  if (packageJson.engines?.node !== "24.x")
    throw new Error("tracked package Node engine differs");

  const protocol = exactJson(
    path.join(here, "protocol-v6.json"),
    "v6 protocol",
  );
  const packagePin = protocol.deploymentRuntimeTrust?.trackedPackageEngine;
  if (
    packageBytes.byteLength !== packagePin?.bytes ||
    sha256(packageBytes) !== packagePin?.sha256 ||
    packagePin?.nodePolicy !== "24.x" ||
    packagePin?.trustLevel !== "TRACKED_DEPLOYMENT_INPUT"
  ) {
    throw new Error(
      "tracked package runtime bytes differ from the separated deployment trust evidence",
    );
  }
  const lockBytes = readFileSync(
    regularRealFile(
      path.join(repoRoot, "package-lock.json"),
      "tracked package lock root",
    ),
  );
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const lockPin = protocol.deploymentRuntimeTrust?.trackedPackageLockRoot;
  if (
    lockBytes.byteLength !== lockPin?.bytes ||
    sha256(lockBytes) !== lockPin?.sha256 ||
    lock.packages?.[""]?.engines?.node !== "24.x" ||
    lockPin?.trustLevel !== "TRACKED_LOCK_ROOT_CORROBORATION"
  ) {
    throw new Error(
      "tracked package-lock root differs from the separated deployment trust evidence",
    );
  }
  const attributesBytes = readFileSync(
    regularRealFile(
      path.join(repoRoot, ".gitattributes"),
      "tracked checkout byte policy",
    ),
  );
  const attributesPin =
    protocol.deploymentRuntimeTrust?.trackedLineEndingPolicy;
  if (
    attributesBytes.byteLength !== attributesPin?.bytes ||
    sha256(attributesBytes) !== attributesPin?.sha256 ||
    attributesPin?.trustLevel !== "TRACKED_EXACT_BYTE_CHECKOUT_POLICY"
  ) {
    throw new Error(
      "tracked checkout byte policy differs from the separated deployment trust evidence",
    );
  }
  if (
    protocol.authorization?.liveExecutionAuthorized !== true ||
    protocol.authorization?.hostileAuditPassed !== true ||
    protocol.authorization?.dispatchCommandPresent !== true
  ) {
    throw new Error(
      "v6 operator bootstrap remains blocked pending fresh authorization",
    );
  }
  if (
    protocol.deploymentRuntimeTrust?.currentRemoteDeploymentEvidencePresent !==
      true ||
    protocol.deploymentRuntimeTrust?.currentDeployedCommitEvidencePresent !==
      true ||
    protocol.deploymentRuntimeTrust?.deployedRuntimeParityClaimed !== true
  ) {
    throw new Error(
      "current remote deployment, commit, and Node runtime parity evidence is absent",
    );
  }
  if (
    protocol.processIsolation?.soleAuthorizedOperatorEntry !==
    "POSIX_EXTERNAL_ENV_I_THEN_PLAIN_NODE_PREFLIGHT"
  ) {
    throw new Error("v6 protocol does not bind this sole operator entry");
  }

  const artifactPath = path.join(here, "frozen-runtime-v6.json");
  const artifactBytes = readFileSync(
    regularRealFile(artifactPath, "frozen runtime artifact"),
  );
  const artifact = JSON.parse(artifactBytes.toString("utf8"));
  if (
    sha256(artifactBytes) !== protocol.frozenRuntimeContract?.artifactSha256
  ) {
    throw new Error("frozen runtime artifact hash differs");
  }
  const node = artifact.nodeRuntime;
  const executableBytes = readFileSync(
    regularRealFile(process.execPath, "operator Node executable"),
  );
  if (
    node?.nodeVersion !== process.version ||
    node?.platform !== process.platform ||
    node?.architecture !== process.arch ||
    node?.modulesAbi !== process.versions.modules ||
    node?.napi !== process.versions.napi ||
    node?.v8 !== process.versions.v8 ||
    node?.executableRealpath !== realpathSync.native(process.execPath) ||
    node?.executableSha256 !== sha256(executableBytes)
  ) {
    throw new Error("operator Node identity differs from the frozen runtime");
  }

  const operator = artifact.bundles?.find((entry) => entry.role === "OPERATOR");
  if (!operator) throw new Error("frozen operator bundle row is absent");
  const bundlePath = regularRealFile(
    path.join(repoRoot, operator.path),
    "frozen operator bundle",
  );
  const bundleBytes = readFileSync(bundlePath);
  if (
    bundleBytes.byteLength !== operator.bytes ||
    sha256(bundleBytes) !== operator.sha256
  ) {
    throw new Error("frozen operator bundle bytes differ");
  }

  process.env.QUESTION_QUALITY_V6_POSIX_PREFLIGHT_ATTESTED = sha256(
    Buffer.from(process.version + "\n" + operator.sha256, "utf8"),
  );
  await import(pathToFileURL(bundlePath).href);
}

await main();
