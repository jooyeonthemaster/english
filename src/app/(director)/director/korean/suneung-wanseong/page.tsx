import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { KoreanExamTabs } from "@/components/workbench/korean-exam-tabs";
import { SuneungWanseongLibrary } from "@/components/workbench/suneung-wanseong";

export const metadata: Metadata = { title: "수능완성 지문 분석" };

/**
 * 2027 수능완성 독서 지문 분석 — 수능완성 실전 모의고사 1~5회 독서 지문 18개를
 * 기출 지문과 동일한 스키마로 심층 분석하고, 국어 기출 독서 지문 코퍼스에서
 * 주제·제재·핵심개념이 연결되는 기출을 근거와 함께 모아 보여 준다.
 */
export default async function SuneungWanseongPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-white">
      <div className="shrink-0 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Link2 className="size-5" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900">
              수능완성 지문 분석
            </h1>
            <p className="text-[12px] text-slate-500">
              2027 수능완성 독서 지문을 심층 분석하고, 관련 기출 지문을 연결 근거와
              함께 모아 봅니다.
            </p>
          </div>
        </div>
      </div>
      <KoreanExamTabs />
      <div className="min-h-0 flex-1">
        <SuneungWanseongLibrary />
      </div>
    </div>
  );
}
