import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const outputPath = path.join(here, "private/local-reference-ngram-commitments.private.json");
const ngramSize = 8;

const sources = [
  {
    label: "campaign-v5-s1-selected-passages",
    relativePath:
      "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json",
    readPassages(value: unknown): string[] {
      const parsed = value as { passages: Array<{ passageContentExact: string }> };
      return parsed.passages.map((row) => row.passageContentExact);
    },
  },
  {
    label: "corpus-v3-retained-selected-passages",
    relativePath: "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
    readPassages(value: unknown): string[] {
      const parsed = value as { retained: Array<{ candidate: { text: string } }> };
      return parsed.retained.map((row) => row.candidate.text);
    },
  },
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function normalizedText(text: string): string {
  return words(text).join(" ");
}

function ngrams(text: string): Set<string> {
  const tokens = words(text);
  const result = new Set<string>();
  for (let index = 0; index + ngramSize <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + ngramSize).join(" "));
  }
  return result;
}

const referenceSets = sources.map((source) => {
  const absolute = path.join(repoRoot, source.relativePath);
  const sourceBytes = readFileSync(absolute);
  const passages = source.readPassages(JSON.parse(sourceBytes.toString("utf8")) as unknown);
  const normalized = [...new Set(passages.map(normalizedText))].sort();
  const gramHashes = new Set<string>();
  for (const passage of normalized) {
    for (const gram of ngrams(passage)) gramHashes.add(sha256(gram));
  }
  return {
    label: source.label,
    provenanceSourcePath: source.relativePath,
    provenanceSourceArtifactSha256: sha256(sourceBytes),
    selectedPassageCount: passages.length,
    uniqueNormalizedPassageCount: normalized.length,
    selectedNormalizedTextSetCommitmentSha256: sha256(JSON.stringify(normalized)),
    normalizedPassageSha256: normalized.map(sha256).sort(),
    ngramSha256: [...gramHashes].sort(),
  };
});

assert.equal(referenceSets[0].selectedPassageCount, 12);
assert.equal(referenceSets[1].selectedPassageCount, 57);

const fixture = {
  schemaVersion: "question-quality-original-s1-v6-local-reference-fixture-v1",
  generatedAtUtc: new Date().toISOString(),
  ngramSize,
  normalization: "lowercase ASCII word tokens; punctuation and whitespace removed",
  hashScheme: "SHA256(UTF8(normalized token string))",
  containsExactReferencePassageText: false,
  containsExactReferenceNgramText: false,
  generationOnlyExternalInputs: true,
  referenceSets,
};
const bytes = `${JSON.stringify(fixture, null, 2)}\n`;
writeFileSync(outputPath, bytes, "utf8");

console.log(
  JSON.stringify(
    {
      status: "WROTE_LOCAL_PRIVATE_HASH_FIXTURE",
      referenceSetCount: referenceSets.length,
      selectedPassageCount: referenceSets.reduce(
        (sum, reference) => sum + reference.selectedPassageCount,
        0,
      ),
      exactReferenceTextStored: false,
      fixtureSha256: sha256(bytes),
      apiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    null,
    2,
  ),
);
