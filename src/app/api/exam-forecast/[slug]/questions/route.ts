import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { canAccessForecastPack, getForecastPack, getForecastQuestionsByIds } from "@/lib/exam-forecast/queries";

// 문항 본문 지연 조회 — 은행 미리보기용. ?ids=a,b,c (최대 60)
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  if (staff.role !== "DIRECTOR") return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { slug } = await params;
  const pack = await getForecastPack(slug);
  if (!pack || !canAccessForecastPack(pack, staff)) return NextResponse.json({ error: "없는 자료" }, { status: 404 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60);
  const questions = await getForecastQuestionsByIds(pack.id, ids);
  return NextResponse.json({ questions }, { headers: { "Cache-Control": "private, max-age=300" } });
}
