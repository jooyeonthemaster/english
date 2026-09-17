// ============================================================================
// 주제/요지(TOPIC_MAIN_IDEA) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 **지문을 한 글자도 건드리지 않는다.** 마크다운이 실어야 하는 것은
// 선지 N개 + 정답 + 해설 + 오답해설, 그리고 판단 축을 못 박는 근거문장 하나뿐이다.
// 그래서 공예의 승부처가 전부 "오답 설계"로 몰린다 — 정본 빈칸 프롬프트의 오답
// 기제 분류학(방향반대·도입부함정·범위확대·근거없음)을 대의파악의 판단축으로
// 번역해 이식했다.
//
// 형식 설계 결정 (§1-B 철칙과 하나씩 대조한 결과):
//  · 철칙 1 — 발문(direction)을 **모델에게 받지 않는다.** 주제/요지 모드·정답
//    극성·정답 개수·발문 언어가 전부 교사 설정에서 결정형으로 나오므로 서버가
//    확정하고, 프롬프트는 "학생에게 이렇게 제시된다"로 보여 주기만 한다.
//    받으면 설정과 어긋난 발문이 저장되고 극성 검증기가 error 를 찍는데
//    (validators/topic.ts gist-polarity-direction-mismatch), 안 받으면 그
//    실패 모드가 아예 존재하지 않는다.
//  · 철칙 1·2 — 선지 줄에는 텍스트 한 칸뿐이다. 정답 표시(O/X·별표·"(정답)")를
//    줄에 받지 않는다. 정답의 유일 진실원은 `정답:` 줄이다 — 반의어가 정확히 그
//    중복 계약 때문에 실사용에서 2연속 반려됐다.
//  · 근거문장은 중복이 아니라 **이 유형에 없던 유일한 지문 정박점**이다. 지문을
//    변형하지 않으니 "지문 재구성 대조"라는 최강 게이트가 없고, 그러면 0원
//    게이트에 형상 검사만 남아 근거 없는 문항이 그대로 통과한다. 한 줄로 축자
//    인용을 받아 게이트가 지문 대조를 할 수 있게 했다(학생 표면에는 안 나간다).
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 알파벳 — 파서·어댑터와 공유하는 단일 진실원(최대 8지선다). */
export const TOPIC_MAIN_IDEA_MD_LABELS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

// 범위는 fast 레인의 generic 노브(question-type-generation-settings/generic.ts:7-15)와
// 동일하다 — md 가 자체 기본값을 만들면 "설정 무시" 버그가 난다(규범 §1-[2]).
export const TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MIN = 4;
export const TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MAX = 8;
export const TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT = 5;
export const TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_MIN = 1;
export const TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT = 1;

/** 주제(영어 명사구 선지) ↔ 요지(한국어 진술문 선지). 보기 언어 설정이 결정한다. */
export type MdGistMode = "TOPIC" | "MAIN_IDEA";
/** 대의파악 계열 정답 극성 — NEGATIVE 는 '적절하지 않은 것' 고르기. */
export type MdGistPolarity = "POSITIVE" | "NEGATIVE";

export interface MdTopicMainIdeaFormat {
  optionCount: number;
  answerCount: number;
  gistMode: MdGistMode;
  polarity: MdGistPolarity;
}

export function clampTopicMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT;
  return Math.min(
    TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MAX,
    Math.max(TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MIN, n),
  );
}

/** 정답 개수 상한은 optionCount-1 — 오답이 최소 1개는 남아야 문항이 성립한다. */
export function clampTopicMdAnswerCount(value: unknown, optionCount: number): number {
  const max = Math.max(
    TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_MIN,
    clampTopicMdOptionCount(optionCount) - 1,
  );
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(max, Math.max(TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_MIN, n));
}

/**
 * 학생 표면 발문 — 설정만으로 결정된다(모델에게 받지 않는 이유는 파일 상단 참조).
 *
 * 한국어 어휘는 fast 레인 산출·DB 실물과 같은 문장을 쓴다(사용자 표면 무변경).
 * 다만 NEGATIVE 는 fast 가 유형 라벨만 보고 항상 "주제"로 적는데
 * (dispatchers.ts:736-738), 여기서는 실제 선지 형식(주제/요지)과 일치시킨다 —
 * 요지 선지에 "주제로 적절하지 않은 것" 발문이 붙는 어긋남을 없애기 위함이고,
 * 극성 검증기는 부정형 여부만 보므로 계약 위반이 아니다.
 */
export function buildTopicMainIdeaMdDirection(opts: {
  gistMode: MdGistMode;
  polarity: MdGistPolarity;
  answerCount: number;
  language: "ko" | "en";
}): string {
  const multi = opts.answerCount >= 2;
  if (opts.language === "en") {
    const kind = opts.gistMode === "TOPIC" ? "topic" : "main idea";
    if (multi) {
      return opts.polarity === "NEGATIVE"
        ? `Choose all of the following that do NOT appropriately state the ${kind} of the passage.`
        : `Choose all of the following that appropriately state the ${kind} of the passage.`;
    }
    return opts.polarity === "NEGATIVE"
      ? `Which of the following is NOT an appropriate ${kind} of the passage?`
      : `Which of the following is the most appropriate ${kind} of the passage?`;
  }
  const kind = opts.gistMode === "TOPIC" ? "주제" : "요지";
  if (multi) {
    return opts.polarity === "NEGATIVE"
      ? `다음 글의 ${kind}로 적절하지 않은 것을 모두 고르시오.`
      : `다음 글의 ${kind}로 적절한 것을 모두 고르시오.`;
  }
  return opts.polarity === "NEGATIVE"
    ? `다음 글의 ${kind}로 가장 적절하지 않은 것은?`
    : `다음 글의 ${kind}로 가장 적절한 것은?`;
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 같은 지문을 놓고 요지(한국어 진술문) · 주제(영어 명사구) 두 판본을 따로 둔다:
// 선지 형식이 다르면 "무엇이 잘 만든 선지인가"의 기준 자체가 달라지기 때문이다.
const GIST_FEWSHOT_MAIN_IDEA = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: "추천 알고리즘이 취향을 넓혀 준다"는 통념을 제시한 뒤 반박하고, 추천이 결국 과거 선택의 통계적 재생산이라 취향의 지평을 좁힌다고 논증하는 글. 마지막 단락에서 "선택지가 많아 보이는 것과 실제로 선택 가능한 것은 다르다"로 수렴한다.
- 근거문장 선정: 마지막 단락의 수렴 문장. 예시(음악 스트리밍 이용 통계)가 아니라 필자의 판단이 명시된 문장을 골랐다.
- 정답 설계: "추천 알고리즘은 선택의 폭을 넓히는 듯 보이지만 실제로는 이전 선택을 재생산해 취향의 지평을 좁힌다." — 통념 제시에서 귀결까지 글의 구조 전체를 한 문장으로 접었고, 어느 한 단락에만 걸리지 않는다.
- 오답 설계(기제 각 1개, 중복 없음):
  · 도입부함정 — "추천은 몰랐던 취향을 발견하게 해 준다": 반박 이전의 통념을 그대로 요지로 삼았다. 앞부분만 읽고 멈춘 학생이 고른다.
  · 세부과장 — "이용자 대부분은 추천된 곡의 절반도 듣지 않는다": 예시로 쓰인 통계를 글 전체의 요지로 승격했다. 지문에 실재하는 문장이라 근거가 있어 보인다.
  · 범위확대 — "기업은 추천 알고리즘의 작동 방식을 공개해야 한다": 소재는 같지만 지문이 하지 않은 처방으로 밀고 나갔다.
  · 방향반대(최매력) — "추천 알고리즘은 과거의 선택을 재료로 삼아 취향의 지평을 넓힌다": 정답과 핵심어구가 거의 같고 마지막 동사 하나에서만 논지가 뒤집힌다. 훑어 읽으면 정답과 구분되지 않아 끝까지 경합한다.
- 이 설계가 아름다운 이유: 오답 넷이 각각 "지문의 어느 지점에서 멈춘 학생인가"를 정확히 하나씩 지목한다. 다섯 선지가 전부 지문 안의 재료로만 만들어져 있어서, 지문을 읽지 않고는 어느 하나도 소거할 수 없다.`;

const GIST_FEWSHOT_TOPIC = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: "추천 알고리즘이 취향을 넓혀 준다"는 통념을 반박하고, 추천이 과거 선택의 통계적 재생산이라 취향의 지평을 좁힌다고 논증하는 글.
- 근거문장 선정: 필자의 판단이 명시된 마지막 단락의 수렴 문장(예시·통계 문장이 아니다).
- 정답 설계: "the narrowing of taste caused by recommendation systems that recycle past choices" — 중심 화제(추천 시스템)에 **관점**(취향을 좁힌다)이 붙어 있다. 소재만 적은 명사구는 주제가 아니다.
- 오답 설계(기제 각 1개, 중복 없음):
  · 범위축소(소재만) — "the popularity of music streaming services": 화제는 스치지만 필자의 관점이 없다.
  · 도입부함정 — "how algorithms help listeners discover new genres": 반박 이전의 통념을 주제로 삼았다.
  · 세부과장 — "statistical methods used to rank songs in playlists": 예시 층위를 글 전체 주제로 승격했다.
  · 방향반대(최매력) — "the widening of taste driven by data-based recommendation": 핵심어가 정답과 같고 방향만 뒤집혀 끝까지 경합한다.
- 이 설계가 아름다운 이유: 다섯 명사구의 길이·추상도가 같아서 형식으로는 아무것도 못 고르고, 관점의 방향과 층위를 지문으로 확인해야만 하나가 남는다.`;

// ⚠ 부정 극성 few-shot 은 **선지 형식별로** 따로 있어야 한다. 종전에는 극성이
//    모드보다 먼저 갈려서 주제(영어 명사구) + 부정 극성 조합에 한국어 완결 문장
//    예시가 실렸다 — "이 수준을 재현하라"는 자리에서 게이트 #5(`선지가 영어 주제
//    표현이 아님`)가 전량 반려할 형식을 시연한 셈이라, 예시를 따르면 재생성 1회를
//    태우고 실패·환불로 끝난다.
const GIST_FEWSHOT_NEGATIVE_MAIN_IDEA = `## 모범 설계 해부 (부정 극성 · 한국어 요지) — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 추천 알고리즘이 과거 선택을 재생산해 취향의 지평을 좁힌다고 논증하는 글.
- 타당한 선지들(정답이 아닌 것)은 서로 다른 근거로 타당하게 만들었다: 결론의 재진술 / 인과의 귀결("과거 선택이 재료이므로 새로움이 줄어든다") / 대조의 정리("선택지의 수와 선택 가능성은 다르다") / 필자의 권고. 같은 말의 재탕이 하나도 없다.
- 정답(부적절한 선지) 설계: "추천 알고리즘은 이용자가 접하는 취향의 폭을 꾸준히 넓혀 왔다" — 필자의 판단과 **정반대 방향**이라 시비의 여지가 없다. 그러면서 길이·추상도·문체는 나머지와 똑같아 형식으로는 표나지 않는다.
- 이 설계가 아름다운 이유: 학생이 "덜 포괄적인 것"을 찾는 게임이 아니라, 지문의 논지 방향을 실제로 판정해야만 부적절한 선지가 걸린다. 부정 극성 문항이 무너지는 유일한 원인은 "정답이 조금 약할 뿐"인 설계인데, 그 여지를 아예 없앴다. 정답이 2개 이상이면 각각을 서로 다른 방식으로 어긋나게 하라.`;

const GIST_FEWSHOT_NEGATIVE_TOPIC = `## 모범 설계 해부 (부정 극성 · 영어 주제) — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 추천 알고리즘이 과거 선택을 재생산해 취향의 지평을 좁힌다고 논증하는 글.
- 타당한 선지들(정답이 아닌 것)은 전부 영어 명사구이고, 서로 다른 축에서 타당하다: "the narrowing of taste caused by systems that recycle past choices"(귀결) / "the gap between catalogue size and the range of taste actually exercised"(대조의 정리) / "the self-reinforcing bias built into preference-based recommendation"(인과) / "the illusion of choice created by data-driven curation"(필자의 평가).
- 정답(부적절한 선지) 설계: "the widening of listener taste driven by algorithmic recommendation" — 필자의 판단과 **정반대 방향**이라 시비의 여지가 없다. 그러면서 길이·추상도·문체는 나머지와 똑같아 형식으로는 표나지 않는다.
- 이 설계가 아름다운 이유: 명사구들의 길이·추상도가 같아서 형식으로는 아무것도 못 고르고, 관점의 **방향**을 지문으로 판정해야만 부적절한 것이 걸린다. "정답이 조금 약할 뿐"인 설계가 부정 극성의 유일한 붕괴 원인인데, 방향을 반대로 두어 그 여지를 없앴다. 정답이 2개 이상이면 각각을 서로 다른 방식으로 어긋나게 하라.`;

const GIST_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 정답 설계 (기본 난이도)
- 정답은 글의 결론 문장을 평이하게 재진술한 것이다 — 근거 문장 하나만 확인하면 판정되게 하라(근거 깊이 1문장).
- 근거문장은 그 결론 문장을 지문 축자로 그대로 옮긴다.
- 오답은 명백히 구분되게 하되, 각자 "왜 이걸 고르는 학생이 있는가"의 답은 있어야 한다.`,
  INTERMEDIATE: `## 정답 설계 (중급 난이도)
- 정답은 서로 다른 두 문장을 이어야 도출되게 하라(통념과 반박, 원인과 귀결, 대조의 양변 — 근거 깊이 2문장). 결론 문장 하나만 읽고 풀리면 미달이다.
- 정답은 지문의 표면 어휘를 그대로 재사용하지 않는 재진술이어야 한다. 핵심 명사·동사를 그대로 옮기면 어휘 겹침 세기로 풀린다.
- 근거문장은 그 두 문장 중 논지가 확정되는 쪽(대개 전환 이후)을 축자로 옮긴다.`,
  KILLER: `## 정답 설계 — KILLER 의 생명
- 정답은 글의 구조 전체(도입 → 전환 → 근거 → 귀결)를 한 문장으로 접은 추상 재진술이다. 어느 한 단락에만 걸리는 진술은 정답이 아니라 오답 재료다.
- 표면 어휘 재사용 0을 목표로 하라. 그리고 선지 전부가 지문의 핵심어를 비슷한 밀도로 물고 있게 하라 — 그래야 "지문과 단어가 제일 많이 겹치는 것 고르기"라는 요령이 죽는다.
- 오답은 전부 "지문을 읽었지만 어느 지점에서 멈춘 학생"의 답이어야 한다. 지문을 안 읽고도 소거되는 선지가 하나라도 있으면 킬러가 아니다.
- 근거문장은 필자의 판단이 명시된 문장을 고른다 — 예시·통계·인용 문장은 근거문장으로 쓰지 마라.`,
};

// ⚠ 극성이 뒤집히면 '정답'이 가리키는 대상 자체가 뒤집힌다. 위 블록을 그대로 실으면
//    프롬프트가 한 파일 안에서 "정답 = 글 전체를 접은 최적 요지"(정답 설계)와
//    "정답 = 명백히 부적절한 선지"(극성 반전)를 동시에 지시하게 되고, 모델이 앞
//    절을 따르면 **정답 키가 통째로 반전된 문항**이 저장된다. 발문은 서버가 부정형
//    으로 확정해 붙이므로 어떤 결정형 검사에도 걸리지 않는다(게이트는 형상만 보고,
//    극성 검증기는 발문 문구만 본다). 그래서 난이도 3분기 전부를 극성별로 가른다.
//    `{kind}` 는 주제/요지 치환 자리다.
const GIST_TARGET_BY_DIFFICULTY_NEGATIVE: Record<MdDifficulty, string> = {
  BASIC: `## 정답 설계 (기본 난이도 — 이 문항의 정답은 '{kind}로 부적절한 선지'다)
- 정답의 어긋남은 근거 문장 하나만 확인하면 판정되게 하라(근거 깊이 1문장). 글의 결론과 정면으로 어긋나게 만든다.
- 정답이 아닌 선지들은 전부 글의 결론·근거를 평이하게 재진술한 것으로, 지문을 읽은 학생에게 이견 없이 타당하게 읽혀야 한다.
- 근거문장은 정답의 어긋남이 확정되는 그 결론 문장을 지문 축자로 그대로 옮긴다.`,
  INTERMEDIATE: `## 정답 설계 (중급 난이도 — 이 문항의 정답은 '{kind}로 부적절한 선지'다)
- 정답의 어긋남은 서로 다른 두 문장을 이어야 드러나게 하라(통념과 반박, 원인과 귀결, 대조의 양변 — 근거 깊이 2문장). 결론 문장 하나만 읽고 걸러지면 미달이다.
- 정답이 아닌 선지들은 지문의 표면 어휘를 그대로 재사용하지 않는 재진술이어야 한다. 핵심 명사·동사를 그대로 옮기면 어휘 겹침 세기로 풀린다.
- 근거문장은 그 두 문장 중 논지가 확정되는 쪽(대개 전환 이후)을 축자로 옮긴다.`,
  KILLER: `## 정답 설계 — KILLER 의 생명 (이 문항의 정답은 '{kind}로 부적절한 선지'다)
- 정답이 아닌 선지들은 각각 글의 구조(도입 → 전환 → 근거 → 귀결) 중 서로 다른 축을 잡아 {kind}로 성립해야 한다. 어느 하나도 시비의 여지가 없어야 한다.
- 정답은 표면 어휘 밀도·길이·추상도가 나머지와 똑같으면서 논지의 방향만 어긋나야 한다. 형식으로 표나면 지문을 안 읽고도 풀린다.
- 정답이 "덜 포괄적이다 / 조금 약하다" 로만 어긋나면 그건 복수정답이다 — 지문으로 명백히 반증되게 하라.
- 근거문장은 필자의 판단이 명시된 문장을 고른다 — 예시·통계·인용 문장은 근거문장으로 쓰지 마라.`,
};

function gistTargetBlock(
  difficulty: MdDifficulty,
  polarity: MdGistPolarity,
  kind: string,
): string {
  return polarity === "NEGATIVE"
    ? GIST_TARGET_BY_DIFFICULTY_NEGATIVE[difficulty].split("{kind}").join(kind)
    : GIST_TARGET_BY_DIFFICULTY[difficulty];
}

function gistOptionRule(gistMode: MdGistMode): string {
  return gistMode === "TOPIC"
    ? "선지는 전부 영어 **명사구**(중심 화제 + 필자의 관점)다. 완결 문장·한국어 선지는 실격이며, 관점 없이 소재만 적은 명사구도 실격이다."
    : "선지는 전부 한국어 **완결 진술문**이다(…한다. / …이다. / …해야 한다.). 제목형 명사구('~의 중요성')나 영어 선지는 실격이다.";
}

function gistExplanationBlock(
  mode: MdExplanationMode,
  labels: readonly string[],
  answerCount: number,
  wrongCount: number,
  polarity: MdGistPolarity,
  kind: string,
): string {
  // 라벨 앵커링 회피(prompts.ts:257-265 선례): 예시 라벨을 ①로 보여 주면 모델이
  // 정답을 1번에 몰아 넣는다. 홀수/짝수 자리에서 뽑아 보여 준다.
  const sample =
    answerCount >= 2
      ? `${labels[1]}, ${labels[3] ?? labels[labels.length - 1]}`
      : `${labels[1]}`;
  const head =
    answerCount >= 2
      ? `정답: <${labels[0]}~${labels[labels.length - 1]} 중 ${answerCount}개를 ", " 로 이어 적어라 (예: ${sample})>`
      : `정답: <${labels[0]}~${labels[labels.length - 1]} 하나 (예: ${sample})>`;
  // ⚠ 해설 리터럴도 극성으로 갈라야 한다 — POSITIVE 문구를 부정 극성에 그대로
  //   실으면 "정답이 왜 글 전체를 대표하는지" 를 쓰라는 지시가 되어, 모델이 정답을
  //   최적 요지로 설계하게 몰고 정답 키가 반전된다(형식 검사로는 안 잡힌다).
  const explanationLine =
    polarity === "NEGATIVE"
      ? `해설: <딱 2문장 — 근거문장이 무엇을 말하는지, 그리고 정답 선지가 왜 그 논지에 비추어 ${kind}로 부적절한지. 합니다체`
      : `해설: <딱 2문장 — 근거문장이 무엇을 말하는지, 그리고 정답이 왜 글 전체를 대표하는지. 합니다체`;
  // 26-08-18 O225 해설 다이어트
  const wrongLine =
    polarity === "NEGATIVE"
      ? `${labels[0]} <이 선지가 왜 ${kind}로 타당한지(= 왜 정답이 아닌지) 지문 근거로 1문장> (정답 번호는 제외하고 ${wrongCount}개만)`
      : `${labels[0]} <왜 탈락인지 1문장 — 매력 이유·기제 이름 서술 금지> (정답 번호는 제외하고 ${wrongCount}개만)`;
  if (mode === "answer-only") {
    return `${head}
${explanationLine}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}
${explanationLine}>
오답:
${wrongLine}
...`;
}

/**
 * 주제/요지 md 프롬프트.
 * 출력 계약(parser-topic-main-idea.ts 와 1:1): `근거문장:` 한 줄 + 원문자 선지 N줄 +
 * `정답:` + `해설:` + `오답:`. 발문·선지 라벨은 서버가 확정하므로 모델은 쓰지 않는다.
 */
export function buildMdTopicMainIdeaPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: Partial<MdTopicMainIdeaFormat> & { stemLanguage?: "ko" | "en" },
): string {
  const optionCount = clampTopicMdOptionCount(
    opts?.optionCount ?? TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampTopicMdAnswerCount(
    opts?.answerCount ?? TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const gistMode: MdGistMode = opts?.gistMode ?? "MAIN_IDEA";
  const polarity: MdGistPolarity = opts?.polarity ?? "POSITIVE";
  const labels = TOPIC_MAIN_IDEA_MD_LABELS.slice(0, optionCount);
  const wrongCount = optionCount - answerCount;
  const kind = gistMode === "TOPIC" ? "주제" : "요지";
  const direction = buildTopicMainIdeaMdDirection({
    gistMode,
    polarity,
    answerCount,
    language: opts?.stemLanguage ?? "ko",
  });

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 '${kind} 파악' KILLER 문항 1개(선지 ${optionCount}개)를 설계하라. 선지 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 '${kind} 파악' 문항 1개(선지 ${optionCount}개, 난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshot =
    difficulty === "BASIC"
      ? ""
      : `${
          polarity === "NEGATIVE"
            ? gistMode === "TOPIC"
              ? GIST_FEWSHOT_NEGATIVE_TOPIC
              : GIST_FEWSHOT_NEGATIVE_MAIN_IDEA
            : gistMode === "TOPIC"
              ? GIST_FEWSHOT_TOPIC
              : GIST_FEWSHOT_MAIN_IDEA
        }\n\n`;

  const distractorBlock =
    polarity === "NEGATIVE"
      ? `## 정답 극성 반전 — '적절하지 않은 것' 고르기 (이 절이 오답 기제 규칙을 대체한다 — 위의 '정답 설계'도 이 극성으로 쓰여 있다)
- 이 문항은 구조가 뒤집혀 있다: ${wrongCount}개는 전부 ${kind}로 **타당해야** 하고, 정답 ${answerCount}개만 **명백히 부적절**하다.
- 타당한 ${wrongCount}개는 서로 다른 근거로 타당해야 한다(결론의 재진술 / 인과의 귀결 / 대조의 정리 / 필자의 권고). 같은 말의 재탕은 금지다 — 학생이 "이게 저것과 같은 말인데?" 하는 순간 복수정답 시비가 난다.
- 정답(부적절한 선지)은 다음 중 하나로 **명백히** 어긋나게 만들어라: (i) 필자의 판단과 정반대 방향, (ii) 지문 범위를 벗어난 처방·일반화, (iii) 지문에 근거가 전혀 없는 주장. "덜 포괄적이다 / 조금 약하다" 정도의 차이는 복수정답이므로 금지다.
- 그러면서도 정답은 길이·추상도·문체를 나머지와 똑같이 맞춰라 — 형식으로 표나면 지문을 안 읽고도 풀린다.
- 오답 해설 ${wrongCount}개에는 그 선지가 **왜 타당한지**(= 왜 정답이 아닌지)를 지문 근거로 적는다.`
      : `## 오답 ${wrongCount}개 — 기제를 하나씩 배분하라 (같은 기제 2개 금지)
1. 방향반대(최매력 오답): 정답과 같은 핵심어구를 앞부분에 그대로 실어 놓고, 논지의 방향(인과의 향방·필자의 태도·평가의 부호)만 뒤집는다. 훑어 읽으면 정답과 구분되지 않아 끝까지 경합해야 한다.
2. 도입부함정: 논지 전환(however·but·그러나 계열) 이전의 통념·배경 서술을 ${kind}로 삼은 선지. 앞부분만 읽고 멈춘 학생이 고른다.
3. 범위확대·처방수입: 지문의 소재를 쓰되 지문이 말하지 않은 일반화·해결책·당위로 밀고 나간 선지.
4. 세부과장(예시승격): 예시·통계·부분 사례를 글 전체의 ${kind}로 승격한 선지. 지문에 실재하는 문장이 근거처럼 붙어 있어 그럴듯하다.
5. 범위축소(소재만): 중심 화제는 맞지만 필자의 관점·판단이 빠져 소재 이름만 남은 선지.
6. 근거없음(통념형): 그 소재에 대해 세상이 흔히 하는 말이라 그럴듯하지만 지문에 논리 근거가 0인 서술.
- 오답이 ${wrongCount}개다. 위 여섯 중에서 서로 다른 기제를 골라 하나씩 배분하고, 여섯을 다 쓰고도 남으면 방향반대·범위확대를 강도만 달리해 하나 더 쓰되 탈락 근거가 서로 다르게 하라.
- 소재 구속: 오답의 재료는 전부 지문에 실재하는 소재·어휘·논리다. 지문에 없는 분야 개념을 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.`;

  // ⚠ 이 블록도 극성으로 갈라야 한다. POSITIVE 문구("정답 K개는 각각 지문 전체의
  //   요지로 성립해야 한다")를 부정 극성에 그대로 실으면, 바로 앞의 극성 반전 절이
  //   "정답 K개만 명백히 부적절하다"고 말한 직후에 정반대 지시가 붙는다 — 둘 다
  //   '필수' 라벨이라 모델은 뒤쪽(더 구체적으로 읽히는 절)을 따르기 쉽고, 그러면
  //   정답 키가 반전된다. 개수만 세는 0원 게이트로는 볼 수 없는 오염이다.
  const multiAnswerBlock =
    answerCount >= 2
      ? polarity === "NEGATIVE"
        ? `\n\n## 정답 ${answerCount}개 (교사 설정, 필수)
- 이 문항의 정답은 **부적절한 선지**다. 정답 ${answerCount}개는 각각 **서로 다른 방식으로 명백히 부적절**해야 한다(방향 반대 / 범위 이탈 / 근거 없음 중 서로 다른 것). 같은 어긋남을 두 번 쓰지 마라.
- 나머지 ${wrongCount}개는 전부 ${kind}로 타당해야 하고, 정답과 오답의 길이·문체 차이가 정답 개수를 흘리지 않게 하라.`
        : `\n\n## 정답 ${answerCount}개 (교사 설정, 필수)
- 정답 ${answerCount}개는 각각 독립적으로 지문 전체의 ${kind}로 성립해야 한다. 서로 다른 근거·다른 표현으로 쓰되 같은 말의 재탕이면 안 된다.
- 나머지 ${wrongCount}개는 위 기제로 만들고, 정답과 오답의 길이·문체 차이가 정답 개수를 흘리지 않게 하라.`
      : "";

  // ⚠ 자기검산도 극성으로 갈라야 한다. POSITIVE 판은 "정답을 더 접어라"(= 정답을
  //   더 포괄적인 요지로 만들라)라고 지시하는데, 부정 극성에서 그건 정답을 최적
  //   요지로 몰아가는 지시가 되어 정답 키를 뒤집는다.
  const selfCheckLines =
    polarity === "NEGATIVE"
      ? `- 정답이 아닌 선지 하나하나가 왜 ${kind}로 **타당한지** 지문 근거로 한 줄씩 답해보라 — 근거를 못 대는 선지는 두 번째 정답이 되므로 재설계.
- 정답이 지문으로 **명백히 반증되는지** 검사하라 — "덜 포괄적이다 / 조금 약하다" 수준의 차이면 복수정답이므로 재설계.
- 타당한 선지들이 서로 같은 말의 재탕이 아닌지 확인.`
      : `- 각 오답이 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 근거를 못 대는 오답은 재설계.
- 정답을 지문의 한 단락만 읽고도 고를 수 있는지 검사하라 — 고를 수 있으면 정답을 더 접어라(기본 난이도 제외).
- 기제가 겹치는 오답이 없는지 확인.`;

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

## 학생에게 제시될 발문 (서버가 확정한다 — 이 줄을 출력하지 마라)
"${direction}"
- 선지는 이 발문의 요구에 그대로 답하는 것이어야 한다. 발문을 다시 쓰거나 바꾸지 마라.
- 지문은 학생에게 원문 그대로 제시된다. 지문을 고쳐 쓰거나 다시 출력하지 마라.

${fewshot}${gistTargetBlock(difficulty, polarity, kind)}

## 선지 ${optionCount}개 — 공통 규격
- ${gistOptionRule(gistMode)}
- 선지 ${optionCount}개는 길이·추상도·문체가 서로 비슷해야 한다. 정답만 유독 길거나 유독 종합적으로 보이면 지문 없이 형식만으로 풀린다.
- 지문 문장을 그대로 옮겨 적은 선지 금지 — 선지는 전부 재진술이다.
- 같은 뜻을 말만 바꿔 쓴 선지 두 개를 만들지 마라(복수정답 시비의 최다 원인).
- 선지 안에 번호·별표·"(정답)" 같은 표시나 출처 표기를 넣지 마라.

${distractorBlock}${multiAnswerBlock}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 오답 중 최소 2개는 상위권 학생도 정답과 끝까지 저울질해야 한다. 극성만 확인하면 소거되는 선지를 셋 이상 만들지 마라.
- 절대 표현(모든·결코·완전히·반드시 류)을 오답에만 몰지 마라 — 그 자체가 정답 식별 단서가 된다.
- 선지 길이는 서로 비슷하게 맞춰라(가장 긴 선지가 가장 짧은 선지의 1.5배를 넘지 않게).
- 정답이 유일한지 확인하라. 두 선지가 같은 뜻으로 읽히면 그 문항은 무효다.

## 출력 전 자기검산 (사고 안에서 수행)
${selfCheckLines}
- 근거문장이 지문에 한 글자도 다르지 않게 존재하는지 확인 — 문장 첫 글자부터 종결 구두점까지 통째로 옮겨라. 따옴표·번호·설명을 덧붙이지 말고, 문장 중간을 잘라낸 조각이나 연속하지 않은 두 문장의 결합을 쓰지 마라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설과 오답 해설에서 선지를 "3번"·"선지 5"·"(3)" 처럼 **번호로 지칭하지 마라** — 저장 단계에서 선지 순서가 재배열되므로 번호 지칭은 그 순간 오해설이 된다. 선지의 내용으로 지칭하라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
- 아래의 모든 항목은 **한 항목 = 한 줄**이다. 선지·해설·오답 해설이 길어져도 **개행 없이 한 줄**로 써라 — 줄을 바꾸면 그 뒷부분이 다른 항목으로 읽혀 선지가 잘린 채 출제된다.
- 머리표는 "근거문장:" "정답:" "해설:" "오답:" 네 개를 그대로 쓰고, 이름을 바꾸거나 콜론을 빼지 마라.
근거문장: <정답 판단의 축이 되는 지문 문장 하나 — 문장 첫 글자부터 종결 구두점까지 한 글자도 바꾸지 말고 그대로. 문장 중간을 잘라낸 조각 금지. 따옴표·번호·설명 금지>
${labels.map((l) => `${l} <선지>`).join("\n")}
${gistExplanationBlock(mode, labels, answerCount, wrongCount, polarity, kind)}

## 지문
${passage}`;
}
