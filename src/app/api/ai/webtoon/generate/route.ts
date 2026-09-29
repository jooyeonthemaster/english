import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import {
  enqueueLocalWebtoonGeneration,
  shouldUseLocalWebtoonWorker,
} from "@/lib/webtoon-local-worker";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  isWebtoonLanguageId,
  type WebtoonStyleId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";
import { resolveWebtoonImagePlan } from "@/lib/webtoon-models";
import { friendlyWebtoonError } from "@/lib/webtoon-errors";
import { isKoreanSubject } from "@/lib/korean/core/passage-meta";
import type { OperationType } from "@/lib/credit-costs";

export const runtime = "nodejs";

const VALID_STYLES: WebtoonStyleId[] = [
  "KOREAN_WEBTOON",
  "PIXAR_3D",
  "GHIBLI",
  "MANHWA_ROMANCE",
  "REALISTIC",
];

interface RequestBody {
  passageIds?: string[];
  passageId?: string;
  style?: string;
  language?: string;
  customPrompt?: string;
  plan?: string;
}

interface QueuedItem {
  webtoonId: string;
  passageId: string;
  passageTitle: string;
  status: "PENDING" | "GENERATING" | "FAILED";
  error?: string;
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const passageIds = normalizePassageIds(body);
  const style = VALID_STYLES.includes(body.style as WebtoonStyleId)
    ? (body.style as WebtoonStyleId)
    : null;
  const language = isWebtoonLanguageId(body.language)
    ? body.language
    : DEFAULT_WEBTOON_LANGUAGE;
  const customPrompt =
    typeof body.customPrompt === "string" ? body.customPrompt.slice(0, 1000) : "";
  const plan = resolveWebtoonImagePlan(body.plan);

  if (passageIds.length === 0 || !style) {
    return NextResponse.json(
      { error: "passageIds와 style이 필요합니다." },
      { status: 400 },
    );
  }
  if (passageIds.length > 20) {
    return NextResponse.json(
      { error: "한 번에 최대 20개까지 생성할 수 있습니다." },
      { status: 400 },
    );
  }

  const passages = await prisma.passage.findMany({
    where: { id: { in: passageIds }, academyId: staff.academyId },
    select: { id: true, title: true, subject: true },
  });
  if (passages.length === 0) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  const passageById = new Map(passages.map((p) => [p.id, p]));
  const queued: QueuedItem[] = [];

  for (const passageId of passageIds) {
    const passage = passageById.get(passageId);
    if (!passage) continue;
    // 국어 지문은 언어 선택과 무관하게 한국어로 조판된다(rules.normalizeStoryboardLanguage).
    // 행에도 실제 조판 언어를 저장해 카드·미리보기 라벨이 거짓말하지 않게 한다.
    const rowLanguage = isKoreanSubject(passage.subject) ? "KO" : language;

    let txId: string;
    try {
      const result = await deductCredits(staff.academyId, plan.operationType, staff.id, {
        passageId,
        style,
        language: rowLanguage,
        plan: plan.id,
        model: plan.modelId,
      });
      txId = result.transactionId;
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            ok: false,
            error: "크레딧이 부족합니다.",
            balance: err.currentBalance,
            required: err.requiredCredits,
            queued,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    let webtoon: { id: string };
    try {
      webtoon = await prisma.webtoon.create({
        data: {
          academyId: staff.academyId,
          passageId,
          createdById: staff.id,
          style,
          language: rowLanguage,
          customPrompt: customPrompt || null,
          status: "PENDING",
          creditTransactionId: txId,
          imageModel: plan.modelId,
        },
        select: { id: true },
      });
    } catch (createErr) {
      // 차감은 끝났는데 행이 없다 → 여기서 돌려주지 않으면 크레딧이 증발한다(행이
      // 없으니 프로세서·리퍼도 환불할 길이 없다). 즉시 환불하고 배치를 멈춘다 — DB
      // 장애라면 뒤 지문도 "차감→생성 실패→환불"만 반복하기 때문이다. 이미 큐에 오른
      // 항목은 queued 로 그대로 알려 준다(402 경로와 같은 모양).
      // 커밋은 됐는데 응답만 끊긴 경우 그 행은 미디스패치 PENDING 으로 남아 stale 리퍼가
      // FAILED 로 정리한다 — refundCredits 가 원 거래액 이상 돌려주지 않아 이중 환불은 없다.
      const refunded = await refundAfterCreateFailure(staff.academyId, plan.operationType, txId, {
        passageId,
        error: createErr instanceof Error ? createErr.message : String(createErr),
      });
      return NextResponse.json(
        {
          ok: false,
          error: refunded
            ? "웹툰 생성 요청을 저장하지 못했어요. 차감된 크레딧은 환불됐어요. 잠시 후 다시 시도해 주세요."
            : "웹툰 생성 요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요. 크레딧이 돌아오지 않았다면 문의해 주세요.",
          queued,
        },
        { status: 500 },
      );
    }

    try {
      await dispatchWebtoonGeneration(webtoon.id);
      queued.push({
        webtoonId: webtoon.id,
        passageId,
        passageTitle: passage.title,
        status: "PENDING",
      });
    } catch (dispatchErr) {
      const message = dispatchErr instanceof Error ? dispatchErr.message : "dispatch error";
      // 먼저 PENDING 인 경우에만 FAILED 로 마감하고, 그 전환에 성공했을 때만 환불한다.
      // (디스패치 요청이 실제로는 큐에 들어갔을 수도 있다 — 런이 이미 행을 claim 했다면
      //  count 0 → 손대지 않는다. FAILED 로 먼저 뒤집어 두면 늦게 뜬 런은 claim 하지 못한다.)
      let marked = false;
      try {
        const res = await prisma.webtoon.updateMany({
          where: { id: webtoon.id, status: "PENDING" },
          data: {
            status: "FAILED",
            errorMessage: friendlyWebtoonError(message),
            completedAt: new Date(),
          },
        });
        marked = res.count > 0;
      } catch (markErr) {
        // 마감 기록 실패로 배치 응답 전체를 500 으로 날리지 않는다 — 이 행은
        // 미디스패치 PENDING 으로 남고 stale 리퍼(25분)가 FAILED + 환불로 정리한다.
        console.error("[webtoon-generate] failed to mark undispatched row FAILED", {
          webtoonId: webtoon.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      if (marked) {
        try {
          await refundCredits(staff.academyId, plan.operationType, txId, "Webtoon dispatch failed");
        } catch (refundErr) {
          // 리퍼의 환불 재시도 스윕(24시간)이 REFUND 없는 FAILED 행을 다시 환불한다.
          console.error("[webtoon-generate] dispatch refund failed (reaper will retry)", {
            webtoonId: webtoon.id,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        }
      }
      // 실제 상태를 돌려준다: FAILED 로 마감하지 못했다면(런이 이미 claim 했거나 마감 기록
      // 실패) 행은 살아 있는 PENDING/GENERATING 이다 — "실패·환불"로 알리면 교사가 재시도해
      // 이중 과금된다. 그 경우는 시작된 것으로 보고 리퍼·프로세서가 끝을 맺는다.
      queued.push(
        marked
          ? { webtoonId: webtoon.id, passageId, passageTitle: passage.title, status: "FAILED", error: message }
          : { webtoonId: webtoon.id, passageId, passageTitle: passage.title, status: "PENDING" },
      );
    }
  }

  return NextResponse.json({ ok: true, queued });
}

/** 행 생성 실패 직후 환불. 반환 = 환불 성공 여부(실패 시 수동 환불용 로그를 남긴다). */
async function refundAfterCreateFailure(
  academyId: string,
  operationType: OperationType,
  txId: string,
  context: { passageId: string; error: string },
): Promise<boolean> {
  console.error("[webtoon-generate] row create failed after charge", { academyId, txId, ...context });
  try {
    await refundCredits(academyId, operationType, txId, "Webtoon row create failed");
    return true;
  } catch (refundErr) {
    console.error("[webtoon-generate] REFUND FAILED after row create failure — manual refund needed", {
      academyId,
      txId,
      operationType,
      error: refundErr instanceof Error ? refundErr.message : String(refundErr),
    });
    return false;
  }
}

function normalizePassageIds(body: RequestBody): string[] {
  if (Array.isArray(body.passageIds)) {
    return body.passageIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  }
  return typeof body.passageId === "string" && body.passageId.length > 0
    ? [body.passageId]
    : [];
}

async function dispatchWebtoonGeneration(webtoonId: string) {
  if (shouldUseLocalWebtoonWorker()) {
    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: { triggerRunId: `local:${Date.now()}` },
    });
    enqueueLocalWebtoonGeneration(webtoonId);
    return;
  }

  const handle = await tasks.trigger(
    "webtoon-generate",
    { webtoonId },
    { idempotencyKey: `webtoon-generate:${webtoonId}` },
  );

  // 여기부터는 런이 이미 큐에 있다 — 추적용 id 기록 실패를 디스패치 실패로 취급하면
  // 살아 있는 런이 도는 행을 환불·FAILED 처리하게 된다. 기록만 포기하고 넘어간다.
  try {
    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: { triggerRunId: handle.id },
    });
  } catch (err) {
    console.warn("[webtoon-generate] triggerRunId write failed (run is queued)", {
      webtoonId,
      runId: handle.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
