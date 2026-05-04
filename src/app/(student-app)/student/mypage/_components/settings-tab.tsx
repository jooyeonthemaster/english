"use client";

import { motion } from "framer-motion";
import { LogOut, ChevronRight, Bell, User, Info } from "lucide-react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SettingsTabProps {
  student: {
    name: string;
    grade: number;
    xp: number;
    streak: number;
    schoolName: string | null;
  };
  onLogout: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SettingsTab({ student, onLogout }: SettingsTabProps) {
  const router = useRouter();

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 프로필 정보 */}
      <SettingsCard title="프로필" icon={<User size={16} />}>
        <InfoRow label="이름" value={student.name} />
        <InfoRow label="학교" value={student.schoolName ?? "-"} />
        <InfoRow label="학년" value={`${student.grade}학년`} />
        <InfoRow label="XP" value={`${student.xp.toLocaleString()} XP`} />
        <InfoRow label="연속 학습" value={student.streak > 0 ? `${student.streak}일째` : "-"} />
      </SettingsCard>

      {/* 알림 설정 */}
      <SettingsCard title="알림 설정" icon={<Bell size={16} />}>
        <button
          onClick={() => router.push("/student/mypage/settings")}
          className="w-full flex items-center justify-between py-2"
        >
          <span className="text-xs text-gray-400">
            알림 카테고리 관리
          </span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      </SettingsCard>

      {/* 앱 정보 */}
      <SettingsCard title="앱 정보" icon={<Info size={16} />}>
        <InfoRow label="버전" value="1.0.0" />
      </SettingsCard>

      {/* 로그아웃 */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/20 text-red-500 text-sm font-medium active:bg-red-50 transition-colors"
      >
        <LogOut size={16} />
        로그아웃
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SettingsCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white  p-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-xs font-semibold text-gray-400">
          {title}
        </h3>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-black">{value}</span>
    </div>
  );
}
