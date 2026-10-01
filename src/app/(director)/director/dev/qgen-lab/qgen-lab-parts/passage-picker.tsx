"use client";

// 지문 선택 — /meta 목록(라벨·단어 수·출처 배지·금표준 정답 번호) 또는 직접 입력.

import { PenLine, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { countWords, type MetaPassage } from "./api-utils";
import { Mono, SourceBadge } from "./ui-bits";

export const CUSTOM_PASSAGE = "__custom";
const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function PassagePicker({
  passages,
  value,
  onChange,
  customText,
  onCustomText,
}: {
  passages: MetaPassage[];
  value: string;
  onChange: (id: string) => void;
  customText: string;
  onCustomText: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return passages;
    return passages.filter((p) => `${p.id} ${p.label}`.toLowerCase().includes(needle));
  }, [passages, q]);
  const selected = passages.find((p) => p.id === value) ?? null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-stone-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`지문 ${passages.length}개 검색 (id · 라벨)`}
          className="h-[30px] border-stone-300 bg-white pl-7 text-[0.75rem] md:text-[0.75rem]"
        />
      </div>

      <div className="max-h-[260px] overflow-y-auto rounded-md border border-stone-300 bg-white">
        <button
          type="button"
          onClick={() => onChange(CUSTOM_PASSAGE)}
          className={cn(
            "flex w-full items-center gap-2 border-b border-stone-200 px-2.5 py-1.5 text-left text-[0.75rem]",
            value === CUSTOM_PASSAGE ? "bg-stone-900 text-[#fffefa]" : "text-stone-700 hover:bg-stone-50",
          )}
        >
          <PenLine className="size-3.5 shrink-0" />
          <span className="font-semibold">직접 입력</span>
          <span className={cn("ml-auto font-mono text-[0.6875rem]", value === CUSTOM_PASSAGE ? "text-stone-300" : "text-stone-400")}>
            custom-sha1
          </span>
        </button>
        {filtered.length === 0 && <p className="px-2.5 py-3 text-[0.75rem] text-stone-400">일치하는 지문 없음</p>}
        {filtered.map((p) => {
          const on = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              title={p.text.slice(0, 400)}
              className={cn(
                "flex w-full items-center gap-2 border-b border-stone-100 px-2.5 py-1.5 text-left text-[0.75rem] last:border-b-0",
                on ? "bg-stone-900 text-[#fffefa]" : "text-stone-800 hover:bg-stone-50",
              )}
            >
              <SourceBadge source={p.source} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.label}</span>
                <span className={cn("block font-mono text-[0.625rem]", on ? "text-stone-400" : "text-stone-400")}>{p.id}</span>
              </span>
              {p.gold && (
                <span
                  title="평가원 실물 정답 번호(심사용 — 프롬프트엔 들어가지 않음)"
                  className={cn(
                    "shrink-0 rounded-[3px] border px-1 font-mono text-[0.625rem]",
                    on ? "border-stone-600 text-stone-300" : "border-stone-300 text-stone-500",
                  )}
                >
                  실물 {CIRCLED[p.gold.ansNo - 1] ?? p.gold.ansNo}
                </span>
              )}
              <Mono className={cn("w-10 shrink-0 text-right text-[0.6875rem]", on ? "text-stone-300" : "text-stone-500")}>
                {p.words}w
              </Mono>
            </button>
          );
        })}
      </div>

      {value === CUSTOM_PASSAGE ? (
        <div className="space-y-1">
          <Textarea
            value={customText}
            onChange={(e) => onCustomText(e.target.value)}
            placeholder="영어 지문 원문을 붙여 넣으세요(120단어 이상 권장)"
            className="min-h-40 border-stone-300 bg-white font-serif text-[0.8125rem] leading-6 md:text-[0.8125rem]"
          />
          <p className="text-right font-mono text-[0.6875rem] text-stone-500">{countWords(customText)} words</p>
        </div>
      ) : selected ? (
        <details className="rounded-md border border-stone-200 bg-white">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[0.6875rem] font-semibold text-stone-500">
            지문 미리보기 · {selected.words}w
          </summary>
          <p className="max-h-48 overflow-y-auto border-t border-stone-200 px-2.5 py-2 font-serif text-[0.8125rem] leading-6 text-stone-800">
            {selected.text}
          </p>
        </details>
      ) : null}
    </div>
  );
}
