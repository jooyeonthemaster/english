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

const PATH = "/features/passage-analysis";

export const metadata = buildMetadata({
  title: "영어 지문 분석 — 직독직해·구문·어휘 학습지 자동 제작",
  description:
    "영어 지문 하나를 직독직해·구문·어휘까지 7개 섹션 A4 분석지로 자동 제작하는 SMOAT 지문 분석.",
  path: PATH,
  keywords: [
    "영어 지문 분석",
    "영어 지문 해설",
    "직독직해",
    "영어 학습지 제작",
    "영어 분석지",
    "영어 구문 분석",
    "영어 어휘 정리",
    "영어 지문 변형",
    "영어 내신 학습지",
    "영어 지문 해석",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "영어 지문 분석",
  h1: "영어 지문 분석 — 직독직해·구문·어휘까지 한 장에",
  subhead:
    "지문 텍스트를 넣으면 직독직해, 논리 구조 분석, 핵심 어휘 정리, 구문 분석까지 담은 7개 섹션 A4 심층 분석지가 자동으로 만들어집니다. 노베이스 학생도 이해하도록 용어를 바로 정의하고 존댓말로 통일한, 학원이 바로 배포할 수 있는 영어 내신 학습지입니다. 영어학원 AI 올인원, 스모트(SMOAT)입니다.",
  heroBullets: [
    "지문 하나를 7개 섹션 A4 분석 보고서로",
    "문장별 직독직해 + 의미 단위 끊어읽기",
    "핵심 어휘 25~35개 정리 + 구문 분석",
    "5가지 템플릿·색상 테마 + PDF 출력(인쇄)으로 배포",
  ],
  sections: [
    {
      title: "직독직해·논리 구조까지 — 7개 섹션 심층 분석지",
      body: "지문 하나를 7개 섹션으로 펼쳐 A4 분석 보고서를 만듭니다. 원문에 문장별 해석과 의미 단위 끊어읽기를 붙인 직독직해, 문장이 주제 제시·양보·역접·결론 중 어떤 기능을 하는지 짚는 논리 구조 분석, 핵심 요약과 영문 주제문까지 — 지문 한 편을 통째로 해부합니다.",
      bullets: [
        "원문 + 문장별 직독직해와 끊어읽기",
        "문장 기능으로 보는 영어 지문 논리 구조 분석",
        "핵심 요약 + 영문 주제문 제시",
      ],
    },
    {
      title: "구문 분석·문법 포인트·핵심 어휘 정리",
      body: "복잡한 문장을 분해해 해석하는 영어 구문 분석, 함정 오답 예문까지 곁들인 문법·구문 포인트, 빈칸·주제·제목·순서·삽입·함축·지칭·요약 등 유형별 출제 포인트와 전략을 한 장에 담습니다. 핵심 어휘 25~35개는 발음·뜻·난이도·동의어/반의어와 함께 정리되어 영어 어휘 정리가 자동으로 끝납니다.",
      bullets: [
        "복잡한 문장 분해 + 해석으로 영어 구문 분석",
        "함정 오답 예문이 있는 문법·구문 포인트",
        "발음·뜻·난이도·동의어/반의어 어휘 25~35개",
      ],
    },
    {
      title: "11가지 학습 활동 + 6가지 지문 변형",
      body: "같은 지문에서 키워드 빈칸, 전지문 빈칸, 직독직해 빈칸, 끊어읽기 영작, 해석 쓰기, 백지 영작, 어순 배열, 문장 순서 배열, 단어 시험 등 11가지 학습 활동을 자동 생성합니다. seed 기반이라 무제한으로 새 버전을 다시 뽑을 수 있고, 같은 지문을 관련 주제·상반 주제·더 쉽게·더 어렵게·짧게·길게 6가지로 변형해 단계별·수준별 대비까지 한 번에 만듭니다.",
      bullets: [
        "11가지 학습 활동을 seed 기반 무제한 재생성",
        "관련/상반 주제·난이도·길이 6가지 영어 지문 변형",
        "분석 결과는 문제 생성의 출제 나침반으로 연계",
      ],
    },
    {
      title: "강사가 감수하고 PDF로 출력해 배포",
      body: "AI가 만든 초안을 강사가 그대로 쓰지 않습니다. 섹션 순서를 바꾸고 텍스트·활동·이미지 블록을 끼워 넣어 페이지를 조판한 뒤 최종 배포합니다. 클래식·모던·매거진·노트북·시험지형 5가지 디자인 템플릿과 색상 테마로 학원 인쇄와 브랜드에 맞추고, 인쇄(PDF)로 내보내 학생 배포용 영어 분석지로 출력합니다.",
      bullets: [
        "AI 초안 + 강사 감수(블록 삽입·페이지 조판)",
        "클래식·모던·매거진·노트북·시험지형 5가지 템플릿",
        "PDF 출력(인쇄)으로 학생 배포",
      ],
    },
  ],
  faq: [
    {
      question: "영어 지문 분석은 어떤 항목까지 만들어 주나요?",
      answer:
        "지문 하나를 7개 섹션 A4 분석지로 만듭니다. 문장별 직독직해와 끊어읽기, 논리 구조 분석, 핵심 요약과 영문 주제문, 문법·구문 포인트, 유형별 출제 포인트, 핵심 어휘 25~35개 정리, 복잡한 문장을 분해하는 구문 분석까지 담깁니다.",
    },
    {
      question: "직독직해와 끊어읽기도 자동으로 표시되나요?",
      answer:
        "네. 원문에 문장별 해석을 붙이고 의미 단위로 끊어 읽도록 표시하며 주제어를 강조합니다. 노베이스 학생도 이해하도록 어려운 용어는 바로 정의하고 설명을 존댓말로 통일합니다.",
    },
    {
      question: "같은 지문으로 다양한 학습지를 만들 수 있나요?",
      answer:
        "키워드 빈칸, 직독직해 빈칸, 끊어읽기 영작, 백지 영작, 어순·문장 순서 배열, 단어 시험 등 11가지 학습 활동을 자동 생성하며 seed 기반이라 무제한으로 새 버전을 다시 뽑을 수 있습니다. 또한 같은 지문을 관련/상반 주제, 더 쉽게/어렵게, 짧게/길게 6가지로 변형할 수 있습니다.",
    },
    {
      question: "만든 분석지를 학원 학습지로 출력할 수 있나요?",
      answer:
        "강사가 AI 초안을 감수해 섹션 순서를 바꾸고 텍스트·활동·이미지 블록을 끼워 조판한 뒤, 5가지 디자인 템플릿과 색상 테마로 맞춰 인쇄(PDF)로 내보내 학생 배포용 영어 내신 학습지로 출력할 수 있습니다.",
    },
  ],
  ctaTitle: "영어 지문 해설지 제작, 지문 한 편으로 한 장 완성",
  ctaBody:
    "직독직해·구문 분석·어휘 정리·지문 변형까지 — 지문 한 편으로 학원 학습지가 완성됩니다. 지금 사용해 보세요.",
  related: [
    {
      href: "/features/ai-question-generation",
      label: "AI 영어 문제 생성",
      description: "분석한 지문으로 19유형 변형문제 자동 출제",
    },
    {
      href: "/features/exam-builder",
      label: "Word·한글 시험지 제작",
      description: "분석·문항을 편집 가능한 시험지로 조판",
    },
    {
      href: "/features/academy-erp",
      label: "영어학원 올인원",
      description: "콘텐츠 제작부터 학원 운영까지 하나로",
    },
  ],
};

export default function PassageAnalysisPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-passage-analysis"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "영어 지문 분석", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 영어 지문 분석",
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
