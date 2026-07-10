import { createArticleRoute } from "@/lib/seo/article-route-factory";

/** 시험 대비 아티클 — /exams/[slug]. 콘텐츠는 articles-content.json(category: exams). */
const route = createArticleRoute("exams");

export const dynamicParams = false;
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;
export default route.Page;
