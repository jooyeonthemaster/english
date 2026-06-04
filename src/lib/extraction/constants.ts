// ============================================================================
// Bulk passage extraction — project-wide constants.
// Adjust these in a single place; all layers (client UI, API, workers, DB)
// read from here to stay consistent.
// ============================================================================

import {
  EXTRACTION_ORCHESTRATOR_QUEUE_CONCURRENCY,
  EXTRACTION_PAGE_MAX_ATTEMPTS,
  EXTRACTION_PAGE_QUEUE_CONCURRENCY,
} from "@/lib/concurrency-config";
import type { ExtractionMode } from "./modes";
/** Hard upper bound per job. More pages in a single file break attention
 *  budgets on both the UI grid and Gemini verbatim fidelity. */
export const MAX_PAGES_PER_JOB = 30;

/** Maximum raw PDF size (bytes). PDFs over this should be split by the user. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB

/** Max uploaded image size per page — applies both to user-uploaded images
 *  and to client-side pdfjs renders. */
export const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/** Max single source image upload (before PDF split). */
export const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/** Mime types the UI/API accept. */
export const ACCEPTED_PDF_MIMES = ["application/pdf"] as const;
export const ACCEPTED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Gemini concurrency ceiling (global, shared across all jobs).
 *  Gemini Flash Tier 1: 60 RPM. 8 동시 × ~10s/page ≈ 48 calls/min — 안전 마진.
 *  8페이지 같은 작은 시험지는 두 wave (5+3) → 한 wave 로 줄어 시간 거의 절반. */
export const GEMINI_CONCURRENCY_LIMIT = EXTRACTION_PAGE_QUEUE_CONCURRENCY;

/** Per-academy concurrent orchestrator jobs (rate limit). */
export const ORCHESTRATOR_CONCURRENCY_LIMIT =
  EXTRACTION_ORCHESTRATOR_QUEUE_CONCURRENCY;

/** Lease duration for a worker claiming a page (prevents stuck workers). */
export const PAGE_LEASE_DURATION_MS = 5 * 60 * 1000; // 5min

/** Retries for transient Gemini errors. */
export const MAX_PAGE_ATTEMPTS = EXTRACTION_PAGE_MAX_ATTEMPTS;

/** PDF render scale for pdfjs-dist client-side. 2.0 ≈ ~200 DPI, Gemini-safe. */
export const PDF_RENDER_SCALE = 2.0;

/** JPEG quality when encoding pdfjs canvas → blob. */
export const PDF_RENDER_JPEG_QUALITY = 0.85;

/** Storage bucket name. Must match the bucket created in Supabase console. */
export const STORAGE_BUCKET = "extraction-sources";

/** TTLs (days) for stored assets. Daily cleanup task honours these. */
export const ORIGINAL_PDF_RETENTION_DAYS = 7;
export const PAGE_IMAGE_RETENTION_DAYS = 30;
export const EXTRACTED_TEXT_RETENTION_DAYS = 90;

/** Supabase signed upload URL expiry (seconds). Client has this long to PUT. */
export const UPLOAD_URL_EXPIRY_SECONDS = 60 * 10; // 10 min

/** SSE tick interval — how often the stream endpoint polls the DB. */
export const SSE_TICK_INTERVAL_MS = 2000;

/** SSE maximum session duration before forcing reconnect (Vercel safe). */
export const SSE_MAX_SESSION_MS = 4 * 60 * 1000; // 4 min (Vercel hobby cap)

/** Minimum content length (characters) for a commit-ready passage. Anything
 *  shorter is almost always an OCR artifact. */
export const MIN_COMMIT_PASSAGE_LENGTH = 40;

// ============================================================================
// Mode-specific constants (M1 ~ M4)
// ============================================================================

/** "신규" 배지가 추출 결과에 붙어 있는 기간 (주 단위). */
export const MODE_BADGE_DURATION_WEEKS = 4;

/** 모드별 저장 하한 길이. 문제 세트 모드는 단독 문제 블록이 짧을 수 있으므로 낮춤. */
export const MIN_COMMIT_PASSAGE_LENGTH_BY_MODE: Record<ExtractionMode, number> = {
  PASSAGE_ONLY: 40,
  QUESTION_SET: 20,
  EXPLANATION: 30,
  FULL_EXAM: 20,
};

/** 리뷰 UI 신뢰도 임계값 — 녹색/노란색/위험 배지.
 *  >= 0.9 안전 / 0.7~0.9 의심 / 0.5~0.7 위험 / < 0.5 치명. */
export const CONFIDENCE_GREEN = 0.9;
export const CONFIDENCE_YELLOW = 0.7;
export const CONFIDENCE_CRITICAL = 0.5;

// ============================================================================
// Adaptive Intake (D1~D4) — 사전분석·묶음·크롭 상수
// ============================================================================

/** 트리아지(사전분석)가 미리 훑는 최대 페이지 수. 대용량은 앞부분 샘플만. */
export const TRIAGE_SAMPLE_PAGES = 3;

/** 트리아지 1콜 타임아웃. 초과 시 저신뢰 폴백(페이지:세그먼트 1:1). */
export const TRIAGE_TIMEOUT_MS = 8000;

/** auto-advance(자동 다음단계) 신뢰도 임계. 이 이상이면 사용자 확인 생략 가능. */
export const TRIAGE_AUTO_ADVANCE_CONFIDENCE = CONFIDENCE_GREEN;

/** 트리아지 고스트(자동 추정 경계) 표시 하한. 이 미만이면 추정 미표시(자동화 편향 방어). */
export const TRIAGE_GHOST_MIN_CONFIDENCE = CONFIDENCE_YELLOW;

/** D4 한 묶음(bundle)이 한 번의 OCR 콜로 함께 보낼 수 있는 최대 페이지 수.
 *  Flash 다중이미지 verbatim 충실도 임계 — 벤치로 확정 예정(설계 §10.3). */
export const MAX_PAGES_PER_BUNDLE = 4;

/** 묶음 가상 pageIndex 예약 베이스(음수대). 실제 pageIndex(>=0)와 충돌 회피.
 *  bundle row 의 pageIndex = BUNDLE_VIRTUAL_PAGE_BASE - bundleOrdinal. */
export const BUNDLE_VIRTUAL_PAGE_BASE = -1000;

/** 크롭 박스 정규화 좌표계 — 항상 0~1 (해상도/렌더스케일 독립). */
export const CROP_COORD_NORMALIZED_MAX = 1;
