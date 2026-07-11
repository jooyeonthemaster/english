import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import {
  queryKoPassages,
  getKoProblemDetail,
} from "@/lib/korean-exam-passages/corpus";
import type { KoQuery } from "@/lib/korean-exam-passages/types";
import { KO_MAX_IDS } from "@/lib/korean-exam-passages/types";

// GET /api/korean/exam-passages — 국어 기출 지문 코퍼스 질의(검색/필터/페이지네이션).
// 인증 필요(라이선스 콘텐츠). 본문·분석을 포함해 반환하므로 staff 세션 게이트.
//  - ids 를 주면 그 레코드만(필터 무시).
//  - detail=<id> 를 주면 그 지문의 원문 문제(발문·선지·정답)를 반환.
//  쿼리(복수값 콤마): q, boards, grades, years, sihengs, galaes, subGenres,
//                    difficulties, keywords, page, pageSize, ids.
//  subGenresJson은 쉼표가 포함된 세부영역명을 손실 없이 전달하는 JSON 배열이다.

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

function jsonStrings(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const values = parsed.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    return values.length > 0 ? values : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;

    const detailId = sp.get("detail");
    if (detailId) {
      const detail = getKoProblemDetail(detailId);
      if (!detail) {
        return NextResponse.json({ error: "문제를 찾지 못했습니다." }, { status: 404 });
      }
      return NextResponse.json({ id: detailId, ...detail });
    }

    const query: KoQuery = {
      q: sp.get("q") ?? undefined,
      boards: csv(sp.get("boards")),
      grades: csv(sp.get("grades")),
      years: csvInts(sp.get("years")),
      sihengs: csv(sp.get("sihengs")),
      galaes: csv(sp.get("galaes")),
      subGenres:
        jsonStrings(sp.get("subGenresJson")) ?? csv(sp.get("subGenres")),
      difficulties: csv(sp.get("difficulties")),
      keywords: csv(sp.get("keywords")),
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
      ids: csv(sp.get("ids"))?.slice(0, KO_MAX_IDS),
    };

    const result = queryKoPassages(query);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[korean-exam-passages] query failed", err);
    return NextResponse.json(
      { error: "국어 기출 지문을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
