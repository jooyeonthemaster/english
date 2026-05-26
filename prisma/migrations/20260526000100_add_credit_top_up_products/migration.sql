CREATE TABLE IF NOT EXISTS "credit_top_up_products" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "creditAmount" INTEGER NOT NULL,
  "basePrice" INTEGER NOT NULL,
  "discountRate" INTEGER NOT NULL DEFAULT 0,
  "promotionName" TEXT,
  "promotionStartsAt" TIMESTAMP(3),
  "promotionEndsAt" TIMESTAMP(3),
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_top_up_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_up_products_code_key"
  ON "credit_top_up_products"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_up_products_creditAmount_key"
  ON "credit_top_up_products"("creditAmount");

CREATE INDEX IF NOT EXISTS "credit_top_up_products_isActive_sortOrder_idx"
  ON "credit_top_up_products"("isActive", "sortOrder");

INSERT INTO "credit_top_up_products" (
  "id",
  "code",
  "name",
  "creditAmount",
  "basePrice",
  "discountRate",
  "description",
  "isActive",
  "sortOrder",
  "updatedAt"
) VALUES
  ('credit_product_100', 'CREDIT_100', '100 크레딧', 100, 50000, 0, 'SMOAT AI 기능 이용을 위한 100 크레딧 디지털 이용권입니다.', true, 10, CURRENT_TIMESTAMP),
  ('credit_product_300', 'CREDIT_300', '300 크레딧', 300, 120000, 0, 'SMOAT AI 기능 이용을 위한 300 크레딧 디지털 이용권입니다.', true, 20, CURRENT_TIMESTAMP),
  ('credit_product_500', 'CREDIT_500', '500 크레딧', 500, 175000, 0, 'SMOAT AI 기능 이용을 위한 500 크레딧 디지털 이용권입니다.', true, 30, CURRENT_TIMESTAMP),
  ('credit_product_1000', 'CREDIT_1000', '1,000 크레딧', 1000, 300000, 0, 'SMOAT AI 기능 이용을 위한 1,000 크레딧 디지털 이용권입니다.', true, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
