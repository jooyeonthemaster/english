import { stableStringify } from "../selector-core";
import {
  V3_NEW_PASS_TARGETS,
  V3_RETAINED_CERTIFIED,
  type V3PanelName,
} from "./types-v3";

export type AuditDecision = "PASS" | "FAIL";

export interface AuditQueueItem {
  blindId: string;
  candidateId: string;
  panel: V3PanelName;
  queueSequence: number;
  origin: "repo-official" | "db-global";
  strata: { wordBand: string; discourse: string };
}

export interface IndependentReview {
  reviewerId: string;
  attested: boolean;
  records: Array<{ blindId: string; finalDecision: AuditDecision | "PENDING" }>;
}

export interface AdjudicationRecordV3 {
  blindId: string;
  finalDecision: AuditDecision;
  adjudicatorId: string;
  rationale: string;
}

export interface AuditFinalizationInput {
  queue: AuditQueueItem[];
  reviewA: IndependentReview;
  reviewB: IndependentReview;
  adjudication: AdjudicationRecordV3[];
}

export interface AuditFinalizationResult {
  status: "CERTIFIED" | "INCOMPLETE";
  certified: Record<V3PanelName, AuditQueueItem[]>;
  unusableBlindIds: string[];
  diagnostics: Record<string, unknown>;
}

const PANELS = Object.keys(V3_NEW_PASS_TARGETS) as V3PanelName[];

function mapReview(review: IndependentReview): Map<string, AuditDecision | "PENDING"> {
  const result = new Map<string, AuditDecision | "PENDING">();
  for (const record of review.records) {
    if (result.has(record.blindId)) throw new Error(`Duplicate review row: ${record.blindId}`);
    result.set(record.blindId, record.finalDecision);
  }
  return result;
}

function assertFrozenQueue(queue: AuditQueueItem[]): void {
  const seen = new Set<string>();
  const sequencesByPanel = new Map<V3PanelName, number[]>();
  for (const item of queue) {
    if (seen.has(item.blindId)) throw new Error(`Duplicate blindId: ${item.blindId}`);
    seen.add(item.blindId);
    const sequences = sequencesByPanel.get(item.panel) ?? [];
    sequences.push(item.queueSequence);
    sequencesByPanel.set(item.panel, sequences);
  }
  for (const [panel, rawSequences] of sequencesByPanel) {
    const sequences = [...rawSequences].sort((left, right) => left - right);
    for (let index = 0; index < sequences.length; index += 1) {
      const expected = index + 1;
      if (sequences[index] !== expected) {
        throw new Error(
          `Frozen queue sequence broken for ${panel}: expected ${expected}, got ${sequences[index]}`,
        );
      }
    }
  }
}

function finalStrata(items: AuditQueueItem[]) {
  const count = (pick: (item: AuditQueueItem) => string) => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = pick(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  };
  const wordBand = count((item) => item.strata.wordBand);
  const discourse = count((item) => item.strata.discourse);
  const wordValues = Object.entries(wordBand).filter(
    ([key, value]) => key !== "outside" && value > 0,
  );
  const discourseValues = Object.entries(discourse).filter(([, value]) => value > 0);
  const maxWordShare = Math.max(0, ...wordValues.map(([, value]) => value / items.length));
  const maxDiscourseShare = Math.max(
    0,
    ...discourseValues.map(([, value]) => value / items.length),
  );
  return {
    passed:
      wordValues.length >= 2 &&
      discourseValues.length >= 2 &&
      maxWordShare <= 0.8 &&
      maxDiscourseShare <= 0.8,
    wordBand,
    discourse,
    maximumWordBandShare: Number(maxWordShare.toFixed(6)),
    maximumDiscourseShare: Number(maxDiscourseShare.toFixed(6)),
  };
}

export function finalizeAuditV3(input: AuditFinalizationInput): AuditFinalizationResult {
  assertFrozenQueue(input.queue);
  if (!input.reviewA.attested || !input.reviewB.attested) {
    throw new Error("Both independence attestations must be true.");
  }
  if (!input.reviewA.reviewerId || input.reviewA.reviewerId === input.reviewB.reviewerId) {
    throw new Error("Two distinct reviewer identities are required.");
  }
  const reviewA = mapReview(input.reviewA);
  const reviewB = mapReview(input.reviewB);
  const adjudication = new Map<string, AdjudicationRecordV3>();
  for (const record of input.adjudication) {
    if (adjudication.has(record.blindId)) {
      throw new Error(`Duplicate adjudication: ${record.blindId}`);
    }
    if (!record.adjudicatorId || !record.rationale.trim()) {
      throw new Error(`Incomplete adjudication: ${record.blindId}`);
    }
    adjudication.set(record.blindId, record);
  }

  const certified = Object.fromEntries(PANELS.map((panel) => [panel, []])) as unknown as Record<
    V3PanelName,
    AuditQueueItem[]
  >;
  const unusable = new Set<string>();
  let disagreements = 0;
  let adjudicatedDisagreements = 0;
  for (const panel of PANELS) {
    const panelQueue = input.queue
      .filter((item) => item.panel === panel)
      .sort((left, right) => left.queueSequence - right.queueSequence);
    for (const item of panelQueue) {
      if (certified[item.panel].length >= V3_NEW_PASS_TARGETS[item.panel]) {
        // Reserve rows after the target is reached remain intentionally unused.
        unusable.add(item.blindId);
        continue;
      }
      const left = reviewA.get(item.blindId) ?? "PENDING";
      const right = reviewB.get(item.blindId) ?? "PENDING";
      if (left === "PENDING" || right === "PENDING") {
        unusable.add(item.blindId);
        continue;
      }
      let decision: AuditDecision;
      if (left === right) {
        decision = left;
      } else {
        disagreements += 1;
        const resolved = adjudication.get(item.blindId);
        if (!resolved) {
          unusable.add(item.blindId);
          continue;
        }
        adjudicatedDisagreements += 1;
        decision = resolved.finalDecision;
      }
      if (decision === "PASS") certified[item.panel].push(item);
      else unusable.add(item.blindId);
    }
  }

  const shortfalls = Object.fromEntries(
    PANELS.map((panel) => [
      panel,
      Math.max(0, V3_NEW_PASS_TARGETS[panel] - certified[panel].length),
    ]),
  ) as Record<V3PanelName, number>;
  const finalStrataByPanel = Object.fromEntries(
    PANELS.map((panel) => [panel, finalStrata(certified[panel])]),
  ) as Record<V3PanelName, ReturnType<typeof finalStrata>>;
  const status =
    PANELS.every((panel) => shortfalls[panel] === 0) &&
    PANELS.every((panel) => finalStrataByPanel[panel].passed)
      ? "CERTIFIED"
      : "INCOMPLETE";
  const generalTotals = {
    dev: {
      db: V3_RETAINED_CERTIFIED.dev["db-global"] + certified["general-dev-db"].length,
      repo:
        V3_RETAINED_CERTIFIED.dev["repo-official"] + certified["general-dev-repo"].length,
    },
    holdout: {
      db:
        V3_RETAINED_CERTIFIED.holdout["db-global"] +
        certified["general-holdout-db"].length,
      repo:
        V3_RETAINED_CERTIFIED.holdout["repo-official"] +
        certified["general-holdout-repo"].length,
    },
  };
  if (
    status === "CERTIFIED" &&
    stableStringify(generalTotals) !==
      stableStringify({ dev: { db: 33, repo: 33 }, holdout: { db: 33, repo: 33 } })
  ) {
    throw new Error("Certified general origin/split totals are not exactly 33 each.");
  }
  return {
    status,
    certified,
    unusableBlindIds: [...unusable].sort(),
    diagnostics: {
      targets: V3_NEW_PASS_TARGETS,
      certifiedCounts: Object.fromEntries(
        PANELS.map((panel) => [panel, certified[panel].length]),
      ),
      shortfalls,
      generalTotals,
      finalStrata: finalStrataByPanel,
      disagreements,
      adjudicatedDisagreements,
      unreviewedOrUnused: unusable.size,
      unreviewedUsable: 0,
      stoppedAtTarget: true,
    },
  };
}
