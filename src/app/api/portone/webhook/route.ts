import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Webhook } from "@portone/server-sdk";
import { prisma } from "@/lib/prisma";
import {
  completePortOneCreditTopUp,
  getPortOneWebhookSecrets,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";
import {
  completeSubscriptionPayment,
  PortOneSubscriptionError,
  syncDeletedBillingKey,
} from "@/lib/portone-subscriptions";

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
    webhook = await verifyPortOneWebhook(payload, headers);
  } catch (err) {
    console.error("[portone/webhook] verification failed", err);
    return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const webhookId = headers["webhook-id"];
  if (!webhookId) {
    return NextResponse.json({ error: "missing_webhook_id" }, { status: 400 });
  }

  const paymentId = extractPaymentId(webhook);
  const billingKey = extractBillingKey(webhook);
  const eventType = "type" in webhook ? String(webhook.type) : "Unrecognized";

  const event = await createOrLoadWebhookEvent({
    webhookId,
    paymentId,
    billingKey,
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

  if (Webhook.isUnrecognizedWebhook(webhook) || (!paymentId && !billingKey)) {
    await prisma.portOneWebhookEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  if (billingKey && eventType.startsWith("BillingKey.")) {
    try {
      const billingKeyId =
        eventType === "BillingKey.Deleted"
          ? await syncDeletedBillingKey(billingKey)
          : (
              await prisma.portOneBillingKey.findUnique({
                where: { billingKey },
                select: { id: true },
              })
            )?.id ?? null;

      await prisma.portOneWebhookEvent.update({
        where: { id: event.id },
        data: {
          billingKeyId,
          status: billingKeyId ? "PROCESSED" : "IGNORED",
          processedAt: new Date(),
        },
      });

      return NextResponse.json({
        received: true,
        billingKeyId,
        ignored: !billingKeyId,
      });
    } catch (err) {
      await prisma.portOneWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "unknown_error",
        },
      });
      console.error("[portone/webhook] billing key processing failed", {
        webhookId,
        billingKey,
        err,
      });
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
  }

  if (!paymentId) {
    await prisma.portOneWebhookEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const localTarget = await findLocalPaymentTarget(paymentId);
    if (!localTarget) {
      await prisma.portOneWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "IGNORED",
          errorMessage: "No matching local payment exists for this webhook.",
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    if (localTarget.type === "SUBSCRIPTION") {
      const subscriptionResult = await completeSubscriptionPayment({
        paymentId,
        source: "webhook",
      });

      await prisma.portOneWebhookEvent.update({
        where: { id: event.id },
        data: {
          subscriptionPaymentId: subscriptionResult.subscriptionPaymentId,
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return NextResponse.json({ received: true, result: subscriptionResult });
    }

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
    if (
      err instanceof PortOneSubscriptionError &&
      err.code === "PAYMENT_NOT_FOUND"
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

async function findLocalPaymentTarget(paymentId: string) {
  const [subscriptionPayment, topUp] = await Promise.all([
    prisma.subscriptionPayment.findUnique({
      where: { paymentId },
      select: { id: true },
    }),
    prisma.creditTopUp.findUnique({
      where: { paymentId },
      select: { id: true },
    }),
  ]);

  if (subscriptionPayment) {
    return { type: "SUBSCRIPTION" as const, id: subscriptionPayment.id };
  }
  if (topUp) {
    return { type: "TOP_UP" as const, id: topUp.id };
  }
  return null;
}

async function verifyPortOneWebhook(
  payload: string,
  headers: {
    "webhook-id": string | undefined;
    "webhook-timestamp": string | undefined;
    "webhook-signature": string | undefined;
  },
) {
  let lastError: unknown = null;

  for (const secret of getPortOneWebhookSecrets()) {
    try {
      return await Webhook.verify(secret, payload, headers);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("invalid_webhook_signature");
}

async function createOrLoadWebhookEvent(params: {
  webhookId: string;
  paymentId: string | null;
  billingKey: string | null;
  eventType: string;
  payload: Prisma.InputJsonValue;
  headers: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.portOneWebhookEvent.create({
      data: {
        webhookId: params.webhookId,
        paymentId: params.paymentId,
        billingKey: params.billingKey,
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
  if (
    "data" in webhook &&
    webhook.data &&
    "paymentId" in webhook.data &&
    typeof webhook.data.paymentId === "string"
  ) {
    return webhook.data.paymentId;
  }
  return null;
}

function extractBillingKey(webhook: Awaited<ReturnType<typeof Webhook.verify>>) {
  if (
    "data" in webhook &&
    webhook.data &&
    "billingKey" in webhook.data &&
    typeof webhook.data.billingKey === "string"
  ) {
    return webhook.data.billingKey;
  }
  return null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
