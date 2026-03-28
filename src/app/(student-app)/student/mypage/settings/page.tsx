"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getStudentInbadi } from "@/actions/student-app";
import { logoutStudentAction } from "@/actions/auth";

type StudentInfo = {
  name: string;
  grade: number;
  level: number;
  schoolName: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentInbadi()
      .then((d) => setStudent(d.student))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logoutStudentAction();
    router.push("/student/login");
  };

  if (loading) {
    return (
      <div className="px-[var(--space-md)] pt-[var(--space-md)] animate-pulse space-y-[var(--space-md)]">
        <div className="h-32 bg-gray-100 rounded-[var(--card-radius)]" />
        <div className="h-24 bg-gray-100 rounded-[var(--card-radius)]" />
      </div>
    );
  }

  return (
    <div className="px-[var(--space-md)] pt-[var(--space-sm)] pb-[var(--space-md)] space-y-[var(--space-md)]">
      {/* Profile info */}
      <div className="bg-white rounded-[var(--card-radius)] border border-gray-100 p-[var(--space-md)] shadow-sm">
        <h3 className="text-[var(--text-xs)] font-semibold text-gray-500 mb-[var(--space-sm)]">프로필</h3>
        <div className="space-y-[var(--space-sm)]">
          <InfoRow label="이름" value={student?.name ?? "-"} />
          <InfoRow label="학교" value={student?.schoolName ?? "-"} />
          <InfoRow label="학년" value={student ? `${student.grade}학년` : "-"} />
          <InfoRow label="레벨" value={student ? `Lv.${student.level}` : "-"} />
        </div>
      </div>

      {/* App info */}
      <div className="bg-white rounded-[var(--card-radius)] border border-gray-100 p-[var(--space-md)] shadow-sm">
        <h3 className="text-[var(--text-xs)] font-semibold text-gray-500 mb-[var(--space-sm)]">앱 정보</h3>
        <InfoRow label="버전" value="0.1.0" />
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 min-h-[var(--touch-min)] py-3 rounded-[var(--card-radius)] border border-red-200 text-[var(--student-wrong)] text-[var(--text-sm)] font-medium active:bg-red-50 transition-colors"
      >
        <LogOut className="size-[var(--icon-sm)]" />
        로그아웃
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-xs)] text-gray-500">{label}</span>
      <span className="text-[var(--text-xs)] font-medium text-gray-800">{value}</span>
    </div>
  );
}
