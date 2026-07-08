import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeDepositorName } from "@/lib/bank-deposit";

/**
 * 단체 세미나 참가 보증금 — 무통장입금 자동확인.
 *
 * 크레딧 무통장입금(lib/bank-deposit.ts)과 완전히 동일한 매칭 방식:
 *   금액(depositAmount) + 입금자명(depositorName) + 시간창으로 대기중(WAITING)
 *   신청 1건을 찾아 PAID(입금확인)로 확정한다.
 *
 * bank-notify 웹훅에서 크레딧 매칭이 UNMATCHED일 때 이어서 호출된다.
 * 환급(출금)은 자동 송금이 불가하므로 관리자가 수동으로 REFUNDED 처리한다.
 */

// 세미나 보증금 매칭 시간창 — 크레딧(즉시결제, 30분)과 달리 원장이 신청 후
// 몇 시간~며칠 뒤에 입금할 수 있으므로 넉넉하게 잡는다(기본 7일).
export const SEMINAR_DEPOSIT_MATCH_WINDOW_MINUTES = 7 * 24 * 60;

export type SeminarDepositInput = {
  amount: number;
  depositorName: string | null;
  occurredAt: Date | null;
};

export type SeminarMatchOutcome =
  | { status: "MATCHED"; registrationId: string }
  | { status: "UNMATCHED" }
  | { status: "AMBIGUOUS"; candidateIds: string[] };

/**
 * 대기중(WAITING) 보증금 신청 중 정확한 금액 + 정규화된 입금자명 + 시간창에
 * 맞는 단 1건을 찾는다. 0건→UNMATCHED, 1건→MATCHED, 2건+→AMBIGUOUS(관리자 확인).
 */
export async function matchSeminarDeposit(
  input: SeminarDepositInput,
  windowMinutes: number,
): Promise<SeminarMatchOutcome> {
  const windowStart = new Date(
    (input.occurredAt ?? new Date()).getTime() - windowMinutes * 60_000,
  );

  const candidates = await prisma.groupSeminarRegistration.findMany({
    where: {
      depositStatus: "WAITING",
      depositAmount: input.amount,
      createdAt: { gte: windowStart },
    },
    select: { id: true, depositorName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const wanted = normalizeDepositorName(input.depositorName);
  const matches = candidates.filter((c) => {
    const stored = c.depositorName;
    // 양쪽 다 입금자명이 없으면 금액+시간창만으로(단일매칭 시에만 확정).
    if (!wanted || !stored) return true;
    return normalizeDepositorName(stored) === wanted;
  });

  if (matches.length === 1) {
    return { status: "MATCHED", registrationId: matches[0].id };
  }
  if (matches.length === 0) return { status: "UNMATCHED" };
  return { status: "AMBIGUOUS", candidateIds: matches.map((m) => m.id) };
}

export type SeminarGrantResult = {
  registrationId: string;
  confirmed: boolean; // 이번 호출로 WAITING→PAID 전환됐는지(멱등)
};

/**
 * 매칭된 보증금 신청을 PAID(입금확인)로 확정. 행 잠금 + 멱등(이미 PAID면 재확정 안 함).
 */
export async function grantSeminarDeposit(
  registrationId: string,
  deposit: { amount: number; externalId: string },
): Promise<SeminarGrantResult> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; depositStatus: string }>
      >`
        SELECT id, "depositStatus"
        FROM group_seminar_registrations
        WHERE id = ${registrationId}
        FOR UPDATE
      `;
      const reg = rows[0];
      if (!reg) return { registrationId, confirmed: false };

      // 멱등: 이미 확정/환급/몰수된 건은 재처리하지 않음.
      if (reg.depositStatus !== "WAITING") {
        return { registrationId, confirmed: false };
      }

      await tx.groupSeminarRegistration.update({
        where: { id: registrationId },
        data: {
          depositStatus: "PAID",
          depositPaidAt: new Date(),
          depositRef: deposit.externalId,
        },
      });
      return { registrationId, confirmed: true };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}
