"use client";

import { useCallback, useEffect, useState } from "react";

import { gateMdQuestion, type MdQuestion } from "@/lib/md-lab/parser";

import { ExamSheet } from "./exam-sheet";
import { LiveRunCard } from "./live-run-card";
import { QuestionEditor } from "./question-editor";
import {
  useMdLabGeneration,
  MAX_CONCURRENT_RUNS,
  type ExplanationMode,
  type QType,
  type RunRecord,
} from "./use-md-lab-generation";

const SAMPLE_PASSAGE = `"Art without commerce is a hobby." These words, spoken with much authority to senior fine arts majors, are the kind that those who create art are unable to ignore. We worry about this idea that if we are not engaged in commerce, then we are not professional; and if we are not professional, can we even call ourselves artists? Art of any form, by its very nature, cannot or should not be quantified, and yet writers measure pages and words; visual artists measure canvases completed all in an effort to appear "productive," to perhaps justify this urge to create. The notion of creating for art's sake is then seen as hopelessly romantic and nearly indefensible. Of course one can engage in art, but it better be for money, for that is the only marker of success. But was that professor's declaration merely an old talker with a title mindlessly repeating the cultural norms and expectations that had, in fact, labeled him as "successful"? In Western culture, it is almost impossible to separate professional from commercial, and so the artist is legitimized by their ability to earn money. Professional art, then, is inherently capitalist.`;

const MODELS = [
  { id: "x-ai/grok-4.5", label: "grok-4.5" },
  { id: "google/gemini-3-flash-preview", label: "gemini 3.0 flash" },
  { id: "google/gemini-3.1-pro-preview", label: "gemini 3.1 pro" },
  { id: "google/gemini-3.5-flash", label: "gemini 3.5 flash" },
] as const;

const EFFORTS = [
  { id: "off", label: "사고 끄기" },
  { id: "low", label: "low" },
  { id: "medium", label: "medium" },
  { id: "high", label: "high" },
] as const;

const STORAGE_KEY = "md-lab:runs:v1";
const MAX_RUNS = 20;

function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export function MdLabClient() {
  const [passage, setPassage] = useState("");
  const [qtype, setQtype] = useState<QType>("blank");
  const [modelId, setModelId] = useState<string>(MODELS[0].id);
  const [effort, setEffort] = useState<string>("high");
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>("full");
  const [errorMsg, setErrorMsg] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const onComplete = useCallback((record: RunRecord) => {
    setRuns((prev) => [record, ...prev].slice(0, MAX_RUNS));
    setSelectedId((cur) => cur ?? record.id);
  }, []);
  const { liveRuns, startRun, removeRun } = useMdLabGeneration(onComplete);

  const selectedRun = runs.find((r) => r.id === selectedId) ?? null;

  // 생성 기록 영속화 — 새로고침·페이지 이탈에도 UI 에 남는다.
  useEffect(() => {
    try {
      const rawStore = window.localStorage.getItem(STORAGE_KEY);
      if (rawStore) {
        const parsed = JSON.parse(rawStore) as RunRecord[];
        if (Array.isArray(parsed)) {
          setRuns(parsed);
          if (parsed[0]) setSelectedId(parsed[0].id);
        }
      }
    } catch {
      /* 손상 저장소는 무시 */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    } catch {
      /* quota 초과 등은 무시 — UI 상태는 유지 */
    }
  }, [runs, hydrated]);

  // 병렬 실행 타이머 틱 (100ms) — 진행 중 카드들의 사고/출력 초를 갱신.
  useEffect(() => {
    if (liveRuns.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [liveRuns.length]);

  const generate = useCallback(() => {
    setErrorMsg("");
    const result = startRun({ passage, qtype, modelId, effort, explanationMode });
    if (!result.ok) setErrorMsg(result.error);
  }, [passage, qtype, modelId, effort, explanationMode, startRun]);

  const onQuestionChange = useCallback(
    (next: MdQuestion) => {
      if (!selectedRun) return;
      setRuns((prev) =>
        prev.map((r) =>
          r.id === selectedRun.id
            ? {
                ...r,
                question: next,
                gateIssues: gateMdQuestion(next, r.passage, {
                  requireWrong: r.explanationMode !== "answer-only",
                }),
              }
            : r,
        ),
      );
    },
    [selectedRun],
  );

  const fmt = (v: number) => v.toFixed(1);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div className="no-print">
        <p className="text-sm font-medium text-blue-600">md-lab · 심플 스택 실험</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">
          마크다운 원큐 생성 — 킬러 빈칸 · 킬러 어법
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          모델·사고 강도를 바꿔가며 병렬로 실측합니다 (동시 {MAX_CONCURRENT_RUNS}개).
          생성물은 기록에 쌓이고 새로고침해도 남습니다 (최근 {MAX_RUNS}개).
        </p>
      </div>

      <section className="no-print space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">1. 지문 · 설정</h2>
          <button
            type="button"
            onClick={() => setPassage(SAMPLE_PASSAGE)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-700"
          >
            샘플 지문 넣기
          </button>
        </div>
        <textarea
          value={passage}
          onChange={(e) => setPassage(e.target.value)}
          placeholder="영어 지문을 붙여넣으세요 (200자 이상)"
          rows={6}
          className="w-full resize-y rounded-xl border border-slate-200 p-3 font-serif text-sm leading-relaxed text-slate-800 focus:border-blue-300 focus:outline-none"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">모델</span>
            <div className="flex flex-wrap gap-1.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelId(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    modelId === m.id
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">
              사고 (gemini 는 끄기가 거부될 수 있음 — provider 정책)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EFFORTS.map((ef) => (
                <button
                  key={ef.id}
                  type="button"
                  onClick={() => setEffort(ef.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    effort === ef.id
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {ef.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-slate-200">
            {(["blank", "grammar"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQtype(t)}
                className={`px-4 py-2 text-sm font-semibold ${
                  qtype === t
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t === "blank" ? "킬러 빈칸" : "킬러 어법"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-xl border border-slate-200">
            {(
              [
                { id: "full", label: "해설 전체" },
                { id: "answer-only", label: "정답 해설만" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setExplanationMode(m.id)}
                className={`px-3 py-2 text-xs font-semibold ${
                  explanationMode === m.id
                    ? "bg-amber-500 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={generate}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            생성하기{liveRuns.length > 0 ? ` (+${liveRuns.length} 진행 중)` : ""}
          </button>
          <span className="text-xs text-slate-400">
            설정 바꿔 연타하면 병렬로 돕니다
          </span>
        </div>
        {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}
      </section>

      {liveRuns.length > 0 && (
        <section className="no-print space-y-2">
          <h2 className="font-semibold text-slate-900">
            진행 중 ({liveRuns.length}/{MAX_CONCURRENT_RUNS})
          </h2>
          {liveRuns.map((run) => (
            <LiveRunCard
              key={run.id}
              run={run}
              now={now}
              modelLabel={modelLabel(run.modelId)}
              onDismiss={() => removeRun(run.id)}
            />
          ))}
        </section>
      )}

      {runs.length > 0 && (
        <section className="no-print space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">생성 기록 ({runs.length})</h2>
            <button
              type="button"
              onClick={() => {
                setRuns([]);
                setSelectedId(null);
              }}
              className="text-xs font-medium text-slate-400 hover:text-red-500"
            >
              기록 비우기
            </button>
          </div>
          <div className="space-y-1.5">
            {runs.map((r) => (
              <div
                key={r.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  r.id === selectedId
                    ? "border-blue-300 bg-blue-50/50"
                    : "border-slate-200 bg-white hover:border-blue-200"
                }`}
                onClick={() => setSelectedId(r.id)}
              >
                <span className="font-bold text-slate-800">
                  {r.qtype === "blank" ? "빈칸" : "어법"}
                </span>
                <span className="text-slate-600">{modelLabel(r.modelId)}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                  사고 {r.effort}
                </span>
                {r.explanationMode === "answer-only" && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">
                    정답해설만
                  </span>
                )}
                {r.stats && (
                  <span className="text-slate-500">
                    사고 {fmt(r.stats.thinkSec)}s + 출력 {fmt(r.stats.genSec)}s
                    {r.stats.costKrw != null && ` · ${r.stats.costKrw}원`}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    r.gateIssues.length === 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {r.gateIssues.length === 0 ? "게이트 클린" : `위반 ${r.gateIssues.length}`}
                </span>
                <span className="ml-auto text-slate-400">
                  {new Date(r.ts).toLocaleTimeString("ko-KR", { hour12: false })}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRuns((prev) => prev.filter((x) => x.id !== r.id));
                    setSelectedId((cur) => (cur === r.id ? null : cur));
                  }}
                  className="text-slate-300 hover:text-red-500"
                  aria-label="기록 삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedRun && (
        <>
          <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">
                선택된 문항 — {selectedRun.qtype === "blank" ? "빈칸" : "어법"} ·{" "}
                {modelLabel(selectedRun.modelId)} · 사고 {selectedRun.effort}
              </h2>
              {selectedRun.gateIssues.length === 0 ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  기계 검사 클린
                </span>
              ) : (
                selectedRun.gateIssues.map((v) => (
                  <span
                    key={v}
                    className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                  >
                    {v}
                  </span>
                ))
              )}
              {(selectedRun.corrections ?? []).map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
          <QuestionEditor
            key={selectedRun.id}
            question={selectedRun.question}
            onChange={onQuestionChange}
          />
          <ExamSheet passage={selectedRun.passage} question={selectedRun.question} />
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .md-lab-print-area { box-shadow: none !important; border: none !important; }
        }
      `}</style>
    </div>
  );
}
