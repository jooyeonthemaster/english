"use client";

import Link from "next/link";
import {
  FileText,
  HelpCircle,
  ClipboardList,
  FolderOpen,
  Folder,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  academyId: string;
  passageCount: number;
  questionCount: number;
  examCount: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AcademyContentBrowser({
  academyId,
  passageCount,
  questionCount,
  examCount,
}: Props) {
  const folders = [
    {
      href: `/admin/academies/${academyId}/passages`,
      icon: FileText,
      label: "지문",
      count: passageCount,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      href: `/admin/academies/${academyId}/questions`,
      icon: HelpCircle,
      label: "문제",
      count: questionCount,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      href: `/admin/academies/${academyId}/exams`,
      icon: ClipboardList,
      label: "시험",
      count: examCount,
      color: "text-indigo-500",
      bg: "bg-indigo-50",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <FolderOpen className="size-4 text-gray-500" strokeWidth={1.8} />
        <span className="text-[13px] font-medium text-gray-800">
          학원 콘텐츠
        </span>
      </div>

      {/* Folder cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5">
        {folders.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all text-left group"
            >
              <div
                className={cn(
                  "flex items-center justify-center w-11 h-11 rounded-xl",
                  f.bg,
                )}
              >
                <Folder className={cn("size-5", f.color)} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-gray-800 group-hover:text-gray-900">
                  {f.label}
                </div>
                <div className="text-[12px] text-gray-400 mt-0.5">
                  {f.count.toLocaleString()}개 항목
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
