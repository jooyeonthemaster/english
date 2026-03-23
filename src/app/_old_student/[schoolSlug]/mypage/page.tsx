import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { StudyStats } from "@/components/mypage/study-stats";
import { CalendarHeatmap } from "@/components/mypage/calendar-heatmap";
import { cn } from "@/lib/utils";
import {
  User,
  LogIn,
  BookX,
  BarChart3,
  ChevronRight,
  GraduationCap,
  School,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface MyPageProps {
  params: Promise<{ schoolSlug: string }>;
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------
async function getStudyData(studentId: string) {
  // Total tests and average score
  const testAgg = await prisma.vocabTestResult.aggregate({
    where: { studentId },
    _count: { id: true },
    _avg: { percent: true },
  });

  const totalTests = testAgg._count.id;
  const avgScore = testAgg._avg.percent ?? 0;

  // Study progress for last 84 days (calendar heatmap)
  const daysAgo84 = new Date();
  daysAgo84.setDate(daysAgo84.getDate() - 84);
  daysAgo84.setHours(0, 0, 0, 0);

  const progressRecords = await prisma.studyProgress.findMany({
    where: {
      studentId,
      date: { gte: daysAgo84 },
    },
    orderBy: { date: "asc" },
    select: { date: true, vocabTests: true, questionsViewed: true, aiQuestionsAsked: true },
  });

  const heatmapData = progressRecords.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    count: p.vocabTests + p.questionsViewed + p.aiQuestionsAsked,
  }));

  // Calculate streak days (consecutive days with activity ending today or yesterday)
  let streakDays = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activityDates = new Set(
    progressRecords
      .filter((p) => p.vocabTests + p.questionsViewed + p.aiQuestionsAsked > 0)
      .map((p) => p.date.toISOString().split("T")[0])
  );

  // Check from today backwards
  const checkDate = new Date(today);
  // Allow streak to start from today or yesterday
  const todayStr = checkDate.toISOString().split("T")[0];
  if (!activityDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = checkDate.toISOString().split("T")[0];
    if (!activityDates.has(yesterdayStr)) {
      // No recent activity, streak is 0
      streakDays = 0;
    } else {
      // Count from yesterday backwards
      streakDays = 1;
      checkDate.setDate(checkDate.getDate() - 1);
      while (activityDates.has(checkDate.toISOString().split("T")[0])) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
  } else {
    streakDays = 1;
    checkDate.setDate(checkDate.getDate() - 1);
    while (activityDates.has(checkDate.toISOString().split("T")[0])) {
      streakDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  // Top 5 wrong vocab answers
  const topWrongAnswers = await prisma.wrongVocabAnswer.findMany({
    where: { studentId },
    orderBy: { count: "desc" },
    take: 5,
    include: {
      item: {
        select: {
          english: true,
          korean: true,
          partOfSpeech: true,
          list: { select: { title: true } },
        },
      },
    },
  });

  return {
    totalTests,
    avgScore,
    streakDays,
    heatmapData,
    topWrongAnswers,
  };
}

// ---------------------------------------------------------------------------
// Wrong word severity styling
// ---------------------------------------------------------------------------
function getWordTagStyle(count: number) {
  if (count >= 5)
    return {
      border: "border-l-[#EF5350]",
      bg: "bg-gradient-to-r from-[#FFEBEE] to-[#FFF3E0]",
      badge: "bg-gradient-to-r from-[#EF5350] to-[#FFA726] text-white",
    };
  if (count >= 3)
    return {
      border: "border-l-[#FFA726]",
      bg: "bg-gradient-to-r from-[#FFF3E0] to-[#FFF8E1]",
      badge: "bg-gradient-to-r from-[#FFA726] to-[#FFCA28] text-white",
    };
  return {
    border: "border-l-[#9CA396]",
    bg: "bg-[#FAFBF8]",
    badge: "bg-[#E5E7E0] text-[#4A5043]",
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function MyPage({ params }: MyPageProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  const session = await getStudentSession();
  const isLoggedIn = session && session.schoolSlug === schoolSlug;

  // Fetch study data only when logged in
  const studyData = isLoggedIn
    ? await getStudyData(session.studentId)
    : null;

  return (
    <>
      <TopBarBack title="마이페이지" />

      <div className="flex flex-col gap-5 px-5 py-5">
        {!isLoggedIn ? (
          /* ── Not logged in ── */
          <div className="animate-float-up relative overflow-hidden rounded-2xl bg-[#FAFBF8] p-8">
            {/* Background mesh */}
            <div className="gradient-mesh pointer-events-none absolute inset-0" />

            <div className="relative flex flex-col items-center gap-5">
              {/* Avatar placeholder */}
              <div className="flex size-20 items-center justify-center rounded-full bg-white shadow-card">
                <User className="size-9 text-[#C8CCC2]" />
              </div>

              <div className="flex flex-col items-center gap-1.5 text-center">
                <p className="text-[17px] font-bold tracking-tight text-[#1A1F16]">
                  로그인이 필요합니다
                </p>
                <p className="text-[13px] leading-relaxed text-[#6B7265]">
                  학습 현황과 오답 노트를 확인하려면
                  <br />
                  로그인하세요
                </p>
              </div>

              <Link
                href="/login"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-[15px] font-semibold text-white shadow-glow-green press-scale"
              >
                <LogIn className="size-[18px]" />
                로그인하기
              </Link>
            </div>
          </div>
        ) : (
          /* ── Logged in ── */
          <>
            {/* ── Profile Card ── */}
            <div className="animate-float-up relative overflow-hidden rounded-2xl gradient-dark p-6">
              {/* Decorative mesh overlay */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 85% 15%, rgba(124, 179, 66, 0.2) 0%, transparent 50%), radial-gradient(circle at 10% 85%, rgba(174, 213, 129, 0.12) 0%, transparent 50%)",
                }}
              />

              <div className="relative flex items-center gap-4">
                {/* Avatar */}
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/10 ring-2 ring-white/20">
                  <User className="size-7 text-white/90" />
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  <span className="text-[18px] font-bold tracking-tight text-white">
                    {session.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
                      <School className="size-3" />
                      {school.name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
                      <GraduationCap className="size-3" />
                      {session.grade}학년
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Study Stats ── */}
            {studyData && (
              <div className="animate-float-up stagger-1">
                <StudyStats
                  totalTests={studyData.totalTests}
                  avgScore={studyData.avgScore}
                  streakDays={studyData.streakDays}
                />
              </div>
            )}

            {/* ── Calendar Heatmap ── */}
            {studyData && (
              <div className="animate-float-up stagger-2">
                <CalendarHeatmap data={studyData.heatmapData} />
              </div>
            )}

            {/* ── Top Wrong Words ── */}
            {studyData && studyData.topWrongAnswers.length > 0 && (
              <div className="animate-float-up stagger-3 rounded-2xl bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#EF5350] to-[#FFA726]">
                      <Sparkles className="size-3.5 text-white" />
                    </div>
                    <p className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
                      자주 틀리는 단어
                    </p>
                  </div>
                  <Link
                    href={`/${schoolSlug}/mypage/wrong-answers`}
                    className="flex items-center gap-0.5 text-[12px] font-medium text-[#7CB342]"
                  >
                    전체보기
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                <div className="flex flex-col gap-2">
                  {studyData.topWrongAnswers.map((wa, idx) => {
                    const style = getWordTagStyle(wa.count);
                    return (
                      <div
                        key={wa.id}
                        className={cn(
                          "animate-float-up flex items-center justify-between rounded-xl border-l-[3px] px-4 py-3",
                          style.border,
                          style.bg,
                          idx === 0 && "stagger-4",
                          idx === 1 && "stagger-5",
                          idx === 2 && "stagger-6",
                          idx === 3 && "stagger-7",
                          idx === 4 && "stagger-8"
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] font-semibold text-[#1A1F16]">
                            {wa.item.english}
                          </span>
                          <span className="text-[11px] text-[#6B7265]">
                            {wa.item.korean}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg text-[12px] font-bold",
                            style.badge
                          )}
                        >
                          {wa.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Menu Cards ── */}
            <div className="flex flex-col gap-3 animate-float-up stagger-4">
              <Link
                href={`/${schoolSlug}/mypage/wrong-answers`}
                className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover press-scale"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#EF5350] to-[#FFA726]">
                  <BookX className="size-5.5 text-white" />
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
                    오답 노트
                  </span>
                  <span className="text-[12px] text-[#6B7265]">
                    자주 틀리는 단어를 확인하세요
                  </span>
                </div>
                <ArrowRight className="size-5 shrink-0 text-[#C8CCC2] transition-transform group-hover:translate-x-1 group-hover:text-[#7CB342]" />
              </Link>

              <Link
                href={`/${schoolSlug}/mypage/progress`}
                className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover press-scale"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7CB342] to-[#689F38]">
                  <BarChart3 className="size-5.5 text-white" />
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
                    학습 현황
                  </span>
                  <span className="text-[12px] text-[#6B7265]">
                    학습 진도와 테스트 기록을 확인하세요
                  </span>
                </div>
                <ArrowRight className="size-5 shrink-0 text-[#C8CCC2] transition-transform group-hover:translate-x-1 group-hover:text-[#7CB342]" />
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
