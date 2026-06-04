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
   * Show the STANDARD/PREMIUM model selector in question generation and
   * passage analysis flows. When false, all jobs are routed to STANDARD
   * (Gemini 3.5 Flash) and the UI does not expose any model choice.
   *
   * Backend PREMIUM (Claude Sonnet 4.6) wiring is preserved — flip this
   * flag to true to restore the picker without any other changes.
   */
  SHOW_MODEL_SELECTOR: false,

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
   * Enable the credit top-up purchase controls on the director credit page.
   * When false, the page and credit balance remain visible, but the top-up
   * section is shaded and non-interactive.
   */
  SHOW_CREDIT_TOP_UP: publicBooleanFlag(
    process.env.NEXT_PUBLIC_SHOW_CREDIT_TOP_UP ??
      process.env.NEXT_PUBLIC_SHOW_CREDIT_PAYMENTS,
    false,
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
   */
  EXTRACTION_ADAPTIVE_INTAKE: publicBooleanFlag(
    process.env.NEXT_PUBLIC_EXTRACTION_ADAPTIVE_INTAKE,
    false,
  ),
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
