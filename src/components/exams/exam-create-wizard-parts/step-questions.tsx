"use client";

import { Database, FileEdit, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TYPE_LABELS } from "./constants";
import type { SelectedQuestion } from "./types";

// ---------------------------------------------------------------------------
// STEP 2: 문제 추가/정렬
// ---------------------------------------------------------------------------

interface StepQuestionsProps {
  questions: SelectedQuestion[];
  runningTotal: number;
  onOpenPicker: () => void;
  onMove: (idx: number, direction: "up" | "down") => void;
  onUpdatePoints: (idx: number, pts: number) => void;
  onRemove: (idx: number) => void;
}

export function StepQuestions({
  questions,
  runningTotal,
  onOpenPicker,
  onMove,
  onUpdatePoints,
  onRemove,
}: StepQuestionsProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#191F28]">문제 추가</h2>
          <p className="text-sm text-[#8B95A1] mt-1">
            {questions.length}문제 / 배점 합계: {runningTotal}점
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onOpenPicker} className="border-[#E5E8EB]">
            <Database className="size-4 mr-1.5" />
            문제 은행에서 선택
          </Button>
        </div>
      </div>

      {/* Question list */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#8B95A1]">
          <FileEdit className="size-12 mb-3 opacity-40" />
          <p className="text-sm">아직 추가된 문제가 없습니다.</p>
          <p className="text-xs mt-1">문제 은행에서 문제를 선택해 추가하세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div
              key={q.questionId}
              className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-3 bg-white hover:border-[#3182F6]/30 transition-colors"
            >
              <button
                className="cursor-grab text-[#8B95A1] hover:text-[#4E5968]"
                aria-label="순서 변경"
                onClick={() => onMove(idx, "up")}
              >
                <GripVertical className="size-4" />
              </button>
              <span className="flex size-7 items-center justify-center rounded-full bg-[#F7F8FA] text-xs font-bold text-[#4E5968]">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#191F28] truncate">{q.questionText}</p>
                <p className="text-xs text-[#8B95A1]">{TYPE_LABELS[q.type] || q.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={q.points}
                  onChange={(e) => onUpdatePoints(idx, parseInt(e.target.value) || 1)}
                  className="w-16 h-8 text-center text-sm border-[#E5E8EB]"
                  aria-label={`${idx + 1}번 문제 배점`}
                />
                <span className="text-xs text-[#8B95A1]">점</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onRemove(idx)}
                  aria-label={`${idx + 1}번 문제 삭제`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
