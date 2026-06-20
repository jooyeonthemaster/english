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
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
