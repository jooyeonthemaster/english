import type { MetadataRoute } from "next";

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type PublicRoute = {
  /** "/" 로 시작하는 경로. */
  path: string;
  changeFrequency: ChangeFreq;
  /** 0.0 ~ 1.0 */
  priority: number;
};

/**
 * sitemap.xml 에 포함할 공개(색인 대상) 라우트.
 *
 * 인증/운영 경로(/director·/admin·/api 등)는 절대 넣지 않는다(robots Disallow 와 일치).
 * 신규 콘텐츠/기능 랜딩 페이지를 추가하면 여기에 한 줄 등록한다.
 */
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },

  // 기능 랜딩 허브 (키워드 선점)
  { path: "/features/ai-question-generation", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/exam-builder", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/passage-analysis", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/exam-report", changeFrequency: "weekly", priority: 0.8 },
  { path: "/features/academy-erp", changeFrequency: "weekly", priority: 0.8 },

  // 전환/상품
  { path: "/register", changeFrequency: "monthly", priority: 0.8 },
  { path: "/credits/products", changeFrequency: "weekly", priority: 0.6 },

  // 법적 고지
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.2 },
];
