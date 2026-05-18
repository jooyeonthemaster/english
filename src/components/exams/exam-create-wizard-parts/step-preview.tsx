"use client";

import type { SelectedQuestion } from "./types";

// ---------------------------------------------------------------------------
// STEP 4: 미리보기 및 배포
// ---------------------------------------------------------------------------

interface StepPreviewProps {
  title: string;
  examType: string;
  examDate: string;
  duration: string;
  totalPoints: string;
  questions: SelectedQuestion[];
  runningTotal: number;
}

function examTypeLabel(examType: string) {
  if (examType === "OFFLINE") return "오프라인";
  if (examType === "ONLINE") return "온라인";
  if (examType === "VOCAB") return "단어";
  return "모의";
}

export function StepPreview({
  title,
  examType,
  examDate,
  duration,
  totalPoints,
  questions,
  runningTotal,
}: StepPreviewProps) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-[#191F28]">미리보기 및 배포</h2>

      <div className="rounded-lg bg-[#F7F8FA] p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[#8B95A1]">시험명:</span>{" "}
            <span className="font-medium text-[#191F28]">{title}</span>
          </div>
          <div>
            <span className="text-[#8B95A1]">유형:</span>{" "}
            <span className="font-medium text-[#191F28]">{examTypeLabel(examType)}</span>
          </div>
          <div>
            <span className="text-[#8B95A1]">문제 수:</span>{" "}
            <span className="font-medium text-[#191F28]">{questions.length}문제</span>
          </div>
          <div>
            <span className="text-[#8B95A1]">총점:</span>{" "}
            <span className="font-medium text-[#191F28]">
              {runningTotal}점 / {totalPoints}점
            </span>
          </div>
          {examDate && (
            <div>
              <span className="text-[#8B95A1]">시험일:</span>{" "}
              <span className="font-medium text-[#191F28]">{examDate}</span>
            </div>
          )}
          {duration && (
            <div>
              <span className="text-[#8B95A1]">시간 제한:</span>{" "}
              <span className="font-medium text-[#191F28]">{duration}분</span>
            </div>
          )}
        </div>
      </div>

      {/* Question Preview */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[#4E5968]">문제 목록</h3>
        {questions.map((q, idx) => (
          <div
            key={q.questionId}
            className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-3"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#3182F6]">
              {idx + 1}
            </span>
            <p className="flex-1 text-sm text-[#191F28] truncate">{q.questionText}</p>
            <span className="text-xs text-[#8B95A1]">{q.points}점</span>
          </div>
        ))}
      </div>
    </div>
  );
}
