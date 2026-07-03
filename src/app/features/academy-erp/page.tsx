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

const PATH = "/features/academy-erp";

export const metadata = buildMetadata({
  title: "영어학원 관리 프로그램 — 학생·원비·출결 학원 ERP",
  description:
    "학생·원비·출결·급여·재무까지 한 화면에서 운영하는 영어학원 관리 프로그램, SMOAT 올인원 학원 ERP.",
  path: PATH,
  keywords: [
    "영어학원 관리 프로그램",
    "학원 ERP",
    "학원 관리 프로그램",
    "학원 운영 프로그램",
    "학원 원비 관리",
    "학원 출결 관리",
    "학원 학생 관리",
    "영어학원 올인원",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "영어학원 관리 프로그램",
  h1: "영어학원 관리 프로그램 — 학생·원비·출결을 한 화면에서, 올인원 학원 ERP",
  subhead:
    "AI 문제 생성과 지문 분석으로 수업 자료를 만들고, 그 자료를 만든 곳에서 학생 등록·반 편성·원비 청구·출결·급여·재무까지 운영합니다. 콘텐츠 제작과 학원 운영이 분리되지 않는, 영어학원을 위한 올인원 학원 관리 프로그램입니다.",
  heroBullets: [
    "학생 등록·반 편성·기기·원비를 한 화면에서",
    "학생별 청구서 발행과 납부 상태 추적",
    "출석·결석·지각·조퇴·보강까지 출결 관리",
    "원장·강사·학생·학부모 역할별 맞춤 앱",
  ],
  sections: [
    {
      title: "콘텐츠 제작부터 학원 운영까지 한 플랫폼",
      body: "문제집을 만드는 도구와 학원을 운영하는 도구가 따로 놀면 자료도, 데이터도 흩어집니다. SMOAT는 AI 문제 생성·지문 분석·시험지 제작으로 수업 자료를 만든 그 플랫폼에서 학원 운영까지 이어집니다. 만든 문제·지문·시험지·학습활동은 클라우드에서 관리되고, 학생·원비·출결 운영도 같은 공간에서 돌아갑니다.",
      bullets: [
        "AI 문제 생성·지문 분석·시험지 제작이 한 곳에",
        "만든 자료(문제·지문·시험지·학습활동) 클라우드 관리",
        "콘텐츠와 학원 운영이 분리되지 않는 단일 플랫폼",
      ],
    },
    {
      title: "학생 관리 허브 — 등록·반 편성·기기·원비를 한 화면에서",
      body: "학생 정보, 반 배정, 사용 기기, 원비 상태를 페이지마다 옮겨 다니며 확인할 필요가 없습니다. 학생 운영 허브 한 화면에서 학생을 등록하고 반을 편성하며, 기기를 관리하고 원비 현황까지 함께 봅니다. 영어학원 학생 관리에 필요한 정보가 흩어지지 않습니다.",
      bullets: [
        "학생 등록과 반 편성을 한 화면에서",
        "학생 사용 기기 관리",
        "학생별 원비 현황을 같은 화면에서 확인",
      ],
    },
    {
      title: "원비 청구와 출결 관리 — 미납 없이, 빠짐없이",
      body: "학생별로 청구서를 발행하고 미납·완납·연체·부분납·환불·취소까지 납부 상태를 추적합니다. 결제수단은 카드·계좌이체·현금은 물론 카카오페이·네이버페이·토스까지 기록할 수 있습니다. 출결은 출석·결석·지각·조퇴·보강 상태로 관리해, 학원 원비 관리와 출결 관리를 한 시스템에서 처리합니다.",
      bullets: [
        "학생별 청구서 발행·납부 상태 추적(미납·완납·연체·부분납·환불·취소)",
        "카드·계좌이체·현금·카카오페이·네이버페이·토스 결제수단 기록",
        "출석·결석·지각·조퇴·보강 출결 관리",
      ],
    },
    {
      title: "급여·재무 대시보드와 역할별 앱으로 운영 통합",
      body: "강사 급여는 기본급·보너스·차감액을 월별로 기록하고 일괄 처리합니다. 재무 대시보드에서는 수익·지출 추이와 수금률, 임대료·인건비·교재비·마케팅·공과금 등 지출 카테고리를 한눈에 봅니다. 원장은 운영 전반을, 강사는 출결·학생 관리를, 학생은 학습·성적·과제·오답 복습을, 학부모는 자녀 성적·청구 내역·메시지를 — 역할마다 맞춤 화면으로 사용합니다.",
      bullets: [
        "강사 급여(기본급·보너스·차감액) 월별 기록·일괄 처리",
        "수익·지출 추이, 수금률, 지출 카테고리 분석",
        "원장·강사·학생·학부모 역할별 맞춤 앱",
      ],
    },
  ],
  faq: [
    {
      question: "영어학원 관리 프로그램과 AI 문제 생성이 한 플랫폼에 있나요?",
      answer:
        "네. SMOAT는 AI 문제 생성·지문 분석·시험지 제작 같은 콘텐츠 제작부터 학생 관리·원비 청구·출결·급여·재무까지 한 플랫폼에서 다룹니다. 만든 문제·지문·시험지·학습활동은 클라우드에서 관리되고, 그 자료를 만든 곳에서 바로 학원 운영으로 이어집니다.",
    },
    {
      question: "학원 원비 관리는 어떻게 하나요?",
      answer:
        "학생별로 청구서를 발행하고 미납·완납·연체·부분납·환불·취소까지 납부 상태를 추적합니다. 결제수단은 카드·계좌이체·현금과 카카오페이·네이버페이·토스를 기록할 수 있어, 학생별 원비 현황을 한 화면에서 관리합니다.",
    },
    {
      question: "학생 관리와 출결 관리도 함께 되나요?",
      answer:
        "학생 운영 허브 한 화면에서 학생 등록·반 편성·기기 관리·원비를 함께 봅니다. 출결은 출석·결석·지각·조퇴·보강 상태로 관리하므로, 학생 관리와 출결 관리를 같은 시스템에서 처리할 수 있습니다.",
    },
    {
      question: "원장·강사·학생·학부모가 각각 다른 화면을 쓰나요?",
      answer:
        "역할별 앱을 제공합니다. 원장은 운영 전반을, 강사는 출결·학생 관리를, 학생은 학습·성적·과제·오답 복습을, 학부모는 자녀 성적·청구 내역·메시지를 역할에 맞춘 화면으로 사용합니다.",
    },
  ],
  ctaTitle: "콘텐츠 제작과 학원 운영을 하나로, 영어학원 올인원",
  ctaBody:
    "AI 문제 생성·지문 분석·시험지 제작부터 학생·원비·출결·급여·재무까지 — SMOAT 하나로 운영하세요. 지금 시작할 수 있습니다.",
  related: [
    {
      href: "/features/ai-question-generation",
      label: "AI 영어 문제 생성",
      description: "지문 하나로 19유형 변형문제 자동 출제",
    },
    {
      href: "/features/exam-builder",
      label: "Word·한글 시험지 제작",
      description: "문항을 편집 가능한 시험지·해설지로 조판",
    },
    {
      href: "/features/passage-analysis",
      label: "지문 분석",
      description: "직독직해·구문·어휘 A4 분석 보고서",
    },
  ],
};

export default function AcademyErpPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-academy-erp"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "영어학원 관리 프로그램", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 영어학원 올인원 학원 ERP",
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
