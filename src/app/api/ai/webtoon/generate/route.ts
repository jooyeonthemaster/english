import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import {
  enqueueLocalWebtoonGeneration,
  shouldUseLocalWebtoonWorker,
} from "@/lib/webtoon-local-worker";
import type { WebtoonStyleId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

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
  customPrompt?: string;
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
  const customPrompt =
    typeof body.customPrompt === "string" ? body.customPrompt.slice(0, 1000) : "";

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
    select: { id: true, title: true },
  });
  if (passages.length === 0) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  const passageById = new Map(passages.map((p) => [p.id, p]));
  const queued: QueuedItem[] = [];

  for (const passageId of passageIds) {
    const passage = passageById.get(passageId);
    if (!passage) continue;

    let txId: string;
    try {
      const result = await deductCredits(staff.academyId, "WEBTOON_IMAGE", staff.id, {
        passageId,
        style,
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

    const webtoon = await prisma.webtoon.create({
      data: {
        academyId: staff.academyId,
        passageId,
        createdById: staff.id,
        style,
        customPrompt: customPrompt || null,
        status: "PENDING",
        creditTransactionId: txId,
      },
      select: { id: true },
    });

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
      try {
        await refundCredits(staff.academyId, "WEBTOON_IMAGE", txId, "Webtoon dispatch failed");
      } catch {
        // Best effort: the row is still marked FAILED so the operator can retry.
      }
      await prisma.webtoon.update({
        where: { id: webtoon.id },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
      });
      queued.push({
        webtoonId: webtoon.id,
        passageId,
        passageTitle: passage.title,
        status: "FAILED",
        error: message,
      });
    }
  }

  return NextResponse.json({ ok: true, queued });
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

  await prisma.webtoon.update({
    where: { id: webtoonId },
    data: { triggerRunId: handle.id },
  });
}
