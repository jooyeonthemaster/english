import { JsonLd } from "@/components/seo/json-ld";
import {
  FeaturePageShell,
  type FeaturePageContent,
} from "@/components/seo/feature-page-shell";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import {
  breadcrumbSchema,
  faqSchema,
  organizationSchema,
} from "@/lib/seo/structured-data";
import { BUSINESS_INFO } from "@/lib/legal/business-info";

const PATH = "/about";

/**
 * 브랜드 엔터티 페이지 — "스모트란?".
 *
 * '스모트'(한글) 브랜드 쿼리에서 검색엔진이 이 서비스를 하나의 엔터티로 인식하도록,
 * H1/본문에 "스모트(SMOAT)" 정의문과 운영사(주식회사 네안데르) NAP 를 명시한다.
 * Organization JSON-LD 를 함께 실어 지식패널/브랜드 신호를 보강한다.
 */
export const metadata = buildMetadata({
  title: "스모트(SMOAT)란? — 영어학원을 위한 AI 올인원",
  description:
    "스모트(SMOAT)는 영어 지문 분석, AI 영어 문제 생성, Word 시험지 제작을 한 번에 끝내는 영어학원 AI 올인원 서비스입니다. 주식회사 네안데르가 운영합니다.",
  path: PATH,
  keywords: [
    "스모트",
    "스모트 영어",
    "SMOAT",
    "스모트란",
    "영어학원 AI",
    "영어학원 AI 올인원",
    "AI 영어 문제 생성",
    "주식회사 네안데르",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "스모트 SMOAT 소개",
  h1: "스모트(SMOAT)란? — 영어학원을 위한 AI 올인원",
  subhead:
    "스모트(SMOAT)는 영어 지문 분석, 내신·수능 24유형 AI 영어 문제 생성, Word 시험지 자동 제작, 그리고 학원 운영까지 한곳에서 끝내는 영어학원 AI 올인원 서비스입니다. 영어 강사가 자료 제작에 쓰던 시간을 수업에 돌려드립니다.",
  heroBullets: [
    "AI 영어 문제 생성 · 지문 분석 · 시험지 제작 올인원",
    "내신·수능·EBS·모의고사 24유형 자동 출제",
    "편집 가능한 Word(.docx) 시험지·해설지 자동 조판",
    "주식회사 네안데르가 만들고 운영합니다",
  ],
  sections: [
    {
      title: "스모트(SMOAT)는 어떤 서비스인가요?",
      body: "스모트는 영어학원과 영어 강사를 위한 AI 올인원 플랫폼입니다. 지문 하나를 넣으면 직독직해·구문·어휘 분석부터 내신 24유형 변형문제 생성, 정답·해설지 작성, Word 시험지 자동 조판까지 한 번에 이어집니다. 흩어진 여러 도구 대신, 자료 제작의 처음부터 끝까지를 스모트 하나로 해결합니다.",
      bullets: [
        "영어 지문 분석 — 직독직해·논리구조·어휘·구문",
        "AI 영어 문제 생성 — 내신·수능 24유형",
        "Word·한글 시험지, 정답·해설지 자동 제작",
      ],
    },
    {
      title: "왜 스모트인가요? — 단순 변형기가 아닙니다",
      body: "흔한 자동 변형기는 지문을 무작위로 비틀어 의미 없는 문항을 쏟아냅니다. 스모트는 강사가 지문에 남긴 출제 포인트와, 스모트가 딥다이브한 분석 결과를 함께 반영해 실제 시험에 직결되는 변별력 있는 문항을 만듭니다. 그리고 그 결과물이 웹에서 끝나지 않고 학원이 바로 인쇄해 쓰는 편집 가능한 Word 시험지로 떨어집니다.",
      bullets: [
        "강사 출제 의도를 반영한 문항 설계",
        "함정 선지·오답 매력도까지 고려",
        "이미지·PDF 가 아닌 편집 가능한 Word 산출물",
      ],
    },
    {
      title: "누가 만드나요? — 주식회사 네안데르",
      body: `스모트(SMOAT)는 ${BUSINESS_INFO.companyName}가 만들고 운영하는 영어 교육 AI 서비스입니다. 서비스·결제·환불 관련 문의는 아래 연락처로 받고 있습니다.`,
      bullets: [
        `운영사 · ${BUSINESS_INFO.companyName}`,
        `사업장 · ${BUSINESS_INFO.address}`,
        `문의 · ${BUSINESS_INFO.phone} / ${BUSINESS_INFO.email}`,
      ],
    },
    {
      title: "누구를 위한 서비스인가요?",
      body: "영어 내신·수능 자료를 직접 만드는 학원 원장님과 강사, 그리고 반복되는 문제 제작·시험지 조판에 시간을 뺏기는 모든 영어 교육자를 위해 만들었습니다. 회원가입 후 실제 자료를 먼저 만들어 보고 도입 여부를 판단하실 수 있습니다.",
      bullets: [
        "영어학원 원장·강사, 공부방·과외 선생님",
        "가입 후 실제 자료로 먼저 체험",
        "콘텐츠 제작부터 학원 운영까지 확장",
      ],
    },
  ],
  faq: [
    {
      question: "스모트(SMOAT)가 무엇인가요?",
      answer:
        "스모트는 영어 지문 분석, AI 영어 문제 생성, Word 시험지 제작을 한 번에 끝내는 영어학원 AI 올인원 서비스입니다. 영어 강사가 내신·수능 자료를 만드는 전 과정을 자동화합니다.",
    },
    {
      question: "스모트는 어떻게 읽나요? SMOAT과 같은 건가요?",
      answer:
        "네. '스모트'는 영문 브랜드명 SMOAT의 한글 표기로, 같은 서비스입니다. 스모트, SMOAT 어느 이름으로 찾으셔도 동일한 영어학원 AI 올인원 서비스를 뜻합니다.",
    },
    {
      question: "스모트로 어떤 영어 문제를 만들 수 있나요?",
      answer:
        "빈칸 추론, 어법, 글의 순서, 문장 삽입, 요지·주제, 제목, 어휘 적절성, 무관한 문장, 요약문 영작, 서술형 등 내신·수능 19개 유형을 자동 생성합니다. 교과서·EBS·모의고사 등 어떤 지문이든 변형문제로 만들 수 있습니다.",
    },
    {
      question: "스모트는 누가 운영하나요?",
      answer: `스모트(SMOAT)는 ${BUSINESS_INFO.companyName}가 운영합니다. 사업장은 ${BUSINESS_INFO.address}이며, 문의는 ${BUSINESS_INFO.email} 또는 ${BUSINESS_INFO.phone}으로 받습니다.`,
    },
  ],
  ctaTitle: "스모트(SMOAT), 지금 먼저 써보세요",
  ctaBody:
    "영어 지문 분석부터 24유형 문제 생성, Word 시험지·해설지까지 — 스모트 하나로 끝냅니다. 회원가입 후 실제 자료를 바로 만들어 보세요.",
  related: [
    {
      href: "/features/ai-question-generation",
      label: "AI 영어 문제 생성",
      description: "지문 하나로 내신 24유형 변형문제를 자동 생성",
    },
    {
      href: "/features/exam-builder",
      label: "Word·한글 시험지 제작",
      description: "생성한 문항을 편집 가능한 Word 시험지·해설지로 자동 조판",
    },
    {
      href: "/types",
      label: "영어 문제 유형백과",
      description: "수능·내신 전 유형의 출제 원리와 샘플 문항",
    },
    {
      href: "/resources",
      label: "무료자료실",
      description: "시험지 양식·채점기준표·단어시험지 무료 다운로드",
    },
  ],
};

export default function AboutPage() {
  return (
    <>
      <JsonLd
        id="ld-about"
        data={[
          organizationSchema(),
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: "스모트란?", url: PATH },
          ]),
          faqSchema(CONTENT.faq ?? []),
        ]}
      />
      <FeaturePageShell content={CONTENT} />
    </>
  );
}
