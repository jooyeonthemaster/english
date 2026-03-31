"use client";

import { MessageCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Q&A Tab — DB 모델(StudentQuestion, QuestionAnswer) 추가 후 구현
// ---------------------------------------------------------------------------
export function QnaTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <MessageCircle size={28} className="text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-500 mb-1">
        준비 중입니다
      </p>
      <p className="text-xs text-gray-500 text-center max-w-[240px]">
        수업별 질문을 등록하고 강사의 답변을 받을 수 있습니다
      </p>
    </div>
  );
}
