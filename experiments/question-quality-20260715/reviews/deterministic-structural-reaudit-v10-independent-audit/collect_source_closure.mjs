import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, version as esbuildVersion } from "esbuild";

const [repoRootArg, outputPathArg] = process.argv.slice(2);
if (!repoRootArg || !outputPathArg) {
  throw new Error("usage: node collect_source_closure.mjs <repo-root> <output-json>");
}
const repoRoot = path.resolve(repoRootArg);
const outputPath = path.resolve(outputPathArg);
const result = await build({
  absWorkingDir: repoRoot,
  stdin: {
    contents: [
      'export { findSummaryMcAnswerObjectMismatch } from "./src/lib/question-quality/validators/summary/mc.ts";',
      'export { findGrammarKeypointNonexistentLabel } from "./src/lib/question-quality/validators/grammar/shared.ts";',
      'export { validateSentenceOrderQuestion } from "./src/lib/question-quality/validators/sentence-order.ts";',
    ].join("\n"),
    resolveDir: repoRoot,
    sourcefile: "v10-independent-audit-source-closure-entry.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  write: false,
  metafile: true,
  tsconfig: path.join(repoRoot, "tsconfig.json"),
  logLevel: "silent",
});

const inputPaths = Object.keys(result.metafile?.inputs ?? {})
  .map((input) => input.replaceAll("\\", "/"))
  .filter((input) => input.startsWith("src/"))
  .sort();
const files = await Promise.all(
  inputPaths.map(async (relativePath) => {
    const bytes = await readFile(path.join(repoRoot, relativePath));
    return {
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }),
);
const canonical = files
  .map(({ path: relativePath, bytes, sha256: hash }) =>
    `${relativePath}\t${bytes}\t${hash}\n`,
  )
  .join("");
const payload = {
  schemaVersion: "deterministic-structural-v10-production-source-closure-v1",
  collector: "esbuild metafile over the three dynamically imported production entry modules",
  esbuildVersion,
  packagesExternal: true,
  entryExports: [
    "findSummaryMcAnswerObjectMismatch",
    "findGrammarKeypointNonexistentLabel",
    "validateSentenceOrderQuestion",
  ],
  fileCount: files.length,
  aggregateCanonicalization: "sorted path<TAB>bytes<TAB>sha256<LF>",
  aggregateSha256: sha256(canonical),
  files,
};
await writeFile(outputPath, canonicalJsonBytes(payload));
process.stdout.write(
  `SOURCE_CLOSURE_OK\nFILES ${files.length}\nAGGREGATE_SHA256 ${payload.aggregateSha256}\n`,
);

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
