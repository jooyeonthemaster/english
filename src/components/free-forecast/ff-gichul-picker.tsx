"use client";

// 「기출 DB에서 고르기」 — 학평·모평·수능 시험지를 고르고 범위 지문(문항번호)을 체크한다.
// 목록은 공개 API(/api/free-forecast/catalog)에서 한 번만 받아 모듈에 캐시한다(본문 없음).
// <dialog>.showModal() — 포커스 가둠·뒤 페이지 막기·Esc 닫기가 내장. 닫으면 연 버튼으로 포커스를 되돌린다.
// DB 에 지문이 일부만 있는 회차(최신 2026 9월 학평·2027 9월 모평은 1~2지문)는 「일부만」 배지,
// 범위 번호를 쳤는데 DB 에 없는 번호는 입력칸 아래에 알린다 — 빠진 번호를 모른 채 담지 않게.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FF_MAX_PAPERS_PER_SLOT, ffFoldNums, ffQLabel, type FfCatalogPaper, type FfGichulPick } from "@/lib/free-forecast/constants";
import { ko, koNode } from "./ff-text";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

let catalogCache: FfCatalogPaper[] | null = null;

const key = (q: number[]) => q.join(",");

/** 지문이 이보다 적으면 「일부만」 — 온전한 회차는 17~27지문 */
const PARTIAL_UNDER = 15;

/** 「20~24, 29-42, 31」 → 그 번호를 하나라도 품은 지문.
 *  먼저 「번」을 지우고 범위 기호 양옆 공백을 붙인다 — 「20 ~ 24」「20번~24번」「20 – 24」가 띄어 쓴 조각으로 갈려 0~2지문만 잡혔다(2차 검수) */
function parseRanges(text: string): Set<number> {
  const out = new Set<number>();
  // 범위 기호 — 물결(~ U+223C U+301C U+FF5E)·붙임표(- U+2010 U+2011 U+2012)·줄표(U+2013 U+2014)·빼기(U+2212).
  // U+223C·U+2014·U+2010 으로 쓴 「20~24」가 안 잡혔다(3차 R3-22). 비슷하게 생긴 글자라 소스에는 이스케이프로 둔다
  const norm = text.replace(/번/g, "").replace(/\s*([~\-\u2010\u2011\u2012\u2013\u2014\u2212\u223C\u301C\uFF5E])\s*/g, "$1");
  for (const part of norm.split(/[,\s/]+/)) {
    const m = part.match(/^(\d{1,2})(?:[~\-\u2010\u2011\u2012\u2013\u2014\u2212\u223C\u301C\uFF5E](\d{1,2}))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
  }
  return out;
}

interface Props {
  slotTitle: string;
  initial: FfGichulPick[];
  onClose: () => void;
  onApply: (picks: FfGichulPick[]) => void;
}

/** 학년·연도 칩 — 높이·좌우 여백은 모듈(.pkChip — 낮은 화면에서 낮추고, 380px 미만에서 여백을 줄인다) */
const chip = `${u.pkChip} rounded-full border-2 border-black text-[clamp(15px,0.3vw+13px,18px)] font-black`;

/** 좁은 폰(380px 미만) — 연도 칸 첫 항목을 「연도」로 줄여 「고1 고2 고3 연도」가 한 줄에 들어가게(ff-upload.module.css 의 같은 경계) */
const NARROW_Q = "(max-width: 379px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_Q).matches,
    () => false,
  );
}

export function FfGichulPicker({ slotTitle, initial, onClose, onApply }: Props) {
  const narrow = useNarrow();
  const [papers, setPapers] = useState<FfCatalogPaper[] | null>(catalogCache);
  const [error, setError] = useState("");
  const [grade, setGrade] = useState("고2");
  const [year, setYear] = useState<number | "all">("all");
  const [open, setOpen] = useState<string | null>(initial[0]?.examId ?? null);
  const [sel, setSel] = useState<Record<string, Set<string>>>(() => Object.fromEntries(initial.map((p) => [p.examId, new Set(p.q.map(key))])));
  const [rangeText, setRangeText] = useState("");
  /** 마지막으로 적용한 범위 중 DB 에 없는 번호(그 시험지에만 보인다) */
  const [rangeMiss, setRangeMiss] = useState<{ examId: string; text: string } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (catalogCache) return;
    fetch("/api/free-forecast/catalog")
      .then((r) => r.json())
      .then((j: { papers: FfCatalogPaper[] }) => {
        catalogCache = j.papers;
        setPapers(j.papers);
      })
      .catch(() => setError("기출 목록을 불러오지 못했습니다. 파일로 올려 주세요."));
  }, []);

  // 열 때 showModal, 닫힐 때(언마운트) 연 버튼으로 포커스 되돌리기
  useEffect(() => {
    const el = dlg.current;
    const opener = document.activeElement as HTMLElement | null;
    if (el && !el.open) el.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    el?.addEventListener("cancel", onCancel);
    return () => {
      el?.removeEventListener("cancel", onCancel);
      if (el?.open) el.close();
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const years = useMemo(() => Array.from(new Set((papers ?? []).filter((p) => p.g === grade).map((p) => p.y))).sort((a, b) => b - a), [papers, grade]);
  const list = useMemo(() => (papers ?? []).filter((p) => p.g === grade && (year === "all" || p.y === year)), [papers, grade, year]);
  const chosenPapers = Object.entries(sel).filter(([, v]) => v.size > 0);
  const total = chosenPapers.reduce((n, [, v]) => n + v.size, 0);

  const toggle = (examId: string, q: number[]) =>
    setSel((prev) => {
      const next = new Set(prev[examId] ?? []);
      if (next.has(key(q))) next.delete(key(q));
      else next.add(key(q));
      return { ...prev, [examId]: next };
    });

  const setAll = (paper: FfCatalogPaper, on: boolean) => setSel((prev) => ({ ...prev, [paper.e]: on ? new Set(paper.p.map(([q]) => key(q))) : new Set() }));

  const applyRange = (paper: FfCatalogPaper) => {
    const nums = parseRanges(rangeText);
    if (!nums.size) {
      // 쳤는데 번호를 하나도 못 읽었으면 — 아무 일도 안 일어나 고장으로 읽혔다. 선택은 그대로 둔다
      if (rangeText.trim()) setRangeMiss({ examId: paper.e, text: "번호를 못 읽었습니다 — 예: 20~24, 29~42" });
      return;
    }
    const have = new Set(paper.p.flatMap(([q]) => q));
    const miss = [...nums].filter((n) => !have.has(n));
    setRangeMiss(miss.length ? { examId: paper.e, text: `${ffFoldNums(miss)}번은 DB에 없습니다 — 파일로 올려 주세요` } : null);
    setSel((prev) => ({ ...prev, [paper.e]: new Set(paper.p.filter(([q]) => q.some((n) => nums.has(n))).map(([q]) => key(q))) }));
  };

  const apply = () => {
    const byId = new Map((papers ?? []).map((p) => [p.e, p]));
    const picks: FfGichulPick[] = [];
    for (const [examId, set] of chosenPapers.slice(0, FF_MAX_PAPERS_PER_SLOT)) {
      const paper = byId.get(examId);
      if (!paper) continue;
      picks.push({ examId, title: paper.t, q: paper.p.map(([q]) => q).filter((q) => set.has(key(q))) });
    }
    onApply(picks);
  };

  return (
    <dialog
      ref={dlg}
      className={u.picker}
      aria-label="기출 DB에서 고르기"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      {/* 창 높이·머리 여백·제목 글자·닫기·칩·담기 줄 치수와 부제 보임은 모듈(.pk*) — 낮은 화면(높이 500px 이하)에서 조이고 부제를 접는다 */}
      <div className={`${u.pkBox} flex w-full flex-col overflow-hidden rounded-t-[28px] border-4 border-black bg-[var(--ff-cream)] text-[var(--ff-ink)] sm:rounded-[28px]`}>
        <div className={`${u.pkHead} border-b-4 border-black bg-[var(--ff-yellow)] px-[20px]`}>
          <div className="flex items-center justify-between gap-[12px]">
            <h3 className={`${s.display} ${u.pkTitle}`}>기출 DB에서 고르기</h3>
            <button type="button" onClick={() => closeRef.current()} className={`${u.pkClose} grid shrink-0 place-items-center rounded-full text-[1.75rem] font-black hover:bg-black/10`} aria-label="닫기">
              ✕
            </button>
          </div>
          {/* 380px 미만은 앞 마디(어느 칸에 담는지)만 한 줄 — 뒤 마디(.pkSubMore)는 목록 모양이 이미 말한다 */}
          <p className={`${u.pkSub} mt-[4px] text-[clamp(15px,0.3vw+13px,18px)] font-bold`}>
            {koNode(
              <>
                「{slotTitle}」 칸에 담습니다
                {/* 「 · 」는 한 문자열 — ko 가 점 앞 공백을 줄바꿈 없는 공백으로 묶는다(조각으로 나뉘면 「·」가 줄머리에 올 수 있다) */}
                <span className={u.pkSubMore}>
                  {" · "}
                  <span className="whitespace-nowrap">시험지를 열고 범위 번호를 체크하세요</span>
                </span>
              </>,
            )}
          </p>
          <div className={`${u.pkChips} flex flex-wrap items-center gap-[8px]`}>
            {["고1", "고2", "고3"].map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={grade === g}
                onClick={() => {
                  setGrade(g);
                  setYear("all");
                }}
                className={`${chip} ${grade === g ? "bg-black text-[var(--ff-yellow)]" : "bg-white"}`}
              >
                {g}
              </button>
            ))}
            <select value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} className={`${chip} bg-white`} aria-label="연도">
              <option value="all">{narrow ? "연도" : "전체 연도"}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[16px]">
          {error ? <p className="py-[40px] text-center font-black text-[var(--ff-red-ink)]">{error}</p> : null}
          {!papers && !error ? <p className="py-[40px] text-center font-black">불러오는 중…</p> : null}
          <ul className="space-y-[8px]">
            {list.map((paper) => {
              const set = sel[paper.e];
              const n = set?.size ?? 0;
              const isOpen = open === paper.e;
              return (
                <li key={paper.e} className={`rounded-2xl border-2 border-black bg-white ${n ? "ring-4 ring-[var(--ff-red)]" : ""}`}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : paper.e)} className="flex min-h-[52px] w-full items-center gap-[12px] px-[16px] py-[10px] text-left">
                    <span className="min-w-0 flex-1 text-[clamp(15px,0.3vw+13px,18px)] font-black">
                      {paper.t}
                      {/* 앞 공백으로 띄운다(margin 이면 다음 줄로 접힐 때 왼끝이 들여 쓰인다) */}
                      {paper.p.length < PARTIAL_UNDER ? (
                        <>
                          {" "}
                          <span className="inline-block whitespace-nowrap rounded-full border-2 border-dashed border-[var(--ff-ink)] px-[8px] align-middle text-[0.8125rem] font-black leading-[1.35]">
                            일부만 · {paper.p.length}지문
                          </span>
                        </>
                      ) : null}
                    </span>
                    {n ? <span className="shrink-0 rounded-full bg-[var(--ff-red-ink)] px-[8px] py-[2px] text-[0.875rem] font-black text-white">{n}지문</span> : null}
                    <span className="shrink-0 text-[1.25rem] font-black" aria-hidden>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t-2 border-black px-[16px] py-[12px]">
                      {/* 폰: 입력칸 한 줄 전체, 적용·전부는 다음 줄 반반 / sm 이상: 한 줄 */}
                      <div className="flex flex-wrap items-center gap-[8px]">
                        <input
                          value={rangeText}
                          onChange={(e) => {
                            setRangeText(e.target.value);
                            setRangeMiss(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && applyRange(paper)}
                          placeholder="번호로 한 번에: 20~24, 29~42"
                          aria-label="번호 범위로 고르기"
                          aria-describedby={`ff-miss-${paper.e}`}
                          className="min-h-[44px] min-w-0 grow basis-full rounded-xl border-2 border-black px-[12px] text-[clamp(15px,0.3vw+13px,18px)] font-bold sm:basis-auto"
                        />
                        <button type="button" onClick={() => applyRange(paper)} className="min-h-[44px] grow rounded-xl border-2 border-black bg-[var(--ff-yellow)] px-[14px] text-[clamp(15px,0.3vw+13px,18px)] font-black sm:grow-0">
                          적용
                        </button>
                        <button type="button" onClick={() => setAll(paper, n < paper.p.length)} className="min-h-[44px] grow rounded-xl border-2 border-black bg-white px-[14px] text-[clamp(15px,0.3vw+13px,18px)] font-black sm:grow-0">
                          {n < paper.p.length ? "전부" : "전부 해제"}
                        </button>
                      </div>
                      {/* 범위 중 DB 에 없는 번호 — 늘 있는 알림 구역이라 적용하는 순간 화면 낭독기도 읽는다 */}
                      <p id={`ff-miss-${paper.e}`} aria-live="polite" className={rangeMiss?.examId === paper.e ? "mt-[8px] text-[clamp(14px,0.3vw+12px,17px)] font-black text-[var(--ff-red-ink)]" : ""}>
                        {rangeMiss?.examId === paper.e ? ko(rangeMiss.text) : null}
                      </p>
                      <div className="mt-[12px] grid grid-cols-3 gap-[8px] sm:grid-cols-5">
                        {paper.p.map(([q, t], i) => {
                          const on = set?.has(key(q)) ?? false;
                          // 열쇠에 순번 — 같은 번호 지문이 둘인 회차가 있어 key(q) 만이면 React 열쇠가 겹쳤다(3차 R3-22)
                          return (
                            <button key={`${i}-${key(q)}`} type="button" aria-pressed={on} onClick={() => toggle(paper.e, q)} className={`rounded-xl border-2 border-black px-[8px] py-[8px] text-left ${on ? "bg-black text-[var(--ff-yellow)]" : "bg-white"}`}>
                              {/* 「41-42」가 320 에서 「41- / 42」로 쪼개졌다 — 한 줄로, 좁은 폰에서만 18px 까지 */}
                              <span className={`${s.display} block whitespace-nowrap text-[clamp(18px,5.6vw,22px)]`}>{ffQLabel(q)}</span>
                              <span className="block truncate text-[0.875rem] font-bold" title={t}>
                                {t}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${u.pkFoot} flex items-center gap-[12px] border-t-4 border-black bg-white px-[16px]`}>
          <span className="min-w-0 flex-1 text-[clamp(15px,0.3vw+13px,18px)] font-black">
            {chosenPapers.length}회분 · {total}지문 선택
            {chosenPapers.length > FF_MAX_PAPERS_PER_SLOT ? ` (앞 ${FF_MAX_PAPERS_PER_SLOT}회분만 담깁니다)` : ""}
          </span>
          <button type="button" onClick={apply} className={`${s.display} ${u.pkApply} rounded-2xl border-4 border-black bg-[var(--ff-red-ink)] px-[24px] text-[1.5rem] text-white`}>
            담기 빡!
          </button>
        </div>
      </div>
    </dialog>
  );
}
