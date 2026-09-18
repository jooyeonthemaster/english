"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Plus, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type {
  StructureAnalysis,
  ParagraphSummary,
} from "@/types/passage-analysis";

const TEXT_TYPES = [
  "설명문",
  "논설문",
  "서사문",
  "수필",
  "대화문",
  "편지",
  "기사",
  "광고",
  "안내문",
];

const PARAGRAPH_ROLES = ["서론", "본론", "결론", "전환", "예시", "요약"];

interface EditableStructureProps {
  structure: StructureAnalysis;
  onUpdate: (structure: StructureAnalysis) => void;
}

interface EditingState {
  field: string;
  value: string;
}

export function EditableStructure({
  structure,
  onUpdate,
}: EditableStructureProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [newKeyPoint, setNewKeyPoint] = useState("");
  const [showAddKeyPoint, setShowAddKeyPoint] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  function startEdit(field: string, value: string) {
    setEditing({ field, value });
  }

  function confirmEdit() {
    if (!editing) return;
    const { field, value } = editing;

    if (value.trim()) {
      onUpdate({ ...structure, [field]: value.trim() });
    }
    setEditing(null);
  }

  function updateParagraphSummary(
    index: number,
    updates: Partial<ParagraphSummary>
  ) {
    const newSummaries = structure.paragraphSummaries.map((p, i) =>
      i === index ? { ...p, ...updates } : p
    );
    onUpdate({ ...structure, paragraphSummaries: newSummaries });
  }

  function removeKeyPoint(index: number) {
    const newPoints = structure.keyPoints.filter((_, i) => i !== index);
    onUpdate({ ...structure, keyPoints: newPoints });
    toast.success("핵심 포인트가 삭제되었습니다.");
  }

  function addKeyPoint() {
    if (!newKeyPoint.trim()) return;
    onUpdate({
      ...structure,
      keyPoints: [...structure.keyPoints, newKeyPoint.trim()],
    });
    setNewKeyPoint("");
    setShowAddKeyPoint(false);
    toast.success("핵심 포인트가 추가되었습니다.");
  }

  function renderEditableField(
    field: string,
    value: string,
    label: string,
    multiline = false
  ) {
    const isEditing = editing?.field === field;

    return (
      <div>
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {isEditing ? (
          <div className="mt-1">
            {field === "textType" ? (
              <Select
                value={editing.value}
                onValueChange={(val) => {
                  onUpdate({ ...structure, textType: val });
                  setEditing(null);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : multiline ? (
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={editing.value}
                onChange={(e) =>
                  setEditing({ ...editing, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    confirmEdit();
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
                onBlur={confirmEdit}
                className="text-sm border-blue-300 min-h-[60px] resize-none"
              />
            ) : (
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={editing.value}
                onChange={(e) =>
                  setEditing({ ...editing, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") setEditing(null);
                }}
                onBlur={confirmEdit}
                className="h-8 text-sm border-blue-300"
              />
            )}
          </div>
        ) : (
          <p
            className="text-sm text-slate-700 mt-0.5 cursor-pointer hover:bg-blue-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors group/edit"
            onClick={() => startEdit(field, value)}
          >
            {value}
            <Pencil className="w-3 h-3 text-slate-300 inline ml-1.5 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main fields */}
      <div className="space-y-3">
        {renderEditableField("mainIdea", structure.mainIdea, "주제", true)}
        {renderEditableField("purpose", structure.purpose, "목적")}
        {renderEditableField("textType", structure.textType, "글 유형")}
      </div>

      <Separator />

      {/* Paragraph summaries */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">
          단락 구조
        </h4>
        <div className="space-y-2">
          {structure.paragraphSummaries.map((p, idx) => (
            <div
              key={p.paragraphIndex}
              className="flex items-start gap-2 p-2 rounded bg-slate-50 group"
            >
              <Select
                value={p.role}
                onValueChange={(val) =>
                  updateParagraphSummary(idx, { role: val })
                }
              >
                <SelectTrigger className="h-6 w-16 text-[10px] border-transparent hover:border-slate-200 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARAGRAPH_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={p.summary}
                onChange={(e) =>
                  updateParagraphSummary(idx, { summary: e.target.value })
                }
                className="text-sm border-transparent hover:border-slate-200 focus:border-blue-300 bg-transparent min-h-[32px] resize-none p-1"
                rows={1}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Key points */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">
          핵심 포인트
        </h4>
        <div className="space-y-2">
          {structure.keyPoints.map((point, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2 rounded bg-amber-50/80 group"
            >
              <Textarea
                value={point}
                onChange={(e) => {
                  const newPoints = [...structure.keyPoints];
                  newPoints[idx] = e.target.value;
                  onUpdate({ ...structure, keyPoints: newPoints });
                }}
                className="text-sm border-transparent hover:border-amber-200 focus:border-amber-300 bg-transparent min-h-[32px] resize-none p-1 flex-1"
                rows={1}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => removeKeyPoint(idx)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}

          {showAddKeyPoint ? (
            <div className="flex items-center gap-2 p-2 rounded border-2 border-dashed border-amber-200">
              <Input
                value={newKeyPoint}
                onChange={(e) => setNewKeyPoint(e.target.value)}
                placeholder="새 핵심 포인트 입력..."
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addKeyPoint();
                  if (e.key === "Escape") {
                    setShowAddKeyPoint(false);
                    setNewKeyPoint("");
                  }
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                onClick={addKeyPoint}
              >
                <Check className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setShowAddKeyPoint(false);
                  setNewKeyPoint("");
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            structure.keyPoints.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-dashed"
                onClick={() => setShowAddKeyPoint(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                핵심 포인트 추가
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
