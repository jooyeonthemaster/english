import type { MetadataRoute } from "next";
import { absoluteUrl, NOINDEX_PATH_PREFIXES } from "@/lib/seo/config";

/**
 * /robots.txt 동적 생성.
 *
 * - 공개 영역은 전체 허용, 운영/인증/API 경로는 Disallow.
 * - 네이버 크롤러 Yeti 를 명시 허용(표준 robots 준수하지만 명시).
 * - AI 검색 크롤러를 명시 허용 — 실측상 네이버 AI 브리핑·구글 AI 개요·Perplexity 가
 *   이미 smoat.co.kr 을 출처로 인용 중이라, 이 유입 경로를 보호하는 것이 곧 GEO 다.
 *   `User-Agent: *` 로 암묵 허용되지만, 봇 운영사가 와일드카드를 보수적으로 해석하거나
 *   기본 차단으로 정책을 바꿀 때를 대비해 명시적으로 남긴다.
 * - Sitemap 절대경로를 명시(2023년 ping 폐지 후 가장 저비용 발견 경로).
 */

/**
 * 명시 허용할 AI 크롤러.
 *  - GPTBot / OAI-SearchBot        : OpenAI(ChatGPT 검색)
 *  - ClaudeBot / Claude-SearchBot  : Anthropic
 *  - PerplexityBot                 : Perplexity — 실측상 우리를 비교표에 인용 중
 *  - Google-Extended               : 구글 AI(Gemini/AI 개요) 학습·인용 제어 토큰
 *  - Applebot-Extended             : Apple 지능형 검색
 *  - CCBot                         : Common Crawl(다수 모델의 상류 코퍼스)
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
] as const;

/**
 * 추적 링크 리다이렉터(/go/<slug>) 차단.
 *
 * 응답에 X-Robots-Tag: noindex 가 이미 있어 색인은 막히지만, 그건 크롤러가 **GET 한 뒤**의
 * 이야기다. 외부 글·카페·블로그에 걸린 /go 주소를 크롤러가 계속 따라가면 클릭 원장
 * (analytics_link_clicks)에 isBot=true 행이 365일치 쌓여 「클릭수」를 읽기 어렵게 만든다.
 * robots 는 사람 클릭에는 아무 영향이 없다.
 *
 * 트레일링 슬래시 필수 — NOINDEX_PATH_PREFIXES 의 "/r/" 과 같은 이유다. "/go" 로 적으면
 * 앞으로 생길 /goods·/google-… 같은 공개 경로까지 통째로 막는다.
 */
const TRACKED_LINK_PREFIX = "/go/";

export default function robots(): MetadataRoute.Robots {
  const disallow = [...NOINDEX_PATH_PREFIXES, TRACKED_LINK_PREFIX];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // 네이버 Yeti — 토큰 'Yeti' 로 매칭(UA 전체 문자열은 변형이 많음).
      { userAgent: "Yeti", allow: "/", disallow },
      // AI 검색 크롤러 — 공개 콘텐츠만 허용하고 운영 경로는 동일하게 차단한다.
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
