"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { SentenceAnalysis } from "@/types/passage-analysis";

interface EditableSentencesProps {
  sentences: SentenceAnalysis[];
  onUpdate: (sentences: SentenceAnalysis[]) => void;
  passageId: string;
}

export function EditableSentences({
  sentences,
  onUpdate,
  passageId,
}: EditableSentencesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [retranslatingIndex, setRetranslatingIndex] = useState<number | null>(
    null
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingIndex !== null && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingIndex]);

  function startEdit(index: number, currentValue: string) {
    setEditingIndex(index);
    setEditValue(currentValue);
  }

  function confirmEdit(index: number) {
    if (editValue.trim() && editValue !== sentences[index].korean) {
      const updated = sentences.map((s) =>
        s.index === index ? { ...s, korean: editValue.trim() } : s
      );
      onUpdate(updated);
      toast.success("번역이 수정되었습니다.");
    }
    setEditingIndex(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValue("");
  }

  async function retranslate(index: number) {
    setRetranslatingIndex(index);
    try {
      const res = await fetch(`/api/ai/passage-analysis/${passageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retranslate",
          sentenceIndex: index,
          english: sentences[index].english,
        }),
      });
      const json = await res.json();
      if (json.korean) {
        const updated = sentences.map((s) =>
          s.index === index ? { ...s, korean: json.korean } : s
        );
        onUpdate(updated);
        toast.success("AI 재번역이 완료되었습니다.");
      }
    } catch {
      toast.error("재번역 중 오류가 발생했습니다.");
    } finally {
      setRetranslatingIndex(null);
    }
  }

  return (
    <div className="max-h-[600px] overflow-y-auto space-y-1 pr-1">
      {sentences.map((s) => (
        <div
          key={s.index}
          className="rounded-lg border border-slate-100 hover:border-slate-200 transition-colors group"
        >
          <button
            className="w-full text-left p-3 flex items-start gap-3"
            onClick={() =>
              setExpandedIndex(expandedIndex === s.index ? null : s.index)
            }
          >
            <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-mono shrink-0 mt-0.5">
              {s.index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 font-mono">{s.english}</p>
              {expandedIndex === s.index && (
                <div className="mt-2">
                  {editingIndex === s.index ? (
                    <div className="space-y-2">
                      <Textarea
                        ref={textareaRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            confirmEdit(s.index);
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="text-sm border-blue-300 focus:border-blue-400 min-h-[60px] resize-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmEdit(s.index);
                          }}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          확인
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p
                        className="text-sm text-blue-600 flex-1 cursor-pointer hover:bg-blue-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors group/edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(s.index, s.korean);
                        }}
                      >
                        {s.korean}
                        <Pencil className="w-3 h-3 text-blue-300 inline ml-1.5 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 shrink-0"
                        disabled={retranslatingIndex === s.index}
                        onClick={(e) => {
                          e.stopPropagation();
                          retranslate(s.index);
                        }}
                      >
                        {retranslatingIndex === s.index ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 mr-0.5" />
                            AI 재번역
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {expandedIndex === s.index ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
