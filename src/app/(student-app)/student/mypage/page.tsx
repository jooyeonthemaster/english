"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, CalendarCheck, BookOpen, CreditCard, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyPage, useEnrollments } from "@/hooks/use-student-data";
import { logoutStudentAction } from "@/actions/auth";
import { GradesTab } from "./_components/grades-tab";
import { AttendanceTab } from "./_components/attendance-tab";
import { EnrollmentTab } from "./_components/enrollment-tab";
import { PaymentTab } from "./_components/payment-tab";
import { SettingsTab } from "./_components/settings-tab";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Tab = "grades" | "attendance" | "enrollment" | "payment" | "settings";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { key: "grades", label: "성적", icon: BarChart3 },
  { key: "attendance", label: "출결", icon: CalendarCheck },
  { key: "enrollment", label: "수강", icon: BookOpen },
  { key: "payment", label: "수납", icon: CreditCard },
  { key: "settings", label: "설정", icon: Settings },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function StudentMyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "grades";

  const { data: inbadi, isLoading } = useMyPage();
  const { data: enrollments = [], refetch: refetchEnrollments } = useEnrollments();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === "enrollment" && enrollments.length === 0) {
      refetchEnrollments();
    }
  }, [enrollments.length, refetchEnrollments]);

  const handleLogout = async () => {
    await logoutStudentAction();
    router.push("/student/login");
  };

  if (isLoading && !inbadi) return <MyPageSkeleton />;
  if (!inbadi) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-sm text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { student, analytics } = inbadi;

  return (
    <div className="pb-6">
      {/* 탭바 — 홈 퀵메뉴와 동일 스타일 */}
      <div className="px-5 mb-3">
        <div className="flex gap-4 justify-between">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className="flex flex-col items-center gap-1.5 flex-1 active:scale-95 transition-transform"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white "
                  style={active ? { color: "var(--key-color)" } : undefined}
                >
                  <Icon
                    className={cn("w-5 h-5", !active && "text-black")}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                </div>
                <span className={cn("text-xs font-medium", active ? "text-black font-semibold" : "text-black")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="px-5">
        <AnimatePresence mode="wait">
          {activeTab === "grades" && (
            <motion.div key="grades" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GradesTab analytics={analytics} />
            </motion.div>
          )}
          {activeTab === "attendance" && (
            <motion.div key="attendance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AttendanceTab />
            </motion.div>
          )}
          {activeTab === "enrollment" && (
            <motion.div key="enrollment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EnrollmentTab enrollments={enrollments} />
            </motion.div>
          )}
          {activeTab === "payment" && (
            <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PaymentTab />
            </motion.div>
          )}
          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SettingsTab student={student} onLogout={handleLogout} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function MyPageSkeleton() {
  return (
    <div className="animate-pulse px-5 pt-4">
      <div className="h-40 bg-gray-100 rounded-3xl mb-4" />
      <div className="h-10 bg-gray-100 rounded-2xl mb-3" />
      <div className="h-60 bg-gray-100 rounded-3xl" />
    </div>
  );
}
