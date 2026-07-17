import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const [sourcePathArg, outputDirectoryArg, authorSeal] = process.argv.slice(2);
if (!sourcePathArg || !outputDirectoryArg || !/^[a-f0-9]{64}$/u.test(authorSeal ?? "")) {
  throw new Error(
    "usage: node extract_blind.mjs <sealed-cases.json> <output-directory> <64-hex-author-seal>",
  );
}

const sourcePath = path.resolve(sourcePathArg);
const outputDirectory = path.resolve(outputDirectoryArg);
const extractorPath = fileURLToPath(import.meta.url);
const [sourceBytes, extractorBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(extractorPath),
]);
const sourceSha256 = sha256(sourceBytes);
const extractorSha256 = sha256(extractorBytes);
const source = JSON.parse(sourceBytes.toString("utf8"));

if (!Array.isArray(source.cases) || source.cases.length !== 200) {
  throw new Error(`expected exactly 200 cases, received ${source.cases?.length ?? "none"}`);
}

// The shuffle key depends only on the already-public payload seal and a fixed
// domain separator. It never reads the expected label, source id, pair id, or
// rationale, so source authoring order and D/N-style ids do not reach the
// prediction process.
const shuffled = source.cases
  .map((caseValue, sourceIndex) => ({
    caseValue,
    sourceIndex,
    orderKey: sha256(`${authorSeal}\0independent-v10-blind-order\0${sourceIndex}`),
  }))
  .sort((left, right) => left.orderKey.localeCompare(right.orderKey));

const mapping = [];
const cases = shuffled.map(({ caseValue, sourceIndex }, blindIndex) => {
  if (!caseValue || typeof caseValue !== "object" || Array.isArray(caseValue)) {
    throw new Error(`case at source index ${sourceIndex} is not an object`);
  }
  const blindId = `B${String(blindIndex + 1).padStart(3, "0")}`;
  mapping.push({
    blindId,
    sourceIndex,
    sourceId: String(caseValue.id ?? ""),
  });
  const projected = {
    blindId,
    family: caseValue.family,
    language: caseValue.language,
    fixture: projectFixture(caseValue.fixture, caseValue.family, blindId),
  };
  assertNoOracleMetadata(projected, blindId);
  return projected;
});

const blindPayload = {
  schemaVersion: "deterministic-structural-v10-independent-blind-v1",
  sourceSha256,
  authorSeal,
  extractorSha256,
  caseCount: cases.length,
  cases,
};
const blindBytes = canonicalJsonBytes(blindPayload);
const blindSha256 = sha256(blindBytes);
const mappingPayload = {
  schemaVersion: "deterministic-structural-v10-independent-map-v1",
  sourceSha256,
  blindSha256,
  caseCount: mapping.length,
  mapping,
};
const mappingBytes = canonicalJsonBytes(mappingPayload);
const mappingSha256 = sha256(mappingBytes);
const receipt = {
  schemaVersion: "deterministic-structural-v10-independent-extraction-receipt-v1",
  authorSeal,
  sourcePath,
  sourceSha256,
  extractorPath,
  extractorSha256,
  blindPath: path.join(outputDirectory, "blinded-cases.json"),
  blindSha256,
  mappingPath: path.join(outputDirectory, "sealed-blind-map.json"),
  mappingSha256,
  caseCount: cases.length,
  projectionFields: ["blindId", "family", "language", "fixture"],
  removedTopLevelFields: [
    "id",
    "pairId",
    "expected",
    "oracleReason",
  ],
  removedFixtureAnalysisFields: [
    "unitAnalysis",
    "leadingReference",
    "carrier.quotedText",
    "renderedLabelInventory.state",
  ],
  authoringOrderRemoved: true,
};

await Promise.all([
  writeFile(path.join(outputDirectory, "blinded-cases.json"), blindBytes),
  writeFile(path.join(outputDirectory, "sealed-blind-map.json"), mappingBytes),
  writeFile(
    path.join(outputDirectory, "BLIND_EXTRACTION.json"),
    canonicalJsonBytes(receipt),
  ),
]);

process.stdout.write(
  [
    "BLIND_EXTRACTION_OK",
    `COUNT ${cases.length}`,
    `SOURCE_SHA256 ${sourceSha256}`,
    `EXTRACTOR_SHA256 ${extractorSha256}`,
    `BLIND_SHA256 ${blindSha256}`,
    `SEALED_MAP_SHA256 ${mappingSha256}`,
  ].join("\n") + "\n",
);

function assertNoOracleMetadata(value, location) {
  const forbidden = /^(?:id|pair(?:id)?|expected|oracle(?:reason)?|reason|rationale|classificationlabels)$/iu;
  const visit = (node, pointer) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      // blindId is generated locally and conveys no source identity.
      if (key !== "blindId" && forbidden.test(key)) {
        throw new Error(`forbidden metadata key ${key} at ${pointer}`);
      }
      visit(child, `${pointer}/${key}`);
    }
  };
  visit(value, location);
}

function projectFixture(fixture, family, blindId) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error(`fixture for ${blindId} is not an object`);
  }
  switch (family) {
    case "SUMMARY_COMPLETE_MC":
      return {
        type: fixture.type,
        options: fixture.options,
        storedKey: fixture.storedKey,
        carrier: {
          authority: fixture.carrier?.authority,
          kind: fixture.carrier?.kind,
          text: fixture.carrier?.text,
        },
      };
    case "GRAMMAR_ERROR_LEADING_LABEL":
      return {
        type: fixture.type,
        renderedLabels: fixture.renderedLabelInventory?.labels,
        keyPoint: fixture.keyPoint,
      };
    case "SENTENCE_ORDER_COMPLETE_UNITS":
      return {
        type: fixture.type,
        paragraphs: fixture.paragraphs,
      };
    case "SENTENCE_ORDER_STANDALONE_LABELS":
      return {
        type: fixture.type,
        entries: fixture.entries,
        incidentalMentions: fixture.incidentalMentions,
      };
    default:
      throw new Error(`unknown family ${String(family)} at ${blindId}`);
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
