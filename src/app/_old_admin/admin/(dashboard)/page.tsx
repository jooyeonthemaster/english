import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { School, Users, BookOpen, FileText, Activity } from "lucide-react";

export default async function AdminDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  const [schoolCount, studentCount, vocabListCount, examCount] =
    await Promise.all([
      prisma.school.count(),
      prisma.student.count(),
      prisma.vocabularyList.count(),
      prisma.exam.count(),
    ]);

  const stats = [
    {
      label: "총 학교 수",
      count: schoolCount,
      icon: School,
      color: "#3182F6",
      bgColor: "#E8F3FF",
    },
    {
      label: "총 학생 수",
      count: studentCount,
      icon: Users,
      color: "#00C471",
      bgColor: "#E8FAF0",
    },
    {
      label: "등록된 단어장",
      count: vocabListCount,
      icon: BookOpen,
      color: "#F97316",
      bgColor: "#FFF3E8",
    },
    {
      label: "등록된 시험",
      count: examCount,
      icon: FileText,
      color: "#8B5CF6",
      bgColor: "#F3EEFF",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-[#191F28]">대시보드</h1>
        <p className="mt-1 text-[14px] text-[#8B95A1]">
          안녕하세요, {session.user.name}님. 오늘도 좋은 하루 보내세요.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex flex-col gap-4 rounded-xl border border-[#F2F4F6] bg-white p-6"
            >
              <div
                className="flex size-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: stat.bgColor }}
              >
                <Icon className="size-5" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-3xl font-bold text-[#191F28]">
                  {stat.count.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-[#8B95A1]">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Placeholder */}
      <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="size-5 text-[#8B95A1]" />
          <h2 className="text-[16px] font-semibold text-[#191F28]">
            최근 활동
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#F7F8FA]">
            <Activity className="size-5 text-[#ADB5BD]" />
          </div>
          <p className="mt-3 text-[14px] text-[#8B95A1]">
            아직 기록된 활동이 없습니다.
          </p>
          <p className="mt-1 text-[13px] text-[#ADB5BD]">
            학생들의 학습 활동이 여기에 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
