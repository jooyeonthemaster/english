-- ============================================================================
-- 1st-party 유입 분석 (surgical CREATE)
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20260917_analytics.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. Academy/Staff/CreditTopUp FK 는 걸지 않는다 —
-- 분석 데이터는 느슨한 참조(인덱스만)로 운영 테이블 삭제·잠금에 영향을 주지 않는다.
--
-- 계약: docs/analytics/analytics-spec.md §2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "analytics_visitors" (
  "id"                TEXT PRIMARY KEY,
  "firstSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionCount"      INTEGER NOT NULL DEFAULT 0,
  "pageviewCount"     INTEGER NOT NULL DEFAULT 0,
  "firstSessionId"    TEXT,
  "firstChannel"      TEXT,
  "firstSource"       TEXT,
  "firstMedium"       TEXT,
  "firstCampaign"     TEXT,
  "firstReferrerHost" TEXT,
  "firstLandingPath"  TEXT,
  "firstTrackedLink"  TEXT,
  "academyId"         TEXT,
  "staffId"           TEXT,
  "linkedAt"          TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "analytics_visitors_firstSeenAt_idx" ON "analytics_visitors" ("firstSeenAt");
CREATE INDEX IF NOT EXISTS "analytics_visitors_academyId_idx" ON "analytics_visitors" ("academyId");

CREATE TABLE IF NOT EXISTS "analytics_sessions" (
  "id"             TEXT PRIMARY KEY,
  "visitorId"      TEXT NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "engagedMs"      INTEGER NOT NULL DEFAULT 0,
  "pageviews"      INTEGER NOT NULL DEFAULT 0,
  "eventsCount"    INTEGER NOT NULL DEFAULT 0,
  "isNewVisitor"   BOOLEAN NOT NULL DEFAULT true,
  "entryPath"      TEXT NOT NULL,
  "entryTitle"     TEXT,
  "exitPath"       TEXT,
  "hostname"       TEXT,
  "referrer"       TEXT,
  "referrerHost"   TEXT,
  "channel"        TEXT NOT NULL,
  "source"         TEXT,
  "medium"         TEXT,
  "campaign"       TEXT,
  "term"           TEXT,
  "content"        TEXT,
  "clickIdType"    TEXT,
  "trackedLink"    TEXT,
  "landingQuery"   TEXT,
  "deviceType"     TEXT,
  "browser"        TEXT,
  "browserVersion" TEXT,
  "os"             TEXT,
  "inApp"          TEXT,
  "screen"         TEXT,
  "language"       TEXT,
  "timezone"       TEXT,
  "country"        TEXT,
  "region"         TEXT,
  "city"           TEXT,
  "academyId"      TEXT,
  "staffId"        TEXT,
  "isInternal"     BOOLEAN NOT NULL DEFAULT false,
  "hasConversion"  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "analytics_sessions_startedAt_idx" ON "analytics_sessions" ("startedAt");
CREATE INDEX IF NOT EXISTS "analytics_sessions_lastSeenAt_idx" ON "analytics_sessions" ("lastSeenAt");
CREATE INDEX IF NOT EXISTS "analytics_sessions_visitorId_startedAt_idx" ON "analytics_sessions" ("visitorId", "startedAt");
CREATE INDEX IF NOT EXISTS "analytics_sessions_channel_startedAt_idx" ON "analytics_sessions" ("channel", "startedAt");
CREATE INDEX IF NOT EXISTS "analytics_sessions_academyId_idx" ON "analytics_sessions" ("academyId");

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id"        TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "name"      TEXT,
  "path"      TEXT NOT NULL,
  "title"     TEXT,
  "area"      TEXT NOT NULL,
  "prevPath"  TEXT,
  "engagedMs" INTEGER,
  "scrollPct" INTEGER,
  "props"     JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "analytics_events_createdAt_idx" ON "analytics_events" ("createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_sessionId_createdAt_idx" ON "analytics_events" ("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_type_createdAt_idx" ON "analytics_events" ("type", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_name_createdAt_idx" ON "analytics_events" ("name", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_path_createdAt_idx" ON "analytics_events" ("path", "createdAt");

CREATE TABLE IF NOT EXISTS "analytics_conversions" (
  "id"         TEXT PRIMARY KEY,
  "type"       TEXT NOT NULL,
  "refId"      TEXT NOT NULL,
  "academyId"  TEXT NOT NULL,
  "visitorId"  TEXT,
  "sessionId"  TEXT,
  "value"      INTEGER NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "firedAt"    TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_conversions_type_refId_key" ON "analytics_conversions" ("type", "refId");
CREATE INDEX IF NOT EXISTS "analytics_conversions_occurredAt_idx" ON "analytics_conversions" ("occurredAt");
CREATE INDEX IF NOT EXISTS "analytics_conversions_academyId_idx" ON "analytics_conversions" ("academyId");

CREATE TABLE IF NOT EXISTS "analytics_tracked_links" (
  "id"          TEXT PRIMARY KEY,
  "slug"        TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "utmSource"   TEXT NOT NULL,
  "utmMedium"   TEXT NOT NULL,
  "utmCampaign" TEXT,
  "utmContent"  TEXT,
  "utmTerm"     TEXT,
  "note"        TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "clicks"      INTEGER NOT NULL DEFAULT 0,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_tracked_links_slug_key" ON "analytics_tracked_links" ("slug");

CREATE TABLE IF NOT EXISTS "analytics_link_clicks" (
  "id"           TEXT PRIMARY KEY,
  "linkId"       TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "referrerHost" TEXT,
  "deviceType"   TEXT,
  "os"           TEXT,
  "inApp"        TEXT,
  "country"      TEXT,
  "region"       TEXT,
  "isBot"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "analytics_link_clicks_linkId_createdAt_idx" ON "analytics_link_clicks" ("linkId", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_link_clicks_createdAt_idx" ON "analytics_link_clicks" ("createdAt");
