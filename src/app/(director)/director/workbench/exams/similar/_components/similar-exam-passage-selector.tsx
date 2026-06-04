"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckSquare, FileText, Loader2, Search, Square } from "lucide-react";

export type SelectedSource =
  | { kind: "passage"; id: string; title: string }
  | { kind: "draft"; draftId: string; title: string };

interface ApiPassage {
  id: string;
  title: string;
  preview: string;
  grade: number | null;
  school: { id: string; name: string } | null;
  analyzed: boolean;
  questionCount: number;
}

interface ApiDraft {
  id: string;
  title: string;
  preview: string;
  sourceName: string;
}

interface SimilarExamPassageSelectorProps {
  onChange: (selected: SelectedSource[]) => void;
}

type SourceFilter = "all" | "passage" | "draft";

const passageKey = (id: string) => `p:${id}`;
const draftKey = (id: string) => `d:${id}`;

export function SimilarExamPassageSelector({
  onChange,
}: SimilarExamPassageSelectorProps) {
  const [passages, setPassages] = useState<ApiPassage[]>([]);
  const [drafts, setDrafts] = useState<ApiDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/similar-exams/passage-sources", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : { passages: [], drafts: [] }))
      .then((data) => {
        if (cancelled) return;
        setPassages(data.passages ?? []);
        setDrafts(data.drafts ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setPassages([]);
          setDrafts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const passageById = useMemo(
    () => new Map(passages.map((p) => [p.id, p])),
    [passages],
  );
  const draftById = useMemo(() => new Map(drafts.map((d) => [d.id, d])), [drafts]);

  const emit = useCallback(
    (next: Set<string>) => {
      const result: SelectedSource[] = [];
      for (const key of next) {
        if (key.startsWith("p:")) {
          const p = passageById.get(key.slice(2));
          if (p) result.push({ kind: "passage", id: p.id, title: p.title });
        } else if (key.startsWith("d:")) {
          const d = draftById.get(key.slice(2));
          if (d) {
            result.push({ kind: "draft", draftId: d.id, title: d.title });
          }
        }
      }
      onChange(result);
    },
    [passageById, draftById, onChange],
  );

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelected(next);
      emit(next);
    },
    [selected, emit],
  );

  const clearAll = useCallback(() => {
    setSelected(new Set());
    onChange([]);
  }, [onChange]);

  const query = search.trim().toLowerCase();
  const matches = (title: string, content: string) =>
    !query ||
    title.toLowerCase().includes(query) ||
    content.toLowerCase().includes(query);

  const visiblePassages =
    sourceFilter === "draft"
      ? []
      : passages.filter((p) => matches(p.title, p.preview));
  const visibleDrafts =
    sourceFilter === "passage"
      ? []
      : drafts.filter((d) => matches(d.title, d.preview));
  const visibleCount = visiblePassages.length + visibleDrafts.length;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">지문 선택</h2>
            <p className="mt-1 text-sm text-slate-500">
              등록된 지문과 추출 자료에서 선택하세요. (1개 이상 필수)
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {selected.size}개 선택
          </span>
        </div>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
          <input
            placeholder="제목 또는 내용으로 검색..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "전체"],
              ["passage", "등록 지문"],
              ["draft", "추출 자료"],
            ] as Array<[SourceFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(value)}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                sourceFilter === value
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              선택 해제
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{visibleCount}개</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <Loader2 className="mr-2 size-4 animate-spin" />
            불러오는 중
          </div>
        ) : visibleCount === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-400">
            {passages.length === 0 && drafts.length === 0
              ? "등록된 지문이나 추출 자료가 없습니다."
              : "조건에 맞는 항목이 없습니다."}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {visiblePassages.map((p) => {
              const key = passageKey(p.id);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <Row
                    checked={checked}
                    title={p.title}
                    preview={p.preview}
                    onToggle={() => toggle(key)}
                    badges={
                      <>
                        {p.grade && <Badge tone="slate">{p.grade}학년</Badge>}
                        {p.school && <Badge tone="slate">{p.school.name}</Badge>}
                        {p.analyzed ? (
                          <Badge tone="emerald">분석 완료</Badge>
                        ) : (
                          <Badge tone="amber">미분석</Badge>
                        )}
                      </>
                    }
                  />
                </li>
              );
            })}
            {visibleDrafts.map((d) => {
              const key = draftKey(d.id);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <Row
                    checked={checked}
                    title={d.title}
                    preview={d.preview}
                    onToggle={() => toggle(key)}
                    badges={
                      <>
                        <Badge tone="indigo">추출 자료 (미등록)</Badge>
                        {d.sourceName && <Badge tone="slate">{d.sourceName}</Badge>}
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "slate" | "emerald" | "amber" | "indigo";
  children: ReactNode;
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
  }[tone];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Row({
  checked,
  title,
  preview,
  badges,
  onToggle,
}: {
  checked: boolean;
  title: string;
  preview: string;
  badges: ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
        checked
          ? "border-blue-300 bg-blue-50/60"
          : "border-transparent hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      {checked ? (
        <CheckSquare className="mt-0.5 size-4 shrink-0 text-blue-600" />
      ) : (
        <Square className="mt-0.5 size-4 shrink-0 text-slate-300" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-slate-300" />
          <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
        </span>
        <span className="mt-1 line-clamp-1 block pl-5 text-xs text-slate-400">
          {preview.slice(0, 160)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1 pl-5">{badges}</span>
      </span>
    </button>
  );
}
