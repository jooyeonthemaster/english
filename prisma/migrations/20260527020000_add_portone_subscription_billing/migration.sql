-- PortOne V2 billing-key subscription integration.
-- Keeps recurring subscription payments separate from one-off credit top-ups.

ALTER TABLE "academy_subscriptions"
  ADD COLUMN IF NOT EXISTS "billingKeyId" TEXT,
  ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nextBillingPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "nextBillingScheduleId" TEXT,
  ADD COLUMN IF NOT EXISTS "nextBillingAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingActivatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingFailureMessage" TEXT;

CREATE TABLE IF NOT EXISTS "portone_billing_keys" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "billingKey" TEXT NOT NULL,
  "issueId" TEXT,
  "issueName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "storeId" TEXT NOT NULL,
  "channelKey" TEXT,
  "method" TEXT NOT NULL DEFAULT 'CARD',
  "customerId" TEXT,
  "issuedById" TEXT,
  "billingKeyInfo" JSONB,
  "customData" JSONB,
  "issuedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "portone_billing_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "billingKeyId" TEXT,
  "paymentId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "orderName" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "portoneStatus" TEXT,
  "portoneTransactionId" TEXT,
  "paidAmount" INTEGER,
  "receiptUrl" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "customData" JSONB,
  "paymentPayload" JSONB,
  "scheduledAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "portone_billing_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_payments" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS "portone_billing_keys_billingKey_key"
  ON "portone_billing_keys"("billingKey");

CREATE UNIQUE INDEX IF NOT EXISTS "portone_billing_keys_issueId_key"
  ON "portone_billing_keys"("issueId");

CREATE INDEX IF NOT EXISTS "portone_billing_keys_academyId_idx"
  ON "portone_billing_keys"("academyId");

CREATE INDEX IF NOT EXISTS "portone_billing_keys_status_idx"
  ON "portone_billing_keys"("status");

CREATE INDEX IF NOT EXISTS "portone_billing_keys_customerId_idx"
  ON "portone_billing_keys"("customerId");

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_paymentId_key"
  ON "subscription_payments"("paymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_scheduleId_key"
  ON "subscription_payments"("scheduleId");

CREATE INDEX IF NOT EXISTS "subscription_payments_academyId_idx"
  ON "subscription_payments"("academyId");

CREATE INDEX IF NOT EXISTS "subscription_payments_subscriptionId_createdAt_idx"
  ON "subscription_payments"("subscriptionId", "createdAt");

CREATE INDEX IF NOT EXISTS "subscription_payments_billingKeyId_idx"
  ON "subscription_payments"("billingKeyId");

CREATE INDEX IF NOT EXISTS "subscription_payments_status_idx"
  ON "subscription_payments"("status");

CREATE INDEX IF NOT EXISTS "subscription_payments_scheduledAt_idx"
  ON "subscription_payments"("scheduledAt");

CREATE INDEX IF NOT EXISTS "subscription_payments_periodEnd_idx"
  ON "subscription_payments"("periodEnd");

CREATE INDEX IF NOT EXISTS "academy_subscriptions_billingKeyId_idx"
  ON "academy_subscriptions"("billingKeyId");

CREATE INDEX IF NOT EXISTS "academy_subscriptions_autoRenew_nextBillingAt_idx"
  ON "academy_subscriptions"("autoRenew", "nextBillingAt");

ALTER TABLE "portone_webhook_events"
  ADD COLUMN IF NOT EXISTS "billingKey" TEXT,
  ADD COLUMN IF NOT EXISTS "billingKeyId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "portone_webhook_events_billingKey_idx"
  ON "portone_webhook_events"("billingKey");

CREATE INDEX IF NOT EXISTS "portone_webhook_events_billingKeyId_idx"
  ON "portone_webhook_events"("billingKeyId");

CREATE INDEX IF NOT EXISTS "portone_webhook_events_subscriptionPaymentId_idx"
  ON "portone_webhook_events"("subscriptionPaymentId");

DO $$
BEGIN
  ALTER TABLE "portone_billing_keys"
    ADD CONSTRAINT "portone_billing_keys_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "academy_subscriptions"
    ADD CONSTRAINT "academy_subscriptions_billingKeyId_fkey"
    FOREIGN KEY ("billingKeyId") REFERENCES "portone_billing_keys"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "subscription_payments"
    ADD CONSTRAINT "subscription_payments_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "subscription_payments"
    ADD CONSTRAINT "subscription_payments_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "academy_subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "subscription_payments"
    ADD CONSTRAINT "subscription_payments_billingKeyId_fkey"
    FOREIGN KEY ("billingKeyId") REFERENCES "portone_billing_keys"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "portone_webhook_events"
    ADD CONSTRAINT "portone_webhook_events_billingKeyId_fkey"
    FOREIGN KEY ("billingKeyId") REFERENCES "portone_billing_keys"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "portone_webhook_events"
    ADD CONSTRAINT "portone_webhook_events_subscriptionPaymentId_fkey"
    FOREIGN KEY ("subscriptionPaymentId") REFERENCES "subscription_payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
