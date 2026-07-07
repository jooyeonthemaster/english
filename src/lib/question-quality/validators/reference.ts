// REFERENCE(지칭 추론) 형식 무결성 게이트 (wave2: reference-marker-shape).
//
// 이 코드베이스의 REFERENCE 계약(question-prompts-mc.ts)은 "단일 대명사 밑줄 +
// 한국어 지칭 대상 선지 5개"다. 후처리(processReference)는 그 계약대로 지문에
// 밑줄을 정확히 1개만 긋는다 — 이는 버그가 아니라 계약이다. 베이스라인 실측 결함
// 은 모델이 계약을 이탈한 두 가지였다:
//   (1) runIndex 24(KILLER): 발문이 "나머지 넷과 다른 것은?"(odd-one-out)인데
//       지문 밑줄은 1개뿐이고, 선지가 지칭 대상을 괄호로 박아 정답을 그대로 노출
//       ("(다른 색들)"×4 vs "(인류)"×1).
//   (2) runIndex 23(INTERMEDIATE): 선지 라벨에 마크업(<b>③</b>)이 새어 들어와
//       정답(④)이 아닌 ③이 시각적으로 마킹된 채 렌더.
// 파이프라인이 만들 수 없는 형태(odd-one-out)와 렌더를 깨는 마크업은 재생성으로
// 몰아내야 하므로 error(RELAXED_BLOCKING) 로 차단한다.
import {
  QuestionQualitySeverity,
  isRecord,
  normalizeComparableText,
  normalizeLabelOnly,
  normalizeText,
} from "../core";

/** "나머지 넷과 다른/가리키는 대상이 다른 하나" 계열 발문 — 다중 밑줄 형식 요구. */
export const REFERENCE_ODD_ONE_OUT_DIRECTION_REGEX = /나머지[^.?!]{0,10}다른|다른\s*하나/;

/** 선지 라벨/텍스트에 허용되지 않는 마크업(HTML 태그·굵게·밑줄 토큰). */
const OPTION_MARKUP_REGEX = /<[^<>]+>|\*\*|__/;

export function validateReferenceQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const problems: string[] = [];

  const direction = normalizeText(question.direction);
  const isOddOneOut = REFERENCE_ODD_ONE_OUT_DIRECTION_REGEX.test(direction);
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord)
    : [];
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const underlineMatches = passageWithUnderline
    ? [...passageWithUnderline.matchAll(/__([^_]+?)__/g)]
    : [];

  // (a) 선지 라벨/텍스트 마크업 오염 — 렌더가 깨지고 엉뚱한 선지가 마킹된다.
  for (const option of options) {
    const labelRaw = typeof option.label === "string" ? option.label : "";
    const textRaw = typeof option.text === "string" ? option.text : "";
    if (OPTION_MARKUP_REGEX.test(labelRaw) || OPTION_MARKUP_REGEX.test(textRaw)) {
      problems.push(`option label/text contains markup ("${(labelRaw + " " + textRaw).trim().slice(0, 40)}")`);
      break;
    }
  }

  // (b) 라벨 파싱 가능성 + correctAnswer 소속.
  if (options.length > 0) {
    const labels = options
      .map((option) => normalizeLabelOnly(option.label))
      .filter(Boolean);
    if (labels.length !== options.length) {
      problems.push("option labels are not clean ①~⑤ / 1~5 labels");
    }
    const answerLabel = normalizeLabelOnly(question.correctAnswer);
    if (answerLabel && labels.length === options.length && !labels.includes(answerLabel)) {
      problems.push(`correctAnswer "${normalizeText(question.correctAnswer)}" is not among the option labels`);
    }
  }

  // (c) 밑줄 마커 개수 계약 — 표준(지칭 대상 고르기)은 정확히 1개,
  //     odd-one-out 발문은 선지 수만큼의 밑줄 인스턴스가 지문에 있어야 한다.
  if (passageWithUnderline) {
    if (isOddOneOut) {
      if (options.length > 0 && underlineMatches.length !== options.length) {
        problems.push(
          `direction asks for the odd one out of ${options.length} underlined pronoun instances, but the passage carries ${underlineMatches.length} underline marker(s)`,
        );
      }
    } else if (underlineMatches.length !== 1) {
      problems.push(
        `expected exactly 1 underlined pronoun in the passage, got ${underlineMatches.length}`,
      );
    } else {
      const pronoun = normalizeComparableText(normalizeText(question.underlinedPronoun));
      const marked = normalizeComparableText(underlineMatches[0][1] ?? "");
      if (pronoun && marked && marked !== pronoun) {
        problems.push(
          `the underlined token "${underlineMatches[0][1]}" does not match underlinedPronoun "${normalizeText(question.underlinedPronoun)}"`,
        );
      }
    }
  }

  // (d) odd-one-out 선지 괄호 정답 노출 — 오답 4개가 동일한 괄호 지칭을 달고
  //     정답만 다른 괄호를 달면 지문 없이 답이 보인다(실측 runIndex 24).
  if (isOddOneOut && options.length >= 4) {
    const parentheticals = options.map((option) => {
      const match = normalizeText(option.text).match(/\(([^()]{1,30})\)\s*$/);
      return match ? match[1] : "";
    });
    if (parentheticals.every(Boolean)) {
      const answerLabel = normalizeLabelOnly(question.correctAnswer);
      const answerIndex = options.findIndex(
        (option) => normalizeLabelOnly(option.label) === answerLabel,
      );
      if (answerIndex >= 0) {
        const others = parentheticals.filter((_, index) => index !== answerIndex);
        if (new Set(others).size === 1 && parentheticals[answerIndex] !== others[0]) {
          problems.push("option parentheticals bake the answer in (all wrong options share one referent, the answer differs)");
        }
      }
    }
  }

  if (problems.length > 0) {
    add(
      "error",
      "reference-marker-shape",
      `REFERENCE marker/option shape violation: ${problems.join("; ")}.`,
    );
  }
}
