"use client";

// 랜딩 Step6 데모 — 실제 지문(The Gift of the Magi)으로 SMOAT가 생성한 지문 웹툰
// 결과물을 그대로 보여준다. 확대/축소로 컷·말풍선·해석 캡션을 살펴보고,
// '이미지 저장'으로 파일을 그대로 내려받는다.
import { Download, Sparkles } from "lucide-react";
import { DemoShell } from "../demo-shell";
import { DemoZoomControls } from "../demo-zoom-controls";
import { useDemoZoom } from "../use-demo-zoom";

const WEBTOON_SRC = "/landing/demo/webtoon/gift-of-the-magi.webp";
// 스트립 기준 폭 — 아래 w-[720px] 래퍼와 동일해야 폭 맞춤이 정확하다.
const STRIP_BASE_WIDTH = 720;

export default function Step6WebtoonDemo() {
  // 기본 = 폭 맞춤(스트립 전체 보임). 컨트롤로 컷·캡션 확대 가능.
  const zoomCtl = useDemoZoom(STRIP_BASE_WIDTH);

  return (
    <DemoShell
      label="실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요"
      onReset={zoomCtl.reset}
    >
      <div className="relative min-h-0">
        <DemoZoomControls ctl={zoomCtl} />
        <div
          ref={zoomCtl.scrollerRef}
          className="min-h-0 overflow-auto bg-slate-100/70 px-3 py-4"
          style={{ height: "var(--demo-h, max(400px, calc(100svh - 270px)))" }}
        >
          <div className="mx-auto w-fit" style={{ zoom: zoomCtl.zoom }}>
            <div className="w-[720px] max-w-none rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.3)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-black text-slate-950">
                  The Gift of the Magi — 지문 웹툰
                </span>
                <a
                  href={WEBTOON_SRC}
                  download="smoat-webtoon-gift-of-the-magi.webp"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-blue-700"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  이미지 저장
                </a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WEBTOON_SRC}
                alt="The Gift of the Magi 지문으로 SMOAT가 생성한 웹툰 — 컷마다 원문 말풍선과 한국어 해석 캡션"
                className="w-full rounded-lg border-2 border-slate-900/80"
                draggable={false}
              />
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400">
                <Sparkles className="size-3.5 text-blue-500" aria-hidden="true" />
                실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동
              </p>
            </div>
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
