"use client";

import { motion } from "framer-motion";
import { LogOut, ChevronRight, Bell, Grid3X3, User, Info } from "lucide-react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SettingsTabProps {
  student: {
    name: string;
    grade: number;
    level: number;
    xp: number;
    xpForNextLevel: number;
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
      className="space-y-[var(--sp-2)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 프로필 정보 */}
      <SettingsCard title="프로필" icon={<User size={16} />}>
        <InfoRow label="이름" value={student.name} />
        <InfoRow label="학교" value={student.schoolName ?? "-"} />
        <InfoRow label="학년" value={`${student.grade}학년`} />
        <InfoRow label="레벨" value={`Lv.${student.level}`} />
        <InfoRow label="연속 학습" value={`${student.streak}일`} />
      </SettingsCard>

      {/* 알림 설정 */}
      <SettingsCard title="알림 설정" icon={<Bell size={16} />}>
        <button
          onClick={() => router.push("/student/mypage/settings")}
          className="w-full flex items-center justify-between py-2"
        >
          <span className="text-[var(--fs-xs)] text-[var(--erp-text-secondary)]">
            알림 카테고리 관리
          </span>
          <ChevronRight size={16} className="text-[var(--erp-text-muted)]" />
        </button>
      </SettingsCard>

      {/* 바로가기 편집 */}
      <SettingsCard title="바로가기 메뉴" icon={<Grid3X3 size={16} />}>
        <button
          onClick={() => router.push("/student/mypage/settings")}
          className="w-full flex items-center justify-between py-2"
        >
          <span className="text-[var(--fs-xs)] text-[var(--erp-text-secondary)]">
            홈 바로가기 편집
          </span>
          <ChevronRight size={16} className="text-[var(--erp-text-muted)]" />
        </button>
      </SettingsCard>

      {/* 앱 정보 */}
      <SettingsCard title="앱 정보" icon={<Info size={16} />}>
        <InfoRow label="버전" value="1.0.0" />
      </SettingsCard>

      {/* 로그아웃 */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] border border-[var(--erp-error)]/20 text-[var(--erp-error)] text-[var(--fs-sm)] font-medium active:bg-[var(--erp-error-light)] transition-colors"
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
    <div className="rounded-[var(--radius-md)] border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[var(--erp-text-muted)]">{icon}</span>
        <h3 className="text-[var(--fs-xs)] font-semibold text-[var(--erp-text-secondary)]">
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
      <span className="text-[var(--fs-xs)] text-[var(--erp-text-muted)]">{label}</span>
      <span className="text-[var(--fs-xs)] font-medium text-[var(--erp-text)]">{value}</span>
    </div>
  );
}
