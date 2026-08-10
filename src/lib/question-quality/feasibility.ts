// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES, SENTENCE_ORDER_MIN_PARAGRAPH_WORDS, countDisplaySentences, countWords } from "./core";



export interface PassageFeasibility {
  ok: boolean;
  /** 기계적 불가 시 내부 게이트 코드(예: sentence-order-paragraph-too-short) */
  code?: string;
  /** 강사에게 보여줄 한국어 안내 */
  error?: string;
  detail?: Record<string, number>;
}



/**
 * SHIP-FIRST 사전 적합성 게이트 — 차감 전에 **기계적 불가능**만 빠르게 거른다.
 * ⚠️ 출제 포인트의 품질/적합성 판단은 절대 여기서 하지 않는다. 강사가 고른 지문+유형+
 * 난이도는 확정된 의도이며, "포인트가 약하다"는 결코 실패 사유가 아니다(= ship-first).
 * 오직 모델 출력과 무관하게 지문 기하가 그 유형의 형식을 물리적으로 못 만드는 경우만
 * 거른다. 현재 SENTENCE_ORDER 만 활성(3단락 A·B·C, 각 >=2문장/>=24단어가 필요 →
 * <6문장 또는 <72단어면 어떤 출력으로도 불가). 그 외 모든 유형/난이도는 ok(기본 개방).
 * 난이도는 시그니처에만 받아두고 게이트하지 않는다(KILLER를 불가로 취급 금지).
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS6.
 */
export function preflightQuestionFeasibility(
  typeId: string | undefined,
  _difficulty: string | undefined,
  passage: string,
): PassageFeasibility {
  if (typeId === "SENTENCE_ORDER") {
    // 26-07-27 완화(사용자 지시 · 실사용 신고): 종전 하한은 "단락마다 2문장"을
    // 전제해 6문장·72단어를 요구했고, 5문장 지문이 **생성 시도조차 못 하고** 즉시
    // 실패 카드로 떨어졌다. 그런데 물리적 최소는 주어진 글 1문장 + 단락 3개 ×
    // 1문장 = **4문장**이다. "단락마다 2문장"은 품질 선호이지 기하학적 불가능이
    // 아니므로, preflight(차감 전 기계적 불가 판정)의 몫이 아니라 프롬프트·게이트
    // 소관이다. preflight 는 어떤 출력으로도 형식을 만들 수 없는 경우만 막는다.
    const minSentences = 4;
    const sentences = countDisplaySentences(passage);
    if (sentences < minSentences) {
      return {
        ok: false,
        code: "sentence-order-paragraph-too-short",
        error: `글의 순서 유형은 주어진 글 1문장과 세 단락(A·B·C)으로 나눠야 하므로 최소 ${minSentences}문장 이상이 필요합니다. 현재 지문은 ${sentences}문장입니다. 더 긴 지문을 선택하거나 다른 유형을 사용해 주세요.`,
        detail: { sentences, minSentences },
      };
    }
    // 분량 하한도 같은 근거로 완화 — 단락당 12단어면 순서 판단이 성립한다.
    const minWords = 40;
    const words = countWords(passage);
    if (words < minWords) {
      return {
        ok: false,
        code: "sentence-order-paragraph-too-thin",
        error: `글의 순서 유형은 세 단락으로 나눌 만큼 충분한 분량이 필요합니다(최소 약 ${minWords}단어). 현재 지문은 ${words}단어입니다. 더 긴 지문을 선택하거나 다른 유형을 사용해 주세요.`,
        detail: { words, minWords },
      };
    }
  }
  return { ok: true };
}
