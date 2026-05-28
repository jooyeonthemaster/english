import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  isUnrecognizedPayment,
  type CancelledPayment,
  type FailedPayment,
  type PaidPayment,
  type PartialCancelledPayment,
  type PayPendingPayment,
  type ReadyPayment,
  type VirtualAccountIssuedPayment,
} from "@portone/server-sdk/payment";
import { isUnrecognizedBillingKeyInfo } from "@portone/server-sdk/payment/billingKey";
import { prisma } from "@/lib/prisma";
import {
  getPortOneClient,
  getPortOneRuntimeConfig,
} from "@/lib/portone-credit-topups";
import { getPlanPricingPreview } from "@/lib/subscription-plan-pricing";

const SUBSCRIPTION_PERIOD_DAYS = 30;
const MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;

type RecognizedBillingPayment =
  | PaidPayment
  | ReadyPayment
  | FailedPayment
  | CancelledPayment
  | PartialCancelledPayment
  | PayPendingPayment
  | VirtualAccountIssuedPayment;

type ActiveSubscription = NonNullable<
  Awaited<ReturnType<typeof getActiveSubscription>>
>;

export type SubscriptionBillingOverview = Awaited<
  ReturnType<typeof getSubscriptionBillingOverview>
>;

export class PortOneSubscriptionError extends Error {
  constructor(
    public code:
      | "CONFIG_MISSING"
      | "SUBSCRIPTION_NOT_FOUND"
      | "PLAN_NOT_PAYABLE"
      | "BILLING_KEY_NOT_FOUND"
      | "BILLING_KEY_UNRECOGNIZED"
      | "BILLING_KEY_MISMATCH"
      | "PAYMENT_NOT_FOUND"
      | "PAYMENT_MISMATCH"
      | "PAYMENT_NOT_PAID"
      | "ALREADY_SCHEDULED"
      | "PORTONE_REQUEST_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PortOneSubscriptionError";
  }
}

export async function getSubscriptionBillingOverview(academyId: string) {
  const subscription = await prisma.academySubscription.findFirst({
    where: {
      academyId,
      status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    include: {
      plan: true,
      billingKey: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const payments = subscription
    ? await prisma.subscriptionPayment.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  if (!subscription) {
    return { subscription: null, payments: [] };
  }

  const pricing = getPlanPricingPreview(subscription.plan);

  return {
    subscription: {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
      autoRenew: subscription.autoRenew,
      nextBillingAt: subscription.nextBillingAt?.toISOString() ?? null,
      nextBillingPaymentId: subscription.nextBillingPaymentId,
      nextBillingScheduleId: subscription.nextBillingScheduleId,
      billingActivatedAt:
        subscription.billingActivatedAt?.toISOString() ?? null,
      billingFailureMessage: subscription.billingFailureMessage,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        tier: subscription.plan.tier,
        monthlyPrice: subscription.plan.monthlyPrice,
        monthlyCredits: subscription.plan.monthlyCredits,
        rolloverPolicy: subscription.plan.rolloverPolicy,
        pricing,
      },
      billingKey: subscription.billingKey
        ? {
            id: subscription.billingKey.id,
            status: subscription.billingKey.status,
            method: subscription.billingKey.method,
            issuedAt: subscription.billingKey.issuedAt?.toISOString() ?? null,
            deletedAt:
              subscription.billingKey.deletedAt?.toISOString() ?? null,
          }
        : null,
    },
    payments: payments.map((payment) => ({
      id: payment.id,
      paymentId: payment.paymentId,
      scheduleId: payment.scheduleId,
      orderName: payment.orderName,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      portoneStatus: payment.portoneStatus,
      paidAmount: payment.paidAmount,
      receiptUrl: payment.receiptUrl,
      failureMessage: payment.failureMessage,
      scheduledAt: payment.scheduledAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      completedAt: payment.completedAt?.toISOString() ?? null,
      periodStart: payment.periodStart.toISOString(),
      periodEnd: payment.periodEnd.toISOString(),
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}

export async function buildSubscriptionBillingKeyIssueRequest(params: {
  academyId: string;
  staffId: string;
}) {
  const subscription = await getActiveSubscription(params.academyId);
  if (!subscription) {
    throw new PortOneSubscriptionError(
      "SUBSCRIPTION_NOT_FOUND",
      "No active subscription exists for this academy.",
    );
  }

  const amount = getSubscriptionAmount(subscription);
  if (amount <= 0) {
    throw new PortOneSubscriptionError(
      "PLAN_NOT_PAYABLE",
      "This subscription plan cannot be paid by card billing.",
    );
  }

  const { storeId, channelKey } = getPortOneRuntimeConfig();
  const issueId = buildPortOneBillingIssueId();
  const customer = buildBrowserCustomer(subscription);
  const appUrl = getAppUrl();
  const issueName = buildBillingIssueName(subscription.plan.name);

  return {
    issueId,
    subscriptionId: subscription.id,
    issueRequest: {
      storeId,
      channelKey,
      billingKeyMethod: "CARD" as const,
      issueId,
      issueName,
      displayAmount: amount,
      currency: "KRW" as const,
      customer,
      offerPeriod: { interval: `${SUBSCRIPTION_PERIOD_DAYS}d` },
      productType: "DIGITAL" as const,
      redirectUrl: `${appUrl}/director/credits?billingIssue=1&issueId=${encodeURIComponent(
        issueId,
      )}`,
      customData: {
        type: "SUBSCRIPTION_BILLING_KEY",
        academyId: params.academyId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        staffId: params.staffId,
        issueId,
        periodDays: SUBSCRIPTION_PERIOD_DAYS,
      },
    },
  };
}

export async function registerSubscriptionBillingKey(params: {
  academyId: string;
  staffId: string;
  billingKey: string;
  issueId?: string;
  chargeNow?: boolean;
}) {
  const subscription = await getActiveSubscription(params.academyId);
  if (!subscription) {
    throw new PortOneSubscriptionError(
      "SUBSCRIPTION_NOT_FOUND",
      "No active subscription exists for this academy.",
    );
  }

  const amount = getSubscriptionAmount(subscription);
  if (amount <= 0) {
    throw new PortOneSubscriptionError(
      "PLAN_NOT_PAYABLE",
      "This subscription plan cannot be paid by card billing.",
    );
  }

  const { storeId, channelKey } = getPortOneRuntimeConfig();
  const billingKeyInfo = await getPortOneClient().payment.billingKey.getBillingKeyInfo({
    billingKey: params.billingKey,
    storeId,
  });

  if (isUnrecognizedBillingKeyInfo(billingKeyInfo)) {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_UNRECOGNIZED",
      "PortOne returned an unsupported billing key status.",
    );
  }
  if (billingKeyInfo.status !== "ISSUED") {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_NOT_FOUND",
      "The billing key is not issued.",
    );
  }
  if (billingKeyInfo.storeId !== storeId) {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_MISMATCH",
      "PortOne store id does not match configured store id.",
    );
  }
  if (
    params.issueId &&
    billingKeyInfo.issueId &&
    billingKeyInfo.issueId !== params.issueId
  ) {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_MISMATCH",
      "PortOne billing issue id does not match the request.",
    );
  }

  const customData = parseJsonObject(billingKeyInfo.customData);
  if (
    customData.academyId &&
    customData.academyId !== params.academyId
  ) {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_MISMATCH",
      "PortOne billing key belongs to another academy.",
    );
  }

  const now = new Date();
  const billingKeyRecord = await prisma.portOneBillingKey.upsert({
    where: { billingKey: billingKeyInfo.billingKey },
    update: {
      academyId: params.academyId,
      issueId: billingKeyInfo.issueId ?? params.issueId ?? undefined,
      issueName: billingKeyInfo.issueName ?? buildBillingIssueName(subscription.plan.name),
      status: "ISSUED",
      storeId: billingKeyInfo.storeId,
      channelKey: billingKeyInfo.channels[0]?.key ?? channelKey,
      method: "CARD",
      customerId: buildCustomerId(params.academyId),
      issuedById: params.staffId,
      billingKeyInfo: toJsonValue(billingKeyInfo),
      customData: toJsonValue(customData),
      issuedAt: toDate(billingKeyInfo.issuedAt),
      deletedAt: null,
      lastSyncedAt: now,
    },
    create: {
      academyId: params.academyId,
      billingKey: billingKeyInfo.billingKey,
      issueId: billingKeyInfo.issueId ?? params.issueId ?? undefined,
      issueName: billingKeyInfo.issueName ?? buildBillingIssueName(subscription.plan.name),
      status: "ISSUED",
      storeId: billingKeyInfo.storeId,
      channelKey: billingKeyInfo.channels[0]?.key ?? channelKey,
      method: "CARD",
      customerId: buildCustomerId(params.academyId),
      issuedById: params.staffId,
      billingKeyInfo: toJsonValue(billingKeyInfo),
      customData: toJsonValue(customData),
      issuedAt: toDate(billingKeyInfo.issuedAt),
      lastSyncedAt: now,
    },
  });

  const replacingBillingKey =
    subscription.billingKey && subscription.billingKey.id !== billingKeyRecord.id;

  if (replacingBillingKey) {
    if (subscription.nextBillingScheduleId) {
      await getPortOneClient().payment.paymentSchedule.revokePaymentSchedules({
        storeId: subscription.billingKey!.storeId,
        scheduleIds: [subscription.nextBillingScheduleId],
      }).catch((err) => {
        console.warn("[portone-subscriptions] revoke previous schedule failed", {
          subscriptionId: subscription.id,
          scheduleId: subscription.nextBillingScheduleId,
          err,
        });
      });
    }

    if (subscription.nextBillingPaymentId) {
      await prisma.subscriptionPayment.updateMany({
        where: {
          paymentId: subscription.nextBillingPaymentId,
          status: { in: ["PENDING", "SCHEDULED"] },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          failureMessage: "정기결제 카드 변경으로 기존 결제 예약을 취소했습니다.",
        },
      });
    }
  }

  await prisma.academySubscription.update({
    where: { id: subscription.id },
    data: {
      billingKeyId: billingKeyRecord.id,
      autoRenew: true,
      paymentMethod: "CARD",
      paymentReference: billingKeyInfo.billingKey,
      billingActivatedAt: now,
      billingFailureMessage: null,
      cancelledAt: null,
      nextBillingPaymentId: replacingBillingKey ? null : undefined,
      nextBillingScheduleId: replacingBillingKey ? null : undefined,
      nextBillingAt: replacingBillingKey ? null : undefined,
    },
  });

  if (replacingBillingKey) {
    await getPortOneClient().payment.billingKey.deleteBillingKey({
      billingKey: subscription.billingKey!.billingKey,
      storeId: subscription.billingKey!.storeId,
      reason: "SMOAT 정기결제 카드 변경으로 이전 빌링키를 삭제했습니다.",
      requester: "CUSTOMER",
    }).then(async (response) => {
      await prisma.portOneBillingKey.update({
        where: { id: subscription.billingKey!.id },
        data: {
          status: "DELETED",
          deletedAt: toDate(response.deletedAt) ?? now,
          lastSyncedAt: now,
        },
      });
    }).catch(async (err) => {
      console.warn("[portone-subscriptions] delete previous billing key failed", {
        subscriptionId: subscription.id,
        billingKeyId: subscription.billingKey!.id,
        err,
      });
    });
  }

  if (params.chargeNow ?? true) {
    const payment = await paySubscriptionPeriodNow({
      subscriptionId: subscription.id,
      billingKeyId: billingKeyRecord.id,
      staffId: params.staffId,
    });
    return { billingKeyId: billingKeyRecord.id, payment };
  }

  const scheduledPayment = await scheduleNextSubscriptionPayment(subscription.id);
  return { billingKeyId: billingKeyRecord.id, scheduledPayment };
}

export async function paySubscriptionPeriodNow(params: {
  subscriptionId: string;
  billingKeyId: string;
  staffId?: string;
}) {
  const subscription = await getSubscriptionForPayment(params.subscriptionId);
  if (!subscription || !subscription.billingKey) {
    throw new PortOneSubscriptionError(
      "BILLING_KEY_NOT_FOUND",
      "No active billing key is connected to this subscription.",
    );
  }

  const amount = getSubscriptionAmount(subscription);
  if (amount <= 0) {
    throw new PortOneSubscriptionError(
      "PLAN_NOT_PAYABLE",
      "This subscription plan cannot be paid by card billing.",
    );
  }

  const existingPaid = await prisma.subscriptionPayment.findFirst({
    where: {
      subscriptionId: subscription.id,
      status: "PAID",
      periodEnd: { gt: new Date() },
    },
    orderBy: { periodEnd: "desc" },
  });
  if (existingPaid) {
    await scheduleNextSubscriptionPayment(subscription.id);
    return {
      paymentId: existingPaid.paymentId,
      status: existingPaid.status,
      alreadyPaid: true,
    };
  }

  const now = new Date();
  const periodStart = now;
  const periodEnd = addDays(periodStart, SUBSCRIPTION_PERIOD_DAYS);
  const paymentId = buildPortOneSubscriptionPaymentId();
  const customData = buildPaymentCustomData({
    subscription,
    paymentId,
    billingKeyId: params.billingKeyId,
    source: "immediate",
    staffId: params.staffId,
    periodStart,
    periodEnd,
  });

  await prisma.subscriptionPayment.create({
    data: {
      academyId: subscription.academyId,
      subscriptionId: subscription.id,
      billingKeyId: params.billingKeyId,
      paymentId,
      orderName: buildSubscriptionOrderName(subscription.plan.name),
      amount,
      status: "PENDING",
      customData: toJsonValue(customData),
      periodStart,
      periodEnd,
    },
  });

  try {
    await getPortOneClient().payment.payWithBillingKey({
      paymentId,
      storeId: subscription.billingKey.storeId,
      billingKey: subscription.billingKey.billingKey,
      channelKey: subscription.billingKey.channelKey ?? undefined,
      orderName: buildSubscriptionOrderName(subscription.plan.name),
      customer: buildServerCustomer(subscription),
      amount: { total: amount },
      currency: "KRW",
      customData: JSON.stringify(customData),
      productType: "DIGITAL",
      products: [
        {
          id: subscription.plan.tier,
          name: buildSubscriptionOrderName(subscription.plan.name),
          amount,
          quantity: 1,
        },
      ],
    });
  } catch (err) {
    const message = getPortOneErrorMessage(err);
    await markSubscriptionPaymentFailed({
      paymentId,
      subscriptionId: subscription.id,
      failureCode: getPortOneErrorType(err) ?? "PAY_WITH_BILLING_KEY_FAILED",
      failureMessage: message,
    });
    throw new PortOneSubscriptionError(
      "PORTONE_REQUEST_FAILED",
      message,
    );
  }

  return completeSubscriptionPayment({
    paymentId,
    source: "client",
    expectedAcademyId: subscription.academyId,
  });
}

export async function scheduleNextSubscriptionPayment(subscriptionId: string) {
  const subscription = await getSubscriptionForPayment(subscriptionId);
  if (!subscription || !subscription.billingKey || !subscription.autoRenew) {
    return null;
  }

  const amount = getSubscriptionAmount(subscription);
  if (amount <= 0) {
    return null;
  }

  if (subscription.nextBillingPaymentId) {
    const existing = await prisma.subscriptionPayment.findUnique({
      where: { paymentId: subscription.nextBillingPaymentId },
    });
    if (
      existing &&
      existing.status === "SCHEDULED" &&
      existing.scheduledAt &&
      existing.scheduledAt > new Date()
    ) {
      return existing;
    }
  }

  const periodStart = getNextPeriodStart(subscription.currentPeriodEnd);
  const periodEnd = addDays(periodStart, SUBSCRIPTION_PERIOD_DAYS);
  const scheduledAt = ensureFutureScheduleTime(periodStart);
  const paymentId = buildPortOneSubscriptionPaymentId();
  const customData = buildPaymentCustomData({
    subscription,
    paymentId,
    billingKeyId: subscription.billingKey.id,
    source: "scheduled",
    periodStart,
    periodEnd,
  });

  const localPayment = await prisma.subscriptionPayment.create({
    data: {
      academyId: subscription.academyId,
      subscriptionId: subscription.id,
      billingKeyId: subscription.billingKey.id,
      paymentId,
      orderName: buildSubscriptionOrderName(subscription.plan.name),
      amount,
      status: "PENDING",
      customData: toJsonValue(customData),
      scheduledAt,
      periodStart,
      periodEnd,
    },
  });

  try {
    const response =
      await getPortOneClient().payment.paymentSchedule.createPaymentSchedule({
        paymentId,
        timeToPay: scheduledAt.toISOString(),
        payment: {
          storeId: subscription.billingKey.storeId,
          billingKey: subscription.billingKey.billingKey,
          channelKey: subscription.billingKey.channelKey ?? undefined,
          orderName: buildSubscriptionOrderName(subscription.plan.name),
          customer: buildServerCustomer(subscription),
          amount: { total: amount },
          currency: "KRW",
          customData: JSON.stringify(customData),
          productType: "DIGITAL",
          products: [
            {
              id: subscription.plan.tier,
              name: buildSubscriptionOrderName(subscription.plan.name),
              amount,
              quantity: 1,
            },
          ],
        },
      });

    const updated = await prisma.subscriptionPayment.update({
      where: { id: localPayment.id },
      data: {
        status: "SCHEDULED",
        scheduleId: response.schedule.id,
      },
    });

    await prisma.academySubscription.update({
      where: { id: subscription.id },
      data: {
        nextBillingPaymentId: paymentId,
        nextBillingScheduleId: response.schedule.id,
        nextBillingAt: scheduledAt,
        billingFailureMessage: null,
      },
    });

    return updated;
  } catch (err) {
    const message = getPortOneErrorMessage(err);
    await prisma.subscriptionPayment.update({
      where: { id: localPayment.id },
      data: {
        status: "FAILED",
        failureCode: getPortOneErrorType(err) ?? "SCHEDULE_FAILED",
        failureMessage: message,
      },
    });
    await prisma.academySubscription.update({
      where: { id: subscription.id },
      data: { billingFailureMessage: message },
    });
    throw new PortOneSubscriptionError("PORTONE_REQUEST_FAILED", message);
  }
}

export async function completeSubscriptionPayment(params: {
  paymentId: string;
  source: "client" | "webhook" | "admin_retry";
  expectedAcademyId?: string;
}) {
  const payment = await fetchBillingPayment(params.paymentId);
  return syncPortOnePaymentToSubscription(payment, params);
}

export async function syncPortOnePaymentToSubscription(
  payment: RecognizedBillingPayment,
  params: {
    source: "client" | "webhook" | "admin_retry";
    expectedAcademyId?: string;
  },
) {
  const localPayment = await prisma.subscriptionPayment.findUnique({
    where: { paymentId: payment.id },
    include: {
      subscription: { include: { plan: true } },
      billingKey: true,
    },
  });

  if (!localPayment) {
    throw new PortOneSubscriptionError(
      "PAYMENT_NOT_FOUND",
      "No subscription payment exists for this PortOne payment.",
    );
  }
  if (
    params.expectedAcademyId &&
    localPayment.academyId !== params.expectedAcademyId
  ) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "This payment belongs to another academy.",
    );
  }

  assertPaymentMatchesSubscription(localPayment, payment);

  if (payment.status === "PAID") {
    const result = await completePaidSubscriptionPayment(payment, params.source);
    await scheduleNextSubscriptionPayment(result.subscriptionId).catch((err) => {
      console.error("[portone-subscriptions] schedule next failed", {
        paymentId: payment.id,
        subscriptionId: result.subscriptionId,
        err,
      });
    });
    return result;
  }

  if (payment.status === "FAILED") {
    const updated = await markSubscriptionPaymentFailed({
      paymentId: payment.id,
      subscriptionId: localPayment.subscriptionId,
      failureCode: payment.failure?.pgCode ?? payment.failure?.reason ?? "FAILED",
      failureMessage:
        payment.failure?.pgMessage ?? payment.failure?.reason ?? "Payment failed.",
      paymentPayload: toJsonValue(payment),
      portoneStatus: payment.status,
      portoneTransactionId: payment.transactionId,
    });
    return {
      subscriptionPaymentId: updated.id,
      subscriptionId: updated.subscriptionId,
      paymentId: payment.id,
      status: updated.status,
      paid: false,
      balanceAfter: null,
    };
  }

  if (
    payment.status === "CANCELLED" ||
    payment.status === "PARTIAL_CANCELLED"
  ) {
    const updated = await prisma.subscriptionPayment.update({
      where: { paymentId: payment.id },
      data: {
        status: payment.status === "CANCELLED" ? "CANCELLED" : "REFUNDED",
        portoneStatus: payment.status,
        portoneTransactionId: payment.transactionId,
        paidAmount: "amount" in payment ? payment.amount.paid : undefined,
        receiptUrl: "receiptUrl" in payment ? payment.receiptUrl : undefined,
        paymentPayload: toJsonValue(payment),
        cancelledAt: toDate(
          "cancelledAt" in payment ? payment.cancelledAt : undefined,
        ),
      },
    });
    return {
      subscriptionPaymentId: updated.id,
      subscriptionId: updated.subscriptionId,
      paymentId: payment.id,
      status: updated.status,
      paid: false,
      balanceAfter: null,
    };
  }

  const updated = await prisma.subscriptionPayment.update({
    where: { paymentId: payment.id },
    data: {
      status: localPayment.status === "SCHEDULED" ? "SCHEDULED" : "PENDING",
      portoneStatus: payment.status,
      portoneTransactionId:
        "transactionId" in payment ? payment.transactionId : undefined,
      paymentPayload: toJsonValue(payment),
    },
  });

  return {
    subscriptionPaymentId: updated.id,
    subscriptionId: updated.subscriptionId,
    paymentId: payment.id,
    status: updated.status,
    paid: false,
    balanceAfter: null,
  };
}

export async function cancelSubscriptionAutoRenew(params: {
  academyId: string;
  staffId: string;
}) {
  const subscription = await prisma.academySubscription.findFirst({
    where: {
      academyId: params.academyId,
      status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
      autoRenew: true,
    },
    include: {
      billingKey: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    throw new PortOneSubscriptionError(
      "SUBSCRIPTION_NOT_FOUND",
      "No auto-renewing subscription exists for this academy.",
    );
  }

  const { storeId } = getPortOneRuntimeConfig();
  const now = new Date();

  if (subscription.nextBillingScheduleId) {
    await getPortOneClient().payment.paymentSchedule.revokePaymentSchedules({
      storeId,
      scheduleIds: [subscription.nextBillingScheduleId],
    }).catch((err) => {
      console.warn("[portone-subscriptions] revoke schedule failed", {
        subscriptionId: subscription.id,
        scheduleId: subscription.nextBillingScheduleId,
        err,
      });
    });
  }

  if (subscription.nextBillingPaymentId) {
    await prisma.subscriptionPayment.updateMany({
      where: {
        paymentId: subscription.nextBillingPaymentId,
        status: { in: ["PENDING", "SCHEDULED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        failureMessage: "사용자가 정기결제 자동갱신을 해지했습니다.",
      },
    });
  }

  if (subscription.billingKey) {
    await getPortOneClient().payment.billingKey.deleteBillingKey({
      billingKey: subscription.billingKey.billingKey,
      storeId,
      reason: "사용자가 SMOAT 정기결제 자동갱신을 해지했습니다.",
      requester: "CUSTOMER",
    }).then(async (response) => {
      await prisma.portOneBillingKey.update({
        where: { id: subscription.billingKey!.id },
        data: {
          status: "DELETED",
          deletedAt: toDate(response.deletedAt) ?? now,
          lastSyncedAt: now,
        },
      });
    }).catch(async (err) => {
      await prisma.portOneBillingKey.update({
        where: { id: subscription.billingKey!.id },
        data: {
          status: "DELETED",
          deletedAt: now,
          lastSyncedAt: now,
        },
      });
      console.warn("[portone-subscriptions] delete billing key failed", {
        subscriptionId: subscription.id,
        err,
      });
    });
  }

  const updated = await prisma.academySubscription.update({
    where: { id: subscription.id },
    data: {
      autoRenew: false,
      nextBillingPaymentId: null,
      nextBillingScheduleId: null,
      nextBillingAt: null,
      cancelledAt: now,
      billingFailureMessage: null,
    },
  });

  return {
    subscriptionId: updated.id,
    autoRenew: updated.autoRenew,
    cancelledAt: updated.cancelledAt?.toISOString() ?? null,
  };
}

export async function syncDeletedBillingKey(billingKey: string) {
  const now = new Date();
  const record = await prisma.portOneBillingKey.findUnique({
    where: { billingKey },
  });
  if (!record) return null;

  await prisma.portOneBillingKey.update({
    where: { id: record.id },
    data: {
      status: "DELETED",
      deletedAt: now,
      lastSyncedAt: now,
    },
  });

  await prisma.academySubscription.updateMany({
    where: { billingKeyId: record.id, autoRenew: true },
    data: {
      autoRenew: false,
      nextBillingPaymentId: null,
      nextBillingScheduleId: null,
      nextBillingAt: null,
      billingFailureMessage: "포트원에서 빌링키 삭제 이벤트가 수신되었습니다.",
    },
  });

  await prisma.subscriptionPayment.updateMany({
    where: {
      billingKeyId: record.id,
      status: { in: ["PENDING", "SCHEDULED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      failureMessage: "포트원에서 빌링키 삭제 이벤트가 수신되었습니다.",
    },
  });

  return record.id;
}

async function getActiveSubscription(academyId: string) {
  return prisma.academySubscription.findFirst({
    where: {
      academyId,
      status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    include: {
      academy: {
        include: {
          staff: {
            where: { role: "DIRECTOR", isActive: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
      plan: true,
      billingKey: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getSubscriptionForPayment(subscriptionId: string) {
  return prisma.academySubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      academy: {
        include: {
          staff: {
            where: { role: "DIRECTOR", isActive: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
      plan: true,
      billingKey: true,
    },
  });
}

async function fetchBillingPayment(paymentId: string) {
  const { storeId } = getPortOneRuntimeConfig();
  const payment = await getPortOneClient().payment.getPayment({
    paymentId,
    storeId,
  });
  if (isUnrecognizedPayment(payment)) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "PortOne returned an unsupported payment status.",
    );
  }
  return payment;
}

async function completePaidSubscriptionPayment(
  payment: PaidPayment,
  source: "client" | "webhook" | "admin_retry",
) {
  const paymentPayload = toJsonValue(payment);
  const paidAt = toDate(payment.paidAt);
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          academyId: string;
          subscriptionId: string;
          billingKeyId: string | null;
          paymentId: string;
          amount: number;
          status: string;
          periodStart: Date;
          periodEnd: Date;
        }>
      >`
        SELECT id, "academyId", "subscriptionId", "billingKeyId", "paymentId", amount, status, "periodStart", "periodEnd"
        FROM subscription_payments
        WHERE "paymentId" = ${payment.id}
        FOR UPDATE
      `;
      const localPayment = rows[0];
      if (!localPayment) {
        throw new PortOneSubscriptionError(
          "PAYMENT_NOT_FOUND",
          "No subscription payment exists for this PortOne payment.",
        );
      }

      const subscription = await tx.academySubscription.findUnique({
        where: { id: localPayment.subscriptionId },
        include: { plan: true },
      });
      if (!subscription) {
        throw new PortOneSubscriptionError(
          "SUBSCRIPTION_NOT_FOUND",
          "No subscription exists for this payment.",
        );
      }

      if (localPayment.status === "PAID") {
        const balance = await tx.creditBalance.findUnique({
          where: { academyId: localPayment.academyId },
          select: { balance: true },
        });
        return {
          subscriptionPaymentId: localPayment.id,
          subscriptionId: localPayment.subscriptionId,
          paymentId: payment.id,
          status: "PAID",
          paid: false,
          balanceAfter: balance?.balance ?? null,
        };
      }

      const allocation = subscription.plan.monthlyCredits;
      let balanceAfter: number | null = null;

      if (allocation > 0) {
        const balances = await tx.$queryRaw<Array<{ balance: number }>>`
          INSERT INTO credit_balances (
            id,
            "academyId",
            balance,
            "monthlyAllocation",
            "totalAllocated",
            "lastResetAt",
            "updatedAt"
          )
          VALUES (
            ${randomUUID()},
            ${localPayment.academyId},
            ${allocation},
            ${allocation},
            ${allocation},
            NOW(),
            NOW()
          )
          ON CONFLICT ("academyId") DO UPDATE
            SET balance = credit_balances.balance + EXCLUDED.balance,
                "monthlyAllocation" = EXCLUDED."monthlyAllocation",
                "totalAllocated" = credit_balances."totalAllocated" + EXCLUDED."totalAllocated",
                "lastResetAt" = NOW(),
                "updatedAt" = NOW()
          RETURNING balance
        `;
        balanceAfter = balances[0]?.balance ?? null;
        if (typeof balanceAfter !== "number") {
          throw new Error("subscription_credit_allocation_failed");
        }

        await tx.creditTransaction.create({
          data: {
            academyId: localPayment.academyId,
            type: "ALLOCATION",
            amount: allocation,
            balanceAfter,
            description: `SMOAT ${subscription.plan.name} 30일 정기결제 크레딧 지급`,
            referenceId: localPayment.id,
            referenceType: "SUBSCRIPTION_PAYMENT",
            metadata: JSON.stringify({
              source,
              portonePaymentId: payment.id,
              portoneTransactionId: payment.transactionId,
              periodStart: localPayment.periodStart.toISOString(),
              periodEnd: localPayment.periodEnd.toISOString(),
            }),
          },
        });
      }

      await tx.subscriptionPayment.update({
        where: { id: localPayment.id },
        data: {
          status: "PAID",
          portoneStatus: payment.status,
          portoneTransactionId: payment.transactionId,
          paidAmount: payment.amount.paid,
          receiptUrl: payment.receiptUrl,
          paymentPayload,
          paidAt,
          completedAt: now,
          failureCode: null,
          failureMessage: null,
        },
      });

      await tx.academySubscription.update({
        where: { id: localPayment.subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: localPayment.periodStart,
          currentPeriodEnd: localPayment.periodEnd,
          graceEndsAt: null,
          cancelledAt: null,
          paymentMethod: "CARD",
          paymentReference: payment.transactionId,
          autoRenew: true,
          nextBillingPaymentId: null,
          nextBillingScheduleId: null,
          nextBillingAt: null,
          billingFailureMessage: null,
        },
      });

      return {
        subscriptionPaymentId: localPayment.id,
        subscriptionId: localPayment.subscriptionId,
        paymentId: payment.id,
        status: "PAID",
        paid: true,
        balanceAfter,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}

async function markSubscriptionPaymentFailed(params: {
  paymentId: string;
  subscriptionId: string;
  failureCode: string;
  failureMessage: string;
  paymentPayload?: Prisma.InputJsonValue;
  portoneStatus?: string;
  portoneTransactionId?: string;
}) {
  const [updated] = await prisma.$transaction([
    prisma.subscriptionPayment.update({
      where: { paymentId: params.paymentId },
      data: {
        status: "FAILED",
        failureCode: params.failureCode,
        failureMessage: params.failureMessage,
        paymentPayload: params.paymentPayload,
        portoneStatus: params.portoneStatus,
        portoneTransactionId: params.portoneTransactionId,
      },
    }),
    prisma.academySubscription.update({
      where: { id: params.subscriptionId },
      data: {
        status: "PAST_DUE",
        billingFailureMessage: params.failureMessage,
      },
    }),
  ]);

  return updated;
}

function assertPaymentMatchesSubscription(
  localPayment: {
    amount: number;
    paymentId: string;
    academyId: string;
    billingKey?: { billingKey: string; storeId: string } | null;
  },
  payment: RecognizedBillingPayment,
) {
  const { storeId } = getPortOneRuntimeConfig();
  if (payment.storeId !== storeId) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "PortOne store id does not match configured store id.",
    );
  }
  if (payment.id !== localPayment.paymentId) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "PortOne payment id does not match the subscription payment.",
    );
  }
  if ("amount" in payment && payment.amount.total !== localPayment.amount) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "PortOne payment amount does not match the subscription payment.",
    );
  }
  if (
    "billingKey" in payment &&
    payment.billingKey &&
    localPayment.billingKey?.billingKey &&
    payment.billingKey !== localPayment.billingKey.billingKey
  ) {
    throw new PortOneSubscriptionError(
      "PAYMENT_MISMATCH",
      "PortOne billing key does not match the subscription payment.",
    );
  }
}

function buildPaymentCustomData(params: {
  subscription: ActiveSubscription;
  paymentId: string;
  billingKeyId: string;
  source: "immediate" | "scheduled";
  staffId?: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return {
    type: "SUBSCRIPTION_PAYMENT",
    source: params.source,
    academyId: params.subscription.academyId,
    subscriptionId: params.subscription.id,
    planId: params.subscription.planId,
    planTier: params.subscription.plan.tier,
    billingKeyId: params.billingKeyId,
    paymentId: params.paymentId,
    staffId: params.staffId,
    periodDays: SUBSCRIPTION_PERIOD_DAYS,
    periodStart: params.periodStart.toISOString(),
    periodEnd: params.periodEnd.toISOString(),
  };
}

function buildPortOneBillingIssueId() {
  return `sm_bi_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function buildPortOneSubscriptionPaymentId() {
  return `sm_sub_${randomUUID().replaceAll("-", "").slice(0, 23)}`;
}

function buildBillingIssueName(planName: string) {
  return `SMOAT ${planName} 정기결제 카드 등록`;
}

function buildSubscriptionOrderName(planName: string) {
  return `SMOAT ${planName} 30일 정기결제`;
}

function buildCustomerId(academyId: string) {
  const normalized = academyId.replace(/[^A-Za-z0-9]/g, "").slice(0, 18);
  return `sm${normalized || "academy"}`.slice(0, 20);
}

function buildBrowserCustomer(subscription: ActiveSubscription) {
  const director = subscription.academy.staff?.[0];
  return {
    customerId: buildCustomerId(subscription.academyId),
    fullName: director?.name ?? subscription.academy.name,
    phoneNumber: director?.phone ?? subscription.academy.phone ?? undefined,
    email: director?.email ?? undefined,
  };
}

function buildServerCustomer(subscription: ActiveSubscription) {
  const director = subscription.academy.staff?.[0];
  return {
    id: buildCustomerId(subscription.academyId),
    name: { full: director?.name ?? subscription.academy.name },
    phoneNumber: director?.phone ?? subscription.academy.phone ?? undefined,
    email: director?.email ?? undefined,
  };
}

function getSubscriptionAmount(
  subscription: Pick<ActiveSubscription, "plan">,
) {
  return getPlanPricingPreview(subscription.plan).finalPrice;
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL;
  if (!appUrl) {
    throw new PortOneSubscriptionError(
      "CONFIG_MISSING",
      "App URL must be configured for PortOne redirectUrl.",
    );
  }
  return appUrl.replace(/\/$/, "");
}

function getNextPeriodStart(currentPeriodEnd: Date) {
  const now = new Date();
  return currentPeriodEnd > now ? currentPeriodEnd : now;
}

function ensureFutureScheduleTime(candidate: Date) {
  const min = new Date(Date.now() + MIN_SCHEDULE_LEAD_MS);
  return candidate > min ? candidate : min;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getPortOneErrorMessage(err: unknown) {
  if (isErrorWithDataMessage(err)) return err.data.message;
  if (err instanceof Error && err.message) return err.message;
  return "PortOne subscription billing request failed.";
}

function getPortOneErrorType(err: unknown) {
  if (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof (err as { data?: unknown }).data === "object" &&
    (err as { data?: unknown }).data !== null &&
    "type" in ((err as { data: object }).data) &&
    typeof (err as { data: { type?: unknown } }).data.type === "string"
  ) {
    return (err as { data: { type: string } }).data.type;
  }
  return null;
}

function isErrorWithDataMessage(
  err: unknown,
): err is { data: { message: string } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof (err as { data?: unknown }).data === "object" &&
    (err as { data?: unknown }).data !== null &&
    "message" in ((err as { data: object }).data) &&
    typeof (err as { data: { message?: unknown } }).data.message === "string"
  );
}
