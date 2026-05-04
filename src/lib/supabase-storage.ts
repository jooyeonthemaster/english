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

/** Signed download URL — used by the review UI to display the page image. */
export async function createSignedDownloadUrl(
  path: string,
  expiresInSeconds = 60 * 30,
): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`createSignedUrl failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
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
  await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([originalPdfKey(academyId, jobId)]);
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
