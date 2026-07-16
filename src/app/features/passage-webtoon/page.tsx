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
  softwareApplicationSchema,
} from "@/lib/seo/structured-data";
import { relatedFeatures } from "@/lib/seo/feature-links";

const PATH = "/features/passage-webtoon";

export const metadata = buildMetadata({
  title: "영어 지문 웹툰 — 읽던 지문이 한 편의 웹툰으로",
  description:
    "영어 지문을 AI가 한 편의 웹툰으로 시각화하는 SMOAT. 6가지 그림 스타일로 어려운 지문을 이야기로 바꿔 학생의 흥미와 이해를 끌어올립니다.",
  path: PATH,
  keywords: [
    "영어 지문 웹툰",
    "영어 학습 만화",
    "지문 시각화",
    "영어 웹툰 만들기",
    "AI 웹툰 생성",
    "영어 수업 자료",
    "영어 지문 이해",
    "학원 수업 콘텐츠",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "지문 기반 웹툰",
  h1: "영어 지문 웹툰 — 읽던 지문이 한 편의 웹툰으로",
  subhead:
    "수능·내신 영어 지문을 AI가 내용 그대로 한 편의 웹툰으로 시각화합니다. 추상적인 논설문도 장면과 인물이 있는 이야기로 바뀌어, 지문을 어려워하던 학생도 흐름을 한눈에 잡습니다. 수업 도입, 복습 자료, 학원 SNS 콘텐츠까지 — 영어학원 AI 올인원, 스모트(SMOAT)입니다.",
  heroHighlight: "어려운 지문이 한 편의 이야기가 됩니다",
  heroImage: {
    src: "/features/shots/passage-webtoon/hero.png",
    alt: "SMOAT 지문 웹툰 — 모의고사 영어 지문으로 생성된 웹툰 화면",
    caption: "지문 웹툰",
  },
  heroStats: [
    { value: "6", unit: "가지", label: "웹툰 그림 스타일" },
    { value: "1", unit: "편", label: "지문 하나로 완성" },
    { value: "1", unit: "클릭", label: "보유 지문에서 바로 생성" },
  ],
  heroBullets: [
    "지문 내용을 그대로 따라가는 스토리 구성",
    "웹툰·3D 애니·수채화 등 6가지 그림 스타일",
    "생성 후 말풍선·자막 텍스트 직접 편집",
    "수업 자료·복습·학원 홍보 콘텐츠로 활용",
  ],
  sectionsTitle: "지문 선택부터 완성 웹툰까지",
  sectionsBody: "보유한 지문을 고르고 스타일만 정하면 웹툰이 완성됩니다.",
  sections: [
    {
      title: "보유 지문에서 바로 — 내용에 충실한 스토리",
      image: {
        src: "/features/shots/passage-webtoon/s1.png",
        alt: "웹툰으로 만들 지문을 확인하는 화면",
        caption: "지문 선택",
      },
      body: "문제 생성에 쓰던 지문 그대로 웹툰을 만듭니다. AI가 지문의 논지와 전개를 장면 단위로 나눠 스토리보드를 구성하기 때문에, 원문 내용에서 벗어나지 않는 학습용 웹툰이 나옵니다. 별도 대본 작성이나 그림 작업 없이 지문 선택만으로 시작합니다.",
      bullets: [
        "문제은행의 보유 지문에서 바로 생성",
        "지문 논지·전개를 따라가는 장면 구성",
        "대본·그림 작업 없이 클릭으로 시작",
      ],
    },
    {
      title: "6가지 그림 스타일 — 학생 취향에 맞게",
      image: {
        src: "/features/shots/passage-webtoon/s2.png",
        alt: "웹툰 그림 스타일 6종 선택 화면",
        caption: "스타일 선택",
      },
      body: "한국 웹툰, 3D 애니메이션, 수채화, 프렌치 신문 일러스트, 실사, 인물 중심 판타지 — 6가지 그림 스타일 중 지문 분위기와 학생 취향에 맞는 톤을 고릅니다. 같은 지문도 스타일에 따라 전혀 다른 느낌의 콘텐츠가 됩니다.",
      bullets: [
        "웹툰·3D 애니·수채화·신문 일러스트·실사·판타지",
        "지문 분위기에 맞는 톤 선택",
        "같은 지문으로 다른 스타일 재생성 가능",
      ],
    },
    {
      title: "세로 스크롤 완성본 — 수업 도입이 달라집니다",
      image: {
        src: "/features/shots/passage-webtoon/s3.png",
        alt: "완성된 지문 웹툰 패널 상세 화면",
        caption: "완성 웹툰",
      },
      body: "완성된 웹툰은 모바일에 익숙한 세로 스크롤 구성입니다. 지문을 읽기 전에 웹툰으로 먼저 이야기를 접하면 배경지식과 흐름이 잡혀 독해 진입 장벽이 낮아지고, 복습 때는 장면을 떠올리며 지문 구조를 되짚을 수 있습니다.",
      bullets: [
        "모바일 친화적인 세로 스크롤 뷰",
        "수업 도입 — 읽기 전 배경·흐름 잡기",
        "복습 — 장면 회상으로 지문 구조 상기",
      ],
    },
    {
      title: "말풍선 편집부터 배포까지",
      image: {
        src: "/features/shots/passage-webtoon/s4.png",
        alt: "생성된 웹툰 관리 카드 화면",
        caption: "웹툰 관리",
      },
      body: "생성 후에는 말풍선·자막 텍스트를 에디터에서 직접 다듬을 수 있습니다. 완성본은 학원 수업 화면에 띄우거나 이미지로 내려받아 복습 자료, 학원 SNS·블로그 홍보 콘텐츠로 활용합니다. 만든 웹툰은 지문과 함께 문제은행에 보관됩니다.",
      bullets: [
        "말풍선·자막 텍스트 직접 편집",
        "이미지 다운로드로 수업·SNS 활용",
        "지문과 함께 문제은행에 보관",
      ],
    },
  ],
  faq: [
    {
      question: "웹툰이 지문 내용과 다르게 만들어지지는 않나요?",
      answer:
        "AI가 지문의 논지와 전개를 장면 단위로 분해해 스토리보드를 만들기 때문에 원문 내용을 그대로 따라갑니다. 생성 후 말풍선·자막 텍스트를 직접 수정할 수 있어 표현을 학원 수업 톤에 맞게 다듬을 수 있습니다.",
    },
    {
      question: "그림 스타일은 어떤 것들이 있나요?",
      answer:
        "한국 웹툰, 3D 애니메이션, 수채화, 프렌치 신문 일러스트, 실사, 인물 중심 판타지까지 6가지 스타일을 지원합니다. 같은 지문으로 다른 스타일을 다시 생성할 수도 있습니다.",
    },
    {
      question: "만든 웹툰은 어디에 활용하나요?",
      answer:
        "수업 도입에서 지문 배경을 잡아주는 자료, 시험 후 복습 자료로 쓰고, 이미지로 내려받아 학원 SNS·블로그 홍보 콘텐츠로도 활용합니다. 학생 흥미 유발 효과가 커서 신규 상담용 시연 자료로도 쓰입니다.",
    },
    {
      question: "웹툰만 따로 쓸 수 있나요, 문제 생성과 연계되나요?",
      answer:
        "같은 지문으로 웹툰과 25유형 문제 생성을 함께 쓸 수 있습니다. 지문 하나를 등록하면 문제·시험지·분석 학습지·웹툰까지 한 곳에서 만들어지는 구조입니다.",
    },
  ],
  ctaTitle: "지문 하나로 웹툰까지, 수업이 달라집니다",
  ctaBody:
    "읽기 싫어하던 지문이 학생이 먼저 찾는 이야기가 됩니다. 보유 지문으로 지금 첫 웹툰을 만들어 보세요.",
  related: relatedFeatures(PATH),
};

export default function PassageWebtoonPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-passage-webtoon"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "영어 지문 웹툰", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 영어 지문 웹툰",
            description: metadata.description as string,
            url: absoluteUrl(PATH),
          }),
          faqSchema(CONTENT.faq ?? []),
        ]}
      />
      <FeaturePageShell content={CONTENT} />
    </>
  );
}
