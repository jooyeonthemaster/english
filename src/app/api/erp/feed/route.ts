// ============================================================
//  ERP 매출 피드 — 본사 ERP 가 SMOAT 결제를 끌어가는 창구
// ------------------------------------------------------------
//  본사 ERP(NEANDER)의 매출 워크스페이스에는 지금까지 SMOAT 이 없었다.
//  회사 장부에는 다날 정산 입금과 계좌이체가 「SMOAT매출」로 잡혀 있지만,
//  **누가 어떤 팩을 샀는지**는 이 서비스 안에만 있었다. 이 라우트가 그
//  줄을 넘긴다.
//
//  ⚠️ **읽기 전용이다.** 이 파일은 어떤 테이블도 쓰지 않는다.
//  ⚠️ 개인정보는 고르지 않는다 — select 에 원장(Staff)의 이름·이메일·전화가
//     없다는 사실이 이 약속의 실제 이행이다. 학원 이름까지만 나간다.
//
//  무엇이 매출인가는 /admin/costs 의 판정과 **같은 규칙**을 쓴다
//  (src/actions/admin/operations-cost.ts):
//    · 크레딧 충전  status = COMPLETED, 금액 = paidAmount ?? price
//    · 구독 결제    status = PAID,      금액 = paidAmount ?? amount
//    · 무통장 수기  status = MANUAL_GRANT (충전 레코드가 없는 실입금)
//  달라진 점 하나 — **환불을 뺀다.** /admin/costs 는 환불된 건을 상태로만
//  걸러서 부분취소가 매출에 그대로 남아 있다. 피드는 취소액을 실어 보내고
//  ERP 가 차감한다. 두 화면의 숫자가 다르면 이쪽이 맞다.
//
//  부르는 법:
//    GET /api/erp/feed?since=<ms>&limit=300   그 뒤로 바뀐 결제만
//    GET /api/erp/feed?costs=only             월별 원가·크레딧만
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkFeedAuth } from "@/lib/erp/feed-auth";
import { TOP_UP_PACKS } from "@/lib/credit-costs";
import {
  FEED_SOURCE,
  FEED_VERSION,
  FEEDABLE_TOPUP_STATUSES,
  type SmoatFeedEnvelope,
  type SmoatMonthlyCostRow,
  type SmoatSaleRow,
} from "@/lib/erp/feed-contract";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;
/** 무통장 알림을 통째로 보낼 때의 상한 — 넘으면 ERP 가 지우기를 건너뛴다 */
const DEPOSIT_SNAPSHOT_CAP = 5000;
/** 월별 원가는 이만큼만 거슬러 보낸다 — 크지 않지만 무한정 늘 이유도 없다 */
const COST_MONTHS = 30;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** 크레딧 수로 팩 이름 찾기 — orderName 이 없는 옛 줄을 위해 */
function packLabelOf(credits: number | null | undefined): string | undefined {
  const hit = TOP_UP_PACKS.find((p) => p.credits === credits);
  return hit?.label;
}

/**
 * 돌려준 금액. 컬럼이 따로 없어 PortOne 응답 원본에서 읽는다.
 *
 * 전액 취소는 status 가 REFUNDED/CANCELLED 로 바뀌지만, **부분 취소는
 * status 가 COMPLETED 인 채로 남는다** (portone-credit-topups.ts 의
 * nextStatus). 그래서 상태만 보면 부분 환불이 매출에 그대로 남는다 —
 * 원본의 amount.cancelled 를 읽는 것이 유일하게 맞는 방법이다.
 */
function cancelledAmountOf(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const amount = (payload as { amount?: unknown }).amount;
  if (!amount || typeof amount !== "object") return 0;
  const cancelled = (amount as { cancelled?: unknown }).cancelled;
  const n = typeof cancelled === "number" ? cancelled : Number(cancelled ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 결제 줄.
 *
 * 충전·구독은 updatedAt 커서로 **바뀐 것만** 보낸다 (Prisma 의 @updatedAt 이
 * 매번 올려 주므로 믿을 수 있다).
 *
 * 무통장 알림은 다르다. 이 표에는 updatedAt 이 없고, 수기 지급(MANUAL_GRANT)이
 * 나중에 충전에 연결되거나(MATCHED, manual-topup-complete.ts) 무시로 바뀌어도
 * (IGNORED) processedAt 이 움직인다는 보장이 없다. 커서로 보내면 그 변화를
 * 놓쳐 ERP 에 수기 지급 줄이 남고, 같은 돈이 새 충전 줄로 **한 번 더** 잡힌다.
 * 그래서 처리된 알림 전부를 매번 통째로 보내고, ERP 가 없어진 것을 지운다.
 * 수기 지급은 드물어서(월 몇 건) 통째로 보내도 작다.
 */
async function loadSales(
  since: Date | null,
  limit: number,
): Promise<{ rows: SmoatSaleRow[]; truncated: boolean; deposits: SmoatSaleRow[]; depositsComplete: boolean }> {
  const gt = since ? { gt: since } : undefined;

  const [topUps, subscriptions, deposits] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: {
        status: { in: [...FEEDABLE_TOPUP_STATUSES] },
        ...(gt ? { updatedAt: gt } : {}),
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        status: true,
        price: true,
        paidAmount: true,
        creditAmount: true,
        orderName: true,
        paymentMethod: true,
        portoneTransactionId: true,
        paymentPayload: true,
        paidAt: true,
        completedAt: true,
        cancelledAt: true,
        updatedAt: true,
        academyId: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: {
        status: { in: ["PAID", "REFUNDED", "CANCELLED", "FAILED"] },
        ...(gt ? { updatedAt: gt } : {}),
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        status: true,
        amount: true,
        paidAmount: true,
        orderName: true,
        portoneTransactionId: true,
        paymentPayload: true,
        paidAt: true,
        completedAt: true,
        cancelledAt: true,
        periodStart: true,
        periodEnd: true,
        updatedAt: true,
        academyId: true,
        academy: { select: { name: true } },
        subscription: { select: { plan: { select: { tier: true, name: true } } } },
      },
    }),
    // 무통장 알림은 **커서 없이 통째로** 보낸다 (아래 depositsOf 주석).
    prisma.bankDepositNotification.findMany({
      where: { status: { in: ["MANUAL_GRANT", "MATCHED", "IGNORED"] } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: DEPOSIT_SNAPSHOT_CAP,
      select: {
        id: true,
        status: true,
        amount: true,
        bankName: true,
        occurredAt: true,
        receivedAt: true,
        processedAt: true,
        matchedTopUpId: true,
      },
    }),
  ]);

  const rows: SmoatSaleRow[] = [];

  for (const t of topUps) {
    const gross = t.paidAmount ?? t.price;
    const refund = cancelledAmountOf(t.paymentPayload);
    const paidAt = t.paidAt ?? t.completedAt;
    const revenue = t.status === "COMPLETED" && !!paidAt && gross - refund > 0;
    const row: SmoatSaleRow = {
      id: t.id,
      kind: "topup",
      paidAt: iso(paidAt),
      updatedAt: t.updatedAt.toISOString(),
      status: t.status,
      revenue,
      amount: gross,
      refundAmount: refund,
      refundedAt: iso(t.cancelledAt),
      paymentMethod: t.paymentMethod ?? "CARD",
      accountId: t.academyId,
      accountName: t.academy?.name ?? "(이름 없음)",
      credits: t.creditAmount,
    };
    if (!revenue) {
      row.excluded =
        t.status === "REFUNDED"
          ? "refunded"
          : t.status === "CANCELLED"
            ? "cancelled"
            : t.status === "FAILED"
              ? "failed"
              : "pending";
    }
    const label = t.orderName ?? packLabelOf(t.creditAmount);
    if (label) row.packLabel = label;
    if (t.portoneTransactionId) row.pgTxId = t.portoneTransactionId;
    rows.push(row);
  }

  for (const s of subscriptions) {
    const gross = s.paidAmount ?? s.amount;
    const refund = cancelledAmountOf(s.paymentPayload);
    const paidAt = s.paidAt ?? s.completedAt;
    const revenue = s.status === "PAID" && !!paidAt && gross - refund > 0;
    const row: SmoatSaleRow = {
      id: s.id,
      kind: "subscription",
      paidAt: iso(paidAt),
      updatedAt: s.updatedAt.toISOString(),
      status: s.status,
      revenue,
      amount: gross,
      refundAmount: refund,
      refundedAt: iso(s.cancelledAt),
      paymentMethod: "CARD",
      accountId: s.academyId,
      accountName: s.academy?.name ?? "(이름 없음)",
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
    };
    if (!revenue) {
      row.excluded =
        s.status === "REFUNDED"
          ? "refunded"
          : s.status === "CANCELLED"
            ? "cancelled"
            : s.status === "FAILED"
              ? "failed"
              : "pending";
    }
    const tier = s.subscription?.plan?.tier;
    if (tier) row.planTier = tier;
    const label = s.orderName ?? s.subscription?.plan?.name;
    if (label) row.packLabel = label;
    if (s.portoneTransactionId) row.pgTxId = s.portoneTransactionId;
    rows.push(row);
  }

  const depositRows: SmoatSaleRow[] = deposits.map((d) => {
    const at = d.occurredAt ?? d.receivedAt;
    // 매출이 되는 것은 **충전에 연결되지 않은 수기 지급**뿐이다. 자동·수동으로
    // 충전에 연결되면(MATCHED) 그 돈은 충전 줄로 세고 있고, IGNORED 는 매출이
    // 아니라고 판정된 입금이다.
    const revenue = d.status === "MANUAL_GRANT" && !d.matchedTopUpId && d.amount > 0;
    const row: SmoatSaleRow = {
      id: d.id,
      kind: "deposit",
      paidAt: iso(at),
      updatedAt: (d.processedAt ?? d.receivedAt).toISOString(),
      status: d.status,
      revenue,
      amount: d.amount,
      refundAmount: 0,
      refundedAt: null,
      paymentMethod: "BANK",
      accountId: "",
      accountName: d.bankName ?? "무통장 입금",
    };
    if (!revenue) row.excluded = d.status === "IGNORED" ? "test" : "duplicate";
    return row;
  });

  rows.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  return {
    rows,
    // 한 표라도 한도를 채웠으면 남은 것이 있을 수 있다
    truncated: topUps.length >= limit || subscriptions.length >= limit,
    deposits: depositRows,
    depositsComplete: deposits.length < DEPOSIT_SNAPSHOT_CAP,
  };
}

/**
 * 월별 AI 원가·크레딧 — SMOAT 의 변동비와 크레딧 흐름.
 *
 * 세 질문을 한 번에 답한다:
 *   AI 로 얼마를 썼나(원가) · 크레딧을 얼마나 팔았나 · 얼마나 쓰였나.
 *
 * ⚠️ 판 크레딧 − 쓰인 크레딧은 **선수금의 근사치**다. 쓰인 크레딧에는 무료
 *    체험·프로모션·추천으로 준 크레딧의 사용분도 섞여 있고, 소비 기록에는
 *    어느 크레딧(유료·무료)에서 나갔는지가 없다. 그래서 실제 선수금보다
 *    **작게** 나온다. ERP 화면도 이것을 근사치라고 적는다.
 *
 * ⚠️ 달 경계는 KST 다. 이 DB 의 시각 열은 시간대 없는 TIMESTAMP(3) 에 UTC 를
 *    담고 있어서, `AT TIME ZONE 'Asia/Seoul'` 을 한 번만 걸면 그 값을 **서울
 *    시각으로 읽어** 거꾸로 9시간을 뺀다. UTC 로 먼저 읽고 서울로 바꾼다
 *    (actions/admin-activity/analytics/_query.ts 와 같은 방식).
 */
async function loadCosts(): Promise<SmoatMonthlyCostRow[]> {
  // 달 첫날부터 — 중간에서 자르면 가장 오래된 달이 반쪽으로 가서 ERP 의
  // 온전한 값을 덮는다
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - COST_MONTHS, 1));

  const [costs, sold, used] = await Promise.all([
    prisma.$queryRaw<Array<{ month: string; usd: number | null; krw: bigint | null }>>`
      SELECT to_char(("usageAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
             SUM("costUsd")::float8 AS usd,
             SUM("costKrw")::bigint AS krw
      FROM platform_api_usage_costs
      WHERE "usageAt" >= ${since}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ month: string; credits: bigint | null }>>`
      SELECT to_char((COALESCE("paidAt", "completedAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
             SUM("creditAmount")::bigint AS credits
      FROM credit_top_ups
      WHERE status = 'COMPLETED'
        AND COALESCE("paidAt", "completedAt") >= ${since}
      GROUP BY 1
    `,
    // 쓰인 크레딧 = 소비 − AI 실패로 돌려준 것. 실패 환불(type REFUND,
    // 양수)을 빼지 않으면 사용량이 부풀고 미소진 크레딧이 음수로 간다.
    // 충전 환불(CREDIT_TOP_UP_REFUND, 음수)은 소비가 아니라 판 크레딧의
    // 회수라 여기 넣지 않는다.
    prisma.$queryRaw<Array<{ month: string; credits: bigint | null }>>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
             SUM(CASE
                   WHEN type = 'CONSUMPTION' THEN -amount
                   WHEN type = 'REFUND' AND amount > 0 THEN -amount
                   ELSE 0
                 END)::bigint AS credits
      FROM credit_transactions
      WHERE type IN ('CONSUMPTION', 'REFUND')
        AND "createdAt" >= ${since}
      GROUP BY 1
    `,
  ]);

  const byMonth = new Map<string, SmoatMonthlyCostRow>();
  const at = (month: string): SmoatMonthlyCostRow => {
    let row = byMonth.get(month);
    if (!row) {
      row = { month, aiUsd: 0, aiKrw: 0, creditsSold: 0, creditsUsed: 0, updatedAt: new Date().toISOString() };
      byMonth.set(month, row);
    }
    return row;
  };

  for (const c of costs) {
    if (!c.month) continue;
    const row = at(c.month);
    row.aiUsd = Number(c.usd ?? 0);
    row.aiKrw = Number(c.krw ?? 0);
    // 환율은 실제로 쓰인 값의 역산이다 — 우리가 지금 추정하는 값이 아니다
    if (row.aiUsd > 0) row.fxRate = Math.round((row.aiKrw / row.aiUsd) * 100) / 100;
  }
  for (const s of sold) {
    if (!s.month) continue;
    at(s.month).creditsSold = Number(s.credits ?? 0);
  }
  for (const u of used) {
    if (!u.month) continue;
    at(u.month).creditsUsed = Number(u.credits ?? 0);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export async function GET(req: Request) {
  const auth = checkFeedAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sinceMs = Number(url.searchParams.get("since")) || 0;
  const since = sinceMs > 0 ? new Date(sinceMs) : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  const costsOnly = url.searchParams.get("costs") === "only";
  const serverTime = Date.now();

  try {
    const loaded = costsOnly
      ? { rows: [], truncated: false, deposits: [], depositsComplete: false }
      : await loadSales(since, limit);
    // 충전·구독 두 표를 합쳤으니 limit 을 넘을 수 있다. 자른 나머지는 커서가
    // 아직 그 앞에 있으므로 다음 호출에 그대로 들어온다. (각 표가 앞에서부터
    // limit 개씩 왔으므로, 합친 것의 앞 limit 개는 빠짐없는 앞부분이다.)
    const sales = loaded.rows.slice(0, limit);
    const costs = await loadCosts();

    const cursor = sales.reduce((max, r) => Math.max(max, Date.parse(r.updatedAt) || 0), 0) || sinceMs;
    const envelope: SmoatFeedEnvelope = {
      version: FEED_VERSION,
      source: FEED_SOURCE,
      serverTime,
      cursor,
      complete: !loaded.truncated && loaded.rows.length <= limit,
      payload: {
        sales,
        costs,
        deposits: loaded.deposits,
        depositsComplete: loaded.depositsComplete,
      },
    };
    return NextResponse.json(envelope, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[erp/feed] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "알 수 없는 오류" },
      { status: 500 },
    );
  }
}
