"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDownNarrowWide,
  ArrowRight,
  ArrowUpNarrowWide,
  FileText,
  GitCompareArrows,
  Library,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Shuffle,
} from "lucide-react";
import { SaveButton } from "@/components/ui/save-button";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { createDirectInputPassageMaterial } from "@/actions/workbench";
import {
  defaultVariantTitle,
  variantModeLabel,
  variantTag,
  type WholePassageTransformMode,
  type VariantDirection,
} from "@/lib/passage-transform/schema";
import type {
  SourcePassage,
  VariantAction,
  VariantResult,
} from "./passage-variant-types";

// ============================================================================
// 지문 변형(passage variant) — 메인 UI (client)
//
// 흐름: ① 원본 지문 선택 → ② 6가지 변형 액션 → ③ 원본·변형본 나란히 미리보기
//       → ④ 다시 생성(avoidTexts) → ⑤ 라이브러리에 저장.
//
// 시각 언어는 workspace-passage-row.tsx 를 그대로 따른다 — violet-600 액션,
// slate 텍스트/보더, rounded-lg, h-7 컨트롤, text-[11.5px] 라벨, Loader2 스피너.
// (Sparkles·이모지 아이콘 금지 / 주황·앰버 색 금지.)
// ============================================================================

/** 6가지 변형 액션 — 화면 표기 라벨/아이콘과 함께 정의. */
const VARIANT_ACTIONS: {
  key: string;
  mode: WholePassageTransformMode;
  direction?: VariantDirection;
  label: string;
  Icon: typeof Shuffle;
  hint: string;
}[] = [
  {
    key: "RELATED_TOPIC",
    mode: "RELATED_TOPIC",
    label: "관련 주제",
    Icon: Shuffle,
    hint: "같은 분야·난이도·길이로 소재만 바꾼 새 지문을 생성합니다",
  },
  {
    key: "OPPOSITE_TOPIC",
    mode: "OPPOSITE_TOPIC",
    label: "상반 주제",
    Icon: GitCompareArrows,
    hint: "같은 소재에 대한 반대 입장·반박 구조의 새 지문을 생성합니다",
  },
  {
    key: "DIFFICULTY:EASIER",
    mode: "DIFFICULTY",
    direction: "EASIER",
    label: "쉽게",
    Icon: ArrowDownNarrowWide,
    hint: "주제·핵심 의미는 유지하고 어휘·구문 난이도를 낮춥니다",
  },
  {
    key: "DIFFICULTY:HARDER",
    mode: "DIFFICULTY",
    direction: "HARDER",
    label: "어렵게",
    Icon: ArrowUpNarrowWide,
    hint: "주제·핵심 의미는 유지하고 어휘·구문 난이도를 높입니다",
  },
  {
    key: "LENGTH:SHORTER",
    mode: "LENGTH",
    direction: "SHORTER",
    label: "축약",
    Icon: Minimize2,
    hint: "주제·난이도는 유지하고 분량을 줄입니다",
  },
  {
    key: "LENGTH:LONGER",
    mode: "LENGTH",
    direction: "LONGER",
    label: "확장",
    Icon: Maximize2,
    hint: "주제·난이도는 유지하고 분량을 늘립니다",
  },
];

const SEMESTER_LABEL: Record<string, string> = {
  FIRST: "1학기",
  SECOND: "2학기",
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// 난이도 변형(EASIER/HARDER)의 difficulty 조정은 서버(createDirectInputPassageMaterial)
// 에서 정규 CEFR 래더로 처리한다 — 클라이언트는 variantDirection 만 넘기면 된다.
// (인라인 워크스페이스 변형과 동일 경로 → 두 표면의 난이도 데이터 일관성 보장)

interface ApiTransformResponse {
  text?: string;
  title?: string;
  summary?: string;
  note?: string;
  error?: string;
  balance?: number;
  required?: number;
}

interface PassageVariantClientProps {
  passages: SourcePassage[];
}

export function PassageVariantClient({ passages }: PassageVariantClientProps) {
  const cost = CREDIT_COSTS.PASSAGE_VARIANT;

  // ── 원본 지문 선택 ──
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => passages.find((p) => p.id === selectedId) ?? null,
    [passages, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return passages;
    return passages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q),
    );
  }, [passages, search]);

  // ── 생성 상태 / 결과 / 저장 ──
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [result, setResult] = useState<VariantResult | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // 같은 액션 "다시 생성" 시 직전 결과들 — 모델이 반복하지 않도록 회피 목록(최대 5).
  const avoidRef = useRef<string[]>([]);

  const busy = busyKey !== null || regenerating;

  /** 변형 API 호출 — 402(크레딧 부족)/일반 오류를 토스트로 안내. */
  const callTransform = useCallback(
    async (
      source: SourcePassage,
      action: VariantAction,
      avoidTexts: string[],
    ): Promise<VariantResult | null> => {
      const res = await fetch("/api/workbench/passage-transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: action.mode,
          passageText: source.content,
          ...(action.direction ? { direction: action.direction } : {}),
          ...(avoidTexts.length > 0 ? { avoidTexts: avoidTexts.slice(-5) } : {}),
        }),
      });
      const data: ApiTransformResponse = await res.json().catch(() => ({}));
      if (res.status === 402) {
        toast.error(
          `크레딧이 부족합니다. (보유 ${data.balance ?? 0} · 필요 ${
            data.required ?? cost
          })`,
        );
        return null;
      }
      if (!res.ok || !data.text || data.error) {
        toast.error(data.error || "지문 변형에 실패했어요. 잠시 후 다시 시도해주세요.");
        return null;
      }
      return {
        action,
        text: String(data.text),
        suggestedTitle: String(data.title || ""),
        summary: String(data.summary || data.note || ""),
        note: String(data.note || ""),
      };
    },
    [cost],
  );

  // ── 새 변형 생성 ──
  const handleGenerate = useCallback(
    async (action: VariantAction) => {
      if (!selected) {
        toast.error("먼저 변형할 원본 지문을 선택해주세요.");
        return;
      }
      if (busy) return;
      setBusyKey(action.key);
      setSavedId(null);
      avoidRef.current = [];
      try {
        const next = await callTransform(selected, action, []);
        if (next) {
          setResult(next);
          setTitleDraft(
            next.suggestedTitle.trim() ||
              defaultVariantTitle(selected.title, action.mode, action.direction),
          );
        }
      } finally {
        setBusyKey(null);
      }
    },
    [selected, busy, callTransform],
  );

  // ── 같은 액션으로 다시 생성 (이전 결과를 avoidTexts 로 회피) ──
  const handleRegenerate = useCallback(async () => {
    if (!selected || !result || busy) return;
    setRegenerating(true);
    setSavedId(null);
    avoidRef.current = [...avoidRef.current, result.text].slice(-5);
    try {
      const next = await callTransform(selected, result.action, avoidRef.current);
      if (next) {
        setResult(next);
        // 사용자가 손댄 제목은 유지 — 모델 제안으로 덮어쓰지 않는다.
        if (!titleDraft.trim()) {
          setTitleDraft(
            next.suggestedTitle.trim() ||
              defaultVariantTitle(
                selected.title,
                next.action.mode,
                next.action.direction,
              ),
          );
        }
      }
    } finally {
      setRegenerating(false);
    }
  }, [selected, result, busy, callTransform, titleDraft]);

  // ── 라이브러리에 저장 (변형본 Passage 생성) ──
  const handleSave = useCallback(async () => {
    if (!selected || !result || saving) return;
    const title =
      titleDraft.trim() ||
      defaultVariantTitle(
        selected.title,
        result.action.mode,
        result.action.direction,
      );
    setSaving(true);
    try {
      const res = await createDirectInputPassageMaterial({
        title,
        content: result.text,
        sourcePassageId: selected.id,
        variantKind: variantModeLabel(result.action.mode, result.action.direction),
        ...(result.action.direction
          ? { variantDirection: result.action.direction }
          : {}),
        tags: [variantTag(result.action.mode, result.action.direction)],
      });
      if (!res.success || !res.id) {
        toast.error(res.error || "변형본 저장에 실패했어요.");
        return;
      }
      setSavedId(res.id);
      toast.success("변형본이 지문 목록에 저장됐어요.");
    } finally {
      setSaving(false);
    }
  }, [selected, result, saving, titleDraft]);

  const handleSelectSource = useCallback((p: SourcePassage) => {
    setSelectedId(p.id);
    setResult(null);
    setSavedId(null);
    setTitleDraft("");
    avoidRef.current = [];
  }, []);

  const originalWords = selected ? countWords(selected.content) : 0;
  const variantWords = result ? countWords(result.text) : 0;
  const activeLabel = result
    ? variantModeLabel(result.action.mode, result.action.direction)
    : "";

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4">
        {/* ── 헤더 ── */}
        <header className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
            <Shuffle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-slate-900">지문 변형</h1>
            <p className="text-[12px] font-medium text-slate-400">
              기존 지문을 바탕으로 관련/상반 주제·난이도·길이가 다른 새 지문을
              만들고, 지문 목록에 저장해 문제 생성에 바로 씁니다.
            </p>
          </div>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ───────────────── 원본 지문 선택기 ───────────────── */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:max-h-[calc(100vh-160px)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
              <FileText
                className="h-4 w-4 shrink-0 text-violet-500"
                aria-hidden="true"
              />
              <h2 className="text-[13px] font-bold text-slate-800">원본 지문</h2>
              <span className="ml-auto text-[11px] tabular-nums text-slate-400">
                {filtered.length}개
              </span>
            </div>
            <div className="border-b border-slate-100 p-2.5">
              <div className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100">
                <Search
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="제목·본문으로 검색"
                  aria-label="원본 지문 검색"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center">
                  <Library className="h-7 w-7 text-slate-300" aria-hidden="true" />
                  <p className="text-[12px] text-slate-400">
                    {passages.length === 0
                      ? "아직 변형할 지문이 없어요. 먼저 학습지를 분석하세요."
                      : "검색 결과가 없어요."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((p) => {
                    const active = p.id === selectedId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectSource(p)}
                          aria-pressed={active}
                          aria-label={`원본 지문 선택: ${p.title}`}
                          className={
                            "w-full rounded-lg border px-2.5 py-2 text-left transition-colors " +
                            (active
                              ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200"
                              : "border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50")
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                "min-w-0 flex-1 truncate text-[12.5px] font-semibold " +
                                (active ? "text-violet-700" : "text-slate-700")
                              }
                            >
                              {p.title}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-[10.5px] tabular-nums text-slate-400">
                              {countWords(p.content)} words
                            </span>
                          </div>
                          {(p.grade || p.semester || p.publisher) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {p.grade ? (
                                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {p.grade}학년
                                </span>
                              ) : null}
                              {p.semester ? (
                                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {SEMESTER_LABEL[p.semester] ?? p.semester}
                                </span>
                              ) : null}
                              {p.publisher ? (
                                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {p.publisher}
                                </span>
                              ) : null}
                            </div>
                          )}
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-400">
                            {p.content.trim().slice(0, 140)}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* ───────────────── 변형 작업 영역 ───────────────── */}
          <section className="flex min-w-0 flex-col gap-4">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
                <span className="flex size-11 items-center justify-center rounded-full bg-slate-50 text-slate-300 ring-1 ring-slate-100">
                  <Shuffle className="size-5" aria-hidden="true" />
                </span>
                <p className="text-[13px] font-semibold text-slate-500">
                  변형할 원본 지문을 선택하세요
                </p>
                <p className="max-w-sm text-[12px] text-slate-400">
                  왼쪽 목록에서 지문을 고르면 6가지 변형(관련/상반 주제·난이도·길이)을
                  실행할 수 있어요.
                </p>
              </div>
            ) : (
              <>
                {/* ── 변형 액션 바 ── */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                    <h2 className="min-w-0 truncate text-[13px] font-bold text-slate-800">
                      변형 만들기
                      <span className="ml-1.5 font-medium text-slate-400">
                        — {selected.title}
                      </span>
                    </h2>
                  </div>
                  <div className="space-y-3 p-3">
                    {/* 주제 변형 */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                        주제
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {VARIANT_ACTIONS.filter((a) => !a.direction).map((a) => (
                          <VariantButton
                            key={a.key}
                            action={a}
                            cost={cost}
                            busy={busy}
                            busyKey={busyKey}
                            onClick={handleGenerate}
                          />
                        ))}
                      </div>
                    </div>
                    {/* 난이도 변형 */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                        난이도
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {VARIANT_ACTIONS.filter(
                          (a) => a.mode === "DIFFICULTY",
                        ).map((a) => (
                          <VariantButton
                            key={a.key}
                            action={a}
                            cost={cost}
                            busy={busy}
                            busyKey={busyKey}
                            onClick={handleGenerate}
                          />
                        ))}
                      </div>
                    </div>
                    {/* 길이 변형 */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                        길이
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {VARIANT_ACTIONS.filter(
                          (a) => a.mode === "LENGTH",
                        ).map((a) => (
                          <VariantButton
                            key={a.key}
                            action={a}
                            cost={cost}
                            busy={busy}
                            busyKey={busyKey}
                            onClick={handleGenerate}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 미리보기 (원본 | 변형본) ── */}
                {busyKey ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 shadow-sm">
                    <Loader2
                      className="h-5 w-5 animate-spin text-violet-500"
                      aria-hidden="true"
                    />
                    <p className="text-[12.5px] font-semibold text-slate-500">
                      새 지문을 생성하고 있어요…
                    </p>
                    <p className="text-[11.5px] text-slate-400">
                      보통 2~6초 정도 걸립니다.
                    </p>
                  </div>
                ) : result ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    {/* 결과 헤더 — 변형 종류 뱃지 + 한국어 요약 */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                      <span className="flex h-6 shrink-0 items-center rounded-md bg-violet-600 px-2 text-[11px] font-bold text-white">
                        {activeLabel} 변형
                      </span>
                      {regenerating ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600">
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                          다시 생성 중
                        </span>
                      ) : null}
                      {result.summary ? (
                        <p className="min-w-0 flex-1 truncate text-[11.5px] text-slate-500">
                          {result.summary}
                        </p>
                      ) : (
                        <span className="min-w-0 flex-1" aria-hidden="true" />
                      )}
                    </div>

                    {/* 제목 (편집 가능) */}
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <label
                        htmlFor="variant-title"
                        className="mb-1 block text-[11px] font-semibold text-slate-400"
                      >
                        변형본 제목
                      </label>
                      <input
                        id="variant-title"
                        type="text"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        placeholder="변형본 제목"
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-semibold text-slate-700 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      />
                    </div>

                    {/* 원본 | 변형본 나란히 */}
                    <div className="grid grid-cols-1 gap-px bg-slate-100 md:grid-cols-2">
                      <article className="flex min-w-0 flex-col bg-white">
                        <div className="flex items-center gap-1.5 px-3 py-2">
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            원본
                          </span>
                          <span className="ml-auto text-[10.5px] tabular-nums text-slate-400">
                            {originalWords} words
                          </span>
                        </div>
                        <div className="max-h-[440px] overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-[13px] leading-relaxed text-slate-600">
                          {selected.content}
                        </div>
                      </article>
                      <article className="flex min-w-0 flex-col bg-white">
                        <div className="flex items-center gap-1.5 px-3 py-2">
                          <span className="rounded-sm bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            변형본
                          </span>
                          <span className="ml-auto text-[10.5px] tabular-nums text-slate-400">
                            {variantWords} words
                          </span>
                        </div>
                        <div className="max-h-[440px] overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-[13px] leading-relaxed text-slate-800">
                          {result.text}
                        </div>
                      </article>
                    </div>

                    {/* 액션 푸터 — 다시 생성 / 라이브러리에 저장 */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={busy || saving}
                        title="같은 방식으로 다른 버전을 다시 생성합니다 (직전 결과는 회피)"
                        aria-label={`다시 생성 (크레딧 ${cost})`}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {regenerating ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        다시 생성
                        <CreditCostChip
                          amount={cost}
                          className="rounded-sm bg-slate-100 px-1 py-px text-[10px] text-slate-500"
                        />
                      </button>
                      <span className="min-w-0 flex-1" aria-hidden="true" />
                      <SaveButton
                        onClick={handleSave}
                        saving={saving}
                        disabled={busy || saving}
                        title="이 변형본을 지문 목록에 저장합니다 (문제 생성에 바로 사용 가능)"
                        className="shrink-0"
                      />
                    </div>

                    {/* 저장 완료 후 후속 링크 */}
                    {savedId ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-violet-100 bg-violet-50/60 px-3 py-2.5">
                        <span className="text-[11.5px] font-semibold text-violet-700">
                          변형본이 지문 목록에 저장됐어요.
                        </span>
                        <Link
                          href="/director/workbench/passages"
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-700 underline-offset-2 hover:underline"
                        >
                          <Library className="h-3.5 w-3.5" aria-hidden="true" />
                          지문 목록에서 보기
                        </Link>
                        <Link
                          href="/director/workbench/questions/generate"
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-700 underline-offset-2 hover:underline"
                        >
                          이 지문으로 문제 만들기
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center shadow-sm">
                    <GitCompareArrows
                      className="h-7 w-7 text-slate-300"
                      aria-hidden="true"
                    />
                    <p className="text-[12.5px] font-semibold text-slate-500">
                      위에서 변형 방식을 선택하세요
                    </p>
                    <p className="text-[11.5px] text-slate-400">
                      생성된 새 지문이 원본과 나란히 여기에 표시됩니다.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// 변형 액션 버튼 — workspace-passage-row 의 violet-600 primary 버튼 톤.
// ============================================================================
function VariantButton({
  action,
  cost,
  busy,
  busyKey,
  onClick,
}: {
  action: (typeof VARIANT_ACTIONS)[number];
  cost: number;
  busy: boolean;
  busyKey: string | null;
  onClick: (action: VariantAction) => void;
}) {
  const isBusy = busyKey === action.key;
  return (
    <button
      type="button"
      onClick={() =>
        onClick({
          key: action.key,
          mode: action.mode,
          direction: action.direction,
        })
      }
      disabled={busy}
      title={action.hint}
      aria-label={`${action.label} 변형 (크레딧 ${cost})`}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11.5px] font-bold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isBusy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <action.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {action.label}
      <CreditCostChip
        amount={cost}
        className="rounded-sm bg-white px-1 py-px text-[10px] text-violet-500 ring-1 ring-inset ring-violet-200"
      />
    </button>
  );
}
