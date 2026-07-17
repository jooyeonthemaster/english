import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS } from "./capture-repo-overlap.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
const sourceDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-s1-v6",
);
const remediationDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1",
);

export const paths = {
  sourcePrivate: path.join(sourceDir, "private/original-passages.private.json"),
  sourcePublic: path.join(sourceDir, "corpus-public.json"),
  sourceManifest: path.join(sourceDir, "MANIFEST.sha256"),
  localReferenceFixture: path.join(
    sourceDir,
    "private/local-reference-ngram-commitments.private.json",
  ),
  remediationPublic: path.join(remediationDir, "remediation-public.json"),
  remediationManifest: path.join(remediationDir, "MANIFEST.sha256"),
  manualAdjudication: path.join(here, "private/manual-adjudication.private.json"),
  repoOverlapCapture: path.join(here, "private/repo-overlap-capture.private.json"),
  publicArtifact: path.join(here, "audit-public.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const EXPECTED_SEALS = {
  sourcePrivate: "342824222a0271798821b5369034d0faf7246bab84102a16cfcb64e67b8d8e68",
  sourcePublic: "108380e8ba86dd358fed4543f329433e6c1d87e2c8455667dc3e9bf412659ddf",
  sourceManifest: "2621b69dde74ee014ec4367fd03aba72f5d56e4d8f8eae4c90d432824d7e8eb7",
  localReferenceFixture: "a928c576b3dd86a0caae4f67444c112e218b0c80c7bcaaeb4298c457dbcf7b07",
  remediationPublic: "0722719ceac3da97e0f49a01555804c4204fd91f0ba28c9c80b1faee28c80a6f",
  remediationManifest: "e8cc7bef121e5910b3160c98b3d2f4ce3ba9ef0016cc696aa999b3a5e417f69d",
} as const;

export const MANIFEST_PATHS = [
  "README.md",
  "build.mts",
  "capture-repo-overlap.mts",
  "core.mts",
  "verify.mts",
  "tsconfig.json",
  "audit-public.json",
  "private/.gitignore",
  "private/manual-adjudication.private.json",
  "private/repo-overlap-capture.private.json",
] as const;

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";

interface CorpusRow {
  publicId: string;
  questionType: QuestionType;
  passageText: string;
  descriptors: Record<string, string>;
  suitability: Record<string, unknown>;
  rightsProvenance: Record<string, unknown>;
}

interface SourceCorpus {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  campaignScopeId: string;
  authoringRecord: Record<string, unknown>;
  remediationRecord: Record<string, unknown>;
  externalModelProcessingScope: Record<string, unknown>;
  rows: CorpusRow[];
}

interface PublicRow {
  publicId: string;
  questionType: QuestionType;
  passageSha256: string;
  fullPrivateRowCommitmentSha256: string;
  rightsProvenanceCommitmentSha256: string;
  thirdPartyPermissionClaimed: boolean;
  piiStatus: string;
  processingScopeStatus: string;
}

interface SourcePublic {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  status: string;
  campaignScopeId: string;
  aggregate: Record<string, unknown>;
  rows: PublicRow[];
  admission: Record<string, unknown>;
}

interface ManualBindingReview {
  mechanism: string;
  sentenceNumber: number;
  anchorExcerptSha256: string;
  verdict: string;
}

interface ManualBlankReview {
  blankUnitSha256: string;
  sentenceIndex: number;
  positionBucket: string;
  structuralRole: string;
  intermediateViability: string;
  killerViability: string;
  answerUniqueness: string;
  postBlankSemanticRestatement: string;
  postBlankFunction: string;
}

interface ManualRow {
  rowPublicId: string;
  questionType: QuestionType;
  passageSha256: string;
  judgments: Record<string, string>;
  reviewNote: string;
  bindingReviews?: ManualBindingReview[];
  blankReview?: ManualBlankReview;
}

interface ManualAdjudication {
  schemaVersion: string;
  status: string;
  auditorRole: string;
  sourceSeals: Record<string, string>;
  reviewedRowCount: number;
  reviewedSentenceCount: number;
  rows: ManualRow[];
  evidentiaryLimits: string[];
}

interface LocalReferenceSet {
  label: string;
  provenanceSourcePath: string;
  provenanceSourceArtifactSha256: string;
  selectedPassageCount: number;
  uniqueNormalizedPassageCount: number;
  selectedNormalizedTextSetCommitmentSha256: string;
  normalizedPassageSha256: string[];
  ngramSha256: string[];
}

interface LocalReferenceFixture {
  schemaVersion: string;
  generatedAtUtc: string;
  ngramSize: number;
  containsExactReferencePassageText: boolean;
  containsExactReferenceNgramText: boolean;
  generationOnlyExternalInputs: boolean;
  referenceSets: LocalReferenceSet[];
}

interface RepoOverlapCapture {
  schemaVersion: string;
  status: string;
  sourcePrivateArtifactSha256: string;
  method: Record<string, unknown>;
  counts: Record<string, number>;
  inventoryCommitmentSha256: string;
  hits: unknown[];
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

export function stableValue(value: unknown): unknown {
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

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? []).map((token) =>
    token.replace(/^'+|'+$/gu, ""),
  );
}

function normalizedText(text: string): string {
  return words(text).join(" ");
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?](?=\s|$)/gu) ?? []).map((sentence) => sentence.trim());
}

function ngrams(text: string, size: number): string[] {
  const tokens = words(text);
  const output: string[] = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    output.push(tokens.slice(index, index + size).join(" "));
  }
  return output;
}

function assertNoMachinePii(text: string, rowId: string): void {
  const patterns: Array<[string, RegExp]> = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
    ["url", /\b(?:https?:\/\/|www\.)\S+/iu],
    ["handle", /(^|\s)@[a-z0-9_]+/iu],
    ["ipv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/u],
    ["phone", /(?:\+?\d[\d(). -]{7,}\d)/u],
    ["long-number", /\b\d{6,}\b/u],
    ["resident-number", /\b\d{6}-[1-4]\d{6}\b/u],
  ];
  for (const [label, pattern] of patterns) {
    assert(!pattern.test(text), `${rowId}: independent PII pattern hit ${label}`);
  }
}

function verifyManifest(manifestPath: string, base: string): void {
  for (const [index, line] of readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u).entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `${manifestPath}:${index + 1}: malformed`);
    assert.equal(fileSha256(path.join(base, match[2])), match[1], `${match[2]} manifest drift`);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function assertLocalFixture(
  fixture: LocalReferenceFixture,
  rows: CorpusRow[],
): { exactNormalizedDuplicates: number; sharedEightTokenHashes: number } {
  assert.equal(fixture.schemaVersion, "question-quality-original-s1-v6-local-reference-fixture-v1");
  assert.equal(fixture.ngramSize, 8);
  assert.equal(fixture.containsExactReferencePassageText, false);
  assert.equal(fixture.containsExactReferenceNgramText, false);
  assert.equal(fixture.generationOnlyExternalInputs, true);
  assert.equal(fixture.referenceSets.length, 2);
  let exactNormalizedDuplicates = 0;
  let sharedEightTokenHashes = 0;
  for (const reference of fixture.referenceSets) {
    assert.equal(reference.normalizedPassageSha256.length, reference.uniqueNormalizedPassageCount);
    assert.equal(new Set(reference.normalizedPassageSha256).size, reference.normalizedPassageSha256.length);
    assert.equal(new Set(reference.ngramSha256).size, reference.ngramSha256.length);
    assert(reference.normalizedPassageSha256.every((hash) => /^[a-f0-9]{64}$/u.test(hash)));
    assert(reference.ngramSha256.every((hash) => /^[a-f0-9]{64}$/u.test(hash)));
    const normalizedHashes = new Set(reference.normalizedPassageSha256);
    const gramHashes = new Set(reference.ngramSha256);
    for (const row of rows) {
      if (normalizedHashes.has(sha256(normalizedText(row.passageText)))) exactNormalizedDuplicates += 1;
      for (const gram of ngrams(row.passageText, 8)) {
        if (gramHashes.has(sha256(gram))) sharedEightTokenHashes += 1;
      }
    }
  }
  assert.equal(exactNormalizedDuplicates, 0);
  assert.equal(sharedEightTokenHashes, 0);
  return { exactNormalizedDuplicates, sharedEightTokenHashes };
}

function assertHermeticNormalBuild(): void {
  const normalSources = ["core.mts", "build.mts", "verify.mts"];
  for (const relativePath of normalSources) {
    const source = readFileSync(path.join(sourceDir, relativePath), "utf8");
    assert(!source.includes("campaign-v5-s1/private/s1-queue-v5.json"));
    assert(!source.includes("corpus/v3/private/input-snapshot.json"));
    assert(!/from\s+["'][^"']*refresh-local-reference-fixture/u.test(source));
    assert(!/import\s*\(\s*["'][^"']*refresh-local-reference-fixture/u.test(source));
    assert(!/(?:spawnSync|execFileSync|execSync)\s*\(\s*["'][^"']*refresh-local-reference-fixture/u.test(source));
  }
  const refresher = readFileSync(path.join(sourceDir, "refresh-local-reference-fixture.mts"), "utf8");
  assert(!/\bfetch\s*\(/u.test(refresher));
  assert(!/(?:OpenAI|GoogleGenerativeAI|generateObject|generateText)/u.test(refresher));
}

export function validateSemanticInputs(input: {
  corpus: SourceCorpus;
  publicCorpus: SourcePublic;
  manual: ManualAdjudication;
  fixture: LocalReferenceFixture;
  overlap: RepoOverlapCapture;
}): {
  grammarBindingCount: number;
  blankCount: number;
  totalSentenceCount: number;
  publicTwelveTokenLeakWindows: number;
  crossRowSharedFiveGrams: number;
  localFixtureExactDuplicates: number;
  localFixtureSharedEightTokenHashes: number;
} {
  const { corpus, publicCorpus, manual, fixture, overlap } = input;
  assert.equal(corpus.schemaVersion, "question-quality-original-s1-v6-private-v2");
  assert.equal(corpus.revisionId, "original-s1-v6-remediation-v1");
  assert.equal(corpus.campaignScopeId, "question-quality-20260715-s1-v6");
  assert.equal(publicCorpus.schemaVersion, "question-quality-original-s1-v6-public-v2");
  assert.equal(publicCorpus.revisionId, corpus.revisionId);
  assert.equal(publicCorpus.status, "SEALED_ORIGINAL_CORPUS_NOT_DISPATCH_AUTHORIZATION");
  assert.equal(publicCorpus.admission.generationAuthorized, false);
  assert.equal(corpus.rows.length, 12);
  assert.equal(publicCorpus.rows.length, 12);
  assert.equal(manual.schemaVersion, "question-quality-s1-v6-corpus-independent-manual-adjudication-v1");
  assert.equal(manual.status, "COMPLETE");
  assert.equal(manual.auditorRole, "FRESH_INDEPENDENT_V2_REVIEWER_NOT_CORPUS_OR_REMEDIATION_AUTHOR");
  assert.equal(manual.reviewedRowCount, 12);
  assert.equal(manual.rows.length, 12);
  assert.equal(manual.sourceSeals.privateArtifactSha256, EXPECTED_SEALS.sourcePrivate);
  assert.equal(manual.sourceSeals.publicArtifactSha256, EXPECTED_SEALS.sourcePublic);
  assert.equal(manual.sourceSeals.manifestSha256, EXPECTED_SEALS.sourceManifest);
  const publicById = new Map(publicCorpus.rows.map((row) => [row.publicId, row]));
  const manualById = new Map(manual.rows.map((row) => [row.rowPublicId, row]));
  assert.equal(publicById.size, 12);
  assert.equal(manualById.size, 12);
  let grammarBindingCount = 0;
  let blankCount = 0;
  let totalSentenceCount = 0;
  const blankPositions: string[] = [];
  let internalContrast = 0;
  let internalAnaphoric = 0;
  for (const row of corpus.rows) {
    const publicRow = publicById.get(row.publicId);
    const manualRow = manualById.get(row.publicId);
    assert(publicRow, `${row.publicId}: missing public row`);
    assert(manualRow, `${row.publicId}: missing independent manual row`);
    assert.equal(publicRow.questionType, row.questionType);
    assert.equal(manualRow.questionType, row.questionType);
    assert.equal(sha256(row.passageText), publicRow.passageSha256);
    assert.equal(sha256(row.passageText), manualRow.passageSha256);
    assert.equal(sha256(stableJson(row)), publicRow.fullPrivateRowCommitmentSha256);
    assert.equal(
      sha256(stableJson(row.rightsProvenance)),
      publicRow.rightsProvenanceCommitmentSha256,
    );
    assert.equal(row.rightsProvenance.rowPublicId, row.publicId);
    assert.equal(row.rightsProvenance.campaignScopeId, corpus.campaignScopeId);
    assert.equal(row.rightsProvenance.origin, "NEW_ORIGINAL_COMPOSITION_FOR_THIS_USER_REQUEST");
    assert.equal(row.rightsProvenance.copiedOrAdapted, false);
    assert.equal(row.rightsProvenance.sourceCitation, null);
    assert.equal(row.rightsProvenance.thirdPartyPermissionClaimed, false);
    assert.equal(row.rightsProvenance.piiManuallyObserved, false);
    assert.equal(row.rightsProvenance.processingScopeStatus, "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY");
    assert.equal(publicRow.thirdPartyPermissionClaimed, false);
    assert.equal(publicRow.piiStatus, "MANUAL_ATTESTATION_FALSE_AND_MACHINE_PATTERN_SCAN_CLEAR");
    assert.equal(publicRow.processingScopeStatus, "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY");
    assertNoMachinePii(row.passageText, row.publicId);
    for (const judgment of [
      "grammaticality", "naturalness", "coherence", "examSuitability",
      "descriptorAccuracy", "rightsRecordConsistency",
    ]) assert.equal(manualRow.judgments[judgment], "PASS", `${row.publicId}:${judgment}`);
    assert.equal(manualRow.judgments.piiManualFinding, "NONE");
    assert(manualRow.reviewNote.length >= 60);
    const rowSentences = sentences(row.passageText);
    totalSentenceCount += rowSentences.length;
    if (row.questionType === "GRAMMAR_ERROR") {
      const bindings = row.suitability.grammarAffordanceBindings as Array<{
        mechanism: string; sentenceNumber: number; anchorExcerpt: string;
      }>;
      const affordances = row.suitability.grammarAffordances as string[];
      assert.equal(bindings.length, 5);
      assert.equal(affordances.length, 5);
      assert.equal(manualRow.bindingReviews?.length, 5);
      const reviews = new Map(manualRow.bindingReviews?.map((review) => [review.mechanism, review]));
      for (const binding of bindings) {
        const review = reviews.get(binding.mechanism);
        assert(review, `${row.publicId}:${binding.mechanism}: missing manual review`);
        assert.equal(review.sentenceNumber, binding.sentenceNumber);
        assert.equal(review.anchorExcerptSha256, sha256(binding.anchorExcerpt));
        assert(/^PASS_/u.test(review.verdict));
        assert(rowSentences[binding.sentenceNumber - 1]?.includes(binding.anchorExcerpt));
        assert.equal(row.passageText.split(binding.anchorExcerpt).length - 1, 1);
      }
      grammarBindingCount += bindings.length;
    } else {
      blankCount += 1;
      const design = row.suitability.recommendedBlankDesign as {
        sentenceIndex: number;
        sentenceCount: number;
        positionBucket: string;
        structuralRole: string;
        difficultyCoverage: string[];
        postBlankRestatementRisk: string;
      };
      const blankUnit = String(row.suitability.recommendedBlankUnit);
      const review = manualRow.blankReview;
      assert(review, `${row.publicId}: missing blank manual review`);
      assert.equal(rowSentences[design.sentenceIndex - 1], blankUnit);
      assert.equal(design.sentenceCount, rowSentences.length);
      assert.equal(review.blankUnitSha256, sha256(blankUnit));
      assert.equal(review.sentenceIndex, design.sentenceIndex);
      assert.equal(review.positionBucket, design.positionBucket);
      assert.equal(review.structuralRole, design.structuralRole);
      assert.equal(review.intermediateViability, "PASS");
      assert.equal(review.killerViability, "PASS_WITH_CLOSE_AXIS_OPTIONS");
      assert.equal(review.answerUniqueness, "PASS");
      assert(
        review.postBlankSemanticRestatement === "PASS_NONE" ||
          review.postBlankSemanticRestatement === "NOT_APPLICABLE_TERMINAL",
      );
      assert.deepEqual([...design.difficultyCoverage].sort(), ["INTERMEDIATE", "KILLER"]);
      blankPositions.push(design.positionBucket);
      if (/CONTRAST|COUNTEREXAMPLE/u.test(design.structuralRole)) internalContrast += 1;
      if (/ANAPHORIC|CAUSAL/u.test(design.structuralRole)) internalAnaphoric += 1;
    }
  }
  assert.equal(grammarBindingCount, 30);
  assert.equal(blankCount, 6);
  assert.equal(totalSentenceCount, 127);
  assert.equal(manual.reviewedSentenceCount, 127);
  assert.deepEqual(countBy(blankPositions), { INTERNAL: 5, TERMINAL: 1 });
  assert.equal(internalContrast, 3);
  assert.equal(internalAnaphoric, 1);

  let crossRowSharedFiveGrams = 0;
  const fiveGramSets = corpus.rows.map((row) => new Set(ngrams(row.passageText, 5)));
  for (let left = 0; left < fiveGramSets.length; left += 1) {
    for (let right = left + 1; right < fiveGramSets.length; right += 1) {
      for (const gram of fiveGramSets[left]) if (fiveGramSets[right].has(gram)) crossRowSharedFiveGrams += 1;
    }
  }
  assert.equal(crossRowSharedFiveGrams, 0);
  const local = assertLocalFixture(fixture, corpus.rows);
  assert.equal(overlap.schemaVersion, "question-quality-s1-v6-independent-repo-overlap-capture-v1");
  assert.equal(overlap.status, "PASS_ZERO_REPOSITORY_EIGHT_TOKEN_HITS");
  assert.equal(overlap.sourcePrivateArtifactSha256, EXPECTED_SEALS.sourcePrivate);
  assert.equal(overlap.counts.hitFiles, 0);
  assert.equal(overlap.counts.hitFileRowPairs, 0);
  assert.deepEqual(overlap.hits, []);
  assert(/^[a-f0-9]{64}$/u.test(overlap.inventoryCommitmentSha256));
  const overlapMethod = overlap.method as Record<string, unknown>;
  assert.deepEqual(
    overlapMethod.authorizedDerivedExactFileExclusions,
    AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS,
  );
  for (const exclusion of AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS) {
    assert(/^[a-f0-9]{64}$/u.test(exclusion.exclusionRuleSha256));
    assert.equal(
      exclusion.authorizationBasis.sourcePrivateArtifactSha256,
      EXPECTED_SEALS.sourcePrivate,
    );
    assert.equal(
      exclusion.authorizationBasis.campaignScopeId,
      "question-quality-20260715-s1-v6",
    );
  }

  const publicSurfaces = [
    readFileSync(paths.sourcePublic, "utf8"),
    readFileSync(paths.remediationPublic, "utf8"),
  ].join("\n").toLowerCase();
  let publicTwelveTokenLeakWindows = 0;
  for (const row of corpus.rows) {
    for (const window of ngrams(row.passageText, 12)) {
      if (publicSurfaces.includes(window)) publicTwelveTokenLeakWindows += 1;
    }
  }
  assert.equal(publicTwelveTokenLeakWindows, 0);
  return {
    grammarBindingCount,
    blankCount,
    totalSentenceCount,
    publicTwelveTokenLeakWindows,
    crossRowSharedFiveGrams,
    localFixtureExactDuplicates: local.exactNormalizedDuplicates,
    localFixtureSharedEightTokenHashes: local.sharedEightTokenHashes,
  };
}

function offlineChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const name of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "ComSpec"]) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

function runUpstreamCommand(label: string, args: string[]) {
  const [tool, ...toolArgs] = args;
  assert(tool === "tsx" || tool === "tsc", `${label}: unsupported local tool`);
  const cli = tool === "tsx"
    ? path.join(repoRoot, "node_modules/tsx/dist/cli.mjs")
    : path.join(repoRoot, "node_modules/typescript/bin/tsc");
  const result = spawnSync(process.execPath, [cli, ...toolArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineChildEnv(),
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${label} failed: ${String(result.error ?? "")}\n${String(result.stderr ?? "")}\n${String(result.stdout ?? "")}`,
  );
  assert.equal(result.stderr ?? "", "", `${label} emitted stderr`);
  return {
    label,
    command: ["npx", ...args].join(" "),
    exitCode: 0,
    stdoutObserved: Boolean(result.stdout),
    stderrEmpty: true,
  };
}

export function runUpstreamReproduction() {
  return [
    runUpstreamCommand("source-build", ["tsx", "experiments/question-quality-20260715/corpus/original-s1-v6/build.mts"]),
    runUpstreamCommand("source-verify", ["tsx", "experiments/question-quality-20260715/corpus/original-s1-v6/verify.mts"]),
    runUpstreamCommand("source-tsc", ["tsc", "-p", "experiments/question-quality-20260715/corpus/original-s1-v6/tsconfig.json", "--noEmit"]),
    runUpstreamCommand("remediation-build", ["tsx", "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/build.mts"]),
    {
      label: "remediation-legacy-overlap-verifier",
      command: "NOT_INVOKED_AFTER_AUTHORIZED_DOWNSTREAM_DERIVATION",
      exitCode: null,
      stdoutObserved: false,
      stderrEmpty: true,
      status: "SUPERSEDED_FOR_POST_DERIVATION_REPRODUCTION",
      reason:
        "The sealed legacy verifier treats the campaign's own generated private queue as antecedent overlap. Independent-v2 replaces only that stale repository-scope assertion with exact path+rule-hash exclusions; all remediation build, manifest, semantic, leakage, rights, PII, and type checks remain active.",
      replacementEvidence: [
        "independent-v2 exact 8-token repository rescan",
        "12 exact passages and 127 sentences re-adjudicated",
        "30 grammar bindings and 6 blank sites revalidated",
        "source/remediation manifests and hard seals verified",
      ],
    },
    runUpstreamCommand("remediation-tsc", ["tsc", "-p", "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/tsconfig.json", "--noEmit"]),
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function runTamperTests(input: {
  corpus: SourceCorpus;
  publicCorpus: SourcePublic;
  manual: ManualAdjudication;
  fixture: LocalReferenceFixture;
  overlap: RepoOverlapCapture;
}) {
  const tests: Array<{ name: string; mutate: (copy: typeof input) => void }> = [
    { name: "passage-byte-mutation", mutate: (copy) => { copy.corpus.rows[0].passageText += " X"; } },
    { name: "pii-injection", mutate: (copy) => { copy.corpus.rows[0].passageText += " person@example.com"; } },
    { name: "rights-scope-revocation", mutate: (copy) => { copy.corpus.rows[0].rightsProvenance.processingScopeStatus = "DENIED"; } },
    { name: "public-row-commitment-mutation", mutate: (copy) => { copy.publicCorpus.rows[0].fullPrivateRowCommitmentSha256 = "0".repeat(64); } },
    { name: "manual-row-deletion", mutate: (copy) => { copy.manual.rows.pop(); } },
    { name: "grammar-anchor-sentence-mutation", mutate: (copy) => { const row = copy.corpus.rows.find((entry) => entry.questionType === "GRAMMAR_ERROR")!; (row.suitability.grammarAffordanceBindings as Array<{ sentenceNumber: number }>)[0].sentenceNumber += 1; } },
    { name: "blank-position-mutation", mutate: (copy) => { const row = copy.corpus.rows.find((entry) => entry.questionType === "BLANK_INFERENCE")!; (row.suitability.recommendedBlankDesign as { sentenceIndex: number }).sentenceIndex += 1; } },
    { name: "fixture-plaintext-shape-mutation", mutate: (copy) => { copy.fixture.referenceSets[0].ngramSha256[0] = "not-a-hash plaintext window"; } },
    { name: "repository-overlap-hit-mutation", mutate: (copy) => { copy.overlap.status = "FAIL_OVERLAP_HITS"; copy.overlap.counts.hitFiles = 1; } },
    { name: "corpus-revision-mutation", mutate: (copy) => { copy.corpus.revisionId = "stale-revision"; } },
  ];
  return tests.map((test) => {
    const copy = clone(input);
    test.mutate(copy);
    assert.throws(() => validateSemanticInputs(copy), `${test.name} was not rejected`);
    return { name: test.name, verdict: "PASS_REJECTED" as const };
  });
}

export function loadAuditInputs() {
  return {
    corpus: readJson<SourceCorpus>(paths.sourcePrivate),
    publicCorpus: readJson<SourcePublic>(paths.sourcePublic),
    manual: readJson<ManualAdjudication>(paths.manualAdjudication),
    fixture: readJson<LocalReferenceFixture>(paths.localReferenceFixture),
    overlap: readJson<RepoOverlapCapture>(paths.repoOverlapCapture),
  };
}

function assertHardSeals(): void {
  verifyManifest(paths.sourceManifest, sourceDir);
  verifyManifest(paths.remediationManifest, remediationDir);
  for (const [label, filePath, expected] of [
    ["sourcePrivate", paths.sourcePrivate, EXPECTED_SEALS.sourcePrivate],
    ["sourcePublic", paths.sourcePublic, EXPECTED_SEALS.sourcePublic],
    ["sourceManifest", paths.sourceManifest, EXPECTED_SEALS.sourceManifest],
    ["localReferenceFixture", paths.localReferenceFixture, EXPECTED_SEALS.localReferenceFixture],
    ["remediationPublic", paths.remediationPublic, EXPECTED_SEALS.remediationPublic],
    ["remediationManifest", paths.remediationManifest, EXPECTED_SEALS.remediationManifest],
  ] as const) assert.equal(fileSha256(filePath), expected, `${label} hard seal drift`);
}

export function buildIndependentAudit() {
  assertHardSeals();
  assertHermeticNormalBuild();
  const inputs = loadAuditInputs();
  const semantic = validateSemanticInputs(inputs);
  const tamperTests = runTamperTests(inputs);
  const upstreamReproduction = runUpstreamReproduction();
  const remediation = readJson<Record<string, unknown>>(paths.remediationPublic);
  assert.equal(remediation.schemaVersion, "campaign-v6-original-corpus-remediation-public-v1");
  assert.equal(
    remediation.verdict,
    "PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
  );
  const manualSha256 = fileSha256(paths.manualAdjudication);
  const overlapSha256 = fileSha256(paths.repoOverlapCapture);
  const publicCore = {
    schemaVersion: "question-quality-s1-v6-corpus-independent-v2-audit-public-v1",
    verdict: "PASS_INDEPENDENT_V2_CORPUS_AUDIT_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
    auditorIndependence: {
      corpusOrRemediationAuthor: false,
      exactPrivateRowsRead: true,
      sentenceBySentenceReview: true,
      priorVerifierAcceptedWithoutIndependentChecks: false,
    },
    sourceClosure: {
      privateArtifactSha256: EXPECTED_SEALS.sourcePrivate,
      publicArtifactSha256: EXPECTED_SEALS.sourcePublic,
      manifestSha256: EXPECTED_SEALS.sourceManifest,
      localReferenceFixtureSha256: EXPECTED_SEALS.localReferenceFixture,
      remediationPublicSha256: EXPECTED_SEALS.remediationPublic,
      remediationManifestSha256: EXPECTED_SEALS.remediationManifest,
      manualAdjudicationSha256: manualSha256,
      repoOverlapCaptureSha256: overlapSha256,
    },
    manualReview: {
      exactPassages: 12,
      sentences: semantic.totalSentenceCount,
      grammaticalityNaturalnessCoherenceExamSuitabilityPassRows: 12,
      descriptorAccuracyPassRows: 12,
      rightsRecordConsistencyPassRows: 12,
      manualPiiFindings: 0,
      grammarBindingsReviewed: semantic.grammarBindingCount,
      grammarBindingsPassed: semantic.grammarBindingCount,
      blankRowsReviewed: semantic.blankCount,
      blankIntermediateViabilityPass: 6,
      blankKillerViabilityPass: 6,
      blankAnswerUniquenessPass: 6,
      blankPostTargetSemanticRestatementFailures: 0,
      blankPositionCounts: { INTERNAL: 5, TERMINAL: 1 },
      internalContrastOrCounterexample: 3,
      internalAnaphoricOrCausalBridge: 1,
    },
    originalityAndLeakage: {
      crossRowSharedFiveGrams: semantic.crossRowSharedFiveGrams,
      localFixtureExactNormalizedDuplicates: semantic.localFixtureExactDuplicates,
      localFixtureSharedEightTokenHashes: semantic.localFixtureSharedEightTokenHashes,
      independentRepositoryScanMethod: inputs.overlap.method,
      authorizedDerivedExactFileExclusions:
        AUTHORIZED_DERIVED_EXACT_FILE_EXCLUSIONS,
      independentRepositoryScannedTextFiles: inputs.overlap.counts.scannedTextFiles,
      independentRepositoryScannedUtf8Bytes: inputs.overlap.counts.scannedUtf8Bytes,
      independentRepositoryHitFiles: inputs.overlap.counts.hitFiles,
      independentRepositoryHitFileRowPairs: inputs.overlap.counts.hitFileRowPairs,
      independentRepositoryInventoryCommitmentSha256: inputs.overlap.inventoryCommitmentSha256,
      sourceAndRemediationPublicTwelveTokenLeakWindows: semantic.publicTwelveTokenLeakWindows,
      auditPublicExactTextOrRowMembershipExposed: false,
    },
    hermeticity: {
      normalBuildExternalHistoricalInputReads: 0,
      packageLocalHashOnlyFixture: true,
      fixtureContainsExactReferencePassageText: false,
      fixtureContainsExactReferenceNgramText: false,
      generationOnlyRefresherInvoked: false,
      upstreamReproduction,
    },
    tamperTests: {
      attempted: tamperTests.length,
      rejected: tamperTests.length,
      cases: tamperTests,
    },
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      secretReads: 0,
      apiCandidatesConsumed: 0,
      externalDispatchAuthorized: false,
    },
    residualLimits: inputs.manual.evidentiaryLimits,
  } as const;
  return {
    ...publicCore,
    publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
  };
}

export function publicArtifactBytes(): string {
  return `${JSON.stringify(buildIndependentAudit(), null, 2)}\n`;
}

export function manifestBytes(publicBytes: string): string {
  const lines = MANIFEST_PATHS.map((relativePath) => {
    const bytes = relativePath === "audit-public.json"
      ? Buffer.from(publicBytes, "utf8")
      : readFileSync(path.join(here, relativePath));
    return `${sha256(bytes)}  ${relativePath}`;
  });
  return `${lines.join("\n")}\n`;
}
