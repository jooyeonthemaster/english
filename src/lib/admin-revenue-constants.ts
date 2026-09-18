// 관리자 결제 표시 상수 — 클라이언트 공용(server-only 아님). 매출 정의 본체는 admin-revenue.ts.

/**
 * 결제 대기(PENDING/WAITING)로 보이지만 생성 후 이 시간이 지나면 「미완료(이탈·만료)」로 표시한다
 * (표시 전용 — DB 상태는 바꾸지 않는다, spec §9.2 D3).
 *
 * 값은 서버의 자동 대사 임계(src/lib/stale-topup-reconcile.ts STALE_PENDING_MINUTES = 30)와 **같아야 한다**.
 * 그쪽이 30분 지난 PENDING 을 포트원에 물어 실제로 정리하므로, 표시가 60분이면 30~60분 구간의 주문이
 * 화면에서는 「진행 중」인데 다음 관리자 접속에 취소되는 모순이 생긴다.
 * (그 모듈은 prisma 를 import 하는 서버 전용이라 여기서 직접 import 하지 않고 값을 맞춘다 —
 *  단위테스트 tests/unit/analytics-classify.test.mjs 의 「상수 동기화」 케이스가 두 값을 대조한다.)
 */
export const PENDING_STALE_MINUTES = 30;
