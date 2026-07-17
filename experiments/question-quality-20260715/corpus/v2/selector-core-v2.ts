import {
  assessCandidate,
  contentHash,
  DEFAULT_SEED,
  type AssessedCandidate,
  type RawCandidate,
  sha256,
  stableStringify,
} from "../selector-core";
import { comparisonHash, comparisonText } from "./history-index";

export const V2_SCHEMA_VERSION = 2;
export const V2_DEFAULT_SEED = `${DEFAULT_SEED}-strict-panels-v2`;

export type PanelName =
  | "general-dev-retained"
  | "general-holdout-retained"
  | "general-dev-replacement"
  | "general-holdout-replacement"
  | "focus-grammar-killer"
  | "focus-blank-killer";

export interface SourceDocumentMetadata {
  documentKey: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  year: number | null;
  round: string | null;
  qNumbers: number[];
  originalType: string | null;
}

export interface DatabaseContentEvidence {
  candidateAcademyId: string | null;
  priorUseScope: "ALL_ACADEMIES" | null;
  matchedPassageCount: number;
  matchedPassageIds: string[];
  questionCount: number;
  aiQuestionCount: number;
  workbenchJobCount: number;
  reviewed: boolean;
}

export interface V2RawCandidate extends RawCandidate {
  document: SourceDocumentMetadata;
  databaseEvidence: DatabaseContentEvidence;
}

export type V2AssessedCandidate = AssessedCandidate & {
  document: SourceDocumentMetadata;
  databaseEvidence: DatabaseContentEvidence;
};

export interface AdjudicatedRetained {
  candidate: V2RawCandidate;
  split: "dev" | "holdout";
  finalDecision: "PASS";
  keepOrDrop: string;
  grammarRichness: string;
  blankSuitability: string;
}

export interface ForbiddenReference {
  id: string;
  text: string;
  source: string;
  document?: SourceDocumentMetadata;
}

export interface V2Targets {
  generalDevMissing: number;
  generalHoldoutMissing: number;
  generalDevObservedPass: { passed: number; audited: number };
  generalHoldoutObservedPass: { passed: number; audited: number };
  focusGrammarPrimary: number;
  focusGrammarObservedPass: { passed: number; eligible: number };
  focusBlankPrimary: number;
  focusBlankObservedPass: { passed: number; eligible: number };
}

export interface V2BuildInput {
  candidates: V2RawCandidate[];
  retained: AdjudicatedRetained[];
  forbiddenReferences: ForbiddenReference[];
  historicalPassageIds: Set<string>;
  seed?: string;
  targets?: Partial<V2Targets>;
}

export interface V2BuildResult {
  publicManifest: Record<string, unknown>;
  privateManifest: Record<string, unknown>;
  selected: Record<PanelName, V2AssessedCandidate[]>;
  diagnostics: Record<string, unknown>;
}

const DEFAULT_TARGETS: V2Targets = {
  generalDevMissing: 28,
  generalHoldoutMissing: 35,
  generalDevObservedPass: { passed: 32, audited: 60 },
  generalHoldoutObservedPass: { passed: 25, audited: 60 },
  focusGrammarPrimary: 60,
  focusGrammarObservedPass: { passed: 19, eligible: 52 },
  focusBlankPrimary: 60,
  focusBlankObservedPass: { passed: 19, eligible: 45 },
};

interface ComparisonFeatures {
  id: string;
  source: string;
  contentHash: string;
  comparisonHash: string;
  tokens: string[];
  fiveGrams: Set<string>;
  twelveGrams: Set<string>;
  document: SourceDocumentMetadata;
}

export interface NearDuplicateEvidence {
  code:
    | "EXACT_NORMALIZED_HASH"
    | "MARKUP_STRIPPED_EXACT"
    | "SOURCE_RANGE_OVERLAP"
    | "SEQUENTIAL_DOCUMENT_FRAGMENT"
    | "FIVE_GRAM_SIMILARITY"
    | "LONG_CONTIGUOUS_OVERLAP";
  matchedId: string;
  matchedSource: string;
  fiveGramJaccard: number;
  fiveGramContainment: number;
  sharedTwelveGrams: number;
}

function ngrams(tokens: string[], size: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function features(
  id: string,
  text: string,
  source: string,
  document?: SourceDocumentMetadata,
): ComparisonFeatures {
  const normalizedComparison = comparisonText(text);
  const tokens = normalizedComparison.split(" ").filter(Boolean);
  return {
    id,
    source,
    contentHash: contentHash(text),
    comparisonHash: comparisonHash(text),
    tokens,
    fiveGrams: ngrams(tokens, 5),
    twelveGrams: ngrams(tokens, 12),
    document: document ?? {
      documentKey: null,
      sourceKind: null,
      sourceId: null,
      year: null,
      round: null,
      qNumbers: [],
      originalType: null,
    },
  };
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const item of small) if (large.has(item)) count += 1;
  return count;
}

function rangesOverlap(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  return left.some((value) => right.includes(value));
}

function rangesAdjacent(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const leftMin = Math.min(...left);
  const leftMax = Math.max(...left);
  const rightMin = Math.min(...right);
  const rightMax = Math.max(...right);
  return Math.abs(leftMax - rightMin) <= 1 || Math.abs(rightMax - leftMin) <= 1;
}

export function compareNearDuplicate(
  left: ComparisonFeatures,
  right: ComparisonFeatures,
): NearDuplicateEvidence | null {
  const intersection5 = intersectionSize(left.fiveGrams, right.fiveGrams);
  const union5 = left.fiveGrams.size + right.fiveGrams.size - intersection5;
  const jaccard = union5 === 0 ? 0 : intersection5 / union5;
  const containment = intersection5 / Math.max(1, Math.min(left.fiveGrams.size, right.fiveGrams.size));
  const sharedTwelve = intersectionSize(left.twelveGrams, right.twelveGrams);
  const evidence = (code: NearDuplicateEvidence["code"]): NearDuplicateEvidence => ({
    code,
    matchedId: right.id,
    matchedSource: right.source,
    fiveGramJaccard: Number(jaccard.toFixed(4)),
    fiveGramContainment: Number(containment.toFixed(4)),
    sharedTwelveGrams: sharedTwelve,
  });

  if (left.contentHash === right.contentHash) return evidence("EXACT_NORMALIZED_HASH");
  if (left.comparisonHash === right.comparisonHash && left.tokens.length >= 40) {
    return evidence("MARKUP_STRIPPED_EXACT");
  }

  const sameDocument =
    Boolean(left.document.documentKey) && left.document.documentKey === right.document.documentKey;
  if (sameDocument && rangesOverlap(left.document.qNumbers, right.document.qNumbers)) {
    return evidence("SOURCE_RANGE_OVERLAP");
  }
  if (sameDocument && rangesAdjacent(left.document.qNumbers, right.document.qNumbers) && sharedTwelve >= 1) {
    return evidence("SEQUENTIAL_DOCUMENT_FRAGMENT");
  }
  if (jaccard >= 0.45 || containment >= 0.72) return evidence("FIVE_GRAM_SIMILARITY");
  if (sharedTwelve >= 3 && containment >= 0.35) return evidence("LONG_CONTIGUOUS_OVERLAP");
  return null;
}

export class NearDuplicateIndex {
  private readonly records = new Map<string, ComparisonFeatures>();
  private readonly exact = new Map<string, Set<string>>();
  private readonly comparison = new Map<string, Set<string>>();
  private readonly fiveGram = new Map<string, Set<string>>();
  private readonly twelveGram = new Map<string, Set<string>>();
  private readonly documents = new Map<string, Set<string>>();

  add(reference: ForbiddenReference): void {
    const item = features(reference.id, reference.text, reference.source, reference.document);
    const recordKey = `${item.source}|${item.id}|${item.contentHash}`;
    if (this.records.has(recordKey)) return;
    this.records.set(recordKey, item);
    this.addPosting(this.exact, item.contentHash, recordKey);
    this.addPosting(this.comparison, item.comparisonHash, recordKey);
    for (const gram of item.fiveGrams) this.addPosting(this.fiveGram, gram, recordKey);
    for (const gram of item.twelveGrams) this.addPosting(this.twelveGram, gram, recordKey);
    if (item.document.documentKey) this.addPosting(this.documents, item.document.documentKey, recordKey);
  }

  private addPosting(index: Map<string, Set<string>>, key: string, value: string): void {
    const posting = index.get(key) ?? new Set<string>();
    posting.add(value);
    index.set(key, posting);
  }

  query(candidate: V2AssessedCandidate): NearDuplicateEvidence | null {
    const item = features(candidate.id, candidate.text, "candidate", candidate.document);
    const keys = new Set<string>();
    for (const key of this.exact.get(item.contentHash) ?? []) keys.add(key);
    for (const key of this.comparison.get(item.comparisonHash) ?? []) keys.add(key);
    if (item.document.documentKey) {
      for (const key of this.documents.get(item.document.documentKey) ?? []) keys.add(key);
    }
    for (const gram of item.twelveGrams) {
      const posting = this.twelveGram.get(gram);
      if (!posting || posting.size > 200) continue;
      for (const key of posting) keys.add(key);
    }
    for (const gram of item.fiveGrams) {
      const posting = this.fiveGram.get(gram);
      if (!posting || posting.size > 200) continue;
      for (const key of posting) keys.add(key);
    }
    for (const key of [...keys].sort()) {
      const match = this.records.get(key);
      if (!match) continue;
      const evidence = compareNearDuplicate(item, match);
      if (evidence) return evidence;
    }
    return null;
  }
}

function assessV2(candidate: V2RawCandidate): V2AssessedCandidate {
  const assessed = assessCandidate(candidate) as V2AssessedCandidate;
  if (isHighConfidenceBlankReconstruction(assessed)) {
    assessed.integrityFlags = assessed.integrityFlags.filter(
      (flag) => flag.code !== "RECONSTRUCTED_SOURCE",
    );
    assessed.automaticStatus = assessed.integrityFlags.some((flag) => flag.severity === "blocking")
      ? "ROBUSTNESS_CANDIDATE"
      : "CLEAN_CANDIDATE";
  }
  return assessed;
}

function historicalIdAliases(id: string): string[] {
  return [...new Set([id, id.replace(/^repo:/i, "")])];
}

function noPriorDatabaseUse(candidate: V2AssessedCandidate): boolean {
  return (
    candidate.databaseEvidence.priorUseScope === "ALL_ACADEMIES" &&
    candidate.databaseEvidence.questionCount === 0 &&
    candidate.databaseEvidence.aiQuestionCount === 0 &&
    candidate.databaseEvidence.workbenchJobCount === 0
  );
}

function isHighConfidenceBlankReconstruction(candidate: V2AssessedCandidate): boolean {
  const hint = `${candidate.document.originalType ?? ""} ${candidate.typeHint ?? ""}`.toLowerCase();
  return (
    candidate.origin === "repo-official" &&
    candidate.reviewed === true &&
    candidate.confidence?.toLowerCase() === "high" &&
    candidate.reconstructionKind === "blank" &&
    candidate.hasDeliberateError !== true &&
    /blank|빈칸/.test(hint)
  );
}

function strictEditoriallyReviewed(candidate: V2AssessedCandidate): boolean {
  if (candidate.origin === "repo-official") {
    return (
      candidate.reviewed === true &&
      candidate.confidence?.toLowerCase() === "high" &&
      (candidate.reconstructionKind === "none" || isHighConfidenceBlankReconstruction(candidate)) &&
      candidate.hasDeliberateError !== true
    );
  }
  return candidate.databaseEvidence.reviewed;
}

function baseEligible(candidate: V2AssessedCandidate, historicalIds: Set<string>): boolean {
  return (
    candidate.automaticStatus === "CLEAN_CANDIDATE" &&
    strictEditoriallyReviewed(candidate) &&
    noPriorDatabaseUse(candidate) &&
    historicalIdAliases(candidate.id).every((id) => !historicalIds.has(id))
  );
}

function grammarFocusSuitable(candidate: V2AssessedCandidate): boolean {
  return (
    candidate.reconstructionKind === "none" &&
    candidate.strata.grammarSuitability === "rich" &&
    candidate.features.grammarSignalKinds >= 3 &&
    candidate.features.grammarSignalCount >= 5 &&
    candidate.features.sentenceCount >= 5
  );
}

function blankFocusSuitable(candidate: V2AssessedCandidate): boolean {
  return (
    candidate.strata.blankSuitability === "central-span" &&
    candidate.features.hasDiscoursePivot &&
    candidate.features.sentenceCount >= 5 &&
    candidate.wordCount >= 150
  );
}

function generalSourceSuitable(candidate: V2AssessedCandidate): boolean {
  return candidate.origin !== "repo-official" || candidate.reconstructionKind === "none";
}

function observedQueueSize(targetPasses: number, observed: { passed: number; audited?: number; eligible?: number }): number {
  const denominator = observed.audited ?? observed.eligible ?? 0;
  if (observed.passed <= 0 || denominator <= 0) return targetPasses;
  return Math.ceil(targetPasses / (observed.passed / denominator));
}

function deterministicOrder(
  candidates: V2AssessedCandidate[],
  seed: string,
  salt: string,
  focus: "grammar" | "blank" | "general",
): V2AssessedCandidate[] {
  const typeMatch = (candidate: V2AssessedCandidate): number => {
    const hint = `${candidate.document.originalType ?? ""} ${candidate.typeHint ?? ""}`.toLowerCase();
    if (focus === "grammar") return /grammar|어법/.test(hint) ? 1 : 0;
    if (focus === "blank") return /blank|빈칸/.test(hint) ? 1 : 0;
    return 0;
  };
  return [...candidates].sort((left, right) => {
    const leftRepo = left.origin === "repo-official" ? 1 : 0;
    const rightRepo = right.origin === "repo-official" ? 1 : 0;
    if (leftRepo !== rightRepo) return rightRepo - leftRepo;
    const leftMatch = typeMatch(left);
    const rightMatch = typeMatch(right);
    if (leftMatch !== rightMatch) return rightMatch - leftMatch;
    return (
      sha256(`${seed}|${salt}|${left.contentHash}|${left.id}`).localeCompare(
        sha256(`${seed}|${salt}|${right.contentHash}|${right.id}`),
      ) || left.id.localeCompare(right.id)
    );
  });
}

function publicCandidate(
  candidate: V2AssessedCandidate,
  panel: PanelName,
  sequence: number,
  queueRole: "RETAINED_PASS" | "PRIMARY_CANDIDATE" | "RESERVE_CANDIDATE" | "REPLACEMENT_CANDIDATE",
): Record<string, unknown> {
  return {
    id: candidate.id,
    panel,
    sequence,
    queueRole,
    origin: candidate.origin,
    contentHash: candidate.contentHash,
    comparisonHash: comparisonHash(candidate.text),
    wordCount: candidate.wordCount,
    strata: candidate.strata,
    features: candidate.features,
    sourceDocument: candidate.document,
    automaticStatus: candidate.automaticStatus,
    historicalExposure: queueRole === "RETAINED_PASS"
      ? { policy: "GRANDFATHERED_TWO_RATER_ADJUDICATED_PASS" }
      : {
          artifactPassageIdOccurrences: 0,
          artifactExactOrNearTextMatches: 0,
          dbContentQuestionCount: candidate.databaseEvidence.questionCount,
          dbContentAiQuestionCount: candidate.databaseEvidence.aiQuestionCount,
          dbContentWorkbenchJobCount: candidate.databaseEvidence.workbenchJobCount,
          dbMatchedSameContentPassageCount: candidate.databaseEvidence.matchedPassageCount,
          dbCandidateAcademyId: candidate.databaseEvidence.candidateAcademyId,
          dbPriorUseScope: candidate.databaseEvidence.priorUseScope,
        },
    manualAudit: queueRole === "RETAINED_PASS"
      ? { status: "ADJUDICATED_PASS", requiredIndependentReviews: 2 }
      : {
          status: "PENDING",
          requiredIndependentReviews: 2,
          adjudicationRequired: true,
          usableForGeneration: false,
        },
    candidateOnly: queueRole !== "RETAINED_PASS",
  };
}

function summary(items: V2AssessedCandidate[]): Record<string, unknown> {
  const count = (pick: (candidate: V2AssessedCandidate) => string) =>
    Object.fromEntries(
      [...items.reduce((map, item) => {
        const key = pick(item);
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  return {
    total: items.length,
    origin: count((item) => item.origin),
    originalType: count((item) => item.document.originalType ?? "unknown"),
    topic: count((item) => item.strata.topic),
    discourse: count((item) => item.strata.discourse),
    wordBand: count((item) => item.strata.wordBand),
  };
}

export function buildCorpusV2(input: V2BuildInput): V2BuildResult {
  const seed = input.seed ?? V2_DEFAULT_SEED;
  const targets: V2Targets = { ...DEFAULT_TARGETS, ...input.targets };
  const assessed = input.candidates.map(assessV2);

  const historicalIndex = new NearDuplicateIndex();
  input.forbiddenReferences.forEach((item) => historicalIndex.add(item));
  const selectedIndex = new NearDuplicateIndex();

  const selected: Record<PanelName, V2AssessedCandidate[]> = {
    "general-dev-retained": [],
    "general-holdout-retained": [],
    "general-dev-replacement": [],
    "general-holdout-replacement": [],
    "focus-grammar-killer": [],
    "focus-blank-killer": [],
  };

  const exclusionCounts: Record<string, number> = {
    automaticOrReviewOrPriorIneligible: 0,
    historicalExactOrNear: 0,
    selectedExactOrNear: 0,
    grammarUnsuitable: 0,
    blankUnsuitable: 0,
  };
  const nearDuplicateExclusionsByCode: Record<string, number> = {};
  const countNear = (evidence: NearDuplicateEvidence) => {
    nearDuplicateExclusionsByCode[evidence.code] =
      (nearDuplicateExclusionsByCode[evidence.code] ?? 0) + 1;
  };

  // Existing PASS records are grandfathered only into their original general
  // split. They bypass exposure exclusion but are deduplicated against one another.
  const retainedOrder = [...input.retained].sort((left, right) => {
    if (left.keepOrDrop !== right.keepOrDrop) return left.keepOrDrop === "KEEP" ? -1 : 1;
    return sha256(`${seed}|retained|${left.candidate.id}`).localeCompare(
      sha256(`${seed}|retained|${right.candidate.id}`),
    );
  });
  for (const retained of retainedOrder) {
    const candidate = assessV2(retained.candidate);
    const retainedDuplicate = selectedIndex.query(candidate);
    if (retainedDuplicate) {
      exclusionCounts.selectedExactOrNear += 1;
      countNear(retainedDuplicate);
      continue;
    }
    const panel: PanelName = retained.split === "dev" ? "general-dev-retained" : "general-holdout-retained";
    selected[panel].push(candidate);
    selectedIndex.add({ id: candidate.id, text: candidate.text, source: panel, document: candidate.document });
  }

  const eligible: V2AssessedCandidate[] = [];
  for (const candidate of assessed) {
    if (!baseEligible(candidate, input.historicalPassageIds)) {
      exclusionCounts.automaticOrReviewOrPriorIneligible += 1;
      continue;
    }
    const historicalDuplicate = historicalIndex.query(candidate);
    if (historicalDuplicate) {
      exclusionCounts.historicalExactOrNear += 1;
      countNear(historicalDuplicate);
      continue;
    }
    eligible.push(candidate);
  }

  const take = (
    panel: PanelName,
    pool: V2AssessedCandidate[],
    requested: number,
    focus: "grammar" | "blank" | "general",
  ) => {
    for (const candidate of deterministicOrder(pool, seed, panel, focus)) {
      if (selected[panel].length >= requested) break;
      const selectedDuplicate = selectedIndex.query(candidate);
      if (selectedDuplicate) {
        exclusionCounts.selectedExactOrNear += 1;
        countNear(selectedDuplicate);
        continue;
      }
      selected[panel].push(candidate);
      selectedIndex.add({ id: candidate.id, text: candidate.text, source: panel, document: candidate.document });
    }
  };

  const grammarPool = eligible.filter((candidate) => {
    const suitable = grammarFocusSuitable(candidate);
    if (!suitable) exclusionCounts.grammarUnsuitable += 1;
    return suitable;
  });
  const blankPool = eligible.filter((candidate) => {
    const suitable = blankFocusSuitable(candidate);
    if (!suitable) exclusionCounts.blankUnsuitable += 1;
    return suitable;
  });
  const generalPool = eligible.filter(generalSourceSuitable);

  const grammarQueueTarget = observedQueueSize(
    targets.focusGrammarPrimary,
    targets.focusGrammarObservedPass,
  );
  const blankQueueTarget = observedQueueSize(targets.focusBlankPrimary, targets.focusBlankObservedPass);
  const generalDevQueueTarget = observedQueueSize(
    targets.generalDevMissing,
    targets.generalDevObservedPass,
  );
  const generalHoldoutQueueTarget = observedQueueSize(
    targets.generalHoldoutMissing,
    targets.generalHoldoutObservedPass,
  );

  // Specialized panels are allocated first so general queues cannot consume
  // the scarce type-fit passages. Every later allocation sees earlier clusters.
  take("focus-grammar-killer", grammarPool, grammarQueueTarget, "grammar");
  take("focus-blank-killer", blankPool, blankQueueTarget, "blank");
  take("general-dev-replacement", generalPool, generalDevQueueTarget, "general");
  take("general-holdout-replacement", generalPool, generalHoldoutQueueTarget, "general");

  const queueTargets: Record<PanelName, number> = {
    "general-dev-retained": selected["general-dev-retained"].length,
    "general-holdout-retained": selected["general-holdout-retained"].length,
    "general-dev-replacement": generalDevQueueTarget,
    "general-holdout-replacement": generalHoldoutQueueTarget,
    "focus-grammar-killer": grammarQueueTarget,
    "focus-blank-killer": blankQueueTarget,
  };
  const shortfalls = Object.fromEntries(
    (Object.keys(queueTargets) as PanelName[]).map((panel) => [
      panel,
      Math.max(0, queueTargets[panel] - selected[panel].length),
    ]),
  );

  const publicPanels = Object.fromEntries(
    (Object.keys(selected) as PanelName[]).map((panel) => {
      const primaryTarget = panel === "focus-grammar-killer"
        ? targets.focusGrammarPrimary
        : panel === "focus-blank-killer"
          ? targets.focusBlankPrimary
          : 0;
      return [
        panel,
        selected[panel].map((candidate, index) =>
          publicCandidate(
            candidate,
            panel,
            index + 1,
            panel.endsWith("retained")
              ? "RETAINED_PASS"
              : primaryTarget > 0
                ? index < primaryTarget
                  ? "PRIMARY_CANDIDATE"
                  : "RESERVE_CANDIDATE"
                : "REPLACEMENT_CANDIDATE",
          ),
        ),
      ];
    }),
  );

  const diagnostics = {
    input: {
      candidates: input.candidates.length,
      retainedPassRecords: input.retained.length,
      forbiddenTextReferences: input.forbiddenReferences.length,
      historicalPassageIds: input.historicalPassageIds.size,
    },
    targets: {
      queueTargets,
      focusGrammar: {
        primary: targets.focusGrammarPrimary,
        reserve: grammarQueueTarget - targets.focusGrammarPrimary,
        observedHoldoutPassRate: targets.focusGrammarObservedPass,
      },
      focusBlank: {
        primary: targets.focusBlankPrimary,
        reserve: blankQueueTarget - targets.focusBlankPrimary,
        observedHoldoutPassRate: targets.focusBlankObservedPass,
      },
      generalDev: {
        certifiedMissing: targets.generalDevMissing,
        auditQueue: generalDevQueueTarget,
        observedPassRate: targets.generalDevObservedPass,
      },
      generalHoldout: {
        certifiedMissing: targets.generalHoldoutMissing,
        auditQueue: generalHoldoutQueueTarget,
        observedPassRate: targets.generalHoldoutObservedPass,
      },
    },
    eligibleAfterHardGates: eligible.length,
    focusPools: { grammar: grammarPool.length, blank: blankPool.length },
    exclusionCounts,
    nearDuplicateExclusionsByCode: Object.fromEntries(
      Object.entries(nearDuplicateExclusionsByCode).sort(([a], [b]) => a.localeCompare(b)),
    ),
    shortfalls,
    selectedSummary: Object.fromEntries(
      (Object.keys(selected) as PanelName[]).map((panel) => [panel, summary(selected[panel])]),
    ),
  };

  const publicManifest = {
    schemaVersion: V2_SCHEMA_VERSION,
    selectionVersion: "2026-07-15-v2-strict-panels",
    seed,
    deterministicGivenInputs: true,
    policy: {
      status:
        "Every replacement/focus row is CLEAN_CANDIDATE only. Two independent manual audits plus adjudication are mandatory before any generation use.",
      strictDbRule:
        "New DB-origin candidates require reviewed=true and content-level Question=0, AI Question=0, WorkbenchAiJob=0. No relaxed tier exists.",
      repoRule:
        "Repository candidates require official high-confidence, no deliberate error, and zero DB prior use for identical normalized content. General/grammar require reconstructionKind=none; blank focus alone may admit high-confidence reconstructionKind=blank because that metadata denotes restoration of the source blank, and every row still awaits two audits.",
      separation:
        "Exact normalized hash, markup/boilerplate-stripped hash, source-range overlap, sequential-document overlap, 5-token similarity, and long contiguous overlap are all screened across panels and historical artifacts.",
      historicalScope:
        "experiments/ and scripts/ JSON/JSONL passage IDs/text plus explicit 7/15 dawn and grammar corpora; DB same-content prior-use evidence spans all academies, while DB candidate supply is limited to the configured research academy.",
      noRelaxation: true,
    },
    diagnostics,
    panels: publicPanels,
    publicManifestSha256: sha256(stableStringify({ seed, diagnostics, panels: publicPanels })),
  };

  const privateManifest = {
    schemaVersion: V2_SCHEMA_VERSION,
    confidentiality: "Contains passage text and matched DB passage IDs. Keep private.",
    publicManifestSha256: sha256(stableStringify(publicManifest)),
    panels: Object.fromEntries(
      (Object.keys(selected) as PanelName[]).map((panel) => [
        panel,
        selected[panel].map((candidate, index) => ({
          ...publicPanels[panel][index],
          passageContent: candidate.text,
          databaseEvidence: candidate.databaseEvidence,
        })),
      ]),
    ),
  };

  return { publicManifest, privateManifest, selected, diagnostics };
}
