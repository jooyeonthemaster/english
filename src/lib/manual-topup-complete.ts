import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 수동 충전 완료 처리
 *
 * 무통장입금(또는 결제 실패 후) 주문에 대해 관리자가 시스템 밖에서 이미 크레딧을
 * 지급한 경우, 주문 레코드만 완료 상태로 정리한다. 크레딧은 추가 지급하지 않는다.
 *
 * status 는 COMPLETED 로 두고 customData.manualGrant 마커를 남긴다(§credit-topup-status).
 * 그래야 매출 집계·고객 화면·어드민 통계가 기존 경로를 그대로 탄다.
 *
 * 두 가지 이중계상을 막는다:
 *  1. 이중지급 — 이미 creditTransactionId 가 있는(정상 지급된) 주문은 거부.
 *     또한 완료 처리 후에는 grantBankDepositTopUp 이 멱등 분기로 빠진다.
 *  2. 이중집계 — 같은 입금을 MANUAL_GRANT 입금알림으로도 매출에 넣고 있으면
 *     (operations-cost 가 알림 금액을 매출에 더한다) 합계가 두 배가 된다.
 *     후보를 찾아 경고하고, 연결하면 알림을 MATCHED 로 돌려 알림 쪽 집계에서 뺀다.
 */

/** 같은 입금을 가리킬 수 있는 MANUAL_GRANT 알림을 찾는 시간 반경. */
const DUPLICATE_LOOKBACK_DAYS = 7;
/** 수동지급 후보 크레딧 거래를 찾는 시간 반경. */
const CANDIDATE_TX_WINDOW_DAYS = 14;

export class ManualCompleteError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "INVALID_STATUS"
      | "ALREADY_CREDITED"
      | "DUPLICATE_RISK"
      | "INVALID_TRANSACTION"
      | "INVALID_NOTIFICATION",
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ManualCompleteError";
  }
}

export type DuplicateCandidate = {
  id: string;
  amount: number;
  depositorName: string | null;
  status: string;
  receivedAt: Date;
};

export type ManualCompleteInput = {
  topUpId: string;
  adminId: string;
  /** 실제 입금 시각(ISO). 매출이 잡힐 날짜를 결정한다. 미지정 시 현재 시각. */
  paidAt?: string;
  note?: string;
  /** 이미 지급된 크레딧 거래(보통 관리자 ADJUSTMENT)를 이 주문에 연결 */
  creditTransactionId?: string;
  /** 중복집계 위험이 있는 입금알림을 이 주문에 연결(→ MATCHED 전환) */
  linkNotificationId?: string;
  /** 중복 경고를 확인하고도 진행 */
  confirmDuplicate?: boolean;
};

export type ManualCompleteResult = {
  topUpId: string;
  status: string;
  price: number;
  creditAmount: number;
  paidAt: Date;
  linkedCreditTransactionId: string | null;
  linkedNotificationId: string | null;
};

/** 이 주문과 같은 입금을 가리킬 수 있는 미연결 MANUAL_GRANT 알림 후보. */
export async function findDuplicateNotificationCandidates(params: {
  price: number;
  around: Date;
}): Promise<DuplicateCandidate[]> {
  const span = DUPLICATE_LOOKBACK_DAYS * 24 * 3600 * 1000;
  return prisma.bankDepositNotification.findMany({
    where: {
      status: "MANUAL_GRANT",
      matchedTopUpId: null,
      amount: params.price,
      receivedAt: {
        gte: new Date(params.around.getTime() - span),
        lte: new Date(params.around.getTime() + span),
      },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      amount: true,
      depositorName: true,
      status: true,
      receivedAt: true,
    },
  });
}

/**
 * 이 주문에 연결할 만한 "관리자가 이미 지급한" 크레딧 거래 후보.
 * 같은 학원 / 증가 거래 / 주문 생성 시각 전후 14일 / 아직 다른 주문에 연결되지 않은 것.
 */
export async function findManualGrantTransactionCandidates(params: {
  academyId: string;
  around: Date;
}) {
  const span = CANDIDATE_TX_WINDOW_DAYS * 24 * 3600 * 1000;
  const rows = await prisma.creditTransaction.findMany({
    where: {
      academyId: params.academyId,
      amount: { gt: 0 },
      type: { in: ["ADJUSTMENT", "TOP_UP", "ALLOCATION"] },
      createdAt: {
        gte: new Date(params.around.getTime() - span),
        lte: new Date(params.around.getTime() + span),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      amount: true,
      balanceAfter: true,
      description: true,
      adminId: true,
      createdAt: true,
      creditTopUp: { select: { id: true } },
    },
  });
  // 이미 다른 주문에 물려 있는 거래는 제외(creditTransactionId 가 @unique).
  return rows
    .filter((r) => !r.creditTopUp)
    .map(({ creditTopUp: _ignored, ...rest }) => rest);
}

export async function manualCompleteTopUp(
  input: ManualCompleteInput,
): Promise<ManualCompleteResult> {
  const topUp = await prisma.creditTopUp.findUnique({
    where: { id: input.topUpId },
    select: {
      id: true,
      academyId: true,
      price: true,
      creditAmount: true,
      status: true,
      customData: true,
      creditTransactionId: true,
      createdAt: true,
    },
  });
  if (!topUp) {
    throw new ManualCompleteError("NOT_FOUND", "충전 주문을 찾을 수 없습니다.");
  }

  if (topUp.creditTransactionId) {
    throw new ManualCompleteError(
      "ALREADY_CREDITED",
      "이 주문은 이미 시스템을 통해 크레딧이 지급된 건입니다. 수동 완료 처리 대상이 아닙니다.",
    );
  }
  if (topUp.status !== "WAITING_FOR_DEPOSIT" && topUp.status !== "PENDING") {
    throw new ManualCompleteError(
      "INVALID_STATUS",
      `입금 대기 또는 결제 대기 주문만 수동 완료 처리할 수 있습니다. (현재: ${topUp.status})`,
    );
  }

  // 연결할 크레딧 거래 검증 — 같은 학원의 증가 거래이고, 다른 주문에 안 물려 있어야 한다.
  let linkedTxId: string | null = null;
  if (input.creditTransactionId) {
    const tx = await prisma.creditTransaction.findUnique({
      where: { id: input.creditTransactionId },
      select: {
        id: true,
        academyId: true,
        amount: true,
        creditTopUp: { select: { id: true } },
      },
    });
    if (!tx || tx.academyId !== topUp.academyId) {
      throw new ManualCompleteError(
        "INVALID_TRANSACTION",
        "연결하려는 크레딧 거래를 찾을 수 없거나 다른 학원의 거래입니다.",
      );
    }
    if (tx.amount <= 0) {
      throw new ManualCompleteError(
        "INVALID_TRANSACTION",
        "지급(증가) 거래만 연결할 수 있습니다.",
      );
    }
    if (tx.creditTopUp && tx.creditTopUp.id !== topUp.id) {
      throw new ManualCompleteError(
        "INVALID_TRANSACTION",
        "이미 다른 충전 주문에 연결된 거래입니다.",
      );
    }
    linkedTxId = tx.id;
  }

  // 이중집계 방지 — 같은 금액의 미연결 MANUAL_GRANT 알림이 있으면 경고하고 멈춘다.
  let linkedNotificationId: string | null = null;
  if (input.linkNotificationId) {
    const noti = await prisma.bankDepositNotification.findUnique({
      where: { id: input.linkNotificationId },
      select: { id: true, status: true, matchedTopUpId: true },
    });
    if (!noti || noti.status === "MATCHED" || noti.matchedTopUpId) {
      throw new ManualCompleteError(
        "INVALID_NOTIFICATION",
        "연결하려는 입금 알림이 없거나 이미 다른 주문에 연결되어 있습니다.",
      );
    }
    linkedNotificationId = noti.id;
  } else if (!input.confirmDuplicate) {
    const candidates = await findDuplicateNotificationCandidates({
      price: topUp.price,
      around: topUp.createdAt,
    });
    if (candidates.length > 0) {
      throw new ManualCompleteError(
        "DUPLICATE_RISK",
        "같은 금액의 '수동지급' 입금 알림이 있습니다. 그대로 진행하면 매출이 두 번 집계됩니다.",
        { candidates },
      );
    }
  }

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw new ManualCompleteError("INVALID_STATUS", "입금 시각이 올바르지 않습니다.");
  }
  const now = new Date();
  const note = input.note?.trim() || null;

  const nextCustomData = {
    ...(topUp.customData && typeof topUp.customData === "object" && !Array.isArray(topUp.customData)
      ? (topUp.customData as Record<string, unknown>)
      : {}),
    manualGrant: {
      adminId: input.adminId,
      at: now.toISOString(),
      note,
      paidAt: paidAt.toISOString(),
      linkedCreditTransactionId: linkedTxId,
      linkedNotificationId,
    },
  } as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    if (linkedNotificationId) {
      // MATCHED 로 돌리면 operations-cost 의 MANUAL_GRANT 매출 쿼리에서 빠져
      // 주문(COMPLETED) 쪽으로만 매출이 잡힌다.
      await tx.bankDepositNotification.update({
        where: { id: linkedNotificationId },
        data: {
          status: "MATCHED",
          matchedTopUpId: topUp.id,
          note: `관리자(${input.adminId})가 수동 충전 완료 처리하며 주문에 연결함.`,
          processedAt: now,
        },
      });
    }

    await tx.creditTopUp.update({
      where: { id: topUp.id },
      data: {
        status: "COMPLETED",
        paidAmount: topUp.price,
        paidAt,
        completedAt: now,
        verifiedAt: now,
        failureCode: null,
        failureMessage: null,
        customData: nextCustomData,
        ...(linkedTxId ? { creditTransactionId: linkedTxId } : {}),
      },
    });
  });

  return {
    topUpId: topUp.id,
    status: "COMPLETED",
    price: topUp.price,
    creditAmount: topUp.creditAmount,
    paidAt,
    linkedCreditTransactionId: linkedTxId,
    linkedNotificationId,
  };
}
