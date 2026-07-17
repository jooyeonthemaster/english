import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const privatePath = path.join(here, "private/pilot-source.private.json");
const publicPath = path.join(here, "source-public.json");

interface PrivateArtifact {
  schemaVersion: string;
  artifactId: string;
  campaignScopeId: string;
  row: {
    publicId: string;
    questionType: string;
    passageText: string;
    provenance: {
      origin: string;
      webSearchUsed: boolean;
      externalApiUsed: boolean;
      externalModelUsed: boolean;
      copiedOrAdapted: boolean;
      sourceCitation: null;
      thirdPartyPermissionClaimed: boolean;
      piiManuallyObserved: boolean;
      processingScopeStatus: string;
    };
  };
}

interface PublicArtifact {
  schemaVersion: string;
  artifactId: string;
  status: string;
  campaignScopeId: string;
  row: {
    publicId: string;
    questionType: string;
    wordCount: number;
    sentenceCount: number;
    passageUtf8Bytes: number;
    passageSha256: string;
    provenanceStatus: string;
    processingScopeStatus: string;
    thirdPartyPermissionClaimed: boolean;
    machinePiiPatternHits: number;
    manualPiiObserved: boolean;
  };
  privateBoundary: {
    exactTextGitIgnored: boolean;
    publicContainsPassageText: boolean;
    privateArtifactUtf8Bytes: number;
    privateArtifactSha256: string;
  };
  separation: {
    excludedFromS1S2S3S4: boolean;
    excludedFromProfileSelection: boolean;
    minimumEightTokenOverlapWithS1V6Rows: number;
  };
  authorization: { generationAuthorized: boolean; apiCandidatesConsumed: number };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function ngrams(value: string, size: number): Set<string> {
  const tokens = words(value);
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

const privateBytes = readFileSync(privatePath);
const privateArtifact = JSON.parse(privateBytes.toString("utf8")) as PrivateArtifact;
const publicBytes = readFileSync(publicPath, "utf8");
const publicArtifact = JSON.parse(publicBytes) as PublicArtifact;
const passage = privateArtifact.row.passageText;

assert.equal(privateArtifact.schemaVersion, "question-quality-original-connectivity-pilot-private-v1");
assert.equal(publicArtifact.schemaVersion, "question-quality-original-connectivity-pilot-public-v1");
assert.equal(privateArtifact.artifactId, publicArtifact.artifactId);
assert.equal(privateArtifact.campaignScopeId, publicArtifact.campaignScopeId);
assert.equal(privateArtifact.row.publicId, publicArtifact.row.publicId);
assert.equal(privateArtifact.row.questionType, "BLANK_INFERENCE");
assert.equal(publicArtifact.row.questionType, "BLANK_INFERENCE");
assert.equal(publicArtifact.status, "SEALED_ORIGINAL_RUN_IN_SOURCE_NOT_DISPATCH_AUTHORIZATION");
assert.equal(passage, passage.trim());
assert(!/[\r\n]/.test(passage));
assert(/^[\x20-\x7e]+$/.test(passage));
assert.equal(words(passage).length, publicArtifact.row.wordCount);
assert.equal((passage.match(/[.!?](?=\s|$)/g) ?? []).length, publicArtifact.row.sentenceCount);
assert.equal(Buffer.byteLength(passage, "utf8"), publicArtifact.row.passageUtf8Bytes);
assert.equal(sha256(passage), publicArtifact.row.passageSha256);
assert.equal(privateBytes.byteLength, publicArtifact.privateBoundary.privateArtifactUtf8Bytes);
assert.equal(sha256(privateBytes), publicArtifact.privateBoundary.privateArtifactSha256);

const provenance = privateArtifact.row.provenance;
assert.equal(provenance.origin, publicArtifact.row.provenanceStatus);
assert.equal(provenance.webSearchUsed, false);
assert.equal(provenance.externalApiUsed, false);
assert.equal(provenance.externalModelUsed, false);
assert.equal(provenance.copiedOrAdapted, false);
assert.equal(provenance.sourceCitation, null);
assert.equal(provenance.thirdPartyPermissionClaimed, false);
assert.equal(provenance.piiManuallyObserved, false);
assert.equal(provenance.processingScopeStatus, publicArtifact.row.processingScopeStatus);

const piiPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:https?:\/\/|www\.)\S+/i,
  /(^|\s)@[a-z0-9_]+/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /(?:\+?\d[\d(). -]{7,}\d)/,
  /\b\d{6,}\b/,
  /\b\d{6}-[1-4]\d{6}\b/,
];
const piiHits = piiPatterns.filter((pattern) => pattern.test(passage)).length;
assert.equal(piiHits, 0);
assert.equal(publicArtifact.row.machinePiiPatternHits, 0);
assert.equal(publicArtifact.row.manualPiiObserved, false);

const relativePrivatePath = path.relative(repoRoot, privatePath).replaceAll("\\", "/");
execFileSync("git", ["check-ignore", "--quiet", "--", relativePrivatePath], {
  cwd: repoRoot,
  stdio: "ignore",
});
assert.equal(publicArtifact.privateBoundary.exactTextGitIgnored, true);
assert.equal(publicArtifact.privateBoundary.publicContainsPassageText, false);
assert(!publicBytes.includes(passage));
for (const window of ngrams(passage, 12)) assert(!publicBytes.toLowerCase().includes(window));

const s1Private = JSON.parse(
  readFileSync(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/corpus/original-s1-v6/private/original-passages.private.json",
    ),
    "utf8",
  ),
) as { rows: Array<{ passageText: string }> };
const pilotEight = ngrams(passage, 8);
let overlapCount = 0;
for (const row of s1Private.rows) {
  for (const gram of ngrams(row.passageText, 8)) {
    if (pilotEight.has(gram)) overlapCount += 1;
  }
}
assert.equal(overlapCount, publicArtifact.separation.minimumEightTokenOverlapWithS1V6Rows);
assert.equal(overlapCount, 0);
assert.equal(publicArtifact.separation.excludedFromS1S2S3S4, true);
assert.equal(publicArtifact.separation.excludedFromProfileSelection, true);
assert.equal(publicArtifact.authorization.generationAuthorized, false);
assert.equal(publicArtifact.authorization.apiCandidatesConsumed, 0);

const manifestPath = path.join(here, "MANIFEST.sha256");
if (existsSync(manifestPath)) {
  for (const line of readFileSync(manifestPath, "utf8").trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    assert.equal(sha256(readFileSync(path.join(here, match[2]))), match[1]);
  }
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS_ORIGINAL_RUN_IN_SOURCE_NOT_DISPATCH_AUTHORIZATION",
      publicArtifactSha256: sha256(publicBytes),
      privateArtifactSha256: sha256(privateBytes),
      wordCount: publicArtifact.row.wordCount,
      s1EightGramOverlap: overlapCount,
      apiCandidatesConsumed: 0,
      networkCalls: 0,
    },
    null,
    2,
  ),
);
