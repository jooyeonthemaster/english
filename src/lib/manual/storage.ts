// ============================================================================
// 사용 매뉴얼 PDF 저장 — 공개 Supabase Storage 버킷.
// 원장 헬프센터의 "사용 매뉴얼" 뷰어에 로그인 사용자 모두에게 노출되므로
// 비만료 공개 URL이 필요하다. 세미나 커버(storage.ts)와 같은 방식이되
// PDF 전용 버킷으로 분리한다. 서버 전용(service-role key).
// ============================================================================

import { getServiceSupabase } from "@/lib/supabase-storage";

export const MANUAL_BUCKET = "manuals";

/** 없으면 공개 버킷 생성. 멱등 — 업로드 시 호출해도 안전. */
export async function ensureManualBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.storage.getBucket(MANUAL_BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(MANUAL_BUCKET, {
    public: true,
    fileSizeLimit: 30 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
}

/** PDF 버퍼 업로드 후 공개 URL 반환. */
export async function uploadManual(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
): Promise<string> {
  await ensureManualBucket();
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage
    .from(MANUAL_BUCKET)
    .upload(path, body as ArrayBuffer, { contentType: "application/pdf", upsert: true });
  if (error) {
    throw new Error(`manual upload failed: ${error.message}`);
  }
  const { data } = supabase.storage.from(MANUAL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
