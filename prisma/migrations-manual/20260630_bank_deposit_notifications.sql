CREATE TABLE IF NOT EXISTS "bank_deposit_notifications" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'sms',
  "rawText" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "depositorName" TEXT,
  "bankName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "matchedTopUpId" TEXT,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "bank_deposit_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_deposit_notifications_externalId_key" ON "bank_deposit_notifications"("externalId");
CREATE INDEX IF NOT EXISTS "bank_deposit_notifications_status_receivedAt_idx" ON "bank_deposit_notifications"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "bank_deposit_notifications_amount_idx" ON "bank_deposit_notifications"("amount");
CREATE INDEX IF NOT EXISTS "bank_deposit_notifications_matchedTopUpId_idx" ON "bank_deposit_notifications"("matchedTopUpId");
DO $$ BEGIN
  ALTER TABLE "bank_deposit_notifications"
    ADD CONSTRAINT "bank_deposit_notifications_matchedTopUpId_fkey"
    FOREIGN KEY ("matchedTopUpId") REFERENCES "credit_top_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
