// ============================================================================
// 공개 학생 리포트 — /r/[token] (무인증 · force-dynamic · noindex)
//
// 토큰 형식검증 → shareEnabled/deletedAt 게이트 조회 → envelope.current 렌더.
// 이 라우트는 (director) 밖이라 전역 인증이 적용되지 않는다. 어떤 세션도
// 요구하지 않는다(토큰 소지 = 접근 권한). 색인은 robots noindex 로 차단하고
// 메타데이터에 학생명·점수를 포함하지 않는다.
// ============================================================================

import type { Metadata } from "next";
import { cache } from "react";
import { Link2Off } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import { parseStudentReportEnvelope } from "@/lib/exam-report/report-schema";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import { ReportPublicContent } from "./report-public-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SharedReport {
  doc: StudentReportDoc;
  academyName: string;
}

/** 토큰 → 공유 리포트 로드(React cache 로 metadata/페이지 중복 조회 제거). */
const loadSharedReport = cache(async (token: string): Promise<SharedReport | null> => {
  if (!isValidShareToken(token)) return null;

  const row = await prisma.examReportStudent.findFirst({
    where: {
      shareToken: token,
      shareEnabled: true,
      deletedAt: null,
      examAnalysis: { deletedAt: null },
    },
    select: {
      report: true,
      examAnalysis: {
        select: {
          title: true,
          schoolName: true,
          grade: true,
          examType: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!row) return null;

  const envelope = parseStudentReportEnvelope(row.report);
  if (!envelope) return null;

  const academyName =
    envelope.current.cover.academyName ||
    row.examAnalysis.schoolName ||
    "우리 학원";
  return { doc: envelope.current, academyName };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await loadSharedReport(token);
  const academyName = data?.academyName ?? "SMOAT";
  // 학생명·점수는 절대 포함하지 않는다.
  return {
    title: `시험 분석 리포트 | ${academyName}`,
    description:
      "학원에서 발행한 학생 시험 분석 리포트입니다. 유형별 성취와 학습 방향을 확인하실 수 있습니다.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadSharedReport(token);

  if (!data) return <ExpiredNotice />;

  const { doc, academyName } = data;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* 학원명 웹 헤더 — 인쇄에서는 커버가 학원명을 갖고 있으므로 숨긴다(중복 방지). */}
      <header className="er-public-print-hide border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold tracking-tight text-slate-700">
          {academyName}
        </p>
      </header>

      <main className="flex-1">
        <ReportPublicContent doc={doc} />
      </main>

      <footer className="er-public-print-hide border-t border-slate-200 bg-white px-4 py-6 text-center">
        <p className="text-xs font-medium text-slate-500">{academyName}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          SMOAT 학생 시험 리포트
        </p>
      </footer>
    </div>
  );
}

function ExpiredNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Link2Off className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          리포트를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          링크가 만료되었거나 비활성화되었습니다. 리포트를 공유해 주신 선생님께
          새 링크를 요청해 주시기 바랍니다.
        </p>
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 학생 시험 리포트</p>
      </div>
    </div>
  );
}
