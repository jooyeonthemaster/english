// ============================================================================
// 유입 채널 분류기 — 순수 함수. 세션 시작 시 1회 호출.
// 계약: docs/analytics/analytics-spec.md §4.2, §4.4
// 게이트: scripts/analytics-gate-classify.ts (음성테스트 포함)
// ============================================================================

import type { Channel } from "./channels";
import { PRODUCTION_HOSTS } from "./sanitize";

export interface ClassifyInput {
  /** 소문자 referrer host (없으면 null) */
  referrerHost: string | null;
  /** 정화된 랜딩 쿼리(sanitizeQuery 결과) */
  query: Record<string, string>;
  /** detectInApp 결과 */
  inApp: string | null;
}

export interface Attribution {
  channel: Channel;
  source: string;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  clickIdType: string | null;
}

type HostRule = { match: (h: string) => boolean; channel: Channel; source: string };

/** host 의 www./m./mobile. 접두 제거 */
export function bareHost(host: string): string {
  return host.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
}

function is(...domains: string[]) {
  return (h: string) => domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function exact(...hosts: string[]) {
  return (h: string) => hosts.includes(h);
}

const GOOGLE_NON_SEARCH = /^(mail|docs|drive|accounts|gemini|bard|sites|calendar|meet|chat|classroom|forms|photos|play|translate|news|maps|scholar|books|keep|analytics|ads|tagmanager|search\.google|support|policies|firebase|cloud|console\.cloud|colab|notebooklm|jamboard|myaccount|lens|trends)\./;

/**
 * 순서 = 우선순위. 구체적(서브도메인) 규칙을 포괄적(루트 도메인) 규칙보다 먼저.
 * host 는 bareHost() 적용 후 들어온다.
 */
const HOST_RULES: HostRule[] = [
  // AI — gemini.google.com 이 google 검색으로 새지 않도록 최우선
  { match: is("chatgpt.com", "chat.openai.com", "openai.com"), channel: "ai", source: "chatgpt" },
  { match: is("perplexity.ai"), channel: "ai", source: "perplexity" },
  { match: exact("gemini.google.com", "bard.google.com"), channel: "ai", source: "gemini" },
  { match: is("claude.ai"), channel: "ai", source: "claude" },
  { match: is("copilot.microsoft.com", "copilot.cloud.microsoft"), channel: "ai", source: "copilot" },
  { match: is("wrtn.ai"), channel: "ai", source: "wrtn" },
  { match: is("chat.deepseek.com"), channel: "ai", source: "deepseek" },
  { match: is("grok.com"), channel: "ai", source: "grok" },
  { match: is("you.com"), channel: "ai", source: "you" },
  { match: is("phind.com"), channel: "ai", source: "phind" },
  { match: is("meta.ai"), channel: "ai", source: "meta_ai" },
  { match: is("poe.com"), channel: "ai", source: "poe" },
  { match: is("liner.space"), channel: "ai", source: "liner" },
  { match: exact("cue.search.naver.com"), channel: "ai", source: "naver_cue" },

  // 이메일
  { match: is("mail.naver.com"), channel: "email", source: "naver_mail" },
  { match: exact("mail.google.com"), channel: "email", source: "gmail" },
  { match: is("mail.daum.net", "mail.kakao.com"), channel: "email", source: "daum_mail" },
  { match: is("outlook.live.com", "outlook.office.com", "outlook.office365.com"), channel: "email", source: "outlook" },

  // 커뮤니티 — 네이버 블로그/카페가 naver 검색으로 새지 않도록 naver.com 루트보다 먼저
  { match: is("blog.naver.com", "in.naver.com"), channel: "community", source: "naver_blog" },
  { match: is("cafe.naver.com"), channel: "community", source: "naver_cafe" },
  { match: is("post.naver.com"), channel: "community", source: "naver_post" },
  { match: is("cafe.daum.net"), channel: "community", source: "daum_cafe" },
  { match: is("tistory.com"), channel: "community", source: "tistory" },
  { match: is("brunch.co.kr"), channel: "community", source: "brunch" },
  { match: is("velog.io"), channel: "community", source: "velog" },
  { match: is("band.us"), channel: "community", source: "band" },
  { match: is("everytime.kr"), channel: "community", source: "everytime" },
  { match: is("dcinside.com"), channel: "community", source: "dcinside" },
  { match: is("clien.net"), channel: "community", source: "clien" },
  { match: is("ppomppu.co.kr"), channel: "community", source: "ppomppu" },
  { match: is("reddit.com"), channel: "community", source: "reddit" },
  { match: is("medium.com"), channel: "community", source: "medium" },

  // 동영상
  { match: is("youtube.com", "youtu.be", "youtube-nocookie.com"), channel: "video", source: "youtube" },
  { match: is("tv.naver.com", "chzzk.naver.com"), channel: "video", source: "naver_tv" },
  { match: is("vimeo.com"), channel: "video", source: "vimeo" },

  // 메신저
  { match: is("pf.kakao.com"), channel: "messenger", source: "kakao_channel" },
  { match: is("open.kakao.com"), channel: "messenger", source: "kakao_openchat" },
  { match: is("talk.kakao.com", "kakaotalk.com", "talk-apps.kakao.com"), channel: "messenger", source: "kakaotalk" },
  { match: is("line.me", "line.naver.jp"), channel: "messenger", source: "line" },
  { match: is("t.me", "telegram.org", "web.telegram.org"), channel: "messenger", source: "telegram" },
  { match: is("discord.com", "discord.gg", "discordapp.com"), channel: "messenger", source: "discord" },
  { match: is("slack.com"), channel: "messenger", source: "slack" },

  // SNS
  { match: is("instagram.com"), channel: "organic_social", source: "instagram" },
  { match: is("facebook.com", "fb.com", "fb.me"), channel: "organic_social", source: "facebook" },
  { match: is("threads.net", "threads.com"), channel: "organic_social", source: "threads" },
  { match: is("t.co", "x.com", "twitter.com"), channel: "organic_social", source: "x" },
  { match: is("tiktok.com"), channel: "organic_social", source: "tiktok" },
  { match: is("linkedin.com", "lnkd.in"), channel: "organic_social", source: "linkedin" },
  { match: (h) => /(^|\.)pinterest\.[a-z.]+$/.test(h) || h === "pin.it", channel: "organic_social", source: "pinterest" },
  { match: is("story.kakao.com"), channel: "organic_social", source: "kakaostory" },

  // 검색
  { match: (h) => /(^|\.)google\.[a-z.]+$/.test(h) && !GOOGLE_NON_SEARCH.test(h), channel: "organic_search", source: "google" },
  { match: is("naver.com"), channel: "organic_search", source: "naver" },
  { match: is("daum.net"), channel: "organic_search", source: "daum" },
  { match: is("bing.com"), channel: "organic_search", source: "bing" },
  { match: is("yahoo.com", "yahoo.co.jp"), channel: "organic_search", source: "yahoo" },
  { match: is("duckduckgo.com"), channel: "organic_search", source: "duckduckgo" },
  { match: is("ecosia.org"), channel: "organic_search", source: "ecosia" },
  { match: is("zum.com"), channel: "organic_search", source: "zum" },
  { match: is("baidu.com"), channel: "organic_search", source: "baidu" },
  { match: (h) => /(^|\.)yandex\.[a-z.]+$/.test(h), channel: "organic_search", source: "yandex" },
  { match: is("search.brave.com"), channel: "organic_search", source: "brave" },
  { match: is("startpage.com"), channel: "organic_search", source: "startpage" },
];

/** SNS 소스(유료 판정 시 paid_social 로 보내는 기준) */
const SOCIAL_SOURCES = new Set([
  "instagram", "ig", "facebook", "fb", "meta", "threads", "x", "twitter", "tiktok", "linkedin",
  "pinterest", "kakaostory", "kakao", "kakaotalk", "kakao_moment", "band", "youtube", "snapchat", "reddit",
]);
const VIDEO_SOURCES = new Set(["youtube", "yt", "naver_tv", "vimeo", "chzzk"]);

/** 새 세션·채널 근거로 쓰지 않는 referrer (자기 사이트·결제·로그인 복귀) — §4.4 */
const IGNORE_DOMAINS = [
  "smoat.co.kr",
  "vercel.app",
  "localhost",
  "127.0.0.1",
  "portone.io",
  "iamport.kr",
  "inicis.com",
  "kcp.co.kr",
  "tosspayments.com",
  "toss.im",
  "kakaopay.com",
  "pay.naver.com",
  "danalpay.com",
  "danal.co.kr",
  "nicepay.co.kr",
  "payco.com",
  "accounts.google.com",
  "kauth.kakao.com",
  "accounts.kakao.com",
  "nid.naver.com",
];

export function isIgnoredReferrerHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (PRODUCTION_HOSTS.has(h)) return true;
  return IGNORE_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

function classifyHost(host: string): { channel: Channel; source: string } | null {
  const h = bareHost(host);
  for (const r of HOST_RULES) {
    if (r.match(h)) return { channel: r.channel, source: r.source };
  }
  return null;
}

/** utm_source 가 host 형태("chatgpt.com")거나 별칭("ig")일 때 표준 소스로. */
function normalizeUtmSource(raw: string): { source: string; hostHit: { channel: Channel; source: string } | null } {
  const s = raw.trim().toLowerCase().slice(0, 40);
  const hostHit = /\./.test(s) ? classifyHost(s) : null;
  if (hostHit) return { source: hostHit.source, hostHit };
  const alias: Record<string, string> = {
    ig: "instagram",
    insta: "instagram",
    fb: "facebook",
    meta: "facebook",
    twitter: "x",
    yt: "youtube",
    kakao: "kakaotalk",
    kakaotalk: "kakaotalk",
    katalk: "kakaotalk",
    "naver-blog": "naver_blog",
    naverblog: "naver_blog",
    blog: "naver_blog",
    "naver-cafe": "naver_cafe",
    navercafe: "naver_cafe",
    cafe: "naver_cafe",
  };
  const source = alias[s] ?? s;
  const byName = HOST_RULES.find((r) => r.source === source);
  return { source, hostHit: byName ? { channel: byName.channel, source } : null };
}

const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_search|paid-search|sa|keyword|search_ad|searchad|retargeting|cpa|cpv|cpi|paid_social|paid-social|paidsocial|.*cp[a-z]?$)$/;
const DISPLAY_MEDIUM = /^(display|banner|cpm|interstitial|expandable|gdn|da|native)$/;
const SOCIAL_MEDIUM = /^(social|sns|social-network|social-media|sm|social network|social media|organic_social|organic-social)$/;
const EMAIL_MEDIUM = /^(email|e-mail|e_mail|e mail|newsletter|mail|edm)$/;
const MESSENGER_MEDIUM = /^(messenger|kakao|kakaotalk|chat|share|dm)$/;
const COMMUNITY_MEDIUM = /^(community|blog|cafe|forum|post)$/;
const AI_MEDIUM = /^(ai|llm|chatbot|ai_search)$/;
const REFERRAL_MEDIUM = /^(referral|link|partner|affiliate|qr|offline|print|poster|flyer|seminar|brochure|bio|profile)$/;
const VIDEO_MEDIUM = /^(video|organic_video)$/;

function clipValue(v: string | undefined, max: number): string | null {
  if (!v) return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export function classifyAttribution(input: ClassifyInput): Attribution {
  const q = input.query;
  const campaign = clipValue(q.utm_campaign, 100);
  const term = clipValue(q.utm_term ?? q.n_keyword ?? q.n_query, 100);
  const content = clipValue(q.utm_content, 100);
  const clickIdType =
    (["gclid", "gbraid", "wbraid", "NaPm", "n_media", "msclkid", "ttclid", "twclid", "li_fat_id", "dclid", "fbclid"] as const).find(
      (k) => !!q[k],
    ) ?? null;

  const refHost = input.referrerHost && !isIgnoredReferrerHost(input.referrerHost) ? input.referrerHost : null;
  const refHit = refHost ? classifyHost(refHost) : null;

  // 1) UTM
  const utmSourceRaw = q.utm_source;
  const utmMediumRaw = q.utm_medium;
  if (utmSourceRaw || utmMediumRaw) {
    const medium = (utmMediumRaw ?? "").trim().toLowerCase().slice(0, 40) || null;
    const norm = utmSourceRaw ? normalizeUtmSource(utmSourceRaw) : null;
    const source = norm?.source ?? refHit?.source ?? "(not set)";
    const isSocialSource = SOCIAL_SOURCES.has(source) || norm?.hostHit?.channel === "organic_social";
    let channel: Channel | null = null;
    if (medium) {
      if (DISPLAY_MEDIUM.test(medium)) channel = "display";
      else if (PAID_MEDIUM.test(medium)) channel = isSocialSource || /social/.test(medium) ? "paid_social" : "paid_search";
      else if (SOCIAL_MEDIUM.test(medium)) channel = VIDEO_SOURCES.has(source) ? "video" : "organic_social";
      else if (EMAIL_MEDIUM.test(medium)) channel = "email";
      else if (MESSENGER_MEDIUM.test(medium)) channel = "messenger";
      else if (COMMUNITY_MEDIUM.test(medium)) channel = "community";
      else if (AI_MEDIUM.test(medium)) channel = "ai";
      else if (VIDEO_MEDIUM.test(medium)) channel = "video";
      else if (REFERRAL_MEDIUM.test(medium)) channel = "referral";
    }
    if (!channel) channel = norm?.hostHit?.channel ?? refHit?.channel ?? "referral";
    return { channel, source, medium, campaign, term, content, clickIdType };
  }

  // 2) 클릭 ID
  if (q.gclid || q.gbraid || q.wbraid) {
    return { channel: "paid_search", source: "google", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.NaPm || q.n_media) {
    return { channel: "paid_search", source: "naver", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.msclkid) {
    return { channel: "paid_search", source: "bing", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.ttclid) {
    return { channel: "paid_social", source: "tiktok", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.twclid) {
    return { channel: "paid_social", source: "x", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.li_fat_id) {
    return { channel: "paid_social", source: "linkedin", medium: "cpc", campaign, term, content, clickIdType };
  }
  if (q.dclid) {
    return { channel: "display", source: "google", medium: "display", campaign, term, content, clickIdType };
  }
  if (q.fbclid) {
    // fbclid 는 오가닉 공유에도 붙는다 → 광고로 단정 금지(§4.2-2)
    const src =
      refHit && ["instagram", "facebook", "threads"].includes(refHit.source)
        ? refHit.source
        : input.inApp && ["instagram", "threads"].includes(input.inApp)
          ? input.inApp
          : "facebook";
    return { channel: "organic_social", source: src, medium: "social", campaign, term, content, clickIdType };
  }

  // 3) referrer host
  if (refHost) {
    if (refHit) {
      return { channel: refHit.channel, source: refHit.source, medium: null, campaign, term, content, clickIdType };
    }
    return { channel: "referral", source: bareHost(refHost).slice(0, 80), medium: null, campaign, term, content, clickIdType };
  }

  // 4) referrer 없음 + 인앱
  switch (input.inApp) {
    case "kakaotalk":
      return { channel: "messenger", source: "kakaotalk", medium: null, campaign, term, content, clickIdType };
    case "line":
      return { channel: "messenger", source: "line", medium: null, campaign, term, content, clickIdType };
    case "wechat":
      return { channel: "messenger", source: "wechat", medium: null, campaign, term, content, clickIdType };
    case "instagram":
    case "facebook":
    case "threads":
    case "tiktok":
    case "snapchat":
      return { channel: "organic_social", source: input.inApp, medium: null, campaign, term, content, clickIdType };
    case "band":
    case "everytime":
      return { channel: "community", source: input.inApp, medium: null, campaign, term, content, clickIdType };
    case "naver":
      return { channel: "direct", source: "naver_app", medium: null, campaign, term, content, clickIdType };
    case "daum":
      return { channel: "direct", source: "daum_app", medium: null, campaign, term, content, clickIdType };
  }

  // 5) 직접
  return { channel: "direct", source: "(direct)", medium: null, campaign, term, content, clickIdType };
}

/** 새 캠페인 서명 — 클라이언트가 "새 세션을 열 것인가" 판정에 쓰는 것과 같은 규칙. */
export function campaignSignature(query: Record<string, string>): string | null {
  const parts = [
    query.utm_source,
    query.utm_medium,
    query.utm_campaign,
    query.gclid ? "gclid" : null,
    query.NaPm || query.n_media ? "naver_ad" : null,
    query.fbclid ? "fbclid" : null,
    query.ttclid ? "ttclid" : null,
    query.msclkid ? "msclkid" : null,
    query.sl,
  ].filter(Boolean);
  return parts.length ? parts.join("|").slice(0, 200) : null;
}
