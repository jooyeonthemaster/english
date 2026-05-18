"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SectionHeader({
  icon: Icon,
  title,
  count,
  defaultOpen = true,
  children,
}: SectionHeaderProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 hover:bg-slate-50/50 transition-colors"
      >
        <Icon className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-[14px] font-semibold text-slate-800 flex-1 text-left">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[12px] text-slate-400">{count}개</span>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}
