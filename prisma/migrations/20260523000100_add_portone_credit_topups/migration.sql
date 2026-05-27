-- PortOne V2 credit top-up integration.
-- Keeps PortOne payment state separate from academy tuition/invoice payments.

ALTER TABLE "credit_top_ups"
  ADD COLUMN IF NOT EXISTS "paymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "orderName" TEXT,
  ADD COLUMN IF NOT EXISTS "storeId" TEXT,
  ADD COLUMN IF NOT EXISTS "channelKey" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS "portoneStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "portoneTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "paidAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "failureCode" TEXT,
  ADD COLUMN IF NOT EXISTS "failureMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "customData" JSONB,
  ADD COLUMN IF NOT EXISTS "paymentPayload" JSONB,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "creditTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_ups_paymentId_key"
  ON "credit_top_ups"("paymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_ups_creditTransactionId_key"
  ON "credit_top_ups"("creditTransactionId");

CREATE INDEX IF NOT EXISTS "credit_top_ups_academyId_status_createdAt_idx"
  ON "credit_top_ups"("academyId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "credit_top_ups_portoneStatus_idx"
  ON "credit_top_ups"("portoneStatus");

DO $$
BEGIN
  ALTER TABLE "credit_top_ups"
    ADD CONSTRAINT "credit_top_ups_creditTransactionId_fkey"
    FOREIGN KEY ("creditTransactionId") REFERENCES "credit_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "credit_top_ups"
    ADD CONSTRAINT "credit_top_ups_creditAmount_positive"
    CHECK ("creditAmount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "credit_top_ups"
    ADD CONSTRAINT "credit_top_ups_price_positive"
    CHECK ("price" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "portone_webhook_events" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "paymentId" TEXT,
  "topUpId" TEXT,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "headers" JSONB,
  "payload" JSONB,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "portone_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "portone_webhook_events_webhookId_key"
  ON "portone_webhook_events"("webhookId");

CREATE INDEX IF NOT EXISTS "portone_webhook_events_paymentId_idx"
  ON "portone_webhook_events"("paymentId");

CREATE INDEX IF NOT EXISTS "portone_webhook_events_topUpId_idx"
  ON "portone_webhook_events"("topUpId");

CREATE INDEX IF NOT EXISTS "portone_webhook_events_status_receivedAt_idx"
  ON "portone_webhook_events"("status", "receivedAt");

DO $$
BEGIN
  ALTER TABLE "portone_webhook_events"
    ADD CONSTRAINT "portone_webhook_events_topUpId_fkey"
    FOREIGN KEY ("topUpId") REFERENCES "credit_top_ups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "portone_webhook_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'credit_top_ups'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_top_ups;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'credit_transactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_transactions;
    END IF;
  END IF;
END $$;
