import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { queryExamBank } from "@/lib/exam-passages/question-bank";
import { parseExamBankQNums } from "@/lib/exam-passages/question-bank-number-filter";
import { EXAM_BANK_IMPORT_MAX, type ExamBankQuery } from "@/lib/exam-passages/question-bank-types";

// GET /api/exam-passages/questions — 기출 문항 은행 질의(검색/필터/페이지네이션 + facet).
// 인증 필요(라이선스 콘텐츠). 목록 행은 본문 없이 경량(preview 140자)이라 페이로드가 작다.
//
// 쿼리: q, yearFrom, yearTo, exams, grades, boards, types(=typeGroup), points, sort, page, pageSize, ids (복수값은 콤마)
//  - ids 를 주면 그 레코드만 반환(선택분 일괄 조회, 필터 무시).
//  - points: 배점(콤마 CSV 양의 정수, 예 "2,3") — 정수가 아니거나 0 이하인 조각은 버린다(§11.3-7). facet 축 없음.
//  - page/pageSize: 양의 정수만 인정, 그 외는 기본값(1 / EXAM_BANK_PAGE_SIZE)으로 강등.
//  - sort: "exam"(회차·번호순) 외의 값은 전부 기본(최신순)으로 강등 — 미지의 값으로 500 을 내지 않는다.
// 지문 코퍼스 라우트(../route.ts)와 같은 규약 — 표면이 갈리면 두 브라우저의 동작이 어긋난다.

function csv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function int(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// page/pageSize 는 양의 정수만 — "1.5"·"0"·"-3" 이 통과하면 slice 경계가 소수·음수가 되어
// 빈 페이지나 어긋난 페이지를 조용히 낸다(queryExamBank 의 clamp 는 정수를 전제한다).
function positiveInt(value: string | null): number | undefined {
  const n = int(value);
  return n !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
}

// points 는 배점이라 양의 정수만(2·3) — 소수·0·음수 조각은 버린다.
function positiveIntCsv(value: string | null): number[] | undefined {
  const nums = (csv(value) ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return nums.length > 0 ? nums : undefined;
}

function sortOf(value: string | null): ExamBankQuery["sort"] {
  return value === "exam" ? "exam" : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
    const sp = request.nextUrl.searchParams;
    const query: ExamBankQuery = {
      q: sp.get("q") ?? undefined,
      yearFrom: int(sp.get("yearFrom")),
      yearTo: int(sp.get("yearTo")),
      exams: csv(sp.get("exams")),
      grades: csv(sp.get("grades")),
      boards: csv(sp.get("boards")),
      typeGroups: csv(sp.get("types")),
      points: positiveIntCsv(sp.get("points")),
      qNums: parseExamBankQNums(sp.get("qNums")),
      sort: sortOf(sp.get("sort")),
      page: positiveInt(sp.get("page")),
      pageSize: positiveInt(sp.get("pageSize")),
      ids: csv(sp.get("ids"))?.slice(0, EXAM_BANK_IMPORT_MAX),
    };
    return NextResponse.json(queryExamBank(query, { full: sp.get("full") === "1" }));
  } catch (err) {
    console.error("[exam-bank] query failed", err);
    return NextResponse.json({ error: "기출 문항을 불러오지 못했습니다." }, { status: 500 });
  }
}
