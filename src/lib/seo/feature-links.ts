import type { RelatedLink } from "@/components/seo/feature-page-shell";

/**
 * 기능 페이지 단일 목록 — "함께 보면 좋은 기능" 섹션의 소스 오브 트루스.
 * 새 기능 페이지를 추가하면 여기에만 등록하면 모든 페이지의 related 에 자동 반영된다.
 */
export const FEATURE_LINKS: ReadonlyArray<RelatedLink> = [
  {
    href: "/features/ai-question-generation",
    label: "AI 영어 문제 생성",
    description: "지문 하나로 24유형 문항 자동 출제",
  },
  {
    href: "/features/exam-builder",
    label: "Word·한글 시험지 제작",
    description: "학생용·해설지 분리까지 자동 조판",
  },
  {
    href: "/features/passage-analysis",
    label: "영어 지문 분석",
    description: "직독직해·구문·어휘 학습지 자동 제작",
  },
  {
    href: "/features/exam-report",
    label: "시험 리포트",
    description: "채점 결과를 학생별 분석 리포트로",
  },
  {
    href: "/features/question-extraction",
    label: "영어 문제 추출",
    description: "PDF·스캔 문제를 편집 가능한 문항으로",
  },
  {
    href: "/features/passage-webtoon",
    label: "영어 지문 웹툰",
    description: "읽던 지문이 한 편의 웹툰으로",
  },
  {
    href: "/features/academy-erp",
    label: "영어학원 올인원 ERP",
    description: "학생·원비·출결까지 학원 운영 한 곳에",
  },
];

/** 현재 페이지를 제외한 나머지 기능 페이지 링크 목록. */
export function relatedFeatures(currentPath: string): RelatedLink[] {
  return FEATURE_LINKS.filter((link) => link.href !== currentPath);
}
