import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";
import { pseudoIdForDraft } from "@/lib/extraction/draft-passage-id";
import { buildPassageSubjectScopeWhere } from "@/actions/workbench/_passage-where";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "@/actions/workbench/_collection-where";
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
    // 과목 스코프 — 'KOREAN' = 국어 전용 화면(국어 지문만), 미지정 = 영어
    // 기본(국어 지문 제외). 서버 액션(buildWorkbenchPassageWhere)과 같은 조각을
    // 공유해 목록/전체선택 population 이 항상 일치한다.
    const subjectScope =
      request.nextUrl.searchParams.get("scope") === "KOREAN"
        ? ("KOREAN" as const)
        : undefined;
    const passageWhere = {
      academyId: staff.academyId,
      ...(passageIdsFilter.length > 0 ? { id: { in: passageIdsFilter } } : {}),
      ...(onlyAnalyzed ? { analysis: { isNot: null } } : {}),
      ...buildPassageSubjectScopeWhere(subjectScope),
    };
    const collectionItemCount = onlyAnalyzed
      ? { where: { passage: { is: passageWhere } } }
      : true;

    // 폴더(컬렉션) 목록도 지문과 동일한 과목 스코프를 적용한다 — 국어 생성
    // 페이지(scope=KOREAN)에 영어 폴더가, 영어 화면에 국어 폴더가 새어들지
    // 않는다. select 에 subject 가 없으므로 P2022 는 WHERE 절에서만 가능 —
    // 컬럼 미반영 DB 는 레거시(과목 미분리·공유 폴더) 목록으로 우아하게
    // 강등한다(collections-passage.ts getPassageCollections 패턴 미러).
    const collectionSelect = {
      id: true,
      parentId: true,
      name: true,
      _count: { select: { items: collectionItemCount } },
    } as const;
    const loadCollections = async () => {
      try {
        return await prisma.passageCollection.findMany({
          where: {
            academyId: staff.academyId,
            ...buildCollectionSubjectScopeWhere(subjectScope),
          },
          select: collectionSelect,
          orderBy: { name: "asc" },
        });
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
        return prisma.passageCollection.findMany({
          where: { academyId: staff.academyId },
          select: collectionSelect,
          orderBy: { name: "asc" },
        });
      }
    };

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
          // 과목(null=영어)·태그(국어 갈래 KO_KIND:* 포함) — 카드 배지/필터용.
          subject: true,
          tags: true,
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
      loadCollections(),
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
    // 검수 전 자료(미승격 draft) 합류 — 과목 스코프별로 분리한다. 잡 생성 시
    // metadata.subject 에 기록된 과목("KOREAN")을 기준으로, 국어 스코프에는
    // 국어 잡의 draft 만, 영어(기본) 스코프에는 그 외 draft 만 합친다 —
    // 양방향 모두 상대 과목의 검수 전 자료가 새어들지 않는다.
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
            // 잡 metadata.subject — 과목 스코프 필터(위 주석)의 판정 소스.
            job: { select: { metadata: true } },
          },
        });

        const isKoreanDraftJob = (jobMetadata: unknown): boolean =>
          !!jobMetadata &&
          typeof jobMetadata === "object" &&
          !Array.isArray(jobMetadata) &&
          (jobMetadata as Record<string, unknown>).subject === "KOREAN";

        const draftPseudoPassages = draftRows
          .filter(
            (d) => isKoreanDraftJob(d.job?.metadata) === (subjectScope === "KOREAN"),
          )
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
            // 국어 잡의 draft 는 국어 pseudo-passage 로 표시(카드 배지 일관).
            subject: subjectScope === "KOREAN" ? "KOREAN" : null,
            tags: null,
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
  } catch (error) {
    console.error("[passages/list] failed", error);
    return NextResponse.json(
      { error: "지문 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
