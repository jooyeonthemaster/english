"use client";

// 하단 고정 업로드 막대 — 업로드 칸이 화면에 없을 때(히어로·사례·눈물·FAQ 를 보는 동안) 세 칸을 계속 보여 준다.
//   lg 이상: ①②③ + 이메일 + 받기   ·   md~lg: ①②③ + 받기   ·   md 미만: ①②③ + 받기(네 칸)
//   높이 520px 이하(가로 폰·확대 200%): 한 줄 압축형 — 번호 + 짧은 상태(넓으면 이름 한 줄), 받기도 한 줄(ff-upload.module.css)
// 각 칸은 누르면 파일 고르기, 끌어다 놓으면 바로 그 칸에 올라간다. 받기는 다 채웠으면 접수, 아니면 첫 빈 곳으로 데려간다.
// 칸 제목은 Pretendard 900(작은 크기에서 Black Han Sans 는 획이 뭉친다). 제목이 상태보다 늘 크다.
// md 미만 칸은 폭 50~65px — 상태는 짧은 문구(ffStatusShort), 화면 낭독기(aria-label)·md 이상은 전체 문구(좁은 칸은 짧은 문구).
// 칸의 짜임·보임(세로/가로·이름 두 벌·상태 두 벌·아이콘)은 전부 모듈 클래스가 정한다 — 같은 요소에 Tailwind display·flex-direction 을 섞지 않는다.

import { useState, type DragEvent } from "react";
import { FF_SLOTS, type FfSlotKey } from "@/lib/free-forecast/constants";
import { ffStatusShort, ffStatusText } from "./ff-slot-card";
import type { FfBlocker, FfRequestState } from "./use-ff-request";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

interface Props {
  st: FfRequestState;
  visible: boolean;
  onPick: (slot: FfSlotKey) => void;
  onBlocked: (b: FfBlocker) => void;
}

/** 칸 색 — 끌어오는 중 → 완료+실패 섞임 → 완료 → 실패 → 빈 칸 순으로 고른다.
 *  섞임은 노랑 바탕 + 빨강 테두리: 노랑·✓ 만이면 실패가 안 보였다(2차 검수). 테두리는 노랑 위 대비 4.35:1 인 --ff-red-ink(--ff-red 는 2.9:1) */
function slotTone(over: boolean, ready: boolean, failed: boolean): string {
  if (over) return "border-[var(--ff-yellow)] bg-[var(--ff-yellow)] text-[var(--ff-ink)]";
  if (ready && failed) return "border-[var(--ff-red-ink)] bg-[var(--ff-yellow)] text-[var(--ff-ink)]";
  if (ready) return "border-[var(--ff-yellow)] bg-[var(--ff-yellow)] text-[var(--ff-ink)]";
  if (failed) return "border-[var(--ff-red)] bg-white/[0.06] text-white";
  return "border-white/30 bg-white/[0.06] text-white hover:border-[var(--ff-yellow)]";
}

function DockSlot({
  no,
  title,
  lines,
  status,
  short,
  ready,
  failed,
  focusable,
  onPick,
  onFiles,
}: {
  no: number;
  title: string;
  lines: [string, string];
  status: string;
  short: string;
  ready: boolean;
  failed: boolean;
  focusable: boolean;
  onPick: () => void;
  onFiles: (f: FileList) => void;
}) {
  const [over, setOver] = useState(false);
  // 전체 상태 문구 길이 등급 — 좁은 칸에서 짧은 상태로 바꿀 경계가 등급마다 다르다(ff-upload.module.css 의 @container). 10자 이하는 늘 들어간다
  const len = status.length > 20 ? "x" : status.length > 17 ? "l" : status.length > 10 ? "m" : undefined;
  const drag = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
  };
  return (
    <button
      type="button"
      onClick={onPick}
      {...drag}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${no}번 ${title} — ${status || "비어 있음, 눌러서 올리기"}`}
      className={`${u.dockSlot} h-full min-w-0 overflow-hidden rounded-[clamp(10px,0.9vw,16px)] border-2 text-left transition-colors ${slotTone(over, ready, failed)}`}
    >
      <span className={`${s.display} ${u.dockNo} flex aspect-square shrink-0 items-center justify-center rounded-[0.25em] bg-[var(--ff-red-ink)] text-white`}>{no}</span>
      <span className={`${u.dockText} min-w-0 flex-1`}>
        {/* md(768~1023)는 14px — 15px 이면 768 에서 「그 시험의 범위 지문」 여유가 0.6px 라 잘림 직전이었다 */}
        <span className={`${u.dockTitle} truncate text-[clamp(14px,1.2vw,22px)] font-black leading-tight lg:text-[clamp(15px,1.2vw,22px)]`}>{title}</span>
        <span className={`${u.dockLines} text-[clamp(13px,3.6vw,16px)] font-black leading-[1.15]`}>
          {lines[0]}
          <br />
          {lines[1]}
        </span>
        <span data-len={len} className={`${u.dockStatus} block truncate text-[clamp(13px,0.3vw+9.5px,17px)] font-bold ${failed && !ready ? "text-[var(--ff-red)]" : ready ? "" : "text-[var(--ff-yellow)]"}`}>
          {/* 넓은 칸(md 이상)은 원형 아이콘이 「+」를 맡는다 */}
          <span className={u.dockShort}>{short || "＋ 올리기"}</span>
          <span className={u.dockFull}>{status || "올리기"}</span>
        </span>
      </span>
      <span aria-hidden className={`${u.dockIcon} ml-auto h-[1.7em] w-[1.7em] shrink-0 place-items-center rounded-full border-2 border-current text-[clamp(14px,1.1vw,22px)] font-black`}>
        {failed ? "!" : ready ? "✓" : "+"}
      </span>
    </button>
  );
}

export function FfDock({ st, visible, onPick, onBlocked }: Props) {
  // 올리는 중에 누르면 — 아무 일도 안 하면 고장으로 읽혔다(2차 검수). 알리고, 남은 곳(없으면 신청서)으로 데려간다.
  // 올리는 중인 칸은 「남은 것」에서 건너뛴다 — 그 칸이 blockers[0] 이 되면 「비었습니다」라고 말하고 알림이 두 번 나갔다(2차 수정자 실측)
  // 알림은 사용자가 방금 누른 동작의 안내(action) — 떠 있는 오류 알림이 있어도 바로 뜬다. 「이 버튼으로 바로 접수됩니다」는 막대가 숨은 뒤에는
  // 누를 버튼이 없어 신청서의 버튼을 가리킨다(3차 R3-15)
  const go = () => {
    if (st.submitting) return;
    if (st.uploading) {
      const b = st.blockers.find((x) => x.kind !== "slot" || !st.stat(x.slot).uploading);
      // 정말 빈 다른 칸이 있으면 그 칸 안내가 더 쓸모 있다(goBlocker 가 「N번 칸이 비었습니다」를 알린다)
      if (b?.kind === "slot") return onBlocked(b);
      if (b) {
        st.notify("올리는 중입니다 — 그동안 이메일·동의를 채워 주세요", "ok", "action");
        return onBlocked(b);
      }
      st.notify("올리는 중입니다 — 끝나면 신청서의 「무료로 받기!!!」를 눌러 주세요", "ok", "action");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("ff-email")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    if (st.blockers.length) return onBlocked(st.blockers[0]);
    void st.submit();
  };
  const all = st.missing.length === 0;
  // 형식 안내는 확인할 때부터(신청서와 같은 조건 — 3차 R3-03)
  const emailBad = st.emailChecked && st.info.email.trim().length > 0 && !st.emailOk;

  return (
    // data-clarity-mask — 화면 녹화(분석 도구)에 이메일·파일 이름이 실리지 않게(3차 R3-26)
    <div data-ff-dock data-clarity-mask="true" inert={!visible} className={`${u.dock} ${visible ? "" : u.dockHidden}`} aria-hidden={!visible} role="region" aria-label="파일 3개 올리기">
      <div className={`${s.wrap} ${u.dockGrid}`}>
        {FF_SLOTS.map((d) => {
          const stt = st.stat(d.key);
          return (
            <DockSlot
              key={d.key}
              no={d.no}
              title={d.title}
              lines={d.lines}
              status={ffStatusText(stt)}
              short={ffStatusShort(stt)}
              ready={stt.ready}
              failed={stt.failed > 0}
              focusable={visible}
              onPick={() => onPick(d.key)}
              onFiles={(f) => st.addFiles(d.key, f)}
            />
          );
        })}
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="send"
          value={st.info.email}
          onChange={(e) => st.setInfo({ ...st.info, email: e.target.value })}
          // 칸을 떠날 때가 「확인할 때」 — 빈 칸을 지나치기만 한 것은 빼고(그때 켜 두면 나중에 첫 글자부터 안내가 떴다)
          onBlur={() => {
            if (st.info.email.trim() && !st.emailOk) st.checkEmail();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go();
            }
          }}
          placeholder="자료 받을 이메일"
          aria-label="자료 받을 이메일"
          aria-invalid={emailBad}
          tabIndex={visible ? 0 : -1}
          className="hidden min-w-0 rounded-[clamp(10px,0.9vw,16px)] border-2 border-white bg-white px-[0.8em] text-[clamp(16px,1.1vw,22px)] font-bold text-[var(--ff-ink)] placeholder:text-black/45 focus:outline-none focus:ring-4 focus:ring-[var(--ff-yellow)] lg:block"
        />
        <button
          type="button"
          onClick={go}
          tabIndex={visible ? 0 : -1}
          disabled={st.submitting}
          aria-busy={st.submitting || st.uploading}
          className={`${s.display} flex items-center justify-center rounded-[clamp(10px,0.9vw,16px)] border-2 border-black px-[clamp(8px,1.2vw,28px)] text-center text-[clamp(17px,1.6vw,36px)] ${s.lh105} ${
            st.submitting ? "bg-[#2a2a2e] text-white/60" : st.uploading ? "bg-[#2a2a2e] text-white/70" : all ? "bg-[var(--ff-yellow)] text-[var(--ff-ink)]" : "bg-[var(--ff-red-ink)] text-white"
          }`}
        >
          {/* md 미만 두 줄 — 낮은 화면(압축형)은 줄바꿈(.ctaBr)을 접어 한 줄.
              「...」는 ASCII — Black Han Sans 에 「…」(U+2026)가 없어 대체 글꼴의 각진 점이 벌어져 찍혔다(3차 R3-34) */}
          {st.submitting ? (
            "접수 중..."
          ) : st.uploading ? (
            <>
              <span className="md:hidden">
                올리는 <br className={u.ctaBr} />
                중...
              </span>
              <span className="hidden whitespace-nowrap md:inline">올리는 중...</span>
            </>
          ) : (
            <>
              <span className="md:hidden">
                무료 <br className={u.ctaBr} />
                받기
              </span>
              <span className="hidden whitespace-nowrap md:inline">무료로 받기!!!</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
