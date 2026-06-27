// @ts-nocheck
"use client";

// generation-config-panel.tsx 의 renderTypeNumericDetailContent 에서 유형별 세부설정 렌더를
// verbatim 추출한 순수 함수들. 컴포넌트 상태/세터/파생값은 인자로 주입(효과는 main 잔류).
// 호출부 인라인 함수호출이라 React reconciliation 동일. @ts-nocheck=원본 충실(인자 타입 생략).

import { renderNumberSetting } from "./setting-fields";
import { ANTONYM_PAIR_COUNT_MAX, ANTONYM_PAIR_COUNT_MIN, CONTENT_MATCH_ANSWER_COUNT_MIN, CONTENT_MATCH_OPTION_COUNT_MAX, CONTENT_MATCH_OPTION_COUNT_MIN } from "@/lib/question-type-generation-settings";

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

