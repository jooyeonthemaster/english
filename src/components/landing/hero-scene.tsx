"use client";

import Image from "next/image";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Download,
  FileText,
  NotebookPen,
  Play,
  ScanText,
  Target,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { HERO_ANNOTATIONS } from "./shared/mock-data";
import { ANNOTATION_COLORS, ANNOTATION_LABEL, MarkByKind } from "./shared/annotation-marks";



const PIPELINE: Array<{
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: string;
}> = [
  {
    icon: NotebookPen,
    title: "필기 인식",
    detail: "강조/메모 반영",
    tone: "bg-blue-500",
  },
  {
    icon: Brain,
    title: "딥 분석",
    detail: "어휘·구문·포인트",
    tone: "bg-cyan-500",
  },
  {
    icon: Wand2,
    title: "문항 생성",
    detail: "내신 19유형",
    tone: "bg-emerald-500",
  },
  {
    icon: Download,
    title: "Word 출력",
    detail: "편집 가능한 파일",
    tone: "bg-amber-500",
  },
];

const QUESTION_TYPES = ["빈칸", "어법", "순서", "삽입", "요지", "서술", "어휘", "영작"];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function AnnotatedPreview() {
  const fragments = [
    { text: "In the digital age, ", kind: null },
    { text: "attention", kind: "vocab" as const },
    { text: " ", kind: null },
    { text: "has become", kind: "grammar" as const },
    { text: " the ", kind: null },
    { text: "most valuable currency", kind: "examPoint" as const },
    { text: ". Every notification, every scroll", kind: "syntax" as const },
    { text: " demands our attention.", kind: null },
  ];

  return (
    <p className="text-[13px] leading-7 text-slate-700 sm:text-[14px]">
      {fragments.map((fragment, index) =>
        fragment.kind ? (
          <MarkByKind key={`${fragment.text}-${index}`} kind={fragment.kind}>
            {fragment.text}
          </MarkByKind>
        ) : (
          <span key={`${fragment.text}-${index}`}>{fragment.text}</span>
        ),
      )}
    </p>
  );
}

function PipelineCard({ icon: Icon, title, detail, tone }: (typeof PIPELINE)[number]) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/70 bg-white/82 px-3 py-3 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone} text-white shadow-lg`}>
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black text-slate-950">{title}</span>
        <span className="block truncate text-[11px] font-bold text-slate-500">{detail}</span>
      </span>
    </div>
  );
}

function FloatingBadge({
  className,
  icon: Icon,
  label,
  value,
  style,
}: {
  className: string;
  icon: LucideIcon;
  label: string;
  value: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`absolute hidden rounded-2xl border border-white/75 bg-white/86 px-4 py-3 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.65)] backdrop-blur-2xl lg:block ${className}`}
      style={style}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="size-5" />
        </span>
        <span>
          <span className="block text-[11px] font-bold text-slate-400">{label}</span>
          <span className="block text-[14px] font-black text-slate-950">{value}</span>
        </span>
      </div>
    </div>
  );
}

function ProductDashboard() {
  return (
    <div className="yshin-hero-scale relative mx-auto w-full max-w-[1140px]">
      <style>{`
        /* 짧은 데스크톱 뷰포트에서는 목업을 비율 축소해 히어로가 한 화면에 들어오게 한다
           (높이를 줄이면 내부 UI 가 잘리므로 scale 로 통째 축소 — 내부 무손상). */
        @media (min-width: 1024px) and (max-height: 919px) {
          .yshin-hero-scale { transform: scale(0.9); transform-origin: top center; }
        }
        @media (min-width: 1024px) and (max-height: 869px) {
          .yshin-hero-scale { transform: scale(0.8); transform-origin: top center; }
        }

        @keyframes yshin-dashboard-float {
          0%, 100% { transform: translateY(0) rotateX(14deg) rotateY(-10deg) rotateZ(4deg); }
          50% { transform: translateY(-12px) rotateX(16deg) rotateY(-12deg) rotateZ(5deg); }
        }

        @keyframes yshin-scan-line {
          0% { transform: translateX(-110%); opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }

        .yshin-dashboard-float {
          animation: yshin-dashboard-float 8s ease-in-out infinite;
        }

        .yshin-scan-line {
          animation: yshin-scan-line 3.6s ease-in-out infinite;
        }

        @media (max-width: 1023px) {
          @keyframes yshin-dashboard-float-mobile {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          .yshin-dashboard-float {
            animation: yshin-dashboard-float-mobile 6s ease-in-out infinite !important;
            transform: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .yshin-dashboard-float,
          .yshin-scan-line {
            animation: none !important;
          }
        }
      `}</style>

      <div className="yshin-dashboard-float relative w-full transform-gpu" style={{ transformStyle: "preserve-3d" }}>
        <FloatingBadge
          className="-left-10 top-12"
          icon={ScanText}
          label="자동 분석"
          value="필기 기반 5개 레이어"
          style={{ transform: "translateZ(80px)" }}
        />
        <FloatingBadge
          className="-right-6 top-20"
          icon={Target}
          label="출제 설계"
          value="19유형 문항 큐"
          style={{ transform: "translateZ(60px)" }}
        />
        <FloatingBadge
          className="bottom-12 -left-4"
          icon={Download}
          label="출력 완료"
          value="Word 시험지 생성"
          style={{ transform: "translateZ(90px)" }}
        />

        <div className="relative overflow-hidden rounded-[28px] border-[7px] border-slate-950/90 bg-slate-950/90 shadow-[0_36px_110px_-40px_rgba(15,23,42,0.8)] backdrop-blur-sm sm:border-[10px] lg:rounded-[34px]">
        <div className="relative h-[382px] overflow-hidden rounded-[20px] border border-white/20 bg-white sm:h-[410px] lg:h-[430px] lg:rounded-[24px]">
          <div className="flex h-12 items-center justify-between border-b border-slate-100 bg-white px-4 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-300" />
              <span className="size-2.5 rounded-full bg-amber-300" />
              <span className="size-2.5 rounded-full bg-emerald-300" />
              <span className="ml-3 hidden rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500 sm:block">
                smoat.ai/workbench
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 sm:flex">
                <CheckCircle2 className="size-3.5" />
                Live
              </span>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-black text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)]">
                Generate
              </span>
            </div>
          </div>

          <div className="grid h-[calc(100%-48px)] grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] lg:grid-cols-[168px_minmax(0,1fr)_230px]">
            <aside className="hidden sm:block border-r border-slate-100 bg-white px-3 py-4 sm:px-4">
              <div className="mb-5 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-slate-950 text-[12px] font-black text-white">
                  영
                </span>
                <span className="hidden text-[13px] font-black text-slate-950 sm:block">SMOAT</span>
              </div>
              <div className="space-y-2">
                {["학습지 생성", "문항 생성", "시험지", "보관함"].map((item, index) => (
                  <div
                    key={item}
                    className={`flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-black sm:text-[12px] ${
                      index === 0 ? "bg-blue-50 text-blue-700" : "text-slate-400"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${index === 0 ? "bg-blue-500" : "bg-slate-200"}`} />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 hidden rounded-2xl border border-blue-100 bg-blue-50/70 p-3 sm:block">
                <div className="text-[11px] font-black text-blue-700">오늘의 작업</div>
                <div className="mt-2 text-2xl font-black text-slate-950">42</div>
                <div className="text-[11px] font-bold text-slate-500">문항 생성 완료</div>
              </div>
            </aside>

            <main className="relative min-w-0 overflow-hidden p-3 sm:p-5 lg:p-6">
              <div className="yshin-scan-line pointer-events-none absolute left-0 top-[92px] h-px w-full bg-gradient-to-r from-transparent via-blue-500 to-transparent" />

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase text-blue-500">Deep Dive Analysis</div>
                  <h2 className="mt-1 text-[18px] font-black leading-tight tracking-normal text-slate-950 sm:text-[22px]">
                    한영고 3학년 영어 지문
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-[11px] font-black text-blue-700">
                    98% 정확도
                  </span>
                  <span className="hidden rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black text-white sm:block">
                    자동 저장
                  </span>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(230px,0.85fr)]">
                <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] font-black text-slate-950">
                      <FileText className="size-4 text-blue-600" />
                      원문 마킹
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
                      5 marks
                    </span>
                  </div>
                  <AnnotatedPreview />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {HERO_ANNOTATIONS.map((annotation) => (
                      <span
                        key={annotation.kind}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black"
                        style={{
                          borderColor: `${ANNOTATION_COLORS[annotation.kind]}33`,
                          background: `${ANNOTATION_COLORS[annotation.kind]}12`,
                          color: ANNOTATION_COLORS[annotation.kind],
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: ANNOTATION_COLORS[annotation.kind] }}
                        />
                        {ANNOTATION_LABEL[annotation.kind]}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="hidden min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] sm:block">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] font-black text-slate-950">
                      AI 분석 결과
                    </span>
                    <span className="text-[11px] font-black text-blue-600">5/5 완료</span>
                  </div>
                  <div className="space-y-2.5">
                    {HERO_ANNOTATIONS.slice(0, 5).map((annotation, index) => (
                      <div key={annotation.kind} className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                        <span
                          className="mt-1 size-2 rounded-full"
                          style={{ background: ANNOTATION_COLORS[annotation.kind] }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-black text-slate-950">
                            {index + 1}. {ANNOTATION_LABEL[annotation.kind]}
                          </span>
                          <span className="block truncate text-[11px] font-bold text-slate-500">
                            {annotation.memo}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PIPELINE.map((item) => (
                  <PipelineCard key={item.title} {...item} />
                ))}
              </div>
            </main>

            <aside className="hidden border-l border-slate-100 bg-white px-4 py-5 lg:block">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[12px] font-black text-slate-950">생성 큐</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                  19/19
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {QUESTION_TYPES.map((type, index) => (
                  <span
                    key={type}
                    className={`rounded-xl px-2.5 py-2 text-center text-[11px] font-black ${
                      index < 5 ? "bg-blue-600 text-white shadow-sm" : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {type}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2 text-[11px] font-black text-blue-200">
                  <Zap className="size-4" />
                  Export Ready
                </div>
                <div className="mt-3 text-[22px] font-black">시험지.docx</div>
                <div className="mt-1 text-[11px] font-bold text-slate-300">정답지·해설지 자동 분리</div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export function HeroScene() {
  return (
    // 고정 100svh 를 쓰지 않는다 — 텍스트가 길어지면 목업이 잘리거나 화면 밖으로 밀린다.
    // 대신 텍스트 블록을 수직으로 압축해 자연 높이가 1080p 한 화면(~940px)에 들어오게 설계.
    <section className="relative isolate w-full overflow-hidden bg-slate-50 pt-20 sm:pt-[88px] pb-12 sm:pb-14">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src="/landing/hero-sky-v2.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-80"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.4)_40%,rgba(248,250,252,0.7)_70%,#f8fafc_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-col items-center px-5 sm:px-8">
        <div className="mx-auto max-w-[1280px] break-keep text-center mt-2">
          {/* H1: 컨테이너를 넉넉히(1280px) 잡아 각 행이 어절 중간에서 꺾이지 않고 정확히 2행으로 떨어지게 한다 */}
          <h1 className="break-keep text-[32px] font-black leading-[1.15] tracking-tight text-slate-950 drop-shadow-sm [overflow-wrap:anywhere] sm:text-[42px] lg:text-[48px] xl:text-[52px]">
            AI 영어 문제 생성부터 시험지 제작까지,
            <br className="hidden sm:block" />
            <span className="text-blue-600">스모트(SMOAT)가 한 번에 완성</span>합니다
          </h1>

          <div className="mx-auto mt-4 max-w-[1080px]">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-[12px] font-black text-white shadow-[0_18px_38px_-22px_rgba(37,99,235,0.95)] sm:text-[13px]">
              영어학원 AI · 영어 문제 생성 워크벤치
            </div>
            <p className="mt-2.5 text-[20px] font-black leading-[1.3] text-slate-950 sm:text-[23px]">
              <span className="text-blue-600">실제 자료로 먼저 확인하세요</span>
              <span className="hidden lg:inline"> — </span>
              <br className="hidden sm:block lg:hidden" />
              학습지부터 시험지까지 바로 완성됩니다.
            </p>
            <p className="mt-2 text-[15px] font-black leading-7 text-slate-700 sm:text-[17px]">
              영어 학습지 생성, 출제 포인트, 시험지 생성까지{" "}
              <span className="rounded-lg bg-yellow-300 px-2 py-0.5 text-blue-700">전부 먼저 써보고 판단하세요!!!</span>
            </p>
            <p className="mx-auto mt-2.5 max-w-[980px] text-[13px] font-semibold leading-6 text-slate-500 sm:text-[14px]">
              스모트(SMOAT)는 영어 지문 분석, 내신·수능 19유형 영어 문제 생성,
              Word 시험지 자동 제작까지 한 번에 끝내는 영어학원 AI 올인원입니다.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 relative z-20">
            <a
              href="/register"
              className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-blue-600 px-8 text-[15px] font-black text-white shadow-[0_24px_54px_-22px_rgba(37,99,235,1)] ring-4 ring-blue-500/15 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_28px_64px_-24px_rgba(37,99,235,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[54px] sm:px-10 sm:text-[16px]"
            >
              SMOAT 시작하기
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </a>
            <a
              href="#section-annotation"
              onClick={(event) => {
                event.preventDefault();
                scrollTo("section-annotation");
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-6 text-[14px] font-black text-slate-800 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[54px]"
            >
              <Play className="size-4 fill-current" strokeWidth={2.5} />
              작동 방식 보기
            </a>
          </div>
        </div>

        <div
          className="mt-7 sm:mt-8 w-full z-10 pointer-events-none"
          style={{ perspective: "1600px", perspectiveOrigin: "top" }}
        >
          <ProductDashboard />
        </div>
      </div>
    </section>
  );
}
