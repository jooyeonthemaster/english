import { createHash } from "node:crypto";

export const AUTHOR_CHILD_OS_ENV_NAMES_V6 = [
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "WINDIR",
] as const;

// Environment keys are case-insensitive on Windows. Always compare the
// canonical uppercase spelling so lowercase and mixed-case aliases cannot
// bypass the policy even when tests construct a synthetic ProcessEnv object.
const CANONICAL_FORBIDDEN_NAMES_V6 = new Set([
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

function isForbiddenInfluence(name: string): boolean {
  const upper = name.toUpperCase();
  return CANONICAL_FORBIDDEN_NAMES_V6.has(upper) ||
    upper.startsWith("TS_NODE") || upper.startsWith("TSX_") ||
    upper.startsWith("YARN_") || upper.includes("PNPAPI") || upper.includes("YARN_PNP");
}

export function assertNoAuthorToolchainEnvironmentInfluenceV6(
  source: NodeJS.ProcessEnv = process.env,
): { forbiddenNamesPresent: 0 } {
  const present = Object.keys(source)
    .filter((name) => isForbiddenInfluence(name))
    .sort();
  if (present.length > 0) {
    const exactNames = present.join(",");
    throw new Error(
      `${exactNames} is forbidden; author toolchain environment contains forbidden preload/resolution influence: ${exactNames}`,
    );
  }
  return { forbiddenNamesPresent: 0 };
}

export function buildExactAuthorChildEnvironmentV6(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  assertNoAuthorToolchainEnvironmentInfluenceV6(source);
  const child = {} as unknown as NodeJS.ProcessEnv;
  for (const name of AUTHOR_CHILD_OS_ENV_NAMES_V6) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) child[name] = value;
  }
  const required = process.platform === "win32"
    ? ["COMSPEC", "PATH", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR"]
    : ["PATH", "TEMP"];
  for (const name of required) {
    if (typeof child[name] !== "string" || !child[name]) {
      throw new Error(`author child required OS environment is missing: ${name}`);
    }
  }
  return child;
}

export function describeAuthorChildEnvironmentV6(env: NodeJS.ProcessEnv): {
  exactNames: string[];
  exactNameSetSha256: string;
  forbiddenNamesPresent: 0;
  credentialNamesPresent: 0;
  preloadOrResolutionInfluenceNamesPresent: 0;
} {
  const exactNames = Object.keys(env).sort();
  if (exactNames.some((name) => !AUTHOR_CHILD_OS_ENV_NAMES_V6.includes(name as typeof AUTHOR_CHILD_OS_ENV_NAMES_V6[number]))) {
    throw new Error("author child environment contains a non-OS allowlisted name");
  }
  if (exactNames.some((name) => /(?:KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD)/iu.test(name))) {
    throw new Error("author child environment contains a credential-shaped name");
  }
  if (exactNames.some(isForbiddenInfluence)) {
    throw new Error("author child environment contains a preload or resolution influence");
  }
  return {
    exactNames,
    exactNameSetSha256: createHash("sha256").update(JSON.stringify(exactNames), "utf8").digest("hex"),
    forbiddenNamesPresent: 0,
    credentialNamesPresent: 0,
    preloadOrResolutionInfluenceNamesPresent: 0,
  };
}
