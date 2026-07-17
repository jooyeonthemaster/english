import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
export const sourceDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-s1-v6",
);

export const paths = {
  sourcePrivate: path.join(sourceDir, "private/original-passages.private.json"),
  sourcePublic: path.join(sourceDir, "corpus-public.json"),
  sourceManifest: path.join(sourceDir, "MANIFEST.sha256"),
  manualFindings: path.join(here, "private/row-findings.private.json"),
  overlapCapture: path.join(here, "private/local-overlap-scan.private.json"),
  publicAudit: path.join(here, "audit-public.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

const sourceExternalBuildInputs = [
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json",
  ),
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
  ),
] as const;

export const MANIFEST_PATHS = [
  "README.md",
  "capture-overlap.mts",
  "core.mts",
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "audit-public.json",
  "private/.gitignore",
  "private/row-findings.private.json",
  "private/local-overlap-scan.private.json",
] as const;

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".jsonl",
  ".md",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".csv",
  ".tsv",
  ".html",
  ".yml",
  ".yaml",
  ".sql",
  ".py",
]);

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  ".cache",
]);

interface CorpusRow {
  publicId: string;
  questionType: "GRAMMAR_ERROR" | "BLANK_INFERENCE";
  passageText: string;
  descriptors: Record<string, string>;
  suitability: Record<string, unknown>;
  rightsProvenance: Record<string, unknown>;
}

interface PrivateCorpus {
  schemaVersion: string;
  artifactId: string;
  campaignScopeId: string;
  authoringRecord: Record<string, unknown>;
  externalModelProcessingScope: Record<string, unknown>;
  rows: CorpusRow[];
}

interface ManualIssue {
  severity: string;
  category: string;
  sentenceNumber: number;
  exactExcerpt: string;
  explanation: string;
  requiredAction: string;
}

interface ManualRow {
  publicId: string;
  sourcePassageSha256: string;
  sentencesReviewed: number;
  disposition: string;
  judgments: Record<string, string>;
  issues: ManualIssue[];
  typeSpecific: Record<string, unknown>;
}

interface ManualFindings {
  schemaVersion: string;
  reviewedAtKst: string;
  sourcePrivateArtifactSha256: string;
  reviewIndependence: Record<string, unknown>;
  corpusLevelFindings: Array<Record<string, unknown>>;
  rows: ManualRow[];
}

export interface OverlapHit {
  publicId: string;
  relativePath: string;
  matchingWindowCount: number;
  matchingWindows: string[];
}

export interface OverlapCapture {
  schemaVersion: string;
  capturedAtKst: string;
  sourcePrivateArtifactSha256: string;
  normalization: string;
  ngramSize: number;
  scanRoot: string;
  excludedRoots: string[];
  excludedDirectoryNames: string[];
  includedExtensions: string[];
  scannedFileCount: number;
  scannedUtf8ByteCount: number;
  skippedOversizeFileCount: number;
  skippedUnreadableFileCount: number;
  skippedSymlinkCount: number;
  scannedInventoryCommitmentSha256: string;
  hitFileRowPairCount: number;
  hits: OverlapHit[];
  apiCalls: number;
  networkCalls: number;
  modelCalls: number;
  databaseCalls: number;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?](?=\s|$)/g) ?? []).map((entry) => entry.trim());
}

function ngrams(text: string, size: number): Set<string> {
  const tokens = words(text);
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function relativeRepoPath(value: string): string {
  return path.relative(repoRoot, value).replaceAll("\\", "/");
}

function insideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function readCorpus(): PrivateCorpus {
  return JSON.parse(readFileSync(paths.sourcePrivate, "utf8")) as PrivateCorpus;
}

function readManualFindings(): ManualFindings {
  return JSON.parse(readFileSync(paths.manualFindings, "utf8")) as ManualFindings;
}

function assertSourceManifest(): { entryCount: number; manifestSha256: string } {
  const manifestBytes = readFileSync(paths.sourceManifest, "utf8");
  const lines = manifestBytes.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 8, "unexpected source manifest entry count");
  const seen = new Set<string>();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, `invalid source manifest line: ${line}`);
    const [, expected, relativePath] = match;
    assert(!seen.has(relativePath), `duplicate source manifest path: ${relativePath}`);
    seen.add(relativePath);
    const absolute = path.join(sourceDir, relativePath);
    assert(existsSync(absolute), `missing source manifest member: ${relativePath}`);
    assert.equal(sha256(readFileSync(absolute)), expected, `source manifest drift: ${relativePath}`);
  }
  return { entryCount: lines.length, manifestSha256: sha256(manifestBytes) };
}

function assertPiiClear(text: string, rowId: string): void {
  const patterns: Array<[string, RegExp]> = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["url", /\b(?:https?:\/\/|www\.)\S+/i],
    ["handle", /(^|\s)@[a-z0-9_]+/i],
    ["ipv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    ["phone", /(?:\+?\d[\d(). -]{7,}\d)/],
    ["long-number", /\b\d{6,}\b/],
    ["korean-resident-id", /\b\d{6}-[1-4]\d{6}\b/],
    ["credit-card-like", /\b(?:\d[ -]*?){13,19}\b/],
  ];
  for (const [label, pattern] of patterns) {
    assert(!pattern.test(text), `${rowId}: independent PII hit (${label})`);
  }
}

function assertSourcePublicLeakClear(corpus: PrivateCorpus): void {
  const publicFiles = [
    "README.md",
    "build.mts",
    "core.mts",
    "verify.mts",
    "tsconfig.json",
    "corpus-public.json",
    "MANIFEST.sha256",
  ];
  const surface = publicFiles
    .map((relativePath) => readFileSync(path.join(sourceDir, relativePath), "utf8"))
    .join("\n")
    .toLowerCase();
  for (const row of corpus.rows) {
    assert(!surface.includes(row.passageText.toLowerCase()), `${row.publicId}: exact public leak`);
    const tokens = words(row.passageText);
    for (let index = 0; index + 12 <= tokens.length; index += 1) {
      const window = tokens.slice(index, index + 12).join(" ");
      assert(!surface.includes(window), `${row.publicId}: 12-token source public leak`);
    }
  }
}

function gitPrivateState(): { ignored: boolean; tracked: boolean } {
  const relative = relativeRepoPath(paths.sourcePrivate);
  const ignored = spawnSync("git", ["check-ignore", "--quiet", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { ignored: ignored.status === 0, tracked: tracked.status === 0 };
}

function targetWindowMap(rows: CorpusRow[], size: number): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const gram of ngrams(row.passageText, size)) {
      const ids = targets.get(gram) ?? new Set<string>();
      ids.add(row.publicId);
      targets.set(gram, ids);
    }
  }
  return targets;
}

export function scanRepositoryForOverlap(capturedAtKst: string): OverlapCapture {
  const corpus = readCorpus();
  const sourcePrivateSha256 = sha256(readFileSync(paths.sourcePrivate));
  const ngramSize = 8;
  const targets = targetWindowMap(corpus.rows, ngramSize);
  const hits: OverlapHit[] = [];
  let scannedFileCount = 0;
  let scannedUtf8ByteCount = 0;
  let skippedOversizeFileCount = 0;
  let skippedUnreadableFileCount = 0;
  let skippedSymlinkCount = 0;
  const inventory = createHash("sha256");

  const excludedRoots = [sourceDir, here];
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinkCount += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
        if (excludedRoots.some((root) => insideOrEqual(absolute, root))) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      let stats;
      try {
        stats = statSync(absolute);
      } catch {
        skippedUnreadableFileCount += 1;
        continue;
      }
      if (stats.size > 20_000_000) {
        skippedOversizeFileCount += 1;
        continue;
      }
      let bytes: Buffer;
      try {
        bytes = readFileSync(absolute);
      } catch {
        skippedUnreadableFileCount += 1;
        continue;
      }

      const relativePath = relativeRepoPath(absolute);
      scannedFileCount += 1;
      scannedUtf8ByteCount += bytes.byteLength;
      inventory.update(`${relativePath}\0${bytes.byteLength}\0${sha256(bytes)}\n`);

      const fileCounts = new Map<string, { count: number; windows: Set<string> }>();
      const fileTokens = words(bytes.toString("utf8"));
      for (let index = 0; index + ngramSize <= fileTokens.length; index += 1) {
        const gram = fileTokens.slice(index, index + ngramSize).join(" ");
        const ids = targets.get(gram);
        if (!ids) continue;
        for (const id of ids) {
          const current = fileCounts.get(id) ?? { count: 0, windows: new Set<string>() };
          current.count += 1;
          current.windows.add(gram);
          fileCounts.set(id, current);
        }
      }
      for (const [publicId, evidence] of [...fileCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        hits.push({
          publicId,
          relativePath,
          matchingWindowCount: evidence.count,
          matchingWindows: [...evidence.windows].sort(),
        });
      }
    }
  };
  walk(repoRoot);

  return {
    schemaVersion: "campaign-v6-independent-local-overlap-scan-v1",
    capturedAtKst,
    sourcePrivateArtifactSha256: sourcePrivateSha256,
    normalization: "lowercase ASCII word tokens; punctuation and whitespace removed",
    ngramSize,
    scanRoot: "REPOSITORY_ROOT",
    excludedRoots: [relativeRepoPath(sourceDir), relativeRepoPath(here)],
    excludedDirectoryNames: [...EXCLUDED_DIRECTORY_NAMES].sort(),
    includedExtensions: [...TEXT_EXTENSIONS].sort(),
    scannedFileCount,
    scannedUtf8ByteCount,
    skippedOversizeFileCount,
    skippedUnreadableFileCount,
    skippedSymlinkCount,
    scannedInventoryCommitmentSha256: inventory.digest("hex"),
    hitFileRowPairCount: hits.length,
    hits,
    apiCalls: 0,
    networkCalls: 0,
    modelCalls: 0,
    databaseCalls: 0,
  };
}

function crossRowOverlap(rows: CorpusRow[]): {
  comparedPairs: number;
  pairsWithFiveGramOverlap: number;
  sharedFiveGramCount: number;
} {
  const sets = rows.map((row) => ngrams(row.passageText, 5));
  let pairsWithFiveGramOverlap = 0;
  let sharedFiveGramCount = 0;
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      let shared = 0;
      for (const gram of sets[left]) if (sets[right].has(gram)) shared += 1;
      if (shared > 0) pairsWithFiveGramOverlap += 1;
      sharedFiveGramCount += shared;
    }
  }
  return {
    comparedPairs: (sets.length * (sets.length - 1)) / 2,
    pairsWithFiveGramOverlap,
    sharedFiveGramCount,
  };
}

function issueIds(rows: ManualRow[], predicate: (issue: ManualIssue) => boolean): string[] {
  return rows
    .filter((row) => row.issues.some(predicate))
    .map((row) => row.publicId)
    .sort();
}

export function buildPublicAudit(): Record<string, unknown> {
  const corpusBytes = readFileSync(paths.sourcePrivate);
  const sourcePublicBytes = readFileSync(paths.sourcePublic);
  const corpus = readCorpus();
  const manual = readManualFindings();
  const overlap = JSON.parse(readFileSync(paths.overlapCapture, "utf8")) as OverlapCapture;
  const sourceManifest = assertSourceManifest();
  const externalBuildInputs = sourceExternalBuildInputs.map((absolute) => {
    assert(existsSync(absolute), `missing source external build input: ${absolute}`);
    const bytes = readFileSync(absolute);
    return {
      relativePath: relativeRepoPath(absolute),
      utf8Bytes: bytes.byteLength,
      sha256: sha256(bytes),
      includedInSourceManifest: false,
    };
  });
  const sourceCore = readFileSync(path.join(sourceDir, "core.mts"), "utf8");
  for (const dependency of externalBuildInputs) {
    assert(
      sourceCore.includes(path.basename(dependency.relativePath)),
      `source core does not name external input: ${dependency.relativePath}`,
    );
  }

  assert.equal(corpus.schemaVersion, "question-quality-original-s1-v6-private-v1");
  assert.equal(corpus.rows.length, 12);
  assert.equal(new Set(corpus.rows.map((row) => row.publicId)).size, 12);
  assert.equal(corpus.rows.filter((row) => row.questionType === "GRAMMAR_ERROR").length, 6);
  assert.equal(corpus.rows.filter((row) => row.questionType === "BLANK_INFERENCE").length, 6);
  assert.equal(corpus.authoringRecord.webSearchUsed, false);
  assert.equal(corpus.authoringRecord.externalApiUsed, false);
  assert.equal(corpus.authoringRecord.externalModelCallUsed, false);
  assert.equal(
    corpus.externalModelProcessingScope.status,
    "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
  );

  assert.equal(manual.schemaVersion, "campaign-v6-original-corpus-independent-row-review-v1");
  assert.equal(manual.sourcePrivateArtifactSha256, sha256(corpusBytes));
  assert.equal(manual.rows.length, 12);
  assert.equal(new Set(manual.rows.map((row) => row.publicId)).size, 12);
  assert.equal(manual.corpusLevelFindings.length, 1);

  const manualById = new Map(manual.rows.map((row) => [row.publicId, row]));
  let totalWords = 0;
  let totalSentences = 0;
  for (const row of corpus.rows) {
    assertPiiClear(row.passageText, row.publicId);
    const manualRow = manualById.get(row.publicId);
    assert(manualRow, `${row.publicId}: missing manual review`);
    assert.equal(manualRow.sourcePassageSha256, sha256(row.passageText));
    const rowSentences = sentences(row.passageText);
    assert.equal(manualRow.sentencesReviewed, rowSentences.length);
    totalWords += words(row.passageText).length;
    totalSentences += rowSentences.length;

    assert.equal(row.rightsProvenance.rowPublicId, row.publicId);
    assert.equal(row.rightsProvenance.campaignScopeId, corpus.campaignScopeId);
    assert.equal(row.rightsProvenance.origin, "NEW_ORIGINAL_COMPOSITION_FOR_THIS_USER_REQUEST");
    assert.equal(row.rightsProvenance.copiedOrAdapted, false);
    assert.equal(row.rightsProvenance.sourceCitation, null);
    assert.equal(row.rightsProvenance.thirdPartyPermissionClaimed, false);
    assert.equal(row.rightsProvenance.piiManuallyObserved, false);
    assert.equal(
      row.rightsProvenance.processingScopeStatus,
      "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
    );

    if (row.questionType === "GRAMMAR_ERROR") {
      assert(Array.isArray(row.suitability.grammarAffordances));
      assert((manualRow.typeSpecific.verifiedLegalMechanismFamilies as number) >= 5);
    } else {
      const answer = row.suitability.recommendedBlankUnit;
      assert(typeof answer === "string" && answer.length > 0);
      assert.equal(row.passageText.split(answer).length - 1, 1, `${row.publicId}: answer occurrence`);
      assert(rowSentences.includes(answer), `${row.publicId}: answer must be a complete exact sentence`);
      assert.equal(manualRow.typeSpecific.answerUnitExactAndUniqueInSource, true);
      assert.equal(manualRow.typeSpecific.inferentialHinge, "PASS");
    }
  }
  assert.equal(totalSentences, 127);
  assert.equal(totalWords, 2188);
  assertSourcePublicLeakClear(corpus);

  const gitState = gitPrivateState();
  assert.equal(gitState.ignored, true);
  assert.equal(gitState.tracked, false);
  const crossOverlap = crossRowOverlap(corpus.rows);
  assert.equal(crossOverlap.sharedFiveGramCount, 0);

  assert.equal(overlap.schemaVersion, "campaign-v6-independent-local-overlap-scan-v1");
  assert.equal(overlap.sourcePrivateArtifactSha256, sha256(corpusBytes));
  assert.equal(overlap.ngramSize, 8);
  assert.equal(overlap.hitFileRowPairCount, 0);
  assert.deepEqual(overlap.hits, []);
  assert.equal(overlap.skippedOversizeFileCount, 0);
  assert.equal(overlap.skippedUnreadableFileCount, 0);
  assert.equal(overlap.apiCalls, 0);
  assert.equal(overlap.networkCalls, 0);
  assert.equal(overlap.modelCalls, 0);
  assert.equal(overlap.databaseCalls, 0);

  const sourceRevisionRows = manual.rows
    .filter((row) => row.disposition.startsWith("REVISE_SOURCE"))
    .map((row) => row.publicId)
    .sort();
  const metadataCorrectionRows = issueIds(manual.rows, (issue) => issue.severity === "METADATA");
  const explicitDifficultyRoutingRows = issueIds(
    manual.rows,
    (issue) => issue.severity === "ROUTING" || issue.severity === "MAJOR_FOR_KILLER_BLANK",
  );
  const cleanSourceRows = manual.rows
    .filter((row) => !row.disposition.startsWith("REVISE_SOURCE"))
    .map((row) => row.publicId)
    .sort();
  const issueSeverityCounts: Record<string, number> = {};
  for (const row of manual.rows) {
    for (const issue of row.issues) {
      issueSeverityCounts[issue.severity] = (issueSeverityCounts[issue.severity] ?? 0) + 1;
    }
  }

  assert.deepEqual(sourceRevisionRows, ["OS1V6-B05", "OS1V6-B06", "OS1V6-G02", "OS1V6-G03"]);
  assert.deepEqual(metadataCorrectionRows, ["OS1V6-G03", "OS1V6-G04", "OS1V6-G05"]);
  assert.deepEqual(explicitDifficultyRoutingRows, ["OS1V6-B02", "OS1V6-B05"]);

  const blankPositions = corpus.rows
    .filter((row) => row.questionType === "BLANK_INFERENCE")
    .map((row) => {
      const rowSentences = sentences(row.passageText);
      const answer = row.suitability.recommendedBlankUnit as string;
      const oneBasedIndex = rowSentences.indexOf(answer) + 1;
      assert(oneBasedIndex > 0, `${row.publicId}: blank position not found`);
      const bucket =
        oneBasedIndex === rowSentences.length
          ? "TERMINAL"
          : oneBasedIndex / rowSentences.length >= 2 / 3
            ? "LATE_NONTERMINAL"
            : "MIDDLE";
      return {
        publicId: row.publicId,
        sentenceIndex: oneBasedIndex,
        sentenceCount: rowSentences.length,
        bucket,
        finalOrPenultimate: oneBasedIndex >= rowSentences.length - 1,
        sourceRevisionRequired: sourceRevisionRows.includes(row.publicId),
      };
    });
  const blankPositionCounts = {
    terminal: blankPositions.filter((row) => row.bucket === "TERMINAL").length,
    lateNonterminal: blankPositions.filter((row) => row.bucket === "LATE_NONTERMINAL").length,
    middle: blankPositions.filter((row) => row.bucket === "MIDDLE").length,
    finalOrPenultimate: blankPositions.filter((row) => row.finalOrPenultimate).length,
    cleanUnrestrictedInternal: blankPositions.filter(
      (row) => row.bucket === "MIDDLE" && !row.sourceRevisionRequired,
    ).length,
  };
  assert.deepEqual(blankPositionCounts, {
    terminal: 4,
    lateNonterminal: 1,
    middle: 1,
    finalOrPenultimate: 5,
    cleanUnrestrictedInternal: 0,
  });

  return {
    schemaVersion: "campaign-v6-original-corpus-independent-audit-public-v1",
    verdict:
      "BLOCK_UNCONDITIONAL_S1_V6_ADMISSION_PENDING_TEXT_METADATA_DIFFICULTY_AND_BLANK_POSITION_REMEDIATION",
    auditedAtKst: manual.reviewedAtKst,
    scope: {
      sourceArtifact: "experiments/question-quality-20260715/corpus/original-s1-v6",
      exactPrivateRowsRead: true,
      sentenceBySentenceReview: true,
      candidateApiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    sourceBindings: {
      privateArtifactSha256: sha256(corpusBytes),
      publicArtifactSha256: sha256(sourcePublicBytes),
      manifestSha256: sourceManifest.manifestSha256,
      manifestEntryCount: sourceManifest.entryCount,
      sourceManifestAllEntriesRecomputed: true,
      sourceBuildHermetic: false,
      externalPrivateBuildInputCount: externalBuildInputs.length,
      externalPrivateBuildInputs: externalBuildInputs,
      hermeticityNote:
        "The source builder reads two ignored private artifacts outside its eight-entry manifest. Derived normalized text-set commitments are public, but a clean checkout without those files cannot reproduce the build.",
    },
    independentMechanicalFindings: {
      rowCount: corpus.rows.length,
      grammarRowCount: 6,
      blankRowCount: 6,
      wordCount: totalWords,
      sentenceCountReviewed: totalSentences,
      uniqueTopicFamilyCount: new Set(corpus.rows.map((row) => row.descriptors.topicFamily)).size,
      machinePiiPatternHits: 0,
      rightsProvenanceRowsStructurallyConsistent: 12,
      scopedProcessingRecordConsistentWithCampaignRequest: true,
      privateExactTextGitIgnored: gitState.ignored,
      privateExactTextGitTracked: gitState.tracked,
      sourcePublicTwelveTokenLeakWindows: 0,
      crossRow: crossOverlap,
      repositoryOverlapCapture: {
        capturedAtKst: overlap.capturedAtKst,
        ngramSize: overlap.ngramSize,
        scannedFileCount: overlap.scannedFileCount,
        scannedUtf8ByteCount: overlap.scannedUtf8ByteCount,
        skippedOversizeFileCount: overlap.skippedOversizeFileCount,
        skippedUnreadableFileCount: overlap.skippedUnreadableFileCount,
        skippedSymlinkCount: overlap.skippedSymlinkCount,
        inventoryCommitmentSha256: overlap.scannedInventoryCommitmentSha256,
        hitFileRowPairCount: overlap.hitFileRowPairCount,
      },
    },
    manualAdversarialFindings: {
      reviewedRowCount: manual.rows.length,
      reviewedSentenceCount: totalSentences,
      preExistingUngrammaticalRows: 0,
      contentContradictionRows: 0,
      sourceRevisionRequiredCount: sourceRevisionRows.length,
      sourceRevisionRequiredRowIds: sourceRevisionRows,
      cleanSourceRowCount: cleanSourceRows.length,
      cleanSourceRowIds: cleanSourceRows,
      metadataCorrectionRequiredCount: metadataCorrectionRows.length,
      metadataCorrectionRequiredRowIds: metadataCorrectionRows,
      explicitDifficultyRoutingRequiredCount: explicitDifficultyRoutingRows.length,
      explicitDifficultyRoutingRequiredRowIds: explicitDifficultyRoutingRows,
      issueSeverityCounts: Object.fromEntries(
        Object.entries(issueSeverityCounts).sort(([left], [right]) => left.localeCompare(right)),
      ),
      grammarAffordanceConclusion:
        "All six grammar passages contain at least five independently viable mechanism families, but three published affordance labels need correction.",
      blankConclusion:
        "All six hinges and answer units are semantically valid and natural; B05 is not killer-safe at the recommended location because a later thesis restatement discloses the answer, and B02 needs explicit difficulty routing or a close-paraphrase option gate.",
      blankSitePositionAudit: {
        rows: blankPositions,
        counts: blankPositionCounts,
        finalOrPenultimateShare: blankPositionCounts.finalOrPenultimate / blankPositions.length,
        internalContrastOrCounterexampleHingeRows: 0,
        internalAnaphoricBridgeHingeRows: 0,
        externalValidityConclusion:
          "Five of six recommended units are final or penultimate, and the sole middle unit is blocked for answer restatement. The corpus cannot support a general claim about internal blank-site performance.",
      },
    },
    rightsAndPrivacyConclusion: {
      result: "SCOPED_RECORD_AND_LOCAL_EVIDENCE_PASS_NOT_GLOBAL_OWNERSHIP_PROOF",
      selectedRowsWithRowBoundOriginScopeAndPiiRecords: 12,
      localRepositoryEightTokenOverlapHits: 0,
      globalOriginalityProven: false,
      legalOwnershipProven: false,
      externalDispatchAuthorizedByThisAudit: false,
    },
    requiredRemediation: [
      "Edit and reseal G02, G03, B05, and B06 under the strict clean-source standard.",
      "Correct the G03, G04, and G05 grammar-affordance labels so metadata names the structures actually present.",
      "Redesign B05's recommended blank context so later prose does not restate the answer; route B02 to intermediate by default or require a killer-specific close-paraphrase option gate.",
      "Replace or supplement terminal-thesis rows with clean internal hinge, internal contrast/counterexample, and anaphoric-bridge slots; freeze blank position as an experimental stratification variable.",
      "Rerun this exact-text audit after changes; all source and audit hashes must change together.",
      "Keep generationAuthorized=false until the separate provider privacy, route, credential, price, spend, physical-call, and controller gates pass.",
      "Make the source overlap build hermetic or explicitly package a sealed reproducibility input; the current builder depends on two ignored external private files.",
    ],
    evidentiaryLimits: [
      "The composition and no-external-source statements are authoring records; this audit independently establishes only internal consistency and local repository non-overlap at the stated threshold.",
      "Local eight-token non-overlap cannot prove global originality, copyright ownership, or non-infringement.",
      "Pattern scans and human observation reduce PII risk but cannot prove absence of every possible identifier.",
      "Naturalness and difficulty judgments are human adjudications bound to the ignored private row findings, not machine proofs.",
      "The 5/6 final-or-penultimate site concentration is a measured corpus property; its consequence for external validity is an adjudicative inference.",
      "This audit does not authorize external dispatch or production use.",
      "The source package's non-hermetic overlap inputs limit clean-checkout reproducibility even though the relevant derived selected-text sets are publicly committed.",
    ],
  };
}

export function publicAuditBytes(): string {
  return `${JSON.stringify(buildPublicAudit(), null, 2)}\n`;
}

export function manifestBytes(publicBytes: string): string {
  return `${MANIFEST_PATHS.map((relativePath) => {
    const bytes =
      relativePath === "audit-public.json"
        ? Buffer.from(publicBytes, "utf8")
        : readFileSync(path.join(here, relativePath));
    return `${sha256(bytes)}  ${relativePath}`;
  }).join("\n")}\n`;
}
