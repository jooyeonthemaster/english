UPDATE "credit_top_up_products"
SET
  "basePrice" = 19800,
  "description" = '자동출제 약 100문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CREDIT_150' OR "id" = 'credit_product_100';

UPDATE "credit_top_up_products"
SET
  "basePrice" = 49500,
  "description" = '자동출제 약 300문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CREDIT_450' OR "id" = 'credit_product_300';

UPDATE "credit_top_up_products"
SET
  "basePrice" = 132000,
  "description" = '자동출제 약 1,000문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CREDIT_1500' OR "id" = 'credit_product_500';

UPDATE "credit_top_up_products"
SET
  "basePrice" = 330000,
  "description" = '자동출제 약 3,000문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CREDIT_4500' OR "id" = 'credit_product_1000';
