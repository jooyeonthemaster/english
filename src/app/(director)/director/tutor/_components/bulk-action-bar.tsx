"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BulkActionBar({
  count,
  onClear,
  onBulkStatus,
}: {
  count: number;
  onClear: () => void;
  onBulkStatus: (status: string) => void;
}) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-lg bg-blue-50 px-3">
      <span className="text-xs font-black text-blue-700">{count}명 선택됨</span>
      <div className="mx-1 h-5 w-px bg-blue-200" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-8 rounded-lg bg-white text-xs font-bold text-blue-700 shadow-none hover:bg-blue-100"
          >
            상태 변경
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onBulkStatus("ACTIVE")}>재원으로 변경</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkStatus("PAUSED")}>휴원으로 변경</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkStatus("WAITING")}>대기로 변경</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onBulkStatus("WITHDRAWN")}>
            퇴원으로 변경
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={onClear}
        variant="ghost"
        size="sm"
        className="ml-auto h-8 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100"
      >
        <X className="size-3.5" />
        선택 해제
      </Button>
    </div>
  );
}
