// @ts-nocheck
"use client";

// generation-config-panel.tsx 의 renderTypeNumericDetailContent 에서 유형별 세부설정 렌더를
// verbatim 추출한 순수 함수들. 컴포넌트 상태/세터/파생값은 인자로 주입(효과는 main 잔류).
// 호출부 인라인 함수호출이라 React reconciliation 동일. @ts-nocheck=원본 충실(인자 타입 생략).

import { renderNumberSetting, renderSegSetting, renderToggleSetting } from "./setting-fields";
import { ANTONYM_PAIR_COUNT_MAX, ANTONYM_PAIR_COUNT_MIN, CONTENT_MATCH_ANSWER_COUNT_MIN, CONTENT_MATCH_OPTION_COUNT_MAX, CONTENT_MATCH_OPTION_COUNT_MIN, IRRELEVANT_SLOT_COUNT_MAX, IRRELEVANT_SLOT_COUNT_MIN, SUMMARY_COMPLETE_BLANK_COUNT_MAX, SUMMARY_COMPLETE_BLANK_COUNT_MIN, SUMMARY_WRITING_BLANK_COUNT_DEFAULT, SUMMARY_WRITING_BLANK_COUNT_MAX, SUMMARY_WRITING_BLANK_COUNT_MIN, SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT, SUMMARY_WRITING_DISTRACTOR_COUNT_MAX, SUMMARY_WRITING_DISTRACTOR_COUNT_MIN, SUMMARY_WRITING_TARGET_WORDS_DEFAULT, SUMMARY_WRITING_TARGET_WORDS_MAX, SUMMARY_WRITING_TARGET_WORDS_MIN } from "@/lib/question-type-generation-settings";

export function renderAntonymDetail({ antonymPairCount, setAntonymPairCount }) {
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

export function renderContentMatchDetail({ contentMatchAnswerCount, contentMatchAnswerMax, contentMatchOptionCount, contentMatchSettings, setContentMatchAnswerCount, setContentMatchOptionCount, setQuestionTypeSettings }) {
      const contentMatchPolarityOptions: { value: "일치" | "불일치"; label: string }[] = [
        { value: "불일치", label: "불일치" },
        { value: "일치", label: "일치" },
      ];
      const contentMatchPolarity =
        contentMatchSettings.matchType === "일치" ? "일치" : "불일치";
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">정답 유형</span>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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

export function renderIrrelevantDetail({ irrelevantSlotCount, setIrrelevantSlotCount }) {
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

export function renderSummaryCompleteDetail({ setSummaryCompleteBlankCount, summaryCompleteBlankCount }) {
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

export function renderSummaryWritingDetail({ patchTypeSettings, questionTypeSettings }) {
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
        <div className="space-y-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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
          <div className="border-t border-slate-100 pt-3">
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

export function renderGrammarChoiceComboDetail({ grammarChoiceComboSettings, patchTypeSettings }) {
      return (
        <div className="space-y-3">
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
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                켜면 세 네모의 정답(올바른 표현) 어법 포인트를 기출 최빈출
                포인트(관계사·수일치·to부정사/동명사·분사·대명사·형용사/부사)에
                집중합니다. 끄면 다양한 포인트로 폭넓게 돌려가며 출제합니다.
              </p>
              {grammarChoiceComboSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
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
          </div>
        </div>
      );
    }

