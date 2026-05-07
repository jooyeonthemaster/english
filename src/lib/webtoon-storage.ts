import { getServiceSupabase } from "@/lib/supabase-storage";

export const WEBTOON_BUCKET = "webtoon-images";

const WEBTOON_BUCKET_FILE_SIZE_LIMIT = 50_000_000;
const WEBTOON_BUCKET_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

let bucketEnsured = false;

export async function ensureWebtoonBucket(): Promise<void> {
  if (bucketEnsured) return;
  const supabase = getServiceSupabase();

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    throw new Error(`Failed to list Supabase buckets: ${listErr.message}`);
  }

  const exists = buckets?.some((bucket) => bucket.name === WEBTOON_BUCKET);
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(WEBTOON_BUCKET, {
      public: true,
      fileSizeLimit: WEBTOON_BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: WEBTOON_BUCKET_ALLOWED_MIME_TYPES,
    });
    if (createErr && !/already|exists/i.test(createErr.message)) {
      throw new Error(`Failed to create bucket ${WEBTOON_BUCKET}: ${createErr.message}`);
    }
  } else {
    const { error: updateErr } = await supabase.storage.updateBucket(WEBTOON_BUCKET, {
      public: true,
      fileSizeLimit: WEBTOON_BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: WEBTOON_BUCKET_ALLOWED_MIME_TYPES,
    });
    if (updateErr) {
      throw new Error(`Failed to update bucket ${WEBTOON_BUCKET}: ${updateErr.message}`);
    }
  }

  bucketEnsured = true;
}

export function webtoonStoragePath(
  academyId: string,
  webtoonId: string,
  contentType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): string {
  const extension =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${academyId}/${webtoonId}.${extension}`;
}

export async function uploadRemoteImageToWebtoonBucket(opts: {
  remoteUrl: string;
  academyId: string;
  webtoonId: string;
}): Promise<{ publicUrl: string; storagePath: string; contentType: string; bytes: number }> {
  await ensureWebtoonBucket();

  const upstream = await fetch(opts.remoteUrl, {
    headers: { Referer: "https://api.atlascloud.ai/" },
    cache: "no-store",
  });
  if (!upstream.ok) {
    throw new Error(`Failed to download image from ${opts.remoteUrl}: ${upstream.status}`);
  }

  const rawContentType = upstream.headers.get("Content-Type") ?? "image/jpeg";
  const contentType = normalizeImageContentType(rawContentType);
  if (!contentType) {
    throw new Error(`Remote URL did not return an image (got ${rawContentType})`);
  }

  const arrayBuffer = await upstream.arrayBuffer();
  const bytes = arrayBuffer.byteLength;
  const supabase = getServiceSupabase();
  const path = webtoonStoragePath(opts.academyId, opts.webtoonId, contentType);

  const { error: uploadErr } = await supabase.storage
    .from(WEBTOON_BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType,
      upsert: true,
      cacheControl: "public, max-age=31536000, immutable",
    });
  if (uploadErr) {
    throw new Error(`Supabase upload failed: ${uploadErr.message}`);
  }

  const { data: pub } = supabase.storage.from(WEBTOON_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    throw new Error("Failed to compute Supabase public URL for webtoon");
  }

  return {
    publicUrl: pub.publicUrl,
    storagePath: path,
    contentType,
    bytes,
  };
}

export async function deleteWebtoonImage(storagePath: string): Promise<void> {
  if (!storagePath) return;
  try {
    const supabase = getServiceSupabase();
    await supabase.storage.from(WEBTOON_BUCKET).remove([storagePath]);
  } catch (err) {
    console.warn(`[webtoon-storage] failed to delete ${storagePath}:`, err);
  }
}

function normalizeImageContentType(value: string): "image/jpeg" | "image/png" | "image/webp" | null {
  const contentType = value.split(";")[0]?.trim().toLowerCase();
  if (contentType === "image/jpg") return "image/jpeg";
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  ) {
    return contentType;
  }
  return contentType?.startsWith("image/") ? "image/jpeg" : null;
}
