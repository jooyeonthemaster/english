import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.join(here, ".runtime-cache-verify");
const repoRoot = path.resolve(here, "../../../..");
const reviewRelative = "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1";
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.replaceAll("\\", "/");
rmSync(runtimeRoot, { recursive: true, force: true });
const manifestRows = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8").trim().split(/\r?\n/gu).map((line) => {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert(match, `malformed manifest row: ${line}`);
  assert.equal(sha256(readFileSync(path.join(repoRoot, match[2]!))), match[1], `review manifest drift: ${match[2]}`);
  return match[2]!;
});
const files: string[] = [];
const visit = (directory: string): void => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.isFile() && entry.name !== "MANIFEST.sha256") files.push(slash(path.relative(repoRoot, absolute)));
  }
};
visit(here);
assert.deepEqual([...manifestRows].sort(), files.sort(), "review manifest coverage is not exact");
mkdirSync(runtimeRoot, { recursive: true });
process.on("exit", () => rmSync(runtimeRoot, { recursive: true, force: true }));
const result = spawnSync(process.execPath, [path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"), path.join(here, "build.mts"), "--check"], {
  cwd: repoRoot,
  env: {
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\Windows",
    PATH: "C:\\Program Files\\nodejs;C:\\Program Files\\Git\\cmd;C:\\Windows\\System32",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: runtimeRoot,
    TMP: runtimeRoot,
    COMSPEC: "C:\\Windows\\System32\\cmd.exe",
    TSX_DISABLE_CACHE: "1",
    NODE_DISABLE_COMPILE_CACHE: "1",
  },
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(readFileSync(path.join(here, "report.json"), "utf8")) as Record<string, any>;
assert.equal(report.verdict, "FAIL");
assert.equal(report.highestBlockerSeverity, "critical");
assert.equal(report.liveDisposition, "offline structure only; separate authorized version required");
const activity = report.activity as Record<string, unknown>;
for (const [key, value] of Object.entries(activity)) {
  if (key === "liveExecutionAuthorizedOrPerformed") assert.equal(value, false);
  else assert.equal(value, 0, `${key} must remain zero`);
}
process.stdout.write(`${JSON.stringify({ status: "INDEPENDENT_AUDIT_VERIFIED", reviewRelative, manifestRows: manifestRows.length, verdict: report.verdict, highestBlockerSeverity: report.highestBlockerSeverity, activity }, null, 2)}\n`);
