import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { generateAnalysisReportCore } from "@/lib/passage-report/analysis-report/generate";
import {
  analysisReportSchema,
  isFinalOnepageReportShape,
  isReadingAnalysisReportShape,
} from "@/lib/passage-report/analysis-report/schema";
import {
  buildKoPromptInputFromPassage,
  isKoreanPassage,
  KO_PRIME_REPORT_MARKER,
  saveKoPrimeReport,
} from "@/lib/passage-report/analysis-report/ko-entry";
import { generateKoAnalysisReportCore } from "@/lib/passage-report/analysis-report/ko-resilient-generate";
import { koAnalysisReportSchema } from "@/lib/passage-report/analysis-report/ko-schema";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

const PRIME_MARKER = "PRIME";
/** 파이널 원페이지 행 마커(final-onepage-spec F3) — 기본 PRIME 행과 지문당 각 1행 공존. */
const FINAL_MARKER = "PRIME_FINAL";
/** [E30 §5 P4] 실전 학습지 행 마커 — `passage-constants.ts` 의 PRACTICE_REPORT_MARKER 미러
 *  (이 라우트는 형제 라우트들과 같은 관례로 마커 리터럴을 복제해 둔다).
 *
 *  ⚠ 이 행은 부모 PRIME 과 **같은 passageId 를 공유**한다(E30 §1-2 D1). 그래서 파이널이 쓴
 *  「문서 모양 자기감지」 트릭이 실전에는 **원리적으로 적용 불가**다 — 기본 문서도 실전 문서도
 *  둘 다 `learning-worksheet` 섹션을 가질 수 있어 모양으로는 절대 못 가른다.
 *  → 저장 대상 행의 정본은 **URL `?variant`** 하나뿐이다. */
const PRACTICE_MARKER = "PRIME_PRACTICE";

/** [reading] 직독직해 분석본 행 마커 — `passage-constants.ts` 의 READING_REPORT_MARKER 미러
 *  (이 라우트는 형제 라우트들과 같은 관례로 마커 리터럴을 복제해 둔다 —
 *  reading-analysis-worksheet-spec §5.3 F-2 「미러 2벌 규약」).
 *
 *  ⚠ 두 벌이 갈리면(한쪽만 바뀌면) 이 라우트가 저장한 행이 PRIME_REPORT_MARKERS
 *  스코프 밖으로 떨어져 **조판 목록에서 통째로 증발**한다 — worksheet-docs 로더가
 *  그 집합으로만 조회하기 때문이다. 반드시 같은 커밋에서 함께 바꾼다.
 *
 *  실전(PRACTICE)과 달리 이 문서는 파이널과 같은 「자기완결 문서」 축이다:
 *  `reading-analysis` 섹션은 reading 문서에만 존재하므로, 모양 자기감지
 *  (isReadingAnalysisReportShape)가 **분류자로 성립**한다 — PATCH 백스톱 참조. */
const READING_MARKER = "PRIME_READING";

/** 이 라우트가 다루는 문서 축. **무파라미터 = "basic"** 이며, 그때의 동작은 E30 이전과
 *  글자 그대로 동일하다(P4 바이트 무회귀 — 기존 호출부는 전부 이 경로다). */
type DocVariant = "basic" | "final" | "practice" | "reading";

/** `?variant` 해석 — 미지 값은 전부 "basic" 으로 접는다(구·신 클라이언트 혼재 안전). */
function readDocVariant(req: NextRequest): DocVariant {
  const raw = req.nextUrl.searchParams.get("variant");
  return raw === "final"
    ? "final"
    : raw === "practice"
      ? "practice"
      : raw === "reading"
        ? "reading"
        : "basic";
}

/** 「섹션이 `learning-worksheet` 하나뿐」 = 실전 분리 문서의 형태(E30 §1-3).
 *  ⚠ **분류자가 아니라 거절 조건**으로만 쓴다 — 기본 문서도 lw 를 가지므로 이 술어로
 *  「이건 실전이다」를 단정하면 안 되고, 「이건 기본이 아닐 수 있다」까지만 말할 수 있다. */
function looksLikePracticeReport(report: { sections?: readonly { kind?: string }[] }): boolean {
  const sections = report.sections ?? [];
  return sections.length === 1 && sections[0]?.kind === "learning-worksheet";
}

/** KO 게이트 판정용 — subject 만 가볍게 읽는다 (영어 경로 무변경). */
async function loadPassageSubject(passageId: string, academyId: string) {
  return prisma.passage.findFirst({
    where: { id: passageId, academyId },
    select: { subject: true },
  });
}

/**
 * GET — 기존 PRIME 분석 보고서 조회 (있으면 모달이 바로 렌더)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  // PRIME_KO 게이트 — 국어 지문은 KO 마커·KO 스키마로만 로드(영어 보고서와 혼재 차단).
  // ?variant=final 이면 파이널 원페이지(PRIME_FINAL), ?variant=practice 면 실전 학습지
  // (PRIME_PRACTICE, E30 §5 P4), ?variant=reading 이면 직독직해 분석본(PRIME_READING)
  // 행을 조회한다 — 국어는 셋 다 미지원이라 variant 를 무시하고 기존 동작 그대로.
  // **무파라미터 = 기존 그대로**(PRIME).
  const subjectRow = await loadPassageSubject(passageId, staff.academyId);
  const korean = isKoreanPassage(subjectRow);
  const variant: DocVariant = korean ? "basic" : readDocVariant(req);
  const marker = korean
    ? KO_PRIME_REPORT_MARKER
    : variant === "final"
      ? FINAL_MARKER
      : variant === "practice"
        ? PRACTICE_MARKER
        : variant === "reading"
          ? READING_MARKER
          : PRIME_MARKER;

  const row = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: marker, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, pages: true, updatedAt: true },
  });
  if (!row) return NextResponse.json({ report: null });

  const parsed = korean ? koAnalysisReportSchema.safeParse(row.pages) : analysisReportSchema.safeParse(row.pages);
  if (!parsed.success) return NextResponse.json({ report: null });
  return NextResponse.json({ report: parsed.data, reportId: row.id, updatedAt: row.updatedAt });
}

/**
 * PATCH — 편집기에서 수정한 PRIME 보고서를 저장 (크레딧 차감 없음, 재생성 아님)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  // PRIME_KO 게이트 — 국어 보고서는 KO 스키마로 검증·KO 마커 행에만 저장.
  const subjectRow = await loadPassageSubject(passageId, staff.academyId);
  const korean = isKoreanPassage(subjectRow);

  const rawReport = (body as { report?: unknown })?.report;
  const parsed = korean ? koAnalysisReportSchema.safeParse(rawReport) : analysisReportSchema.safeParse(rawReport);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `보고서 형식이 올바르지 않습니다: ${parsed.error.issues[0]?.message ?? ""}` },
      { status: 400 },
    );
  }
  const report = parsed.data;

  // 저장 대상 행 결정 — **URL `?variant` 가 정본**이고(E30 §5 P4), 무파라미터일 때만
  // 기존 final 자기감지(final-onepage-spec §2)·reading 자기감지로 폴백한다.
  // · `?variant=practice` → 실전 학습지(PRIME_PRACTICE) 자식 행.
  // · `?variant=final`    → 파이널 원페이지 행(모양 감지와 결론은 같지만, 편집 중 섹션이
  //                         지워져 모양이 무너진 파이널이 **부모 PRIME 을 덮어쓰는** 사고를
  //                         URL 이 원천 차단한다).
  // · `?variant=reading`  → 직독직해 분석본(PRIME_READING) 행.
  // · 무파라미터          → 모양 감지 → FINAL / READING, 아니면 PRIME. FINAL 폴백은
  //                         **E30 이전과 글자 그대로 동일**하고, READING 폴백은 additive 다
  //                         (reading-analysis 섹션은 reading 문서에만 존재 — 기존 문서는
  //                         이 분기에 절대 닿지 않으므로 바이트 무회귀).
  // ⚠ 실전은 모양으로 가를 수 없다 — 기본 문서도 learning-worksheet 를 가지므로, 실전을
  //   모양 감지에 얹으면 즉시 「기본 학습지 행 통째 덮어쓰기」가 된다(P4 의 본체).
  // ⚠ reading 은 정반대로 모양 감지가 **백스톱으로 필수**다(스펙 §5.3 F-3): 편집기를
  //   임베드한 호스트가 docVariant 를 안 실으면 reading 문서가 PRIME 으로 계산돼 부모
  //   기본 학습지 행을 에러 0·로그 0 으로 덮어쓴다 — practice 가 fail-closed 거절로
  //   막는 바로 그 사고를, reading 은 모양이 확정적이라 **올바른 행으로 라우팅**해 막는다.
  const variant: DocVariant = korean ? "basic" : readDocVariant(req);
  const marker = korean
    ? KO_PRIME_REPORT_MARKER
    : variant === "practice"
      ? PRACTICE_MARKER
      : variant === "final"
        ? FINAL_MARKER
        : variant === "reading"
          ? READING_MARKER
          : isFinalOnepageReportShape(report)
            ? FINAL_MARKER
            : isReadingAnalysisReportShape(report)
              ? READING_MARKER
              : PRIME_MARKER;

  // ── [E30 §5 P4] 미표기 실전 문서 fail-closed ────────────────────────────────
  // 위 산식은 무파라미터 요청을 PRIME 으로 보낸다(무회귀). 그런데 편집기를 임베드한 호스트가
  // `docVariant` 를 안 실으면 **실전 문서가 부모 기본 학습지 행을 통째로 덮어쓴다** — 유료
  // 데이터가 에러 0·로그 0 으로 사라지는, P4 가 막으려는 바로 그 사고다.
  // 모양으로 「이건 실전이다」를 단정할 수는 없지만, ①「섹션이 learning-worksheet 하나뿐」이고
  // ②「그 지문에 이미 실전 행이 있다」가 동시에 참이면 **덮어쓰는 것보다 거절이 언제나 낫다**
  // (되돌릴 수 없는 파괴 vs 되돌릴 수 있는 오류 토스트).
  // 정상 기본 문서는 섹션이 여러 개라 ①에서 즉시 빠지므로 **추가 질의조차 돌지 않는다**(무회귀).
  if (!korean && marker === PRIME_MARKER && looksLikePracticeReport(report)) {
    const practiceRow = await prisma.passageReport.findFirst({
      where: {
        passageId,
        academyId: staff.academyId,
        generationPlan: PRACTICE_MARKER,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (practiceRow) {
      return NextResponse.json(
        {
          error:
            "실전 학습지 문서는 기본 학습지 주소로 저장할 수 없습니다. 편집기를 다시 열어 주세요.",
          code: "PRACTICE_VARIANT_REQUIRED",
        },
        { status: 409 },
      );
    }
  }

  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: marker, deletedAt: null },
    // GET(:113)과 동일한 orderBy — 같은 마커 행이 복수인 지문에서 「화면에 보여준 행」과
    // 「저장하는 행」이 갈리는 것을 막는다(전 variant 공통, 26-08-31 적대 검수 렌즈1).
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "수정할 보고서를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.passageReport.update({
    where: { id: existing.id },
    data: {
      title: report.meta.titleKo,
      pages: report as never,
      theme: { themeId: report.themeId } as never,
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
      version: { increment: 1 },
    },
    select: { id: true },
  });

  return NextResponse.json({ report, reportId: updated.id });
}

/**
 * POST — 지문으로 PRIME A4 분석 보고서 생성 (크레딧 차감) → 저장 → 반환
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true, academyId: true, title: true, content: true,
      grade: true, subject: true, tags: true, school: { select: { type: true } },
    },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  const academy = await prisma.academy.findUnique({
    where: { id: staff.academyId },
    select: { name: true },
  });

  const cost = CREDIT_COSTS.PASSAGE_ANALYSIS;
  let tx: { transactionId: string };
  try {
    tx = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, { passageId, kind: "PRIME_REPORT" }, cost);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    throw err;
  }

  // ── PRIME_KO 게이트: 국어 지문은 KO 생성기·KO 마커로만 처리(영어 분석기 오염 차단) ──
  if (isKoreanPassage(passage)) {
    try {
      const koResult = await generateKoAnalysisReportCore(
        buildKoPromptInputFromPassage({
          content: passage.content,
          tags: passage.tags,
          grade: passage.grade,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        }),
        {
          brand: academy?.name ?? "KOREAN READING LAB",
          contentHash: hashContent(passage.content),
          deadlineAt: Date.now() + 240_000,
        },
      );
      if (!koResult.ok) {
        await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME_KO 생성 실패", cost);
        return NextResponse.json({ error: `보고서 생성 실패: ${koResult.error}` }, { status: 502 });
      }
      const saved = await saveKoPrimeReport(prisma, {
        academyId: staff.academyId,
        passageId,
        staffId: staff.id,
        report: koResult.report,
      });
      return NextResponse.json({ report: koResult.report, reportId: saved.reportId });
    } catch (e) {
      await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME_KO 생성 예외", cost);
      return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
    }
  }

  let result;
  try {
    // 기본 분석 = 메인 보고서(5섹션)만 1회 호출. 실전 학습지(06)는 옵트인 별도 생성.
    result = await generateAnalysisReportCore({
      passageContent: passage.content,
      schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
      grade: passage.grade,
      brand: academy?.name ?? "ENGLISH READING LAB",
    });
  } catch (e) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME 생성 예외", cost);
    return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  if (!result.ok) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME 생성 실패", cost);
    return NextResponse.json({ error: `보고서 생성 실패: ${result.error}` }, { status: 502 });
  }

  const report = result.report;

  // 기존 PRIME 보고서 있으면 갱신, 없으면 생성 (passage당 1개)
  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    select: { id: true, version: true },
  });

  const data = {
    title: report.meta.titleKo,
    status: "PUBLISHED",
    pages: report as never, // AnalysisReport JSON 전체를 pages(Json)에 저장
    theme: { themeId: report.themeId } as never,
    templateId: "prime",
    generationPlan: PRIME_MARKER,
    lastEditedById: staff.id,
    lastEditedAt: new Date(),
  };

  let reportId: string;
  if (existing) {
    const u = await prisma.passageReport.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
      select: { id: true },
    });
    reportId = u.id;
  } else {
    const c = await prisma.passageReport.create({
      data: { academyId: staff.academyId, passageId, createdById: staff.id, ...data },
      select: { id: true },
    });
    reportId = c.id;
  }

  return NextResponse.json({ report, reportId });
}
