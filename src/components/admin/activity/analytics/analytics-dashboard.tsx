"use client";

// ============================================================================
// 분석 대시보드 — /admin/activity "분석" 탭의 클라이언트 오케스트레이터.
// 상단: 기간 선택 + KPI(공통). 구역 선택(개요 / 기능 / 성장 / 학원별)은 필터 칩 —
// 페이지 탭은 한 줄뿐이라 두 번째 탭 줄을 두지 않는다. 상태는 부모가 ?section= 에 보존.
// 큰 차트는 확대 팝업, 학원 행 클릭은 심층 드릴다운 팝업.
// 자동 폴링 없음(egress 원칙) — 수동 새로고침.
// ============================================================================

import { useState, useTransition } from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterChipGroup } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import { getActivityAnalytics } from "@/actions/admin-activity/get-activity-analytics";
import {
  ANALYTICS_RANGE_OPTIONS,
  type ActivityAnalyticsPayload,
} from "@/lib/admin-analytics-types";
import { ANALYTICS_SECTIONS, type AnalyticsSectionKey } from "../activity-tabs-config";
import { AnalyticsSection } from "./section-card";
import { KpiCards } from "./kpi-cards";
import { DailyTrendChart } from "./daily-trend-chart";
import { CategoryTrendChart } from "./category-trend-chart";
import { ActivationCohortChart } from "./activation-cohort-chart";
import { StreakDistribution } from "./streak-distribution";
import { EngagementTable } from "./engagement-table";
import { FeatureDailyTrend } from "./feature-daily-trend";
import { FeatureAdoptionChart } from "./feature-adoption";
import { FeatureOutcomes } from "./feature-outcomes";
import { HourWeekdayHeatmap } from "./hour-weekday-heatmap";
import { SignupsTrend } from "./signups-trend";
import { DistributionDonuts } from "./distribution-donuts";
import { ActivationFunnel } from "./activation-funnel";
import { AcademyLeaderboard } from "./academy-leaderboard";
import { AcademyDetailModal } from "./academy-detail-modal";

interface AnalyticsDashboardProps {
  initial: ActivityAnalyticsPayload;
  section: AnalyticsSectionKey;
  onSectionChange: (key: AnalyticsSectionKey) => void;
}

export function AnalyticsDashboard({ initial, section, onSectionChange }: AnalyticsDashboardProps) {
  const [payload, setPayload] = useState<ActivityAnalyticsPayload>(initial);
  const [range, setRange] = useState<number>(initial.rangeDays);
  const [isPending, startTransition] = useTransition();
  const [selectedAcademy, setSelectedAcademy] = useState<string | null>(null);

  function load(nextRange: number) {
    setRange(nextRange);
    startTransition(async () => {
      const next = await getActivityAnalytics(nextRange);
      setPayload(next);
    });
  }

  return (
    <div
      aria-busy={isPending}
      className={cn("space-y-4", isPending && "opacity-60 transition-opacity")}
    >
      {/* 컨트롤 바 — 기간은 분석에만 적용되므로 페이지 머리가 아니라 여기 둔다 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-gray-400">
          기준일{" "}
          <span className="font-medium tabular-nums text-gray-600">{payload.todayKst}</span> ·
          한국시간(KST)
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(range)}
            onValueChange={(v) => load(Number(v))}
            disabled={isPending}
          >
            <SelectTrigger className="h-8 min-w-[120px] text-[12px]" aria-label="분석 기간">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYTICS_RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)} className="text-[12px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(range)}
            disabled={isPending}
            aria-label="새로고침"
          >
            <RefreshCw
              className={cn("size-4", isPending && "animate-spin")}
              strokeWidth={2}
              aria-hidden
            />
            새로고침
          </Button>
        </div>
      </div>

      <KpiCards kpis={payload.kpis} engagement={payload.engagement} />

      <FilterChipGroup
        options={ANALYTICS_SECTIONS}
        value={section}
        onChange={onSectionChange}
        ariaLabel="분석 구역"
      />

      {/* ── 개요 ── */}
      {section === "overview" && (
        <div className="space-y-4">
          <AnalyticsSection
            title="일별 활동 추이"
            description="날짜별 활동 학원 수와 총 활동 건수"
            expand={<DailyTrendChart data={payload.daily} height={460} />}
          >
            <DailyTrendChart data={payload.daily} />
          </AnalyticsSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnalyticsSection
              title="카테고리 구성 추이"
              description="추출·AI 생성·콘텐츠·내보내기·페이지 이동·로그인 비중"
              expand={<CategoryTrendChart data={payload.daily} height={460} />}
            >
              <CategoryTrendChart data={payload.daily} />
            </AnalyticsSection>
            <AnalyticsSection
              title="가입 → 활성화 코호트"
              description="주별 신규 가입 학원과 활성화 전환율 (가입만 줄어드는 변곡점 확인)"
              expand={<ActivationCohortChart cohorts={payload.cohorts} height={460} />}
            >
              <ActivationCohortChart cohorts={payload.cohorts} />
            </AnalyticsSection>
          </div>

          <AnalyticsSection
            title="연속 활동일 · 인게이지먼트 세그먼트"
            description="현재 연속 출석일 분포와 파워/꾸준/라이트/휴면/가입만 구성"
          >
            <StreakDistribution
              streakBuckets={payload.streakBuckets}
              segments={payload.segments}
            />
          </AnalyticsSection>
        </div>
      )}

      {/* ── 기능 분석 ── */}
      {section === "features" && (
        <div className="space-y-4">
          <AnalyticsSection
            title="세부 기능별 일별 추이"
            description="자료 추출·문제/학습지/동형/커스텀 생성·시험지·내보내기·로그인 등 (범례 클릭으로 토글)"
            expand={<FeatureDailyTrend data={payload.featureDaily} height={480} />}
          >
            <FeatureDailyTrend data={payload.featureDaily} />
          </AnalyticsSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnalyticsSection
              title="기능 채택률"
              description="기능별 1회 이상 사용 학원 수와 누적 실행 건수"
            >
              <FeatureAdoptionChart data={payload.featureAdoption} />
            </AnalyticsSection>
            <AnalyticsSection
              title="작업 성공/실패율"
              description="AI 작업(추출·생성) 기능별 성공·실패 비율"
            >
              <FeatureOutcomes data={payload.featureOutcomes} />
            </AnalyticsSection>
          </div>

          <AnalyticsSection
            title="시간대 × 요일 활동 히트맵"
            description="언제 가장 활발한가 (KST)"
          >
            <HourWeekdayHeatmap data={payload.hourWeekday} />
          </AnalyticsSection>
        </div>
      )}

      {/* ── 가입·성장 ── */}
      {section === "growth" && (
        <div className="space-y-4">
          <AnalyticsSection
            title="일별 신규 가입 추이"
            description="신규 가입 학원과 누적 학원 수"
            expand={<SignupsTrend data={payload.signupsDaily} height={460} />}
          >
            <SignupsTrend data={payload.signupsDaily} />
          </AnalyticsSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnalyticsSection title="플랜·상태 분포" description="요금제 등급과 학원 상태 구성">
              <DistributionDonuts
                plan={payload.planDistribution}
                status={payload.statusDistribution}
              />
            </AnalyticsSection>
            <AnalyticsSection
              title="활성화 퍼널"
              description="가입 → 활성화 → 반복 사용 → 파워 유저 전환"
            >
              <ActivationFunnel stages={payload.funnel} />
            </AnalyticsSection>
          </div>
        </div>
      )}

      {/* ── 학원별 ── */}
      {section === "academies" && (
        <div className="space-y-4">
          <AnalyticsSection
            title="Top 학원"
            description="활동량·연속일 상위 학원 (행 클릭 시 심층 보기)"
            padded={false}
          >
            <AcademyLeaderboard rows={payload.engagement} onSelect={setSelectedAcademy} />
          </AnalyticsSection>

          <AnalyticsSection
            title="학원별 인게이지먼트"
            description="각 학원이 얼마나 꾸준히 쓰는지 — 정렬·검색·최근 14일 추세 (행 클릭 시 심층 보기)"
            padded={false}
          >
            <EngagementTable
              rows={payload.engagement}
              todayKst={payload.todayKst}
              onSelectAcademy={setSelectedAcademy}
            />
          </AnalyticsSection>
        </div>
      )}

      {payload.dataNotes.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-gray-50 px-4 py-3">
          <Info className="mt-0.5 size-3.5 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
          <ul className="space-y-0.5">
            {payload.dataNotes.map((note, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-gray-400">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AcademyDetailModal academyId={selectedAcademy} onClose={() => setSelectedAcademy(null)} />
    </div>
  );
}
