/**
 * 롱테일 SEO 가이드 페이지 콘텐츠 소스.
 *
 * 실제 콘텐츠 데이터는 guides-content.json 에 있고(멀티에이전트로 초안 생성),
 * 여기서 타입을 입혀 /guides 인덱스·/guides/[slug] 동적 라우트·sitemap 이 공유한다.
 * 새 가이드를 추가하려면 JSON 에 항목을 넣기만 하면 라우트·사이트맵에 자동 편입된다.
 */
import type { FeaturePageContent } from "@/components/seo/feature-page-shell";
import guidesJson from "./guides-content.json";

export type GuideEntry = {
  /** URL 슬러그. 최종 경로 = /guides/<slug> */
  slug: string;
  /** 타깃 롱테일 키워드(내부 참고용). */
  targetKeyword: string;
  /** <title> (브랜드 접미사는 titleTemplate 이 자동 부착). */
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** 기능 페이지와 동일한 셸 콘텐츠 구조. */
  content: FeaturePageContent;
};

export const GUIDES = guidesJson as unknown as GuideEntry[];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function getGuide(slug: string): GuideEntry | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}
