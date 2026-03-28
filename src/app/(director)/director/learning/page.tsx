"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Calendar,
  BookOpen,
  Users,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSeasons,
  createSeason,
  updateSeason,
  getSeasonStudentProgress,
  getAvailablePassages,
} from "@/actions/learning-admin";
import { SEASON_TYPES, GRADE_LEVELS } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Season {
  id: string;
  name: string;
  type: string;
  grade: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  passageCount: number;
  passages: { id: string; title: string; order: number }[];
  totalSessions: number;
  createdAt: string;
}

interface StudentProgress {
  studentId: string;
  name: string;
  grade: number;
  completedLessons: number;
  totalLessons: number;
  masteryScore: number;
  progressPercent: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LearningAdminPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [studentProgress, setStudentProgress] = useState<Map<string, StudentProgress[]>>(
    new Map()
  );

  useEffect(() => {
    loadSeasons();
  }, []);

  async function loadSeasons() {
    try {
      const data = await getSeasons();
      setSeasons(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(seasonId: string, currentActive: boolean) {
    await updateSeason(seasonId, { isActive: !currentActive });
    loadSeasons();
  }

  async function handleExpand(seasonId: string) {
    if (expandedSeason === seasonId) {
      setExpandedSeason(null);
      return;
    }
    setExpandedSeason(seasonId);
    if (!studentProgress.has(seasonId)) {
      try {
        const progress = await getSeasonStudentProgress(seasonId);
        setStudentProgress((prev) => new Map(prev).set(seasonId, progress));
      } catch (err) {
        console.error(err);
      }
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학습 시즌 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            내신 대비 기간과 평상시 학습을 설정합니다
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus className="size-4" />
          새 시즌
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <CreateSeasonForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadSeasons();
          }}
        />
      )}

      {/* Season List */}
      <div className="space-y-3">
        {seasons.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="size-12 mx-auto mb-3 text-gray-300" />
            <p>아직 생성된 시즌이 없습니다</p>
          </div>
        ) : (
          seasons.map((season) => (
            <SeasonCard
              key={season.id}
              season={season}
              expanded={expandedSeason === season.id}
              progress={studentProgress.get(season.id)}
              onExpand={() => handleExpand(season.id)}
              onToggleActive={() => handleToggleActive(season.id, season.isActive)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season Card
// ---------------------------------------------------------------------------

function SeasonCard({
  season,
  expanded,
  progress,
  onExpand,
  onToggleActive,
}: {
  season: Season;
  expanded: boolean;
  progress?: StudentProgress[];
  onExpand: () => void;
  onToggleActive: () => void;
}) {
  const now = new Date();
  const start = new Date(season.startDate);
  const end = new Date(season.endDate);
  const isOngoing = now >= start && now <= end;
  const isPast = now > end;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        season.isActive && isOngoing
          ? "border-blue-200 bg-blue-50/30"
          : "border-gray-200 bg-white"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onExpand}>
        <div
          className={cn(
            "w-2 h-10 rounded-full",
            season.type === "EXAM_PREP" ? "bg-rose-400" : "bg-emerald-400"
          )}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{season.name}</h3>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                season.type === "EXAM_PREP"
                  ? "bg-rose-100 text-rose-600"
                  : "bg-emerald-100 text-emerald-600"
              )}
            >
              {season.type === "EXAM_PREP" ? "내신 집중" : "평상시"}
            </span>
            {isPast && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                종료
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {start.toLocaleDateString("ko-KR")} ~ {end.toLocaleDateString("ko-KR")}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              지문 {season.passageCount}개
            </span>
            {season.grade && (
              <span>
                {GRADE_LEVELS.find((g) => g.value === season.grade)?.label ?? `${season.grade}학년`}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className="p-1"
        >
          {season.isActive ? (
            <ToggleRight className="size-6 text-blue-500" />
          ) : (
            <ToggleLeft className="size-6 text-gray-300" />
          )}
        </button>
        <ChevronDown
          className={cn(
            "size-4 text-gray-400 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4">
          {/* Passages */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">배정된 지문</p>
            <div className="space-y-1">
              {season.passages.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                  {p.title}
                </div>
              ))}
            </div>
          </div>

          {/* Student Progress */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              <Users className="size-3 inline mr-1" />
              학생 진도
            </p>
            {!progress ? (
              <p className="text-xs text-gray-400">불러오는 중...</p>
            ) : progress.length === 0 ? (
              <p className="text-xs text-gray-400">해당 학년 학생이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {progress.map((sp) => (
                  <div
                    key={sp.studentId}
                    className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm font-medium text-gray-700 w-20 truncate">
                      {sp.name}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          sp.progressPercent >= 80
                            ? "bg-emerald-500"
                            : sp.progressPercent >= 40
                              ? "bg-blue-500"
                              : "bg-amber-500"
                        )}
                        style={{ width: `${sp.progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-500 w-16 text-right">
                      {sp.completedLessons}/{sp.totalLessons} 레슨
                    </span>
                    <span className="text-xs font-medium text-gray-400 w-10 text-right">
                      {sp.masteryScore}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Season Form
// ---------------------------------------------------------------------------

function CreateSeasonForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"EXAM_PREP" | "REGULAR">("EXAM_PREP");
  const [grade, setGrade] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [passages, setPassages] = useState<{ id: string; title: string }[]>([]);
  const [availablePassages, setAvailablePassages] = useState<
    { id: string; title: string; questionCount: number }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await getAvailablePassages(grade ?? undefined);
      setAvailablePassages(data);
    }
    load();
  }, [grade]);

  async function handleSubmit() {
    if (!name || !startDate || !endDate || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      await createSeason({
        name,
        type,
        grade,
        startDate,
        endDate,
        passageIds: Array.from(selectedIds),
      });
      onCreated();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mb-6 bg-white border border-gray-200 rounded-xl p-5"
    >
      <h3 className="text-sm font-bold mb-4">새 시즌 생성</h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">시즌 이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="1학기 중간고사 대비"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">유형</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "EXAM_PREP" | "REGULAR")}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {SEASON_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">대상 학년</label>
          <select
            value={grade ?? ""}
            onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label className="text-xs text-gray-500 block mb-1">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Passage selection */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 block mb-2">
          지문 선택 ({selectedIds.size}개)
        </label>
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
          {availablePassages.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={(e) => {
                  const next = new Set(selectedIds);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  setSelectedIds(next);
                }}
                className="rounded"
              />
              <span className="text-sm text-gray-700 flex-1">{p.title}</span>
              <span className="text-xs text-gray-400">{p.questionCount}문제</span>
            </label>
          ))}
          {availablePassages.length === 0 && (
            <p className="text-xs text-gray-400 p-3">등록된 지문이 없습니다</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !name || !startDate || !endDate || selectedIds.size === 0}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-600"
        >
          {submitting ? "생성 중..." : "시즌 생성"}
        </button>
      </div>
    </motion.div>
  );
}
