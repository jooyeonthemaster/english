import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  here,
  manifestBytes,
  paths,
  publicArtifactBytes,
  readPrivateCorpus,
  repoRoot,
  sha256,
  words,
} from "./core.mts";

const publicBytes = publicArtifactBytes();
const expectedManifest = manifestBytes(publicBytes);
assert.equal(readFileSync(paths.publicCorpus, "utf8"), publicBytes, "public artifact is not reproducible");
assert.equal(readFileSync(paths.manifest, "utf8"), expectedManifest, "manifest is not reproducible");

const corpus = readPrivateCorpus();
const publicSurfaceFiles = [
  "README.md",
  "refresh-local-reference-fixture.mts",
  "build.mts",
  "core.mts",
  "verify.mts",
  "tsconfig.json",
  "corpus-public.json",
  "MANIFEST.sha256",
];
const publicSurface = publicSurfaceFiles
  .map((relativePath) => readFileSync(path.join(here, relativePath), "utf8"))
  .join("\n");

for (const row of corpus.rows) {
  assert(!publicSurface.includes(row.passageText), `${row.publicId}: exact passage leaked to public files`);
  const tokens = words(row.passageText);
  for (let i = 0; i + 12 <= tokens.length; i += 1) {
    const window = tokens.slice(i, i + 12).join(" ");
    assert(!publicSurface.toLowerCase().includes(window), `${row.publicId}: 12-token passage window leaked`);
  }
}

for (const privatePath of [paths.privateCorpus, paths.localReferenceFixture]) {
  const privateRelative = path.relative(repoRoot, privatePath).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "--quiet", privateRelative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, `${privateRelative}: private artifact is not git-ignored`);

  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", privateRelative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, `${privateRelative}: private artifact is tracked by git`);
}

for (const sourceFile of ["build.mts", "core.mts", "verify.mts"]) {
  const source = readFileSync(path.join(here, sourceFile), "utf8");
  assert(!/\bfetch\s*\(/.test(source), `${sourceFile}: network fetch is forbidden`);
  assert(
    !/\bfrom\s+["'](?:axios|openai|@google\/generative-ai|@anthropic-ai\/sdk)["']/i.test(source),
    `${sourceFile}: model/network client import found`,
  );
  assert(!/https?:\/\/(?:openrouter|generativelanguage)\./i.test(source), `${sourceFile}: provider URL found`);
  if (sourceFile !== "verify.mts") {
    assert(
      !/campaign-v5-s1\/private\/s1-queue-v5\.json|corpus\/v3\/private\/input-snapshot\.json/.test(
        source,
      ),
      `${sourceFile}: normal build source names an external reference input`,
    );
    assert(
      !/(?:from\s+["'][^"']*refresh-local-reference-fixture|import\s*\(\s*["'][^"']*refresh-local-reference-fixture|(?:spawnSync|execFileSync|execSync)\s*\([^)]*refresh-local-reference-fixture)/.test(
        source,
      ),
      `${sourceFile}: normal build must not import or invoke the generation-only refresher`,
    );
  }
}

const refreshSource = readFileSync(path.join(here, "refresh-local-reference-fixture.mts"), "utf8");
assert(!/\bfetch\s*\(/.test(refreshSource), "fixture refresher must remain local-only");
assert(
  !/\bfrom\s+["'](?:axios|openai|@google\/generative-ai|@anthropic-ai\/sdk)["']/i.test(
    refreshSource,
  ),
  "fixture refresher contains a model/network client",
);

const publicArtifact = JSON.parse(publicBytes) as {
  schemaVersion: string;
  revisionId: string;
  aggregate: {
    rowCount: number;
    questionTypeCounts: Record<string, number>;
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
  originality: {
    crossRow: { sharedNgramCount: number };
    selectedLocalCorpus: Array<{
      exactNormalizedDuplicates: number;
      sharedNgramCount: number;
    }>;
  };
};
assert.equal(publicArtifact.schemaVersion, "question-quality-original-s1-v6-public-v2");
assert.equal(publicArtifact.revisionId, "original-s1-v6-remediation-v1");
assert.equal(publicArtifact.aggregate.rowCount, 12);
assert.deepEqual(publicArtifact.aggregate.questionTypeCounts, {
  BLANK_INFERENCE: 6,
  GRAMMAR_ERROR: 6,
});
assert.equal(publicArtifact.aggregate.grammarAffordanceBindingCount, 30);
assert.deepEqual(publicArtifact.aggregate.blankRecommendedPositionCounts, {
  INTERNAL: 5,
  TERMINAL: 1,
});
assert.equal(publicArtifact.aggregate.blankFinalOrPenultimateCount, 1);
assert.equal(publicArtifact.aggregate.blankInternalCount, 5);
assert.equal(publicArtifact.aggregate.blankInternalContrastOrCounterexampleCount, 3);
assert.equal(publicArtifact.aggregate.blankInternalAnaphoricOrCausalBridgeCount, 1);
assert.equal(publicArtifact.aggregate.blankDualDifficultyCoverageCount, 6);
assert(publicArtifact.aggregate.maximumPostBlankContentJaccard < 0.2);
assert.equal(publicArtifact.admission.generationAuthorized, false);
assert.equal(publicArtifact.originality.crossRow.sharedNgramCount, 0);
for (const result of publicArtifact.originality.selectedLocalCorpus) {
  assert.equal(result.exactNormalizedDuplicates, 0);
  assert.equal(result.sharedNgramCount, 0);
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      rowCount: 12,
      grammarRows: 6,
      blankRows: 6,
      privateExactTextGitIgnored: true,
      privateHashedReferenceFixtureGitIgnored: true,
      normalBuildExternalReferenceReads: 0,
      publicTextLeakWindows: 0,
      crossRowFiveGramOverlap: 0,
      selectedLocalEightGramOverlap: 0,
      grammarAffordanceBindings: 30,
      blankInternalSites: 5,
      blankFinalOrPenultimateSites: 1,
      blankInternalContrastOrCounterexampleSites: 3,
      blankInternalAnaphoricOrCausalBridgeSites: 1,
      blankDualDifficultyCoverage: 6,
      publicArtifactSha256: sha256(publicBytes),
      manifestSha256: sha256(expectedManifest),
      apiCalls: 0,
      networkCalls: 0,
    },
    null,
    2,
  ),
);
