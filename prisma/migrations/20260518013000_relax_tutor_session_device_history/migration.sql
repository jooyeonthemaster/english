DROP INDEX IF EXISTS "tutor_student_sessions_studentId_deviceFingerprint_key";

CREATE INDEX IF NOT EXISTS "tutor_student_sessions_studentId_deviceFingerprint_idx"
  ON "tutor_student_sessions"("studentId", "deviceFingerprint");
