import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import {
  getExams,
  getExamCollections,
  getExamCollectionMembership,
  getClassesForFilter,
} from "@/actions/exams";
import { ExamListClient } from "@/components/exams/exam-list-client";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "국어 시험지 관리" };

/**
 * 국어 시험지 관리 — 영어 시험지 목록(/director/exams)의 국어 대칭 라우트.
 * 판별자 일급화(P0) 후 exams.subject 컬럼이 1차 소스다 — getExams({subject:"KOREAN"})
 * 가 국어 시험지만 반환하고(P2022 우아한 강등 내장), 폴더도 getExamCollections(…, "KOREAN")
 * 로 국어 전용 폴더만 잡는다. 목록 클라이언트(ExamListClient)는 영어와 동일 셸을 재사용해
 * 룩앤필을 정확히 미러하며, 폴더 멤버십은 국어 시험지 id 로 교집합해 배지 수치가 국어
 * 스코프로 잡히게 한다.
 */
export default async function KoreanExamsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  const [exams, classes, collections, membershipRaw] = await Promise.all([
    getExams(staff.academyId, { subject: "KOREAN" }),
    getClassesForFilter(staff.academyId),
    getExamCollections(staff.academyId, "KOREAN"),
    getExamCollectionMembership(staff.academyId),
  ]);

  if (exams.length === 0) {
    // 빈 상태 — 영어 목록의 빈 카드 셸을 미러하되 카피는 국어 문맥으로.
    return (
      <div className="flex flex-col min-h-[calc(100vh-64px)]">
        <div className="-mx-6 flex-1 bg-[#F4F6F9] px-6 pt-2 pb-4 sm:px-8">
          <div className="bg-white rounded-xl border text-center py-20">
            <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              국어 문항이 포함된 시험지가 없습니다
            </p>
            <p className="text-sm text-slate-400 mt-1">
              국어 문항으로 시험지를 만들면 여기에 표시됩니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 폴더 멤버십을 국어 시험지 id 로 교집합 — 폴더 배지/필터가 국어 스코프로 집계.
  const koExamIds = new Set(exams.map((exam) => exam.id));
  const collectionMembership: Record<string, Set<string>> = {};
  for (const [colId, examIds] of Object.entries(membershipRaw)) {
    collectionMembership[colId] = new Set(
      examIds.filter((id) => koExamIds.has(id)),
    );
  }

  const clientExams = showResults
    ? exams
    : exams.map((exam) => ({
        ...exam,
        _count: { ...exam._count, submissions: 0 },
      }));

  return (
    <ExamListClient
      exams={clientExams as never[]}
      classes={classes}
      collections={collections}
      collectionMembership={collectionMembership}
      // 편집 진입에 과목 컨텍스트 부여 — 빌더 좌측 피커/폴더가 국어 스코프로 열린다.
      subjectScope="KOREAN"
    />
  );
}
