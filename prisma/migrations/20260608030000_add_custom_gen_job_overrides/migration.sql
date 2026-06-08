-- 커스텀 유형 생성 시 임시 override(선지/정답 수·답형·복수정답·지문기반). null = 유형 정의 그대로.
ALTER TABLE "custom_question_generation_jobs" ADD COLUMN "overrides" JSONB;
