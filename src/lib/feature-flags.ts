/**
 * Centralized feature flags.
 *
 * Use this module to toggle UI/runtime behaviour without removing the
 * underlying code paths. Keeping a flag here (rather than deleting code)
 * means we can re-enable a capability with a one-line change.
 */
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
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
