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
      className="card-3d mb-4 bg-white"
      style={highlighted ? { borderColor: "color-mix(in srgb, var(--key-color) 40%, transparent)", borderBottomColor: "color-mix(in srgb, var(--key-color) 50%, transparent)" } : undefined}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <BookOpen
          className="size-4 flex-shrink-0"
          style={highlighted ? { color: "var(--key-color)" } : { color: "#9CA3AF" }}
        />
        <span
          className="text-xs font-semibold flex-1"
          style={highlighted ? { color: "var(--key-color)" } : { color: "#6B7280" }}
        >
          {highlighted ? "지문 (이 문제에 필요)" : "지문 보기"}
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          style={highlighted ? { color: "var(--key-color)" } : { color: "#9CA3AF" }}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="max-h-48 overflow-y-auto rounded-lg bg-white p-3 border border-gray-100">
            <p className="text-xs leading-relaxed text-black whitespace-pre-line">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
