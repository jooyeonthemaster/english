import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import {
  getSwDetail,
  getSwExamFull,
  querySwPassages,
} from "@/lib/suneung-wanseong/corpus";
import type { SwQuery, SwRelationType } from "@/lib/suneung-wanseong/types";

// GET /api/korean/suneung-wanseong — 2027 수능완성 독서 지문 + 심층 분석 + 기출 연계.
// 인증 필요(라이선스 콘텐츠).
//  - detail=<swId>  : 지문 + 원문 문항 + 연계 기출(스냅샷 조인)
//  - exam=<koId>    : 연계된 기출 지문 원문(모달용)
//  - 그 외          : 목록 질의(q, rounds, subGenres, difficulties, relationTypes, keywords)

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

    const examId = sp.get("exam");
    if (examId) {
      const passage = getSwExamFull(examId);
      if (!passage) {
        return NextResponse.json(
          { error: "기출 지문을 찾지 못했습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ passage });
    }

    const detailId = sp.get("detail");
    if (detailId) {
      const detail = getSwDetail(detailId);
      if (!detail) {
        return NextResponse.json(
          { error: "지문을 찾지 못했습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json(detail);
    }

    const query: SwQuery = {
      q: sp.get("q") ?? undefined,
      rounds: csvInts(sp.get("rounds")),
      subGenres: csv(sp.get("subGenres")),
      difficulties: csv(sp.get("difficulties")),
      relationTypes: csv(sp.get("relationTypes")) as
        | SwRelationType[]
        | undefined,
      keywords: csv(sp.get("keywords")),
    };

    return NextResponse.json(querySwPassages(query));
  } catch (err) {
    console.error("[suneung-wanseong] query failed", err);
    return NextResponse.json(
      { error: "수능완성 지문을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
