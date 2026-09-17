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
