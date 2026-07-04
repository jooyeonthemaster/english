"use client";

// ============================================================================
// 국어 지문 세트 빌더 — KO 전용 세트 생성 표면 (KO-TYPE-CATALOG §3)
// ============================================================================
// 영어 장문 세트(SetBuilderPanel)의 embedded(지문별 모달) 문법을 1:1 미러하되,
// 프리셋 소스는 KO_SET_PRESETS(수능 독서/수능 문학/내신 혼합) 3종이고, 각
// 프리셋의 적용 가능 여부를 지문 갈래(KO_KIND 태그)·분량으로 결정론 판정해
// 비호환 프리셋은 비활성 + 사유 툴팁으로 보여준다. 생성 CTA 는 지문별 '문제
// 생성' 모달 푸터가 소유한다(영어 embedded 와 동일).
//
// 영어 경로 무접촉 — 이 컴포넌트는 generation-config-panel 의 koPanel 게이트
// (passageSubject === "KOREAN") 뒤에서만 마운트된다.
// ============================================================================

import { useMemo, useState } from "react";
import { FileText, Layers, Minus, Plus } from "lucide-react";

import {
  KO_SET_PRESETS,
  passageMeetsKoSetPreset,
  resolveKoSetSlots,
  type KoSetPreset,
} from "@/lib/korean/sets/presets";
import {
  KO_PASSAGE_KIND_LABELS,
  type KoPassageKind,
} from "@/lib/korean/core/passage-meta";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

// 난이도 세그먼트 — 영어 SetBuilderPanel·difficulty SOT(src/lib/difficulty.ts)와
// 동일 색 문법(기본=파랑·중급=노랑·킬러=빨강).
const DIFFICULTIES: { value: Difficulty; label: string; on: string }[] = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700" },
];

interface KoPresetAvailability {
  preset: KoSetPreset;
  ok: boolean;
  /** 비활성 사유(갈래 비호환 또는 분량 미달) — 카드 title 툴팁·캡션에 노출. */
  reason: string | null;
  /** 갈래 해석에 성공한 멤버 라벨(순서 그대로, [3점] 슬롯 표기 포함). */
  memberLine: string;
  memberCount: number;
}

/** 프리셋별 적용 가능 판정 — 갈래 해석 실패 사유를 분량 사유보다 우선 노출. */
export function computeKoPresetAvailability(
  passageContent: string,
  passageKind: KoPassageKind | null,
): KoPresetAvailability[] {
  return KO_SET_PRESETS.map((preset) => {
    const resolution = resolveKoSetSlots(preset, passageKind);
    if (!resolution.ok) {
      return {
        preset,
        ok: false,
        reason: resolution.reason,
        memberLine: preset.description,
        memberCount: 0,
      };
    }
    const memberLine = resolution.members
      .map((m) => (m.points === 3 ? `${m.label}[3점]` : m.label))
      .join(" · ");
    const feasibility = passageMeetsKoSetPreset(passageContent, preset);
    return {
      preset,
      ok: feasibility.ok,
      reason: feasibility.ok ? null : (feasibility.reason ?? null),
      memberLine,
      memberCount: resolution.members.length,
    };
  });
}

export function KoSetBuilderSection({
  passageContent,
  passageKind,
  presetCounts,
  onPresetCountsChange,
  difficulty,
  onDifficultyChange,
}: {
  /** 편집 중 지문의 유효 본문(범위·수정 반영) — 분량 게이트 판정용. */
  passageContent: string;
  /** 지문 갈래(KO_KIND 태그) — null 이면 갈래 게이트 없이 분량만 판정. */
  passageKind: KoPassageKind | null;
  /** 프리셋별 생성할 세트 수(controlled — 지문별 오버라이드에 저장). */
  presetCounts: Record<string, number>;
  onPresetCountsChange: (next: Record<string, number>) => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
}) {
  const [focusedPresetId, setFocusedPresetId] = useState<string | null>(null);

  const availability = useMemo(
    () => computeKoPresetAvailability(passageContent, passageKind),
    [passageContent, passageKind],
  );

  const counts = presetCounts ?? {};
  const positiveEntries = Object.entries(counts)
    .map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))] as const)
    .filter(([, count]) => count > 0);
  const totalSetCount = positiveEntries.reduce((sum, [, count]) => sum + count, 0);

  const applyCount = (id: string, next: number) => {
    const nextCount = Math.max(0, Math.floor(Number(next) || 0));
    const nextCounts = { ...counts };
    if (nextCount <= 0) delete nextCounts[id];
    else nextCounts[id] = nextCount;
    onPresetCountsChange(nextCounts);
    setFocusedPresetId(nextCount > 0 ? id : null);
  };

  const focused =
    availability.find(
      (a) =>
        a.preset.id ===
        (focusedPresetId && (counts[focusedPresetId] ?? 0) > 0
          ? focusedPresetId
          : (positiveEntries[0]?.[0] ?? focusedPresetId)),
    ) ?? null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* 난이도 — 세트 전체 공통값 하나(영어 세트와 동일 문법). */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="w-14 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-slate-500">
          난이도
        </span>
        <div className="flex h-8 flex-1 rounded-lg bg-slate-100 p-0.5">
          {DIFFICULTIES.map((d) => {
            const active = difficulty === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => onDifficultyChange(d.value)}
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

      {/* 프리셋 선택 — 영어 세트 프리셋 타일과 같은 스테퍼 문법. */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex h-10 w-full items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 text-left">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-indigo-400"
            aria-hidden="true"
          />
          <span className="text-[12px] font-bold text-slate-700">
            국어 세트 프리셋
          </span>
          {positiveEntries.length > 0 ? (
            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
              선택 {positiveEntries.length}
            </span>
          ) : null}
          {totalSetCount > 0 ? (
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-blue-600 ring-1 ring-inset ring-blue-100">
              {totalSetCount}세트
            </span>
          ) : null}
          <span className="text-[10px] font-medium tabular-nums text-slate-300">
            {availability.length}
          </span>
          <Layers className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
        </div>
        <div className="p-2">
          <div className="grid grid-cols-2 gap-2">
            {availability.map(({ preset, ok, reason, memberLine, memberCount }) => {
              const count = Math.max(0, Math.floor(Number(counts[preset.id]) || 0));
              const active = count > 0;
              return (
                <div
                  key={preset.id}
                  title={
                    ok
                      ? `${preset.label} — ${memberLine}`
                      : (reason ?? "이 지문에는 적용할 수 없는 프리셋입니다.")
                  }
                  aria-disabled={!ok}
                  className={`relative flex flex-col overflow-hidden rounded-lg border transition-colors ${
                    !ok
                      ? "border-slate-200 bg-slate-50/70 opacity-60"
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
                      disabled={!ok}
                      onClick={() => {
                        if (!active) applyCount(preset.id, 1);
                        setFocusedPresetId(preset.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left disabled:cursor-not-allowed"
                    >
                      <span
                        className={`min-w-0 truncate text-[12px] ${
                          active
                            ? "font-bold text-slate-800"
                            : "font-semibold text-slate-600"
                        }`}
                      >
                        {preset.label}
                      </span>
                    </button>
                    {memberCount > 0 ? (
                      <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {memberCount}문항
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 min-h-[26px] px-1.5 text-[10px] font-medium leading-snug text-slate-500">
                    <span className="line-clamp-2">
                      {ok
                        ? memberLine
                        : (reason ?? "이 지문에는 적용할 수 없어요.")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1 px-1.5 pb-1.5">
                    <span className="whitespace-nowrap pl-0.5 text-[10px] font-semibold text-slate-400">
                      {ok ? "세트 수" : "적용 불가"}
                    </span>
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => applyCount(preset.id, count - 1)}
                        disabled={!active}
                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        aria-label={`${preset.label} 세트 수 줄이기`}
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
                        onClick={() => applyCount(preset.id, count + 1)}
                        disabled={!ok}
                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        aria-label={`${preset.label} 세트 수 늘리기`}
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
        {focused
          ? focused.preset.description
          : passageKind
            ? `이 지문(${KO_PASSAGE_KIND_LABELS[passageKind]})에 맞는 세트 프리셋을 고르세요. 한 지문에 여러 문항이 묶여 출제됩니다.`
            : "이 지문에 맞는 세트 프리셋을 고르세요. 갈래 미지정 지문은 분량 기준만 적용됩니다."}
      </p>
      <p className="shrink-0 px-0.5 text-[10.5px] leading-relaxed text-slate-400">
        크레딧은 세트 문항 수 × 문항 단가 기준으로 재시도 여유분(2회분)까지
        선차감되고, 사용하지 않은 재시도분은 생성 완료 시 자동 환불됩니다.
      </p>
    </div>
  );
}
