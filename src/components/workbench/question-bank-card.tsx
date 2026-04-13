// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
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
  MoreHorizontal,
  Star,
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
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
} from "./question-type-filter";
import { parseJSON } from "./shared/helpers";

// ---------------------------------------------------------------------------
// Render text with __word__ -> underline, _____ -> blank line, markers
// Enhanced version matching question-card.tsx quality
// ---------------------------------------------------------------------------

function renderFormatted(text: string): React.ReactNode {
  // Match: __content__ (underline with possible marker inside), ___+ (blank), circled numbers, (a)/(A) markers
  const regex = /__([^_]+)__|_{3,}|([①②③④⑤])|\(([a-eA-E])\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // __content__ -- check if content starts with a marker like (A)/(a)
      const markerMatch = match[1].match(/^\(([a-eA-E])\)\s*(.+)$/);
      if (markerMatch) {
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({markerMatch[1]})</span>
            {" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
              {markerMatch[2]}
            </span>
          </span>
        );
      } else {
        parts.push(
          <span
            key={key++}
            className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
          >
            {match[1]}
          </span>
        );
      }
    } else if (match[2]) {
      // circled numbers
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mx-0.5"
        >
          {match[2]}
        </span>
      );
    } else if (match[3]) {
      // (a)/(A) markers
      parts.push(
        <span key={key++} className="font-bold text-blue-600">
          ({match[3]})
        </span>
      );
    } else {
      // _____ blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ---------------------------------------------------------------------------
// Parse questionText into structured sections
// ---------------------------------------------------------------------------

interface ParsedSection {
  type: "direction" | "passage" | "marker" | "conditions" | "paragraphs" | "scrambled" | "hint" | "error" | "blanks" | "summary" | "target" | "context" | "matchType" | "fallback";
  label?: string;
  content: string;
  items?: string[]; // for conditions, paragraphs, scrambled words, blanks
}

function parseQuestionSections(questionText: string, subType: string | null): ParsedSection[] {
  if (!questionText) return [];

  const sections: ParsedSection[] = [];
  // Split by double newline (how buildQuestionText joins parts)
  const blocks = questionText.split(/\n\n/).filter(Boolean);

  // Known section markers that buildQuestionText() prefixes
  const MARKER_MAP: Record<string, { type: ParsedSection["type"]; label: string }> = {
    "[주어진 문장]": { type: "marker", label: "주어진 문장" },
    "[영작할 우리말]": { type: "marker", label: "영작할 우리말" },
    "[원문]": { type: "marker", label: "원래 문장" },
    "[조건]": { type: "conditions", label: "조건" },
    "[요약문]": { type: "summary", label: "요약문" },
    "[빈칸 정답]": { type: "blanks", label: "빈칸 정답" },
    "[배열 단어]": { type: "scrambled", label: "배열 단어" },
    "[힌트]": { type: "hint", label: "힌트" },
    "[오류 문장]": { type: "error", label: "오류 문장" },
    "[대상 단어]": { type: "target", label: "대상 단어" },
    "[문맥]": { type: "context", label: "문맥" },
    "[유형:": { type: "matchType", label: "유형" },
  };

  let directionFound = false;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check for known markers
    let matched = false;
    for (const [marker, config] of Object.entries(MARKER_MAP)) {
      if (trimmed.startsWith(marker)) {
        const content = trimmed.slice(marker.length).replace(/^\s*/, "").replace(/\]$/, "");

        if (config.type === "conditions") {
          // Parse numbered conditions: "1. xxx\n2. yyy"
          const lines = content.split("\n").filter(Boolean);
          const items = lines.map(l => l.replace(/^\d+\.\s*/, "").trim());
          sections.push({ type: "conditions", label: config.label, content, items });
        } else if (config.type === "scrambled") {
          const words = content.split(/\s*\/\s*/);
          sections.push({ type: "scrambled", label: config.label, content, items: words });
        } else if (config.type === "blanks") {
          sections.push({ type: "blanks", label: config.label, content });
        } else {
          sections.push({ type: config.type, label: config.label, content });
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // First block without a marker = direction (if not yet found)
    if (!directionFound) {
      directionFound = true;
      sections.push({ type: "direction", content: trimmed });
      continue;
    }

    // Detect paragraph blocks like "(A) text\n(B) text\n(C) text"
    if (/^\([A-C]\)\s/.test(trimmed)) {
      const lines = trimmed.split("\n").filter(Boolean);
      sections.push({ type: "paragraphs", label: "단락", content: trimmed, items: lines });
      continue;
    }

    // Otherwise it's passage content (the main body text)
    sections.push({ type: "passage", content: trimmed });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Section renderer for parsed sections
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
    </span>
  );
}

function RenderedSections({ sections, expanded }: { sections: ParsedSection[]; expanded: boolean }) {
  return (
    <div className="space-y-2">
      {sections.map((section, i) => {
        switch (section.type) {
          case "direction":
            return (
              <div key={i} className="text-[13px] font-bold text-slate-900 leading-relaxed whitespace-pre-line">
                {renderFormatted(section.content)}
              </div>
            );

          case "passage":
            return (
              <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap">
                  {renderFormatted(section.content)}
                </div>
              </div>
            );

          case "marker":
            return (
              <div key={i} className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                <SectionLabel label={section.label!} />
                <p className="text-[13px] text-indigo-900 leading-relaxed font-medium mt-0.5">
                  {renderFormatted(section.content)}
                </p>
              </div>
            );

          case "conditions":
            return (
              <div key={i} className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-3 space-y-1.5">
                <SectionLabel label={section.label || "조건"} />
                <ol className="space-y-1 list-decimal list-inside">
                  {(section.items || []).map((item, ci) => (
                    <li key={ci} className="text-[12px] text-slate-700 leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            );

          case "paragraphs":
            return (
              <div key={i} className="space-y-1.5">
                {(section.items || []).map((item, pi) => {
                  const labelMatch = item.match(/^\(([A-C])\)\s*(.*)/);
                  return (
                    <div key={pi} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      {labelMatch ? (
                        <>
                          <span className="text-[11px] font-bold text-blue-600 mr-2">({labelMatch[1]})</span>
                          <span className="text-[12px] text-slate-700 leading-relaxed">{labelMatch[2]}</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-slate-700 leading-relaxed">{item}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );

          case "scrambled":
            return (
              <div key={i}>
                <SectionLabel label={section.label || "배열 단어"} />
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 mt-1">
                  {(section.items || []).map((word, wi) => (
                    <span key={wi} className="inline-block px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            );

          case "error":
            return (
              <div key={i} className="rounded-lg bg-red-50 border border-red-200 p-3">
                <SectionLabel label="오류 문장" />
                <p className="text-[13px] text-slate-700 leading-relaxed mt-0.5">
                  {renderFormatted(section.content)}
                </p>
              </div>
            );

          case "summary":
            return (
              <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <SectionLabel label="요약문" />
                <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap mt-1">
                  {renderFormatted(section.content)}
                </div>
              </div>
            );

          case "blanks":
            return (
              <div key={i} className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                <SectionLabel label="빈칸 정답" />
                <p className="text-[12px] text-emerald-800 mt-0.5">{section.content}</p>
              </div>
            );

          case "target":
            return (
              <div key={i} className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
                <SectionLabel label="대상 단어" />
                <p className="text-[15px] font-bold text-violet-900 mt-0.5">{section.content}</p>
              </div>
            );

          case "context":
            return (
              <div key={i} className="text-[12px] text-slate-600 italic leading-relaxed px-1">
                {section.content}
              </div>
            );

          case "hint":
            return (
              <div key={i} className="text-[12px] text-slate-500 italic px-1">
                {section.content}
              </div>
            );

          case "matchType":
            return (
              <div key={i} className="text-[11px] font-medium text-slate-500 px-1">
                유형: <Badge variant="outline" className="text-[9px] ml-1">{section.content}</Badge>
              </div>
            );

          default:
            return (
              <div key={i} className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                {renderFormatted(section.content)}
              </div>
            );
        }
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsed preview: smart extraction from parsed sections
// ---------------------------------------------------------------------------

function CollapsedPreview({
  sections,
  options,
  correctAnswer,
  questionClamp,
}: {
  sections: ParsedSection[];
  options: { label: string; text: string }[];
  correctAnswer: string;
  questionClamp: string;
}) {
  const direction = sections.find(s => s.type === "direction");
  const passage = sections.find(s => s.type === "passage" || s.type === "summary");
  const firstOption = options[0];

  return (
    <div className="space-y-1">
      {/* Direction */}
      {direction && (
        <div className={`text-[13px] font-bold text-slate-900 leading-relaxed ${questionClamp}`}>
          {direction.content}
        </div>
      )}

      {/* Passage preview (1 line) */}
      {passage && (
        <div className="text-[12px] text-slate-500 line-clamp-1 font-mono">
          {passage.content}
        </div>
      )}

      {/* Options preview or answer preview */}
      {options.length > 0 ? (
        <div className="space-y-0.5">
          {/* Show correct answer option */}
          {(() => {
            const correct = options.find(o => o.label === correctAnswer);
            if (!correct) return null;
            return (
              <div className="flex items-center gap-1.5 text-[12px] rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-800 font-medium">
                <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-emerald-500 text-white">
                  {correct.label}
                </span>
                <div className="truncate">{correct.text}</div>
              </div>
            );
          })()}
          {options.length > 1 && (
            <span className="text-[10px] text-slate-400 pl-2">
              외 {options.length - 1}개 선택지
            </span>
          )}
        </div>
      ) : correctAnswer ? (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded line-clamp-1">
          <span className="font-medium">정답:</span> {correctAnswer}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionBankItem {
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
  starred: boolean;
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
  _count: { examLinks: number };
}

// ---------------------------------------------------------------------------
// QuestionBankCard
// ---------------------------------------------------------------------------

export function QuestionBankCard({
  q,
  num,
  selected,
  onToggle,
  onDelete,
  onApprove,
  onToggleStar,
  viewSize = "lg",
}: {
  q: QuestionBankItem;
  num: number;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onToggleStar?: () => void;
  viewSize?: "lg" | "md" | "sm";
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const tags: string[] = Array.isArray(q.tags)
    ? q.tags
    : parseJSON<string[]>(q.tags, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];

  // Parse questionText into structured sections
  const sections = useMemo(
    () => parseQuestionSections(q.questionText, q.subType),
    [q.questionText, q.subType]
  );

  // Make card draggable
  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ questionId: q.id, type: "question" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [q.id]);

  const collapsedPx =
    viewSize === "lg" ? 280 : viewSize === "md" ? 240 : 200;

  const questionClamp =
    viewSize === "lg" ? "line-clamp-3" : "line-clamp-2";

  const maxOptions = viewSize === "lg" ? 5 : viewSize === "md" ? 4 : 3;

  return (
    <Card
      ref={dragRef}
      className={`cursor-grab active:cursor-grabbing flex flex-col ${
        expanded ? "" : "overflow-hidden"
      } ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${
        selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"
      }`}
      style={expanded ? undefined : {
        maxHeight: `${collapsedPx}px`,
      }}
    >
      <CardContent ref={contentRef} className={`p-3 flex flex-col gap-1.5 ${expanded ? "space-y-2" : ""}`}>
        {/* Header row */}
        <div className="flex items-center gap-2 shrink-0">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="shrink-0"
          />
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStar?.(); }}
            className="shrink-0 p-0.5 rounded hover:bg-yellow-50 transition-colors"
            aria-label={q.starred ? "중요 해제" : "중요 표시"}
            aria-pressed={q.starred}
          >
            <Star
              className={`w-3.5 h-3.5 transition-colors ${
                q.starred
                  ? "fill-yellow-400 text-yellow-500"
                  : "text-slate-300 hover:text-yellow-400"
              }`}
            />
          </button>
          <span className="text-[13px] font-bold text-slate-500 shrink-0">
            {num}.
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {TYPE_LABELS[q.type] || q.type}
          </Badge>
          {q.subType && SUBTYPE_LABELS[q.subType] && (
            <Badge variant="outline" className="text-[10px] shrink-0 bg-slate-50">
              {SUBTYPE_LABELS[q.subType]}
            </Badge>
          )}
          {diffConfig && (
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${diffConfig.className}`}
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
          <div className="flex items-center gap-1 ml-auto shrink-0">
            {/* Expand/Collapse toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); if (!expanded) setPassageOpen(false); }}
              className={`h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-all border ${
                expanded
                  ? "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100"
                  : "text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {expanded ? (
                <><ChevronUp className="w-3.5 h-3.5" />접기</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" />펼치기</>
              )}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => router.push(`/director/questions/${q.id}`)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/director/questions/${q.id}`)}
                >
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  상세 보기
                </DropdownMenuItem>
                {!q.approved && (
                  <DropdownMenuItem onClick={onApprove}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                    승인
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tags */}
        {Array.isArray(tags) && tags.length > 0 && viewSize !== "sm" && (
          <div className="flex gap-1 overflow-hidden shrink-0 h-5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap shrink-0"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Passage reference with independent toggle */}
        {q.passage && viewSize !== "sm" && (
          <div className="shrink-0 bg-slate-50 rounded-lg border border-slate-100">
            <button
              onClick={(e) => { e.stopPropagation(); setPassageOpen(!passageOpen); }}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] text-slate-600 truncate flex-1 text-left font-medium">{q.passage.title}</span>
              {passageOpen ? (
                <ChevronUp className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              )}
            </button>
            {passageOpen && q.passage.content && (
              <div className="px-2.5 pb-2 border-t border-slate-100">
                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 font-mono whitespace-pre-line max-h-[250px] overflow-y-auto">
                  {q.passage.content}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Question content: collapsed vs expanded ── */}
        {expanded ? (
          <>
            {/* Expanded: full structured rendering */}
            <RenderedSections sections={sections} expanded />

            {/* Options (MC) */}
            {options.length > 0 && (
              <div className="space-y-1 pl-1">
                {options.map((opt) => {
                  const isCorrect = opt.label === q.correctAnswer;
                  return (
                    <div
                      key={opt.label}
                      className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                        isCorrect
                          ? "bg-emerald-50 text-emerald-800 font-medium"
                          : "text-slate-600"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          isCorrect
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="pt-0.5">{renderFormatted(opt.text)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Non-MC correct answer */}
            {options.length === 0 && q.correctAnswer && (
              <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded">
                <span className="font-medium">정답:</span> {renderFormatted(q.correctAnswer)}
              </div>
            )}
          </>
        ) : (
          /* Collapsed: smart preview */
          <CollapsedPreview
            sections={sections}
            options={options}
            correctAnswer={q.correctAnswer}
            questionClamp={questionClamp}
          />
        )}

        {/* Explanation toggle */}
        {q.explanation?.content && (
          <div>
            <button
              onClick={(e) => { e.stopPropagation(); setExplanationOpen(!explanationOpen); }}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {explanationOpen ? "해설 접기" : "해설 보기"}
              {explanationOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {explanationOpen && (
              <div className="bg-blue-50/50 rounded-lg p-2.5 mt-1.5 border border-blue-100">
                <p className="text-[10px] font-semibold text-blue-600 mb-1">해설</p>
                <p className="text-[12px] text-slate-700 leading-relaxed">{q.explanation.content}</p>
                {q.explanation.keyPoints && (() => {
                  const kps = parseJSON<string[]>(q.explanation.keyPoints, []);
                  return kps.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">핵심 포인트</p>
                      <ul className="space-y-0.5">
                        {kps.map((kp, i) => (
                          <li key={i} className="text-[11px] text-slate-600 flex gap-1.5">
                            <span className="text-blue-400 shrink-0">•</span>
                            {kp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}
                {q.explanation.wrongOptionExplanations && (() => {
                  const woe = parseJSON<Record<string, string>>(q.explanation.wrongOptionExplanations, {});
                  const entries = Object.entries(woe);
                  return entries.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">오답 해설</p>
                      <div className="space-y-0.5">
                        {entries.map(([label, text]) => (
                          <p key={label} className="text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-500">{label}.</span> {text}
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
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 mt-auto shrink-0">
          <span>{formatDate(q.createdAt)}</span>
          {q._count.examLinks > 0 && (
            <span>시험 {q._count.examLinks}회 사용</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
