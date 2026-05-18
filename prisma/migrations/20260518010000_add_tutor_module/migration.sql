-- Tutor module foundation.
-- This migration is additive except for replacing the legacy global studentCode
-- unique index with an academy-scoped unique index.

ALTER TABLE "academies" ADD COLUMN IF NOT EXISTS "code" CHAR(4);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "studentCodeLookupHmac" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "studentCodeHash" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);

DROP INDEX IF EXISTS "students_studentCode_key";

CREATE UNIQUE INDEX IF NOT EXISTS "academies_code_key" ON "academies"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "students_academyId_studentCode_key" ON "students"("academyId", "studentCode");
CREATE INDEX IF NOT EXISTS "students_academyId_studentCodeLookupHmac_idx" ON "students"("academyId", "studentCodeLookupHmac");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academies_code_format_chk'
  ) THEN
    ALTER TABLE "academies"
      ADD CONSTRAINT "academies_code_format_chk"
      CHECK ("code" IS NULL OR "code" ~ '^[A-Z0-9]{4}$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tutor_student_sessions" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "deviceFingerprint" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "ip" VARCHAR(45) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "tutor_student_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "parent_consents" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "consentType" TEXT NOT NULL DEFAULT 'TUTOR_CROSS_BORDER',
  "status" TEXT NOT NULL DEFAULT 'GRANTED',
  "consentTextVersion" TEXT NOT NULL DEFAULT 'v1',
  "parentName" TEXT NOT NULL,
  "parentPhone" TEXT NOT NULL,
  "consentGivenAt" TIMESTAMP(3) NOT NULL,
  "consentMethod" TEXT NOT NULL,
  "crossBorderAck" BOOLEAN NOT NULL DEFAULT false,
  "retentionAck" BOOLEAN NOT NULL DEFAULT false,
  "withdrawnAt" TIMESTAMP(3),
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  CONSTRAINT "parent_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_events" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_programs" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "templateKey" TEXT NOT NULL DEFAULT 'basic_interpret',
  "targetSummary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "estimatedMin" INTEGER NOT NULL DEFAULT 40,
  "difficulty" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  "tags" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_program_versions" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "editedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_program_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_lessons" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverImage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "estimatedMin" INTEGER NOT NULL DEFAULT 15,
  "difficulty" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  "tags" TEXT,
  "aiContext" JSONB,
  "parentVisible" BOOLEAN NOT NULL DEFAULT false,
  "activityCount" INTEGER NOT NULL DEFAULT 0,
  "totalMaxScore" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_program_lessons" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "orderNum" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_program_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_lesson_versions" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "editedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_lesson_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_ai_logs" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "passageId" TEXT,
  "programId" TEXT,
  "lessonId" TEXT,
  "activityId" TEXT,
  "staffId" TEXT,
  "studentId" TEXT,
  "model" TEXT NOT NULL,
  "promptHash" TEXT NOT NULL,
  "tokensIn" INTEGER NOT NULL,
  "tokensOut" INTEGER NOT NULL,
  "costUsd" DECIMAL(10,6) NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "crossBorderFlag" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "promptPreview" VARCHAR(256),
  "outputPreview" VARCHAR(256),
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_ai_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_activities" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "orderNum" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "payload" JSONB NOT NULL,
  "payloadSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "payloadHash" TEXT NOT NULL,
  "analysisSnapshotHash" TEXT,
  "itemCount" INTEGER NOT NULL DEFAULT 1,
  "maxScore" INTEGER NOT NULL DEFAULT 10,
  "estimatedSec" INTEGER NOT NULL DEFAULT 60,
  "requiresAiGrade" BOOLEAN NOT NULL DEFAULT false,
  "coverageRefs" JSONB NOT NULL,
  "sourceAnalysisVersion" INTEGER,
  "aiLogId" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_assignments" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "availableFrom" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "lockAfterClose" BOOLEAN NOT NULL DEFAULT true,
  "allowRetake" BOOLEAN NOT NULL DEFAULT true,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "titleSnapshot" TEXT NOT NULL,
  "programVersionAtAssign" INTEGER NOT NULL,
  "notes" TEXT,
  "hintsAllowed" BOOLEAN NOT NULL DEFAULT true,
  "tutorQuestionLimit" INTEGER NOT NULL DEFAULT 20,
  "reminderMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_assignment_targets" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "targetSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_assignment_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_assignment_recipients" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sourceTargetId" TEXT,
  "targetSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_assignment_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_weakness_snapshots" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT,
  "lessonId" TEXT,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scoreInterpret" INTEGER NOT NULL,
  "scoreMemorize" INTEGER NOT NULL,
  "scoreOrder" INTEGER NOT NULL,
  "scoreVocabDepth" INTEGER NOT NULL,
  "scoreGrammar" INTEGER NOT NULL,
  "scoreTransfer" INTEGER NOT NULL,
  "scoreRetention" INTEGER NOT NULL,
  "weakSentenceIndices" JSONB NOT NULL,
  "weakVocab" JSONB NOT NULL,
  "weakGrammarPoints" JSONB NOT NULL,
  "remediationAssignmentId" TEXT,
  CONSTRAINT "tutor_weakness_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_progress" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "recipientId" TEXT,
  "programId" TEXT NOT NULL,
  "lessonId" TEXT,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "masteryPassedAt" TIMESTAMP(3),
  "bestScore" INTEGER,
  "bestAttemptId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "weaknessSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_attempts" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lessonVersionSnapshot" INTEGER NOT NULL,
  "attemptNum" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
  "rawScore" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL DEFAULT 0,
  "percentScore" INTEGER,
  "isMasteryAttempt" BOOLEAN NOT NULL DEFAULT false,
  "aiSummary" TEXT,
  "clientNonce" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "tutor_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_attempt_items" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "itemIndex" INTEGER NOT NULL,
  "itemRef" TEXT,
  "responseText" TEXT,
  "responseJson" JSONB,
  "isCorrect" BOOLEAN,
  "scoreEarned" INTEGER NOT NULL DEFAULT 0,
  "scoreMax" INTEGER NOT NULL DEFAULT 1,
  "timeSpentMs" INTEGER,
  "hintUsedCount" INTEGER NOT NULL DEFAULT 0,
  "pasteCount" INTEGER NOT NULL DEFAULT 0,
  "focusLossCount" INTEGER NOT NULL DEFAULT 0,
  "clientFlags" JSONB,
  "aiGrade" JSONB,
  "aiGradeLogId" TEXT,
  "overrideScore" INTEGER,
  "overrideNote" TEXT,
  "overriddenBy" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_attempt_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_conversations" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT,
  "lessonId" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "activityId" TEXT,
  "title" TEXT NOT NULL DEFAULT '새 대화',
  "topicHint" TEXT,
  "turnCount" INTEGER NOT NULL DEFAULT 0,
  "tokenInTotal" INTEGER NOT NULL DEFAULT 0,
  "tokenOutTotal" INTEGER NOT NULL DEFAULT 0,
  "closedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_messages" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "studentId" TEXT,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "tokensIn" INTEGER,
  "tokensOut" INTEGER,
  "latencyMs" INTEGER,
  "moderation" TEXT DEFAULT 'OK',
  "containsPII" BOOLEAN NOT NULL DEFAULT false,
  "refs" JSONB,
  "studentStateSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_ai_log_tags" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "attemptItemId" TEXT,
  "tag" TEXT NOT NULL,
  "note" TEXT,
  "taggedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_ai_log_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_mastery" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "refKey" TEXT NOT NULL,
  "passageId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_mastery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_review_schedules" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT,
  "lessonId" TEXT,
  "scope" TEXT NOT NULL,
  "refKey" TEXT NOT NULL,
  "masteryId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "lastReviewedAt" TIMESTAMP(3),
  "intervalDays" INTEGER NOT NULL DEFAULT 1,
  "easeFactor" DECIMAL(4,2) NOT NULL DEFAULT 2.50,
  "lapses" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DUE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_review_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_coverage_snapshots" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "sentenceIndex" INTEGER NOT NULL,
  "dimension" TEXT NOT NULL,
  "coveragePct" INTEGER NOT NULL,
  "contributingActivityIds" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_coverage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "moderation_logs" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT,
  "severity" TEXT NOT NULL,
  "rawSnippet" TEXT NOT NULL,
  "classifier" TEXT NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "action" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tutor_learning_events" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT,
  "lessonId" TEXT,
  "activityId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutor_learning_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_plans" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "pricePerSeatKrw" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "dailyAiCostCeilingUsd" DECIMAL(10,2) NOT NULL DEFAULT 50.0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "seat_billing_runs" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "yearMonth" TEXT NOT NULL,
  "activeStudentCount" INTEGER NOT NULL,
  "pricePerSeatKrw" INTEGER NOT NULL,
  "totalKrw" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "invoicedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seat_billing_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "academy_themes" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "presetKey" TEXT NOT NULL DEFAULT 'NEUTRAL',
  "tokens" JSONB,
  "fontStack" TEXT,
  "logoUrl" TEXT,
  "brandStrings" JSONB,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_themes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "academy_feature_flags" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPct" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tutor_student_sessions_studentId_deviceFingerprint_key" ON "tutor_student_sessions"("studentId", "deviceFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_session_one_active" ON "tutor_student_sessions"("studentId") WHERE "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "tutor_student_sessions_academyId_studentId_expiresAt_idx" ON "tutor_student_sessions"("academyId", "studentId", "expiresAt");

CREATE INDEX IF NOT EXISTS "parent_consents_academyId_studentId_idx" ON "parent_consents"("academyId", "studentId");
CREATE INDEX IF NOT EXISTS "parent_consents_academyId_status_consentType_idx" ON "parent_consents"("academyId", "status", "consentType");
CREATE UNIQUE INDEX IF NOT EXISTS "parent_consent_active_uniq" ON "parent_consents"("studentId", "consentType") WHERE "withdrawnAt" IS NULL AND "status" = 'GRANTED';

CREATE INDEX IF NOT EXISTS "app_events_academyId_eventType_createdAt_idx" ON "app_events"("academyId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "app_events_academyId_actorType_actorId_idx" ON "app_events"("academyId", "actorType", "actorId");

CREATE INDEX IF NOT EXISTS "tutor_programs_academyId_status_updatedAt_idx" ON "tutor_programs"("academyId", "status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_program_versions_programId_version_key" ON "tutor_program_versions"("programId", "version");
CREATE INDEX IF NOT EXISTS "tutor_program_versions_academyId_programId_version_idx" ON "tutor_program_versions"("academyId", "programId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_program_lessons_programId_lessonId_key" ON "tutor_program_lessons"("programId", "lessonId");
CREATE INDEX IF NOT EXISTS "tutor_program_lessons_academyId_programId_orderNum_idx" ON "tutor_program_lessons"("academyId", "programId", "orderNum");

CREATE INDEX IF NOT EXISTS "tutor_lessons_academyId_status_updatedAt_idx" ON "tutor_lessons"("academyId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "tutor_lessons_academyId_passageId_idx" ON "tutor_lessons"("academyId", "passageId");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_lesson_versions_lessonId_version_key" ON "tutor_lesson_versions"("lessonId", "version");
CREATE INDEX IF NOT EXISTS "tutor_lesson_versions_academyId_lessonId_version_idx" ON "tutor_lesson_versions"("academyId", "lessonId", "version");
CREATE INDEX IF NOT EXISTS "tutor_activities_academyId_lessonId_orderNum_idx" ON "tutor_activities"("academyId", "lessonId", "orderNum");
CREATE INDEX IF NOT EXISTS "tutor_activities_academyId_mode_type_idx" ON "tutor_activities"("academyId", "mode", "type");

CREATE INDEX IF NOT EXISTS "tutor_assignments_academyId_status_availableFrom_idx" ON "tutor_assignments"("academyId", "status", "availableFrom");
CREATE INDEX IF NOT EXISTS "tutor_assignments_academyId_programId_idx" ON "tutor_assignments"("academyId", "programId");
CREATE INDEX IF NOT EXISTS "tutor_assignment_targets_academyId_assignmentId_idx" ON "tutor_assignment_targets"("academyId", "assignmentId");
CREATE INDEX IF NOT EXISTS "tutor_assignment_targets_academyId_targetType_targetId_idx" ON "tutor_assignment_targets"("academyId", "targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_assignment_recipients_assignmentId_studentId_key" ON "tutor_assignment_recipients"("assignmentId", "studentId");
CREATE INDEX IF NOT EXISTS "tutor_assignment_recipients_academyId_studentId_idx" ON "tutor_assignment_recipients"("academyId", "studentId");
CREATE INDEX IF NOT EXISTS "tutor_assignment_recipients_academyId_assignmentId_idx" ON "tutor_assignment_recipients"("academyId", "assignmentId");

CREATE INDEX IF NOT EXISTS "tutor_progress_academyId_studentId_status_idx" ON "tutor_progress"("academyId", "studentId", "status");
CREATE INDEX IF NOT EXISTS "tutor_progress_academyId_assignmentId_studentId_idx" ON "tutor_progress"("academyId", "assignmentId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_progress_program_uniq" ON "tutor_progress"("assignmentId", "studentId") WHERE "lessonId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_progress_lesson_uniq" ON "tutor_progress"("assignmentId", "studentId", "lessonId") WHERE "lessonId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tutor_attempts_assignmentId_studentId_lessonId_attemptNum_key" ON "tutor_attempts"("assignmentId", "studentId", "lessonId", "attemptNum");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_attempts_studentId_clientNonce_key" ON "tutor_attempts"("studentId", "clientNonce");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_attempt_one_inprogress" ON "tutor_attempts"("assignmentId", "studentId", "lessonId") WHERE "status" = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS "tutor_attempts_academyId_studentId_submittedAt_idx" ON "tutor_attempts"("academyId", "studentId", "submittedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_attempt_items_attemptId_activityId_itemIndex_key" ON "tutor_attempt_items"("attemptId", "activityId", "itemIndex");
CREATE INDEX IF NOT EXISTS "tutor_attempt_items_academyId_activityId_isCorrect_idx" ON "tutor_attempt_items"("academyId", "activityId", "isCorrect");
CREATE INDEX IF NOT EXISTS "tutor_attempt_items_academyId_itemRef_idx" ON "tutor_attempt_items"("academyId", "itemRef");

CREATE INDEX IF NOT EXISTS "tutor_conversations_academyId_studentId_updatedAt_idx" ON "tutor_conversations"("academyId", "studentId", "updatedAt");
CREATE INDEX IF NOT EXISTS "tutor_conversations_academyId_lessonId_updatedAt_idx" ON "tutor_conversations"("academyId", "lessonId", "updatedAt");
CREATE INDEX IF NOT EXISTS "tutor_messages_conversationId_createdAt_idx" ON "tutor_messages"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "tutor_messages_academyId_createdAt_idx" ON "tutor_messages"("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "tutor_ai_log_tags_academyId_tag_createdAt_idx" ON "tutor_ai_log_tags"("academyId", "tag", "createdAt");

CREATE INDEX IF NOT EXISTS "tutor_mastery_academyId_studentId_scope_idx" ON "tutor_mastery"("academyId", "studentId", "scope");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_mastery_uniq" ON "tutor_mastery"("studentId", "scope", "refKey", COALESCE("passageId", '_global'));
CREATE INDEX IF NOT EXISTS "tutor_review_schedules_academyId_studentId_dueAt_idx" ON "tutor_review_schedules"("academyId", "studentId", "dueAt");
CREATE INDEX IF NOT EXISTS "tutor_review_schedules_academyId_status_dueAt_idx" ON "tutor_review_schedules"("academyId", "status", "dueAt");
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_review_schedule_uniq" ON "tutor_review_schedules"("studentId", "scope", "refKey", COALESCE("programId", '_global'), COALESCE("lessonId", '_global'));

CREATE UNIQUE INDEX IF NOT EXISTS "tutor_coverage_snapshots_programId_lessonId_sentenceIndex_dimension_key" ON "tutor_coverage_snapshots"("programId", "lessonId", "sentenceIndex", "dimension");
CREATE INDEX IF NOT EXISTS "tutor_coverage_snapshots_academyId_programId_lessonId_idx" ON "tutor_coverage_snapshots"("academyId", "programId", "lessonId");
CREATE INDEX IF NOT EXISTS "tutor_weakness_snapshots_academyId_studentId_computedAt_idx" ON "tutor_weakness_snapshots"("academyId", "studentId", "computedAt");
CREATE INDEX IF NOT EXISTS "tutor_ai_logs_academyId_createdAt_idx" ON "tutor_ai_logs"("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "tutor_ai_logs_academyId_kind_status_idx" ON "tutor_ai_logs"("academyId", "kind", "status");
CREATE INDEX IF NOT EXISTS "moderation_logs_academyId_severity_createdAt_idx" ON "moderation_logs"("academyId", "severity", "createdAt");
CREATE INDEX IF NOT EXISTS "tutor_learning_events_academyId_studentId_createdAt_idx" ON "tutor_learning_events"("academyId", "studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "tutor_learning_events_academyId_eventType_createdAt_idx" ON "tutor_learning_events"("academyId", "eventType", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_plans_academyId_key" ON "billing_plans"("academyId");
CREATE UNIQUE INDEX IF NOT EXISTS "seat_billing_runs_academyId_yearMonth_key" ON "seat_billing_runs"("academyId", "yearMonth");
CREATE UNIQUE INDEX IF NOT EXISTS "academy_themes_academyId_key" ON "academy_themes"("academyId");
CREATE UNIQUE INDEX IF NOT EXISTS "academy_feature_flags_academyId_key_key" ON "academy_feature_flags"("academyId", "key");
CREATE INDEX IF NOT EXISTS "academy_feature_flags_academyId_enabled_idx" ON "academy_feature_flags"("academyId", "enabled");

ALTER TABLE "tutor_student_sessions" ADD CONSTRAINT "tutor_student_sessions_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_student_sessions" ADD CONSTRAINT "tutor_student_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_consents" ADD CONSTRAINT "parent_consents_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_consents" ADD CONSTRAINT "parent_consents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_programs" ADD CONSTRAINT "tutor_programs_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_programs" ADD CONSTRAINT "tutor_programs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_program_versions" ADD CONSTRAINT "tutor_program_versions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_lessons" ADD CONSTRAINT "tutor_lessons_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_lessons" ADD CONSTRAINT "tutor_lessons_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_lessons" ADD CONSTRAINT "tutor_lessons_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_program_lessons" ADD CONSTRAINT "tutor_program_lessons_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_program_lessons" ADD CONSTRAINT "tutor_program_lessons_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_lesson_versions" ADD CONSTRAINT "tutor_lesson_versions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_ai_logs" ADD CONSTRAINT "tutor_ai_logs_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_ai_logs" ADD CONSTRAINT "tutor_ai_logs_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_activities" ADD CONSTRAINT "tutor_activities_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_activities" ADD CONSTRAINT "tutor_activities_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_activities" ADD CONSTRAINT "tutor_activities_aiLogId_fkey" FOREIGN KEY ("aiLogId") REFERENCES "tutor_ai_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_targets" ADD CONSTRAINT "tutor_assignment_targets_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_targets" ADD CONSTRAINT "tutor_assignment_targets_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_recipients" ADD CONSTRAINT "tutor_assignment_recipients_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_recipients" ADD CONSTRAINT "tutor_assignment_recipients_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_recipients" ADD CONSTRAINT "tutor_assignment_recipients_sourceTargetId_fkey" FOREIGN KEY ("sourceTargetId") REFERENCES "tutor_assignment_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_assignment_recipients" ADD CONSTRAINT "tutor_assignment_recipients_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_weakness_snapshots" ADD CONSTRAINT "tutor_weakness_snapshots_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_weakness_snapshots" ADD CONSTRAINT "tutor_weakness_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_weakness_snapshots" ADD CONSTRAINT "tutor_weakness_snapshots_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_weakness_snapshots" ADD CONSTRAINT "tutor_weakness_snapshots_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "tutor_assignment_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_progress" ADD CONSTRAINT "tutor_progress_weaknessSnapshotId_fkey" FOREIGN KEY ("weaknessSnapshotId") REFERENCES "tutor_weakness_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tutor_attempts" ADD CONSTRAINT "tutor_attempts_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempts" ADD CONSTRAINT "tutor_attempts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempts" ADD CONSTRAINT "tutor_attempts_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempts" ADD CONSTRAINT "tutor_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempt_items" ADD CONSTRAINT "tutor_attempt_items_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempt_items" ADD CONSTRAINT "tutor_attempt_items_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "tutor_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempt_items" ADD CONSTRAINT "tutor_attempt_items_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "tutor_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_attempt_items" ADD CONSTRAINT "tutor_attempt_items_aiGradeLogId_fkey" FOREIGN KEY ("aiGradeLogId") REFERENCES "tutor_ai_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "tutor_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tutor_mastery" ADD CONSTRAINT "tutor_mastery_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_mastery" ADD CONSTRAINT "tutor_mastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_review_schedules" ADD CONSTRAINT "tutor_review_schedules_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_review_schedules" ADD CONSTRAINT "tutor_review_schedules_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_coverage_snapshots" ADD CONSTRAINT "tutor_coverage_snapshots_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_coverage_snapshots" ADD CONSTRAINT "tutor_coverage_snapshots_programId_fkey" FOREIGN KEY ("programId") REFERENCES "tutor_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_coverage_snapshots" ADD CONSTRAINT "tutor_coverage_snapshots_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "tutor_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_learning_events" ADD CONSTRAINT "tutor_learning_events_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_learning_events" ADD CONSTRAINT "tutor_learning_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seat_billing_runs" ADD CONSTRAINT "seat_billing_runs_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_themes" ADD CONSTRAINT "academy_themes_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_feature_flags" ADD CONSTRAINT "academy_feature_flags_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_student_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_program_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_program_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_lesson_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_ai_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_assignment_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_assignment_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_attempt_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_ai_log_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_mastery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_review_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_coverage_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_weakness_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moderation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tutor_learning_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seat_billing_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academy_themes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academy_feature_flags" ENABLE ROW LEVEL SECURITY;

