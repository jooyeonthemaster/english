import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { getPracticeSheetCreditCost } from "@/lib/passage-analysis-credit-costs";
import {
  generateLearningWorksheetResilient,
  type ResilientWorksheetResult,
} from "@/lib/passage-report/analysis-report/generate";
import { isKoreanPassage } from "@/lib/passage-report/analysis-report/ko-entry";
import { analysisReportSchema, type AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import {
  hasWorksheetContentFields,
  stripWorksheetContentFields,
} from "@/lib/passage-report/analysis-report/worksheet-core-gate";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { preflightCreditGate } from "@/lib/credit-preflight";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 부모(기본 학습지) 행 조회 전용 마커. 이 라우트는 그 행을 **읽기만** 한다 —
 *  유일한 예외가 D3-b 강등 1건이고, 그것도 자식 쓰기와 같은 트랜잭션 안에서만 일어난다. */
const PRIME_MARKER = "PRIME";

/** [E30 §1-1] 실전 학습지(기본 PRIME 의 **자식 문서**) 마커.
 *  명명·복제 방식 모두 이 파일의 PRIME_MARKER / prime 라우트의 FINAL_MARKER 동형이다.
 *  actions/workbench/passage-constants.ts 의 PRACTICE_REPORT_MARKER 가 이 리터럴의
 *  미러다(그 파일 주석이 "prime API 라우트의 PRACTICE_MARKER 미러"라고 방향을 못박았다).
 *  ⚠ 두 벌이 갈리면 조판 목록에서 실전 행이 통째로 사라진다 — 값을 바꿀 일이 생기면
 *  반드시 두 곳을 같은 커밋에서 고쳐라. */
const PRACTICE_MARKER = "PRIME_PRACTICE";

/**
 * [E30 §1-4 D3-b] 부모 PRIME 행의 pages 에서 learning-worksheet 원소만 코어 lw 로
 * 강등한 사본을 만든다. **무동작이면 null** 을 돌려준다 — 호출자는 그때 update 자체를
 * 보내지 않아야 하고(§0-2 S1 「부모 행 바이트 동일」), 그 판정을 호출부에 복제하면
 * 두 벌이 갈려 「강등 아닌데 version 만 오르는」 조용한 회귀가 난다.
 *
 * ⚠ 뼈대는 **원본 JSON(raw)** 이지 zod 파싱본이 아니다. analysisReportSchema 는
 *   schemaVersion·brand·themeId 에 default 가 있어 파싱본을 되쓰면 lw 와 무관한 필드가
 *   조용히 채워져 P2(부모 바이트 무회귀)가 깨진다.
 * ⚠ stripWorksheetContentFields 는 lw 가 아닌 원소를 **참조 그대로** 통과시키므로
 *   (worksheet-core-gate.ts) 실제로 바뀌는 것은 learning-worksheet 원소 1개뿐이고
 *   편집 자산(blockMeta·blockOrder·hiddenSections·customBlocks·cover…)은 그대로 남는다.
 * ⚠ 모양이 예상과 다르면 강등을 **포기**한다(fail-open). 강등 실패의 대가는 레거시
 *   병합본이 한 사이클 더 남는 것뿐이지만, 모양을 추측해 쓰면 부모 문서가 깨진다.
 */
function demoteParentPages(rawPages: unknown): Record<string, unknown> | null {
  if (!rawPages || typeof rawPages !== "object" || Array.isArray(rawPages)) return null;
  const rec = rawPages as Record<string, unknown>;
  if (!Array.isArray(rec.sections)) return null;
  const sections = rec.sections as { kind: string }[];
  if (!sections.some((s) => hasWorksheetContentFields(s))) return null;
  return { ...rec, sections: stripWorksheetContentFields(sections) };
}

/**
 * POST — [E30 §2-1 (c)] 기본 학습지 이력이 **있는** 지문에 실전 학습지를 다음 문서로
 * 추가한다(◈5). 부모 PRIME 행을 병합본으로 덮어쓰던 종전 동작을
 * **PRIME_PRACTICE 자식 행 upsert** 로 바꿨다.
 *
 * 산출: PassageReport(generationPlan="PRIME_PRACTICE", templateId="prime-practice") 1행.
 *   - 부모와 **같은 passageId 를 공유**한다(§1-2 D1 — parentReportId 컬럼 신설은 기각).
 *   - 지문당 1행, 재발사 = 갱신(P3). (passageId, generationPlan) 유니크가 **없으므로**
 *     중복 방어는 아래 「지문당 활성 1잡」 배타(409) 하나뿐이다.
 * 부모 PRIME 행은 「읽기 + D3-b 강등」만 한다 — 강등이 무동작이면(신선 지문) update
 * 자체를 보내지 않는다(§0-2 S1 「부모 행 바이트 동일」의 성립 조건).
 * 「실전만 단독 선행 생성」은 아래 부모 필수 404 가 서버에서 강제한다(§2-4 1층).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  // 생성 데드라인의 기준점 — maxDuration=300s 인라인 실행이라 요청 진입 시각부터 잰다
  // (모델 호출 직전에 재계산하면 앞단 조회·과금에 쓴 시간이 예산에서 빠져나간다).
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      academyId: true,
      title: true,
      content: true,
      grade: true,
      subject: true,
      school: { select: { type: true } },
    },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  // PRIME_KO 게이트 — 실전 학습지(영어 워크북·수능추론)는 영어 전용 생성기라 국어 지문 차단.
  // 국어 분석 보고서(PRIME_KO)에는 확인 문제(ko-check-quiz)가 이미 포함된다.
  if (isKoreanPassage(passage)) {
    return NextResponse.json(
      { error: "국어 지문은 실전 학습지(영어 워크북)를 지원하지 않습니다. 국어 분석 보고서에 확인 문제가 포함돼 있어요." },
      { status: 400 },
    );
  }

  // 메인 분석 보고서(5섹션)가 있어야 워크시트를 그 위에 붙일 수 있다.
  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, pages: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "먼저 분석 보고서를 생성하세요." }, { status: 404 });
  }
  const parsedReport = analysisReportSchema.safeParse(existing.pages);
  if (!parsedReport.success) {
    return NextResponse.json({ error: "분석 보고서 형식이 올바르지 않습니다." }, { status: 422 });
  }
  // 이 값이 요구 「기존 기본 학습지의 데이터를 부모 데이터로 삼아서」의 실체 —
  // 아래 생성기의 2번째 인자로 그대로 들어간다(§2-2 :68-72 무개변).
  const baseReport: AnalysisReport = parsedReport.data;

  // ── 잡 수명주기(검수 M3) — 동기 실행이라 잡이 없으면 진행 상태가 서버 어디에도 없어,
  // 생성 중 새로고침·타 스태프 화면에서 버튼이 재활성돼 5크레딧 이중 차감 창이 열린다.
  // 지문당 활성 1잡 검사로 부분 분석(fast 라우트)과도 상호 배제된다(스펙 §3.4 특례 ③).
  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "PASSAGE_ANALYSIS",
    passageId: passage.id,
  });
  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json(
      { error: "이미 진행 중인 생성이 있습니다. 완료된 뒤 다시 시도해 주세요." },
      { status: 409 },
    );
  }

  // [E30 §3-1] 단가 정본. 이 라우트는 정의상 부모 PRIME 이 있는 경로(위 404 게이트를
  // 통과했다)라 hasBasic:true 고정이다. 값은 종전 CREDIT_COSTS.PASSAGE_ANALYSIS 와 같은
  // ◈5 라 과금 회귀는 0이지만, **모달 표기와 청구가 같은 함수를 읽어야** 어긋나지 않는다
  // (E19-2 계약 — 표기는 getStudioSheetStates.practiceUnitCost 가 같은 함수를 쓴다).
  // ⚠ 리터럴 5 를 여기 쓰지 마라. 단가는 이 함수 하나에서만 결정된다.
  const cost = getPracticeSheetCreditCost({ hasBasic: true });
  // 사전 잔액 게이트(잡 행 생성 전) — fast 라우트와 같은 결정(26-09-08 전수조사:
  // 잔액 0 일괄 발사가 FAILED 잡을 양산). 최종 권위는 아래 원자적 차감.
  const preflight = await preflightCreditGate({
    academyId: staff.academyId,
    requiredCredits: cost,
  });
  if (!preflight.ok) return preflight.response;

  // ── [E30 §2-2 과금 순서 계약] 잡을 **먼저** 열고 그 다음에 과금한다(종전은 반대였다).
  // ① ensureWorkbenchAiJobCharged 는 jobId 를 멱등키로 쓴다(job.creditTxId 재사용 →
  //    referenceId=jobId 재조회 → 원자적 차감). 잡이 없으면 멱등키가 없어 새로고침·동시
  //    클릭이 ◈5 를 두 번 뺀다 — 종전 deductCredits 경로가 정확히 그 상태였다.
  // ② 차감 거래 id 가 job.creditTxId 에 기록돼야 좀비 리퍼가 자동 환불할 수 있다
  //    (workbench-ai-job-stale-cleanup.ts 는 `if (!job.creditTxId) return false;`).
  //    DB 실측: 종전 worksheetOnly 잡 3건은 **전부 creditTxId = NULL** 이었다 = 그 잡이
  //    죽으면 크레딧이 그냥 증발했다는 뜻이다. 정식 상품으로 승격하는 이상 소실 사고가
  //    인기에 비례해 늘어난다.
  // 검수 M3(동기 실행이라 잡이 없으면 진행 상태가 서버 어디에도 없다)도 그대로 유효하다.
  // config.includeWorksheet 는 getStudioPassageDetail 의 실전 생성 중 판정
  // (worksheetJobActive)이 읽는 키다.
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      requestedCount: 1,
      startedAt: new Date(),
      // ⚠ [E29-4] `fastPath: true` 필수 — 이 라우트도 maxDuration=300s 인라인
      //   동기 실행이라 300초를 넘긴 PROCESSING 행은 실행 주체가 이미 죽은 것이
      //   증명된다. 이 키가 없으면 스테일 청소가 fastPath 6분 규칙에 매칭하지
      //   못하고 triggerless **15분** 규칙으로 떨어져(workbench-ai-job-stale-cleanup.ts
      //   FAST_PATH_STALE_MS / TRIGGERLESS_STALE_MS), 죽은 잡 1건이 그 지문의
      //   기본·실전·파이널 생성을 15분 넘게 「분석 중」으로 봉인한다(실측 사고).
      config: { includeWorksheet: true, worksheetOnly: true, fastPath: true },
    },
  });
  const closeJob = async (data: Record<string, unknown>) => {
    await prisma.workbenchAiJob
      .update({ where: { id: job.id }, data: { ...data, completedAt: new Date() } })
      .catch((e) => console.error("worksheet job close failed", e));
  };

  let charge: { transactionId: string };
  try {
    charge = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: staff.academyId,
      staffId: staff.id,
      operationType: "PASSAGE_ANALYSIS",
      metadata: { passageId, kind: "PRACTICE_WORKBOOK", fastPath: true },
      creditCost: cost,
    });
  } catch (err) {
    // ⚠ 과금 실패에서 잡을 PROCESSING 인 채로 두면 그 지문의 기본·실전·파이널 생성이
    //   스테일 청소(fastPath 창)가 돌 때까지 「분석 중」으로 봉인된다 — 반드시 닫는다.
    if (err instanceof InsufficientCreditsError) {
      await closeJob({
        status: "FAILED",
        failedCount: 1,
        errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
      });
      return NextResponse.json(
        { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    await closeJob({ status: "FAILED", failedCount: 1, errorMessage: String(err).slice(0, 300) });
    throw err;
  }

  // [E30 §2-2] 생성기 승격 — 단발 generateLearningWorksheet → 회복형 3라운드.
  // 같은 ◈5 에 fast 라우트(기본+실전 동시)는 회복형을, 이 경로는 단발을 팔고 있었다.
  // 정식 상품으로 올리면서 등급을 맞추지 않으면 「실전 추가는 자꾸 실패한다」가 되고,
  // 실패는 전액 환불이라 매출이 아니라 신뢰가 샌다.
  // deadline 은 fast 라우트와 같은 규약(requestStartedAt + 285s) — maxDuration 300s 에서
  // 저장·잡 종결 몫 15s 를 남긴 값이다.
  let worksheet: ResilientWorksheetResult;
  try {
    worksheet = await generateLearningWorksheetResilient(
      {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
      },
      baseReport,
      { deadlineAt: requestStartedAt + 285_000 },
    );
  } catch (e) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", charge.transactionId, "실전 학습지 생성 예외", cost);
    await closeJob({ status: "FAILED", failedCount: 1, errorMessage: String(e).slice(0, 300) });
    return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  // 회복형 생성기는 throw 도 ok:false 도 내지 않는다 — 실패는 「확보 유닛 0」으로만
  // 나타난다(present = ['workbook','inference'] 중 확보분). 두 유닛 모두 실패하면 조립
  // 결과가 **부모의 코어 lw(logicRows 전용)로 폴백**하므로, 그것을 자식 행으로 저장하면
  // 내용 없는 「실전 학습지」가 조판 목록에 유령으로 뜬다(E30 §1-4 의 「빈 껍데기 215건」과
  // 같은 물건을 새로 만드는 짓이다). 저장하지 말고 전액 환불한다.
  // 부분 확보(하나만 성공)는 fast 라우트와 동일하게 「제공된 것」으로 본다.
  if (worksheet.present.length === 0 || !worksheet.section) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", charge.transactionId, "실전 학습지 생성 실패", cost);
    await closeJob({
      status: "FAILED",
      failedCount: 1,
      errorMessage: `worksheet units 0 (rounds=${worksheet.rounds}, section=${worksheet.section ? "core-fallback" : "null"})`,
    });
    return NextResponse.json(
      { error: `실전 학습지 생성 실패: 워크북·수능추론을 확보하지 못했습니다(라운드 ${worksheet.rounds}).` },
      { status: 502 },
    );
  }

  // ── [E30 §1-3] 실전 문서(PRIME_PRACTICE)의 pages — 부모에서 상속하는 것은 문서
  // 껍데기(브랜드·문서번호·테마·타이틀 메타)뿐이고 섹션은 **정확히 1개**다.
  // ⚠ layout·blockMeta·blockOrder·tableColWidths·sectionHeadings·hiddenSections·
  //   vocabTestOnly·englishOnlyPage·customBlocks·activityAnswerKeyPage·cover·
  //   passageLayout 은 **상속 금지**다. 부모에 hiddenSections ∋ "learning-worksheet" 가
  //   켜져 있으면(DB 실측 2행) 슬롯키 규약상 자식은 **유일한 섹션이 통째로 사라져** 백지가
  //   된다. 「부모 값을 그대로 물려주면 안전하다」는 직관이 여기서는 정반대다.
  // 렌더는 section-slots.ts 의 폴백 루프가 처리한다(passage/final 섹션이 없어 전용 분기에
  //   걸리지 않는다) — 파이널처럼 새 분기를 파지 마라(§6 do-not-touch).
  const practiceReport: AnalysisReport = {
    schemaVersion: baseReport.schemaVersion,
    brand: baseReport.brand,
    docNo: baseReport.docNo,
    themeId: baseReport.themeId,
    meta: baseReport.meta,
    sections: [worksheet.section],
  };

  // ── [E30 §2-2] 자식 행 upsert + 부모 강등을 **한 트랜잭션**으로 묶는다.
  // 나누면 「◈5 냈는데 부모만 강등되고 실전 문서는 없는」(=유료 콘텐츠 소실) 상태가
  // 남는다. 반대로 자식 쓰기가 실패하면 롤백돼 부모는 원본 그대로다.
  const persisted = await prisma.$transaction(async (dbtx) => {
    // ① PRIME_PRACTICE 자식 행 upsert — 파이널(PRIME_FINAL)의 findFirst→update/create
    //    관용구 복제. 지문당 1행, 재발사 = 갱신(P3).
    //    ⚠ (passageId, generationPlan) 유니크 인덱스가 **없다**(§1-2-4에서 기각) —
    //      위쪽 「지문당 활성 1잡」 배타(409)가 중복 행을 막는 유일한 방어다. 그 게이트를
    //      지우면 여기서 조용히 2행이 생기고, 조판 목록에 같은 실전이 두 줄로 뜬다.
    //    ⚠ 「이미 자식 행이 있으면 무과금 단락」류 최적화 금지 — 생성 실패 잔재로 내용이
    //      빈 행이 있으면 영구 교착한다(E19-11 이 잡은 구멍과 동형). 언제나 신선 생성이다.
    const existingPractice = await dbtx.passageReport.findFirst({
      where: {
        passageId,
        academyId: staff.academyId,
        generationPlan: PRACTICE_MARKER,
        deletedAt: null,
      },
      select: { id: true },
    });
    const practiceRowData = {
      title: practiceReport.meta.titleKo,
      status: "PUBLISHED",
      pages: practiceReport as never,
      theme: { themeId: practiceReport.themeId } as never,
      templateId: "prime-practice",
      generationPlan: PRACTICE_MARKER,
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
    };
    const row = existingPractice
      ? await dbtx.passageReport.update({
          where: { id: existingPractice.id },
          data: { ...practiceRowData, version: { increment: 1 } },
          select: { id: true },
        })
      : await dbtx.passageReport.create({
          data: {
            academyId: staff.academyId,
            passageId,
            createdById: staff.id,
            ...practiceRowData,
          },
          select: { id: true },
        });

    // ② 부모 PRIME 강등(D3-b, lazy migration). 레거시 병합본(실전 콘텐츠가 부모의
    //    learning-worksheet 안에 들어 있는 366건)은 이 경로로 **재발사되는 것만** 자연
    //    이관된다 — 일괄 백필은 금지다(D3-a). 강등이 하는 일: section-slots.ts 의
    //    lwHasWorkbook 이 false 로 떨어져 **부모 문서의 실전 슬롯이 사라지고**, 실전은
    //    자식 문서에만 남는다 → 같은 지문에서 실전이 두 번 인쇄되는 것이 구조적으로 불가능.
    //
    // ⚠ 강등 원본은 라우트 앞단에서 읽어 둔 existing.pages 가 **아니라** 여기서 다시
    //   읽은 값이다. 앞단 조회와 이 지점 사이에는 생성기(수 분)가 있고 그 사이에 부모
    //   문서를 편집기에서 저장(PATCH)할 수 있다 — 낡은 스냅숏을 되쓰면 그 편집이
    //   말없이 증발한다. 자식 행 쓰기와 같은 트랜잭션 안에서 읽으므로 재조회 비용은
    //   질의 1건이고, 그 대가로 「생성 중 저장한 내용이 사라졌다」가 원천 봉쇄된다.
    // ⚠ 무동작이면(신선 지문 = 코어 lw 에 이미 그 필드가 없다) update 자체를 보내지
    //   않는다 — 그래야 부모 행의 version·updatedAt 까지 불변이라 S1 이 성립한다.
    //   쓰는 필드는 pages·version 둘뿐이다. title·status·theme·templateId·
    //   generationPlan 은 물론 lastEditedById/At 도 건드리지 않는다 — 강등은 사용자
    //   편집이 아니라 시스템 이관이고, 여기서 편집자 도장을 찍으면 부모 문서의 편집
    //   이력이 실전 생성 때마다 조용히 덮인다(P2).
    const parentNow = await dbtx.passageReport.findUnique({
      where: { id: existing.id },
      select: { pages: true },
    });
    const demotedParentPages = demoteParentPages(parentNow?.pages);
    if (demotedParentPages) {
      await dbtx.passageReport.update({
        where: { id: existing.id },
        data: { pages: demotedParentPages as never, version: { increment: 1 } },
        select: { id: true },
      });
    }
    return { id: row.id, demoted: demotedParentPages !== null };
  });

  await closeJob({
    status: "COMPLETED",
    successCount: 1,
    resultCount: 1,
    result: {
      worksheetOnly: true,
      reportId: persisted.id,
      planMarker: PRACTICE_MARKER,
      parentDemoted: persisted.demoted,
      rounds: worksheet.rounds,
      present: worksheet.present,
    },
  });

  // [E30 §2-2] 응답 계약 — 이제 산출물은 부모를 덮어쓴 병합본이 아니라 **자식 문서**다.
  // planMarker 를 함께 실어 호출자가 「어느 문서로 착지할지」를 알 수 있게 한다.
  // ⚠ 이 report 를 기본 학습지 편집기에 그대로 replace 하면 기본 문서가 1섹션짜리로
  //   보이는 착시가 난다 — 그 배선(AnalysisReportEditor / prime-analysis-view)은 P4 가
  //   따로 고친다. 여기서는 서버가 정직한 값을 주는 데까지가 계약이다.
  return NextResponse.json({
    report: practiceReport,
    reportId: persisted.id,
    planMarker: PRACTICE_MARKER,
  });
}
