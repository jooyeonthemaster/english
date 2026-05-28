"use client";

import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "./constants";
import type { QuestionBankItem } from "./types";

// ---------------------------------------------------------------------------
// 문제 은행 선택 다이얼로그 (Step 2 에서 호출)
// ---------------------------------------------------------------------------

interface QuestionBankDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bankSearch: string;
  setBankSearch: (v: string) => void;
  bankType: string;
  setBankType: (v: string) => void;
  bankLoading: boolean;
  bankQuestions: QuestionBankItem[];
  selectedIds: Set<string>;
  onSearch: () => void;
  onToggle: (q: QuestionBankItem) => void;
  onAddSelected: () => void;
}

export function QuestionBankDialog({
  open,
  onOpenChange,
  bankSearch,
  setBankSearch,
  bankType,
  setBankType,
  bankLoading,
  bankQuestions,
  selectedIds,
  onSearch,
  onToggle,
  onAddSelected,
}: QuestionBankDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>문제 은행에서 선택</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8B95A1]" />
            <Input
              placeholder="문제 검색..."
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              className="pl-9 border-[#E5E8EB]"
            />
          </div>
          <Select value={bankType} onValueChange={setBankType}>
            <SelectTrigger className="w-[120px] border-[#E5E8EB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              <SelectItem value="MULTIPLE_CHOICE">객관식</SelectItem>
              <SelectItem value="SHORT_ANSWER">단답형</SelectItem>
              <SelectItem value="ESSAY">서술형</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={onSearch} className="border-[#E5E8EB]">
            검색
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {bankLoading ? (
            <div className="flex items-center justify-center py-12 text-[#8B95A1]">
              불러오는 중...
            </div>
          ) : bankQuestions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-[#8B95A1]">
              문제가 없습니다.
            </div>
          ) : (
            bankQuestions.map((q) => (
              <label
                key={q.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  selectedIds.has(q.id)
                    ? "border-[#3182F6] bg-blue-50/50"
                    : "border-[#E5E8EB] hover:bg-[#F7F8FA]",
                )}
              >
                <Checkbox
                  checked={selectedIds.has(q.id)}
                  onCheckedChange={() => onToggle(q)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#191F28] line-clamp-2">{q.questionText}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[#8B95A1]">{TYPE_LABELS[q.type] || q.type}</span>
                    <span className="text-xs text-[#8B95A1]">
                      {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                    </span>
                    <span className="text-xs text-[#8B95A1]">{q.points}점</span>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#E5E8EB]">
          <span className="text-sm text-[#8B95A1]">{selectedIds.size}문항 선택됨</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#E5E8EB]">
              취소
            </Button>
            <Button
              onClick={onAddSelected}
              disabled={selectedIds.size === 0}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
            >
              <Plus className="size-4 mr-1.5" />
              추가하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
