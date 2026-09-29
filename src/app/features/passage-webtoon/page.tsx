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
    "영어 지문을 AI가 한 편의 웹툰으로 시각화하는 SMOAT. AI 콘티가 컷마다 샷·앵글·구도를 설계하고, 5가지 그림 스타일과 5가지 대사 언어로 어려운 지문을 이야기로 바꿔 학생의 흥미와 이해를 끌어올립니다.",
  path: PATH,
  keywords: [
    "영어 지문 웹툰",
    "영어 학습 만화",
    "지문 시각화",
    "영어 웹툰 만들기",
    "AI 웹툰 생성",
    "AI 웹툰 콘티",
    "영어 수업 자료",
    "영어 지문 이해",
    "학원 수업 콘텐츠",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "지문 기반 웹툰",
  h1: "영어 지문 웹툰 — 읽던 지문이 한 편의 웹툰으로",
  subhead:
    "수능·내신 영어 지문을 AI가 컷마다 연출을 설계한 콘티로 짜서, 내용 그대로 한 편의 웹툰으로 시각화합니다. 추상적인 논설문도 장면과 인물이 있는 이야기로 바뀌어, 지문을 어려워하던 학생도 흐름을 한눈에 잡습니다. 수업 도입, 복습 자료, 학원 SNS 콘텐츠까지 — 영어학원 AI 올인원, 스모트(SMOAT)입니다.",
  heroHighlight: "어려운 지문이 한 편의 이야기가 됩니다",
  heroImage: {
    src: "/features/shots/passage-webtoon/hero.png",
    alt: "SMOAT 지문 웹툰 — 모의고사 영어 지문으로 생성된 웹툰 화면",
    caption: "지문 웹툰",
  },
  heroStats: [
    { value: "5", unit: "가지", label: "웹툰 그림 스타일" },
    { value: "5", unit: "가지", label: "대사 언어 모드" },
    { value: "1", unit: "클릭", label: "보유 지문에서 바로 생성" },
  ],
  heroBullets: [
    "AI 콘티 — 컷마다 샷·앵글·구도까지 설계",
    "한국 웹툰·3D 애니·수채 애니 등 5가지 그림 스타일",
    "한국어 + 핵심 영어 표현 등 5가지 대사 언어",
    "생성 후 말풍선·자막 텍스트 직접 편집",
  ],
  sectionsTitle: "지문 선택부터 완성 웹툰까지",
  sectionsBody: "보유한 지문을 고르고 스타일과 대사 언어만 정하면 웹툰이 완성됩니다.",
  sections: [
    {
      title: "보유 지문에서 바로 — AI 콘티가 컷마다 연출",
      image: {
        src: "/features/shots/passage-webtoon/s1.png",
        alt: "웹툰으로 만들 지문을 확인하는 화면",
        caption: "지문 선택",
      },
      body: "문제 생성에 쓰던 지문 그대로 웹툰을 만듭니다. AI가 먼저 지문의 논지와 전개를 따라 콘티를 짭니다 — 등장인물과 대사를 정하고, 컷마다 샷 크기·카메라 앵글·구도·표정·조명까지 설계한 뒤 그 콘티대로 한 장을 그립니다. 원문 내용에서 벗어나지 않으면서도 장면마다 연출이 살아 있는 학습용 웹툰이 나옵니다. 별도 대본 작성이나 그림 작업 없이 지문 선택만으로 시작합니다.",
      bullets: [
        "내 지문함의 보유 지문에서 바로 생성",
        "AI 콘티 — 인물·대사·컷 흐름 설계",
        "컷마다 샷·앵글·구도·조명 연출",
      ],
    },
    {
      title: "5가지 그림 스타일 — 학생 취향에 맞게",
      image: {
        src: "/features/shots/passage-webtoon/s2.png",
        alt: "웹툰 그림 스타일 5종 선택 화면",
        caption: "스타일 선택",
      },
      body: "한국 웹툰, 3D 애니, 수채 애니, 로맨스 만화, 실사풍 — 5가지 그림 스타일 중 지문 분위기와 학생 취향에 맞는 톤을 고릅니다. 대사 언어도 한국어 전용, 한국어 + 핵심 영어 표현, 한국어 + 영어 병기, 영어 전용, 대사 영어 + 해설 한국어의 5가지 중에서 수업 목표에 맞게 정합니다. 같은 지문도 스타일과 언어에 따라 전혀 다른 느낌의 콘텐츠가 됩니다.",
      bullets: [
        "한국 웹툰·3D 애니·수채 애니·로맨스 만화·실사풍",
        "한국어 + 핵심 영어 표현 등 5가지 대사 언어",
        "같은 지문으로 다른 스타일 재생성 가능",
      ],
    },
    {
      title: "세로형 한 페이지 완성본 — 수업 도입이 달라집니다",
      image: {
        src: "/features/shots/passage-webtoon/s3.png",
        alt: "완성된 지문 웹툰 패널 상세 화면",
        caption: "완성 웹툰",
      },
      body: "완성된 웹툰은 모바일 화면에 꼭 맞는 세로형 한 페이지에 여러 컷이 이어지는 구성입니다. 지문을 읽기 전에 웹툰으로 먼저 이야기를 접하면 배경지식과 흐름이 잡혀 독해 진입 장벽이 낮아지고, 복습 때는 장면을 떠올리며 지문 구조를 되짚을 수 있습니다.",
      bullets: [
        "모바일 화면에 맞춘 세로형 한 페이지",
        "수업 도입 — 읽기 전 배경·흐름 잡기",
        "복습 — 장면 회상으로 지문 구조 상기",
      ],
    },
    {
      title: "말풍선 편집부터 보관·활용까지",
      image: {
        src: "/features/shots/passage-webtoon/s4.png",
        alt: "생성된 웹툰 관리 카드 화면",
        caption: "웹툰 관리",
      },
      body: "생성 후에는 말풍선·자막 텍스트를 편집기에서 직접 고치고 글꼴과 글자 크기까지 다듬을 수 있습니다. 만든 웹툰은 웹툰 관리 보관함에 모여 폴더로 나눠 정리하고, 화풍·상태별로 골라 볼 수 있습니다. 완성본은 학원 수업 화면에 띄우거나 이미지로 내려받아 복습 자료, 학원 SNS·블로그 홍보 콘텐츠로 활용합니다.",
      bullets: [
        "말풍선·자막 텍스트·글꼴 직접 편집",
        "웹툰 관리 보관함에서 폴더로 정리",
        "이미지 다운로드로 수업·SNS 활용",
      ],
    },
  ],
  faq: [
    {
      question: "웹툰이 지문 내용과 다르게 만들어지지는 않나요?",
      answer:
        "AI가 먼저 지문의 논지와 전개를 따라 콘티를 짜고, 컷마다 원문의 어느 대목을 어떤 장면과 대사로 보여줄지 정한 뒤 그립니다. 그래서 원문 내용을 그대로 따라갑니다. 생성 후 말풍선·자막 텍스트를 직접 수정할 수 있어 표현을 학원 수업 톤에 맞게 다듬을 수 있습니다.",
    },
    {
      question: "그림 스타일과 대사 언어는 어떤 것들이 있나요?",
      answer:
        "그림 스타일은 한국 웹툰, 3D 애니, 수채 애니, 로맨스 만화, 실사풍의 5가지입니다. 대사 언어는 한국어 전용, 한국어 + 핵심 영어 표현, 한국어 + 영어 병기, 영어 전용, 대사 영어 + 해설 한국어의 5가지 중에서 고릅니다. 같은 지문으로 다른 스타일을 다시 생성할 수도 있습니다.",
    },
    {
      question: "만든 웹툰은 어디에 활용하나요?",
      answer:
        "수업 도입에서 지문 배경을 잡아주는 자료, 시험 후 복습 자료로 쓰고, 이미지로 내려받아 학원 SNS·블로그 홍보 콘텐츠로도 활용합니다. 만든 웹툰은 웹툰 관리 보관함에서 폴더로 정리해 두고 필요할 때 꺼내 씁니다. 학생 흥미 유발 효과가 커서 신규 상담용 시연 자료로도 쓰입니다.",
    },
    {
      question: "웹툰만 따로 쓸 수 있나요, 문제 생성과 연계되나요?",
      answer:
        "같은 지문으로 웹툰과 24유형 문제 생성을 함께 쓸 수 있습니다. 지문 하나를 등록하면 문제·시험지·분석 학습지·웹툰까지 한 곳에서 만들어지는 구조입니다.",
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
