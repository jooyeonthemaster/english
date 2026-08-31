import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { isKoreanPassage, KO_PRIME_REPORT_MARKER } from "@/lib/passage-report/analysis-report/ko-entry";
import { koAnalysisReportSchema, type KoAnalysisReport } from "@/lib/passage-report/analysis-report/ko-schema";
import {
  analysisReportSchema,
  isFinalOnepageReportShape,
  isReadingAnalysisReportShape,
  type AnalysisReport,
  type ReportCover,
} from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 영어 PRIME 마커 — 형제 라우트(prime/[passageId]/route.ts)와 동일 리터럴. */
const PRIME_MARKER = "PRIME";
/** 파이널 원페이지 행 마커(final-onepage-spec F3) — 형제 라우트와 동일 리터럴. */
const FINAL_MARKER = "PRIME_FINAL";

/** 주석(PassageNote) 복제 상한 — 트랜잭션 비대화 방지. */
const MAX_NOTES = 500;

/** 영어/국어 PRIME 보고서 문서. 이 라우트는 pages(JSON) 를 통째로 복제한다. */
type PrimeReport = AnalysisReport | KoAnalysisReport;

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  /** PassageAnalysis(5-layer 분석 캐시) 복제 — 없으면 카드 요약·레거시 뷰가 빈다. */
  copyAnalysis: z.boolean().default(true),
  /** PassageNote(교사 필기·메모) 복제. */
  copyNotes: z.boolean().default(true),
  /** 사본을 원본과 같은 폴더(PassageCollection)에 배치. */
  copyCollections: z.boolean().default(true),
});

/**
 * 표지 제목 치환 — 표지 문구는 사용자가 직접 쓴 카피일 수 있으므로,
 * 비어 있거나 옛 본문 제목과 똑같을 때만 새 이름으로 갈아끼운다.
 */
function renamedCover(cover: ReportCover, previousTitle: string, title: string): ReportCover {
  const current = (cover.title ?? "").trim();
  if (current && current !== previousTitle.trim()) return cover;
  return { ...cover, title };
}

/** 보고서 형식 오류 응답 — 영어/국어 두 경로가 공유. */
function invalidReportResponse(issues: readonly { message: string }[]) {
  return NextResponse.json(
    { error: `보고서 형식이 올바르지 않습니다: ${issues[0]?.message ?? ""}` },
    { status: 400 },
  );
}

/**
 * POST — '다른 이름으로 저장'
 *
 * 편집 중인 학습지를 **원본은 그대로 둔 채** 새 학습지로 복제 저장한다.
 * 이 도메인에서 '학습지' = PRIME/PRIME_KO 보고서를 가진 지문이므로
 * (학습지 목록의 모집단이 `passage where reports.some(generationPlan in [PRIME, PRIME_KO])`,
 * 카드 이름이 Passage.title) 지문 행과 보고서 행을 **함께** 새로 만들어야
 * 목록에 새 항목으로 나타난다.
 *
 * AI 호출이 0회이므로 크레딧 차감 없음 — PATCH 편집 저장과 동일 규약.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  // ── [E30 §2-4] 실전 학습지는 사본 저장 대상이 아니다 ────────────────────────
  // 이 라우트는 **새 지문 행을 만든다**(아래 `tx.passage.create`). 실전 학습지를 그렇게
  // 복제하면 사본은 부모 PRIME 이 없는 **고아 실전**이 되어, 「실전만 먼저 생성은 안 되는
  // 구조」(사용자 확정 요구)를 사본 경로로 우회하게 된다. 그래서 형제 라우트가 여는
  // `?variant=practice` 를 여기서는 **명시적으로 거절**한다(조용히 기본을 복제하면
  // 「실전 사본을 만들었다」고 믿는 사용자에게 기본 학습지가 배달된다).
  // UI 는 실전 문서 편집기에서 「다른 이름으로 저장」 자체를 렌더하지 않으므로, 이 분기는
  // 그 UI 게이트를 신뢰하지 않는 **서버 정본**이다.
  if (req.nextUrl.searchParams.get("variant") === "practice") {
    return NextResponse.json(
      {
        error:
          "실전 학습지는 사본 저장을 지원하지 않습니다 — 기본 학습지를 사본 저장하면 실전을 다시 추가할 수 있습니다.",
      },
      { status: 400 },
    );
  }

  // ── [reading 1차 범위] 직독직해 분석본도 사본 저장 대상이 아니다 ─────────────
  // reading-analysis-worksheet-spec §5.2 A-9 · §5.3 F-3: 1차 범위에서 reading 의
  // 사본 저장은 미지원이고, UI 도 reading 문서 편집기에서 「다른 이름으로 저장」을
  // 렌더하지 않는다(F-6 부정 목록). 실전과 마찬가지로 이 분기는 그 UI 게이트를
  // 신뢰하지 않는 **서버 정본**이다 — 조용히 무시하고 아래로 흘리면 marker 산식이
  // PRIME 으로 떨어져 **기본 학습지가 복제**되고, 「직독직해 사본을 만들었다」고 믿는
  // 사용자에게 엉뚱한 문서가 배달된다(practice 거절과 동일한 사고 유형).
  if (req.nextUrl.searchParams.get("variant") === "reading") {
    return NextResponse.json(
      {
        error:
          "직독직해 분석본은 사본 저장을 지원하지 않습니다 — 원본 문서에서 편집·인쇄해 주세요.",
      },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    const first = parsedBody.error.issues[0];
    return NextResponse.json(
      {
        error:
          first?.path[0] === "title"
            ? "학습지 이름을 1~120자로 입력해주세요."
            : "요청 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }
  const { title, copyAnalysis, copyNotes, copyCollections } = parsedBody.data;

  // report 는 zod 로 감싸면 "미전달"과 "undefined"가 구분되지 않으므로
  // PATCH 라우트와 동일하게 원시 객체에서 직접 읽는다.
  const rawReport = (raw as { report?: unknown } | null)?.report;

  // [reading 모양 백스톱] variant 를 안 실은 호출이 reading 문서 본문을 보내는 경우도
  // 같은 400 으로 거절한다. practice 는 모양으로 가를 수 없어 이 백스톱이 원리적으로
  // 불가능하지만(기본 문서도 learning-worksheet 를 가짐 — 형제 라우트 주석), reading 의
  // `reading-analysis` 섹션은 reading 문서에만 존재하므로 판별이 확정적이다. 이 백스톱이
  // 없으면 아래 marker 산식이 PRIME 으로 떨어져 **reading 본문을 가진 PRIME 사본**이라는
  // 오염 행이 만들어진다(목록엔 기본 학습지로 뜨는데 열면 직독직해 — 무음 데이터 오염).
  if (isReadingAnalysisReportShape(
    rawReport as { sections?: Array<{ kind?: string }> } | null | undefined,
  )) {
    return NextResponse.json(
      {
        error:
          "직독직해 분석본은 사본 저장을 지원하지 않습니다 — 원본 문서에서 편집·인쇄해 주세요.",
      },
      { status: 400 },
    );
  }

  // ── 1) 원본 지문 (academyId 스코프 — 교차 테넌트 접근 차단) ───────────────
  const source = await prisma.passage.findFirst({
    where: { id: passageId, academyId: staff.academyId },
    select: {
      id: true,
      academyId: true,
      schoolId: true,
      content: true,
      source: true,
      grade: true,
      semester: true,
      unit: true,
      publisher: true,
      difficulty: true,
      tags: true,
      order: true,
      subject: true,
      sourceMaterialId: true,
      contentHash: true,
      sourcePageIndex: true,
      extractionOutput: true,
      analysis: { select: { analysisData: true, contentHash: true, version: true } },
    },
  });
  if (!source) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  // PRIME_KO 게이트 — 국어 지문은 KO 마커·KO 스키마로만 복제(영어 경로 오염 차단).
  const korean = isKoreanPassage(source);
  // final 자기감지(final-onepage-spec §2) — 편집기가 보낸 report 가 final 형이거나
  // ?variant=final 이면 복제 소스를 PRIME_FINAL 행으로 바꾼다. 복제본 자체의 의미론
  // (지문+보고서 신규 생성, generationPlan = 소스 마커)은 기존 그대로. 국어는 기존 경로.
  const wantsFinal =
    !korean &&
    (req.nextUrl.searchParams.get("variant") === "final" ||
      isFinalOnepageReportShape(
        rawReport as { sections?: Array<{ kind?: string }> } | null | undefined,
      ));
  const marker = korean ? KO_PRIME_REPORT_MARKER : wantsFinal ? FINAL_MARKER : PRIME_MARKER;

  // ── 2) 원본 보고서 (GET/PATCH 와 동일한 선택 규약) ────────────────────────
  const sourceReport = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: marker, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, pages: true, status: true, templateId: true },
  });
  if (!sourceReport) {
    return NextResponse.json({ error: "복제할 학습지를 찾을 수 없습니다." }, { status: 404 });
  }

  // ── 3) 복제 본문 — 편집기가 현재(미저장 포함) 상태를 보내면 그것을,
  //       없으면 서버 저장본을 그대로. 새 이름은 pages JSON 안까지 반영한다
  //       (A4 문서의 H1 이 meta.titleKo 라 컬럼만 바꾸면 인쇄물이 옛 이름으로 남는다).
  const candidate = rawReport !== undefined ? rawReport : sourceReport.pages;
  let report: PrimeReport;
  if (korean) {
    const parsed = koAnalysisReportSchema.safeParse(candidate);
    if (!parsed.success) return invalidReportResponse(parsed.error.issues);
    const base = parsed.data;
    report = {
      ...base,
      meta: { ...base.meta, titleKo: title },
      ...(base.cover ? { cover: renamedCover(base.cover, base.meta.titleKo, title) } : {}),
    };
  } else {
    const parsed = analysisReportSchema.safeParse(candidate);
    if (!parsed.success) return invalidReportResponse(parsed.error.issues);
    const base = parsed.data;
    report = {
      ...base,
      meta: { ...base.meta, titleKo: title },
      ...(base.cover ? { cover: renamedCover(base.cover, base.meta.titleKo, title) } : {}),
    };
  }

  // ── 4) 복제 트랜잭션 ─────────────────────────────────────────────────────
  //  지문만 만들어지고 보고서가 실패하면 목록에도 안 뜨는 유령 지문이 남으므로
  //  전 단계를 하나의 트랜잭션으로 묶는다.
  const created = await prisma.$transaction(
    async (tx) => {
      // 4-a) 지문 사본.
      //  · sourceExtractionItemId 는 @unique — 복사하면 P2002 로 전체 롤백된다. 넣지 않는다.
      //  · reviewedAt/reviewedById 는 승계하지 않는다 — 사본은 미검수 상태로 시작.
      //  · subject 는 반드시 승계 — 국어 사본이 영어 목록으로 새어나가는 것을 막는다.
      const newPassage = await tx.passage.create({
        data: {
          academyId: source.academyId,
          schoolId: source.schoolId,
          title,
          content: source.content,
          source: source.source,
          grade: source.grade,
          semester: source.semester,
          unit: source.unit,
          publisher: source.publisher,
          difficulty: source.difficulty,
          tags: source.tags,
          order: source.order,
          subject: source.subject,
          sourceMaterialId: source.sourceMaterialId,
          contentHash: source.contentHash,
          sourcePageIndex: source.sourcePageIndex,
          extractionOutput: source.extractionOutput,
        },
        select: { id: true },
      });

      // 4-b) 5-layer 분석 캐시 (PassageAnalysis.passageId 가 @unique 라 새 행이 필요).
      let newAnalysisId: string | null = null;
      if (copyAnalysis && source.analysis) {
        const analysis = await tx.passageAnalysis.create({
          data: {
            passageId: newPassage.id,
            analysisData: source.analysis.analysisData,
            contentHash: source.analysis.contentHash,
            version: source.analysis.version,
          },
          select: { id: true },
        });
        newAnalysisId = analysis.id;
      }

      // 4-c) 교사 주석(필기 마크 + 메모).
      if (copyNotes) {
        const notes = await tx.passageNote.findMany({
          where: { passageId },
          select: {
            annotationId: true,
            content: true,
            memo: true,
            highlightStart: true,
            highlightEnd: true,
            noteType: true,
            order: true,
          },
          orderBy: { order: "asc" },
          take: MAX_NOTES,
        });
        if (notes.length > 0) {
          await tx.passageNote.createMany({
            data: notes.map((note) => ({ ...note, passageId: newPassage.id })),
          });
        }
      }

      // 4-d) 폴더 소속 — 사본이 원본과 같은 폴더에 나란히 놓이게.
      if (copyCollections) {
        const links = await tx.passageCollectionItem.findMany({
          where: { passageId },
          select: { collectionId: true, orderNum: true },
        });
        if (links.length > 0) {
          await tx.passageCollectionItem.createMany({
            data: links.map((link) => ({
              collectionId: link.collectionId,
              passageId: newPassage.id,
              orderNum: link.orderNum,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 4-e) 보고서 사본.
      //  · 이미지(Supabase 공개 URL)·표지 로고(data URL)는 pages JSON 안에 값으로
      //    들어 있어 그대로 따라온다 — 별도 파일/Webtoon 행 복제는 하지 않는다
      //    (같은 storagePath 를 가리키면 사본 삭제가 원본 이미지를 파괴한다).
      //  · contentHash 는 PDF export 캐시 키인데 제목이 바뀌었으므로 승계 금지.
      //  · version 은 1 부터 — 사본은 새 문서다.
      const newReport = await tx.passageReport.create({
        data: {
          academyId: staff.academyId,
          passageId: newPassage.id,
          title,
          status: sourceReport.status,
          pages: report as never, // AnalysisReport JSON 전체를 pages(Json)에 저장
          theme: { themeId: report.themeId } as never,
          templateId:
            sourceReport.templateId ?? (korean ? "prime-ko" : wantsFinal ? "prime-final" : "prime"),
          generationPlan: marker,
          sourcedFromAnalysisId: newAnalysisId,
          contentHash: null,
          version: 1,
          createdById: staff.id,
          lastEditedById: staff.id,
          lastEditedAt: new Date(),
        },
        select: { id: true },
      });

      return { passageId: newPassage.id, reportId: newReport.id };
    },
    { timeout: 20_000 },
  );

  return NextResponse.json({ ...created, title, report }, { status: 201 });
}
