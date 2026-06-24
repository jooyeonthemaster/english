"use client";

// ============================================================================
// 지문 세트 builder — preset selection UI
// ============================================================================
// 강사는 자유조합이 아니라 코드로 미리 검증된 PRESET 중에서 고른다. 각 프리셋은
// 멤버 유형·순서·구조모드·최소 분량이 고정돼 있어 "항상 valid한 세트"만 만들 수
// 있다. 구성 칸은 프리셋 칩 목록이고, 난이도는 세트 전체 공통값 하나다.
// ============================================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  FileText,
  GripVertical,
  Layers,
  Loader2,
  Minus,
  Plus,
  Settings2,
} from "lucide-react";

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { SET_PRESETS, resolvePreset } from "@/lib/question-sets/presets";
import { getQuestionSet, type QuestionSetForRender } from "@/actions/question-sets";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QuestionSetCard } from "./question-set-card";
import {
  SetMemberSettingsEditor,
  type SetMemberOverride,
} from "./set-member-settings-editor";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";
type PresetCounts = Record<string, number>;
type MemberOverridesByPreset = Record<string, SetMemberOverride[]>;

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** memberOverrides 배열이 실제 내용(설정값)을 담고 있는지 — 빈 칸은 무시. */
function memberOverrideHasContent(o: SetMemberOverride | undefined): boolean {
  if (!o) return false;
  if (o.difficulty) return true;
  if (o.generationPlan) return true;
  return !!o.typeSettings && Object.keys(o.typeSettings).length > 0;
}

/** POST 전송용 — 비어 있는 칸은 빈 객체로 평행 정렬(프리셋 멤버 순서 보존). */
function serializeMemberOverrides(
  overrides: SetMemberOverride[],
  memberCount: number,
): Array<{
  difficulty?: Difficulty;
  generationPlan?: "STANDARD" | "PREMIUM";
  typeSettings?: Record<string, unknown>;
}> {
  const out: Array<{
    difficulty?: Difficulty;
    generationPlan?: "STANDARD" | "PREMIUM";
    typeSettings?: Record<string, unknown>;
  }> = [];
  for (let i = 0; i < memberCount; i += 1) {
    const o = overrides[i];
    if (memberOverrideHasContent(o)) {
      out.push({
        ...(o!.difficulty ? { difficulty: o!.difficulty } : {}),
        ...(o!.generationPlan ? { generationPlan: o!.generationPlan } : {}),
        ...(o!.typeSettings && Object.keys(o!.typeSettings).length > 0
          ? { typeSettings: o!.typeSettings }
          : {}),
      });
    } else {
      out.push({});
    }
  }
  return out;
}

const DIFFICULTIES: { value: Difficulty; label: string; on: string }[] = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700" },
];

const DIFFICULTY_DOT: Record<Difficulty, string> = {
  BASIC: "bg-blue-500",
  INTERMEDIATE: "bg-amber-500",
  KILLER: "bg-red-500",
};

function memberLabels(presetId: string): string {
  const preset = resolvePreset(presetId);
  if (!preset) return "";
  return preset.members
    .map((m) => QUESTION_TYPE_UI[m.typeId]?.label ?? m.typeId)
    .join(" · ");
}

export function SetBuilderPanel({
  passageId,
  generationPlan = "STANDARD",
  presetId,
  onPresetChange,
  presetCounts,
  onPresetCountsChange,
  difficulty,
  onDifficultyChange,
  memberOverrides,
  onMemberOverridesChange,
  memberOverridesByPreset,
  onMemberOverridesByPresetChange,
  embedded = false,
}: {
  passageId: string | null;
  generationPlan?: string;
  /** 외부에서 프리셋 선택을 제어할 때(지문별 저장). 주면 controlled 모드. */
  presetId?: string | null;
  onPresetChange?: (presetId: string | null) => void;
  /** 프리셋별 생성할 세트 수. 있으면 controlled 다중 선택 모드. */
  presetCounts?: PresetCounts;
  onPresetCountsChange?: (next: PresetCounts) => void;
  difficulty?: Difficulty;
  onDifficultyChange?: (difficulty: Difficulty) => void;
  /**
   * 멤버별 난이도·세부설정 오버라이드(프리셋 멤버 순서와 평행한 배열). 외부에서
   * 제어할 때(지문별 저장) 주면 controlled. 미지정이면 내부 state 로 동작한다.
   */
  memberOverrides?: SetMemberOverride[];
  onMemberOverridesChange?: (next: SetMemberOverride[]) => void;
  memberOverridesByPreset?: MemberOverridesByPreset;
  onMemberOverridesByPresetChange?: (next: MemberOverridesByPreset) => void;
  /** 지문별 설정 안에 끼워 쓰는 모드 — 구성만 편집, 생성은 공용 '생성' 버튼. */
  embedded?: boolean;
}) {
  const presetControlled = presetId !== undefined && onPresetChange !== undefined;
  const countsControlled =
    presetCounts !== undefined && onPresetCountsChange !== undefined;
  const diffControlled = difficulty !== undefined && onDifficultyChange !== undefined;
  const membersControlled =
    memberOverrides !== undefined && onMemberOverridesChange !== undefined;
  const membersByPresetControlled =
    memberOverridesByPreset !== undefined &&
    onMemberOverridesByPresetChange !== undefined;

  const [internalPreset, setInternalPreset] = useState<string | null>(null);
  const [internalPresetCounts, setInternalPresetCounts] = useState<PresetCounts>({});
  const [focusedPresetId, setFocusedPresetId] = useState<string | null>(null);
  const [internalDiff, setInternalDiff] = useState<Difficulty>("INTERMEDIATE");
  const [internalMemberOverrides, setInternalMemberOverrides] = useState<
    SetMemberOverride[]
  >([]);
  const [internalMemberOverridesByPreset, setInternalMemberOverridesByPreset] =
    useState<MemberOverridesByPreset>({});
  const selectedPreset = presetControlled ? (presetId ?? null) : internalPreset;
  const controlledPresetCounts = presetCounts ?? {};
  const hasControlledPresetCounts = Object.values(controlledPresetCounts).some(
    (count) => Number(count) > 0,
  );
  const selectedPresetCounts = countsControlled
    ? hasControlledPresetCounts
      ? controlledPresetCounts
      : selectedPreset
        ? { [selectedPreset]: 1 }
        : {}
    : Object.keys(internalPresetCounts).length > 0
      ? internalPresetCounts
      : selectedPreset
        ? { [selectedPreset]: 1 }
        : {};
  const selectedDiff = diffControlled ? difficulty! : internalDiff;
  const selectedMemberOverrides = membersControlled
    ? (memberOverrides ?? [])
    : internalMemberOverrides;
  const selectedMemberOverridesByPreset = membersByPresetControlled
    ? (memberOverridesByPreset ?? {})
    : internalMemberOverridesByPreset;

  const positivePresetEntries = Object.entries(selectedPresetCounts)
    .map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))] as const)
    .filter(([, count]) => count > 0);
  const totalSetCount = positivePresetEntries.reduce((sum, [, count]) => sum + count, 0);
  const effectiveFocusedPresetId =
    focusedPresetId && (selectedPresetCounts[focusedPresetId] ?? 0) > 0
      ? focusedPresetId
      : positivePresetEntries[0]?.[0] ?? selectedPreset ?? null;

  const syncLegacyPreset = (counts: PresetCounts) => {
    const first = Object.entries(counts).find(([, count]) => Number(count) > 0)?.[0] ?? null;
    if (presetControlled) onPresetChange!(first);
    else setInternalPreset(first);
  };
  const setPresetCountsValue = (next: PresetCounts) => {
    const clean = Object.fromEntries(
      Object.entries(next)
        .map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))] as const)
        .filter(([, count]) => count > 0),
    );
    if (countsControlled) {
      onPresetCountsChange!(clean);
    } else {
      setInternalPresetCounts(clean);
      syncLegacyPreset(clean);
    }
  };
  const applyPresetCount = (id: string, count: number) => {
    const nextCount = Math.max(0, Math.floor(Number(count) || 0));
    const next = { ...selectedPresetCounts };
    if (nextCount <= 0) delete next[id];
    else next[id] = nextCount;
    setPresetCountsValue(next);
    setFocusedPresetId(nextCount > 0 ? id : null);
    setExpandedMember(null);
  };
  const setSelectedDiff = (d: Difficulty) =>
    diffControlled ? onDifficultyChange!(d) : setInternalDiff(d);
  const setMemberOverridesValue = (next: SetMemberOverride[]) =>
    membersControlled
      ? onMemberOverridesChange!(next)
      : setInternalMemberOverrides(next);
  const setMemberOverridesByPresetValue = (next: MemberOverridesByPreset) =>
    membersByPresetControlled
      ? onMemberOverridesByPresetChange!(next)
      : setInternalMemberOverridesByPreset(next);

  /** 멤버 i 의 오버라이드만 갈아끼운다(평행 배열의 한 칸). */
  const setMemberOverrideAt = (index: number, next: SetMemberOverride) => {
    const presetKey = effectiveFocusedPresetId;
    const source =
      presetKey && selectedMemberOverridesByPreset[presetKey]
        ? selectedMemberOverridesByPreset[presetKey]
        : presetKey === selectedPreset
          ? selectedMemberOverrides
          : [];
    const draft = [...source];
    while (draft.length <= index) draft.push({});
    draft[index] = next;
    if (presetKey) {
      setMemberOverridesByPresetValue({
        ...selectedMemberOverridesByPreset,
        [presetKey]: draft,
      });
    }
    if (presetKey === selectedPreset || !membersByPresetControlled) {
      setMemberOverridesValue(draft);
    }
  };

  // 펼친 멤버(상세 편집 중) — 한 번에 하나씩 펼친다. UI 취향이라 내부 state.
  const [expandedMember, setExpandedMember] = useState<number | null>(null);

  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<QuestionSetForRender | null>(null);

  // 지문이 바뀌면 이전 지문의 생성 결과 미리보기는 비운다.
  useEffect(() => {
    setResult(null);
  }, [passageId]);

  // 프리셋이 바뀌면 펼친 멤버 상태를 닫는다(이전 프리셋 인덱스가 의미 없음).
  useEffect(() => {
    setExpandedMember(null);
  }, [selectedPreset]);

  const presets = SET_PRESETS.filter((p) => p.tier === 1);
  const focusedPreset = effectiveFocusedPresetId
    ? resolvePreset(effectiveFocusedPresetId)
    : null;
  const canGenerate = !!passageId && totalSetCount > 0 && !generating;

  const handleGenerate = async () => {
    if (!passageId) {
      toast.error("지문을 먼저 선택하세요.");
      return;
    }
    if (totalSetCount <= 0) {
      toast.error("세트 프리셋을 선택하세요.");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      let createdQuestions = 0;
      let lastSet: QuestionSetForRender | null = null;
      for (const [presetKey, count] of positivePresetEntries) {
        const preset = resolvePreset(presetKey);
        if (!preset) continue;
        const memberOverridesPayload = serializeMemberOverrides(
          selectedMemberOverridesByPreset[presetKey] ??
            (presetKey === selectedPreset ? selectedMemberOverrides : []),
          preset.members.length,
        );
        for (let i = 0; i < count; i += 1) {
          const res = await fetch("/api/workbench/ai-jobs/question-set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              passageId,
              presetId: presetKey,
              difficulty: selectedDiff,
              generationPlan,
              customPrompt: customPrompt.trim() || undefined,
              memberOverrides: memberOverridesPayload,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(data.error || "지문 세트 생성에 실패했습니다.");
            return;
          }
          createdQuestions += data.questionIds?.length ?? 0;
          lastSet = await getQuestionSet(data.setId);
          if (data.status === "DEGRADED") {
            toast.warning(`${preset.label} 세트가 생성됐지만 검수가 필요합니다.`);
          }
        }
      }
      setResult(lastSet);
      toast.success(`${totalSetCount}개 세트 · ${createdQuestions}문항이 생성됐습니다.`);
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
      {/* 난이도 — 세트 전체 공통값 하나. */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="w-14 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-slate-500">
          난이도
        </span>
        <div className="flex h-8 flex-1 rounded-lg bg-slate-100 p-0.5">
          {DIFFICULTIES.map((d) => {
            const active = selectedDiff === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setSelectedDiff(d.value)}
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

      {/* 프리셋 선택 — 일반 유형 타일과 같은 0/1 스테퍼 문법. */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex h-10 w-full items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 text-left">
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" aria-hidden="true" />
          <span className="text-[12px] font-bold text-slate-700">세트 프리셋</span>
          {positivePresetEntries.length > 0 ? (
            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
              선택 {positivePresetEntries.length}
            </span>
          ) : null}
          {totalSetCount > 0 ? (
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-blue-600 ring-1 ring-inset ring-blue-100">
              {totalSetCount}세트
            </span>
          ) : null}
          <span className="text-[10px] font-medium tabular-nums text-slate-300">
            {presets.length}
          </span>
          <Layers className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
        </div>
        <div className="p-2">
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const count = Math.max(0, Math.floor(Number(selectedPresetCounts[p.id]) || 0));
              const active = count > 0;
              const focused = effectiveFocusedPresetId === p.id;
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col overflow-hidden rounded-lg border transition-colors ${
                    focused
                      ? "border-blue-400 bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                      : active
                        ? "border-blue-300 bg-blue-50/70"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-center gap-0.5 pl-1 pr-1.5 pt-1.5">
                    <span className="flex h-6 w-4 shrink-0 items-center justify-center rounded text-slate-300">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!active) applyPresetCount(p.id, 1);
                        else setFocusedPresetId(p.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      title={`${p.label} 선택`}
                    >
                      <span
                        className={`min-w-0 truncate text-[12px] ${
                          active
                            ? "font-bold text-slate-800"
                            : "font-semibold text-slate-600"
                        }`}
                      >
                        {p.label}
                      </span>
                    </button>
                  </div>
                  <div className="mt-1 min-h-[26px] px-1.5 text-[10px] font-medium leading-snug text-slate-500">
                    <span className="line-clamp-2">{memberLabels(p.id)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1 px-1.5 pb-1.5">
                    <span className="whitespace-nowrap pl-0.5 text-[10px] font-semibold text-slate-400">
                      세트 수
                    </span>
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          applyPresetCount(p.id, Math.max(0, count - 1));
                        }}
                        disabled={!active}
                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        aria-label={`${p.label} 선택 해제`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className={`flex h-7 w-7 items-center justify-center border-x border-slate-200 text-[12.5px] font-bold tabular-nums ${
                          active
                            ? "bg-blue-50/50 text-blue-700"
                            : "bg-slate-50/60 text-slate-300"
                        }`}
                      >
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          applyPresetCount(p.id, count + 1);
                        }}
                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        aria-label={`${p.label} 선택`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="shrink-0 px-0.5 text-[11px] leading-relaxed text-slate-400">
        {focusedPreset
          ? focusedPreset.description
          : "한 지문에 여러 문항을 묶는 세트 프리셋을 고르세요. 지문 분량이 부족하면 생성 시 안내됩니다."}
      </p>

      {/* 멤버별 설정 — 프리셋 선택 후, 각 문항을 펼쳐 난이도·세부설정을 일반
          문제 생성과 동일하게 조정한다. 조정값은 memberOverrides 로 전송된다. */}
      {effectiveFocusedPresetId
        ? (() => {
            const preset = resolvePreset(effectiveFocusedPresetId);
            if (!preset) return null;
            const focusedOverrides =
              selectedMemberOverridesByPreset[preset.id] ??
              (preset.id === selectedPreset ? selectedMemberOverrides : []);
            return (
              <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex h-10 w-full items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 text-left">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span className="text-[12px] font-bold text-slate-700">문항별 설정</span>
                  <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
                    {preset.members.length}문항
                  </span>
                  <Settings2 className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-2">
                  {preset.members.map((member, index) => {
                    const typeLabel =
                      QUESTION_TYPE_UI[member.typeId]?.label ?? member.typeId;
                    const memberOverride = focusedOverrides[index];
                    const open = expandedMember === index;
                    const memberDiff = memberOverride?.difficulty;
                    const inheritedDiff = member.difficulty ?? selectedDiff;
                    const effDiff = memberDiff ?? inheritedDiff;
                    const adjusted = memberOverrideHasContent(memberOverride);
                    return (
                      <Popover
                        key={`${member.typeId}-${index}`}
                        open={open}
                        onOpenChange={(nextOpen) =>
                          setExpandedMember(nextOpen ? index : null)
                        }
                      >
                        <PopoverAnchor asChild>
                          <div
                            className={`relative flex flex-col overflow-hidden rounded-lg border transition-colors ${
                              open
                                ? "rounded-b-none border-blue-300 bg-blue-50/40"
                                : adjusted
                                  ? "border-blue-300 bg-blue-50/70"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                            }`}
                          >
                            <div className="flex items-center gap-0.5 pl-1 pr-1.5 pt-1.5">
                              <span className="flex h-6 w-4 shrink-0 items-center justify-center rounded text-slate-300">
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                                  title={`${typeLabel} 세부 옵션 ${open ? "접기" : "펼치기"}`}
                                >
                                  <span className="min-w-0 truncate text-[12px] font-bold text-slate-700">
                                    {typeLabel}
                                  </span>
                                  {adjusted ? (
                                    <span
                                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                        memberDiff ? DIFFICULTY_DOT[effDiff] : "bg-blue-500"
                                      }`}
                                      title="이 문항만 개별 설정"
                                    />
                                  ) : null}
                                  <ChevronDown
                                    className={`ml-auto size-4 shrink-0 text-blue-300 transition-transform duration-300 ${
                                      open ? "rotate-180" : ""
                                    }`}
                                    aria-hidden="true"
                                  />
                                </button>
                              </PopoverTrigger>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-1 px-1.5 pb-1.5">
                              <span className="whitespace-nowrap pl-0.5 text-[10px] font-semibold text-slate-400">
                                문항 수
                              </span>
                              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <span className="flex h-7 w-7 items-center justify-center text-slate-200">
                                  <Minus className="h-3.5 w-3.5" />
                                </span>
                                <span className="flex h-7 w-7 items-center justify-center border-x border-slate-200 bg-blue-50/50 text-[12.5px] font-bold tabular-nums text-blue-700">
                                  1
                                </span>
                                <span className="flex h-7 w-7 items-center justify-center text-slate-200">
                                  <Plus className="h-3.5 w-3.5" />
                                </span>
                              </div>
                            </div>
                          </div>
                        </PopoverAnchor>
                        <PopoverContent
                          align="start"
                          sideOffset={0}
                          collisionPadding={12}
                          className="max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-t-none border border-t-0 border-blue-300 p-0 shadow-lg"
                        >
                          <div className="flex h-9 items-center gap-2 border-b border-slate-200 bg-white px-3">
                            <Settings2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">
                              {typeLabel} 세부 설정
                            </span>
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {DIFFICULTY_LABELS[effDiff]}
                            </span>
                          </div>
                          <div className="bg-slate-100 px-3 pb-3 pt-2.5">
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                            <SetMemberSettingsEditor
                              typeId={member.typeId}
                              override={memberOverride}
                              inheritedGenerationPlan={
                                member.generationPlan ??
                                (generationPlan === "PREMIUM" ? "PREMIUM" : "STANDARD")
                              }
                              inheritedDifficulty={inheritedDiff}
                              onChange={(next) =>
                                setMemberOverrideAt(index, next)
                              }
                            />
                          </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              </div>
            );
          })()
        : null}

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

      {/* 자체 생성 버튼·결과 미리보기는 standalone(라이브러리) 모드에서만. */}
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
            ) : totalSetCount <= 0 ? (
              "프리셋을 선택하세요"
            ) : (
              `세트 생성 · ${totalSetCount}세트`
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
