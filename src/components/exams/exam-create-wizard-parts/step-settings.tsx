"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// STEP 3: 시험 설정 (온라인 시험 전용)
// ---------------------------------------------------------------------------

interface StepSettingsProps {
  examType: string;
  shuffleQuestions: boolean;
  setShuffleQuestions: (v: boolean) => void;
  shuffleOptions: boolean;
  setShuffleOptions: (v: boolean) => void;
  showResults: boolean;
  setShowResults: (v: boolean) => void;
}

export function StepSettings({
  examType,
  shuffleQuestions,
  setShuffleQuestions,
  shuffleOptions,
  setShuffleOptions,
  showResults,
  setShowResults,
}: StepSettingsProps) {
  const showResultSettings = FEATURE_FLAGS.SHOW_USER_RESULTS;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-[#191F28]">시험 설정</h2>

      {examType !== "ONLINE" ? (
        <div className="rounded-lg bg-[#F7F8FA] p-6 text-center text-[#8B95A1]">
          <p>온라인 시험 설정은 온라인 유형에서만 사용 가능합니다.</p>
          <p className="text-xs mt-1">다음 단계로 진행하세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
            <Checkbox
              checked={shuffleQuestions}
              onCheckedChange={(v) => setShuffleQuestions(v as boolean)}
            />
            <div>
              <p className="text-sm font-medium text-[#191F28]">문제 순서 섞기</p>
              <p className="text-xs text-[#8B95A1]">
                학생마다 문제 순서가 랜덤으로 출제됩니다.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
            <Checkbox
              checked={shuffleOptions}
              onCheckedChange={(v) => setShuffleOptions(v as boolean)}
            />
            <div>
              <p className="text-sm font-medium text-[#191F28]">선택지 순서 섞기</p>
              <p className="text-xs text-[#8B95A1]">
                객관식 선택지 순서가 랜덤으로 표시됩니다.
              </p>
            </div>
          </label>

          {showResultSettings && (
            <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
              <Checkbox
                checked={showResults}
                onCheckedChange={(v) => setShowResults(v as boolean)}
              />
              <div>
                <p className="text-sm font-medium text-[#191F28]">결과 즉시 공개</p>
                <p className="text-xs text-[#8B95A1]">
                  제출 후 바로 점수와 정답을 확인할 수 있습니다.
                </p>
              </div>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
