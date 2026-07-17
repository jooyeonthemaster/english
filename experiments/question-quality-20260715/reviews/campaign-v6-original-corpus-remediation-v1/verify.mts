import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  here,
  manifestBytes,
  MANIFEST_PATHS,
  paths,
  publicArtifactBytes,
  repoRoot,
  scanRepositoryForOverlap,
  sha256,
  sourceDir,
  words,
} from "./core.mts";

const publicBytes = publicArtifactBytes();
const expectedManifest = manifestBytes(publicBytes);
assert.equal(readFileSync(paths.publicArtifact, "utf8"), publicBytes);
assert.equal(readFileSync(paths.manifest, "utf8"), expectedManifest);

const manifestLines = expectedManifest.trimEnd().split(/\r?\n/);
assert.equal(manifestLines.length, MANIFEST_PATHS.length);
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert(match, `invalid remediation manifest line: ${line}`);
  const [, expected, relativePath] = match;
  assert.equal(sha256(readFileSync(path.join(here, relativePath))), expected);
}

for (const privatePath of [
  paths.rationale,
  paths.overlapCapture,
  paths.sourcePrivate,
  paths.sourceReferenceFixture,
]) {
  const relative = path.relative(repoRoot, privatePath).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "--quiet", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, `${relative}: private artifact is not ignored`);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, `${relative}: private artifact is tracked`);
}

const source = JSON.parse(readFileSync(paths.sourcePrivate, "utf8")) as {
  rows: Array<{ publicId: string; passageText: string }>;
};
const publicSurface = [
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
  paths.publicArtifact,
  paths.manifest,
]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n")
  .toLowerCase();
for (const row of source.rows) {
  assert(!publicSurface.includes(row.passageText.toLowerCase()), `${row.publicId}: exact leak`);
  const tokens = words(row.passageText);
  for (let index = 0; index + 12 <= tokens.length; index += 1) {
    assert(
      !publicSurface.includes(tokens.slice(index, index + 12).join(" ")),
      `${row.publicId}: public 12-token leak`,
    );
  }
}

for (const relativePath of [
  "capture-overlap.mts",
  "core.mts",
  "build.mts",
  "verify.mts",
]) {
  const sourceCode = readFileSync(path.join(here, relativePath), "utf8");
  assert(!/\bfetch\s*\(/.test(sourceCode));
  assert(
    !/node:(?:http|https|net|tls|dns)|from\s+["'](?:axios|openai|pg|@google\/generative-ai|@anthropic-ai\/sdk)["']/i.test(
      sourceCode,
    ),
  );
}

const freshOverlap = scanRepositoryForOverlap("2026-07-15T17:05:00+09:00");
assert.equal(freshOverlap.hitFileRowPairCount, 0);
assert.deepEqual(freshOverlap.hits, []);
assert.equal(freshOverlap.skippedOversizeFileCount, 0);
assert.equal(freshOverlap.skippedUnreadableFileCount, 0);

const sourcePublic = JSON.parse(readFileSync(paths.sourcePublic, "utf8")) as {
  schemaVersion: string;
  revisionId: string;
  aggregate: {
    grammarAffordanceBindingCount: number;
    blankRecommendedPositionCounts: Record<string, number>;
    blankFinalOrPenultimateCount: number;
    blankInternalCount: number;
    blankInternalContrastOrCounterexampleCount: number;
    blankInternalAnaphoricOrCausalBridgeCount: number;
    blankDualDifficultyCoverageCount: number;
    maximumPostBlankContentJaccard: number;
  };
  admission: { generationAuthorized: boolean };
};
assert.equal(sourcePublic.schemaVersion, "question-quality-original-s1-v6-public-v2");
assert.equal(sourcePublic.revisionId, "original-s1-v6-remediation-v1");
assert.equal(sourcePublic.aggregate.grammarAffordanceBindingCount, 30);
assert.deepEqual(sourcePublic.aggregate.blankRecommendedPositionCounts, {
  INTERNAL: 5,
  TERMINAL: 1,
});
assert.equal(sourcePublic.aggregate.blankFinalOrPenultimateCount, 1);
assert.equal(sourcePublic.aggregate.blankInternalCount, 5);
assert.equal(sourcePublic.aggregate.blankInternalContrastOrCounterexampleCount, 3);
assert.equal(sourcePublic.aggregate.blankInternalAnaphoricOrCausalBridgeCount, 1);
assert.equal(sourcePublic.aggregate.blankDualDifficultyCoverageCount, 6);
assert(sourcePublic.aggregate.maximumPostBlankContentJaccard < 0.2);
assert.equal(sourcePublic.admission.generationAuthorized, false);

const artifact = JSON.parse(publicBytes) as {
  verdict: string;
  rowRemediation: {
    rowCount: number;
    passageChangedCount: number;
    fullPrivateRowChangedCount: number;
    grammarAffordanceBindingCount: number;
  };
  blankStructure: {
    after: {
      positionCounts: Record<string, number>;
      internal: number;
      finalOrPenultimate: number;
      internalContrastOrCounterexample: number;
      internalAnaphoricOrCausalBridge: number;
      dualDifficultyCoverage: number;
    };
    targetPass: boolean;
  };
  admission: { corpusQualityAndStructureGatesPass: boolean; externalDispatchAuthorized: boolean };
  hermeticityClosure: {
    normalBuildExternalHistoricalInputReads: number;
    packageLocalHashedReferenceFixture: boolean;
    fixtureContainsExactReferencePassageText: boolean;
    fixtureContainsExactReferenceNgramText: boolean;
    generationOnlyRefresherSeparated: boolean;
    status: string;
  };
};
assert.equal(
  artifact.verdict,
  "PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
);
assert.equal(artifact.rowRemediation.rowCount, 12);
assert.equal(artifact.rowRemediation.passageChangedCount, 7);
assert.equal(artifact.rowRemediation.fullPrivateRowChangedCount, 12);
assert.equal(artifact.rowRemediation.grammarAffordanceBindingCount, 30);
assert.deepEqual(artifact.blankStructure.after.positionCounts, { INTERNAL: 5, TERMINAL: 1 });
assert.equal(artifact.blankStructure.after.internal, 5);
assert.equal(artifact.blankStructure.after.finalOrPenultimate, 1);
assert.equal(artifact.blankStructure.after.internalContrastOrCounterexample, 3);
assert.equal(artifact.blankStructure.after.internalAnaphoricOrCausalBridge, 1);
assert.equal(artifact.blankStructure.after.dualDifficultyCoverage, 6);
assert.equal(artifact.blankStructure.targetPass, true);
assert.equal(artifact.admission.corpusQualityAndStructureGatesPass, true);
assert.equal(artifact.admission.externalDispatchAuthorized, false);
assert.equal(artifact.hermeticityClosure.normalBuildExternalHistoricalInputReads, 0);
assert.equal(artifact.hermeticityClosure.packageLocalHashedReferenceFixture, true);
assert.equal(artifact.hermeticityClosure.fixtureContainsExactReferencePassageText, false);
assert.equal(artifact.hermeticityClosure.fixtureContainsExactReferenceNgramText, false);
assert.equal(artifact.hermeticityClosure.generationOnlyRefresherSeparated, true);
assert.equal(artifact.hermeticityClosure.status, "PASS");

console.log(
  JSON.stringify(
    {
      verdict: artifact.verdict,
      rowCount: 12,
      grammarAffordanceBindings: 30,
      blankInternalSites: 5,
      blankFinalOrPenultimateSites: 1,
      blankInternalContrastOrCounterexampleSites: 3,
      blankInternalAnaphoricOrCausalBridgeSites: 1,
      blankDualDifficultyCoverage: 6,
      normalBuildExternalHistoricalInputReads: 0,
      freshRepositoryScannedFileCount: freshOverlap.scannedFileCount,
      freshRepositoryScannedUtf8ByteCount: freshOverlap.scannedUtf8ByteCount,
      freshRepositoryEightTokenOverlapHits: 0,
      publicLeakWindows: 0,
      publicArtifactSha256: sha256(publicBytes),
      manifestSha256: sha256(expectedManifest),
      candidateApiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    null,
    2,
  ),
);
