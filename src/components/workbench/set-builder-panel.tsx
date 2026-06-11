"use client";

// ============================================================================
// 장문 세트 builder — dedicated composition UI
// ============================================================================
// You can only ever build a VALID set: the "문항 추가" menu enables exactly the
// types that are addable given the current composition, and greys out the rest
// with a one-line reason. The structural mode (글의 순서 / 문장 삽입) is INFERRED
// from the members — never picked separately. No raw validation errors.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Loader2,
  Lock,
  Plus,
  Target,
  X,
} from "lucide-react";

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

// Difficulty tones — same palette as 유형 지정: 기본 파랑 / 중급 노랑 / 킬러 빨강.
const DIFFICULTIES: { value: Difficulty; label: string; on: string }[] = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700" },
];

// Category badge palette — mirrors getCategoryBadgeClass in generation-config-panel.
function getCategoryBadgeClass(category: string): string {
  if (category === "수능/모의고사 객관식") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (category === "내신 서술형") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (category === "어휘") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-50 text-slate-500 ring-slate-100";
}
function typeCategory(typeId: string): string {
  return QUESTION_TYPE_UI[typeId]?.category ?? "";
}

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

const GROUP_ORDER_STORAGE_KEY =
  "smoat.workbench.questionSet.catalogGroupOrder.v1";
const ALL_GROUP_NAMES = SET_CATALOG.map((c) => c.group);

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

  // Catalog group order (persisted) — users can drag to reorder.
  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return ALL_GROUP_NAMES;
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(GROUP_ORDER_STORAGE_KEY) || "[]",
      );
      if (Array.isArray(parsed)) {
        const known = new Set(ALL_GROUP_NAMES);
        const stored = parsed.filter(
          (g) => typeof g === "string" && known.has(g),
        );
        return [...stored, ...ALL_GROUP_NAMES.filter((g) => !stored.includes(g))];
      }
    } catch {
      // Group order is a UI preference; ignore storage failures.
    }
    return ALL_GROUP_NAMES;
  });
  // Collapsed groups — default all open (empty set).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GROUP_ORDER_STORAGE_KEY,
        JSON.stringify(groupOrder),
      );
    } catch {
      // Group order is a convenience setting; ignore storage failures.
    }
  }, [groupOrder]);

  const orderedCatalog = useMemo(() => {
    const byName = new Map(SET_CATALOG.map((c) => [c.group, c]));
    const known = new Set(ALL_GROUP_NAMES);
    const ordered = groupOrder.filter(
      (g, i) => known.has(g) && groupOrder.indexOf(g) === i,
    );
    for (const g of ALL_GROUP_NAMES) if (!ordered.includes(g)) ordered.push(g);
    return ordered.map((g) => byName.get(g)).filter(Boolean) as typeof SET_CATALOG;
  }, [groupOrder]);

  const toggleGroup = (name: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const dropGroup = (sourceName: string, targetName: string) => {
    if (!sourceName || sourceName === targetName) return;
    const withoutSource = orderedCatalog
      .map((c) => c.group)
      .filter((g) => g !== sourceName);
    const targetIndex = withoutSource.indexOf(targetName);
    if (targetIndex < 0) return;
    const next = [...withoutSource];
    next.splice(targetIndex, 0, sourceName);
    setGroupOrder(next);
  };

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
    <div className="flex flex-1 min-h-0 flex-col gap-3 px-5 py-3">
      {/* Preset + intro */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
          장문 세트 구성
        </div>
        <button
          type="button"
          onClick={applyPreset4345}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          수능 43~45형
        </button>
      </div>

      {/* Member list */}
      {items.length > 0 && (
        <div className="shrink-0 space-y-1.5">
          {items.map((item, index) => {
            const isStructural = STRUCTURAL_BASE_TYPES.has(item.typeId);
            const category = typeCategory(item.typeId);
            return (
              <section
                key={item.uid}
                className="overflow-hidden rounded-xl border border-blue-300 bg-white shadow-sm shadow-blue-50 transition-all"
              >
                <div className="flex items-center gap-1.5 border-b border-blue-100 bg-blue-50/70 px-2.5 py-1.5">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold tabular-nums text-blue-600 ring-1 ring-blue-100">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-black text-blue-800">
                    {typeLabel(item.typeId)}
                  </span>
                  {isStructural ? (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold text-blue-600 ring-1 ring-blue-100 bg-blue-50">
                      기준 지문
                    </span>
                  ) : category ? (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ${getCategoryBadgeClass(category)}`}
                    >
                      {category === "수능/모의고사 객관식"
                        ? "수능모의"
                        : category === "내신 서술형"
                          ? "내신서술"
                          : category}
                    </span>
                  ) : null}
                  <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => updateDifficulty(item.uid, d.value)}
                        className={`px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                          item.difficulty === d.value
                            ? d.on
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
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-red-500"
                    aria-label="문항 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Add control */}
      {locked ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />이 유형은 단독 출제만 가능합니다.
        </div>
      ) : !showAddMenu ? (
        <button
          type="button"
          onClick={() => setShowAddMenu(true)}
          className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> 문항 추가
        </button>
      ) : (
        <div className="shrink-0 space-y-2">
          {orderedCatalog.map((cat) => {
            const entries = cat.typeIds.map((id) => ({
              id,
              add: getAddability(id, memberTypeIds),
            }));
            // Hide a group entirely once nothing in it is addable AND the set is non-empty.
            if (items.length > 0 && entries.every((e) => !e.add.ok)) return null;
            const collapsed = collapsedGroups.has(cat.group);
            const dragging = draggingGroup === cat.group;
            const dragOver =
              dragOverGroup === cat.group && draggingGroup !== cat.group;
            return (
              <section
                key={cat.group}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggingGroup && draggingGroup !== cat.group) {
                    setDragOverGroup(cat.group);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceName =
                    draggingGroup || event.dataTransfer.getData("text/plain");
                  dropGroup(sourceName, cat.group);
                  setDraggingGroup(null);
                  setDragOverGroup(null);
                }}
                className={`overflow-hidden rounded-xl border bg-white transition-all ${
                  dragOver
                    ? "border-blue-300 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]"
                    : "border-slate-200 shadow-sm hover:border-slate-300"
                } ${dragging ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      setDraggingGroup(cat.group);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", cat.group);
                    }}
                    onDragEnd={() => {
                      setDraggingGroup(null);
                      setDragOverGroup(null);
                    }}
                    className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
                    title={`${cat.group} 순서 드래그`}
                    aria-label={`${cat.group} 순서 드래그`}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGroup(cat.group)}
                    className="flex min-w-0 flex-1 items-baseline gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-white"
                    aria-expanded={!collapsed}
                  >
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      {cat.group}
                    </span>
                    <span className="min-w-0 truncate text-[10px] text-slate-400">
                      {cat.hint}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGroup(cat.group)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                    title={collapsed ? "펼치기" : "접기"}
                    aria-label={collapsed ? "펼치기" : "접기"}
                  >
                    {collapsed ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {!collapsed && (
                  <div className="flex flex-wrap gap-1.5 px-2.5 py-2.5">
                    {entries.map(({ id, add }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={!add.ok}
                        title={add.ok ? "" : add.reason}
                        onClick={() => add.ok && addItem(id)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                          add.ok
                            ? "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                            : "cursor-not-allowed border-slate-100 bg-slate-100/60 text-slate-300"
                        }`}
                      >
                        <Plus
                          className={`h-3 w-3 ${add.ok ? "text-slate-300" : "text-slate-200"}`}
                        />
                        {typeLabel(id)}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddMenu(false)}
              className="w-full rounded-md py-1 text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              닫기
            </button>
          )}
        </div>
      )}

      {/* Summary — mirrors the 총 N문제 box in 유형 지정 */}
      {items.length > 0 && (
        <div className="flex shrink-0 items-center justify-between rounded-xl border border-blue-200/60 bg-blue-50 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[12px] font-semibold text-blue-800">
              총 <strong className="text-blue-700">{items.length}</strong>문항
              <span className="ml-1 font-medium text-blue-500">
                ({structuralMode !== "NONE"
                  ? `${typeLabel(
                      items.find((i) => STRUCTURAL_BASE_TYPES.has(i.typeId))
                        ?.typeId ?? "",
                    )} 기준`
                  : locked
                    ? "단독 출제"
                    : "자유 조합"}
                )
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setItems([])}
            className="text-[11px] font-medium text-blue-500 transition-colors hover:text-blue-700"
          >
            초기화
          </button>
        </div>
      )}

      {/* Contextual guidance */}
      <p className="shrink-0 px-0.5 text-[11px] leading-relaxed text-slate-400">
        {contextHint}
      </p>

      {/* 공통 지시문 — fills remaining space, grows/shrinks with the panel height */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          공통 지시문
        </span>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="세트 전체에 적용할 지시문을 입력하세요 (선택)"
          className="min-h-[72px] w-full flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-all duration-200 ${
          canGenerate
            ? "bg-blue-600 text-white shadow-md shadow-blue-200/50 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200/60"
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
        <div className="shrink-0 pt-2">
          <QuestionSetCard set={result} />
        </div>
      )}
    </div>
  );
}
