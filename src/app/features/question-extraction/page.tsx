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

const PATH = "/features/question-extraction";

export const metadata = buildMetadata({
  title: "영어 문제 추출 — PDF·스캔 문제를 편집 가능한 문항으로",
  description:
    "시험지 PDF·사진·문서를 올리면 AI가 지문·문항·선지를 구조화해 추출하는 SMOAT. 원문 대조 검수를 거쳐 종이 문제집이 다시 쓸 수 있는 문제은행 자산이 됩니다.",
  path: PATH,
  keywords: [
    "영어 문제 추출",
    "기출 문제 디지털화",
    "PDF 문제 변환",
    "시험지 스캔 변환",
    "문제집 디지털화",
    "영어 기출 관리",
    "문제은행 구축",
    "학원 자료 관리",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "자료 추출",
  h1: "영어 문제 추출 — PDF·스캔 문제를 편집 가능한 문항으로",
  subhead:
    "학원에 쌓여 있는 시험지 PDF, 문제집 사진, 한글 문서를 올리면 AI가 지문·발문·선지·정답 구조를 인식해 편집 가능한 문항으로 추출합니다. 원문과 복원본을 나란히 대조하는 검수를 거치면, 종이로만 있던 기출·자체 문항이 다시 출제에 쓸 수 있는 문제은행 자산이 됩니다. 영어학원 AI 올인원, 스모트(SMOAT)입니다.",
  heroHighlight: "종이 시험지가 다시 쓸 수 있는 자산이 됩니다",
  heroImage: {
    src: "/features/shots/question-extraction/hero.png",
    alt: "SMOAT 자료 추출 — 원문과 복원본을 나란히 대조 검수하는 화면",
    caption: "원문 대조 검수",
  },
  heroStats: [
    { value: "3", unit: "종", label: "PDF·이미지·문서 업로드" },
    { value: "2", unit: "벌", label: "원문·복원 나란히 대조" },
    { value: "1", unit: "곳", label: "추출 즉시 문제은행 보관" },
  ],
  heroBullets: [
    "시험지 PDF·사진·문서를 그대로 업로드",
    "지문·발문·선지·정답 구조 자동 인식",
    "원문↔복원본 대조 화면으로 빠른 검수",
    "추출 문항은 시험지·변형 출제에 바로 활용",
  ],
  sectionsTitle: "업로드에서 문제은행까지",
  sectionsBody: "올리고, AI가 복원하고, 대조로 검수하면 끝입니다.",
  sections: [
    {
      title: "파일을 올리면 추출이 시작됩니다",
      image: {
        src: "/features/shots/question-extraction/s1.png",
        alt: "자료 추출 업로드·범위 설정 화면",
        caption: "추출 설정",
      },
      body: "시험지 PDF, 스마트폰으로 찍은 문제집 사진, 한글·워드 문서까지 형식 그대로 올립니다. 추출할 범위와 옵션을 정하면 AI가 문서 안의 지문과 문항을 찾아 작업을 시작합니다. 여러 문항이 섞인 시험지 전체도 한 번에 처리합니다.",
      bullets: [
        "PDF·이미지·문서 파일 그대로 업로드",
        "추출 범위·옵션 지정 후 일괄 처리",
        "시험지 전체 다문항도 한 번에",
      ],
    },
    {
      title: "지문·발문·선지·정답을 구조로 복원",
      image: {
        src: "/features/shots/question-extraction/s2.png",
        alt: "원문과 복원본의 차이를 마킹으로 표시한 검수 화면",
        caption: "복원 결과",
      },
      body: "단순 텍스트 인식(OCR)이 아니라 문항 구조를 복원합니다. 어떤 부분이 지문이고 어디부터 발문·선지·정답인지 AI가 구분해 편집 가능한 문항 형태로 만들기 때문에, 추출 직후부터 시험지 조판이나 변형 출제에 쓸 수 있습니다.",
      bullets: [
        "지문·발문·선지·정답 필드 단위 복원",
        "단순 OCR 텍스트가 아닌 문항 구조",
        "추출 직후 바로 편집·활용 가능한 형태",
      ],
    },
    {
      title: "원문 대조 검수 — 다른 부분만 빠르게 확인",
      image: {
        src: "/features/shots/question-extraction/s3.png",
        alt: "추출된 문항 결과 카드 화면",
        caption: "추출 결과",
      },
      body: "복원본과 원문을 나란히 놓고 차이 나는 부분을 표시해 주는 대조 화면에서 검수합니다. 전체를 다시 읽을 필요 없이 표시된 부분만 확인·수정하면 되기 때문에, 검수에 드는 시간이 크게 줄어듭니다.",
      bullets: [
        "원문↔복원본 나란히 대조 뷰",
        "차이 나는 부분 자동 표시",
        "표시 부분만 확인하는 빠른 검수",
      ],
    },
    {
      title: "검수 끝나면 문제은행으로 — 출제에 바로",
      image: {
        src: "/features/shots/question-extraction/s4.png",
        alt: "추출 문항을 활용하는 화면",
        caption: "문제은행 활용",
      },
      body: "검수를 마친 문항은 지문과 함께 문제은행에 저장됩니다. 저장된 문항은 Word·한글 시험지 조판에 바로 배치하거나, 같은 지문으로 25유형 변형 문항을 새로 출제하는 재료가 됩니다. 종이 문제집에 잠자던 자료가 반복 활용되는 자산으로 바뀝니다.",
      bullets: [
        "지문과 함께 문제은행에 저장",
        "시험지 조판에 바로 배치",
        "같은 지문으로 변형 문항 출제",
      ],
    },
  ],
  faq: [
    {
      question: "손으로 찍은 문제집 사진도 추출이 되나요?",
      answer:
        "네. 시험지 PDF뿐 아니라 스마트폰으로 촬영한 문제집 사진, 한글·워드 문서도 업로드할 수 있습니다. 촬영 상태가 좋을수록 복원 정확도가 올라가며, 원문 대조 검수 화면에서 차이 나는 부분을 바로 잡을 수 있습니다.",
    },
    {
      question: "일반 OCR(문자 인식)과 무엇이 다른가요?",
      answer:
        "일반 OCR은 글자만 텍스트로 바꿔 주지만, SMOAT는 지문·발문·선지·정답을 구분한 문항 구조로 복원합니다. 그래서 추출 직후부터 시험지 조판·변형 출제 등 문항 단위 기능에 바로 쓸 수 있습니다.",
    },
    {
      question: "추출 결과 검수는 얼마나 걸리나요?",
      answer:
        "원문과 복원본을 나란히 놓고 차이 나는 부분만 표시해 주는 대조 화면에서 검수하기 때문에, 문서 전체를 다시 읽을 필요가 없습니다. 표시된 부분만 확인·수정하면 되어 검수 부담이 크게 줄어듭니다.",
    },
    {
      question: "추출한 문항은 어떻게 활용하나요?",
      answer:
        "지문과 함께 문제은행에 저장되어 Word·한글 시험지 조판에 바로 배치하거나, 같은 지문으로 25유형 변형 문항을 출제하는 재료로 씁니다. 지문 분석 학습지·웹툰 생성에도 같은 지문을 활용할 수 있습니다.",
    },
  ],
  ctaTitle: "쌓여 있는 시험지, 오늘부터 자산으로",
  ctaBody:
    "종이로만 있던 기출·자체 문항을 편집 가능한 문제은행으로 바꿔 보세요. 업로드 한 번으로 시작됩니다.",
  related: relatedFeatures(PATH),
};

export default function QuestionExtractionPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-question-extraction"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "영어 문제 추출", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 영어 문제 추출",
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
