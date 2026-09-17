import { PaymentError } from "@portone/server-sdk/payment";
import { prisma } from "@/lib/prisma";
import {
  fetchPortOnePayment,
  syncPortOnePaymentToTopUp,
} from "@/lib/portone-credit-topups";
import {
  ABANDONED_CHECKOUT_MESSAGE,
  mapPortOneStatusToTopUpStatus,
} from "@/lib/credit-topup-status";

/**
 * 오래된 "결제 대기"(PENDING) 주문을 포트원에 직접 물어 정리한다.
 *
 * 카드 결제는 결제창을 열기 전에 주문이 PENDING 으로 생기고, 결과는 브라우저가
 * 서버에 알려줘야 반영된다. 탭을 닫거나 모바일 복귀가 끊기면 그 알림이 오지 않아
 * 주문이 영원히 PENDING 으로 남았다(2026-09 실측 55건: 결제 완료 0, 사용자 취소 34,
 * 결제창 이탈 15, 진짜 실패 5). 브라우저에 기대지 않고 서버가 확인해 닫는다.
 *
 * 판정은 반드시 포트원 조회 결과로만 한다 — 실제로 결제된 건(PAID)은 크레딧 지급으로
 * 복구되고, 조회 자체가 실패(네트워크·인증)하면 건드리지 않는다.
 */

/** 결제창을 열고 이 시간이 지나도 결과가 없으면 정리 대상. */
export const STALE_PENDING_MINUTES = 30;

export type ReconcileAction =
  | "sync" // 포트원 상태(결제 완료/실패/취소)로 동기화
  | "abandon" // READY·조회 불가 → 결제 취소(결제창 이탈)
  | "skip"; // 판단 보류(진행 중이거나 조회 실패)

export type ReconcileItem = {
  topUpId: string;
  paymentId: string;
  createdAt: Date;
  portoneStatus: string | null;
  action: ReconcileAction;
  nextStatus: string | null;
  detail: string | null;
};

export async function reconcileStalePendingTopUps(options: {
  dryRun?: boolean;
  limit?: number;
  olderThanMinutes?: number;
} = {}): Promise<ReconcileItem[]> {
  const cutoff = new Date(
    Date.now() - (options.olderThanMinutes ?? STALE_PENDING_MINUTES) * 60_000,
  );
  const rows = await prisma.creditTopUp.findMany({
    where: {
      status: "PENDING",
      paymentId: { not: null },
      createdAt: { lt: cutoff },
      // paymentMethod 가 NULL 인 주문도 대상이다(NOT 단독은 SQL NULL 을 함께 걸러낸다).
      OR: [{ paymentMethod: null }, { paymentMethod: { not: "BANK_TRANSFER" } }],
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 20,
    select: { id: true, paymentId: true, status: true, createdAt: true },
  });

  const results: ReconcileItem[] = [];
  for (const row of rows) {
    results.push(await reconcileOne(row as typeof row & { paymentId: string }, options.dryRun ?? false));
  }
  return results;
}

async function reconcileOne(
  row: { id: string; paymentId: string; status: string; createdAt: Date },
  dryRun: boolean,
): Promise<ReconcileItem> {
  const base = { topUpId: row.id, paymentId: row.paymentId, createdAt: row.createdAt };

  let payment: Awaited<ReturnType<typeof fetchPortOnePayment>> | null = null;
  try {
    payment = await fetchPortOnePayment(row.paymentId);
  } catch (err) {
    if (!isPaymentNotFound(err)) {
      return {
        ...base,
        portoneStatus: null,
        action: "skip",
        nextStatus: null,
        detail: err instanceof Error ? err.message : "조회 실패",
      };
    }
  }

  // 결제창만 열고 끝났거나(READY) 포트원에 결제 자체가 없다 → 결제창 이탈.
  if (!payment || payment.status === "READY") {
    const portoneStatus = payment?.status ?? "NOT_FOUND";
    if (!dryRun) {
      // 조회와 쓰기 사이에 웹훅이 먼저 처리했을 수 있으므로 PENDING 일 때만 바꾼다.
      await prisma.creditTopUp.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: {
          status: "CANCELLED",
          portoneStatus,
          failureMessage: ABANDONED_CHECKOUT_MESSAGE,
          verifiedAt: new Date(),
          cancelledAt: new Date(),
        },
      });
    }
    return {
      ...base,
      portoneStatus,
      action: "abandon",
      nextStatus: "CANCELLED",
      detail: ABANDONED_CHECKOUT_MESSAGE,
    };
  }

  // PAY_PENDING 등 아직 진행 중일 수 있는 상태는 다음 기회에 본다.
  if (!["PAID", "FAILED", "CANCELLED", "PARTIAL_CANCELLED", "VIRTUAL_ACCOUNT_ISSUED"].includes(payment.status)) {
    return { ...base, portoneStatus: payment.status, action: "skip", nextStatus: null, detail: null };
  }

  const failure = payment.status === "FAILED" ? payment.failure : null;
  const detail = failure ? (failure.pgMessage ?? failure.reason ?? null) : null;
  if (dryRun) {
    return {
      ...base,
      portoneStatus: payment.status,
      action: "sync",
      nextStatus:
        payment.status === "PAID"
          ? "COMPLETED"
          : mapPortOneStatusToTopUpStatus(payment.status, row.status, failure),
      detail,
    };
  }

  try {
    const result = await syncPortOnePaymentToTopUp(payment, { source: "auto_reconcile" });
    return { ...base, portoneStatus: payment.status, action: "sync", nextStatus: result.status, detail };
  } catch (err) {
    return {
      ...base,
      portoneStatus: payment.status,
      action: "skip",
      nextStatus: null,
      detail: err instanceof Error ? err.message : "동기화 실패",
    };
  }
}

function isPaymentNotFound(err: unknown) {
  return (
    err instanceof PaymentError &&
    (err as PaymentError & { data?: { type?: string } }).data?.type === "PAYMENT_NOT_FOUND"
  );
}

let lastAutoRunAt = 0;
let autoRunInFlight: Promise<unknown> | null = null;

/**
 * 관리자 결제 관리 화면 조회 시 호출. 1분에 한 번만, 최대 20건씩 정리한다.
 * 실패해도 화면 조회는 막지 않는다.
 */
export async function autoReconcileStalePendingTopUps() {
  if (autoRunInFlight) return autoRunInFlight;
  if (Date.now() - lastAutoRunAt < 60_000) return;
  lastAutoRunAt = Date.now();
  autoRunInFlight = reconcileStalePendingTopUps({ limit: 20 })
    .catch((err) => {
      console.error("[stale-topup-reconcile] failed", err);
    })
    .finally(() => {
      autoRunInFlight = null;
    });
  return autoRunInFlight;
}
