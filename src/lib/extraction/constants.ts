// ============================================================================
// Bulk passage extraction — project-wide constants.
// Adjust these in a single place; all layers (client UI, API, workers, DB)
// read from here to stay consistent.
// ============================================================================

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
 *  Gemini 3 Flash Tier 1: 60 RPM ≈ 5 concurrent × ~5s = 60 calls/min. */
export const GEMINI_CONCURRENCY_LIMIT = 5;

/** Per-academy concurrent orchestrator jobs (rate limit). */
export const ORCHESTRATOR_CONCURRENCY_LIMIT = 3;

/** Lease duration for a worker claiming a page (prevents stuck workers). */
export const PAGE_LEASE_DURATION_MS = 5 * 60 * 1000; // 5min

/** Retries for transient Gemini errors. */
export const MAX_PAGE_ATTEMPTS = 3;

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

import type { ExtractionMode } from "./modes";

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
