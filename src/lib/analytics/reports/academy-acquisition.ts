// ============================================================================
// 리포트: 학원 1곳의 유입 경로 — 회원 상세 「유입 경로」 카드용. 서버 전용.
// 계약: docs/analytics/analytics-spec.md §6.4(귀속), §10(sessions 링크)
//
// 정의:
//  - first / last          attribution.ts acquisitionCte("first"|"last") 를 a.id = academyId 로 좁힌 결과
//                          (전환 리포트 「가입 학원 목록」과 같은 규칙 — 같은 학원은 두 화면에서 같은 값)
//  - tracked               first 또는 last 가 있으면 true. 둘 다 없으면 추적 도입 전 가입(또는 가입 전 방문 없음)
//  - touchCountBeforeSignup 가입 시각(+10분 유예) 이전 세션 수(acquisitionCte 의 touchCount)
//  - visitors / sessions / firstSessionAt / lastSessionAt
//                          세션 탐색기 `?academyId=…&all=1` 과 같은 범위: 세션 academyId 또는 방문자 academyId 가
//                          이 학원이고, 내부 트래픽(isInternal) 제외 — 「방문 기록 보기」 목록 건수와 일치
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acquisitionCte } from "../attribution";
import { num } from "../query";

export interface AcademyAcquisitionFirstTouch {
  channel: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  landingPath: string | null;
  firstSeenAt: string | null;
}

export interface AcademyAcquisitionLastTouch {
  channel: string | null;
  source: string | null;
  campaign: string | null;
  startedAt: string | null;
}

export interface AcademyAcquisition {
  academyId: string;
  tracked: boolean;
  first: AcademyAcquisitionFirstTouch | null;
  last: AcademyAcquisitionLastTouch | null;
  visitors: number;
  sessions: number;
  touchCountBeforeSignup: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  academyCreatedAt: string | null;
}

type Row = Record<string, unknown>;

/** 학원 id 형식 가드(cuid·uuid 계열) — 그 외 값은 쿼리 전에 거른다. */
export const ACADEMY_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function firstTouch(academyId: string) {
  const [r] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ${acquisitionCte("first", Prisma.sql`a."id" = ${academyId}`)}
    SELECT acq."touchCount" AS "touchCount",
           COALESCE(v."firstChannel", s."channel") AS "channel",
           v."firstSource" AS "source",
           v."firstMedium" AS "medium",
           v."firstCampaign" AS "campaign",
           v."firstReferrerHost" AS "referrerHost",
           v."firstLandingPath" AS "landingPath",
           v."firstSeenAt" AS "firstSeenAt"
    FROM acq
    JOIN "analytics_visitors" v ON v."id" = acq."visitorId"
    JOIN "analytics_sessions" s ON s."id" = acq."sessionId"`);
  if (!r) return null;
  return {
    touchCount: num(r.touchCount),
    first: {
      channel: str(r.channel),
      source: str(r.source),
      medium: str(r.medium),
      campaign: str(r.campaign),
      referrerHost: str(r.referrerHost),
      landingPath: str(r.landingPath),
      firstSeenAt: iso(r.firstSeenAt),
    } satisfies AcademyAcquisitionFirstTouch,
  };
}

async function lastTouch(academyId: string) {
  const [r] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ${acquisitionCte("last", Prisma.sql`a."id" = ${academyId}`)}
    SELECT acq."touchCount" AS "touchCount",
           s."channel" AS "channel",
           s."source" AS "source",
           s."campaign" AS "campaign",
           s."startedAt" AS "startedAt"
    FROM acq
    JOIN "analytics_sessions" s ON s."id" = acq."sessionId"`);
  if (!r) return null;
  return {
    touchCount: num(r.touchCount),
    last: {
      channel: str(r.channel),
      source: str(r.source),
      campaign: str(r.campaign),
      startedAt: iso(r.startedAt),
    } satisfies AcademyAcquisitionLastTouch,
  };
}

async function visitTotals(academyId: string) {
  const [r] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT COUNT(*) AS "sessions",
           COUNT(DISTINCT s."visitorId") AS "visitors",
           MIN(s."startedAt") AS "firstSessionAt",
           MAX(s."startedAt") AS "lastSessionAt"
    FROM "analytics_sessions" s
    WHERE s."isInternal" = false
      AND (s."academyId" = ${academyId}
           OR s."visitorId" IN (SELECT va."id" FROM "analytics_visitors" va WHERE va."academyId" = ${academyId}))`);
  return {
    sessions: num(r?.sessions),
    visitors: num(r?.visitors),
    firstSessionAt: iso(r?.firstSessionAt),
    lastSessionAt: iso(r?.lastSessionAt),
  };
}

/** 학원이 없으면 null. */
export async function getAcademyAcquisition(academyId: string): Promise<AcademyAcquisition | null> {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { id: true, createdAt: true },
  });
  if (!academy) return null;

  const [f, l, totals] = await Promise.all([firstTouch(academyId), lastTouch(academyId), visitTotals(academyId)]);

  return {
    academyId: academy.id,
    tracked: !!f || !!l,
    first: f?.first ?? null,
    last: l?.last ?? null,
    visitors: totals.visitors,
    sessions: totals.sessions,
    touchCountBeforeSignup: f?.touchCount ?? l?.touchCount ?? 0,
    firstSessionAt: totals.firstSessionAt,
    lastSessionAt: totals.lastSessionAt,
    academyCreatedAt: iso(academy.createdAt),
  };
}
