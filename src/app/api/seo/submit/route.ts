import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo/config";
import { PUBLIC_ROUTES } from "@/lib/seo/public-routes";
import { pingIndexNow, indexNowConfig } from "@/lib/seo/indexnow";
import {
  submitSitemap,
  gscConfigured,
  GSC_SITE_URL,
} from "@/lib/seo/google-search-console";

/**
 * SEO 색인 통지 트리거.
 *  - 인증된 POST/GET: 사이트맵을 GSC 에 제출(구글) + 공개 URL 을 IndexNow 로 핑(네이버/Bing).
 *  - 비인증 GET: 구성 상태만 반환(시크릿 노출 없음).
 *
 * 인증: Authorization: Bearer <SEO_TASK_SECRET 또는 CRON_SECRET>.
 *   Vercel Cron 은 CRON_SECRET 을 자동으로 Authorization 헤더에 실어 GET 호출.
 *   수동 트리거 예) curl -X POST -H "Authorization: Bearer <secret>" https://www.smoat.co.kr/api/seo/submit
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.SEO_TASK_SECRET || process.env.CRON_SECRET;
  if (!secret) return false; // 시크릿 미설정 → 작업 비활성(안전 기본값)
  const token = (req.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  return token.length > 0 && token === secret;
}

async function runSubmit() {
  const sitemapUrl = absoluteUrl("/sitemap.xml");
  const urls = PUBLIC_ROUTES.map((r) => absoluteUrl(r.path));
  const [sitemap, indexnow] = await Promise.all([
    submitSitemap(sitemapUrl),
    pingIndexNow(urls),
  ]);
  return { ok: true, sitemapUrl, sitemap, indexnow };
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runSubmit());
}

export async function GET(req: Request) {
  if (authorized(req)) {
    return NextResponse.json(await runSubmit());
  }
  // 구성 상태만(비인증). 키 위치는 설계상 공개 정보.
  return NextResponse.json({
    ok: true,
    status: "config",
    sitemap: absoluteUrl("/sitemap.xml"),
    publicUrls: PUBLIC_ROUTES.length,
    gsc: { configured: gscConfigured(), siteUrl: GSC_SITE_URL },
    indexNow: indexNowConfig(),
  });
}
