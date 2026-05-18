// @ts-nocheck
"use client";

import { Languages, BookA, ListTree, Layers, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { SectionHeader } from "./section-header";
import type { NoteItem } from "./types";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  NOTE_TYPE_LABELS,
} from "./helpers";

export function SentenceTranslations({
  sentences,
}: {
  sentences: NonNullable<PassageAnalysisData["sentences"]>;
}) {
  return (
    <SectionHeader
      icon={Languages}
      title="문장별 해석"
      count={sentences.length}
      defaultOpen={false}
    >
      <div className="divide-y divide-slate-100">
        {sentences.map((s, i) => (
          <div key={i} className="px-5 py-3 hover:bg-slate-50/50">
            <div className="flex items-start gap-3">
              <span className="text-[11px] font-bold text-blue-500 bg-blue-50 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                {s.index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-slate-700 leading-relaxed">
                  {s.english}
                </p>
                <p className="text-[12px] text-blue-600 leading-relaxed mt-1">
                  {s.korean}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

export function VocabularyTable({
  vocabulary,
}: {
  vocabulary: NonNullable<PassageAnalysisData["vocabulary"]>;
}) {
  return (
    <SectionHeader
      icon={BookA}
      title="어휘 분석"
      count={vocabulary.length}
      defaultOpen={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left px-5 py-2 font-semibold">단어</th>
              <th className="text-left px-3 py-2 font-semibold">뜻</th>
              <th className="text-left px-3 py-2 font-semibold">품사</th>
              <th className="text-left px-3 py-2 font-semibold">발음</th>
              <th className="text-left px-3 py-2 font-semibold">난이도</th>
              <th className="text-left px-3 py-2 font-semibold">문장</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vocabulary.map((v, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-5 py-2 font-medium text-slate-800">
                  {v.word}
                </td>
                <td className="px-3 py-2 text-slate-600">{v.meaning}</td>
                <td className="px-3 py-2 text-slate-500">{v.partOfSpeech}</td>
                <td className="px-3 py-2 text-slate-400">{v.pronunciation}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      DIFFICULTY_COLORS[v.difficulty] ||
                        "bg-slate-100 text-slate-500",
                    )}
                  >
                    {DIFFICULTY_LABELS[v.difficulty] || v.difficulty}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-400">
                  #{v.sentenceIndex + 1}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionHeader>
  );
}

export function GrammarPoints({
  grammarPoints,
}: {
  grammarPoints: NonNullable<PassageAnalysisData["grammarPoints"]>;
}) {
  return (
    <SectionHeader
      icon={ListTree}
      title="문법 포인트"
      count={grammarPoints.length}
      defaultOpen={false}
    >
      <div className="divide-y divide-slate-100">
        {grammarPoints.map((g, i) => (
          <div key={i} className="px-5 py-3 hover:bg-slate-50/50">
            <div className="flex items-start gap-3">
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[13px] font-semibold text-slate-800">
                  {g.pattern}
                </p>
                <p className="text-[12px] text-slate-600 leading-relaxed">
                  {g.explanation}
                </p>
                <p className="text-[11px] text-blue-600 bg-blue-50 rounded px-2 py-1 inline-block">
                  &quot;{g.textFragment}&quot;
                </p>
                {g.examples && g.examples.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.examples.map((ex, ei) => (
                      <span
                        key={ei}
                        className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
                      >
                        {ex}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[10px] text-slate-400">
                  문장 #{g.sentenceIndex + 1} / {g.level}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

export function StructureSection({
  structure,
}: {
  structure: NonNullable<PassageAnalysisData["structure"]>;
}) {
  return (
    <SectionHeader icon={Layers} title="구조 분석" defaultOpen={false}>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            주제
          </p>
          <p className="text-[13px] text-slate-700 leading-relaxed">
            {structure.mainIdea}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            목적
          </p>
          <p className="text-[13px] text-slate-700 leading-relaxed">
            {structure.purpose}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            글의 유형
          </p>
          <p className="text-[13px] text-slate-700">{structure.textType}</p>
        </div>
        {structure.keyPoints && structure.keyPoints.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              핵심 포인트
            </p>
            <ul className="space-y-1">
              {structure.keyPoints.map((kp, i) => (
                <li
                  key={i}
                  className="text-[12px] text-slate-600 flex gap-1.5"
                >
                  <span className="text-blue-400 shrink-0">-</span>
                  {kp}
                </li>
              ))}
            </ul>
          </div>
        )}
        {structure.paragraphSummaries &&
          structure.paragraphSummaries.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                단락별 요약
              </p>
              <div className="space-y-2">
                {structure.paragraphSummaries.map((ps, i) => (
                  <div
                    key={i}
                    className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                      단락 {ps.paragraphIndex + 1} ({ps.role})
                    </p>
                    <p className="text-[12px] text-slate-700">{ps.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </SectionHeader>
  );
}

export function NotesSection({ notes }: { notes: NoteItem[] }) {
  return (
    <SectionHeader
      icon={FileText}
      title="교사 노트"
      count={notes.length}
      defaultOpen={false}
    >
      <div className="divide-y divide-slate-100">
        {notes.map((note) => (
          <div key={note.id} className="px-5 py-3 hover:bg-slate-50/50">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {NOTE_TYPE_LABELS[note.noteType] || note.noteType}
              </Badge>
              <span className="text-[10px] text-slate-400">
                {formatDate(note.createdAt)}
              </span>
            </div>
            <p className="text-[12px] text-slate-700 leading-relaxed">
              {note.content}
            </p>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}
