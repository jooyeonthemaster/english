const SUPPORTED_TOP_UP_PAY_METHODS = [
  "CARD",
  "EASY_PAY",
  "TRANSFER",
  "VIRTUAL_ACCOUNT",
  "MOBILE",
] as const;

type PublicTopUpPayMethod = (typeof SUPPORTED_TOP_UP_PAY_METHODS)[number];

export const PAYMENT_PG_NAME =
  process.env.NEXT_PUBLIC_PAYMENT_PG_NAME?.trim() || "다날";

export const PUBLIC_TOP_UP_PAY_METHODS = getPublicTopUpPayMethods();

export const CREDIT_TOP_UP_CARD_ONLY =
  PUBLIC_TOP_UP_PAY_METHODS.length === 1 &&
  PUBLIC_TOP_UP_PAY_METHODS[0] === "CARD";

export const CREDIT_TOP_UP_PAY_METHODS_TEXT = CREDIT_TOP_UP_CARD_ONLY
  ? "신용카드"
  : "카드, 간편결제, 계좌이체, 가상계좌, 휴대폰";

export const CREDIT_TOP_UP_COMPLETION_TEXT = CREDIT_TOP_UP_CARD_ONLY
  ? "신용카드 결제 승인 확인 후"
  : "카드, 간편결제, 계좌이체, 휴대폰 결제 승인 또는 가상계좌 입금 확인 후";

export const CREDIT_TOP_UP_REFUND_ACCOUNT_TEXT = CREDIT_TOP_UP_CARD_ONLY
  ? "계좌 환불이 필요한 예외적인 경우에만"
  : "가상계좌·계좌이체 등 계좌 환불이 필요한 경우에만";

function getPublicTopUpPayMethods(): PublicTopUpPayMethod[] {
  const raw = process.env.NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS ?? "CARD";
  const methods = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof SUPPORTED_TOP_UP_PAY_METHODS)[number] =>
      (SUPPORTED_TOP_UP_PAY_METHODS as readonly string[]).includes(value),
    );

  return methods.length ? Array.from(new Set(methods)) : ["CARD"];
}
