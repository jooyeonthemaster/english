/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import { BookOpen, Braces, MessageSquare, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  GrammarPoint,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";
import { CATEGORY_META, DIFF_LABELS } from "./constants";
import { highlightWord } from "./helpers";
import type { CollectionEntry, NoteCategory } from "./types";

export function CategoryCollectionPanel({
  category,
  entries,
  visibleCount,
  rawCount,
  focusedNoteId,
  onSelect,
  onClose,
}: {
  category: NoteCategory;
  entries: CollectionEntry[];
  visibleCount: number;
  rawCount: number;
  focusedNoteId: string | null;
  onSelect: (entry: CollectionEntry) => void;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[category];
  const visible = entries.filter((entry) => entry.visible);
  const hidden = entries.filter((entry) => !entry.visible);
  const Icon =
    category === "vocab"
      ? BookOpen
      : category === "key"
        ? MessageSquare
        : category === "exam"
          ? Target
          : Braces;

  return (
    <div className={`rounded-xl border ${meta.border} bg-white p-4 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg ${meta.soft} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4 h-4 ${meta.text}`} />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{meta.title}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span>본문 필기 {visibleCount}</span>
                <span>분석 원본 {rawCount}</span>
                {hidden.length > 0 && <span className="text-amber-600">매칭 필요 {hidden.length}</span>}
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((entry) => renderCollectionEntry(category, entry, focusedNoteId, onSelect))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-400">
          본문에 표시된 항목이 없습니다.
        </div>
      )}

      {hidden.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] font-semibold text-slate-500">원문 매칭 필요</span>
            <Badge variant="outline" className="text-[10px] h-5 text-amber-700 border-amber-200 bg-amber-50">{hidden.length}</Badge>
          </div>
          <div className="space-y-2">
            {hidden.map((entry) => renderCollectionEntry(category, entry, focusedNoteId, onSelect))}
          </div>
        </div>
      )}
    </div>
  );
}

function renderCollectionEntry(
  category: NoteCategory,
  entry: CollectionEntry,
  focusedNoteId: string | null,
  onSelect: (entry: CollectionEntry) => void,
) {
  const statusBadge = entry.visible ? (
    <Badge className="h-5 border-0 bg-emerald-50 text-[10px] text-emerald-700">본문 표시</Badge>
  ) : (
    <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 text-[10px] text-amber-700">매칭 필요</Badge>
  );
  const isFocused = focusedNoteId === entry.id;

  return (
    <div
      key={entry.id}
      role={entry.visible ? "button" : undefined}
      tabIndex={entry.visible ? 0 : undefined}
      title={entry.visible ? "본문에서 위치 강조" : undefined}
      onClick={entry.visible ? () => onSelect(entry) : undefined}
      onKeyDown={
        entry.visible
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(entry);
              }
            }
          : undefined
      }
      className={`rounded-lg border p-3 transition-all ${
        entry.visible ? "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60" : "border-dashed border-slate-200 bg-slate-50/80"
      } ${isFocused ? `${CATEGORY_META[category].active} ${CATEGORY_META[category].ring} ring-2 ring-offset-1 shadow-sm` : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-400">{entry.sentenceIndex + 1}번 문장</span>
        {statusBadge}
      </div>
      {category === "vocab" && <VocabCollectionItem entry={entry} />}
      {category === "grammar" && <GrammarCollectionItem entry={entry} />}
      {category === "syntax" && <SyntaxCollectionItem entry={entry} />}
      {category === "key" && <KeyCollectionItem entry={entry} />}
      {category === "exam" && <ExamCollectionItem entry={entry} />}
    </div>
  );
}

function toDisplayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toDisplayText).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "question", "example", "prompt", "value", "original"]) {
      const text = toDisplayText(record[key]);
      if (text) return text;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function toDisplayList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toDisplayText).filter(Boolean);
  const text = toDisplayText(value);
  if (!text) return [];
  return text
    .split(/\s*(?:\n|\/|;)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function VocabCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as VocabItem;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[15px] font-bold text-slate-900">{item.word}</span>
            {item.partOfSpeech && <Badge variant="outline" className="h-5 text-[10px]">{item.partOfSpeech}</Badge>}
            {DIFF_LABELS[item.difficulty] && <Badge className={`h-5 border-0 text-[10px] ${DIFF_LABELS[item.difficulty].cls}`}>{DIFF_LABELS[item.difficulty].label}</Badge>}
          </div>
          {item.pronunciation && <span className="text-[11px] text-slate-400">{item.pronunciation}</span>}
        </div>
        <span className="text-right text-[13px] font-semibold text-blue-700">{item.meaning}</span>
      </div>
      {item.contextMeaning && <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-600">{item.contextMeaning}</p>}
      {entry.sentence && <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-600">{highlightWord(entry.sentence.english, item.word)}</p>}
      {(item.synonyms?.length > 0 || item.antonyms?.length > 0 || item.collocations?.length > 0) && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {item.synonyms?.slice(0, 4).map((v, i) => <span key={`s-${i}`} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">동의 {v}</span>)}
          {item.antonyms?.slice(0, 4).map((v, i) => <span key={`a-${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">반의 {v}</span>)}
          {item.collocations?.slice(0, 4).map((v, i) => <span key={`c-${i}`} className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">{v}</span>)}
        </div>
      )}
    </div>
  );
}

function GrammarCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as GrammarPoint;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-bold text-slate-900">{item.pattern}</span>
        {item.level && <Badge variant="outline" className="h-5 shrink-0 text-[10px]">{item.level}</Badge>}
      </div>
      {item.textFragment && <p className="rounded-md border border-violet-100 bg-violet-50/50 px-2 py-1.5 font-mono text-[12px] text-violet-800">{item.textFragment}</p>}
      <p className="text-[12px] leading-relaxed text-slate-600">{item.explanation}</p>
      {item.commonMistake && <p className="rounded-md bg-rose-50 px-2 py-1.5 text-[12px] text-rose-700"><span className="font-semibold">오답 함정:</span> {item.commonMistake}</p>}
      {item.transformations?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {item.transformations.slice(0, 4).map((v, i) => <span key={i} className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{v}</span>)}
        </div>
      )}
    </div>
  );
}

function SyntaxCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as SyntaxItem;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[13px] font-bold text-cyan-700">구문 분석</span>
        <Badge className="h-5 border-0 bg-cyan-50 text-[10px] text-cyan-700">{item.complexity}</Badge>
        {item.patternType && <Badge variant="outline" className="h-5 text-[10px]">{item.patternType}</Badge>}
      </div>
      <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-700">{item.structure}</p>
      {item.chunkReading && <p className="rounded-md bg-cyan-50 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-cyan-800">{item.chunkReading}</p>}
      {item.transformPoint && <p className="text-[12px] text-slate-600">{item.transformPoint}</p>}
    </div>
  );
}

function KeyCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Badge className="h-5 border-0 bg-green-50 text-[10px] text-green-700">{item.role}</Badge>
        {item.isTopicSentence && <Badge className="h-5 border-0 bg-green-50 text-[10px] text-green-700">주제문</Badge>}
      </div>
      {item.summary && <p className="text-[13px] leading-relaxed text-slate-700">{item.summary}</p>}
      {entry.sentence && (
        <>
          <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-700">{entry.sentence.english}</p>
          <p className="text-[12px] leading-relaxed text-slate-400">{entry.sentence.korean}</p>
        </>
      )}
    </div>
  );
}

function ExamCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item;
  const isParaphrase = item.kind === "paraphrase";
  const original = toDisplayText(item.original || item.text || item.example);
  const reason = toDisplayText(item.reason);
  const questionExample = toDisplayText(item.questionExample);
  const alternatives = toDisplayList(item.alternatives);
  const example = toDisplayText(item.example);
  const transformType = toDisplayText(item.transformType);
  const difficulty = toDisplayText(item.difficulty);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`h-5 border-0 text-[10px] ${isParaphrase ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
          {isParaphrase ? "패러프레이징" : transformType || "구조 변형"}
        </Badge>
        {difficulty && <Badge variant="outline" className="h-5 text-[10px]">{difficulty}</Badge>}
      </div>
      {original && <p className="rounded-md border border-yellow-100 bg-yellow-50/70 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-800">{original}</p>}
      {reason && <p className="text-[12px] leading-relaxed text-slate-600"><span className="font-semibold text-yellow-700">이유:</span> {reason}</p>}
      {questionExample && <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] leading-relaxed text-slate-700">{questionExample}</p>}
      {alternatives.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {alternatives.slice(0, 4).map((v, i) => <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{v}</span>)}
        </div>
      )}
      {example && <p className="rounded-md bg-violet-50 px-2 py-1.5 font-mono text-[12px] text-violet-800">{example}</p>}
    </div>
  );
}
