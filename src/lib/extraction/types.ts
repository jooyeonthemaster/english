// ============================================================================
// Shared types for the bulk extraction pipeline.
// Kept as plain string-union types (matching the Prisma schema column values)
// so both server and client can use them without a Prisma import.
// ============================================================================

import type { BlockType } from "./block-types";
import type { ExtractionMode } from "./modes";
import type { M1RestorationStatus } from "./m1-restoration";

// Re-exports — consumers can import everything from "@/lib/extraction/types".
export type { BlockType } from "./block-types";
export type { ExtractionMode } from "./modes";

export type ExtractionSourceType = "PDF" | "IMAGES" | "TEXT";

export type ExtractionJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type ExtractionPageStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "DEAD"
  | "SKIPPED";

export type ExtractionResultStatus = "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";

/** Error taxonomy — emitted by classifyGeminiError() and consumed by the UI. */
export type ExtractionErrorCode =
  | "GEMINI_AUTH"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_SERVER"
  | "GEMINI_TIMEOUT"
  | "INVALID_IMAGE"
  | "SAFETY_BLOCKED"
  | "EMPTY_OUTPUT"
  | "STORAGE_FETCH"
  | "INSUFFICIENT_CREDITS"
  | "NETWORK"
  | "PARSE_ERROR"
  | "UNKNOWN";

/** ExtractionItem.status — granular block promotion lifecycle. */
export type ExtractionItemStatus =
  | "DRAFT"
  | "REVIEWED"
  | "PROMOTED"
  | "SKIPPED"
  | "MERGED";

export interface ExtractionErrorClassification {
  code: ExtractionErrorCode;
  retryable: boolean;
  userMessage: string;
}

/** Page slot the UI tracks between "upload" and "processing" states. */
export interface ClientPageSlot {
  pageIndex: number;
  blob: Blob;
  previewUrl: string; // objectURL, revoke on unmount
  bytes: number;
  width: number;
  height: number;
  sourceFileName?: string | null;
}

/** Server-side snapshot of a job page (returned by GET /jobs/:id). */
export interface JobPageSnapshot {
  pageIndex: number;
  status: ExtractionPageStatus;
  attemptCount: number;
  extractedText: string | null;
  confidence: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  imageUrl: string | null; // signed download URL (may be null if expired)
  sourceFileName?: string | null;
}

export interface JobSnapshot {
  id: string;
  academyId: string;
  createdById: string;
  sourceType: ExtractionSourceType;
  originalFileName: string | null;
  status: ExtractionJobStatus;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  creditsConsumed: number;
  creditsRefunded: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pages: JobPageSnapshot[];
  /** Extraction mode (M1~M4). Optional for backward compatibility with legacy jobs. */
  mode?: ExtractionMode;
  /** SourceMaterial id once finalized. Null until extraction-finalize runs. */
  sourceMaterialId?: string | null;
}

/** Single extracted passage in the review UI. */
export interface ResultDraft {
  id: string;
  passageOrder: number;
  sourcePageIndex: number[];
  title: string;
  content: string;
  confidence: number | null;
  status: ExtractionResultStatus;
  meta: {
    markerDetected?: boolean;
    mergedFromPages?: number[];
    confidenceNote?: string;
  } | null;
}

/** Server-side snapshot of one ExtractionItem row (review UI feed). */
export interface ExtractionItemSnapshot {
  id: string;
  jobId: string;
  pageId: string | null;
  sourcePageIndex: number[];
  blockType: BlockType;
  groupId: string | null;
  parentItemId: string | null;
  order: number;
  localOrder: number | null;
  title: string | null;
  content: string;
  rawText: string | null;
  questionMeta: Record<string, unknown> | null;
  choiceMeta: Record<string, unknown> | null;
  passageMeta: Record<string, unknown> | null;
  examMeta: Record<string, unknown> | null;
  boundingBox: {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
  confidence: number | null;
  needsReview: boolean;
  status: ExtractionItemStatus;
  /** URN — "Passage:xxx" / "Question:xxx" etc. Null until promoted. */
  promotedTo: string | null;
}

export type { M1RestorationStatus } from "./m1-restoration";

export type M1PassageReviewStatus = "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";

export interface M1PassageDraftChangeSnapshot {
  id: string;
  passageDraftId: string;
  sentenceOrder: number | null;
  before: string;
  after: string;
  changeType: string | null;
  reason: string | null;
  confidence: number | null;
  sourcePageIndex: number[];
  createdAt: string | Date;
}

export interface M1PassageSourceMatchSnapshot {
  id: string;
  passageDraftId: string;
  sourceType: string;
  sourceId: string | null;
  sourceRef: string | null;
  title: string | null;
  publisher: string | null;
  unit: string | null;
  year: number | null;
  confidence: number | null;
  method: string;
  reason: string | null;
  selected: boolean;
  metadata: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface M1PassageDraftSnapshot {
  id: string;
  jobId: string;
  sourceMaterialId: string | null;
  passageOrder: number;
  sourcePageIndex: number[];
  title: string | null;
  rawText: string;
  restoredText: string;
  teacherText: string;
  restorationStatus: M1RestorationStatus;
  reviewStatus: M1PassageReviewStatus | string;
  confidence: number | null;
  warnings: unknown;
  metadata: unknown;
  confirmedAt: string | Date | null;
  savedPassageId: string | null;
  analysisStatus?: "not_analyzed" | "analyzed";
  savedPassageAnalysisId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  changes: M1PassageDraftChangeSnapshot[];
  sourceMatches: M1PassageSourceMatchSnapshot[];
}

/** Server-side snapshot of a SourceMaterial row. */
export interface SourceMaterialSnapshot {
  id: string;
  academyId: string;
  schoolId: string | null;
  type: string;
  title: string;
  subtitle: string | null;
  subject: string | null;
  grade: number | null;
  semester: string | null;
  year: number | null;
  round: string | null;
  examType: string | null;
  publisher: string | null;
  contentHash: string | null;
}

/** Event payload over SSE stream. */
export type StreamEvent =
  | { type: "snapshot"; job: JobSnapshot }
  | {
      type: "page-update";
      pageIndex: number;
      status: ExtractionPageStatus;
      attemptCount: number;
      extractedText: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      latencyMs: number | null;
    }
  | {
      type: "job-update";
      status: ExtractionJobStatus;
      successPages: number;
      failedPages: number;
      pendingPages: number;
      creditsConsumed: number;
    }
  | { type: "done"; status: ExtractionJobStatus }
  | { type: "error"; message: string };

// ============================================================================
// Adaptive Intake (D1~D4) — 사전분석 / 적응형 라우팅 / 크롭 / 묶음 공유 타입.
// 모두 plain union/interface (Prisma import 없음) — 서버·클라 공용.
// EXTRACTION_ADAPTIVE_INTAKE 플래그가 켜졌을 때만 사용된다.
// ============================================================================

/** 입력 분류 — 라우팅·과금·감사 기준. */
export type IntakeInputType = "IMAGE_SINGLE" | "IMAGES" | "PDF" | "TEXT";

/** 트리아지가 추정하는 페이지 레이아웃. */
export type TriageLayout = "single" | "exam2col" | "longform" | "mixed";

/** 적응형 작업대(Surface) — 입력유형/플랜에 따라 UI가 변형. */
export type IntakeSurface =
  | "A_CROP" // 이미지 1장 크롭-우선 미니멀
  | "B_BOARD" // 시험지 다지문 보드
  | "C_BATCH" // 대용량 PDF 배치 대시보드
  | "D_TEXT" // 텍스트 에디터
  | "FALLBACK"; // 저신뢰/실패 — 페이지:세그먼트 1:1

/** 인테이크 셸 상태머신 (본 추출 前). 페이지 코어 상태와 분리. */
export type IntakeState =
  | "empty"
  | "ingesting" // PDF 분할 / 이미지 로드
  | "reordering" // C10 섞인 업로드 재정렬(경량)
  | "scanning" // D3 트리아지 사전분석 중
  | "triage-review" // 플랜 검토/수정 (Surface morph)
  | "cropping" // 크롭 오버레이 서브상태
  | "plan-locked"; // 확정 → startUpload 인계

/** 세그먼트 생성 출처. ExtractionItem.segmentKind 컬럼과 일치. */
export type SegmentKind = "page" | "span" | "crop" | "text-block" | "manual";

/** 저장 텍스트가 원문인지 AI복원본인지 (D2). Passage.extractionOutput와 일치. */
export type ExtractionOutputMode = "verbatim" | "restored";

/** 불완전 사유 (G4) — 조용한 폐기 대체. ExtractionItem.incompleteReason와 일치. */
export type IncompleteReason =
  | "LENGTH"
  | "CROP_SIGNAL"
  | "LOW_OCR"
  | "SKEW"
  | "NON_TERMINAL";

/** 정규화 크롭 박스 — 0~1 좌표 (EXIF 보정 후). cropBox JSON 컬럼 형식. */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 페이지 경계 후보 — 이 페이지 뒤가 다음 페이지로 이어지는가 (C4/C5). */
export interface BoundaryCandidate {
  /** 0-based pageIndex; 이 페이지 "다음"에 경계가 있는지 판정 */
  afterPage: number;
  /** 페이지 끝이 종결부호 없이 끝남 → 다음 페이지로 이어질 가능성 */
  nonTerminal: boolean;
  confidence: number;
}

/** 잘림/기울어짐 신호 (C2). */
export interface CropSignal {
  page: number;
  truncated: boolean;
  skew: boolean;
}

/** 재정렬 제안 (C10) — fromIndex 슬롯이 toIndex 위치로. */
export interface ReorderSuggestion {
  fromIndex: number;
  toIndex: number;
  reason: string;
}

/** 계획된 지문/영역 후보 1개 (확정 전). slot id 기반 안정 참조. */
export interface IntakeSegment {
  /** 클라 임시 id (slot id 기반 안정 참조) */
  id: string;
  kind: SegmentKind;
  /** 이 세그먼트가 포함하는 0-based 페이지(들). 묶음이면 다수. */
  pageIndexes: number[];
  /** crop 세그먼트의 정규화 영역 (kind==="crop"일 때) */
  cropBox?: CropBox | null;
  /** 묶음 여부 — 다중페이지 한 지문 (D4) */
  isBundle: boolean;
  /** 사용자가 손대 확정했는지 (고스트→실선) */
  userConfirmed: boolean;
  confidence: number | null;
  /** 불완전 의심 사유 */
  incompleteReason?: IncompleteReason | null;
  /** 라벨(예: "지문 2") */
  label?: string | null;
}

/** 트리아지(D3) 결과 → 사용자가 검토/수정하는 인테이크 플랜. */
export interface IntakePlan {
  inputType: IntakeInputType;
  surface: IntakeSurface;
  layout: TriageLayout;
  /** 추정 지문 수 (사용자 override 가능) */
  passageCount: number;
  boundaries: BoundaryCandidate[];
  cropSignals: CropSignal[];
  reorder: ReorderSuggestion[];
  /** 확정 세그먼트 목록 — 본 추출의 작업 단위 */
  segments: IntakeSegment[];
  /** 백엔드 mode 추정 (하드코딩 대체, 사용자 1회 확인) */
  modeGuess: ExtractionMode;
  /** 추출 산출 기본값 (D2: 기본 verbatim) */
  outputMode: ExtractionOutputMode;
  /** 트리아지 종합 신뢰도 0~1 */
  confidence: number;
  /** 트리아지를 건너뛴 빠른 경로(C1)인지 */
  triageSkipped: boolean;
}

/** 트리아지 Trigger 태스크가 반환하는 원시 분석 결과 (zod: triageResultSchema). */
export interface TriageResult {
  passageCount: number;
  layout: TriageLayout;
  boundaries: BoundaryCandidate[];
  cropSignals: CropSignal[];
  reorder: ReorderSuggestion[];
  modeGuess: ExtractionMode;
  confidence: number;
}
