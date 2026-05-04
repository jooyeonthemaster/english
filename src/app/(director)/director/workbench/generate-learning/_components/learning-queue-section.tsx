"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LEARNING_SUBTYPE_LABELS } from "@/lib/learning-constants";
import { GRADE_LEVELS } from "@/lib/learning-constants";
import type { QueueItem } from "./generate-learning-client";

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  VOCAB: "📗 어휘",
  INTERPRETATION: "📘 해석",
  GRAMMAR: "📙 문법",
  COMPREHENSION: "📕 독해",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  queue: QueueItem[];
  queueFilter: string;
  setQueueFilter: (f: "all" | "done" | "error") => void;
  queueCounts: { generating: number; done: number; error: number };
  showSaveModal: string | null;
  setShowSaveModal: (id: string | null) => void;
  saving: boolean;
  onSave: (
    item: QueueItem,
    info: {
      publisher: string;
      textbook?: string;
      grade?: number;
      unit?: string;
    }
  ) => void;
  onRemove: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LearningQueueSection({
  queue,
  queueFilter,
  setQueueFilter,
  queueCounts,
  showSaveModal,
  setShowSaveModal,
  saving,
  onSave,
  onRemove,
}: Props) {
  const total = queueCounts.generating + queueCounts.done + queueCounts.error;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F5F7]">
      <div className="max-w-7xl mx-auto px-8 py-5">
        {/* 헤더 + 필터 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-800">
            생성 큐{" "}
            <span className="text-slate-400 font-normal">{total}개</span>
          </h2>
          <div className="flex gap-1">
            {(
              [
                { key: "all", label: "전체" },
                { key: "done", label: "완료" },
                { key: "error", label: "오류" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setQueueFilter(f.key)}
                className={cn(
                  "text-[11px] px-3 py-1.5 rounded-full font-medium transition-all",
                  queueFilter === f.key
                    ? "bg-blue-100 text-blue-700"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 큐 아이템 */}
        {queue.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[13px] text-slate-400">
              지문을 선택하고 생성 버튼을 눌러주세요
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {queue.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                showSaveModal={showSaveModal === item.id}
                onOpenSave={() => setShowSaveModal(item.id)}
                onCloseSave={() => setShowSaveModal(null)}
                saving={saving}
                onSave={onSave}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue Card
// ---------------------------------------------------------------------------
function QueueCard({
  item,
  showSaveModal,
  onOpenSave,
  onCloseSave,
  saving,
  onSave,
  onRemove,
}: {
  item: QueueItem;
  showSaveModal: boolean;
  onOpenSave: () => void;
  onCloseSave: () => void;
  saving: boolean;
  onSave: (
    item: QueueItem,
    info: {
      publisher: string;
      textbook?: string;
      grade?: number;
      unit?: string;
    }
  ) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 서브타입별 그룹핑
  const bySubType: Record<string, number> = {};
  for (const q of item.questions) {
    bySubType[q._typeId] = (bySubType[q._typeId] || 0) + 1;
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl border transition-all",
        item.status === "generating" && "border-blue-200 animate-pulse",
        item.status === "done" && "border-slate-200",
        item.status === "error" && "border-red-200"
      )}
    >
      {/* 카드 헤더 */}
      <div className="px-4 py-3 flex items-center gap-3">
        {item.status === "generating" && (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
        )}
        {item.status === "done" && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        )}
        {item.status === "error" && (
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate">
            {item.passageTitle}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-slate-500">
              {CATEGORY_LABELS[item.category] || item.category}
            </span>
            {item.status === "done" && (
              <span className="text-[11px] text-emerald-600 font-medium">
                {item.questions.length}문제
              </span>
            )}
            {item.status === "error" && (
              <span className="text-[11px] text-red-500">
                {item.error || "생성 실패"}
              </span>
            )}
          </div>
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-1 shrink-0">
          {item.status === "done" && (
            <>
              <button
                onClick={onOpenSave}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                title="저장"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 프로그레스 바 (생성 중) */}
      {item.status === "generating" && (
        <div className="px-4 pb-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/2" />
          </div>
        </div>
      )}

      {/* 서브타입 미리보기 (완료 + 접기 열림) */}
      {item.status === "done" && expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-2">
          <div className="space-y-1">
            {Object.entries(bySubType).map(([subType, count]) => (
              <div
                key={subType}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="text-slate-500">
                  {LEARNING_SUBTYPE_LABELS[subType] || subType}
                </span>
                <span className="text-slate-700 font-medium">{count}개</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 저장 모달 */}
      {showSaveModal && (
        <SaveModal
          item={item}
          onClose={onCloseSave}
          saving={saving}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save Modal (인라인)
// ---------------------------------------------------------------------------
function SaveModal({
  item,
  onClose,
  saving,
  onSave,
}: {
  item: QueueItem;
  onClose: () => void;
  saving: boolean;
  onSave: (
    item: QueueItem,
    info: {
      publisher: string;
      textbook?: string;
      grade?: number;
      unit?: string;
    }
  ) => void;
}) {
  const [publisher, setPublisher] = useState("");
  const [textbook, setTextbook] = useState("");
  const [grade, setGrade] = useState<number | undefined>();
  const [unit, setUnit] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-[15px] font-bold text-slate-900">
            학습 문제 저장
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-xl">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="text-[12px] font-semibold text-slate-700 mb-1 block">
              출판사 <span className="text-red-400">*</span>
            </label>
            <input
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="예: 능률(김)"
              className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 mb-1 block">
                교과서
              </label>
              <input
                value={textbook}
                onChange={(e) => setTextbook(e.target.value)}
                placeholder="High School English"
                className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-slate-700 mb-1 block">
                학년
              </label>
              <select
                value={grade ?? ""}
                onChange={(e) =>
                  setGrade(e.target.value ? Number(e.target.value) : undefined)
                }
                className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">선택</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-slate-700 mb-1 block">
              단원
            </label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Lesson 3"
              className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>
          <button
            onClick={() =>
              onSave(item, {
                publisher,
                textbook: textbook || undefined,
                grade,
                unit: unit || undefined,
              })
            }
            disabled={!publisher.trim() || saving}
            className="w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving
              ? "저장 중..."
              : `${item.questions.length}개 문제 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}
