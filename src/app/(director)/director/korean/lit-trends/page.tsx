import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChartNoAxesCombined } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { KoreanExamTabs } from "@/components/workbench/korean-exam-tabs";
import { KoreanLitTrendsDashboard } from "@/components/workbench/korean-lit-trends";
import type { LitTrends } from "@/components/workbench/korean-lit-trends/types";
import trendsJson from "@/data/exam-passages-korean/lit-trends.json";

export const metadata: Metadata = { title: "문학 출제 트렌드 분석" };

/**
 * 문학 출제 트렌드 분석 — 수능·평가원·교육청 기출 문학 546지문의 출전·구성·
 * 편집 장치를 역산한 인터랙티브 대시보드. 체제 변천 → 4세트 매트릭스 → 작품
 * 선정 → 발췌 문법 → 갈래복합 공식 → 재출제 법칙 → <보기> 층위의 서사로
 * 이어지며, 모든 데이터 포인트는 실지문(원문+분석+문항)으로 클릭 연결된다.
 * 데이터: src/data/exam-passages-korean/lit-trends.json (사전 집계 번들).
 */
export default async function KoreanLitTrendsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const trends = trendsJson as unknown as LitTrends;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-white">
      <div className="shrink-0 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ChartNoAxesCombined className="size-5" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900">
              문학 출제 트렌드 분석
            </h1>
            <p className="text-[12px] text-slate-500">
              기출 문학 지문 전수에서 역산한 작품 선정·발췌 경향을 실지문과
              함께 탐색합니다.
            </p>
          </div>
        </div>
      </div>
      <KoreanExamTabs />
      <KoreanLitTrendsDashboard trends={trends} />
    </div>
  );
}
