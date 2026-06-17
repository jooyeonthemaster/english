import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";
import { pseudoIdForDraft } from "@/lib/extraction/draft-passage-id";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const onlyAnalyzed =
      request.nextUrl.searchParams.get("onlyAnalyzed") === "true";
    // Opt-in: also surface un-promoted extraction drafts (검수 전 자료) as
    // pseudo-passages so the question/exam generation surfaces can show and
    // generate from un-reviewed materials. Gated by a query param so other
    // consumers (학습지·튜터·등록 다이얼로그) keep showing only real passages.
    const includeUnreviewed =
      request.nextUrl.searchParams.get("includeUnreviewed") === "true";
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
        // 상한 없음 — 학원 스코프로 모든 지문을 반환(검수 전 자료도 누락 없이 노출).
        take: passageIdsFilter.length > 0 ? passageIdsFilter.length : undefined,
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
    const realPassages = passageRows.map((passage) => ({
      ...passage,
      extractionReviewDraft: reviewDraftByPassageId.get(passage.id) ?? null,
    }));

    // Extract unique filter values (real passages only — drafts carry no meta).
    const grades = [
      ...new Set(realPassages.map((p) => p.grade).filter(Boolean)),
    ].sort();
    const semesters = [
      ...new Set(realPassages.map((p) => p.semester).filter(Boolean)),
    ];
    const publishers = [
      ...new Set(realPassages.map((p) => p.publisher).filter(Boolean)),
    ].sort();

    // ── 검수 전 자료(미승격 draft) → pseudo-passage 합치기 (opt-in) ──
    // savedPassageId 가 있는 draft 는 이미 위 realPassages 에 Passage 로 잡혀
    // 있으므로 제외(중복 방지). isM1DraftVisible 로 스텁(듣기·공유지문 하위문항)
    // 은 숨긴다. 카드는 reviewStatus !== "COMMITTED" → 기존 "검수필요" 빨간
    // 테두리로 자동 표시된다.
    let passages: typeof realPassages = realPassages;
    if (includeUnreviewed && passageIdsFilter.length === 0 && !onlyAnalyzed) {
      try {
        const draftRows = await prisma.extractionM1PassageDraft.findMany({
          where: {
            savedPassageId: null,
            deletedAt: null,
            reviewStatus: { in: ["DRAFT", "REVIEWED"] },
            job: {
              academyId: staff.academyId,
              mode: "PASSAGE_ONLY",
              deletedAt: null,
            },
          },
          orderBy: [{ job: { createdAt: "desc" } }, { passageOrder: "asc" }],
          // 상한 없음 — 검수 전 자료 전부 노출(누락되면 "왜 안 보이냐" 혼란).
          select: {
            id: true,
            title: true,
            passageOrder: true,
            teacherText: true,
            rawText: true,
            restorationStatus: true,
            reviewStatus: true,
            metadata: true,
            createdAt: true,
          },
        });

        const draftPseudoPassages = draftRows
          .filter((d) =>
            isM1DraftVisible({
              restorationStatus: d.restorationStatus,
              rawText: d.rawText,
              metadata: d.metadata,
            }),
          )
          .map((d) => ({
            id: pseudoIdForDraft(d.id),
            title: d.title?.trim() || `지문 ${d.passageOrder + 1}`,
            content: d.teacherText?.trim() || d.rawText || "",
            grade: null,
            semester: null,
            unit: null,
            publisher: null,
            difficulty: null,
            source: "extraction-draft",
            school: null,
            collectionItems: [] as { collectionId: string }[],
            analysis: null,
            createdAt: d.createdAt,
            updatedAt: d.createdAt,
            _count: { questions: 0 },
            extractionReviewDraft: {
              id: d.id,
              savedPassageId: null,
              reviewStatus: d.reviewStatus,
              confirmedAt: null,
              updatedAt: d.createdAt,
            },
          }))
          // 본문이 비어있는 draft 는 생성에 쓸 수 없으니 제외.
          .filter((p) => p.content.trim().length > 0);

        // 실제 지문 + 검수 전 자료를 한 목록으로 병합. 정렬 키는 위 쿼리와 동일
        // (updatedAt desc → createdAt desc) — 재추출로 touch된 지문이 맨 앞에 온다.
        const sortMs = (p: { updatedAt?: unknown; createdAt?: unknown }) =>
          new Date((p.updatedAt ?? p.createdAt) as Date).getTime();
        passages = [
          ...realPassages,
          ...(draftPseudoPassages as unknown as typeof realPassages),
        ].sort((a, b) => sortMs(b) - sortMs(a));
      } catch (err) {
        console.error("[passages/list] draft merge failed", err);
        // draft 병합 실패해도 실제 지문 목록은 정상 반환.
      }
    }

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
