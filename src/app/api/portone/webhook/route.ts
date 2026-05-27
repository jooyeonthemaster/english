import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Webhook } from "@portone/server-sdk";
import { prisma } from "@/lib/prisma";
import {
  completePortOneCreditTopUp,
  getPortOneWebhookSecret,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "smoat-portone-webhook",
    version: "v2",
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? undefined,
    "webhook-timestamp":
      request.headers.get("webhook-timestamp") ?? undefined,
    "webhook-signature":
      request.headers.get("webhook-signature") ?? undefined,
  };

  let webhook: Awaited<ReturnType<typeof Webhook.verify>>;
  try {
    webhook = await Webhook.verify(
      getPortOneWebhookSecret(),
      payload,
      headers,
    );
  } catch (err) {
    console.error("[portone/webhook] verification failed", err);
    return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const webhookId = headers["webhook-id"];
  if (!webhookId) {
    return NextResponse.json({ error: "missing_webhook_id" }, { status: 400 });
  }

  const paymentId = extractPaymentId(webhook);
  const eventType = "type" in webhook ? String(webhook.type) : "Unrecognized";

  const event = await createOrLoadWebhookEvent({
    webhookId,
    paymentId,
    eventType,
    payload: toJsonValue(webhook),
    headers: {
      webhookId,
      webhookTimestamp: headers["webhook-timestamp"] ?? null,
      userAgent: request.headers.get("user-agent"),
    },
  });

  if (event.status === "PROCESSED" || event.status === "IGNORED") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (Webhook.isUnrecognizedWebhook(webhook) || !paymentId) {
    await prisma.portOneWebhookEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const result = await completePortOneCreditTopUp({
      paymentId,
      source: "webhook",
    });

    await prisma.portOneWebhookEvent.update({
      where: { id: event.id },
      data: {
        topUpId: result.topUpId,
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ received: true, result });
  } catch (err) {
    if (
      err instanceof PortOneTopUpError &&
      err.code === "TOP_UP_NOT_FOUND"
    ) {
      await prisma.portOneWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "IGNORED",
          errorMessage: err.message,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    await prisma.portOneWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "unknown_error",
      },
    });
    console.error("[portone/webhook] processing failed", {
      webhookId,
      paymentId,
      err,
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

async function createOrLoadWebhookEvent(params: {
  webhookId: string;
  paymentId: string | null;
  eventType: string;
  payload: Prisma.InputJsonValue;
  headers: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.portOneWebhookEvent.create({
      data: {
        webhookId: params.webhookId,
        paymentId: params.paymentId,
        eventType: params.eventType,
        payload: params.payload,
        headers: params.headers,
      },
      select: { id: true, status: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.portOneWebhookEvent.findUnique({
        where: { webhookId: params.webhookId },
        select: { id: true, status: true },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

function extractPaymentId(webhook: Awaited<ReturnType<typeof Webhook.verify>>) {
  if ("data" in webhook && webhook.data && "paymentId" in webhook.data) {
    return webhook.data.paymentId;
  }
  return null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
