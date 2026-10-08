import { Fit, FitLine } from "./ff-fit";
import { NB } from "./ff-ko";
import { OO } from "./ff-oo";
import { Arrow, Dash, displayDots, keepMarks, keepMarksDisplay, ko, koNode } from "./ff-text";
import { FF_HABITS, FF_PROOF, FF_QUIRKS, FF_SAMPLE_EXAM, FF_STEM_PAIRS, type FfSource } from "./ff-school-data";
import s from "./free-forecast.module.css";
import sc from "./ff-school.module.css";

// 「○○고 기출 그대로」 — 학교마다 시험이 다르다는 것, 그래서 그 학교 기출을 번호 하나까지 해부해 복제한다는 것을
// 실제 사례 숫자로 보여 준다(① 번호별 해부 ② 선생님 습관 ③ 그 틀 그대로 + 발문 대조 + 기계 대조).
// 본문 글은 모두 ko/koNode(ff-text)를 거친다 — 「이⏎선생님」「안⏎되는」 같은 줄바꿈을 막는다(보이는 글자는 그대로).

const SRC_STYLE: Record<FfSource, string> = {
  교과서: "bg-[var(--ff-yellow)] text-[var(--ff-ink)]",
  부교재: "bg-white text-[var(--ff-ink)]",
  모의고사: "bg-[var(--ff-red-ink)] text-white",
};

/** 단계 머리 — 배지는 제목 줄 위에 맞춘다(아래 맞춤이면 설명이 두 줄인 ③만 배지가 내려간다) */
function StepHead({ no, title, desc }: { no: string; title: string; desc: React.ReactNode }) {
  return (
    <div className="grid gap-x-[var(--gap)] gap-y-[12px] md:grid-cols-[auto_1fr] md:items-start">
      <div className={`${s.display} flex h-[1.5em] w-[1.5em] items-center justify-center rounded-[0.22em] bg-[var(--ff-ink)] text-[clamp(44px,4.4vw,104px)] text-[var(--ff-yellow)]`}>{no}</div>
      <div>
        <h3 className={`${s.display} ${s.tH3}`}>{ko(title)}</h3>
        <p className={`${s.tBody} mt-2 max-w-[44em] font-semibold text-[var(--ff-dim-ink)]`}>{koNode(desc)}</p>
      </div>
    </div>
  );
}

/** 공통 앞부분·뒷부분을 뺀 가운데만 「다른 글자」로 칠한다(두 발문은 숫자 하나만 다르거나 같다).
 *  비교 전에 두 문자열 모두 ko 를 씌운다 — 같은 자리에서 같게 바뀌니 칠하는 자리는 그대로이고, 「〔보기〕⏎의」「빈⏎칸」「한⏎번씩만」이 사라진다 */
function StemDiff({ text, other }: { text: string; other: string }) {
  const t = ko(text);
  const o = ko(other);
  let a = 0;
  while (a < t.length && a < o.length && t[a] === o[a]) a++;
  let b = 0;
  while (b < t.length - a && b < o.length - a && t[t.length - 1 - b] === o[o.length - 1 - b]) b++;
  // 다른 글자가 숫자 한가운데면 숫자 전체를 칠한다(「1[7]단어」 → 「[17]단어」)
  if (a < t.length - b) {
    while (a > 0 && /\d/.test(t[a - 1])) a--;
    while (b > 0 && /\d/.test(t[t.length - b])) b--;
  }
  const mid = t.slice(a, t.length - b);
  return (
    <>
      <span className={sc.same}>{t.slice(0, a)}</span>
      {mid ? <span className={sc.diff}>{mid}</span> : null}
      <span className={sc.same}>{t.slice(t.length - b)}</span>
    </>
  );
}

export function FfSchool() {
  const counts = FF_SAMPLE_EXAM.reduce<Record<FfSource, number>>((a, t) => ({ ...a, [t.src]: a[t.src] + 1 }), { 교과서: 0, 부교재: 0, 모의고사: 0 });
  return (
    <section className={`${s.section} ${s.halftoneInk} border-t-[length:var(--bw)] border-black bg-[var(--ff-cream)] text-[var(--ff-ink)]`}>
      <div className={s.wrap}>
        <span className={`${s.eyebrow} text-[var(--ff-red-ink)]`}>학교마다 시험은 다릅니다</span>
        {/* bp 560: 560~767 에서 네 줄 판(102~148px)이 히어로 H1(두 줄 64~73px)보다 커서 위계가 뒤집혔다 — 두 줄 판을 560 부터 */}
        <Fit
          as="h2"
          bp="560"
          className="mt-[clamp(16px,2vw,36px)]"
          wide={
            <>
              <FitLine k="school1">전국 공통 문제 말고,</FitLine>
              <FitLine k="school2" className="mt-[0.1em]">
                <span className={s.markYellow}>
                  <OO /> 기출
                </span>{" "}
                <span className="text-[var(--ff-red)]">그대로.</span>
              </FitLine>
            </>
          }
          narrow={
            <>
              <FitLine k="mSchool1">전국 공통</FitLine>
              <FitLine k="mSchool1">문제 말고,</FitLine>
              <FitLine k="mSchool2" className="mt-[0.12em]">
                <span className={s.markYellow}>
                  <OO /> 기출
                </span>
              </FitLine>
              <FitLine k="mSchool2" lsb={0.055} className="text-[var(--ff-red)]">
                그대로.
              </FitLine>
            </>
          }
        />
        {/* 굵은 빨강 「지난 기출」은 한 덩어리(NB) — 320·640·700 에서 「지난⏎기출부터」로 갈렸다(3차 R3-12 ②) */}
        <p className={`${s.tLead} mt-[clamp(20px,2.4vw,44px)] max-w-[38em] font-bold`}>
          {koNode(
            <>
              같은 지문도 학교마다, 선생님마다 내는 방식이 다릅니다. 그래서{" "}
              <b className="text-[var(--ff-red-ink)]">
                <OO variant="text" />의 지난{NB}기출
              </b>
              부터 <span className="whitespace-nowrap">번호 하나,</span> <span className="whitespace-nowrap">배점 하나,</span>{" "}
              <span className="whitespace-nowrap">발문 글자 하나까지</span> 해부합니다. 아래는 실제 제작 사례입니다.
            </>,
          )}
        </p>

        {/* ① 번호별 해부 */}
        <div className="mt-[clamp(48px,6vw,120px)]">
          <StepHead no="1" title="번호별 해부" desc="몇 번에 무슨 유형이, 몇 점으로, 어느 범위 자료에서 나왔는지 30문항 전부." />
          <div className={`${s.card} ${s.cardInk} mt-[clamp(20px,2.4vw,40px)] bg-[var(--ff-ink)] p-[clamp(14px,1.8vw,36px)] text-white`}>
            <div className="flex flex-wrap items-center justify-between gap-[12px]">
              <p className={`${s.display} ${s.tH4}`}>
                사례
                <span className={s.sep}>·</span>
                <OO /> 2학년 <span className="whitespace-nowrap text-[var(--ff-yellow)]">1학기 1차 기출</span>
              </p>
              <ul className={`${s.tSmall} flex flex-wrap gap-[8px] font-black`}>
                {(Object.keys(counts) as FfSource[]).map((k) => (
                  <li key={k} className={`rounded-full px-[12px] py-[4px] ${SRC_STYLE[k]}`}>
                    {k} {counts[k]}
                  </li>
                ))}
              </ul>
            </div>
            <ol className="mt-[clamp(14px,1.6vw,28px)] grid grid-cols-3 gap-[clamp(6px,0.6vw,12px)] min-[560px]:grid-cols-5 md:grid-cols-6 xl:grid-cols-10">
              {FF_SAMPLE_EXAM.map((t) => (
                <li key={t.n} className={`${sc.tile} min-h-[clamp(92px,7.4vw,160px)] rounded-[clamp(8px,0.7vw,14px)] p-[clamp(8px,0.7vw,14px)] ${SRC_STYLE[t.src]}`}>
                  <span className={`${s.display} text-[clamp(20px,1.7vw,44px)]`}>{t.n}</span>
                  <span className={`${sc.tileType} mt-[8px] text-[clamp(13px,0.5vw+10px,21px)] font-black leading-snug`}>{keepMarks(t.type)}</span>
                  <span className="mt-auto pt-[4px] text-[clamp(13px,0.4vw+10px,19px)] font-bold">{t.pts}점</span>
                </li>
              ))}
            </ol>
          </div>
          <ul className={`${sc.quirks} mt-[clamp(16px,2vw,32px)]`}>
            {FF_QUIRKS.map((q) => (
              <li key={q.tag} className={`${s.card} ${sc.quirkCard} bg-white p-[clamp(16px,1.6vw,30px)]`}>
                <span className={`${s.display} ${sc.tag} justify-self-start bg-[var(--ff-red-ink)] text-white`}>{displayDots(q.tag)}</span>
                <p className={`${s.display} ${s.tH4} ${s.balance} mt-[12px]`}>{displayDots(ko(q.title))}</p>
                <p className={`${s.tSmall} mt-[8px] font-semibold text-[var(--ff-dim-ink)]`}>{keepMarks(q.body)}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* ② 선생님 습관 */}
        <div className="mt-[clamp(56px,7vw,140px)]">
          <StepHead no="2" title="선생님 습관 해부" desc="범위 자료에 원래 붙어 있던 문제 유형을 이 선생님은 어떻게 바꿔서 냈는지." />
          <div className="mt-[clamp(20px,2.4vw,40px)] grid gap-[var(--gap)] lg:grid-cols-12">
            <div className={`${s.card} flex flex-col justify-center bg-[var(--ff-red-ink)] p-[clamp(20px,2.4vw,48px)] text-white lg:col-span-4`}>
              <p className={`${s.tBody} font-black`}>원래 유형 그대로 낸 문제</p>
              <p className={`${s.tSmall} font-bold`}>{ko("부교재·모의고사 25문항 중")}</p>
              <p className={`${s.display} mt-[8px] whitespace-nowrap text-[clamp(72px,8vw,190px)]`}>
                0<span className="text-[0.45em]"> / 25</span>
              </p>
              {/* 위 작은 줄이 「부교재·모의고사 25문항 중」이니 같은 구를 되풀이하지 않는다. 「바꿔 냈습니다」는 한 덩어리(320 에서 「바꿔 / 냈습니다」).
                「변형 문제로는」은 페이지의 「예상 문제」와 같이 띄우되 한 덩어리로 둔다(띄우기 전의 줄바꿈 그대로 — 3차 R3-36 ②) */}
              <p className={`${s.tSmall} mt-[12px] font-bold`}>{ko("하나도 빠짐없이 다른 유형으로 바꿔\u00a0냈습니다. 원래 유형 그대로 만든 변형\u00a0문제로는 대비가 안 되는 이유입니다.")}</p>
            </div>
            <div className="lg:col-span-8">
              <div className={`${sc.habitHead} ${s.tSmall} px-[clamp(14px,1.4vw,26px)] pb-[8px] font-black text-[var(--ff-dim-ink)]`}>
                <span className={sc.habitFrom}>범위 자료에 붙어 있던 문제</span>
                <span aria-hidden className="w-[1.2em]" />
                <span>
                  <OO variant="text" /> 실제 기출
                </span>
              </div>
              <ul className="grid gap-[var(--gap)]">
                {FF_HABITS.map((h) => (
                  <li key={h.to} className={`${s.card} ${sc.habitRow} bg-white p-[clamp(14px,1.4vw,26px)]`}>
                    <span className={`${sc.habitFrom} ${s.tH4} font-bold text-[var(--ff-dim-ink)] line-through decoration-[var(--ff-red)]/70 decoration-2`}>{ko(h.from)}</span>
                    {/* →(640 이상)·↓(모바일)는 한 번에 하나만 보인다 — 화면 낭독기도 보이는 쪽 하나만 「바꿔서」로 읽는다 */}
                    <span role="img" aria-label="바꿔서" className={`${sc.arrowRight} text-[clamp(26px,2.2vw,48px)] text-[var(--ff-red)]`}>
                      <Arrow />
                    </span>
                    <span className={`${sc.habitTo} ${s.display} ${s.tH4}`}>
                      <span role="img" aria-label="바꿔서" className={`${sc.arrowDown} text-[var(--ff-red)]`}>
                        <Arrow dir="down" />
                      </span>
                      <span>{keepMarksDisplay(h.to)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ③ 그 틀 그대로 — 제목은 「그 틀 그대로, / 이번 범위로 10세트」로만 나뉘게 「이번 범위로」를 묶는다(320 에서 「이번 / 범위로」) */}
        <div className="mt-[clamp(56px,7vw,140px)]">
          <StepHead
            no="3"
            title={"그 틀 그대로, 이번\u00a0범위로 10세트"}
            desc="1학기 1차 기출의 틀 그대로, 2학기 1차 범위 지문으로 10세트. 그리고 기출과 번호별로, 기계로 대조합니다."
          />

          {/* 발문 대조 범례 — 견본 글자는 카드와 같은 sc.same(형광)·sc.diff(빨강)(3차 R3-21 ③). 두 항목은 inline-block 이라 평소에는 항목째로 넘어가고
              (320 「… 같은 글자 · ⏎ 빨강 = 다른 글자」), 글자를 키워 항목이 줄보다 넓어지면 그 안에서 접힌다(nowrap 과 달리 가로로 넘치지 않는다) */}
          <p className={`${s.tSmall} mt-[clamp(20px,2.4vw,40px)] font-bold text-[var(--ff-dim-ink)]`}>
            {koNode(
              <>
                <span className="inline-block">
                  <span className={sc.same}>형광</span>
                  {NB}={NB}
                  <OO variant="text" /> 기출과 같은 글자
                </span>
                {" · "}
                <span className="inline-block">
                  <span className={sc.diff}>빨강</span>
                  {NB}={NB}다른 글자
                </span>
              </>,
            )}
          </p>
          {/* 발문 대조 — 두 열은 1536(2xl)부터(긴 논술 카드가 넓게), 그 아래는 전폭으로 쌓는다. 칩 줄은 카드 바닥에 붙여 두 카드의 바닥선을 맞춘다.
              두 카드 높이가 같으려면 논술 발문 두 줄·17번 칩 한 줄·17번 발문 두 줄이 함께 서야 하는데(r3 실측 문턱),
              1280~1431 은 그 합이 두 카드 폭보다 커서 어떤 비율로도 같아지지 않고(칩 두 줄·빈 면 23~68px) 1440 도 여유가 ±3.5px 뿐이었다.
              1536 이상은 71.7:28.3 에서 빈 면 0(여유 1536 7px · 2544 이상 12px). */}
          <div className="mt-[clamp(8px,0.8vw,16px)] grid gap-[var(--gap)] 2xl:grid-cols-[minmax(0,71.7fr)_minmax(0,28.3fr)]">
            {FF_STEM_PAIRS.map((p) => (
              <div key={p.no} className={`${s.card} flex flex-col bg-white p-[clamp(16px,1.8vw,34px)]`}>
                <p className={`${s.display} ${s.tH4}`}>
                  {p.no} 발문
                  <Dash />
                  <span className="text-[var(--ff-red)]">글자까지</span>
                </p>
                <dl className="mt-[clamp(12px,1.2vw,22px)] grid gap-[clamp(10px,1vw,18px)]">
                  <div>
                    <dt className={`${s.tSmall} font-black text-[var(--ff-dim-ink)]`}>
                      <OO variant="text" /> 실제 기출
                    </dt>
                    <dd className={`${s.tBody} ${sc.stem} mt-[4px] font-semibold`}>
                      <StemDiff text={p.ref} other={p.ours} />
                    </dd>
                  </div>
                  <div>
                    <dt className={`${s.tSmall} font-black text-[var(--ff-dim-ink)]`}>동형 모의고사 1회</dt>
                    <dd className={`${s.tBody} ${sc.stem} mt-[4px] font-semibold`}>
                      <StemDiff text={p.ours} other={p.ref} />
                    </dd>
                  </div>
                </dl>
                <ul className="mt-auto flex flex-wrap gap-[8px] pt-[clamp(12px,1.2vw,22px)]">
                  {p.chips.map((c) => (
                    <li key={c} className={`${s.tSmall} rounded-full bg-[var(--ff-ink)] px-[12px] py-[4px] font-black text-[var(--ff-yellow)]`}>
                      {ko(c)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* 기계 대조 */}
          <div className={`${s.card} ${s.cardInk} mt-[var(--gap)] bg-[var(--ff-ink)] p-[clamp(18px,2.2vw,44px)] text-white`}>
            <p className={`${s.tBody} font-bold text-[var(--ff-dim)]`}>
              {koNode(
                <>
                  사례 — 동형 모의고사 <b className="text-white">10세트 × 30문항</b>을 <OO variant="text" /> 실제 기출과 번호별로 대조:{" "}
                  <b className="whitespace-nowrap text-[var(--ff-yellow)]">6개 항목 모두 일치</b>
                </>,
              )}
            </p>
            <ul className="mt-[clamp(14px,1.6vw,28px)] grid grid-cols-2 gap-[clamp(8px,0.8vw,16px)] md:grid-cols-3 xl:grid-cols-6">
              {FF_PROOF.map((p) => (
                <li key={p.label} className={`${sc.proofCell} rounded-[clamp(12px,1vw,20px)] border-[length:var(--bw)] border-[var(--ff-yellow)] p-[clamp(12px,1.2vw,24px)] text-center`}>
                  <span className={`${s.display} ${sc.proofNum} block text-[var(--ff-yellow)]`}>
                    {p.num}
                    <span className="text-[0.5em]">/{p.den}</span>
                  </span>
                  <span className={`${sc.proofLabel} ${s.balance} mt-[8px] block font-black`}>{ko(p.label)}</span>
                  {p.sub ? <span className={`${s.tSmall} block font-bold text-[var(--ff-dim)]`}>{ko(p.sub)}</span> : null}
                </li>
              ))}
            </ul>
            {/* 6칸 밖의 한 항목 — 번들 fidelity.summary stemExact 257/300. perSlot 실측: 나머지 43 = 9·10·12번(기출 발문 표기를 맞춤) 각 10세트 30
                + 논술 단어 수(논술 1·2 각 5세트, 논술 3 3세트) 13. 9·12번 표기는 스캔 판독이라 실제 시험지의 잘못으로 단정하지 않고 「표기를 맞춘」 것으로만 적는다(3차 R3-21 ②) */}
            <p className={`${s.tSmall} ${s.balance} mt-[clamp(12px,1.2vw,22px)] max-w-[64em] font-bold text-[var(--ff-dim)]`}>
              {koNode(
                <>
                  발문 글자까지 그대로는 <b className="text-white">257/300</b> — 나머지 43곳은 지문마다 바뀌는 논술 단어 수와, 기출 발문 표기{NB}3곳(9·10·12번)을 맞춘 자리입니다.
                </>,
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
