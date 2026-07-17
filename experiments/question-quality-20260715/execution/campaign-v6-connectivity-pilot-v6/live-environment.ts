export const LIVE_CHILD_MARKER_ENV_V6 = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V6_LIVE_CHILD";
export const MINIMAL_OS_ENV_NAMES_V6 = [
  "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC",
] as const;
// Reproduced on the sealed Windows host: CreateProcess/Node injects these
// names even when spawn receives only MINIMAL_OS_ENV_NAMES_V6. The launcher
// never copies their values; the child merely accepts the OS-injected names.
export const WINDOWS_AUTOINJECTED_ENV_NAMES_V6 = [
  "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE",
  "USERDOMAIN", "USERNAME", "USERPROFILE",
] as const;
export const LIVE_CHILD_ENV_NAMES_V6 = [
  ...MINIMAL_OS_ENV_NAMES_V6,
  "OPENROUTER_API_KEY",
  LIVE_CHILD_MARKER_ENV_V6,
] as const;
const REQUIRED_OS_ENV_NAMES_V6 = MINIMAL_OS_ENV_NAMES_V6;

export function buildExactLiveChildEnvironmentV6(
  source: NodeJS.ProcessEnv,
  openRouterApiKey: string,
): NodeJS.ProcessEnv {
  if (typeof openRouterApiKey !== "string" || openRouterApiKey.length < 8) {
    throw new Error("live child OpenRouter credential is invalid");
  }
  const env = {} as NodeJS.ProcessEnv;
  for (const name of MINIMAL_OS_ENV_NAMES_V6) {
    const value = source[name];
    if (typeof value === "string" && value) env[name] = value;
  }
  for (const name of REQUIRED_OS_ENV_NAMES_V6) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`live launcher required OS environment is missing: ${name}`);
    }
  }
  env.OPENROUTER_API_KEY = openRouterApiKey;
  env[LIVE_CHILD_MARKER_ENV_V6] = "1";
  return env;
}

export function assertExactLiveChildEnvironmentV6(env: NodeJS.ProcessEnv = process.env): void {
  const expected = new Set<string>([
    ...LIVE_CHILD_ENV_NAMES_V6,
    ...(process.platform === "win32" ? WINDOWS_AUTOINJECTED_ENV_NAMES_V6 : []),
  ]);
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error("live child exact environment name set differs");
  }
  for (const name of Object.keys(env)) {
    if (!expected.has(name)) throw new Error(`live child received a non-allowlisted environment name: ${name}`);
  }
  for (const name of [...REQUIRED_OS_ENV_NAMES_V6, "OPENROUTER_API_KEY", LIVE_CHILD_MARKER_ENV_V6]) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`live child required environment name is missing: ${name}`);
    }
  }
  if (env[LIVE_CHILD_MARKER_ENV_V6] !== "1") throw new Error("live child marker missing");
}

export function assertExactMetadataEnvironmentV6(env: NodeJS.ProcessEnv = process.env): void {
  const expected = new Set<string>([
    ...MINIMAL_OS_ENV_NAMES_V6,
    ...(process.platform === "win32" ? WINDOWS_AUTOINJECTED_ENV_NAMES_V6 : []),
  ]);
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error("metadata capture exact environment name set differs");
  }
  for (const name of Object.keys(env)) {
    if (!expected.has(name)) throw new Error(`metadata capture received a non-allowlisted environment name: ${name}`);
  }
  for (const name of REQUIRED_OS_ENV_NAMES_V6) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`metadata capture required environment is missing: ${name}`);
    }
  }
}

export function buildExactMetadataEnvironmentV6(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const name of MINIMAL_OS_ENV_NAMES_V6) {
    const value = source[name];
    if (typeof value === "string" && value) env[name] = value;
  }
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...MINIMAL_OS_ENV_NAMES_V6].sort())) {
    throw new Error("metadata launcher exact environment name set differs");
  }
  return env;
}
