"use client";

// 업로드 칸 하나 — 화면 폭과 상관없이 세 칸이 가로로 나란히 보이게 설계한다.
//   md 이상: 큰 카드(제목·안내·눌러서/끌어다 놓는 칸·올린 파일·아래 칸)
//   md 미만: 작은 타일(번호·두 줄 제목·상태) — 목록과 기출 DB 버튼은 카드 줄 아래에 같은 3열로.
// 세 카드의 줄(제목·안내·놓는 칸·아래 칸)은 가로로 맞춘다: 놓는 칸은 늘지도 줄지도 않고(세 카드 내용이 같아 높이도 같다),
// 남는 높이는 올린 파일 목록이 받고, 아래 칸은 늘 카드 바닥에 붙는다.

import { useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ffBytes, ffFoldNums, type FfGichulPick, type FfSlotDef, type FfSlotKey } from "@/lib/free-forecast/constants";
import { Arrow, ko } from "./ff-text";
import type { FfFileItem, FfSlotStat } from "./use-ff-request";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

/** 실패가 먼저 — 좁은 칸에서 말줄임되어도 「⚠ 1개 실패」가 보인다(완료가 먼저면 「✓ 파일 1개 · ⚠ 1개 …」로 실패가 잘렸다 — 2차 검수) */
export function ffStatusText(st: FfSlotStat): string {
  if (st.uploading) return `올리는 중 ${Math.round(st.progress * 100)}%`;
  const parts = [st.done ? `파일 ${st.done}개` : "", st.picked ? `DB ${st.picked}지문` : ""].filter(Boolean);
  const ok = parts.length ? `✓ ${parts.join(" + ")}` : "";
  const bad = st.failed ? `⚠ ${st.failed}개 실패` : "";
  return [bad, ok].filter(Boolean).join(" · ");
}

/** 좁은 칸(md 미만 타일·하단 막대 칸 — 폭 50~65px)용 한 줄 상태. 화면 낭독기·md 이상은 ffStatusText 전체 문구 */
export function ffStatusShort(st: FfSlotStat): string {
  if (st.uploading) return `${Math.round(st.progress * 100)}%`;
  const ok = st.done && st.picked ? `${st.done}+DB` : st.done ? `${st.done}개` : st.picked ? `DB ${st.picked}` : "";
  if (st.failed) return ok ? `✓${st.done || "DB"} ⚠${st.failed}` : "⚠ 실패";
  return ok ? `✓ ${ok}` : "";
}

function useDrop(onFiles: (f: FileList) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    bind: {
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
    },
  };
}

interface Props {
  def: FfSlotDef;
  stat: FfSlotStat;
  files: FfFileItem[];
  picks: FfGichulPick[];
  onPick: () => void;
  onFiles: (list: FileList) => void;
  onRemove: (id: string) => void;
  onRemovePick: (examId: string) => void;
  onOpenDb: () => void;
}

/** ✕ 로 뺀 뒤 포커스 갈 곳 — 같은 목록의 다음 ✕(없으면 이전 ✕), 목록이 비면 그 칸의 보이는 컨트롤(md 이상 놓는 칸·md 미만 타일).
 *  빼고 나면 누른 ✕ 가 사라져 포커스가 BODY 로 떨어졌다(2차 검수) */
function rmNext(me: HTMLElement, slot: FfSlotKey): HTMLElement | null {
  const mates = [...(me.closest("ul")?.querySelectorAll<HTMLElement>("[data-ff-rm]") ?? [])];
  const i = mates.indexOf(me);
  return mates[i + 1] ?? mates[i - 1] ?? [...document.querySelectorAll<HTMLElement>(`[data-ff-slot="${slot}"]`)].find((el) => el.offsetParent !== null) ?? null;
}

/** 빼기 ✕ — 눈에 보이는 글자는 작아도 누르는 곳은 44px. 줄이 둘로 접히면 둘째 줄 오른끝(ml-auto).
 *  포커스 이동은 마우스·손가락(detail ≥ 1)으로 눌렀을 때도 같게 하되 화면은 움직이지 않는다(preventScroll) */
function RemoveBtn({ label, slot, onClick }: { label: string; slot: FfSlotKey; onClick: () => void }) {
  const remove = (e: MouseEvent<HTMLButtonElement>) => {
    const next = rmNext(e.currentTarget, slot);
    onClick();
    next?.focus({ preventScroll: e.detail > 0 });
  };
  return (
    <button type="button" data-ff-rm="" onClick={remove} className={`${u.rmBtn} -my-[12px] -mr-[8px] ml-auto grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-[1.125rem] font-black hover:bg-black/10`} aria-label={label}>
      ✕
    </button>
  );
}

/** 올린 파일 줄 글자 — 이름 / 배지·크기·사유. 1600px 이하는 15px·13px 그대로, 그 위로 19px·16px 까지(3차 R3-35: 2560 에서 작았다) */
const ROW_NAME = "text-[clamp(15px,0.4vw+8.6px,19px)]";
const ROW_META = "text-[clamp(13px,0.3vw+8.2px,16px)]";

/** 넘칠 때도 늘 보이는 이름 끝 글자 수 */
const NAME_TAIL = 10;

let measureCtx: CanvasRenderingContext2D | null = null;

/** 칸에 들어가는 이름 — 들어가면 그대로, 넘치면 「앞 k자…뒤 10자」(k 는 들어가는 만큼 — 넓으면 12자 넘게). 글자 폭은 캔버스로 잰다 */
function middleEllipsis(el: HTMLElement, name: string): string {
  const chars = Array.from(name);
  // 캔버스와 실제 글자 배치의 소수점 차이 몫 2px
  const avail = el.clientWidth - 2;
  if (chars.length <= NAME_TAIL + 2 || avail <= 0) return name;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx) return name;
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if (ctx.measureText(name).width <= avail) return name;
  const tail = chars.slice(-NAME_TAIL).join("");
  const fits = (k: number) => ctx.measureText(`${chars.slice(0, k).join("")}…${tail}`).width <= avail;
  let lo = 0;
  let hi = chars.length - NAME_TAIL - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join("")}…${tail}`;
}

/** 파일 이름 — 넘치면 가운데를 줄인다. 끝만 자르면 앞부분이 같은 사진(IMG_20261008_143022_1·2·3.jpg)이 「IMG_2026100…」으로
 *  똑같아 보였다(3차 R3-18). CSS(앞 조각 말줄임 + 뒤 조각)로 하면 잘린 글자 폭만큼 「…」 뒤가 비어 띄어쓰기처럼 보여 폭을 재서 맞춘다.
 *  보이는 글자는 React 가 그리지 않는 빈 span 에 적는다(칸 폭·글꼴이 바뀌면 다시) — 화면 낭독기는 숨은 전체 이름을 읽는다 */
function FileName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.textContent = middleEllipsis(el, name);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", fit);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener("loadingdone", fit);
    };
  }, [name]);
  return (
    <>
      <span className="sr-only">{name}</span>
      <span ref={ref} aria-hidden className="block overflow-hidden whitespace-pre" />
    </>
  );
}

/** 올린 파일 한 줄 — 접히는 규칙은 ff-upload.module.css 의 .fileRow(좁은 카드는 이름이 첫 줄 전체, 실패 사유는 늘 아래 줄 전체) */
export function FfFileRow({ f, slot, onRemove }: { f: FfFileItem; slot: FfSlotKey; onRemove: () => void }) {
  return (
    <li className="relative overflow-hidden rounded-[10px] border-2 border-[var(--ff-ink)] bg-white">
      {f.status === "uploading" ? <span className="absolute inset-y-0 left-0 bg-[var(--ff-yellow)]" style={{ width: `${Math.round(f.progress * 100)}%` }} /> : null}
      <span className={`${u.fileRow} relative px-[10px] py-[8px]`}>
        <span className={`shrink-0 rounded-md px-[6px] py-[2px] ${ROW_META} font-black ${f.status === "done" ? "bg-[var(--ff-ink)] text-white" : f.status === "error" ? "bg-[var(--ff-red-ink)] text-white" : "bg-white text-[var(--ff-ink)]"}`}>
          {f.status === "done" ? "완료" : f.status === "error" ? "실패" : `${Math.round(f.progress * 100)}%`}
        </span>
        <span className={`${u.fileName} min-w-0 flex-1 ${ROW_NAME} font-bold`} title={f.name}>
          <FileName name={f.name} />
        </span>
        <span className={`${u.fileMeta} ${f.error ? u.fileErr : ""} ${ROW_META} font-bold ${f.error ? "text-[var(--ff-red-ink)]" : "text-[var(--ff-dim-ink)]"}`}>{f.error ? ko(f.error) : ffBytes(f.size)}</span>
        <RemoveBtn label={`${f.name} 빼기`} slot={slot} onClick={onRemove} />
      </span>
    </li>
  );
}

/** 기출 DB 에서 고른 시험지 한 줄 — 글자는 올린 파일 줄과 같은 크기 */
export function FfPickRow({ p, slot, onRemove }: { p: FfGichulPick; slot: FfSlotKey; onRemove: () => void }) {
  return (
    <li className="flex items-start gap-[8px] rounded-[10px] border-2 border-[var(--ff-ink)] bg-[var(--ff-yellow)] px-[10px] py-[8px]">
      <span className={`mt-[2px] shrink-0 rounded-md bg-[var(--ff-ink)] px-[6px] py-[2px] ${ROW_META} font-black text-[var(--ff-yellow)]`}>DB</span>
      <span className={`min-w-0 flex-1 ${ROW_NAME} font-black leading-snug`}>
        {p.title}
        <span className="block font-bold text-[var(--ff-dim-ink)]">
          {/* 이어진 번호는 묶는다 — 「20, 21, 22, 23, 24번 · 5지문」이 320 에서 「· 5지문」만 다음 줄로 갔다(3차 R3-11) */}
          {ko(`${ffFoldNums(p.q.flat())}번 · ${p.q.length}지문`)}
        </span>
      </span>
      <RemoveBtn label={`${p.title} 빼기`} slot={slot} onClick={onRemove} />
    </li>
  );
}

export function FfSlotCard({ def, stat, files, picks, onPick, onFiles, onRemove, onRemovePick, onOpenDb }: Props) {
  const drop = useDrop(onFiles);
  const status = ffStatusText(stat);
  // 타일 상태 글자색 — 올리는 중·완료는 잉크, 실패만 빨강. 빈 칸의 「＋ 올리기」는 누르라는 빨강
  const tileTone = stat.uploading || stat.ready ? "text-[var(--ff-ink)]" : "text-[var(--ff-red-ink)]";
  // 완료와 실패가 섞인 타일 — 노랑·✓ 만이면 실패가 안 보였다(3차 R3-19). 빨강 테두리 + 「⚠N」 부분만 빨강(막대 칸의 섞임 표시와 같은 뜻)
  const short = ffStatusShort(stat);
  const mixed = stat.ready && stat.failed > 0;
  const warnAt = mixed ? short.indexOf("⚠") : -1;

  return (
    <div className="flex min-w-0 flex-col">
      {/* md 미만 — 작은 타일. 상태는 한 줄 짧은 문구(320 에서 「올리는 중 0%」가 두 줄이 되어 세 타일의 상태 기준선이 어긋났다) */}
      <button
        type="button"
        onClick={onPick}
        {...drop.bind}
        data-ff-slot={def.key}
        className={`${s.card} ${mixed ? u.cardWarn : ""} relative flex h-full flex-col items-start p-[10px] text-left md:hidden ${stat.ready ? "bg-[var(--ff-yellow)]" : "bg-white"} ${drop.over ? u.dropActive : ""}`}
        aria-label={`${def.no}번 ${def.title} — ${status || "비어 있음, 눌러서 올리기"}`}
      >
        <span className={`${s.display} flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[var(--ff-red-ink)] text-[1.625rem] text-white`}>{def.no}</span>
        <span className={`${s.display} mt-[8px] block text-[clamp(16px,4.6vw,22px)] text-[var(--ff-ink)]`}>
          {def.lines[0]}
          <br />
          {def.lines[1]}
        </span>
        <span className={`mt-auto block w-full truncate pt-[8px] text-[0.8125rem] font-black leading-tight ${tileTone}`}>
          {warnAt > 0 ? (
            <>
              {short.slice(0, warnAt)}
              <span className={u.warnInk}>{short.slice(warnAt)}</span>
            </>
          ) : (
            short || "＋ 올리기"
          )}
        </span>
      </button>

      {/* md 이상 — 큰 카드 */}
      <div
        className={`${s.card} ${u.slotCard} hidden h-full flex-col bg-white p-[clamp(14px,1.4vw,28px)] text-[var(--ff-ink)] md:flex`}
        style={stat.ready ? { boxShadow: "var(--shadow) var(--shadow) 0 0 var(--ff-red)" } : undefined}
      >
        <div className="flex items-center justify-between gap-[12px]">
          <span className={`${s.display} flex h-[1.35em] w-[1.35em] items-center justify-center rounded-[0.2em] bg-[var(--ff-red-ink)] text-[clamp(40px,3.6vw,96px)] text-white`}>{def.no}</span>
          {stat.ready ? (
            <span className={`${s.display} rounded-[0.25em] bg-[var(--ff-ink)] px-[0.45em] py-[0.2em] text-[clamp(16px,1.3vw,32px)] text-[var(--ff-yellow)]`}>OK!</span>
          ) : (
            <span className={`${s.display} text-[clamp(26px,2.4vw,64px)] text-[var(--ff-red)]`}>빡!</span>
          )}
        </div>
        {/* 제목 한 줄·글자 크기·글꼴 대기는 모듈 .slotTitle(.root h3 의 text-wrap:balance 가 Tailwind whitespace-nowrap 을 이겼다 — 3차 R3-20) */}
        <div className={`${s.fit} mt-[clamp(10px,1vw,20px)]`}>
          <h3 data-fit="slotTitle" className={`${s.display} ${u.slotTitle}`}>
            {def.title}
          </h3>
        </div>
        {/* 안내 두 줄 자리 — 한 줄·두 줄 안내가 섞여도 놓는 칸이 같은 높이에서 시작한다. 세 안내가 다 한 줄이 되는 폭부터는 빈 줄이라 푼다.
            경계는 실측: 가장 긴 ① 안내(「지난 시험(1학기 중간·기말 등)의 …」)가 1324px 부터 한 줄 — 여유 7px 이상인 1360px 에서 푼다.
            안내 문구를 바꾸면 경계를 다시 잰다(작업 폴더 r3/upload/hint-edge.mjs) */}
        <p className={`${s.tSmall} mt-[8px] min-h-[3.1em] font-semibold text-[var(--ff-dim-ink)] min-[1360px]:min-h-0`}>{ko(def.hint)}</p>

        {/* 놓는 칸 — flex-1 이면 목록이 생긴 카드만 줄어 「여기에 빡!」·칩이 옆 카드와 25~78px 어긋났다. 내용 높이 그대로(세 카드 같음) */}
        <button
          type="button"
          onClick={onPick}
          {...drop.bind}
          data-ff-slot={def.key}
          aria-label={`${def.no}번 ${def.title} 올리기 — ${status || "비어 있음"}`}
          className={`${u.drop} mt-[clamp(12px,1.2vw,22px)] flex min-h-[clamp(120px,8.4vw,210px)] shrink-0 flex-col items-center justify-center bg-[var(--ff-cream)] px-[12px] py-[clamp(14px,1.4vw,28px)] hover:bg-[var(--ff-yellow)] ${drop.over ? u.dropActive : ""}`}
        >
          <span className={`${s.display} ${u.dropTitle}`}>
            여기에 <span className="text-[var(--ff-red)]">빡!</span>
          </span>
          <span className={`${s.tSmall} mt-[0.7em] text-center font-black`}>
            <span className={u.fineOnly}>
              끌어다 놓거나 <span className="whitespace-nowrap">눌러서 고르기</span>
            </span>
            <span className={u.coarseOnly}>{ko("눌러서 고르기 · 사진 찍기")}</span>
          </span>
          <span className="mt-[clamp(10px,1vw,18px)] flex flex-wrap justify-center gap-[6px]">
            {[
              ["PDF", "사진", "한글"],
              ["워드", "PPT"],
            ].map((grp) => (
              <span key={grp[0]} className={u.chipGroup}>
                {grp.map((f) => (
                  <span key={f} className="rounded-full border-2 border-[var(--ff-ink)] bg-white px-[10px] py-[2px] text-[clamp(13px,0.3vw+10.5px,18px)] font-black">
                    {f}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </button>

        {/* 올린 파일 — 카드에서 남는 높이를 받는다(옆 카드 목록이 더 길 때). 많으면 260px 에서 스크롤 */}
        {files.length || picks.length ? (
          <ul className="mt-[12px] max-h-[260px] min-h-0 flex-1 space-y-[6px] overflow-y-auto pr-[2px]">
            {picks.map((p) => (
              <FfPickRow key={p.examId} p={p} slot={def.key} onRemove={() => onRemovePick(p.examId)} />
            ))}
            {files.map((f) => (
              <FfFileRow key={f.id} f={f} slot={def.key} onRemove={() => onRemove(f.id)} />
            ))}
          </ul>
        ) : null}

        {/* 아래 칸 — 늘 카드 바닥(세 카드의 DB 버튼·📸 줄이 맞는다) */}
        <div className="mt-auto pt-[12px]">
          {def.gichul ? (
            <button
              type="button"
              onClick={onOpenDb}
              className={`${u.slotFoot} flex w-full items-center justify-between gap-[12px] rounded-[12px] border-2 border-[var(--ff-ink)] bg-[var(--ff-ink)] px-[clamp(12px,1vw,20px)] text-left text-white transition-transform hover:-translate-y-0.5`}
            >
              <span className="min-w-0">
                <span data-ff-glyphs className={`${s.display} ${u.dbLabel} block ${s.lhTight} text-[var(--ff-yellow)]`}>기출 DB에서 고르기</span>
                <span className={`${s.tSmall} block font-bold text-[var(--ff-dim)]`}>
                  {ko("모의고사·수능 지문이면")} <span className="whitespace-nowrap">파일 없이</span>
                </span>
              </span>
              <span className="shrink-0 text-[clamp(22px,1.6vw,38px)] text-[var(--ff-yellow)]">
                <Arrow />
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPick}
              className={`${u.slotFoot} flex w-full items-center gap-[10px] rounded-[12px] border-2 border-black/15 bg-[var(--ff-cream)] px-[clamp(12px,1vw,20px)] text-left hover:bg-[var(--ff-yellow)]`}
            >
              <span className="text-[1.5rem]" aria-hidden>
                📸
              </span>
              <span className={`${s.tSmall} font-black`}>
                {ko("폰 사진 OK,")} <span className="whitespace-nowrap">여러 장 한 번에</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
