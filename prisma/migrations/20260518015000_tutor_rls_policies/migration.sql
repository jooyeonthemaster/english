CREATE OR REPLACE FUNCTION public.app_claim_text(claim_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims JSONB;
BEGIN
  claims := NULLIF(current_setting('request.jwt.claims', TRUE), '')::JSONB;
  RETURN claims ->> claim_key;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'app_events',
    'tutor_programs',
    'tutor_program_versions',
    'tutor_lessons',
    'tutor_program_lessons',
    'tutor_lesson_versions',
    'tutor_ai_logs',
    'tutor_activities',
    'tutor_assignments',
    'tutor_assignment_targets',
    'tutor_ai_log_tags',
    'tutor_coverage_snapshots',
    'billing_plans',
    'seat_billing_runs',
    'academy_themes',
    'academy_feature_flags'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_academy_policy', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
        USING ("academyId" = public.app_claim_text(''academy_id''))
        WITH CHECK ("academyId" = public.app_claim_text(''academy_id''))',
      tbl || '_academy_policy',
      tbl
    );
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'tutor_student_sessions',
    'parent_consents',
    'tutor_assignment_recipients',
    'tutor_weakness_snapshots',
    'tutor_progress',
    'tutor_attempts',
    'tutor_conversations',
    'tutor_messages',
    'tutor_mastery',
    'tutor_review_schedules',
    'moderation_logs',
    'tutor_learning_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_student_or_staff_policy', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
        USING (
          "academyId" = public.app_claim_text(''academy_id'')
          AND (
            public.app_claim_text(''kind'') IN (''staff'', ''director'')
            OR "studentId" = public.app_claim_text(''student_id'')
          )
        )
        WITH CHECK (
          "academyId" = public.app_claim_text(''academy_id'')
          AND (
            public.app_claim_text(''kind'') IN (''staff'', ''director'')
            OR "studentId" = public.app_claim_text(''student_id'')
          )
        )',
      tbl || '_student_or_staff_policy',
      tbl
    );
  END LOOP;
END;
$$;
