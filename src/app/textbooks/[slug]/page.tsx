import { createArticleRoute } from "@/lib/seo/article-route-factory";

/** 교과서별 가이드 아티클 — /textbooks/[slug]. 콘텐츠는 articles-content.json(category: textbooks). */
const route = createArticleRoute("textbooks");

export const dynamicParams = false;
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;
export default route.Page;
