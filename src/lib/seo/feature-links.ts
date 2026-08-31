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

/**
 * 기능 허브 → 콘텐츠 축 허브(스포크) 역링크.
 *
 * 아티클 58→74건 증설 시 전역 정합 검수가 잡은 결함: 아티클은 기능 허브로 나가는데
 * 기능 허브는 아티클을 **한 건도 가리키지 않아** 링크가 단방향이었다. 토픽 권위는
 * 허브가 스포크를 인정할 때 서는 것이므로, 축 허브만 골라 역링크를 건다.
 * (개별 스포크 전량을 걸면 기능 페이지가 링크 목록이 되어 버린다 — 축 허브만.)
 */
export const TOPIC_SPOKES: Readonly<Record<string, ReadonlyArray<RelatedLink>>> = {
  "/features/ai-question-generation": [
    {
      href: "/guides/naesin-variant-questions",
      label: "영어 내신 변형문제 — 수능 변형과 무엇이 다른가",
      description: "닫힌 범위·학교별 편차와 자체 제작의 근거",
    },
    {
      href: "/guides/naesin-variant-ai",
      label: "영어 내신 변형문제 AI — 검수 5지점",
      description: "생성 문항을 그대로 내면 안 되는 이유",
    },
    {
      href: "/guides/naesin-variant-workflow",
      label: "영어 내신 변형문제 제작 — 4주 역산 워크플로",
      description: "범위 공지에서 시험지까지의 제작 일정",
    },
  ],
  "/features/passage-analysis": [
    {
      href: "/guides/passage-analysis-method",
      label: "영어 지문 분석 방법 — 단계별 절차",
      description: "직독직해부터 출제 포인트까지의 분석 순서",
    },
    {
      href: "/guides/naesin-passage-analysis",
      label: "영어 내신 지문 분석",
      description: "범위가 닫힌 내신에서의 전수 분석 전략",
    },
    {
      href: "/textbooks/textbook-passage-analysis-ai",
      label: "영어 교과서 분석 AI",
      description: "출판사별 교과서 본문 분석 가이드",
    },
  ],
};

/**
 * 기능 페이지의 related — 다른 기능 + 그 기능의 콘텐츠 축 허브.
 * 축 허브가 없는 기능 페이지는 기존과 동일하게 기능 링크만 반환한다.
 */
export function relatedForFeature(currentPath: string): RelatedLink[] {
  return [...relatedFeatures(currentPath), ...(TOPIC_SPOKES[currentPath] ?? [])];
}
