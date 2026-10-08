"use client";

// 실물 미리보기 — 누르면 크게(<dialog> — 포커스 가둠·Esc 닫기 내장). ←/→ 로 넘기고 바깥을 누르면 닫힌다.
//   확대 창에서 이미지를 누르면(Enter·Space 도) 확대 ↔ 화면 맞춤. 확대 판은 화면 모양으로 정한다(3차 R3-05):
//     가로 화면(가로>세로) — 처음부터 확대. 판 폭 min(원본 1131px, 칸)이라 1276 이상은 원본 100%, 그보다 좁으면 폭 맞춤(세로로만 읽어 내린다)
//     세로 화면 — 맞춤으로 열고, 누르면 원본 100%(1131px — 화면보다 넓어 손가락으로 끌어 읽는다)
//   마우스·손가락으로 누르면 누른 자리가 그 밑에 남게 확대하고, 키보드로 누르거나 넘기면 위 가운데부터.
//   넘김 버튼은 스크롤 상자 밖이라 확대해 내려 읽어도 그 자리. sm 이상은 이미지 좌우 여백, sm 미만과 세로 화면 확대(판이 화면보다 넓다)는
//   실물을 가리지 않게 무대 아래 한 줄.

import Image from "next/image";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Arrow, Sep, keepMarks, ko } from "./ff-text";
import s from "./free-forecast.module.css";

export interface FfPage {
  src: string;
  cap: string;
  sub: string;
}

/** 실물 사진 원본 크기 — public/free-forecast/*.webp 는 모두 1131×1600 */
const PAGE_W = 1131;
const PAGE_H = 1600;

/** 이미지 좌우 여백 — 넘김 버튼이 무대 아래 줄에 있을 때 */
const PAD = "px-[clamp(8px,4vw,96px)]";
/** 이미지 좌우 여백 — sm 이상 넘김 버튼이 무대에 겹칠 때는 버튼(화면 끝 1vw + 52px + 8px) 자리를 비워 실물을 가리지 않는다 */
const PAD_X = `${PAD} sm:px-[max(clamp(8px,4vw,96px),calc(60px_+_clamp(4px,1vw,24px)))]`;
/** sm 이상 — 넘김 판을 스크롤 상자에 겹쳐 좌우 가운데(겹친 판은 누름을 아래로 통과시킨다). 오른쪽은 세로 스크롤 막대(--sbw) 안쪽 */
const NAV_OVER = "sm:pointer-events-none sm:row-start-2 sm:justify-between sm:pb-0 sm:pl-[clamp(4px,1vw,24px)] sm:pr-[calc(clamp(4px,1vw,24px)_+_var(--sbw,0px))] sm:pt-0";
const NAV_BTN = "grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--ff-yellow)] text-[1.5rem] text-[var(--ff-ink)] sm:pointer-events-auto";
/** 가로 화면 = 가로 > 세로(CSS orientation 과 같은 기준) */
const LANDSCAPE = "(orientation: landscape)";

/** 끝에 붙은 괄호 풀이(안에 띄어쓰기가 있는 것) — 「예상 문제집(예측 문항)」. 「빈칸 (A)(B)」 표지는 띄어쓰기가 없어 해당 없음 */
const CAP_NOTE = /^(.*\S)(\([^()]*\s[^()]*\))$/;

/** 큰 글자 캡션 — 「·」는 displayDots 와 같은 Pretendard 점(Sep), 「(A)(B)」 같은 표지는 한 덩어리로.
 *  끝 괄호 풀이는 좁은 칸에서 통째로 다음 줄로(<wbr> + nowrap) — 괄호 안에서 갈리면 「(예측⏎문항)」처럼 한 낱말이 끝줄에 남았다(320·390) */
function capDisplay(text: string): ReactNode {
  const m = text.match(CAP_NOTE);
  const head = m ? m[1] : text;
  return (
    <>
      {head.split(/\s*·\s*/).map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <Sep /> : null}
          {keepMarks(part)}
        </Fragment>
      ))}
      {m ? (
        <>
          <wbr />
          <span className="whitespace-nowrap">{ko(m[2])}</span>
        </>
      ) : null}
    </>
  );
}

/** 배지의 돋보기 — 380px 미만(썸네일 140px 안팎)에서는 빼서 배지가 썸네일 폭의 절반을 넘지 않게 */
function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="hidden h-[1.05em] w-[1.05em] shrink-0 min-[380px]:block">
      <circle cx="10" cy="10" r="6.6" fill="none" stroke="currentColor" strokeWidth={3} />
      <path d="M15 15l6.5 6.5M10 6.9v6.2M6.9 10h6.2" fill="none" stroke="currentColor" strokeWidth={3} />
    </svg>
  );
}

export function FfGallery({ pages }: { pages: FfPage[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLButtonElement>(null);
  /** 누르는 손으로 확대할 때 누른 자리 — 이미지 안 비율(rx·ry)과 스크롤 상자 안 화면 좌표(sx·sy) */
  const anchor = useRef<{ rx: number; ry: number; sx: number; sy: number } | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  /** 가로 화면 — 확대 판 폭(폭 맞춤 / 원본 1131px)과 넘김 자리를 가른다. 창이 떠 있는 동안 돌리면 따라 바뀐다 */
  const [land, setLand] = useState(true);
  const isOpen = idx !== null;
  /** 세로 화면 확대 — 1131px 판이 화면보다 넓어 좌우 여백이 없다. 넘김은 sm 이상도 무대 아래 줄로 */
  const wide = zoom && !land;

  const open = (i: number) => {
    const l = window.matchMedia(LANDSCAPE).matches;
    setIdx(i);
    setLand(l);
    // 가로 화면은 폭과 상관없이 처음부터 확대(폭 맞춤) — 화면 높이 맞춤이면 1366×768 에서 원본의 0.41 배(2차 검수),
    // 853×533·844×390 에서는 썸네일보다 작았다(3차 R3-05)
    setZoom(l);
    dlg.current?.showModal();
  };
  const close = useCallback(() => dlg.current?.close(), []);

  // 창이 떠 있는 동안 화면을 돌리면(태블릿 회전·창 크기) 판 폭·넘김 자리를 다시 고른다. 확대 여부는 그대로
  useEffect(() => {
    if (!isOpen) return;
    const mq = window.matchMedia(LANDSCAPE);
    const onTurn = () => setLand(mq.matches);
    mq.addEventListener("change", onTurn);
    return () => mq.removeEventListener("change", onTurn);
  }, [isOpen]);

  // 확대 창이 떠 있는 동안 파일을 끌어 오면 창을 닫는다 — 창(top layer)이 끌어다 놓기 덮개를 가려 놓은 파일이 조용히 버려졌다(2차 검수)
  useEffect(() => {
    const onDrag = (e: globalThis.DragEvent) => {
      if (dlg.current?.open && Array.from(e.dataTransfer?.types ?? []).includes("Files")) dlg.current.close();
    };
    window.addEventListener("dragenter", onDrag);
    return () => window.removeEventListener("dragenter", onDrag);
  }, []);
  const step = useCallback((d: number) => setIdx((i) => (i === null ? i : (i + d + pages.length) % pages.length)), [pages.length]);

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault(); // 화살표는 넘김 전용 — 확대 중 가로 스크롤과 겹치지 않게
      step(e.key === "ArrowRight" ? 1 : -1);
    };
    const onClose = () => {
      setIdx(null);
      setZoom(false);
    };
    // 창 뒤 페이지가 휠로 몰래 내려가지 않게 — 휠은 확대해서 스크롤할 게 있는 상자 안에서만(Ctrl+휠 화면 확대는 그대로)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const sc = stage.current;
      const scrollable = !!sc && sc.contains(e.target as Node) && (sc.scrollHeight > sc.clientHeight + 1 || sc.scrollWidth > sc.clientWidth + 1);
      if (!scrollable) e.preventDefault();
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("close", onClose);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("close", onClose);
      el.removeEventListener("wheel", onWheel);
    };
  }, [step]);

  // 세로 스크롤 막대 폭(--sbw) — sm 이상 「다음 장」 버튼이 100% 보기의 막대를 덮지 않게 그만큼 안쪽으로
  useEffect(() => {
    const sc = stage.current;
    if (!isOpen || !sc) return;
    const set = () => sc.parentElement?.style.setProperty("--sbw", `${sc.offsetWidth - sc.clientWidth}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [isOpen]);

  // 확대·넘김 뒤 스크롤 자리 — 손으로 확대하면 누른 자리를 그 밑에, 키보드 확대·넘김은 위 가운데, 맞춤은 처음으로
  useLayoutEffect(() => {
    const sc = stage.current;
    const img = shot.current;
    const a = anchor.current;
    anchor.current = null;
    if (!sc || !img) return;
    if (!zoom) {
      sc.scrollTo(0, 0);
      return;
    }
    const c = sc.getBoundingClientRect();
    const b = img.getBoundingClientRect();
    if (a) sc.scrollTo(b.left - c.left + sc.scrollLeft + a.rx * b.width - a.sx, b.top - c.top + sc.scrollTop + a.ry * b.height - a.sy);
    else sc.scrollTo((sc.scrollWidth - sc.clientWidth) / 2, 0);
  }, [zoom, idx]);

  const toggleZoom = (e: MouseEvent<HTMLButtonElement>) => {
    const sc = stage.current;
    // e.detail 0 = Enter·Space 로 누른 클릭(좌표 없음)
    if (!zoom && sc && e.detail > 0) {
      const b = e.currentTarget.getBoundingClientRect();
      const c = sc.getBoundingClientRect();
      anchor.current = { rx: (e.clientX - b.left) / b.width, ry: (e.clientY - b.top) / b.height, sx: e.clientX - c.left, sy: e.clientY - c.top };
    } else anchor.current = null;
    setZoom((z) => !z);
  };
  const closeOnBg = (e: MouseEvent) => {
    if (e.target === e.currentTarget) close();
  };

  const cur = idx === null ? null : pages[idx];
  return (
    <>
      <ul className="mt-[clamp(16px,2vw,32px)] grid grid-cols-2 gap-[var(--gap)] md:grid-cols-3">
        {pages.map((p, i) => (
          <li key={p.src}>
            <button type="button" onClick={() => open(i)} className={s.thumbBtn} aria-label={`${p.cap} 크게 보기`}>
              {/* 배지는 종이 안 — 마우스를 올리면 종이와 같이 뜬다 */}
              <span className={`${s.paper} relative block overflow-hidden rounded-[clamp(4px,0.4vw,8px)]`}>
                <Image src={p.src} alt={`${p.cap} — ${p.sub}`} width={PAGE_W} height={PAGE_H} sizes="(max-width: 768px) 46vw, 31vw" draggable={false} className="h-auto w-full" />
                <span
                  aria-hidden
                  className="absolute bottom-[clamp(6px,0.7vw,14px)] right-[clamp(6px,0.7vw,14px)] inline-flex items-center gap-[0.3em] rounded-full bg-[var(--ff-ink)] px-[0.75em] py-[0.45em] text-[clamp(13px,0.35vw_+_10.5px,19px)] font-black leading-none text-[var(--ff-yellow)] shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                >
                  <ZoomIcon />
                  크게 보기
                </span>
              </span>
            </button>
            <p className="mt-[clamp(10px,1vw,18px)]">
              <span className={`${s.display} ${s.tH4} block`}>{capDisplay(p.cap)}</span>
              <span className={`${s.tSmall} block font-bold text-[var(--ff-dim-ink)]`}>{keepMarks(p.sub)}</span>
            </p>
          </li>
        ))}
      </ul>

      {/* 포커스 고리는 노랑 — 이 창은 노랑 섹션(.onYellow: 검정 고리) 안에 있어 검정 바탕에서 고리가 사라졌다. 모듈 규칙을 이기려고 ! */}
      <dialog
        ref={dlg}
        className={`${s.lightbox} [&_:focus-visible]:outline-[color:var(--ff-yellow)]!`}
        aria-label={cur ? `${cur.cap} 크게 보기` : "크게 보기"}
        onClick={closeOnBg}
      >
        {cur ? (
          <div className={`grid h-full grid-rows-[auto_minmax(0,1fr)_auto] ${wide ? "" : "sm:grid-rows-[auto_minmax(0,1fr)]"}`} onClick={closeOnBg}>
            <div className="flex items-center justify-between gap-[12px] px-[clamp(12px,2vw,32px)] py-[12px]">
              <p className="min-w-0">
                <span className={`${s.display} ${s.tH4} block text-[var(--ff-yellow)]`}>{capDisplay(cur.cap)}</span>
                <span className={`${s.tSmall} block font-bold text-[var(--ff-dim)]`}>
                  {keepMarks(cur.sub)}
                  {ko(` · ${(idx ?? 0) + 1}/${pages.length} · `)}
                  {/* 가로 화면의 확대는 1276 아래에서 폭 맞춤(100% 미만)이라 「100%」라고 하지 않는다 */}
                  <span className="whitespace-nowrap">{zoom ? "이미지를 누르면 화면 맞춤" : "이미지를 누르면 크게"}</span>
                </span>
              </p>
              <button type="button" onClick={close} className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full border-2 border-white/40 text-[1.5rem] font-black" aria-label="닫기">
                ✕
              </button>
            </div>

            {/* 스크롤 상자 — 맞춤: 남은 칸(크기 컨테이너)에 들어가는 가장 큰 크기 / 확대: 가로 화면은 min(원본, 칸) 폭으로 위아래만,
                세로 화면은 원본 폭(1131px)으로 위아래·좌우 스크롤 */}
            <div ref={stage} className={`col-start-1 row-start-2 min-h-0 ${zoom ? "overflow-auto overscroll-contain" : "overflow-hidden"}`} onClick={closeOnBg}>
              <div
                className={
                  !zoom
                    ? `grid h-full place-items-center ${PAD_X} pb-[clamp(8px,2vw,32px)] [container-type:size]`
                    : wide
                      ? `mx-auto w-max ${PAD} pb-[clamp(8px,2vw,32px)]`
                      : `w-full ${PAD_X} pb-[clamp(8px,2vw,32px)]`
                }
                onClick={closeOnBg}
              >
                <button
                  ref={shot}
                  type="button"
                  onClick={toggleZoom}
                  aria-pressed={zoom}
                  aria-label="크게 보기"
                  className={`mx-auto block rounded-[6px] ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                  style={{ width: !zoom ? `min(100cqw, ${((100 * PAGE_W) / PAGE_H).toFixed(4)}cqh)` : wide ? PAGE_W : `min(${PAGE_W}px, 100%)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 원본 해상도 그대로(100% 보기·핀치 줌) */}
                  <img src={cur.src} alt={`${cur.cap} — ${cur.sub}`} width={PAGE_W} height={PAGE_H} draggable={false} className="block h-auto w-full rounded-[6px] bg-white shadow-2xl" />
                </button>
              </div>
            </div>

            {/* 넘김 — sm 미만·세로 화면 확대: 무대 아래 한 줄 / 그 밖의 sm 이상: 스크롤 상자에 겹쳐 좌우 가운데(이미지 옆 여백 PAD_X 에 앉는다) */}
            <div className={`col-start-1 row-start-3 flex items-center justify-center gap-[clamp(24px,10vw,48px)] px-[12px] pb-[max(12px,env(safe-area-inset-bottom))] pt-[4px] ${wide ? "" : NAV_OVER}`}>
              <button type="button" onClick={() => step(-1)} className={NAV_BTN} aria-label="이전 장">
                <Arrow className="rotate-180" />
              </button>
              <button type="button" onClick={() => step(1)} className={NAV_BTN} aria-label="다음 장">
                <Arrow />
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
