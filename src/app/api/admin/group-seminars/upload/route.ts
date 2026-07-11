// ============================================================================
// 단체 세미나 커버 이미지 업로드 — 관리자가 세미나 홍보 이미지를 공개 버킷에 올린다.
// FormData(file) → 서버에서 Supabase 공개 버킷 저장 → 공개 URL 반환. SUPER_ADMIN 전용.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { uploadSeminarCover } from "@/lib/group-seminars/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: "지원하지 않는 이미지 형식입니다 (JPG/PNG/WebP/GIF)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "이미지는 5MB 이하만 가능합니다" }, { status: 400 });
  }

  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${stamp}-${rand}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadSeminarCover(path, buffer, file.type);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드에 실패했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
