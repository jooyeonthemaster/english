"use client";

import { useState } from "react";
import Link from "next/link";
import { Languages, BookOpen, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GradeSemesterFilter } from "@/components/student/grade-semester-filter";

interface VocabListData {
  id: string;
  title: string;
  grade: number;
  semester: string;
  unit: string | null;
  itemCount: number;
}

interface VocabListClientProps {
  lists: VocabListData[];
  grades: number[];
  schoolSlug: string;
}

function getSemesterLabel(semester: string) {
  return semester === "FIRST" ? "1학기" : "2학기";
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

export function VocabListClient({
  lists,
  grades,
  schoolSlug,
}: VocabListClientProps) {
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);

  const filtered = lists.filter((v) => {
    if (selectedGrade !== null && v.grade !== selectedGrade) return false;
    if (selectedSemester !== null && v.semester !== selectedSemester)
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
                <BookOpen className="size-3.5 text-[#C8CCC2]" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[15px] font-semibold tracking-[-0.025em] text-[#343B2E]">
                등록된 단어장이 없습니다
              </p>
              <p className="text-[13px] text-[#9CA396]">
                선생님이 단어장을 등록하면 여기에 표시됩니다
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
                개 단어장
              </span>
            </div>

            {filtered.map((list) => (
              <motion.div key={list.id} variants={cardVariants}>
                <Link
                  href={`/${schoolSlug}/vocab/${list.id}`}
                  className="group flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card transition-all duration-200 hover:shadow-card-hover active:scale-[0.98]"
                  style={{
                    transition:
                      "box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#F1F8E9] to-[#E8F5E9]">
                    <Languages className="size-5 text-[#7CB342]" />
                  </div>

                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <span className="text-[14px] font-bold tracking-[-0.025em] text-[#1A1F16] line-clamp-1">
                      {list.title}
                    </span>
                    <div className="flex items-center gap-1.5 text-[12px] text-[#9CA396]">
                      <span className="font-medium">
                        {list.grade}학년 {getSemesterLabel(list.semester)}
                      </span>
                      {list.unit && (
                        <>
                          <span className="text-[#E5E7E0] text-[8px]">|</span>
                          <span>{list.unit}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className="inline-flex items-center rounded-full gradient-primary px-2.5 py-[3px] text-[11px] font-bold text-white shadow-glow-green/30">
                      {list.itemCount}단어
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
