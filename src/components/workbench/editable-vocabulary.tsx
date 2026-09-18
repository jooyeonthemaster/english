"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { VocabItem } from "@/types/passage-analysis";

const VOCAB_DIFFICULTY: Record<string, { label: string; color: string }> = {
  basic: { label: "기본", color: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", color: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", color: "bg-red-100 text-red-700" },
};

const POS_OPTIONS = [
  "명사",
  "동사",
  "형용사",
  "부사",
  "전치사",
  "접속사",
  "대명사",
];

interface EditableVocabularyProps {
  vocabulary: VocabItem[];
  onUpdate: (vocabulary: VocabItem[]) => void;
}

interface EditingCell {
  rowIndex: number;
  field: keyof VocabItem;
}

export function EditableVocabulary({
  vocabulary,
  onUpdate,
}: EditableVocabularyProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [newItem, setNewItem] = useState<Partial<VocabItem>>({
    word: "",
    meaning: "",
    partOfSpeech: "명사",
    pronunciation: "",
    sentenceIndex: 0,
    difficulty: "basic",
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(rowIndex: number, field: keyof VocabItem, value: string) {
    setEditingCell({ rowIndex, field });
    setEditValue(value);
  }

  function confirmEdit() {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;

    if (editValue.trim()) {
      const updated = vocabulary.map((v, idx) => {
        if (idx === rowIndex) {
          if (field === "sentenceIndex") {
            return { ...v, [field]: parseInt(editValue) || 0 };
          }
          return { ...v, [field]: editValue.trim() };
        }
        return v;
      });
      onUpdate(updated);
    }
    setEditingCell(null);
  }

  function deleteRow(rowIndex: number) {
    const updated = vocabulary.filter((_, idx) => idx !== rowIndex);
    onUpdate(updated);
    toast.success("단어가 삭제되었습니다.");
  }

  function addNewItem() {
    if (!newItem.word || !newItem.meaning) {
      toast.error("단어와 뜻을 입력해주세요.");
      return;
    }
    const item: VocabItem = {
      word: newItem.word || "",
      meaning: newItem.meaning || "",
      partOfSpeech: newItem.partOfSpeech || "명사",
      pronunciation: newItem.pronunciation || "",
      sentenceIndex: newItem.sentenceIndex || 0,
      difficulty: (newItem.difficulty as VocabItem["difficulty"]) || "basic",
    };
    onUpdate([...vocabulary, item]);
    setNewItem({
      word: "",
      meaning: "",
      partOfSpeech: "명사",
      pronunciation: "",
      sentenceIndex: 0,
      difficulty: "basic",
    });
    setShowAddRow(false);
    toast.success("단어가 추가되었습니다.");
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...vocabulary];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    onUpdate(updated);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function renderEditableCell(
    rowIndex: number,
    field: keyof VocabItem,
    value: string,
    className?: string
  ) {
    const isEditing =
      editingCell?.rowIndex === rowIndex && editingCell?.field === field;

    if (isEditing) {
      if (field === "difficulty") {
        return (
          <Select
            value={editValue}
            onValueChange={(val) => {
              setEditValue(val);
              const updated = vocabulary.map((v, idx) =>
                idx === rowIndex
                  ? { ...v, difficulty: val as VocabItem["difficulty"] }
                  : v
              );
              onUpdate(updated);
              setEditingCell(null);
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">기본</SelectItem>
              <SelectItem value="intermediate">심화</SelectItem>
              <SelectItem value="advanced">고난도</SelectItem>
            </SelectContent>
          </Select>
        );
      }

      if (field === "partOfSpeech") {
        return (
          <Select
            value={editValue}
            onValueChange={(val) => {
              setEditValue(val);
              const updated = vocabulary.map((v, idx) =>
                idx === rowIndex ? { ...v, partOfSpeech: val } : v
              );
              onUpdate(updated);
              setEditingCell(null);
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POS_OPTIONS.map((pos) => (
                <SelectItem key={pos} value={pos}>
                  {pos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      return (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmEdit();
              if (e.key === "Escape") setEditingCell(null);
            }}
            onBlur={confirmEdit}
            className="h-7 text-xs border-blue-300"
          />
        </div>
      );
    }

    return (
      <span
        className={`cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 -mx-1 transition-colors group/cell inline-flex items-center gap-1 ${className || ""}`}
        onClick={() => startEdit(rowIndex, field, value)}
      >
        {field === "difficulty" ? (
          <Badge
            variant="outline"
            className={`text-[10px] ${VOCAB_DIFFICULTY[value]?.color || ""}`}
          >
            {VOCAB_DIFFICULTY[value]?.label || value}
          </Badge>
        ) : (
          value
        )}
        <Pencil className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0" />
      </span>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-[540px] overflow-y-auto space-y-2 pr-1">
        {vocabulary.map((v, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 p-3 rounded-lg bg-slate-50 group transition-colors ${
              dragIndex === idx ? "opacity-50" : ""
            }`}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
          >
            <div className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity mt-1">
              <GripVertical className="w-3.5 h-3.5 text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {renderEditableCell(idx, "word", v.word, "font-semibold text-sm text-slate-800")}
                {renderEditableCell(idx, "difficulty", v.difficulty)}
                {renderEditableCell(
                  idx,
                  "partOfSpeech",
                  v.partOfSpeech,
                  "text-[10px] text-slate-400"
                )}
              </div>
              <div className="mt-0.5">
                {renderEditableCell(idx, "meaning", v.meaning, "text-sm text-slate-600")}
              </div>
              <div className="mt-0.5">
                {renderEditableCell(
                  idx,
                  "pronunciation",
                  v.pronunciation,
                  "text-xs text-slate-400"
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => deleteRow(idx)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add new row */}
      {showAddRow ? (
        <div className="p-3 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="단어"
              value={newItem.word}
              onChange={(e) => setNewItem({ ...newItem, word: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="뜻"
              value={newItem.meaning}
              onChange={(e) =>
                setNewItem({ ...newItem, meaning: e.target.value })
              }
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select
              value={newItem.partOfSpeech}
              onValueChange={(val) =>
                setNewItem({ ...newItem, partOfSpeech: val })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="품사" />
              </SelectTrigger>
              <SelectContent>
                {POS_OPTIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="발음"
              value={newItem.pronunciation}
              onChange={(e) =>
                setNewItem({ ...newItem, pronunciation: e.target.value })
              }
              className="h-8 text-xs"
            />
            <Select
              value={newItem.difficulty}
              onValueChange={(val: "basic" | "intermediate" | "advanced") =>
                setNewItem({ ...newItem, difficulty: val })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">기본</SelectItem>
                <SelectItem value="intermediate">심화</SelectItem>
                <SelectItem value="advanced">고난도</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={addNewItem}
            >
              <Check className="w-3 h-3 mr-1" />
              추가
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowAddRow(false)}
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
          onClick={() => setShowAddRow(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          단어 추가
        </Button>
      )}
    </div>
  );
}
