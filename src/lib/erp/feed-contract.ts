// ============================================================
//  ERP 매출 피드 계약 (smoat.co.kr 쪽 사본)
// ------------------------------------------------------------
//  본사 ERP(NEANDER)가 SMOAT 매출을 자동으로 가져가는 창구의 약속이다.
//  정본은 ERP 저장소의 `lib/neander/sync/contract.ts` 이고 이 파일은 사본이다
//  — 두 저장소가 서로를 import 할 수 없어서 복사해 둔다.
//
//  ⚠️ 계약을 바꾸면 FEED_VERSION 을 올리고 양쪽을 함께 고친다. 판이 어긋나면
//     ERP 가 동기화를 **멈춘다** — 조용히 틀린 숫자를 쌓는 것보다 낫다.
//
//  ⚠️ 개인정보는 싣지 않는다. 원장(DIRECTOR)의 이름·이메일·전화는 이
//     피드에 없다. 학원 이름까지만 보낸다 — 그게 있어야 장부의 입금자명과
//     맞춰 볼 수 있다.
// ============================================================

/**
 * 계약 판 — ERP 와 다르면 ERP 가 동기화를 멈춘다.
 *   1  첫 판
 *   2  커서를 (updatedAt, id) 짝으로 · 무통장 통째 보내기
 */
export const FEED_VERSION = 2;

export const FEED_SOURCE = "smoat" as const;

/**
 * 응답 봉투.
 *
 * 온라인 피드는 주문 줄 하나만 실어 `rows` 로 보내지만, SMOAT 은 결제 줄과
 * 월별 원가라는 **성격이 다른 둘**을 함께 보낸다. 억지로 한 배열에 섞지
 * 않고 payload 로 나눈다.
 */
export interface SmoatFeedEnvelope {
  version: number;
  source: typeof FEED_SOURCE;
  /** 읽기 시작한 시각 (ms) */
  serverTime: number;
  /** 이번 응답의 마지막 수정 시각 (ms) — ERP 화면 표시용 */
  cursor: number;
  /**
   * 다음 호출의 after 로 돌려받을 열쇠 — `updatedAt ISO|id`.
   * 같은 ms 에 바뀐 줄이 한 쪽보다 많아도 커서가 늘 앞으로 가게 짝으로 둔다.
   */
  cursorKey: string;
  /** false 면 아직 남았다 */
  complete: boolean;
  payload: SmoatFeedPayload;
}

export type SmoatSaleKind = "topup" | "deposit" | "subscription";

export interface SmoatSaleRow {
  id: string;
  kind: SmoatSaleKind;
  /** 결제 확정 시각 (ISO). null 이면 아직 매출이 아니다 */
  paidAt: string | null;
  updatedAt: string;
  status: string;
  /** 우리가 판정한 "이건 매출이다" */
  revenue: boolean;
  /**
   * 매출이 아닌 이유.
   * duplicate = 이미 다른 줄로 세고 있는 건 (충전에 연결된 입금 알림 등)
   */
  excluded?: "pending" | "failed" | "cancelled" | "refunded" | "test" | "duplicate";
  /** 결제액 (환불 전) */
  amount: number;
  refundAmount: number;
  refundedAt: string | null;
  /** CARD · VIRTUAL_ACCOUNT · TRANSFER · EASY_PAY · MOBILE · BANK */
  paymentMethod: string;
  pgTxId?: string;
  /** 학원 */
  accountId: string;
  accountName: string;
  /** 무엇을 샀나 */
  packLabel?: string;
  credits?: number;
  planTier?: string;
  periodStart?: string;
  periodEnd?: string;
}

/**
 * 월별 원가·크레딧 — SMOAT 의 변동비는 AI 호출 비용이다.
 *
 * 결제와 성격이 달라 줄이 아니라 월 집계로 보낸다. 사이트가 달러로
 * 기록하므로 환산 전후를 모두 싣는다.
 */
export interface SmoatMonthlyCostRow {
  /** YYYY-MM (KST) */
  month: string;
  aiUsd: number;
  aiKrw: number;
  fxRate?: number;
  creditsSold: number;
  creditsUsed: number;
  updatedAt: string;
}

export interface SmoatFeedPayload {
  /** 충전·구독 — since 뒤로 바뀐 것만 */
  sales: SmoatSaleRow[];
  costs: SmoatMonthlyCostRow[];
  /**
   * 처리된 무통장 알림 **전부** (커서와 무관). ERP 는 여기 없는 수기 지급
   * 줄을 지운다 — 충전에 연결되거나 무시로 바뀐 입금이 두 번 잡히지 않게.
   */
  deposits: SmoatSaleRow[];
  /** false 면 한도에 닿아 전부가 아니다 — ERP 는 지우기를 건너뛴다 */
  depositsComplete: boolean;
}

/**
 * 매출로 인정하는 충전 상태 — **ERP 쪽 계약의 사본이지 우리 정의가 아니다.**
 *
 * ⚠️ 이름이 같은 `REVENUE_TOPUP_STATUSES` 가 `src/lib/admin-revenue.ts` 에도
 *    있고 값이 다르다(`["COMPLETED", "REFUNDED"]`). 관리자 콘솔의 매출 정의는
 *    **그쪽**이 단일 진실원이다(계약 I9): 환불된 충전도 결제일에는 매출이었고
 *    환불은 환불일에 뺀다. 이 상수는 ERP 가 읽는 판의 사본일 뿐이고 이
 *    저장소의 어떤 집계에도 쓰이지 않는다 — 자동완성으로 이걸 집어 오면
 *    매출이 조용히 줄어든다. 매출을 셀 일이 있으면 `@/lib/admin-revenue` 에서
 *    가져올 것.
 */
export const REVENUE_TOPUP_STATUSES = ["COMPLETED"] as const;

/**
 * 피드에 올리는 충전 상태 — 매출이 된 적이 있거나 될 수 있는 것만.
 *
 * PENDING·WAITING_FOR_DEPOSIT 은 아직 아무 일도 일어나지 않은 줄이라
 * 보내지 않는다. 결제가 되면 updatedAt 이 움직여 다음 증분에 들어온다.
 */
export const FEEDABLE_TOPUP_STATUSES = [
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
  "FAILED",
] as const;
