import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/config";
import { PUBLIC_ROUTES } from "@/lib/seo/public-routes";

/**
 * /sitemap.xml 동적 생성. 공개(색인 대상) 라우트만 포함.
 *
 * 50,000 URL 미만이라 단일 파일로 충분. 그 이상 늘어나면 generateSitemaps 로 분할.
 * (Next 16: generateSitemaps 의 id 인자는 Promise<string> 으로 변경됨.)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // 기본 lastmod 는 빌드 시점 1회 고정. 아티클은 실제 updatedAt 을 쓴다 —
  // 매 요청 new Date() 는 가짜 신선도 신호라 크롤러 신뢰를 깎는다.
  const buildDate = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified
      ? new Date(`${route.lastModified}T12:00:00+09:00`)
      : buildDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
