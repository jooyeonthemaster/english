import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
export const sourceDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-s1-v6",
);
const priorAuditDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1",
);

export const paths = {
  sourcePrivate: path.join(sourceDir, "private/original-passages.private.json"),
  sourceReferenceFixture: path.join(
    sourceDir,
    "private/local-reference-ngram-commitments.private.json",
  ),
  sourcePublic: path.join(sourceDir, "corpus-public.json"),
  sourceManifest: path.join(sourceDir, "MANIFEST.sha256"),
  priorAuditPublic: path.join(priorAuditDir, "audit-public.json"),
  priorAuditManifest: path.join(priorAuditDir, "MANIFEST.sha256"),
  rationale: path.join(here, "private/row-remediation.private.json"),
  overlapCapture: path.join(here, "private/local-overlap-scan.private.json"),
  publicArtifact: path.join(here, "remediation-public.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const MANIFEST_PATHS = [
  "README.md",
  "capture-overlap.mts",
  "core.mts",
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "remediation-public.json",
  "private/.gitignore",
  "private/row-remediation.private.json",
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

interface SourceRow {
  publicId: string;
  questionType: "GRAMMAR_ERROR" | "BLANK_INFERENCE";
  passageText: string;
  descriptors: Record<string, string>;
  suitability: Record<string, unknown>;
  rightsProvenance: Record<string, unknown>;
}

interface SourceCorpus {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  supersedesPrivateArtifactSha256: string;
  campaignScopeId: string;
  authoringRecord: Record<string, unknown>;
  remediationRecord: Record<string, unknown>;
  externalModelProcessingScope: Record<string, unknown>;
  rows: SourceRow[];
}

interface SourcePublicRow {
  publicId: string;
  passageSha256: string;
  fullPrivateRowCommitmentSha256: string;
  rightsProvenanceCommitmentSha256: string;
}

interface SourcePublic {
  schemaVersion: string;
  revisionId: string;
  aggregate: Record<string, unknown>;
  rows: SourcePublicRow[];
  admission: { generationAuthorized: boolean };
}

interface RationaleRow {
  publicId: string;
  beforePassageSha256: string;
  afterPassageSha256: string;
  beforeFullPrivateRowCommitmentSha256: string;
  afterFullPrivateRowCommitmentSha256: string;
  rightsProvenanceCommitmentSha256: string;
  passageChanged: boolean;
  changes: Array<Record<string, unknown>>;
  adjudication: string;
}

interface Rationale {
  schemaVersion: string;
  remediatedAtKst: string;
  priorAuditPublicArtifactSha256: string;
  priorPrivateArtifactSha256: string;
  remediatedPrivateArtifactSha256: string;
  execution: Record<string, unknown>;
  rows: RationaleRow[];
  corpusAdjudication: Record<string, unknown>;
}

interface OverlapHit {
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

function stableStringify(value: unknown): string {
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

function readSource(): SourceCorpus {
  return JSON.parse(readFileSync(paths.sourcePrivate, "utf8")) as SourceCorpus;
}

function readSourcePublic(): SourcePublic {
  return JSON.parse(readFileSync(paths.sourcePublic, "utf8")) as SourcePublic;
}

function readRationale(): Rationale {
  return JSON.parse(readFileSync(paths.rationale, "utf8")) as Rationale;
}

function manifestIntegrity(
  manifestPath: string,
  root: string,
  expectedEntryCount: number,
): { sha256: string; entryCount: number } {
  const bytes = readFileSync(manifestPath);
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/);
  assert.equal(lines.length, expectedEntryCount);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    const [, expected, relativePath] = match;
    const absolute = path.join(root, relativePath);
    assert(existsSync(absolute), `missing manifest member: ${relativePath}`);
    assert.equal(sha256(readFileSync(absolute)), expected, `manifest drift: ${relativePath}`);
  }
  return { sha256: sha256(bytes), entryCount: lines.length };
}

function targetWindowMap(rows: SourceRow[], size: number): Map<string, Set<string>> {
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
  const source = readSource();
  const sourcePrivateArtifactSha256 = sha256(readFileSync(paths.sourcePrivate));
  const ngramSize = 8;
  const targets = targetWindowMap(source.rows, ngramSize);
  const excludedRoots = [sourceDir, here, priorAuditDir];
  const hits: OverlapHit[] = [];
  const inventory = createHash("sha256");
  let scannedFileCount = 0;
  let scannedUtf8ByteCount = 0;
  let skippedOversizeFileCount = 0;
  let skippedUnreadableFileCount = 0;
  let skippedSymlinkCount = 0;

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
      const tokens = words(bytes.toString("utf8"));
      for (let index = 0; index + ngramSize <= tokens.length; index += 1) {
        const gram = tokens.slice(index, index + ngramSize).join(" ");
        const ids = targets.get(gram);
        if (!ids) continue;
        for (const publicId of ids) {
          const value = fileCounts.get(publicId) ?? { count: 0, windows: new Set<string>() };
          value.count += 1;
          value.windows.add(gram);
          fileCounts.set(publicId, value);
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
    schemaVersion: "campaign-v6-remediation-local-overlap-scan-v1",
    capturedAtKst,
    sourcePrivateArtifactSha256,
    normalization: "lowercase ASCII word tokens; punctuation and whitespace removed",
    ngramSize,
    scanRoot: "REPOSITORY_ROOT",
    excludedRoots: excludedRoots.map(relativeRepoPath),
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

function privateGitState(absolute: string): { ignored: boolean; tracked: boolean } {
  const relative = relativeRepoPath(absolute);
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

function publicLeakCount(source: SourceCorpus): number {
  const surfaces = [
    path.join(sourceDir, "README.md"),
    path.join(sourceDir, "build.mts"),
    path.join(sourceDir, "core.mts"),
    path.join(sourceDir, "verify.mts"),
    path.join(sourceDir, "tsconfig.json"),
    paths.sourcePublic,
    paths.sourceManifest,
    path.join(here, "README.md"),
    path.join(here, "capture-overlap.mts"),
    path.join(here, "core.mts"),
    path.join(here, "build.mts"),
    path.join(here, "verify.mts"),
    path.join(here, "tsconfig.json"),
  ];
  if (existsSync(paths.publicArtifact)) surfaces.push(paths.publicArtifact);
  if (existsSync(paths.manifest)) surfaces.push(paths.manifest);
  const publicText = surfaces.map((file) => readFileSync(file, "utf8")).join("\n").toLowerCase();
  let hits = 0;
  for (const row of source.rows) {
    const tokens = words(row.passageText);
    for (let index = 0; index + 12 <= tokens.length; index += 1) {
      if (publicText.includes(tokens.slice(index, index + 12).join(" "))) hits += 1;
    }
  }
  return hits;
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

const CONTENT_STOP_WORDS = new Set(
  "a an the and or but nor so yet to of in on at by for from with as is are was were be been being it its this that these those what which who whom whose when where how not only may can could should would will do does did has have had into than through after before while even every each no one they them their we you he she his her".split(
    " ",
  ),
);

function maximumPostBlankJaccard(row: SourceRow): number {
  const answer = row.suitability.recommendedBlankUnit as string;
  const rowSentences = sentences(row.passageText);
  const index = rowSentences.indexOf(answer);
  assert(index >= 0);
  const target = new Set(words(answer).filter((token) => !CONTENT_STOP_WORDS.has(token)));
  return rowSentences.slice(index + 1).reduce((maximum, sentence) => {
    const candidate = new Set(words(sentence).filter((token) => !CONTENT_STOP_WORDS.has(token)));
    const union = new Set([...target, ...candidate]);
    let intersection = 0;
    for (const token of target) if (candidate.has(token)) intersection += 1;
    return Math.max(maximum, union.size === 0 ? 0 : intersection / union.size);
  }, 0);
}

export function buildPublicArtifact(): Record<string, unknown> {
  const sourceBytes = readFileSync(paths.sourcePrivate);
  const source = readSource();
  const sourcePublic = readSourcePublic();
  const rationale = readRationale();
  const overlap = JSON.parse(readFileSync(paths.overlapCapture, "utf8")) as OverlapCapture;
  const sourceManifest = manifestIntegrity(paths.sourceManifest, sourceDir, 10);
  const priorAuditManifest = manifestIntegrity(paths.priorAuditManifest, priorAuditDir, 10);
  const priorAuditBytes = readFileSync(paths.priorAuditPublic);
  const priorAudit = JSON.parse(priorAuditBytes.toString("utf8")) as {
    verdict: string;
    sourceBindings: { privateArtifactSha256: string };
  };

  assert.equal(source.schemaVersion, "question-quality-original-s1-v6-private-v2");
  assert.equal(source.revisionId, "original-s1-v6-remediation-v1");
  assert.equal(source.supersedesPrivateArtifactSha256, rationale.priorPrivateArtifactSha256);
  assert.equal(sha256(sourceBytes), rationale.remediatedPrivateArtifactSha256);
  assert.equal(sourcePublic.schemaVersion, "question-quality-original-s1-v6-public-v2");
  assert.equal(sourcePublic.revisionId, source.revisionId);
  assert.equal(sourcePublic.admission.generationAuthorized, false);
  const sourceCoreText = readFileSync(path.join(sourceDir, "core.mts"), "utf8");
  const sourceBuildText = readFileSync(path.join(sourceDir, "build.mts"), "utf8");
  for (const normalSource of [sourceCoreText, sourceBuildText]) {
    assert(
      !/campaign-v5-s1\/private\/s1-queue-v5\.json|corpus\/v3\/private\/input-snapshot\.json/.test(
        normalSource,
      ),
      "normal source build names an external historical input",
    );
    assert(
      !/(?:from\s+["'][^"']*refresh-local-reference-fixture|import\s*\(\s*["'][^"']*refresh-local-reference-fixture|(?:spawnSync|execFileSync|execSync)\s*\([^)]*refresh-local-reference-fixture)/.test(
        normalSource,
      ),
      "normal source build imports or invokes the generation-only refresher",
    );
  }
  const sourceReferenceFixtureBytes = readFileSync(paths.sourceReferenceFixture);
  const sourceReferenceFixture = JSON.parse(sourceReferenceFixtureBytes.toString("utf8")) as {
    schemaVersion: string;
    containsExactReferencePassageText: boolean;
    containsExactReferenceNgramText: boolean;
    referenceSets: unknown[];
  };
  assert.equal(
    sourceReferenceFixture.schemaVersion,
    "question-quality-original-s1-v6-local-reference-fixture-v1",
  );
  assert.equal(sourceReferenceFixture.containsExactReferencePassageText, false);
  assert.equal(sourceReferenceFixture.containsExactReferenceNgramText, false);
  assert.equal(sourceReferenceFixture.referenceSets.length, 2);
  assert.equal(rationale.schemaVersion, "campaign-v6-original-corpus-remediation-private-v1");
  assert.equal(rationale.rows.length, 12);
  assert.equal(new Set(rationale.rows.map((row) => row.publicId)).size, 12);
  assert.equal(sha256(priorAuditBytes), rationale.priorAuditPublicArtifactSha256);
  assert.equal(priorAudit.sourceBindings.privateArtifactSha256, rationale.priorPrivateArtifactSha256);
  assert(priorAudit.verdict.startsWith("BLOCK_UNCONDITIONAL_S1_V6_ADMISSION"));

  for (const field of ["webCalls", "apiCalls", "modelCalls", "databaseCalls"]) {
    assert.equal(rationale.execution[field], 0);
  }
  assert.equal(rationale.execution.rightsAndProcessingScopePreserved, true);

  const sourceById = new Map(source.rows.map((row) => [row.publicId, row]));
  const sourcePublicById = new Map(sourcePublic.rows.map((row) => [row.publicId, row]));
  let grammarBindingCount = 0;
  const blankPositionCounts: Record<string, number> = {};
  const blankRoles: string[] = [];
  let maximumRestatementJaccard = 0;
  for (const rationaleRow of rationale.rows) {
    const row = sourceById.get(rationaleRow.publicId);
    const publicRow = sourcePublicById.get(rationaleRow.publicId);
    assert(row && publicRow, `${rationaleRow.publicId}: missing source row`);
    assert.equal(sha256(row.passageText), rationaleRow.afterPassageSha256);
    assert.equal(publicRow.passageSha256, rationaleRow.afterPassageSha256);
    assert.equal(
      publicRow.fullPrivateRowCommitmentSha256,
      rationaleRow.afterFullPrivateRowCommitmentSha256,
    );
    assert.equal(
      publicRow.fullPrivateRowCommitmentSha256,
      sha256(stableStringify(row)),
      `${row.publicId}: current full row commitment`,
    );
    assert.equal(
      publicRow.rightsProvenanceCommitmentSha256,
      rationaleRow.rightsProvenanceCommitmentSha256,
    );
    assert.equal(
      sha256(stableStringify(row.rightsProvenance)),
      rationaleRow.rightsProvenanceCommitmentSha256,
      `${row.publicId}: rights commitment drift`,
    );
    assert.equal(
      rationaleRow.passageChanged,
      rationaleRow.beforePassageSha256 !== rationaleRow.afterPassageSha256,
    );
    assert.equal(rationaleRow.adjudication, "PASS_AFTER_REMEDIATION");
    assert(rationaleRow.changes.length >= 1);
    assertPiiClear(row.passageText, row.publicId);

    assert.equal(row.rightsProvenance.origin, "NEW_ORIGINAL_COMPOSITION_FOR_THIS_USER_REQUEST");
    assert.equal(row.rightsProvenance.copiedOrAdapted, false);
    assert.equal(row.rightsProvenance.sourceCitation, null);
    assert.equal(row.rightsProvenance.thirdPartyPermissionClaimed, false);
    assert.equal(row.rightsProvenance.piiManuallyObserved, false);
    assert.equal(
      row.rightsProvenance.processingScopeStatus,
      "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
    );

    const rowSentences = sentences(row.passageText);
    if (row.questionType === "GRAMMAR_ERROR") {
      const affordances = row.suitability.grammarAffordances as string[];
      const bindings = row.suitability.grammarAffordanceBindings as Array<{
        mechanism: string;
        sentenceNumber: number;
        anchorExcerpt: string;
      }>;
      assert.equal(affordances.length, 5);
      assert.equal(bindings.length, 5);
      assert.deepEqual(
        [...affordances].sort(),
        bindings.map((binding) => binding.mechanism).sort(),
      );
      for (const binding of bindings) {
        assert(rowSentences[binding.sentenceNumber - 1].includes(binding.anchorExcerpt));
        assert.equal(row.passageText.split(binding.anchorExcerpt).length - 1, 1);
      }
      grammarBindingCount += bindings.length;
    } else {
      const design = row.suitability.recommendedBlankDesign as {
        sentenceIndex: number;
        sentenceCount: number;
        positionBucket: string;
        structuralRole: string;
        difficultyCoverage: string[];
      };
      const answer = row.suitability.recommendedBlankUnit as string;
      assert.equal(rowSentences.indexOf(answer) + 1, design.sentenceIndex);
      assert.equal(rowSentences.length, design.sentenceCount);
      assert.deepEqual([...design.difficultyCoverage].sort(), ["INTERMEDIATE", "KILLER"]);
      blankPositionCounts[design.positionBucket] =
        (blankPositionCounts[design.positionBucket] ?? 0) + 1;
      blankRoles.push(design.structuralRole);
      maximumRestatementJaccard = Math.max(maximumRestatementJaccard, maximumPostBlankJaccard(row));
    }
  }

  assert.equal(grammarBindingCount, 30);
  assert.deepEqual(blankPositionCounts, { INTERNAL: 5, TERMINAL: 1 });
  const internalContrastOrCounterexampleCount = blankRoles.filter((role) =>
    /(?:CONTRAST|COUNTEREXAMPLE)/.test(role),
  ).length;
  const internalAnaphoricOrCausalBridgeCount = blankRoles.filter((role) =>
    /(?:ANAPHORIC|CAUSAL)/.test(role),
  ).length;
  assert.equal(internalContrastOrCounterexampleCount, 3);
  assert.equal(internalAnaphoricOrCausalBridgeCount, 1);
  assert(maximumRestatementJaccard < 0.2);

  assert.equal(overlap.schemaVersion, "campaign-v6-remediation-local-overlap-scan-v1");
  assert.equal(overlap.sourcePrivateArtifactSha256, sha256(sourceBytes));
  assert.equal(overlap.hitFileRowPairCount, 0);
  assert.deepEqual(overlap.hits, []);
  assert.equal(overlap.skippedOversizeFileCount, 0);
  assert.equal(overlap.skippedUnreadableFileCount, 0);
  for (const field of ["apiCalls", "networkCalls", "modelCalls", "databaseCalls"] as const) {
    assert.equal(overlap[field], 0);
  }

  const sourcePrivateGit = privateGitState(paths.sourcePrivate);
  const sourceReferenceFixtureGit = privateGitState(paths.sourceReferenceFixture);
  const rationaleGit = privateGitState(paths.rationale);
  const overlapGit = privateGitState(paths.overlapCapture);
  assert.equal(sourcePrivateGit.ignored, true);
  assert.equal(sourcePrivateGit.tracked, false);
  assert.equal(sourceReferenceFixtureGit.ignored, true);
  assert.equal(sourceReferenceFixtureGit.tracked, false);
  assert.equal(rationaleGit.ignored, true);
  assert.equal(rationaleGit.tracked, false);
  assert.equal(overlapGit.ignored, true);
  assert.equal(overlapGit.tracked, false);
  assert.equal(publicLeakCount(source), 0);

  const passageChangedRows = rationale.rows
    .filter((row) => row.passageChanged)
    .map((row) => row.publicId)
    .sort();
  const fullRowChangedCount = rationale.rows.filter(
    (row) => row.beforeFullPrivateRowCommitmentSha256 !== row.afterFullPrivateRowCommitmentSha256,
  ).length;
  const wordingRemediationRows = ["OS1V6-B05", "OS1V6-B06", "OS1V6-G02", "OS1V6-G03"];
  const correctedGrammarMetadataRows = ["OS1V6-G03", "OS1V6-G04", "OS1V6-G05"];

  return {
    schemaVersion: "campaign-v6-original-corpus-remediation-public-v1",
    verdict:
      "PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
    remediatedAtKst: rationale.remediatedAtKst,
    scope: {
      sourceArtifact: "experiments/question-quality-20260715/corpus/original-s1-v6",
      priorAuditPreserved: true,
      candidateApiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    sourceBindings: {
      priorPrivateArtifactSha256: rationale.priorPrivateArtifactSha256,
      remediatedPrivateArtifactSha256: sha256(sourceBytes),
      remediatedPublicArtifactSha256: sha256(readFileSync(paths.sourcePublic)),
      remediatedSourceManifestSha256: sourceManifest.sha256,
      localHashedReferenceFixtureSha256: sha256(sourceReferenceFixtureBytes),
      priorAuditPublicArtifactSha256: sha256(priorAuditBytes),
      priorAuditManifestSha256: priorAuditManifest.sha256,
    },
    rowRemediation: {
      rowCount: rationale.rows.length,
      passageChangedCount: passageChangedRows.length,
      passageChangedRowIds: passageChangedRows,
      fullPrivateRowChangedCount: fullRowChangedCount,
      wordingRemediationCount: wordingRemediationRows.length,
      wordingRemediationRowIds: wordingRemediationRows,
      correctedGrammarMetadataCount: correctedGrammarMetadataRows.length,
      correctedGrammarMetadataRowIds: correctedGrammarMetadataRows,
      grammarAffordanceBindingCount: grammarBindingCount,
      grammaticalityPassRows: 12,
      naturalnessPassRows: 12,
      contentCoherencePassRows: 12,
      examSuitabilityPassRows: 12,
    },
    blankStructure: {
      before: {
        terminal: 4,
        lateNonterminal: 1,
        middle: 1,
        finalOrPenultimate: 5,
        cleanUnrestrictedInternal: 0,
      },
      after: {
        positionCounts: blankPositionCounts,
        internal: 5,
        finalOrPenultimate: 1,
        internalContrastOrCounterexample: internalContrastOrCounterexampleCount,
        internalAnaphoricOrCausalBridge: internalAnaphoricOrCausalBridgeCount,
        dualDifficultyCoverage: 6,
        maximumPostBlankContentJaccard: maximumRestatementJaccard,
      },
      targetPass: true,
    },
    rightsPrivacyAndLeakage: {
      unchangedRightsProvenanceCommitments: 12,
      originalCompositionRows: 12,
      copiedOrAdaptedRows: 0,
      thirdPartyPermissionClaimedRows: 0,
      manualPiiObservedRows: 0,
      machinePiiPatternHits: 0,
      sourceAndReviewPublicTwelveTokenLeakWindows: 0,
      sourcePrivateGitIgnored: sourcePrivateGit.ignored,
      sourcePrivateGitTracked: sourcePrivateGit.tracked,
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
    hermeticityClosure: {
      normalBuildExternalHistoricalInputReads: 0,
      packageLocalHashedReferenceFixture: true,
      fixtureContainsExactReferencePassageText: false,
      fixtureContainsExactReferenceNgramText: false,
      fixtureGitIgnored: sourceReferenceFixtureGit.ignored,
      fixtureGitTracked: sourceReferenceFixtureGit.tracked,
      generationOnlyRefresherSeparated: true,
      status: "PASS",
    },
    admission: {
      corpusQualityAndStructureGatesPass: true,
      externalDispatchAuthorized: false,
      reason:
        "The corpus remediation does not satisfy provider privacy, allow-list, dedicated credential, live pricing, spend, physical-call, exact-controller, or generated-question quality gates.",
    },
    residualLimits: [
      "Naturalness, coherence, and semantic non-restatement are adjudicative judgments; the lexical post-blank metric is supporting evidence, not a semantic proof.",
      "Repository-wide eight-token non-overlap cannot establish global originality, copyright ownership, or non-infringement.",
      "PII scanning and manual observation cannot prove the absence of every possible identifier.",
      "The private hashed-reference fixture is reproducible only when deliberately refreshed from the separately held historical inputs; normal build/verify is package-local and does not refresh it.",
      "This package validates source-corpus design, not the quality of questions that an external model will generate from it.",
    ],
  };
}

export function publicArtifactBytes(): string {
  return `${JSON.stringify(buildPublicArtifact(), null, 2)}\n`;
}

export function manifestBytes(publicBytes: string): string {
  return `${MANIFEST_PATHS.map((relativePath) => {
    const bytes =
      relativePath === "remediation-public.json"
        ? Buffer.from(publicBytes, "utf8")
        : readFileSync(path.join(here, relativePath));
    return `${sha256(bytes)}  ${relativePath}`;
  }).join("\n")}\n`;
}
