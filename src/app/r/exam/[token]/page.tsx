// ============================================================================
// 공개 시험지 분석 리포트 — /r/exam/[token] (무인증 · force-dynamic · noindex)
// 정본: docs/exam-analysis-v4-spec.md §7 (리포트 2관점 분리, 26-09-03)
//
// 리포트는 두 관점이다. 이 라우트는 ① **시험지 자체**의 분석(총평·난이도 프로필·
// 유형 분포·오답 설계·출제 범위·문항별 분석)이다. ② 학생 개인 리포트는 /r/[token]
// (ExamReportStudent.shareToken) — 토큰 컬럼·라우트가 서로 다르다.
//
// 토큰 형식검증 → shareEnabled/deletedAt/status ANALYZED 게이트 조회 → 직렬화 →
// 클라 본문 렌더. (director) 밖이라 전역 인증이 없다(토큰 소지 = 접근 권한).
// 색인은 robots noindex. 학생 데이터는 **한 글자도** 내려가지 않는다(학생 행은
// 정답 공개 승계 판정용 존재 여부 1건만 조회).
//
// 정답 공개 규칙: INTERNAL(자체 시험지) = 시험지가 확정한 정답이라 전부 공개 /
// 외부 업로드 시험지 = 강사가 「정답·배점 검수」로 확정한 문항만 공개(미확정 문항은
// 「정답 검수 중」 — AI 도출 정답을 학부모에게 사실처럼 내보내지 않는다). 판정은
// map-gate.ts getMapGateStatus 단일 소스(승계 규칙 포함).
// ============================================================================

import type { Metadata } from "next";
import { cache } from "react";
import { Link2Off } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import {
  parseExamAnalysisResult,
  parseExamMap,
  parseExamReviewState,
} from "@/lib/exam-report/schemas";
import { getMapGateStatus } from "@/lib/exam-report/map-gate";
import type { ExamType, QuestionAnalysis } from "@/lib/exam-report/types";
import { ExamPublicContent } from "./exam-public-content";
import type {
  ExamPublicData,
  ExamPublicQuestion,
  ExamPublicQuestionAnalysis,
} from "./exam-public-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// hub/board-shared 의 EXAM_TYPE_LABEL 과 같은 표 — 그 모듈은 클라 헬퍼(fetch·toast)를
// 끌고 오므로 서버 컴포넌트에서 import 하지 않고 4행을 여기 둔다.
const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

/** 문항 번호 정규화 — 분석(perQuestion)과 지도(examMap)의 번호 매칭 키(공백 제거). */
const numberKey = (v: string) => v.replace(/\s+/g, "");

function pickAnalysis(qa: QuestionAnalysis): ExamPublicQuestionAnalysis {
  return {
    difficulty: qa.difficulty,
    difficultyRationale: qa.difficultyRationale,
    examPoint: qa.examPoint,
    intent: qa.intent,
    keyConcepts: qa.keyConcepts,
    solvingStrategy: qa.solvingStrategy,
    explanation: qa.explanation,
    traps: (qa.trapDesign ?? []).map((t) => ({
      choice: t.choice,
      why: t.why,
      attractiveness: t.attractiveness,
    })),
  };
}

/** 토큰 → 공개 데이터(React cache 로 metadata/페이지 중복 조회 제거). */
const loadSharedExam = cache(
  async (token: string): Promise<ExamPublicData | null> => {
    if (!isValidShareToken(token)) return null;

    const row = await prisma.examAnalysis.findFirst({
      where: {
        shareToken: token,
        shareEnabled: true,
        deletedAt: null,
        status: "ANALYZED",
      },
      select: {
        title: true,
        schoolName: true,
        grade: true,
        examType: true,
        examYear: true,
        semester: true,
        sourceType: true,
        structure: true,
        analysis: true,
        reviewState: true,
        sharedAt: true,
        academy: { select: { name: true } },
        // 정답 공개 승계 판정(getMapGateStatus.studentCount>0)용 존재 여부만 — 학생
        // 데이터는 내려가지 않는다.
        students: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
    });
    if (!row) return null;

    const analysis = parseExamAnalysisResult(row.analysis);
    if (!analysis) return null;
    const examMap = parseExamMap(row.structure);
    const reviewState = parseExamReviewState(row.reviewState);
    const isInternal = row.sourceType === "INTERNAL";

    const mapEntries = [...(examMap?.questions ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    const numbers = mapEntries.map((q) => q.number);
    const gate =
      numbers.length > 0
        ? getMapGateStatus({
            questionNumbers: numbers,
            reviewState,
            studentCount: row.students.length,
          })
        : null;
    const confirmed = new Set(
      gate?.open ? numbers : (reviewState.mapConfirmedNumbers ?? []),
    );

    const byKey = new Map(
      analysis.perQuestion.map((q) => [numberKey(q.number), q] as const),
    );
    let hiddenAnswerCount = 0;
    const fromMap: ExamPublicQuestion[] = mapEntries.map((e) => {
      const qa = byKey.get(numberKey(e.number));
      const hasAnswer = Boolean(e.correctAnswer);
      const show = hasAnswer && (isInternal || confirmed.has(e.number));
      if (hasAnswer && !show) hiddenAnswerCount += 1;
      return {
        number: e.number,
        kind: e.kind,
        typeLabel: qa?.typeLabel || e.typeLabel,
        points: e.points,
        brief: e.brief || null,
        answer: show ? (e.correctAnswer ?? null) : null,
        answerHidden: hasAnswer && !show,
        analysis:
          qa && qa.analysisStatus === "OK" ? pickAnalysis(qa) : null,
      };
    });
    // 지도(examMap)가 없는 구 분석 — 문항별 분석 순서대로, 정답·배점 없음.
    const questions: ExamPublicQuestion[] =
      fromMap.length > 0
        ? fromMap
        : analysis.perQuestion
            .filter((q) => q.analysisStatus === "OK")
            .map((qa) => ({
              number: qa.number,
              kind: null,
              typeLabel: qa.typeLabel,
              points: null,
              brief: null,
              answer: null,
              answerHidden: false,
              analysis: pickAnalysis(qa),
            }));

    const pointSum = mapEntries.reduce<number | null>((acc, e) => {
      if (e.points == null) return acc;
      return (acc ?? 0) + e.points;
    }, null);

    return {
      academyName: row.academy.name,
      title: row.title,
      schoolName: row.schoolName,
      grade: row.grade,
      examTypeLabel:
        EXAM_TYPE_LABEL[row.examType as ExamType] ?? row.examType,
      examYear: row.examYear,
      semester: row.semester,
      questionCount: questions.length,
      totalPoints: examMap?.totalPoints ?? pointSum,
      examLevel: analysis.examLevel,
      questions,
      hiddenAnswerCount,
      sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
    };
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await loadSharedExam(token);
  const academyName = data?.academyName ?? "SMOAT";
  return {
    title: data
      ? `${data.title} 시험지 분석 리포트 | ${academyName}`
      : `시험지 분석 리포트 | ${academyName}`,
    description:
      "학원에서 발행한 시험지 분석 리포트입니다. 시험 총평·난이도·유형 분포·문항별 분석을 확인하실 수 있습니다.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicExamReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadSharedExam(token);
  if (!data) return <ExpiredNotice />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="er-public-print-hide border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold tracking-tight text-slate-700">
          {data.academyName}
        </p>
      </header>

      <main className="flex-1">
        <ExamPublicContent data={data} />
      </main>

      <footer className="er-public-print-hide border-t border-slate-200 bg-white px-4 py-6 text-center">
        <p className="text-xs font-medium text-slate-500">{data.academyName}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          SMOAT 시험지 분석 리포트
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
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 시험지 분석 리포트</p>
      </div>
    </div>
  );
}
