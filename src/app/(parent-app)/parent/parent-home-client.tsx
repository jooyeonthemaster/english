"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Award,
  ClipboardCheck,
  Calendar,
  Bell,
  ChevronRight,
} from "lucide-react";
import { cn, formatPercent, formatKoreanDate } from "@/lib/utils";
import type { ParentDashboardData } from "@/actions/parent";

function ChildSwitcher({
  children,
  selectedId,
  onSelect,
}: {
  children: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (children.length <= 1) return null;

  return (
    <div className="flex gap-2 px-1 py-1 bg-gray-100 rounded-xl" role="tablist" aria-label="자녀 선택">
      {children.map((child) => (
        <button
          key={child.id}
          onClick={() => onSelect(child.id)}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px]",
            selectedId === child.id
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
          role="tab"
          aria-selected={selectedId === child.id}
          aria-controls={`child-panel-${child.id}`}
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  color: string;
  bgColor: string;
  href?: string;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  bgColor,
  href,
}: SummaryCardProps) {
  const content = (
    <div
      className={cn(
        "rounded-2xl p-4 min-h-[100px] flex flex-col justify-between transition-transform active:scale-[0.98]",
        bgColor
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg",
            color === "text-blue-600" && "bg-blue-100",
            color === "text-emerald-600" && "bg-emerald-100",
            color === "text-amber-600" && "bg-amber-100",
            color === "text-purple-600" && "bg-purple-100"
          )}
        >
          <Icon className={cn("size-4", color)} />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight", color)}>
          {value}
        </p>
        {subtext && (
          <p className="text-[11px] text-gray-400 mt-0.5">{subtext}</p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

export function ParentHomeClient({ data }: { data: ParentDashboardData }) {
  const [selectedChildId, setSelectedChildId] = useState(
    data.children[0]?.id || ""
  );

  const selectedChild = data.children.find((c) => c.id === selectedChildId);
  const dashboard = data.childDashboards[selectedChildId];

  if (!selectedChild || !dashboard) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="text-center">
          <p className="text-gray-500 text-sm">
            등록된 자녀 정보가 없습니다.
          </p>
          <p className="text-gray-400 text-xs mt-1">학원에 문의하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4 space-y-6">
      {/* Child Switcher */}
      <ChildSwitcher
        children={data.children.map((c) => ({ id: c.id, name: c.name }))}
        selectedId={selectedChildId}
        onSelect={setSelectedChildId}
      />

      {/* Welcome */}
      <div
        id={`child-panel-${selectedChildId}`}
        role="tabpanel"
        aria-label={`${selectedChild.name} 대시보드`}
      >
        <h1 className="text-xl font-bold text-gray-900">
          {data.parentName} 학부모님, 안녕하세요
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {selectedChild.name}
          {selectedChild.schoolName && ` | ${selectedChild.schoolName}`}
          {` | ${selectedChild.grade}학년`}
        </p>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={CalendarCheck}
          label="출석률"
          value={formatPercent(dashboard.attendanceRate)}
          subtext={`${dashboard.attendancePresent}/${dashboard.attendanceTotal}일`}
          color="text-blue-600"
          bgColor="bg-blue-50/70"
        />
        <SummaryCard
          icon={Award}
          label="평균 점수"
          value={dashboard.averageScore > 0 ? `${dashboard.averageScore}점` : "-"}
          color="text-emerald-600"
          bgColor="bg-emerald-50/70"
          href="/parent/grades"
        />
        <SummaryCard
          icon={ClipboardCheck}
          label="과제 완료"
          value={formatPercent(dashboard.assignmentRate)}
          subtext={`${dashboard.assignmentDone}/${dashboard.assignmentTotal}건`}
          color="text-amber-600"
          bgColor="bg-amber-50/70"
        />
        <SummaryCard
          icon={Calendar}
          label="다음 시험"
          value={
            dashboard.nextExamDate
              ? formatKoreanDate(dashboard.nextExamDate)
              : "예정 없음"
          }
          subtext={dashboard.nextExamTitle || undefined}
          color="text-purple-600"
          bgColor="bg-purple-50/70"
        />
      </div>

      {/* Recent Notices */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">최근 알림</h2>
          <Link
            href="/parent/messages"
            className="text-xs text-blue-500 font-medium flex items-center gap-0.5 min-h-[44px] min-w-[44px] justify-end"
          >
            전체보기 <ChevronRight className="size-3.5" />
          </Link>
        </div>
        {dashboard.recentNotices.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            새로운 알림이 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {dashboard.recentNotices.map((notice) => (
              <Link
                key={notice.id}
                href="/parent/messages"
                className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors min-h-[48px]"
              >
                <div
                  className={cn(
                    "flex-shrink-0 w-2 h-2 rounded-full",
                    notice.isRead ? "bg-gray-300" : "bg-blue-500"
                  )}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {notice.title}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatKoreanDate(notice.publishAt)}
                  </p>
                </div>
                {!notice.isRead && (
                  <Bell className="size-4 text-blue-500 flex-shrink-0" />
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Weekly Summary */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          이번 달 요약
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          {dashboard.weeklySummary}
        </p>
      </section>
    </div>
  );
}
