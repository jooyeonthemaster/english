"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  classifyCreditInflow,
  getOperationTypeLabel,
} from "@/lib/admin-members-labels";
import { getTodayKST } from "@/lib/date-utils";
import { DISPLAY_TIMEZONE, REDACTED, isSuperAdmin, maskEmail } from "./_shared";

// ============================================================================
// 2. Member detail (full info + recent transactions)
// ============================================================================

export async function getMemberDetail(memberId: string) {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    include: {
      academy: {
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          creditBalance: true,
          // 소속 회원(원장·강사) 로스터 — 학원 상세 "회원" 탭의 회원별 블록에 사용.
          staff: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
              avatarUrl: true,
              authProvider: true,
              createdAt: true,
              lastLoginAt: true,
              kakaoId: true,
              supabaseUserId: true,
            },
          },
          _count: {
            select: {
              students: true,
              passages: true,
              questions: true,
              exams: true,
            },
          },
        },
      },
    },
  });

  if (!staff) return { kind: "not_found" as const };
  if (staff.role !== "DIRECTOR") return { kind: "not_director" as const };

  const academy = staff.academy;

  // ── 사용량은 「순증감」으로 센다 ────────────────────────────────────────────
  // CONSUMPTION 만 더하면 생성 실패 자동 환급(REFUND · referenceType='CREDIT_TRANSACTION',
  // 26-09-18 실측 1,297건 +4,320C)이 되돌려지지 않아, 같은 화면의 「누적 사용」
  // (CreditBalance.totalConsumed — 환급 때 decrement 된다, src/lib/credits.ts:250)보다 커진다.
  // 수정 전 실측: 상품별 분해합 ≠ 누적 사용 80/169곳(PH 입시영어학원 1,737 vs 1,595),
  // 「최근 30일」 > 「누적 사용」 18/64곳(ME영어학원 60 vs 20 = 3.0배, ㅡㅡ 22 vs 6 = 3.7배).
  // 결제 환불 회수(CREDIT_TOP_UP_REFUND)는 충전 쪽 되돌림이라 사용량에서 빼지 않는다
  // (operationType 도 NULL 이라 상품별 분해에 귀속되지 않는다).
  const consumptionByOpRaw = await prisma.$queryRaw<
    Array<{ operationType: string | null; total: bigint; count: bigint }>
  >`
    SELECT "operationType",
           SUM(CASE WHEN type = 'CONSUMPTION' THEN ABS(amount) ELSE -amount END)::bigint AS total,
           COUNT(*) FILTER (WHERE type = 'CONSUMPTION')::bigint AS count
    FROM credit_transactions
    WHERE "academyId" = ${academy.id}
      AND (type = 'CONSUMPTION'
           OR (type = 'REFUND' AND "referenceType" = 'CREDIT_TRANSACTION'))
    GROUP BY "operationType"
  `;

  const consumptionByOp = consumptionByOpRaw
    .map((row) => ({
      operationType: row.operationType,
      label: getOperationTypeLabel(row.operationType),
      // 순증감이 음수인 (학원 × 상품) 조합은 실측 0/494 이지만, 비율 막대가 뒤집히지
      // 않도록 표시 단계에서 0 으로 막는다.
      totalAmount: Math.max(0, Number(row.total)),
      count: Number(row.count),
    }))
    .filter((row) => row.totalAmount > 0 || row.count > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // 「누적 지급」 분해 — CreditBalance.totalAllocated 는 무료(가입·미션·쿠폰·추천)와
  // 유료 충전이 한 숫자로 섞여 있어(관리자 조정은 제외) 원장에서 유형×참조로 다시 가른다.
  const inflowRaw = await prisma.creditTransaction.groupBy({
    by: ["type", "referenceType"],
    where: {
      academyId: academy.id,
      type: { in: ["ALLOCATION", "TOP_UP", "REFUND", "ADJUSTMENT"] },
    },
    _sum: { amount: true },
  });
  const creditInflow = { paid: 0, free: 0, admin: 0 };
  for (const row of inflowRaw) {
    const kind = classifyCreditInflow(row.type, row.referenceType);
    if (kind) creditInflow[kind] += row._sum.amount ?? 0;
  }

  // 최근 30일 = KST 오늘 포함 30개 달력일(스파크라인이 그리는 30칸과 같은 창).
  // 예전엔 now−30×24h 롤링이라 31번째 날 일부가 합계에만 들어가고 그래프엔 안 보였다.
  const since = new Date(getTodayKST().getTime() - 29 * 24 * 60 * 60 * 1000);
  // Group by day in DISPLAY_TIMEZONE so the keys returned to the client match
  // the local-day string the UI builds. Storing as YYYY-MM-DD text avoids
  // any further timezone juggling on either end.
  // createdAt 은 timestamp without time zone(UTC 값)이라 반드시 'UTC' 로 먼저 해석한 뒤
  // KST 로 옮긴다. `AT TIME ZONE 'Asia/Seoul'` 단일 변환은 값을 KST 벽시계로 오해해 −9h 가 된다
  // (26-09-17 실측: 최근 30일 소비 5,271건 중 1,868건이 전날로 밀려 있었다).
  // 일별도 같은 순증감 규칙(위 주석) — 같은 KST 일자 버킷에서 환급을 빼야
  // 「최근 30일 합계 ≤ 누적 사용」이 성립한다.
  const dailyRows = await prisma.$queryRaw<
    Array<{ day: string; total: bigint }>
  >`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${DISPLAY_TIMEZONE}, 'YYYY-MM-DD') AS day,
           SUM(CASE WHEN type = 'CONSUMPTION' THEN ABS(amount) ELSE -amount END)::bigint AS total
    FROM credit_transactions
    WHERE "academyId" = ${academy.id}
      AND (type = 'CONSUMPTION'
           OR (type = 'REFUND' AND "referenceType" = 'CREDIT_TRANSACTION'))
      AND "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  const dailyConsumption = dailyRows.map((r) => ({
    day: r.day,
    total: Number(r.total),
  }));

  // 「유료 충전」(원장 기준)과 대조할 결제 이력 — credit_top_ups 의 결제 완료분.
  // 무통장 결제가 원장에 TOP_UP 이 아니라 ADJUSTMENT(수동 지급)로 들어온 사례가 있어
  // (26-09-18 실측: PH 입시영어학원 132,000원/1,500C 1건, 완료 36건 중 원장 행 없는 건 1건)
  // 두 숫자를 나란히 보여 주고 어긋나면 화면에서 경고한다.
  const paidTopUpsAgg = await prisma.creditTopUp.aggregate({
    where: { academyId: academy.id, status: "COMPLETED" },
    _sum: { creditAmount: true, price: true },
    _count: { _all: true },
  });
  const paidTopUps = {
    count: paidTopUpsAgg._count._all,
    credits: paidTopUpsAgg._sum.creditAmount ?? 0,
    amount: paidTopUpsAgg._sum.price ?? 0,
  };

  // "최근 활동" = 마지막 로그인과 마지막 실제 사용(크레딧 소비) 중 더 최근 것.
  // lastLoginAt만 보면 세션이 길게 유지될 때(매일 써도 로그인은 몇 주 전) 활동이
  // 없는 것처럼 잘못 보인다 — 맞춤 문자/리텐션 판단은 이 값을 쓴다.
  const lastConsumption = await prisma.creditTransaction.findFirst({
    where: { academyId: academy.id, type: "CONSUMPTION" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const activeDates = [staff.lastLoginAt, lastConsumption?.createdAt].filter(
    (d): d is Date => Boolean(d),
  );
  const lastActiveAt =
    activeDates.length > 0
      ? activeDates.reduce((a, b) => (a > b ? a : b))
      : null;

  return {
    kind: "ok" as const,
    member: {
      id: staff.id,
      name: staff.name,
      // PII redaction for SUPPORT-tier — same policy as getMembers above.
      email: elevated ? staff.email : maskEmail(staff.email),
      phone: elevated ? staff.phone : staff.phone ? REDACTED : null,
      avatarUrl: staff.avatarUrl,
      authProvider: staff.authProvider,
      isActive: staff.isActive,
      createdAt: staff.createdAt,
      lastLoginAt: staff.lastLoginAt,
      lastActiveAt,
      kakaoId: elevated ? staff.kakaoId : null,
      supabaseUserId: elevated ? staff.supabaseUserId : null,
      academy: {
        id: academy.id,
        name: academy.name,
        slug: academy.slug,
        status: academy.status,
        address: academy.address,
        phone: academy.phone,
        memo: academy.memo,
        createdAt: academy.createdAt,
        counts: academy._count,
      },
      subscriptions: academy.subscriptions.map((sub) => ({
        id: sub.id,
        status: sub.status,
        planName: sub.plan.name,
        planTier: sub.plan.tier,
        monthlyPrice: sub.plan.monthlyPrice,
        monthlyCredits: sub.plan.monthlyCredits,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelledAt: sub.cancelledAt,
      })),
      creditBalance: academy.creditBalance,
      // 소속 회원 로스터(원장·강사) — 회원 정보 + 아웃리치에 필요한 사람 단위 필드.
      // PII(이메일·전화·소셜 ID)는 목록/상세와 동일한 마스킹 정책.
      academyStaff: academy.staff.map((st) => ({
        id: st.id,
        name: st.name,
        email: elevated ? st.email : maskEmail(st.email),
        phone: elevated ? st.phone : st.phone ? REDACTED : null,
        role: st.role,
        isActive: st.isActive,
        avatarUrl: st.avatarUrl,
        authProvider: st.authProvider,
        createdAt: st.createdAt,
        lastLoginAt: st.lastLoginAt,
        kakaoId: elevated ? st.kakaoId : null,
        supabaseUserId: elevated ? st.supabaseUserId : null,
      })),
      consumptionByOp,
      dailyConsumption,
      /** 원장 기준 유입 합계(C): paid=유료 충전·구독 지급(결제 환불 회수 차감), free=무료 지급, admin=수동 지급(무통장·보상) 순증감 */
      creditInflow,
      /** 결제 이력(credit_top_ups) 기준 결제 완료분 — creditInflow.paid 와 대조용 */
      paidTopUps,
    },
  };
}

export type MemberDetailResult = Awaited<ReturnType<typeof getMemberDetail>>;
export type MemberDetail = Extract<MemberDetailResult, { kind: "ok" }>["member"];
