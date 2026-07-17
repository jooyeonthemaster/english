export const V4_SUPPLY_SCHEMA_VERSION = 4;
export const V4_SUPPLY_VERSION = "2026-07-15-v4-supply-remediation-capture-contract-v2";

export type V4Family =
  | "committed-passage-current"
  | "extraction-item-passage"
  | "extraction-result"
  | "m1-passage-draft"
  | "m2-passage-draft"
  | "local-hs-ms"
  | "local-test-restoration"
  | "local-grammar-drill";

export type V4RightsStatus =
  | "OFFICIAL_EXAM_PROVENANCE_LICENSE_NOT_RECORDED"
  | "CUSTOMER_UPLOAD_RIGHTS_NOT_RECORDED"
  | "GENERIC_SOURCE_LABEL_RIGHTS_UNVERIFIED"
  | "PROJECT_SYNTHETIC_TEST_NOT_INDEPENDENT"
  | "PROJECT_CURRICULUM_NOT_PASSAGE_SOURCE";

export type V4ReviewState = "COMMITTED" | "REVIEWED" | "DRAFT" | "UNKNOWN";

export type V4LineageState =
  | "CANONICAL_COMMITTED_PASSAGE"
  | "EXTRACTION_PROMOTED"
  | "SAVED_PASSAGE_LINKED"
  | "DRAFT_CONFIRMED"
  | "NONE";

export type V4DependencyGitStatus =
  | "TRACKED_CLEAN"
  | "TRACKED_DIRTY"
  | "UNTRACKED";

export interface V4DependencyEntry {
  sha256: string;
  bytes: number;
  role:
    | "STATIC_IMPORT_CLOSURE"
    | "DYNAMIC_CATALOG_INPUT"
    | "DECLARED_SURVEY_INPUT"
    | "DATABASE_SCHEMA"
    | "PACKAGE_RESOLUTION"
    | "PINNED_V3_INPUT";
  gitStatus: V4DependencyGitStatus;
  gitPorcelain: string | null;
}

export interface V4DependencyManifest {
  algorithm: "STATIC_LOCAL_IMPORT_CLOSURE_PLUS_DECLARED_INPUTS_V2";
  entrypoints: string[];
  files: Record<string, V4DependencyEntry>;
  repositoryGit: {
    headSha: string;
    dirty: boolean;
    dirtyPathCount: number;
    untrackedPathCount: number;
    dependencyDirty: boolean;
    dependencyDirtyPaths: string[];
    dependencyUntrackedPaths: string[];
  };
  manifestHash: string;
}

export interface V4InventoryRecord {
  id: string;
  family: V4Family;
  text: string;
  sourceDocumentKey: string | null;
  sourceMaterialType: string | null;
  sourceMaterialSubject: string | null;
  sourceExamType: string | null;
  sourceRefPresent: boolean;
  originalFilePresent: boolean;
  academyId: string | null;
  reviewState: V4ReviewState;
  lineageState: V4LineageState;
  /** Compatibility aggregate only. Prefer lineageState for interpretation. */
  savedOrPromoted: boolean;
  rightsStatus: V4RightsStatus;
  /** Type/subject metadata tag only; it is not source traceability or rights evidence. */
  officialTypeTagged: boolean;
  blankEvidence: "NONE" | "LINKED_ORIGINAL_STEM" | "TAG_ONLY";
  blankStemCount: number;
}

export interface V4PinnedInventory {
  schemaVersion: 4;
  version: string;
  capturedAt: string;
  captureWindow: {
    startedAt: string;
    completedAt: string;
  };
  temporalSemantics: "CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF";
  historicalAsOfSupported: false;
  v3SnapshotHash: string;
  gitSha: string;
  codeHash: string;
  dependencyManifest: V4DependencyManifest;
  localSourceHashes: Record<string, string>;
  databaseExtractHash: string;
  databaseRecordSetHash: string;
  records: V4InventoryRecord[];
  sourceDiagnostics: Record<string, unknown>;
  snapshotHash: string;
}
