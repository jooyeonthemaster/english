"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  GripVertical,
  LayoutTemplate,
  PencilLine,
  Play,
  Plus,
  Save,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const BUILDER_ACTIONS: Array<{
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: string;
}> = [
  {
    icon: LayoutTemplate,
    title: "지면 편집",
    detail: "A4 2단 레이아웃",
    tone: "bg-blue-500",
  },
  {
    icon: Plus,
    title: "문항 추가",
    detail: "라이브러리에서 배치",
    tone: "bg-cyan-500",
  },
  {
    icon: Save,
    title: "자동 저장",
    detail: "편집 내용 즉시 반영",
    tone: "bg-emerald-500",
  },
  {
    icon: Download,
    title: "파일 출력",
    detail: "DOCX·HWPX·PDF",
    tone: "bg-amber-500",
  },
];

const BUILDER_LIBRARY_TYPES = ["빈칸 추론", "어법 판단", "글의 순서", "문장 삽입", "제목 추론", "조건부 영작"];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PipelineCard({ icon: Icon, title, detail, tone }: (typeof BUILDER_ACTIONS)[number]) {
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
      className={`absolute hidden rounded-2xl border border-white/75 bg-white/86 px-4 py-3 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.65)] backdrop-blur-2xl xl:block ${className}`}
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
    <div className="relative mx-auto w-full max-w-[1120px]">
      <style>{`
        @keyframes yshin-builder-float {
          0%, 100% { transform: translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg); }
          50% { transform: translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg); }
        }

        @keyframes yshin-builder-cursor {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }

        .yshin-builder-float {
          animation: yshin-builder-float 8s ease-in-out infinite;
        }

        .yshin-builder-cursor {
          animation: yshin-builder-cursor 2.4s ease-in-out infinite;
        }

        @media (max-width: 1023px) {
          @keyframes yshin-builder-float-mobile {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          .yshin-builder-float {
            animation: yshin-builder-float-mobile 6s ease-in-out infinite !important;
            transform: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .yshin-builder-float,
          .yshin-builder-cursor {
            animation: none !important;
          }
        }
      `}</style>

      <div className="yshin-builder-float relative w-full transform-gpu" style={{ transformStyle: "preserve-3d" }}>
        <FloatingBadge
          className="-left-10 top-12"
          icon={PencilLine}
          label="시험지 생성"
          value="실제 지면 직접 편집"
          style={{ transform: "translateZ(80px)" }}
        />
        <FloatingBadge
          className="-right-6 top-20"
          icon={ClipboardList}
          label="문항 구성"
          value="12문항 자동 배치"
          style={{ transform: "translateZ(60px)" }}
        />
        <FloatingBadge
          className="bottom-12 -left-4"
          icon={Download}
          label="출력 완료"
          value="DOCX·HWPX·PDF"
          style={{ transform: "translateZ(90px)" }}
        />

        <div className="relative overflow-hidden rounded-[28px] border-[7px] border-slate-950/90 bg-slate-950/90 shadow-[0_36px_110px_-40px_rgba(15,23,42,0.8)] backdrop-blur-sm sm:border-[10px] lg:rounded-[34px]">
        <div className="relative h-[382px] overflow-hidden rounded-[20px] border border-white/20 bg-slate-50 sm:h-[430px] lg:h-[468px] lg:rounded-[24px]">
          <div className="flex h-12 items-center justify-between border-b border-slate-100 bg-white px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full bg-red-300" />
              <span className="size-2.5 shrink-0 rounded-full bg-amber-300" />
              <span className="size-2.5 shrink-0 rounded-full bg-emerald-300" />
              <span className="ml-3 hidden max-w-[270px] truncate rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500 sm:block">
                smoat.co.kr/workbench/exams/create
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 sm:flex">
                <CheckCircle2 className="size-3.5" />
                저장됨
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-black text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)]">
                <Download className="size-3.5" />
                출력
              </span>
            </div>
          </div>

          <div className="grid h-[calc(100%-48px)] grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] lg:grid-cols-[172px_minmax(0,1fr)_246px]">
            <aside className="hidden border-r border-slate-100 bg-white px-3 py-4 sm:block sm:px-4">
              <div className="mb-5 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-[12px] font-black text-white">
                  S
                </span>
                <span className="hidden text-[13px] font-black text-slate-950 sm:block">SMOAT</span>
              </div>
              <div className="space-y-1.5">
                {["문제 생성", "시험지 생성", "학습지 생성", "자료 추출"].map((item, index) => (
                  <div
                    key={item}
                    className={`flex h-8 items-center gap-2 rounded-xl px-2 text-[11px] font-black sm:text-[12px] ${
                      index === 1 ? "bg-blue-50 text-blue-700" : "text-slate-400"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${index === 1 ? "bg-blue-500" : "bg-slate-200"}`} />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                {[
                  ["고2 영어 중간", "12문항 · 편집중"],
                  ["수능형 미니 모의고사", "20문항"],
                  ["어법 집중 세트", "8문항"],
                ].map(([title, detail], index) => (
                  <div
                    key={title}
                    className={`rounded-2xl border px-3 py-2 ${
                      index === 0 ? "border-blue-200 bg-blue-50/80" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="truncate text-[11px] font-black text-slate-950">{title}</div>
                    <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{detail}</div>
                  </div>
                ))}
              </div>
            </aside>

            <main className="flex min-w-0 flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase text-blue-500">시험지 생성</div>
                  <h2 className="mt-1 truncate text-[18px] font-black leading-tight tracking-normal text-slate-950 sm:text-[22px]">
                    고2 영어 중간고사 시험지 편집
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden rounded-full border border-blue-100 bg-white px-3 py-1 text-[10px] font-black text-blue-700 sm:inline-flex">
                    A4 · 2단 · 12문항
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black text-white">
                    <Save className="size-3.5" />
                    자동 저장
                  </span>
                </div>
              </div>

              <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/90 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
                <div className="absolute left-3 top-3 z-10 hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-black text-slate-600 shadow-sm sm:flex">
                  <LayoutTemplate className="size-3.5 text-blue-600" />
                  1페이지 편집중
                </div>
                <div className="absolute right-3 top-3 z-10 hidden items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white shadow-[0_12px_24px_-18px_rgba(37,99,235,1)] sm:flex">
                  <Sparkles className="size-3.5" />
                  AI 추천 배치
                </div>

                <div className="relative mx-auto h-full max-h-[282px] w-[76%] min-w-[248px] max-w-[420px] rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.6)] sm:max-h-[315px] lg:max-h-[322px]">
                  <div className="mb-2 flex items-start justify-between gap-3 border-b border-slate-900 pb-2">
                    <div className="min-w-0">
                      <div className="text-[8px] font-black text-blue-600">2026학년도 1학기</div>
                      <div className="mt-0.5 truncate text-[14px] font-black leading-tight text-slate-950 sm:text-[15px]">
                        고2 영어 중간고사
                      </div>
                    </div>
                    <div className="grid grid-cols-[28px_56px] overflow-hidden rounded border border-slate-200 text-[7px] font-bold text-slate-500">
                      <span className="bg-slate-50 px-1 py-0.5">반</span>
                      <span className="px-1 py-0.5">_____</span>
                      <span className="bg-slate-50 px-1 py-0.5">이름</span>
                      <span className="px-1 py-0.5">_____</span>
                    </div>
                  </div>

                  <div className="mb-2 rounded-md bg-slate-50 px-2 py-1.5 text-[8px] font-bold leading-snug text-slate-600">
                    다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오.
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <div className="rounded-md border border-slate-200 p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[8px] font-black text-slate-950">
                          <span className="rounded bg-slate-950 px-1.5 py-0.5 text-white">1</span>
                          빈칸 추론
                        </div>
                        <div className="space-y-1 text-[7px] font-semibold leading-snug text-slate-500">
                          <p>Attention has become the most valuable currency in the digital age...</p>
                          <p>① attention ② memory ③ silence ④ wealth ⑤ patience</p>
                        </div>
                      </div>

                      <div className="relative rounded-md border border-blue-300 bg-blue-50/45 p-2 shadow-[0_0_0_2px_rgba(37,99,235,0.12)]">
                        <GripVertical className="yshin-builder-cursor absolute -left-3 top-1/2 size-4 -translate-y-1/2 rounded bg-blue-600 p-0.5 text-white shadow-sm" />
                        <div className="mb-1 flex items-center justify-between gap-2 text-[8px] font-black text-slate-950">
                          <span className="flex items-center gap-1.5">
                            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-white">2</span>
                            어법 판단
                          </span>
                          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[7px] text-white">선택됨</span>
                        </div>
                        <div className="space-y-1 text-[7px] font-semibold leading-snug text-slate-500">
                          <p>다음 밑줄 친 부분 중 어법상 틀린 것은?</p>
                          <p>Every notification, every scroll, every swipe demand...</p>
                        </div>
                      </div>
                    </div>

                    <div className="hidden min-w-0 space-y-2 sm:block">
                      <div className="rounded-md border border-slate-200 p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[8px] font-black text-slate-950">
                          <span className="rounded bg-slate-950 px-1.5 py-0.5 text-white">3</span>
                          글의 순서
                        </div>
                        <div className="space-y-1 text-[7px] font-semibold leading-snug text-slate-500">
                          <p>(A) However, attention is easily divided...</p>
                          <p>(B) What we choose shapes our thinking...</p>
                        </div>
                      </div>

                      <div className="rounded-md border border-slate-200 p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[8px] font-black text-slate-950">
                          <span className="rounded bg-slate-950 px-1.5 py-0.5 text-white">4</span>
                          조건부 영작
                        </div>
                        <div className="space-y-1 text-[7px] font-semibold leading-snug text-slate-500">
                          <p>[조건] 관계대명사 what을 사용할 것.</p>
                          <p>우리가 선택하는 것이 사고의 구조를 만든다.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-3 hidden grid-cols-4 gap-3 sm:grid">
                {BUILDER_ACTIONS.map((item) => (
                  <PipelineCard key={item.title} {...item} />
                ))}
              </div>
            </main>

            <aside className="hidden border-l border-slate-100 bg-white px-4 py-5 lg:block">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12px] font-black text-slate-950">
                  <Settings2 className="size-4 text-blue-600" />
                  시험지 설정
                </span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                  12문항
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {["A4", "2단", "정답지"].map((label, index) => (
                  <span
                    key={label}
                    className={`rounded-xl px-2 py-2 text-center text-[10px] font-black ${
                      index < 2 ? "bg-blue-600 text-white shadow-sm" : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-950">문항 라이브러리</span>
                  <span className="text-[10px] font-black text-blue-600">+ 새 문항</span>
                </div>
                <div className="space-y-2">
                  {BUILDER_LIBRARY_TYPES.map((type, index) => (
                    <div key={type} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                      <span className="min-w-0 truncate text-[10px] font-black text-slate-700">
                        {index + 1}. {type}
                      </span>
                      <Plus className="size-3.5 shrink-0 text-blue-600" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2 text-[11px] font-black text-blue-200">
                  <FileText className="size-4" />
                  Export Ready
                </div>
                <div className="mt-3 text-[20px] font-black leading-tight">고2영어_중간.docx</div>
                <div className="mt-1 text-[11px] font-bold text-slate-300">시험지·정답지 함께 생성</div>
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
    <section className="relative isolate w-full h-auto min-h-0 md:h-[100svh] md:min-h-[850px] overflow-hidden bg-slate-50 pt-20 sm:pt-24 lg:pt-28 pb-12 md:pb-0">
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

      <div className="relative z-10 mx-auto flex h-full max-w-[1220px] flex-col items-center justify-start px-5 sm:px-8">
        <motion.div
          className="mx-auto max-w-[900px] text-center mt-4 sm:mt-6"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } }}
        >
          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 34, filter: "blur(8px)" },
              show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
            }}
            className="break-normal text-[34px] font-black leading-[1.15] tracking-tight text-slate-950 drop-shadow-sm sm:break-keep sm:text-5xl lg:text-7xl"
          >
            영어시험 고민은 이제 끝!
            <br />
            <span className="text-blue-600">SMOAT가 모든 걸 해드립니다</span>
          </motion.h1>

          <div className="mx-auto mt-6 max-w-[880px] break-keep">
            <motion.p
              variants={{
                hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
                show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
              }}
              className="text-[16px] font-black leading-8 text-slate-700 sm:text-[19px]"
            >
              SMOAT의 영어 내신·수능 최적화 AI로
              <br />
              <span className="mt-2 inline-block rounded-lg bg-yellow-300 px-2 py-0.5 text-blue-700">10시간을 10분으로 단축해드립니다!</span>
            </motion.p>
          </div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 18 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
            }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 relative z-20"
          >
            <a
              href="/register"
              className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-blue-600 px-8 text-[15px] font-black text-white shadow-[0_24px_54px_-22px_rgba(37,99,235,1)] ring-4 ring-blue-500/15 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_28px_64px_-24px_rgba(37,99,235,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[58px] sm:px-10 sm:text-[16px]"
            >
              SMOAT 시작하기
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </a>
            <a
              href="#section-intake"
              onClick={(event) => {
                event.preventDefault();
                scrollTo("section-intake");
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-6 text-[14px] font-black text-slate-800 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[54px]"
            >
              <Play className="size-4 fill-current" strokeWidth={2.5} />
              작동 방식 보기
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}
        >
        <div 
          className="mt-12 sm:mt-16 w-full flex-1 min-h-0 z-10 pointer-events-none"
          style={{ perspective: "1600px", perspectiveOrigin: "top" }}
        >
          <ProductDashboard />
        </div>
        </motion.div>
      </div>
    </section>
  );
}
