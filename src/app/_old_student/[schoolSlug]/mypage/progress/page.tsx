import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { TopBarBack } from "@/components/layout/top-bar-back";
import {
  BarChart3,
  BookCheck,
  Brain,
  Calendar,
  Clock,
  TrendingUp,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface ProgressPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function ProgressPage({ params }: ProgressPageProps) {
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

  // Fetch recent test results
  const testResults = await prisma.vocabTestResult.findMany({
    where: { studentId: session.studentId },
    orderBy: { takenAt: "desc" },
    take: 20,
    include: {
      list: {
        select: { title: true },
      },
    },
  });

  // Fetch study progress (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const studyProgress = await prisma.studyProgress.findMany({
    where: {
      studentId: session.studentId,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { date: "desc" },
  });

  // Compute summary stats
  const totalTests = testResults.length;
  const avgScore =
    totalTests > 0
      ? Math.round(
          testResults.reduce((sum, r) => sum + r.percent, 0) / totalTests
        )
      : 0;
  const totalQuestionsViewed = studyProgress.reduce(
    (sum, p) => sum + p.questionsViewed,
    0
  );

  const testTypeLabel: Record<string, string> = {
    EN_TO_KR: "영 -> 한",
    KR_TO_EN: "한 -> 영",
    SPELLING: "스펠링",
  };

  // Score bar color helper
  function getScoreBarStyle(percent: number) {
    if (percent >= 80)
      return {
        bg: "bg-gradient-to-r from-[#4CAF50] to-[#388E3C]",
        text: "text-[#4CAF50]",
        pill: "bg-[#D1FAE5] text-[#065F46]",
      };
    if (percent >= 60)
      return {
        bg: "bg-gradient-to-r from-[#F59E0B] to-[#D97706]",
        text: "text-[#F59E0B]",
        pill: "bg-[#FEF3C7] text-[#92400E]",
      };
    return {
      bg: "bg-gradient-to-r from-[#EF4444] to-[#DC2626]",
      text: "text-[#EF4444]",
      pill: "bg-[#FEE2E2] text-[#991B1B]",
    };
  }

  // Test type badge style
  function getTestTypeBadge(type: string) {
    switch (type) {
      case "EN_TO_KR":
        return "bg-[#F1F8E9] text-[#689F38]";
      case "KR_TO_EN":
        return "bg-[#F0FDF4] text-[#166534]";
      case "SPELLING":
        return "bg-[#FFF7ED] text-[#9A3412]";
      default:
        return "bg-[#F3F4F0] text-[#4A5043]";
    }
  }

  return (
    <>
      <TopBarBack title="학습 현황" />

      <div className="flex flex-col gap-5 px-5 py-5">
        {/* ── Hero Summary Stats ── */}
        <div className="grid grid-cols-3 gap-3 animate-float-up">
          {/* Tests */}
          <div className="flex flex-col items-center gap-2.5 rounded-2xl gradient-primary p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-white/20">
              <BookCheck className="size-4.5 text-white" />
            </div>
            <span className="text-[22px] font-extrabold tracking-tight text-white animate-count-up">
              {totalTests}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
              테스트 횟수
            </span>
          </div>

          {/* Score */}
          <div
            className="flex flex-col items-center gap-2.5 rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)",
            }}
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-white/20">
              <BarChart3 className="size-4.5 text-white" />
            </div>
            <span className="text-[22px] font-extrabold tracking-tight text-white animate-count-up stagger-1">
              {avgScore}
              <span className="text-[14px] font-semibold opacity-70">%</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
              평균 점수
            </span>
          </div>

          {/* Questions */}
          <div
            className="flex flex-col items-center gap-2.5 rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
            }}
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-white/20">
              <Brain className="size-4.5 text-white" />
            </div>
            <span className="text-[22px] font-extrabold tracking-tight text-white animate-count-up stagger-2">
              {totalQuestionsViewed}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
              문제 풀이
            </span>
          </div>
        </div>

        {/* ── Test History ── */}
        <div className="flex flex-col gap-4 animate-float-up stagger-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#7CB342] to-[#689F38]">
                <Clock className="size-3.5 text-white" />
              </div>
              <h2 className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
                최근 테스트 기록
              </h2>
            </div>
            {testResults.length > 0 && (
              <span className="rounded-md bg-[#F3F4F0] px-2 py-0.5 text-[11px] font-semibold text-[#6B7265]">
                최근 {testResults.length}건
              </span>
            )}
          </div>

          {testResults.length === 0 ? (
            /* ── Empty State ── */
            <div className="animate-float-up stagger-3 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#FAFBF8] py-16">
              <div className="relative">
                <div className="flex size-18 items-center justify-center rounded-full bg-white shadow-card">
                  <Calendar className="size-8 text-[#C8CCC2]" />
                </div>
                <div className="absolute -bottom-1 -right-1 animate-bounce-subtle">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7CB342] to-[#689F38] shadow-glow-green">
                    <TrendingUp className="size-4 text-white" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-[15px] font-bold text-[#1A1F16]">
                  아직 테스트 기록이 없습니다
                </p>
                <p className="text-[12px] text-[#9CA396]">
                  단어 테스트를 시작해보세요
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {testResults.map((result, idx) => {
                const scorePercent = result.percent;
                const scoreStyle = getScoreBarStyle(scorePercent);
                const staggerClass =
                  idx < 8 ? `stagger-${idx + 1}` : "stagger-8";

                return (
                  <div
                    key={result.id}
                    className={cn(
                      "animate-float-up flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card",
                      staggerClass
                    )}
                  >
                    {/* Top row: title + score */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <span className="text-[14px] font-bold tracking-tight text-[#1A1F16] line-clamp-1">
                          {result.list.title}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                              getTestTypeBadge(result.testType)
                            )}
                          >
                            {testTypeLabel[result.testType] ?? result.testType}
                          </span>
                          <span className="text-[11px] text-[#9CA396]">
                            {formatDate(result.takenAt)}
                          </span>
                        </div>
                      </div>

                      {/* Score display */}
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "text-[20px] font-extrabold leading-none tracking-tight",
                            scoreStyle.text
                          )}
                        >
                          {Math.round(scorePercent)}
                          <span className="text-[13px] font-bold">%</span>
                        </span>
                        <span className="text-[11px] font-medium text-[#9CA396]">
                          {result.score}/{result.total}
                        </span>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F3F4F0]">
                      <div
                        className={cn("h-full rounded-full", scoreStyle.bg)}
                        style={{ width: `${Math.min(scorePercent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
