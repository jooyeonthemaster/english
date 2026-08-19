"use client";

// ============================================================================
// 세트 멤버 1개의 설정 에디터 — 일반 유형 상세 설정과 같은 조작 모델
// ============================================================================

import { Gem, Minus, Plus } from "lucide-react";

import { PearlIcon } from "@/components/icons/pearl-icon";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  planForDifficulty,
  QUESTION_GENERATION_PLANS,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import {
  BLANK_INFERENCE_BLANK_COUNT_DEFAULT,
  BLANK_INFERENCE_BLANK_COUNT_MAX,
  BLANK_INFERENCE_BLANK_COUNT_MIN,
  CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
  CONTENT_MATCH_ANSWER_COUNT_MIN,
  CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  CONTENT_MATCH_OPTION_COUNT_MAX,
  CONTENT_MATCH_OPTION_COUNT_MIN,
  GENERIC_OPTION_COUNT_DEFAULT,
  GENERIC_OPTION_COUNT_MAX,
  GENERIC_OPTION_COUNT_MIN,
  GRAMMAR_ANSWER_COUNT_DEFAULT,
  GRAMMAR_ANSWER_COUNT_MIN,
  GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
  GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
  GRAMMAR_CORRECTION_ERROR_COUNT_MIN,
  GRAMMAR_MARKER_COUNT_DEFAULT,
  GRAMMAR_MARKER_COUNT_MAX,
  GRAMMAR_MARKER_COUNT_MIN,
  SENTENCE_INSERT_SLOT_COUNT_DEFAULT,
  SENTENCE_INSERT_SLOT_COUNT_MAX,
  SENTENCE_INSERT_SLOT_COUNT_MIN,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX,
  SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
  getQuestionLanguageToggleScope,
  readOptionLanguageSetting,
  readStemLanguageSetting,
  supportsGenericOptionCount,
  supportsGistAnswerPolarity,
  type ContentMatchPolarity,
} from "@/lib/question-type-generation-settings";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

export interface SetMemberOverride {
  difficulty?: Difficulty;
  generationPlan?: QuestionGenerationPlan;
  typeSettings?: Record<string, unknown>;
}

const DIFFICULTIES: { value: Difficulty; label: string; on: string }[] = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700" },
];

// 26-08-18 난이도 기반 티어: 멤버별 '생성 플랜' 피커 폐지 — 난이도가 티어를 결정한다
// (KILLER=2배, 서버가 요청 generationPlan 을 무시). 렌더 코드는 보존하고 이 상수로만 끈다.
const MEMBER_PLAN_PICKER_ENABLED = false as boolean;

interface NumberSettingSpec {
  key: string;
  title: string;
  badges: string[];
  description: string;
  min: number;
  max: number;
  defaultValue: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readNumberSetting(
  typeSettings: Record<string, unknown> | undefined,
  spec: NumberSettingSpec,
): number {
  const raw = Number(typeSettings?.[spec.key]);
  if (!Number.isFinite(raw)) return spec.defaultValue;
  return clampNumber(raw, spec.min, spec.max);
}

function readMatchType(
  typeSettings: Record<string, unknown> | undefined,
): ContentMatchPolarity {
  return typeSettings?.matchType === "일치" ? "일치" : "불일치";
}

function readContentMatchAnswerCount(
  typeSettings: Record<string, unknown> | undefined,
  optionCount: number,
): number {
  const raw = Number(typeSettings?.answerCount ?? typeSettings?.correctAnswerCount);
  const base = Number.isFinite(raw) ? raw : CONTENT_MATCH_ANSWER_COUNT_DEFAULT;
  return clampNumber(base, CONTENT_MATCH_ANSWER_COUNT_MIN, optionCount);
}

function readGenericAnswerCount(
  typeSettings: Record<string, unknown> | undefined,
  optionCount: number,
): number {
  const raw = Number(typeSettings?.answerCount ?? typeSettings?.correctAnswerCount);
  const base = Number.isFinite(raw) ? raw : 1;
  return clampNumber(base, 1, Math.max(1, optionCount - 1));
}

function readGrammarAnswerCount(
  typeSettings: Record<string, unknown> | undefined,
  markerCount: number,
): number {
  const raw = Number(typeSettings?.answerCount ?? typeSettings?.correctAnswerCount);
  const base = Number.isFinite(raw) ? raw : GRAMMAR_ANSWER_COUNT_DEFAULT;
  return clampNumber(base, GRAMMAR_ANSWER_COUNT_MIN, markerCount);
}

function NumberSetting({
  title,
  badges,
  description,
  value,
  min,
  max,
  onChange,
  ariaBase,
}: NumberSettingSpec & {
  value: number;
  onChange: (next: number) => void;
  ariaBase: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-bold text-slate-800">{title}</span>
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
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {description}
        </p>
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
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
            {description}
          </p>
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

export function memberTypeHasSettings(typeId: string): boolean {
  return (
    supportsGenericOptionCount(typeId) ||
    [
      "CONTENT_MATCH",
      "SUMMARY_COMPLETE_MC",
      "SENTENCE_ORDER",
      "SENTENCE_INSERT",
      "BLANK_INFERENCE",
      "GRAMMAR_ERROR",
      "GRAMMAR_CORRECTION",
    ].includes(typeId)
  );
}

export function SetMemberSettingsEditor({
  typeId,
  override,
  onChange,
  inheritedGenerationPlan = "STANDARD",
  inheritedDifficulty = "INTERMEDIATE",
}: {
  typeId: string;
  override: SetMemberOverride | undefined;
  onChange: (next: SetMemberOverride) => void;
  inheritedGenerationPlan?: QuestionGenerationPlan;
  inheritedDifficulty?: Difficulty;
}) {
  const typeSettings = override?.typeSettings;

  const patchTypeSettings = (patch: Record<string, unknown>) => {
    onChange({
      ...override,
      typeSettings: { ...(override?.typeSettings ?? {}), ...patch },
    });
  };

  const patchNumber = (spec: NumberSettingSpec, next: number) => {
    patchTypeSettings({ [spec.key]: clampNumber(next, spec.min, spec.max) });
  };

  const renderPlan = () => {
    // 26-08-18 난이도 기반 티어: 플랜 피커 렌더 제거(코드 보존).
    if (!MEMBER_PLAN_PICKER_ENABLED || !FEATURE_FLAGS.SHOW_MODEL_SELECTOR) return null;
    const selectedPlan = override?.generationPlan ?? inheritedGenerationPlan;
    return (
      <div className="border-b border-slate-100 pb-3">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          생성 플랜 · 이 문항만
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["STANDARD", "PREMIUM"] as const).map((planId) => {
            const plan = QUESTION_GENERATION_PLANS[planId];
            const active = selectedPlan === planId;
            const Icon = planId === "PREMIUM" ? Gem : PearlIcon;
            return (
              <button
                key={planId}
                type="button"
                onClick={() => onChange({ ...override, generationPlan: planId })}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
                  active
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    active ? "text-blue-600" : "text-slate-400"
                  }`}
                />
                <span className="truncate text-[12px] font-bold">
                  {plan.shortLabel}
                </span>
                <span
                  className={`ml-auto text-[10px] font-bold tabular-nums ${
                    active ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  {plan.creditMultiplier}x
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDifficulty = () => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-bold text-slate-800">난이도</span>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          이 문항에만 적용할 난이도입니다. 미설정이면 프리셋/세트 기본값을 따릅니다.
        </p>
      </div>
      <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {DIFFICULTIES.map((d) => {
          const selectedDifficulty = override?.difficulty ?? inheritedDifficulty;
          const active = selectedDifficulty === d.value;
          // 26-08-18 난이도 기반 티어: 난이도가 티어를 결정 — 배수 >1(킬러=2x)만 뱃지.
          const tierMultiplier =
            QUESTION_GENERATION_PLANS[planForDifficulty(d.value)].creditMultiplier;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() =>
                onChange({
                  ...override,
                  difficulty: active ? undefined : d.value,
                })
              }
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                active ? d.on : "text-slate-400 hover:text-slate-600"
              }`}
              title={
                tierMultiplier > 1
                  ? `${d.label} 난이도는 크레딧 ${tierMultiplier}배(상위 모델·정밀 검수)`
                  : undefined
              }
            >
              {d.label}
              {tierMultiplier > 1 ? (
                <span
                  className={`text-[9px] font-bold tabular-nums ${
                    active ? "text-red-600" : "text-slate-400"
                  }`}
                >
                  {tierMultiplier}x
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderNumericContent = () => {
    if (typeId === "CONTENT_MATCH") {
      const optionSpec: NumberSettingSpec = {
        key: "optionCount",
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
      const optionCount = readNumberSetting(typeSettings, optionSpec);
      const answerCount = readContentMatchAnswerCount(typeSettings, optionCount);
      const answerSpec: NumberSettingSpec = {
        key: "answerCount",
        title: "정답 개수",
        badges: [
          `1 ~ ${optionCount}`,
          answerCount >= 2 ? "복수 정답" : "단일 정답",
        ],
        description:
          "2개 이상이면 복수 정답 문항으로 생성하고 모든 정답 라벨을 함께 저장합니다.",
        min: CONTENT_MATCH_ANSWER_COUNT_MIN,
        max: optionCount,
        defaultValue: CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
      };
      return (
        <div className="space-y-3">
          <SegSetting<ContentMatchPolarity>
            title="정답 유형"
            description="일치하는 것을 고를지, 일치하지 않는 것을 고를지 정합니다. 기본은 불일치입니다."
            value={readMatchType(typeSettings)}
            options={[
              { value: "불일치", label: "불일치" },
              { value: "일치", label: "일치" },
            ]}
            onChange={(next) => patchTypeSettings({ matchType: next })}
          />
          <div className="border-t border-slate-100 pt-3">
            <NumberSetting
              {...optionSpec}
              value={optionCount}
              onChange={(next) => {
                const clamped = clampNumber(next, optionSpec.min, optionSpec.max);
                patchTypeSettings({
                  optionCount: clamped,
                  answerCount: Math.min(clamped, answerCount),
                });
              }}
              ariaBase={`${typeId} option count`}
            />
          </div>
          <div className="border-t border-slate-100 pt-3">
            <NumberSetting
              {...answerSpec}
              value={answerCount}
              onChange={(next) => patchNumber(answerSpec, next)}
              ariaBase={`${typeId} answer count`}
            />
          </div>
        </div>
      );
    }

    if (typeId === "GRAMMAR_ERROR") {
      const markerSpec: NumberSettingSpec = {
        key: "markerCount",
        title: "밑줄 표현 개수",
        badges: [`${GRAMMAR_MARKER_COUNT_MIN} ~ ${GRAMMAR_MARKER_COUNT_MAX}`, "표시 위치"],
        description: "지문에서 검토할 밑줄 표현 수입니다. 정답 수는 아래에서 따로 지정합니다.",
        min: GRAMMAR_MARKER_COUNT_MIN,
        max: GRAMMAR_MARKER_COUNT_MAX,
        defaultValue: GRAMMAR_MARKER_COUNT_DEFAULT,
      };
      const markerCount = readNumberSetting(typeSettings, markerSpec);
      const answerCount = readGrammarAnswerCount(typeSettings, markerCount);
      const answerSpec: NumberSettingSpec = {
        key: "answerCount",
        title: "정답 개수",
        badges: [
          `1 ~ ${markerCount}개`,
          answerCount >= 2 ? "모두 고르기" : "단일 정답",
        ],
        description:
          "2개 이상이면 발문에 개수를 쓰지 않고 어법상 틀린 것을 모두 고르라고 안내합니다.",
        min: GRAMMAR_ANSWER_COUNT_MIN,
        max: markerCount,
        defaultValue: GRAMMAR_ANSWER_COUNT_DEFAULT,
      };
      return (
        <div className="space-y-3">
          <NumberSetting
            {...markerSpec}
            value={markerCount}
            onChange={(next) => {
              const clamped = clampNumber(next, markerSpec.min, markerSpec.max);
              patchTypeSettings({
                markerCount: clamped,
                answerCount: Math.min(clamped, answerCount),
              });
            }}
            ariaBase={`${typeId} marker count`}
          />
          <div className="border-t border-slate-100 pt-3">
            <NumberSetting
              {...answerSpec}
              value={answerCount}
              onChange={(next) => patchNumber(answerSpec, next)}
              ariaBase={`${typeId} answer count`}
            />
          </div>
        </div>
      );
    }

    const singleSpecs: Record<string, NumberSettingSpec> = {
      SUMMARY_COMPLETE_MC: {
        key: "blankCount",
        title: "빈칸 개수",
        badges: [
          `${SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN} ~ ${SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX}`,
          "(A)(B)",
        ],
        description:
          "요약문 빈칸 수입니다. 보기는 빈칸 값 조합으로 구성됩니다. 기본값은 2개입니다.",
        min: SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
        max: SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
        defaultValue: SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
      },
      SENTENCE_ORDER: {
        key: "prefixVariationCount",
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
      },
      SENTENCE_INSERT: {
        key: "slotCount",
        title: "삽입 위치 개수",
        badges: [
          `${SENTENCE_INSERT_SLOT_COUNT_MIN} ~ ${SENTENCE_INSERT_SLOT_COUNT_MAX}`,
          "①~⑤",
        ],
        description:
          "학생에게 표시할 삽입 후보 위치 수입니다. 기본값은 5개입니다.",
        min: SENTENCE_INSERT_SLOT_COUNT_MIN,
        max: SENTENCE_INSERT_SLOT_COUNT_MAX,
        defaultValue: SENTENCE_INSERT_SLOT_COUNT_DEFAULT,
      },
      BLANK_INFERENCE: {
        key: "blankCount",
        title: "빈칸 개수",
        badges: [
          `${BLANK_INFERENCE_BLANK_COUNT_MIN} ~ ${BLANK_INFERENCE_BLANK_COUNT_MAX}`,
          "단일 빈칸",
        ],
        description:
          "기본값은 수능형 단일 빈칸입니다. 2개 이상이면 (A)(B)(C) 빈칸과 조합 보기로 생성합니다.",
        min: BLANK_INFERENCE_BLANK_COUNT_MIN,
        max: BLANK_INFERENCE_BLANK_COUNT_MAX,
        defaultValue: BLANK_INFERENCE_BLANK_COUNT_DEFAULT,
      },
      GRAMMAR_CORRECTION: {
        key: "errorCount",
        title: "수정할 오류 개수",
        badges: [
          `${GRAMMAR_CORRECTION_ERROR_COUNT_MIN} ~ ${GRAMMAR_CORRECTION_ERROR_COUNT_MAX}`,
          "서술형",
        ],
        description:
          "학생이 직접 고쳐 쓸 오류 구간 수입니다. 기본값은 1개입니다.",
        min: GRAMMAR_CORRECTION_ERROR_COUNT_MIN,
        max: GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
        defaultValue: GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
      },
    };

    const spec = singleSpecs[typeId];
    if (spec) {
      const value = readNumberSetting(typeSettings, spec);
      return (
        <NumberSetting
          {...spec}
          value={value}
          onChange={(next) => patchNumber(spec, next)}
          ariaBase={`${typeId} ${spec.key}`}
        />
      );
    }

    if (supportsGenericOptionCount(typeId)) {
      const optionSpec: NumberSettingSpec = {
        key: "optionCount",
        title: "보기 개수",
        badges: [`${GENERIC_OPTION_COUNT_MIN} ~ ${GENERIC_OPTION_COUNT_MAX}`, "선택지"],
        description: "학생에게 표시할 보기 수입니다. 기본값은 5개입니다.",
        min: GENERIC_OPTION_COUNT_MIN,
        max: GENERIC_OPTION_COUNT_MAX,
        defaultValue: GENERIC_OPTION_COUNT_DEFAULT,
      };
      const optionCount = readNumberSetting(typeSettings, optionSpec);
      const answerCount = readGenericAnswerCount(typeSettings, optionCount);
      const answerSpec: NumberSettingSpec = {
        key: "answerCount",
        title: "정답 개수",
        badges: [
          `1 ~ ${Math.max(1, optionCount - 1)}`,
          answerCount >= 2 ? "모두 고르기" : "단일 정답",
        ],
        description:
          "2개 이상이면 발문에 개수를 쓰지 않고 적절한 것을 모두 고르라고 안내합니다.",
        min: 1,
        max: Math.max(1, optionCount - 1),
        defaultValue: 1,
      };
      const showGistPolarity = supportsGistAnswerPolarity(typeId);
      const gistPolarity =
        typeSettings?.answerPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
      const gistPolarityKind =
        typeId === "TITLE" ? "제목" : typeId === "MAIN_IDEA" ? "요지" : "주제";
      return (
        <div className="space-y-3">
          {showGistPolarity ? (
            <SegSetting<"POSITIVE" | "NEGATIVE">
              title="정답 유형"
              description={`${gistPolarityKind}로 '적절한 것'을 고를지, '적절하지 않은 것'을 고를지 정합니다.`}
              value={gistPolarity}
              options={[
                { value: "POSITIVE", label: "적절한 것" },
                { value: "NEGATIVE", label: "적절하지 않은 것" },
              ]}
              onChange={(next) => patchTypeSettings({ answerPolarity: next })}
            />
          ) : null}
          <div className={showGistPolarity ? "border-t border-slate-100 pt-3" : undefined}>
            <NumberSetting
              {...optionSpec}
              value={optionCount}
              onChange={(next) => {
                const clamped = clampNumber(next, optionSpec.min, optionSpec.max);
                patchTypeSettings({
                  optionCount: clamped,
                  answerCount: Math.min(clamped - 1, answerCount),
                });
              }}
              ariaBase={`${typeId} option count`}
            />
          </div>
          <div className="border-t border-slate-100 pt-3">
            <NumberSetting
              {...answerSpec}
              value={answerCount}
              onChange={(next) => patchNumber(answerSpec, next)}
              ariaBase={`${typeId} answer count`}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const languageScope = getQuestionLanguageToggleScope(typeId);
  const numericContent = renderNumericContent();
  const typeLabel = QUESTION_TYPE_UI[typeId]?.label ?? typeId;

  return (
    <div className="space-y-3">
      {renderPlan()}
      {renderDifficulty()}
      {numericContent ? (
        <div className="border-t border-slate-100 pt-3">{numericContent}</div>
      ) : null}
      <div className="border-t border-slate-100 pt-3">
        <SegSetting<"ko" | "en">
          title="질문 언어"
          description="학생에게 보이는 질문(지시문) 언어입니다."
          value={readStemLanguageSetting(typeSettings, typeId)}
          options={[
            { value: "ko", label: "한국어" },
            { value: "en", label: "영어" },
          ]}
          onChange={(next) => patchTypeSettings({ stemLanguage: next })}
        />
      </div>
      {languageScope === "stem-option" ? (
        <div className="border-t border-slate-100 pt-3">
          <SegSetting<"ko" | "en">
            title="보기 언어"
            description="학생에게 보이는 보기(선택지) 언어입니다."
            value={readOptionLanguageSetting(typeSettings, typeId)}
            options={[
              { value: "ko", label: "한국어" },
              { value: "en", label: "영어" },
            ]}
            onChange={(next) => patchTypeSettings({ optionLanguage: next })}
          />
        </div>
      ) : null}
      {!numericContent ? (
        <p className="border-t border-slate-100 pt-3 text-[10px] leading-snug text-slate-400">
          {/* 26-08-18 난이도 기반 티어: 플랜 문구 제거 */}
          {typeLabel} 유형은 숫자 세부 설정이 없습니다. 난이도, 언어만 조정할
          수 있어요.
        </p>
      ) : null}
    </div>
  );
}
