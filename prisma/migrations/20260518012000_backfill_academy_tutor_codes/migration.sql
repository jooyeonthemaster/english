-- Existing academies predate the Tutor login code.
-- Backfill deterministic 4-character codes, then enforce presence for all future academies.

WITH ordered AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "academies"
  WHERE "code" IS NULL
)
UPDATE "academies" AS a
SET "code" = 'A' || lpad(ordered.rn::text, 3, '0')
FROM ordered
WHERE a."id" = ordered."id";

ALTER TABLE "academies" ALTER COLUMN "code" SET NOT NULL;
