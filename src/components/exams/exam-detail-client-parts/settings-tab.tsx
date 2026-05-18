"use client";

import type { ExamDetail } from "./types";

// ---------------------------------------------------------------------------
// 시험 설정 탭 (읽기 전용)
// ---------------------------------------------------------------------------

export function SettingsTab({ exam }: { exam: ExamDetail }) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-6 space-y-4">
      <h3 className="text-sm font-semibold text-[#191F28]">시험 설정</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <SettingRow label="문제 순서 섞기" value={exam.shuffleQuestions ? "사용" : "미사용"} />
        <SettingRow label="선택지 순서 섞기" value={exam.shuffleOptions ? "사용" : "미사용"} />
        <SettingRow label="결과 즉시 공개" value={exam.showResults ? "사용" : "미사용"} />
        <SettingRow label="시간 제한" value={exam.duration ? `${exam.duration}분` : "없음"} />
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-[#F2F4F6]">
      <span className="text-[#8B95A1]">{label}</span>
      <span className="text-[#191F28]">{value}</span>
    </div>
  );
}
