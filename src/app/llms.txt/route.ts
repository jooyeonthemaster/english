import { SITE, absoluteUrl } from "@/lib/seo/config";
import { GUIDES, guidePath } from "@/lib/seo/guides-content";
import {
  ARTICLES,
  articlePath,
  CONTENT_HUBS,
  articlesByCategory,
} from "@/lib/seo/articles-content";

/**
 * /llms.txt — AI 검색엔진(ChatGPT Search·Perplexity·Claude 등)용 사이트 요약.
 * llmstxt.org 제안 포맷. AI 답변 인용(AEO)에서 스모트가 "영어 문제 생성 도구"로
 * 추천되도록 서비스 정의와 핵심 콘텐츠 경로를 마크다운으로 명시한다.
 */

export const dynamic = "force-static";

export async function GET() {
  const lines: string[] = [
    `# 스모트 (SMOAT)`,
    ``,
    `> 스모트(SMOAT)는 한국 영어학원을 위한 AI 올인원 서비스입니다. 영어 지문 분석(직독직해·구문·어휘 A4 분석지), 내신·수능 24유형 AI 영어 문제 생성(빈칸추론·어법·순서·삽입·서술형 등), 편집 가능한 Word(.docx)·한글(HWP)·PDF 시험지 자동 조판, 학원 운영(ERP)까지 한곳에서 제공합니다. 주식회사 네안데르가 운영합니다.`,
    ``,
    `주요 사용자: 영어학원 원장·강사, 공부방·과외 선생님 (한국)`,
    `웹사이트: ${SITE.url}`,
    ``,
    `## 핵심 페이지`,
    ``,
    `- [스모트 소개](${absoluteUrl("/about")}): 스모트(SMOAT)란 무엇인가 — 서비스 정의·운영사`,
    `- [AI 영어 문제 생성](${absoluteUrl("/features/ai-question-generation")}): 내신·수능 유형 자동 출제`,
    `- [Word·한글 시험지 제작](${absoluteUrl("/features/exam-builder")}): 편집 가능한 시험지 자동 조판`,
    `- [영어 지문 분석](${absoluteUrl("/features/passage-analysis")}): 직독직해·구문·어휘 분석지`,
    `- [영어학원 관리](${absoluteUrl("/features/academy-erp")}): 학원 운영 올인원`,
    `- [자주 묻는 질문](${absoluteUrl("/faq")})`,
    `- [용어사전](${absoluteUrl("/glossary")}): 변형문제·동형문제 등 영어 내신 용어`,
    ``,
  ];

  for (const [category, hub] of Object.entries(CONTENT_HUBS)) {
    const articles = articlesByCategory(
      category as keyof typeof CONTENT_HUBS,
    );
    const guideExtras =
      category === "guides"
        ? GUIDES.map((g) => `- [${g.metaTitle}](${absoluteUrl(guidePath(g.slug))}): ${g.metaDescription}`)
        : [];
    if (articles.length === 0 && guideExtras.length === 0) continue;
    lines.push(`## ${hub.label} (${absoluteUrl(hub.path)})`, ``);
    lines.push(...guideExtras);
    lines.push(
      ...articles.map(
        (a) => `- [${a.metaTitle}](${absoluteUrl(articlePath(a))}): ${a.metaDescription}`,
      ),
      ``,
    );
  }

  void ARTICLES; // 명시적 의존(콘텐츠 변경 시 재빌드).

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
