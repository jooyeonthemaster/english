import { HelpCircle, Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";

export type DeviceKind = "mobile" | "tablet" | "desktop" | "unknown";

export interface ParsedUserAgent {
  deviceKind: DeviceKind;
  os: string;
  browser: string;
  Icon: LucideIcon;
  /** e.g. "iPhone · Safari" or "알 수 없는 기기" */
  label: string;
}

/**
 * Best-effort device/browser detection from a stored userAgent string.
 * Intentionally lightweight (no UA-parser dependency) — used only for a
 * friendly device label on the director's device-management screen.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || ua.toLowerCase() === "unknown") {
    return { deviceKind: "unknown", os: "", browser: "", Icon: HelpCircle, label: "알 수 없는 기기" };
  }

  const s = ua.toLowerCase();

  let os = "기타";
  if (/iphone|ipod/.test(s)) os = "iPhone";
  else if (/ipad/.test(s)) os = "iPad";
  else if (/android/.test(s)) os = "Android";
  else if (/windows/.test(s)) os = "Windows";
  else if (/mac os x|macintosh/.test(s)) os = "Mac";
  else if (/cros/.test(s)) os = "ChromeOS";
  else if (/linux/.test(s)) os = "Linux";

  // Order matters: Edge/Samsung/Whale ship "chrome" in their UA too.
  let browser = "브라우저";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/samsungbrowser/.test(s)) browser = "삼성 인터넷";
  else if (/whale/.test(s)) browser = "웨일";
  else if (/kakaotalk/.test(s)) browser = "카카오톡";
  else if (/crios|chrome/.test(s)) browser = "Chrome";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";

  let deviceKind: DeviceKind = "desktop";
  if (/ipad|tablet/.test(s) || (/android/.test(s) && !/mobile/.test(s))) {
    deviceKind = "tablet";
  } else if (/iphone|ipod|android|mobile/.test(s)) {
    deviceKind = "mobile";
  }

  const Icon = deviceKind === "mobile" ? Smartphone : deviceKind === "tablet" ? Tablet : Monitor;
  return { deviceKind, os, browser, Icon, label: `${os} · ${browser}` };
}
