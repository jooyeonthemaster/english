import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { FeaturePageShell } from "@/components/seo/feature-page-shell";
import { ArticleShell } from "@/components/seo/article-shell";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import {
  articleSchema,
  breadcrumbSchema,
  faqSchema,
  softwareApplicationSchema,
} from "@/lib/seo/structured-data";
import { GUIDES, getGuide, guidePath } from "@/lib/seo/guides-content";
import {
  articlesByCategory,
  getArticle,
  articlePath,
} from "@/lib/seo/articles-content";

/**
 * /guides/[slug] — 두 콘텐츠 소스를 서빙한다:
 *  1) guides-content.json (랜딩형 FeaturePageShell — 초기 8종)
 *  2) articles-content.json 의 category:"guides" (장문 아티클형 ArticleShell)
 * 슬러그는 두 소스에 걸쳐 유일해야 한다(검증 스크립트에서 보장).
 */

// 알려진 슬러그만 정적 프리빌드. 그 외 경로는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...GUIDES.map((g) => ({ slug: g.slug })),
    ...articlesByCategory("guides").map((a) => ({ slug: a.slug })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (guide) {
    return buildMetadata({
      title: guide.metaTitle,
      description: guide.metaDescription,
      path: guidePath(guide.slug),
      keywords: guide.keywords,
    });
  }
  const article = getArticle("guides", slug);
  if (article) {
    return buildMetadata({
      title: article.metaTitle,
      description: article.metaDescription,
      path: articlePath(article),
      keywords: article.keywords,
    });
  }
  return {};
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const guide = getGuide(slug);
  if (guide) {
    const path = guidePath(guide.slug);
    return (
      <>
        <JsonLd
          id={`ld-guide-${guide.slug}`}
          data={[
            breadcrumbSchema([
              { name: "스모트 SMOAT", url: "/" },
              { name: "가이드", url: "/guides" },
              { name: guide.content.eyebrow, url: path },
            ]),
            softwareApplicationSchema({
              name: `스모트(SMOAT) — ${guide.content.eyebrow}`,
              description: guide.metaDescription,
              url: absoluteUrl(path),
            }),
            faqSchema(guide.content.faq ?? []),
          ]}
        />
        <FeaturePageShell content={guide.content} />
      </>
    );
  }

  const article = getArticle("guides", slug);
  if (!article) notFound();

  const path = articlePath(article);
  return (
    <>
      <JsonLd
        id={`ld-article-guides-${article.slug}`}
        data={[
          articleSchema({
            headline: article.h1,
            description: article.metaDescription,
            url: absoluteUrl(path),
            datePublished: article.updatedAt,
          }),
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: "가이드", url: "/guides" },
            { name: article.eyebrow, url: path },
          ]),
          ...(article.faq.length > 0 ? [faqSchema(article.faq)] : []),
        ]}
      />
      <ArticleShell article={article} />
    </>
  );
}
