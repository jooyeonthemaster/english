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

const PATH = "/features/exam-report";

export const metadata = buildMetadata({
  title: "시험 리포트 — 채점 결과를 학생별 분석 리포트로",
  description:
    "시험지 채점 결과를 문항·유형별로 분석해 학생별 시험 리포트로 정리하고, 학부모 상담용으로 바로 인쇄하는 SMOAT 시험 리포트.",
  path: PATH,
  keywords: [
    "학원 시험 리포트",
    "학생 성적 리포트",
    "시험 결과 분석",
    "유형별 오답 분석",
    "학원 성적표 제작",
    "학부모 상담 자료",
    "영어 시험 분석",
    "학원 학생 리포트",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "시험 리포트",
  h1: "시험 리포트 — 채점 결과가 학생별 분석 리포트로",
  subhead:
    "출제로 끝나지 않습니다. SMOAT로 만든 시험지를 배포하고 채점 결과를 입력하면, 문항·유형별 분석을 담은 학생별 시험 리포트가 완성됩니다. 점수와 정답률 같은 수치는 채점 결과 그대로 계산하고, 학습 코멘트만 AI가 읽기 좋게 정리합니다.",
  heroHighlight: "채점 입력이 곧 상담 자료가 됩니다",
  heroImage: {
    src: "/features/shots/exam-report/hero.png",
    alt: "SMOAT 시험 분석 리포트 — 커버와 성적 개요",
    caption: "시험 분석 리포트",
  },
  heroStats: [
    { value: "6", unit: "가지", label: "리포트 디자인 테마" },
    { value: "10", unit: "개", label: "분석 섹션" },
    { value: "1", unit: "번", label: "채점 입력으로 완성" },
  ],
  heroBullets: [
    "문항·유형별 정답률과 취약 유형 분석",
    "학생 한 명 한 명의 리포트로 자동 정리",
    "6가지 디자인 테마 + 글꼴 선택으로 학원 톤에 맞게",
    "학부모 상담용으로 바로 인쇄(PDF 저장)",
  ],
  sectionsTitle: "채점에서 리포트까지 자동으로",
  sectionsBody: "수치는 그대로, 정리는 자동으로 — 학원 톤에 맞는 리포트가 나옵니다.",
  sections: [
    {
      title: "채점만 입력하면 분석은 자동으로",
      image: {
        src: "/features/shots/exam-report/s1.png",
        alt: "학생별 답안 채점 입력 화면",
        caption: "답안 채점",
      },
      body: "시험지를 배포한 뒤 채점 결과를 입력하면, SMOAT가 문항별 정오를 유형별 정답률로 집계하고 취약 유형을 짚어냅니다. 반 전체 흐름과 학생 개인의 결과를 함께 볼 수 있어, 다음 수업에서 무엇을 보강할지가 바로 보입니다.",
      bullets: [
        "문항별 정오 입력 → 유형별 정답률 자동 집계",
        "취약 유형과 반 평균 대비 위치 정리",
        "서술형 등 수동 채점 문항도 함께 반영",
      ],
    },
    {
      title: "수치는 그대로, 코멘트만 AI가 정리",
      image: {
        src: "/features/shots/exam-report/s2.png",
        alt: "문항별 분석과 코멘트 화면",
        caption: "문항 분석",
      },
      body: "점수·정답률·유형별 통계 같은 수치는 채점 결과에서 그대로 계산합니다. AI는 숫자를 만들지 않고, 채점 결과가 보여주는 패턴을 읽기 좋은 학습 코멘트로 다듬는 역할만 합니다. 그래서 학부모에게 전달해도 근거가 분명한 리포트가 됩니다.",
      bullets: [
        "점수·정답률은 채점 결과 기반으로 산출",
        "AI는 학습 코멘트 문장 정리만 담당",
        "강사가 리포트 내용을 검토·수정한 뒤 전달",
      ],
    },
    {
      title: "학원 톤에 맞는 6가지 디자인 테마",
      image: {
        src: "/features/shots/exam-report/s3.png",
        alt: "리포트 디자인 테마가 적용된 커버 화면",
        caption: "디자인 테마",
      },
      body: "컨설팅 블루, 모노크롬 프로, 그로스 코치, 클래식 저널, 잉크 매거진, 포레스트 멘토 — 6가지 디자인 테마와 글꼴 선택을 제공합니다. 학원 분위기에 맞는 양식을 골라 그대로 인쇄하면 상담 자료가 완성됩니다.",
      bullets: [
        "6가지 리포트 디자인 테마",
        "제목·본문 글꼴 선택",
        "인쇄·PDF 저장으로 바로 전달",
      ],
    },
    {
      title: "리포트에서 다음 출제로 이어집니다",
      image: {
        src: "/features/shots/exam-report/s4.png",
        alt: "유형별 성취 통계 화면",
        caption: "유형 통계",
      },
      body: "리포트가 짚어준 취약 유형은 그대로 다음 학습 계획이 됩니다. 같은 지문으로 해당 유형의 변형문제를 다시 뽑아 보강 시험지를 만들 수 있어, 출제 → 채점 → 분석 → 보강이 SMOAT 안에서 한 사이클로 돌아갑니다.",
      bullets: [
        "취약 유형 기반 보강 출제로 연결",
        "시험지 생성·문제 생성과 같은 보관함 사용",
        "다음 시험에서 개선 흐름 추적",
      ],
    },
  ],
  faq: [
    {
      question: "시험 리포트는 어떻게 만들어지나요?",
      answer:
        "SMOAT에서 만든 시험지를 배포하고 채점 결과를 입력하면, 문항·유형별 정답률과 취약 유형 분석을 담은 학생별 리포트가 자동으로 정리됩니다. 강사가 내용을 검토한 뒤 인쇄해 전달하면 됩니다.",
    },
    {
      question: "AI가 점수를 임의로 만들지는 않나요?",
      answer:
        "아니요. 점수·정답률·유형별 통계 같은 수치는 입력된 채점 결과에서 그대로 계산합니다. AI는 그 결과를 읽기 좋은 학습 코멘트 문장으로 정리하는 역할만 합니다.",
    },
    {
      question: "학부모 상담 자료로 쓸 수 있나요?",
      answer:
        "네. 6가지 디자인 테마와 글꼴 선택으로 학원 톤에 맞는 양식을 고른 뒤 그대로 인쇄(PDF 저장)해 전달할 수 있습니다. 유형별 정답률과 학습 코멘트가 담겨 상담 근거 자료로 적합합니다.",
    },
    {
      question: "취약 유형이 나오면 그다음은 어떻게 하나요?",
      answer:
        "리포트가 짚어준 취약 유형으로 같은 지문의 변형문제를 다시 생성해 보강 시험지를 만들 수 있습니다. 출제부터 채점·분석·보강까지 SMOAT 안에서 이어집니다.",
    },
  ],
  ctaTitle: "출제에서 끝내지 말고, 리포트까지 완성하세요",
  ctaBody:
    "시험지 제작부터 채점 결과 분석, 학생별 리포트 인쇄까지 — SMOAT 하나로 끝냅니다. 지금 사용해 보세요.",
  related: relatedFeatures(PATH),
};

export default function ExamReportPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-exam-report"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "시험 리포트", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 시험 리포트",
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
