import type { MetadataRoute } from "next";
import { GUIDES, guidePath } from "@/lib/seo/guides-content";
import { ARTICLES, articlePath } from "@/lib/seo/articles-content";

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type PublicRoute = {
  /** "/" 로 시작하는 경로. */
  path: string;
  changeFrequency: ChangeFreq;
  /** 0.0 ~ 1.0 */
  priority: number;
  /** 실제 콘텐츠 갱신일(YYYY-MM-DD). 없으면 sitemap 이 배포일 기준을 쓴다. */
  lastModified?: string;
};

/**
 * sitemap.xml 에 포함할 공개(색인 대상) 라우트.
 *
 * 인증/운영 경로(/director·/admin·/api 등)는 절대 넣지 않는다(robots Disallow 와 일치).
 * 신규 콘텐츠/기능 랜딩 페이지를 추가하면 여기에 한 줄 등록한다.
 */
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },

  // 브랜드 엔터티 (스모트란?)
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },

  // 기능 랜딩 허브 (키워드 선점)
  { path: "/features/ai-question-generation", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/exam-builder", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/passage-analysis", changeFrequency: "weekly", priority: 0.9 },
  { path: "/features/academy-erp", changeFrequency: "weekly", priority: 0.8 },

  // 콘텐츠 허브(유형백과·시험대비·교과서·가이드·FAQ·용어사전)
  { path: "/guides", changeFrequency: "weekly", priority: 0.8 },
  { path: "/types", changeFrequency: "weekly", priority: 0.8 },
  { path: "/exam-prep", changeFrequency: "weekly", priority: 0.8 },
  { path: "/textbooks", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/glossary", changeFrequency: "monthly", priority: 0.6 },
  { path: "/resources", changeFrequency: "monthly", priority: 0.7 },

  // 랜딩형 가이드(초기 8종). JSON 에 항목 추가 시 자동 편입.
  ...GUIDES.map((g) => ({
    path: guidePath(g.slug),
    changeFrequency: "monthly" as ChangeFreq,
    priority: 0.7,
  })),

  // 장문 아티클(유형백과·시험·교과서·심화가이드). JSON 에 항목 추가 시 자동 편입.
  ...ARTICLES.map((a) => ({
    path: articlePath(a),
    changeFrequency: "monthly" as ChangeFreq,
    priority: 0.7,
    lastModified: a.updatedAt,
  })),

  // 전환/상품
  { path: "/register", changeFrequency: "monthly", priority: 0.8 },
  { path: "/credits/products", changeFrequency: "weekly", priority: 0.6 },

  // 법적 고지
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.2 },
];
