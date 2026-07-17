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
import {
  expiresAtConflictSql,
  expiresAtInsertSql,
} from "@/lib/credit-expiry";
import {
  markCouponUsedTx,
  rollbackCouponByTopUpTx,
} from "@/lib/printable-coupon-discount";

export const PORTONE_TOP_UP_PAY_METHODS = [
  "CARD",
  "EASY_PAY",
  "TRANSFER",
  "VIRTUAL_ACCOUNT",
  "MOBILE",
] as const;

export type PortOneTopUpPayMethod = (typeof PORTONE_TOP_UP_PAY_METHODS)[number];

const PORTONE_PG_PROVIDERS = ["danal_tpay", "inicis_v2", "kcp_v2"] as const;

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

type PortOneV1RestCredentials = {
  key: string;
  secret: string;
};

type CancellationRequestResult = {
  cancellation: PaymentCancellation;
  cancelledPayment: CancelledPayment | PartialCancelledPayment | null;
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
    "danal_tpay";
  const normalized = raw.trim().toLowerCase().replaceAll("-", "_");
  if ((PORTONE_PG_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as PortOnePgProvider;
  }
  return "danal_tpay";
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
  if (
    currentCancellableAmount !== null &&
    currentCancellableAmount < topUp.price
  ) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "The PortOne payment does not have enough cancellable amount left.",
    );
  }

  const cancellationResult = await cancelPortOnePaymentAndFetchLatest({
    topUp: {
      id: topUp.id,
      paymentId: topUp.paymentId,
      paymentMethod: topUp.paymentMethod,
      price: topUp.price,
    },
    payment,
    storeId,
    reason,
    refundAccount: params.refundAccount,
  });

  const cancellation = cancellationResult.cancellation;
  if (isUnrecognizedPaymentCancellation(cancellation)) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `Unrecognized cancellation status: ${String(cancellation.status)}`,
    );
  }

  if (cancellation.status !== "SUCCEEDED") {
    await prisma.creditTopUp.update({
      where: { id: topUp.id },
      data: {
        failureMessage:
          cancellation.status === "REQUESTED"
            ? "포트원 결제 취소 요청이 접수되었습니다. 취소 완료 웹훅 수신 후 상태가 동기화됩니다."
            : "포트원 결제 취소가 실패했습니다.",
        verifiedAt: new Date(),
      },
    });
    return {
      topUpId: topUp.id,
      paymentId: topUp.paymentId,
      cancellation,
      synced: false,
      status: topUp.status,
      balanceAfter: balance.balance,
    };
  }

  if (!cancellationResult.cancelledPayment) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      "포트원 취소 요청은 성공했지만 최신 결제 상태가 아직 취소로 반영되지 않았습니다. 잠시 후 재조회해 주세요.",
    );
  }

  const result = await syncPortOnePaymentToTopUp(cancellationResult.cancelledPayment, {
    source: "admin_retry",
    adminId: params.adminId,
  });

  return {
    topUpId: topUp.id,
    paymentId: topUp.paymentId,
    cancellation,
    synced: true,
    status: result.status,
    balanceAfter: result.balanceAfter,
  };
}

async function cancelPortOnePaymentAndFetchLatest(params: {
  topUp: {
    id: string;
    paymentId: string;
    paymentMethod: string | null;
    price: number;
  };
  payment: PaidPayment;
  storeId: string;
  reason: string;
  refundAccount?: PortOneRefundAccount;
}): Promise<CancellationRequestResult> {
  try {
    const response = await getPortOneClient().payment.cancelPayment({
      paymentId: params.topUp.paymentId,
      storeId: params.storeId,
      reason: params.reason,
      requester: "ADMIN",
      ...(params.refundAccount ? { refundAccount: params.refundAccount } : {}),
    });

    if (isUnrecognizedPaymentCancellation(response.cancellation)) {
      throw new PortOneTopUpError(
        "PAYMENT_NOT_CANCELLABLE",
        `Unrecognized cancellation status: ${String(response.cancellation.status)}`,
      );
    }

    if (response.cancellation.status !== "SUCCEEDED") {
      return {
        cancellation: response.cancellation,
        cancelledPayment: null,
      };
    }

    const latestPayment = await fetchPortOnePayment(params.topUp.paymentId);
    return {
      cancellation:
        latestPayment.status === "CANCELLED" ||
        latestPayment.status === "PARTIAL_CANCELLED"
          ? getLatestPaymentCancellation(latestPayment)
          : response.cancellation,
      cancelledPayment: toCancelledPayment(latestPayment),
    };
  } catch (err) {
    if (err instanceof PortOneTopUpError) {
      throw err;
    }

    if (isPortOneV1DanalCardPayment(params.topUp, params.payment)) {
      await cancelPortOneV1Payment({
        payment: params.payment,
        topUp: params.topUp,
        reason: params.reason,
        originalError: err,
      });
      const latestPayment = await fetchPortOnePayment(params.topUp.paymentId);
      const cancelledPayment = toCancelledPayment(latestPayment);
      if (!cancelledPayment) {
        throw new PortOneTopUpError(
          "PAYMENT_NOT_CANCELLABLE",
          "포트원 V1 취소 요청은 성공했지만 최신 결제 상태가 아직 취소로 반영되지 않았습니다. 잠시 후 재조회해 주세요.",
        );
      }
      return {
        cancellation: getLatestPaymentCancellation(cancelledPayment),
        cancelledPayment,
      };
    }

    throw toPortOneCancelTopUpError(err);
  }
}

function toCancelledPayment(
  payment: RecognizedPortOnePayment,
): CancelledPayment | PartialCancelledPayment | null {
  if (payment.status === "CANCELLED" || payment.status === "PARTIAL_CANCELLED") {
    return payment;
  }
  return null;
}

function isPortOneV1DanalCardPayment(
  topUp: {
    paymentMethod: string | null;
  },
  payment: PaidPayment,
) {
  return (
    getPortOnePgProvider() === "danal_tpay" &&
    topUp.paymentMethod === "CARD" &&
    typeof payment.transactionId === "string" &&
    payment.transactionId.startsWith("imp_")
  );
}

async function cancelPortOneV1Payment(params: {
  payment: PaidPayment;
  topUp: {
    paymentId: string;
    price: number;
  };
  reason: string;
  originalError: unknown;
}) {
  const credentials = getPortOneV1RestCredentials();
  if (!credentials) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `포트원 V2 취소 요청이 실패했고, 다날 V1 결제 취소 fallback에 필요한 V1 REST API 키가 설정되어 있지 않습니다. PORTONE_V1_REST_API_KEY와 PORTONE_V1_REST_API_SECRET을 설정해 주세요. 원인: ${getPortOneErrorMessage(params.originalError)}`,
    );
  }

  const accessToken = await getPortOneV1AccessToken(credentials);
  const response = await fetch("https://api.iamport.kr/payments/cancel", {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imp_uid: params.payment.transactionId,
      merchant_uid: params.topUp.paymentId,
      amount: params.topUp.price,
      checksum: params.topUp.price,
      reason: params.reason,
    }),
  });
  const data = await parsePortOneV1Json(response);
  const code = getPortOneV1Code(data);

  if (!response.ok || code !== 0) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `포트원 V1 취소 요청이 실패했습니다: ${getPortOneV1Message(data)}`,
    );
  }
}

async function getPortOneV1AccessToken(credentials: PortOneV1RestCredentials) {
  const response = await fetch("https://api.iamport.kr/users/getToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imp_key: credentials.key,
      imp_secret: credentials.secret,
    }),
  });
  const data = await parsePortOneV1Json(response);
  const token =
    data &&
    typeof data === "object" &&
    "response" in data &&
    data.response &&
    typeof data.response === "object" &&
    "access_token" in data.response &&
    typeof data.response.access_token === "string"
      ? data.response.access_token
      : null;

  if (!response.ok || getPortOneV1Code(data) !== 0 || !token) {
    throw new PortOneTopUpError(
      "PAYMENT_NOT_CANCELLABLE",
      `포트원 V1 인증에 실패했습니다: ${getPortOneV1Message(data)}`,
    );
  }

  return `Bearer ${token}`;
}

function getPortOneV1RestCredentials(): PortOneV1RestCredentials | null {
  const key =
    process.env.PORTONE_V1_REST_API_KEY ??
    process.env.PORTONE_REST_API_KEY ??
    process.env.IAMPORT_REST_API_KEY ??
    process.env.IMP_REST_API_KEY;
  const secret =
    process.env.PORTONE_V1_REST_API_SECRET ??
    process.env.PORTONE_REST_API_SECRET ??
    process.env.IAMPORT_REST_API_SECRET ??
    process.env.IMP_REST_API_SECRET;

  if (!key || !secret) return null;
  return { key: key.trim(), secret: secret.trim() };
}

async function parsePortOneV1Json(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getPortOneV1Code(data: unknown) {
  return data &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "number"
    ? data.code
    : null;
}

function getPortOneV1Message(data: unknown) {
  if (data && typeof data === "object") {
    if ("message" in data && typeof data.message === "string" && data.message) {
      return data.message;
    }
    if (
      "response" in data &&
      data.response &&
      typeof data.response === "object" &&
      "message" in data.response &&
      typeof data.response.message === "string" &&
      data.response.message
    ) {
      return data.response.message;
    }
  }
  return "unknown_error";
}

function toPortOneCancelTopUpError(err: unknown) {
  return new PortOneTopUpError(
    "PAYMENT_NOT_CANCELLABLE",
    getPortOneErrorMessage(err),
  );
}

function getPortOneErrorMessage(err: unknown) {
  const data = getErrorData(err);
  if (data) {
    if (
      "pgMessage" in data &&
      typeof data.pgMessage === "string" &&
      data.pgMessage
    ) {
      const pgCode =
        "pgCode" in data && typeof data.pgCode === "string"
          ? ` (${data.pgCode})`
          : "";
      return `PG사 취소 거절: ${data.pgMessage}${pgCode}`;
    }
    if ("message" in data && typeof data.message === "string" && data.message) {
      return data.message;
    }
    if ("type" in data && typeof data.type === "string") {
      return `포트원 취소 요청이 실패했습니다: ${data.type}`;
    }
  }
  return err instanceof Error ? err.message : "포트원 취소 요청이 실패했습니다.";
}

function getErrorData(err: unknown): Record<string, unknown> | null {
  if (
    err &&
    typeof err === "object" &&
    "data" in err &&
    err.data &&
    typeof err.data === "object"
  ) {
    return err.data as Record<string, unknown>;
  }
  return null;
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

      // Resolve the purchased product's validity window. Prefer the productCode
      // snapshotted in customData — the top-up's creditAmount now reflects the
      // GRANTED total (base + promo bonus), so it no longer equals the product's
      // (base) creditAmount and can't be used as the lookup key. Fall back to the
      // creditAmount lookup for legacy rows without a productCode.
      const productCode = readCustomDataString(customData, "productCode");
      const productRows = productCode
        ? await tx.$queryRaw<Array<{ expiryDays: number | null }>>`
            SELECT "expiryDays" FROM credit_top_up_products
            WHERE code = ${productCode}
            LIMIT 1
          `
        : await tx.$queryRaw<Array<{ expiryDays: number | null }>>`
            SELECT "expiryDays" FROM credit_top_up_products
            WHERE "creditAmount" = ${topUp.creditAmount}
            LIMIT 1
          `;
      const expiryDays = productRows[0]?.expiryDays ?? 0;

      const balances = await tx.$queryRaw<Array<{ balance: number }>>`
        INSERT INTO credit_balances (
          id,
          "academyId",
          balance,
          "monthlyAllocation",
          "bonusCredits",
          "totalAllocated",
          "expiresAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${topUp.academyId},
          ${topUp.creditAmount},
          ${monthlyAllocation},
          ${topUp.creditAmount},
          ${topUp.creditAmount},
          ${expiresAtInsertSql(expiryDays)},
          NOW()
        )
        ON CONFLICT ("academyId") DO UPDATE
          SET balance = credit_balances.balance + EXCLUDED.balance,
              "bonusCredits" = credit_balances."bonusCredits" + EXCLUDED."bonusCredits",
              "totalAllocated" = credit_balances."totalAllocated" + EXCLUDED."totalAllocated",
              "expiresAt" = ${expiresAtConflictSql(expiryDays)},
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

      // 실물 할인 쿠폰이 적용된 결제면 같은 트랜잭션에서 CLAIMED→USED로 확정(멱등).
      const couponCodeId = readCustomDataString(customData, "couponCodeId");
      if (couponCodeId) {
        await markCouponUsedTx(tx, couponCodeId, topUp.id);
      }

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

      // 취소/환불 확정 시 이 충전이 소진한 실물 할인 쿠폰을 CLAIMED로 원복(재사용 가능).
      if (isFullCancellation) {
        await rollbackCouponByTopUpTx(tx, locked.id);
      }

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

/** customData(JSON 객체)에서 문자열 필드를 안전하게 읽는다. 없으면 null. */
function readCustomDataString(value: unknown, key: string): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  return null;
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
