export const LEFT_WIDTH_STORAGE_KEY = "smoat.similarQuestion.leftWidth.v1";
export const LEFT_COLLAPSED_STORAGE_KEY = "smoat.similarQuestion.leftCollapsed.v1";
export const PANEL_TOGGLE_HANDLE_WIDTH = 24;
export const PANEL_DRAG_THRESHOLD = 4;
export const PANEL_MIN_CENTER = 460;
export const LEFT_DEFAULT = 580;
export const LEFT_MIN = 380;
export const LEFT_MAX = 860;

export function clampNumber(value: number, min: number, max: number) {
  const normalizedMax = Math.max(min, max);
  return Math.min(Math.max(value, min), normalizedMax);
}

export function readStoredLeftWidth(): number {
  if (typeof window === "undefined") return LEFT_DEFAULT;
  const raw = Number(window.localStorage.getItem(LEFT_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return LEFT_DEFAULT;
  return clampNumber(raw, LEFT_MIN, LEFT_MAX);
}

export function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LEFT_COLLAPSED_STORAGE_KEY) === "true";
}

export function mediaTypeForBlob(blob: Blob): "image/png" | "image/webp" | "image/jpeg" {
  if (blob.type === "image/png") return "image/png";
  if (blob.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
