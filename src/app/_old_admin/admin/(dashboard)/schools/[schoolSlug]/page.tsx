import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  FileText,
  BookOpen,
  ClipboardList,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SchoolDetailPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function SchoolDetailPage({
  params,
}: SchoolDetailPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
    include: {
      _count: {
        select: {
          passages: true,
          vocabLists: true,
          exams: true,
          teacherPrompts: true,
        },
      },
    },
  });

  if (!school) {
    notFound();
  }

  const actionCards = [
    {
      title: "지문 관리",
      description: "교과서 지문과 학습 노트를 관리합니다.",
      href: `/admin/schools/${school.slug}/passages`,
      icon: FileText,
      count: school._count.passages,
      countLabel: "등록 지문",
      color: "#3182F6",
      bgColor: "#E8F3FF",
    },
    {
      title: "단어장 관리",
      description: "단어 목록과 학습 자료를 관리합니다.",
      href: `/admin/schools/${school.slug}/vocab`,
      icon: BookOpen,
      count: school._count.vocabLists,
      countLabel: "등록 단어장",
      color: "#00C471",
      bgColor: "#E8FAF0",
    },
    {
      title: "시험 관리",
      description: "시험 문제와 해설을 관리합니다.",
      href: `/admin/schools/${school.slug}/exams`,
      icon: ClipboardList,
      count: school._count.exams,
      countLabel: "등록 시험",
      color: "#F97316",
      bgColor: "#FFF3E8",
    },
    {
      title: "AI 프롬프트 관리",
      description: "AI 학습 도우미의 프롬프트를 설정합니다.",
      href: `/admin/schools/${school.slug}/prompts`,
      icon: MessageSquare,
      count: school._count.teacherPrompts,
      countLabel: "등록 프롬프트",
      color: "#8B5CF6",
      bgColor: "#F3EEFF",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8B95A1]">
        <Link
          href="/admin/schools"
          className="transition-colors hover:text-[#3182F6]"
        >
          학교 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">{school.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/schools">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-[24px] font-bold text-[#191F28]">
            {school.name}
          </h1>
          <Badge
            variant="secondary"
            className={
              school.type === "MIDDLE"
                ? "bg-[#E8F3FF] text-[#3182F6] hover:bg-[#E8F3FF]"
                : "bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
            }
          >
            {school.type === "MIDDLE" ? "중학교" : "고등학교"}
          </Badge>
        </div>
      </div>

      {/* Action Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {actionCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href} className="group">
              <div className="flex flex-col gap-4 rounded-xl border border-[#F2F4F6] bg-white p-6 transition-all hover:border-[#E5E8EB] hover:shadow-sm">
                {/* Icon & Count */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex size-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: card.bgColor }}
                  >
                    <Icon
                      className="size-5"
                      style={{ color: card.color }}
                    />
                  </div>
                  <div className="text-right">
                    <p
                      className="text-2xl font-bold"
                      style={{ color: card.color }}
                    >
                      {card.count}
                    </p>
                    <p className="text-[12px] text-[#ADB5BD]">
                      {card.countLabel}
                    </p>
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-[15px] font-semibold text-[#191F28] group-hover:text-[#3182F6]">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-[13px] text-[#8B95A1]">
                    {card.description}
                  </p>
                </div>

                {/* Button */}
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#3182F6] opacity-0 transition-opacity group-hover:opacity-100">
                    관리
                    <ChevronRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
