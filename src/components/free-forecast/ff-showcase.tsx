import { Fit, FitLine } from "./ff-fit";
import { FfGallery, type FfPage } from "./ff-gallery";
import { NB } from "./ff-ko";
import { OO } from "./ff-oo";
import { ko, koNode } from "./ff-text";
import s from "./free-forecast.module.css";

// 받는 것 — 동형 모의고사 10세트 · 예상 문제 600개+ · 출제 예측 근거, 그리고 실물(누르면 크게).
// 설명은 렌더할 때 koNode 를 거친다 — 「·발문」으로 시작하는 줄, 「낼⏎만한」「이⏎지문」 같은 줄바꿈을 막는다.
// 구절 묶음은 NB(줄바꿈 없는 공백 — ff-ko)로: koNode 는 문자열 조각 경계(「○○고」 고리 뒤)를 못 본다.

const GIVES: { big: string; unit: string; word?: boolean; title: string; desc: React.ReactNode }[] = [
  {
    big: "10",
    unit: "세트",
    title: "동형 모의고사",
    desc: (
      <>
        <OO variant="text" /> 기출과 번호·유형·배점·발문·쪽수까지 같은 시험지를 봉투째. <span className="whitespace-nowrap">정답·해설 포함.</span>
      </>
    ),
  },
  {
    big: "600",
    unit: "개+",
    title: "예상 문제",
    desc: (
      <>
        {/* 「○○고⏎출제 선생님이」 금지 — 고리 뒤 공백도 NB */}
        이번 범위 지문 하나하나, <OO variant="text" />
        {NB}출제{NB}선생님이 낼 만한 유형으로 전부. 10세트{NB}300문항도 이 안에서 골라 짭니다.
        <span className="mt-[8px] block font-black text-[var(--ff-ink)]">
          사례: <span className="whitespace-nowrap">범위 63지문 → 643문항</span>
        </span>
      </>
    ),
  },
  {
    big: "근거",
    unit: "까지",
    word: true,
    title: "출제 예측 해설",
    desc: (
      <>
        왜 이 지문이 이 유형으로 나올지, 기출{NB}어느 번호를 보고 예측했는지 적어드립니다.
      </>
    ),
  },
];

// 실제 제작 사례(학교명 가림) — public/free-forecast/*.webp. 2·3열로 나눠 떨어지게 6장.
// 캡션은 페이지가 부르는 이름(동형·예상 문제집)에 실물 표지 이름(봉투 모의고사·예측 문항 문제집)을 괄호로 잇는다(3차 R3-36).
// 「1회 1쪽」은 한 덩어리(320 에서 「1회⏎1쪽」 금지)
const PAGES: FfPage[] = [
  { src: "/free-forecast/set-p1.webp", cap: `동형(봉투) 1회${NB}1쪽`, sub: "머리글·안내 상자 그대로" },
  { src: "/free-forecast/set-p3.webp", cap: "어법 조합", sub: "10번 (a)~(f) 그대로" },
  { src: "/free-forecast/set-p5.webp", cap: "빈칸 (A)(B)", sub: "4점대 구간 그대로" },
  { src: "/free-forecast/set-p9.webp", cap: "논술형", sub: "〔해석〕·〔요약문〕·〔보기〕" },
  { src: "/free-forecast/answers-p1.webp", cap: "정답·해설", sub: "출제 예측 근거까지" },
  { src: "/free-forecast/workbook-p1.webp", cap: "예상 문제집(예측 문항)", sub: "643문항 · 196쪽" },
];

export function FfShowcase() {
  return (
    <section className={`${s.section} ${s.onYellow} border-t-[length:var(--bw)] border-black bg-[var(--ff-yellow)] text-[var(--ff-ink)]`}>
      <div className={s.wrap}>
        <span className={s.eyebrow}>이게 공짜라고???</span>
        <Fit
          as="h2"
          bp="560"
          className="mt-[clamp(16px,2vw,36px)]"
          wide={
            <>
              <FitLine k="show1">
                <span className="text-[var(--ff-red-ink)]">소름 끼치게</span> 똑같고,
              </FitLine>
              <FitLine k="show2" className="mt-[0.1em]">
                미치게 <span className="rounded-[0.12em] bg-[var(--ff-ink)] px-[0.18em] text-[var(--ff-yellow)]">아름답다.</span>
              </FitLine>
            </>
          }
          narrow={
            <>
              <FitLine k="mShow" className="text-[var(--ff-red-ink)]">
                소름 끼치게
              </FitLine>
              <FitLine k="mShow">똑같고,</FitLine>
              <FitLine k="mShow" className="mt-[0.12em]">
                미치게
              </FitLine>
              <FitLine k="mShow" lsb={0}>
                <span className="rounded-[0.12em] bg-[var(--ff-ink)] px-[0.18em] text-[var(--ff-yellow)]">아름답다.</span>
              </FitLine>
            </>
          }
        />

        <ul className="mt-[clamp(32px,4vw,80px)] grid gap-[var(--gap)] md:grid-cols-3">
          {GIVES.map((g) => (
            <li key={g.title} className={`${s.card} flex flex-col bg-white p-[clamp(20px,2.2vw,44px)]`}>
              {/* 줄 상자 높이를 숫자 줄(0.98em)로 고정 — 「근거」(0.86em)만 상자가 낮아 제목·본문 시작선이 위로 떴다 */}
              <span className={`${s.display} flex h-[0.98em] items-end whitespace-nowrap text-[clamp(64px,6.4vw,160px)] text-[var(--ff-red-ink)]`}>
                <span className={g.word ? "text-[0.86em]" : ""}>{g.big}</span>
                <span className="mb-[0.06em] ml-[0.08em] text-[0.42em] text-[var(--ff-ink)]">{g.unit}</span>
              </span>
              <span className={`${s.display} ${s.tH3} mt-[0.35em]`}>{g.title}</span>
              <span className={`${s.tBody} mt-[12px] font-semibold text-[var(--ff-dim-ink)]`}>{koNode(g.desc)}</span>
            </li>
          ))}
        </ul>

        {/* 기준선 맞춤 — 아래끝(items-end)이면 큰 제목 줄 상자 아래 여백만큼 작은 글이 4~5px 가라앉았다(3차 R3-33) */}
        <div className="mt-[clamp(48px,6vw,120px)] flex flex-wrap items-baseline justify-between gap-[12px]">
          <h3 className={`${s.display} ${s.tH3}`}>실물은 이렇게 생겼습니다</h3>
          <p className={`${s.tSmall} font-bold text-[var(--ff-dim-ink)]`}>{ko("실제 제작 사례 · 학교 이름만 가렸습니다")}</p>
        </div>
        <FfGallery pages={PAGES} />
      </div>
    </section>
  );
}
