/**
 * SEO 단일 소스 오브 트루스.
 *
 * 사이트 전역에서 쓰는 정규 도메인·브랜드·기본 메타데이터·키워드·검증코드를
 * 한 곳에 모은다. layout / sitemap / robots / JSON-LD / OG 가 모두 여기서 읽는다.
 *
 * 도메인 폴백 체인은 기존 app/layout.tsx 로직을 그대로 승계한다:
 *   NEXT_PUBLIC_SITE_URL → NEXTAUTH_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL → 운영 도메인
 */

const PRODUCTION_URL = "https://www.smoat.co.kr";

function resolveSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    PRODUCTION_URL;
  // 후행 슬래시 제거(canonical/sitemap 일관성).
  return raw.replace(/\/+$/, "");
}

/** 정규(canonical) 사이트 URL. 후행 슬래시 없음. 예) https://www.smoat.co.kr */
export const SITE_URL = resolveSiteUrl();

/** sitemap/robots/canonical 에 쓰는 절대경로 헬퍼. path 는 "/" 로 시작. */
export function absoluteUrl(path = "/"): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${SITE_URL}${path === "/" ? "" : path}` || SITE_URL;
}

export const SITE = {
  url: SITE_URL,
  /** 브랜드명(검색 타이틀 접미사). */
  name: "SMOAT",
  /** 한글 표기(스모트). 엔터티 인식 보조. */
  nameKo: "스모트",
  /** 운영 법인(Organization legalName). */
  legalName: "NEANDER Co.,LTD",
  locale: "ko_KR",

  /** 홈/기본 타이틀. layout 의 title.default 로 사용. */
  defaultTitle:
    "SMOAT | AI 영어 문제 생성·내신 시험지 제작 학원 올인원",
  /** 하위 페이지 타이틀 템플릿. "기능명 | SMOAT" */
  titleTemplate: "%s | SMOAT",

  defaultDescription:
    "영어 지문 분석, 내신·수능 19유형 문제 생성, Word 시험지 자동 조판까지 끝내는 영어학원 AI 올인원 SMOAT입니다.",

  /**
   * 기본 키워드 시드. Google 은 무시하지만 네이버는 일부 참고하며,
   * 페이지별 generateMetadata 에서 더 정밀한 키워드로 덮어쓴다.
   */
  keywords: [
    "영어 문제 생성",
    "AI 영어 문제 생성",
    "영어 변형문제 생성",
    "영어 시험지 제작",
    "내신 영어 문제",
    "수능 영어 문제 생성",
    "영어 학습지 제작",
    "영어 지문 분석",
    "영어 해설지 제작",
    "영어학원 관리 프로그램",
    "영어학원 AI",
    "영어 문제은행",
    "EBS 변형문제",
    "Word 영어 시험지",
  ],

  /** 기본 OG 이미지(1200x630). app/opengraph-image.tsx 가 동적 생성. */
  ogImage: {
    path: "/og-image.png",
    width: 1200,
    height: 630,
    alt: "SMOAT — 영어학원 AI 올인원",
  },

  /**
   * 공식 SNS/채널 (Organization.sameAs).
   * 실재 확인된 URL만 env 로 주입한다 — 없으면 빈 배열(허위 URL 금지).
   */
  sameAs: [
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    process.env.NEXT_PUBLIC_SOCIAL_BLOG,
    process.env.NEXT_PUBLIC_SOCIAL_KAKAO,
  ].filter((u): u is string => Boolean(u && u.trim())),

  /** 사이트 소유확인 코드(콘솔에서 발급받아 env 주입). */
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      "T-1jTHrQshfuxlJGAgoSMM9TzDW-nxYMOO4t-xndKEs",
    naver:
      process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION ||
      "86b93d6784c8b88f6a0066b723234b295b3ab7c3",
  },
} as const;

/**
 * 색인에서 제외할(robots Disallow) 경로 prefix.
 *
 * Next.js 라우트 그룹의 괄호 폴더( (director) 등 )는 URL 에 나타나지 않으므로
 * 실제 URL 기준으로 작성한다. 워크벤치는 /director/workbench 라 /director 로 이미 커버됨.
 * (robots 차단은 색인 방지일 뿐 접근 보안이 아님 — 인증/인가는 코드 레벨에서 별도 보장.)
 */
export const NOINDEX_PATH_PREFIXES = [
  "/director", // 원장 운영(워크벤치·과금·문제생성 등 전부 하위)
  "/teacher",
  "/student",
  "/parent",
  "/tutor",
  "/admin", // 관리자(+ /admin/login)
  "/api", // API 라우트
  "/dev", // 개발용 페이지
  "/ir", // 비공개 IR 덱
  "/auth", // 로그인 후 리다이렉트/온보딩(완료·온보딩·콜백) — 얇은 전이 페이지, 색인 제외
] as const;
