import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/config";
import { PUBLIC_ROUTES } from "@/lib/seo/public-routes";
import { publishedSchools, schoolPath, sidoPath, sidoCounts } from "@/lib/seo/schools-content";

/**
 * /sitemap.xml 동적 생성. 공개(색인 대상) 라우트만 포함.
 *
 * 50,000 URL 미만이라 단일 파일로 충분. 그 이상 늘어나면 generateSitemaps 로 분할.
 * (Next 16: generateSitemaps 의 id 인자는 Promise<string> 으로 변경됨.)
 *
 * 학교 페이지(DB 기반)는 정적 배열이 아니라 여기서 조회해 덧붙인다.
 * PUBLIC_ROUTES 에 넣지 않는 이유: 그 파일은 동기 상수라 DB 를 읽을 수 없고,
 * 학교는 수백~수천으로 늘어나므로 발행 상태(status=PUBLISHED)만 선별해야 한다.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 기본 lastmod 는 빌드 시점 1회 고정. 아티클은 실제 updatedAt 을 쓴다 —
  // 매 요청 new Date() 는 가짜 신선도 신호라 크롤러 신뢰를 깎는다.
  const buildDate = new Date();

  const base: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified
      ? new Date(`${route.lastModified}T12:00:00+09:00`)
      : buildDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // 학교 페이지 — DB 조회 실패가 사이트맵 전체를 죽이지 않게 방어한다.
  let schoolEntries: MetadataRoute.Sitemap = [];
  try {
    const [schools, sidos] = await Promise.all([publishedSchools(), sidoCounts()]);

    const sidoEntries: MetadataRoute.Sitemap = sidos.map((s) => ({
      url: absoluteUrl(sidoPath(s.sido)),
      lastModified: buildDate,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const pages: MetadataRoute.Sitemap = schools.map((s) => ({
      url: absoluteUrl(schoolPath(s)),
      lastModified: s.updatedAt,
      changeFrequency: "monthly" as const,
      // 자료가 풍부한 학교를 우선 크롤하도록 우선순위를 갈라 준다.
      priority: s.richness === "풍부" ? 0.7 : 0.6,
    }));

    schoolEntries = [...sidoEntries, ...pages];
  } catch {
    // 조회 실패 시 학교 항목만 비운다(기존 라우트는 그대로 유지).
  }

  return [...base, ...schoolEntries];
}
