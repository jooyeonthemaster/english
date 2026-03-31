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
      <div className="px-5 pt-5 animate-pulse space-y-4">
        <div className="h-32 bg-gray-100 rounded-3xl" />
        <div className="h-24 bg-gray-100 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-5 space-y-4">
      {/* Profile info */}
      <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <h3 className="text-xs font-semibold text-gray-500 mb-3">프로필</h3>
        <div className="space-y-3">
          <InfoRow label="이름" value={student?.name ?? "-"} />
          <InfoRow label="학교" value={student?.schoolName ?? "-"} />
          <InfoRow label="학년" value={student ? `${student.grade}학년` : "-"} />
          <InfoRow label="레벨" value={student ? `Lv.${student.level}` : "-"} />
        </div>
      </div>

      {/* App info */}
      <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <h3 className="text-xs font-semibold text-gray-500 mb-3">앱 정보</h3>
        <InfoRow label="버전" value="0.1.0" />
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-3xl border border-red-200 text-red-500 text-sm font-medium active:bg-red-50 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        로그아웃
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}
