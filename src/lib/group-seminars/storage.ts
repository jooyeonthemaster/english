// ============================================================================
// 단체 세미나 커버 이미지 저장 — 공개 Supabase Storage 버킷.
// 세미나 홍보 카드에 모든 로그인 사용자에게 노출되므로 비만료 공개 URL이 필요하다.
// 배너(site-banners)와 같은 방식이되 전용 버킷으로 분리한다.
// 서버 전용(service-role key). 클라이언트 컴포넌트에서 import 금지.
// ============================================================================

import { getServiceSupabase } from "@/lib/supabase-storage";

export const SEMINAR_COVER_BUCKET = "seminar-covers";

/** 없으면 공개 버킷 생성. 멱등 — 업로드 시 호출해도 안전. */
export async function ensureSeminarCoverBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.storage.getBucket(SEMINAR_COVER_BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(SEMINAR_COVER_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
}

/** 이미지 버퍼 업로드 후 공개 URL 반환. */
export async function uploadSeminarCover(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await ensureSeminarCoverBucket();
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage
    .from(SEMINAR_COVER_BUCKET)
    .upload(path, body as ArrayBuffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`seminar cover upload failed: ${error.message}`);
  }
  const { data } = supabase.storage.from(SEMINAR_COVER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
