"use client";

import { useState } from "react";
import Link from "next/link";
import { BookText, FileText, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GradeSemesterFilter } from "@/components/student/grade-semester-filter";

interface PassageData {
  id: string;
  title: string;
  source: string | null;
  grade: number;
  semester: string;
  unit: string | null;
}

interface PassageListClientProps {
  passages: PassageData[];
  grades: number[];
  schoolSlug: string;
}

function getSemesterLabel(semester: string) {
  return semester === "FIRST" ? "1학기" : "2학기";
}

const CATEGORY_COLORS: Record<number, string> = {
  1: "#7CB342",
  2: "#AED581",
  3: "#4CAF50",
  4: "#F59E0B",
  5: "#8B5CF6",
  6: "#EF4444",
};

function getGradeColor(grade: number): string {
  return CATEGORY_COLORS[grade] ?? "#7CB342";
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0,
    },
  },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" as const },
  },
};

const emptyVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
};

export function PassageListClient({
  passages,
  grades,
  schoolSlug,
}: PassageListClientProps) {
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);

  const filtered = passages.filter((p) => {
    if (selectedGrade !== null && p.grade !== selectedGrade) return false;
    if (selectedSemester !== null && p.semester !== selectedSemester)
      return false;
    return true;
  });

  return (
    <div>
      <GradeSemesterFilter
        grades={grades}
        selectedGrade={selectedGrade}
        onGradeChange={setSelectedGrade}
        selectedSemester={selectedSemester}
        onSemesterChange={setSelectedSemester}
      />

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            variants={emptyVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex flex-col items-center justify-center gap-5 px-5 py-24"
          >
            <div className="relative">
              <div className="flex size-18 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F3F4F0] to-[#E5E7E0]">
                <Search className="size-8 text-[#9CA396]" />
              </div>
              <div className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-white shadow-card">
                <FileText className="size-3.5 text-[#C8CCC2]" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[15px] font-semibold tracking-[-0.025em] text-[#343B2E]">
                등록된 지문이 없습니다
              </p>
              <p className="text-[13px] text-[#9CA396]">
                선생님이 지문을 등록하면 여기에 표시됩니다
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-2.5 px-5 pb-8"
          >
            {/* Total count */}
            <div className="flex items-center gap-2 pt-3 pb-1">
              <span className="text-[13px] font-medium tracking-[-0.025em] text-[#9CA396]">
                총{" "}
                <span className="font-semibold text-[#7CB342]">
                  {filtered.length}
                </span>
                개 지문
              </span>
            </div>

            {filtered.map((passage) => {
              const gradeColor = getGradeColor(passage.grade);
              return (
                <motion.div key={passage.id} variants={cardVariants}>
                  <Link
                    href={`/${schoolSlug}/passages/${passage.id}`}
                    className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-white p-5 shadow-card transition-all duration-200 hover:shadow-card-hover active:scale-[0.98]"
                    style={{
                      transition:
                        "box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  >
                    {/* Left gradient tint */}
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl"
                      style={{ backgroundColor: gradeColor }}
                    />

                    <div className="flex items-center justify-between">
                      <div
                        className="flex size-[42px] items-center justify-center rounded-[13px]"
                        style={{
                          backgroundColor: `${gradeColor}12`,
                        }}
                      >
                        <BookText
                          className="size-5"
                          style={{ color: gradeColor }}
                        />
                      </div>
                      <span className="rounded-full bg-[#F3F4F0] px-2.5 py-[3px] text-[11px] font-semibold tracking-[-0.025em] text-[#6B7265]">
                        {passage.grade}학년 {getSemesterLabel(passage.semester)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 pl-0.5">
                      <span className="text-[15px] font-bold tracking-[-0.025em] text-[#1A1F16] leading-snug line-clamp-2">
                        {passage.title}
                      </span>
                      <div className="flex items-center gap-2 text-[12px] font-medium text-[#9CA396]">
                        {passage.source && <span>{passage.source}</span>}
                        {passage.source && passage.unit && (
                          <span className="text-[#E5E7E0] text-[8px]">
                            |
                          </span>
                        )}
                        {passage.unit && <span>{passage.unit}</span>}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
