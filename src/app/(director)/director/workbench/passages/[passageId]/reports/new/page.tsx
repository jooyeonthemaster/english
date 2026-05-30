import { notFound, redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { templateMetadata } from "@/lib/passage-report/templates";
import { prisma } from "@/lib/prisma";

import { NewReportClient } from "./new-report-client";

interface PageProps {
  params: Promise<{ passageId: string }>;
}

/**
 * 새 보고서 생성 — 디자인 템플릿 5종 선택 + 분석 기반/빈 보고서 모드 선택.
 */
export default async function NewReportPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { passageId } = await params;
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      title: true,
      academyId: true,
      grade: true,
      semester: true,
      unit: true,
      analysis: { select: { id: true } },
    },
  });

  if (!passage || passage.academyId !== staff.academyId) notFound();

  return (
    <NewReportClient
      passageId={passage.id}
      passageTitle={passage.title}
      hasAnalysis={Boolean(passage.analysis)}
      templates={templateMetadata()}
    />
  );
}
