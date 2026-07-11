-- 26-07-09 공유 QR 자기등록(OMR/종이 배포) — surgical ALTER 전용(migrate deploy/db push 금지).
-- 시험지 1개당 공유 등록 토큰 1개: 인쇄 시험지에 QR 인쇄 → 학생이 스캔 → 이름 선택+코드 확인
-- → ExamSubmission 자기등록 생성 → OMR/태블릿 응시. 개별 링크 모델과 공존(additive).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "enrollToken" text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "enrollEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "enrollMode" text; -- 'OMR' | 'TABLET' — 자기등록 학생의 기본 응시 모드
CREATE UNIQUE INDEX IF NOT EXISTS "exams_enrollToken_key" ON exams("enrollToken");
