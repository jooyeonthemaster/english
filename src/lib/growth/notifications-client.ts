/**
 * Client notification bus. After an action that may create a notification
 * (claim a mission, share a referral link, etc.), call notifyNotificationsChanged()
 * so the sidebar bell re-fetches its summary immediately instead of waiting for
 * the next poll. Mirrors @/lib/credits-client (CREDITS_CHANGED_EVENT).
 */
export const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";

export function notifyNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
