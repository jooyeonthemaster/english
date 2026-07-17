import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { validateProtocolV3 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocolPath = path.join(here, "protocol-v3.json");
const childPath = path.join(here, "live-child.mts");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const envLocalPath = path.join(repoRoot, ".env.local");
const LIVE_CHILD_ENV = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V3_LIVE_CHILD";

function decodeAssignmentValue(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("OPENROUTER_API_KEY assignment is empty");
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0]!;
    if (!value.endsWith(quote) || value.length < 2) throw new Error("OPENROUTER_API_KEY quoting is malformed");
    const inner = value.slice(1, -1);
    if (quote === "'" && inner.includes("'")) throw new Error("single-quoted OPENROUTER_API_KEY is malformed");
    if (quote === '"') return inner.replace(/\\([\\"nrt])/gu, (_match, token: string) => ({ "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t" })[token]!);
    return inner;
  }
  if (/\s/u.test(value) || /[#`$]/u.test(value)) throw new Error("unquoted OPENROUTER_API_KEY contains unsupported syntax");
  return value;
}

async function readOnlyOpenRouterAssignment(): Promise<string> {
  const stream = createReadStream(envLocalPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity, terminal: false });
  let retained: string | null = null;
  try {
    for await (const line of lines) {
      const match = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/u.exec(line);
      if (!match) continue;
      if (retained !== null) throw new Error("OPENROUTER_API_KEY assignment is duplicated");
      retained = decodeAssignmentValue(match[1]!);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  if (retained === null || retained.length < 8) throw new Error("OPENROUTER_API_KEY assignment was not found");
  return retained;
}

function minimalChildEnvironment(key: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"]) {
    const value = process.env[name];
    if (typeof value === "string") env[name] = value;
  }
  env.OPENROUTER_API_KEY = key;
  env[LIVE_CHILD_ENV] = "1";
  return env;
}

export async function launchConnectivityPilotV3AfterFutureAuthorization(input: {
  runId: string;
  priceSnapshotPath: string;
}): Promise<number> {
  const protocol = validateProtocolV3(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);
  const authorization = protocol.authorization as unknown as Record<string, unknown>;
  if (authorization.liveExecutionAuthorized !== true || authorization.hostileAuditPassed !== true ||
      authorization.dispatchCommandPresent !== true) {
    throw new Error("v3 dispatch command is absent and live execution remains blocked");
  }
  const key = await readOnlyOpenRouterAssignment();
  const child = spawn(process.execPath, [
    tsxCli,
    childPath,
    `--run-id=${input.runId}`,
    `--price-snapshot=${path.resolve(input.priceSnapshotPath)}`,
  ], {
    cwd: repoRoot,
    env: minimalChildEnvironment(key),
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error("live child terminated by signal"));
      else resolve(code ?? 1);
    });
  });
}

async function blockedEntrypoint(): Promise<void> {
  throw new Error("No dispatch command is present in the v3 author freeze; create a separately audited authorization version.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await blockedEntrypoint();
}
