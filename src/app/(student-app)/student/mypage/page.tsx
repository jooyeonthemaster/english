"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  getStudentInbadi,
  getStudentBadges,
  getStudentHeatmap,
} from "@/actions/student-app";
import { getStudentEnrollments } from "@/actions/student-app-resources";
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

  // 초기 로드: 핵심 데이터(인바디)만 먼저 로드
  useEffect(() => {
    getStudentInbadi()
      .then(setInbadi)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 탭별 지연 로드
  const loadTabData = useCallback((tab: Tab) => {
    if (tab === "grades" && !badges) {
      Promise.all([getStudentBadges(), getStudentHeatmap()])
        .then(([b, h]) => { setBadges(b); setHeatmap(h); })
        .catch(console.error);
    } else if (tab === "enrollment" && enrollments.length === 0) {
      getStudentEnrollments()
        .then(setEnrollments)
        .catch(console.error);
    }
  }, [badges, enrollments.length]);

  // 초기 탭 데이터 로드
  useEffect(() => {
    if (!loading && inbadi) loadTabData(activeTab);
  }, [loading, inbadi, activeTab, loadTabData]);

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  const handleLogout = async () => {
    await logoutStudentAction();
    router.push("/student/login");
  };

  if (loading) return <MyPageSkeleton />;
  if (!inbadi) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-sm text-gray-400">
          데이터를 불러올 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Profile header */}
      <ProfileHeader
        student={inbadi.student}
        analyticsLevel={inbadi.analytics.level}
        onLogout={handleLogout}
      />

      {/* Tabs */}
      <div className="px-5 mt-4">
        <div className="flex gap-0.5 bg-gray-100 rounded-2xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-xl transition-all",
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm font-semibold"
                  : "text-gray-400",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-5 mt-3">
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
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 pt-6 pb-7">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/20" />
          <div className="flex-1">
            <div className="h-4 w-28 bg-white/20 rounded" />
            <div className="h-3 w-20 bg-white/20 rounded mt-1.5" />
          </div>
        </div>
      </div>
      <div className="px-5 mt-4 space-y-3">
        <div className="h-9 bg-gray-100 rounded-2xl" />
        <div className="h-60 bg-gray-100 rounded-3xl" />
      </div>
    </div>
  );
}
