/**
 * 게이트 G2 — 유입 분류기·UA 파서·정화기 단위 검증.
 *   npx tsx scripts/analytics-gate-classify.ts
 * 종료 코드 0 = 전건 통과, 1 = 실패 있음, 2 = 케이스 0건(계기 고장).
 * 계약: docs/analytics/analytics-spec.md §3.4, §4
 */
import { classifyAttribution, isIgnoredReferrerHost } from "../src/lib/analytics/classify";
import { isBotUserAgent, parseUserAgent } from "../src/lib/analytics/user-agent";
import { areaOfPath, maskSensitivePath, normalizePath, pathGroup, sanitizeQuery, sanitizeReferrer } from "../src/lib/analytics/sanitize";
import { resolvePeriod, bucketKeys } from "../src/lib/analytics/time";

let pass = 0;
let fail = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  kakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.6.1",
  naverApp: "Mozilla/5.0 (Linux; Android 14; SM-S928N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.2)",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.34.94 (iPhone15,2; iOS 17_6; ko_KR; ko; scale=3.00; 1179x2556; 634108168)",
  threads: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.21.107 (iPhone16,1; iOS 17_6; ko_KR; ko; scale=3.00; 1179x2556; 646110467) NW/3",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/476.0.0.35.105;FBBV/649223817;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5;FBRV/0]",
  band: "Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 BAND/15.4.5",
  whale: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.27.254.15 Safari/537.36",
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X910N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  yeti: "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  kakaoScrap: "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/public-ogtag",
  headless: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/139.0.0.0 Safari/537.36",
};

// ── UA ──
eq("ua kakao inApp", parseUserAgent(UA.kakao).inApp, "kakaotalk");
eq("ua kakao device", parseUserAgent(UA.kakao).deviceType, "mobile");
eq("ua kakao os", parseUserAgent(UA.kakao).os, "iOS");
eq("ua naver inApp", parseUserAgent(UA.naverApp).inApp, "naver");
eq("ua instagram", parseUserAgent(UA.instagram).inApp, "instagram");
eq("ua threads", parseUserAgent(UA.threads).inApp, "threads");
eq("ua facebook", parseUserAgent(UA.facebook).inApp, "facebook");
eq("ua band", parseUserAgent(UA.band).inApp, "band");
eq("ua whale not inapp", parseUserAgent(UA.whale).inApp, null);
eq("ua whale browser", parseUserAgent(UA.whale).browser, "Whale");
eq("ua chrome win", [parseUserAgent(UA.chromeWin).browser, parseUserAgent(UA.chromeWin).os, parseUserAgent(UA.chromeWin).deviceType], ["Chrome", "Windows", "desktop"]);
eq("ua safari iphone", [parseUserAgent(UA.iphoneSafari).browser, parseUserAgent(UA.iphoneSafari).browserVersion], ["Safari", "18"]);
eq("ua ipad tablet", parseUserAgent(UA.ipad).deviceType, "tablet");
eq("ua android tablet", parseUserAgent(UA.androidTablet).deviceType, "tablet");
eq("ua samsung", parseUserAgent(UA.samsung).browser, "Samsung Internet");
eq("bot googlebot", isBotUserAgent(UA.googlebot), true);
eq("bot yeti", isBotUserAgent(UA.yeti), true);
eq("bot gptbot", isBotUserAgent(UA.gptbot), true);
eq("bot kakao scrap", isBotUserAgent(UA.kakaoScrap), true);
eq("bot headless default", isBotUserAgent(UA.headless), true);
eq("bot headless allowed", isBotUserAgent(UA.headless, true), false);
eq("bot human kakao", isBotUserAgent(UA.kakao), false);
eq("bot human chrome", isBotUserAgent(UA.chromeWin), false);
eq("bot empty", isBotUserAgent(""), true);

// ── 분류 ──
const c = (ref: string | null, qs = "", inApp: string | null = null) => {
  const r = classifyAttribution({ referrerHost: ref, query: sanitizeQuery(qs), inApp });
  return [r.channel, r.source];
};
eq("google search", c("www.google.com"), ["organic_search", "google"]);
eq("google.co.kr", c("www.google.co.kr"), ["organic_search", "google"]);
eq("naver search", c("search.naver.com"), ["organic_search", "naver"]);
eq("naver m search", c("m.search.naver.com"), ["organic_search", "naver"]);
eq("naver blog", c("blog.naver.com"), ["community", "naver_blog"]);
eq("naver m blog", c("m.blog.naver.com"), ["community", "naver_blog"]);
eq("naver cafe", c("cafe.naver.com"), ["community", "naver_cafe"]);
eq("daum search", c("search.daum.net"), ["organic_search", "daum"]);
eq("daum cafe", c("cafe.daum.net"), ["community", "daum_cafe"]);
eq("instagram l.", c("l.instagram.com"), ["organic_social", "instagram"]);
eq("facebook lm.", c("lm.facebook.com"), ["organic_social", "facebook"]);
eq("threads", c("l.threads.com"), ["organic_social", "threads"]);
eq("x t.co", c("t.co"), ["organic_social", "x"]);
eq("youtube", c("www.youtube.com"), ["video", "youtube"]);
eq("kakao channel", c("pf.kakao.com"), ["messenger", "kakao_channel"]);
eq("chatgpt", c("chatgpt.com"), ["ai", "chatgpt"]);
eq("gemini not google search", c("gemini.google.com"), ["ai", "gemini"]);
eq("perplexity", c("www.perplexity.ai"), ["ai", "perplexity"]);
eq("gmail", c("mail.google.com"), ["email", "gmail"]);
eq("naver mail", c("mail.naver.com"), ["email", "naver_mail"]);
eq("unknown referral", c("www.hagwon-community.kr"), ["referral", "hagwon-community.kr"]);
eq("self referrer ignored", c("www.smoat.co.kr"), ["direct", "(direct)"]);
eq("payment return ignored", c("mobile.inicis.com"), ["direct", "(direct)"]);
eq("oauth return ignored", c("accounts.google.com"), ["direct", "(direct)"]);
eq("direct", c(null), ["direct", "(direct)"]);
eq("kakao inapp no ref", c(null, "", "kakaotalk"), ["messenger", "kakaotalk"]);
eq("instagram inapp no ref", c(null, "", "instagram"), ["organic_social", "instagram"]);
eq("naver app no ref", c(null, "", "naver"), ["direct", "naver_app"]);
eq("band inapp", c(null, "", "band"), ["community", "band"]);
eq("utm instagram social", c(null, "?utm_source=instagram&utm_medium=social&utm_campaign=bio"), ["organic_social", "instagram"]);
eq("utm ig alias", c(null, "?utm_source=ig&utm_medium=social"), ["organic_social", "instagram"]);
eq("utm meta paid", c(null, "?utm_source=facebook&utm_medium=cpc"), ["paid_social", "facebook"]);
eq("utm naver cpc", c(null, "?utm_source=naver&utm_medium=cpc"), ["paid_search", "naver"]);
eq("utm kakao messenger", c(null, "?utm_source=kakaotalk&utm_medium=share"), ["messenger", "kakaotalk"]);
eq("utm email", c(null, "?utm_source=newsletter&utm_medium=email"), ["email", "newsletter"]);
eq("utm chatgpt host", c(null, "?utm_source=chatgpt.com"), ["ai", "chatgpt"]);
eq("utm source only unknown", c(null, "?utm_source=partner_x"), ["referral", "partner_x"]);
eq("utm blog medium", c(null, "?utm_source=naver_blog&utm_medium=blog"), ["community", "naver_blog"]);
eq("utm qr offline", c(null, "?utm_source=flyer&utm_medium=qr"), ["referral", "flyer"]);
eq("utm youtube social=video", c(null, "?utm_source=youtube&utm_medium=social"), ["video", "youtube"]);
eq("gclid", c("www.google.com", "?gclid=abc"), ["paid_search", "google"]);
eq("NaPm naver ad", c("search.naver.com", "?NaPm=ct%3Dabc"), ["paid_search", "naver"]);
eq("fbclid instagram organic", c("l.instagram.com", "?fbclid=xyz"), ["organic_social", "instagram"]);
eq("fbclid no ref", c(null, "?fbclid=xyz"), ["organic_social", "facebook"]);
eq("ttclid", c(null, "?ttclid=1"), ["paid_social", "tiktok"]);
eq("campaign kept", classifyAttribution({ referrerHost: null, query: sanitizeQuery("?utm_source=instagram&utm_medium=social&utm_campaign=sept_mock"), inApp: null }).campaign, "sept_mock");
eq("ignored host fn", isIgnoredReferrerHost("smoat.co.kr"), true);

// ── 정화 ──
eq("query strips pii", sanitizeQuery("?token=abc&email=a@b.com&utm_source=ig&q=secret"), { utm_source: "ig" });
eq("query drops email value", sanitizeQuery("?utm_content=kim@naver.com"), {});
eq("path trailing slash", normalizePath("/features/"), "/features");
eq("path query stripped", normalizePath("/auth/complete?token=abc"), "/auth/complete");
eq("path not absolute", normalizePath("features"), null);
eq("mask t token", maskSensitivePath("/t/AbCdEf0123456789AbCdEf0123456789"), "/t/:token");
eq("mask r exam", maskSensitivePath("/r/exam/AbCdEf0123456789"), "/r/exam/:token");
eq("mask r token", maskSensitivePath("/r/AbCdEf0123456789/print"), "/r/:token/print");
eq("mask promo", maskSensitivePath("/credits/promo/xyz123"), "/credits/promo/:token");
eq("no mask normal", maskSensitivePath("/resources/2026-09"), "/resources/2026-09");
// RC-TOKENMASK — 2단 경로·프로모션 슬러그·이메일(공개 경로 전수 대조: /t/[token]·/t/e/[enrollToken]·/r/[token]·/r/exam/[token]·/a/[token]·/credits/promo/[token]·/credits/promo/b/[slug])
eq("mask t enroll 2seg", maskSensitivePath("/t/e/x7Kd3hQwPb2sLmT9aZrN4vUcE1yJgHfI"), "/t/e/:token");
eq("mask t enroll deep", maskSensitivePath("/t/e/x7Kd3hQwPb2sLmT9aZrN4vUcE1yJgHfI/start"), "/t/e/:token/start");
eq("mask a token", maskSensitivePath("/a/QAtoken0123456789abcdefQAtoken01"), "/a/:token");
eq("mask r exam deep", maskSensitivePath("/r/exam/QAtoken0123456789abcdefQAtoken01/print"), "/r/exam/:token/print");
eq("promo bundle slug kept", maskSensitivePath("/credits/promo/b/spring-sale"), "/credits/promo/b/spring-sale");
eq("mask email path", maskSensitivePath("/find-id/hong@example.com"), "/find-id/:redacted");
eq("mask email encoded", maskSensitivePath("/find-id/hong%40example.com"), "/find-id/:redacted");
eq("no mask public slug", maskSensitivePath("/resources/2026-09-hakpyeong-english"), "/resources/2026-09-hakpyeong-english");
// referrer 도 같은 규칙 — 자기 도메인 referrer 의 경로에 토큰이 실려 온다(SEC-9)
eq("referrer self masked", sanitizeReferrer("https://www.smoat.co.kr/t/e/x7Kd3hQwPb2sLmT9aZrN4vUcE1yJgHfI")?.url, "https://www.smoat.co.kr/t/e/:token");
eq("referrer self exam masked", sanitizeReferrer("https://smoat.co.kr/r/exam/QAtoken0123456789abcdefQAtoken01")?.path, "/r/exam/:token");
eq("referrer external kept", sanitizeReferrer("https://blog.naver.com/hello/223")?.path, "/hello/223");
eq("area director", areaOfPath("/director/studio"), "director");
eq("area register", areaOfPath("/register"), "auth");
eq("area admin null", areaOfPath("/admin/analytics"), null);
eq("area g drill", areaOfPath("/g/home"), "drill");
eq("area marketing", areaOfPath("/features/exam"), "marketing");
eq("pathGroup cuid", pathGroup("/director/exams/cmq6p1guc0001js040o8rjl84"), "/director/exams/:id");
// U3-2 — 사람이 읽는 SEO 슬러그는 접지 않는다(공개 콘텐츠 성과가 :id 한 줄에 묻혔다)
eq("pathGroup guide slug", pathGroup("/guides/naesin-english-exam-prep"), "/guides/naesin-english-exam-prep");
eq("pathGroup resource slug", pathGroup("/resources/2026-09-hakpyeong-english"), "/resources/2026-09-hakpyeong-english");
eq("pathGroup textbook slug", pathGroup("/textbooks/ebs-suneung-teukgang-2026"), "/textbooks/ebs-suneung-teukgang-2026");
eq("pathGroup short slug", pathGroup("/guides/descriptive-overview"), "/guides/descriptive-overview");
eq("pathGroup numeric id", pathGroup("/passages/1234567"), "/passages/:id");
eq("pathGroup opaque token", pathGroup("/exam/QAtoken0123456789abcdefQAtoken01"), "/exam/:id");
eq("referrer strips query", sanitizeReferrer("https://search.naver.com/search.naver?query=%EC%98%81%EC%96%B4")?.url, "https://search.naver.com/search.naver");
eq("referrer non-http", sanitizeReferrer("javascript:alert(1)"), null);

// ── 기간(KST) ──
// 2026-09-17 10:00 KST = 01:00 UTC
const now = Date.UTC(2026, 8, 17, 1, 0, 0);
const today = resolvePeriod({ range: "today" }, now);
eq("today from", today.from.toISOString(), "2026-09-16T15:00:00.000Z");
eq("today to", today.to.toISOString(), "2026-09-17T15:00:00.000Z");
eq("today granularity", today.granularity, "hour");
eq("today buckets", bucketKeys(today).length, 24);
eq("today first bucket", bucketKeys(today)[0], "2026-09-17 00");
const d7 = resolvePeriod({ range: "7d" }, now);
eq("7d fromDay", d7.fromDay, "2026-09-11");
eq("7d prevFrom", d7.prevFrom.toISOString(), "2026-09-03T15:00:00.000Z");
eq("7d buckets", bucketKeys(d7), ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
// 00:30 KST(= 전날 15:30 UTC) 은 KST 오늘이다
const early = resolvePeriod({ range: "today" }, Date.UTC(2026, 8, 16, 15, 30));
eq("kst midnight boundary", early.fromDay, "2026-09-17");
eq("custom invalid falls back", resolvePeriod({ range: "custom", from: "2026-09-10", to: "bad" }, now).range, "7d");
eq("custom valid", resolvePeriod({ range: "custom", from: "2026-09-01", to: "2026-09-10" }, now).days, 10);

const total = pass + fail;
console.log(`\nanalytics-gate-classify: ${pass}/${total} pass`);
if (total === 0) process.exit(2);
process.exit(fail ? 1 : 0);
