import { NextResponse } from "next/server";
import { checkBalance } from "@/lib/credits";

/**
 * 잡 행을 만들기 **전**의 비차감 잔액 게이트.
 *
 * 왜 필요한가(26-09-08 실구매 학원 전수조사): 지문 분석·학습지 라우트 3곳은
 * 잡 행을 먼저 만들고 ~1,000줄 뒤에서 과금했다. 잔액 0 학원이 학습지 13지문을
 * 한 번에 발사하자 12초 안에 FAILED 잡 13행 + 「Insufficient credits」 영문 토스트
 * 13개가 떴다(With김쌤 8/19·9/3, 총 25건). 문제생성 라우트에는 2026-06-09
 * 1,482건 사건 뒤 같은 게이트가 있었고 지문 분석만 빠져 있었다.
 *
 * 최종 권위는 여전히 ensureWorkbenchAiJobCharged 의 원자적 차감(balance gte)이다.
 * 이 게이트는 doomed 잡을 안 만드는 최적화이자 사용자에게 한국어로 사유를
 * 말하는 자리다. checkBalance 는 만료 크레딧을 먼저 정리(sweep)하므로 만료로
 * 사라진 잔액을 있다고 믿는 오통과가 없다.
 */
export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS" as const;

export function insufficientCreditsMessage(balance: number, required: number): string {
  return `크레딧이 부족합니다 (보유 ${balance} / 필요 ${required}). 크레딧 관리에서 충전한 뒤 다시 눌러 주세요.`;
}

export type CreditPreflightResult =
  | { ok: true; balance: number }
  | { ok: false; balance: number; required: number; response: NextResponse };

export async function preflightCreditGate(input: {
  academyId: string;
  requiredCredits: number;
}): Promise<CreditPreflightResult> {
  const required = Math.max(0, Math.floor(input.requiredCredits));
  const { balance } = await checkBalance(input.academyId);
  if (required === 0 || balance >= required) return { ok: true, balance };
  return {
    ok: false,
    balance,
    required,
    response: NextResponse.json(
      {
        // `error` 는 카드·토스트에 그대로 뜨는 자구라 한국어로 둔다. 기존 소비처가
        // 읽는 balance/required(웹툰 모달)·status 402(analysis-rail 일괄)는 유지.
        error: insufficientCreditsMessage(balance, required),
        code: INSUFFICIENT_CREDITS_CODE,
        balance,
        required,
      },
      { status: 402 },
    ),
  };
}
