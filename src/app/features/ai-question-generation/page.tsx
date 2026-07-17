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

const PATH = "/features/ai-question-generation";

export const metadata = buildMetadata({
  title: "AI 영어 문제 생성 — 내신·수능 25유형 자동 출제",
  description:
    "지문 하나로 빈칸·어법·순서·함축 의미·요약·서술형까지 내신·수능 25유형 영어 변형문제를 자동 생성하는 SMOAT.",
  path: PATH,
  keywords: [
    "AI 영어 문제 생성",
    "영어 변형문제 생성",
    "영어 문제 자동 출제",
    "내신 영어 문제 만들기",
    "수능 영어 문제 생성",
    "EBS 변형문제",
    "영어 모의고사 변형문제",
    "영어 빈칸추론 문제 만들기",
    "영어 어법 문제 만들기",
    "영어 문제은행",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "AI 영어 문제 생성",
  h1: "AI 영어 문제 생성 — 수능·내신·EBS·모의고사 25유형 자동 출제",
  subhead:
    "지문 하나만 넣으면 빈칸·어법·순서·삽입·요지·서술형까지, 내신·수능 25유형 변형문제가 1초 만에 만들어집니다. 강사가 마킹한 출제 포인트를 그대로 반영해 실제 시험에 직결되는 고퀄 문항을 생성합니다.",
  heroHighlight: "문항 제작 10시간을 10분으로 줄입니다",
  heroImage: {
    src: "/features/shots/ai-question-generation/hero.png",
    alt: "SMOAT AI 영어 문제 생성 결과 화면 — 지문과 생성된 문항 카드",
    caption: "문제 생성",
  },
  heroStats: [
    { value: "25", unit: "유형", label: "내신·수능 문항 유형" },
    { value: "1", unit: "분", label: "한 문항 생성 시간" },
    { value: "3", unit: "가지", label: "지문 입력 방법" },
  ],
  heroBullets: [
    "객관식·서술형·어휘 25유형 전 영역 자동 생성",
    "단순 무작위 변형이 아닌 '출제 포인트' 기반",
    "지문당 다문항 1초 생성, 문항별 난이도 지정",
    "정답·상세 해설지 동시 생성",
  ],
  sectionsTitle: "출제 포인트 기반, 입력부터 시험지까지",
  sectionsBody: "단순 변형 생성이 아니라 출제 포인트를 읽고 문항을 만듭니다.",
  sections: [
    {
      title: "단순 변형 생성기와 다릅니다 — 출제 포인트 기반",
      image: {
        src: "/features/shots/ai-question-generation/s1.png",
        alt: "문항 상세 화면 — 출제 포인트와 해설",
        caption: "문항 상세·출제 포인트",
      },
      body: "흔한 자동 생성기는 지문을 무작위로 비틀어 의미 없는 문항을 쏟아냅니다. SMOAT는 강사가 지문에서 강조·마킹한 출제 의도와, SMOAT가 딥다이브한 분석 결과를 함께 반영합니다. 그래서 실제 내신·수능에 직결되는 변별력 있는 문항이 나옵니다.",
      bullets: [
        "강사 필기·마킹을 출제 나침반으로 사용",
        "어휘·구문·핵심 문장까지 분석 후 출제",
        "함정 선지·오답 매력도까지 설계",
      ],
    },
    {
      title: "내신·수능 25유형 전 영역을 한 번에",
      image: {
        src: "/features/shots/ai-question-generation/s2.png",
        alt: "25개 문항 유형 선택 화면",
        caption: "유형 선택",
      },
      body: "빈칸 추론, 어법, 글의 순서, 문장 삽입, 요지·주제, 제목, 함축 의미, 어휘 적절성, 무관한 문장, 주제문·요약문 영작, 서술형까지 — 내신과 수능에서 출제되는 25개 유형을 전부 자동 생성합니다. 필요한 유형만 골라 원하는 문항 수만큼 뽑을 수 있습니다.",
      bullets: [
        "빈칸·어법·순서·삽입·요지·제목·함축 의미·어휘",
        "주제문·요약문 영작 등 내신 서술형 8종",
        "유형별 개수·난이도 개별 지정",
      ],
    },
    {
      title: "수능·내신·EBS·모의고사 모든 출제 범위",
      image: {
        src: "/features/shots/ai-question-generation/s3.png",
        alt: "출제 범위·옵션 선택 화면",
        caption: "출제 옵션",
      },
      body: "교과서 지문, EBS 연계 지문, 모의고사·외부 지문 어떤 원문이든 붙여넣으면 그 지문 기반의 변형문제와 동형문제를 생성합니다. 시험 범위 그대로 출제하니 적중률 높은 대비 자료가 됩니다.",
      bullets: [
        "교과서·EBS·모의고사·외부 지문 모두 지원",
        "같은 지문의 동형 세트 출제",
        "장문 세트(한 지문 다문항)도 생성",
      ],
    },
    {
      title: "생성 즉시 Word·한글 시험지·해설지로",
      image: {
        src: "/features/shots/ai-question-generation/s4.png",
        alt: "생성된 문항이 배치된 시험지 편집 화면",
        caption: "시험지 편집",
      },
      body: "생성한 문항은 웹에서 끝나지 않습니다. 학원 포맷에 맞춰 조판된 편집 가능한 Word(.docx)·한글(HWPX) 시험지와 정답·해설지로 바로 떨어집니다. 인쇄해서 그대로 시험에 쓰거나 학원 로고를 넣어 미세 조정할 수 있습니다.",
      bullets: [
        "편집 가능한 Word(.docx)·한글(HWPX, 베타) 자동 조판",
        "학생용 시험지 + 강사용 해설지 분리 생성",
        "정답지 자동 분리",
      ],
    },
  ],
  faq: [
    {
      question: "정말 1초 만에 영어 문제가 생성되나요?",
      answer:
        "지문을 넣고 유형을 고르면 25유형 문항이 즉시 생성됩니다. 분석부터 문항 생성, 정답·해설 작성까지 자동으로 이뤄지며, 만든 문항은 그대로 Word 시험지로 내려받을 수 있습니다.",
    },
    {
      question: "어떤 유형의 영어 문제를 만들 수 있나요?",
      answer:
        "빈칸 추론, 어법, 글의 순서, 문장 삽입, 요지·주제, 제목, 함축 의미, 어휘 적절성, 무관한 문장, 주제문·요약문 영작, 서술형 등 내신·수능 25개 유형을 지원합니다. 필요한 유형만 선택해 원하는 수만큼 출제할 수 있습니다.",
    },
    {
      question: "EBS·모의고사 지문으로도 변형문제를 만들 수 있나요?",
      answer:
        "네. 교과서, EBS 연계 지문, 모의고사·외부 지문 등 어떤 원문이든 붙여넣으면 해당 지문 기반의 변형문제와 동형 문항을 생성합니다.",
    },
    {
      question: "가입 후 바로 사용해 볼 수 있나요?",
      answer:
        "회원가입 후 문제 생성을 체험할 수 있습니다. 이후에는 기능별 크레딧으로 이용하며, 자세한 가격은 상품·요금 페이지에서 확인할 수 있습니다.",
    },
  ],
  ctaTitle: "영어 문제 만들기, 오늘 30분을 5분으로",
  ctaBody:
    "지문 분석부터 25유형 출제, Word·한글 시험지·해설지까지 — SMOAT 하나로 끝냅니다. 지금 사용해 보세요.",
  related: relatedFeatures(PATH),
};

export default function AiQuestionGenerationPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-aqg"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "AI 영어 문제 생성", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT AI 영어 문제 생성",
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
