import { forwardRef, useEffect, useRef } from "react";
import { Fit, FitLine } from "./ff-fit";
import { NB } from "./ff-ko";
import { OO } from "./ff-oo";
import { koNode } from "./ff-text";
import s from "./free-forecast.module.css";

// 눈물 카드 3장 · 자주 묻는 것 · 접수 완료. 본문 글은 모두 koNode(줄바꿈 금칙)를 거쳐 찍는다.
// 구절 묶음은 NB(줄바꿈 없는 공백 — ff-ko). 소스에 날 글자로 넣지 않는다.

/** t 제목 · d 본문 · plain: 본문 줄 길이 맞춤(pretty)을 끈다 — nowrap 덩어리가 둘인 짧은 본문은 pretty 가 덩어리를 통째로 내려 가운데 줄이 반 폭이 됐다 */
const TEARS: { t: React.ReactNode; d: React.ReactNode; plain?: boolean }[] = [
  {
    // 두 줄이 되면 「○○고 / 기출이랑 똑같아서」 — 「똑같아서」 한 낱말이 끝줄에 홀로 남지 않게 뒤 두 낱말을 묶는다
    t: (
      <>
        <OO /> <span className="whitespace-nowrap">기출이랑 똑같아서</span>
      </>
    ),
    d: (
      <>
        번호·유형·배점·발문·쪽수까지. 시험지를 펼치는 순간 <span className="whitespace-nowrap">소름 돋습니다.</span>
      </>
    ),
  },
  {
    t: "예상 문제 600개+라서",
    // 「수업 자료 걱정 끝.」은 한 덩어리(3차 R3-12 ⑦)
    d: (
      <>
        범위 지문마다 출제{NB}선생님이 낼 만한 유형을 <span className="whitespace-nowrap">다 뽑았습니다.</span> <span className="whitespace-nowrap">수업 자료 걱정 끝.</span>
      </>
    ),
    plain: true,
  },
  {
    t: "이게 공짜라서",
    d: (
      <>
        네. 진짜 0원입니다. 카드번호도 결제 화면도 없습니다. <span className="whitespace-nowrap">그래서 웁니다.</span>
      </>
    ),
  },
];

export function FfTears() {
  return (
    <section className={`${s.section} border-y-[length:var(--bw)] border-black bg-[var(--ff-red)] text-white`}>
      <div className={s.wrap}>
        <Fit
          as="h2"
          bp="560"
          wide={<FitLine k="tears">받으면 눈물 납니다.</FitLine>}
          narrow={
            <>
              <FitLine k="mTears">받으면</FitLine>
              <FitLine k="mTears">눈물 납니다.</FitLine>
            </>
          }
        />
        <p className={`${s.display} mt-[clamp(14px,1.6vw,30px)] text-[clamp(26px,3vw,76px)] ${s.lhTight} text-white`}>
          진짜로. <span className="whitespace-nowrap">휴지 준비하세요.</span>{" "}
          <span className="relative inline-block" aria-hidden>
            😭<span className={`${s.tear} absolute left-[0.2em] top-[0.9em] text-[0.5em]`}>💧</span>
          </span>
        </p>
        {/* md 이상: 카드 3장이 숫자·제목·본문 세 줄을 함께 쓴다(subgrid) — 제목이 두 줄인 카드가 있어도 본문 시작선이 같고,
            모두 한 줄이면 빈 줄을 예약하지 않는다(예전 min-h 2.3em 은 1920 에서 제목 아래 빈 줄이 남았다).
            제목은 제 칸 아래끝(self-end) — 짧은 제목도 본문에 붙어 제목→본문 간격이 세 장 모두 같다(위 정렬이면 1600 에서 20/69/69px).
            1180 이상은 제목 크기를 카드 폭(cqi)에 묶어 세 제목을 한 줄로(3차 R3-14). 크기 컨테이너(tearCard)는 li 가 아니라 제목 감싸개에 둔다 —
            li 에 container-type 을 걸면 li 가 독립 격자가 되어 subgrid 가 꺼진다(실측: grid-template-rows 「subgrid」→ 고정 트랙,
            1180 에서 본문 시작선 8725.9/8704.5/8725.9·숫자↔제목 19.6/9/19.6px). 감싸개는 칸 폭으로 늘어나 cqi 기준이 li 안쪽 폭과 같다 */}
        <ol className="mt-[clamp(32px,4vw,80px)] grid gap-[var(--gap)] md:grid-cols-3 md:grid-rows-[auto_auto_1fr]">
          {TEARS.map(({ t, d, plain }, i) => (
            <li key={i} className={`${s.card} flex flex-col bg-white p-[clamp(20px,2.2vw,44px)] text-[var(--ff-ink)] md:row-span-3 md:grid md:grid-rows-subgrid md:gap-y-0`}>
              <span className={`${s.display} block text-[clamp(52px,5vw,130px)] text-[var(--ff-red-ink)]`}>{i + 1}</span>
              <span className={`${s.tearCard} block md:self-end`}>
                <span className={`${s.display} ${s.tH3} ${s.tearTitle} ${s.balance} mt-[0.3em] block`}>{t}</span>
              </span>
              <span className={`${s.tBody} ${plain ? s.wrapPlain : ""} mt-[12px] block font-semibold text-[var(--ff-dim-ink)]`}>{koNode(d)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FAQ: { id: string; q: React.ReactNode; a: React.ReactNode }[] = [
  { id: "free", q: "진짜 무료예요? 나중에 돈 내라는 거 아니죠?", a: "진짜 무료입니다. 결제 정보도, 카드번호도 받지 않습니다. 보이스피싱이 아닙니다. 자료 받을 이메일 하나만 받습니다." },
  {
    id: "when",
    q: "바로 나오나요?",
    a: (
      <>
        실시간 생성이 아닙니다. <OO variant="text" /> 기출의 형식과 시험 범위를 하나하나 맞춰 보고 검수까지 거쳐 만들기 때문에, 접수 후 <span className="whitespace-nowrap">24시간 안에</span> 이메일로{NB}보내드립니다.
      </>
    ),
  },
  {
    id: "why",
    q: (
      <>
        {/* 「 와 고리 사이에서 줄이 바뀌면 여는 괄호가 줄 끝에 홀로 남는다(고리는 inline-block 이라 줄바꿈 자리가 생긴다) */}
        왜 <span className="whitespace-nowrap">「<OO variant="text" /></span> 기출{NB}그대로」예요?
      </>
    ),
    // 「이번⏎범위에」 금지(320·1920 — 「이번」은 ko 관형사 목록 밖)
    a: `학교마다, 선생님마다 시험이 다르기 때문입니다. 올려 주신 지난 기출을 번호·배점·발문·쪽수까지 해부하고, 범위 지문을 어떤 유형으로 바꿔 냈는지 읽어서 그 틀 그대로 이번${NB}범위에 씌웁니다.`,
  },
  {
    id: "files",
    q: "어떤 파일을 올려요?",
    // 「한글⏎(HWP·HWPX)」처럼 괄호 앞에서 끊기지 않게 — 줄은 「·」 뒤에서만 바뀐다.
    // 끝 문장은 최소 수집 안내 — 지난 시험지는 대개 학생 것이라 이름이 섞인다(3차 R3-25)
    a: (
      <>
        PDF·<span className="whitespace-nowrap">사진(JPG·PNG·HEIC)·</span>
        <span className="whitespace-nowrap">한글(HWP·HWPX)·</span>한쇼·한셀·워드·PPT·<span className="whitespace-nowrap">압축(ZIP·EGG·ALZ)</span>까지 <span className="whitespace-nowrap">다 됩니다.</span> 형식은 따지지 않습니다. 파일 하나 50MB, 칸마다 30개까지입니다.
        학생 이름·번호는 가리고 올려{NB}주세요(필기 자국은 괜찮습니다).
      </>
    ),
  },
  {
    id: "mock",
    q: "모의고사 지문은 어떻게 올려요?",
    // 버튼 이름·범위 예시는 한 덩어리(「기출⏎DB에서 고르기」 「20~24,⏎29~42」 금지)
    a: (
      <>
        학평·모평·수능 지문은 파일 없이 <span className="whitespace-nowrap">「기출 DB에서 고르기」로</span> 시험지와 번호만 찍으면 됩니다.{" "}
        <span className="whitespace-nowrap">「20~24, 29~42」처럼</span> 범위를 그대로 쳐도 됩니다. DB에 없는 지문은 파일로 올리면 됩니다.
      </>
    ),
  },
  {
    id: "what",
    q: "뭘 받게 되나요?",
    a: (
      <>
        {/* 상품 이름(동형 모의고사·출제 예측 해설·예상 문제)과 「10세트 300문항」은 한 덩어리, 「10세트⏎(정답」 괄호 앞 끊김 금지,
            「해설⏎포함)와」 금지(3차 R3-12 ⑩), 「문제⏎수는」(줄머리 「수는」이 의존명사로 읽힌다) 금지 */}
        <OO variant="text" /> 기출과 형식이 같은 동형{NB}모의고사 <span className="whitespace-nowrap">10세트(정답·</span>출제{NB}예측{NB}해설{NB}포함)와
        범위 지문별 예상{NB}문제집을 PDF로 보내드립니다. 10세트{NB}300문항도 예상{NB}문제 안에서 골라 짭니다. 예상{NB}문제{NB}수는 범위에 따라
        다릅니다 — 사례: <span className="whitespace-nowrap">범위 63지문 → 643문항.</span>
      </>
    ),
  },
];

// 두 기둥(1~3 · 4~6) — CSS columns 는 하나를 열면 다른 질문이 열을 건너뛰었다. 좁은 화면은 한 기둥에 1→6 순서 그대로.
// 두 기둥은 1366 부터 — 1024~1365 는 Q1 이 두 줄로 접혀 닫힌 두 기둥이 30~34px 계단으로 어긋났다(3차 R3-13)
const FAQ_COLS = [FAQ.slice(0, 3), FAQ.slice(3)];

/** done: 접수 완료 — 마지막 묶음(「아직도 안 올렸어요?」 + 올리기 버튼)을 완료 한 줄로 바꾼다. 감싸개(finalRef)는 남겨 막대 관찰을 유지 */
export const FfFaq = forwardRef<HTMLDivElement, { onStart: () => void; done: boolean }>(function FfFaq({ onStart, done }, finalRef) {
  return (
    <section className={`${s.section} bg-[var(--ff-ink)]`}>
      <div className={s.wrap}>
        {/* 첫 글자 「자」의 왼쪽 여백만큼 당겨 아래 상자 왼끝과 맞춘다 */}
        <h2 className={`${s.display} text-[clamp(44px,6vw,150px)] [margin-inline-start:-0.045em]`}>
          자주 <span className="text-[var(--ff-yellow)]">묻는 것</span>
        </h2>
        <div className="mt-[clamp(24px,3vw,60px)] grid gap-[var(--gap)] min-[1366px]:grid-cols-2 min-[1366px]:items-start">
          {FAQ_COLS.map((col) => (
            <div key={col[0].id} className="grid content-start gap-[var(--gap)]">
              {col.map(({ id, q, a }) => (
                <details key={id} className="group rounded-[var(--radius)] border-[length:var(--bw)] border-white/20 bg-[var(--ff-ink-2)] p-[clamp(18px,1.8vw,36px)] open:border-[var(--ff-yellow)]">
                  <summary className={`${s.tH4} flex cursor-pointer list-none items-start justify-between gap-[16px] font-black [&::-webkit-details-marker]:hidden`}>
                    {/* 매달린 들여쓰기 — 접힌 둘째 줄이 「Q.」 밑이 아니라 질문 글 시작선에서. 1.195em = 「Q. 」 폭(Pretendard 900 실측 1.1945em) */}
                    <span className={`${s.balance} pl-[1.195em] -indent-[1.195em]`}>
                      <span className="text-[var(--ff-yellow)]">Q.</span> {koNode(q)}
                    </span>
                    {/* 「+」 잉크 중심을 첫 줄 글자 중심에 — 위로 당기고, 돌아갈 때(×)도 잉크 중심을 축으로 */}
                    <span
                      className="-mt-[0.04em] shrink-0 origin-[50%_56%] text-[1.2em] leading-none text-[var(--ff-yellow)] transition-transform group-open:rotate-45 motion-reduce:transition-none"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className={`${s.tBody} mt-[0.8em] font-semibold text-[var(--ff-dim)]`}>{koNode(a)}</p>
                </details>
              ))}
            </div>
          ))}
        </div>

        <div ref={finalRef} className="mt-[clamp(64px,8vw,170px)] text-center">
          {done ? (
            // 접수 뒤에는 「아직도 안 올렸어요?」·올리기 버튼이 상태와 어긋났다(3차 R3-29) — 완료 한 줄.
            // FitLine 이 아닌 보통 큰 글자(새 FitLine 문구는 k 재측정이 필요하다). 좁으면 구절(NB) 단위로 두 줄
            <p className={`${s.display} ${s.lhTight} ${s.balance} text-[clamp(30px,4.6vw,118px)]`}>
              {koNode(
                <>
                  <span className="whitespace-nowrap text-[var(--ff-yellow)]">접수 완료!</span> 24시간{NB}안에 이메일로{NB}갑니다.
                </>,
              )}
            </p>
          ) : (
            <>
              <Fit
                bp="560"
                wide={<FitLine k="last">아직도 안 올렸어요?</FitLine>}
                narrow={
                  <>
                    <FitLine k="mLast">아직도</FitLine>
                    <FitLine k="mLast">안 올렸어요?</FitLine>
                  </>
                }
              />
              <button
                type="button"
                onClick={onStart}
                className={`${s.btn} ${s.display} mt-[clamp(24px,3vw,56px)] w-full bg-[var(--ff-yellow)] px-[0.7em] py-[0.6em] text-[clamp(24px,7.4vw,44px)] text-[var(--ff-ink)] md:w-auto md:px-[1.1em] md:text-[clamp(30px,3.6vw,92px)]`}
              >
                파일 3개 올리기 빡!
              </button>
              <p className={`${s.tSmall} mt-[20px] font-bold text-[var(--ff-dim)]`}>{koNode("100% 무료 · 24시간 안에 이메일 · !대-박!")}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
});

export function FfDone({ email }: { email: string }) {
  // 접수 버튼이 사라지면 포커스가 문서 처음으로 떨어져 낭독기가 결과를 못 읽었다(2차 검수) — 나타날 때 이 카드로 포커스
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`${s.card} bg-[var(--ff-yellow)] p-[clamp(24px,4vw,90px)] text-center text-[var(--ff-ink)] outline-none`}
      style={{ boxShadow: "var(--shadow) var(--shadow) 0 0 var(--ff-red)" }}
      role="status"
    >
      <p className={`${s.display} text-[clamp(56px,9vw,230px)] `}>접수 완료!!!</p>
      <p className={`${s.display} mt-[0.4em] text-[clamp(28px,3.6vw,90px)] ${s.lhTight}`}>24시간 안에 갑니다.</p>
      <p className={`${s.tLead} mt-[clamp(14px,1.6vw,30px)] break-all font-black`}>
        📮 <span className="underline decoration-[var(--ff-red)] decoration-[4px] underline-offset-[6px]">{email}</span>
      </p>
      <p className={`${s.tBody} mt-[clamp(12px,1.4vw,26px)] font-bold text-[var(--ff-dim-ink)]`}>
        {koNode(
          <>
            스팸함도 한 번 봐 주세요. 받으면 눈물 납니다 — <span className="whitespace-nowrap">휴지 미리 준비 🧻</span>
          </>,
        )}
      </p>
    </div>
  );
}
