// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, collectCorrectAnswerLabels, collectWrongOptionExplanations, normalizeText } from "../core";



/**
 * 내용 일치 강제 극성 검증 — matchType 설정이 주어졌을 때만 호출(AUTO=미호출).
 * 발문/저장 matchType이 강제 극성과 어긋나면 정답 무효급이므로 error.
 */
export function validateContentMatchPolarity(
  question: Record<string, unknown>,
  matchType: "일치" | "불일치",
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  // 부정(불일치) 패턴을 먼저 본다 — "일치"는 "일치하지 않는"의 부분문자열이므로.
  const asksNonMatch =
    /일치하지\s*않|불일치|않는\s*것|do(?:es)?\s*not\s*match|not\s*match/i.test(direction);
  const asksMatch =
    !asksNonMatch && /일치하는|that\s*match|matches\b/i.test(direction);

  if (matchType === "불일치" && !asksNonMatch) {
    add(
      "error",
      "content-match-direction-polarity",
      "불일치 설정이지만 발문이 '일치하지 않는 것'을 묻지 않습니다.",
    );
  }
  if (matchType === "일치" && !asksMatch) {
    add(
      "error",
      "content-match-direction-polarity",
      "일치 설정이지만 발문이 '일치하는 것'을 묻지 않습니다.",
    );
  }

  const storedMatchType = normalizeText(question.matchType);
  if (storedMatchType && storedMatchType !== matchType) {
    add(
      "error",
      "content-match-type-mismatch",
      `matchType(${storedMatchType})가 강제 설정(${matchType})과 다릅니다.`,
    );
  }
}



/**
 * C3: CONTENT_MATCH 복수정답 휴리스틱(warning). 일치/불일치 문항은 정답 1개만 지문과
 * 모순(또는 일치)이고 나머지 선지는 참진술이어야 한다. 오답해설 맵이 정답 라벨을 키로
 * 갖고 있으면 = 정답 선지를 오답으로 설명한 것 → 복수정답(정답을 오답으로 설명) 의심.
 * contentMatchType 신호와 무관하게 항상 돌아야 하므로 polarity 게이트와 분리한다.
 * recall 불명한 휴리스틱이라 warning(차단 아님).
 */
export function validateContentMatchAnswerConsistency(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const correctLabels = new Set(collectCorrectAnswerLabels(question));
  if (correctLabels.size === 0) return;
  const explanationMap = collectWrongOptionExplanations(question.wrongOptionExplanations);
  for (const label of correctLabels) {
    if (explanationMap.has(label)) {
      add(
        "warning",
        "content-match-answer-explanation-conflict",
        "오답 해설에 정답 선지가 포함돼 복수정답(정답을 오답으로 설명)이 의심됩니다. 불일치 문항은 정답 1개만 지문과 모순, 나머지는 참진술이어야 합니다.",
      );
      break;
    }
  }
}
