-- 학원(원장 staff) 마케팅 정보 수신 동의를 저장한다.
-- 정보통신망법 제50조의 opt-in(사전 동의) 근거 + 동의 시각 증빙용.
-- 기존 회원은 동의 이력이 없으므로 false/NULL 로 들어간다(= 광고 발송 대상 아님).
-- prod에는 surgical ALTER로 이미 적용돼 있어, 재적용(migrate deploy)에도 안전하도록 IF NOT EXISTS 사용.
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marketing_consent_at" TIMESTAMPTZ;
