import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

const BASE = dirname(fileURLToPath(import.meta.url));
const EXPECTED_ROWS = 186;
const OUTCOMES = ["PASS", "EXCLUDE", "DOMAIN_REVIEW"] as const;
const RATINGS = ["PASS", "FAIL", "DOMAIN_REVIEW"] as const;
const CRITERIA = [
  "sourceIntegrity",
  "contextCoherence",
  "core10SiteFeasibility",
  "minimalMutationUniqueCorrection",
  "nonlocalDependencyWindow",
  "ambiguityFree",
  "noRewriteOrDomainPremise",
] as const;
const REASON_CODES = [
  "SOURCE_OPENING_INCOMPLETE",
  "SOURCE_ENDING_INCOMPLETE",
  "SOURCE_INTERNAL_OMISSION",
  "SOURCE_SEMANTIC_CONTRADICTION",
  "SENTENCE_BOUNDARY_CORRUPTION",
  "ENCODING_OR_CONTROL_DEFECT",
  "SOURCE_ORTHOGRAPHY_DEFECT",
  "CONTEXT_DEPENDENCY_UNRESOLVED",
  "PREEXISTING_GRAMMAR_DEFECT",
  "NO_CORE10_SITE",
  "MUTATION_NOT_UNAMBIGUOUS",
  "CORRECTION_NOT_UNIQUE",
  "NONLOCAL_WINDOW_INSUFFICIENT",
  "OPTIONAL_OR_DIALECT_AMBIGUITY",
  "QUOTATION_LANGUAGE_EXCEPTION",
  "DOUBLE_OBJECT_PASSIVE_AMBIGUITY",
  "PUNCTUATION_ARTIFACT",
  "REWRITE_REQUIRED",
  "UNSTATED_DOMAIN_PREMISE",
  "SPECIALIST_LANGUAGE_REVIEW_REQUIRED",
] as const;
const SITE_FIELDS = [
  "family",
  "sourceForm",
  "mutation",
  "governor",
  "dependent",
  "dependencyWindow",
  "strongestAlternativeParse",
  "uniqueCorrectionRationale",
] as const;
const ALLOWED_FAMILIES = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "k"]);
const MANIFEST_FILES = [
  "private/reviewer-a.json",
  "reviewer-a-summary.json",
  "REVIEWER-A-AUDIT.md",
  "verify-reviewer-a.mts",
] as const;

type Rating = (typeof RATINGS)[number];
type Criterion = (typeof CRITERIA)[number];

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath: string): string {
  return readFileSync(resolve(BASE, relativePath), "utf8").replace(/^\uFEFF/u, "");
}

function readJson(relativePath: string): JsonRecord {
  const parsed = JSON.parse(readText(relativePath)) as unknown;
  return asRecord(parsed, relativePath);
}

function sha256(relativePath: string): string {
  return createHash("sha256").update(readFileSync(resolve(BASE, relativePath))).digest("hex");
}

function asRecord(value: unknown, label: string): JsonRecord {
  check(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function asRecords(value: unknown, label: string): JsonRecord[] {
  return asArray(value, label).map((item, index) => asRecord(item, `${label}[${index}]`));
}

function asString(value: unknown, label: string): string {
  check(typeof value === "string", `${label} must be a string`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  check(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  check(typeof value === "boolean", `${label} must be a boolean`);
  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  return asArray(value, label).map((item, index) => asString(item, `${label}[${index}]`));
}

function exactKeys(record: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  check(JSON.stringify(actual) === JSON.stringify(wanted), `${label} has unexpected or missing fields`);
}

function exactStringArray(actual: string[], expected: readonly string[], label: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label} does not match the frozen vocabulary`);
  check(new Set(actual).size === actual.length, `${label} contains duplicates`);
}

function isMember<T extends string>(value: string, choices: readonly T[]): value is T {
  return (choices as readonly string[]).includes(value);
}

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function checkNoFragments(publicText: string, sensitiveText: string, width: number, label: string): void {
  const publicNormalized = normalize(publicText);
  const sensitiveNormalized = normalize(sensitiveText);
  if (sensitiveNormalized.length < width) {
    return;
  }

  const starts = new Set<number>();
  for (let start = 0; start <= sensitiveNormalized.length - width; start += Math.max(1, Math.floor(width / 2))) {
    starts.add(start);
  }
  starts.add(sensitiveNormalized.length - width);
  for (const start of starts) {
    const fragment = sensitiveNormalized.slice(start, start + width);
    check(!publicNormalized.includes(fragment), `${label} leaked into a public Reviewer A artifact`);
  }
}

function increment<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] += 1;
}

function zeroCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function verifyCountRecord(
  value: unknown,
  keys: readonly string[],
  expected: Record<string, number>,
  label: string,
): void {
  const record = asRecord(value, label);
  exactKeys(record, keys, label);
  for (const key of keys) {
    check(asNumber(record[key], `${label}.${key}`) === expected[key], `${label}.${key} is inconsistent`);
  }
}

const publicSource = readJson("source-frame-public.json");
const privateSource = readJson("private/source-frame-private.json");
const review = readJson("private/reviewer-a.json");
const summaryText = readText("reviewer-a-summary.json");
const summary = asRecord(JSON.parse(summaryText) as unknown, "reviewer-a-summary.json");
const auditText = readText("REVIEWER-A-AUDIT.md");

exactKeys(
  review,
  [
    "schemaVersion",
    "reviewer",
    "status",
    "lens",
    "protocolFileSha256",
    "sourcePublicFileSha256",
    "sourcePrivateFileSha256",
    "bindingHash",
    "outcomeVocabulary",
    "criterionRatingVocabulary",
    "reasonCodeVocabulary",
    "criterionFields",
    "campaignEligible",
    "holds",
    "safety",
    "rows",
  ],
  "private reviewer artifact",
);
check(asNumber(review.schemaVersion, "review.schemaVersion") === 1, "review schema version must be 1");
check(asString(review.reviewer, "review.reviewer") === "A", "reviewer must be A");
check(asString(review.status, "review.status") === "FROZEN_FULL_CENSUS", "review must be frozen after full census");
check(
  asString(review.lens, "review.lens") === "SOURCE_INTEGRITY_AND_UNAMBIGUOUS_CORE10_SITE_FEASIBILITY",
  "review lens is incorrect",
);
exactStringArray(asStringArray(review.outcomeVocabulary, "review.outcomeVocabulary"), OUTCOMES, "outcome vocabulary");
exactStringArray(
  asStringArray(review.criterionRatingVocabulary, "review.criterionRatingVocabulary"),
  RATINGS,
  "criterion rating vocabulary",
);
exactStringArray(
  asStringArray(review.reasonCodeVocabulary, "review.reasonCodeVocabulary"),
  REASON_CODES,
  "reason-code vocabulary",
);
exactStringArray(asStringArray(review.criterionFields, "review.criterionFields"), CRITERIA, "criterion fields");

check(
  asString(review.protocolFileSha256, "review.protocolFileSha256") === sha256("REVIEW-PROTOCOL.md"),
  "protocol file hash mismatch",
);
check(
  asString(review.sourcePublicFileSha256, "review.sourcePublicFileSha256") === sha256("source-frame-public.json"),
  "public source file hash mismatch",
);
check(
  asString(review.sourcePrivateFileSha256, "review.sourcePrivateFileSha256") ===
    sha256("private/source-frame-private.json"),
  "private source file hash mismatch",
);
const bindingHash = asString(review.bindingHash, "review.bindingHash");
check(asString(publicSource.bindingHash, "publicSource.bindingHash") === bindingHash, "public binding hash mismatch");
check(asString(privateSource.bindingHash, "privateSource.bindingHash") === bindingHash, "private binding hash mismatch");

const publicRows = asRecords(publicSource.rows, "publicSource.rows");
const privateRows = asRecords(privateSource.rows, "privateSource.rows");
const reviewRows = asRecords(review.rows, "review.rows");
check(publicRows.length === EXPECTED_ROWS, "public source must contain 186 rows");
check(privateRows.length === EXPECTED_ROWS, "private source must contain 186 rows");
check(reviewRows.length === EXPECTED_ROWS, "Reviewer A must contain 186 decisions");

const outcomeCounts = zeroCounts(OUTCOMES);
const reasonCounts = zeroCounts(REASON_CODES);
const criterionCounts = Object.fromEntries(
  CRITERIA.map((criterion) => [criterion, zeroCounts(RATINGS)]),
) as Record<Criterion, Record<Rating, number>>;
const seenFrameIds = new Set<string>();
const seenContentHashes = new Set<string>();

reviewRows.forEach((row, index) => {
  const label = `review row ${index + 1}`;
  exactKeys(row, ["frameId", "contentHash", "outcome", "criteria", "reasonCodes", "privateNotes", "siteReasoning"], label);
  const frameId = asString(row.frameId, `${label}.frameId`);
  const contentHash = asString(row.contentHash, `${label}.contentHash`);
  check(/^grammar-frame-v2-\d{3}$/u.test(frameId), `${label} has malformed frameId`);
  check(/^[a-f0-9]{64}$/u.test(contentHash), `${label} has malformed contentHash`);
  check(!seenFrameIds.has(frameId), `${label} duplicates a frameId`);
  check(!seenContentHashes.has(contentHash), `${label} duplicates a contentHash`);
  seenFrameIds.add(frameId);
  seenContentHashes.add(contentHash);

  for (const sourceRow of [publicRows[index], privateRows[index]]) {
    check(asString(sourceRow.frameId, `${label} bound frameId`) === frameId, `${label} frameId is out of binding order`);
    check(
      asString(sourceRow.contentHash, `${label} bound contentHash`) === contentHash,
      `${label} contentHash is out of binding order`,
    );
  }
  check(asBoolean(publicRows[index].campaignEligible, `${label} public campaignEligible`) === false, `${label} was authorized`);

  const outcome = asString(row.outcome, `${label}.outcome`);
  check(isMember(outcome, OUTCOMES), `${label} has an invalid outcome`);
  increment(outcomeCounts, outcome);

  const criteria = asRecord(row.criteria, `${label}.criteria`);
  exactKeys(criteria, CRITERIA, `${label}.criteria`);
  const rowRatings: Rating[] = [];
  for (const criterion of CRITERIA) {
    const rating = asString(criteria[criterion], `${label}.criteria.${criterion}`);
    check(isMember(rating, RATINGS), `${label}.${criterion} has an invalid rating`);
    rowRatings.push(rating);
    increment(criterionCounts[criterion], rating);
  }

  const reasonCodes = asStringArray(row.reasonCodes, `${label}.reasonCodes`);
  check(new Set(reasonCodes).size === reasonCodes.length, `${label} has duplicate reason codes`);
  for (const reasonCode of reasonCodes) {
    check(isMember(reasonCode, REASON_CODES), `${label} has an invalid reason code`);
    increment(reasonCounts, reasonCode);
  }

  if (outcome === "PASS") {
    check(rowRatings.every((rating) => rating === "PASS"), `${label} PASS has a non-PASS criterion`);
    check(reasonCodes.length === 0, `${label} PASS has a reason code`);
  } else if (outcome === "EXCLUDE") {
    check(rowRatings.includes("FAIL"), `${label} EXCLUDE has no failed criterion`);
    check(!rowRatings.includes("DOMAIN_REVIEW"), `${label} EXCLUDE mixes a domain-review criterion`);
    check(reasonCodes.length > 0, `${label} EXCLUDE has no reason code`);
  } else {
    check(rowRatings.includes("DOMAIN_REVIEW"), `${label} DOMAIN_REVIEW has no domain-review criterion`);
    check(!rowRatings.includes("FAIL"), `${label} DOMAIN_REVIEW mixes a failed criterion`);
    check(reasonCodes.length > 0, `${label} DOMAIN_REVIEW has no reason code`);
  }

  const privateNotes = asString(row.privateNotes, `${label}.privateNotes`);
  check(privateNotes === privateNotes.trim() && privateNotes.length >= 120, `${label} private notes are not substantive`);

  const site = asRecord(row.siteReasoning, `${label}.siteReasoning`);
  exactKeys(site, SITE_FIELDS, `${label}.siteReasoning`);
  for (const field of SITE_FIELDS) {
    const value = asString(site[field], `${label}.siteReasoning.${field}`);
    check(value === value.trim() && value.length > 0, `${label}.${field} is empty or untrimmed`);
  }
  const family = asString(site.family, `${label}.siteReasoning.family`);
  check(ALLOWED_FAMILIES.has(family), `${label} uses a non-Core-10 family`);
  check(
    asString(site.sourceForm, `${label}.siteReasoning.sourceForm`) !==
      asString(site.mutation, `${label}.siteReasoning.mutation`),
    `${label} source form and mutation are identical`,
  );
  check(asString(site.dependent, `${label}.siteReasoning.dependent`).length >= 20, `${label} dependent is underspecified`);
  check(
    asString(site.dependencyWindow, `${label}.siteReasoning.dependencyWindow`).length >= 50,
    `${label} dependency window is underspecified`,
  );
  check(
    asString(site.strongestAlternativeParse, `${label}.siteReasoning.strongestAlternativeParse`).length >= 50,
    `${label} alternative parse is underspecified`,
  );
  check(
    asString(site.uniqueCorrectionRationale, `${label}.siteReasoning.uniqueCorrectionRationale`).length >= 40,
    `${label} correction rationale is underspecified`,
  );
});

check(asNumber(review.campaignEligible, "review.campaignEligible") === 0, "review campaignEligible must remain zero");
const holds = asRecord(review.holds, "review.holds");
exactKeys(holds, ["rights", "historyExposure", "providerAuthorization"], "review.holds");
for (const key of ["rights", "historyExposure", "providerAuthorization"] as const) {
  check(asString(holds[key], `review.holds.${key}`) === "HOLD", `review hold ${key} was released`);
}
const safety = asRecord(review.safety, "review.safety");
exactKeys(
  safety,
  ["modelApiCalls", "networkCalls", "databaseCalls", "secretAccesses", "fullQuestionCandidatesGenerated"],
  "review.safety",
);
for (const key of Object.keys(safety)) {
  check(asNumber(safety[key], `review.safety.${key}`) === 0, `review safety counter ${key} is nonzero`);
}

exactKeys(
  summary,
  [
    "schemaVersion",
    "reviewer",
    "status",
    "lens",
    "census",
    "outcomes",
    "criteria",
    "reasonCodeCounts",
    "independence",
    "campaignEligible",
    "holds",
    "safety",
    "privacy",
  ],
  "public summary",
);
check(asNumber(summary.schemaVersion, "summary.schemaVersion") === 1, "summary schema version must be 1");
check(asString(summary.reviewer, "summary.reviewer") === "A", "summary reviewer must be A");
check(asString(summary.status, "summary.status") === "FROZEN_FULL_CENSUS", "summary must be frozen");
check(asString(summary.lens, "summary.lens") === asString(review.lens, "review.lens"), "summary lens mismatch");

const census = asRecord(summary.census, "summary.census");
exactKeys(
  census,
  ["boundRows", "reviewedRows", "coverage", "samplingUsed", "delegationUsed", "replacementOrTopUpUsed", "skippedRows"],
  "summary.census",
);
check(asNumber(census.boundRows, "summary.census.boundRows") === EXPECTED_ROWS, "summary bound-row count mismatch");
check(asNumber(census.reviewedRows, "summary.census.reviewedRows") === EXPECTED_ROWS, "summary reviewed-row count mismatch");
check(asString(census.coverage, "summary.census.coverage") === "FULL_CENSUS", "summary coverage is not full census");
check(asBoolean(census.samplingUsed, "summary.census.samplingUsed") === false, "summary reports sampling");
check(asBoolean(census.delegationUsed, "summary.census.delegationUsed") === false, "summary reports delegated review");
check(
  asBoolean(census.replacementOrTopUpUsed, "summary.census.replacementOrTopUpUsed") === false,
  "summary reports replacement or top-up",
);
check(asNumber(census.skippedRows, "summary.census.skippedRows") === 0, "summary reports skipped rows");

verifyCountRecord(summary.outcomes, OUTCOMES, outcomeCounts, "summary.outcomes");
const summaryCriteria = asRecord(summary.criteria, "summary.criteria");
exactKeys(summaryCriteria, CRITERIA, "summary.criteria");
for (const criterion of CRITERIA) {
  verifyCountRecord(summaryCriteria[criterion], RATINGS, criterionCounts[criterion], `summary.criteria.${criterion}`);
}
verifyCountRecord(summary.reasonCodeCounts, REASON_CODES, reasonCounts, "summary.reasonCodeCounts");

const independence = asRecord(summary.independence, "summary.independence");
const independenceKeys = [
  "reviewerBArtifactsRead",
  "reviewerBMessagesRead",
  "blankReviewerDecisionsRead",
  "generatedQuestionsRead",
  "productionValidatorsRead",
  "semanticClassificationAutomated",
] as const;
exactKeys(independence, independenceKeys, "summary.independence");
for (const key of independenceKeys) {
  check(asBoolean(independence[key], `summary.independence.${key}`) === false, `independence flag ${key} is not false`);
}
check(asNumber(summary.campaignEligible, "summary.campaignEligible") === 0, "summary campaignEligible must remain zero");

const summaryHolds = asRecord(summary.holds, "summary.holds");
exactKeys(summaryHolds, ["rights", "historyExposure", "providerAuthorization"], "summary.holds");
for (const key of ["rights", "historyExposure", "providerAuthorization"] as const) {
  check(asString(summaryHolds[key], `summary.holds.${key}`) === "HOLD", `summary hold ${key} was released`);
}
const summarySafety = asRecord(summary.safety, "summary.safety");
exactKeys(
  summarySafety,
  ["modelApiCalls", "networkCalls", "databaseCalls", "secretAccesses", "fullQuestionCandidatesGenerated"],
  "summary.safety",
);
for (const key of Object.keys(summarySafety)) {
  check(asNumber(summarySafety[key], `summary.safety.${key}`) === 0, `summary safety counter ${key} is nonzero`);
}
const privacy = asRecord(summary.privacy, "summary.privacy");
const privacyKeys = [
  "containsFrameIds",
  "containsContentHashes",
  "containsPassageText",
  "containsPrivateSourceIdentifiers",
  "containsCandidateSites",
  "containsPrivateNotes",
  "containsRowLevelOutcomes",
] as const;
exactKeys(privacy, privacyKeys, "summary.privacy");
for (const key of privacyKeys) {
  check(asBoolean(privacy[key], `summary.privacy.${key}`) === false, `summary privacy flag ${key} is not false`);
}

const publicArtifactText = `${summaryText}\n${auditText}`;
check(!/grammar-frame-v2-\d{3}/u.test(publicArtifactText), "a frame ID leaked into a public Reviewer A artifact");
check(!/\b[a-f0-9]{64}\b/iu.test(publicArtifactText), "a 64-character hash leaked into a public Reviewer A artifact");

privateRows.forEach((row, index) => {
  const label = `private source row ${index + 1}`;
  for (const key of ["frameId", "contentHash", "candidateId", "sourceRecordId", "documentKey", "sourceDocumentId"] as const) {
    const value = asString(row[key], `${label}.${key}`);
    check(!publicArtifactText.includes(value), `${label}.${key} leaked into a public Reviewer A artifact`);
  }
  checkNoFragments(publicArtifactText, asString(row.passageText, `${label}.passageText`), 80, `${label} passage text`);
});

reviewRows.forEach((row, index) => {
  const label = `review row ${index + 1}`;
  checkNoFragments(publicArtifactText, asString(row.privateNotes, `${label}.privateNotes`), 60, `${label} private notes`);
  const site = asRecord(row.siteReasoning, `${label}.siteReasoning`);
  for (const key of [
    "governor",
    "dependent",
    "dependencyWindow",
    "strongestAlternativeParse",
    "uniqueCorrectionRationale",
  ] as const) {
    checkNoFragments(publicArtifactText, asString(site[key], `${label}.${key}`), 24, `${label} candidate-site reasoning`);
  }
});

for (const requiredText of [
  "186 of 186",
  "PASS: 142",
  "EXCLUDE: 40",
  "DOMAIN_REVIEW: 4",
  "campaign-eligible count remains 0",
  "No API, network, database, secret, or full-question generation access occurred",
]) {
  check(auditText.includes(requiredText), `audit is missing required statement: ${requiredText}`);
}

const manifestLines = readText("REVIEWER-A-MANIFEST.sha256").trim().split(/\r?\n/u);
check(manifestLines.length === MANIFEST_FILES.length, "Reviewer A manifest has the wrong number of entries");
manifestLines.forEach((line, index) => {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  check(match !== null, `manifest line ${index + 1} is malformed`);
  const [, declaredHash, relativePath] = match;
  check(relativePath === MANIFEST_FILES[index], `manifest line ${index + 1} has an unexpected path or order`);
  check(declaredHash === sha256(relativePath), `manifest entry ${index + 1} has a hash mismatch`);
});

console.log("Reviewer A verification passed: 186 rows, full census, aggregates and privacy checks consistent.");
