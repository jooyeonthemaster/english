"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { GrammarPoint } from "@/types/passage-analysis";

interface EditableGrammarProps {
  grammarPoints: GrammarPoint[];
  onUpdate: (grammarPoints: GrammarPoint[]) => void;
  passageId: string;
}

export function EditableGrammar({
  grammarPoints,
  onUpdate,
  passageId,
}: EditableGrammarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newGrammar, setNewGrammar] = useState({
    pattern: "",
    explanation: "",
    textFragment: "",
    examples: [""],
    level: "",
  });
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId, editingField]);

  function startEdit(id: string, field: string, value: string) {
    setEditingId(id);
    setEditingField(field);
    setEditValue(value);
  }

  function confirmEdit() {
    if (!editingId || !editingField || !editValue.trim()) {
      setEditingId(null);
      setEditingField(null);
      return;
    }

    const updated = grammarPoints.map((g) => {
      if (g.id === editingId) {
        return { ...g, [editingField]: editValue.trim() };
      }
      return g;
    });
    onUpdate(updated);
    setEditingId(null);
    setEditingField(null);
  }

  function updateExample(grammarId: string, exIndex: number, value: string) {
    const updated = grammarPoints.map((g) => {
      if (g.id === grammarId) {
        const newExamples = [...g.examples];
        newExamples[exIndex] = value;
        return { ...g, examples: newExamples };
      }
      return g;
    });
    onUpdate(updated);
  }

  function addExample(grammarId: string) {
    const updated = grammarPoints.map((g) => {
      if (g.id === grammarId && g.examples.length < 3) {
        return { ...g, examples: [...g.examples, ""] };
      }
      return g;
    });
    onUpdate(updated);
  }

  function removeExample(grammarId: string, exIndex: number) {
    const updated = grammarPoints.map((g) => {
      if (g.id === grammarId && g.examples.length > 1) {
        return {
          ...g,
          examples: g.examples.filter((_, i) => i !== exIndex),
        };
      }
      return g;
    });
    onUpdate(updated);
  }

  function deleteGrammar(id: string) {
    const updated = grammarPoints.filter((g) => g.id !== id);
    onUpdate(updated);
    toast.success("문법 포인트가 삭제되었습니다.");
  }

  function addNewGrammar() {
    if (!newGrammar.pattern || !newGrammar.explanation) {
      toast.error("패턴과 설명을 입력해주세요.");
      return;
    }

    const maxId = grammarPoints.reduce((max, g) => {
      const num = parseInt(g.id.replace("gp-", "")) || 0;
      return Math.max(max, num);
    }, 0);

    const item: GrammarPoint = {
      id: `gp-${maxId + 1}`,
      pattern: newGrammar.pattern,
      explanation: newGrammar.explanation,
      textFragment: newGrammar.textFragment || "",
      sentenceIndex: 0,
      examples: newGrammar.examples.filter((e) => e.trim()),
      level: newGrammar.level || "중1",
    };

    if (item.examples.length === 0) {
      item.examples = [""];
    }

    onUpdate([...grammarPoints, item]);
    setNewGrammar({
      pattern: "",
      explanation: "",
      textFragment: "",
      examples: [""],
      level: "",
    });
    setShowAdd(false);
    toast.success("문법 포인트가 추가되었습니다.");
  }

  async function enhanceGrammar(grammarId: string) {
    const grammar = grammarPoints.find((g) => g.id === grammarId);
    if (!grammar) return;

    setEnhancingId(grammarId);
    try {
      const res = await fetch(`/api/ai/passage-analysis/${passageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enhanceGrammar",
          grammarPoint: grammar,
        }),
      });
      const json = await res.json();
      if (json.grammarPoint) {
        const updated = grammarPoints.map((g) =>
          g.id === grammarId ? { ...json.grammarPoint, id: g.id } : g
        );
        onUpdate(updated);
        toast.success("AI가 문법 포인트를 보완했습니다.");
      }
    } catch {
      toast.error("보완 중 오류가 발생했습니다.");
    } finally {
      setEnhancingId(null);
    }
  }

  function renderEditableText(
    id: string,
    field: string,
    value: string,
    className: string,
    multiline = false
  ) {
    const isEditing = editingId === id && editingField === field;

    if (isEditing) {
      if (multiline) {
        return (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                confirmEdit();
              }
              if (e.key === "Escape") {
                setEditingId(null);
                setEditingField(null);
              }
            }}
            onBlur={confirmEdit}
            className="text-sm border-blue-300 min-h-[60px] resize-none"
          />
        );
      }
      return (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmEdit();
            if (e.key === "Escape") {
              setEditingId(null);
              setEditingField(null);
            }
          }}
          onBlur={confirmEdit}
          className="h-7 text-sm border-blue-300"
        />
      );
    }

    return (
      <span
        className={`cursor-pointer hover:bg-blue-50/80 rounded px-1 py-0.5 -mx-1 transition-colors group/edit inline-flex items-center gap-1 ${className}`}
        onClick={() => startEdit(id, field, value)}
      >
        {value}
        <Pencil className="w-2.5 h-2.5 text-blue-300 opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[520px] overflow-y-auto space-y-3 pr-1">
        {grammarPoints.map((g) => (
          <div
            key={g.id}
            className="p-3 rounded-lg border border-blue-100 bg-blue-50/50 group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge className="text-[10px] bg-blue-100 text-blue-700">
                  {renderEditableText(
                    g.id,
                    "pattern",
                    g.pattern,
                    "text-blue-700"
                  )}
                </Badge>
                <span className="text-[10px] text-slate-400">
                  {renderEditableText(
                    g.id,
                    "level",
                    g.level,
                    "text-slate-400"
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  disabled={enhancingId === g.id}
                  onClick={() => enhanceGrammar(g.id)}
                >
                  {enhancingId === g.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-0.5" />
                      AI로 보완
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-slate-300 hover:text-red-500"
                  onClick={() => deleteGrammar(g.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-1">
              {renderEditableText(
                g.id,
                "explanation",
                g.explanation,
                "text-sm text-slate-700",
                true
              )}
            </div>

            <p className="text-xs text-blue-600 font-mono mt-1.5 bg-white/60 rounded px-2 py-1">
              &ldquo;
              {renderEditableText(
                g.id,
                "textFragment",
                g.textFragment,
                "text-blue-600 font-mono"
              )}
              &rdquo;
            </p>

            {g.examples.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-slate-400 font-medium">예문:</p>
                {g.examples.map((ex, i) => (
                  <div key={i} className="flex items-center gap-1 pl-2">
                    <span className="text-xs text-slate-400">-</span>
                    <Input
                      value={ex}
                      onChange={(e) =>
                        updateExample(g.id, i, e.target.value)
                      }
                      className="h-6 text-xs border-transparent hover:border-slate-200 focus:border-blue-300 bg-transparent px-1"
                    />
                    {g.examples.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-slate-300 hover:text-red-400 shrink-0"
                        onClick={() => removeExample(g.id, i)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {g.examples.length < 3 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 text-[10px] text-slate-400 ml-2"
                    onClick={() => addExample(g.id)}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    예문 추가
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new grammar */}
      {showAdd ? (
        <div className="p-3 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="문법 패턴 (예: 현재완료 have+p.p.)"
              value={newGrammar.pattern}
              onChange={(e) =>
                setNewGrammar({ ...newGrammar, pattern: e.target.value })
              }
              className="h-8 text-sm"
            />
            <Input
              placeholder="수준 (예: 중2, 고1)"
              value={newGrammar.level}
              onChange={(e) =>
                setNewGrammar({ ...newGrammar, level: e.target.value })
              }
              className="h-8 text-sm"
            />
          </div>
          <Textarea
            placeholder="설명"
            value={newGrammar.explanation}
            onChange={(e) =>
              setNewGrammar({ ...newGrammar, explanation: e.target.value })
            }
            className="text-sm min-h-[60px] resize-none"
          />
          <Input
            placeholder="지문 내 해당 부분 (textFragment)"
            value={newGrammar.textFragment}
            onChange={(e) =>
              setNewGrammar({ ...newGrammar, textFragment: e.target.value })
            }
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={addNewGrammar}
            >
              <Check className="w-3 h-3 mr-1" />
              추가
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowAdd(false)}
            >
              <X className="w-3 h-3 mr-1" />
              취소
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-dashed"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          문법 포인트 추가
        </Button>
      )}
    </div>
  );
}
