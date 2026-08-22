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

const PATH = "/features/exam-builder";

export const metadata = buildMetadata({
  title: "영어 시험지 제작 — Word·한글 자동 조판",
  description:
    "생성한 영어 문항을 Word·한글 시험지로 자동 조판하고, 학생용·강사용 해설지와 정답표까지 만드는 SMOAT.",
  path: PATH,
  keywords: [
    "영어 시험지 제작",
    "영어 시험지 만들기",
    "Word 영어 시험지",
    "한글 시험지",
    "영어 해설지 제작",
    "영어 정답지",
    "시험지 자동 조판",
    "영어 내신 시험지",
    "학원 시험지 출력",
  ],
});

const CONTENT: FeaturePageContent = {
  eyebrow: "Word·한글 시험지 제작",
  h1: "영어 시험지 제작 — Word·한글 자동 조판으로 바로 출력",
  subhead:
    "생성하거나 보유한 영어 문항을 편집 가능한 Word(.docx) 시험지로 자동 조판해 바로 내려받습니다. 학생용 시험지와 강사용 영어 해설지를 한 번에 분리 생성하고, 시험지 끝 정답표까지 자동으로 만들어 학원 영어 내신 시험지를 바로 인쇄할 수 있습니다. 영어학원 AI 올인원, 스모트(SMOAT)입니다.",
  heroHighlight: "조판 없이, 클릭 몇 번으로 인쇄까지",
  heroImage: {
    src: "/features/shots/exam-builder/hero.png",
    alt: "SMOAT 시험지 빌더 — A4 미리보기와 시험지 설정 패널",
    caption: "시험지 편집",
  },
  heroStats: [
    { value: "8", unit: "종", label: "시험지 디자인 프리셋" },
    { value: "2", unit: "가지", label: "Word·한글 내보내기" },
    { value: "1", unit: "번에", label: "학생용·해설지 분리" },
  ],
  heroBullets: [
    "편집 가능한 Word(.docx) 영어 시험지 자동 조판",
    "학생용 시험지 + 강사용 영어 해설지 동시 분리 생성",
    "시험지 끝 정답표 자동 생성",
    "웹 미리보기 그대로 인쇄되는 픽셀 단위 일치",
  ],
  sectionsTitle: "편집부터 인쇄까지, 웹에서 그대로",
  sectionsBody: "웹 미리보기에서 보이는 그대로 Word·한글·PDF로 나갑니다.",
  sections: [
    {
      title: "Word 영어 시험지로 자동 조판, 바로 편집",
      image: {
        src: "/features/shots/exam-builder/s1.png",
        alt: "A4 시험지 자동 조판 편집 화면",
        caption: "Word 조판",
      },
      body: "생성하거나 보유한 영어 문항을 편집 가능한 Word(.docx) 시험지로 자동 조판해 내려받습니다. 객관식부터 서술형까지 내신·수능 24유형을 시험지에 그대로 배치하니, 받은 파일에서 발문이나 배점을 바로 손봐 학원 시험에 사용할 수 있습니다. 한글(HWPX, 베타) 내보내기와 PDF 다운로드도 지원합니다.",
      bullets: [
        "객관식~서술형 내신·수능 24유형 그대로 조판",
        "편집 가능한 Word(.docx)로 발문·배점 바로 수정",
        "한글(HWPX, 베타) 내보내기 지원 · PDF 다운로드 메뉴",
      ],
    },
    {
      title: "학생용 시험지 · 강사용 영어 해설지 동시 분리 생성",
      image: {
        src: "/features/shots/exam-builder/s2.png",
        alt: "정답·해설이 표시된 강사용 해설지 화면",
        caption: "해설지 분리",
      },
      body: "같은 시험지에서 두 버전을 한 번에 만듭니다. 학생용은 문제와 끝 정답표로, 강사용 영어 해설지는 정답과 상세 해설까지 담아 분리 생성됩니다. 시험지 끝에는 정답표가 자동으로 붙고, 정답이 길면 번호 목록형으로 자동 전환됩니다.",
      bullets: [
        "학생용 시험지와 강사용 해설지 한 번에 분리",
        "정답·상세 해설을 담은 영어 해설지 생성",
        "시험지 끝 정답표 자동 생성(길면 번호 목록형 전환)",
      ],
    },
    {
      title: "웹 미리보기 그대로, 픽셀 단위로 동일하게 인쇄",
      image: {
        src: "/features/shots/exam-builder/s3.png",
        alt: "A4 페이지 미리보기 화면",
        caption: "A4 미리보기",
      },
      body: "화면에서 본 미리보기와 내려받은 시험지가 픽셀 단위로 동일합니다. 줄간격·자간·여백·폰트를 1:1로 맞춰 조판하므로, 미리보기에서 본 그대로 인쇄됩니다. 글꼴은 맑은 고딕으로 통일해 Word는 픽셀 단위로 일치하고, 한글(HWPX)은 베타로 호환을 맞췄습니다.",
      bullets: [
        "줄간격·자간·여백·폰트 1:1 시험지 자동 조판",
        "맑은 고딕 통일로 학원 PC 인쇄 호환",
        "PDF·Word는 미리보기와 1:1, 한글(HWPX)은 베타 지원",
      ],
    },
    {
      title: "학원 헤더 자동 맞춤화 · 1단/2단 레이아웃",
      image: {
        src: "/features/shots/exam-builder/s4.png",
        alt: "용지·단 구성·배점 시험지 설정 패널",
        caption: "시험지 설정",
      },
      body: "학원 로고, 학교명, 반명, 이름 입력칸, 안내문을 한 번만 설정하면 모든 영어 시험지에 자동으로 삽입됩니다. 페이지번호와 총페이지를 표시하는 푸터, 1단·2단 레이아웃 선택까지 더해 학원 양식에 맞춘 시험지를 그대로 출력할 수 있습니다.",
      bullets: [
        "학원 로고·학교명·반명·이름칸·안내문 한 번 설정 후 자동 삽입",
        "페이지번호·총페이지 푸터 표시",
        "1단·2단 레이아웃 선택",
      ],
    },
  ],
  faq: [
    {
      question: "영어 시험지를 Word(.docx)로 만들 수 있나요?",
      answer:
        "네. 생성하거나 보유한 영어 문항을 편집 가능한 Word(.docx) 시험지로 자동 조판해 바로 내려받을 수 있습니다. 받은 파일에서 발문·배점을 직접 수정해 학원 시험에 사용할 수 있고, 한글(HWPX)과 PDF 출력도 지원합니다.",
    },
    {
      question: "학생용 시험지와 영어 해설지를 따로 받을 수 있나요?",
      answer:
        "같은 시험지에서 두 버전을 한 번에 분리 생성합니다. 학생용 시험지에는 문제와 끝 정답표가, 강사용 영어 해설지에는 정답과 상세 해설이 담깁니다. 메뉴에서 PDF·Word·Word 해설·한글·한글 해설을 선택해 내려받을 수 있습니다.",
    },
    {
      question: "한글(HWPX)·정답지 출력도 되나요?",
      answer:
        "한글(HWPX) 내보내기를 지원합니다. 시험지 끝에는 정답표가 자동으로 생성되며, 정답이 길면 번호 목록형으로 자동 전환됩니다. Word는 안정적으로 지원하고 한글 내보내기는 베타로 제공됩니다.",
    },
    {
      question: "화면에서 본 시험지가 그대로 인쇄되나요?",
      answer:
        "웹 미리보기와 다운로드 파일이 픽셀 단위로 동일하도록 줄간격·자간·여백·폰트를 1:1로 맞춰 조판합니다. 글꼴은 맑은 고딕으로 통일해 학원 PC에서도 미리보기 그대로 인쇄됩니다.",
    },
  ],
  ctaTitle: "영어 시험지 만들기, 조판은 SMOAT에 맡기세요",
  ctaBody:
    "문항 생성부터 Word·한글 시험지 자동 조판, 영어 해설지·정답지 동시 출력까지 — SMOAT 하나로 끝냅니다. 지금 사용해 보세요.",
  related: relatedFeatures(PATH),
};

export default function ExamBuilderPage() {
  return (
    <>
      <JsonLd
        id="ld-feature-exam-builder"
        data={[
          breadcrumbSchema([
            { name: "SMOAT", url: "/" },
            { name: "Word·한글 시험지 제작", url: PATH },
          ]),
          softwareApplicationSchema({
            name: "SMOAT 영어 시험지·해설지 제작",
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
