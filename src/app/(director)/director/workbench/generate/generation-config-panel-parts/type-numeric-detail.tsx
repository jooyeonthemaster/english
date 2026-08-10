"use client";

// generation-config-panel.tsx 의 renderTypeNumericDetailContent 에서 유형별 세부설정 렌더를
// verbatim 추출한 순수 함수들. 컴포넌트 상태/세터/파생값은 인자로 주입(효과는 main 잔류).
// 호출부 인라인 함수호출이라 React reconciliation 동일. 파라미터 타입은
// generation-config-panel.tsx 의 실측 캡처 시그니처와 동형(타입 전용 — 런타임 무영향).

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { DIFFICULTY_TONES, VOCAB_GENERATION_TYPE_IDS } from "./constants";
import { resolvePointPickerMeta } from "./point-picker-config";
import { renderLanguageSetting, renderNumberSetting, renderSegSetting, renderToggleSetting } from "./setting-fields";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { Button } from "@/components/ui/button";
import { SetBuilderPanel } from "@/components/workbench/set-builder-panel";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { PearlIcon } from "@/components/icons/pearl-icon";
import {
  getQuestionGenerationCreditCost,
  QUESTION_GENERATION_PLANS,
} from "@/lib/question-generation-plans";
import { ANTONYM_PAIR_COUNT_MAX, ANTONYM_PAIR_COUNT_MIN, BLANK_INFERENCE_BLANK_COUNT_MAX, BLANK_INFERENCE_BLANK_COUNT_MIN, CONTENT_MATCH_ANSWER_COUNT_MIN, CONTENT_MATCH_OPTION_COUNT_MAX, CONTENT_MATCH_OPTION_COUNT_MIN, GENERIC_OPTION_COUNT_MAX, GENERIC_OPTION_COUNT_MIN, GRAMMAR_ANSWER_COUNT_MIN, GRAMMAR_CORRECTION_ERROR_COUNT_MAX, GRAMMAR_CORRECTION_ERROR_COUNT_MIN, GRAMMAR_MARKER_COUNT_MAX, GRAMMAR_MARKER_COUNT_MIN, IRRELEVANT_SLOT_COUNT_MAX, IRRELEVANT_SLOT_COUNT_MIN, SENTENCE_INSERT_SLOT_COUNT_MAX, SENTENCE_INSERT_SLOT_COUNT_MIN, SUMMARY_COMPLETE_BLANK_COUNT_MAX, SUMMARY_COMPLETE_BLANK_COUNT_MIN, SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX, SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN, SUMMARY_WRITING_BLANK_COUNT_DEFAULT, SUMMARY_WRITING_BLANK_COUNT_MAX, SUMMARY_WRITING_BLANK_COUNT_MIN, SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT, SUMMARY_WRITING_DISTRACTOR_COUNT_MAX, SUMMARY_WRITING_DISTRACTOR_COUNT_MIN, SUMMARY_WRITING_TARGET_WORDS_DEFAULT, SUMMARY_WRITING_TARGET_WORDS_MAX, SUMMARY_WRITING_TARGET_WORDS_MIN, TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX, TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN, TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX, TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN, VOCAB_CHOICE_ANSWER_COUNT_MIN, VOCAB_CHOICE_MARKER_COUNT_MAX, VOCAB_CHOICE_MARKER_COUNT_MIN, getQuestionLanguageToggleScope, readQuestionTypeGenerationPlanSetting, resolveTopicSentenceWritingSettings, supportsGistAnswerPolarity } from "@/lib/question-type-generation-settings";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type {
  BlankInferenceGenerationSettings,
  ContentMatchGenerationSettings,
  GrammarChoiceComboGenerationSettings,
  GrammarCorrectionGenerationSettings,
  GrammarErrorGenerationSettings,
  QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { Cpu, Crosshair, FileText, Gem, Minus, Plus, Target } from "lucide-react";

// ─── 주입 파라미터 공용 타입 — generation-config-panel.tsx 캡처와 동형 ───

/** 패널 난이도 리터럴 — GenerationConfigPanelProps.difficulty 와 동일. */
type PanelDifficulty = "BASIC" | "INTERMEDIATE" | "KILLER";
/** generation-config-panel.tsx 의 patchTypeSettings 시그니처. */
type PatchTypeSettings = (typeId: string, patch: Record<string, unknown>) => void;
/** GenerationConfigPanelProps.setQuestionTypeSettings 시그니처. */
type SetQuestionTypeSettings = (
  v:
    | QuestionTypeGenerationSettings
    | ((prev: QuestionTypeGenerationSettings) => QuestionTypeGenerationSettings),
) => void;
/** 세트 멤버 오버라이드 — GenerationConfigPanelProps.setMemberOverrides 원소와 동형. */
type PanelSetMemberOverride = {
  difficulty?: PanelDifficulty;
  generationPlan?: QuestionGenerationPlan;
  typeSettings?: Record<string, unknown>;
};

export function renderAntonymDetail({ antonymPairCount, setAntonymPairCount }: {
  antonymPairCount: number;
  setAntonymPairCount: (next: number) => void;
}) {
      return renderNumberSetting({
        title: "단어 쌍 개수",
        badges: [
          `${ANTONYM_PAIR_COUNT_MIN} ~ ${ANTONYM_PAIR_COUNT_MAX}`,
          "(A)~ 쌍",
        ],
        description:
          "지문 단어와 짝 단어 쌍의 수입니다. 정답(잘못 짝지어진 쌍)은 항상 1개입니다.",
        value: antonymPairCount,
        min: ANTONYM_PAIR_COUNT_MIN,
        max: ANTONYM_PAIR_COUNT_MAX,
        onChange: setAntonymPairCount,
        ariaBase: "antonym pair count",
      });
    }

export function renderContentMatchDetail({ contentMatchAnswerCount, contentMatchAnswerMax, contentMatchOptionCount, contentMatchSettings, setContentMatchAnswerCount, setContentMatchOptionCount, setQuestionTypeSettings }: {
  contentMatchAnswerCount: number;
  contentMatchAnswerMax: number;
  contentMatchOptionCount: number;
  contentMatchSettings: ContentMatchGenerationSettings;
  setContentMatchAnswerCount: (next: number) => void;
  setContentMatchOptionCount: (next: number) => void;
  setQuestionTypeSettings: SetQuestionTypeSettings;
}) {
      const contentMatchPolarityOptions: { value: "일치" | "불일치"; label: string }[] = [
        { value: "불일치", label: "불일치" },
        { value: "일치", label: "일치" },
      ];
      const contentMatchPolarity =
        contentMatchSettings.matchType === "일치" ? "일치" : "불일치";
      return (
        <div className="space-y-1.5 lg:space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">정답 유형</span>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                일치하는 것을 고를지, 일치하지 않는 것을 고를지 정합니다. 기본은 불일치입니다.
              </p>
            </div>
            <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {contentMatchPolarityOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    setQuestionTypeSettings((prev) => ({
                      ...prev,
                      CONTENT_MATCH: {
                        ...(prev.CONTENT_MATCH || {}),
                        matchType: item.value,
                      },
                    }))
                  }
                  className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                    contentMatchPolarity === item.value
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "보기 개수",
            badges: [
              `${CONTENT_MATCH_OPTION_COUNT_MIN} ~ ${CONTENT_MATCH_OPTION_COUNT_MAX}`,
              "진술문",
            ],
            description:
              "학생에게 표시할 내용 일치 진술문 수입니다. 기본값은 5개입니다.",
            value: contentMatchOptionCount,
            min: CONTENT_MATCH_OPTION_COUNT_MIN,
            max: CONTENT_MATCH_OPTION_COUNT_MAX,
            onChange: setContentMatchOptionCount,
            ariaBase: "content match option count",
          })}
          </div>
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${contentMatchAnswerMax}`,
                contentMatchAnswerCount >= 2 ? "복수 정답" : "단일 정답",
              ],
              description:
                "2개 이상이면 복수 정답 문항으로 생성하고 모든 정답 라벨을 함께 저장합니다.",
              value: contentMatchAnswerCount,
              min: CONTENT_MATCH_ANSWER_COUNT_MIN,
              max: contentMatchAnswerMax,
              onChange: setContentMatchAnswerCount,
              ariaBase: "content match answer count",
            })}
          </div>
        </div>
      );
    }

export function renderIrrelevantDetail({ irrelevantSlotCount, setIrrelevantSlotCount }: {
  irrelevantSlotCount: number;
  setIrrelevantSlotCount: (next: number) => void;
}) {
      return renderNumberSetting({
        title: "Option count",
        badges: [
          `${IRRELEVANT_SLOT_COUNT_MIN} ~ ${IRRELEVANT_SLOT_COUNT_MAX}`,
          "Sentence slots",
        ],
        description:
          "Number of numbered sentence choices, including one inserted irrelevant sentence.",
        value: irrelevantSlotCount,
        min: IRRELEVANT_SLOT_COUNT_MIN,
        max: IRRELEVANT_SLOT_COUNT_MAX,
        onChange: setIrrelevantSlotCount,
        ariaBase: "irrelevant option count",
      });
    }

export function renderSummaryCompleteDetail({ setSummaryCompleteBlankCount, summaryCompleteBlankCount }: {
  setSummaryCompleteBlankCount: (next: number) => void;
  summaryCompleteBlankCount: number;
}) {
      return renderNumberSetting({
        title: "Blank count",
        badges: [
          `${SUMMARY_COMPLETE_BLANK_COUNT_MIN} ~ ${SUMMARY_COMPLETE_BLANK_COUNT_MAX}`,
          "Short answer",
        ],
        description:
          "Number of blanks students must fill in the short-answer summary.",
        value: summaryCompleteBlankCount,
        min: SUMMARY_COMPLETE_BLANK_COUNT_MIN,
        max: SUMMARY_COMPLETE_BLANK_COUNT_MAX,
        onChange: setSummaryCompleteBlankCount,
        ariaBase: "summary complete blank count",
      });
    }

export function renderSummaryWritingDetail({ patchTypeSettings, questionTypeSettings }: {
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
}) {
      const sw = (questionTypeSettings.SUMMARY_WRITING || {}) as Record<
        string,
        unknown
      >;
      // 미설정은 INTERMEDIATE 기본값으로 표시(resolve와 일치). 강사가 만진 값만 저장됨.
      const glossEnabled = sw.glossEnabled !== false;
      const wordBankEnabled = sw.wordBankEnabled !== false;
      const wordBankUsage =
        sw.wordBankUsage === "useAll" || sw.wordBankUsage === "usePartial"
          ? (sw.wordBankUsage as string)
          : "usePartial";
      const wordBankFidelity =
        sw.wordBankFidelity === "inflected" ? "inflected" : "verbatim";
      const clueMode =
        typeof sw.clueMode === "string" &&
        ["none", "firstLetter", "skeleton", "wordCount"].includes(
          sw.clueMode as string,
        )
          ? (sw.clueMode as string)
          : "none";
      const targetWordsMode =
        sw.targetWordsMode === "exact" || sw.targetWordsMode === "hidden"
          ? (sw.targetWordsMode as string)
          : "approx";
      const blankAssignment =
        sw.blankAssignment === "shared" ? "shared" : "separate";
      const blankCount = Math.min(
        SUMMARY_WRITING_BLANK_COUNT_MAX,
        Math.max(
          SUMMARY_WRITING_BLANK_COUNT_MIN,
          Math.round(Number(sw.blankCount) || SUMMARY_WRITING_BLANK_COUNT_DEFAULT),
        ),
      );
      const boxDistractors = Math.min(
        SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
        Math.max(
          SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
          Math.round(
            Number(sw.boxDistractors) || SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT,
          ),
        ),
      );
      const targetWordsPerBlank = Math.min(
        SUMMARY_WRITING_TARGET_WORDS_MAX,
        Math.max(
          SUMMARY_WRITING_TARGET_WORDS_MIN,
          Math.round(
            Number(sw.targetWordsPerBlank) || SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
          ),
        ),
      );
      // 호환성 매트릭스(바이블 §3) — 회색/비활성 처리.
      const isMultiBlank = blankCount >= 2;
      const isUsePartial = wordBankUsage === "usePartial";
      const distractorsDisabled = !wordBankEnabled || !isUsePartial;
      const targetWordsModeForExactDisabled =
        wordBankEnabled && wordBankUsage === "useAll";
      const targetStepperDisabled = targetWordsMode === "hidden";

      return (
        <div className="space-y-1.5 lg:space-y-3">
          {/* 빈칸 수 */}
          {renderNumberSetting({
            title: "빈칸 개수",
            badges: [
              `${SUMMARY_WRITING_BLANK_COUNT_MIN} ~ ${SUMMARY_WRITING_BLANK_COUNT_MAX}`,
              isMultiBlank ? "(A)(B) 다중 빈칸" : "단일 빈칸",
            ],
            description:
              "학생이 영어로 영작할 요약문 빈칸 수입니다. 한 빈칸에 여러 단어 어구가 들어갑니다.",
            value: blankCount,
            min: SUMMARY_WRITING_BLANK_COUNT_MIN,
            max: SUMMARY_WRITING_BLANK_COUNT_MAX,
            onChange: (next: number) =>
              patchTypeSettings("SUMMARY_WRITING", {
                blankCount: Math.min(
                  SUMMARY_WRITING_BLANK_COUNT_MAX,
                  Math.max(SUMMARY_WRITING_BLANK_COUNT_MIN, Math.round(next)),
                ),
              }),
            ariaBase: "summary writing blank count",
          })}

          {/* 해석 제공 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderToggleSetting({
              title: "해석 제공",
              description:
                "요약문의 한국어 해석([해석] 박스)을 제공합니다. 끄면 추론 난도가 올라갑니다.",
              checked: glossEnabled,
              onChange: () =>
                patchTypeSettings("SUMMARY_WRITING", {
                  glossEnabled: !glossEnabled,
                }),
            })}
          </div>

          {/* 보기 제공 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderToggleSetting({
              title: "보기 제공",
              description:
                "영작에 쓸 단어 보기([보기] 칩)를 제공합니다. 끄면 백지 영작이 됩니다.",
              checked: wordBankEnabled,
              onChange: () =>
                patchTypeSettings("SUMMARY_WRITING", {
                  wordBankEnabled: !wordBankEnabled,
                }),
            })}
          </div>

          {/* 보기 사용 규칙 — 보기 off면 비활성 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "보기 사용 규칙",
              description:
                "모두 사용은 보기 단어를 전부 한 번씩, 필요한 것만은 미끼가 섞여 골라 쓰게 합니다.",
              disabled: !wordBankEnabled,
              disabledHint: "보기를 제공할 때만 설정할 수 있습니다.",
              value: wordBankUsage,
              options: [
                { value: "useAll", label: "모두 사용" },
                { value: "usePartial", label: "필요한 것만" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("SUMMARY_WRITING", { wordBankUsage: next }),
            })}
          </div>

          {/* 미끼 수 — 보기 off 또는 usePartial 아니면 비활성 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "미끼 단어 수",
              badges: [
                `${SUMMARY_WRITING_DISTRACTOR_COUNT_MIN} ~ ${SUMMARY_WRITING_DISTRACTOR_COUNT_MAX}`,
                distractorsDisabled ? "비활성" : "함정",
              ],
              description: distractorsDisabled
                ? "보기를 '필요한 것만'으로 설정해야 미끼를 넣을 수 있습니다."
                : "정답에 쓰이지 않는 미끼 단어 수입니다. 미끼는 정답 단어의 동의어·활용형으로 만듭니다.",
              value: distractorsDisabled ? 0 : boxDistractors,
              min: SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
              max: distractorsDisabled
                ? SUMMARY_WRITING_DISTRACTOR_COUNT_MIN
                : SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
              onChange: (next: number) => {
                if (distractorsDisabled) return;
                patchTypeSettings("SUMMARY_WRITING", {
                  boxDistractors: Math.min(
                    SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
                    Math.max(
                      SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
                      Math.round(next),
                    ),
                  ),
                });
              },
              ariaBase: "summary writing distractor count",
            })}
          </div>

          {/* 보기 어형 충실도 — 보기 off면 비활성 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "보기 어형",
              description:
                "그대로는 주어진 형태를 그대로, 어형 변형은 시제·수 등을 바꿔 쓰게 합니다.",
              disabled: !wordBankEnabled,
              disabledHint: "보기를 제공할 때만 설정할 수 있습니다.",
              value: wordBankFidelity,
              options: [
                { value: "verbatim", label: "그대로" },
                { value: "inflected", label: "어형 변형" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("SUMMARY_WRITING", {
                  wordBankFidelity: next,
                }),
            })}
          </div>

          {/* 단서 방식 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "단서 방식",
              description:
                "앞글자는 각 단어 첫 글자를, 골격은 구조 골격을, 단어수는 단어 개수만 제공합니다.",
              value: clueMode,
              options: [
                { value: "none", label: "없음" },
                { value: "firstLetter", label: "앞글자" },
                { value: "skeleton", label: "골격" },
                { value: "wordCount", label: "단어수" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("SUMMARY_WRITING", { clueMode: next }),
            })}
          </div>

          {/* 목표 단어수 표시 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "목표 단어수 표시",
              description: targetWordsModeForExactDisabled
                ? "보기를 모두 사용할 땐 '정확히'는 정답 단어수를 누설하므로 쓸 수 없습니다."
                : "정확히는 'N단어', 약은 '약 N단어', 숨김은 표시하지 않습니다.",
              value: targetWordsMode,
              options: [
                {
                  value: "exact",
                  label: targetWordsModeForExactDisabled ? "정확히(불가)" : "정확히",
                },
                { value: "approx", label: "약" },
                { value: "hidden", label: "숨김" },
              ],
              onChange: (next: string) => {
                // #5: useAll이면 exact 금지 — approx로 강등.
                const safe =
                  next === "exact" && targetWordsModeForExactDisabled
                    ? "approx"
                    : next;
                patchTypeSettings("SUMMARY_WRITING", { targetWordsMode: safe });
              },
            })}
          </div>

          {/* 빈칸당 목표 단어수 스테퍼 — hidden이면 비활성 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "빈칸당 목표 단어수",
              badges: [
                `${SUMMARY_WRITING_TARGET_WORDS_MIN} ~ ${SUMMARY_WRITING_TARGET_WORDS_MAX}`,
                targetStepperDisabled ? "숨김" : "단어",
              ],
              description: targetStepperDisabled
                ? "목표 단어수 표시를 '숨김'으로 두면 학생에게 표시되지 않습니다."
                : "각 빈칸의 목표 단어 수입니다. 빈칸선 길이에는 반영되지 않습니다.",
              value: targetWordsPerBlank,
              min: SUMMARY_WRITING_TARGET_WORDS_MIN,
              max: SUMMARY_WRITING_TARGET_WORDS_MAX,
              onChange: (next: number) =>
                patchTypeSettings("SUMMARY_WRITING", {
                  targetWordsPerBlank: Math.min(
                    SUMMARY_WRITING_TARGET_WORDS_MAX,
                    Math.max(
                      SUMMARY_WRITING_TARGET_WORDS_MIN,
                      Math.round(next),
                    ),
                  ),
                }),
              ariaBase: "summary writing target words",
            })}
          </div>

          {/* 보기 배분 — 빈칸 1개면 비활성 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "보기 배분",
              description:
                "분리는 빈칸마다 단어를 따로, 공유는 보기를 모든 빈칸이 함께 나눠 씁니다.",
              disabled: !isMultiBlank,
              disabledHint: "빈칸이 2개 이상일 때만 설정할 수 있습니다.",
              value: blankAssignment,
              options: [
                { value: "separate", label: "분리" },
                { value: "shared", label: "공유" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("SUMMARY_WRITING", { blankAssignment: next }),
            })}
          </div>
        </div>
      );
    }

export function renderTopicSentenceWritingDetail({ patchTypeSettings, questionTypeSettings, difficulty }: {
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
  difficulty: PanelDifficulty | undefined;
}) {
      // 미설정 옵션은 "선택한 난이도의 프리셋"으로 표시한다(SUMMARY_WRITING이 고정 중급
      // 폴백을 쓰는 것과 다른 핵심 요구사항). resolve가 강사 설정값 우선 + 미설정은
      // 난이도 프리셋 + 호환성 매트릭스(F)까지 적용하므로, 화면에 보이는 값 = 실제 생성될 값.
      // → 기본/중급/킬러를 바꾸면 패널 값이 눈에 띄게 달라진다.
      const raw = (questionTypeSettings.TOPIC_SENTENCE_WRITING || {}) as Record<
        string,
        unknown
      >;
      // 이 유형의 실제 난이도(미설정이면 전역/기본 난이도). resolve의 fallbackDifficulty로 넘긴다.
      const effDiff =
        (raw.difficulty as "BASIC" | "INTERMEDIATE" | "KILLER" | undefined) ??
        difficulty ??
        "INTERMEDIATE";
      const r = resolveTopicSentenceWritingSettings(raw, effDiff);

      // 호환성 매트릭스(바이블 §2·§3) — 회색/비활성 처리.
      const isCloze = r.mode === "cloze";
      // 빈칸 개수는 cloze 전용. scrambled이면 비활성.
      const blankCountDisabled = !isCloze;
      // cloze + 명사구는 빈칸 1개 강제(다중 빈칸은 문장형만) — resolve가 이미 1로 강등하지만 UI도 잠근다.
      const blankCountLockedByNounPhrase = isCloze && r.topicForm === "nounPhrase";

      return (
        <div className="space-y-1.5 lg:space-y-3">
          {/* 출제 방식 — 두 축의 첫 번째. 최상단. */}
          {renderSegSetting({
            title: "출제 방식",
            description:
              "배열은 주어진 단어를 올바른 순서로 배열, 빈칸완성은 주제문 빈칸을 [보기]로 채웁니다.",
            value: r.mode,
            options: [
              { value: "scrambled", label: "배열" },
              { value: "cloze", label: "빈칸완성" },
            ],
            onChange: (next: string) =>
              patchTypeSettings("TOPIC_SENTENCE_WRITING", { mode: next }),
          })}

          {/* 주제 형태 — 두 축의 두 번째. */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "주제 형태",
              description:
                "주제문은 완전한 문장(12~14단어), 명사구는 동사 없는 학술 명사구(12단어 이내)로 출제합니다.",
              value: r.topicForm,
              options: [
                { value: "sentence", label: "주제문" },
                { value: "nounPhrase", label: "명사구" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", { topicForm: next }),
            })}
          </div>

          {/* 주제 힌트 제공 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderToggleSetting({
              title: "주제 힌트 제공",
              description:
                "주제의 한국어 단서([주제 힌트] 박스)를 제공합니다. 끄면 해석 없이 풀어야 해 난도가 올라갑니다.",
              checked: r.hintEnabled,
              onChange: () =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", {
                  hintEnabled: !r.hintEnabled,
                }),
            })}
          </div>

          {/* 제시어 입도 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "제시어 입도",
              description:
                "구 단위는 여러 단어를 한 칩으로(쉬움), 단어 단위는 단어 하나씩 칩으로(어려움) 제시합니다.",
              value: r.chunking === "word" ? "word" : "chunk",
              options: [
                { value: "chunk", label: "구 단위" },
                { value: "word", label: "단어 단위" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", { chunking: next }),
            })}
          </div>

          {/* 미끼 단어 수 — 제시어/보기는 항상 있으므로 항상 활성. */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "미끼 단어 수",
              badges: [
                `${TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN} ~ ${TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX}`,
                r.distractors > 0 ? "함정" : "미끼 없음",
              ],
              description:
                "정답에 쓰이지 않는 미끼 제시어 수입니다. 미끼는 정답 단어의 동의어·활용형으로 만들어 '다 끼우기'를 막습니다.",
              value: r.distractors,
              min: TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN,
              max: TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX,
              onChange: (next: number) =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", {
                  distractors: Math.min(
                    TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX,
                    Math.max(
                      TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN,
                      Math.round(next),
                    ),
                  ),
                }),
              ariaBase: "topic sentence writing distractor count",
            })}
          </div>

          {/* 제시어 어형 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "제시어 어형",
              description:
                "그대로는 주어진 형태를 그대로, 어형 변형은 시제·수 등을 바꿔 써야 정답이 됩니다.",
              value: r.fidelity === "inflected" ? "inflected" : "verbatim",
              options: [
                { value: "verbatim", label: "그대로" },
                { value: "inflected", label: "어형 변형" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", { fidelity: next }),
            })}
          </div>

          {/* 빈칸 개수 — cloze 전용. scrambled이면 비활성. */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "빈칸 개수",
              badges: [
                `${TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN} ~ ${TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX}`,
                blankCountDisabled
                  ? "빈칸완성 전용"
                  : r.blankCount >= 2
                    ? "(A)(B) 다중 빈칸"
                    : "단일 빈칸",
              ],
              description: blankCountDisabled
                ? "출제 방식을 '빈칸완성'으로 설정해야 빈칸 개수를 정할 수 있습니다."
                : blankCountLockedByNounPhrase
                  ? "주제 형태가 '명사구'이면 빈칸은 1개로 고정됩니다. 다중 빈칸은 '주제문'에서만 가능합니다."
                  : "주제문에서 학생이 영작할 빈칸 수입니다. 한 빈칸에 여러 단어가 들어갑니다.",
              value: blankCountDisabled ? 1 : r.blankCount,
              min: TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN,
              max:
                blankCountDisabled || blankCountLockedByNounPhrase
                  ? TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN
                  : TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX,
              onChange: (next: number) => {
                if (blankCountDisabled) return;
                patchTypeSettings("TOPIC_SENTENCE_WRITING", {
                  blankCount: Math.min(
                    TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX,
                    Math.max(
                      TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN,
                      Math.round(next),
                    ),
                  ),
                });
              },
              ariaBase: "topic sentence writing blank count",
            })}
          </div>

          {/* 주제 출처 */}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "주제 출처",
              description:
                "명시는 지문에 그대로 드러난 주제, 환언은 같은 뜻을 바꿔 쓴 주제, 추론은 상위 명제로 끌어올린 주제로 출제합니다.",
              value: r.sourceMode,
              options: [
                { value: "explicit", label: "명시" },
                { value: "paraphrase", label: "환언" },
                { value: "inference", label: "추론" },
              ],
              onChange: (next: string) =>
                patchTypeSettings("TOPIC_SENTENCE_WRITING", { sourceMode: next }),
            })}
          </div>
        </div>
      );
    }

export function renderGrammarChoiceComboDetail({ grammarChoiceComboSettings, patchTypeSettings }: {
  grammarChoiceComboSettings: GrammarChoiceComboGenerationSettings;
  patchTypeSettings: PatchTypeSettings;
}) {
      return (
        <div className="space-y-1.5 lg:space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  출제 포인트 집중
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {grammarChoiceComboSettings.pointFocus
                    ? "핵심 6개 집중"
                    : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  관계사·수일치·분사·to/-ing
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                켜면 세 네모의 정답(올바른 표현) 어법 포인트를 기출 최빈출
                포인트(관계사·수일치·to부정사/동명사·분사·대명사·형용사/부사)에
                집중합니다. 끄면 다양한 포인트로 폭넓게 돌려가며 출제합니다.
              </p>
              {grammarChoiceComboSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  집중 모드는 출제 포인트를 좁히므로, 같은 지문에서 많은
                  문항을 생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!grammarChoiceComboSettings.pointFocus}
              onClick={() =>
                patchTypeSettings("GRAMMAR_CHOICE_COMBO", {
                  pointFocus: !grammarChoiceComboSettings.pointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                grammarChoiceComboSettings.pointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  grammarChoiceComboSettings.pointFocus
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>        </div>
      );
    }

export function renderGrammarErrorDetail({ grammarAnswerCount, grammarAnswerMax, grammarErrorSettings, grammarMarkerCount, patchTypeSettings, setGrammarAnswerCount, setGrammarMarkerCount }: {
  grammarAnswerCount: number;
  grammarAnswerMax: number;
  grammarErrorSettings: GrammarErrorGenerationSettings;
  grammarMarkerCount: number;
  patchTypeSettings: PatchTypeSettings;
  setGrammarAnswerCount: (next: number) => void;
  setGrammarMarkerCount: (next: number) => void;
}) {
      return (
        <div className="space-y-1.5 lg:space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  밑줄 표현 개수
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  5 ~ 10개
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  표시 위치
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                지문에서 검토할 밑줄 표현 수입니다. 정답 수는 아래에서 따로
                지정합니다.
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setGrammarMarkerCount(grammarMarkerCount - 1)}
                disabled={grammarMarkerCount <= GRAMMAR_MARKER_COUNT_MIN}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="밑줄 표현 개수 줄이기"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
                {grammarMarkerCount}
              </span>
              <button
                type="button"
                onClick={() => setGrammarMarkerCount(grammarMarkerCount + 1)}
                disabled={grammarMarkerCount >= GRAMMAR_MARKER_COUNT_MAX}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="밑줄 표현 개수 늘리기"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  정답 개수
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  1 ~ {grammarAnswerMax}개
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {grammarAnswerCount >= 2 ? "모두 고르기" : "단일 정답"}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 어법상
                틀린 것을 모두 고르라고 안내합니다.
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setGrammarAnswerCount(grammarAnswerCount - 1)}
                disabled={grammarAnswerCount <= GRAMMAR_ANSWER_COUNT_MIN}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="정답 개수 줄이기"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
                {grammarAnswerCount}
              </span>
              <button
                type="button"
                onClick={() => setGrammarAnswerCount(grammarAnswerCount + 1)}
                disabled={grammarAnswerCount >= grammarAnswerMax}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="정답 개수 늘리기"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  출제 포인트 집중
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {grammarErrorSettings.pointFocus ? "핵심 6개 집중" : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  관계사·수일치·분사·to/-ing
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                켜면 정답 오류를 기출 최빈출 포인트(관계사·수일치·
                to부정사/동명사·분사·대명사·형용사/부사)에 집중합니다. 끄면
                다양한 포인트로 폭넓게 돌려가며 출제합니다.
              </p>
              {grammarErrorSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  집중 모드는 출제 포인트를 좁히므로, 같은 지문에서 많은
                  문항을 생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!grammarErrorSettings.pointFocus}
              onClick={() =>
                patchTypeSettings("GRAMMAR_ERROR", {
                  pointFocus: !grammarErrorSettings.pointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                grammarErrorSettings.pointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  grammarErrorSettings.pointFocus
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>        </div>
      );
    }

export function renderGrammarCorrectionDetail({ grammarCorrectionErrorCount, grammarCorrectionSettings, patchTypeSettings, setGrammarCorrectionErrorCount }: {
  grammarCorrectionErrorCount: number;
  grammarCorrectionSettings: GrammarCorrectionGenerationSettings;
  patchTypeSettings: PatchTypeSettings;
  setGrammarCorrectionErrorCount: (next: number) => void;
}) {
      return (
        <div className="space-y-1.5 lg:space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  틀린 밑줄 개수
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  1 ~ 5개
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  밑줄=오류
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                지문에 밑줄 칠 문장/절 구간 수입니다. 선택한 모든 밑줄 구간 안에는
                어법 오류가 숨어 있어야 합니다.
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setGrammarCorrectionErrorCount(grammarCorrectionErrorCount - 1)
                }
                disabled={
                  grammarCorrectionErrorCount <=
                  GRAMMAR_CORRECTION_ERROR_COUNT_MIN
                }
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="틀린 밑줄 개수 줄이기"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
                {grammarCorrectionErrorCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setGrammarCorrectionErrorCount(grammarCorrectionErrorCount + 1)
                }
                disabled={
                  grammarCorrectionErrorCount >=
                  GRAMMAR_CORRECTION_ERROR_COUNT_MAX
                }
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="틀린 밑줄 개수 늘리기"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  출제 포인트 집중
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {grammarCorrectionSettings.pointFocus
                    ? "핵심 6개 집중"
                    : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  관계사·수일치·분사·to/-ing
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                켜면 고쳐 쓸 오류를 기출 최빈출 포인트(관계사·수일치·
                to부정사/동명사·분사·대명사·형용사/부사)에 집중합니다. 끄면
                다양한 포인트로 폭넓게 돌려가며 출제합니다.
              </p>
              {grammarCorrectionSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  집중 모드는 출제 포인트를 좁히므로, 같은 지문에서 많은
                  문항을 생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!grammarCorrectionSettings.pointFocus}
              onClick={() =>
                patchTypeSettings("GRAMMAR_CORRECTION", {
                  pointFocus: !grammarCorrectionSettings.pointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                grammarCorrectionSettings.pointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  grammarCorrectionSettings.pointFocus
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>        </div>
      );
    }

export function renderSummaryCompleteMcDetail({ setSummaryCompleteMcBlankCount, summaryCompleteMcBlankCount }: {
  setSummaryCompleteMcBlankCount: (next: number) => void;
  summaryCompleteMcBlankCount: number;
}) {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-800">
                요약 빈칸 개수
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                2 ~ 4개
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                객관식 조합
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
              기본값은 2개입니다. 3개 이상이면 각 선지에 모든 빈칸 값을 맞춰
              생성합니다.
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setSummaryCompleteMcBlankCount(summaryCompleteMcBlankCount - 1)
              }
              disabled={
                summaryCompleteMcBlankCount <=
                SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="요약 빈칸 개수 줄이기"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
              {summaryCompleteMcBlankCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setSummaryCompleteMcBlankCount(summaryCompleteMcBlankCount + 1)
              }
              disabled={
                summaryCompleteMcBlankCount >=
                SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="요약 빈칸 개수 늘리기"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

export function renderBlankInferenceDetail({ blankInferenceBlankCount, blankSettings, setBlankInferenceBlankCount, updateBlankSetting }: {
  blankInferenceBlankCount: number;
  blankSettings: BlankInferenceGenerationSettings;
  setBlankInferenceBlankCount: (next: number) => void;
  updateBlankSetting: (next: Partial<BlankInferenceGenerationSettings>) => void;
}) {
      const isMultiBlank = blankInferenceBlankCount >= 2;
      return (
        <div className="space-y-1.5 lg:space-y-3">
          {renderNumberSetting({
            title: "빈칸 개수",
            badges: [
              `${BLANK_INFERENCE_BLANK_COUNT_MIN} ~ ${BLANK_INFERENCE_BLANK_COUNT_MAX}`,
              isMultiBlank ? "(A)(B) 조합 보기" : "단일 빈칸",
            ],
            description:
              "기본값 1개는 수능형 단일 빈칸입니다. 2개 이상이면 (A)(B)(C) 빈칸과 조합 보기로 생성합니다.",
            value: blankInferenceBlankCount,
            min: BLANK_INFERENCE_BLANK_COUNT_MIN,
            max: BLANK_INFERENCE_BLANK_COUNT_MAX,
            onChange: setBlankInferenceBlankCount,
            ariaBase: "blank inference blank count",
          })}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderSegSetting({
              title: "빈칸 단위",
              description:
                "빈칸으로 잡는 표현의 크기입니다. 자동은 모델이 지문 논리에 맞춰 고르고, 단어·구·절은 그 크기로 빈칸과 선지를 강제합니다.",
              value:
                (blankSettings.blankGranularity as string | undefined) || "auto",
              options: [
                { value: "auto", label: "자동" },
                { value: "word", label: "단어" },
                { value: "phrase", label: "구" },
                { value: "clause", label: "절" },
              ],
              onChange: (next) =>
                updateBlankSetting({
                  blankGranularity: next as
                    | "auto"
                    | "word"
                    | "phrase"
                    | "clause",
                }),
            })}
          </div>
          {(() => {
            // 킬러 연동 시각화(26-07-23): 이 유형의 난이도가 킬러이고 변형이
            // ON 이면 토글·라벨을 킬러 레드로 — "킬러 = 패러프레이즈 공예"라는
            // 연동을 한눈에 보여준다. 킬러인데 수동 OFF 면 안내만 남긴다.
            // 포함 관계 시각화(26-07-23 사용자 결정): 부정-부정은 "부정
            // 패러프레이즈"라 패러프레이즈를 내포한다 — 부정-부정 ON 이면 이
            // 토글도 켜진 상태(잠금)로 표시한다. 저장값(paraphraseAnswer)은
            // 건드리지 않아, 부정-부정을 끄면 원래 설정으로 복귀한다.
            const isKillerType = blankSettings.difficulty === "KILLER";
            const dnActive = !isMultiBlank && !!blankSettings.doubleNegative;
            const paraActive = !!blankSettings.paraphraseAnswer || dnActive;
            const killerLinked = isKillerType && paraActive && !dnActive;
            return (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[12px] font-bold ${killerLinked ? "text-rose-600" : "text-slate-800"}`}
                >
                  빈칸 변형
                </span>
                {killerLinked ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-rose-500"
                      aria-hidden="true"
                    />
                    킬러 연동
                  </span>
                ) : null}
                {dnActive ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                    부정-부정에 포함
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  정답 패러프레이즈
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도별 어휘
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  오답 균질화
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                정답 선지를 원문 그대로 내지 않고, 지문 의미를 보존한
                패러프레이즈로 생성합니다.
              </p>
              {killerLinked ? (
                <p className="mt-1 text-[10px] leading-snug text-rose-500">
                  킬러 난이도 선택으로 자동 활성화됐습니다 — 원문 그대로
                  출제하려면 끌 수 있습니다.
                </p>
              ) : null}
              {dnActive ? (
                <p className="mt-1 text-[10px] leading-snug text-blue-500">
                  부정-부정 변형이 패러프레이즈를 포함하므로 함께 활성
                  상태입니다 — 부정-부정을 끄면 원래 설정으로 돌아갑니다.
                </p>
              ) : null}
              {isKillerType && !paraActive ? (
                <p className="mt-1 text-[10px] leading-snug text-rose-500">
                  킬러 문항의 오답 설계는 패러프레이즈 정답에서 상한이 나옵니다
                  — 원문 그대로 출제하려는 경우에만 꺼두세요.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={paraActive}
              disabled={dnActive}
              onClick={() => {
                if (dnActive) return;
                const next = !blankSettings.paraphraseAnswer;
                updateBlankSetting({
                  paraphraseAnswer: next,
                  ...(next ? { doubleNegative: false } : {}),
                });
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                paraActive
                  ? dnActive
                    ? "cursor-not-allowed border-blue-200 bg-blue-400/80"
                    : killerLinked
                      ? "border-rose-300 bg-rose-500"
                      : "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  paraActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
            );
          })()}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[12px] font-bold ${isMultiBlank ? "text-slate-400" : "text-slate-800"}`}
                >
                  부정-부정 빈칸
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  정답 변형
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  부정어 함정
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  킬러형
                </span>
              </div>
              {isMultiBlank ? (
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  빈칸 1개일 때만 사용할 수 있습니다.
                </p>
              ) : null}
              {!isMultiBlank && blankSettings.doubleNegative ? (
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  정답이 부정·결여 표현의 패러프레이즈로 출제됩니다 — 실시간
                  스트리밍 생성.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!isMultiBlank && !!blankSettings.doubleNegative}
              disabled={isMultiBlank}
              onClick={() => {
                const next = !blankSettings.doubleNegative;
                // 포함 관계(26-07-23): 부정-부정이 패러프레이즈를 내포하므로
                // 저장된 paraphraseAnswer 는 건드리지 않는다 — ON 동안은
                // 패러프레이즈 토글이 "포함됨"으로 함께 켜져 보이고, OFF 하면
                // 사용자가 두었던 원래 값으로 복귀한다.
                updateBlankSetting({ doubleNegative: next });
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                isMultiBlank
                  ? "cursor-not-allowed border-slate-200 bg-slate-100"
                  : blankSettings.doubleNegative
                    ? "border-blue-300 bg-blue-500"
                    : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  !isMultiBlank && blankSettings.doubleNegative
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  출제 포인트 집중
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {blankSettings.pointFocus ? "핵심 논리 집중" : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  인과·개념명명·재진술·대조
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                켜면 정답을 기출 최빈출 추론 논리(인과·기제, 추상 개념 명명,
                재진술·환언, 대조 전환)에 집중합니다. 끄면 다양한 논리로 폭넓게
                출제합니다.
              </p>
              {blankSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  집중 모드는 출제 논리를 좁히므로, 같은 지문에서 많은 문항을
                  생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!blankSettings.pointFocus}
              onClick={() =>
                updateBlankSetting({
                  pointFocus: !blankSettings.pointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                blankSettings.pointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  blankSettings.pointFocus ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>        </div>
      );
    }

export function renderVocabChoiceDetail({ patchTypeSettings, questionTypeSettings, setVocabChoiceAnswerCount, setVocabChoiceMarkerCount, vocabChoiceAnswerCount, vocabChoiceAnswerMax, vocabChoiceMarkerCount }: {
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
  setVocabChoiceAnswerCount: (next: number) => void;
  setVocabChoiceMarkerCount: (next: number) => void;
  vocabChoiceAnswerCount: number;
  vocabChoiceAnswerMax: number;
  vocabChoiceMarkerCount: number;
}) {
      const vocabSynonymVariants =
        questionTypeSettings.VOCAB_CHOICE?.synonymVariants === true;
      return (
        <div className="space-y-1.5 lg:space-y-3">
          {renderNumberSetting({
            title: "밑줄 어휘 개수",
            badges: [
              `${VOCAB_CHOICE_MARKER_COUNT_MIN} ~ ${VOCAB_CHOICE_MARKER_COUNT_MAX}`,
              "표시 위치",
            ],
            description:
              "지문에 밑줄 칠 어휘 수입니다. 정답(부적절한 어휘) 수는 아래에서 따로 지정합니다.",
            value: vocabChoiceMarkerCount,
            min: VOCAB_CHOICE_MARKER_COUNT_MIN,
            max: VOCAB_CHOICE_MARKER_COUNT_MAX,
            onChange: setVocabChoiceMarkerCount,
            ariaBase: "vocab choice marker count",
          })}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${vocabChoiceAnswerMax}`,
                vocabChoiceAnswerCount >= 2 ? "모두 고르기" : "단일 정답",
              ],
              description:
                "기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 부적절한 어휘를 모두 고르라고 안내합니다.",
              value: vocabChoiceAnswerCount,
              min: VOCAB_CHOICE_ANSWER_COUNT_MIN,
              max: vocabChoiceAnswerMax,
              onChange: setVocabChoiceAnswerCount,
              ariaBase: "vocab choice answer count",
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                동의어 변형 (암기 무력화)
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  지문 암기 방지
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도 ↑
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                밑줄 친 어휘를 모두 동의어로 바꿔 표시합니다. 지문을 외워도 표면
                매칭으로는 못 풀고 뜻으로 판단해야 합니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vocabSynonymVariants}
              onClick={() =>
                patchTypeSettings("VOCAB_CHOICE", {
                  synonymVariants: !vocabSynonymVariants,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                vocabSynonymVariants
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  vocabSynonymVariants ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      );
    }

export function renderSentenceInsertDetail({ patchTypeSettings, questionTypeSettings, sentenceInsertSlotCount, setSentenceInsertSlotCount }: {
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
  sentenceInsertSlotCount: number;
  setSentenceInsertSlotCount: (next: number) => void;
}) {
      const sentenceInsertParaphrasePrefix =
        questionTypeSettings.SENTENCE_INSERT?.paraphrasePrefix === true;
      const sentenceInsertPointFocus =
        questionTypeSettings.SENTENCE_INSERT?.pointFocus === true;
      return (
        <div className="space-y-1.5 lg:space-y-3">
          {renderNumberSetting({
            title: "삽입 위치 개수",
            badges: [
              `${SENTENCE_INSERT_SLOT_COUNT_MIN} ~ ${SENTENCE_INSERT_SLOT_COUNT_MAX}`,
              "①~ 마커",
            ],
            description:
              "지문에 표시할 삽입 위치(①~) 수입니다. 정답은 항상 1곳이며, 위치 수만큼 지문 문장이 필요해 짧은 지문은 생성에 실패할 수 있습니다.",
            value: sentenceInsertSlotCount,
            min: SENTENCE_INSERT_SLOT_COUNT_MIN,
            max: SENTENCE_INSERT_SLOT_COUNT_MAX,
            onChange: setSentenceInsertSlotCount,
            ariaBase: "sentence insert slot count",
          })}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                주어진 문장 앞부분 변형
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  지문 암기 방지
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도 ↑
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                주어진(삽입) 문장의 앞부분을 같은 의미로 바꿔, 표면 표현을 외워
                푸는 것을 막습니다. 정답 위치는 그대로입니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sentenceInsertParaphrasePrefix}
              onClick={() =>
                patchTypeSettings("SENTENCE_INSERT", {
                  paraphrasePrefix: !sentenceInsertParaphrasePrefix,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                sentenceInsertParaphrasePrefix
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  sentenceInsertParaphrasePrefix ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 lg:pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                출제 포인트 집중
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {sentenceInsertPointFocus ? "핵심 장치 집중" : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  참조 해소·대조 전환
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                켜면 정답 자리를 기출 최빈출 응집장치(지시어·정관사로 앞 문장을
                가리키는 참조 해소, 내용을 뒤집는 대조 전환)로 고정하도록 집중합니다.
                끄면 다양한 응집장치로 폭넓게 출제합니다.
              </p>
              {sentenceInsertPointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                  집중 모드는 출제 장치를 좁히므로, 같은 지문에서 많은 문항을
                  생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sentenceInsertPointFocus}
              onClick={() =>
                patchTypeSettings("SENTENCE_INSERT", {
                  pointFocus: !sentenceInsertPointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                sentenceInsertPointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  sentenceInsertPointFocus ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>        </div>
      );
    }

export function renderSentenceOrderDetail({ patchTypeSettings, questionTypeSettings }: {
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
}) {
      const sentenceOrderPrefixVariationCount = Math.min(
        3,
        Math.max(
          0,
          Math.round(
            Number(
              questionTypeSettings.SENTENCE_ORDER?.prefixVariationCount,
            ) || 0,
          ),
        ),
      );
      return renderNumberSetting({
        title: "앞문장 변형 문단 수",
        badges: [
          "0 ~ 3",
          sentenceOrderPrefixVariationCount > 0 ? "암기 무력화" : "끄기",
        ],
        description:
          "(A)(B)(C) 중 앞 문장을 같은 의미로 변형할 문단 수입니다. 0이면 변형하지 않습니다. 주어진 글과 정답 순서는 그대로 유지됩니다.",
        value: sentenceOrderPrefixVariationCount,
        min: 0,
        max: 3,
        onChange: (next) =>
          patchTypeSettings("SENTENCE_ORDER", {
            prefixVariationCount: Math.min(3, Math.max(0, Math.round(next))),
          }),
        ariaBase: "sentence order prefix variation count",
      });
    }

export function renderPerTypeDifficultyImpl({ typeId, difficulty, patchTypeSettings, questionTypeSettings }: {
  typeId: string;
  difficulty: PanelDifficulty;
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
}) {
    // 캐스트 사유: 인덱스 시그니처 값이 unknown 이라 difficulty 필드만 읽는 형상으로 좁힘(런타임 동일 — ?. 접근 그대로).
    const raw = (
      questionTypeSettings[typeId] as
        | { difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER" }
        | undefined
    )?.difficulty;
    // 미설정이면 기본 난이도(전역 difficulty, 보통 중급)가 선택된 것으로 표시한다.
    const effective = raw ?? difficulty;
    return (
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          난이도 · 이 유형만
        </span>
        <div className="mt-1 lg:mt-1.5 flex h-8 rounded-lg bg-slate-100 p-0.5">
          {DIFFICULTY_TONES.map((d) => {
            const isActive = effective === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() =>
                  patchTypeSettings(typeId, {
                    difficulty: d.value,
                    // 킬러 연동(26-07-23 사용자 결정): 빈칸 킬러의 공예 상한은
                    // 정답 패러프레이즈에서 나온다 — 킬러 선택 시 '빈칸 변형'을
                    // 자동 ON(패러프레이즈는 부정-부정과 배타). 수동으로 다시
                    // 끌 수 있고, 다른 난이도 선택은 설정을 건드리지 않는다.
                    ...(typeId === "BLANK_INFERENCE" && d.value === "KILLER"
                      ? { paraphraseAnswer: true, doubleNegative: false }
                      : {}),
                  })
                }
                className={`flex flex-1 items-center justify-center gap-1 rounded-[6px] text-[12px] transition-all duration-150 ${
                  isActive
                    ? `font-bold shadow-sm ${d.on}`
                    : "font-semibold text-slate-500 hover:text-slate-700"
                }`}
                aria-pressed={isActive}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${d.dot}`}
                  aria-hidden="true"
                />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

// 유형 타일 "포인트 짚어주기" 진입 컨트롤 (point-picker-design.md §4) —
// POINT_PICKER_CONFIG 등재 유형 타일에 항상 렌더한다. 포인트가 없으면 과녁
// 아이콘 버튼, 있으면 과녁+개수 배지 — 둘 다 클릭 시 그 유형의 픽커로 진입한다.
// 콜백 없는 호출자(픽커 미배선 패널)·미등재 유형은 렌더하지 않는다(죽은 버튼 0).
export function renderTypePointBadge({ typeId, pointCount, onOpenPointPicker, questionTypeSettings }: {
  typeId: string;
  pointCount: number;
  onOpenPointPicker: ((typeId: string) => void) | undefined;
  questionTypeSettings: QuestionTypeGenerationSettings | undefined;
}) {
      if (typeof onOpenPointPicker !== "function") return null;
      if (!resolvePointPickerMeta(typeId, questionTypeSettings?.[typeId])) return null;
      const count = Math.max(0, Math.round(Number(pointCount) || 0));
      const open = (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onOpenPointPicker(typeId);
      };
      if (count <= 0) {
        return (
          <button
            type="button"
            onClick={open}
            title="포인트 짚어주기 — 지문에서 출제 포인트를 직접 지정"
            aria-label="포인트 짚어주기"
            className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={open}
          title="포인트 짚어주기 다시 열기"
          aria-label={`포인트 ${count}개 — 포인트 짚어주기 다시 열기`}
          className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-blue-50 px-1.5 text-[10px] font-bold tabular-nums text-blue-700 transition-colors hover:bg-blue-100"
        >
          <Crosshair className="size-3 shrink-0" aria-hidden="true" />
          포인트 {count}
        </button>
      );
    }

export function renderTypeDetailContentImpl({ typeId, generationPlan, getTypeOptionLanguage, getTypeStemLanguage, patchTypeSettings, questionTypeSettings, renderTypeNumericDetailContent, setTypeLanguage }: {
  typeId: string;
  generationPlan: QuestionGenerationPlan;
  getTypeOptionLanguage: (typeId: string) => string;
  getTypeStemLanguage: (typeId: string) => string;
  patchTypeSettings: (typeId: string, patch: Record<string, unknown>) => void;
  questionTypeSettings: QuestionTypeGenerationSettings;
  renderTypeNumericDetailContent: (typeId: string) => ReactNode;
  setTypeLanguage: (
    typeId: string,
    key: "stemLanguage" | "optionLanguage",
    next: "ko" | "en",
  ) => void;
}) {
    const numericContent = renderTypeNumericDetailContent(typeId);
    const languageScope = getQuestionLanguageToggleScope(typeId);
    // 이원 티어 복귀 UI(26-07-22, O213): 유형별 생성 플랜(일반/프리미엄) 피커.
    // 단일상품 때 제거했던 원형(6dd476d8 이전)을 SHOW_MODEL_SELECTOR 플래그
    // 게이트로 복원 — 노출하려면 클라 NEXT_PUBLIC_SHOW_MODEL_SELECTOR=true 와
    // 서버 QUESTION_GENERATION_SINGLE_TIER=off 를 함께 켜야 한다(서버 클램프가
    // 살아 있으면 피커를 켜도 전 요청이 STANDARD 로 접힌다).
    const typePlan = readQuestionTypeGenerationPlanSetting(
      questionTypeSettings[typeId],
      generationPlan,
    );
    return (
      <div className="space-y-1.5 lg:space-y-3">
        {FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? (
          <div
            className={
              numericContent
                ? "border-b border-slate-100 pb-1.5 lg:pb-3"
                : undefined
            }
          >
            <div className="mb-1 lg:mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              생성 플랜 · 이 유형만
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["STANDARD", "PREMIUM"] as const).map((planId) => {
                const plan = QUESTION_GENERATION_PLANS[planId];
                const active = typePlan === planId;
                const Icon = planId === "PREMIUM" ? Gem : PearlIcon;
                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() =>
                      patchTypeSettings(typeId, { generationPlan: planId })
                    }
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
                    />
                    <span className="truncate text-[12px] font-bold">
                      {plan.shortLabel}
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-bold tabular-nums ${active ? "text-blue-600" : "text-slate-400"}`}
                    >
                      {plan.creditMultiplier}x
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {numericContent}
        <div
          className={
            numericContent
              ? "border-t border-slate-100 pt-1.5 lg:pt-3"
              : undefined
          }
        >
          {renderLanguageSetting({
            title: "질문 언어",
            value: getTypeStemLanguage(typeId),
            description: "학생에게 보이는 질문(지시문) 언어입니다.",
            // 캐스트 사유: renderLanguageSetting onChange 는 string 이지만 실제 값은 내부 토글("ko"/"en")뿐.
            onChange: (value) =>
              setTypeLanguage(typeId, "stemLanguage", value as "ko" | "en"),
          })}
        </div>
        {languageScope === "stem-option" ? (
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderLanguageSetting({
              title: "보기 언어",
              value: getTypeOptionLanguage(typeId),
              description: "학생에게 보이는 보기(선택지) 언어입니다.",
              // 캐스트 사유: renderLanguageSetting onChange 는 string 이지만 실제 값은 내부 토글("ko"/"en")뿐.
              onChange: (value) =>
                setTypeLanguage(typeId, "optionLanguage", value as "ko" | "en"),
            })}
          </div>
        ) : null}
      </div>
    );
  }

export function renderGenericGistDetail({ getGenericAnswerCount, getGenericOptionCount, patchTypeSettings, questionTypeSettings, setGenericAnswerCount, setGenericOptionCount, typeId }: {
  getGenericAnswerCount: (typeId: string) => number;
  getGenericOptionCount: (typeId: string) => number;
  patchTypeSettings: PatchTypeSettings;
  questionTypeSettings: QuestionTypeGenerationSettings;
  setGenericAnswerCount: (typeId: string, next: number) => void;
  setGenericOptionCount: (typeId: string, next: number) => void;
  typeId: string;
}) {
      const genericOptionCount = getGenericOptionCount(typeId);
      const genericAnswerCount = getGenericAnswerCount(typeId);
      const genericAnswerMax = Math.max(1, genericOptionCount - 1);
      const showGistPolarity = supportsGistAnswerPolarity(typeId);
      const gistPolarity =
        (questionTypeSettings[typeId] as { answerPolarity?: string } | undefined)
          ?.answerPolarity === "NEGATIVE"
          ? "NEGATIVE"
          : "POSITIVE";
      const gistPolarityKind =
        typeId === "TITLE" ? "제목" : typeId === "MAIN_IDEA" ? "요지" : "주제";
      const gistPolarityOptions: { value: "POSITIVE" | "NEGATIVE"; label: string }[] = [
        { value: "POSITIVE", label: "적절한 것" },
        { value: "NEGATIVE", label: "적절하지 않은 것" },
      ];
      return (
        <div className="space-y-1.5 lg:space-y-3">
          {showGistPolarity ? (
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[12px] font-bold text-slate-800">정답 유형</span>
                  <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
                    {gistPolarityKind}로 &apos;적절한 것&apos;을 고를지, &apos;적절하지 않은 것&apos;을 고를지 정합니다.
                  </p>
                </div>
                <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {gistPolarityOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => patchTypeSettings(typeId, { answerPolarity: item.value })}
                      className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                        gistPolarity === item.value
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {renderNumberSetting({
            title: "보기 개수",
            badges: [
              `${GENERIC_OPTION_COUNT_MIN} ~ ${GENERIC_OPTION_COUNT_MAX}`,
              "선택지",
            ],
            description: "학생에게 표시할 보기 수입니다. 기본값은 5개입니다.",
            value: genericOptionCount,
            min: GENERIC_OPTION_COUNT_MIN,
            max: GENERIC_OPTION_COUNT_MAX,
            onChange: (next) => setGenericOptionCount(typeId, next),
            ariaBase: `${typeId} option count`,
          })}
          <div className="border-t border-slate-100 pt-1.5 lg:pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${genericAnswerMax}`,
                genericAnswerCount >= 2 ? "모두 고르기" : "단일 정답",
              ],
              description:
                "기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 적절한 것을 모두 고르라고 안내합니다.",
              value: genericAnswerCount,
              min: 1,
              max: genericAnswerMax,
              onChange: (next) => setGenericAnswerCount(typeId, next),
              ariaBase: `${typeId} answer count`,
            })}
          </div>
        </div>
      );
    }

export function renderWorkspaceGenerateButton({ onWorkspaceGenerate, workspaceCreditCost, workspaceGenerating, workspaceSelectedOnlyCount, workspaceTotalQuestions, workspaceVariantCount }: {
  onWorkspaceGenerate: (() => void) | undefined;
  workspaceCreditCost: number;
  workspaceGenerating: boolean;
  workspaceSelectedOnlyCount: number;
  workspaceTotalQuestions: number;
  workspaceVariantCount: number;
}) {
  return (
<div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
          {workspaceVariantCount > 0 ? (
            <p className="mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
              수정·범위 지정된 {workspaceVariantCount}개 지문은 생성 시 ‘변형본’
              지문으로 저장된 뒤 출제됩니다. 원본 지문은 그대로 보존돼요.
            </p>
          ) : null}
          {workspaceSelectedOnlyCount > 0 ? (
            <p className="mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
              워크스페이스 지문과 ‘내 지문’에서 체크한{" "}
              {workspaceSelectedOnlyCount}개 지문을 함께 생성합니다. 이미
              워크스페이스에 있는 지문은 중복 생성하지 않아요.
            </p>
          ) : null}
          <Button
            data-generate-tour="generate-button"
            className={`h-12 w-full min-w-0 rounded-xl px-3 text-[14px] font-bold whitespace-normal transition-all duration-200 ${
              workspaceTotalQuestions > 0 && !workspaceGenerating
                ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
            onClick={() => {
              dispatchGenerateTourMilestone("question-generation-started");
              onWorkspaceGenerate?.();
            }}
            disabled={workspaceTotalQuestions === 0 || workspaceGenerating}
          >
            {workspaceGenerating ? (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <Cpu className="w-4.5 h-4.5 animate-pulse" />
                <span className="min-w-0 truncate">생성 중…</span>
              </span>
            ) : workspaceTotalQuestions > 0 ? (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
                <Cpu className="w-4.5 h-4.5" />
                <span className="min-w-0 truncate">
                  {`${workspaceTotalQuestions}문제 생성`}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <Target className="w-4.5 h-4.5" />
                <span className="min-w-0 truncate">유형을 선택하세요</span>
              </span>
            )}
            {workspaceTotalQuestions > 0 &&
              workspaceCreditCost > 0 &&
              !workspaceGenerating && (
                <CreditCostChip
                  amount={workspaceCreditCost}
                  className="ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                />
              )}
          </Button>
        </div>
  );
}

export function renderLibraryGenerateButton({ canGenerate, generationPlan, handleBatchGenerate, selectedIds, totalQuestions, typeCounts }: {
  canGenerate: boolean;
  generationPlan: QuestionGenerationPlan;
  handleBatchGenerate: () => void;
  selectedIds: Set<string>;
  totalQuestions: number;
  typeCounts: Record<string, number>;
}) {
  return (
<div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
          {(() => {
            // 크레딧 비용 계산 — 유형 지정(MANUAL) 전용.
            const baseCreditCost =
              selectedIds.size *
              Object.entries(typeCounts).reduce((sum, [typeId, value]) => {
                if (value <= 0) return sum;
                const unitCost = VOCAB_GENERATION_TYPE_IDS.has(typeId)
                  ? CREDIT_COSTS.QUESTION_GEN_VOCAB
                  : CREDIT_COSTS.QUESTION_GEN_SINGLE;
                return sum + unitCost * value;
              }, 0);
            const creditCost = getQuestionGenerationCreditCost(
              baseCreditCost,
              generationPlan,
            );
            return (
              <>
                <Button
                  data-generate-tour="generate-button"
                  className={`h-12 w-full min-w-0 rounded-xl px-3 text-[14px] font-bold whitespace-normal transition-all duration-200 ${
                    canGenerate
                      ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    dispatchGenerateTourMilestone(
                      "question-generation-started",
                    );
                    handleBatchGenerate();
                  }}
                  disabled={!canGenerate}
                >
                  {selectedIds.size === 0 ? (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                      <FileText className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        지문을 선택하세요
                      </span>
                    </span>
                  ) : totalQuestions > 0 ? (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
                      <Cpu className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        {selectedIds.size === 1
                          ? `${totalQuestions}문제 생성`
                          : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
                      </span>
                    </span>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                      <Target className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        유형을 선택하세요
                      </span>
                    </span>
                  )}
                  {canGenerate && creditCost > 0 && (
                    <CreditCostChip
                      amount={creditCost}
                      className="ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                    />
                  )}
                </Button>
              </>
            );
          })()}
        </div>
  );
}

export function renderSetBuilderSection({ activePassageId, difficulty, editingRow, generationPlan, onSetMemberOverridesByPresetChange, onSetMemberOverridesChange, onSetPresetChange, onSetPresetCountsChange, selectedIds, setDifficulty, setMemberOverrides, setMemberOverridesByPreset, setPresetCounts, setPresetId, workspaceActive, workspaceRowCount }: {
  activePassageId: string | null;
  difficulty: PanelDifficulty;
  editingRow: boolean;
  generationPlan: QuestionGenerationPlan;
  onSetMemberOverridesByPresetChange:
    | ((next: Record<string, PanelSetMemberOverride[]>) => void)
    | undefined;
  onSetMemberOverridesChange:
    | ((next: PanelSetMemberOverride[]) => void)
    | undefined;
  onSetPresetChange: ((presetId: string | null) => void) | undefined;
  onSetPresetCountsChange: ((next: Record<string, number>) => void) | undefined;
  selectedIds: Set<string>;
  setDifficulty: (v: PanelDifficulty) => void;
  setMemberOverrides: PanelSetMemberOverride[] | undefined;
  setMemberOverridesByPreset: Record<string, PanelSetMemberOverride[]> | undefined;
  setPresetCounts: Record<string, number> | undefined;
  setPresetId: string | null | undefined;
  workspaceActive: boolean;
  workspaceRowCount: number;
}) {
  return (
<>
            {!editingRow && workspaceActive ? (
              <p className="mx-4 mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
                장문 세트는 ‘내 지문’에서 체크한 지문 1개로 동작합니다 —
                워크스페이스에 불러온 지문({workspaceRowCount}개)은 여기에
                사용되지 않아요.
              </p>
            ) : null}
            <div data-generate-tour="set-builder-panel">
              <SetBuilderPanel
                passageId={
                  editingRow
                    ? activePassageId
                    : selectedIds && selectedIds.size > 0
                      ? Array.from(selectedIds)[0]
                      : null
                }
                generationPlan={generationPlan}
                presetId={editingRow ? (setPresetId ?? null) : undefined}
                onPresetChange={editingRow ? onSetPresetChange : undefined}
                presetCounts={editingRow ? (setPresetCounts ?? {}) : undefined}
                onPresetCountsChange={
                  editingRow ? onSetPresetCountsChange : undefined
                }
                difficulty={editingRow ? difficulty : undefined}
                onDifficultyChange={editingRow ? setDifficulty : undefined}
                memberOverrides={editingRow ? (setMemberOverrides ?? []) : undefined}
                onMemberOverridesChange={
                  editingRow ? onSetMemberOverridesChange : undefined
                }
                memberOverridesByPreset={
                  editingRow ? (setMemberOverridesByPreset ?? {}) : undefined
                }
                onMemberOverridesByPresetChange={
                  editingRow ? onSetMemberOverridesByPresetChange : undefined
                }
                embedded={editingRow}
              />
            </div>
          </>
  );
}

