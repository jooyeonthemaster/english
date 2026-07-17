import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessCandidate,
  contentHash,
  countWords,
  normalizeContent,
} from "../../corpus/selector-core";
import { comparisonHash, comparisonText } from "../../corpus/v2/history-index";

type DocumentShape = {
  documentKey: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  year: number | null;
  round: string | null;
  qNumbers: number[];
  originalType: string | null;
};

type Reference = {
  id: string;
  text: string;
  source: string;
  document?: DocumentShape;
};

type Feature = {
  id: string;
  source: string;
  contentHash: string;
  comparisonHash: string;
  tokenCount: number;
  fiveGrams: Set<string>;
  twelveGrams: Set<string>;
  document: DocumentShape;
};

type Match = {
  code: string;
  source: string;
};

type InventoryRecord = {
  id: string;
  family: string;
  text: string;
  sourceDocumentKey: string | null;
  sourceMaterialType: string | null;
  sourceMaterialSubject: string | null;
  sourceExamType: string | null;
  sourceRefPresent: boolean;
  originalFilePresent: boolean;
  academyId: string | null;
  reviewState: string;
  savedOrPromoted: boolean;
  rightsStatus: string;
  officialTraceable: boolean;
  blankEvidence: string;
  blankStemCount: number;
};

type V3Candidate = Parameters<typeof assessCandidate>[0] & {
  document: DocumentShape;
  sourceRecordId: string;
};

type V3Snapshot = Record<string, unknown> & {
  snapshotHash: string;
  candidates: V3Candidate[];
  retained: Array<{ candidate: V3Candidate; split: string }>;
  forbiddenReferences: Reference[];
  historicalPassageIds: string[];
};

type InventorySnapshot = Record<string, unknown> & {
  snapshotHash: string;
  records: InventoryRecord[];
};

type PublicReport = Record<string, unknown> & {
  reportSha256: string;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const PRIVATE = path.join(ROOT, "experiments/question-quality-20260715/corpus/v4-supply/private/inventory-snapshot.json");
const PUBLIC = path.join(ROOT, "experiments/question-quality-20260715/corpus/v4-supply/inventory-public.json");
const V3 = path.join(ROOT, "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json");

const FAMILIES = [
  "committed-passage-current",
  "m1-passage-draft",
  "m2-passage-draft",
  "extraction-item-passage",
  "extraction-result",
  "local-hs-ms",
  "local-test-restoration",
  "local-grammar-drill",
] as const;

const emptyDocument = (): DocumentShape => ({
  documentKey: null,
  sourceKind: null,
  sourceId: null,
  year: null,
  round: null,
  qNumbers: [],
  originalType: null,
});

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function ngrams(tokens: string[], size: number): Set<string> {
  const output = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    output.add(tokens.slice(index, index + size).join(" "));
  }
  return output;
}

function makeFeature(reference: Reference): Feature {
  const tokens = comparisonText(reference.text).split(" ").filter(Boolean);
  return {
    id: reference.id,
    source: reference.source,
    contentHash: contentHash(reference.text),
    comparisonHash: comparisonHash(reference.text),
    tokenCount: tokens.length,
    fiveGrams: ngrams(tokens, 5),
    twelveGrams: ngrams(tokens, 12),
    document: reference.document ?? emptyDocument(),
  };
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const item of small) if (large.has(item)) count += 1;
  return count;
}

function rangesOverlap(left: number[], right: number[]): boolean {
  return left.length > 0 && right.length > 0 && left.some((value) => right.includes(value));
}

function rangesAdjacent(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const leftMin = Math.min(...left);
  const leftMax = Math.max(...left);
  const rightMin = Math.min(...right);
  const rightMax = Math.max(...right);
  return Math.abs(leftMax - rightMin) <= 1 || Math.abs(rightMax - leftMin) <= 1;
}

function compare(left: Feature, right: Feature): Match | null {
  const intersection5 = intersectionSize(left.fiveGrams, right.fiveGrams);
  const union5 = left.fiveGrams.size + right.fiveGrams.size - intersection5;
  const jaccard = union5 === 0 ? 0 : intersection5 / union5;
  const containment = intersection5 / Math.max(1, Math.min(left.fiveGrams.size, right.fiveGrams.size));
  const sharedTwelve = intersectionSize(left.twelveGrams, right.twelveGrams);
  const result = (code: string): Match => ({ code, source: right.source });
  if (left.contentHash === right.contentHash) return result("EXACT_NORMALIZED_HASH");
  if (left.comparisonHash === right.comparisonHash && left.tokenCount >= 40) {
    return result("MARKUP_STRIPPED_EXACT");
  }
  const sameDocument = Boolean(left.document.documentKey) &&
    left.document.documentKey === right.document.documentKey;
  if (sameDocument && rangesOverlap(left.document.qNumbers, right.document.qNumbers)) {
    return result("SOURCE_RANGE_OVERLAP");
  }
  if (sameDocument && rangesAdjacent(left.document.qNumbers, right.document.qNumbers) && sharedTwelve >= 1) {
    return result("SEQUENTIAL_DOCUMENT_FRAGMENT");
  }
  if (jaccard >= 0.45 || containment >= 0.72) return result("FIVE_GRAM_SIMILARITY");
  if (sharedTwelve >= 3 && containment >= 0.35) return result("LONG_CONTIGUOUS_OVERLAP");
  return null;
}

class AuditIndex {
  private readonly records = new Map<string, Feature>();
  private readonly exact = new Map<string, Set<string>>();
  private readonly comparison = new Map<string, Set<string>>();
  private readonly five = new Map<string, Set<string>>();
  private readonly twelve = new Map<string, Set<string>>();
  private readonly documents = new Map<string, Set<string>>();

  constructor(private readonly postingCap: number | null) {}

  private post(index: Map<string, Set<string>>, key: string, recordKey: string): void {
    const values = index.get(key) ?? new Set<string>();
    values.add(recordKey);
    index.set(key, values);
  }

  add(reference: Reference): void {
    const item = makeFeature(reference);
    const key = `${item.source}|${item.id}|${item.contentHash}`;
    if (this.records.has(key)) return;
    this.records.set(key, item);
    this.post(this.exact, item.contentHash, key);
    this.post(this.comparison, item.comparisonHash, key);
    for (const gram of item.fiveGrams) this.post(this.five, gram, key);
    for (const gram of item.twelveGrams) this.post(this.twelve, gram, key);
    if (item.document.documentKey) this.post(this.documents, item.document.documentKey, key);
  }

  query(reference: Reference): Match | null {
    const item = makeFeature(reference);
    const keys = new Set<string>();
    const add = (values: Set<string> | undefined, capped: boolean) => {
      if (!values) return;
      if (capped && this.postingCap !== null && values.size > this.postingCap) return;
      for (const key of values) keys.add(key);
    };
    add(this.exact.get(item.contentHash), false);
    add(this.comparison.get(item.comparisonHash), false);
    if (item.document.documentKey) add(this.documents.get(item.document.documentKey), false);
    for (const gram of item.twelveGrams) add(this.twelve.get(gram), true);
    for (const gram of item.fiveGrams) add(this.five.get(gram), true);
    for (const key of [...keys].sort()) {
      const candidate = this.records.get(key);
      if (!candidate) continue;
      const match = compare(item, candidate);
      if (match) return match;
    }
    return null;
  }
}

function countBy<T>(items: T[], pick: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = pick(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function isCoreEnglish(text: string): boolean {
  const words = countWords(text);
  const compact = text.replace(/\s/g, "");
  const latin = compact.match(/[A-Za-z]/g)?.length ?? 0;
  return words >= 120 && words <= 360 && latin / Math.max(1, compact.length) >= 0.55;
}

function binomialReachProbability(n: number, target: number, probability: number): number {
  if (target <= 0) return 1;
  if (target > n || probability <= 0) return 0;
  if (probability >= 1) return 1;
  let term = Math.pow(1 - probability, n);
  let belowTarget = term;
  for (let successes = 1; successes < target; successes += 1) {
    term *= ((n - successes + 1) / successes) * (probability / (1 - probability));
    belowTarget += term;
  }
  return Math.max(0, Math.min(1, 1 - belowTarget));
}

function minimumQueue(target: number, probability: number, assurance = 0.95): number {
  for (let n = target; n <= 10_000; n += 1) {
    if (binomialReachProbability(n, target, probability) >= assurance) return n;
  }
  throw new Error("Queue search exceeded 10,000 candidates.");
}

function minimumRate(available: number, target: number, assurance = 0.95): number | null {
  if (available < target) return null;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (low + high) / 2;
    if (binomialReachProbability(available, target, mid) >= assurance) high = mid;
    else low = mid;
  }
  return high;
}

function inventoryReference(record: InventoryRecord): Reference {
  return {
    id: record.id,
    text: normalizeContent(record.text),
    source: record.family,
    document: {
      documentKey: record.sourceDocumentKey,
      sourceKind: record.sourceMaterialType,
      sourceId: record.sourceDocumentKey,
      year: null,
      round: null,
      qNumbers: [],
      originalType: record.blankEvidence === "LINKED_ORIGINAL_STEM" ? "BLANK_EVIDENCE" : null,
    },
  };
}

function cleanRecord(record: InventoryRecord): boolean {
  const assessed = assessCandidate({
    id: record.id,
    origin: "db-real",
    text: record.text,
    sourceKind: record.sourceMaterialType,
    sourceSubject: record.sourceMaterialSubject,
    sourceExamType: record.sourceExamType,
    reconstructionKind: "none",
    hasDeliberateError: false,
    reviewed: record.reviewState === "REVIEWED" || record.reviewState === "COMMITTED",
  } as never);
  return assessed.automaticStatus === "CLEAN_CANDIDATE";
}

function addV3Baseline(index: AuditIndex, v3: V3Snapshot): void {
  for (const candidate of v3.candidates) {
    index.add({ id: candidate.id, text: candidate.text, source: "v3-candidate-universe", document: candidate.document });
  }
  for (const retained of v3.retained) {
    index.add({
      id: retained.candidate.id,
      text: retained.candidate.text,
      source: `v3-retained-${retained.split}`,
      document: retained.candidate.document,
    });
  }
  for (const reference of v3.forbiddenReferences) index.add(reference);
}

function addV3History(index: AuditIndex, v3: V3Snapshot): void {
  for (const retained of v3.retained) {
    index.add({
      id: retained.candidate.id,
      text: retained.candidate.text,
      source: `v3-retained-${retained.split}`,
      document: retained.candidate.document,
    });
  }
  for (const reference of v3.forbiddenReferences) index.add(reference);
}

function familyAudit(records: InventoryRecord[], v3: V3Snapshot) {
  const baselineCapped = new AuditIndex(200);
  const baselineUnlimited = new AuditIndex(null);
  addV3Baseline(baselineCapped, v3);
  addV3Baseline(baselineUnlimited, v3);
  const crossCapped = new AuditIndex(200);
  const crossUnlimited = new AuditIndex(null);
  const output: Record<string, unknown>[] = [];
  let missedBaselineAtCap = 0;
  let missedCrossAtCap = 0;

  for (const family of FAMILIES) {
    const rows = records.filter((record) => record.family === family);
    const unique = new Map<string, InventoryRecord>();
    for (const record of rows) {
      const hash = contentHash(record.text);
      if (!unique.has(hash)) unique.set(hash, record);
    }
    const core = [...unique.values()].filter((record) => isCoreEnglish(record.text));
    const clean = core.filter(cleanRecord);
    let v3Overlap = 0;
    let exactOrMarkup = 0;
    let cross = 0;
    let crossWithinFamily = 0;
    let crossEarlierFamily = 0;
    const incremental: InventoryRecord[] = [];
    for (const record of clean) {
      const reference = inventoryReference(record);
      const cappedBaseline = baselineCapped.query(reference);
      if (cappedBaseline) {
        v3Overlap += 1;
        if (["EXACT_NORMALIZED_HASH", "MARKUP_STRIPPED_EXACT"].includes(cappedBaseline.code)) {
          exactOrMarkup += 1;
        }
        continue;
      }
      const unlimitedBaseline = baselineUnlimited.query(reference);
      if (unlimitedBaseline) {
        missedBaselineAtCap += 1;
        continue;
      }
      const cappedCross = crossCapped.query(reference);
      const unlimitedCross = crossUnlimited.query(reference);
      if (cappedCross) {
        cross += 1;
        if (cappedCross.source === family) crossWithinFamily += 1;
        else crossEarlierFamily += 1;
      } else {
        incremental.push(record);
        crossCapped.add(reference);
      }
      if (unlimitedCross) {
        if (!cappedCross) missedCrossAtCap += 1;
      } else {
        crossUnlimited.add(reference);
      }
    }
    output.push({
      family,
      rows: rows.length,
      uniqueNormalizedContent: unique.size,
      coreEnglishUnique: core.length,
      automaticCleanUnique: clean.length,
      allExactOrNearV3Overlap: v3Overlap,
      exactOrMarkupV3Overlap: exactOrMarkup,
      crossSourceReportedBucket: cross,
      crossBucketWithinSameFamily: crossWithinFamily,
      crossBucketActuallyEarlierFamily: crossEarlierFamily,
      netIncremental: incremental.length,
      incrementalReviewState: countBy(incremental, (record) => record.reviewState),
      incrementalRightsStatus: countBy(incremental, (record) => record.rightsStatus),
      incrementalOfficialTraceable: incremental.filter((record) => record.officialTraceable).length,
      incrementalProvenanceEvidence: {
        sourceRefPresent: incremental.filter((record) => record.sourceRefPresent).length,
        originalFilePresent: incremental.filter((record) => record.originalFilePresent).length,
        eitherSourceRefOrOriginalFile: incremental.filter(
          (record) => record.sourceRefPresent || record.originalFilePresent,
        ).length,
      },
      incrementalOfficialLinkedBlank: incremental.filter(
        (record) => record.officialTraceable && record.blankEvidence === "LINKED_ORIGINAL_STEM",
      ).length,
      incrementalOfficialLinkedBlankProvenanceEvidence: {
        sourceRefPresent: incremental.filter(
          (record) => record.officialTraceable && record.blankEvidence === "LINKED_ORIGINAL_STEM" &&
            record.sourceRefPresent,
        ).length,
        originalFilePresent: incremental.filter(
          (record) => record.officialTraceable && record.blankEvidence === "LINKED_ORIGINAL_STEM" &&
            record.originalFilePresent,
        ).length,
      },
      incrementalSavedOrPromoted: incremental.filter((record) => record.savedOrPromoted).length,
      incrementalSavedOrPromotedByReviewState: countBy(
        incremental.filter((record) => record.savedOrPromoted),
        (record) => record.reviewState,
      ),
    });
  }
  return { output, missedBaselineAtCap, missedCrossAtCap };
}

function assessBlank(candidate: V3Candidate): ReturnType<typeof assessCandidate> {
  const assessed = assessCandidate(candidate);
  assessed.integrityFlags = assessed.integrityFlags.filter(
    (flag: { code: string }) => flag.code !== "RECONSTRUCTED_SOURCE",
  );
  assessed.automaticStatus = assessed.integrityFlags.some(
    (flag: { severity: string }) => flag.severity === "blocking",
  ) ? "ROBUSTNESS_CANDIDATE" : "CLEAN_CANDIDATE";
  return assessed;
}

function blankAndCommittedAudit(records: InventoryRecord[], v3: V3Snapshot) {
  const historyCapped = new AuditIndex(200);
  const historyUnlimited = new AuditIndex(null);
  addV3History(historyCapped, v3);
  addV3History(historyUnlimited, v3);
  const historicalIds = new Set(v3.historicalPassageIds as string[]);
  const eligible: Array<ReturnType<typeof assessCandidate>> = [];
  let hiddenHistoryNear = 0;
  for (const candidate of v3.candidates) {
    const originalType = String(candidate.document?.originalType ?? "")
      .normalize("NFKC")
      .replace(/[\s_-]/g, "")
      .toLowerCase();
    const sourceGate = candidate.origin === "repo-official" &&
      candidate.reviewed === true &&
      String(candidate.confidence).toLowerCase() === "high" &&
      candidate.reconstructionKind === "blank" &&
      candidate.hasDeliberateError !== true &&
      (originalType === "빈칸추론" || originalType === "blankinference");
    if (!sourceGate) continue;
    const item = assessBlank(candidate);
    if (item.automaticStatus !== "CLEAN_CANDIDATE") continue;
    const aliases = [candidate.id, candidate.id.replace(/^repo:/, ""), candidate.sourceRecordId];
    if (aliases.some((id) => historicalIds.has(id))) continue;
    const reference = { id: candidate.id, text: candidate.text, source: "blank", document: candidate.document };
    if (historyCapped.query(reference)) continue;
    if (historyUnlimited.query(reference)) {
      hiddenHistoryNear += 1;
      continue;
    }
    eligible.push(item);
  }

  const committedUnique = new Map<string, InventoryRecord>();
  for (const record of records.filter((item) => item.family === "committed-passage-current")) {
    const hash = contentHash(record.text);
    if (!committedUnique.has(hash)) committedUnique.set(hash, record);
  }
  let committedEligible = 0;
  let committedHiddenHistoryNear = 0;
  for (const record of committedUnique.values()) {
    if (!isCoreEnglish(record.text) || !cleanRecord(record)) continue;
    const reference = inventoryReference(record);
    if (historyCapped.query(reference)) continue;
    if (historyUnlimited.query(reference)) {
      committedHiddenHistoryNear += 1;
      continue;
    }
    committedEligible += 1;
  }
  const central = eligible.filter(
    (item) => item.wordCount >= 150 && item.strata.blankSuitability === "central-span" &&
      item.features.hasDiscoursePivot && item.features.sentenceCount >= 5,
  ).length;
  const short = eligible.filter((item) => item.wordCount >= 120 && item.wordCount < 150).length;
  const longOther = eligible.filter(
    (item) => item.wordCount >= 150 && !(item.strata.blankSuitability === "central-span" &&
      item.features.hasDiscoursePivot && item.features.sentenceCount >= 5),
  ).length;
  return {
    blank: {
      sourceGateAndHistoryClean: eligible.length,
      centralLongV3Estimand: central,
      short120To149SeparateEstimand: short,
      long150PlusLocalOrNoPivotSeparateEstimand: longOther,
      hiddenHistoryNearAtPostingCap200: hiddenHistoryNear,
    },
    committed: {
      currentEligibleAfterAutomaticAndHistoricalGates: committedEligible,
      hiddenHistoryNearAtPostingCap200: committedHiddenHistoryNear,
    },
  };
}

function main(): void {
  const privateRaw = fs.readFileSync(PRIVATE, "utf8");
  const publicRaw = fs.readFileSync(PUBLIC, "utf8");
  const v3Raw = fs.readFileSync(V3, "utf8");
  const inventory = JSON.parse(privateRaw) as InventorySnapshot;
  const publicReport = JSON.parse(publicRaw) as PublicReport;
  const v3 = JSON.parse(v3Raw) as V3Snapshot;
  const inventoryCore: Record<string, unknown> = { ...inventory };
  const reportCore: Record<string, unknown> = { ...publicReport };
  const v3Core: Record<string, unknown> = { ...v3 };
  delete inventoryCore.snapshotHash;
  delete reportCore.reportSha256;
  delete v3Core.snapshotHash;
  const families = familyAudit(inventory.records, v3);
  const pools = blankAndCommittedAudit(inventory.records, v3);
  const privateSemanticHash = sha256(stableStringify(inventoryCore));
  const publicSelfHash = sha256(stableStringify(reportCore));
  const v3SemanticHash = sha256(stableStringify(v3Core));
  const findings: string[] = [];
  if (privateSemanticHash !== inventory.snapshotHash) findings.push("PRIVATE_SEMANTIC_HASH_MISMATCH");
  if (publicSelfHash !== publicReport.reportSha256) findings.push("PUBLIC_SELF_HASH_MISMATCH");
  if (v3SemanticHash !== v3.snapshotHash) findings.push("V3_SEMANTIC_HASH_MISMATCH");

  const publicFamilies = Array.isArray(publicReport.familySummaries)
    ? publicReport.familySummaries as Array<Record<string, unknown>>
    : [];
  for (const audited of families.output) {
    const family = String(audited.family);
    const published = publicFamilies.find((item) => item.family === family);
    if (!published) {
      findings.push(`MISSING_PUBLIC_FAMILY:${family}`);
      continue;
    }
    const pairs = [
      ["rows", "rows"],
      ["uniqueNormalizedContent", "uniqueNormalizedContent"],
      ["coreEnglishUnique", "coreEnglishUnique"],
      ["automaticCleanUnique", "automaticCleanUnique"],
      ["allExactOrNearV3Overlap", "allExactOrNearV3Overlap"],
      ["exactOrMarkupV3Overlap", "exactOrMarkupV3Overlap"],
      ["crossSourceReportedBucket", "crossSourceExactOrNearOverlap"],
      ["netIncremental", "netIncrementalAfterV3AndHigherPrioritySources"],
      ["incrementalOfficialTraceable", "netIncrementalOfficialTraceable"],
      ["incrementalOfficialLinkedBlank", "netIncrementalLinkedBlankButNotYetEligible"],
    ] as const;
    for (const [auditKey, publicKey] of pairs) {
      if (audited[auditKey] !== published[publicKey]) {
        findings.push(`FAMILY_MISMATCH:${family}:${auditKey}`);
      }
    }
  }

  const publicBlank = publicReport.repoBlankAlternativeStrata as Record<string, unknown> | undefined;
  const publicFeasibility = publicReport.exactV3Feasibility as {
    committedDb?: Record<string, unknown>;
  } | undefined;
  for (const [key, value] of Object.entries(pools.blank)) {
    if (key.startsWith("hidden")) continue;
    if (publicBlank?.[key] !== value) findings.push(`BLANK_POOL_MISMATCH:${key}`);
  }
  if (
    publicFeasibility?.committedDb?.currentEligibleAfterAutomaticAndHistoricalGatesBeforeCrossPanelAllocation !==
    pools.committed.currentEligibleAfterAutomaticAndHistoricalGates
  ) {
    findings.push("COMMITTED_POOL_MISMATCH");
  }
  const result = {
    status: findings.length === 0 ? "PASS_NUMERIC_RECALCULATION" : "FAIL_NUMERIC_RECALCULATION",
    findings,
    constraints: { modelApiCalls: 0, browserCalls: 0, databaseWrites: 0, liveDatabaseReads: 0 },
    hashes: {
      privateFileSha256: sha256(privateRaw),
      privateSemanticSnapshotExpected: inventory.snapshotHash,
      privateSemanticSnapshotActual: privateSemanticHash,
      publicFileSha256: sha256(publicRaw),
      publicSelfHashExpected: publicReport.reportSha256,
      publicSelfHashActual: publicSelfHash,
      v3SemanticSnapshotExpected: v3.snapshotHash,
      v3SemanticSnapshotActual: v3SemanticHash,
    },
    families: families.output,
    postingCapSensitivity: {
      hiddenV3BaselineMatches: families.missedBaselineAtCap,
      hiddenCrossFamilyMatches: families.missedCrossAtCap,
    },
    pools,
    arithmetic: {
      blankQueueGap: 262 - pools.blank.centralLongV3Estimand,
      dbDisjointQueueGap: 158 + 815 - pools.committed.currentEligibleAfterAutomaticAndHistoricalGates,
      blankRawTargetImpossible: pools.blank.centralLongV3Estimand < 66,
      holdoutMinimumRateFor154ToReach29At95Percent: minimumRate(154, 29),
      independentlyRebuiltQueues: {
        blank: minimumQueue(66, 0.2969581120673508),
        dbDev: minimumQueue(23, 0.19330842112059338),
        dbHoldout: minimumQueue(29, 0.04685482691460076),
      },
    },
  };
  process.stdout.write(stableStringify(result));
  if (findings.length > 0) process.exitCode = 1;
}

main();
