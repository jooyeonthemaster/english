import { SITE, absoluteUrl } from "@/lib/seo/config";
import { GUIDES, guidePath } from "@/lib/seo/guides-content";
import { ARTICLES, articlePath } from "@/lib/seo/articles-content";

/**
 * /rss.xml — 콘텐츠 RSS 2.0 피드.
 *
 * 네이버 서치어드바이저는 사이트맵과 별도로 RSS 제출을 받는다(수집 촉진).
 * 아티클/가이드 전부를 최신순으로 실어 네이버·기타 크롤러의 신규 콘텐츠 발견을 돕는다.
 * 정적 콘텐츠 기반이라 빌드 시 1회 생성으로 충분(force-static).
 */

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRfc822(dateStr: string): string {
  // updatedAt(YYYY-MM-DD) → RFC-822. KST 정오로 고정해 TZ 편차를 피한다.
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  return d.toUTCString();
}

const FALLBACK_DATE = "2026-07-10";

export async function GET() {
  const items: { title: string; url: string; description: string; date: string }[] = [
    ...ARTICLES.map((a) => ({
      title: a.metaTitle,
      url: absoluteUrl(articlePath(a)),
      description: a.metaDescription,
      date: a.updatedAt || FALLBACK_DATE,
    })),
    ...GUIDES.map((g) => ({
      title: g.metaTitle,
      url: absoluteUrl(guidePath(g.slug)),
      description: g.metaDescription,
      date: FALLBACK_DATE,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc("스모트(SMOAT) — 영어 문제·시험지 제작 콘텐츠")}</title>
    <link>${SITE.url}</link>
    <description>${esc(
      "영어 문제 유형백과, 모의고사·수능·내신 대비, 교과서별 변형문제 제작 가이드 — 영어학원 AI 올인원 스모트(SMOAT)의 콘텐츠 피드입니다.",
    )}</description>
    <language>ko</language>
${items
  .map(
    (it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${it.url}</link>
      <guid isPermaLink="true">${it.url}</guid>
      <description>${esc(it.description)}</description>
      <pubDate>${toRfc822(it.date)}</pubDate>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
