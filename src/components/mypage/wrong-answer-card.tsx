import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WrongAnswerCardProps {
  english: string;
  korean: string;
  partOfSpeech?: string;
  listTitle: string;
  count: number;
  givenAnswer: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getMissCountStyle(count: number) {
  if (count >= 5) {
    return { bg: "bg-[#FFF0F0]", text: "text-[#E54545]" };
  }
  if (count >= 3) {
    return { bg: "bg-[#FFF8E6]", text: "text-[#F59F00]" };
  }
  return { bg: "bg-[#F2F3F6]", text: "text-[#6B7684]" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function WrongAnswerCard({
  english,
  korean,
  partOfSpeech,
  listTitle,
  count,
  givenAnswer,
}: WrongAnswerCardProps) {
  const countStyle = getMissCountStyle(count);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#E5E8EB] p-4">
      {/* Miss count badge */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg px-2 py-1",
          countStyle.bg
        )}
      >
        <span className={cn("text-[12px] font-bold tabular-nums", countStyle.text)}>
          {count}회
        </span>
      </div>

      {/* Word info */}
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-[#191F28]">
            {english}
          </span>
          {partOfSpeech && (
            <span className="text-[11px] text-[#8B95A1]">
              {partOfSpeech}
            </span>
          )}
        </div>
        <span className="text-[13px] text-[#4E5968]">{korean}</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-[#8B95A1]">{listTitle}</span>
          <span className="text-[11px] text-[#D1D6DB]">|</span>
          <span className="text-[11px] text-[#E54545] line-through">
            {givenAnswer}
          </span>
        </div>
      </div>
    </div>
  );
}
