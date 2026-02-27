"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GradeSemesterFilterProps {
  grades: number[];
  selectedGrade: number | null;
  onGradeChange: (grade: number | null) => void;
  selectedSemester: string | null;
  onSemesterChange: (semester: string | null) => void;
}

const SEMESTER_OPTIONS = [
  { value: null, label: "전체" },
  { value: "FIRST", label: "1학기" },
  { value: "SECOND", label: "2학기" },
] as const;

export function GradeSemesterFilter({
  grades,
  selectedGrade,
  onGradeChange,
  selectedSemester,
  onSemesterChange,
}: GradeSemesterFilterProps) {
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 4);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const gradeOptions: { value: number | null; label: string }[] = [
    { value: null, label: "전체" },
    ...grades.map((g) => ({ value: g, label: `${g}학년` })),
  ];

  return (
    <div
      className={cn(
        "sticky top-[56px] z-30 transition-all duration-300",
        isScrolled
          ? "glass-strong border-b border-[#E5E7E0]/60 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
          : "bg-white"
      )}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Grade tabs with sliding indicator */}
        <div
          ref={gradeScrollRef}
          className="flex items-center gap-1 overflow-x-auto hide-scrollbar"
        >
          {gradeOptions.map((option) => {
            const isActive = selectedGrade === option.value;
            return (
              <button
                key={option.value ?? "all"}
                onClick={() => onGradeChange(option.value)}
                className={cn(
                  "relative shrink-0 rounded-[10px] px-3.5 py-[7px] text-[13px] font-semibold tracking-[-0.025em] transition-colors duration-200",
                  isActive
                    ? "text-white"
                    : "text-[#6B7265] hover:text-[#343B2E]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="gradeIndicator"
                    className="absolute inset-0 rounded-[10px] gradient-primary"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="h-4 w-px shrink-0 bg-[#E5E7E0]" />

        {/* Semester pills */}
        <div className="flex items-center gap-1 shrink-0">
          {SEMESTER_OPTIONS.map((option) => {
            const isActive = selectedSemester === option.value;
            return (
              <button
                key={option.value ?? "all"}
                onClick={() =>
                  onSemesterChange(
                    option.value === selectedSemester ? null : option.value
                  )
                }
                className={cn(
                  "relative shrink-0 rounded-full px-3 py-[5px] text-[12px] font-medium tracking-[-0.025em] transition-all duration-200",
                  isActive
                    ? "text-[#7CB342]"
                    : "text-[#9CA396] hover:text-[#6B7265]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="semesterIndicator"
                    className="absolute inset-0 rounded-full bg-[#F1F8E9] border border-[#7CB342]/10"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
