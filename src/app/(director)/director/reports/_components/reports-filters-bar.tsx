"use client";

import { Loader2, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportsFiltersBarProps {
  search: string;
  typeFilter: string;
  statusFilter: string;
  selectedCount: number;
  isPending: boolean;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onBulkSend: () => void;
}

export function ReportsFiltersBar({
  search,
  typeFilter,
  statusFilter,
  selectedCount,
  isPending,
  onSearchChange,
  onTypeChange,
  onStatusChange,
  onBulkSend,
}: ReportsFiltersBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="pl-9"
        />
      </div>
      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="유형" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 유형</SelectItem>
          <SelectItem value="WEEKLY">주간</SelectItem>
          <SelectItem value="MONTHLY">월간</SelectItem>
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 상태</SelectItem>
          <SelectItem value="DRAFT">초안</SelectItem>
          <SelectItem value="SENT">발송됨</SelectItem>
          <SelectItem value="VIEWED">열람</SelectItem>
        </SelectContent>
      </Select>
      {selectedCount > 0 && (
        <Button
          onClick={onBulkSend}
          disabled={isPending}
          size="sm"
          className="bg-blue-500 text-white hover:bg-blue-600"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin mr-1.5" />
          ) : (
            <Send className="size-4 mr-1.5" />
          )}
          선택 발송 ({selectedCount}건)
        </Button>
      )}
    </div>
  );
}
