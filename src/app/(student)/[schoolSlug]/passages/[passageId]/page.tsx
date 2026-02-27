import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { hashContent } from "@/lib/passage-utils";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { PassageStudyView } from "./passage-study-view";
import {
  Lightbulb,
  BookOpen,
  Languages,
  Info,
  GraduationCap,
  Calendar,
  BookMarked,
  ArrowUp,
} from "lucide-react";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface PassageDetailProps {
  params: Promise<{ schoolSlug: string; passageId: string }>;
}

const NOTE_CONFIG: Record<
  string,
  {
    label: string;
    gradientFrom: string;
    gradientTo: string;
    bgColor: string;
    textColor: string;
    iconBg: string;
    icon: typeof Lightbulb;
  }
> = {
  EMPHASIS: {
    label: "핵심 포인트",
    gradientFrom: "#7CB342",
    gradientTo: "#689F38",
    bgColor: "bg-[#F9FBF8]",
    textColor: "text-[#7CB342]",
    iconBg: "bg-[#F1F8E9]",
    icon: Lightbulb,
  },
  GRAMMAR: {
    label: "문법 노트",
    gradientFrom: "#4CAF50",
    gradientTo: "#388E3C",
    bgColor: "bg-[#F0FDF9]",
    textColor: "text-[#4CAF50]",
    iconBg: "bg-[#ECFDF5]",
    icon: BookOpen,
  },
  VOCAB: {
    label: "어휘 노트",
    gradientFrom: "#F59E0B",
    gradientTo: "#D97706",
    bgColor: "bg-[#FFFBF0]",
    textColor: "text-[#F59E0B]",
    iconBg: "bg-[#FEF3C7]",
    icon: Languages,
  },
  TIP: {
    label: "학습 팁",
    gradientFrom: "#6B7265",
    gradientTo: "#4A5043",
    bgColor: "bg-[#FAFBF8]",
    textColor: "text-[#6B7265]",
    iconBg: "bg-[#F3F4F0]",
    icon: Info,
  },
};

export default async function PassageDetailPage({
  params,
}: PassageDetailProps) {
  const { passageId } = await params;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: {
      notes: {
        orderBy: { order: "asc" },
      },
      school: {
        select: { name: true },
      },
      analysis: true,
    },
  });

  if (!passage) {
    notFound();
  }

  // Parse cached analysis if exists and content hash matches
  let cachedAnalysis: PassageAnalysisData | null = null;
  if (passage.analysis) {
    const currentHash = hashContent(passage.content);
    if (passage.analysis.contentHash === currentHash) {
      try {
        cachedAnalysis = JSON.parse(passage.analysis.analysisData);
      } catch {
        cachedAnalysis = null;
      }
    }
  }

  const semesterLabel = passage.semester === "FIRST" ? "1학기" : "2학기";

  return (
    <>
      <TopBarBack title={passage.title} />

      <div className="flex flex-col gap-5 pb-8">
        {/* Dark header card with metadata */}
        <div
          className="animate-float-up gradient-dark mx-5 mt-5 rounded-2xl p-5"
          style={{ animationDelay: "0s" }}
        >
          <h1 className="text-[17px] font-bold tracking-[-0.025em] text-white leading-snug mb-4">
            {passage.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-[3px] text-[11px] font-medium text-white/90">
              <GraduationCap className="size-3 text-white/70" />
              {passage.grade}학년
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-[3px] text-[11px] font-medium text-white/90">
              <Calendar className="size-3 text-white/70" />
              {semesterLabel}
            </span>
            {passage.unit && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-[3px] text-[11px] font-medium text-white/90">
                {passage.unit}
              </span>
            )}
            {passage.source && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7CB342]/30 px-2.5 py-[3px] text-[11px] font-semibold text-[#C5E1A5]">
                <BookMarked className="size-3" />
                {passage.source}
              </span>
            )}
          </div>
        </div>

        {/* Study view (read mode + study mode with AI analysis) */}
        <PassageStudyView
          passageId={passage.id}
          content={passage.content}
          initialAnalysis={cachedAnalysis}
        />

        {/* Teacher notes */}
        {passage.notes.length > 0 && (
          <div
            className="animate-float-up flex flex-col gap-3 px-5"
            style={{ animationDelay: "0.12s" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="flex size-6 items-center justify-center rounded-lg bg-[#F1F8E9]">
                <Lightbulb className="size-3.5 text-[#7CB342]" />
              </div>
              <h2 className="text-[15px] font-bold tracking-[-0.025em] text-[#1A1F16]">
                선생님 노트
              </h2>
            </div>

            {passage.notes.map((note, index) => {
              const config = NOTE_CONFIG[note.noteType] ?? NOTE_CONFIG.TIP;
              const Icon = config.icon;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "animate-float-up relative overflow-hidden rounded-xl p-4",
                    config.bgColor,
                    "shadow-card"
                  )}
                  style={{
                    animationDelay: `${0.16 + index * 0.04}s`,
                  }}
                >
                  {/* Gradient left border */}
                  <div
                    className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
                    style={{
                      background: `linear-gradient(180deg, ${config.gradientFrom} 0%, ${config.gradientTo} 100%)`,
                    }}
                  />

                  <div className="flex items-center gap-2 mb-2.5 pl-1">
                    <div
                      className={cn(
                        "flex size-6 items-center justify-center rounded-lg",
                        config.iconBg
                      )}
                    >
                      <Icon className={cn("size-3.5", config.textColor)} />
                    </div>
                    <span
                      className={cn(
                        "text-[12px] font-bold tracking-[-0.025em]",
                        config.textColor
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-[13px] leading-[1.7] text-[#343B2E] pl-1">
                    {note.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Source info footer */}
        <div
          className="animate-float-up mx-5 rounded-xl bg-[#FAFBF8] border border-[#E5E7E0]/60 px-4 py-3"
          style={{ animationDelay: "0.24s" }}
        >
          <div className="flex flex-col gap-1 text-[11px] tracking-[-0.025em] text-[#9CA396]">
            <span className="font-medium">
              {passage.school.name}
            </span>
            {passage.source && (
              <span>
                출처: {passage.source}
              </span>
            )}
          </div>
        </div>

        {/* Scroll to top floating button */}
        <a
          href="#"
          className="fixed bottom-20 right-4 z-40 flex size-10 items-center justify-center rounded-full bg-white shadow-card-hover border border-[#E5E7E0]/60 transition-all duration-200 hover:shadow-float active:scale-95"
          aria-label="맨 위로"
        >
          <ArrowUp className="size-4 text-[#6B7265]" />
        </a>
      </div>
    </>
  );
}
