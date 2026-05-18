/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import { ArrowRightLeft, Braces, MessageSquare, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  GrammarPoint,
  SentenceAnalysis,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";
import { DIFF_LABELS } from "./constants";
import { highlightWord } from "./helpers";
import type { ActiveDetail } from "./types";

// ─── Vocab Panel ─────────────────────────────────────────
export function VocabPanel({
  item,
  sentence,
  onClose,
}: {
  item: VocabItem;
  sentence: SentenceAnalysis | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-slate-900">{item.word}</span>
            {item.pronunciation && <span className="text-sm text-slate-400">{item.pronunciation}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{item.partOfSpeech}</Badge>
            {DIFF_LABELS[item.difficulty] && <Badge className={`text-[10px] border-0 ${DIFF_LABELS[item.difficulty].cls}`}>{DIFF_LABELS[item.difficulty].label}</Badge>}
            {item.examType && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">출제: {item.examType}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <div className="text-[14px]"><span className="text-slate-500 mr-1">뜻:</span><span className="font-medium text-slate-800">{item.meaning}</span></div>
      {item.contextMeaning && <div className="text-[13px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2"><span className="text-slate-400 mr-1">문맥:</span>{item.contextMeaning}</div>}
      {item.englishDefinition && <div className="text-[13px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 italic"><span className="text-slate-400 mr-1 not-italic">영영:</span>{item.englishDefinition}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {item.synonyms?.length > 0 && <div><span className="text-slate-400 mr-1">동의어:</span>{item.synonyms.map((s, i) => <span key={i} className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 mr-1 font-medium">{s}</span>)}</div>}
        {item.antonyms?.length > 0 && <div><span className="text-slate-400 mr-1">반의어:</span>{item.antonyms.map((s, i) => <span key={i} className="bg-red-50 text-red-700 rounded px-1.5 py-0.5 mr-1 font-medium">{s}</span>)}</div>}
      </div>
      {item.derivatives?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">파생어:</span>{item.derivatives.map((d, i) => <span key={i} className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 mr-1">{d}</span>)}</div>}
      {item.collocations?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">콜로케이션:</span>{item.collocations.map((c, i) => <span key={i} className="bg-green-50 text-green-700 rounded px-1.5 py-0.5 mr-1">{c}</span>)}</div>}
      {sentence && <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[12px] leading-relaxed"><span className="text-slate-400 mr-1">문장:</span>{highlightWord(sentence.english, item.word)}</div>}
    </div>
  );
}

// ─── Grammar Panel ───────────────────────────────────────
export function GrammarPanel({
  item,
  onClose,
}: {
  item: GrammarPoint;
  sentence: SentenceAnalysis | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-lg font-bold text-slate-900">{item.pattern}</span>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {item.gradeLevel && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">{item.gradeLevel}</Badge>}
            {item.examType && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">출제: {item.examType}</Badge>}
            {item.csatFrequency && item.csatFrequency !== "해당없음" && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">수능 {item.csatFrequency}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <p className="text-[14px] text-slate-700 leading-relaxed">{item.explanation}</p>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[13px]"><span className="text-slate-400 mr-1">본문:</span><span className="border-b-2 border-dashed border-violet-400">{item.textFragment}</span></div>
      {item.commonMistake && <div className="text-[13px] bg-rose-50 border border-rose-100 rounded-lg px-3 py-2"><span className="text-rose-500 font-semibold mr-1">오답 함정:</span><span className="text-rose-700">{item.commonMistake}</span></div>}
      {item.transformations?.length > 0 && <div className="text-[13px]"><div className="flex items-center gap-1 text-slate-500 mb-1"><ArrowRightLeft className="w-3 h-3" /><span className="font-medium">변형 가능:</span></div><ul className="space-y-1 pl-4">{item.transformations.map((t, i) => <li key={i} className="list-disc text-slate-600">{t}</li>)}</ul></div>}
      {item.relatedGrammar?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">연관 문법:</span>{item.relatedGrammar.map((g, i) => <span key={i} className="bg-violet-50 text-violet-600 rounded px-1.5 py-0.5 mr-1">{g}</span>)}</div>}
      {item.examples?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mb-1 block">예문:</span><ul className="space-y-1 pl-4 text-slate-600">{item.examples.map((e, i) => <li key={i} className="list-disc">{e}</li>)}</ul></div>}
    </div>
  );
}

// ─── Syntax Panel ────────────────────────────────────────
export function SyntaxPanel({
  item,
  onClose,
}: {
  item: SyntaxItem;
  sentence: SentenceAnalysis | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-gradient-to-b from-cyan-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Braces className="w-4 h-4 text-cyan-600" />
          <span className="text-[15px] font-bold text-slate-900">구문 분석</span>
          <Badge className="text-[10px] border-0 bg-cyan-100 text-cyan-700">{item.complexity}</Badge>
          {item.patternType && <Badge variant="outline" className="text-[10px]">{item.patternType}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[13px] font-mono leading-relaxed"><span className="text-slate-400 mr-1 font-sans">구조:</span>{item.structure}</div>
      <div className="rounded-lg bg-cyan-50/50 border border-cyan-100 p-2.5 text-[13px] font-mono leading-relaxed"><span className="text-cyan-600 mr-1 font-sans font-medium">끊어읽기:</span>{item.chunkReading}</div>
      {item.keyPhrase && <div className="text-[13px]"><span className="text-slate-400 mr-1">핵심 구문:</span><span className="font-medium">{item.keyPhrase}</span></div>}
      {item.transformPoint && <div className="text-[13px] flex items-start gap-1.5"><ArrowRightLeft className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" /><span className="text-slate-600">{item.transformPoint}</span></div>}
    </div>
  );
}

// ─── Key Sentence Panel ──────────────────────────────────
export function KeySentencePanel({
  detail,
  onClose,
}: {
  detail: Extract<ActiveDetail, { kind: "keySentence" }>;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-green-200 bg-gradient-to-b from-green-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-600" />
          <span className="text-[15px] font-bold text-slate-900">핵심 문장</span>
          <Badge className="text-[10px] border-0 bg-green-100 text-green-700">{detail.role}</Badge>
          {detail.isTopicSentence && <Badge className="text-[10px] border-0 bg-green-100 text-green-700">주제문</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <p className="text-[14px] text-slate-700 leading-relaxed">{detail.summary}</p>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[12px] font-mono leading-relaxed">{detail.sentence.english}</div>
      <p className="text-[12px] text-slate-500">{detail.sentence.korean}</p>
      {detail.isTopicSentence && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          이 문장은 글의 <span className="font-semibold">주제문(Topic Sentence)</span>으로, 글 전체의 핵심 주장을 담고 있습니다. 빈칸 추론, 주제/요지 문제에서 출제 가능성이 높습니다.
        </div>
      )}
      {detail.role === "주장" && !detail.isTopicSentence && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          글의 <span className="font-semibold">핵심 주장</span>을 담은 문장입니다. 주제/요지 파악 문제와 빈칸 추론에서 자주 출제됩니다.
        </div>
      )}
      {detail.role === "결론" && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          글의 <span className="font-semibold">결론</span>으로, 전체 논지를 마무리합니다. 요약문 완성, 제목 추론 문제에서 핵심 단서가 됩니다.
        </div>
      )}
    </div>
  );
}

// ─── Exam Point Panel ────────────────────────────────────
export function ExamPointPanel({
  detail,
  onClose,
}: {
  detail: Extract<ActiveDetail, { kind: "examPoint" }>;
  onClose: () => void;
}) {
  const isParaphrase = !!detail.alternatives;
  const isTransform = !!detail.transformType;

  return (
    <div className="rounded-xl border border-yellow-200 bg-gradient-to-b from-yellow-50/30 to-white p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-yellow-600" />
          <span className="text-[15px] font-bold text-slate-900">출제 포인트</span>
          {isParaphrase && <Badge className="text-[10px] border-0 bg-blue-100 text-blue-700">빈칸/동의어</Badge>}
          {isTransform && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">서술형/변형</Badge>}
          {detail.difficulty && <Badge className="text-[10px] border-0 bg-slate-100 text-slate-600">{detail.difficulty}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>

      {/* 원문 */}
      <div className="rounded-lg border border-slate-100 p-3 text-[13px] font-mono" style={{ background: "linear-gradient(to top, #fef9c3 30%, white 30%)" }}>
        {detail.text}
      </div>

      {/* 출제 이유 */}
      {detail.reason && (
        <div className="text-[13px] bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
          <span className="text-yellow-700 font-semibold mr-1">출제 이유:</span>
          <span className="text-slate-700">{detail.reason}</span>
        </div>
      )}

      {/* 예상 문항 */}
      {detail.questionExample && (
        <div className="text-[13px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <span className="text-slate-500 font-semibold mr-1 block mb-1">예상 출제 문항:</span>
          <span className="text-slate-800 italic">{detail.questionExample}</span>
        </div>
      )}

      {/* 패러프레이징 */}
      {detail.alternatives && detail.alternatives.length > 0 && (
        <div className="text-[13px]">
          <span className="text-blue-600 font-semibold mb-1.5 block">패러프레이징 대안:</span>
          <div className="space-y-1">
            {detail.alternatives.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-blue-400">→</span>
                <span className="text-blue-700 bg-blue-50 rounded px-2 py-1 font-medium">{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 구조 변형 */}
      {detail.transformType && (
        <div className="text-[13px]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-violet-600 font-semibold">구조 변형: {detail.transformType}</span>
          </div>
          {detail.example && (
            <div className="bg-violet-50 rounded-lg px-3 py-2 text-[12px] font-mono text-violet-800">
              → {detail.example}
            </div>
          )}
        </div>
      )}

      {/* 관련 포인트 */}
      {detail.relatedPoint && (
        <div className="text-[12px] text-slate-500">
          <span className="font-medium mr-1">관련:</span>
          <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{detail.relatedPoint}</span>
        </div>
      )}
    </div>
  );
}
