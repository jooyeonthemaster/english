"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  FileText,
  Pencil,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
};

const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

// ─── Types ───────────────────────────────────────────────

export interface QuestionCardItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: Date;
  passage: {
    id: string; title: string; content: string;
    grade?: number | null; semester?: string | null; publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count?: { examLinks: number };
}

// ─── Helpers ─────────────────────────────────────────────

function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) {
    return (Array.isArray(fallback) ? fallback : str) as T;
  }
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

// Detect what marking pattern the passage uses: (a)(b)(c), (A)(B)(C), ①②③, or none
function detectPassageMarking(passageContent?: string): "lowercase" | "uppercase" | "circled" | "none" {
  if (!passageContent) return "none";
  if (/\(a\)/.test(passageContent)) return "lowercase";
  if (/\(A\)/.test(passageContent)) return "uppercase";
  if (/①/.test(passageContent)) return "circled";
  return "none";
}

const MARKERS = {
  lowercase: ["(a)", "(b)", "(c)", "(d)", "(e)"],
  uppercase: ["(A)", "(B)", "(C)", "(D)", "(E)"],
  circled: ["①", "②", "③", "④", "⑤"],
  none: ["①", "②", "③", "④", "⑤"],
};

// Format option: always use index-based number label, adapt text based on passage marking
function formatOption(label: string, text: string, index: number, passageMarking: "lowercase" | "uppercase" | "circled" | "none"): { displayLabel: string; displayText: string } {
  const displayLabel = `${index + 1}`;
  const trimmed = text.trim();

  // If text is just a marker (①, ②, number, or empty) — use passage marking pattern
  const isTextOnlyMarker = !trimmed || /^[①②③④⑤]$/.test(trimmed) || /^[1-5]$/.test(trimmed);
  if (isTextOnlyMarker) {
    return { displayLabel, displayText: MARKERS[passageMarking][index] || label };
  }

  // If label is a plain number or circled number, just show text
  const num = parseInt(label);
  if ((!isNaN(num) && num >= 1 && num <= 5) || /^[①②③④⑤]$/.test(label)) {
    return { displayLabel, displayText: text };
  }
  // Otherwise prepend label to text (e.g. "(A) that", "(a) advantages")
  return { displayLabel, displayText: `${label} ${text}` };
}

export function renderFormatted(text: string, opts?: { underlineMarkedWords?: boolean; highlightMarkers?: boolean }): React.ReactNode {
  const underline = opts?.underlineMarkedWords ?? false;
  const highlightMarkers = opts?.highlightMarkers ?? false;

  // Build regex based on options
  let pattern: string;
  if (underline) {
    // Match (a) word with the word captured separately
    pattern = "__([^_]+)__|_{3,}|([①②③④⑤])|\\(([a-eA-E])\\)\\s*(\\S+)";
  } else if (highlightMarkers) {
    // Match (a) marker only, no word capture
    pattern = "__([^_]+)__|_{3,}|([①②③④⑤])|\\(([a-eA-E])\\)";
  } else {
    // Basic: only __word__, blanks, circled numbers
    pattern = "__([^_]+)__|_{3,}|([①②③④⑤])";
  }
  const regex = new RegExp(pattern, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // __word__ → underline
      parts.push(
        <span key={key++} className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      // ①②③④⑤ → bold blue
      parts.push(
        <span key={key++} className="font-extrabold text-blue-600 text-[18px] mx-1 relative -top-[1px]">
          {match[2]}
        </span>
      );
    } else if (match[3]) {
      // (a)~(e), (A)~(E) marker
      if (match[4] && underline) {
        // (a) word → blue marker + underlined word (for passage text)
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({match[3]})</span>
            {" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold">
              {match[4]}
            </span>
          </span>
        );
      } else {
        // Just the marker, no underline (for options / non-underline mode)
        parts.push(
          <span key={key++} className="font-bold text-blue-600">
            ({match[3]})
          </span>
        );
      }
    } else {
      // _____ → blank
      parts.push(
        <span key={key++} className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline">&nbsp;</span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ─── Component ───────────────────────────────────────────

interface QuestionCardProps {
  q: QuestionCardItem;
  num: number;
  selected?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  /** Hide actions (edit, dropdown) — for read-only contexts */
  readonly?: boolean;
  /** Compact mode — smaller padding, hide passage preview by default */
  compact?: boolean;
}

export function QuestionCard({
  q,
  num,
  selected = false,
  onToggle,
  onDelete,
  onApprove,
  readonly = false,
  compact = false,
}: QuestionCardProps) {
  const [passageOpen, setPassageOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const router = useRouter();

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const passageMarking = detectPassageMarking(q.passage?.content || q.questionText);
  // 3 levels of (a)/(A) marker rendering:
  // Level 1 — underline + marker highlight: types where (a) word means "this word is being tested"
  // Level 2 — marker highlight only: types where (a) marks a position but word shouldn't be underlined
  // Level 3 — plain text: types where (a) in passage is irrelevant to this question
  const UNDERLINE_TYPES = ["VOCAB_CHOICE", "GRAMMAR_ERROR", "ANTONYM"];
  const MARKER_ONLY_TYPES = ["SENTENCE_INSERT", "IRRELEVANT", "SENTENCE_ORDER"];
  const sub = q.subType || "";
  const needsUnderline = UNDERLINE_TYPES.includes(sub);
  const showMarkers = UNDERLINE_TYPES.includes(sub) || MARKER_ONLY_TYPES.includes(sub);
  const tags: string[] = Array.isArray(q.tags) ? q.tags : parseJSON<string[]>(q.tags, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  const keyPoints = parseJSON<string[]>(q.explanation?.keyPoints || null, []);

  return (
    <Card className={`transition-all ${selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"}`}>
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-3"}>
        {/* Top row */}
        <div className="flex items-start gap-3">
          {onToggle && (
            <div className="pt-0.5">
              <Checkbox checked={selected} onCheckedChange={onToggle} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-400">{num}.</span>
              <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[q.type] || q.type}</Badge>
              {q.subType && <span className="text-[10px] text-slate-500">{SUBTYPE_LABELS[q.subType] || q.subType}</span>}
              {diffConfig && <Badge variant="outline" className={`text-[10px] ${diffConfig.className}`}>{diffConfig.label}</Badge>}
              {q.aiGenerated && <Layers className="w-3 h-3 text-blue-400" />}
              {q.approved ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Clock className="w-3 h-3 text-slate-300" />}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tag}</span>
                ))}
              </div>
            )}
          </div>
          {!readonly && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/director/questions/${q.id}`)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><span className="text-xs">...</span></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/director/questions/${q.id}`)}>
                    <Eye className="w-3.5 h-3.5 mr-2" /> 상세 보기
                  </DropdownMenuItem>
                  {!q.approved && onApprove && (
                    <DropdownMenuItem onClick={onApprove}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> 승인
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-red-600">
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> 삭제
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Passage */}
        {q.passage && !compact && (
          <div className="bg-slate-50 rounded-md px-3 py-2">
            <button className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium w-full text-left" onClick={() => setPassageOpen(!passageOpen)}>
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate">{q.passage.title}</span>
              {passageOpen ? <ChevronUp className="w-3 h-3 ml-auto shrink-0" /> : <ChevronDown className="w-3 h-3 ml-auto shrink-0" />}
            </button>
            <p className={`text-[11px] text-slate-500 font-mono leading-relaxed mt-1.5 ${passageOpen ? "" : "line-clamp-3"}`}>
              {renderFormatted(q.passage.content, { underlineMarkedWords: needsUnderline, highlightMarkers: showMarkers })}
            </p>
          </div>
        )}

        {/* Question text */}
        <div className={`text-slate-800 leading-relaxed font-medium whitespace-pre-line ${compact ? "text-[12px] line-clamp-3" : "text-[13px]"}`}>
          {renderFormatted(q.questionText, { underlineMarkedWords: needsUnderline, highlightMarkers: showMarkers })}
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div className={`space-y-1 pl-1 ${compact ? "text-[11px]" : ""}`}>
            {(compact ? options.filter(o => o.label === q.correctAnswer) : options).map((opt, idx) => {
              const isCorrect = opt.label === q.correctAnswer;
              const { displayLabel, displayText } = formatOption(opt.label, opt.text, idx, passageMarking);
              return (
                <div key={opt.label} className={`flex items-start gap-2.5 ${compact ? "text-[11px]" : "text-[12px]"} rounded px-2 py-1 ${isCorrect ? "bg-emerald-50 text-emerald-800 font-medium" : "text-slate-600"}`}>
                  <span className={`shrink-0 text-[13px] font-bold tabular-nums pt-px ${isCorrect ? "text-emerald-600" : "text-slate-400"}`}>
                    {displayLabel}.
                  </span>
                  <span className="pt-0.5">{displayText}</span>
                </div>
              );
            })}
            {compact && options.length > 1 && (
              <span className="text-[10px] text-slate-400 pl-2">외 {options.length - 1}개 선택지</span>
            )}
          </div>
        )}

        {/* Non-MC answer — hide if already shown in questionText */}
        {options.length === 0 && q.correctAnswer && !q.questionText.includes(q.correctAnswer) && (
          <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded">
            <span className="font-medium">정답:</span> {q.correctAnswer}
          </div>
        )}

        {/* Explanation */}
        {q.explanation && (
          <div>
            <button className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1" onClick={() => setExplanationOpen(!explanationOpen)}>
              {explanationOpen ? "해설 접기" : "해설 보기"}
              {explanationOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {explanationOpen && (
              <div className="mt-2 bg-slate-50 border border-slate-100 rounded-md px-3 py-2 space-y-2">
                <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">{q.explanation.content}</p>
                {keyPoints.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500">핵심 포인트</span>
                    {keyPoints.map((kp, i) => (
                      <p key={i} className="text-[11px] text-slate-600 pl-2 border-l-2 border-teal-300">{kp}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          <span>{formatDate(q.createdAt)}</span>
          {q._count?.examLinks && q._count.examLinks > 0 && (
            <span>시험 {q._count.examLinks}회 사용</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
