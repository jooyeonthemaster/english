import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ passageId: string }>;
}

/**
 * 지문별 보고서 목록.
 * 비어있으면 "새 보고서 만들기" 만 노출.
 */
export default async function PassageReportsListPage({ params }: PageProps) {
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

  const reports = await prisma.passageReport.findMany({
    where: {
      passageId,
      academyId: staff.academyId,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      templateId: true,
      version: true,
      lastEditedAt: true,
      updatedAt: true,
    },
  });

  const hasAnalysis = Boolean(passage.analysis);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>학습자료 보고서</h1>
        <span style={{ color: "rgb(100, 116, 139)", fontSize: 13 }}>
          {passage.title}
        </span>
      </div>
      <p style={{ color: "rgb(71, 85, 105)", fontSize: 13, margin: "0 0 24px" }}>
        A4 인쇄용 자유 편집 학습자료. 디자인 템플릿 5종 중 선택해서 시작.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Link
          href={`/director/workbench/passages/${passageId}/reports/new`}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "rgb(37, 99, 235)",
            color: "white",
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          + 새 보고서 만들기
        </Link>
        {hasAnalysis ? (
          <span style={{ alignSelf: "center", fontSize: 12, color: "rgb(100, 116, 139)" }}>
            분석 완료 — &ldquo;분석에서 변환&rdquo; 옵션 사용 가능
          </span>
        ) : (
          <span style={{ alignSelf: "center", fontSize: 12, color: "rgb(71, 85, 105)" }}>
            지문 분석을 먼저 완료하면 더 풍부한 자료가 자동으로 채워집니다
          </span>
        )}
      </div>

      {reports.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            background: "white",
            border: "1px dashed rgb(203, 213, 225)",
            borderRadius: 12,
            textAlign: "center",
            color: "rgb(100, 116, 139)",
          }}
        >
          아직 만든 보고서가 없습니다. 위 버튼으로 첫 보고서를 만들어 보세요.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/director/workbench/passages/${passageId}/reports/${r.id}`}
              style={{
                display: "block",
                padding: 16,
                background: "white",
                border: "1px solid rgb(226, 232, 240)",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "rgb(100, 116, 139)", display: "flex", gap: 8 }}>
                <span>{r.templateId ?? "—"}</span>
                <span>·</span>
                <span>{r.status}</span>
                <span>·</span>
                <span>v{r.version}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgb(148, 163, 184)", marginTop: 4 }}>
                마지막 편집: {new Date(r.lastEditedAt ?? r.updatedAt).toLocaleString("ko-KR")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
