import { notFound, redirect } from "next/navigation";

import { ReportWorkspace } from "@/components/workbench/report-workspace/ReportWorkspace";
import { getStaffSession } from "@/lib/auth";
import { reportDocumentSchema } from "@/lib/passage-report/schema";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ passageId: string; reportId: string }>;
}

export default async function ReportWorkspacePage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { passageId, reportId } = await params;

  const report = await prisma.passageReport.findUnique({
    where: { id: reportId },
    include: {
      passage: {
        select: { id: true, title: true, academyId: true },
      },
    },
  });

  if (
    !report ||
    report.academyId !== staff.academyId ||
    report.deletedAt ||
    report.passageId !== passageId
  ) {
    notFound();
  }

  // pages JSON 검증 (실패 시 부분 기본값으로 fallback)
  const document = {
    id: report.id,
    title: report.title,
    theme: report.theme as never,
    pages: report.pages as never,
  };

  const parsed = reportDocumentSchema.safeParse(document);
  if (!parsed.success) {
    // 데이터 깨짐 — 사용자에게 friendly error 보여주기
    return (
      <div style={{ padding: 40 }}>
        <h2>보고서 데이터를 불러올 수 없습니다</h2>
        <p>스키마 검증 실패. 관리자에게 문의해주세요.</p>
        <pre style={{ fontSize: 11, opacity: 0.7 }}>
          {JSON.stringify(parsed.error.flatten(), null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <ReportWorkspace
      reportId={report.id}
      passageId={passageId}
      initialDocument={parsed.data}
      initialTitle={report.title}
      initialVersion={report.version}
    />
  );
}
