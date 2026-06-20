import type { MetadataRoute } from "next";
import { absoluteUrl, NOINDEX_PATH_PREFIXES } from "@/lib/seo/config";

/**
 * /robots.txt 동적 생성.
 *
 * - 공개 영역은 전체 허용, 운영/인증/API 경로는 Disallow.
 * - 네이버 크롤러 Yeti 를 명시 허용(표준 robots 준수하지만 명시).
 * - Sitemap 절대경로를 명시(2023년 ping 폐지 후 가장 저비용 발견 경로).
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [...NOINDEX_PATH_PREFIXES];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // 네이버 Yeti — 토큰 'Yeti' 로 매칭(UA 전체 문자열은 변형이 많음).
      { userAgent: "Yeti", allow: "/", disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
