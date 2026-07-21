// ============================================================================
// 오프라인 홍보물 PDF same-origin 프록시.
//
// 파일은 공개 Supabase 버킷에 있지만(다른 오리진), 관리자 페이지에서 숨은 iframe으로
// 바로 인쇄(iframe.contentWindow.print())하려면 same-origin 이어야 한다. 그래서
// 이 라우트가 PDF 바이트를 우리 오리진으로 스트리밍한다. SUPER_ADMIN 전용.
//
// ?download=1 이면 첨부(다운로드), 기본은 inline(미리보기/인쇄).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { prisma } from "@/lib/prisma";
import { downloadOfflineMarketingPdf } from "@/lib/offline-marketing/storage";
import { offlineMarketingContentType } from "@/lib/offline-marketing/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const asset = await prisma.offlineMarketingAsset.findUnique({
    where: { id },
    select: { storagePath: true, fileName: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "홍보물을 찾을 수 없습니다" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadOfflineMarketingPdf(asset.storagePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일을 불러오지 못했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  // 파일명(한글 포함)을 RFC 5987 방식으로 안전하게 인코딩.
  const asciiName = asset.fileName.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(asset.fileName);
  const disposition = `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": offlineMarketingContentType(asset.fileName),
      "Content-Disposition": disposition,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
