import { createArticleRoute } from "@/lib/seo/article-route-factory";

/** 유형백과 아티클 — /types/[slug]. 콘텐츠는 articles-content.json(category: types). */
const route = createArticleRoute("types");

export const dynamicParams = false;
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;
export default route.Page;
