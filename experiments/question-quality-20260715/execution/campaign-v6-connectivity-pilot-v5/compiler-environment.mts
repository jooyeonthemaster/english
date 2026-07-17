import { createHash } from "node:crypto";

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

export const COMPILER_CHILD_MARKER_V5 = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V5_COMPILER_CHILD";

export const COMPILER_OS_ENV_NAMES_V5 = [
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "WINDIR",
] as const;

export const COMPILER_EXPLICIT_ENV_V5 = {
  [COMPILER_CHILD_MARKER_V5]: "1",
  OPENROUTER_API_KEY: "offline-compiler-dummy-not-a-secret",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_GEMINI_REASONING_EFFORT: "none",
  OPENROUTER_REASONING_EFFORT: "none",
  OPENROUTER_STANDARD_MODEL: "google/gemini-3.5-flash",
  PREMIUM_QGEN_MODEL_ID: "google/gemini-3.1-pro-preview",
} as const;

export interface CompilerEnvironmentRowV5 {
  name: string;
  kind: "minimal_os" | "explicit_offline_qgen";
  valueUtf8Bytes: number;
  valueSha256: string;
}

let droppedBeforeCompilerImportV5: string[] = [];

function sortedNames(value: NodeJS.ProcessEnv): string[] {
  return Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function minimalCompilerEnvironmentV5(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = {};
  for (const name of COMPILER_OS_ENV_NAMES_V5) {
    const value = parent[name];
    if (typeof value === "string" && value.length > 0) child[name] = value;
  }
  for (const [name, value] of Object.entries(COMPILER_EXPLICIT_ENV_V5)) child[name] = value;
  return child;
}

export function sanitizeCompilerEnvironmentBeforeImportV5(env: NodeJS.ProcessEnv = process.env): string[] {
  const allowed = new Set([
    ...COMPILER_OS_ENV_NAMES_V5,
    ...Object.keys(COMPILER_EXPLICIT_ENV_V5),
  ]);
  const dropped = Object.keys(env).filter((name) => !allowed.has(name)).sort();
  for (const name of dropped) delete env[name];
  droppedBeforeCompilerImportV5 = dropped;
  return [...dropped];
}

export function assertAndDescribeIsolatedCompilerEnvironmentV5(
  env: NodeJS.ProcessEnv = process.env,
): {
  rows: CompilerEnvironmentRowV5[];
  exactNameSetSha256: string;
  exactRowsSha256: string;
  realCredentialValuesRead: 0;
  ambientEnvironmentVariablesAccepted: 0;
  ambientEnvironmentVariableNamesDroppedBeforeCompilerImport: string[];
  droppedNameSetSha256: string;
  droppedCredentialValuesRead: 0;
} {
  const expected = minimalCompilerEnvironmentV5(env);
  const expectedNames = sortedNames(expected);
  const actualNames = sortedNames(env);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`isolated compiler environment names differ: ${actualNames.join(",")}`);
  }
  for (const [name, value] of Object.entries(COMPILER_EXPLICIT_ENV_V5)) {
    if (env[name] !== value) throw new Error(`isolated compiler explicit value differs for ${name}`);
  }
  if (env[COMPILER_CHILD_MARKER_V5] !== "1") throw new Error("isolated compiler child marker missing");
  const rows: CompilerEnvironmentRowV5[] = actualNames.map((name) => {
    const value = env[name];
    if (typeof value !== "string") throw new Error(`isolated compiler environment value missing for ${name}`);
    return {
      name,
      kind: Object.hasOwn(COMPILER_EXPLICIT_ENV_V5, name) ? "explicit_offline_qgen" : "minimal_os",
      valueUtf8Bytes: Buffer.byteLength(value, "utf8"),
      valueSha256: sha256(value),
    };
  });
  const stable = (value: unknown): string => JSON.stringify(value);
  return {
    rows,
    exactNameSetSha256: sha256(stable(actualNames)),
    exactRowsSha256: sha256(stable(rows)),
    realCredentialValuesRead: 0,
    ambientEnvironmentVariablesAccepted: 0,
    ambientEnvironmentVariableNamesDroppedBeforeCompilerImport: [...droppedBeforeCompilerImportV5],
    droppedNameSetSha256: sha256(stable(droppedBeforeCompilerImportV5)),
    droppedCredentialValuesRead: 0,
  };
}
