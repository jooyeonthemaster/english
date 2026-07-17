import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  here,
  manifestBytes,
  MANIFEST_PATHS,
  paths,
  publicAuditBytes,
  readCorpus,
  repoRoot,
  scanRepositoryForOverlap,
  sha256,
  words,
} from "./core.mts";

const publicBytes = publicAuditBytes();
const expectedManifest = manifestBytes(publicBytes);
assert.equal(readFileSync(paths.publicAudit, "utf8"), publicBytes, "public audit not reproducible");
assert.equal(readFileSync(paths.manifest, "utf8"), expectedManifest, "audit manifest not reproducible");

const manifestLines = expectedManifest.trimEnd().split(/\r?\n/);
assert.equal(manifestLines.length, MANIFEST_PATHS.length);
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert(match, `invalid audit manifest line: ${line}`);
  const [, expected, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(here, relativePath))),
    expected,
    `audit manifest drift: ${relativePath}`,
  );
}

for (const privatePath of [paths.manualFindings, paths.overlapCapture]) {
  const relative = path.relative(repoRoot, privatePath).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "--quiet", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, `${relative}: private audit artifact is not ignored`);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, `${relative}: private audit artifact is tracked`);
}

const publicSurface = [
  "README.md",
  "capture-overlap.mts",
  "core.mts",
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "audit-public.json",
  "MANIFEST.sha256",
]
  .map((relativePath) => readFileSync(path.join(here, relativePath), "utf8"))
  .join("\n")
  .toLowerCase();

for (const row of readCorpus().rows) {
  assert(!publicSurface.includes(row.passageText.toLowerCase()), `${row.publicId}: exact audit leak`);
  const tokens = words(row.passageText);
  for (let index = 0; index + 12 <= tokens.length; index += 1) {
    assert(
      !publicSurface.includes(tokens.slice(index, index + 12).join(" ")),
      `${row.publicId}: 12-token audit public leak`,
    );
  }
}

for (const relativePath of [
  "capture-overlap.mts",
  "core.mts",
  "build.mts",
  "verify.mts",
]) {
  const source = readFileSync(path.join(here, relativePath), "utf8");
  assert(!/\bfetch\s*\(/.test(source), `${relativePath}: fetch is forbidden`);
  assert(
    !/node:(?:http|https|net|tls|dns)|from\s+["'](?:axios|openai|pg|@google\/generative-ai|@anthropic-ai\/sdk)["']/i.test(
      source,
    ),
    `${relativePath}: network, model, or database client found`,
  );
}

const freshOverlap = scanRepositoryForOverlap("2026-07-15T16:31:00+09:00");
assert.equal(freshOverlap.hitFileRowPairCount, 0, "fresh repository overlap hit");
assert.deepEqual(freshOverlap.hits, []);
assert.equal(freshOverlap.skippedOversizeFileCount, 0);
assert.equal(freshOverlap.skippedUnreadableFileCount, 0);

const artifact = JSON.parse(publicBytes) as {
  verdict: string;
  independentMechanicalFindings: {
    rowCount: number;
    grammarRowCount: number;
    blankRowCount: number;
    sentenceCountReviewed: number;
  };
  manualAdversarialFindings: {
    sourceRevisionRequiredCount: number;
    metadataCorrectionRequiredCount: number;
    explicitDifficultyRoutingRequiredCount: number;
    blankSitePositionAudit: {
      counts: {
        terminal: number;
        lateNonterminal: number;
        middle: number;
        finalOrPenultimate: number;
        cleanUnrestrictedInternal: number;
      };
      internalContrastOrCounterexampleHingeRows: number;
      internalAnaphoricBridgeHingeRows: number;
    };
  };
  rightsAndPrivacyConclusion: { externalDispatchAuthorizedByThisAudit: boolean };
};
assert.equal(
  artifact.verdict,
  "BLOCK_UNCONDITIONAL_S1_V6_ADMISSION_PENDING_TEXT_METADATA_DIFFICULTY_AND_BLANK_POSITION_REMEDIATION",
);
assert.equal(artifact.independentMechanicalFindings.rowCount, 12);
assert.equal(artifact.independentMechanicalFindings.grammarRowCount, 6);
assert.equal(artifact.independentMechanicalFindings.blankRowCount, 6);
assert.equal(artifact.independentMechanicalFindings.sentenceCountReviewed, 127);
assert.equal(artifact.manualAdversarialFindings.sourceRevisionRequiredCount, 4);
assert.equal(artifact.manualAdversarialFindings.metadataCorrectionRequiredCount, 3);
assert.equal(artifact.manualAdversarialFindings.explicitDifficultyRoutingRequiredCount, 2);
assert.deepEqual(artifact.manualAdversarialFindings.blankSitePositionAudit.counts, {
  terminal: 4,
  lateNonterminal: 1,
  middle: 1,
  finalOrPenultimate: 5,
  cleanUnrestrictedInternal: 0,
});
assert.equal(
  artifact.manualAdversarialFindings.blankSitePositionAudit.internalContrastOrCounterexampleHingeRows,
  0,
);
assert.equal(
  artifact.manualAdversarialFindings.blankSitePositionAudit.internalAnaphoricBridgeHingeRows,
  0,
);
assert.equal(artifact.rightsAndPrivacyConclusion.externalDispatchAuthorizedByThisAudit, false);

console.log(
  JSON.stringify(
    {
      verdict: artifact.verdict,
      rowCount: 12,
      sentencesReviewed: 127,
      freshRepositoryScannedFileCount: freshOverlap.scannedFileCount,
      freshRepositoryScannedUtf8ByteCount: freshOverlap.scannedUtf8ByteCount,
      freshRepositoryEightTokenOverlapHits: 0,
      publicLeakWindows: 0,
      publicAuditSha256: sha256(publicBytes),
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
