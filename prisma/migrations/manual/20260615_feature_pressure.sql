-- feature_pressure (커밍순 기능 "출시 압박" 카운터 — coming-soon-overlay.tsx / api/feature-pressure).
-- 이 DB는 prisma migrate 히스토리와 드리프트가 있어 `db execute`로 직접 적용한다.
--   npx prisma db execute --file prisma/migrations/manual/20260615_feature_pressure.sql --schema prisma/schema.prisma
-- 라우트가 raw SQL(public.feature_pressure, ON CONFLICT (feature))로 접근하므로 feature를 PK로 둔다. 재실행 멱등.
CREATE TABLE IF NOT EXISTS "public"."feature_pressure" (
  "feature"    TEXT        NOT NULL,
  "count"      BIGINT      NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "feature_pressure_pkey" PRIMARY KEY ("feature")
);
