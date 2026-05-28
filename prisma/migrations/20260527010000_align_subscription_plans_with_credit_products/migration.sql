WITH plan_defaults AS (
  SELECT *
  FROM (VALUES
    ('STARTER', '스타터', 19800, 150, 10, '자동출제 약 100문항 분량의 월 크레딧을 제공하는 스타터 플랜'),
    ('STANDARD', '스탠다드', 49500, 450, 20, '자동출제 약 300문항 분량의 월 크레딧을 제공하는 스탠다드 플랜'),
    ('PREMIUM', '프리미엄', 132000, 1500, 30, '자동출제 약 1,000문항 분량의 월 크레딧을 제공하는 프리미엄 플랜'),
    ('ENTERPRISE', '엔터프라이즈', 330000, 4500, 40, '자동출제 약 3,000문항 분량의 월 크레딧을 제공하는 엔터프라이즈 플랜')
  ) AS defaults("tier", "name", "monthlyPrice", "monthlyCredits", "sortOrder", "description")
)
UPDATE "subscription_plans" AS plans
SET
  "name" = defaults."name",
  "monthlyPrice" = defaults."monthlyPrice",
  "monthlyCredits" = defaults."monthlyCredits",
  "sortOrder" = defaults."sortOrder",
  "description" = defaults."description",
  "updatedAt" = CURRENT_TIMESTAMP
FROM plan_defaults AS defaults
WHERE plans."tier" = defaults."tier";

UPDATE "credit_balances" AS balances
SET
  "monthlyAllocation" = plans."monthlyCredits",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "academy_subscriptions" AS subscriptions
JOIN "subscription_plans" AS plans
  ON plans."id" = subscriptions."planId"
WHERE balances."academyId" = subscriptions."academyId"
  AND subscriptions."status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
  AND subscriptions."cancelledAt" IS NULL;
