"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  getStudentInbadi,
  getStudentBadges,
  getStudentHeatmap,
  getStudentEnrollments,
} from "@/actions/student-app";
import { logoutStudentAction } from "@/actions/auth";
import { ProfileHeader } from "./_components/profile-header";
import { GradesTab } from "./_components/grades-tab";
import { EnrollmentTab } from "./_components/enrollment-tab";
import { QnaTab } from "./_components/qna-tab";
import { SettingsTab } from "./_components/settings-tab";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type InbadiData = Awaited<ReturnType<typeof getStudentInbadi>>;
type BadgesData = Awaited<ReturnType<typeof getStudentBadges>>;
type HeatmapData = Awaited<ReturnType<typeof getStudentHeatmap>>;
type EnrollmentData = Awaited<ReturnType<typeof getStudentEnrollments>>;
type Tab = "grades" | "enrollment" | "qna" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "grades", label: "성적" },
  { key: "enrollment", label: "수강" },
  { key: "qna", label: "질문" },
  { key: "settings", label: "설정" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function StudentMyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "grades";

  const [inbadi, setInbadi] = useState<InbadiData | null>(null);
  const [badges, setBadges] = useState<BadgesData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentData>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    Promise.all([
      getStudentInbadi(),
      getStudentBadges(),
      getStudentHeatmap(),
      getStudentEnrollments(),
    ])
      .then(([i, b, h, e]) => {
        setInbadi(i);
        setBadges(b);
        setHeatmap(h);
        setEnrollments(e);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleLogout = async () => {
    await logoutStudentAction();
    router.push("/student/login");
  };

  if (loading) return <MyPageSkeleton />;
  if (!inbadi) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-[var(--fs-sm)] text-[var(--erp-text-muted)]">
          데이터를 불러올 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-[var(--pb-page)]">
      {/* Profile header */}
      <ProfileHeader
        student={inbadi.student}
        analyticsLevel={inbadi.analytics.level}
        onLogout={handleLogout}
      />

      {/* Tabs */}
      <div className="px-[var(--sp-3)] mt-[var(--sp-3)]">
        <div className="flex gap-0.5 bg-[var(--erp-border-light)] rounded-[var(--radius-md)] p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 py-2 text-[var(--fs-xs)] font-medium rounded-[var(--radius-sm)] transition-all",
                activeTab === tab.key
                  ? "bg-[var(--erp-surface)] text-[var(--erp-text)] shadow-sm font-semibold"
                  : "text-[var(--erp-text-muted)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-[var(--sp-3)] mt-[var(--sp-2)]">
        <AnimatePresence mode="wait">
          {activeTab === "grades" && (
            <motion.div key="grades" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GradesTab
                analytics={inbadi.analytics}
                heatmap={heatmap}
                recentTests={inbadi.recentTests}
                recentExams={inbadi.recentExams}
                badges={badges}
              />
            </motion.div>
          )}
          {activeTab === "enrollment" && (
            <motion.div key="enrollment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EnrollmentTab enrollments={enrollments} />
            </motion.div>
          )}
          {activeTab === "qna" && (
            <motion.div key="qna" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <QnaTab />
            </motion.div>
          )}
          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SettingsTab student={inbadi.student} onLogout={handleLogout} />
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
    <div className="animate-pulse">
      <div className="bg-gradient-to-br from-[var(--erp-primary)] to-[var(--erp-primary-hover)] px-[var(--sp-3)] pt-[var(--sp-4)] pb-7">
        <div className="flex items-center gap-3">
          <div className="w-[var(--avatar-lg)] h-[var(--avatar-lg)] rounded-full bg-white/20" />
          <div className="flex-1">
            <div className="h-4 w-28 bg-white/20 rounded" />
            <div className="h-3 w-20 bg-white/20 rounded mt-1.5" />
          </div>
        </div>
      </div>
      <div className="px-[var(--sp-3)] mt-[var(--gap-section-sm)] space-y-3">
        <div className="h-9 bg-[var(--erp-border-light)] rounded-[var(--radius-md)]" />
        <div className="h-60 bg-[var(--erp-border-light)] rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}
