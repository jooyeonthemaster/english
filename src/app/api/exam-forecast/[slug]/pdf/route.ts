import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase-storage";
import { canAccessForecastPack, getForecastPack } from "@/lib/exam-forecast/queries";

// 사전 생성 PDF 내려받기 — 비공개 버킷 exam-forecast/<slug>/<file>.pdf → 60초 서명 URL 로 302.
// 파일명 규칙(scripts/exam-forecast/build-pdfs.tsx): set-01-paper · set-01-answers · workbook-all · workbook-answers · reference
export const dynamic = "force-dynamic";

const BUCKET = "exam-forecast";
const FILE_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  if (staff.role !== "DIRECTOR") return NextResponse.json({ error: "원장 계정만 받을 수 있습니다." }, { status: 403 });
  const { slug } = await params;
  const file = req.nextUrl.searchParams.get("file") ?? "";
  const saveAs = req.nextUrl.searchParams.get("name") ?? `${file}.pdf`;
  if (!FILE_RE.test(file)) return NextResponse.json({ error: "잘못된 파일" }, { status: 400 });
  const pack = await getForecastPack(slug);
  if (!pack || !canAccessForecastPack(pack, staff)) return NextResponse.json({ error: "없는 자료" }, { status: 404 });
  try {
    const sb = getServiceSupabase();
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(`${slug}/${file}.pdf`, 60, { download: saveAs });
    if (error || !data?.signedUrl) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.redirect(data.signedUrl, 302);
  } catch {
    return NextResponse.json({ error: "저장소 연결 실패" }, { status: 500 });
  }
}
