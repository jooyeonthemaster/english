import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpenText } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { KoreanExamTabs } from "@/components/workbench/korean-exam-tabs";
import { KoreanExamPassageLibrary } from "@/components/workbench/korean-exam-passage-library";

export const metadata: Metadata = { title: "국어 기출 지문" };

/**
 * 국어 기출 지문 라이브러리 — 수능·평가원·교육청 국어 기출 지문 1,400여 개를
 * 지문별 최대상세 분석(갈래·세부영역·제재·주제·키워드·난이도·개념…)과 함께
 * 다차원 필터로 탐색한다. 영어 기출 지문 라이브러리(exam-passage-library)의
 * 국어 대칭 기능. 데이터는 정적 번들(src/data/exam-passages-korean).
 */
export default async function KoreanPassageLibraryPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-white">
      <div className="shrink-0 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BookOpenText className="size-5" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900">
              국어 기출 지문
            </h1>
            <p className="text-[12px] text-slate-500">
              수능·평가원·교육청 국어 기출 지문을 심층 분석과 함께 탐색합니다.
            </p>
          </div>
        </div>
      </div>
      <KoreanExamTabs />
      <div className="min-h-0 flex-1">
        <KoreanExamPassageLibrary />
      </div>
    </div>
  );
}
