/**
 * Shared constants for the "7월 1일까지 무료 + 협업 피드백 이벤트" program.
 *
 * Imported by BOTH the signup API route (server) and the dashboard
 * feedback-event modal / banner (client), so keep this a pure constants module
 * with no server-only or client-only dependencies.
 */

/** Credits granted to a brand-new self-signup account on onboarding. */
export const SIGNUP_CREDITS = 100;

/**
 * When the academy's credit balance drops to or below this, the feedback-event
 * modal auto-opens so they can apply for more free credits.
 */
export const LOW_CREDIT_THRESHOLD = 10;

/**
 * Free-trial end (KST). Mirrors FREE_TRIAL_END in the onboarding route — keep
 * both in sync if the campaign date changes.
 */
export const FREE_TRIAL_END_ISO = "2026-07-01T23:59:59+09:00";

/** Human label for the free-period end, used across UI copy. */
export const FREE_UNTIL_LABEL = "7월 1일";

/**
 * Feedback-collaboration program contact. During the free period the team
 * places a call FROM this number to collect product feedback; feedback
 * collaborators receive additional free credits.
 */
export const FEEDBACK_PHONE_DISPLAY = "010-6811-1106";
export const FEEDBACK_PHONE_TEL = "01068111106";

/** Extra free credits offered to feedback-collaborating users (display only). */
export const FEEDBACK_BONUS_CREDITS_LABEL = "추가 무료 크레딧";
