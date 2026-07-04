"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import {
  buildRange,
  bucketKeyForDate,
  kstParts,
} from "@/actions/admin/operations-cost-datetime";
import type { CostPeriodMode } from "@/actions/admin/operations-cost-types";

// ============================================================================
// 프로모션 모니터링 집계 — credit_promotion_link_events 로그를 읽어 전체 /
// 프로모션·번들별 / 학원별 / 회원별 클릭(방문·혜택받기) 현황을 계산한다.
//
// 기간 선택은 원가분석(원가 분석) 페이지와 동일한 방식:
//   · 일별(daily): 선택한 날의 활동 + 최근 30일 추이(막대).
//   · 월별(monthly): 선택한 달의 활동 + 최근 12개월 추이.
//   · 기간선택(range): start~end 범위 전체 활동 + 각 일/월 버킷 추이.
// KST 기준 버킷 계산은 원가분석의 buildRange/bucketKeyForDate 를 그대로 재사용.
// ============================================================================

export type PromoMonitoringOptions = {
  date?: string; // YYYY-MM-DD (일별 선택일)
  month?: string; // YYYY-MM (월별 선택월)
  startDate?: string; // YYYY-MM-DD (기간 시작)
  endDate?: string; // YYYY-MM-DD (기간 종료)
};

export type PromoMonitoringSelection = {
  mode: CostPeriodMode;
  date: string;
  month: string;
  start: string | null;
  end: string | null;
};

export type PromoMonitoringTotals = {
  views: number;
  claims: number;
  uniqueVisitors: number; // distinct visitorKey (로그인+익명)
  uniqueAcademies: number; // distinct academyId
  identifiedViews: number; // 로그인 원장 방문
  anonViews: number; // 익명 방문
};

export type PromoMonitoringSeriesPoint = {
  key: string;
  label: string;
  views: number;
  claims: number;
};

export type PromoMonitoringPerPromotion = {
  promotionId: string;
  name: string;
  productName: string | null;
  views: number;
  claims: number;
  uniqueAcademies: number;
  lastEventAt: string | null;
};

export type PromoMonitoringPerBundle = {
  bundleId: string;
  name: string;
  slug: string;
  views: number;
  claims: number;
  uniqueAcademies: number;
  lastEventAt: string | null;
};

export type PromoMonitoringPerAcademy = {
  academyId: string;
  academyName: string;
  views: number;
  claims: number;
  members: number; // distinct staffId
  lastEventAt: string;
};

export type PromoMonitoringPerMember = {
  staffId: string;
  name: string;
  academyName: string;
  views: number;
  claims: number;
  lastEventAt: string;
};

export type PromoMonitoringRecent = {
  id: string;
  kind: string; // "VIEW" | "CLAIM"
  targetType: string; // "PROMO" | "BUNDLE"
  label: string;
  who: string;
  createdAt: string;
};

export type PromoMonitoringPayload = {
  generatedAt: string;
  mode: CostPeriodMode;
  summaryMode: "bucket" | "range";
  summaryLabel: string; // 선택 기간(선택일/월/범위)
  rangeLabel: string; // 추이 버킷 전체 범위
  selection: PromoMonitoringSelection;
  hasEvents: boolean;
  totals: PromoMonitoringTotals;
  series: PromoMonitoringSeriesPoint[];
  perPromotion: PromoMonitoringPerPromotion[];
  perBundle: PromoMonitoringPerBundle[];
  perAcademy: PromoMonitoringPerAcademy[];
  perMember: PromoMonitoringPerMember[];
  recent: PromoMonitoringRecent[];
};

const MAX_EVENTS = 20_000; // 안전 상한 — 최근 이벤트부터
const MAX_RECENT = 30;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function kstTodayInput(): string {
  const p = kstParts(new Date());
  return `${p.year}-${pad(p.monthIndex + 1)}-${pad(p.day)}`;
}

export async function getPromotionMonitoring(
  mode: CostPeriodMode = "daily",
  options: PromoMonitoringOptions = {},
): Promise<PromoMonitoringPayload> {
  await requireAdminAuth();

  // 원가분석과 동일한 KST 버킷 범위 계산.
  const range = buildRange(mode, options);

  // 컨트롤 초기값 복원용으로 해석된 선택값을 되돌려준다(오늘/이번달 기본).
  const today = kstTodayInput();
  const resolvedDate = options.date ?? today;
  const resolvedMonth = options.month ?? resolvedDate.slice(0, 7);
  const hasRange = Boolean(options.startDate && options.endDate);
  const selection: PromoMonitoringSelection = {
    mode,
    date: resolvedDate,
    month: resolvedMonth,
    start: hasRange ? options.startDate! : null,
    end: hasRange ? options.endDate! : null,
  };

  const [events, promotions, bundles] = await Promise.all([
    prisma.creditPromotionLinkEvent.findMany({
      where: { createdAt: { gte: range.start, lt: range.end } },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    }),
    prisma.creditPromotion.findMany({
      select: { id: true, name: true, product: { select: { name: true } } },
    }),
    prisma.creditPromotionBundle.findMany({
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const promoMeta = new Map(
    promotions.map((p) => [
      p.id,
      {
        name: p.name?.trim() || "이름 없는 프로모션",
        productName: p.product?.name ?? null,
      },
    ]),
  );
  const bundleMeta = new Map(
    bundles.map((b) => [b.id, { name: b.name, slug: b.slug }]),
  );

  // 추이 버킷 초기화(일/월별) — 원가분석 버킷 키/라벨 재사용.
  const series: PromoMonitoringSeriesPoint[] = range.buckets.map((b) => ({
    key: b.key,
    label: b.label,
    views: 0,
    claims: 0,
  }));
  const seriesIndex = new Map(range.buckets.map((b, i) => [b.key, i]));

  // 선택 기간(요약) 이벤트만 KPI/표에 반영: bucket 모드면 summaryKey 버킷,
  // range 모드면 범위 전체.
  const isBucketSummary = range.summaryMode === "bucket";

  const totals: PromoMonitoringTotals = {
    views: 0,
    claims: 0,
    uniqueVisitors: 0,
    uniqueAcademies: 0,
    identifiedViews: 0,
    anonViews: 0,
  };
  const allVisitors = new Set<string>();
  const allAcademies = new Set<string>();

  type PromoAcc = {
    views: number;
    claims: number;
    academies: Set<string>;
    last: number;
  };
  const promoAcc = new Map<string, PromoAcc>();
  const bundleAcc = new Map<string, PromoAcc>();

  type AcademyAcc = {
    name: string;
    views: number;
    claims: number;
    members: Set<string>;
    last: number;
  };
  const academyAcc = new Map<string, AcademyAcc>();

  type MemberAcc = {
    name: string;
    academyName: string;
    views: number;
    claims: number;
    last: number;
  };
  const memberAcc = new Map<string, MemberAcc>();

  const summaryEvents: typeof events = [];

  for (const ev of events) {
    const bucketKey = bucketKeyForDate(ev.createdAt, mode);

    // 추이 버킷 누적(범위 전체 대상).
    const si = seriesIndex.get(bucketKey);
    if (si !== undefined) {
      if (ev.kind === "VIEW") series[si].views += 1;
      else if (ev.kind === "CLAIM") series[si].claims += 1;
    }

    // 요약 대상 여부.
    const inSummary = isBucketSummary
      ? bucketKey === range.summaryKey
      : true;
    if (!inSummary) continue;
    summaryEvents.push(ev);

    const isView = ev.kind === "VIEW";
    const isClaim = ev.kind === "CLAIM";
    const t = ev.createdAt.getTime();

    if (isView) totals.views += 1;
    if (isClaim) totals.claims += 1;
    if (ev.visitorKey) allVisitors.add(ev.visitorKey);
    if (ev.academyId) allAcademies.add(ev.academyId);
    if (isView) {
      if (ev.staffId) totals.identifiedViews += 1;
      else totals.anonViews += 1;
    }

    // 프로모션 / 번들별
    if (ev.targetType === "PROMO" && ev.promotionId) {
      const acc =
        promoAcc.get(ev.promotionId) ??
        { views: 0, claims: 0, academies: new Set<string>(), last: 0 };
      if (isView) acc.views += 1;
      if (isClaim) acc.claims += 1;
      if (ev.academyId) acc.academies.add(ev.academyId);
      acc.last = Math.max(acc.last, t);
      promoAcc.set(ev.promotionId, acc);
    } else if (ev.targetType === "BUNDLE" && ev.bundleId) {
      const acc =
        bundleAcc.get(ev.bundleId) ??
        { views: 0, claims: 0, academies: new Set<string>(), last: 0 };
      if (isView) acc.views += 1;
      if (isClaim) acc.claims += 1;
      if (ev.academyId) acc.academies.add(ev.academyId);
      acc.last = Math.max(acc.last, t);
      bundleAcc.set(ev.bundleId, acc);
    }

    // 학원별 (로그인 원장만)
    if (ev.academyId) {
      const acc =
        academyAcc.get(ev.academyId) ??
        {
          name: ev.academyName || "학원",
          views: 0,
          claims: 0,
          members: new Set<string>(),
          last: 0,
        };
      if (ev.academyName) acc.name = ev.academyName;
      if (isView) acc.views += 1;
      if (isClaim) acc.claims += 1;
      if (ev.staffId) acc.members.add(ev.staffId);
      acc.last = Math.max(acc.last, t);
      academyAcc.set(ev.academyId, acc);
    }

    // 회원별 (로그인 원장만)
    if (ev.staffId) {
      const acc =
        memberAcc.get(ev.staffId) ??
        {
          name: ev.visitorName || "원장",
          academyName: ev.academyName || "학원",
          views: 0,
          claims: 0,
          last: 0,
        };
      if (ev.visitorName) acc.name = ev.visitorName;
      if (ev.academyName) acc.academyName = ev.academyName;
      if (isView) acc.views += 1;
      if (isClaim) acc.claims += 1;
      acc.last = Math.max(acc.last, t);
      memberAcc.set(ev.staffId, acc);
    }
  }

  totals.uniqueVisitors = allVisitors.size;
  totals.uniqueAcademies = allAcademies.size;

  const iso = (ms: number) => new Date(ms).toISOString();

  const perPromotion: PromoMonitoringPerPromotion[] = [...promoAcc.entries()]
    .map(([promotionId, acc]) => {
      const meta = promoMeta.get(promotionId);
      return {
        promotionId,
        name: meta?.name ?? "삭제된 프로모션",
        productName: meta?.productName ?? null,
        views: acc.views,
        claims: acc.claims,
        uniqueAcademies: acc.academies.size,
        lastEventAt: acc.last ? iso(acc.last) : null,
      };
    })
    .sort((a, b) => b.views + b.claims - (a.views + a.claims));

  const perBundle: PromoMonitoringPerBundle[] = [...bundleAcc.entries()]
    .map(([bundleId, acc]) => {
      const meta = bundleMeta.get(bundleId);
      return {
        bundleId,
        name: meta?.name ?? "삭제된 번들",
        slug: meta?.slug ?? "",
        views: acc.views,
        claims: acc.claims,
        uniqueAcademies: acc.academies.size,
        lastEventAt: acc.last ? iso(acc.last) : null,
      };
    })
    .sort((a, b) => b.views + b.claims - (a.views + a.claims));

  const perAcademy: PromoMonitoringPerAcademy[] = [...academyAcc.entries()]
    .map(([academyId, acc]) => ({
      academyId,
      academyName: acc.name,
      views: acc.views,
      claims: acc.claims,
      members: acc.members.size,
      lastEventAt: iso(acc.last),
    }))
    .sort((a, b) => b.views + b.claims - (a.views + a.claims));

  const perMember: PromoMonitoringPerMember[] = [...memberAcc.entries()]
    .map(([staffId, acc]) => ({
      staffId,
      name: acc.name,
      academyName: acc.academyName,
      views: acc.views,
      claims: acc.claims,
      lastEventAt: iso(acc.last),
    }))
    .sort((a, b) => b.views + b.claims - (a.views + a.claims));

  const recent: PromoMonitoringRecent[] = summaryEvents
    .slice(0, MAX_RECENT)
    .map((ev) => {
      const label =
        ev.targetType === "PROMO"
          ? promoMeta.get(ev.promotionId ?? "")?.name ?? "프로모션"
          : bundleMeta.get(ev.bundleId ?? "")?.name ?? "번들";
      const who = ev.staffId
        ? `${ev.academyName ?? "학원"}${ev.visitorName ? ` · ${ev.visitorName}` : ""}`
        : "익명 방문자";
      return {
        id: ev.id,
        kind: ev.kind,
        targetType: ev.targetType,
        label,
        who,
        createdAt: ev.createdAt.toISOString(),
      };
    });

  const firstBucket = range.buckets[0];
  const lastBucket = range.buckets[range.buckets.length - 1];
  const rangeLabel =
    firstBucket && lastBucket
      ? `${firstBucket.label} ~ ${lastBucket.label}`
      : range.summaryLabel;

  return {
    generatedAt: new Date().toISOString(),
    mode,
    summaryMode: range.summaryMode,
    summaryLabel: range.summaryLabel,
    rangeLabel,
    selection,
    hasEvents: summaryEvents.length > 0,
    totals,
    series,
    perPromotion,
    perBundle,
    perAcademy,
    perMember,
    recent,
  };
}
