-- Help Center boards (additive only). Apply with:
--   npx prisma db execute --file prisma/migrations-manual/20260628_helpcenter_boards.sql --schema prisma/schema.prisma
--   npx prisma generate
-- Columns are camelCase (Prisma default), table names are snake_case (@@map).

CREATE TABLE IF NOT EXISTS "help_posts" (
  "id" TEXT PRIMARY KEY,
  "board" TEXT NOT NULL,
  "academyId" TEXT,
  "authorStaffId" TEXT,
  "authorName" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'ETC',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "passwordHash" TEXT,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "upvoteCount" INTEGER NOT NULL DEFAULT 0,
  "attachments" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "help_posts_board_status_createdAt_idx" ON "help_posts" ("board", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "help_posts_board_isPinned_createdAt_idx" ON "help_posts" ("board", "isPinned", "createdAt");

CREATE TABLE IF NOT EXISTS "help_post_replies" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "authorStaffId" TEXT,
  "authorAdminId" TEXT,
  "authorName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isOfficial" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "help_post_replies_postId_fkey" FOREIGN KEY ("postId") REFERENCES "help_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "help_post_replies_postId_createdAt_idx" ON "help_post_replies" ("postId", "createdAt");

CREATE TABLE IF NOT EXISTS "help_post_upvotes" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "help_post_upvotes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "help_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "help_post_upvotes_postId_staffId_key" ON "help_post_upvotes" ("postId", "staffId");

CREATE TABLE IF NOT EXISTS "seminar_requests" (
  "id" TEXT PRIMARY KEY,
  "academyId" TEXT,
  "staffId" TEXT,
  "applicantName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "academyName" TEXT,
  "preferredChannel" TEXT NOT NULL DEFAULT 'PHONE',
  "preferredTimes" TEXT,
  "topic" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "adminMemo" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "handledByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "seminar_requests_status_createdAt_idx" ON "seminar_requests" ("status", "createdAt");
