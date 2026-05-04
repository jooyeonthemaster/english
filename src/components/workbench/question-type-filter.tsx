// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";
import { Filter, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
  ESSAY: "서술형",
};

export const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_INSERT: "문장 삽입",
  SENTENCE_ORDER: "글의 순서",
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

// Hierarchical type → subtype grouping for filter UI
export const TYPE_SUBTYPE_MAP: { type: string; label: string; subtypes: { value: string; label: string }[] }[] = [
  {
    type: "MULTIPLE_CHOICE", label: "객관식",
    subtypes: [
      { value: "BLANK_INFERENCE", label: "빈칸 추론" },
      { value: "GRAMMAR_ERROR", label: "어법 판단" },
      { value: "VOCAB_CHOICE", label: "어휘 적절성" },
      { value: "SENTENCE_INSERT", label: "문장 삽입" },
      { value: "SENTENCE_ORDER", label: "글의 순서" },
      { value: "TOPIC_MAIN_IDEA", label: "주제/요지" },
      { value: "TITLE", label: "제목 추론" },
      { value: "REFERENCE", label: "지칭 추론" },
      { value: "CONTENT_MATCH", label: "내용 일치" },
      { value: "IRRELEVANT", label: "무관한 문장" },
    ],
  },
  {
    type: "SHORT_ANSWER", label: "주관식/서술형",
    subtypes: [
      { value: "CONDITIONAL_WRITING", label: "조건부 영작" },
      { value: "SENTENCE_TRANSFORM", label: "문장 전환" },
      { value: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
      { value: "SUMMARY_COMPLETE", label: "요약문 완성" },
      { value: "WORD_ORDER", label: "배열 영작" },
      { value: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
    ],
  },
  {
    type: "VOCAB", label: "어휘",
    subtypes: [
      { value: "CONTEXT_MEANING", label: "문맥 속 의미" },
      { value: "SYNONYM", label: "동의어" },
      { value: "ANTONYM", label: "반의어" },
    ],
  },
];

export const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

// ---------------------------------------------------------------------------
// TypeFilterPopover
// ---------------------------------------------------------------------------

export function TypeFilterPopover({
  currentSubTypes,
  onApply,
}: {
  currentSubTypes: string[];
  onApply: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSubTypes));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(TYPE_SUBTYPE_MAP.map((g) => g.type)));

  // Sync with external filter changes
  useEffect(() => {
    setSelected(new Set(currentSubTypes));
  }, [currentSubTypes.join(",")]);

  const allSubTypes = TYPE_SUBTYPE_MAP.flatMap((g) => g.subtypes.map((s) => s.value));
  const totalCount = allSubTypes.length;
  const selectedCount = selected.size;
  const isAll = selectedCount === 0;

  function toggleSub(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleGroup(group: typeof TYPE_SUBTYPE_MAP[number]) {
    const groupSubs = group.subtypes.map((s) => s.value);
    const allSelected = groupSubs.every((s) => selected.has(s));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupSubs.forEach((s) => next.delete(s));
      } else {
        groupSubs.forEach((s) => next.add(s));
      }
      return next;
    });
  }

  function toggleCollapse(type: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleApply() {
    onApply([...selected]);
    setOpen(false);
  }

  function handleReset() {
    setSelected(new Set());
  }

  // Label for the trigger button
  const triggerLabel = isAll
    ? "전체 유형"
    : selectedCount <= 2
    ? [...selected].map((s) => SUBTYPE_LABELS[s] || s).join(", ")
    : `${selectedCount}개 유형`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1.5 h-8 px-3 text-[12px] rounded-md border transition-colors ${
          !isAll ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
        }`}>
          <Filter className="w-3 h-3" />
          <span className="font-medium max-w-[140px] truncate">{triggerLabel}</span>
          {!isAll && (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
              {selectedCount}
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <span className="text-[12px] font-semibold text-slate-700">문제 유형 필터</span>
          {!isAll && (
            <button
              onClick={handleReset}
              className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
            >
              전체 해제
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {TYPE_SUBTYPE_MAP.map((group) => {
            const groupSubs = group.subtypes.map((s) => s.value);
            const groupSelectedCount = groupSubs.filter((s) => selected.has(s)).length;
            const allGroupSelected = groupSelectedCount === groupSubs.length;
            const someGroupSelected = groupSelectedCount > 0;
            const isCollapsed = collapsed.has(group.type);

            return (
              <div key={group.type}>
                {/* Category header */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <button
                    onClick={() => toggleCollapse(group.type)}
                    className="w-4 h-4 flex items-center justify-center shrink-0"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                  <Checkbox
                    checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleGroup(group)}
                    className="shrink-0"
                  />
                  <span
                    onClick={() => toggleGroup(group)}
                    className="text-[12px] font-semibold text-slate-800 flex-1 cursor-pointer select-none"
                  >
                    {group.label}
                  </span>
                  {someGroupSelected && (
                    <span className="text-[10px] text-blue-500 font-medium">
                      {groupSelectedCount}/{groupSubs.length}
                    </span>
                  )}
                </div>

                {/* Subtypes (collapsible) */}
                {!isCollapsed && (
                  <div className="ml-5">
                    {group.subtypes.map((sub) => (
                      <label
                        key={sub.value}
                        className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50 cursor-pointer rounded"
                      >
                        <Checkbox
                          checked={selected.has(sub.value)}
                          onCheckedChange={() => toggleSub(sub.value)}
                          className="shrink-0"
                        />
                        <span className={`text-[12px] select-none ${
                          selected.has(sub.value) ? "text-blue-700 font-medium" : "text-slate-600"
                        }`}>
                          {sub.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[11px] text-slate-400">
            {isAll ? "전체 표시 중" : `${selectedCount}개 선택`}
          </span>
          <Button size="sm" className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700" onClick={handleApply}>
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
