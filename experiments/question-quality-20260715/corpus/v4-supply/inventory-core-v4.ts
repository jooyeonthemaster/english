import {
  assessCandidate,
  contentHash,
  countWords,
  sha256,
  stableStringify,
  type AssessedCandidate,
} from "../selector-core";
import { NearDuplicateIndex } from "../v2/selector-core-v2";
import { binomialReachProbability } from "../v3/queue-sizing";
import type { V3PinnedSnapshot, V3RawCandidate } from "../v3/types-v3";
import type {
  V4Family,
  V4InventoryRecord,
  V4PinnedInventory,
} from "./types-v4";

const FAMILIES: readonly V4Family[] = [
  "committed-passage-current",
  "m1-passage-draft",
  "m2-passage-draft",
  "extraction-item-passage",
  "extraction-result",
  "local-hs-ms",
  "local-test-restoration",
  "local-grammar-drill",
];

interface InventoryAssessed extends AssessedCandidate {
  inventory: V4InventoryRecord;
  document: {
    documentKey: string | null;
    sourceKind: string | null;
    sourceId: string | null;
    year: number | null;
    round: string | null;
    qNumbers: number[];
    originalType: string | null;
  };
  databaseEvidence: {
    candidateAcademyId: null;
    priorUseScope: "ALL_ACADEMIES";
    matchedPassageCount: number;
    matchedPassageIds: string[];
    questionCount: number;
    aiQuestionCount: number;
    workbenchJobCount: number;
    reviewed: boolean;
  };
}

function englishRatio(text: string): number {
  const compact = text.replace(/\s/g, "");
  const latin = compact.match(/[A-Za-z]/g)?.length ?? 0;
  return latin / Math.max(1, compact.length);
}

export function isCoreEnglishV4(text: string): boolean {
  const words = countWords(text);
  return words >= 120 && words <= 360 && englishRatio(text) >= 0.55;
}

function assess(record: V4InventoryRecord): InventoryAssessed {
  const raw = {
    id: record.id,
    origin: "db-real" as const,
    text: record.text,
    sourceKind: record.sourceMaterialType,
    sourceSubject: record.sourceMaterialSubject,
    sourceExamType: record.sourceExamType,
    reconstructionKind: "none",
    hasDeliberateError: false,
    reviewed: record.reviewState === "REVIEWED" || record.reviewState === "COMMITTED",
  };
  const item = assessCandidate(raw) as InventoryAssessed;
  item.inventory = record;
  item.document = {
    documentKey: record.sourceDocumentKey,
    sourceKind: record.sourceMaterialType,
    sourceId: record.sourceDocumentKey,
    year: null,
    round: null,
    qNumbers: [],
    originalType: record.blankEvidence === "LINKED_ORIGINAL_STEM" ? "BLANK_EVIDENCE" : null,
  };
  item.databaseEvidence = {
    candidateAcademyId: null,
    priorUseScope: "ALL_ACADEMIES",
    matchedPassageCount: 1,
    matchedPassageIds: [],
    questionCount: 0,
    aiQuestionCount: 0,
    workbenchJobCount: 0,
    reviewed: raw.reviewed,
  };
  return item;
}

function addBaseline(index: NearDuplicateIndex, v3: V3PinnedSnapshot): void {
  for (const candidate of v3.candidates) {
    index.add({
      id: candidate.id,
      text: candidate.text,
      source: "v3-candidate-universe",
      document: candidate.document,
    });
  }
  for (const retained of v3.retained) {
    index.add({
      id: retained.candidate.id,
      text: retained.candidate.text,
      source: `v3-retained-${retained.split}`,
      document: retained.candidate.document,
    });
  }
  for (const reference of v3.forbiddenReferences) {
    index.add({
      id: reference.id,
      text: reference.text,
      source: reference.source,
      document: reference.document,
    });
  }
}

function addHistorical(index: NearDuplicateIndex, v3: V3PinnedSnapshot): void {
  for (const retained of v3.retained) {
    index.add({
      id: retained.candidate.id,
      text: retained.candidate.text,
      source: `v3-retained-${retained.split}`,
      document: retained.candidate.document,
    });
  }
  for (const reference of v3.forbiddenReferences) {
    index.add({
      id: reference.id,
      text: reference.text,
      source: reference.source,
      document: reference.document,
    });
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

function publicFamilySummary(
  family: V4Family,
  records: V4InventoryRecord[],
  baselineIndex: NearDuplicateIndex,
  crossSourceIndex: NearDuplicateIndex,
) {
  const familyRows = records.filter((record) => record.family === family);
  const unique = new Map<string, V4InventoryRecord>();
  for (const record of familyRows) {
    const hash = contentHash(record.text);
    if (!unique.has(hash)) unique.set(hash, record);
  }
  const core = [...unique.values()].filter((record) => isCoreEnglishV4(record.text));
  const assessed = core.map(assess);
  const clean = assessed.filter((item) => item.automaticStatus === "CLEAN_CANDIDATE");
  let overlapsV3 = 0;
  let exactV3 = 0;
  let earlierFamilyOverlap = 0;
  let earlierWithinFamilyOverlap = 0;
  const nearCodes: Record<string, number> = {};
  const incremental: InventoryAssessed[] = [];
  for (const item of clean) {
    const match = baselineIndex.query(item as never);
    if (match) {
      overlapsV3 += 1;
      if (match.code === "EXACT_NORMALIZED_HASH" || match.code === "MARKUP_STRIPPED_EXACT") {
        exactV3 += 1;
      }
      nearCodes[match.code] = (nearCodes[match.code] ?? 0) + 1;
      continue;
    }
    const cross = crossSourceIndex.query(item as never);
    if (cross) {
      if (cross.matchedSource === family) earlierWithinFamilyOverlap += 1;
      else earlierFamilyOverlap += 1;
      continue;
    }
    incremental.push(item);
    crossSourceIndex.add({
      id: item.id,
      text: item.text,
      source: family,
      document: item.document,
    });
  }
  return {
    family,
    rows: familyRows.length,
    uniqueNormalizedContent: unique.size,
    coreEnglishUnique: core.length,
    automaticCleanUnique: clean.length,
    exactOrMarkupV3Overlap: exactV3,
    allExactOrNearV3Overlap: overlapsV3,
    earlierFamilyExactOrNearOverlap: earlierFamilyOverlap,
    earlierWithinFamilyExactOrNearOverlap: earlierWithinFamilyOverlap,
    netIncrementalAfterV3AndEarlierInventory: incremental.length,
    officialTypeTaggedCore: core.filter((record) => record.officialTypeTagged).length,
    officialTypeTaggedWithSourceRefOrOriginalFileLocatorCore: core.filter(
      (record) =>
        record.officialTypeTagged && (record.sourceRefPresent || record.originalFilePresent),
    ).length,
    linkedBlankEvidenceCore: core.filter(
      (record) => record.blankEvidence === "LINKED_ORIGINAL_STEM",
    ).length,
    reviewedOrCommittedCore: core.filter(
      (record) => record.reviewState === "REVIEWED" || record.reviewState === "COMMITTED",
    ).length,
    lineageStateCore: countBy(core, (record) => record.lineageState),
    distinctSourceDocuments: new Set(core.map((record) => record.sourceDocumentKey).filter(Boolean))
      .size,
    distinctAcademiesPrivateOnly: new Set(core.map((record) => record.academyId).filter(Boolean)).size,
    rightsStatus: countBy(core, (record) => record.rightsStatus),
    reviewState: countBy(core, (record) => record.reviewState),
    netIncrementalRightsStatus: countBy(
      incremental,
      (item) => item.inventory.rightsStatus,
    ),
    netIncrementalReviewState: countBy(
      incremental,
      (item) => item.inventory.reviewState,
    ),
    netIncrementalOfficialTypeTagged: incremental.filter(
      (item) => item.inventory.officialTypeTagged,
    ).length,
    netIncrementalOfficialTypeTaggedWithSourceRefOrOriginalFileLocator: incremental.filter(
      (item) =>
        item.inventory.officialTypeTagged &&
        (item.inventory.sourceRefPresent || item.inventory.originalFilePresent),
    ).length,
    netIncrementalLineageState: countBy(
      incremental,
      (item) => item.inventory.lineageState,
    ),
    sourceMaterialType: countBy(core, (record) => record.sourceMaterialType ?? "NONE"),
    nearOverlapCodes: Object.fromEntries(
      Object.entries(nearCodes).sort(([a], [b]) => a.localeCompare(b)),
    ),
    immediateSameEstimandEligible: incremental.filter(
      (item) => item.inventory.family === "committed-passage-current",
    ).length,
    netIncrementalLinkedBlankButNotYetEligible: incremental.filter(
      (item) =>
        item.inventory.blankEvidence === "LINKED_ORIGINAL_STEM" &&
        item.inventory.officialTypeTagged,
    ).length,
  };
}

function sourceBlankGate(candidate: V3RawCandidate): boolean {
  const originalType = (candidate.document.originalType ?? "")
    .normalize("NFKC")
    .replace(/[\s_-]/g, "")
    .toLowerCase();
  return (
    candidate.origin === "repo-official" &&
    candidate.reviewed === true &&
    candidate.confidence?.toLowerCase() === "high" &&
    candidate.reconstructionKind === "blank" &&
    candidate.hasDeliberateError !== true &&
    (originalType === "빈칸추론" || originalType === "blankinference")
  );
}

function repoBlankAlternativeStrata(v3: V3PinnedSnapshot) {
  const history = new NearDuplicateIndex();
  addHistorical(history, v3);
  const historicalIds = new Set(v3.historicalPassageIds);
  const eligible: AssessedCandidate[] = [];
  for (const candidate of v3.candidates.filter(sourceBlankGate)) {
    const item = assessCandidate(candidate as never);
    item.integrityFlags = item.integrityFlags.filter(
      (flag) => flag.code !== "RECONSTRUCTED_SOURCE",
    );
    item.automaticStatus = item.integrityFlags.some((flag) => flag.severity === "blocking")
      ? "ROBUSTNESS_CANDIDATE"
      : "CLEAN_CANDIDATE";
    if (item.automaticStatus !== "CLEAN_CANDIDATE") continue;
    const aliases = [candidate.id, candidate.id.replace(/^repo:/, ""), candidate.sourceRecordId];
    if (aliases.some((id) => historicalIds.has(id))) continue;
    const withDocument = Object.assign(item, { document: candidate.document });
    if (history.query(withDocument as never)) continue;
    eligible.push(item);
  }
  return {
    sourceGateAndHistoryClean: eligible.length,
    centralLongV3Estimand: eligible.filter(
      (item) =>
        item.wordCount >= 150 &&
        item.strata.blankSuitability === "central-span" &&
        item.features.hasDiscoursePivot &&
        item.features.sentenceCount >= 5,
    ).length,
    short120To149SeparateEstimand: eligible.filter(
      (item) => item.wordCount >= 120 && item.wordCount < 150,
    ).length,
    long150PlusLocalOrNoPivotSeparateEstimand: eligible.filter(
      (item) =>
        item.wordCount >= 150 &&
        !(
          item.strata.blankSuitability === "central-span" &&
          item.features.hasDiscoursePivot &&
          item.features.sentenceCount >= 5
        ),
    ).length,
  };
}

function currentCommittedEligiblePool(
  records: V4InventoryRecord[],
  v3: V3PinnedSnapshot,
): number {
  const history = new NearDuplicateIndex();
  addHistorical(history, v3);
  const unique = new Map<string, V4InventoryRecord>();
  for (const record of records.filter(
    (item) => item.family === "committed-passage-current",
  )) {
    const hash = contentHash(record.text);
    if (!unique.has(hash)) unique.set(hash, record);
  }
  let eligible = 0;
  for (const record of unique.values()) {
    if (!isCoreEnglishV4(record.text)) continue;
    const item = assess(record);
    if (item.automaticStatus !== "CLEAN_CANDIDATE") continue;
    if (history.query(item as never)) continue;
    eligible += 1;
  }
  return eligible;
}

export function minimumRateForSupplyV4(
  available: number,
  target: number,
  assurance = 0.95,
): number | null {
  if (available < target) return null;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const probability = binomialReachProbability(available, target, mid);
    if (probability >= assurance) high = mid;
    else low = mid;
  }
  return high;
}

export function analyzeInventoryV4(inventory: V4PinnedInventory, v3: V3PinnedSnapshot) {
  if (inventory.v3SnapshotHash !== v3.snapshotHash) {
    throw new Error("v4 inventory is not anchored to the supplied immutable v3 snapshot.");
  }
  const baseline = new NearDuplicateIndex();
  addBaseline(baseline, v3);
  const crossSource = new NearDuplicateIndex();
  const familySummaries = FAMILIES.map((family) =>
    publicFamilySummary(family, inventory.records, baseline, crossSource),
  );
  const blankStrata = repoBlankAlternativeStrata(v3);
  const committed = familySummaries.find(
    (summary) => summary.family === "committed-passage-current",
  );
  const currentCommittedCoreBeforeHistory = committed?.coreEnglishUnique ?? 0;
  const currentCommittedEligible = currentCommittedEligiblePool(inventory.records, v3);
  const bQueue = 262;
  const dbDevQueue = 158;
  const dbHoldQueue = 815;
  const exactFeasibility = {
    blank: {
      requiredQueue: bQueue,
      currentStrictPool: blankStrata.centralLongV3Estimand,
      netNewRequired: Math.max(0, bQueue - blankStrata.centralLongV3Estimand),
      rawPassTarget: 66,
      rawTargetImpossible: blankStrata.centralLongV3Estimand < 66,
    },
    committedDb: {
      requiredDisjointQueues: dbDevQueue + dbHoldQueue,
      currentCoreZeroPriorGroupsBeforeHistoryAndCrossPanelGates:
        currentCommittedCoreBeforeHistory,
      currentEligibleAfterAutomaticAndHistoricalGatesBeforeCrossPanelAllocation:
        currentCommittedEligible,
      optimisticNetNewRequired: Math.max(
        0,
        dbDevQueue + dbHoldQueue - currentCommittedEligible,
      ),
      holdoutOnlyMinimumConservativeRateForCurrentSupply: minimumRateForSupplyV4(
        currentCommittedEligible,
        29,
      ),
    },
    feasibleWithoutNewSourceAuthority: false,
  };
  const alternatives = [
    {
      id: "V4-A-ACQUIRE-SAME-ESTIMAND",
      preservesV3Estimand: true,
      design:
        "Acquire and provenance-audit genuinely new central-span official blank passages and committed zero-prior DB groups before freezing a new snapshot.",
      minimumSupplyImplication: {
        blankNetNewCandidates: exactFeasibility.blank.netNewRequired,
        committedDbOptimisticNetNewGroups: exactFeasibility.committedDb.optimisticNetNewRequired,
      },
      tradeoff:
        "Only option that preserves the v3 claim, but local inventory cannot supply it; source authority, rights clearance, ingestion, and independent audit are prerequisites.",
      recommendationRank: 1,
    },
    {
      id: "V4-B-SEPARATE-STRATA-CENSUS",
      preservesV3Estimand: false,
      design:
        "Audit the full central-long blank census and committed DB census; report certified count and exact interval. Audit 120-149/local blank passages as separately named strata and never pool them with central-long.",
      availableSeparateBlankStrata: blankStrata,
      tradeoff:
        "Immediately honest and bounded, but estimates yield/prevalence rather than certifying 66 central blank and DB33+repo33 diversity targets.",
      recommendationRank: 2,
    },
    {
      id: "V4-C-REVIEWED-EXTRACTION-PILOT",
      preservesV3Estimand: false,
      design:
        "After explicit rights clearance, freeze extraction drafts as a new DB_EXTRACT_REVIEWED population, run an independent discovery pilot, then size a non-overlapping validation queue from its own one-sided lower bound.",
      constraints: [
        "Do not call DRAFT rows committed DB passages.",
        "Do not reuse pilot rows in validation certification.",
        "Do not pool customer-uploaded school exams with official national-exam blanks.",
      ],
      tradeoff:
        "Potentially expands supply, but current pass rate is unknown, all linked blank ExtractionItem rows are DRAFT, and no license/rights field exists.",
      recommendationRank: 3,
    },
  ];
  const core = {
    schemaVersion: 4,
    version: inventory.version,
    status: "SUPPLY_REMEDIATION_RESEARCH_ONLY",
    capturedAt: inventory.capturedAt,
    captureWindow: inventory.captureWindow,
    temporalSemantics: inventory.temporalSemantics,
    historicalAsOfSupported: inventory.historicalAsOfSupported,
    inventorySnapshotHash: inventory.snapshotHash,
    v3SnapshotHash: inventory.v3SnapshotHash,
    inputHashes: {
      gitSha: inventory.gitSha,
      codeHash: inventory.codeHash,
      dependencyManifestHash: inventory.dependencyManifest.manifestHash,
      dependencyFileCount: Object.keys(inventory.dependencyManifest.files).length,
      repositoryGit: inventory.dependencyManifest.repositoryGit,
      localSourceHashes: inventory.localSourceHashes,
      databaseExtractHash: inventory.databaseExtractHash,
      databaseRecordSetHash: inventory.databaseRecordSetHash,
    },
    familySummaries,
    repoBlankAlternativeStrata: blankStrata,
    exactV3Feasibility: exactFeasibility,
    alternatives,
    recommendation:
      "Choose V4-A if the original v3 claim is mandatory. Until new rights-cleared independent supply exists, use V4-B for measurement only; never relabel V4-B/C as v3 certification.",
    privacy: {
      academyIdentifiersPublic: false,
      rawPassagesPublic: false,
      privateSnapshotGitIgnored: true,
    },
    constraints: {
      operationalManifestCreated: false,
      modelApiCalls: 0,
      browserCalls: 0,
      databaseWrites: 0,
      productionEdits: 0,
    },
    sourceDiagnostics: inventory.sourceDiagnostics,
  };
  return { ...core, reportSha256: sha256(stableStringify(core)) };
}

export function inventorySnapshotHashV4(
  inventory: Omit<V4PinnedInventory, "snapshotHash">,
): string {
  return sha256(stableStringify(inventory));
}
