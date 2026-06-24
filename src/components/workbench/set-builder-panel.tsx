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
import { ChevronDown, Layers, Loader2, Settings2 } from "lucide-react";

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { SET_PRESETS, resolvePreset } from "@/lib/question-sets/presets";
import { getQuestionSet, type QuestionSetForRender } from "@/actions/question-sets";
import { QuestionSetCard } from "./question-set-card";
import {
  SetMemberSettingsEditor,
  type SetMemberOverride,
} from "./set-member-settings-editor";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** memberOverrides 배열이 실제 내용(설정값)을 담고 있는지 — 빈 칸은 무시. */
function memberOverrideHasContent(o: SetMemberOverride | undefined): boolean {
  if (!o) return false;
  if (o.difficulty) return true;
  return !!o.typeSettings && Object.keys(o.typeSettings).length > 0;
}

/** POST 전송용 — 비어 있는 칸은 빈 객체로 평행 정렬(프리셋 멤버 순서 보존). */
function serializeMemberOverrides(
  overrides: SetMemberOverride[],
  memberCount: number,
): Array<{ difficulty?: Difficulty; typeSettings?: Record<string, unknown> }> {
  const out: Array<{ difficulty?: Difficulty; typeSettings?: Record<string, unknown> }> = [];
  for (let i = 0; i < memberCount; i += 1) {
    const o = overrides[i];
    if (memberOverrideHasContent(o)) {
      out.push({
        ...(o!.difficulty ? { difficulty: o!.difficulty } : {}),
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
  difficulty,
  onDifficultyChange,
  memberOverrides,
  onMemberOverridesChange,
  embedded = false,
}: {
  passageId: string | null;
  generationPlan?: string;
  /** 외부에서 프리셋 선택을 제어할 때(지문별 저장). 주면 controlled 모드. */
  presetId?: string | null;
  onPresetChange?: (presetId: string | null) => void;
  difficulty?: Difficulty;
  onDifficultyChange?: (difficulty: Difficulty) => void;
  /**
   * 멤버별 난이도·세부설정 오버라이드(프리셋 멤버 순서와 평행한 배열). 외부에서
   * 제어할 때(지문별 저장) 주면 controlled. 미지정이면 내부 state 로 동작한다.
   */
  memberOverrides?: SetMemberOverride[];
  onMemberOverridesChange?: (next: SetMemberOverride[]) => void;
  /** 지문별 설정 안에 끼워 쓰는 모드 — 구성만 편집, 생성은 공용 '생성' 버튼. */
  embedded?: boolean;
}) {
  const presetControlled = presetId !== undefined && onPresetChange !== undefined;
  const diffControlled = difficulty !== undefined && onDifficultyChange !== undefined;
  const membersControlled =
    memberOverrides !== undefined && onMemberOverridesChange !== undefined;

  const [internalPreset, setInternalPreset] = useState<string | null>(null);
  const [internalDiff, setInternalDiff] = useState<Difficulty>("INTERMEDIATE");
  const [internalMemberOverrides, setInternalMemberOverrides] = useState<
    SetMemberOverride[]
  >([]);
  const selectedPreset = presetControlled ? (presetId ?? null) : internalPreset;
  const selectedDiff = diffControlled ? difficulty! : internalDiff;
  const selectedMemberOverrides = membersControlled
    ? (memberOverrides ?? [])
    : internalMemberOverrides;

  const setSelectedPreset = (id: string | null) =>
    presetControlled ? onPresetChange!(id) : setInternalPreset(id);
  const setSelectedDiff = (d: Difficulty) =>
    diffControlled ? onDifficultyChange!(d) : setInternalDiff(d);
  const setMemberOverridesValue = (next: SetMemberOverride[]) =>
    membersControlled
      ? onMemberOverridesChange!(next)
      : setInternalMemberOverrides(next);

  /** 멤버 i 의 오버라이드만 갈아끼운다(평행 배열의 한 칸). */
  const setMemberOverrideAt = (index: number, next: SetMemberOverride) => {
    const draft = [...selectedMemberOverrides];
    while (draft.length <= index) draft.push({});
    draft[index] = next;
    setMemberOverridesValue(draft);
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
  const canGenerate = !!passageId && !!selectedPreset && !generating;

  const handleGenerate = async () => {
    if (!passageId) {
      toast.error("지문을 먼저 선택하세요.");
      return;
    }
    if (!selectedPreset) {
      toast.error("세트 프리셋을 선택하세요.");
      return;
    }
    const preset = resolvePreset(selectedPreset);
    const memberOverridesPayload = preset
      ? serializeMemberOverrides(selectedMemberOverrides, preset.members.length)
      : undefined;
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/workbench/ai-jobs/question-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passageId,
          presetId: selectedPreset,
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

      {/* 프리셋 선택 */}
      <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <Layers className="h-3.5 w-3.5 text-slate-400" />
        세트 프리셋
      </div>

      <div className="shrink-0 space-y-2">
        {presets.map((p) => {
          const active = selectedPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPreset(active ? null : p.id)}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                active
                  ? "border-blue-400 bg-blue-50/70 ring-1 ring-inset ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[13px] ${active ? "font-bold text-blue-800" : "font-bold text-slate-700"}`}
                >
                  {p.label}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
                  {p.members.length}문항 · 최소 {p.minSentences}문장
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                {memberLabels(p.id)}
              </div>
            </button>
          );
        })}
      </div>

      <p className="shrink-0 px-0.5 text-[11px] leading-relaxed text-slate-400">
        {selectedPreset
          ? resolvePreset(selectedPreset)?.description
          : "한 지문에 여러 문항을 묶는 세트 프리셋을 고르세요. 지문 분량이 부족하면 생성 시 안내됩니다."}
      </p>

      {/* 멤버별 설정 — 프리셋 선택 후, 각 문항을 펼쳐 난이도·세부설정을 일반
          문제 생성과 동일하게 조정한다. 조정값은 memberOverrides 로 전송된다. */}
      {selectedPreset
        ? (() => {
            const preset = resolvePreset(selectedPreset);
            if (!preset) return null;
            return (
              <div className="shrink-0 space-y-2">
                <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Settings2 className="h-3.5 w-3.5 text-slate-400" />
                  문항별 설정
                </div>
                <div className="space-y-1.5">
                  {preset.members.map((member, index) => {
                    const typeLabel =
                      QUESTION_TYPE_UI[member.typeId]?.label ?? member.typeId;
                    const memberOverride = selectedMemberOverrides[index];
                    const open = expandedMember === index;
                    const memberDiff = memberOverride?.difficulty;
                    const adjusted = memberOverrideHasContent(memberOverride);
                    return (
                      <div
                        key={`${member.typeId}-${index}`}
                        className={`overflow-hidden rounded-xl border transition-colors ${
                          open
                            ? "border-blue-300 bg-blue-50/40"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMember(open ? null : index)
                          }
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold tabular-nums text-slate-500">
                              {index + 1}
                            </span>
                            <span className="truncate text-[12px] font-bold text-slate-700">
                              {typeLabel}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {memberDiff ? (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {DIFFICULTY_LABELS[memberDiff]}
                              </span>
                            ) : null}
                            {adjusted ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            ) : null}
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition-transform ${
                                open ? "rotate-180" : ""
                              }`}
                            />
                          </div>
                        </button>
                        {open ? (
                          <div className="px-3 pb-3">
                            <SetMemberSettingsEditor
                              typeId={member.typeId}
                              override={memberOverride}
                              onChange={(next) =>
                                setMemberOverrideAt(index, next)
                              }
                            />
                          </div>
                        ) : null}
                      </div>
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
            ) : !selectedPreset ? (
              "프리셋을 선택하세요"
            ) : (
              `세트 생성 · ${resolvePreset(selectedPreset)?.members.length ?? 0}문항`
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
