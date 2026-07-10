// ============================================================================
// 오프라인 홍보물 PDF 저장 — 공개 Supabase Storage 버킷.
//
// 전단지/세미나 자료/학습지 샘플 등 홍보용 PDF를 보관한다. 관리자만 업로드하지만
// 파일 자체는 비만료 공개 URL로 다뤄야 미리보기·인쇄가 단순해지므로 공개 버킷을 쓴다.
// 다만 다운로드/인쇄는 별도 same-origin 프록시 라우트를 통해 제공한다(iframe 인쇄용).
//
// 전단지 PDF 등 일부 파일은 4.5MB(Vercel serverless 요청 본문 상한)를 넘으므로,
// 업로드는 서명 URL을 발급해 브라우저가 Supabase로 직접 PUT 하도록 한다.
// 서버 전용(service-role key). 클라이언트에서 import 금지.
// ============================================================================

import { getServiceSupabase } from "@/lib/supabase-storage";

export const OFFLINE_MARKETING_BUCKET = "offline-marketing";

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

/** 없으면 공개 버킷 생성. 멱등 — 업로드/서명 발급 시 호출해도 안전. */
export async function ensureOfflineMarketingBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.storage.getBucket(OFFLINE_MARKETING_BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(OFFLINE_MARKETING_BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
}

/**
 * 브라우저가 직접 PDF를 올릴 수 있도록 1회용 서명 업로드 URL을 발급한다.
 * (파일이 커도 Next.js serverless 본문 상한을 우회한다.)
 */
export async function createOfflineMarketingUploadTarget(
  path: string,
): Promise<{ uploadUrl: string; token: string; storagePath: string }> {
  await ensureOfflineMarketingBucket();
  const supabase = getServiceSupabase();

  // 같은 경로가 이미 있으면 서명 발급이 실패하므로 먼저 제거(멱등).
  try {
    await supabase.storage.from(OFFLINE_MARKETING_BUCKET).remove([path]);
  } catch {
    /* best effort */
  }

  const { data, error } = await supabase.storage
    .from(OFFLINE_MARKETING_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`서명 업로드 URL 발급 실패: ${error?.message ?? "unknown"}`);
  }
  return { uploadUrl: data.signedUrl, token: data.token, storagePath: data.path };
}

/** PDF 버퍼를 직접 업로드하고 저장 경로를 반환(서버 seed/소형 파일용). */
export async function uploadOfflineMarketingPdf(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
): Promise<{ storagePath: string; publicUrl: string }> {
  await ensureOfflineMarketingBucket();
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage
    .from(OFFLINE_MARKETING_BUCKET)
    .upload(path, body as ArrayBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    throw new Error(`홍보물 업로드 실패: ${error.message}`);
  }
  return { storagePath: path, publicUrl: offlineMarketingPublicUrl(path) };
}

/** 저장 경로의 공개 URL. */
export function offlineMarketingPublicUrl(storagePath: string): string {
  const supabase = getServiceSupabase();
  const { data } = supabase.storage
    .from(OFFLINE_MARKETING_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/** 서버에서 PDF 바이트를 내려받는다(same-origin 프록시 라우트에서 스트리밍용). */
export async function downloadOfflineMarketingPdf(storagePath: string): Promise<Buffer> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(OFFLINE_MARKETING_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`홍보물 다운로드 실패(${storagePath}): ${error?.message ?? "unknown"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** 저장된 PDF 삭제(레코드 삭제 시). best effort. */
export async function deleteOfflineMarketingPdf(storagePath: string): Promise<void> {
  if (!storagePath) return;
  try {
    const supabase = getServiceSupabase();
    await supabase.storage.from(OFFLINE_MARKETING_BUCKET).remove([storagePath]);
  } catch (err) {
    console.warn(`[offline-marketing] delete failed ${storagePath}:`, err);
  }
}
