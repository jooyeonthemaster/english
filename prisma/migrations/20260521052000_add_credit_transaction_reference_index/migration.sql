CREATE INDEX IF NOT EXISTS "credit_transactions_referenceId_referenceType_idx"
ON "credit_transactions"("referenceId", "referenceType");
