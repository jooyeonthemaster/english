// @ts-nocheck
"use client";

// generation-config-panel.tsx 의 renderTypeNumericDetailContent 에서 유형별 세부설정 렌더를
// verbatim 추출한 순수 함수들. 컴포넌트 상태/세터/파생값은 인자로 주입(효과는 main 잔류).
// 호출부 인라인 함수호출이라 React reconciliation 동일. @ts-nocheck=원본 충실(인자 타입 생략).

import { renderNumberSetting } from "./setting-fields";
import { ANTONYM_PAIR_COUNT_MAX, ANTONYM_PAIR_COUNT_MIN } from "@/lib/question-type-generation-settings";

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

