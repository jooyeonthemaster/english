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
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
