import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BudgetStore } from "../../harness/ledger";
import { validateConnectivityPilotProtocolV2 } from "./protocol-schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const privateRoot = path.join(here, "private");
const protocolPath = path.join(here, "protocol-v2.json");
const childPath = path.join(here, "live-child.mts");
const tsxCliPath = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

const launcherCapabilityBrand = Symbol("connectivity-pilot-isolated-launcher-capability");
interface IsolatedLauncherCapability {
  readonly [launcherCapabilityBrand]: true;
}

const PASSTHROUGH_ENV = ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"] as const;
const FORBIDDEN_PROFILE_ENV = new Set(["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]);
const CONTROLLED_ENV = new Set([
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_EXECUTION_NAME",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_PRICE_SNAPSHOT",
  "QUESTION_QUALITY_CONNECTIVITY_PILOT_VALID_THROUGH",
]);

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);
  return normalize(left) === normalize(right);
}

function loadBlockedProtocol() {
  return validateConnectivityPilotProtocolV2(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);
}

function mintLauncherCapability(): IsolatedLauncherCapability {
  const protocol = loadBlockedProtocol();
  const authorization = protocol.authorization as unknown as Record<string, unknown>;
  if (
    authorization.liveExecutionAuthorized !== true ||
    authorization.hostileAuditPassed !== true ||
    authorization.dispatchCommandPresent !== true
  ) {
    throw new Error("CURRENT_PROTOCOL_HAS_NO_AUTHORIZED_DISPATCH_COMMAND");
  }
  return Object.freeze({ [launcherCapabilityBrand]: true as const });
}

export function inspectConnectivityPilotLiveLaunchReadiness(): {
  status: "BLOCKED_PENDING_SEPARATE_HOSTILE_AUDIT_AND_PROTOCOL_AMENDMENT";
  liveExecutionAuthorized: false;
  hostileAuditPassed: false;
  dispatchCommandPresent: false;
} {
  const protocol = loadBlockedProtocol();
  return {
    status: "BLOCKED_PENDING_SEPARATE_HOSTILE_AUDIT_AND_PROTOCOL_AMENDMENT",
    liveExecutionAuthorized: protocol.authorization.liveExecutionAuthorized,
    hostileAuditPassed: protocol.authorization.hostileAuditPassed,
    dispatchCommandPresent: protocol.authorization.dispatchCommandPresent,
  };
}

export function buildMinimalConnectivityPilotChildEnvironmentForAudit(
  parentEnv: Readonly<Record<string, string | undefined>>,
  controlled: {
    executionName: string;
    priceSnapshotPath: string;
    validThrough: string;
  },
): Record<string, string> {
  const credentialNames = Object.keys(parentEnv).filter(
    (name) => /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(name),
  );
  if (credentialNames.length !== 1 || credentialNames[0] !== "OPENROUTER_API_KEY") {
    throw new Error("isolated pilot launcher requires exactly one credential source");
  }
  const credential = parentEnv.OPENROUTER_API_KEY;
  if (typeof credential !== "string" || credential.length < 8) {
    throw new Error("isolated pilot launcher credential is absent or malformed");
  }
  const result: Record<string, string> = {};
  for (const name of PASSTHROUGH_ENV) {
    const value = parentEnv[name];
    if (typeof value === "string" && value) result[name] = value;
  }
  result.OPENROUTER_API_KEY = credential;
  result.QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD = "1";
  result.QUESTION_QUALITY_CONNECTIVITY_PILOT_EXECUTION_NAME = controlled.executionName;
  result.QUESTION_QUALITY_CONNECTIVITY_PILOT_PRICE_SNAPSHOT = controlled.priceSnapshotPath;
  result.QUESTION_QUALITY_CONNECTIVITY_PILOT_VALID_THROUGH = controlled.validThrough;
  for (const forbidden of FORBIDDEN_PROFILE_ENV) {
    if (Object.prototype.hasOwnProperty.call(result, forbidden)) {
      throw new Error(`isolated pilot child env retained forbidden ${forbidden}`);
    }
  }
  for (const name of Object.keys(result)) {
    if (
      name !== "OPENROUTER_API_KEY" &&
      !PASSTHROUGH_ENV.includes(name as (typeof PASSTHROUGH_ENV)[number]) &&
      !CONTROLLED_ENV.has(name)
    ) {
      throw new Error(`isolated pilot child env contains non-allowlisted ${name}`);
    }
  }
  return result;
}

export async function launchConnectivityPilotInIsolatedChild(input: {
  priceSnapshotPath: string;
  validThrough: string;
}): Promise<{ exitCode: 0; publicResultJson: string }> {
  const capability = mintLauncherCapability();
  if (capability[launcherCapabilityBrand] !== true) throw new Error("launcher capability invalid");

  const validThrough = Date.parse(input.validThrough);
  if (!Number.isFinite(validThrough) || new Date(validThrough).toISOString() !== input.validThrough) {
    throw new Error("pilot validThrough must be canonical UTC");
  }
  const canonicalPrivate = realpathSync.native(privateRoot);
  const canonicalSnapshot = realpathSync.native(input.priceSnapshotPath);
  const snapshotRelative = path.relative(canonicalPrivate, canonicalSnapshot);
  if (snapshotRelative.startsWith("..") || path.isAbsolute(snapshotRelative)) {
    throw new Error("pilot price snapshot must be private and canonical");
  }

  const executionName = `live-execution-${Date.now().toString(36)}-${randomUUID().replace(/-/gu, "")}`;
  const executionRoot = BudgetStore.prepareConnectivityPilotPrivateExecutionDirectory(executionName);
  if (!samePath(path.dirname(executionRoot), canonicalPrivate)) {
    throw new Error("pilot execution root escaped private storage");
  }
  const childEnv = buildMinimalConnectivityPilotChildEnvironmentForAudit(process.env, {
    executionName,
    priceSnapshotPath: canonicalSnapshot,
    validThrough: input.validThrough,
  });

  return new Promise((resolve, reject) => {
    const wipeChildEnvironment = (): void => {
      for (const key of Object.keys(childEnv)) childEnv[key] = "";
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [tsxCliPath, childPath], {
        cwd: executionRoot,
        env: childEnv as NodeJS.ProcessEnv,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      wipeChildEnvironment();
      reject(new Error("isolated pilot child could not be created"));
      return;
    }
    let settled = false;
    let stdout = "";
    let stderr = "";
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    if (!childStdout || !childStderr) {
      wipeChildEnvironment();
      child.kill();
      reject(new Error("isolated pilot child streams were not isolated"));
      return;
    }
    childStdout.setEncoding("utf8");
    childStderr.setEncoding("utf8");
    childStdout.on("data", (chunk: string) => { stdout += chunk; });
    childStderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", () => {
      wipeChildEnvironment();
      if (settled) return;
      settled = true;
      reject(new Error("isolated pilot child process failed"));
    });
    child.once("close", (code) => {
      wipeChildEnvironment();
      if (settled) return;
      settled = true;
      if (code !== 0) {
        void stderr;
        reject(new Error(`isolated pilot child failed with code ${String(code)}`));
        return;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdout) as Record<string, unknown>;
      } catch {
        reject(new Error("isolated pilot child returned malformed public output"));
        return;
      }
      if (typeof parsed.executionArtifactSha256 !== "string") {
        reject(new Error("isolated pilot child returned no public result"));
        return;
      }
      resolve({ exitCode: 0, publicResultJson: stdout });
    });
  });
}
