"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Flame,
  Trophy,
  Target,
  Calendar,
  FileText,
  ClipboardList,
  BarChart3,
  MessageSquare,
  BookOpen,
  ChevronRight,
  Star,
  Pin,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/actions/student-app";
import {
  getIndividualRanking,
  getSchoolRanking,
  getAcademyRanking,
} from "@/actions/learning-gamification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DashboardData = Awaited<ReturnType<typeof getStudentDashboard>>;
type RankingTab = "individual" | "school" | "academy";

const RANKING_TABS: { key: RankingTab; label: string }[] = [
  { key: "individual", label: "개인" },
  { key: "school", label: "학교" },
  { key: "academy", label: "학원" },
];

// ---------------------------------------------------------------------------
// Quick menu defaults & config
// ---------------------------------------------------------------------------
interface QuickMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  href: string;
  color: string;
  bg: string;
}

const QUICK_MENU_OPTIONS: QuickMenuItem[] = [
  { id: "review", label: "오답복습", icon: Target, href: "/student/review", color: "text-[var(--erp-error)]", bg: "bg-[var(--erp-error-subtle)]" },
  { id: "vocab", label: "단어장", icon: BookOpen, href: "/student/vocab", color: "text-[var(--learn-xp)]", bg: "bg-[var(--learn-xp-light)]" },
  { id: "assignments", label: "숙제", icon: ClipboardList, href: "/student/resources?tab=assignments", color: "text-[var(--erp-warning)]", bg: "bg-[var(--erp-warning-subtle)]" },
  { id: "notices", label: "공지사항", icon: FileText, href: "/student/resources?tab=notices", color: "text-[var(--erp-info)]", bg: "bg-[var(--erp-info-light)]" },
  { id: "grades", label: "성적", icon: BarChart3, href: "/student/mypage?tab=grades", color: "text-[var(--erp-success)]", bg: "bg-[var(--erp-success-subtle)]" },
  { id: "qna", label: "질문하기", icon: MessageSquare, href: "/student/mypage?tab=qna", color: "text-[var(--erp-primary)]", bg: "bg-[var(--erp-primary-subtle)]" },
];

const DEFAULT_SHORTCUTS = ["review", "vocab", "assignments", "notices"];

function getShortcuts(): string[] {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const stored = localStorage.getItem("student-shortcuts");
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_SHORTCUTS;
}

// ---------------------------------------------------------------------------
// Weekly schedule helpers
// ---------------------------------------------------------------------------
const DAY_MAP: Record<string, number> = {
  MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6,
};
const DAY_LABELS = ["월", "화", "수", "목", "금", "토"];

function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
}

// Level badge colors
const LEVEL_COLORS: Record<string, string> = {
  S: "bg-gradient-to-br from-yellow-400 to-amber-500 text-white",
  A: "bg-gradient-to-br from-blue-400 to-blue-600 text-white",
  B: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white",
  C: "bg-gradient-to-br from-amber-400 to-amber-500 text-white",
  D: "bg-[var(--erp-border-light)] text-[var(--erp-text-muted)]",
};

// ---------------------------------------------------------------------------
// Stagger
// ---------------------------------------------------------------------------
function Stagger({ children, i }: { children: React.ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function StudentHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankTab, setRankTab] = useState<RankingTab>("individual");
  const [myRank, setMyRank] = useState<{ rank: number; total: number; label: string } | null>(null);
  const [shortcuts] = useState(getShortcuts);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch ranking when tab changes
  useEffect(() => {
    fetchRanking(rankTab);
  }, [rankTab]);

  async function fetchRanking(tab: RankingTab) {
    try {
      if (tab === "individual") {
        const r = await getIndividualRanking();
        setMyRank({
          rank: r.myRank?.rank ?? 0,
          total: r.top5?.length ?? 0,
          label: `${r.myRank?.rank ?? "-"}위`,
        });
      } else if (tab === "school") {
        const r = await getSchoolRanking();
        const mySchool = r[0];
        setMyRank({
          rank: mySchool ? 1 : 0,
          total: r.length,
          label: mySchool ? `${1}위` : "-",
        });
      } else {
        const r = await getAcademyRanking();
        const myAcademy = r[0];
        setMyRank({
          rank: myAcademy ? 1 : 0,
          total: r.length,
          label: myAcademy ? `${1}위` : "-",
        });
      }
    } catch {
      setMyRank(null);
    }
  }

  if (loading) return <HomeSkeleton />;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-[var(--fs-sm)] text-[var(--erp-text-muted)]">
          데이터를 불러올 수 없습니다.
        </p>
      </div>
    );
  }

  const { student, stats, upcomingExams, pendingAssignments, analytics, recentNotices } = data;
  const todayIdx = getTodayDayIndex();
  let idx = 0;

  const quickMenuItems = shortcuts
    .map((id) => QUICK_MENU_OPTIONS.find((o) => o.id === id))
    .filter(Boolean) as QuickMenuItem[];

  // Build weekly schedule — multiple classes per day possible
  type ScheduleSlot = { className: string; startTime: string; endTime: string; colorIdx: number };
  const weekGrid: ScheduleSlot[][] = Array.from({ length: 6 }, () => []);
  const hasAnyClass = student.enrolledClasses && student.enrolledClasses.length > 0;
  if (student.enrolledClasses) {
    student.enrolledClasses.forEach((cls, ci) => {
      for (const slot of cls.schedule) {
        const dayIdx = DAY_MAP[slot.day.toUpperCase()];
        if (dayIdx !== undefined && dayIdx < 6) {
          weekGrid[dayIdx].push({
            className: cls.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            colorIdx: ci,
          });
        }
      }
    });
  }
  // Find today's classes for the info card
  const todayClasses = weekGrid[todayIdx] ?? [];

  return (
    <div className="flex flex-col flex-1 px-[var(--sp-3)] pt-[var(--pt-page)] pb-[var(--pb-page)]">
      {/* ═══ Section 1: 학습 점수 + 나의 랭킹 ═══ */}
      <Stagger i={idx++}>
        <div className="grid grid-cols-2 gap-[var(--sp-2)]">
          {/* Left — 나의 학습 점수 */}
          <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
            <h3 className="text-[var(--fs-caption)] font-semibold text-[var(--erp-text-muted)] mb-[var(--sp-2)]">
              나의 학습
            </h3>

            {/* Score + Grade badge */}
            <div className="flex items-end gap-[var(--sp-2)] mb-[var(--sp-2)]">
              <span className="text-[var(--fs-2xl)] font-black text-[var(--erp-text)] leading-none">
                {Math.round(analytics.overallScore)}
              </span>
              <div className="flex items-center gap-[var(--sp-1)]">
                <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)]">점</span>
                <span
                  className={cn(
                    "text-[var(--fs-caption)] font-bold px-[var(--sp-1)] py-0.5 rounded-[var(--radius-sm)]",
                    LEVEL_COLORS[analytics.level] ?? LEVEL_COLORS.D,
                  )}
                >
                  {analytics.level}
                </span>
              </div>
            </div>

            {/* Streak */}
            {stats.streak > 0 && (
              <div className="flex items-center gap-[var(--sp-1)] px-[var(--sp-2)] py-[var(--sp-1)] rounded-full bg-orange-50 w-fit">
                <Flame className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-[var(--learn-streak)]" />
                <span className="text-[var(--fs-caption)] font-bold text-[var(--learn-streak)]">
                  연속 {stats.streak}일
                </span>
              </div>
            )}

            {/* Daily mission */}
            <div className="flex items-center gap-[var(--sp-1)] mt-[var(--sp-2)]">
              <Star className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-[var(--learn-accent)]" />
              <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)]">
                오늘 {stats.weekStudyDays > 0 ? "학습 완료" : "미학습"}
              </span>
            </div>
          </div>

          {/* Right — 나의 실시간 랭킹 */}
          <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
            <h3 className="text-[var(--fs-caption)] font-semibold text-[var(--erp-text-muted)] mb-[var(--sp-2)]">
              나의 랭킹
            </h3>
            {/* Tabs */}
            <div className="flex gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-[var(--erp-border-light)] mb-[var(--sp-2)]">
              {RANKING_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setRankTab(t.key)}
                  className={cn(
                    "flex-1 text-[var(--fs-caption)] font-medium py-[var(--sp-1)] rounded-[var(--radius-sm)] transition-all",
                    rankTab === t.key
                      ? "bg-[var(--erp-surface)] text-[var(--erp-primary)] shadow-sm font-semibold"
                      : "text-[var(--erp-text-muted)]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Rank display */}
            <div className="flex flex-col items-center justify-center py-[var(--sp-2)]">
              <Trophy className="w-[var(--icon-lg)] h-[var(--icon-lg)] text-[var(--learn-accent)] mb-[var(--sp-1)]" />
              <span className="text-[var(--fs-xl)] font-black text-[var(--erp-text)]">
                {myRank?.label ?? "-"}
              </span>
              {myRank && myRank.total > 0 && (
                <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)]">
                  전체 {myRank.total}명 중
                </span>
              )}
            </div>
          </div>
        </div>
      </Stagger>

      {/* flexible spacer */}
      <div className="flex-1" />

      {/* ═══ Section 2: 수업 일정 (주간 캘린더) ═══ */}
      <Stagger i={idx++}>
        <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
          <div className="flex items-center justify-between mb-[var(--sp-2)]">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)] flex items-center gap-[var(--sp-1)]">
              <Calendar className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-[var(--erp-text-secondary)]" />
              수업 일정
            </h3>
            <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)]">
              이번 주
            </span>
          </div>

          {/* Weekly visual schedule — day row with colored blocks */}
          <div className="flex gap-[var(--sp-1)]">
            {DAY_LABELS.map((dayLabel, i) => {
              const slots = weekGrid[i];
              const isToday = i === todayIdx;
              const hasClass = slots.length > 0;
              return (
                <div
                  key={dayLabel}
                  className="flex-1 flex flex-col items-center gap-[var(--sp-1)]"
                >
                  {/* Day label */}
                  <span
                    className={cn(
                      "text-[var(--fs-caption)] font-semibold",
                      isToday ? "text-[var(--erp-primary)]" : "text-[var(--erp-text-muted)]",
                    )}
                  >
                    {dayLabel}
                  </span>
                  {/* Visual block */}
                  <div
                    className={cn(
                      "w-full aspect-square rounded-[var(--radius-md)] flex items-center justify-center transition-all",
                      isToday && hasClass && "bg-[var(--erp-primary)] shadow-sm shadow-blue-500/20",
                      isToday && !hasClass && "bg-[var(--erp-primary-subtle)] border-2 border-[var(--erp-primary)]/30",
                      !isToday && hasClass && "bg-[var(--erp-primary-light)]",
                      !isToday && !hasClass && "bg-[var(--erp-bg)]",
                    )}
                  >
                    {hasClass && (
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isToday ? "bg-white" : "bg-[var(--erp-primary)]",
                        )}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today's class info card */}
          {todayClasses.length > 0 ? (
            <div className="mt-[var(--sp-2)] p-[var(--sp-2)] rounded-[var(--radius-md)] bg-[var(--erp-primary-subtle)] border border-[var(--erp-primary)]/10">
              <p className="text-[var(--fs-caption)] font-semibold text-[var(--erp-primary)] mb-[var(--sp-1)]">
                오늘 수업
              </p>
              {todayClasses.map((cls, ci) => (
                <div key={ci} className="flex items-center gap-[var(--sp-2)]">
                  <div className="w-1 h-[var(--sp-4)] rounded-full bg-[var(--erp-primary)]" />
                  <span className="text-[var(--fs-xs)] font-semibold text-[var(--erp-text)]">{cls.className}</span>
                  <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] ml-auto">
                    {cls.startTime}~{cls.endTime}
                  </span>
                </div>
              ))}
            </div>
          ) : hasAnyClass ? (
            <p className="mt-[var(--sp-2)] text-[var(--fs-caption)] text-[var(--erp-text-muted)] text-center">
              오늘은 수업이 없습니다
            </p>
          ) : null}

          {/* Upcoming exams */}
          {upcomingExams.length > 0 && (
            <div className="mt-[var(--sp-2)] pt-[var(--sp-2)] border-t border-[var(--erp-border-light)]">
              {upcomingExams.slice(0, 2).map((exam) => {
                const dDay = exam.examDate
                  ? Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <div
                    key={exam.id}
                    className="flex items-center gap-[var(--sp-2)] py-[var(--sp-1)]"
                  >
                    <span
                      className={cn(
                        "text-[var(--fs-caption)] font-bold px-[var(--sp-1)] py-0.5 rounded-[var(--radius-sm)]",
                        dDay !== null && dDay <= 3
                          ? "bg-[var(--erp-error-light)] text-[var(--erp-error)]"
                          : "bg-[var(--erp-warning-light)] text-[var(--erp-warning)]",
                      )}
                    >
                      {dDay !== null
                        ? dDay === 0
                          ? "D-Day"
                          : dDay > 0
                            ? `D-${dDay}`
                            : `D+${Math.abs(dDay)}`
                        : ""}
                    </span>
                    <span className="text-[var(--fs-xs)] text-[var(--erp-text)] truncate flex-1">
                      {exam.title}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending assignments hint */}
          {pendingAssignments.length > 0 && (
            <Link
              href="/student/resources?tab=assignments"
              className="flex items-center justify-between mt-[var(--sp-2)] pt-[var(--sp-2)] border-t border-[var(--erp-border-light)] group"
            >
              <span className="text-[var(--fs-xs)] text-[var(--erp-warning)] font-medium">
                미제출 숙제 {pendingAssignments.length}건
              </span>
              <ChevronRight className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-[var(--erp-text-muted)] group-active:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      </Stagger>

      {/* flexible spacer */}
      <div className="flex-1" />

      {/* ═══ Section 3: 바로가기 메뉴 ═══ */}
      <Stagger i={idx++}>
        <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
          <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)] mb-[var(--sp-2)]">
            바로가기
          </h3>
          <div className="grid grid-cols-4 gap-[var(--sp-2)]">
            {quickMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col items-center gap-[var(--sp-1)] py-[var(--sp-2)] rounded-[var(--radius-md)] active:bg-[var(--erp-bg)] transition-colors"
                >
                  <div
                    className={cn(
                      "w-[var(--touch-min)] h-[var(--touch-min)] rounded-full flex items-center justify-center",
                      item.bg,
                    )}
                  >
                    <Icon className={cn("w-[var(--icon-md)] h-[var(--icon-md)]", item.color)} />
                  </div>
                  <span className="text-[var(--fs-caption)] font-medium text-[var(--erp-text-secondary)]">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </Stagger>

      {/* ═══ Section 4: 공지사항 ═══ */}
      <Stagger i={idx++}>
        <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
          <div className="flex items-center justify-between mb-[var(--sp-2)]">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)] flex items-center gap-[var(--sp-1)]">
              <FileText className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-[var(--erp-text-secondary)]" />
              공지사항
            </h3>
            <Link
              href="/student/resources?tab=notices"
              className="text-[var(--fs-caption)] text-[var(--erp-primary)] font-medium"
            >
              전체보기
            </Link>
          </div>
          {recentNotices.length > 0 ? (
            <div className="space-y-[var(--sp-1)]">
              {recentNotices.map((notice) => (
                <Link
                  key={notice.id}
                  href={`/student/resources?tab=notices&id=${notice.id}`}
                  className="flex items-center gap-[var(--sp-2)] py-[var(--sp-1)] group"
                >
                  {notice.isPinned && (
                    <Pin className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-[var(--erp-error)] shrink-0" />
                  )}
                  <span className="text-[var(--fs-xs)] text-[var(--erp-text)] truncate flex-1 group-active:text-[var(--erp-primary)]">
                    {notice.title}
                  </span>
                  <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] shrink-0">
                    {new Date(notice.publishAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] text-center py-[var(--sp-2)]">
              새로운 공지사항이 없습니다
            </p>
          )}
        </div>
      </Stagger>

      <div className="h-[var(--sp-2)]" />

      {/* ═══ Section 5: 숙제 일정 ═══ */}
      <Stagger i={idx++}>
        <div className="rounded-[var(--radius-lg)] bg-[var(--erp-surface)] border border-[var(--erp-border)] p-[var(--sp-3)]">
          <div className="flex items-center justify-between mb-[var(--sp-2)]">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)] flex items-center gap-[var(--sp-1)]">
              <ClipboardList className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-[var(--erp-warning)]" />
              숙제
            </h3>
            <Link
              href="/student/resources?tab=assignments"
              className="text-[var(--fs-caption)] text-[var(--erp-primary)] font-medium"
            >
              전체보기
            </Link>
          </div>
          {pendingAssignments.length > 0 ? (
            <div className="space-y-[var(--sp-1)]">
              {pendingAssignments.map((a) => {
                const dueDate = new Date(a.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-[var(--sp-2)] py-[var(--sp-1)]"
                  >
                    <span
                      className={cn(
                        "text-[var(--fs-caption)] font-bold px-[var(--sp-1)] py-0.5 rounded-[var(--radius-sm)] shrink-0",
                        daysLeft <= 1
                          ? "bg-[var(--erp-error-light)] text-[var(--erp-error)]"
                          : daysLeft <= 3
                            ? "bg-[var(--erp-warning-light)] text-[var(--erp-warning)]"
                            : "bg-[var(--erp-info-light)] text-[var(--erp-info)]",
                      )}
                    >
                      {daysLeft <= 0 ? "오늘" : `D-${daysLeft}`}
                    </span>
                    <span className="text-[var(--fs-xs)] text-[var(--erp-text)] truncate flex-1">
                      {a.title}
                    </span>
                    <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] shrink-0">
                      {dueDate.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}까지
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] text-center py-[var(--sp-2)]">
              예정된 숙제가 없습니다
            </p>
          )}
        </div>
      </Stagger>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function HomeSkeleton() {
  return (
    <div className="flex flex-col flex-1 px-[var(--sp-3)] pt-[var(--pt-page)] pb-[var(--pb-page)]">
      <div className="grid grid-cols-2 gap-[var(--sp-2)]">
        <div className="h-44 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
        <div className="h-44 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
      </div>
      <div className="flex-1" />
      <div className="h-36 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
      <div className="flex-1" />
      <div className="h-28 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
      <div className="h-10 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
      <div className="h-[var(--sp-2)]" />
      <div className="h-10 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)] animate-pulse" />
    </div>
  );
}
