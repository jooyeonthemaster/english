"use client";

import { useState } from "react";
import { RotateCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GRADES, STUDENT_STATUSES } from "@/lib/constants";
import type { HubFilters, HubSchool, UpdateParams } from "./types";

const STATUS_TABS = [{ value: "ALL", label: "전체" }, ...STUDENT_STATUSES];

export function StudentToolbar({
  filters,
  schools,
  updateParams,
}: {
  filters: HubFilters;
  schools: HubSchool[];
  updateParams: UpdateParams;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.search ?? "");

  return (
    <div className="flex h-12 items-center gap-2 overflow-x-auto">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B95A1]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ search: search || undefined, page: undefined });
          }}
          placeholder="이름·학생코드 검색"
          className="h-9 w-44 rounded-lg pl-9 text-sm sm:w-56"
        />
      </div>
      <Button
        onClick={() => updateParams({ search: search || undefined, page: undefined })}
        variant="outline"
        className="h-9 shrink-0 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#4E5968] hover:bg-[#F7F8FA]"
      >
        검색
      </Button>

      <div className="mx-1 h-5 w-px shrink-0 bg-[#E5E8EB]" />

      <div className="flex shrink-0 items-center gap-1">
        {STATUS_TABS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() =>
              updateParams({ status: s.value === "ALL" ? undefined : s.value, page: undefined })
            }
            className={cn(
              "h-8 rounded-full px-3 text-xs font-bold transition",
              (filters.status || "ALL") === s.value
                ? "bg-[#191F28] text-white"
                : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-[#E5E8EB]" />

      <Select
        value={filters.schoolId || "ALL"}
        onValueChange={(v) => updateParams({ schoolId: v === "ALL" ? undefined : v, page: undefined })}
      >
        <SelectTrigger className="h-8 w-[132px] shrink-0 rounded-lg text-xs font-bold">
          <SelectValue placeholder="학교 전체" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">학교 전체</SelectItem>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.grade?.toString() || "ALL"}
        onValueChange={(v) => updateParams({ grade: v === "ALL" ? undefined : v, page: undefined })}
      >
        <SelectTrigger className="h-8 w-[104px] shrink-0 rounded-lg text-xs font-bold">
          <SelectValue placeholder="학년 전체" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">학년 전체</SelectItem>
          {GRADES.map((g) => (
            <SelectItem key={g.value} value={g.value.toString()}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        onClick={() => router.refresh()}
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#4E5968]"
        aria-label="새로고침"
      >
        <RotateCw className="size-4" />
      </Button>
    </div>
  );
}
