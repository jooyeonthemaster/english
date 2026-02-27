"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FileQuestion, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradeSemesterFilter } from "@/components/student/grade-semester-filter";

interface ExamData {
  id: string;
  title: string;
  grade: number;
  semester: string;
  examType: string;
  year: number;
  questionCount: number;
}

interface ExamListClientProps {
  exams: ExamData[];
  grades: number[];
  schoolSlug: string;
}

function getSemesterLabel(semester: string) {
  return semester === "FIRST" ? "1학기" : "2학기";
}

function getExamTypeLabel(type: string) {
  switch (type) {
    case "MIDTERM":
      return "중간";
    case "FINAL":
      return "기말";
    case "MOCK":
      return "모의";
    default:
      return type;
  }
}

function getExamTypeBadgeStyle(type: string) {
  switch (type) {
    case "MIDTERM":
      return "from-[#7CB342] to-[#689F38] text-white";
    case "FINAL":
      return "from-[#4CAF50] to-[#388E3C] text-white";
    case "MOCK":
      return "from-[#FFA726] to-[#F57C00] text-white";
    default:
      return "from-[#9CA396] to-[#6B7265] text-white";
  }
}

function getExamIconBg(type: string) {
  switch (type) {
    case "MIDTERM":
      return "bg-gradient-to-br from-[#7CB342]/10 to-[#689F38]/10";
    case "FINAL":
      return "bg-gradient-to-br from-[#4CAF50]/10 to-[#388E3C]/10";
    case "MOCK":
      return "bg-gradient-to-br from-[#FFA726]/10 to-[#F57C00]/10";
    default:
      return "bg-[#F3F4F0]";
  }
}

function getExamIconColor(type: string) {
  switch (type) {
    case "MIDTERM":
      return "text-[#7CB342]";
    case "FINAL":
      return "text-[#4CAF50]";
    case "MOCK":
      return "text-[#FFA726]";
    default:
      return "text-[#6B7265]";
  }
}

const EXAM_TYPES = [
  { value: null, label: "전체" },
  { value: "MIDTERM", label: "중간" },
  { value: "FINAL", label: "기말" },
  { value: "MOCK", label: "모의" },
] as const;

export function ExamListClient({
  exams,
  grades,
  schoolSlug,
}: ExamListClientProps) {
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [selectedExamType, setSelectedExamType] = useState<string | null>(null);
  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const pillContainerRef = useRef<HTMLDivElement>(null);

  const filtered = exams.filter((e) => {
    if (selectedGrade !== null && e.grade !== selectedGrade) return false;
    if (selectedSemester !== null && e.semester !== selectedSemester)
      return false;
    if (selectedExamType !== null && e.examType !== selectedExamType)
      return false;
    return true;
  });

  // Measure the active pill for the sliding indicator
  useEffect(() => {
    const activeKey = selectedExamType ?? "__all__";
    const el = pillRefs.current.get(activeKey);
    const container = pillContainerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicatorStyle({
        left: elRect.left - containerRect.left,
        width: elRect.width,
      });
    }
  }, [selectedExamType]);

  return (
    <div>
      <GradeSemesterFilter
        grades={grades}
        selectedGrade={selectedGrade}
        onGradeChange={setSelectedGrade}
        selectedSemester={selectedSemester}
        onSemesterChange={setSelectedSemester}
      />

      {/* Exam type pills with sliding indicator */}
      <div ref={pillContainerRef} className="relative flex gap-1.5 px-5 pb-4 pt-1">
        {/* Animated sliding background indicator */}
        <motion.div
          className="absolute top-1 h-[32px] rounded-full gradient-primary"
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 35,
          }}
          style={{ zIndex: 0 }}
        />

        {EXAM_TYPES.map((type) => {
          const key = type.value ?? "__all__";
          const isActive = selectedExamType === type.value;
          return (
            <button
              key={type.label}
              ref={(el) => {
                if (el) pillRefs.current.set(key, el);
              }}
              onClick={() =>
                setSelectedExamType(
                  type.value === selectedExamType ? null : type.value
                )
              }
              className={cn(
                "relative z-10 rounded-full px-4 py-1.5 text-[12px] font-semibold tracking-[-0.01em] transition-colors duration-200",
                isActive
                  ? "text-white"
                  : "text-[#9CA396] hover:text-[#6B7265]"
              )}
            >
              {type.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center justify-center gap-4 px-5 py-20"
          >
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#F3F4F0]">
              <ClipboardList className="size-7 text-[#9CA396]" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-[15px] font-medium text-[#6B7265]">
                아직 등록된 시험이 없습니다
              </p>
              <p className="text-[13px] text-[#9CA396]">
                다른 필터를 선택해 보세요
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-2.5 px-5 pb-5"
          >
            {filtered.map((exam, idx) => (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: idx * 0.02,
                  duration: 0.15,
                  ease: "easeOut" as const,
                }}
              >
                <Link
                  href={`/${schoolSlug}/exams/${exam.id}`}
                  className="group flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card transition-all duration-200 hover:shadow-card-hover active:scale-[0.98] press-scale"
                >
                  {/* Icon with type-colored gradient background */}
                  <div
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
                      getExamIconBg(exam.examType)
                    )}
                  >
                    <FileQuestion
                      className={cn("size-5", getExamIconColor(exam.examType))}
                    />
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5">
                    <span className="text-[14px] font-semibold text-[#1A1F16] leading-tight line-clamp-1">
                      {exam.title}
                    </span>
                    <div className="flex items-center gap-1.5 text-[12px] text-[#9CA396]">
                      <span className="font-medium">{exam.questionCount}문항</span>
                      <span className="text-[#C8CCC2]">·</span>
                      <span>{exam.grade}학년 {getSemesterLabel(exam.semester)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {/* Gradient exam type badge */}
                    <span
                      className={cn(
                        "rounded-md bg-gradient-to-r px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
                        getExamTypeBadgeStyle(exam.examType)
                      )}
                    >
                      {getExamTypeLabel(exam.examType)}
                    </span>
                    {/* Prominent year badge */}
                    <span className="rounded-md border border-[#E5E7E0] bg-[#FAFBF8] px-2 py-0.5 text-[11px] font-semibold text-[#4A5043] tabular-nums">
                      {exam.year}
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
