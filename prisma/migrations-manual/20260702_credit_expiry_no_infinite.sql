-- Credit expiry policy: no true "무기한". Any unset expiry (NULL) is forced to a
-- fixed fallback deadline of 2030-12-31 23:59:59 KST, so every balance shows a
-- countdown and eventually expires. Applied manually (schema drift) —
-- see MEMORY: prisma-migration-drift / credit-expiry-model.
--
-- The KST instant is stored as its UTC wall-clock (2030-12-31 14:59:59) in the
-- timestamp-without-time-zone column, matching how Prisma binds the same Date.
-- Going forward, the grant paths (lib/credit-expiry.ts NO_EXPIRY_FALLBACK) insert
-- this value instead of NULL, so this backfill is a one-time correction.

UPDATE "credit_balances"
SET "expiresAt" = (TIMESTAMPTZ '2030-12-31 23:59:59+09:00') AT TIME ZONE 'UTC'
WHERE "expiresAt" IS NULL;
