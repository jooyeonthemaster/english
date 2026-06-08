-- 커스텀 유형 생성 시 난이도 override(미지정 시 유형 정의의 난이도 사용).
ALTER TABLE "custom_question_generation_jobs" ADD COLUMN "difficulty" TEXT;
