// ============================================================================
// 가입·매출 귀속 SQL — 학원 ↔ 유입 세션 연결. 서버 전용.
// 계약: docs/analytics/analytics-spec.md §6.4, I9
//
// 사용: WITH ${acquisitionCte("first")} SELECT … FROM acq JOIN "analytics_sessions" s ON s."id" = acq."sessionId" …
//  - acq 컬럼: "academyId", "academyCreatedAt", "visitorId", "sessionId", "touchCount"(가입 전 세션 수)
//  - 연결 방문자가 없는 학원은 acq 에 없다(= 추적 시작 전 가입).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";

/** 가입 직전 방문이 연결 직후 몇 분 늦게 찍혀도 인정하는 유예 */
const GRACE = Prisma.raw(`interval '10 minutes'`);

export type AttributionModel = "first" | "last";

export function isAttributionModel(v: unknown): v is AttributionModel {
  return v === "first" || v === "last";
}

/**
 * academyFilter: academies 별칭 a 에 대한 추가 조건(예: 가입 기간).
 */
export function acquisitionCte(model: AttributionModel, academyFilter: Prisma.Sql = Prisma.sql`TRUE`): Prisma.Sql {
  if (model === "first") {
    return Prisma.sql`acq AS (
      SELECT DISTINCT ON (a."id")
        a."id" AS "academyId",
        a."createdAt" AS "academyCreatedAt",
        v."id" AS "visitorId",
        COALESCE(v."firstSessionId", (
          SELECT s0."id" FROM "analytics_sessions" s0 WHERE s0."visitorId" = v."id" ORDER BY s0."startedAt" ASC LIMIT 1
        )) AS "sessionId",
        (SELECT COUNT(*)::int FROM "analytics_sessions" sc
           JOIN "analytics_visitors" vc ON vc."id" = sc."visitorId"
          WHERE vc."academyId" = a."id" AND sc."startedAt" <= a."createdAt" + ${GRACE}) AS "touchCount"
      FROM "academies" a
      JOIN "analytics_visitors" v ON v."academyId" = a."id" AND v."firstSeenAt" <= a."createdAt" + ${GRACE}
      WHERE ${academyFilter}
      ORDER BY a."id", v."firstSeenAt" ASC
    )`;
  }
  return Prisma.sql`acq AS (
    SELECT DISTINCT ON (a."id")
      a."id" AS "academyId",
      a."createdAt" AS "academyCreatedAt",
      sl."visitorId" AS "visitorId",
      sl."id" AS "sessionId",
      (SELECT COUNT(*)::int FROM "analytics_sessions" sc
         JOIN "analytics_visitors" vc ON vc."id" = sc."visitorId"
        WHERE vc."academyId" = a."id" AND sc."startedAt" <= a."createdAt" + ${GRACE}) AS "touchCount"
    FROM "academies" a
    JOIN "analytics_visitors" v ON v."academyId" = a."id"
    JOIN "analytics_sessions" sl ON sl."visitorId" = v."id" AND sl."startedAt" <= a."createdAt" + ${GRACE}
    WHERE ${academyFilter}
    ORDER BY a."id", (sl."channel" <> 'direct') DESC, sl."startedAt" DESC
  )`;
}

/** 학원 가입 기간 조건(a 별칭) */
export function academyCreatedBetween(from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`a."createdAt" >= ${from} AND a."createdAt" < ${to}`;
}
