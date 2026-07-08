// ============================================================================
// 사용 매뉴얼 PDF 업로드 — 관리자가 원장 헬프센터에 노출할 매뉴얼을 공개 버킷에 올린다.
// FormData(file) → 서버에서 Supabase 공개 버킷 저장 → 공개 URL 반환. SUPER_ADMIN 전용.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { uploadManual } from "@/lib/manual/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 30 * 1024 * 1024;

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

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "PDF는 30MB 이하만 가능합니다" }, { status: 400 });
  }

  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `smoat-manual-${stamp}-${rand}.pdf`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadManual(path, buffer);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드에 실패했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
