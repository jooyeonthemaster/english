/**
 * Centralized feature flags.
 *
 * Use this module to toggle UI/runtime behaviour without removing the
 * underlying code paths. Keeping a flag here (rather than deleting code)
 * means we can re-enable a capability with a one-line change.
 */
function publicBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (value == null || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

export const FEATURE_FLAGS = {
  /**
   * Show the STANDARD/PREMIUM quality selector in question generation and
   * passage analysis flows. When false, all jobs use the standard quality
   * path and the UI does not expose any generation quality choice —
   * `normalizeQuestionGenerationPlan` also clamps PREMIUM → STANDARD so saved
   * settings and direct API calls cannot bill the 2x premium multiplier.
   *
   * 26-07-14 잠정 중단 → 26-07-15 재개: 어법 PREMIUM 이 새 엔진(gemini-3.1-pro
   * 3콜 사다리 — grammar-premium-ladder.ts, 실측 98원/문항·완화 0·E2E 채점
   * 9/10·F0)으로 교체되어 속도·마진 문제가 해소됨. 이어서 26-07-14 유저 확정으로
   * 비어법 PREMIUM "문제생성"도 gemini-3.1-pro-preview 로 전면 교체
   * (ATLAS_PREMIUM_QGEN_MODEL_ID, env PREMIUM_QGEN_MODEL_ID 롤백 가능). 문제생성이
   * 아닌 PREMIUM 소비자(지문분석·학습문제 텍스트 경로, exam-report, AI 문제수정,
   * 동형분석)는 기존 Claude(ATLAS_PREMIUM_MODEL_ID) 그대로.
   */
  SHOW_MODEL_SELECTOR: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_MODEL_SELECTOR,
    true,
  ),

  /**
   * Show student/parent/tutor-facing result surfaces such as grades, reports,
   * rankings, wrong-answer review, and exam-result pages.
   *
   * Temporarily defaults to hidden for PG review preparation. Set
   * NEXT_PUBLIC_SHOW_USER_RESULTS=true and redeploy to restore the UI without
   * changing or deleting any stored data.
   */
  SHOW_USER_RESULTS: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_USER_RESULTS,
    false,
  ),

  /**
   * Show the similar-exam generation flow. When false, the left navigation and
   * task queue hide the entrypoint, and direct page visits redirect to the exam
   * management surface while the underlying code remains intact.
   */
  SHOW_SIMILAR_EXAM_GENERATION: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_SIMILAR_EXAM_GENERATION,
    false,
  ),

  /**
   * Enable the credit top-up purchase controls on the director credit page.
   * When false, the page and credit balance remain visible, but the top-up
   * section is shaded and non-interactive.
   *
   * 26-07-15 PG 실연동 출시로 기본값 ON. 긴급 차단이 필요하면
   * NEXT_PUBLIC_SHOW_CREDIT_TOP_UP=false 로 내릴 수 있다.
   */
  SHOW_CREDIT_TOP_UP: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_CREDIT_TOP_UP ??
      process.env.NEXT_PUBLIC_SHOW_CREDIT_PAYMENTS,
    true,
  ),

  /**
   * Enable subscription card registration and recurring billing controls on the
   * director credit page. When false, the subscription section is shaded and
   * non-interactive while the underlying billing code stays in place.
   */
  SHOW_SUBSCRIPTION_BILLING: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING,
    false,
  ),

  /**
   * Enable 장문 세트 (long-passage multi-question sets): the 3rd generation mode
   * that attaches multiple ordered questions to ONE shared passage with
   * deterministic hint-leakage isolation (generalizes CSAT 43~45). Gates the set
   * mode toggle, the set generation/finalize endpoints, the set renderer, and the
   * paper-builder set-aware grouping. The additive schema columns ship inert when
   * off. See docs/long-passage-set-architecture.md.
   */
  ENABLE_LONG_PASSAGE_SETS: publicBooleanFlag(
    process.env.NEXT_PUBLIC_ENABLE_LONG_PASSAGE_SETS,
    true,
  ),

  /**
   * Enable the "적응형 인테이크 (Adaptive Intake)" extraction flow: pre-analysis
   * triage, input-type-aware surfaces, image crop tooling, opt-in AI restore,
   * multi-page bundled OCR, and passage-unit progress. When false the upload
   * step renders the existing single-funnel flow and none of the additive
   * schema columns are read (zero behavior change). See
   * docs/EXTRACTION-ADAPTIVE-INTAKE-DESIGN.md.
   *
   * Defaults to ON: this is now the primary extraction flow (crop tooling + AI
   * 원문 복원). Set NEXT_PUBLIC_EXTRACTION_ADAPTIVE_INTAKE=false to fall back to
   * the legacy single-funnel uploader without removing any code.
   */
  EXTRACTION_ADAPTIVE_INTAKE: publicBooleanFlag(
    process.env.NEXT_PUBLIC_EXTRACTION_ADAPTIVE_INTAKE,
    true,
  ),

  /**
   * Show 원비(수강료) tracking inside the tutor operations hub and the student
   * detail page: the per-row billing column/popover and the student billing
   * section (invoice issue + manual paid/partial recording, NO payment gateway).
   *
   * Defaults to ON (directors asked for tuition tracking). Set
   * NEXT_PUBLIC_SHOW_TUTOR_BILLING=false to hide all 원비 UI without removing
   * any code — billing remains record-keeping only, never real settlement.
   */
  SHOW_TUTOR_BILLING: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_TUTOR_BILLING,
    true,
  ),

  /**
   * 26-07-09 시험지 배포·OMR 대개편: 자체 생성 시험지의 응시 학생 할당, 태블릿
   * 시험 배포(/t/[token]), 결정론 즉시채점, 응시 현황 탭, 학생 응시 이력 탭을
   * 게이트한다. SHOW_USER_RESULTS(PG 심사 대비 잠금 — 레거시 학생앱 표면)와
   * 완전히 독립 — 이 플래그는 레거시를 되살리지 않는다.
   */
  ENABLE_EXAM_DEPLOYMENT: publicBooleanFlag(
    process.env.NEXT_PUBLIC_ENABLE_EXAM_DEPLOYMENT,
    true,
  ),

  /**
   * 26-07-10 모바일 어법 학습 툴(/g): 학생 코드 진입 어법 드릴 앱 +
   * /director/grammar-lab 학생 분석 대시보드를 게이트한다.
   */
  ENABLE_GRAMMAR_DRILL: publicBooleanFlag(
    process.env.NEXT_PUBLIC_ENABLE_GRAMMAR_DRILL,
    true,
  ),

  /**
   * v3 어법 훈련소(/director/workbench/grammar-studio): 유닛 문항 브라우징 +
   * 합성지문 AI 생성 허브. 기본 false 다크런칭(v3 design §D5-1) —
   * 생성 P1 실측(b01 10문항·솔버 통과율) 확인 후 on.
   */
  ENABLE_GRAMMAR_STUDIO: publicBooleanFlag(
    process.env.NEXT_PUBLIC_ENABLE_GRAMMAR_STUDIO,
    false,
  ),
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
