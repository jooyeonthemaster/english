import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getBankDepositConfig,
  getBankNotifyIngestToken,
  getBankNotifyRelaySecret,
  grantBankDepositTopUp,
  matchBankDeposit,
  parseDepositNotification,
  verifyBankNotifySignature,
  verifyBankNotifyToken,
} from "@/lib/bank-deposit";

export const dynamic = "force-dynamic";

const notifySchema = z.object({
  // Either send raw alert text, or structured fields (preferred).
  text: z.string().max(2000).optional(),
  amount: z.number().int().positive().optional(),
  depositorName: z.string().max(60).optional(),
  bankName: z.string().max(40).optional(),
  externalId: z.string().max(200).optional(),
  occurredAt: z.string().datetime().optional(),
  source: z.string().max(40).optional(),
});

/**
 * Inbound bank deposit alerts relayed from an Android SMS/push forwarder.
 * Authenticated by HMAC-SHA256 over the raw body (x-bank-notify-signature).
 * Idempotent on externalId. Matched deposits are credited instantly; unmatched
 * or ambiguous ones are stored for admin review.
 */
export async function POST(request: NextRequest) {
  const relayConfigured =
    Boolean(getBankNotifyRelaySecret()) || Boolean(getBankNotifyIngestToken());
  if (!relayConfigured) {
    return NextResponse.json(
      { error: "bank notify relay is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  // Two accepted auth modes:
  //  1. Bearer token (phone hits SMOAT directly, no proxy) — simplest.
  //  2. HMAC signature over the raw body (Cloudflare proxy / hardened relay).
  const authedByToken = verifyBankNotifyToken(
    request.headers.get("authorization"),
  );
  const authedBySignature = verifyBankNotifySignature(
    rawBody,
    request.headers.get("x-bank-notify-signature"),
  );
  if (!authedByToken && !authedBySignature) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Body may be JSON (structured) or raw SMS text (text/plain). For raw text we
  // wrap it as { text } so MacroDroid never has to produce valid JSON itself.
  const contentType = request.headers.get("content-type") ?? "";
  const trimmed = rawBody.trim();
  const isJsonBody =
    contentType.includes("application/json") &&
    trimmed.startsWith("{") &&
    trimmed.endsWith("}");

  let json: unknown;
  if (isJsonBody) {
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
  } else {
    json = { text: rawBody };
  }

  const parsed = notifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const rawText = parsed.data.text ?? "";
  const fromText = rawText ? parseDepositNotification(rawText) : null;

  const amount = parsed.data.amount ?? fromText?.amount ?? null;
  const depositorName =
    parsed.data.depositorName ?? fromText?.depositorName ?? null;
  const bankName = parsed.data.bankName ?? fromText?.bankName ?? null;
  const source = parsed.data.source ?? "sms";
  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : null;

  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: "deposit amount not found" },
      { status: 422 },
    );
  }

  // Idempotency key: relay-provided id, else a stable hash of the content.
  const externalId =
    parsed.data.externalId?.trim() ||
    createHash("sha256")
      .update(`${rawText}|${amount}|${depositorName ?? ""}|${occurredAt?.toISOString() ?? ""}`)
      .digest("hex");

  // Record the inbound alert first (idempotent). If it already exists, return
  // its prior outcome without re-crediting.
  let notification;
  try {
    notification = await prisma.bankDepositNotification.create({
      data: {
        externalId,
        source,
        rawText: rawText || JSON.stringify(parsed.data),
        amount,
        depositorName,
        bankName,
        status: "UNMATCHED",
        occurredAt,
      },
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.bankDepositNotification.findUnique({
        where: { externalId },
        select: { status: true, matchedTopUpId: true },
      });
      return NextResponse.json({
        duplicate: true,
        status: existing?.status ?? "UNKNOWN",
        topUpId: existing?.matchedTopUpId ?? null,
      });
    }
    console.error("[bank-notify] record failed", err);
    return NextResponse.json({ error: "record failed" }, { status: 500 });
  }

  const config = getBankDepositConfig();
  const windowMinutes = config.matchWindowMinutes;

  try {
    const outcome = await matchBankDeposit(
      { amount, depositorName, occurredAt },
      windowMinutes,
    );

    if (outcome.status === "MATCHED") {
      const grant = await grantBankDepositTopUp(outcome.topUpId, {
        amount,
        depositorName,
        externalId,
      });

      if (grant.credited) {
        await prisma.bankDepositNotification.update({
          where: { id: notification.id },
          data: {
            status: "MATCHED",
            matchedTopUpId: outcome.topUpId,
            processedAt: new Date(),
          },
        });
        return NextResponse.json({
          status: "MATCHED",
          topUpId: outcome.topUpId,
          credited: true,
          balanceAfter: grant.balanceAfter,
        });
      }

      // Order was already credited by another deposit → genuine extra deposit.
      await prisma.bankDepositNotification.update({
        where: { id: notification.id },
        data: {
          status: "AMBIGUOUS",
          note: "매칭된 주문이 이미 처리됨 — 중복 입금 가능. 관리자 확인 필요.",
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ status: "AMBIGUOUS", topUpId: outcome.topUpId });
    }

    if (outcome.status === "AMBIGUOUS") {
      await prisma.bankDepositNotification.update({
        where: { id: notification.id },
        data: {
          status: "AMBIGUOUS",
          note: `동일 금액·입금자명 대기 주문 ${outcome.candidateIds.length}건 — 관리자 확인 필요.`,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({
        status: "AMBIGUOUS",
        candidates: outcome.candidateIds.length,
      });
    }

    // UNMATCHED — no pending order. Leave for admin review.
    await prisma.bankDepositNotification.update({
      where: { id: notification.id },
      data: { status: "UNMATCHED", processedAt: new Date() },
    });
    return NextResponse.json({ status: "UNMATCHED" });
  } catch (err) {
    console.error("[bank-notify] matching/grant failed", err);
    await prisma.bankDepositNotification
      .update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          note: err instanceof Error ? err.message : "unknown error",
          processedAt: new Date(),
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
