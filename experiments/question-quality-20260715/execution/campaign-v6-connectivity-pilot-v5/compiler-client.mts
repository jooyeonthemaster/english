import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minimalCompilerEnvironmentV5 } from "./compiler-environment.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const compilerChild = path.join(here, "compiler-child.mts");

export interface IsolatedCompilerResultV5 {
  privateBytes: string;
  publicBytes: string;
  compilerClosureBytes: string;
  privateArtifact: Record<string, unknown>;
  publicArtifact: Record<string, unknown>;
  compilerClosure: Record<string, unknown> & {
    sourceFiles: Array<Record<string, unknown>>;
    dynamicSourceInputs: Array<Record<string, unknown>>;
    declaredDataInputs: Array<Record<string, unknown>>;
    files: Array<Record<string, unknown>>;
    compilerClosureSemanticSha256: string;
  };
}

export function runIsolatedCompilerV5(): IsolatedCompilerResultV5 {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), "qgen-connectivity-v5-compiler-"));
  try {
    const child = spawnSync(process.execPath, [
      tsxCli,
      compilerChild,
      `--output-dir=${outputDirectory}`,
    ], {
      cwd: repoRoot,
      env: minimalCompilerEnvironmentV5(process.env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(`isolated compiler child failed (${child.status}): ${String(child.stderr).slice(0, 2000)}`);
    }
    const summary = JSON.parse(String(child.stdout).trim()) as Record<string, unknown>;
    if (summary.status !== "V5_ISOLATED_COMPILER_COMPLETED" || summary.externalNetworkCalls !== 0 ||
        summary.providerCalls !== 0 || summary.modelCalls !== 0 || summary.apiCandidatesConsumed !== 0 ||
        summary.realCredentialValuesRead !== 0 || summary.ambientEnvironmentVariablesAccepted !== 0) {
      throw new Error("isolated compiler child summary is invalid");
    }
    const privateBytes = readFileSync(path.join(outputDirectory, "exact-wire.private.json"), "utf8");
    const publicBytes = readFileSync(path.join(outputDirectory, "exact-wire.public.json"), "utf8");
    const compilerClosureBytes = readFileSync(path.join(outputDirectory, "compiler-closure.json"), "utf8");
    return {
      privateBytes,
      publicBytes,
      compilerClosureBytes,
      privateArtifact: JSON.parse(privateBytes) as Record<string, unknown>,
      publicArtifact: JSON.parse(publicBytes) as Record<string, unknown>,
      compilerClosure: JSON.parse(compilerClosureBytes) as IsolatedCompilerResultV5["compilerClosure"],
    };
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}
