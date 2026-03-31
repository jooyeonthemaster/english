"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PassageCardProps {
  content: string;
  open: boolean;
  onToggle: () => void;
  highlighted: boolean;
}

export default function PassageCard({ content, open, onToggle, highlighted }: PassageCardProps) {
  return (
    <div
      className={cn(
        "mb-4 rounded-xl border transition-colors",
        highlighted
          ? "border-blue-200 bg-blue-50/50"
          : "border-gray-200 bg-gray-50/50"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <BookOpen
          className={cn(
            "size-4 flex-shrink-0",
            highlighted ? "text-blue-500" : "text-gray-400"
          )}
        />
        <span
          className={cn(
            "text-xs font-semibold flex-1",
            highlighted ? "text-blue-600" : "text-gray-500"
          )}
        >
          {highlighted ? "지문 (이 문제에 필요)" : "지문 보기"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            highlighted ? "text-blue-400" : "text-gray-400",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="max-h-48 overflow-y-auto rounded-lg bg-white p-3 border border-gray-100">
            <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-line">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
