-- 프로모션 할인/보너스에 타입(PERCENT|AMOUNT) 추가. 값 컬럼은 discountRate/bonusRate → discountValue/bonusValue 로 의미 명확화(rename).
-- 적용은 수동(schema drift). credit_promotions는 현재 비어있어 rename 안전.
ALTER TABLE "credit_promotions" RENAME COLUMN "discountRate" TO "discountValue";
ALTER TABLE "credit_promotions" RENAME COLUMN "bonusRate" TO "bonusValue";
ALTER TABLE "credit_promotions" ADD COLUMN IF NOT EXISTS "discountType" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "credit_promotions" ADD COLUMN IF NOT EXISTS "bonusType" TEXT NOT NULL DEFAULT 'PERCENT';
