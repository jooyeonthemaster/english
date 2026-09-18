// ============================================================================
// 충전 주문 「진행 중 / 미완료」 표시 분류 — 결제 관리 표·카드·이력 모달·대시보드 공용.
//
// DB 상태는 절대 바꾸지 않는다(spec §9.2 D3). 여기서 하는 일은 「같은 PENDING/WAITING 이
// 화면마다 다른 말로 불리던 것」을 한 판정으로 묶는 것뿐이다.
//  - PENDING(결제창만 열고 이탈): 생성 60분(PENDING_STALE_MINUTES) 초과 → 미완료(이탈·만료)
//  - WAITING_FOR_DEPOSIT(무통장 입금 대기): 자동 매칭 시간창(기본 30분) 초과 → 미완료(이탈·만료)
//    매칭창 값은 이미 NEXT_PUBLIC_ 으로 노출돼 있어 서버·클라이언트가 같은 값을 읽는다(추가 배선 불필요).
// 표시 자구는 「진행 중」 / 「미완료(이탈·만료)」 하나로 고정한다(spec §9.2 F2).
// ============================================================================

import { PENDING_STALE_MINUTES } from "@/lib/admin-revenue-constants";

/** 무통장 입금 자동 매칭 시간창(분). 디렉터 화면·관리자 배지가 같은 값을 쓴다. */
export const BANK_DEPOSIT_MATCH_WINDOW_MINUTES = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
})();

/** 「확인 필요」 카드(실패·취소·환불)의 집계 기간(일). 서버 집계와 화면 문구가 같은 값을 쓴다. */
export const TOPUP_REVIEW_WINDOW_DAYS = 7;

export const TOPUP_PROGRESS_STALE_LABEL = "미완료(이탈·만료)";
export const TOPUP_PROGRESS_ACTIVE_LABEL = "진행 중";

export type TopUpProgressState = "in_progress" | "stale" | "n/a";

export interface TopUpProgress {
  state: TopUpProgressState;
  /** 이 상태에 적용한 시간창(분). state==="n/a" 면 0 */
  windowMinutes: number;
}

/** 상태별 시간창(분). 대기 상태가 아니면 null. */
export function topUpProgressWindowMinutes(status: string): number | null {
  if (status === "PENDING") return PENDING_STALE_MINUTES;
  if (status === "WAITING_FOR_DEPOSIT") return BANK_DEPOSIT_MATCH_WINDOW_MINUTES;
  return null;
}

/**
 * 대기 상태(PENDING/WAITING_FOR_DEPOSIT) 주문이 아직 진행 중인지, 시간창을 넘겨
 * 「미완료(이탈·만료)」로 보아야 하는지. 그 외 상태는 "n/a".
 */
export function classifyTopUpProgress(
  status: string,
  createdAt: Date | string,
  now: number = Date.now(),
): TopUpProgress {
  const windowMinutes = topUpProgressWindowMinutes(status);
  if (windowMinutes == null) return { state: "n/a", windowMinutes: 0 };
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const stale = now - created.getTime() > windowMinutes * 60_000;
  return { state: stale ? "stale" : "in_progress", windowMinutes };
}

/** 표·모달 배지 툴팁 — 원 상태와 판정 근거를 함께 보여준다. */
export function topUpStaleTitle(statusLabel: string, status: string, windowMinutes: number): string {
  return `원 상태: ${statusLabel}(${status}) · 생성 ${windowMinutes}분 초과 — 매출 아님`;
}
