"use client";

import { DOMAIN_LABELS, DOMAIN_ORDER } from "../constants";
import type { TaskScope } from "../types";
import { FilterChip } from "./filter-chip";

export function TaskDomainTabs({
  scope,
  onChange,
}: {
  scope: TaskScope;
  onChange: (next: TaskScope) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterChip active={scope === "all"} onClick={() => onChange("all")}>
        전체
      </FilterChip>
      {DOMAIN_ORDER.map((domain) => (
        <FilterChip
          key={domain}
          active={scope === domain}
          onClick={() => onChange(domain)}
        >
          {DOMAIN_LABELS[domain]}
        </FilterChip>
      ))}
    </div>
  );
}
