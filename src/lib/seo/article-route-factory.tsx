import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { ArticleShell } from "@/components/seo/article-shell";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import {
  articleSchema,
  breadcrumbSchema,
  faqSchema,
} from "@/lib/seo/structured-data";
import {
  articlesByCategory,
  getArticle,
  articlePath,
  CONTENT_HUBS,
  type ArticleCategory,
} from "@/lib/seo/articles-content";

/**
 * 아티클 [slug] 라우트 팩토리 — /types/[slug], /exams/[slug], /textbooks/[slug] 등
 * 카테고리별 라우트 파일이 이걸 호출해 generateStaticParams/generateMetadata/Page 를
 * 한 줄로 얻는다. JSON 에 아티클을 추가하면 자동으로 정적 생성된다.
 */
export function createArticleRoute(category: ArticleCategory) {
  const hub = CONTENT_HUBS[category];

  function generateStaticParams() {
    return articlesByCategory(category).map((a) => ({ slug: a.slug }));
  }

  async function generateMetadata({
    params,
  }: {
    params: Promise<{ slug: string }>;
  }): Promise<Metadata> {
    const { slug } = await params;
    const article = getArticle(category, slug);
    if (!article) return {};
    return buildMetadata({
      title: article.metaTitle,
      description: article.metaDescription,
      path: articlePath(article),
      keywords: article.keywords,
    });
  }

  async function Page({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = getArticle(category, slug);
    if (!article) notFound();

    const path = articlePath(article);

    return (
      <>
        <JsonLd
          id={`ld-article-${category}-${article.slug}`}
          data={[
            articleSchema({
              headline: article.h1,
              description: article.metaDescription,
              url: absoluteUrl(path),
              datePublished: article.updatedAt,
            }),
            breadcrumbSchema([
              { name: "스모트 SMOAT", url: "/" },
              { name: hub.label, url: hub.path },
              { name: article.eyebrow, url: path },
            ]),
            ...(article.faq.length > 0 ? [faqSchema(article.faq)] : []),
          ]}
        />
        <ArticleShell article={article} />
      </>
    );
  }

  return { generateStaticParams, generateMetadata, Page };
}
