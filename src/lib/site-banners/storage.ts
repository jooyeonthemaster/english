// ============================================================================
// Site-banner image storage — a PUBLIC Supabase Storage bucket.
//
// Banner images are shown to every logged-in user, so unlike the private
// extraction bucket these need stable, non-expiring URLs. We use a dedicated
// public bucket and hand back its public URL.
//
// Server-only (service-role key). Never import from a client component.
// ============================================================================

import { getServiceSupabase } from "@/lib/supabase-storage";

export const SITE_BANNER_BUCKET = "site-banners";

/** Create the public banner bucket if missing. Idempotent; safe to call on upload. */
export async function ensureSiteBannerBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.storage.getBucket(SITE_BANNER_BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(SITE_BANNER_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
}

/** Upload an image buffer and return its public URL. */
export async function uploadBannerImage(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await ensureSiteBannerBucket();
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage
    .from(SITE_BANNER_BUCKET)
    .upload(path, body as ArrayBuffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`banner image upload failed: ${error.message}`);
  }
  const { data } = supabase.storage.from(SITE_BANNER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
