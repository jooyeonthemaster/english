import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PortOneClient } from "@portone/server-sdk";
import {
  type CancelledPayment,
  type FailedPayment,
  isUnrecognizedPayment,
  isUnrecognizedPaymentCancellation,
  type PaidPayment,
  type PartialCancelledPayment,
  type PayPendingPayment,
  type PaymentCancellation,
  type ReadyPayment,
  type VirtualAccountIssuedPayment,
} from "@portone/server-sdk/payment";
import { prisma } from "@/lib/prisma";

export const PORTONE_TOP_UP_PAY_METHODS = [
  "CARD",
  "EASY_PAY",
  "TRANSFER",
  "VIRTUAL_ACCOUNT",
  "MOBILE",
] as const;

export type PortOneTopUpPayMethod = (typeof PORTONE_TOP_UP_PAY_METHODS)[number];

const PORTONE_PG_PROVIDERS = ["kcp_v2", "inicis_v2"] as const;

export type PortOnePgProvider = (typeof PORTONE_PG_PROVIDERS)[number];

export type CompleteTopUpSource = "client" | "webhook" | "admin_retry";

export interface CompleteTopUpResult {
  topUpId: string;
  paymentId: string;
  status: string;
  credited: boolean;
  balanceAfter: number | null;
  transactionId: string | null;
}

export type PortOneRefundAccount = {
  bank: string;
  number: string;
  holderName: string;
  holderPhoneNumber?: string;
};

export interface CancelTopUpResult {
  topUpId: string;
  paymentId: string;
  cancellation: PaymentCancellation;
  synced: boolean;
  status: string;
  balanceAfter: number | null;
}

export interface CloseVirtualAccountTopUpResult {
  topUpId: string;
  paymentId: string;
  closedAt: string;
  status: string;
}

type LockedTopUp = {
  id: string;
  academyId: string;
  creditAmount: number;
  price: number;
  status: string;
  requestedBy: string | null;
  paymentId: string | null;
  creditTransactionId: string | null;
};

type RuntimeConfig = {
  secret: string;
  storeId: string;
  channelKey: string;
};

type RecognizedPortOnePayment =
  | PaidPayment
  | ReadyPayment
  | FailedPayment
  | CancelledPayment
  | PartialCancelledPayment
  | PayPendingPayment
  | VirtualAccountIssuedPayment;

export class PortOneTopUpError extends Error {
  constructor(
    public code:
      | "CONFIG_MISSING"
      | "TOP_UP_NOT_FOUND"
      | "FORBIDDEN"
      | "PAYMENT_UNRECOGNIZED"
      | "PAYMENT_MISMATCH"
      | "PAYMENT_NOT_PAID"
      | "PAYMENT_NOT_CANCELLABLE"
      | "INSUFFICIENT_CREDITS_FOR_REFUND"
      | "ALREADY_FINALIZED",
    message: string,
  ) {
    super(message);
    this.name = "PortOneTopUpError";
  }
}

export function isPortOneTopUpPayMethod(
  value: unknown,
): value is PortOneTopUpPayMethod {
  return (
    typeof value === "string" &&
    (PORTONE_TOP_UP_PAY_METHODS as readonly string[]).includes(value)
  );
}

export function getAllowedPortOneTopUpPayMethods(): PortOneTopUpPayMethod[] {
  const raw =
    process.env.PORTONE_TOP_UP_PAY_METHODS ??
    process.env.NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS;
  if (!raw) return ["CARD"];

  const methods = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(isPortOneTopUpPayMethod);

  return methods.length ? Array.from(new Set(methods)) : ["CARD"];
}

export function getPortOnePgProvider(): PortOnePgProvider {
  const raw =
    process.env.PORTONE_PG_PROVIDER ??
    process.env.NEXT_PUBLIC_PORTONE_PG_PROVIDER ??
    "kcp_v2";
  const normalized = raw.trim().toLowerCase().replaceAll("-", "_");
  if ((PORTONE_PG_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as PortOnePgProvider;
  }
  return "kcp_v2";
}

export function buildPortOnePaymentId() {
  return `sm_${randomUUID().replaceAll("-", "").slice(0, 26)}`;
}

export function buildTopUpOrderName(credits: number) {
  return `SMOAT 크레딧 ${credits.toLocaleString("ko-KR")}개`;
}

export function getPortOneRuntimeConfig(): RuntimeConfig {
  const secret = process.env.PORTONE_API_SECRET;
  const storeId =
    process.env.PORTONE_STORE_ID ?? process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey =
    process.env.PORTONE_CHANNEL_KEY ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

  if (!secret || !storeId || !channelKey) {
    throw new PortOneTopUpError(
      "CONFIG_MISSING",
      "PortOne API secret, store id, and channel key must be configured.",
    );
  }
  if (!storeId.startsWith("store-")) {
    throw new PortOneTopUpError(
      "CONFIG_MISSING",
      "PortOne Store ID must be copied from the V2 Store ID field, not the V1 customer code or PG site code.",
    );
  }
  if (!channelKey.startsWith("channel-key-")) {
    throw new PortOneTopUpError(
      "CONFIG_MISSING",
      "PortOne Channel Key must start with channel-key-.",
    );
  }

  return { secret, storeId, channelKey };
}

export function getPortOneWebhookSecret() {
  return getPortOneWebhookSecrets()[0];
}

export function getPortOneWebhookSecrets() {
  const secrets = Array.from(new Set([
    ...(process.env.PORTONE_WEBHOOK_SECRET?.split(",") ?? []),
    process.env.PORTONE_WEBHOOK_SECRET1,
    process.env.PORTONE_WEBHOOK_SECRET2,
  ]
    .map(normalizeSecretEnvValue)
    .filter((value): value is string => Boolean(value))));

  if (!secrets?.length) {
    throw new PortOneTopUpError(
      "CONFIG_MISSING",
      "PortOne webhook secret must be configured.",
    );
  }
  return secrets;
}

function normalizeSecretEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getPortOneClient() {
  const { secret, storeId } = getPortOneRuntimeConfig();
  return PortOneClient({ secret, storeId });
}

export async function preRegisterPortOnePayment(params: {
  paymentId: string;
  totalAmount: number;
}) {
  const { storeId } = getPortOneRuntimeConfig();
  await getPortOneClient().payment.preRegisterPayment({
    paymentId: params.paymentId,
    storeId,
    totalAmount: params.totalAmount,
    currency: "KRW",
  });
}

export async function fetchPortOnePayment(paymentId: string) {
  const { storeId } = getPortOneRuntimeConfig();
  const payment = await getPortOneClient().payment.getPayment({
    paymentId,
    storeId,
  });
  if (isUnrecognizedPayment(payment)) {
    throw new PortOneTopUpError(
      "PAYMENT_UNRECOGNIZED",
      "PortOne returned an unsupported payment status.",
    );
  }
  return payment;
}

export async function completePortOneCreditTopUp(params: {
  paymentId: string;
  source: CompleteTopUpSource;
  expectedAcademyId?: string;
  adminId?: string;
}) {
  const payment = await fetchPortOnePayment(params.paymentId);
  return syncPortOnePaymentToTopUp(payment, params);
}

export async function syncPortOnePaymentToTopUp(
  payment: RecognizedPortOnePayment,
  params: {
    source: CompleteTopUpSource;
    expectedAcademyId?: string;
    adminId?: string;
  },
): Promise<CompleteTopUpResult> {
  const { storeId } = getPortOneRuntimeConfig();
  const topUp = await prisma.creditTopUp.findUnique({
    where: { paymentId: payment.id },
    select: {
      id: true,
      academyId: true,
      status: true,
      price: true,
      creditAmount: true,
      creditTransactionId: true,
    },
  });

  if (!topUp) {
    throw new PortOneTopUpError(
      "TOP_UP_NOT_FOUND",
      "No credit top-up order exists for this payment.",
    );
  }
  if (params.expectedAcademyId && topUp.academyId !== params.expectedAcademyId) {
    throw new PortOneTopUpError(
      "FORBIDDEN",
      "This payment belongs to another academy.",
    );
  }

  assertPaymentMatchesTopUp(topUp, payment, storeId);

  if (
    payment.status === "CANCELLED" ||
    payment.status === "PARTIAL_CANCELLED"
  ) {
    return updateCancelledTopUp(topUp, payment, params);
  }

  if (payment.status !== "PAID") {
    const updated = await updateNonPaidTopUp(topUp, payment);
    return {
      topUpId: updated.id,
      paymentId: payment.id,
      status: updated.status,
      credited: false,
      balanceAfter: null,
      transactionId: updated.creditTransactionId,
    };
  }

  return completePaidTopUp(payment, params.source);
}

export async function cancelPortOneCreditTopUp(params: {
  topUpId: string;
  reason: string;
  adminId: string;
  refundAccount?: PortOneRefundAccount;
}): Promise<CancelTopUpResult> {
  const reason = params.reason.trim();
  if (!reason) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "Cancellation reason is required.",
    );
  }

  const topUp = await prisma.creditTopUp.findUnique({
    where: { id: params.topUpId },
    select: {
      id: true,
      academyId: true,
      creditAmount: true,
      price: true,
      status: true,
      paymentId: true,
      paymentMethod: true,
      customData: true,
    },
  });
  if (!topUp) {
    throw new PortOneTopUpError(
      "TOP_UP_NOT_FOUND",
      "No credit top-up order exists for this payment.",
    );
  }
  if (!topUp.paymentId) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "This top-up does not have a PortOne payment id.",
    );
  }
  if (topUp.status === "REFUNDED" || topUp.status === "CANCELLED") {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "This top-up has already been cancelled or refunded.",
    );
  }
  if (topUp.status !== "COMPLETED") {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "Only completed top-ups can be refunded.",
    );
  }

  const balance = await prisma.creditBalance.findUnique({
    where: { academyId: topUp.academyId },
    select: { balance: true },
  });
  if (!balance || balance.balance < topUp.creditAmount) {
    throw new PortOneTopUpError(
      "INSUFFICIENT_CREDITS_FOR_REFUND",
      "The academy has already used part of these credits. Review the account before refunding.",
    );
  }

  const payment = await fetchPortOnePayment(topUp.paymentId);
  const { storeId } = getPortOneRuntimeConfig();
  assertPaymentMatchesTopUp(topUp, payment, storeId);
  if (payment.status === "CANCELLED" || payment.status === "PARTIAL_CANCELLED") {
    const result = await syncPortOnePaymentToTopUp(payment, {
      source: "admin_retry",
      adminId: params.adminId,
    });
    return {
      topUpId: topUp.id,
      paymentId: topUp.paymentId,
      cancellation: getLatestPaymentCancellation(payment),
      synced: true,
      status: result.status,
      balanceAfter: result.balanceAfter,
    };
  }
  if (payment.status !== "PAID") {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `Payment is not paid. Current PortOne status: ${payment.status}`,
    );
  }

  const currentCancellableAmount = getCancellableAmount(payment);
  if (currentCancellableAmount < topUp.price) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "The PortOne payment does not have enough cancellable amount left.",
    );
  }

  const response = await getPortOneClient().payment.cancelPayment({
    paymentId: topUp.paymentId,
    storeId,
    reason,
    requester: "ADMIN",
    currentCancellableAmount,
    ...(params.refundAccount ? { refundAccount: params.refundAccount } : {}),
  });

  if (isUnrecognizedPaymentCancellation(response.cancellation)) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `Unrecognized cancellation status: ${String(response.cancellation.status)}`,
    );
  }

  if (response.cancellation.status !== "SUCCEEDED") {
    await prisma.creditTopUp.update({
      where: { id: topUp.id },
      data: {
        failureMessage:
          response.cancellation.status === "REQUESTED"
            ? "포트원 결제 취소 요청이 접수되었습니다. 취소 완료 웹훅 수신 후 상태가 동기화됩니다."
            : "포트원 결제 취소가 실패했습니다.",
        verifiedAt: new Date(),
      },
    });
    return {
      topUpId: topUp.id,
      paymentId: topUp.paymentId,
      cancellation: response.cancellation,
      synced: false,
      status: topUp.status,
      balanceAfter: balance.balance,
    };
  }

  const cancelledPayment = await fetchPortOnePayment(topUp.paymentId);
  const result = await syncPortOnePaymentToTopUp(cancelledPayment, {
    source: "admin_retry",
    adminId: params.adminId,
  });

  return {
    topUpId: topUp.id,
    paymentId: topUp.paymentId,
    cancellation: response.cancellation,
    synced: true,
    status: result.status,
    balanceAfter: result.balanceAfter,
  };
}

export async function closePortOneVirtualAccountTopUp(params: {
  topUpId: string;
  adminId: string;
}): Promise<CloseVirtualAccountTopUpResult> {
  const topUp = await prisma.creditTopUp.findUnique({
    where: { id: params.topUpId },
    select: {
      id: true,
      academyId: true,
      creditAmount: true,
      price: true,
      status: true,
      paymentId: true,
      paymentMethod: true,
      customData: true,
    },
  });
  if (!topUp) {
    throw new PortOneTopUpError(
      "TOP_UP_NOT_FOUND",
      "No credit top-up order exists for this payment.",
    );
  }
  if (!topUp.paymentId) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "This top-up does not have a PortOne payment id.",
    );
  }
  if (
    topUp.status !== "WAITING_FOR_DEPOSIT" ||
    topUp.paymentMethod !== "VIRTUAL_ACCOUNT"
  ) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "Only issued virtual account top-ups can be closed.",
    );
  }

  const payment = await fetchPortOnePayment(topUp.paymentId);
  const { storeId } = getPortOneRuntimeConfig();
  assertPaymentMatchesTopUp(topUp, payment, storeId);
  if (payment.status !== "VIRTUAL_ACCOUNT_ISSUED") {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `Payment is not waiting for deposit. Current PortOne status: ${payment.status}`,
    );
  }

  const response = await getPortOneClient().payment.closeVirtualAccount({
    paymentId: topUp.paymentId,
    storeId,
  });

  await prisma.creditTopUp.update({
    where: { id: topUp.id },
    data: {
      status: "CANCELLED",
      portoneStatus: "VIRTUAL_ACCOUNT_CLOSED",
      failureMessage: "관리자가 입금 전 가상계좌를 말소했습니다.",
      verifiedAt: new Date(),
      cancelledAt: toDate(response.closedAt),
      customData: mergeJsonObject(topUp.customData, {
        closedByAdminId: params.adminId,
        closedAt: response.closedAt,
      }),
    },
  });

  return {
    topUpId: topUp.id,
    paymentId: topUp.paymentId,
    closedAt: response.closedAt,
    status: "CANCELLED",
  };
}

async function completePaidTopUp(
  payment: PaidPayment,
  source: CompleteTopUpSource,
): Promise<CompleteTopUpResult> {
  const { storeId } = getPortOneRuntimeConfig();
  const paymentPayload = toJsonValue(payment);
  const customData = parsePaymentCustomData(payment.customData);
  const paidAt = toDate(payment.paidAt);
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedTopUp[]>`
        SELECT id, "academyId", "creditAmount", price, status, "requestedBy", "paymentId", "creditTransactionId"
        FROM credit_top_ups
        WHERE "paymentId" = ${payment.id}
        FOR UPDATE
      `;
      const topUp = rows[0];
      if (!topUp) {
        throw new PortOneTopUpError(
          "TOP_UP_NOT_FOUND",
          "No credit top-up order exists for this payment.",
        );
      }

      assertPaymentMatchesTopUp(topUp, payment, storeId);

      if (topUp.status === "COMPLETED" && topUp.creditTransactionId) {
        const balance = await tx.creditBalance.findUnique({
          where: { academyId: topUp.academyId },
          select: { balance: true },
        });
        return {
          topUpId: topUp.id,
          paymentId: payment.id,
          status: topUp.status,
          credited: false,
          balanceAfter: balance?.balance ?? null,
          transactionId: topUp.creditTransactionId,
        };
      }

      const activeSub = await tx.academySubscription.findFirst({
        where: {
          academyId: topUp.academyId,
          status: { in: ["ACTIVE", "TRIAL"] },
        },
        include: { plan: { select: { monthlyCredits: true } } },
        orderBy: { createdAt: "desc" },
      });
      const monthlyAllocation = activeSub?.plan.monthlyCredits ?? 0;

      const balances = await tx.$queryRaw<Array<{ balance: number }>>`
        INSERT INTO credit_balances (
          id,
          "academyId",
          balance,
          "monthlyAllocation",
          "bonusCredits",
          "totalAllocated",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${topUp.academyId},
          ${topUp.creditAmount},
          ${monthlyAllocation},
          ${topUp.creditAmount},
          ${topUp.creditAmount},
          NOW()
        )
        ON CONFLICT ("academyId") DO UPDATE
          SET balance = credit_balances.balance + EXCLUDED.balance,
              "bonusCredits" = credit_balances."bonusCredits" + EXCLUDED."bonusCredits",
              "totalAllocated" = credit_balances."totalAllocated" + EXCLUDED."totalAllocated",
              "updatedAt" = NOW()
        RETURNING balance
      `;
      const balanceAfter = balances[0]?.balance;
      if (typeof balanceAfter !== "number") {
        throw new Error("credit_balance_upsert_failed");
      }

      const transaction = await tx.creditTransaction.create({
        data: {
          academyId: topUp.academyId,
          type: "TOP_UP",
          amount: topUp.creditAmount,
          balanceAfter,
          description: buildTopUpDescription(topUp.creditAmount, topUp.price),
          referenceId: topUp.id,
          referenceType: "CREDIT_TOP_UP",
          staffId: topUp.requestedBy,
          metadata: JSON.stringify({
            source,
            portonePaymentId: payment.id,
            portoneTransactionId: payment.transactionId,
            storeId: payment.storeId,
            paidAmount: payment.amount.paid,
            totalAmount: payment.amount.total,
          }),
        },
      });

      await tx.creditTopUp.update({
        where: { id: topUp.id },
        data: {
          status: "COMPLETED",
          paymentMethod: normalizePaymentMethod(payment),
          paymentReference: payment.transactionId,
          portoneStatus: payment.status,
          portoneTransactionId: payment.transactionId,
          paidAmount: payment.amount.paid,
          receiptUrl: payment.receiptUrl,
          paymentPayload,
          customData,
          verifiedAt: now,
          paidAt,
          completedAt: now,
          creditTransactionId: transaction.id,
        },
      });

      return {
        topUpId: topUp.id,
        paymentId: payment.id,
        status: "COMPLETED",
        credited: true,
        balanceAfter,
        transactionId: transaction.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}

async function updateCancelledTopUp(
  topUp: {
    id: string;
    academyId: string;
    creditAmount: number;
    price: number;
    status: string;
    paymentId?: string | null;
    creditTransactionId: string | null;
  },
  payment: CancelledPayment | PartialCancelledPayment,
  params: {
    source: CompleteTopUpSource;
    expectedAcademyId?: string;
    adminId?: string;
  },
): Promise<CompleteTopUpResult> {
  const { storeId } = getPortOneRuntimeConfig();
  const paymentPayload = toJsonValue(payment);
  const customData = parsePaymentCustomData(payment.customData);
  const cancelledAt = toDate(payment.cancelledAt);
  const cancelledAmount = payment.amount.cancelled;
  const isFullCancellation =
    payment.status === "CANCELLED" || cancelledAmount >= topUp.price;

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedTopUp[]>`
        SELECT id, "academyId", "creditAmount", price, status, "requestedBy", "paymentId", "creditTransactionId"
        FROM credit_top_ups
        WHERE "paymentId" = ${payment.id}
        FOR UPDATE
      `;
      const locked = rows[0];
      if (!locked) {
        throw new PortOneTopUpError(
          "TOP_UP_NOT_FOUND",
          "No credit top-up order exists for this payment.",
        );
      }

      assertPaymentMatchesTopUp(locked, payment, storeId);

      const existingRefund = await tx.creditTransaction.findFirst({
        where: {
          academyId: locked.academyId,
          type: "REFUND",
          referenceId: locked.id,
          referenceType: "CREDIT_TOP_UP_REFUND",
        },
        orderBy: { createdAt: "desc" },
      });

      let balanceAfter: number | null = existingRefund?.balanceAfter ?? null;
      let transactionId: string | null = existingRefund?.id ?? null;

      if (
        isFullCancellation &&
        locked.status === "COMPLETED" &&
        locked.creditTransactionId &&
        !existingRefund
      ) {
        const balances = await tx.$queryRaw<Array<{ balance: number }>>`
          UPDATE credit_balances
          SET balance = balance - ${locked.creditAmount},
              "bonusCredits" = GREATEST("bonusCredits" - ${locked.creditAmount}, 0),
              "totalAllocated" = GREATEST("totalAllocated" - ${locked.creditAmount}, 0),
              "updatedAt" = NOW()
          WHERE "academyId" = ${locked.academyId}
          RETURNING balance
        `;
        balanceAfter = balances[0]?.balance ?? null;
        if (typeof balanceAfter !== "number") {
          throw new Error("credit_balance_refund_update_failed");
        }

        const transaction = await tx.creditTransaction.create({
          data: {
            academyId: locked.academyId,
            type: "REFUND",
            amount: -locked.creditAmount,
            balanceAfter,
            description: buildTopUpRefundDescription(
              locked.creditAmount,
              cancelledAmount,
            ),
            referenceId: locked.id,
            referenceType: "CREDIT_TOP_UP_REFUND",
            adminId: params.adminId,
            metadata: JSON.stringify({
              source: params.source,
              portonePaymentId: payment.id,
              portoneTransactionId: payment.transactionId,
              cancelledAmount,
              cancellations: payment.cancellations,
            }),
          },
        });
        transactionId = transaction.id;
      }

      if (balanceAfter === null) {
        const balance = await tx.creditBalance.findUnique({
          where: { academyId: locked.academyId },
          select: { balance: true },
        });
        balanceAfter = balance?.balance ?? null;
      }

      const nextStatus = isFullCancellation
        ? locked.status === "COMPLETED" || locked.status === "REFUNDED"
          ? "REFUNDED"
          : "CANCELLED"
        : locked.status;

      await tx.creditTopUp.update({
        where: { id: locked.id },
        data: {
          status: nextStatus,
          paymentMethod: normalizePaymentMethod(payment),
          paymentReference: payment.transactionId,
          portoneStatus: payment.status,
          portoneTransactionId: payment.transactionId,
          paidAmount: payment.amount.paid,
          receiptUrl: payment.receiptUrl,
          failureMessage: isFullCancellation
            ? null
            : "부분 취소가 감지되었습니다. 크레딧 회수는 관리자 확인이 필요합니다.",
          paymentPayload,
          customData,
          verifiedAt: new Date(),
          cancelledAt,
        },
      });

      return {
        topUpId: locked.id,
        paymentId: payment.id,
        status: nextStatus,
        credited: false,
        balanceAfter,
        transactionId,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}

async function updateNonPaidTopUp(
  topUp: {
    id: string;
    status: string;
    creditTransactionId: string | null;
  },
  payment: RecognizedPortOnePayment,
) {
  const nextStatus = mapPortOneStatusToTopUpStatus(payment.status, topUp.status);
  const failed = payment.status === "FAILED" ? payment : null;
  const cancelledAt =
    payment.status === "CANCELLED" || payment.status === "PARTIAL_CANCELLED"
      ? toDate("cancelledAt" in payment ? payment.cancelledAt : undefined)
      : undefined;

  return prisma.creditTopUp.update({
    where: { id: topUp.id },
    data: {
      status: nextStatus,
      paymentMethod: normalizePaymentMethod(payment),
      paymentReference: "transactionId" in payment ? payment.transactionId : undefined,
      portoneStatus: payment.status,
      portoneTransactionId:
        "transactionId" in payment ? payment.transactionId : undefined,
      paidAmount: "amount" in payment ? payment.amount.paid : undefined,
      receiptUrl: "receiptUrl" in payment ? payment.receiptUrl : undefined,
      failureCode: failed?.failure?.pgCode ?? failed?.failure?.reason,
      failureMessage: failed?.failure?.pgMessage ?? failed?.failure?.reason,
      paymentPayload: toJsonValue(payment),
      customData: "customData" in payment ? parsePaymentCustomData(payment.customData) : undefined,
      verifiedAt: new Date(),
      cancelledAt,
    },
    select: {
      id: true,
      status: true,
      creditTransactionId: true,
    },
  });
}

function assertPaymentMatchesTopUp(
  topUp: {
    id: string;
    academyId: string;
    price: number;
    creditAmount: number;
    paymentId?: string | null;
  },
  payment: RecognizedPortOnePayment,
  storeId: string,
) {
  if (payment.storeId !== storeId) {
    throw new PortOneTopUpError(
      "PAYMENT_MISMATCH",
      "PortOne store id does not match configured store id.",
    );
  }
  if (topUp.paymentId && payment.id !== topUp.paymentId) {
    throw new PortOneTopUpError(
      "PAYMENT_MISMATCH",
      "PortOne payment id does not match the top-up order.",
    );
  }
  if (payment.currency !== "KRW") {
    throw new PortOneTopUpError(
      "PAYMENT_MISMATCH",
      "Only KRW credit top-up payments are accepted.",
    );
  }
  if (payment.amount.total !== topUp.price) {
    throw new PortOneTopUpError(
      "PAYMENT_MISMATCH",
      "PortOne payment amount does not match the top-up order.",
    );
  }
  if (payment.status === "PAID" && payment.amount.paid !== topUp.price) {
    throw new PortOneTopUpError(
      "PAYMENT_MISMATCH",
      "Paid amount does not match the top-up order.",
    );
  }

  const customData = parsePaymentCustomData(
    "customData" in payment ? payment.customData : undefined,
  );
  if (
    customData &&
    typeof customData === "object" &&
    !Array.isArray(customData)
  ) {
    const data = customData as Record<string, unknown>;
    if (data.topUpId && data.topUpId !== topUp.id) {
      throw new PortOneTopUpError(
        "PAYMENT_MISMATCH",
        "Payment custom data points to a different top-up order.",
      );
    }
    if (data.academyId && data.academyId !== topUp.academyId) {
      throw new PortOneTopUpError(
        "PAYMENT_MISMATCH",
        "Payment custom data points to a different academy.",
      );
    }
    if (data.credits && Number(data.credits) !== topUp.creditAmount) {
      throw new PortOneTopUpError(
        "PAYMENT_MISMATCH",
        "Payment custom data has a different credit amount.",
      );
    }
  }
}

function mapPortOneStatusToTopUpStatus(
  portoneStatus: string,
  currentStatus: string,
) {
  if (portoneStatus === "VIRTUAL_ACCOUNT_ISSUED") return "WAITING_FOR_DEPOSIT";
  if (portoneStatus === "FAILED") return "FAILED";
  if (portoneStatus === "CANCELLED" || portoneStatus === "PARTIAL_CANCELLED") {
    return currentStatus === "COMPLETED" ? "REFUNDED" : "CANCELLED";
  }
  return currentStatus === "COMPLETED" ? currentStatus : "PENDING";
}

function getCancellableAmount(payment: RecognizedPortOnePayment) {
  if (!("amount" in payment)) return 0;
  return Math.max(payment.amount.paid - payment.amount.cancelled, 0);
}

function getLatestPaymentCancellation(
  payment: CancelledPayment | PartialCancelledPayment,
): PaymentCancellation {
  const latest = payment.cancellations.at(-1);
  return (
    latest ?? {
      status: "SUCCEEDED",
      id: "already-cancelled",
      totalAmount: payment.amount.cancelled,
      taxFreeAmount: payment.amount.cancelledTaxFree,
      vatAmount: 0,
      reason: "이미 취소된 결제입니다.",
      requestedAt: payment.cancelledAt,
      cancelledAt: payment.cancelledAt,
    }
  );
}

function normalizePaymentMethod(
  payment: RecognizedPortOnePayment,
) {
  const methodType =
    typeof payment.method?.type === "string" ? payment.method.type : undefined;
  const map: Record<string, string> = {
    PaymentMethodCard: "CARD",
    PaymentMethodEasyPay: "EASY_PAY",
    PaymentMethodTransfer: "TRANSFER",
    PaymentMethodVirtualAccount: "VIRTUAL_ACCOUNT",
    PaymentMethodMobile: "MOBILE",
    PaymentMethodGiftCertificate: "GIFT_CERTIFICATE",
    PaymentMethodConvenienceStore: "CONVENIENCE_STORE",
  };
  return methodType ? map[methodType] ?? methodType : null;
}

function parsePaymentCustomData(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return { raw: value };
    }
  }
  return toJsonValue(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mergeJsonObject(
  value: Prisma.JsonValue | null,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return { ...value, ...patch } as Prisma.InputJsonValue;
  }
  return patch as Prisma.InputJsonValue;
}

function toDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildTopUpDescription(credits: number, price: number) {
  return `포트원 결제 크레딧 충전: ${credits.toLocaleString("ko-KR")}C / ${price.toLocaleString("ko-KR")}원`;
}

function buildTopUpRefundDescription(credits: number, cancelledAmount: number) {
  return `포트원 결제 환불 크레딧 회수: -${credits.toLocaleString("ko-KR")}C / ${cancelledAmount.toLocaleString("ko-KR")}원`;
}
