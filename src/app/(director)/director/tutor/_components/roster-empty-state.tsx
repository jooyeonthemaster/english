"use client";

import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when filters/search match no students (vs. no students at all). */
export function RosterEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-[#F2F4F6] text-[#AEB5BC]">
        <SearchX className="size-6" />
      </div>
      <p className="mt-4 text-sm font-bold text-[#4E5968]">조건에 맞는 학생이 없어요</p>
      <p className="mt-1 text-xs font-medium text-[#8B95A1]">
        검색어나 필터를 바꾸거나 초기화해 보세요.
      </p>
      <Button
        onClick={onReset}
        variant="outline"
        className="mt-4 h-9 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#4E5968] hover:bg-[#F7F8FA]"
      >
        필터 초기화
      </Button>
    </div>
  );
}
