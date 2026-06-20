import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { queryExamPassages } from "@/lib/exam-passages/corpus";
import type { ExamPassageQuery } from "@/lib/exam-passages/types";
import { EXAM_MAX_IDS } from "@/lib/exam-passages/types";

// GET /api/exam-passages — 수능·모평 영어 기출 지문 코퍼스 질의(검색/필터/페이지네이션).
// 인증 필요(라이선스 콘텐츠). 본문 텍스트를 포함해 반환하므로 staff 세션 게이트.
//
// 쿼리: q, years, exams, boards, types(=typeGroup), recon, page, pageSize, ids
// (복수값은 콤마 구분). ids 를 주면 그 레코드만 반환(선택분 일괄 조회, 필터 무시).

function csv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function csvInts(value: string | null): number[] | undefined {
  const parts = csv(value);
  if (!parts) return undefined;
  const nums = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const query: ExamPassageQuery = {
      q: sp.get("q") ?? undefined,
      years: csvInts(sp.get("years")),
      exams: csv(sp.get("exams")),
      boards: csv(sp.get("boards")),
      typeGroups: csv(sp.get("types")),
      reconKinds: csv(sp.get("recon")),
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
      ids: csv(sp.get("ids"))?.slice(0, EXAM_MAX_IDS),
    };

    const result = queryExamPassages(query);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[exam-passages] query failed", err);
    return NextResponse.json(
      { error: "기출 지문을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
