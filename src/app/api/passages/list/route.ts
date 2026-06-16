import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const onlyAnalyzed =
      request.nextUrl.searchParams.get("onlyAnalyzed") === "true";
    const rawPassageIds = request.nextUrl.searchParams.get("passageIds") ?? "";
    const passageIdsFilter = Array.from(
      new Set(
        rawPassageIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ).slice(0, 100);
    const passageWhere = {
      academyId: staff.academyId,
      ...(passageIdsFilter.length > 0 ? { id: { in: passageIdsFilter } } : {}),
      ...(onlyAnalyzed ? { analysis: { isNot: null } } : {}),
    };
    const collectionItemCount = onlyAnalyzed
      ? { where: { passage: { is: passageWhere } } }
      : true;

    const [passageRows, schools, collections] = await Promise.all([
      prisma.passage.findMany({
        where: passageWhere,
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          unit: true,
          publisher: true,
          difficulty: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          school: { select: { id: true, name: true } },
          collectionItems: { select: { collectionId: true } },
          analysis: { select: { id: true, analysisData: true, updatedAt: true } },
          // 이 지문으로 생성된 학습자료(A4 보고서) — 지문 카드 하단 토글에 사용.
          // soft delete 된 보고서는 제외, 최근 편집순.
          reports: {
            where: { deletedAt: null },
            select: {
              id: true,
              title: true,
              status: true,
              templateId: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 20,
          },
          // 이 지문으로 이미 생성된 문제 수 — 지문 카드 뱃지에 사용.
          _count: { select: { questions: true } },
        },
        // updatedAt 기준 — 재추출 dedup 이 기존 행을 재사용(touch)해도
        // "방금 추출한 지문"이 새로고침 후에도 맨 앞에 오게 한다.
        // 손대지 않은 행은 updatedAt == createdAt 이라 기존 순서와 동일하다.
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: passageIdsFilter.length > 0 ? passageIdsFilter.length : 200,
      }),
      prisma.school.findMany({
        where: { academyId: staff.academyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.passageCollection.findMany({
        where: { academyId: staff.academyId },
        select: {
          id: true,
          parentId: true,
          name: true,
          _count: { select: { items: collectionItemCount } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const passageIds = passageRows.map((passage) => passage.id);
    const reviewDrafts =
      passageIds.length > 0
        ? await prisma.extractionM1PassageDraft.findMany({
            where: {
              savedPassageId: { in: passageIds },
              deletedAt: null,
              job: {
                academyId: staff.academyId,
                mode: "PASSAGE_ONLY",
                deletedAt: null,
              },
            },
            select: {
              id: true,
              savedPassageId: true,
              reviewStatus: true,
              confirmedAt: true,
              updatedAt: true,
            },
          })
        : [];
    const reviewDraftByPassageId = new Map(
      reviewDrafts
        .filter((draft) => draft.savedPassageId)
        .map((draft) => [draft.savedPassageId as string, draft]),
    );
    const passages = passageRows.map((passage) => ({
      ...passage,
      extractionReviewDraft: reviewDraftByPassageId.get(passage.id) ?? null,
    }));

    // Extract unique filter values
    const grades = [
      ...new Set(passages.map((p) => p.grade).filter(Boolean)),
    ].sort();
    const semesters = [
      ...new Set(passages.map((p) => p.semester).filter(Boolean)),
    ];
    const publishers = [
      ...new Set(passages.map((p) => p.publisher).filter(Boolean)),
    ].sort();

    return NextResponse.json({
      passages,
      filters: { schools, grades, semesters, publishers },
      collections,
    });
  } catch {
    return NextResponse.json({
      passages: [],
      filters: { schools: [], grades: [], semesters: [], publishers: [] },
    });
  }
}
