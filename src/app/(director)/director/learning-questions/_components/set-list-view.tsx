"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Database,
  Sparkles,
  Calendar,
  BookOpen,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  School,
  Hash,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type SetItem,
} from "./question-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  setsData: {
    sets: SetItem[];
    publishers: string[];
    schools?: { id: string; name: string }[];
    grades?: number[];
  };
  filters: Record<string, string | undefined>;
  onSelectSet: (id: string) => void;
  onUpdateParam: (key: string, value: string) => void;
  onOpenSeasonModal: () => void;
}

type ViewMode = "publisher" | "school" | "grade";

const VIEW_TABS: { key: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { key: "publisher", label: "출판사별", icon: BookOpen },
  { key: "school", label: "학교별", icon: School },
  { key: "grade", label: "학년별", icon: Hash },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SetListView({
  setsData,
  filters,
  onSelectSet,
  onUpdateParam,
  onOpenSeasonModal,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("publisher");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const totalQuestions = setsData.sets.reduce(
    (sum, s) => sum + s._count.questions,
    0
  );

  // 뷰 모드에 따른 그룹핑
  const grouped = useMemo(() => {
    const groups: Record<string, SetItem[]> = {};
    for (const set of setsData.sets) {
      let key: string;
      switch (viewMode) {
        case "school":
          key = set.passage.school?.name || "미지정";
          break;
        case "grade":
          key = set.passage.grade ? `${set.passage.grade}학년` : "미지정";
          break;
        default:
          key = set.publisher || "미분류";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(set);
    }
    return groups;
  }, [setsData.sets, viewMode]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            학습 문제 은행
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {setsData.sets.length}개 세트 · {totalQuestions.toLocaleString()}개
            문제
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSeasonModal}
            className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" /> 내신 시즌 생성
          </button>
          <Link href="/director/workbench/generate-learning">
            <button className="h-8 px-3 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> 학습 문제 생성
            </button>
          </Link>
        </div>
      </div>

      {/* 뷰 모드 탭 + 필터 */}
      <div className="bg-white rounded-lg border p-3 space-y-2.5">
        {/* 뷰 모드 */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-fit">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setViewMode(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all",
                  viewMode === tab.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 출판사 필터 (출판사별 뷰일 때만) */}
        {viewMode === "publisher" && setsData.publishers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            <button
              onClick={() => onUpdateParam("publisher", "")}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all",
                !filters.publisher
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              전체
            </button>
            {setsData.publishers.map((p) => (
              <button
                key={p}
                onClick={() =>
                  onUpdateParam(
                    "publisher",
                    filters.publisher === p ? "" : p
                  )
                }
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all",
                  filters.publisher === p
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 세트 목록 */}
      {setsData.sets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            학습 문제 세트가 없습니다.
          </p>
          <Link
            href="/director/workbench/generate-learning"
            className="text-[13px] text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block"
          >
            학습 문제 생성하기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([groupName, sets]) => {
            const isCollapsed = collapsedGroups.has(groupName);
            const groupQuestions = sets.reduce(
              (s, set) => s + set._count.questions,
              0
            );
            return (
              <div key={groupName}>
                {/* 그룹 헤더 — 카드형 */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 hover:border-slate-300 mb-2 transition-all"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                  <FolderOpen className="w-4 h-4 text-blue-400" />
                  <span className="text-[13px] font-semibold text-slate-800">
                    {groupName}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {sets.length}개 세트 · {groupQuestions.toLocaleString()}문제
                  </span>
                </button>

                {/* 세트 카드 — 2열 그리드 */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 ml-5">
                    {sets.map((set) => (
                      <SetCard
                        key={set.id}
                        set={set}
                        onClick={() => onSelectSet(set.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set Card — 박스형 + 지문 접이식
// ---------------------------------------------------------------------------
function SetCard({ set, onClick }: { set: SetItem; onClick: () => void }) {
  const [passageOpen, setPassageOpen] = useState(false);
  const total = set._count.questions;
  const perCat = Math.round(total / 4);

  return (
    <div className="bg-white rounded-lg border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group">
      {/* 상단: 제목 + 메타 + 화살표 */}
      <div
        className="flex items-start justify-between mb-2 cursor-pointer"
        onClick={onClick}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 line-clamp-2 leading-snug">
            {set.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
              {set.publisher}
            </span>
            {set.passage.grade && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {set.passage.grade}학년
              </span>
            )}
            {set.passage.school?.name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {set.passage.school.name}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5" />
      </div>

      {/* 지문 미리보기 (접이식) */}
      {set.passage.content && (
        <div className="bg-slate-50 rounded-md px-3 py-2 mb-2">
          <button
            className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium w-full text-left"
            onClick={(e) => {
              e.stopPropagation();
              setPassageOpen(!passageOpen);
            }}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{set.passage.title}</span>
            {passageOpen ? (
              <ChevronUp className="w-3 h-3 ml-auto shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
            )}
          </button>
          <p
            className={cn(
              "text-[11px] text-slate-500 font-mono leading-relaxed mt-1.5",
              passageOpen ? "" : "line-clamp-3"
            )}
          >
            {set.passage.content}
          </p>
        </div>
      )}

      {/* 카테고리별 분포 */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {(["VOCAB", "INTERPRETATION", "GRAMMAR", "COMPREHENSION"] as const).map(
          (cat) => {
            const colors = CATEGORY_COLORS[cat];
            return (
              <div
                key={cat}
                className="text-center py-1 rounded bg-slate-50"
              >
                <p className="text-[10px] text-slate-400">
                  {CATEGORY_LABELS[cat]}
                </p>
                <p
                  className={cn(
                    "text-[11px] font-bold",
                    colors?.badge?.split(" ")[1] || "text-slate-600"
                  )}
                >
                  {perCat}
                </p>
              </div>
            );
          }
        )}
      </div>

      {/* 하단: 총 문제 수 + 카테고리 바 */}
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
          {(
            ["VOCAB", "INTERPRETATION", "GRAMMAR", "COMPREHENSION"] as const
          ).map((cat) => (
            <div
              key={cat}
              className={cn(
                "h-full",
                CATEGORY_COLORS[cat]?.accent ?? "bg-slate-300"
              )}
              style={{ width: "25%" }}
            />
          ))}
        </div>
        <span className="text-[11px] font-bold text-slate-500 shrink-0">
          {total}문제
        </span>
      </div>
    </div>
  );
}
