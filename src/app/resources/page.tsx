import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Download, FileText } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

/**
 * 무료자료실 — 다운로드 자석(리드 마그넷) 페이지. 서버 컴포넌트(전 텍스트 크롤가능).
 *
 * 디자인: "잉크 에디토리얼" — 딥 네이비 히어로 + 대형 다운로드 카드(파일형식 칩·포함 내용·잉크 pill 버튼)
 *        + 브리지 인라인 CTA 밴드 + 말미 다크 CTA 밴드. 기준 구현은 article-shell.tsx 의 블록 문법.
 * 전환: 다운로드가 제1 CTA — 카드 자체를 페이지의 주인공으로 조판. 다운로드 직후 시야에
 *       "이 양식을 채우는 문제는 스모트가 만듭니다" 브리지 밴드를 배치해 /register 로 연결.
 * 리서치 실측 공백 키워드("영어 시험지 양식", "서술형 채점기준표", "단어시험지 양식")를
 * 실제 .docx 무료 배포로 정조준한다. 파일은 scripts/generate-resource-templates.mjs 가 생성.
 */

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

const RESOURCES: Array<{
  file: string;
  title: string;
  format: string;
  description: string;
  bullets: string[];
}> = [
  {
    file: "/resources/smoat-english-exam-template.docx",
    title: "영어 시험지 양식 (Word, 2단 조판)",
    format: ".docx",
    description:
      "학원 내신 대비 모의 시험지에 바로 쓸 수 있는 영어 시험지 양식입니다. 표지 정보란(학년·이름·점수)과 2단 본문, 문항 틀이 잡혀 있어 지문과 문항만 붙여넣으면 됩니다.",
    bullets: ["A4 · 2단 조판 · 맑은 고딕", "정보란(범위·문항 수·시간) 포함", "워드에서 자유 편집"],
  },
  {
    file: "/resources/smoat-grading-rubric-template.docx",
    title: "영어 서술형 채점기준표 (Word)",
    format: ".docx",
    description:
      "내용·조건·어법 3축 배점 프레임으로 짜인 서술형 채점기준표 양식입니다. 부분점수·감점 기준 예시 행이 들어 있어 그대로 응용해 채점 기준을 세울 수 있습니다.",
    bullets: ["평가 요소·배점·부분점수·감점 칼럼", "작성 원칙 3가지 안내 포함", "문항 8개 기입 가능"],
  },
  {
    file: "/resources/smoat-vocab-test-template.docx",
    title: "영어 단어시험지 양식 (Word, 40문항)",
    format: ".docx",
    description:
      "좌측 20문항(영어→뜻)·우측 20문항(뜻→영어)으로 구성된 단어시험지 양식입니다. 범위·이름·점수란이 있어 인쇄 후 바로 시험을 볼 수 있습니다.",
    bullets: ["40문항 양면 활용 구조", "범위·이름·점수란 포함", "학원 로고 삽입 가능"],
  },
];

const USAGE_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "양식 다운로드",
    body: "다운로드 버튼을 누르면 .docx 파일이 바로 저장됩니다. 회원가입이나 이메일 입력이 필요 없습니다.",
  },
  {
    title: "내용 채우기",
    body: "Word에서 열어 지문·문항·배점을 붙여넣습니다. 정보란과 학원 로고도 자유롭게 수정할 수 있습니다.",
  },
  {
    title: "인쇄·활용",
    body: "A4 규격 그대로 인쇄해 수업과 시험에 바로 사용합니다. 학원 내부 자료로 자유롭게 활용할 수 있습니다.",
  },
];

export const metadata: Metadata = buildMetadata({
  title: "무료자료실 — 영어 시험지 양식·채점기준표·단어시험지",
  description:
    "영어 시험지 양식(워드), 서술형 채점기준표, 단어시험지 양식을 무료로 내려받으세요. 회원가입 없이 바로 다운로드할 수 있습니다. 영어학원 AI 올인원 스모트(SMOAT).",
  path: "/resources",
  keywords: [
    "영어 시험지 양식",
    "시험지 양식 다운로드",
    "영어 서술형 채점기준표",
    "단어시험지 양식",
    "영어 시험지 워드",
    "무료 영어 자료",
  ],
});

export default function ResourcesPage() {
  return (
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-resources"
        data={breadcrumbSchema([
          { name: "스모트 SMOAT", url: "/" },
          { name: "무료자료실", url: "/resources" },
        ])}
      />
      <main className="pt-20">
        {/* HERO — 딥 네이비 잉크 */}
        <section className="relative overflow-hidden bg-[#070D1F]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(70%_90%_at_85%_-15%,rgba(37,99,235,0.32),transparent_60%)]"
          />
          <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
          <div className="relative mx-auto max-w-[1480px] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
            <nav
              aria-label="breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-500"
            >
              <Link href="/" className="whitespace-nowrap transition hover:text-white">
                스모트
              </Link>
              <span aria-hidden>›</span>
              <span className="whitespace-nowrap text-slate-400">무료자료실</span>
            </nav>

            <div className="mt-8 max-w-[1000px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                <span className="whitespace-nowrap">무료자료실</span>
              </p>
              <h1 className="mt-5 text-[32px] font-black leading-[1.18] tracking-tight text-white sm:text-[44px] lg:text-[50px]">
                영어 시험지 양식·채점기준표
                <br className="hidden sm:block" /> 무료 다운로드
              </h1>
              <div className="mt-6 space-y-3.5">
                <p className="text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]">
                  영어학원에서 매주 쓰는 실무 양식 3종을 무료로 배포합니다.
                  회원가입 없이 버튼 한 번으로 바로 내려받아 편집할 수 있습니다.
                </p>
                <p className="text-[14.5px] leading-[1.85] text-slate-400 sm:text-[15px]">
                  양식을 채우는 일 자체를 없애고 싶다면, 스모트(SMOAT)가 문항
                  선택만으로 같은 규격의 시험지를 자동 조판해 드립니다.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  양식 <span className="text-white">3종 무료</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  형식 <span className="text-white">Word(.docx)</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  <span className="text-white">회원가입 불필요</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* DOWNLOADS — 대형 카드(제1 CTA) */}
        <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-20">
          <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
            <span aria-hidden className="size-1.5 bg-blue-600" />
            <span className="whitespace-nowrap">무료 배포 양식</span>
          </p>
          <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
            지금 바로 내려받는 실무 양식 3종
          </h2>
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-7 text-slate-600">
            모든 파일은 Word(.docx) 형식입니다. 다운로드 버튼을 누르면 바로
            저장됩니다.
          </p>

          <div className="mt-9 space-y-5">
            {RESOURCES.map((r, i) => (
              <article
                key={r.file}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                  {/* 좌: 자료 소개 */}
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <span
                        aria-hidden
                        className="select-none text-[40px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[48px]"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-950 px-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                        <FileText className="size-3.5 text-blue-300" />
                        {r.format}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[19px] font-black leading-[1.35] tracking-tight text-slate-950 transition-colors group-hover:text-blue-700 sm:text-[23px]">
                      {r.title}
                    </h3>
                    <p className="mt-3 text-[14.5px] leading-[1.85] text-slate-600 sm:text-[15px]">
                      {r.description}
                    </p>
                  </div>

                  {/* 우: 포함 내용 + 다운로드(잉크 pill) */}
                  <div className="flex flex-col border-t border-slate-200 bg-slate-50/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
                    <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                      <span aria-hidden className="size-1.5 bg-blue-600" />
                      <span className="whitespace-nowrap">포함 내용</span>
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {r.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2.5 text-[13.5px] leading-6 text-slate-700"
                        >
                          <span
                            aria-hidden
                            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-600/10"
                          >
                            <Check className="size-3.5 text-blue-700" />
                          </span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-7 lg:mt-auto lg:pt-7">
                      <a
                        href={r.file}
                        download
                        className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-950 px-6 text-[14.5px] font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-blue-600"
                      >
                        <Download className="size-4 shrink-0" />
                        무료 다운로드
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* 브리지 인라인 CTA 밴드 */}
          <div className="relative mt-12 overflow-hidden rounded-2xl bg-slate-950 px-5 py-7 sm:px-8">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(70%_120%_at_90%_-20%,rgba(37,99,235,0.35),transparent_60%)]"
            />
            <div className={`absolute inset-0 opacity-60 ${INK_GRID_PATTERN}`} aria-hidden />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-300">
                  SMOAT AI
                </p>
                <p className="mt-1.5 text-[17px] font-black leading-6 text-white sm:text-[18px]">
                  이 양식을 채우는 문제는 스모트가 만듭니다
                </p>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
                  지문만 붙여넣으면 내신·수능 24유형 문항과 해설이 생성되고, 이
                  양식 없이도 완성된 Word·한글 시험지가 바로 내려받아집니다.
                </p>
              </div>
              <Link
                href="/register"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full bg-white px-5 text-[13.5px] font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:self-auto"
              >
                무료로 만들어 보기
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* USAGE — 이용 방법 */}
        <section className="border-t border-slate-100 bg-slate-50/70">
          <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
              <span aria-hidden className="size-1.5 bg-blue-600" />
              <span className="whitespace-nowrap">이용 방법</span>
            </p>
            <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
              내려받은 양식은 이렇게 사용합니다
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {USAGE_STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                >
                  <span
                    aria-hidden
                    className="select-none text-[34px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-3 whitespace-nowrap text-[15.5px] font-extrabold text-slate-950">
                    {step.title}
                  </p>
                  <p className="mt-2 text-[13.5px] leading-6 text-slate-600">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA — 다크 밴드 */}
        <section className="relative overflow-hidden bg-[#070D1F]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_120%,rgba(37,99,235,0.4),transparent_65%)]"
          />
          <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
          <div className="relative mx-auto max-w-[1000px] px-5 py-16 text-center sm:px-8 sm:py-20">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-300">
              SMOAT — English AI Workbench
            </p>
            <h2 className="mt-4 text-[26px] font-black leading-[1.25] tracking-tight text-white sm:text-[32px]">
              양식을 채우는 시간까지 스모트가 없앱니다
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              지문을 넣으면 문항 생성부터 시험지 조판, 해설지 제작까지 한 번에
              끝납니다. 다음 시험 준비는 스모트와 함께 시작해 보시기 바랍니다.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-[15px] font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                무료로 시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/features/ai-question-generation"
                className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-white/25 px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/10"
              >
                AI 문제 생성 살펴보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
