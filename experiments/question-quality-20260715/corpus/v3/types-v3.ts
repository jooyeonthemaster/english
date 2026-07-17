import type { RawCandidate } from "../selector-core";
import type {
  DatabaseContentEvidence,
  SourceDocumentMetadata,
} from "../v2/selector-core-v2";

export const V3_SCHEMA_VERSION = 3;
export const V3_SELECTION_VERSION = "2026-07-15-v3-pinned-stratified";
export const V3_DEFAULT_SEED = "question-quality-20260715-corpus-v3-pinned-stratified";

export type V3Origin = "repo-official" | "db-global";

export type V3PanelName =
  | "focus-grammar-killer"
  | "focus-blank-killer"
  | "general-dev-db"
  | "general-dev-repo"
  | "general-holdout-db"
  | "general-holdout-repo";

export interface V3DatabaseEvidence extends DatabaseContentEvidence {
  candidateAcademyId: null;
  representativeReviewed: boolean;
  reviewedPassageCount: number;
  matchedAcademyCount: number;
}

export interface V3PrivateDatabaseProvenance {
  representativePassageId: string;
  representativeAcademyId: string;
  matchedPassageIds: string[];
  matchedAcademyIds: string[];
  reviewedAtByPassageId: Record<string, string | null>;
}

export interface V3RawCandidate extends Omit<RawCandidate, "origin"> {
  origin: V3Origin;
  document: SourceDocumentMetadata;
  databaseEvidence: V3DatabaseEvidence;
  privateDatabaseProvenance?: V3PrivateDatabaseProvenance;
  sourceRecordId: string;
}

export interface V3RetainedPass {
  candidate: V3RawCandidate;
  split: "dev" | "holdout";
  finalDecision: "PASS";
  keepOrDrop: string;
  grammarRichness: string;
  blankSuitability: string;
  independentReviewCount: 2;
}

export interface V3ForbiddenReference {
  id: string;
  text: string;
  source: string;
  document?: SourceDocumentMetadata;
  lineage: "ANTECEDENT_ARTIFACT" | "PRIOR_DB_USE" | "EXPLICIT_SENTINEL";
}

export interface V3SnapshotCore {
  schemaVersion: 3;
  asOf: string;
  seed: string;
  gitSha: string;
  gitDirty: boolean;
  codeHash: string;
  repoPassagesFileHash: string;
  historicalFilesHash: string;
  historicalExtractHash: string;
  databaseExtractHash: string;
  candidates: V3RawCandidate[];
  retained: V3RetainedPass[];
  forbiddenReferences: V3ForbiddenReference[];
  historicalPassageIds: string[];
  diagnostics: Record<string, unknown>;
}

export interface V3PinnedSnapshot extends V3SnapshotCore {
  snapshotHash: string;
}

export interface V3QueueTargets {
  "focus-grammar-killer": number;
  "focus-blank-killer": number;
  "general-dev-db": number;
  "general-dev-repo": number;
  "general-holdout-db": number;
  "general-holdout-repo": number;
}

export const V3_CERTIFIED_TARGETS = {
  focusGrammar: 66,
  focusBlank: 66,
  generalPerSplitPerOrigin: 33,
} as const;

export const V3_RETAINED_CERTIFIED = {
  dev: { "db-global": 10, "repo-official": 22 },
  holdout: { "db-global": 4, "repo-official": 21 },
} as const;

export const V3_NEW_PASS_TARGETS: V3QueueTargets = {
  "focus-grammar-killer": 66,
  "focus-blank-killer": 66,
  "general-dev-db": 23,
  "general-dev-repo": 11,
  "general-holdout-db": 29,
  "general-holdout-repo": 12,
};

