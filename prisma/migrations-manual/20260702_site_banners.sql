-- Site banners: admin-managed entry banners shown to logged-in users.
-- Applied manually against the dev DB (schema drift), see MEMORY: prisma-migration-drift.

CREATE TABLE IF NOT EXISTS "site_banners" (
  "id"                       TEXT PRIMARY KEY,
  "title"                    TEXT NOT NULL,
  "type"                     TEXT NOT NULL DEFAULT 'TEMPLATE',
  "template_key"             TEXT,
  "content"                  JSONB NOT NULL DEFAULT '{}',
  "image_url"                TEXT,
  "image_alt"                TEXT,
  "link_url"                 TEXT,
  "audiences"                TEXT NOT NULL DEFAULT 'DIRECTOR',
  "priority"                 INTEGER NOT NULL DEFAULT 0,
  "is_active"                BOOLEAN NOT NULL DEFAULT false,
  "dismiss_mode"             TEXT NOT NULL DEFAULT 'DAILY',
  "starts_at"                TIMESTAMP(3),
  "ends_at"                  TIMESTAMP(3),
  "auto_open_on_low_credit"  BOOLEAN NOT NULL DEFAULT false,
  "created_by_admin_id"      TEXT,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "site_banners_is_active_priority_idx"
  ON "site_banners" ("is_active", "priority");

-- Migrate the existing hardcoded "협업 피드백 이벤트" banner into the new system
-- as a feedback-invite template banner. Fixed id keeps this insert idempotent.
INSERT INTO "site_banners" (
  "id", "title", "type", "template_key", "content",
  "audiences", "priority", "is_active", "dismiss_mode", "auto_open_on_low_credit",
  "created_at", "updated_at"
) VALUES (
  'banner_feedback_invite_seed',
  '협업 피드백 이벤트',
  'TEMPLATE',
  'feedback-invite',
  '{"eyebrow":"협업 피드백 이벤트","heading":"함께 만드는 베타에 초대합니다","kakaoUrl":"https://open.kakao.com/o/g6H20Cwi","phone":"010-6811-1106","bonusLabel":"추가 무료 크레딧","freeUntilLabel":"7월 1일"}',
  'DIRECTOR',
  0,
  true,
  'DAILY',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
