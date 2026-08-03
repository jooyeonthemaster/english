import { after, NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import {
  checkBalance,
  deductCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import {
  authoringRequestSchema,
  buildAuthoringJobTitle,
  AI_PASSAGE_AUTHORING_JOB_DOMAIN,
} from "@/lib/passage-authoring/schema";
import {
  authoringCreditCost,
  runAuthoringJob,
} from "@/lib/passage-authoring/run-job";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================================
// POST /api/workbench/passage-authoring — AI 지문 생성 시작
//
// 이 라우트는 "잡을 만들고 · 크레딧을 잡고 · 즉시 응답한다"까지만 한다.
// 실제 N편 생성은 after() 로 응답 뒤에 이어진다 —
//   · 선생님이 탭을 닫거나 다른 화면으로 이동해도 실행이 끝까지 간다.
//   · 클라이언트는 GET /[jobId] 폴링으로 완성분을 실시간으로 받아 카드를 채운다.
// (동기 응답으로 N편을 기다리면 6편 기준 300s 벽에 걸리고, 그 사이 새로고침
//  한 번이면 결과가 통째로 증발한다 — 잡+폴링 구조여야 하는 이유.)
//
// 크레딧: 편당 2크레딧을 N편치(2N) 선차감하고, 실패 편수만큼 run-job 이 부분
// 환불한다. 자료 판독·역할 분류는 무료(TEXT_EXTRACTION 관례)라 여기서 안 센다.
//
// 멱등성(회귀 계약): 클라이언트는 실행 1건마다 x-authoring-request-id 를 보낸다.
// 응답만 유실된 재전송이 같은 키로 다시 들어오면 **잡 생성·차감 이전에** 기존
// 잡을 찾아 그 jobId 를 200 으로 돌려준다. 이 검사가 없으면 네트워크가 한 번
// 끊길 때마다 같은 요청이 2N 크레딧을 두 번 태운다(적대 검수 HIGH).
// ============================================================================

/** 도메인 타입 → Prisma Json 저장 경계(optional 필드 때문에 직접 대입 불가). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** 멱등키 헤더 이름 — 클라이언트(authoring-store-io)와 공유하는 리터럴. */
const REQUEST_ID_HEADER = "x-authoring-request-id";

/** 같은 멱등키를 "같은 요청"으로 인정하는 시간 창. */
const REQUEST_ID_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = authoringRequestSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }
  const request = parsed.data;

  // 자료도 없고 지시도 없으면 만들 근거가 하나도 없다 — 모델을 부르기 전에 막는다.
  if (request.materials.length === 0 && !request.instruction.trim()) {
    return NextResponse.json(
      {
        error:
          "무엇을 만들지 알려주세요. 자료를 넣거나 요청을 적어주세요.",
      },
      { status: 400 },
    );
  }

  // ── 멱등 검사 ────────────────────────────────────────────────────────────
  // 반드시 잡 생성·deductCredits **이전**이어야 한다. 뒤로 밀면 검사 자체가
  // 이중 과금을 막지 못한다.
  const requestId = (req.headers.get(REQUEST_ID_HEADER) ?? "").trim().slice(0, 100);
  if (requestId) {
    const existing = await prisma.workbenchAiJob.findFirst({
      where: {
        academyId: staff.academyId,
        domain: AI_PASSAGE_AUTHORING_JOB_DOMAIN,
        deletedAt: null,
        createdAt: { gt: new Date(Date.now() - REQUEST_ID_WINDOW_MS) },
        config: { path: ["requestId"], equals: requestId },
      },
      select: {
        id: true,
        status: true,
        title: true,
        requestedCount: true,
        successCount: true,
        failedCount: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      // 카운터까지 함께 돌려준다 — 이미 끝난 잡이면 클라이언트가 폴링 없이 곧바로
      // 확정하는데, 카운터가 빠지면 "지문 0편이 완성됐어요"로 표시된다.
      // (본문 items 는 여기서 싣지 않는다. 결과를 열 때 상세 라우트로 지연 로드한다.)
      return NextResponse.json({
        jobId: existing.id,
        status: existing.status,
        title: existing.title,
        requestedCount: existing.requestedCount,
        successCount: existing.successCount,
        failedCount: existing.failedCount,
        deduplicated: true,
      });
    }
  }

  const cost = authoringCreditCost(request.count);

  // 잡 생성 전 잔액 게이트: 잔액이 모자란 상태에서 잡부터 만들면 FAILED row 만
  // 쌓여 작업 큐가 실패 카드로 오염된다(읽기 전용 조회라 부작용 없음).
  const balance = await checkBalance(staff.academyId);
  if (balance.balance < cost) {
    return NextResponse.json(
      {
        error: "크레딧이 부족합니다.",
        code: "INSUFFICIENT_CREDITS",
        balance: balance.balance,
        required: cost,
      },
      { status: 402 },
    );
  }

  const title = buildAuthoringJobTitle({
    instruction: request.instruction,
    materials: request.materials,
    count: request.count,
  });

  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: AI_PASSAGE_AUTHORING_JOB_DOMAIN,
      status: "PROCESSING",
      title,
      startedAt: new Date(),
      requestedCount: request.count,
      // fastPath:true 는 좀비 리퍼(workbench-ai-job-stale-cleanup)의 **6분 규칙**에
      // 태우기 위한 표식이다(FAST_PATH_STALE_MS = 6 * 60 * 1000 — 예전 10분에서
      // 좁혔다) — 이 실행은 250s 예산 안에서 끝나므로, 6분을 넘겨 PROCESSING 이면
      // 함수가 죽은 것이고 리퍼가 FAILED+환불로 정리해야 한다.
      //
      // ⚠️ config 는 **스칼라 최소치만** 담는다. 공용 조회 라우트의 요약 투영
      //    (ai-jobs?view=summary)이 config 를 통째로 싣고, 작업 큐가 그 요약을
      //    10초마다 limit=50 으로 폴링한다 — 여기에 지시문 4,000자와 자료 12건의
      //    미리보기를 넣으면 잡 1건당 ~6.5KB × 50건이 매 폴마다 나간다(화면에는
      //    한 글자도 쓰이지 않는 순수 낭비). 재현에 필요한 요청 스냅샷은 이미
      //    result.request(run-job.buildRequestSnapshot)에 있으므로 중복을 없앤다.
      config: toJson({
        fastPath: true,
        ...(requestId ? { requestId } : {}),
        spec: request.spec,
        count: request.count,
        diversify: request.diversify,
        materialCount: request.materials.length,
        instructionHead: request.instruction.trim().slice(0, 200),
        materials: request.materials.map((m) => ({
          id: m.id,
          role: m.role,
        })),
      }),
    },
    select: { id: true },
  });

  let creditTxId: string;
  try {
    const credit = await deductCredits(
      staff.academyId,
      "PASSAGE_AUTHORING",
      staff.id,
      {
        source: "WORKBENCH_PASSAGE_AUTHORING",
        jobId: job.id,
        count: request.count,
        materialCount: request.materials.length,
        gradeBand: request.spec.gradeBand,
        targetWords: request.spec.targetWords,
        creditCost: cost,
        fastPath: true,
      },
      cost,
    );
    creditTxId = credit.transactionId;
  } catch (err) {
    // 잔액 게이트를 통과했어도 동시 차감으로 밀릴 수 있다 — 잡을 남기지 않고 정리.
    const insufficient = err instanceof InsufficientCreditsError;
    await prisma.workbenchAiJob
      .update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: request.count,
          completedAt: new Date(),
          errorMessage: insufficient
            ? "크레딧이 부족합니다."
            : "크레딧 차감에 실패했습니다.",
        },
      })
      .catch(() => {});
    if (insufficient) {
      return NextResponse.json(
        {
          error: "크레딧이 부족합니다.",
          code: "INSUFFICIENT_CREDITS",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  // 환불 추적 근거 — 리퍼(좀비 정리)도 이 값으로 전액 환불을 수행한다.
  await prisma.workbenchAiJob
    .update({ where: { id: job.id }, data: { creditTxId } })
    .catch((err) => {
      console.error(
        `[PASSAGE-AUTHORING] creditTxId 저장 실패 (job=${job.id}, tx=${creditTxId}):`,
        err instanceof Error ? err.message : err,
      );
    });

  // 응답을 먼저 돌려주고 실행은 after() 로 이어간다(runAuthoringJob 은 어떤
  // 경우에도 예외를 던지지 않는다 — 던지면 여기서 잡을 사람이 없다).
  after(async () => {
    await runAuthoringJob({
      jobId: job.id,
      academyId: staff.academyId,
      staffId: staff.id,
      request,
      creditTxId,
    });
  });

  return NextResponse.json({
    jobId: job.id,
    status: "PROCESSING",
    title,
    requestedCount: request.count,
  });
}
