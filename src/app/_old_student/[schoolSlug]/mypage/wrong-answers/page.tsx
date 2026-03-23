import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { TopBarBack } from "@/components/layout/top-bar-back";
import {
  AlertTriangle,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WrongAnswersProps {
  params: Promise<{ schoolSlug: string }>;
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------
function getSeverityStyle(count: number) {
  if (count >= 5)
    return {
      accent: "border-l-[#EF4444]",
      badgeBg: "bg-gradient-to-br from-[#EF4444] to-[#DC2626]",
      badgeText: "text-white",
    };
  if (count >= 3)
    return {
      accent: "border-l-[#F59E0B]",
      badgeBg: "bg-gradient-to-br from-[#F59E0B] to-[#D97706]",
      badgeText: "text-white",
    };
  return {
    accent: "border-l-[#4CAF50]",
    badgeBg: "bg-gradient-to-br from-[#4CAF50] to-[#388E3C]",
    badgeText: "text-white",
  };
}

// ---------------------------------------------------------------------------
// Motivational message
// ---------------------------------------------------------------------------
function getMotivation(total: number): string {
  if (total <= 3) return "거의 다 외웠어요! 조금만 더 힘내세요!";
  if (total <= 10) return "꾸준히 복습하면 금방 줄일 수 있어요.";
  return "포기하지 마세요! 반복이 최고의 선생님입니다.";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function WrongAnswersPage({ params }: WrongAnswersProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  const session = await getStudentSession();

  if (!session || session.schoolSlug !== schoolSlug) {
    redirect("/login");
  }

  // Fetch wrong vocab answers with item details, sorted by count
  const wrongAnswers = await prisma.wrongVocabAnswer.findMany({
    where: { studentId: session.studentId },
    orderBy: { count: "desc" },
    include: {
      item: {
        select: {
          english: true,
          korean: true,
          partOfSpeech: true,
          list: {
            select: { title: true },
          },
        },
      },
    },
  });

  return (
    <>
      <TopBarBack title="오답 노트" />

      <div className="flex flex-col gap-5 px-5 py-5">
        {wrongAnswers.length === 0 ? (
          /* ── Empty State ── */
          <div className="animate-float-up flex flex-col items-center justify-center gap-4 py-20">
            <div className="relative">
              <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]">
                <Trophy className="size-9 text-[#4CAF50]" />
              </div>
              <div className="absolute -right-1 -top-1 flex size-8 items-center justify-center rounded-full bg-white shadow-card">
                <CheckCircle2 className="size-5 text-[#4CAF50]" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <p className="text-[16px] font-bold text-[#1A1F16]">
                오답 기록이 없습니다
              </p>
              <p className="text-[13px] leading-relaxed text-[#6B7265]">
                단어 테스트를 풀면 틀린 단어가
                <br />
                여기에 기록됩니다
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Summary Bar ── */}
            <div className="animate-float-up flex items-center gap-3 rounded-2xl gradient-dark px-5 py-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                <AlertTriangle className="size-5 text-[#F59E0B]" />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-bold text-white">
                    오답 단어
                  </span>
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-[13px] font-bold text-white">
                    {wrongAnswers.length}
                  </span>
                </div>
                <span className="text-[11px] text-white/60">
                  {getMotivation(wrongAnswers.length)}
                </span>
              </div>
            </div>

            {/* ── Word Cards ── */}
            <div className="flex flex-col gap-3">
              {wrongAnswers.map((wa, idx) => {
                const style = getSeverityStyle(wa.count);
                const staggerClass =
                  idx < 8 ? `stagger-${idx + 1}` : "stagger-8";

                return (
                  <div
                    key={wa.id}
                    className={cn(
                      "animate-float-up flex items-center gap-4 rounded-2xl border-l-[3px] bg-white p-4 shadow-card",
                      style.accent,
                      staggerClass
                    )}
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
                          {wa.item.english}
                        </span>
                        {wa.item.partOfSpeech && (
                          <span className="rounded-md bg-[#F3F4F0] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7265]">
                            {wa.item.partOfSpeech}
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] text-[#6B7265]">
                        {wa.item.korean}
                      </span>
                      <span className="text-[11px] text-[#9CA396]">
                        {wa.item.list.title}
                      </span>
                    </div>

                    {/* Miss count badge */}
                    <div
                      className={cn(
                        "flex shrink-0 flex-col items-center justify-center rounded-xl px-3.5 py-2.5",
                        style.badgeBg
                      )}
                    >
                      <span
                        className={cn(
                          "text-[18px] font-extrabold leading-none",
                          style.badgeText
                        )}
                      >
                        {wa.count}
                      </span>
                      <span className="mt-0.5 text-[9px] font-medium text-white/70">
                        회 오답
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
