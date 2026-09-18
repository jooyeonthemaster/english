// 관리자 결제 표시 상수 — 클라이언트 공용(server-only 아님). 매출 정의 본체는 admin-revenue.ts.

/** 결제 대기(PENDING/WAITING)로 보이지만 생성 후 이 시간이 지나면 「미완료(이탈·만료)」로 표시한다(DB 상태 불변, spec §9.2 D3). */
export const PENDING_STALE_MINUTES = 60;
