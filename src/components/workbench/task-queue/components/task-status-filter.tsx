"use client";

import { FilterChip } from "./filter-chip";

export type StatusFilterValue = "all" | "running" | "done" | "waiting";

export function TaskStatusFilter({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <FilterChip active={value === "all"} onClick={() => onChange("all")}>
        전체
      </FilterChip>
      <FilterChip
        active={value === "running"}
        onClick={() => onChange("running")}
      >
        진행중
      </FilterChip>
      <FilterChip active={value === "done"} onClick={() => onChange("done")}>
        완료
      </FilterChip>
      <FilterChip
        active={value === "waiting"}
        onClick={() => onChange("waiting")}
      >
        대기중
      </FilterChip>
    </div>
  );
}
