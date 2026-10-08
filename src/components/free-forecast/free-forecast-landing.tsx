"use client";

// 무료 적중 예측 팩 신청 랜딩(/free-forecast)
//   히어로 → ○○고 기출 그대로(번호별 해부·습관·발문/기계 대조) → 받는 것(실물) → 파일 3칸 + 이메일 → 눈물 → FAQ
//   + 하단 고정 업로드 막대(업로드 묶음·마지막 버튼·바닥글이 화면에 없을 때) + 화면 아무 데나 끌어다 놓기 + 알림

import { useCallback, useEffect, useRef, useState } from "react";
import { FF_ACCEPT, FF_SLOT_KEYS, FF_SLOTS, type FfSlotKey } from "@/lib/free-forecast/constants";
import { FfHero } from "./ff-hero";
import { FfSchool } from "./ff-school";
import { FfShowcase } from "./ff-showcase";
import { FfUpload } from "./ff-upload";
import { FfDock } from "./ff-dock";
import { FfDropOverlay } from "./ff-drop-overlay";
import { FfGichulPicker } from "./ff-gichul-picker";
import { FfFaq, FfTears } from "./ff-extras";
import { FF_ERROR_NOTICE_MS, useFfRequest, type FfBlocker } from "./use-ff-request";
import { ko } from "./ff-ko";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

/** 보이는 업로드 컨트롤(md 이상은 큰 카드의 놓는 칸, md 미만은 타일) */
function slotControl(slot: FfSlotKey): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[data-ff-slot="${slot}"]`)].find((el) => el.offsetParent !== null) ?? null;
}

/** 움직임 줄이기를 켠 사용자에게는 화면을 미끄러뜨리지 않는다(수천 px 부드러운 스크롤은 멀미 유발 — WCAG 2.3.3) */
function scrollMode(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** 잠깐 고리 — 마우스·손가락으로 눌러 온 포커스는 :focus-visible 이 안 걸려 어디로 왔는지 안 보인다.
 *  안쪽 잉크 띠 + 바깥 노랑 — 노랑 하나는 흰 업로드 카드 위에서 1.27:1 이라 안 보였다(3차 R3-16) */
function flash(el: HTMLElement | null, ms = 1600, ring = "0 0 0 3px var(--ff-ink), 0 0 0 7px var(--ff-yellow)") {
  if (!el) return;
  el.style.setProperty("box-shadow", ring);
  window.setTimeout(() => el.style.removeProperty("box-shadow"), ms);
}

/** 스크롤이 멈춘 뒤에 — 정해진 시간(480ms) 뒤에 걸면 맨 위에서 출발한 부드러운 스크롤이 1.5초쯤 걸려 도착 뒤 고리가 0.5초만 보였다(3차 R3-16).
 *  scrollend 를 듣고, 없으면 3프레임 연속 정지(움직였거나 0.3초 지난 뒤)로 판단한다. 최대 2.5초 */
function afterScroll(cb: () => void) {
  if (scrollMode() === "auto") {
    requestAnimationFrame(() => cb());
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    cb();
  };
  if ("onscrollend" in window) window.addEventListener("scrollend", finish, { once: true });
  const t0 = performance.now();
  const y0 = window.scrollY;
  let last = y0;
  let still = 0;
  const tick = () => {
    if (done) return;
    const y = window.scrollY;
    still = y === last ? still + 1 : 0;
    last = y;
    const elapsed = performance.now() - t0;
    if ((still >= 3 && (y !== y0 || elapsed > 300)) || elapsed > 2500) return finish();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function FreeForecastLanding({ fontClass }: { fontClass: string }) {
  const st = useFfRequest();
  const uploadRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);
  const inputs = useRef<Partial<Record<FfSlotKey, HTMLInputElement | null>>>({});
  const [pickerSlot, setPickerSlot] = useState<FfSlotKey | null>(null);
  const [inView, setInView] = useState({ body: false, final: false, end: false });
  const [toast, setToast] = useState<typeof st.notice>(null);

  const openPicker = useCallback((slot: FfSlotKey) => inputs.current[slot]?.click(), []);

  /** 업로드 묶음으로 — 「제목 · 리드 · 카드 줄」 중 카드 아래끝까지 한 화면에 다 들어오는 가장 위 요소를 화면 위에 맞춘다.
   *  (카드 줄을 화면 가운데로 맞추던 때는 그 위 거대 제목이 화면 위 끝에서 반토막 났다 — 2차 검수 1024·1180·1440·2560)
   *  도착하면 첫 빈 칸에 포커스. 고른 칸 키를 돌려준다 */
  const toUpload = useCallback(
    (focusSlot?: FfSlotKey): FfSlotKey => {
      const cards = document.getElementById("ff-cards");
      if (cards) {
        const pad = 16;
        const bottom = cards.getBoundingClientRect().bottom;
        const cand = [document.getElementById("ff-upload-head"), document.getElementById("ff-upload-lead"), cards];
        const anchor = cand.find((el): el is HTMLElement => !!el && bottom - el.getBoundingClientRect().top + 2 * pad <= window.innerHeight) ?? cards;
        window.scrollTo({ top: window.scrollY + anchor.getBoundingClientRect().top - pad, behavior: scrollMode() });
      } else uploadRef.current?.scrollIntoView({ behavior: scrollMode(), block: "start" });
      const target = focusSlot ?? st.missing[0]?.key ?? "pastExam";
      // 도착한 칸에 포커스 + 잠깐 고리(마우스로 눌러 왔으면 포커스 고리가 안 보인다) — 스크롤이 멈춘 뒤에
      afterScroll(() => {
        const el = slotControl(target);
        el?.focus({ preventScroll: true });
        flash(el);
      });
      return target;
    },
    [st.missing],
  );

  /** 막힌 곳으로 — 빈 칸이면 업로드 묶음(그 칸 노랑 고리 + 왜 왔는지 알림), 이메일이면 입력칸, 동의면 체크칸(잠깐 노랑 강조) */
  const { notify, checkEmail } = st;
  const emailTyped = st.info.email.trim() !== "";
  const goBlocker = useCallback(
    (b: FfBlocker) => {
      if (b.kind === "slot") {
        const target = toUpload(b.slot);
        const def = FF_SLOTS.find((d) => d.key === target);
        // 사용자가 방금 누른 동작의 안내 — 떠 있는 오류 알림이 있어도 바로 띄운다(use-ff-request notify 의 action)
        if (def) notify(`${def.no}번 칸(${def.title})이 비었습니다 — 여기에 올려 주세요`, "ok", "action");
        return;
      }
      // 형식이 틀린 이메일로 막혔으면 이제부터 형식 안내를 보인다(입력 중에는 안 보인다 — 3차 R3-03).
      // 빈 칸이면 켜지 않는다 — 켜 두면 포커스 뒤 첫 글자부터 「형식」 안내가 떠 버튼이 52px 밀렸다(업로드 수정자 재현)
      if (b.kind === "email" && emailTyped) checkEmail();
      document.getElementById("ff-email")?.scrollIntoView({ behavior: scrollMode(), block: "center" });
      afterScroll(() => {
        if (b.kind === "email") emailRef.current?.focus({ preventScroll: true });
        else {
          agreeRef.current?.focus({ preventScroll: true });
          flash(document.getElementById("ff-agree"), 1400, "0 0 0 4px var(--ff-yellow)");
        }
      });
    },
    [toUpload, notify, checkEmail, emailTyped],
  );

  // 하단 막대: 업로드 묶음(위아래 여백 제외)·마지막 버튼 묶음·페이지 끝이 화면에 들어오면 숨긴다
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        setInView((prev) => {
          const next = { ...prev };
          for (const e of entries) {
            if (e.target === bodyRef.current) next.body = e.isIntersecting;
            if (e.target === finalRef.current) next.final = e.isIntersecting;
            if (e.target === endRef.current) next.end = e.isIntersecting;
          }
          return next;
        });
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    for (const el of [bodyRef.current, finalRef.current, endRef.current]) if (el) io.observe(el);
    return () => io.disconnect();
  }, [st.done]);

  // 접수되면 업로드 칸이 「접수 완료」 한 장으로 줄어든다 — 그 자리로 옮겨 결과가 바로 보이게
  useEffect(() => {
    if (st.done) uploadRef.current?.scrollIntoView({ behavior: scrollMode(), block: "start" });
  }, [st.done]);

  // 접수 오류가 나면 — 막대에서 눌렀어도 오류 문구가 보이는 신청서로, 멈춘 뒤 오류 문단에 포커스(낭독기가 읽게)
  useEffect(() => {
    if (!st.submitError) return;
    document.getElementById("ff-email")?.scrollIntoView({ behavior: scrollMode(), block: "center" });
    afterScroll(() => document.getElementById("ff-submit-err")?.focus({ preventScroll: true }));
  }, [st.submitError]);

  // 알림 — 보이기만 한다(오류 6초·보통 3.2초). 무엇을 띄울지(오류 우선·보통 알림 기다리기)는 use-ff-request 의 notify 가 정한다
  const hideTimer = useRef<number | null>(null);
  useEffect(() => {
    const n = st.notice;
    if (!n) return;
    const show = window.setTimeout(() => setToast(n), 0);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setToast((t) => (t?.id === n.id ? null : t)), n.tone === "error" ? FF_ERROR_NOTICE_MS : 3200);
    return () => window.clearTimeout(show);
  }, [st.notice]);
  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const pickerDef = FF_SLOTS.find((d) => d.key === pickerSlot);
  const dockVisible = !st.done && !inView.body && !inView.final && !inView.end && !pickerSlot;
  const dockVisibleRef = useRef(dockVisible);

  // 막대 높이 — 두 가지를 같은 ResizeObserver 로 잰다(회전·창 크기 변경 때도 다시 — 2차 검수: 회전 뒤 알림이 막대를 30px 덮었다)
  //   --ff-dock-size : 막대 자체 높이(숨겨도 그대로) — 히어로 첫 화면이 막대 윗변에서 끝나게. 노출에 따라 0 이 되면 스크롤 도중 히어로가 튄다
  //   --ff-dock-h · scroll-padding-bottom : 막대가 보일 때만 — 알림을 막대 위에, Tab 으로 간 요소가 막대 밑에 숨지 않게
  const syncDock = useCallback(() => {
    const dock = document.querySelector<HTMLElement>("[data-ff-dock]");
    const root = document.documentElement;
    const h = Math.round(dock?.getBoundingClientRect().height ?? 0);
    if (dock) root.style.setProperty("--ff-dock-size", `${h}px`);
    if (dockVisibleRef.current && dock) {
      root.style.setProperty("scroll-padding-bottom", `${h + 12}px`);
      root.style.setProperty("--ff-dock-h", `${h}px`);
    } else {
      root.style.removeProperty("scroll-padding-bottom");
      root.style.setProperty("--ff-dock-h", "0px");
    }
  }, []);
  useEffect(() => {
    const dock = document.querySelector<HTMLElement>("[data-ff-dock]");
    if (!dock) return;
    const ro = new ResizeObserver(syncDock);
    ro.observe(dock);
    return () => {
      ro.disconnect();
      const root = document.documentElement;
      root.style.removeProperty("--ff-dock-size");
      root.style.removeProperty("scroll-padding-bottom");
      root.style.removeProperty("--ff-dock-h");
    };
  }, [syncDock]);
  useEffect(() => {
    dockVisibleRef.current = dockVisible;
    syncDock();
    // 막대가 숨을 때 포커스가 그 안에 있으면 꺼낸다 — 보이지 않는 이메일 칸에 글자가 들어갔다(2차 검수).
    // 이메일 칸이었으면 신청서 이메일 칸으로, 그 밖(받기 버튼 등)은 신청서 접수 버튼으로 — blur 하면 포커스가 문서 처음으로 떨어졌다(3차 R3-16)
    if (!dockVisible) {
      const a = document.activeElement as HTMLElement | null;
      if (a?.closest("[data-ff-dock]")) {
        if (a.tagName === "INPUT") emailRef.current?.focus({ preventScroll: true });
        else {
          const submitBtn = document.querySelector<HTMLButtonElement>("#ff-email button[type=submit]");
          if (submitBtn) submitBtn.focus({ preventScroll: true });
          else a.blur();
        }
      }
    }
  }, [dockVisible, syncDock]);

  return (
    <main className={`${s.root} ${fontClass}`}>
      <FfHero onStart={() => toUpload()} />
      {/* 히어로 바로 아래에 「받는 것·실물」과 업로드 — 약속을 본 즉시 올릴 수 있게(10-08 사용자 요청). 학교 기출 해부는 그 뒤에서 설득을 잇는다 */}
      <FfShowcase />
      <FfUpload ref={uploadRef} st={st} onPick={openPicker} onOpenDb={setPickerSlot} onBlocked={goBlocker} emailRef={emailRef} agreeRef={agreeRef} bodyRef={bodyRef} />
      <FfSchool />
      <FfTears />
      <FfFaq ref={finalRef} onStart={() => toUpload()} done={st.done} />
      <div ref={endRef} aria-hidden className="h-px" />

      {FF_SLOT_KEYS.map((k) => (
        <input
          key={k}
          ref={(el) => {
            inputs.current[k] = el;
          }}
          type="file"
          multiple
          accept={FF_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files?.length) st.addFiles(k, e.target.files);
            e.target.value = "";
          }}
        />
      ))}

      <FfDock st={st} visible={dockVisible} onPick={openPicker} onBlocked={goBlocker} />
      <FfDropOverlay disabled={st.done || Boolean(pickerSlot)} onFiles={(slot, list) => st.addFiles(slot, list)} />

      {/* 알림 — 막대가 떠 있으면 그 위(--ff-dock-h), 아니면 화면 아래. 보통 알림은 검정 바탕·노랑 글자:
          업로드 칸 바로 아래가 신청서의 노랑 띠라 노랑 알림이 그 위에 겹쳐 두 문장이 섞여 읽혔다(2차 검수) */}
      {toast ? (
        <div
          className={`${u.toast} ${s.tSmall} rounded-[14px] border-2 px-[16px] py-[10px] font-black ${toast.tone === "error" ? "border-black bg-[var(--ff-red-ink)] text-white" : "border-[var(--ff-yellow)] bg-[var(--ff-ink)] text-[var(--ff-yellow)]"}`}
          // 막대가 없을 때는 홈 표시줄(안전 영역) 위에. 낭독은 아래 늘 있는 sr-only 칸이 맡는다(여기 role 을 두면 두 번 읽힌다)
          style={{ bottom: "max(calc(var(--ff-dock-h, 0px) + 14px), calc(env(safe-area-inset-bottom) + 8px))" }}
        >
          {ko(toast.text)}
        </div>
      ) : null}
      {/* 화면 낭독기도 보이는 알림과 같은 것을 읽는다(오류가 보통 알림에 덮이지 않게 위에서 거른 결과) */}
      <p className="sr-only" aria-live="polite">
        {toast?.text ?? ""}
      </p>

      {pickerSlot && pickerDef ? (
        <FfGichulPicker
          slotTitle={pickerDef.title}
          initial={st.picks[pickerSlot]}
          onClose={() => setPickerSlot(null)}
          onApply={(picks) => {
            st.setSlotPicks(pickerSlot, picks);
            setPickerSlot(null);
          }}
        />
      ) : null}
    </main>
  );
}
