"use client";

// ============================================================================
// 세트 멤버 1개의 설정 에디터 — 멤버별 난이도 + 유형별 세부설정
// ============================================================================
// 세트 프리셋의 각 멤버(문항)를 펼쳐 일반 문제 생성의 "유형별 세부 설정"과 동일한
// 방식으로 난이도·세부값을 조정한다. 일반 생성 패널(generation-config-panel)의
// renderNumberSetting / renderSegSetting 디자인을 그대로 모방한 자체 컴포넌트라
// 디자인 토큰(slate 팔레트·text-[12px] 등)이 화면 전체와 일관된다.
//
// 여기서 만드는 값은 세트 POST 의 memberOverrides[i].typeSettings(유형별 세부)와
// memberOverrides[i].difficulty(멤버 난이도)로 흘러간다 — 프리셋 멤버 순서와
// 평행한 배열의 한 칸이다.
// ============================================================================

import { Minus, Plus } from "lucide-react";

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import {
  CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  CONTENT_MATCH_OPTION_COUNT_MAX,
  CONTENT_MATCH_OPTION_COUNT_MIN,
  GENERIC_OPTION_COUNT_DEFAULT,
  GENERIC_OPTION_COUNT_MAX,
  GENERIC_OPTION_COUNT_MIN,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
  type ContentMatchPolarity,
} from "@/lib/question-type-generation-settings";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

/** 세트 멤버 1개의 오버라이드 — 프리셋 멤버 순서와 평행한 배열의 한 칸. */
export interface SetMemberOverride {
  difficulty?: Difficulty;
  typeSettings?: Record<string, unknown>;
}

const DIFFICULTIES: { value: Difficulty; label: string; on: string }[] = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700" },
];

// ─── 유형별 세부설정 분기 ────────────────────────────────────────────────────
// 어떤 유형에 어떤 세부설정을 보일지 정의한다. 일반 생성 패널과 같은 스키마·기본값
// (question-type-generation-settings)을 쓴다. 세트 프리셋에서 쓰는 유형만 다룬다.

type DetailKind = "optionCount" | "blankCount" | "prefixVariationCount";

interface NumberDetailSpec {
  kind: DetailKind;
  /** typeSettings 에 저장될 키. */
  settingKey: string;
  title: string;
  badges: string[];
  description: string;
  min: number;
  max: number;
  defaultValue: number;
}

/** 이 유형이 보여줄 숫자 세부설정(있으면). 없으면 null. */
function numberDetailForType(typeId: string): NumberDetailSpec | null {
  if (
    typeId === "MAIN_IDEA" ||
    typeId === "TOPIC" ||
    typeId === "TITLE" ||
    typeId === "REFERENCE" ||
    typeId === "SYNONYM" ||
    typeId === "CONTEXT_MEANING"
  ) {
    return {
      kind: "optionCount",
      settingKey: "optionCount",
      title: "보기 개수",
      badges: [`${GENERIC_OPTION_COUNT_MIN} ~ ${GENERIC_OPTION_COUNT_MAX}`, "선택지"],
      description: "학생에게 표시할 선택지 수입니다. 기본값은 5개입니다.",
      min: GENERIC_OPTION_COUNT_MIN,
      max: GENERIC_OPTION_COUNT_MAX,
      defaultValue: GENERIC_OPTION_COUNT_DEFAULT,
    };
  }
  if (typeId === "CONTENT_MATCH") {
    return {
      kind: "optionCount",
      settingKey: "optionCount",
      title: "보기 개수",
      badges: [
        `${CONTENT_MATCH_OPTION_COUNT_MIN} ~ ${CONTENT_MATCH_OPTION_COUNT_MAX}`,
        "진술문",
      ],
      description: "학생에게 표시할 내용 일치 진술문 수입니다. 기본값은 5개입니다.",
      min: CONTENT_MATCH_OPTION_COUNT_MIN,
      max: CONTENT_MATCH_OPTION_COUNT_MAX,
      defaultValue: CONTENT_MATCH_OPTION_COUNT_DEFAULT,
    };
  }
  if (typeId === "SUMMARY_COMPLETE_MC") {
    return {
      kind: "blankCount",
      settingKey: "blankCount",
      title: "빈칸 개수",
      badges: [
        `${SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN} ~ ${SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX}`,
        "(A)(B)",
      ],
      description: "요약문 빈칸 수입니다. 보기는 빈칸 값 조합으로 구성됩니다. 기본값은 2개입니다.",
      min: SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
      max: SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
      defaultValue: SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
    };
  }
  if (typeId === "SENTENCE_ORDER") {
    return {
      kind: "prefixVariationCount",
      settingKey: "prefixVariationCount",
      title: "앞문장 변형 수",
      badges: [
        `${SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN} ~ ${SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX}`,
        "(A)(B)(C)",
      ],
      description:
        "(A)(B)(C) 문단의 첫 문장을 같은 뜻으로 변형할 문단 수입니다. 0이면 변형하지 않습니다.",
      min: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN,
      max: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX,
      defaultValue: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
    };
  }
  return null;
}

/** 이 유형이 정답 극성(일치/불일치) 토글을 보여주는지. */
function supportsMatchType(typeId: string): boolean {
  return typeId === "CONTENT_MATCH";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readNumberSetting(
  typeSettings: Record<string, unknown> | undefined,
  spec: NumberDetailSpec,
): number {
  const raw = Number(typeSettings?.[spec.settingKey]);
  if (!Number.isFinite(raw)) return spec.defaultValue;
  return clampNumber(raw, spec.min, spec.max);
}

function readMatchType(
  typeSettings: Record<string, unknown> | undefined,
): ContentMatchPolarity {
  return typeSettings?.matchType === "일치" ? "일치" : "불일치";
}

// ─── 멤버별 세부설정 존재 여부(배지·합산용) ──────────────────────────────────
/** 이 유형에 보여줄 세부설정이 하나라도 있는지 — 펼침 버튼/안내에 쓴다. */
export function memberTypeHasSettings(typeId: string): boolean {
  return numberDetailForType(typeId) !== null || supportsMatchType(typeId);
}

// ─── 렌더 헬퍼 (일반 패널 디자인 모방) ───────────────────────────────────────

function NumberSetting({
  title,
  badges,
  description,
  value,
  min,
  max,
  onChange,
  ariaBase,
}: {
  title: string;
  badges: string[];
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaBase: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-slate-800">{title}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {badge}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${ariaBase} decrease`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${ariaBase} increase`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function SegSetting<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-bold text-slate-800">{title}</span>
        {description ? (
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {options.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
              value === item.value
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SetMemberSettingsEditor({
  typeId,
  override,
  onChange,
}: {
  typeId: string;
  /** 이 멤버의 현재 오버라이드. 비어 있으면(undefined) 프리셋/기본값을 표시. */
  override: SetMemberOverride | undefined;
  /** 변경 시 다음 오버라이드 전체를 돌려준다(상위가 평행 배열에 반영). */
  onChange: (next: SetMemberOverride) => void;
}) {
  const typeSettings = override?.typeSettings;
  const numberDetail = numberDetailForType(typeId);
  const showMatchType = supportsMatchType(typeId);

  const patchTypeSettings = (patch: Record<string, unknown>) => {
    onChange({
      ...override,
      typeSettings: { ...(override?.typeSettings ?? {}), ...patch },
    });
  };

  const matchTypeOptions: { value: ContentMatchPolarity; label: string }[] = [
    { value: "불일치", label: "불일치" },
    { value: "일치", label: "일치" },
  ];

  const memberDifficulty = override?.difficulty ?? null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      {/* 멤버 난이도 — 미설정이면 세트 공통 난이도를 따른다. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[12px] font-bold text-slate-800">난이도</span>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
            이 문항에만 적용할 난이도입니다. 미설정이면 세트 공통 난이도를 따릅니다.
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {DIFFICULTIES.map((d) => {
            const active = memberDifficulty === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...override,
                    // 같은 값을 다시 누르면 '미설정'(공통 난이도 따름)으로 되돌린다.
                    difficulty: active ? undefined : d.value,
                  })
                }
                className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                  active
                    ? d.on
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 정답 유형(내용 일치 전용) */}
      {showMatchType ? (
        <div className="border-t border-slate-100 pt-3">
          <SegSetting<ContentMatchPolarity>
            title="정답 유형"
            description="일치하는 것을 고를지, 일치하지 않는 것을 고를지 정합니다. 기본은 불일치입니다."
            value={readMatchType(typeSettings)}
            options={matchTypeOptions}
            onChange={(next) => patchTypeSettings({ matchType: next })}
          />
        </div>
      ) : null}

      {/* 숫자 세부설정(보기 수·빈칸 수·앞문장 변형 수) */}
      {numberDetail ? (
        <div className="border-t border-slate-100 pt-3">
          <NumberSetting
            title={numberDetail.title}
            badges={numberDetail.badges}
            description={numberDetail.description}
            value={readNumberSetting(typeSettings, numberDetail)}
            min={numberDetail.min}
            max={numberDetail.max}
            onChange={(next) =>
              patchTypeSettings({
                [numberDetail.settingKey]: clampNumber(
                  next,
                  numberDetail.min,
                  numberDetail.max,
                ),
              })
            }
            ariaBase={`${typeId} ${numberDetail.kind}`}
          />
        </div>
      ) : null}

      {/* 세부설정이 없는 유형 안내 — 난이도만 조정 가능. */}
      {!showMatchType && !numberDetail ? (
        <p className="border-t border-slate-100 pt-3 text-[10px] leading-snug text-slate-400">
          {QUESTION_TYPE_UI[typeId]?.label ?? typeId} 유형은 별도 세부 설정이 없습니다.
          난이도만 조정할 수 있어요.
        </p>
      ) : null}
    </div>
  );
}
