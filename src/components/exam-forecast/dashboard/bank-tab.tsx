"use client";

import { useMemo, useState } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import { FORECAST_FAMILIES, FORECAST_QTYPES, type ForecastPassage, type ForecastQType, type ForecastSet } from "@/lib/exam-forecast/types";
import type { PassagePrediction } from "@/lib/exam-forecast/analysis-types";
import { FAMILY_COLOR, FC, SOURCE_COLOR, serif } from "./theme";
import type { ForecastSelection } from "./use-forecast-selection";
import { QuestionDetails, QuestionPaperView, useQuestionBodies } from "./question-card";

// 문항 은행 — 출처·지문·유형·난도·봉투 회차·종류로 걸러 체크 → 하단 트레이에서 시험지로 인쇄.

type Group = "passage" | "type" | "none";
const PAGE = 60;

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[12px] font-semibold transition"
      style={active ? { background: color ?? FC.ink, borderColor: color ?? FC.ink, color: "#fff" } : { borderColor: FC.rule, color: FC.ink }}
    >
      {children}
    </button>
  );
}

function toggleIn<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export function BankTab({
  slug,
  passages,
  questions,
  sets,
  selection,
}: {
  slug: string;
  passages: ForecastPassage[];
  questions: ForecastQuestionSummary[];
  sets: ForecastSet[];
  selection: ForecastSelection;
}) {
  const forecast = useMemo(() => questions.filter((q) => q.role === "forecast"), [questions]);
  const pById = useMemo(() => new Map(passages.map((p) => [p.id, p])), [passages]);
  const [src, setSrc] = useState<Set<string>>(new Set());
  const [fam, setFam] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [pass, setPass] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState<"ALL" | "MC" | "ESSAY">("ALL");
  const [setNo, setSetNo] = useState<number | "none" | null>(null);
  const [topOnly, setTopOnly] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const [text, setText] = useState("");
  const [group, setGroup] = useState<Group>("passage");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const availableTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of forecast) m.set(q.qtype, (m.get(q.qtype) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [forecast]);

  /** 지문별 1~3순위 예측 유형 */
  const topTypes = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of passages) {
      const pred = p.prediction as PassagePrediction;
      const top = [...(pred.predictedTypes ?? [])].sort((a, b) => b.probability - a.probability).slice(0, 3);
      m.set(p.id, new Set(top.map((t) => t.qtype)));
    }
    return m;
  }, [passages]);

  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return forecast.filter((q) => {
      const p = pById.get(q.passageId);
      if (!p) return false;
      if (src.size && !src.has(p.sourceGroup)) return false;
      if (pass.size && !pass.has(p.code)) return false;
      const meta = FORECAST_QTYPES[q.qtype];
      if (fam.size && !fam.has(meta?.family ?? "")) return false;
      if (types.size && !types.has(q.qtype)) return false;
      if (diff.size && !diff.has(q.difficulty)) return false;
      if (kind !== "ALL" && q.kind !== kind) return false;
      if (setNo === "none" && q.setNos.length) return false;
      if (typeof setNo === "number" && !q.setNos.includes(setNo)) return false;
      if (topOnly && !topTypes.get(q.passageId)?.has(q.qtype)) return false;
      if (onlySelected && !selection.has(q.id)) return false;
      if (needle && !`${p.titleKo} ${p.code} ${q.code} ${q.stem} ${meta?.label ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [forecast, pById, src, pass, fam, types, diff, kind, setNo, topOnly, onlySelected, text, topTypes, selection]);

  const ordered = useMemo(() => {
    if (group === "type") return [...filtered].sort((a, b) => a.qtype.localeCompare(b.qtype) || a.sortOrder - b.sortOrder);
    return filtered;
  }, [filtered, group]);
  const page = ordered.slice(0, limit);
  const bodies = useQuestionBodies(slug, page.filter((q) => open.has(q.id)).map((q) => q.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selection.has(q.id));

  const reset = () => {
    setSrc(new Set());
    setFam(new Set());
    setTypes(new Set());
    setPass(new Set());
    setDiff(new Set());
    setKind("ALL");
    setSetNo(null);
    setTopOnly(false);
    setOnlySelected(false);
    setText("");
  };

  const headOf = (q: ForecastQuestionSummary) => {
    const p = pById.get(q.passageId);
    if (group === "passage") return p ? `${p.code} · ${p.titleKo}` : "";
    if (group === "type") return FORECAST_QTYPES[q.qtype]?.label ?? q.qtype;
    return "";
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-5 rounded-2xl border p-5 text-[13px] lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex items-center justify-between">
          <b className={`${serif} text-[16px]`}>거르기</b>
          <button type="button" onClick={reset} className="text-[12px] underline" style={{ color: FC.sub }}>초기화</button>
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="지문 제목·코드·발문 검색" className="w-full rounded-md border bg-white px-3 py-2 text-[13px] outline-none focus:border-black" style={{ borderColor: FC.rule }} />
        <div>
          <div className="mb-1.5 font-bold">출처</div>
          <div className="flex flex-wrap gap-1.5">
            {["학평", "올림포스"].map((s) => (
              <Chip key={s} active={src.has(s)} onClick={() => setSrc(toggleIn(src, s))} color={SOURCE_COLOR[s]}>{s}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-bold">유형 계열</div>
          <div className="flex flex-wrap gap-1.5">
            {FORECAST_FAMILIES.map((f) => (
              <Chip key={f} active={fam.has(f)} onClick={() => setFam(toggleIn(fam, f))} color={FAMILY_COLOR[f]}>{f}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-bold">세부 유형</div>
          <div className="flex flex-wrap gap-1.5">
            {availableTypes.map(([t, n]) => (
              <Chip key={t} active={types.has(t)} onClick={() => setTypes(toggleIn(types, t))}>
                {FORECAST_QTYPES[t as ForecastQType]?.short ?? t} <span className="opacity-60">{n}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-bold">종류 · 난도</div>
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "MC", "ESSAY"] as const).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === "ALL" ? "전체" : k === "MC" ? "선택형" : "논술형"}</Chip>
            ))}
            {[1, 2, 3, 4, 5].map((d) => (
              <Chip key={d} active={diff.has(d)} onClick={() => setDiff(toggleIn(diff, d))}>난도 {d}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-bold">봉투 모의고사</div>
          <div className="flex flex-wrap gap-1.5">
            {sets.map((s) => (
              <Chip key={s.no} active={setNo === s.no} onClick={() => setSetNo(setNo === s.no ? null : s.no)}>{s.no}회</Chip>
            ))}
            <Chip active={setNo === "none"} onClick={() => setSetNo(setNo === "none" ? null : "none")}>봉투 미수록(확장)</Chip>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} className="accent-[#b3261e]" />
            지문별 예측 1~3순위 유형만
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-[#b3261e]" />
            담은 문항만
          </label>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between font-bold">
            지문
            {pass.size ? <button type="button" className="text-[11.5px] font-normal underline" onClick={() => setPass(new Set())}>해제</button> : null}
          </div>
          <ul className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1">
            {passages.map((p) => (
              <li key={p.code}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-black/5">
                  <input type="checkbox" checked={pass.has(p.code)} onChange={() => setPass(toggleIn(pass, p.code))} className="mt-0.5 accent-[#b3261e]" />
                  <span className="min-w-0">
                    <span className="text-[11px]" style={{ color: SOURCE_COLOR[p.sourceGroup] }}>{p.code}</span>{" "}
                    <span className="text-[12px]">{p.titleKo}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]" style={{ background: FC.card, borderColor: FC.rule }}>
          <b>
            {filtered.length}문항 <span className="font-normal" style={{ color: FC.sub }}>/ 전체 {forecast.length}</span>
          </b>
          <button
            type="button"
            onClick={() => (allFilteredSelected ? selection.removeMany(filtered.map((q) => q.id)) : selection.addMany(filtered.map((q) => q.id)))}
            className="rounded-md px-3 py-1.5 text-[12.5px] font-bold text-white"
            style={{ background: allFilteredSelected ? FC.sub : FC.red }}
          >
            {allFilteredSelected ? "걸러진 문항 모두 빼기" : "걸러진 문항 모두 담기"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span style={{ color: FC.sub }}>정렬</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="rounded-md border bg-transparent px-2 py-1" style={{ borderColor: FC.rule }}>
              <option value="passage">지문별</option>
              <option value="type">유형별</option>
              <option value="none">번호순</option>
            </select>
          </div>
        </div>

        <ul className="mt-3 space-y-1.5">
          {page.map((q, qi) => {
            const p = pById.get(q.passageId)!;
            const meta = FORECAST_QTYPES[q.qtype];
            const head = headOf(q);
            const showHead = qi === 0 || head !== headOf(page[qi - 1]);
            const isOpen = open.has(q.id);
            return (
              <li key={q.id}>
                {showHead && head ? (
                  <div className={`${serif} mb-1 mt-5 flex items-center gap-2 text-[15px] font-extrabold`}>
                    {group === "passage" ? <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_COLOR[p.sourceGroup] }} /> : null}
                    {head}
                  </div>
                ) : null}
                <div className="rounded-xl border" style={{ background: FC.card, borderColor: selection.has(q.id) ? FC.red : FC.rule }}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <input type="checkbox" aria-label="담기" checked={selection.has(q.id)} onChange={() => selection.toggle(q.id)} className="h-4 w-4 accent-[#b3261e]" />
                    <button type="button" onClick={() => setOpen(toggleIn(open, q.id))} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left text-[13px]">
                      <span className="rounded px-2 py-0.5 text-[11.5px] font-bold text-white" style={{ background: FAMILY_COLOR[meta?.family ?? ""] ?? FC.sub }}>{meta?.short ?? q.qtype}</span>
                      {group !== "passage" ? <span className="text-[12px]" style={{ color: FC.sub }}>{p.code}</span> : null}
                      <span className="min-w-0 flex-1 truncate">{q.stem}</span>
                      <span className="shrink-0 text-[11.5px]" style={{ color: FC.sub }}>
                        난도 {q.difficulty} · {q.points ?? "–"}점{q.setNos.length ? ` · 봉투 ${q.setNos.join(",")}회` : " · 확장"}
                      </span>
                      <span className="shrink-0 text-[12px] font-bold" style={{ color: FC.red }}>{isOpen ? "접기" : "보기"}</span>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="grid gap-5 border-t px-4 py-4 xl:grid-cols-[auto_1fr]" style={{ borderColor: FC.rule }}>
                      {bodies[q.id] ? (
                        <>
                          <div className="overflow-x-auto rounded-lg bg-white p-4 shadow-sm">
                            <QuestionPaperView q={bodies[q.id]} />
                          </div>
                          <QuestionDetails q={bodies[q.id]} defaultOpen />
                        </>
                      ) : (
                        <div className="text-[12.5px]" style={{ color: FC.sub }}>불러오는 중…</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {ordered.length > limit ? (
          <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-4 w-full rounded-xl border py-3 text-[13px] font-bold" style={{ borderColor: FC.rule, background: FC.card }}>
            {ordered.length - limit}문항 더 보기
          </button>
        ) : null}
        {filtered.length === 0 ? <p className="mt-10 text-center text-[13px]" style={{ color: FC.sub }}>조건에 맞는 문항이 없습니다. 거르기를 줄여 보세요.</p> : null}
      </div>
    </div>
  );
}
