// ============================================================================
// Supabase Storage helper.
//
// Usage split:
//   - Server-side (Next.js API routes, Trigger.dev workers): uses the
//     SERVICE ROLE key. Never import this module from a client component.
//   - Client uploads: DO NOT import this module from the client. Instead,
//     the API hands the client a signed upload URL generated here.
//
// The bucket (`extraction-sources`) must be created once in the Supabase
// dashboard or via `ensureExtractionBucket()` below. The bucket is PRIVATE;
// all downloads go through signed URLs or through the server.
// ============================================================================

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  STORAGE_BUCKET,
  UPLOAD_URL_EXPIRY_SECONDS,
} from "./extraction/constants";

/** Internal singleton. Re-used across serverless invocations (Node warm start). */
let cached: SupabaseClient | null = null;

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Returns a Supabase client authorised with the service-role key.
 *  THROWS if the env vars are missing — call sites should catch this and
 *  return a clear 500 + developer-facing message. */
export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// ─── Path helpers ────────────────────────────────────────────────────────────
// Layout: extraction-sources/{academyId}/{jobId}/...
//
// 같은 버킷에 **row 없는** 계열이 하나 더 산다:
//   extraction-sources/{academyId}/passage-authoring/{uuid}/0000.jpg
// (AI 지문 생성 하이브리드가 서명 URL 로 직접 올린 원본 페이지. 발급처는
//  api/workbench/passage-authoring/page-uploads.) jobId 가 없으니 아래 *Key 헬퍼로
//  경로를 만들 수 없고, 청소는 나이 기준 훑기로만 가능하다 — 이 파일 아래쪽의
//  listStorageEntries / removeStorageObjects 와 extraction-daily-cleanup 참고.

export function originalPdfKey(academyId: string, jobId: string): string {
  return `${academyId}/${jobId}/original.pdf`;
}

export function pageImageKey(
  academyId: string,
  jobId: string,
  pageIndex: number,
  ext: string = "jpg",
): string {
  const padded = pageIndex.toString().padStart(4, "0");
  return `${academyId}/${jobId}/pages/${padded}.${ext}`;
}

export function previewImageKey(
  academyId: string,
  jobId: string,
  ext: string = "jpg",
): string {
  return `${academyId}/${jobId}/preview/original-first.${ext}`;
}

export function similarExamPageImageKey(
  academyId: string,
  jobId: string,
  pageIndex: number,
  ext: string = "jpg",
): string {
  const padded = pageIndex.toString().padStart(4, "0");
  return `${academyId}/similar-exams/${jobId}/pages/${padded}.${ext}`;
}

export function jobPrefix(academyId: string, jobId: string): string {
  return `${academyId}/${jobId}`;
}

// ─── Upload URL issuance ─────────────────────────────────────────────────────

export interface UploadTarget {
  uploadUrl: string;
  uploadPath: string;
  token?: string;
  expiresAt: string;
}

/** Create a short-lived signed upload URL the client PUTs into directly.
 *  This keeps large images out of the Next.js serverless function. */
export async function createUploadTarget(path: string): Promise<UploadTarget> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`createSignedUploadUrl failed: ${error?.message ?? "unknown"}`);
  }

  const expiresAt = new Date(
    Date.now() + UPLOAD_URL_EXPIRY_SECONDS * 1000,
  ).toISOString();

  return {
    uploadUrl: data.signedUrl,
    uploadPath: data.path,
    token: data.token,
    expiresAt,
  };
}

// ─── Download (server-only) ──────────────────────────────────────────────────

export async function downloadAsBuffer(path: string): Promise<Buffer> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(`download failed (${path}): ${error?.message ?? "unknown"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

interface SignedDownloadOptions {
  /**
   * Supabase image transform — server-side resize for previews/thumbnails.
   * Requires the project's Storage Image Transformations to be enabled.
   * `width` is the long edge; `resize: "contain"` preserves aspect ratio.
   * `quality` is JPEG quality (20-100, default 80).
   */
  transform?: {
    width?: number;
    height?: number;
    resize?: "cover" | "contain" | "fill";
    quality?: number;
  };
}

/** Signed download URL — used by the review UI to display the page image. */
export async function createSignedDownloadUrl(
  path: string,
  expiresInSeconds = 60 * 30,
  options?: SignedDownloadOptions,
): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds, options);
  if (error || !data) {
    throw new Error(`createSignedUrl failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/** 객체 존재 여부 — 서명 URL은 미존재 경로도 발급되므로(다운로드 시 404)
 *  "원본 파일" 버튼처럼 존재가 보장돼야 하는 곳에서 먼저 확인한다. */
export async function storageObjectExists(path: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const idx = path.lastIndexOf("/");
  const dir = idx > 0 ? path.slice(0, idx) : "";
  const name = path.slice(idx + 1);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(dir, { limit: 10, search: name });
  if (error || !data) return false;
  return data.some((f) => f.name === name);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/** Remove every object under a job's prefix. Used by daily-cleanup and
 *  DELETE /jobs/:id. */
export async function removeJobAssets(
  academyId: string,
  jobId: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const prefix = jobPrefix(academyId, jobId);

  // Supabase has no prefix-delete; we list and then remove.
  async function listAndRemove(subPath: string) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(subPath, { limit: 200 });
    if (error) return;
    if (!data || data.length === 0) return;
    const paths = data
      .filter((f) => f.name)
      .map((f) => `${subPath}/${f.name}`);
    if (paths.length === 0) return;
    await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  }

  await listAndRemove(`${prefix}/pages`);
  await listAndRemove(`${prefix}/thumbnails`);
  await listAndRemove(`${prefix}/preview`);
  await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([originalPdfKey(academyId, jobId)]);
}

// ─── Prefix traversal (row 없는 자산의 나이 기준 청소용) ──────────────────────
//
// removeJobAssets 는 **ExtractionJob row 가 있는** 자산 전용이다(경로를 jobId 로
// 계산할 수 있으니까). 그런데 AI 지문 생성 하이브리드가 올리는
// `{academyId}/passage-authoring/{uuid}/0000.jpg` 는 **어떤 DB row 와도 연결돼
// 있지 않다** — 클라이언트가 서명 URL 로 직접 PUT 하고, 경로 문자열은 생성 요청
// 본문에만 잠깐 실렸다가 사라진다. 그래서 "지울 대상을 DB에서 찾는" 방식이
// 원리적으로 불가능하고, 스토리지를 훑어 **나이**로 판정하는 수밖에 없다.
// 아래 두 함수가 그 훑기의 최소 재료다(정책·로깅은 호출자인 일일 청소가 갖는다).
//
// 관습(removeJobAssets 와 동일): **에러를 삼킨다.** 이 모듈은 API 라우트와
// Trigger.dev 워커가 함께 쓰므로 trigger logger 를 들 수 없다 — 실패는 "빈 목록 /
// 삭제 0건"이라는 값으로만 알리고, 로그는 호출자가 남긴다.

/** passage-authoring 업로드 프리픽스의 고정 세그먼트.
 *
 *  **발급처와 청소처가 반드시 같은 값을 봐야 한다.** 발급은
 *  api/workbench/passage-authoring/page-uploads(경로를 서버가 정한다),
 *  청소는 trigger/extraction-daily-cleanup §4 다. 한쪽만 이름을 바꾸면 업로드는
 *  계속 성공하는데 청소가 조용히 대상 0건이 되어 버킷이 영원히 자란다 — 아무도
 *  신고하지 못하는 종류의 고장이다.
 *
 *  그래서 두 곳 다 이 상수를 **import 한다**(리터럴을 손코딩하지 않는다).
 *  page-uploads 라우트가 이 상수를 계속 쓰는지는
 *  tests/unit/passage-authoring-page-uploads.test.mjs ③ 이 잠근다. */
export const PASSAGE_AUTHORING_PATH_SEGMENT = "passage-authoring";

export interface StorageEntry {
  /** 마지막 세그먼트 이름. 전체 경로가 아니다(호출자가 프리픽스와 합친다). */
  name: string;
  /** 가상 폴더(=하위 프리픽스)인가. Supabase 는 폴더 행의 id 를 null 로 준다. */
  isFolder: boolean;
  /** 오브젝트 생성 시각. 폴더 행·파싱 불가는 null(= 나이를 모른다). */
  createdAt: Date | null;
}

/** list() 한 번이 가져오는 항목 수. Supabase 기본값과 같다. */
const LIST_PAGE_SIZE = 100;

/** remove() 한 번에 넘기는 경로 수. 한 프리픽스는 보통 4개라 거의 1회로 끝난다. */
const REMOVE_CHUNK_SIZE = 100;

/**
 * 한 프리픽스 **바로 아래** 한 겹만 나열한다(재귀 아님 — Supabase list 가
 * delimiter 기반이라 애초에 한 겹씩만 준다). maxEntries 까지 페이지를 넘긴다.
 * 실패하면 그때까지 모은 것만 돌려준다 — 절반만 본 목록으로 지우는 것은
 * 안전하다(덜 지울 뿐, 남의 것을 지우지 않는다).
 */
export async function listStorageEntries(
  prefix: string,
  maxEntries = LIST_PAGE_SIZE,
): Promise<StorageEntry[]> {
  if (maxEntries <= 0) return [];
  const supabase = getServiceSupabase();
  const out: StorageEntry[] = [];

  for (let offset = 0; out.length < maxEntries; offset += LIST_PAGE_SIZE) {
    const pageSize = Math.min(LIST_PAGE_SIZE, maxEntries - out.length);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error || !data || data.length === 0) break;

    for (const entry of data) {
      if (!entry.name) continue;
      const parsed = entry.created_at ? new Date(entry.created_at) : null;
      out.push({
        name: entry.name,
        isFolder: entry.id === null,
        createdAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      });
    }
    if (data.length < pageSize) break;
  }

  return out;
}

/** 경로 목록을 일괄 삭제하고 **실제로 지워진 개수**를 돌려준다.
 *  청크 하나가 실패해도 나머지는 계속 시도한다(부분 청소가 무청소보다 낫다). */
export async function removeStorageObjects(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const supabase = getServiceSupabase();
  let removed = 0;

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK_SIZE);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(chunk);
    if (error || !data) continue;
    removed += data.length;
  }

  return removed;
}

// ─── One-time bucket bootstrap (idempotent) ──────────────────────────────────

/** Creates the extraction bucket if it doesn't exist. Safe to call on boot.
 *  The bucket is PRIVATE (public=false). File size limit is 50MB. */
export async function ensureExtractionBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.storage.getBucket(STORAGE_BUCKET);
  if (existing) return;

  await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
  });
}
