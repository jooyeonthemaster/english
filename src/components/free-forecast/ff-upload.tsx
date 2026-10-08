"use client";

import { forwardRef, Fragment } from "react";
import { FF_SLOTS, type FfSlotKey } from "@/lib/free-forecast/constants";
import { Fit, FitLine } from "./ff-fit";
import { FfTicker } from "./ff-hero";
import { FfFileRow, FfPickRow, FfSlotCard } from "./ff-slot-card";
import { FfDone } from "./ff-extras";
import { Arrow, ko, koNode } from "./ff-text";
import type { FfBlocker, FfRequestState } from "./use-ff-request";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

interface Props {
  st: FfRequestState;
  onPick: (slot: FfSlotKey) => void;
  onOpenDb: (slot: FfSlotKey) => void;
  onBlocked: (b: FfBlocker) => void;
  emailRef: React.RefObject<HTMLInputElement | null>;
  agreeRef: React.RefObject<HTMLInputElement | null>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

/** 이메일 하나만 받는다(+ 법정 동의 한 줄). 막힌 게 있으면 버튼이 그 자리로 데려간다 — 회색 「죽은 버튼」을 만들지 않는다. */
function EmailForm({ st, emailRef, agreeRef, onBlocked }: Pick<Props, "st" | "emailRef" | "agreeRef" | "onBlocked">) {
  const { info, setInfo, checkEmail } = st;
  const busy = st.uploading || st.submitting;
  // 적었는데 형식이 틀리면 — 입력칸 바로 아래 안내 + 빨강 테두리. 단 「확인할 때」(칸을 떠날 때·접수를 시도할 때)부터:
  // 첫 글자부터 빨강이면 아직 치는 사람에게 틀렸다고 먼저 말한다(3차 R3-03). 고쳐서 맞으면 바로 사라진다
  const emailBad = st.emailChecked && info.email.trim().length > 0 && !st.emailOk;
  // 빈 칸을 지나치기만 한 것은 확인이 아니다 — 그때 켜 두면 나중에 첫 글자부터 안내가 떴다
  const check = () => {
    if (info.email.trim() && !st.emailOk) checkEmail();
  };

  return (
    <form
      id="ff-email"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (st.submitting) return;
        check();
        // 올리는 중에 누르면 — 아무 일도 안 하면 고장으로 읽힌다. 알리고 기다린다(막대의 받기 버튼과 같은 안내)
        if (st.uploading) {
          st.notify("올리는 중입니다 — 끝나면 바로 접수할 수 있습니다", "ok", "action");
          return;
        }
        if (st.blockers.length) return onBlocked(st.blockers[0]);
        void st.submit();
      }}
      className={`${s.card} ${s.cardOnInk} mt-[clamp(28px,3.4vw,64px)] p-[clamp(18px,2.4vw,48px)] text-white`}
    >
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] rounded-[clamp(12px,1vw,20px)] bg-[var(--ff-yellow)] px-[clamp(14px,1.4vw,28px)] py-[clamp(12px,1.1vw,22px)] text-[var(--ff-ink)]">
        <span className={`${s.display} whitespace-nowrap text-[clamp(22px,2vw,50px)] `}>⏰ 실시간 생성 아닙니다!</span>
        <span className={`${s.tBody} font-black`}>
          {koNode(
            <>
              접수 후 <span className="whitespace-nowrap">24시간 안에,</span> 아래 이메일로 자료를 보내드립니다.
            </>,
          )}
        </span>
      </div>

      <label htmlFor="ff-email-input" className={`${s.display} mt-[clamp(20px,2vw,40px)] block text-[clamp(24px,2.2vw,54px)]`}>
        자료 받을 <span className="text-[var(--ff-yellow)]">이메일</span>
      </label>
      {/* 안내(형식 오류)는 입력칸 바로 아래 — md 미만은 입력칸·안내·버튼 순으로 쌓이고, md 이상은 버튼이 첫 줄 오른쪽(col 2 · row 1)이라 안내가 입력칸 밑(row 2)에 온다.
          격자 줄 간격(--gap)만큼 위로 당겨 입력칸과의 거리를 8px 로 — 안 당기면 20~26px 라 안내가 아래 버튼 쪽에 더 붙어 보였다 */}
      <div className="mt-[clamp(10px,1vw,18px)] grid gap-[var(--gap)] md:grid-cols-[1fr_auto]">
        <input
          id="ff-email-input"
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="send"
          value={info.email}
          onChange={(e) => setInfo({ ...info, email: e.target.value })}
          onBlur={check}
          placeholder="teacher@gmail.com"
          aria-invalid={emailBad}
          aria-describedby={emailBad ? "ff-email-err" : undefined}
          className={`w-full min-w-0 rounded-[clamp(12px,1vw,20px)] border-[length:var(--bw)] ${emailBad ? "border-[var(--ff-red)]" : "border-white"} bg-white px-[0.8em] py-[0.55em] text-[clamp(20px,1.8vw,42px)] font-bold text-[var(--ff-ink)] placeholder:text-black/40 focus:outline-none focus:ring-[6px] focus:ring-[var(--ff-yellow)]`}
        />
        {emailBad ? (
          <p id="ff-email-err" className={`${s.tSmall} mt-[calc(8px_-_var(--gap))] font-black text-[var(--ff-yellow)]`}>
            {ko("이메일 형식을 확인해 주세요 — 예: teacher@gmail.com")}
          </p>
        ) : null}
        {/* 「...」는 ASCII — Black Han Sans 에 「…」(U+2026)가 없어 대체 글꼴의 각진 점이 벌어져 찍혔다(3차 R3-34) */}
        <button type="submit" aria-busy={busy} className={`${s.btn} ${s.display} px-[1em] py-[0.5em] text-[clamp(28px,2.6vw,64px)] md:col-start-2 md:row-start-1 ${busy ? s.btnOff : "bg-[var(--ff-yellow)] text-[var(--ff-ink)]"}`}>
          {st.submitting ? "접수 중..." : st.uploading ? "올리는 중..." : "무료로 받기!!!"}
        </button>
      </div>
      {/* 봇 덫 — 사람 눈에는 안 보인다 */}
      <input tabIndex={-1} autoComplete="off" value={info.website} onChange={(e) => setInfo({ ...info, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />

      <label id="ff-agree" className="mt-[clamp(14px,1.4vw,26px)] flex cursor-pointer items-start gap-[12px] rounded-[12px] transition-shadow">
        <input ref={agreeRef} type="checkbox" checked={info.agree} onChange={(e) => setInfo({ ...info, agree: e.target.checked })} className="mt-[0.2em] h-[1.3em] w-[1.3em] shrink-0 accent-[var(--ff-yellow)]" />
        <span className={`${s.tSmall} font-semibold text-[var(--ff-dim)]`}>
          {koNode(
            <>
              {/* 제목 끝 「수집·이용 동의」는 한 덩어리로(「수집·이용 / 동의」로 갈렸다 — 3차 R3-12 ⑪). 「</b> —」는 한 문자열이어야 ko 가 줄표 앞을 묶는다 */}
              <b className="text-white">
                [필수] 개인정보(이메일·올린 파일) <span className="whitespace-nowrap">수집·이용 동의</span>
              </b> — 이메일과 올린 파일은 자료 제작·발송에만 쓰고 접수 6개월 뒤 모두 지웁니다. 동의하지 않을 수 있지만, 그러면 자료를 보내드릴 수 없습니다.
            </>,
          )}
        </span>
      </label>
      <p aria-live="polite" className={`${s.tSmall} mt-[12px] font-bold ${st.blockers.length ? "text-[var(--ff-yellow)]" : "text-[var(--ff-dim)]"}`}>
        {st.blockers.length ? (
          <>
            {ko("남은 것 —")}{" "}
            {st.blockers.map((b, i) => (
              <Fragment key={b.label}>
                {i ? ko(" · ") : ""}
                <span className="whitespace-nowrap">{b.label}</span>
              </Fragment>
            ))}
          </>
        ) : (
          ko("진짜 무료입니다. 결제 화면 안 나옵니다.")
        )}
      </p>
      {/* 접수 오류 — 신청서 밖(막대)에서 눌렀어도 화면이 여기로 오고 이 문단에 포커스한다(free-forecast-landing.tsx) */}
      {st.submitError ? (
        <p id="ff-submit-err" tabIndex={-1} role="alert" className={`${s.tBody} mt-[12px] rounded-[12px] bg-[var(--ff-red-ink)] px-[16px] py-[12px] font-black`}>
          {ko(st.submitError)}
        </p>
      ) : null}
    </form>
  );
}

export const FfUpload = forwardRef<HTMLElement, Props>(function FfUpload({ st, onPick, onOpenDb, onBlocked, emailRef, agreeRef, bodyRef }, ref) {
  const hasAny = FF_SLOTS.some((d) => st.files[d.key].length || st.picks[d.key].length);
  return (
    // data-clarity-mask — 화면 녹화(분석 도구)에 이메일·파일 이름이 실리지 않게(3차 R3-26)
    <section ref={ref} id="upload" data-clarity-mask="true" className={`border-t-[length:var(--bw)] border-black ${s.halftone}`}>
      <FfTicker reverse tone="red" />
      <div className={`${s.wrap} py-[clamp(48px,6vw,130px)]`}>
        {st.done ? (
          <FfDone email={st.info.email.trim()} />
        ) : (
          <div ref={bodyRef}>
            <Fit
              as="h2"
              id="ff-upload-head"
              bp="560"
              className="scroll-mt-[clamp(12px,1.6vw,28px)]"
              wide={
                <FitLine k="upload1">
                  파일 <span className="text-[var(--ff-yellow)]">딱 3개</span>만 올리세요!
                </FitLine>
              }
              narrow={
                <>
                  <FitLine k="mUpload1">
                    파일 <span className="text-[var(--ff-yellow)]">딱 3개</span>만
                  </FitLine>
                  <FitLine k="mUpload2">올리세요!</FitLine>
                </>
              }
            />
            <p id="ff-upload-lead" className={`${s.tLead} mt-[clamp(14px,1.6vw,30px)] font-black text-[var(--ff-dim)]`}>
              {koNode(
                <>
                  PDF·사진·한글·워드·PPT — <span className="whitespace-nowrap text-[var(--ff-yellow)]">형식 안 따집니다.</span>{" "}
                  <span className={u.fineOnly}>화면 아무 데나 끌어다 놓아도 됩니다.</span>
                  <span className={u.coarseOnly}>눌러서 고르거나 바로 찍어 올리세요.</span>
                </>,
              )}
            </p>

            <div id="ff-cards" className="mt-[clamp(24px,3vw,56px)] grid grid-cols-3 gap-[clamp(8px,1.4vw,28px)]">
              {FF_SLOTS.map((def) => (
                <FfSlotCard
                  key={def.key}
                  def={def}
                  stat={st.stat(def.key)}
                  files={st.files[def.key]}
                  picks={st.picks[def.key]}
                  onPick={() => onPick(def.key)}
                  onFiles={(list) => st.addFiles(def.key, list)}
                  onRemove={(id) => st.removeFile(def.key, id)}
                  onRemovePick={(examId) => st.setSlotPicks(def.key, st.picks[def.key].filter((p) => p.examId !== examId))}
                  onOpenDb={() => onOpenDb(def.key)}
                />
              ))}
            </div>

            {/* md 미만 — 타일 바로 아래 같은 3열: ① 사진 찍어 올리기 · ②③ 기출 DB 고르기.
                두 줄은 각각 완결된 구로 끊는다(「사진 / 으로 올리기」처럼 조사 앞에서 자르지 않는다) */}
            <div className="mt-[10px] grid grid-cols-3 gap-[clamp(8px,1.4vw,28px)] md:hidden">
              {FF_SLOTS.map((d) =>
                d.gichul ? (
                  <button key={d.key} type="button" onClick={() => onOpenDb(d.key)} aria-label={`${d.no}번 칸 기출 DB 고르기`} className="flex min-h-[56px] flex-col justify-center rounded-[14px] border-2 border-white/35 bg-white/[0.06] px-[10px] py-[8px] text-left text-white">
                    <span className={`${s.display} block text-[1.0625rem] ${s.lhTight} text-[var(--ff-yellow)]`}>기출 DB</span>
                    <span className="flex items-center gap-[4px] text-[0.8125rem] font-black text-[var(--ff-dim)]">
                      고르기 <Arrow />
                    </span>
                  </button>
                ) : (
                  <button key={d.key} type="button" onClick={() => onPick(d.key)} aria-label={`${d.no}번 칸 사진 찍어 올리기`} className="flex min-h-[56px] flex-col justify-center rounded-[14px] border-2 border-white/35 bg-white/[0.06] px-[10px] py-[8px] text-left text-white">
                    <span className={`${s.display} block text-[1.0625rem] ${s.lhTight} text-[var(--ff-yellow)]`}>📸 사진</span>
                    <span className="text-[0.8125rem] font-black text-[var(--ff-dim)]">찍어 올리기</span>
                  </button>
                ),
              )}
            </div>
            {/* md 미만 — 무엇을 올리는지. md 이상은 큰 카드마다 제목 아래 안내가 있지만 타일에는 두 줄 제목뿐이었다(3차 R3-04).
                문구는 큰 카드와 같은 FF_SLOTS.hint(두 벌로 갈라지지 않게), 번호는 타일과 같은 빨강 네모 */}
            <ol className="mt-[14px] space-y-[8px] md:hidden">
              {FF_SLOTS.map((d) => (
                <li key={d.key} className="flex items-start gap-[10px]">
                  <span className={`${s.display} ${u.hintNo} flex shrink-0 items-center justify-center bg-[var(--ff-red-ink)] text-white`}>{d.no}</span>
                  <span className={`${s.tSmall} block min-w-0 flex-1 font-semibold text-[var(--ff-dim)]`}>{ko(d.hint)}</span>
                </li>
              ))}
            </ol>
            {/* 「내 자료」 판도 .slotCard 컨테이너 — 좁으면 파일 이름이 첫 줄 전체를 쓴다(ff-upload.module.css 의 @container), 흰 판 위 포커스 고리는 검정 */}
            {hasAny ? (
              <div className={`${u.slotCard} mt-[12px] rounded-[16px] border-[length:var(--bw)] border-black bg-white p-[12px] text-[var(--ff-ink)] md:hidden`}>
                <p className={`${s.display} text-[1.25rem]`}>내 자료</p>
                {FF_SLOTS.map((d) =>
                  st.files[d.key].length || st.picks[d.key].length ? (
                    <div key={d.key} className="mt-[12px]">
                      <p className="text-[0.875rem] font-black">
                        {d.no}. {d.title}
                      </p>
                      <ul className="mt-[6px] space-y-[6px]">
                        {st.picks[d.key].map((p) => (
                          <FfPickRow key={p.examId} p={p} slot={d.key} onRemove={() => st.setSlotPicks(d.key, st.picks[d.key].filter((x) => x.examId !== p.examId))} />
                        ))}
                        {st.files[d.key].map((f) => (
                          <FfFileRow key={f.id} f={f} slot={d.key} onRemove={() => st.removeFile(d.key, f.id)} />
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}

            {/* 올리기 전 부탁(학생 개인정보) + 올린 파일 보관 — 접수하지 않은 파일은 서버가 7일 뒤 지운다 */}
            <p className={`${s.tSmall} mt-[clamp(14px,1.4vw,26px)] font-bold text-[var(--ff-dim)]`}>{ko("학생 이름·번호는 가리고 올려 주세요(필기 자국은 괜찮습니다).")}</p>
            <p className={`${s.tSmall} mt-[4px] font-bold text-[var(--ff-dim)]`}>{ko("올린 파일은 자료 제작에만 씁니다. 접수하지 않은 파일은 7일 뒤 자동으로 지웁니다.")}</p>

            <EmailForm st={st} emailRef={emailRef} agreeRef={agreeRef} onBlocked={onBlocked} />
          </div>
        )}
      </div>
    </section>
  );
});
