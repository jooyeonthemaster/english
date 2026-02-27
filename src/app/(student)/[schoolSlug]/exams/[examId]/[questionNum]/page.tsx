import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { CheckCircle2 } from "lucide-react";
import { AIChatTrigger } from "@/components/ai/ai-chat-trigger";

interface QuestionExplanationProps {
  params: Promise<{ schoolSlug: string; examId: string; questionNum: string }>;
}

function getDifficultyDisplay(difficulty: string) {
  const map: Record<string, { dots: number; color: string; label: string }> = {
    "상": { dots: 3, color: "#EF4444", label: "상" },
    "중": { dots: 2, color: "#F59E0B", label: "중" },
    "하": { dots: 1, color: "#4CAF50", label: "하" },
    HIGH: { dots: 3, color: "#EF4444", label: "상" },
    MEDIUM: { dots: 2, color: "#F59E0B", label: "중" },
    LOW: { dots: 1, color: "#4CAF50", label: "하" },
  };
  return map[difficulty] ?? { dots: 2, color: "#9CA396", label: difficulty };
}

export default async function QuestionExplanationPage({
  params,
}: QuestionExplanationProps) {
  const { schoolSlug, examId, questionNum } = await params;
  const questionNumber = parseInt(questionNum, 10);

  if (isNaN(questionNumber)) {
    notFound();
  }

  // Fetch all question numbers for the horizontal pill nav
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      title: true,
      questions: {
        orderBy: { questionNumber: "asc" },
        select: { questionNumber: true },
      },
    },
  });

  if (!exam) {
    notFound();
  }

  // Fetch the specific question with explanation
  const question = await prisma.examQuestion.findUnique({
    where: {
      examId_questionNumber: {
        examId,
        questionNumber,
      },
    },
    include: {
      explanation: true,
    },
  });

  if (!question) {
    notFound();
  }

  // Parse key points JSON string
  let keyPoints: string[] = [];
  if (question.explanation?.keyPoints) {
    try {
      keyPoints = JSON.parse(question.explanation.keyPoints);
    } catch {
      keyPoints = [];
    }
  }

  const allNumbers = exam.questions.map((q) => q.questionNumber);
  const difficultyInfo = question.explanation?.difficulty
    ? getDifficultyDisplay(question.explanation.difficulty)
    : null;

  return (
    <>
      <TopBarBack title="문항 해설" />

      <div className="flex flex-col gap-0">
        {/* Sticky glass question pill nav */}
        <div className="sticky top-[56px] z-30 overflow-x-auto scrollbar-hide glass-strong border-b border-[#E5E7E0]/60">
          <div className="flex gap-1.5 px-5 py-3">
            {allNumbers.map((num) => {
              const isActive = num === questionNumber;
              return (
                <Link
                  key={num}
                  href={`/${schoolSlug}/exams/${examId}/${num}`}
                  className={cn(
                    "relative flex shrink-0 items-center justify-center rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all duration-200",
                    isActive
                      ? "gradient-primary text-white shadow-glow-green"
                      : "bg-[#F3F4F0] text-[#6B7265] hover:bg-[#E5E7E0] active:scale-95"
                  )}
                >
                  {num}번
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5">
          {/* Question section */}
          <div className="animate-float-up flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#1A1F16]">
                문제 {questionNumber}
              </h2>
              {/* Difficulty display */}
              {difficultyInfo && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-[#9CA396]">난이도</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((dot) => (
                      <div
                        key={dot}
                        className="size-[6px] rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            dot <= difficultyInfo.dots
                              ? difficultyInfo.color
                              : "#E5E7E0",
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: difficultyInfo.color }}
                  >
                    {difficultyInfo.label}
                  </span>
                </div>
              )}
            </div>

            {/* Question card with gradient border effect */}
            <div className="relative rounded-2xl bg-white p-[1px] shadow-float">
              <div
                className="absolute inset-0 rounded-2xl opacity-40"
                style={{
                  background:
                    "linear-gradient(135deg, #7CB342 0%, #AED581 50%, #7CB342 100%)",
                  mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  maskComposite: "exclude",
                  WebkitMaskComposite: "xor",
                  padding: "1px",
                  borderRadius: "1rem",
                }}
              />
              <div className="relative rounded-2xl bg-white p-4">
                <p className="whitespace-pre-wrap text-[14px] leading-7 text-[#343B2E]">
                  {question.questionText}
                </p>
              </div>
            </div>

            {/* Correct answer */}
            <div className="animate-float-up stagger-2 flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-full bg-[#D1FAE5]">
                <CheckCircle2 className="size-4 text-[#4CAF50]" />
              </div>
              <span className="text-[14px] font-medium text-[#4A5043]">
                정답
              </span>
              <span className="rounded-lg bg-gradient-to-r from-[#D1FAE5] to-[#A7F3D0] px-4 py-1.5 text-[15px] font-bold text-[#065F46]">
                {question.correctAnswer}
              </span>
            </div>
          </div>

          {/* Explanation section */}
          {question.explanation && (
            <>
              <div className="animate-float-up stagger-3 h-px bg-gradient-to-r from-transparent via-[#E5E7E0] to-transparent" />

              <div className="animate-float-up stagger-4 flex flex-col gap-4">
                <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#1A1F16]">
                  해설
                </h2>

                {/* HTML explanation content with refined prose */}
                <div
                  className="prose-sm max-w-none text-[14px] leading-[1.85] text-[#4A5043] [&_strong]:font-bold [&_strong]:text-[#1A1F16] [&_em]:font-medium [&_em]:text-[#7CB342] [&_em]:not-italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5 [&_p]:mb-3"
                  dangerouslySetInnerHTML={{
                    __html: question.explanation.content,
                  }}
                />

                {/* Key points */}
                {keyPoints.length > 0 && (
                  <div className="animate-float-up stagger-5 rounded-2xl border border-[#E5E7E0] bg-gradient-to-br from-[#FAFBF8] to-[#F3F4F0] p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[#1A1F16]">
                      <span className="flex size-5 items-center justify-center rounded-md gradient-accent text-[10px] text-white font-bold">
                        !
                      </span>
                      핵심 포인트
                    </h3>
                    <ul className="flex flex-col gap-2.5">
                      {keyPoints.map((point, idx) => {
                        const staggerClass = `stagger-${Math.min(idx + 5, 8)}`;
                        return (
                          <li
                            key={idx}
                            className={cn(
                              "animate-float-up flex gap-2.5 text-[13px]",
                              staggerClass
                            )}
                          >
                            <span className="mt-[2px] flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[#7CB342]/10 text-[10px] font-bold text-[#7CB342]">
                              {idx + 1}
                            </span>
                            <span className="text-[#4A5043] leading-relaxed">
                              {point}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* AI question button */}
          <div className="animate-float-up stagger-7 pb-4">
            <AIChatTrigger
              questionId={question.id}
              examId={examId}
              schoolSlug={schoolSlug}
            />
          </div>
        </div>
      </div>
    </>
  );
}
