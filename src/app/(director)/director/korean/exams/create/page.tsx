import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExamPaperBuilderData } from "@/actions/exam-paper-builder";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

export const metadata: Metadata = { title: "국어 시험지 생성" };

/**
 * 국어 시험지 생성 — 영어 시험지 생성(/director/exams/create)의 국어 대칭 라우트.
 * 유저 확정: 시험지 생성/편집 "경로 자체"가 국어 전용으로 분리(공유 /workbench/exams/*
 * 착륙 금지). 빌더 코드(ExamPaperBuilderClient)·export 는 subject 로 공유하되, 좌측
 * 피커·폴더를 국어 전용으로 열고(subjectScope="KOREAN"), 저장 시 exams.subject='KOREAN'
 * 스탬프 + 국어 편집 경로(/director/korean/exams/[id]/edit)로 착륙한다.
 */
export default async function KoreanExamCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const data = await getExamPaperBuilderData(staff.academyId, {
    subject: "KOREAN",
  });

  return (
    <ExamPaperBuilderClient
      academyId={staff.academyId}
      questions={data.questions as never}
      total={data.total}
      totalPages={data.totalPages}
      statusCounts={data.statusCounts}
      collections={data.collections as never}
      classes={data.classes}
      schools={data.schools}
      subjectScope="KOREAN"
    />
  );
}
