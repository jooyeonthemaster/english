import { getImageProps } from "next/image";
import { useSyncExternalStore } from "react";
import { preload } from "react-dom";
import { Fit, FitLine } from "./ff-fit";
import h from "./ff-hero.module.css";
import { OO } from "./ff-oo";
import { Arrow } from "./ff-text";
import s from "./free-forecast.module.css";

// 「○○고 기출 그대로」가 맨 앞 — 낮은 화면은 눈썹(「우리 학교 기출 그대로」)을 접어서, 띠 첫 프레임이 이 약속을 보여 줘야 한다.
// 8번째였을 때는 1280×585·390×720 첫 화면에 「기출」이 0회였고, 움직임 줄이기면 띠가 멈춰 끝내 안 보였다(3차 R3-27)
const TICKER: React.ReactNode[] = [
  <>
    <OO /> 기출 그대로
  </>,
  "100% 파격 무료",
  "보이스피싱 아님",
  "진짜 무료",
  "!대-박!",
  "파일 딱 3개",
  "이 중에 무조건 적중",
  "24시간 안에 이메일로",
];

export function FfTicker({ reverse = false, tone = "yellow" }: { reverse?: boolean; tone?: "yellow" | "red" }) {
  const row = [...TICKER, ...TICKER];
  return (
    <div className={`${s.ticker} ${tone === "yellow" ? "bg-[var(--ff-yellow)] text-[var(--ff-ink)]" : "bg-[var(--ff-red)] text-white"}`} aria-hidden>
      <div className={`${s.marquee} ${reverse ? s.marqueeReverse : ""}`}>
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0">
            {row.map((t, i) => (
              <span key={`${k}-${i}`} className={`${s.display} ${s.tickerItem}`}>
                {t}
                <span className="ml-[1.1em]">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 부채 그림 받기 — 두 벌(옆 부채 .hFan · 첫 화면 다음 부채 .fanAfter) 중 보이는 쪽만, 보일 때 받는다(보임 규칙은 ff-hero.module.css 와 같은 미디어).
   예전에는 옆 부채가 폰에서 display:none 인데도 우선 받기(priority)라 세 장(약 250KB)이 거대 제목의 글꼴 조각과 대역을 다퉈,
   느린 회선에서 제목이 0.8~1초 늦고 1.5초 대체(82%)를 거쳐 튀었다(3차 R3-17).
   · 숨는 화면에서는 <picture> 의 빈 source 가 골라져 아무것도 받지 않는다.
   · 옆 부채: 보이면 첫 화면이라 바로(eager) 받는다 — 우선순위는 보통(제목 글꼴이 먼저).
   · 다음 부채: 폰(<560)에서는 막대 밑이라 거대 제목 글꼴이 정해진 뒤에 받는다(그 전에는 빈 source).
     560~767(B 제외)에서만 첫 장이 첫 화면 그림(LCP)이라 그 화면에서만 높게 미리 받는다.
   같은 sizes 라 두 벌이 같은 주소를 고르므로 둘 다 받는 경계에서도 한 번만 내려받는다. 빈 그림 동안은 흰 종이(.paper 바탕)가 같은 모양으로 선다 */
const FAN_SIZES = "(max-width: 768px) 45vw, 22vw";
const SIDE_SHOWN = "(min-width: 768px), (min-width: 640px) and (min-aspect-ratio: 8/5)";
// 경계값이 어긋나면 「숨었는데 받는다」 쪽으로만 틀리게(보이는데 빈 그림은 안 된다) — 639.98·767.98·1599/1000
const SIDE_HIDDEN = "(max-width: 639.98px), (max-width: 767.98px) and (max-aspect-ratio: 1599/1000)";
const PHONE = "(max-width: 559.98px)";
const AFTER_LCP = "(min-width: 560px) and (max-width: 767.98px)";
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// 거대 제목 글꼴 대기(page.tsx 인라인 스크립트의 data-ff-font)가 끝났는가 — pending 만 아니면 끝(속성이 없으면 처음부터 있던 것).
// 대기는 길어도 1.5초에 fallback 으로 끝나므로 따로 시한을 두지 않는다. 서버 그림은 「아직」
function subscribeFont(cb: () => void) {
  const g = document.querySelector("[data-ff-font]");
  if (!g) return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(g, { attributes: true, attributeFilter: ["data-ff-font"] });
  return () => mo.disconnect();
}
const fontSettled = () => document.querySelector("[data-ff-font]")?.getAttribute("data-ff-font") !== "pending";

function FanImage({ src, side, first, later }: { src: string; side: boolean; first: boolean; later: boolean }) {
  const { props } = getImageProps({ src, alt: "", width: 1131, height: 1600, sizes: FAN_SIZES, loading: "eager", fetchPriority: side ? undefined : "low" });
  if (!side && first && props.srcSet) preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: props.sizes, fetchPriority: "high", media: AFTER_LCP });
  return (
    <picture>
      <source media={side ? SIDE_HIDDEN : SIDE_SHOWN} srcSet={BLANK} />
      {later && <source media={PHONE} srcSet={BLANK} />}
      <img {...props} alt="" style={{ ...props.style, aspectRatio: "1131 / 1600" }} className="h-auto w-full" />
    </picture>
  );
}

/** 오른쪽 — 실제 자료 세 장을 부채꼴로. 회전해도 화면 밖으로 안 나가게 안쪽 5% 여백 상자 안에서만 배치한다.
 *  도장·별은 위쪽에 둔다(첫 화면에 먼저 보이게). 글자 크기는 부채 폭(cqi)을 따른다. side = 옆 부채(.hFan) */
function PaperFan({ side = false }: { side?: boolean }) {
  const settled = useSyncExternalStore(subscribeFont, fontSettled, () => false);
  const pages = [
    { src: "/free-forecast/workbook-p1.webp", cls: "left-[2%] top-[14%] -rotate-[9deg]" },
    { src: "/free-forecast/set-p3.webp", cls: "left-[27%] top-[6%] rotate-[3deg]" },
    { src: "/free-forecast/set-p1.webp", cls: "left-[50%] top-[16%] rotate-[10deg]" },
  ];
  return (
    <div className={`${h.fanBox} mx-auto w-full max-w-[820px] px-[5%]`}>
      <div className="relative aspect-[10/8.6] w-full">
        {pages.map((p, i) => (
          <div key={p.src} className={`${s.paper} absolute w-[46%] overflow-hidden rounded-[6px] ${p.cls}`} style={{ zIndex: i + 1 }}>
            <FanImage src={p.src} side={side} first={i === 0} later={!side && !settled} />
          </div>
        ))}
        <div className={`${h.stamp} ${h.stampText} absolute left-[0%] top-[0%] z-10 px-[1em] py-[0.6em] text-center`}>
          <div className={`${s.display} text-[1.6em] `}>보이스피싱 아님</div>
          <div className="mt-[0.35em] font-black text-white">진짜 무료 · 결제 정보 안 받음</div>
        </div>
        <div className={`${h.burst} absolute right-[0%] top-[0%] z-10 flex aspect-square w-[34%] items-center justify-center bg-[var(--ff-red)] lg:w-[28%]`}>
          <span className={`${h.burstText} ${s.display} text-center text-white`}>!대-박!</span>
        </div>
      </div>
    </div>
  );
}

/** 제공 묶음 — lg 미만은 숫자 두 칸 + 가운데 「+」, lg 이상은 한 줄 칩 */
function Offer() {
  return (
    <>
      <div className={h.offer}>
        <div className={h.offerCell}>
          <span className={`${s.display} block whitespace-nowrap text-[clamp(22px,min(8vw,26cqi),44px)] `}>10세트</span>
          <span className="mt-[0.35em] block whitespace-nowrap text-[clamp(14px,3.6vw,17px)] font-black">동형 모의고사</span>
        </div>
        <span className={h.offerPlus} aria-label="그리고">
          +
        </span>
        <div className={h.offerCell}>
          <span className={`${s.display} block whitespace-nowrap text-[clamp(22px,min(8vw,26cqi),44px)] `}>600개+</span>
          <span className="mt-[0.35em] block whitespace-nowrap text-[clamp(14px,3.6vw,17px)] font-black">예상 문제</span>
        </div>
      </div>
      <p className={`${s.display} ${h.hChips} hidden flex-wrap items-center gap-x-[0.35em] gap-y-[0.3em] lg:flex`}>
        <span className={s.hl}>동형 모의고사 10세트</span>
        <span aria-label="그리고">+</span>
        <span className={s.hl}>예상 문제 600개+</span>
      </p>
    </>
  );
}

/** 배치(폰 / A / B)는 ff-hero.module.css 머리글 참고 — 같은 DOM 에서 격자 영역만 바꾼다 */
export function FfHero({ onStart }: { onStart: () => void }) {
  return (
    <section className={`relative ${s.halftone}`}>
      <div className={h.first}>
        <FfTicker />
        <div className={`${s.wrap} ${h.heroWrap}`}>
          <div className={h.heroGrid}>
            <div className={h.hMain}>
              <span className={`${s.eyebrow} ${h.hEyebrow} text-[var(--ff-yellow)]`}>
                <span>
                  <span className="hidden md:inline">SMOAT · </span>내신 영어 · 우리 학교 기출 그대로
                </span>
              </span>

              <Fit
                as="h1"
                bp="560"
                className={h.hTitle}
                wide={
                  <>
                    <FitLine k="heroA">
                      100% <span className="text-[var(--ff-yellow)]">파격 무료!!!</span>
                    </FitLine>
                    <FitLine k="heroB" className="mt-[0.12em]">
                      이 중에 <span className={s.markRed}>무조건 적중!!!</span>
                    </FitLine>
                  </>
                }
                narrow={
                  <>
                    <FitLine k="mHero1">100%</FitLine>
                    <FitLine k="mHero2" className="text-[var(--ff-yellow)]">
                      파격 무료!!!
                    </FitLine>
                    <FitLine k="mHero3" className="mt-[0.18em]">
                      이 중에
                    </FitLine>
                    {/* 형광 상자로 시작하는 줄은 글자 베어링 보정을 하지 않는다 — 상자째 정렬선 밖으로 나간다(학교 제목과 같은 규칙) */}
                    <FitLine k="mHero3" lsb={0}>
                      <span className={s.markRed}>무조건 적중!!!</span>
                    </FitLine>
                  </>
                }
              />

              <div className={h.hLower}>
                <p className={`${s.display} ${h.hSub} ${s.lh105}`}>
                  파일 <span className="text-[var(--ff-yellow)]">딱 3개</span>만 <br className={h.hSubBr} />
                  올리세요!
                </p>
                <div className={h.hOffer}>
                  <Offer />
                </div>
                <div className={h.hAct}>
                  {/* 폰·낮은 가로 화면은 히어로 버튼을 숨긴다 — 하단 막대(①②③·받기)가 같은 일을 한다(보임은 모듈 .hCtaWrap) */}
                  <div className={h.hCtaWrap}>
                    <button type="button" onClick={onStart} className={`${s.btn} ${s.display} ${h.hCtaText} bg-[var(--ff-yellow)] px-[1.1em] py-[0.62em] text-[var(--ff-ink)]`}>
                      지금 파일 3개 올리기 <Arrow dir="down" className={s.blink} />
                    </button>
                  </div>
                  <div className={h.hNote}>
                    <p className={`${s.tLead} ${s.balance} font-black`}>
                      <span className="text-[var(--ff-yellow)]">24시간 안에</span> 이메일로 보내드립니다.
                    </p>
                    <div className="mt-[6px] hidden sm:block">
                      <Reassure className={h.hReassure} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* 부채 두 벌의 보임은 모듈이 정한다(md 이상·B 짜임 = 옆 부채, 그 밖 = 첫 화면 다음 부채) — Tailwind hidden 을 섞지 않는다(함정 1) */}
            <div className={h.hFan}>
              <PaperFan side />
            </div>
          </div>
        </div>
      </div>
      {/* 옆 부채가 없는 화면 — 부채는 첫 화면 다음에(폰은 막대 밑에서 시작) */}
      <div className={`${s.wrap} ${h.fanAfter}`}>
        <PaperFan />
        <div className="mt-[16px] sm:hidden">
          <Reassure />
        </div>
      </div>
    </section>
  );
}

function Reassure({ className = "" }: { className?: string }) {
  return (
    <p className={`${s.tSmall} font-bold text-[var(--ff-dim)] ${className}`}>
      <span className="whitespace-nowrap">카드번호 안 물어봅니다 ·</span> <span className="whitespace-nowrap">결제 없음</span>
      <br className="hidden xl:block" />
      <span className="whitespace-nowrap xl:hidden"> ·</span> <span className="whitespace-nowrap">이메일 하나면 끝</span>
    </p>
  );
}
