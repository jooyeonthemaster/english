import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const sourcePrivate = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-s1-v6/private/original-passages.private.json",
);
const outputPath = path.join(here, "private/repo-overlap-capture.private.json");
const EXCLUDED_RELATIVE_ROOTS = [
  "experiments/question-quality-20260715/corpus/original-s1-v6",
  "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1",
  "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1",
  "experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1",
] as const;
const SOURCE_PRIVATE_ARTIFACT_SHA256 =
  "342824222a0271798821b5369034d0faf7246bab84102a16cfcb64e67b8d8e68";
const CAMPAIGN_SCOPE_ID = "question-quality-20260715-s1-v6";
const AUTHORIZED_DERIVED_EXCLUSION_MATERIAL = [
  {
    relativePath:
      "experiments/question-quality-20260715/design/campaign-v6-s1/private/s1-queue-v6.json",
    reason:
      "Exact-text private queue is an authorized deterministic descendant of the sealed source corpus; scanning it would measure self-copy, not external or antecedent overlap.",
  },
  {
    relativePath:
      "experiments/question-quality-20260715/design/campaign-v6-s1/campaign-v6-s1.json",
    reason:
      "Generated public campaign commitment binds this audit, so excluding it prevents a circular audit-to-design inventory dependency; it contains no exact passage text.",
  },
  {
    relativePath:
      "experiments/question-quality-20260715/design/campaign-v6-s1/MANIFEST.sha256",
    reason:
      "Generated campaign manifest transitively binds this audit and is excluded only to prevent a circular inventory seal.",
  },
  {
    relativePath:
      "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/private/exact-wire-preflight-v1.json",
    reason:
      "Private exact-wire commitments are authorized descendants of the sealed queue; scanning them would test downstream self-derivation, not antecedent overlap.",
  },
  {
    relativePath:
      "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/exact-wire-preflight-v1.json",
    reason:
      "Generated public preflight commitment transitively binds this audit and is excluded only to prevent a circular inventory seal; it contains aggregate commitments only.",
  },
  {
    relativePath:
      "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/MANIFEST.sha256",
    reason:
      "Generated preflight manifest transitively binds this audit and is excluded only to prevent a circular inventory seal.",
  },
] as const;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  ".cache",
]);
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".jsonl", ".ts", ".tsx", ".js", ".jsx",
  ".mjs", ".mts", ".csv", ".tsv", ".html", ".yml", ".yaml", ".sql", ".py",
]);
const MAX_FILE_BYTES = 20_000_000;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export const AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS =
  AUTHORIZED_DERIVED_EXCLUSION_MATERIAL.map((entry) => {
    const authorizationMaterial = {
      relativePath: entry.relativePath,
      reason: entry.reason,
      authorizationBasis: {
        sourcePrivateArtifactSha256: SOURCE_PRIVATE_ARTIFACT_SHA256,
        campaignScopeId: CAMPAIGN_SCOPE_ID,
        relationship: "DETERMINISTIC_DOWNSTREAM_CAMPAIGN_DERIVATIVE",
      },
    } as const;
    return {
      ...authorizationMaterial,
      exclusionRuleSha256: sha256(stableJson(authorizationMaterial)),
    };
  });

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? []).map((token) =>
    token.replace(/^'+|'+$/gu, ""),
  );
}

function ngramHashes(text: string, size: number): Set<string> {
  const tokens = words(text);
  const hashes = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    hashes.add(sha256(tokens.slice(index, index + size).join(" ")));
  }
  return hashes;
}

function matchingNgramHashes(
  text: string,
  size: number,
  targets: ReadonlyMap<string, Set<string>>,
): Set<string> {
  const tokens = words(text);
  const matches = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    const hash = sha256(tokens.slice(index, index + size).join(" "));
    if (targets.has(hash)) matches.add(hash);
  }
  return matches;
}

function insideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function repositoryFiles(): {
  files: string[];
  skippedSymlinks: number;
  skippedUnreadableDirectories: number;
} {
  const files: string[] = [];
  const excludedRoots = EXCLUDED_RELATIVE_ROOTS.map((entry) => path.join(repoRoot, entry));
  const excludedDerivedFiles = new Set<string>(
    AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS.map((entry) => entry.relativePath),
  );
  let skippedSymlinks = 0;
  let skippedUnreadableDirectories = 0;
  const walk = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      skippedUnreadableDirectories += 1;
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
        if (excludedRoots.some((root) => insideOrEqual(absolute, root))) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const relativePath = path.relative(repoRoot, absolute).replaceAll("\\", "/");
      if (excludedDerivedFiles.has(relativePath)) continue;
      files.push(relativePath);
    }
  };
  walk(repoRoot);
  return { files, skippedSymlinks, skippedUnreadableDirectories };
}

export function buildRepoOverlapCapture() {
  const sourceBytes = readFileSync(sourcePrivate);
  const corpus = JSON.parse(sourceBytes.toString("utf8")) as {
    rows: Array<{ publicId: string; passageText: string }>;
  };
  assert.equal(corpus.rows.length, 12);
  const targetHashes = new Map<string, Set<string>>();
  for (const row of corpus.rows) {
    for (const hash of ngramHashes(row.passageText, 8)) {
      const rows = targetHashes.get(hash) ?? new Set<string>();
      rows.add(row.publicId);
      targetHashes.set(hash, rows);
    }
  }

  const inventory: Array<{ path: string; bytes: number; sha256: string }> = [];
  const hits: Array<{ filePath: string; rowPublicIds: string[]; sharedHashCount: number }> = [];
  let skippedOversize = 0;
  let skippedUnreadableFiles = 0;
  let scannedUtf8Bytes = 0;
  const repository = repositoryFiles();
  for (const relativePath of repository.files) {
    const absolutePath = path.join(repoRoot, relativePath);
    let stat;
    try {
      stat = statSync(absolutePath);
    } catch {
      skippedUnreadableFiles += 1;
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) {
      skippedOversize += 1;
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolutePath);
    } catch {
      skippedUnreadableFiles += 1;
      continue;
    }
    const text = bytes.toString("utf8");
    scannedUtf8Bytes += bytes.length;
    inventory.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
    const rowIds = new Set<string>();
    let sharedHashCount = 0;
    for (const hash of matchingNgramHashes(text, 8, targetHashes)) {
      const sourceRows = targetHashes.get(hash);
      if (!sourceRows) continue;
      sharedHashCount += 1;
      for (const rowId of sourceRows) rowIds.add(rowId);
    }
    if (sharedHashCount > 0) {
      hits.push({
        filePath: relativePath,
        rowPublicIds: [...rowIds].sort(),
        sharedHashCount,
      });
    }
  }
  const inventoryCommitmentSha256 = sha256(stableJson(inventory));
  return {
    schemaVersion: "question-quality-s1-v6-independent-repo-overlap-capture-v1",
    status: hits.length === 0 ? "PASS_ZERO_REPOSITORY_EIGHT_TOKEN_HITS" : "FAIL_OVERLAP_HITS",
    sourcePrivateArtifactSha256: sha256(sourceBytes),
    method: {
      inventory: "recursive repository filesystem walk over declared text extensions",
      normalization: "lowercase ASCII word tokens; punctuation and whitespace removed",
      ngramSize: 8,
      exactNgramTextPersisted: false,
      targetNgramHashesPersisted: false,
      excludedRelativeRoots: EXCLUDED_RELATIVE_ROOTS,
      authorizedDerivedExactFileExclusions: AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS,
      excludedDirectoryNames: [...EXCLUDED_DIRECTORY_NAMES].sort(),
      includedExtensions: [...TEXT_EXTENSIONS].sort(),
      maxFileBytes: MAX_FILE_BYTES,
    },
    counts: {
      sourceRows: corpus.rows.length,
      distinctTargetNgramHashes: targetHashes.size,
      scannedTextFiles: inventory.length,
      scannedUtf8Bytes,
      skippedOversizeFiles: skippedOversize,
      skippedUnreadableFiles,
      skippedUnreadableDirectories: repository.skippedUnreadableDirectories,
      skippedSymlinks: repository.skippedSymlinks,
      hitFileRowPairs: hits.reduce((sum, hit) => sum + hit.rowPublicIds.length, 0),
      hitFiles: hits.length,
    },
    inventoryCommitmentSha256,
    hits,
  };
}

async function main(): Promise<void> {
  const capture = buildRepoOverlapCapture();
  const bytes = `${JSON.stringify(capture, null, 2)}\n`;
  if (process.argv.includes("--write")) writeFileSync(outputPath, bytes, "utf8");
  process.stdout.write(`${JSON.stringify({
    status: capture.status,
    scannedTextFiles: capture.counts.scannedTextFiles,
    scannedUtf8Bytes: capture.counts.scannedUtf8Bytes,
    hitFiles: capture.counts.hitFiles,
    hitFileRowPairs: capture.counts.hitFileRowPairs,
    inventoryCommitmentSha256: capture.inventoryCommitmentSha256,
    artifactSha256: sha256(bytes),
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
