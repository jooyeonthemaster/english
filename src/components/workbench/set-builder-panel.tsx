"use client";

// ============================================================================
// 장문 세트 builder — dedicated composition UI
// ============================================================================
// You can only ever build a VALID set: the "문항 추가" menu enables exactly the
// types that are addable given the current composition, and greys out the rest
// with a one-line reason. The structural mode (글의 순서 / 문장 삽입) is INFERRED
// from the members — never picked separately. No raw validation errors.
// ============================================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, Lock, Plus, X } from "lucide-react";

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import {
  deriveStructuralMode,
  getAddability,
  isSetLocked,
  STRUCTURAL_BASE_TYPES,
} from "@/lib/question-sets/composition-ui";
import { getQuestionSet, type QuestionSetForRender } from "@/actions/question-sets";
import { QuestionSetCard } from "./question-set-card";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

interface SetItem {
  uid: string;
  typeId: string;
  difficulty: Difficulty;
}

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "BASIC", label: "기본" },
  { value: "INTERMEDIATE", label: "중급" },
  { value: "KILLER", label: "킬러" },
];

// Curated catalog for the set builder, grouped by role.
const SET_CATALOG: { group: string; hint: string; typeIds: string[] }[] = [
  {
    group: "구조 · 기준 지문",
    hint: "이 유형이 세트의 지문 형태를 정합니다",
    typeIds: ["SENTENCE_ORDER", "SENTENCE_INSERT"],
  },
  {
    group: "밑줄형",
    hint: "지문 위 밑줄을 공유합니다 (자유 조합)",
    typeIds: ["REFERENCE", "IMPLIED_MEANING", "CONTEXT_MEANING", "SYNONYM"],
  },
  {
    group: "지문 이해",
    hint: "지문을 그대로 읽고 푸는 유형",
    typeIds: ["TOPIC", "MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"],
  },
  {
    group: "단독 출제 전용",
    hint: "지문 표시를 독점해 묶을 수 없는 유형",
    typeIds: ["BLANK_INFERENCE", "GRAMMAR_ERROR", "VOCAB_CHOICE", "ANTONYM", "FILL_BLANK_KEY", "IRRELEVANT"],
  },
];

function typeLabel(typeId: string): string {
  return QUESTION_TYPE_UI[typeId]?.label ?? typeId;
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `m${uidCounter}`;
}

export function SetBuilderPanel({
  passageId,
  generationPlan = "STANDARD",
}: {
  passageId: string | null;
  generationPlan?: string;
}) {
  const [items, setItems] = useState<SetItem[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<QuestionSetForRender | null>(null);

  const memberTypeIds = useMemo(() => items.map((i) => i.typeId), [items]);
  const locked = isSetLocked(memberTypeIds);
  const structuralMode = deriveStructuralMode(memberTypeIds);

  const contextHint = useMemo(() => {
    if (items.length === 0) {
      return "지문 위에 함께 출제할 문항을 추가하세요. 구조 유형(글의 순서·문장 삽입)을 넣으면 그 지문이 세트의 기준이 됩니다.";
    }
    if (structuralMode !== "NONE") {
      const s = items.find((i) => STRUCTURAL_BASE_TYPES.has(i.typeId));
      return `${typeLabel(s?.typeId ?? "")} 지문을 기준으로 다른 문항을 묶습니다. 밑줄형·지문 이해 유형을 더할 수 있어요.`;
    }
    if (locked) {
      return `${typeLabel(items[0].typeId)}은(는) 단독 출제 유형입니다.`;
    }
    return "밑줄형·지문 이해 유형을 자유롭게 조합할 수 있고, 구조 유형을 하나 더할 수 있습니다.";
  }, [items, structuralMode, locked]);

  const addItem = (typeId: string) => {
    setItems((prev) => [
      ...prev,
      { uid: nextUid(), typeId, difficulty: "INTERMEDIATE" },
    ]);
    setShowAddMenu(false);
  };
  const removeItem = (uid: string) =>
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  const updateDifficulty = (uid: string, difficulty: Difficulty) =>
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, difficulty } : i)));

  const applyPreset4345 = () => {
    setItems([
      { uid: nextUid(), typeId: "SENTENCE_ORDER", difficulty: "INTERMEDIATE" },
      { uid: nextUid(), typeId: "REFERENCE", difficulty: "INTERMEDIATE" },
      { uid: nextUid(), typeId: "CONTENT_MATCH", difficulty: "INTERMEDIATE" },
    ]);
    setShowAddMenu(false);
  };

  const canGenerate = !!passageId && items.length > 0 && !generating;

  const handleGenerate = async () => {
    if (!passageId) {
      toast.error("지문을 먼저 선택하세요.");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/workbench/ai-jobs/question-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passageId,
          structuralMode,
          generationPlan,
          customPrompt: customPrompt.trim() || undefined,
          members: items.map((i) => ({ typeId: i.typeId, difficulty: i.difficulty })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "장문 세트 생성에 실패했습니다.");
        return;
      }
      const set = await getQuestionSet(data.setId);
      setResult(set);
      if (data.status === "DEGRADED") {
        toast.warning("세트가 생성됐지만 검수가 필요합니다(충돌/모호한 표시).");
      } else {
        toast.success(`${data.questionIds?.length ?? 0}문항 세트가 생성됐습니다.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-3">
      {/* Preset + intro */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
          장문 세트 구성
        </div>
        <button
          type="button"
          onClick={applyPreset4345}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          수능 43~45형
        </button>
      </div>

      {/* Member list */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, index) => {
            const isStructural = STRUCTURAL_BASE_TYPES.has(item.typeId);
            return (
              <div
                key={item.uid}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[11px] font-bold text-slate-500">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-slate-800">
                      {typeLabel(item.typeId)}
                    </span>
                    {isStructural && (
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-600 ring-1 ring-blue-100">
                        기준 지문
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => updateDifficulty(item.uid, d.value)}
                      className={`px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                        item.difficulty === d.value
                          ? "bg-blue-50 text-blue-700"
                          : "bg-white text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.uid)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-red-500"
                  aria-label="문항 삭제"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add control */}
      {locked ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />이 유형은 단독 출제만 가능합니다.
        </div>
      ) : !showAddMenu ? (
        <button
          type="button"
          onClick={() => setShowAddMenu(true)}
          className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> 문항 추가
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="space-y-2.5">
            {SET_CATALOG.map((cat) => {
              const entries = cat.typeIds.map((id) => ({
                id,
                add: getAddability(id, memberTypeIds),
              }));
              // Hide a group entirely once nothing in it is addable AND the set is non-empty.
              if (items.length > 0 && entries.every((e) => !e.add.ok)) return null;
              return (
                <div key={cat.group}>
                  <div className="mb-1 flex items-baseline gap-1.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                      {cat.group}
                    </span>
                    <span className="text-[10px] text-slate-400">{cat.hint}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entries.map(({ id, add }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={!add.ok}
                        title={add.ok ? "" : add.reason}
                        onClick={() => add.ok && addItem(id)}
                        className={`rounded-lg border px-2 py-1 text-[11.5px] font-medium transition-colors ${
                          add.ok
                            ? "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                            : "cursor-not-allowed border-slate-100 bg-slate-100/60 text-slate-300"
                        }`}
                      >
                        {typeLabel(id)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddMenu(false)}
              className="mt-2 w-full rounded-md py-1 text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              닫기
            </button>
          )}
        </div>
      )}

      {/* Contextual guidance */}
      <p className="px-0.5 text-[11px] leading-relaxed text-slate-400">{contextHint}</p>

      <textarea
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        placeholder="공통 지시문 (선택)"
        rows={2}
        className="resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-[12px] text-slate-700 placeholder:text-slate-400"
      />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-all ${
          canGenerate
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "cursor-not-allowed bg-slate-200 text-slate-400"
        }`}
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 세트 생성 중...
          </>
        ) : items.length === 0 ? (
          "문항을 추가하세요"
        ) : (
          `세트 생성 · ${items.length}문항`
        )}
      </button>

      {result && (
        <div className="pt-2">
          <QuestionSetCard set={result} />
        </div>
      )}
    </div>
  );
}
