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
  GripVertical,
  Layers,
  Loader2,
  Lock,
  Minus,
  Plus,
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

/** 이 유형이 속한 카탈로그 그룹 이름 (없으면 null). */
function groupOfType(typeId: string): string | null {
  for (const c of SET_CATALOG) if (c.typeIds.includes(typeId)) return c.group;
  return null;
}

// 유형 앞 색 점 — 어느 역할 그룹인지(유형 지정의 카테고리 닷과 동일 컨셉).
const GROUP_DOT: Record<string, string> = {
  "구조 · 기준 지문": "bg-violet-400",
  밑줄형: "bg-blue-400",
  "지문 이해": "bg-emerald-400",
  "단독 출제 전용": "bg-slate-300",
};
function groupDotClass(typeId: string): string {
  const g = groupOfType(typeId);
  return (g && GROUP_DOT[g]) || "bg-slate-300";
}

// 색 점 범례 — 유형 지정의 카테고리 범례와 같은 형식(점 + 짧은 라벨).
const SET_GROUP_LEGEND: { label: string; dot: string }[] = [
  { label: "구조", dot: "bg-violet-400" },
  { label: "밑줄형", dot: "bg-blue-400" },
  { label: "지문 이해", dot: "bg-emerald-400" },
  { label: "단독", dot: "bg-slate-300" },
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

const TYPE_ORDER_STORAGE_KEY = "smoat.workbench.questionSet.typeOrder.v1";
// 카탈로그의 모든 세트 가능 유형 — 평면 목록(유형 지정과 동일한 행 리스트).
const ALL_SET_TYPES: string[] = SET_CATALOG.flatMap((c) => c.typeIds);

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
  members,
  onMembersChange,
  embedded = false,
}: {
  passageId: string | null;
  generationPlan?: string;
  /** 외부에서 세트 구성을 제어할 때(지문별 저장). 주면 controlled 모드. */
  members?: { typeId: string; difficulty: Difficulty }[];
  onMembersChange?: (
    members: { typeId: string; difficulty: Difficulty }[],
  ) => void;
  /**
   * 지문별 설정 안에 끼워 쓰는 모드 — 구성만 편집하고, 생성은 공용 '생성'
   * 버튼이 담당한다. 자체 생성 버튼·결과 미리보기·공통 지시문을 숨긴다.
   */
  embedded?: boolean;
}) {
  // controlled(지문별 override) ↔ uncontrolled(라이브러리 단독) 양립.
  const controlled = members !== undefined && onMembersChange !== undefined;
  const [internalItems, setInternalItems] = useState<SetItem[]>([]);
  const items: SetItem[] = controlled
    ? members!.map((m, i) => ({
        uid: `m${i}`,
        typeId: m.typeId,
        difficulty: m.difficulty,
      }))
    : internalItems;
  const setItems = (
    updater: SetItem[] | ((prev: SetItem[]) => SetItem[]),
  ) => {
    const next =
      typeof updater === "function"
        ? (updater as (p: SetItem[]) => SetItem[])(items)
        : updater;
    if (controlled) {
      onMembersChange!(
        next.map((i) => ({ typeId: i.typeId, difficulty: i.difficulty })),
      );
    } else {
      setInternalItems(next);
    }
  };
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<QuestionSetForRender | null>(null);

  // 지문이 바뀌면(지문별 세트 편집에서 다른 카드로 전환) 이전 지문의 생성
  // 결과 미리보기는 더 이상 유효하지 않으므로 비운다.
  useEffect(() => {
    setResult(null);
  }, [passageId]);

  // 유형 표시 순서(persisted) — 손잡이로 위아래 reorder.
  const [typeOrder, setTypeOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return ALL_SET_TYPES;
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(TYPE_ORDER_STORAGE_KEY) || "[]",
      );
      if (Array.isArray(parsed)) {
        const known = new Set(ALL_SET_TYPES);
        const stored = parsed.filter(
          (t) => typeof t === "string" && known.has(t),
        );
        return [...stored, ...ALL_SET_TYPES.filter((t) => !stored.includes(t))];
      }
    } catch {
      // 유형 순서는 UI 선호값 — 저장 실패는 무시.
    }
    return ALL_SET_TYPES;
  });
  // 난이도는 유형 지정처럼 '한 번에' — 세트 전체 공통값. (0개일 때 기억용 로컬
  // 상태이고, 문항이 있으면 그 값으로 표시·일괄 적용한다.)
  const [globalDifficulty, setGlobalDifficulty] =
    useState<Difficulty>("INTERMEDIATE");
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const [dragOverType, setDragOverType] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TYPE_ORDER_STORAGE_KEY,
        JSON.stringify(typeOrder),
      );
    } catch {
      // 편의 설정 — 저장 실패는 무시.
    }
  }, [typeOrder]);

  const orderedTypes = useMemo(() => {
    const known = new Set(ALL_SET_TYPES);
    const ordered = typeOrder.filter(
      (t, i) => known.has(t) && typeOrder.indexOf(t) === i,
    );
    for (const t of ALL_SET_TYPES) if (!ordered.includes(t)) ordered.push(t);
    return ordered;
  }, [typeOrder]);

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

  // 유형별 개수 — 멤버 리스트에서 파생(유형 지정의 typeCounts 와 동일 개념).
  const countByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.typeId, (m.get(it.typeId) ?? 0) + 1);
    return m;
  }, [items]);
  // 세트 전체 공통 난이도 — 문항이 있으면 그 값을, 없으면 기억된 로컬 값을 보여준다.
  const displayedDifficulty: Difficulty = items[0]?.difficulty ?? globalDifficulty;

  // 멤버를 유형 표시 순서로 정렬해 내보낸다(세트 문항 순서 = 행 순서).
  const emit = (next: SetItem[], order: string[] = orderedTypes) => {
    const idx = (t: string) => {
      const i = order.indexOf(t);
      return i < 0 ? order.length : i;
    };
    setItems([...next].sort((a, b) => idx(a.typeId) - idx(b.typeId)));
  };
  const incType = (typeId: string) => {
    if (!getAddability(typeId, memberTypeIds).ok) return;
    emit([
      ...items,
      { uid: nextUid(), typeId, difficulty: displayedDifficulty },
    ]);
  };
  const decType = (typeId: string) => {
    // 그 유형의 '마지막 한 개'만 제거.
    let removed = false;
    const next: SetItem[] = [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (!removed && items[i].typeId === typeId) {
        removed = true;
        continue;
      }
      next.unshift(items[i]);
    }
    emit(next);
  };
  // 난이도는 한 번에 — 세트 전체 문항을 같은 난이도로 맞춘다.
  const setAllDifficulty = (difficulty: Difficulty) => {
    setGlobalDifficulty(difficulty);
    if (items.length > 0) {
      emit(items.map((i) => ({ ...i, difficulty })));
    }
  };
  const reorderTypes = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const without = orderedTypes.filter((t) => t !== sourceId);
    const ti = without.indexOf(targetId);
    if (ti < 0) return;
    const next = [...without];
    next.splice(ti, 0, sourceId);
    setTypeOrder(next);
    emit(items, next);
  };

  const applyPreset4345 = () => {
    setItems([
      { uid: nextUid(), typeId: "SENTENCE_ORDER", difficulty: "INTERMEDIATE" },
      { uid: nextUid(), typeId: "REFERENCE", difficulty: "INTERMEDIATE" },
      { uid: nextUid(), typeId: "CONTENT_MATCH", difficulty: "INTERMEDIATE" },
    ]);
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
    <div
      className={`flex flex-1 min-h-0 flex-col gap-3 py-3 ${embedded ? "px-4" : "px-5"}`}
    >
      {/* 난이도 — 위쪽 '생성 모델' 바로 아래에 오도록 최상단에. 자동/유형지정
          모드의 난이도 세그먼트와 정렬·디자인을 동일하게 맞춘다(w-14 라벨·gap-3). */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="w-14 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-slate-500">
          난이도
        </span>
        <div className="flex h-8 flex-1 rounded-lg bg-slate-100 p-0.5">
          {DIFFICULTIES.map((d) => {
            const active = displayedDifficulty === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setAllDifficulty(d.value)}
                className={`flex flex-1 items-center justify-center rounded-[6px] text-[12px] transition-all duration-150 ${
                  active
                    ? `font-bold shadow-sm ${d.on}`
                    : "font-semibold text-slate-400 hover:text-slate-600"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
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

      {/* 선택 문항 + 추가 카탈로그 — 한 박스 흐름으로(선택은 회색 그룹 안에) */}
      <div className="shrink-0 space-y-2">
        {locked && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
            <Lock className="h-3.5 w-3.5 shrink-0" />이 유형은 단독 출제만
            가능합니다.
          </div>
        )}
        {/* 문항 유형 — 유형 지정과 동일한 행 디자인(손잡이 + − 0 +).
            개수만큼 그 유형의 문항이 세트에 들어간다. 세트 규칙(구조 1개·단독
            출제)은 +의 활성/비활성으로 그대로 강제된다. */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <Plus className="h-3.5 w-3.5 text-slate-400" />
            문항 유형
          </span>
          {/* 색 점 범례 — 유형 지정처럼 어떤 역할 그룹인지 보여준다. */}
          <div className="flex items-center gap-2">
            {SET_GROUP_LEGEND.map((c) => (
              <span
                key={c.label}
                className="flex items-center gap-1 text-[10px] font-medium text-slate-400"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${c.dot}`}
                  aria-hidden="true"
                />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {orderedTypes.map((typeId) => {
            const count = countByType.get(typeId) ?? 0;
            const active = count > 0;
            const addability = getAddability(typeId, memberTypeIds);
            const canAdd = addability.ok;
            const dragging = draggingType === typeId;
            const dragOver = dragOverType === typeId && draggingType !== typeId;
            return (
              <section
                key={typeId}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggingType && draggingType !== typeId) {
                    setDragOverType(typeId);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const src =
                    draggingType || e.dataTransfer.getData("text/plain");
                  reorderTypes(src, typeId);
                  setDraggingType(null);
                  setDragOverType(null);
                }}
                className={`transition-colors ${
                  dragOver
                    ? "bg-blue-50 ring-1 ring-inset ring-blue-300"
                    : active
                      ? "bg-blue-50/70"
                      : "hover:bg-slate-50/80"
                } ${dragging ? "opacity-50" : ""}`}
              >
                <div className="flex h-10 items-center gap-0.5 pl-1 pr-1.5">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDraggingType(typeId);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", typeId);
                    }}
                    onDragEnd={() => {
                      setDraggingType(null);
                      setDragOverType(null);
                    }}
                    className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                    title={`${typeLabel(typeId)} 순서 드래그`}
                    aria-label={`${typeLabel(typeId)} 순서 드래그`}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => incType(typeId)}
                    disabled={!canAdd}
                    title={
                      canAdd ? `${typeLabel(typeId)} 추가` : addability.reason
                    }
                    className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left disabled:cursor-not-allowed"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${groupDotClass(typeId)}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[12px] ${
                        active
                          ? "font-bold text-blue-800"
                          : canAdd
                            ? "font-semibold text-slate-600"
                            : "font-semibold text-slate-300"
                      }`}
                    >
                      {typeLabel(typeId)}
                    </span>
                    {STRUCTURAL_BASE_TYPES.has(typeId) ? (
                      <span className="shrink-0 rounded bg-violet-50 px-1 py-px text-[9px] font-bold text-violet-600 ring-1 ring-inset ring-violet-100">
                        기준 지문
                      </span>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => decType(typeId)}
                      disabled={count <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-200"
                      aria-label={`${typeLabel(typeId)} 줄이기`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className={`w-5 text-center text-[12.5px] font-bold tabular-nums ${
                        count > 0 ? "text-blue-700" : "text-slate-300"
                      }`}
                    >
                      {count}
                    </span>
                    <button
                      type="button"
                      onClick={() => incType(typeId)}
                      disabled={!canAdd}
                      title={canAdd ? undefined : addability.reason}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-200"
                      aria-label={`${typeLabel(typeId)} 늘리기`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Contextual guidance */}
      <p className="shrink-0 px-0.5 text-[11px] leading-relaxed text-slate-400">
        {contextHint}
      </p>

      {/* 공통 지시문 — embedded(지문별)에서는 공용 '생성' 흐름이 담당하므로 숨김 */}
      {!embedded && (
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
      )}

      {/* 자체 생성 버튼·결과 미리보기는 standalone(라이브러리) 모드에서만.
          지문별 설정에서는 하단 공용 '생성' 버튼으로 생성하고 결과는
          아래 생성/검수 결과에서 확인한다. */}
      {!embedded && (
        <>
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
        </>
      )}
    </div>
  );
}
