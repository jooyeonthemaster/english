import {
  assessCandidate,
  sha256,
  stableStringify,
  type AssessedCandidate,
} from "../selector-core";
import {
  NearDuplicateIndex,
  type NearDuplicateEvidence,
} from "../v2/selector-core-v2";
import { comparisonHash } from "../v2/history-index";
import {
  CORPUS_V3_QUEUE_SPECS,
  sizeCorpusV3Queues,
  type QueuePlan,
} from "./queue-sizing";
import {
  V3_DEFAULT_SEED,
  V3_NEW_PASS_TARGETS,
  V3_RETAINED_CERTIFIED,
  V3_SCHEMA_VERSION,
  V3_SELECTION_VERSION,
  type V3ForbiddenReference,
  type V3PanelName,
  type V3PinnedSnapshot,
  type V3RawCandidate,
} from "./types-v3";

export type V3AssessedCandidate = Omit<AssessedCandidate, "origin"> & V3RawCandidate;

export interface V3SelectedCandidate extends V3AssessedCandidate {
  queueSequence: number;
  queueRole: "TARGET_CANDIDATE" | "RESERVE_CANDIDATE";
  selectionCell: string;
}

export interface V3SelectionSuccess {
  status: "READY_FOR_BLIND_AUDIT";
  publicManifest: Record<string, unknown>;
  privateManifest: Record<string, unknown>;
  selected: Record<V3PanelName, V3SelectedCandidate[]>;
  diagnostics: Record<string, unknown>;
}

export interface V3SelectionFailure {
  status: "HARD_FAIL_SUPPLY_SHORTAGE" | "HARD_FAIL_RETAINED_BASELINE";
  selected: Record<V3PanelName, V3SelectedCandidate[]>;
  diagnostics: Record<string, unknown>;
  publicReport: Record<string, unknown>;
}

export type V3SelectionResult = V3SelectionSuccess | V3SelectionFailure;

export const V3_STRATA_POLICY = {
  dimensions: ["wordBand", "discourse"],
  wordBands: ["120-169", "170-229", "230-360"],
  discourses: ["argumentative", "expository", "narrative", "practical"],
  queueConstraint: {
    minimumPopulatedWordBands: 2,
    minimumPopulatedDiscourses: 2,
    maximumSingleWordBandShare: 0.8,
    maximumSingleDiscourseShare: 0.8,
    appliesAtQueueSize: 20,
  },
} as const;

const PANEL_NAMES: readonly V3PanelName[] = [
  "focus-grammar-killer",
  "focus-blank-killer",
  "general-dev-db",
  "general-dev-repo",
  "general-holdout-db",
  "general-holdout-repo",
];

function emptySelection(): Record<V3PanelName, V3SelectedCandidate[]> {
  return Object.fromEntries(PANEL_NAMES.map((panel) => [panel, []])) as unknown as Record<
    V3PanelName,
    V3SelectedCandidate[]
  >;
}

function assessV3(candidate: V3RawCandidate): V3AssessedCandidate {
  const assessed = assessCandidate(candidate as never) as V3AssessedCandidate;
  if (blankSourceHardGateV3(assessed)) {
    assessed.integrityFlags = assessed.integrityFlags.filter(
      (flag) => flag.code !== "RECONSTRUCTED_SOURCE",
    );
    assessed.automaticStatus = assessed.integrityFlags.some(
      (flag) => flag.severity === "blocking",
    )
      ? "ROBUSTNESS_CANDIDATE"
      : "CLEAN_CANDIDATE";
  }
  return assessed;
}

function normalizeOriginalType(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
}

/**
 * This is deliberately narrower than a type-hint regex.  The repository's
 * source-document originalType must itself say blank inference, and the only
 * reconstruction admitted is the restoration of the official blank span.
 */
export function blankSourceHardGateV3(
  candidate: Pick<
    V3RawCandidate,
    | "origin"
    | "reviewed"
    | "confidence"
    | "reconstructionKind"
    | "hasDeliberateError"
    | "document"
  >,
): boolean {
  const originalType = normalizeOriginalType(candidate.document.originalType);
  const actualBlankType =
    originalType === "빈칸" ||
    originalType === "빈칸추론" ||
    originalType === "blank" ||
    originalType === "blankinference";
  return (
    candidate.origin === "repo-official" &&
    candidate.reviewed === true &&
    candidate.confidence?.toLowerCase() === "high" &&
    candidate.reconstructionKind === "blank" &&
    candidate.hasDeliberateError !== true &&
    actualBlankType
  );
}

function noPriorUse(candidate: V3AssessedCandidate): boolean {
  const evidence = candidate.databaseEvidence;
  return (
    evidence.priorUseScope === "ALL_ACADEMIES" &&
    evidence.questionCount === 0 &&
    evidence.aiQuestionCount === 0 &&
    evidence.workbenchJobCount === 0
  );
}

function historicalIdAliases(candidate: V3AssessedCandidate): string[] {
  return [
    candidate.id,
    candidate.id.replace(/^repo:/i, ""),
    candidate.sourceRecordId,
    candidate.sourceRecordId.replace(/^repo:/i, ""),
  ];
}

function sourceEligible(candidate: V3AssessedCandidate): boolean {
  if (candidate.origin === "repo-official") {
    return (
      candidate.reviewed === true &&
      candidate.confidence?.toLowerCase() === "high" &&
      candidate.hasDeliberateError !== true
    );
  }
  // reviewedAt is intentionally metadata only for global DB supply.
  return candidate.origin === "db-global";
}

function baseEligible(candidate: V3AssessedCandidate, historicalIds: Set<string>): boolean {
  return (
    candidate.automaticStatus === "CLEAN_CANDIDATE" &&
    sourceEligible(candidate) &&
    noPriorUse(candidate) &&
    historicalIdAliases(candidate).every((id) => !historicalIds.has(id))
  );
}

export function grammarFocusHardGateV3(candidate: V3AssessedCandidate): boolean {
  return (
    candidate.reconstructionKind === "none" &&
    candidate.strata.grammarSuitability === "rich" &&
    candidate.features.grammarSignalKinds >= 3 &&
    candidate.features.grammarSignalCount >= 5 &&
    candidate.features.sentenceCount >= 5
  );
}

export function blankFocusHardGateV3(candidate: V3AssessedCandidate): boolean {
  return (
    blankSourceHardGateV3(candidate) &&
    candidate.strata.blankSuitability === "central-span" &&
    candidate.features.hasDiscoursePivot &&
    candidate.features.sentenceCount >= 5 &&
    candidate.wordCount >= 150
  );
}

function generalHardGate(candidate: V3AssessedCandidate): boolean {
  return candidate.reconstructionKind === "none";
}

function cell(candidate: V3AssessedCandidate): string {
  return `${candidate.strata.wordBand}|${candidate.strata.discourse}`;
}

function deterministicHash(
  candidate: V3AssessedCandidate,
  seed: string,
  salt: string,
): string {
  return sha256(`${seed}|${salt}|${cell(candidate)}|${candidate.contentHash}|${candidate.id}`);
}

/** Equal-cell deficit ordering with a deterministic hash inside each cell. */
export function stratifiedOrderV3(
  candidates: V3AssessedCandidate[],
  seed: string,
  salt: string,
): V3AssessedCandidate[] {
  const buckets = new Map<string, V3AssessedCandidate[]>();
  for (const candidate of candidates) {
    const key = cell(candidate);
    const bucket = buckets.get(key) ?? [];
    bucket.push(candidate);
    buckets.set(key, bucket);
  }
  for (const [key, bucket] of buckets) {
    bucket.sort(
      (left, right) =>
        deterministicHash(left, seed, `${salt}|${key}`).localeCompare(
          deterministicHash(right, seed, `${salt}|${key}`),
        ) || left.id.localeCompare(right.id),
    );
  }
  const keys = [...buckets.keys()].sort((left, right) => {
    const leftHash = sha256(`${seed}|${salt}|cell|${left}`);
    const rightHash = sha256(`${seed}|${salt}|cell|${right}`);
    return leftHash.localeCompare(rightHash) || left.localeCompare(right);
  });
  const output: V3AssessedCandidate[] = [];
  while (keys.some((key) => (buckets.get(key)?.length ?? 0) > 0)) {
    for (const key of keys) {
      const next = buckets.get(key)?.shift();
      if (next) output.push(next);
    }
  }
  return output;
}

function countBy(items: V3AssessedCandidate[], pick: (item: V3AssessedCandidate) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = pick(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function strataConstraintResultV3(items: V3AssessedCandidate[]): Record<string, unknown> {
  const wordBand = countBy(items, (item) => item.strata.wordBand);
  const discourse = countBy(items, (item) => item.strata.discourse);
  const relevantWordBands = Object.entries(wordBand).filter(
    ([key, value]) => key !== "outside" && value > 0,
  );
  const relevantDiscourses = Object.entries(discourse).filter(([, value]) => value > 0);
  const size = items.length;
  const maxWordShare = Math.max(0, ...relevantWordBands.map(([, value]) => value / Math.max(1, size)));
  const maxDiscourseShare = Math.max(
    0,
    ...relevantDiscourses.map(([, value]) => value / Math.max(1, size)),
  );
  const applies = size >= V3_STRATA_POLICY.queueConstraint.appliesAtQueueSize;
  const passed =
    !applies ||
    (relevantWordBands.length >=
      V3_STRATA_POLICY.queueConstraint.minimumPopulatedWordBands &&
      relevantDiscourses.length >=
        V3_STRATA_POLICY.queueConstraint.minimumPopulatedDiscourses &&
      maxWordShare <= V3_STRATA_POLICY.queueConstraint.maximumSingleWordBandShare &&
      maxDiscourseShare <= V3_STRATA_POLICY.queueConstraint.maximumSingleDiscourseShare);
  return {
    applies,
    passed,
    wordBand,
    discourse,
    populatedWordBands: relevantWordBands.length,
    populatedDiscourses: relevantDiscourses.length,
    maximumWordBandShare: Number(maxWordShare.toFixed(6)),
    maximumDiscourseShare: Number(maxDiscourseShare.toFixed(6)),
  };
}

function publicCandidate(candidate: V3SelectedCandidate, panel: V3PanelName) {
  return {
    id: candidate.id,
    panel,
    queueSequence: candidate.queueSequence,
    queueRole: candidate.queueRole,
    origin: candidate.origin,
    contentHash: candidate.contentHash,
    comparisonHash: comparisonHash(candidate.text),
    wordCount: candidate.wordCount,
    strata: candidate.strata,
    features: candidate.features,
    sourceDocument: candidate.document,
    selectionCell: candidate.selectionCell,
    sourceEvidence: {
      priorUseScope: candidate.databaseEvidence.priorUseScope,
      matchedPassageCount: candidate.databaseEvidence.matchedPassageCount,
      matchedAcademyCount: candidate.databaseEvidence.matchedAcademyCount,
      questionCount: candidate.databaseEvidence.questionCount,
      aiQuestionCount: candidate.databaseEvidence.aiQuestionCount,
      workbenchJobCount: candidate.databaseEvidence.workbenchJobCount,
      representativeReviewed: candidate.databaseEvidence.representativeReviewed,
      reviewedPassageCount: candidate.databaseEvidence.reviewedPassageCount,
    },
    candidateOnly: true,
    usableForGeneration: false,
    manualAudit: {
      status: "PENDING",
      requiredIndependentReviews: 2,
      adjudicationRequired: true,
    },
  };
}

function retainedCounts(snapshot: V3PinnedSnapshot): Record<string, number> {
  return {
    "dev|db-global": snapshot.retained.filter(
      (item) => item.split === "dev" && item.candidate.origin === "db-global",
    ).length,
    "dev|repo-official": snapshot.retained.filter(
      (item) => item.split === "dev" && item.candidate.origin === "repo-official",
    ).length,
    "holdout|db-global": snapshot.retained.filter(
      (item) => item.split === "holdout" && item.candidate.origin === "db-global",
    ).length,
    "holdout|repo-official": snapshot.retained.filter(
      (item) => item.split === "holdout" && item.candidate.origin === "repo-official",
    ).length,
  };
}

function retainedBaselineErrors(snapshot: V3PinnedSnapshot): string[] {
  const actual = retainedCounts(snapshot);
  const expected: Record<string, number> = {
    "dev|db-global": V3_RETAINED_CERTIFIED.dev["db-global"],
    "dev|repo-official": V3_RETAINED_CERTIFIED.dev["repo-official"],
    "holdout|db-global": V3_RETAINED_CERTIFIED.holdout["db-global"],
    "holdout|repo-official": V3_RETAINED_CERTIFIED.holdout["repo-official"],
  };
  return Object.keys(expected)
    .filter((key) => actual[key] !== expected[key])
    .map((key) => `${key}: expected ${expected[key]}, observed ${actual[key]}`);
}

function queuePlanPublic(plan: QueuePlan) {
  return {
    id: plan.id,
    targetPasses: plan.targetPasses,
    requiredCandidates: plan.requiredCandidates,
    reserveCandidates: plan.reserveCandidates,
    conservativePassRate: plan.conservativePassRate,
    rateBasis: plan.rateBasis,
    requiredReachProbability: plan.requiredReachProbability,
    achievedReachProbability: plan.achievedReachProbability,
    previousSizeReachProbability: plan.previousSizeReachProbability,
    sensitivity: plan.sensitivity,
  };
}

function addReference(index: NearDuplicateIndex, reference: V3ForbiddenReference): void {
  index.add({
    id: reference.id,
    text: reference.text,
    source: reference.source,
    document: reference.document,
  });
}

export function buildCorpusV3(snapshot: V3PinnedSnapshot): V3SelectionResult {
  const seed = snapshot.seed || V3_DEFAULT_SEED;
  const expectedSnapshotHash = sha256(
    stableStringify(Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotHash"))),
  );
  if (expectedSnapshotHash !== snapshot.snapshotHash) {
    throw new Error("Pinned snapshot hash mismatch; selection refused.");
  }

  const selected = emptySelection();
  const baselineErrors = retainedBaselineErrors(snapshot);
  if (baselineErrors.length > 0) {
    const diagnostics = {
      retainedBaseline: { passed: false, errors: baselineErrors, actual: retainedCounts(snapshot) },
    };
    return {
      status: "HARD_FAIL_RETAINED_BASELINE",
      selected,
      diagnostics,
      publicReport: {
        schemaVersion: V3_SCHEMA_VERSION,
        selectionVersion: V3_SELECTION_VERSION,
        status: "HARD_FAIL_RETAINED_BASELINE",
        snapshotHash: snapshot.snapshotHash,
        diagnostics,
        databaseWrites: 0,
        apiCalls: 0,
      },
    };
  }

  const assessed = snapshot.candidates.map(assessV3);
  const historicalIds = new Set(snapshot.historicalPassageIds);
  const historicalIndex = new NearDuplicateIndex();
  snapshot.forbiddenReferences.forEach((reference) => addReference(historicalIndex, reference));
  const selectedIndex = new NearDuplicateIndex();
  for (const retained of snapshot.retained) {
    selectedIndex.add({
      id: retained.candidate.id,
      text: retained.candidate.text,
      source: `retained-${retained.split}`,
      document: retained.candidate.document,
    });
  }

  const exclusions: Record<string, number> = {
    hardGate: 0,
    historicalExactOrNear: 0,
    selectedExactOrNear: 0,
  };
  const nearDuplicateCodes: Record<string, number> = {};
  const countNear = (evidence: NearDuplicateEvidence) => {
    nearDuplicateCodes[evidence.code] = (nearDuplicateCodes[evidence.code] ?? 0) + 1;
  };
  const eligible: V3AssessedCandidate[] = [];
  for (const candidate of assessed) {
    if (!baseEligible(candidate, historicalIds)) {
      exclusions.hardGate += 1;
      continue;
    }
    const historicalDuplicate = historicalIndex.query(candidate as never);
    if (historicalDuplicate) {
      exclusions.historicalExactOrNear += 1;
      countNear(historicalDuplicate);
      continue;
    }
    eligible.push(candidate);
  }

  const queuePlans = sizeCorpusV3Queues(CORPUS_V3_QUEUE_SPECS);
  const queueByPanel = new Map(queuePlans.map((plan) => [plan.id as V3PanelName, plan]));
  const pools: Record<V3PanelName, V3AssessedCandidate[]> = {
    "focus-grammar-killer": eligible.filter(grammarFocusHardGateV3),
    "focus-blank-killer": eligible.filter(blankFocusHardGateV3),
    "general-dev-db": eligible.filter(
      (candidate) => candidate.origin === "db-global" && generalHardGate(candidate),
    ),
    "general-dev-repo": eligible.filter(
      (candidate) => candidate.origin === "repo-official" && generalHardGate(candidate),
    ),
    "general-holdout-db": eligible.filter(
      (candidate) => candidate.origin === "db-global" && generalHardGate(candidate),
    ),
    "general-holdout-repo": eligible.filter(
      (candidate) => candidate.origin === "repo-official" && generalHardGate(candidate),
    ),
  };

  // Scarce, type-specific panels precede general queues. Split-specific pools
  // remain globally disjoint through the same near-duplicate index.
  const allocationOrder: readonly V3PanelName[] = [
    "focus-blank-killer",
    "focus-grammar-killer",
    "general-dev-db",
    "general-holdout-db",
    "general-dev-repo",
    "general-holdout-repo",
  ];
  for (const panel of allocationOrder) {
    const required = queueByPanel.get(panel)?.requiredCandidates ?? 0;
    const targetPasses = V3_NEW_PASS_TARGETS[panel];
    for (const candidate of stratifiedOrderV3(pools[panel], seed, panel)) {
      if (selected[panel].length >= required) break;
      const duplicate = selectedIndex.query(candidate as never);
      if (duplicate) {
        exclusions.selectedExactOrNear += 1;
        countNear(duplicate);
        continue;
      }
      const sequence = selected[panel].length + 1;
      selected[panel].push({
        ...candidate,
        queueSequence: sequence,
        queueRole: sequence <= targetPasses ? "TARGET_CANDIDATE" : "RESERVE_CANDIDATE",
        selectionCell: cell(candidate),
      });
      selectedIndex.add({
        id: candidate.id,
        text: candidate.text,
        source: panel,
        document: candidate.document,
      });
    }
  }

  const shortfalls = Object.fromEntries(
    PANEL_NAMES.map((panel) => {
      const required = queueByPanel.get(panel)?.requiredCandidates ?? 0;
      return [
        panel,
        {
          poolBeforeCrossPanelDeduplication: pools[panel].length,
          requiredCandidates: required,
          selectedCandidates: selected[panel].length,
          shortfall: Math.max(0, required - selected[panel].length),
        },
      ];
    }),
  ) as Record<
    V3PanelName,
    {
      poolBeforeCrossPanelDeduplication: number;
      requiredCandidates: number;
      selectedCandidates: number;
      shortfall: number;
    }
  >;
  const strata = Object.fromEntries(
    PANEL_NAMES.map((panel) => [panel, strataConstraintResultV3(selected[panel])]),
  );
  const failedStrata = PANEL_NAMES.filter(
    (panel) => (strata[panel] as { passed: boolean }).passed === false,
  );
  const shortagePanels = PANEL_NAMES.filter((panel) => shortfalls[panel].shortfall > 0);
  const diagnostics = {
    pinnedSnapshot: {
      snapshotHash: snapshot.snapshotHash,
      asOf: snapshot.asOf,
      gitSha: snapshot.gitSha,
      codeHash: snapshot.codeHash,
      repoPassagesFileHash: snapshot.repoPassagesFileHash,
      historicalFilesHash: snapshot.historicalFilesHash,
      historicalExtractHash: snapshot.historicalExtractHash,
      databaseExtractHash: snapshot.databaseExtractHash,
    },
    input: {
      candidates: snapshot.candidates.length,
      retained: snapshot.retained.length,
      forbiddenReferences: snapshot.forbiddenReferences.length,
      historicalPassageIds: snapshot.historicalPassageIds.length,
    },
    retainedBaseline: { passed: true, actual: retainedCounts(snapshot) },
    queuePlans: queuePlans.map(queuePlanPublic),
    poolSizes: Object.fromEntries(PANEL_NAMES.map((panel) => [panel, pools[panel].length])),
    selectedCounts: Object.fromEntries(PANEL_NAMES.map((panel) => [panel, selected[panel].length])),
    shortfalls,
    shortagePanels,
    strataPolicy: V3_STRATA_POLICY,
    strata,
    failedStrata,
    exclusions,
    nearDuplicateCodes: Object.fromEntries(
      Object.entries(nearDuplicateCodes).sort(([a], [b]) => a.localeCompare(b)),
    ),
    reviewedAtEligibilityRule: "metadata-only",
    allAcademyPriorUseRequired: true,
    databaseWrites: 0,
    apiCalls: 0,
  };

  if (shortagePanels.length > 0 || failedStrata.length > 0) {
    return {
      status: "HARD_FAIL_SUPPLY_SHORTAGE",
      selected,
      diagnostics,
      publicReport: {
        schemaVersion: V3_SCHEMA_VERSION,
        selectionVersion: V3_SELECTION_VERSION,
        status: "HARD_FAIL_SUPPLY_SHORTAGE",
        reason:
          "Pinned eligible supply cannot fill every preregistered 95%/95% queue and stratum constraint. Targets were not weakened.",
        snapshotHash: snapshot.snapshotHash,
        diagnostics,
        operationalManifestWritten: false,
        auditPacketWritten: false,
        databaseWrites: 0,
        apiCalls: 0,
      },
    };
  }

  const panels = Object.fromEntries(
    PANEL_NAMES.map((panel) => [
      panel,
      selected[panel].map((candidate) => publicCandidate(candidate, panel)),
    ]),
  );
  const publicManifestCore = {
    schemaVersion: V3_SCHEMA_VERSION,
    selectionVersion: V3_SELECTION_VERSION,
    status: "CANDIDATE_QUEUE_ONLY",
    seed,
    snapshotHash: snapshot.snapshotHash,
    deterministicGivenPinnedSnapshot: true,
    policy: {
      candidateOnly: true,
      usableForGeneration: false,
      requiredIndependentReviews: 2,
      adjudicationRequired: true,
      reviewedAtEligibilityRule: "metadata-only",
      academyIdentifiersPublic: false,
      priorUseScope: "ALL_ACADEMIES_NORMALIZED_CONTENT_GROUP",
      blankHardGate:
        "repo official + originalType blank inference + high confidence + reconstructionKind=blank",
      historyScope:
        "Every antecedent JSON/JSONL long English leaf; only this campaign's v3 derived outputs excluded.",
    },
    diagnostics,
    panels,
  };
  const publicManifest = {
    ...publicManifestCore,
    publicManifestSha256: sha256(stableStringify(publicManifestCore)),
  };
  const privateManifest = {
    schemaVersion: V3_SCHEMA_VERSION,
    confidentiality: "PRIVATE SEALED STAGING: passage text and DB provenance; never publish.",
    snapshotHash: snapshot.snapshotHash,
    publicManifestSha256: sha256(stableStringify(publicManifest)),
    panels: Object.fromEntries(
      PANEL_NAMES.map((panel) => [
        panel,
        selected[panel].map((candidate) => ({
          ...publicCandidate(candidate, panel),
          passage: candidate.text,
          sourceRecordId: candidate.sourceRecordId,
          databaseEvidence: candidate.databaseEvidence,
          privateDatabaseProvenance: candidate.privateDatabaseProvenance ?? null,
        })),
      ]),
    ),
  };
  return {
    status: "READY_FOR_BLIND_AUDIT",
    publicManifest,
    privateManifest,
    selected,
    diagnostics,
  };
}
