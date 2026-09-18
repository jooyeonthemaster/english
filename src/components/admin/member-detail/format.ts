// 회원 상세 공용 날짜 표기 — 언제나 KST(Asia/Seoul), 값이 없으면 "—".
//
// 자체 `toLocale*` 로 찍으면 안 된다: Vercel 런타임은 UTC 라 timeZone 을 주지 않은
// 포매터는 SSR 에서 하루/아홉 시간 이르게 렌더된다(실측: staff.createdAt 이 UTC 15시
// 이후인 행 64건). 개발 머신은 KST 라 눈으로는 절대 드러나지 않는다.
// 표시 포매터의 단일 소스는 `src/lib/admin-kst-format.ts`(스펙 I1 · F14) —
// 여기서는 그 함수를 회원 상세의 이름으로 다시 내보내기만 한다.
// 게이트: `TZ=UTC npx tsx scripts/analytics-gate-member-kst.ts`

export {
  formatKstDate as formatDate,
  formatKstDateTime as formatDateTime,
} from "@/lib/admin-kst-format";
