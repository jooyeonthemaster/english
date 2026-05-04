// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  BookOpen,
  Languages,
  BookA,
  Layers,
  ListTree,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Star,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
} from "@/components/workbench/question-type-filter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
}

interface NoteItem {
  id: string;
  content: string;
  noteType: string;
  highlightStart: number | null;
  highlightEnd: number | null;
  createdAt: Date;
}

interface PassageData {
  id: string;
  title: string;
  content: string;
  source: string | null;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string } | null;
  analysis: {
    id: string;
    analysisData: string;
    version: number;
    createdAt: Date;
  } | null;
  notes: NoteItem[];
  questions: QuestionItem[];
}

interface Props {
  passage: PassageData;
  academyId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
  basic: "기본",
  intermediate: "중급",
  advanced: "고급",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  BASIC: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERMEDIATE: "bg-blue-50 text-blue-700 border-blue-200",
  KILLER: "bg-red-50 text-red-700 border-red-200",
  basic: "bg-emerald-50 text-emerald-700 border-emerald-200",
  intermediate: "bg-blue-50 text-blue-700 border-blue-200",
  advanced: "bg-red-50 text-red-700 border-red-200",
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  EMPHASIS: "강조",
  GRAMMAR: "문법",
  VOCAB: "어휘",
  TIP: "팁",
};

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 hover:bg-slate-50/50 transition-colors"
      >
        <Icon className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-[14px] font-semibold text-slate-800 flex-1 text-left">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[12px] text-slate-400">{count}개</span>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card (readonly, inline)
// ---------------------------------------------------------------------------

function ReadonlyQuestionCard({ q, num }: { q: QuestionItem; num: number }) {
  const [expanded, setExpanded] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-bold text-slate-500">{num}.</span>
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[q.type] || q.type}
        </Badge>
        {q.subType && SUBTYPE_LABELS[q.subType] && (
          <Badge variant="outline" className="text-[10px] bg-slate-50">
            {SUBTYPE_LABELS[q.subType]}
          </Badge>
        )}
        {diffConfig && (
          <Badge
            variant="outline"
            className={cn("text-[10px]", diffConfig.className)}
          >
            {diffConfig.label}
          </Badge>
        )}
        {q.aiGenerated && (
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        )}
        {q.approved ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        )}
        {q.starred && (
          <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400 shrink-0" />
        )}
        <div className="ml-auto">
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-all border",
              expanded
                ? "text-blue-600 bg-blue-50 border-blue-200"
                : "text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100",
            )}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                펼치기
              </>
            )}
          </button>
        </div>
      </div>

      {/* Question text */}
      <div
        className={cn(
          "text-[13px] text-slate-700 leading-relaxed whitespace-pre-line",
          !expanded && "line-clamp-3",
        )}
      >
        {q.questionText}
      </div>

      {/* Options (expanded) */}
      {expanded && options.length > 0 && (
        <div className="space-y-1 mt-3 pl-1">
          {options.map((opt) => {
            const isCorrect = opt.label === q.correctAnswer;
            return (
              <div
                key={opt.label}
                className={cn(
                  "flex items-start gap-2 text-[12px] rounded px-2 py-1",
                  isCorrect
                    ? "bg-emerald-50 text-emerald-800 font-medium"
                    : "text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500",
                  )}
                >
                  {opt.label}
                </span>
                <span className="pt-0.5">{opt.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MC correct answer (expanded) */}
      {expanded && options.length === 0 && q.correctAnswer && (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded mt-3">
          <span className="font-medium">정답:</span> {q.correctAnswer}
        </div>
      )}

      {/* Explanation toggle */}
      {q.explanation?.content && expanded && (
        <div className="mt-3">
          <button
            onClick={() => setExplanationOpen(!explanationOpen)}
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {explanationOpen ? "해설 접기" : "해설 보기"}
            {explanationOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {explanationOpen && (
            <div className="bg-blue-50/50 rounded-lg p-2.5 mt-1.5 border border-blue-100">
              <p className="text-[10px] font-semibold text-blue-600 mb-1">
                해설
              </p>
              <p className="text-[12px] text-slate-700 leading-relaxed">
                {q.explanation.content}
              </p>
              {q.explanation.keyPoints &&
                (() => {
                  const kps = parseJSON<string[]>(q.explanation.keyPoints, []);
                  return kps.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">
                        핵심 포인트
                      </p>
                      <ul className="space-y-0.5">
                        {kps.map((kp, i) => (
                          <li
                            key={i}
                            className="text-[11px] text-slate-600 flex gap-1.5"
                          >
                            <span className="text-blue-400 shrink-0">-</span>
                            {kp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}
              {q.explanation.wrongOptionExplanations &&
                (() => {
                  const woe = parseJSON<Record<string, string>>(
                    q.explanation.wrongOptionExplanations,
                    {},
                  );
                  const entries = Object.entries(woe);
                  return entries.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">
                        오답 해설
                      </p>
                      <div className="space-y-0.5">
                        {entries.map(([label, text]) => (
                          <p key={label} className="text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-500">
                              {label}.
                            </span>{" "}
                            {text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-2 mt-2 border-t border-slate-100">
        <span>{formatDate(q.createdAt)}</span>
        <span>{q.points}점</span>
        {q._count.examLinks > 0 && (
          <span>시험 {q._count.examLinks}회 사용</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminPassageDetail({ passage, academyId }: Props) {
  const analysisData = useMemo<PassageAnalysisData | null>(() => {
    if (!passage.analysis?.analysisData) return null;
    try {
      return JSON.parse(passage.analysis.analysisData);
    } catch {
      return null;
    }
  }, [passage.analysis?.analysisData]);

  const tags = parseJSON<string[]>(passage.tags, []);

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/academies/${academyId}/passages`}
          className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          지문 목록
        </Link>
      </div>

      {/* Passage header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-bold text-slate-900">
              {passage.title || "제목 없음"}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {passage.grade && (
                <span className="text-[12px] text-slate-500">
                  {passage.grade}학년
                </span>
              )}
              {passage.semester && (
                <span className="text-[12px] text-slate-500">
                  {passage.semester === "FIRST" ? "1학기" : "2학기"}
                </span>
              )}
              {passage.unit && (
                <span className="text-[12px] text-slate-500">
                  {passage.unit}
                </span>
              )}
              {passage.publisher && (
                <span className="text-[12px] text-slate-500">
                  {passage.publisher}
                </span>
              )}
              {passage.school && (
                <Badge variant="outline" className="text-[10px]">
                  {passage.school.name}
                </Badge>
              )}
              {passage.difficulty && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    DIFFICULTY_COLORS[passage.difficulty],
                  )}
                >
                  {DIFFICULTY_LABELS[passage.difficulty] || passage.difficulty}
                </Badge>
              )}
              {passage.source && (
                <span className="text-[11px] text-slate-400">
                  출처: {passage.source}
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-2">
              {formatDate(passage.createdAt)} 생성
            </div>
          </div>
        </div>
      </div>

      {/* Passage content */}
      <SectionHeader icon={BookOpen} title="지문 원문" defaultOpen={true}>
        <div className="p-5">
          <p className="text-[14px] text-slate-700 leading-[2] font-mono whitespace-pre-wrap">
            {passage.content}
          </p>
        </div>
      </SectionHeader>

      {/* Analysis: Sentence translations */}
      {analysisData?.sentences && analysisData.sentences.length > 0 && (
        <SectionHeader
          icon={Languages}
          title="문장별 해석"
          count={analysisData.sentences.length}
          defaultOpen={false}
        >
          <div className="divide-y divide-slate-100">
            {analysisData.sentences.map((s, i) => (
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
      )}

      {/* Analysis: Vocabulary */}
      {analysisData?.vocabulary && analysisData.vocabulary.length > 0 && (
        <SectionHeader
          icon={BookA}
          title="어휘 분석"
          count={analysisData.vocabulary.length}
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
                {analysisData.vocabulary.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-5 py-2 font-medium text-slate-800">
                      {v.word}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{v.meaning}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {v.partOfSpeech}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {v.pronunciation}
                    </td>
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
      )}

      {/* Analysis: Grammar points */}
      {analysisData?.grammarPoints && analysisData.grammarPoints.length > 0 && (
        <SectionHeader
          icon={ListTree}
          title="문법 포인트"
          count={analysisData.grammarPoints.length}
          defaultOpen={false}
        >
          <div className="divide-y divide-slate-100">
            {analysisData.grammarPoints.map((g, i) => (
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
      )}

      {/* Analysis: Structure */}
      {analysisData?.structure && (
        <SectionHeader
          icon={Layers}
          title="구조 분석"
          defaultOpen={false}
        >
          <div className="p-5 space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                주제
              </p>
              <p className="text-[13px] text-slate-700 leading-relaxed">
                {analysisData.structure.mainIdea}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                목적
              </p>
              <p className="text-[13px] text-slate-700 leading-relaxed">
                {analysisData.structure.purpose}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                글의 유형
              </p>
              <p className="text-[13px] text-slate-700">
                {analysisData.structure.textType}
              </p>
            </div>
            {analysisData.structure.keyPoints &&
              analysisData.structure.keyPoints.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    핵심 포인트
                  </p>
                  <ul className="space-y-1">
                    {analysisData.structure.keyPoints.map((kp, i) => (
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
            {analysisData.structure.paragraphSummaries &&
              analysisData.structure.paragraphSummaries.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    단락별 요약
                  </p>
                  <div className="space-y-2">
                    {analysisData.structure.paragraphSummaries.map((ps, i) => (
                      <div
                        key={i}
                        className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
                      >
                        <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                          단락 {ps.paragraphIndex + 1} ({ps.role})
                        </p>
                        <p className="text-[12px] text-slate-700">
                          {ps.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </SectionHeader>
      )}

      {/* Notes */}
      {passage.notes.length > 0 && (
        <SectionHeader
          icon={FileText}
          title="교사 노트"
          count={passage.notes.length}
          defaultOpen={false}
        >
          <div className="divide-y divide-slate-100">
            {passage.notes.map((note) => (
              <div
                key={note.id}
                className="px-5 py-3 hover:bg-slate-50/50"
              >
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
      )}

      {/* Questions */}
      <SectionHeader
        icon={HelpCircle}
        title="연결된 문제"
        count={passage.questions.length}
        defaultOpen={true}
      >
        {passage.questions.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-slate-400">
            이 지문에 연결된 문제가 없습니다
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {passage.questions.map((q, i) => (
              <ReadonlyQuestionCard key={q.id} q={q} num={i + 1} />
            ))}
          </div>
        )}
      </SectionHeader>
    </div>
  );
}
