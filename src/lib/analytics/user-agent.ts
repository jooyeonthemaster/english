// ============================================================================
// User-Agent 파서 — 의존성 없는 정규식. 인앱 브라우저(카톡·인스타·네이버앱…) 판별이 핵심.
// 계약: docs/analytics/analytics-spec.md §4.3, §4.5
// 순수 함수 — 서버/클라이언트/게이트 스크립트 공용.
// ============================================================================

export interface ParsedUserAgent {
  deviceType: "mobile" | "tablet" | "desktop";
  browser: string;
  browserVersion: string | null;
  os: string;
  inApp: string | null;
}

/** 순서 중요: 더 구체적인 토큰이 먼저. */
const IN_APP_RULES: Array<[RegExp, string]> = [
  [/KAKAOTALK/i, "kakaotalk"],
  [/NAVER\(inapp/i, "naver"],
  [/Barcelona/, "threads"],
  [/Instagram/, "instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/, "facebook"],
  [/\bLine\//, "line"],
  [/\bBAND\//, "band"],
  [/DaumApps/i, "daum"],
  [/everytimeApp/i, "everytime"],
  [/musical_ly|BytedanceWebview|trill_/i, "tiktok"],
  [/Snapchat/i, "snapchat"],
  [/MicroMessenger/i, "wechat"],
];

const BROWSER_RULES: Array<[RegExp, string]> = [
  [/Whale\/([\d.]+)/, "Whale"],
  [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
  [/EdgA?\/([\d.]+)|EdgiOS\/([\d.]+)/, "Edge"],
  [/OPR\/([\d.]+)|Opera\/([\d.]+)/, "Opera"],
  [/FxiOS\/([\d.]+)|Firefox\/([\d.]+)/, "Firefox"],
  [/CriOS\/([\d.]+)/, "Chrome"],
  [/Chrome\/([\d.]+)/, "Chrome"],
  [/Version\/([\d.]+).*Safari\//, "Safari"],
  [/Safari\//, "Safari"],
];

const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|discordbot|kakaotalk-scrap|yeti|daumoa|bingpreview|petalbot|semrush|ahrefs|mj12|dotbot|gptbot|claudebot|claude-web|perplexitybot|bytespider|amazonbot|applebot|google-inspectiontool|chrome-lighthouse|python-requests|python-urllib|curl\/|wget|axios|node-fetch|undici|go-http-client|java\/|okhttp|puppeteer|phantomjs|selenium|scrapy|httpclient|feedfetcher|monitor|uptime/i;

const HEADLESS_RE = /HeadlessChrome|Playwright/i;

/**
 * 봇 판정. UA 없음 = 봇.
 * allowHeadless=true 이면 헤드리스 크롬은 사람으로 취급(로컬 E2E 게이트 전용).
 */
export function isBotUserAgent(ua: string | null | undefined, allowHeadless = false): boolean {
  if (!ua || ua.length < 12) return true;
  if (HEADLESS_RE.test(ua)) return !allowHeadless;
  return BOT_RE.test(ua);
}

export function detectInApp(ua: string): string | null {
  for (const [re, name] of IN_APP_RULES) {
    if (re.test(ua)) return name;
  }
  return null;
}

function detectOs(ua: string): string {
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/iPad/.test(ua)) return "iPadOS";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows NT/.test(ua)) return "Windows";
  // iPadOS 13+ 데스크톱 모드는 Macintosh 로 위장 — 터치 여부는 UA 로 못 봐서 macOS 로 둔다.
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "기타";
}

function detectDevice(ua: string): ParsedUserAgent["deviceType"] {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) return "tablet";
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

function detectBrowser(ua: string, inApp: string | null): { browser: string; version: string | null } {
  if (inApp) {
    // 인앱은 브라우저명 자체를 인앱으로 — 버전은 엔진(Chrome/Safari) 버전을 보조로.
    const engine = /Chrome\/([\d.]+)/.exec(ua) ?? /Version\/([\d.]+)/.exec(ua);
    return { browser: `인앱:${inApp}`, version: engine?.[1]?.split(".")[0] ?? null };
  }
  for (const [re, name] of BROWSER_RULES) {
    const m = re.exec(ua);
    if (m) {
      const ver = m.slice(1).find((x) => !!x) ?? null;
      return { browser: name, version: ver ? ver.split(".")[0] : null };
    }
  }
  return { browser: "기타", version: null };
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua ?? "";
  const inApp = detectInApp(s);
  const { browser, version } = detectBrowser(s, inApp);
  return {
    deviceType: detectDevice(s),
    browser,
    browserVersion: version,
    os: detectOs(s),
    inApp,
  };
}
