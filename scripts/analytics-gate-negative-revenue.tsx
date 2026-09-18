/**
 * 게이트: D1 순매출이 음수인 날의 표시 3곳(증감 배지·14일 막대·합계)이 일관되는가.
 *
 * 왜 필요한가 — 대시보드 게이트는 오늘/어제만 본다. 전 기간 스캔으로만 잡히는
 * 음수일(실측 2026-06-10 KST −19,800, 주문 cmq6p1guc… 결제 06/09 22:47 → 환불 06/10 00:25)을
 * 고정 픽스처로 박아 둔다. 계약: docs/analytics/analytics-spec.md §9.2 D1 각주.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics-gate-negative-revenue.tsx        (렌더 단언만)
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/analytics-gate-negative-revenue.tsx --scan  (+ 전 기간 DB 스캔)
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeDelta, DeltaBadge } from "@/components/admin/dashboard/delta-badge";
import { TrendChart } from "@/components/admin/dashboard/trend-chart";
import { formatCurrency } from "@/lib/utils";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`);
  if (!c) fail++;
};

// ── ① 증감 배지: 분모는 |어제|, 부호가 다른 전이는 절대값 표기 ────────────────
ok(computeDelta(19800, -19800).kind === "absolute", "−19,800 → +19,800 은 % 가 아니라 절대값 표기");
ok(computeDelta(19800, -19800).kind === "absolute" && computeDelta(19800, -19800).up, "그 전이는 개선(초록) — 예전엔 빨간 「200% 하락」이었다");
ok(computeDelta(-19800, 19800).kind === "absolute" && !computeDelta(-19800, 19800).up, "+19,800 → −19,800 은 하락");
ok(computeDelta(-19800, 0).kind === "absolute", "어제 0 → 오늘 음수는 초록 「신규」가 아니다");
ok(JSON.stringify(computeDelta(99000, 132000)) === JSON.stringify({ kind: "pct", pct: -25, up: false }), "양수 구간은 기존대로 −25%");
const badge = renderToStaticMarkup(<DeltaBadge today={19800} yesterday={-19800} format={formatCurrency} />);
ok(badge.includes(`이전 ${formatCurrency(-19800)}`), "배지 문구가 「이전 -₩19,800」");
ok(badge.includes("text-emerald-600"), "배지 색이 초록");

// ── ② 14일 차트: 음수일 막대가 사라지지 않고, 합계와 어긋나지 않는다 ──────────
const fixture = [
  { date: "06/09", revenue: 19800, signups: 2 },
  { date: "06/10", revenue: -19800, signups: 0 },
  { date: "06/11", revenue: 49500, signups: 1 },
];
const svg = renderToStaticMarkup(<TrendChart data={fixture} />);
const bars = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"[^>]*class="([^"]*)"/g)].map((m) => ({ h: Number(m[1]), cls: m[2] }));
const gray = bars.filter((b) => b.cls.includes("fill-gray-400"));
ok(gray.length === 1 && gray[0].h >= 2, `음수일 막대 회색 ${gray.length}개·높이 ${gray[0]?.h ?? 0}px(예전엔 0px 로 소실)`);
ok(svg.includes(`환불 ${formatCurrency(-19800)}`), "막대 툴팁에 환불 금액");
ok(svg.includes(`14일 매출 합계 ${formatCurrency(49500)}`), "합계가 환불을 뺀 값과 일치");
ok(svg.includes("환불 차감 포함"), "합계 옆 근거 문구");

// ── ③ (선택) 전 기간 스캔 — 새 음수일이 생기면 픽스처를 갱신하라 ─────────────
async function scan() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const K = `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'`;
  const rows = await p.$queryRawUnsafe<Array<{ d: Date; net: number }>>(`
    with u as (
      select coalesce("paidAt","completedAt") t, coalesce("paidAmount",price) v from credit_top_ups where status in ('COMPLETED','REFUNDED') and coalesce("paidAt","completedAt") is not null
      union all select coalesce("cancelledAt","updatedAt"), -coalesce("paidAmount",price) from credit_top_ups where status='REFUNDED'
      union all select coalesce("paidAt","completedAt"), coalesce("paidAmount",amount) from subscription_payments where status='PAID' and coalesce("paidAt","completedAt") is not null
      union all select coalesce("occurredAt","receivedAt"), amount from bank_deposit_notifications where status='MANUAL_GRANT')
    select (t ${K})::date d, sum(v)::int net from u group by 1 having sum(v) < 0 order by 1`);
  console.log(`\n전 기간 음수 순매출일 ${rows.length}건: ${rows.map((r) => `${String(r.d).slice(0, 10)} ${r.net}`).join(", ") || "없음"}`);
  await p.$disconnect();
}

(async () => {
  if (process.argv.includes("--scan")) await scan();
  console.log(fail === 0 ? "\nGATE PASS" : `\nGATE FAIL ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
})();
