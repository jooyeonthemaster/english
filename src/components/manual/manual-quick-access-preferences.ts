export const MANUAL_QUICK_ACCESS_STORAGE_KEY = "smoat.manual.quickAccess.enabled";
export const MANUAL_QUICK_ACCESS_EVENT = "smoat:manual-quick-access-change";

export function readManualQuickAccessEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MANUAL_QUICK_ACCESS_STORAGE_KEY) === "true";
}

export function writeManualQuickAccessEnabled(enabled: boolean) {
  window.localStorage.setItem(MANUAL_QUICK_ACCESS_STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent(MANUAL_QUICK_ACCESS_EVENT, { detail: { enabled } }));
}

export function subscribeManualQuickAccess(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", callback);
  window.addEventListener(MANUAL_QUICK_ACCESS_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MANUAL_QUICK_ACCESS_EVENT, callback);
  };
}

export function getManualQuickAccessServerSnapshot() {
  return false;
}
