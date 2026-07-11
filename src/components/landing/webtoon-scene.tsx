"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { Item, Reveal, Stagger } from "./shared/reveal";
import { DemoGate } from "./demo/demo-gate";

const WEBTOON_SRC = "/landing/demo/webtoon/gift-of-the-magi.webp";

// 실제 생성 웹툰 뷰어 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드.
// 모바일은 아래 WebtoonMock(같은 이미지의 정적 카드)이 그대로 유지된다.
const Step6WebtoonDemo = dynamic(
  () => import("./demo/step6-webtoon/step6-webtoon-demo"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-2xl border border-blue-100 bg-slate-50"
        style={{ height: "max(400px, calc(100svh - 270px))" }}
      />
    ),
  },
);

export function WebtoonScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      id="webtoon"
      className="relative w-full border-t border-blue-50 bg-white py-7 sm:py-10 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10"
    >
      {/* PC(≥lg): 카피(좌) | 웹툰(우) — 다른 스텝과 동일한 5:7 배치. */}
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-center gap-5 px-5 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8 lg:px-16">
        {/* Copy */}
        <div className="max-w-[600px]">
          <Reveal className="mb-2 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] sm:mb-4 sm:text-[13px] sm:tracking-[0.25em] justify-center lg:justify-start" y={16}>
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
            Feature · 지문 기반 웹툰
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8 lg:hidden" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="text-[25px] font-extrabold leading-[1.18] text-gray-900 sm:text-[30px] sm:leading-[1.25] lg:text-[34px] lg:leading-[1.3]"
              style={{ wordBreak: "keep-all" }}
            >
              읽기 싫어하는 학생에게는,
              <br />
              지문을{" "}
              <span className="text-[#3B82F6] underline decoration-[#3B82F6] decoration-[3px] underline-offset-[3px] sm:decoration-4 sm:underline-offset-[5px] lg:underline-offset-[7px]">웹툰으로</span>{" "}
              만들어 주세요.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:mt-4 sm:text-[15px] sm:leading-[1.7]">
              같은 지문이 컷과 말풍선으로!
              <br />
              <strong className="text-gray-900 font-bold">스토리로 먼저 이해</strong>하고 원문으로 돌아옵니다.
            </p>
          </Reveal>

          <Stagger className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:flex sm:flex-col sm:gap-4 sm:border-l-[3px] sm:border-[#BFDBFE] sm:pl-6" delay={0.25}>
            {[
              { k: "지문 → 컷 분할 자동", v: "장면·대사를 AI가 구성" },
              { k: "말풍선 텍스트 편집", v: "대사·해석을 강사가 직접 다듬기" },
              { k: "수업 자료로 바로 활용", v: "이미지로 저장해 프린트·배포" },
            ].map((row) => (
              <Item key={row.k} className="flex min-h-[52px] flex-col justify-center rounded-xl border border-blue-100 bg-blue-50/45 px-2.5 py-2 sm:min-h-0 sm:justify-start sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0" y={18}>
                <div className="text-center text-[11.5px] font-extrabold leading-tight text-gray-900 sm:text-left sm:text-[15px] sm:tracking-wide">{row.k}</div>
                <div className="hidden text-[13.5px] font-medium leading-[1.6] text-gray-600 sm:block">{row.v}</div>
              </Item>
            ))}
          </Stagger>
        </div>

        {/* PC: 말풍선 편집 라이브 데모 / 모바일·로드 전: 4컷 목업 */}
        <DemoGate
          minWidth="lg"
          fallback={<WebtoonMock />}
          className="min-w-0"
          mobileDemo={<Step6WebtoonDemo />}
        >
          <Step6WebtoonDemo />
        </DemoGate>
      </div>
    </section>
  );
}

/** 실제 생성 웹툰 카드 — 모바일(<lg)과 데모 로드 전 폴백으로 유지. */
function WebtoonMock() {
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setViewerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewerOpen]);

  return (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-w-0"
        >
          <div className="absolute -inset-6 rounded-full bg-blue-300/15 blur-[56px] sm:-inset-10 sm:blur-[80px]" />
          <div className="relative z-10 mx-auto w-full max-w-[640px] rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.3)] sm:p-4">
            <div className="mb-2 flex items-center justify-between sm:mb-3">
              <span className="min-w-0 truncate text-[11.5px] font-black text-slate-950 sm:text-[12px]">
                The Gift of the Magi — 지문 웹툰
              </span>
              <span className="ml-2 shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[9.5px] font-black text-blue-700 ring-1 ring-blue-200 sm:px-2.5 sm:py-1 sm:text-[10px]">
                지문 기반 생성
              </span>
            </div>
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="group relative block h-[220px] w-full overflow-hidden rounded-lg border-2 border-slate-900/80 text-left outline-none ring-blue-500 transition focus-visible:ring-2 sm:h-auto sm:overflow-visible"
              aria-label="웹툰 전체 보기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WEBTOON_SRC}
                alt="The Gift of the Magi 지문으로 SMOAT가 생성한 웹툰 — 컷마다 원문 말풍선과 한국어 해석 캡션"
                className="h-full w-full object-cover object-top sm:h-auto sm:object-contain"
                loading="lazy"
                draggable={false}
              />
              {/* 하단 스크림 — 전체 보기 배지가 마지막 컷 말풍선과 뒤섞여 보이지
                  않도록 배지 아래 영역을 어둡게 눌러준다("더 보기" 어포던스). */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-[6px] bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent"
              />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-[11px] font-black text-white shadow-lg backdrop-blur transition group-active:scale-95">
                <Maximize2 className="size-3.5" />
                전체 보기
              </span>
            </button>
          </div>
          {viewerOpen ? (
            <div
              className="fixed inset-0 z-[100] bg-slate-950/90 p-3"
              role="dialog"
              aria-modal="true"
              aria-label="웹툰 전체 보기"
              onClick={() => setViewerOpen(false)}
            >
              <div className="mx-auto flex h-full max-w-[760px] flex-col" onClick={(event) => event.stopPropagation()}>
                <div className="flex h-12 shrink-0 items-center justify-between gap-3 text-white">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-black">
                      The Gift of the Magi — 지문 웹툰
                    </div>
                    <div className="text-[11px] font-semibold text-white/55">
                      위아래로 스크롤해서 전체 컷을 확인하세요
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewerOpen(false)}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                    aria-label="닫기"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={WEBTOON_SRC}
                    alt="The Gift of the Magi 지문으로 SMOAT가 생성한 전체 웹툰"
                    className="mx-auto h-auto w-full rounded-xl"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
  );
}
