import { normalizeDepositorName } from "@/lib/bank-deposit";

/**
 * PG사 정산금 입금 판별.
 *
 * 카드 결제 대금은 PG사((주)다날)가 모아서 같은 계좌로 정산 입금한다. 이 입금은 크레딧
 * 주문과 무관한데, 무통장입금 알림으로 함께 들어와 "미매칭"으로 쌓였다. 더 위험한 건
 * 입금자명이 비면 매칭이 금액+시간창만으로 폴백한다는 점이다 — 정산금이 우연히 대기
 * 주문 금액과 같으면 엉뚱한 학원에 크레딧이 지급될 수 있다. 그래서 매칭 전에 걸러낸다.
 *
 * 기본 대상은 다날. 다른 PG 가 추가되면 env BANK_DEPOSIT_SETTLEMENT_DEPOSITORS
 * (쉼표 구분, 예: "다날,KG이니시스")로 교체한다.
 */

const DEFAULT_SETTLEMENT_DEPOSITORS = ["다날"];

/** "(주)다날", "㈜다날", "주식회사 다날", "다날(주)" → "다날". */
function stripCorporateMarks(name: string): string {
  return name
    .replace(/\(주\)|㈜|주식회사/g, "")
    .trim();
}

function getSettlementDepositors(): string[] {
  const raw = process.env.BANK_DEPOSIT_SETTLEMENT_DEPOSITORS?.trim();
  const list = raw ? raw.split(",") : DEFAULT_SETTLEMENT_DEPOSITORS;
  return list
    .map((name) => normalizeDepositorName(stripCorporateMarks(name)))
    .filter(Boolean);
}

/** 입금자명이 PG 정산 법인이면 그 이름을, 아니면 null. */
export function detectPgSettlementDepositor(
  depositorName: string | null | undefined,
): string | null {
  if (!depositorName) return null;
  const core = normalizeDepositorName(stripCorporateMarks(depositorName));
  if (!core) return null;
  return getSettlementDepositors().includes(core) ? depositorName.trim() : null;
}

export function pgSettlementIgnoreNote(depositor: string) {
  return `PG사 정산금(${depositor}) — 크레딧 주문과 무관해 자동 무시`;
}

/**
 * 통장 이자 입금 판별.
 *
 * 은행이 예금 이자를 넣을 때 입금자명 자리에 "예금결산"을 찍는다(우리은행 알림 실측:
 * "입금 84원 / 예금결산"). 크레딧 주문과 무관한데 "미매칭"으로 쌓여 관리자 미확인 입금
 * 건수를 부풀렸다. PG 정산금과 같은 이유로 매칭 전에 무시 처리한다.
 */
const BANK_INTEREST_DEPOSITORS = ["예금결산"].map((name) => normalizeDepositorName(name));

export function detectBankInterestDepositor(
  depositorName: string | null | undefined,
): string | null {
  const core = normalizeDepositorName(depositorName);
  if (!core) return null;
  return BANK_INTEREST_DEPOSITORS.includes(core) ? depositorName!.trim() : null;
}

export function bankInterestIgnoreNote(depositor: string) {
  return `통장 이자(${depositor}) — 크레딧 주문과 무관해 자동 무시`;
}

export type NonOrderDeposit = {
  reason: "PG_SETTLEMENT" | "BANK_INTEREST";
  note: string;
};

/** 주문과 무관한 입금(PG 정산금·통장 이자)이면 무시 사유를, 아니면 null. */
export function classifyNonOrderDeposit(
  depositorName: string | null | undefined,
): NonOrderDeposit | null {
  const settlement = detectPgSettlementDepositor(depositorName);
  if (settlement) {
    return { reason: "PG_SETTLEMENT", note: pgSettlementIgnoreNote(settlement) };
  }
  const interest = detectBankInterestDepositor(depositorName);
  if (interest) {
    return { reason: "BANK_INTEREST", note: bankInterestIgnoreNote(interest) };
  }
  return null;
}
