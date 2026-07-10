/**
 * 장문 아티클(콘텐츠 허브) 데이터 소스.
 *
 * guides-content(랜딩형 셸)와 별개로, 정보성 장문 콘텐츠(유형백과·시험대비·교과서·심화가이드)를
 * 담는 아티클 시스템이다. 실제 데이터는 articles-content.json 에 있고(멀티에이전트 생산+검수),
 * 여기서 타입을 입혀 허브 인덱스·[slug] 동적 라우트·sitemap·RSS 가 공유한다.
 * JSON 에 항목을 추가하면 라우트·사이트맵·RSS·허브 목록에 자동 편입된다.
 */
import articlesJson from "./articles-content.json";

export type ArticleCategory = "types" | "exams" | "textbooks" | "guides";

export type ArticleSample = {
  /** 영어 원문 지문(전량 창작 — 기출 인용 금지). */
  passage: string;
  /** 발문(한국어). */
  question: string;
  /** 5지선다 선택지(서술형이면 생략). */
  options?: string[];
  /** 정답(예: "③" 또는 모범답안). */
  answer: string;
  /** 해설(합니다체). */
  explanation: string;
};

export type ArticleSection = {
  /** H2 소제목. */
  heading: string;
  /** 본문 문단(각 원소가 <p> 하나). */
  paragraphs: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  callout?: { title: string; body: string };
  /** 원문 샘플 문제 블록(유형백과용). */
  sample?: ArticleSample;
};

export type ArticleEntry = {
  /** URL 슬러그. 최종 경로 = /<category>/<slug> */
  slug: string;
  category: ArticleCategory;
  /** 타깃 검색어(내부 참고). */
  targetKeyword: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** sitemap lastmod / RSS pubDate (YYYY-MM-DD). */
  updatedAt: string;
  eyebrow: string;
  h1: string;
  /** 도입 문단(첫 문단은 정의문 — 네이버 지식스니펫 최적화). */
  intro: string[];
  sections: ArticleSection[];
  faq: { question: string; answer: string }[];
  ctaTitle: string;
  ctaBody: string;
  related: { href: string; label: string; description?: string }[];
};

export const ARTICLES = articlesJson as unknown as ArticleEntry[];

/** 카테고리 허브 메타데이터(허브 인덱스·푸터·사이트맵 공유). */
export const CONTENT_HUBS: Record<
  ArticleCategory,
  { path: string; label: string; title: string; description: string }
> = {
  types: {
    path: "/types",
    label: "유형백과",
    title: "영어 문제 유형백과 — 수능·내신 전 유형 출제 원리",
    description:
      "빈칸추론부터 어법, 서술형까지 수능·내신 영어 문제 전 유형의 출제 원리, 풀이 전략, 문제 제작 포인트를 샘플 문항과 함께 정리한 유형백과입니다.",
  },
  exams: {
    // ⚠️ /exams 는 학생앱 (student-app)/exams 와 URL 충돌(전 라우트 500 유발) — /exam-prep 사용.
    path: "/exam-prep",
    label: "시험 대비",
    title: "영어 시험 대비 — 모의고사·수능·내신·EBS 자료 제작 가이드",
    description:
      "고1·고2·고3 모의고사, 수능, 내신 시험, EBS 연계교재까지 — 시험별 출제 구성과 학원 대비 자료 제작 방법을 정리했습니다.",
  },
  textbooks: {
    path: "/textbooks",
    label: "교과서별 가이드",
    title: "영어 교과서별 내신 변형문제 제작 가이드",
    description:
      "능률·YBM·천재·비상 등 고등 영어 교과서별로 내신 변형문제와 학습지를 만드는 방법을 정리했습니다.",
  },
  guides: {
    path: "/guides",
    label: "제작 가이드",
    title: "영어 문제·시험지 제작 가이드",
    description:
      "EBS 변형문제, 내신 서술형, 빈칸추론, Word 시험지 제작까지 — 영어 문제와 시험지를 AI로 만드는 실전 가이드 모음입니다.",
  },
};

export function articlesByCategory(category: ArticleCategory): ArticleEntry[] {
  return ARTICLES.filter((a) => a.category === category);
}

export function getArticle(
  category: ArticleCategory,
  slug: string,
): ArticleEntry | undefined {
  return ARTICLES.find((a) => a.category === category && a.slug === slug);
}

export function articlePath(a: Pick<ArticleEntry, "category" | "slug">): string {
  return `${CONTENT_HUBS[a.category].path}/${a.slug}`;
}
