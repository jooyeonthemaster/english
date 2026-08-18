/**
 * 카드사별 결제 한도 (환금성 업종 분류)
 *
 * 출처: 다날 가맹점 회신 2026-08-17 (CPID A010016179, 첨부 "포인트충전 RM_12개").
 * 네안데르가 "포인트 충전" 업종으로 분류돼 카드사별 한도가 걸려 있다. 한도 초과 건은
 * 카드 승인 요청 자체가 나가지 않아(pg_tid 미발급) PG 응답이 전부 "사용자가 결제를
 * 취소하셨습니다"로 뭉개진다 — 그래서 사용자는 원인을 알 수 없다. 이 모듈은 결제 전·후에
 * "어떤 카드로 결제 가능한지"를 알려주기 위한 것이다.
 *
 * 비고의 "카드사 자체 적용(당사적용X)"(비씨·국민)은 다날이 아니라 카드사가 직접 막는다는
 * 뜻이라 차단 지점만 다르고 결과는 같다.
 *
 * ⚠ 한도는 다날/카드사 정책이라 언제든 바뀐다. 갱신 회신을 받으면 이 표만 고치면 된다.
 * ⚠ 실측 불일치: 49,500원은 이 표상 전 카드사 통과여야 하는데 실제로 3건 모두 실패했다
 *   (26-07-16 / 07-22 / 07-26). 표에 없는 한도가 있거나 표가 최신이 아닐 수 있어
 *   다날에 재확인이 필요하다. 아래 계산은 회신받은 표를 그대로 따른다.
 */

export type CardIssuerLimit = {
  /** 카드사 표시명 */
  name: string;
  /** 1회 결제 한도(원). null = 제한 없음 */
  oncePerPayment: number | null;
  /** 1일 누적 한도(원). null = 제한 없음 */
  perDay: number | null;
  /** 1월 누적 한도(원). null = 제한 없음 */
  perMonth: number | null;
  /** 1일 결제 건수 제한. null = 제한 없음 */
  countPerDay: number | null;
  /** 카드사가 직접 적용(다날 미적용) */
  enforcedByIssuer: boolean;
};

export const CARD_PAYMENT_LIMITS: CardIssuerLimit[] = [
  { name: "비씨카드", oncePerPayment: 50_000, perDay: 200_000, perMonth: null, countPerDay: null, enforcedByIssuer: true },
  { name: "국민카드", oncePerPayment: null, perDay: 200_000, perMonth: null, countPerDay: null, enforcedByIssuer: true },
  { name: "하나카드", oncePerPayment: null, perDay: 1_000_000, perMonth: null, countPerDay: null, enforcedByIssuer: false },
  { name: "롯데카드", oncePerPayment: null, perDay: 500_000, perMonth: null, countPerDay: null, enforcedByIssuer: false },
  { name: "우리카드", oncePerPayment: null, perDay: 300_000, perMonth: null, countPerDay: null, enforcedByIssuer: false },
  { name: "현대카드", oncePerPayment: 110_000, perDay: 550_000, perMonth: null, countPerDay: 5, enforcedByIssuer: false },
  { name: "삼성카드", oncePerPayment: 500_000, perDay: null, perMonth: 500_000, countPerDay: null, enforcedByIssuer: false },
  { name: "신한카드", oncePerPayment: 50_000, perDay: null, perMonth: null, countPerDay: null, enforcedByIssuer: false },
  { name: "농협카드", oncePerPayment: 100_000, perDay: 500_000, perMonth: null, countPerDay: 10, enforcedByIssuer: false },
];

export type CardLimitVerdict = {
  /** 이 금액을 1회 결제로 통과시킬 수 있는 카드사 */
  allowed: string[];
  /** 1회 결제만으로 이미 한도를 넘는 카드사 + 사유 */
  blocked: Array<{ name: string; reason: string }>;
};

function formatKrw(value: number): string {
  if (value >= 10_000 && value % 10_000 === 0) {
    return `${(value / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

/**
 * 단건 결제 금액 기준으로 카드사를 통과/차단으로 가른다.
 * 누적(일·월) 한도는 그날 다른 결제가 없다는 가정 — 즉 여기서 "통과"로 나와도
 * 같은 날 다른 결제가 있었다면 막힐 수 있다. 낙관적 판정임에 유의.
 */
export function evaluateCardLimits(amount: number): CardLimitVerdict {
  const allowed: string[] = [];
  const blocked: Array<{ name: string; reason: string }> = [];

  for (const issuer of CARD_PAYMENT_LIMITS) {
    const reasons: string[] = [];
    if (issuer.oncePerPayment !== null && amount > issuer.oncePerPayment) {
      reasons.push(`1회 ${formatKrw(issuer.oncePerPayment)}`);
    }
    if (issuer.perDay !== null && amount > issuer.perDay) {
      reasons.push(`1일 ${formatKrw(issuer.perDay)}`);
    }
    if (issuer.perMonth !== null && amount > issuer.perMonth) {
      reasons.push(`1개월 ${formatKrw(issuer.perMonth)}`);
    }
    if (reasons.length > 0) {
      blocked.push({ name: issuer.name, reason: `${reasons.join(" · ")} 한도` });
    } else {
      allowed.push(issuer.name);
    }
  }

  return { allowed, blocked };
}

/** 이 금액에 한도 제약이 걸리는 카드사가 하나라도 있는가. */
export function hasCardLimitRisk(amount: number): boolean {
  return evaluateCardLimits(amount).blocked.length > 0;
}
